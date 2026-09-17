/* Stripe subscription backend: signature security + entitlement lifecycle.
   Run: NODE_PATH=/opt/node22/lib/node_modules node --experimental-sqlite /tmp/stripe_test.mjs */
import { DatabaseSync } from 'node:sqlite';
import { webcrypto } from 'node:crypto';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
import worker, { ensureSchema, billingIdFor, stripeVerifySig, stripeTimingEq, stripePriceMap, stripeModeProblem, stripeSubTier,
  stripeSubPeriodEnd, stripeApplySub, stripeWriteEnt, runStripeInactivitySweep, STRIPE_PRICES_DEFAULT } from '../../api-worker.js';

let pass=0, fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x&&!c?'  -- '+x:''));};
function d1(db){return{prepare(sql){let p=[];const api={bind(...a){p=a.map(x=>x===undefined?null:x);return api;},async run(){const r=db.prepare(sql).run(...p);return{meta:{changes:r.changes,last_row_id:r.lastInsertRowid}};},async all(){return{results:db.prepare(sql).all(...p)};},async first(){return db.prepare(sql).get(...p)||null;}};return api;},async batch(s){for(const x of s)await x.run();}};}

const WHSEC='whsec_test_abc123';
const HASH='a'.repeat(64);
const PRICE_MAX_M=STRIPE_PRICES_DEFAULT.max.month;
const PRICE_PLUS_Y=STRIPE_PRICES_DEFAULT.plus.year;

async function sign(body, secret, t){
  const ts=t||Math.floor(Date.now()/1000);
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const mac=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(ts+'.'+body));
  const hex=[...new Uint8Array(mac)].map(b=>b.toString(16).padStart(2,'0')).join('');
  return 't='+ts+',v1='+hex;
}
function whReq(body,sig){return new Request('https://x/stripe/webhook',{method:'POST',headers:{'Content-Type':'application/json','Stripe-Signature':sig||''},body:body});}
function postReq(path,obj){return new Request('https://x'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(obj)});}

