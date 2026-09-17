/* "I granted myself a plan and it didn't work."

   It was not the grant. kh_grant_plan is correct — the token the app sends is
   not the one the server accepts, and nothing said so.

   The app unlocks every admin screen when the SIGNED-IN NAME matches the admin
   identity, and in that case sets _adminToken to the name itself. The Worker's
   isAdmin() compares sha256(token) against sha256(ADMIN_SECRET) and FAILS
   CLOSED. So on a device with no secret saved, or against a Worker with none
   set, the whole admin UI renders and every server action is refused — gifts,
   the plan list, bans, warnings, announcements, moderator grants.

   What this pins is the SERVER half of that story, so the diagnosis cannot
   quietly stop being true:
     - the username is refused, and the secret is accepted
     - a refusal is 403 (a credential problem) and never 404 (a deploy problem),
       because the client words those two very differently
     - with no ADMIN_SECRET set, nothing is admin — including the username
     - a genuinely missing account is 404 with its own message, so "no such
       account" stays distinguishable from "you are not admin"
     - the grant, once authorised, really writes a live entitlement

   ensureSchema caches per isolate, so each case gets its own process.
   Run: NODE_PATH=/opt/node22/lib/node_modules node --experimental-sqlite tools/tests/adminmismatch_test.mjs */
import { DatabaseSync } from 'node:sqlite';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
if(!globalThis.crypto)globalThis.crypto=webcrypto;

const __dir = dirname(fileURLToPath(import.meta.url));
const WORKER = resolve(__dir,'../../api-worker.js');

const SECRET='qwertyasdfghzxcv';
const USERNAME='arancool3000';
const HASH='b'.repeat(64);

/* ── child mode: run ONE case and print its result as JSON ── */
if(process.argv[2]==='--case'){
  const kase=process.argv[3];
  const worker=(await import(WORKER)).default;
  const {ensureSchema}=await import(WORKER);
  const d1=db=>({prepare(sql){let p=[];const api={bind(...a){p=a.map(x=>x===undefined?null:x);return api;},async run(){const r=db.prepare(sql).run(...p);return{meta:{changes:r.changes,last_row_id:r.lastInsertRowid}};},async all(){return{results:db.prepare(sql).all(...p)};},async first(){return db.prepare(sql).get(...p)||null;}};return api;},async batch(s){for(const x of s)await x.run();}});
  const db=new DatabaseSync(':memory:');
  const env={DB:d1(db),ALLOW_ORIGIN:'*'};
  if(kase!=='nosecret')env.ADMIN_SECRET=SECRET;
  await ensureSchema(env.DB);
  if(kase!=='noaccount')
    db.prepare("INSERT OR REPLACE INTO kh_users (hash,email,state,updated_at) VALUES (?,?,?,?)")
      .run(HASH,USERNAME,'',new Date().toISOString());
  const call=async(fn,token,extra)=>{
    const r=await worker.fetch(new Request('https://x/rest/v1/rpc/'+fn,{method:'POST',
      headers:{'Content-Type':'application/json','Prefer':'return=minimal'},
      body:JSON.stringify(Object.assign({p_token:token},extra||{}))}),env,{waitUntil(){}});
    return {status:r.status, body:await r.text()};
  };
  const out={};
  out.grantAsUsername = await call('kh_grant_plan',USERNAME,{p_name:USERNAME,p_tier:'max',p_days:365});
  out.grantAsSecret   = await call('kh_grant_plan',SECRET,  {p_name:USERNAME,p_tier:'max',p_days:365});
  out.countsAsUsername= await call('kh_plan_counts',USERNAME);
  out.countsAsSecret  = await call('kh_plan_counts',SECRET);
  out.listAsUsername  = await call('kh_plan_list',USERNAME);
  try{ out.ent = db.prepare("SELECT tier,status,stripe_sub_id FROM kh_entitlements WHERE hash=?").get(HASH)||null; }catch(_){ out.ent=null; }
  process.stdout.write('@@'+JSON.stringify(out)+'@@');
  process.exit(0);
}

/* ── parent ── */
let pass=0,fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x!==undefined&&!c?'  -- '+String(x).slice(0,220):''));};
function runCase(kase){
  const r=spawnSync(process.execPath,['--experimental-sqlite',fileURLToPath(import.meta.url),'--case',kase],
    {encoding:'utf8',env:Object.assign({},process.env)});
  const m=/@@([\s\S]*)@@/.exec(r.stdout||'');
  if(!m){console.log('FAIL could not run case '+kase+'  -- '+String(r.stderr||'').slice(0,300));fail++;return null;}
  return JSON.parse(m[1]);
}

console.log('\n── the configuration everyone actually runs: ADMIN_SECRET is set ──');
const A=runCase('normal');
if(A){
  ok('the login NAME is refused as an admin token',        A.grantAsUsername.status===403, JSON.stringify(A.grantAsUsername));
  ok('...and it is a 403, not a 404 — a credential problem, not a missing deploy',
     A.grantAsUsername.status===403 && !/unknown function/i.test(A.grantAsUsername.body));
  ok('the real ADMIN_SECRET is accepted',                  A.grantAsSecret.status===200, JSON.stringify(A.grantAsSecret));
  ok('...and the grant genuinely writes a live entitlement',
     !!A.ent && A.ent.tier==='max' && A.ent.status==='active', JSON.stringify(A.ent));
  ok('...marked as a gift, so it is not mistaken for a sale',
     !!A.ent && String(A.ent.stripe_sub_id||'').indexOf('gift_')===0, JSON.stringify(A.ent));
  /* Every admin surface fails the same way, which is why this reads as "the
     whole admin panel is broken" rather than "one button is broken". */
  ok('the plan COUNTS card is refused for the same reason', A.countsAsUsername.status===403);
  ok('the plan LIST ("Who?") is refused for the same reason',A.listAsUsername.status===403);
  ok('...and both work with the secret',                    A.countsAsSecret.status===200, JSON.stringify(A.countsAsSecret));
}

console.log('\n── a Worker with no ADMIN_SECRET set: nobody is admin ──');
const B=runCase('nosecret');
if(B){
  ok('the username is refused',            B.grantAsUsername.status===403);
  ok('and so is any secret — fails closed',B.grantAsSecret.status===403, JSON.stringify(B.grantAsSecret));
}

console.log('\n── authorised, but the named account does not exist ──');
const C=runCase('noaccount');
if(C){
  ok('that is a 404 with its own message, not an auth failure',
     C.grantAsSecret.status===404 && /No account called/i.test(C.grantAsSecret.body), JSON.stringify(C.grantAsSecret));
}

console.log('\n'+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
