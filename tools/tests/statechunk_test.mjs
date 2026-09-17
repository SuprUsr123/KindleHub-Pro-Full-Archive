/* Large-account state must survive the round trip, because this IS the account.

   A state over CHUNK_LIMIT is stored as a marker in kh_users.state plus rows in
   kh_state_parts. If kh_state_parts is missing (which it was on any database
   created before that table joined SCHEMA_DDL — the version-stamp fast path
   skipped the DDL), the parts cannot be written and the marker is all that
   survives. A device that already holds a local copy hides this; a NEW device
   has nothing to fall back on, which is what "my laptop can never recover my
   account data" looks like from the outside.

   Run: NODE_PATH=/opt/node22/lib/node_modules node --experimental-sqlite tools/tests/statechunk_test.mjs */
import { DatabaseSync } from 'node:sqlite';
import { webcrypto } from 'node:crypto';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
import worker, { ensureSchema } from '../../api-worker.js';

let pass=0,fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x!==undefined&&!c?('  -- '+String(x).slice(0,180)):''));};
/* NB batch() MUST return a result array — real D1 does, and the chunked write
   indexes into it to find the main-row result. A shim that returns undefined
   fails here for its own reasons and looks like a product bug. */
function d1(db){return{prepare(sql){let p=[];const api={bind(...a){p=a.map(x=>x===undefined?null:x);return api;},async run(){const r=db.prepare(sql).run(...p);return{meta:{changes:r.changes,last_row_id:r.lastInsertRowid}};},async all(){return{results:db.prepare(sql).all(...p)};},async first(){return db.prepare(sql).get(...p)||null;}};return api;},async batch(s){const r=[];for(const x of s)r.push(await x.run());return r;}};}

const HASH='c'.repeat(64);
const db=new DatabaseSync(':memory:');
const DB=d1(db);
const env={DB};
await ensureSchema(DB, env);

ok('ensureSchema creates kh_state_parts', db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='kh_state_parts'").all().length>0);

/* a paid account, so the storage cap is not what is under test */
db.prepare("INSERT INTO kh_entitlements (hash,tier,status,interval,current_period_end,updated_at) VALUES (?,'max','active','year',9999999999,?)")
  .run(HASH, new Date().toISOString());

async function saveAndRead(state){
  const put=await worker.fetch(new Request('https://x/rest/v1/kh_users?on_conflict=hash',{
    method:'POST',
    headers:{'Content-Type':'application/json','Prefer':'resolution=merge-duplicates','X-KH-Secret':HASH},
    body:JSON.stringify({hash:HASH,email:'big@test',state:state,updated_at:new Date().toISOString()})
  }), env, {waitUntil(){}});
  const get=await worker.fetch(new Request('https://x/rest/v1/kh_users?select=state&hash=eq.'+HASH,{
    headers:{'X-KH-Secret':HASH}
  }), env, {waitUntil(){}});
  const rows=await get.json().catch(()=>[]);
  return {status:put.status, back:(rows&&rows[0]&&rows[0].state)||''};
}

/* ── under the chunk limit: stored inline ── */
const small='S'.repeat(900000);
let r=await saveAndRead(small);
ok('a sub-chunk state saves (201)', r.status===201, r.status);
ok('...and reads back byte-identical', r.back===small, r.back.length+' of '+small.length);

/* ── over the chunk limit: marker + parts ── */
const big='B'.repeat(4200000);
r=await saveAndRead(big);
ok('a CHUNKED state saves (201, not a 500)', r.status===201, r.status);
const marker=(db.prepare("SELECT state FROM kh_users WHERE hash=?").get(HASH)||{}).state||'';
ok('...kh_users.state holds the KHCH1 marker', marker.slice(0,6)==='KHCH1:', marker.slice(0,40));
const nParts=(db.prepare("SELECT COUNT(*) AS n FROM kh_state_parts WHERE hash=?").get(HASH)||{}).n;
ok('...the parts really were written', nParts>1, 'parts='+nParts);
ok('...and a fresh device reads the WHOLE state back (this is the laptop case)',
   r.back===big, r.back.length+' of '+big.length);

/* ── shrinking back below the limit must clear the old parts, so a stale
      marker can never be reassembled from leftovers ── */
r=await saveAndRead(small);
const nAfter=(db.prepare("SELECT COUNT(*) AS n FROM kh_state_parts WHERE hash=?").get(HASH)||{}).n;
ok('shrinking below the limit clears the old chunks', nAfter===0, 'parts='+nAfter);
ok('...and the smaller state still reads back intact', r.back===small, r.back.length);

/* ── an INCOMPLETE part set must NOT be served as if it were the state ── */
await saveAndRead(big);
db.prepare("DELETE FROM kh_state_parts WHERE hash=? AND idx=1").run(HASH);
const get2=await worker.fetch(new Request('https://x/rest/v1/kh_users?select=state&hash=eq.'+HASH,{headers:{'X-KH-Secret':HASH}}), env, {waitUntil(){}});
const rows2=await get2.json().catch(()=>[]);
const torn=(rows2&&rows2[0]&&rows2[0].state)||'';
ok('a torn/incomplete chunk set is NOT silently served as truncated data',
   torn.slice(0,6)==='KHCH1:', torn.slice(0,40));

console.log('\n'+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
