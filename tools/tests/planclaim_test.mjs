/* "Could they change values and make it look like paying?"

   Yes, they could — for the BADGE. Not for anything that costs money.

   The plan badge is derived on the device from S.entitlement, and S lives in
   localStorage, which anybody with a browser can edit. So one hand-edited field
   used to publish a Max badge to every other user: a claim to have paid, made
   by somebody who had not.

   Nothing that costs money was ever exposed this way — AI allowances, storage,
   publish caps and cloud quota all check kh_entitlements server-side, and this
   test proves that separately. What was exposed was the appearance of paying,
   which for a badge is the whole product.

   The fix is the same one location_hint already uses: the server stamps it,
   rather than believing what it was handed.

   Run: NODE_PATH=/opt/node22/lib/node_modules node --experimental-sqlite tools/tests/planclaim_test.mjs */
import { DatabaseSync } from 'node:sqlite';
import { webcrypto } from 'node:crypto';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
import worker, { ensureSchema, stripeWriteEnt } from '../../api-worker.js';

let pass=0,fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x!==undefined&&!c?'  -- '+String(x).slice(0,220):''));};
function d1(db){return{prepare(sql){let p=[];const api={bind(...a){p=a.map(x=>x===undefined?null:x);return api;},async run(){const r=db.prepare(sql).run(...p);return{meta:{changes:r.changes,last_row_id:r.lastInsertRowid}};},async all(){return{results:db.prepare(sql).all(...p)};},async first(){return db.prepare(sql).get(...p)||null;}};return api;},async batch(s){for(const x of s)await x.run();}};}

const LIAR='c'.repeat(64);   // a free account that edited its own localStorage
const PAYER='d'.repeat(64);  // a genuine Max subscriber

(async()=>{
  const db=new DatabaseSync(':memory:');
  const env={DB:d1(db),ALLOW_ORIGIN:'*'};
  await ensureSchema(env.DB);
  const now=Math.floor(Date.now()/1000);
  db.prepare("INSERT OR REPLACE INTO kh_users (hash,email,state,updated_at) VALUES (?,?,?,?)").run(LIAR,'chancer','',new Date().toISOString());
  db.prepare("INSERT OR REPLACE INTO kh_users (hash,email,state,updated_at) VALUES (?,?,?,?)").run(PAYER,'realmax','',new Date().toISOString());
  await stripeWriteEnt(env.DB,PAYER,'max','active','month',now+30*86400,'cus_x','sub_x',0);

  /* on_conflict, because that is what the real client sends — presence is
     rewritten every ~100s, so a plain insert collides on the second heartbeat
     and the server never re-stamps anything. */
  const post=(hash,profile)=>worker.fetch(new Request('https://x/rest/v1/kh_presence?on_conflict=user_id',{method:'POST',
    headers:{'Content-Type':'application/json','X-KH-Secret':hash},
    body:JSON.stringify({user_id:hash.slice(0,16),display_name:'someone',
      last_seen:new Date().toISOString(),profile:profile})}),env,{waitUntil(){}})
    .then(async r=>({status:r.status,body:await r.text()}));
  const stored=h=>{const r=db.prepare('SELECT profile FROM kh_presence WHERE user_id=?').get(h.slice(0,16));return r?r.profile:null;};

  console.log('── somebody who edited their own localStorage ──');
  let r=await post(LIAR,JSON.stringify({b:'hello',pl:'max'}));
  ok('the write is accepted — it is their own row, after all', r.status>=200&&r.status<300, r.status+' '+r.body);
  let p=JSON.parse(stored(LIAR)||'{}');
  ok('...but the forged Max badge is GONE', p.pl===undefined, stored(LIAR));
  ok('...and the rest of their profile survived', p.b==='hello', stored(LIAR));

  console.log('\n── somebody who actually pays ──');
  r=await post(PAYER,JSON.stringify({b:'hi'}));
  ok('the write is accepted', r.status>=200&&r.status<300, r.status+' '+r.body);
  p=JSON.parse(stored(PAYER)||'{}');
  ok('...and the server ADDS the badge they did not claim', p.pl==='max', stored(PAYER));

  console.log('\n── claiming a tier ABOVE what you pay for ──');
  await stripeWriteEnt(env.DB,LIAR,'plus','active','month',now+30*86400,'cus_y','sub_y',0);
  r=await post(LIAR,JSON.stringify({pl:'max'}));
  p=JSON.parse(stored(LIAR)||'{}');
  ok('a + subscriber claiming Max is corrected down to +', p.pl==='plus', stored(LIAR));

  console.log('\n── a subscription past its renewal date ──');
  /* There is a deliberate seven-day grace window: a period end in the past is
     almost always a webhook that has not arrived yet, not somebody who stopped
     paying. Badging through it is the right call — and it has to be pinned, or
     the next person to read this code "fixes" it into a bug that strips paying
     subscribers' badges every renewal day. */
  await stripeWriteEnt(env.DB,PAYER,'max','active','month',now-86400,'cus_x','sub_x',0);
  r=await post(PAYER,JSON.stringify({b:'hi'}));
  p=JSON.parse(stored(PAYER)||'{}');
  ok('one day late still badges — that is a missing webhook, not a cancellation',
     p.pl==='max', stored(PAYER));

  console.log('\n── a genuinely lapsed subscription ──');
  await stripeWriteEnt(env.DB,PAYER,'max','active','month',now-30*86400,'cus_x','sub_x',0);
  r=await post(PAYER,JSON.stringify({b:'hi',pl:'max'}));
  p=JSON.parse(stored(PAYER)||'{}');
  ok('past the grace window the badge stops, and nothing had to go and rewrite the stored choice',
     p.pl===undefined, stored(PAYER));

  console.log('\n── a crafted, unparseable profile ──');
  r=await post(LIAR,'not json at all');
  ok('refused rather than stored with an unknown pl inside it', r.status===400, r.status+' '+r.body);

  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