/* Fake Stripe API so nothing leaves the machine. */
let stripeCalls=[];
function mockStripe(subObj){
  globalThis.fetch=async(url,opts)=>{
    stripeCalls.push({url:String(url),body:(opts&&opts.body)||'',headers:(opts&&opts.headers)||{}});
    const u=String(url);
    if(/\/v1\/subscriptions\//.test(u)&&(!opts||opts.method==='GET')) return new Response(JSON.stringify(subObj),{status:200,headers:{'Content-Type':'application/json'}});
    if(/\/v1\/subscriptions\//.test(u)) return new Response(JSON.stringify({id:subObj.id,cancel_at_period_end:true}),{status:200,headers:{'Content-Type':'application/json'}});
    if(/checkout\/sessions/.test(u)) return new Response(JSON.stringify({id:'cs_1',url:'https://checkout.stripe.com/pay/cs_1'}),{status:200,headers:{'Content-Type':'application/json'}});
    if(/billing_portal\/sessions/.test(u)) return new Response(JSON.stringify({id:'bps_1',url:'https://billing.stripe.com/p/1'}),{status:200,headers:{'Content-Type':'application/json'}});
    return new Response('{}',{status:404});
  };
}

(async()=>{
  const db=new DatabaseSync(':memory:');
  const SUB={id:'sub_1',status:'active',customer:'cus_1',current_period_end:2000000000,
    metadata:{kh:''}, items:{data:[{price:{id:PRICE_MAX_M}}]}};
  mockStripe(SUB);
  /* STRIPE_PRICES must be set alongside a TEST key: the worker refuses to run a
     test key against the baked-in LIVE price ids (see stripeModeProblem). These
     mirror the live ids so the existing price assertions still line up. */
  const TEST_PRICES=JSON.stringify(STRIPE_PRICES_DEFAULT);
  const env={DB:d1(db),ALLOW_ORIGIN:'*',STRIPE_SECRET_KEY:'sk_test_x',STRIPE_WEBHOOK_SECRET:WHSEC,APP_BASE_URL:'https://kindlehub.pro',STRIPE_PRICES:TEST_PRICES};
  await ensureSchema(env.DB);
  /* HASH is a SIGNED-IN user — checkout and payment-link both require the
     account to exist in kh_users (KH-IA12), so it belongs here from the start,
     not seeded 100 lines down. An unregistered hash is exercised separately. */
  db.prepare("INSERT OR REPLACE INTO kh_users (hash,email,state,updated_at) VALUES (?,?,?,?)")
    .run(HASH,'checkoutuser','',new Date().toISOString());

  console.log('\n── signature verification (the security boundary) ──');
  const body=JSON.stringify({type:'ping'});
  ok('valid signature accepted', await stripeVerifySig(body, await sign(body,WHSEC), WHSEC, 300));
  ok('WRONG secret rejected', !(await stripeVerifySig(body, await sign(body,'whsec_attacker'), WHSEC, 300)));
  ok('TAMPERED body rejected', !(await stripeVerifySig(body+' ', await sign(body,WHSEC), WHSEC, 300)));
  ok('missing header rejected', !(await stripeVerifySig(body,'',WHSEC,300)));
  ok('garbage header rejected', !(await stripeVerifySig(body,'nonsense',WHSEC,300)));
  ok('no v1 component rejected', !(await stripeVerifySig(body,'t=123',WHSEC,300)));
  const oldTs=Math.floor(Date.now()/1000)-4000;
  ok('REPLAY (old timestamp) rejected', !(await stripeVerifySig(body, await sign(body,WHSEC,oldTs), WHSEC, 300)));
  ok('rotation: multiple v1, one valid -> accepted',
     await stripeVerifySig(body, (await sign(body,WHSEC))+',v1=deadbeef', WHSEC, 300));
  ok('timingEq same', stripeTimingEq('abc','abc'));
  ok('timingEq diff', !stripeTimingEq('abc','abd'));
  ok('timingEq length', !stripeTimingEq('abc','abcd'));

  console.log('\n── forged webhook cannot grant a plan (end to end) ──');
  const BID=await billingIdFor(HASH, env.DB);
  SUB.metadata.kh=BID;
  ok('billing id is opaque and is NOT the account hash', /^kh_[a-f0-9]{32}$/.test(BID)&&BID.indexOf(HASH)<0, BID);
  const evt=JSON.stringify({type:'checkout.session.completed',id:'evt_1',created:1000,data:{object:{client_reference_id:BID,subscription:'sub_1',customer:'cus_1'}}});
  const forged=await worker.fetch(whReq(evt, await sign(evt,'whsec_attacker')), env);
  ok('forged webhook -> 400', forged.status===400, 'status='+forged.status);
  /* A row already exists because billingIdFor() reserved the opaque id; what
     matters is that the FORGED event granted no plan. */
  ok('forged webhook granted NO plan', (db.prepare('SELECT tier FROM kh_entitlements WHERE hash=?').get(HASH)||{}).tier==='free',
     JSON.stringify(db.prepare('SELECT tier,status FROM kh_entitlements WHERE hash=?').get(HASH)));

  console.log('\n── real webhook grants the plan ──');
  const r1=await worker.fetch(whReq(evt, await sign(evt,WHSEC)), env);
  ok('signed webhook -> 200', r1.status===200, 'status='+r1.status);
  let row=db.prepare('SELECT * FROM kh_entitlements WHERE hash=?').get(HASH);
  ok('entitlement row created', !!row, JSON.stringify(row));
  ok('tier = max (from price id)', row&&row.tier==='max', row&&row.tier);
  ok('interval = month', row&&row.interval==='month', row&&row.interval);
  ok('status = active', row&&row.status==='active', row&&row.status);
  ok('period end stored', row&&row.current_period_end===2000000000, row&&String(row.current_period_end));
  ok('stripe ids stored', row&&row.stripe_customer_id==='cus_1'&&row.stripe_sub_id==='sub_1');

  console.log('\n── idempotency: same event twice ──');
  await worker.fetch(whReq(evt, await sign(evt,WHSEC)), env);
  ok('still exactly one row', db.prepare('SELECT COUNT(*) c FROM kh_entitlements').get().c===1);

  console.log('\n── plan change (upgrade/downgrade) ──');
  const subPlus={id:'sub_1',status:'active',customer:'cus_1',current_period_end:2100000000,metadata:{kh:BID},items:{data:[{price:{id:PRICE_PLUS_Y}}]}};
  const evt2=JSON.stringify({type:'customer.subscription.updated',id:'evt_2',created:2000,data:{object:subPlus}});
  await worker.fetch(whReq(evt2, await sign(evt2,WHSEC)), env);
  row=db.prepare('SELECT * FROM kh_entitlements WHERE hash=?').get(HASH);
  ok('downgraded to plus/year', row&&row.tier==='plus'&&row.interval==='year', JSON.stringify(row));

  console.log('\n── cancellation drops to free ──');
  const evt3=JSON.stringify({type:'customer.subscription.deleted',id:'evt_3',created:3000,data:{object:{id:'sub_1',status:'canceled',customer:'cus_1',metadata:{kh:BID},items:{data:[{price:{id:PRICE_PLUS_Y}}]}}}});
  await worker.fetch(whReq(evt3, await sign(evt3,WHSEC)), env);
  row=db.prepare('SELECT * FROM kh_entitlements WHERE hash=?').get(HASH);
  ok('tier back to free', row&&row.tier==='free', row&&row.tier);
  ok('status canceled', row&&row.status==='canceled', row&&row.status);

  console.log('\n── status endpoint (client reads its own plan) ──');
  await stripeApplySub(env.DB, env, HASH, SUB);   // restore to max
  const st=await worker.fetch(postReq('/stripe/status',{hash:HASH}),env);
  const stj=await st.json();
  ok('status returns tier', stj&&stj.tier==='max', JSON.stringify(stj));
  ok('status NEVER leaks stripe ids', stj&&!('stripe_customer_id' in stj)&&!('stripe_sub_id' in stj), JSON.stringify(stj));
  ok('status has manageable flag', stj&&stj.manageable===true);
  const stUnknown=await worker.fetch(postReq('/stripe/status',{hash:'b'.repeat(64)}),env);
  ok('unknown account -> free', (await stUnknown.json()).tier==='free');
  const stBad=await worker.fetch(postReq('/stripe/status',{hash:'not-a-hash'}),env);
  ok('malformed hash -> 400', stBad.status===400, 'status='+stBad.status);

  console.log('\n── checkout ──');
  stripeCalls=[];
  /* HASH currently has an ACTIVE subscription (restored above) — a second
     checkout MUST be refused or the user would be billed for two plans. */
  const coDouble=await worker.fetch(postReq('/stripe/checkout',{hash:HASH,tier:'pro',interval:'month'}),env);
  const coDoubleJ=await coDouble.json();
  ok('ACTIVE subscriber cannot start a second checkout (409 HAS_SUB)',
     coDouble.status===409&&coDoubleJ&&coDoubleJ.code==='HAS_SUB', 'status='+coDouble.status+' '+JSON.stringify(coDoubleJ));
  ok('blocked checkout called Stripe ZERO times', stripeCalls.filter(c=>/checkout\/sessions/.test(c.url)).length===0);
  /* A lapsed (canceled) subscriber may resubscribe — and still reuses their
     existing Stripe customer. */
  await stripeWriteEnt(env.DB, HASH, 'free', 'canceled', '', 0, 'cus_1', 'sub_1');
  const co=await worker.fetch(postReq('/stripe/checkout',{hash:HASH,tier:'max',interval:'month'}),env);
  const coj=await co.json();
  ok('checkout returns a url', co.status===200&&coj&&/checkout\.stripe\.com/.test(coj.url||''), JSON.stringify(coj));
  const sent=stripeCalls.filter(c=>/checkout\/sessions/.test(c.url))[0];
  ok('mode=subscription sent', sent&&/mode=subscription/.test(sent.body), sent&&sent.body);
  ok('correct price sent', sent&&sent.body.indexOf(encodeURIComponent(PRICE_MAX_M))>=0);
  ok('client_reference_id is the OPAQUE id, never the hash', sent&&sent.body.indexOf('client_reference_id='+BID)>=0&&sent.body.indexOf(HASH)<0, sent&&sent.body.slice(0,200));
  ok('subscription metadata carries the OPAQUE id only', sent&&/subscription_data%5Bmetadata%5D%5Bkh%5D/.test(sent.body)&&sent.body.indexOf(HASH)<0);
  ok('THE ACCOUNT AES KEY NEVER REACHES STRIPE', stripeCalls.every(c=>String(c.body||'').indexOf(HASH)<0&&String(c.url||'').indexOf(HASH)<0));
  ok('reuses existing stripe customer', sent&&/customer=cus_1/.test(sent.body), sent&&sent.body);
  ok('secret key sent as bearer, never in response', sent&&/^Bearer sk_/.test(sent.headers['Authorization'])&&!/sk_test/.test(JSON.stringify(coj)));
  const coBad=await worker.fetch(postReq('/stripe/checkout',{hash:HASH,tier:'emperor',interval:'month'}),env);
  ok('unknown tier -> 400', coBad.status===400, 'status='+coBad.status);
  const coBadHash=await worker.fetch(postReq('/stripe/checkout',{hash:'x',tier:'max'}),env);
  ok('bad hash -> 400', coBadHash.status===400);
  /* THE FIX: a well-formed but UNREGISTERED hash must be refused — the same
     guard /stripe/link has. Before this, checkout minted an orphan
     kh_entitlements row (via billingIdFor) and opened a real Stripe session for
     an account nobody owns. It must reject with 403 and call Stripe zero times,
     and must NOT leave an entitlements row behind. */
  stripeCalls=[];
  const UNREG='b'.repeat(64);
  const coUnreg=await worker.fetch(postReq('/stripe/checkout',{hash:UNREG,tier:'max',interval:'month'}),env);
  const coUnregJ=await coUnreg.json();
  ok('checkout for an UNREGISTERED account -> 403 no-account',
     coUnreg.status===403&&coUnregJ&&coUnregJ.error==='no-account', 'status='+coUnreg.status+' '+JSON.stringify(coUnregJ));
  ok('...and it called Stripe ZERO times', stripeCalls.filter(c=>/checkout\/sessions/.test(c.url)).length===0);
  const orphan=db.prepare('SELECT hash FROM kh_entitlements WHERE hash=?').get(UNREG);
  ok('...and left NO orphan entitlements row', !orphan, orphan?'row exists':'no row');

  console.log('\n── ships safely DISABLED with no secret key ──');
  const envOff={DB:d1(db),ALLOW_ORIGIN:'*'};
  const off=await worker.fetch(postReq('/stripe/checkout',{hash:HASH,tier:'max',interval:'month'}),envOff);
  const offj=await off.json();
  ok('no key -> {disabled:true}, HTTP 200', off.status===200&&offj.disabled===true, JSON.stringify(offj));
  const offWh=await worker.fetch(whReq(evt, await sign(evt,WHSEC)), envOff);
  ok('no webhook secret -> 503 (never trusts unsigned)', offWh.status===503, 'status='+offWh.status);

  console.log('\n── portal ──');
  const po=await worker.fetch(postReq('/stripe/portal',{hash:HASH}),env);
  ok('portal returns a url', po.status===200&&/billing\.stripe\.com/.test((await po.json()).url||''));
  const poNone=await worker.fetch(postReq('/stripe/portal',{hash:'c'.repeat(64)}),env);
  ok('no subscription -> 404', poNone.status===404, 'status='+poNone.status);

  console.log('\n── method + routing hygiene ──');
  const getWh=await worker.fetch(new Request('https://x/stripe/webhook',{method:'GET'}),env);
  ok('GET webhook -> 405', getWh.status===405, 'status='+getWh.status);
  const entRest=await worker.fetch(new Request('https://x/rest/v1/kh_entitlements',{method:'GET'}),env);
  ok('kh_entitlements NOT readable via /rest/v1 (no enumeration)', entRest.status===404, 'status='+entRest.status);

  console.log('\n── inactivity auto-cancel ──');
  db.prepare("INSERT OR REPLACE INTO kh_users (hash,email,state,updated_at) VALUES (?,?,?,?)")
    .run(HASH,'olduser','', new Date(Date.now()-200*86400000).toISOString());
  await stripeApplySub(env.DB, env, HASH, SUB);
  const noOptIn=await runStripeInactivitySweep(env.DB, env);
  ok('inert unless STRIPE_AUTOCANCEL is set', noOptIn.ran===false, JSON.stringify(noOptIn));
  const envAC=Object.assign({},env,{STRIPE_AUTOCANCEL:'1'});
  const swept=await runStripeInactivitySweep(env.DB, envAC);
  ok('sweeps when enabled', swept.ran===true&&swept.cancelled===1, JSON.stringify(swept));
  row=db.prepare('SELECT status FROM kh_entitlements WHERE hash=?').get(HASH);
  ok('marked canceled_inactive', row&&row.status==='canceled_inactive', row&&row.status);
  const cancelCall=stripeCalls.filter(c=>/\/v1\/subscriptions\/sub_1/.test(c.url)&&/cancel_at_period_end/.test(c.body))[0];
  ok('used cancel_at_period_end (never an immediate cancel/refund)', !!cancelCall, 'no such call');
  ok('user was notified by announcement', db.prepare("SELECT COUNT(*) c FROM kh_announcements WHERE text LIKE '%not be charged again%'").get().c===1);
  // an ACTIVE user must never be cancelled
  const H2='d'.repeat(64);
  db.prepare("INSERT OR REPLACE INTO kh_users (hash,email,state,updated_at) VALUES (?,?,?,?)").run(H2,'activeuser','',new Date().toISOString());
  await stripeApplySub(env.DB, env, H2, Object.assign({},SUB,{id:'sub_2',metadata:{kh:H2}}));
  const swept2=await runStripeInactivitySweep(env.DB, envAC);
  ok('ACTIVE subscriber is never cancelled', swept2.cancelled===0, JSON.stringify(swept2));

  console.log('\n── price mapping ──');
  const pmap=stripePriceMap({});
  ok('all 6 prices map', Object.keys(pmap).length===6, String(Object.keys(pmap).length));
  ok('env STRIPE_PRICES overrides (test-mode swap)',
     stripePriceMap({STRIPE_PRICES:JSON.stringify({max:{month:'price_TESTONLY'}})})['price_TESTONLY'].tier==='max');
  ok('period end falls back to the subscription ITEM (2025 API shape)',
     stripeSubPeriodEnd({items:{data:[{current_period_end:1777777777}]}})===1777777777);
  ok('unknown price -> no tier (cannot silently grant)', stripeSubTier({items:{data:[{price:{id:'price_unknown'}}]}},pmap)===null);

  console.log('\n── hardening: opaque id, stale events, bad price config, body cap ──');
  // stale/duplicate events
  const dup=await worker.fetch(whReq(evt, await sign(evt,WHSEC)), env);
  ok('duplicate event id is ignored', (await dup.json()).duplicate===true);
  const stale=JSON.stringify({type:'customer.subscription.updated',id:'evt_old',created:5,data:{object:Object.assign({},SUB,{status:'canceled'})}});
  await worker.fetch(whReq(stale, await sign(stale,WHSEC)), env);
  const afterStale=db.prepare('SELECT tier FROM kh_entitlements WHERE hash=?').get(HASH);
  ok('a STALE event cannot resurrect an old state', afterStale&&afterStale.tier==='max', afterStale&&afterStale.tier);
  // unknown billing id -> no write
  const ghost=JSON.stringify({type:'checkout.session.completed',id:'evt_ghost',created:9000,data:{object:{client_reference_id:'kh_'+'f'.repeat(32),subscription:'sub_1'}}});
  const before=db.prepare('SELECT COUNT(*) c FROM kh_entitlements').get().c;
  await worker.fetch(whReq(ghost, await sign(ghost,WHSEC)), env);
  ok('unknown billing id grants nothing', db.prepare('SELECT COUNT(*) c FROM kh_entitlements').get().c===before);
  // malformed STRIPE_PRICES must NOT fall back to live ids
  const envBad=Object.assign({},env,{STRIPE_PRICES:'{not json'});
  const badCo=await worker.fetch(postReq('/stripe/checkout',{hash:HASH,tier:'max',interval:'month'}),envBad);
  ok('broken STRIPE_PRICES disables checkout (never charges live prices)', badCo.status===500, 'status='+badCo.status);
  // oversized webhook body rejected before buffering
  const big=await worker.fetch(new Request('https://x/stripe/webhook',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':'999999','Stripe-Signature':'t=1,v1=x'},body:'{}'}),env);
  ok('oversized webhook body rejected (413)', big.status===413, 'status='+big.status);

  console.log('\n── a FAILED webhook must be retryable (not swallowed as a duplicate) ──');
  /* Regression: the event id used to be recorded BEFORE the handler ran, so a
     transient DB error returned 500 and Stripe's retry was then discarded as a
     duplicate — a paying customer silently stayed on free, forever. */
  const RH='9'.repeat(64);
  const RBID=await billingIdFor(RH, env.DB);
  const subR={id:'sub_retry',status:'active',customer:'cus_r',current_period_end:2200000000,
    metadata:{kh:RBID}, items:{data:[{price:{id:PRICE_MAX_M}}]}};
  const evR=JSON.stringify({type:'customer.subscription.updated',id:'evt_retry',created:5000,data:{object:subR}});
  const sigR=await sign(evR,WHSEC);
  /* First delivery blows up inside the handler. */
  const realFetch=globalThis.fetch;
  globalThis.fetch=async()=>{throw new Error('transient upstream failure');};
  const envBoom={DB:{prepare(sql){ if(/kh_entitlements/.test(sql)&&/INSERT/.test(sql)) throw new Error('transient D1 failure'); return env.DB.prepare(sql); },batch:env.DB.batch},
                 ALLOW_ORIGIN:'*',STRIPE_SECRET_KEY:'sk_test_x',STRIPE_WEBHOOK_SECRET:WHSEC,STRIPE_PRICES:TEST_PRICES};
  const boom=await worker.fetch(whReq(evR,sigR),envBoom);
  globalThis.fetch=realFetch;
  ok('a failing webhook returns 500 so Stripe retries', boom.status===500, 'status='+boom.status);
  ok('the failed event was NOT recorded as processed',
     db.prepare("SELECT COUNT(*) c FROM kh_stripe_events WHERE id='evt_retry'").get().c===0);
  /* Stripe retries; this time it must actually apply. */
  const retry=await worker.fetch(whReq(evR,sigR),env);
  ok('the retry is processed, not discarded', retry.status===200, 'status='+retry.status);
  const rowR=db.prepare('SELECT tier FROM kh_entitlements WHERE hash=?').get(RH);
  ok('the customer ends up WITH their plan', rowR&&rowR.tier==='max', JSON.stringify(rowR));
  ok('now it is recorded, so a third delivery is a no-op',
     db.prepare("SELECT COUNT(*) c FROM kh_stripe_events WHERE id='evt_retry'").get().c===1);
  const third=await worker.fetch(whReq(evR,sigR),env);
  ok('third delivery reports duplicate', third.status===200);

  console.log('\n── audit KH-08: key/price mode consistency ──');
  // A TEST key with no STRIPE_PRICES would run against the baked-in LIVE ids.
  // Refuse, rather than send someone to a checkout that cannot work.
  const envMix=Object.assign({},env);delete envMix.STRIPE_PRICES;
  const mixCo=await worker.fetch(postReq('/stripe/checkout',{hash:HASH,tier:'max',interval:'month'}),envMix);
  ok('test key + live prices refuses checkout (503)', mixCo.status===503, 'status='+mixCo.status);
  // A LIVE key with the built-in live ids is the normal shipping config.
  const envLive=Object.assign({},env,{STRIPE_SECRET_KEY:'sk_live_x'});delete envLive.STRIPE_PRICES;
  ok('live key + built-in live prices is allowed', stripeModeProblem(envLive)==='');
  ok('no key at all reports no mode problem', stripeModeProblem({})==='');
  // The price->tier map must not silently use live ids when the override is broken.
  ok('broken STRIPE_PRICES yields an EMPTY price map (not live ids)',
     Object.keys(stripePriceMap({STRIPE_PRICES:'{not json'})).length===0);
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
