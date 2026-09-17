/* Three findings from the follow-up audit, each reproduced before the fix.

   The connecting theme is "a value the caller chooses, used as if we chose it":

     - `limit` and `offset` went straight into "LIMIT n OFFSET m", so one
       anonymous GET could ask D1 to serialise a whole table. The `Range` header
       took a second path to the same place and skipped the limit handling
       entirely — worth remembering that a bound is only a bound if EVERY route
       to the query goes through it.
     - kh_scores accepted an anonymous insert. The score was already clamped, so
       nobody could store 10^12; but writing 999,999,999 under any display name
       is the same thing from a player's point of view. Clamping a value is not
       the same as knowing who wrote it.

   Run: NODE_PATH=/opt/node22/lib/node_modules node --experimental-sqlite tools/tests/readamp_test.mjs */
import { DatabaseSync } from 'node:sqlite';
import { webcrypto } from 'node:crypto';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
import worker, { ensureSchema } from '../../api-worker.js';

let pass=0,fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x!==undefined&&!c?'  -- '+String(x).slice(0,220):''));};
function d1(db){return{prepare(sql){let p=[];const api={bind(...a){p=a.map(x=>x===undefined?null:x);return api;},async run(){const r=db.prepare(sql).run(...p);return{meta:{changes:r.changes,last_row_id:r.lastInsertRowid}};},async all(){return{results:db.prepare(sql).all(...p)};},async first(){return db.prepare(sql).get(...p)||null;}};return api;},async batch(s){for(const x of s)await x.run();}};}

const REAL='1'.repeat(64);

(async()=>{
  const db=new DatabaseSync(':memory:');
  const env={DB:d1(db),ALLOW_ORIGIN:'*'};
  await ensureSchema(env.DB);
  db.prepare("INSERT OR REPLACE INTO kh_users (hash,email,state,updated_at) VALUES (?,?,?,?)").run(REAL,'realuser','',new Date().toISOString());
  /* Enough rows that an unbounded read is visibly different from a bounded one. */
  for(let i=0;i<2500;i++){
    db.prepare("INSERT INTO kh_scores (id,game,score,display_name,user_id,date) VALUES (?,?,?,?,?,?)")
      .run('s'+i,'snake',i,'player'+i,'u'+i,new Date().toISOString());
  }

  const get=(qs,hdr)=>worker.fetch(new Request('https://x/rest/v1/'+qs,{headers:Object.assign({'CF-Connecting-IP':'203.0.113.7'},hdr||{})}),env,{waitUntil(){}})
    .then(async r=>({status:r.status,rows:await r.json().catch(()=>null)}));
  const post=(table,row,hdr)=>worker.fetch(new Request('https://x/rest/v1/'+table,{method:'POST',
    headers:Object.assign({'Content-Type':'application/json','CF-Connecting-IP':'203.0.113.7'},hdr||{}),body:JSON.stringify(row)}),env,{waitUntil(){}})
    .then(async r=>({status:r.status,body:await r.text()}));

  console.log('── read amplification: limit / offset ──');
  let r=await get('kh_scores?select=id&limit=5000000');
  ok('an enormous limit is capped, not honoured', Array.isArray(r.rows)&&r.rows.length<=1000, 'got '+(r.rows&&r.rows.length));
  r=await get('kh_scores?select=id&limit=25');
  ok('...a normal page is untouched', Array.isArray(r.rows)&&r.rows.length===25, 'got '+(r.rows&&r.rows.length));
  r=await get('kh_scores?select=id&limit=-5');
  ok('a negative limit does not produce invalid SQL', r.status===200, r.status);
  r=await get('kh_scores?select=id&offset=-1&limit=5');
  ok('a negative offset does not either', r.status===200, r.status);

  console.log('\n── the second route to the same query ──');
  /* The Range header bypassed the limit clamp entirely. */
  r=await get('kh_scores?select=id',{'Range':'0-4999999'});
  ok('a huge Range is capped the same way', Array.isArray(r.rows)&&r.rows.length<=1000, 'got '+(r.rows&&r.rows.length));
  r=await get('kh_scores?select=id',{'Range':'0-19'});
  ok('...and a real 20-row Range still returns 20', Array.isArray(r.rows)&&r.rows.length===20, 'got '+(r.rows&&r.rows.length));

  console.log('\n── forgeable leaderboard ──');
  const before=db.prepare("SELECT COUNT(*) c FROM kh_scores").get().c;
  let res=await post('kh_scores',{id:'forged-1',game:'snake',score:999999999,display_name:'NotMe',user_id:'someone-else',date:new Date().toISOString()});
  ok('an anonymous score is refused', res.status===401, res.status+' '+res.body);
  ok('...and nothing was written', db.prepare("SELECT COUNT(*) c FROM kh_scores").get().c===before);

  res=await post('kh_scores',{id:'real-1',game:'snake',score:4242,display_name:'realuser',user_id:'CLAIMED-NOT-MINE',date:new Date().toISOString()},{'X-KH-Secret':REAL});
  ok('a signed-in player CAN post', res.status>=200&&res.status<300, res.status+' '+res.body);
  const row=db.prepare("SELECT user_id,score FROM kh_scores WHERE id='real-1'").get();
  ok('...their identity is stamped from the proven secret, not the body',
     row && row.user_id===REAL.slice(0,16), JSON.stringify(row));
  ok('...and the score they sent is kept', row && row.score===4242, JSON.stringify(row));

  /* The clamp must still hold for a signed-in player. */
  await post('kh_scores',{id:'real-2',game:'snake',score:1e15,display_name:'realuser',date:new Date().toISOString()},{'X-KH-Secret':REAL});
  const big=db.prepare("SELECT score FROM kh_scores WHERE id='real-2'").get();
  ok('a signed-in player still cannot store an absurd score', big && big.score<=999999999, JSON.stringify(big));

  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
