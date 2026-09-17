/* Does paying actually GET you the thing, and keep it?

   stripe_test already covers the plumbing — signatures, idempotency, checkout,
   the portal, price mapping. What it does not cover is the part a customer
   experiences: money leaves their account, and does the app then give them the
   allowance they paid for, and keep giving it when something goes slightly
   wrong upstream?

   That gap is where the real failures were. accountTier() decided what a payer
   gets, and it downgraded to free on a stale current_period_end, on past_due,
   and on any tier string that was not exactly lowercase. Each is a paying
   customer being served the free product.

   Run: NODE_PATH=/opt/node22/lib/node_modules node --experimental-sqlite tools/tests/paidvalue_test.mjs */
import { DatabaseSync } from 'node:sqlite';
import { webcrypto } from 'node:crypto';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
import worker, { ensureSchema, stripeWriteEnt, accountTier, entEval, tierCap, tierStateBytes,
                 TIER_DAILY, TIER_STATE_BYTES } from '../../api-worker.js';

let pass=0,fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x!==undefined&&!c?'  -- '+String(x).slice(0,200):''));};
function d1(db){return{prepare(sql){let p=[];const api={bind(...a){p=a.map(x=>x===undefined?null:x);return api;},async run(){const r=db.prepare(sql).run(...p);return{meta:{changes:r.changes,last_row_id:r.lastInsertRowid}};},async all(){return{results:db.prepare(sql).all(...p)};},async first(){return db.prepare(sql).get(...p)||null;}};return api;},async batch(s){for(const x of s)await x.run();}};}

const NOW=Math.floor(Date.now()/1000), DAY=86400, YEAR=365*DAY;
const hashOf=(n)=>String(n).padStart(2,'0').repeat(32).slice(0,64);

(async()=>{
  const db=new DatabaseSync(':memory:');
  const env={DB:d1(db),ALLOW_ORIGIN:'*'};
  await ensureSchema(env.DB);

  console.log('\n── a customer pays: do they get what the card promised? ──');
  let i=0;
  for(const tier of ['plus','pro','max']){
    const h=hashOf(i++);
    db.prepare("INSERT OR REPLACE INTO kh_users (hash,email,state,updated_at) VALUES (?,?,?,?)").run(h,'payer'+i,'',new Date().toISOString());
    await stripeWriteEnt(env.DB,h,tier,'active','month',NOW+30*DAY,'cus_'+i,'sub_'+i,0);
    const got=await accountTier(h,env.DB);
    ok('a paid '+tier+' account resolves as '+tier, got===tier, got);
    ok('  ...and gets the '+tier+' AI allowance ('+TIER_DAILY[tier]+'/day)',
       tierCap(got,env)===TIER_DAILY[tier], tierCap(got,env));
    ok('  ...and the '+tier+' storage cap',
       tierStateBytes(got)===TIER_STATE_BYTES[tier], tierStateBytes(got));
  }

  console.log('\n── somebody who never paid gets the free product ──');
  {
    const h=hashOf(50);
    db.prepare("INSERT OR REPLACE INTO kh_users (hash,email,state,updated_at) VALUES (?,?,?,?)").run(h,'freeloader','',new Date().toISOString());
    const got=await accountTier(h,env.DB);
    ok('no entitlement row means free', got==='free', got);
    ok('  ...on the free allowance', tierCap(got,env)===TIER_DAILY.free);
  }

  console.log('\n── the ways a PAYING customer used to be downgraded ──');
  /* Each of these is somebody whose money arrived and whose plan stopped
     working, for a reason that has nothing to do with them. */
  {
    const h=hashOf(60);
    await stripeWriteEnt(env.DB,h,'max','active','month',NOW-2*DAY,'cus_x','sub_x',0);
    const got=await accountTier(h,env.DB);
    ok('a renewal webhook that never arrived does NOT downgrade them', got==='max', got);
    ok('  ...but it IS flagged, so a broken webhook is visible',
       entEval({tier:'max',status:'active',current_period_end:NOW-2*DAY}).attention===true);
  }
  {
    const h=hashOf(61);
    await stripeWriteEnt(env.DB,h,'pro','past_due','month',NOW+10*DAY,'cus_y','sub_y',0);
    ok('a card being retried keeps the plan while Stripe retries',
       (await accountTier(h,env.DB))==='pro');
  }
  {
    const h=hashOf(62);
    await stripeWriteEnt(env.DB,h,'Max','active','month',NOW+YEAR,'cus_z','sub_z',0);
    ok('a tier stored with odd casing still resolves',(await accountTier(h,env.DB))==='max');
  }
  {
    const h=hashOf(63);
    await stripeWriteEnt(env.DB,h,'max ','active','month',NOW+YEAR,'cus_w','sub_w',0);
    ok('...and with stray whitespace',(await accountTier(h,env.DB))==='max');
  }

  console.log('\n── but a plan that genuinely ended does end ──');
  /* The grace window has to be finite, or a cancelled subscription would keep
     working forever whenever webhooks are broken. */
  {
    const h=hashOf(70);
    await stripeWriteEnt(env.DB,h,'max','active','month',NOW-30*DAY,'cus_a','sub_a',0);
    ok('a month past the period end, with no renewal, is over',
       (await accountTier(h,env.DB))==='free');
  }
  {
    const h=hashOf(71);
    await stripeWriteEnt(env.DB,h,'max','canceled','month',NOW+YEAR,'cus_b','sub_b',0);
    ok('an explicitly cancelled subscription is free immediately',
       (await accountTier(h,env.DB))==='free');
  }
  {
    const h=hashOf(72);
    await stripeWriteEnt(env.DB,h,'free','canceled','',0,'','',NOW);
    ok('a gift taken back is free',(await accountTier(h,env.DB))==='free');
  }

  console.log('\n── the client cannot simply claim a tier ──');
  {
    const h=hashOf(80);
    db.prepare("INSERT OR REPLACE INTO kh_users (hash,email,state,updated_at) VALUES (?,?,?,?)").run(h,'liar','',new Date().toISOString());
    const r=await worker.fetch(new Request('https://x/stripe/status?hash='+h,{method:'GET'}),env,{waitUntil(){}});
    const body=await r.text();
    let d=null; try{ d=JSON.parse(body); }catch(_){}
    ok('the status endpoint reports free for an unpaid account',
       !!d && (d.tier==='free'||!d.tier), body.slice(0,120));
  }

  console.log('\n── the numbers on the pricing card are the numbers enforced ──');
  ok('free  5/day',   TIER_DAILY.free===5);
  ok('plus  50/day',  TIER_DAILY.plus===50);
  ok('pro   500/day', TIER_DAILY.pro===500);
  ok('max   2000/day',TIER_DAILY.max===2000);

  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
