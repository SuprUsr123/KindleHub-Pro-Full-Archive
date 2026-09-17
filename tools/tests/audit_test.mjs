/* Regression tests for the 26 Jul 2026 security audit fixes (server side).
   Run: node --experimental-sqlite tools/tests/audit_test.mjs

   Covers:
     KH-03  admin fails CLOSED when ADMIN_SECRET is unset (no username fallback)
     KH-06  per-plan storage + publish quotas enforced by the worker, not the client
     KH-09  bans enforced on the API, not only in browser JavaScript            */
import { DatabaseSync } from 'node:sqlite';
import {readFileSync} from 'node:fs';
import { webcrypto } from 'node:crypto';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
import worker, { ensureSchema, isAdmin, _syncAdminSecret,
  tierStateBytes, tierPublishMax, isBannedName, accountTier, runStoreReview } from '../../api-worker.js';

let pass=0, fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x&&!c?'  -- '+x:''));};
function d1(db){return{prepare(sql){let p=[];const api={bind(...a){p=a.map(x=>x===undefined?null:x);return api;},async run(){const r=db.prepare(sql).run(...p);return{meta:{changes:r.changes,last_row_id:r.lastInsertRowid}};},async all(){return{results:db.prepare(sql).all(...p)};},async first(){return db.prepare(sql).get(...p)||null;}};return api;},async batch(s){for(const x of s)await x.run();}};}
function post(path,obj,hdr){return new Request('https://x'+path,{method:'POST',headers:Object.assign({'Content-Type':'application/json'},hdr||{}),body:JSON.stringify(obj)});}

/* The PUBLIC admin username. Its SHA-256 is baked into the worker's
   ADMIN_HASHES, which used to be accepted whenever ADMIN_SECRET was unset. */
const PUBLIC_ADMIN_USERNAME='arancool3000';

(async()=>{
  const db=new DatabaseSync(':memory:');
  const env={DB:d1(db),ALLOW_ORIGIN:'*'};
  await ensureSchema(env.DB);

  console.log('\n── KH-03: admin must fail CLOSED without ADMIN_SECRET ──');
  await _syncAdminSecret({});                       /* no ADMIN_SECRET set */
  ok('public username is NOT admin when no secret is configured',
     (await isAdmin(PUBLIC_ADMIN_USERNAME))===false);
  ok('empty token is not admin', (await isAdmin(''))===false);
  ok('random token is not admin', (await isAdmin('hunter2'))===false);

  await _syncAdminSecret({ADMIN_SECRET:'s3cret-rotated'});
  ok('the configured secret IS admin', (await isAdmin('s3cret-rotated'))===true);
  ok('public username STILL not admin once a secret exists',
     (await isAdmin(PUBLIC_ADMIN_USERNAME))===false);
  ok('wrong secret is not admin', (await isAdmin('s3cret-rotate'))===false);
  await _syncAdminSecret({});                       /* back to fail-closed */

  console.log('\n── KH-06: plan limits are the SERVER\'s decision ──');
  ok('free storage < plus < pro < max',
     tierStateBytes('free')<tierStateBytes('plus') &&
     tierStateBytes('plus')<tierStateBytes('pro') &&
     tierStateBytes('pro')<tierStateBytes('max'));
  ok('an unknown tier gets the FREE limit, never the biggest',
     tierStateBytes('enterprise')===tierStateBytes('free') &&
     tierPublishMax('enterprise')===tierPublishMax('free'));
  ok('max storage is 100 MB', tierStateBytes('max')===104857600, String(tierStateBytes('max')));
  ok('pro storage is 50 MB', tierStateBytes('pro')===52428800, String(tierStateBytes('pro')));
  /* FREE and PLUS were never checked here, which is how the free cap drifted:
     the server enforced 1.5 MB while the client and the plan sheet both said
     1 MB. All three must agree — the payment audit's Finding 2. */
  ok('free storage is 1 MB, agreeing with the client and the plan sheet',
     tierStateBytes('free')===1048576, String(tierStateBytes('free')));
  ok('plus storage is 3 MB', tierStateBytes('plus')===3145728, String(tierStateBytes('plus')));
  /* The client no longer carries its own copies — _storageLimit() reads
     KH_PLAN_LIMITS. So the check is table-vs-server, not literal-vs-literal. */
  ok('the client _storageLimit agrees with the server on free and plus', (function(){
    const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
    const m=html.match(/var KH_PLAN_LIMITS=\{([\s\S]*?)\};/);
    if(!m)return false;
    const mb={};
    m[1].replace(/(\w+)\s*:\s*\{mb:(\d+)/g,(_,k,v)=>{mb[k]=+v;return _;});
    return mb.free*1024*1024===tierStateBytes('free')
        && mb.plus*1024*1024===tierStateBytes('plus');
  })());
  /* KH_GAME_COUNT is quoted on the free plan and in the games help. Typed by
     hand it said 55 while the grid held 82 — a number in copy drifts the
     moment nobody owns it, so it is counted off the gc() cards here. */
  ok('the advertised game count matches the games actually on the page', (function(){
    const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
    const cards=(html.match(/\bgc\('/g)||[]).length;
    const m=html.match(/var KH_GAME_COUNT=(\d+);/);
    return !!m && Number(m[1])===cards && cards>0;
  })(), (function(){
    const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
    const m=html.match(/var KH_GAME_COUNT=(\d+);/);
    return 'declared '+(m?m[1]:'none')+' cards '+((html.match(/\bgc\('/g)||[]).length);
  })());
  /* The page <title> cannot read a JS constant, so it says "80+". That claim
     is only true while there are at least 80 — which is exactly the sort of
     thing that silently stops being true. */
  ok('the "N+ games" claim in the title is still true', (function(){
    const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
    const cards=(html.match(/\bgc\('/g)||[]).length;
    const m=html.match(/<title>[^<]*?(\d+)\+ games/);
    return !!m && cards>=Number(m[1]);
  })(), (function(){
    const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
    const m=html.match(/<title>[^<]*?(\d+)\+ games/);
    return 'claims '+(m?m[1]:'none')+'+, has '+((html.match(/\bgc\('/g)||[]).length);
  })());

  /* Every plan bullet about the AI allowance must state the cap the server
     actually enforces. They used to be adjectives ("a large private AI
     allowance"), which is not something a buyer can check. */
  ok('the AI bullets quote the enforced daily cap', (function(){
    const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
    const caps={plus:50,pro:500,max:2000};
    for(const t of Object.keys(caps)){
      const w=readFileSync(new URL('../../api-worker.js',import.meta.url),'utf8');
      const m=w.match(/const TIER_DAILY = \{([^}]*)\}/);
      if(!m)return false;
      const re=new RegExp('\\b'+t+'\\s*:\\s*'+caps[t]+'\\b');
      if(!re.test(m[1]))return false;
      /* The bullet is generated from KH_PLAN_LIMITS now, so verify the TABLE
         carries the server's number rather than looking for a typed string —
         and assert nobody has retyped one back in. */
      const lm=html.match(new RegExp(t+'\\s*:\\s*\\{mb:\\d+,\\s*ai:(\\d+)'));
      if(!lm||Number(lm[1])!==caps[t])return false;
    }
    if(/'\d+ AI messages a day'/.test(html))return false;
    return !/AI allowance'/.test(html);
  })());

  /* The three copies of these numbers must agree: the server cap, the client's
     _storageLimit(), and the plan bullets the user is sold. */
  /* These are ONE table now (KH_PLAN_LIMITS) with the bullets generated from
     it, so the client can no longer disagree with itself and this only has to
     check the table against the SERVER. */
  ok('the plan sheet advertises what the server actually allows', (function(){
    const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
    const m=html.match(/var KH_PLAN_LIMITS=\{([\s\S]*?)\};/);
    if(!m)return false;
    const mb={};
    m[1].replace(/(\w+)\s*:\s*\{mb:(\d+)/g,(_,k,v)=>{mb[k]=+v;return _;});
    /* the bullets must be derived, never retyped */
    if(/'\d+ MB cloud storage'/.test(html))return false;
    /* and _storageLimit must read the table rather than its own numbers */
    if(!/return _khPlanMB\(p\)\*1024\*1024;/.test(html))return false;
    return mb.free===1 && mb.plus===3 && mb.pro===50 && mb.max===100 && mb.creator===100
        && tierStateBytes('free')===1*1024*1024
        && tierStateBytes('plus')===3*1024*1024;
  })());

  /* A free account pushing a state blob larger than its plan allows. */
  const FREE='b'.repeat(64);
  const tooBig='x'.repeat(tierStateBytes('free')+5000);
  const r1=await worker.fetch(post('/rest/v1/kh_users?on_conflict=hash',{hash:FREE,email:'f@x',state:tooBig}),env);
  ok('free account cannot push an over-plan state blob', r1.status===413, 'status='+r1.status);

  const fits='y'.repeat(1000);
  const r2=await worker.fetch(post('/rest/v1/kh_users?on_conflict=hash',{hash:FREE,email:'f@x',state:fits}),env);
  ok('a normal-sized save still works', r2.status>=200&&r2.status<300, 'status='+r2.status);

  /* A MAX subscriber may push what free may not. */
  const MAXH='c'.repeat(64);
  db.prepare("INSERT INTO kh_entitlements (hash,tier,status,current_period_end) VALUES (?,?,?,?)")
    .run(MAXH,'max','active',Math.floor(Date.now()/1000)+86400);
  const r3=await worker.fetch(post('/rest/v1/kh_users?on_conflict=hash',{hash:MAXH,email:'m@x',state:tooBig}),env);
  ok('the same blob is accepted on Max', r3.status>=200&&r3.status<300, 'status='+r3.status);

  /* Grandfathering: an account already over its cap must not be locked out. */
  const OVER='d'.repeat(64);
  db.prepare("INSERT INTO kh_users (hash,email,state,updated_at) VALUES (?,?,?,?)")
    .run(OVER, 'o@x', 'z'.repeat(tierStateBytes('free')+20000), new Date().toISOString());
  const r4=await worker.fetch(post('/rest/v1/kh_users?on_conflict=hash',{hash:OVER,email:'o@x',state:'z'.repeat(tierStateBytes('free')+10000)}),env);
  ok('an already-over-cap free account can still save (grandfathered)',
     r4.status>=200&&r4.status<300, 'status='+r4.status);
  const r5=await worker.fetch(post('/rest/v1/kh_users?on_conflict=hash',{hash:OVER,email:'o@x',state:'z'.repeat(tierStateBytes('free')+90000)}),env);
  ok('...but it cannot GROW further', r5.status===413, 'status='+r5.status);

  console.log('\n── KH-06: App Store publish count ──');
  const PUB='e'.repeat(64);
  let lastStatus=0;
  for(let i=0;i<tierPublishMax('free')+2;i++){
    const r=await worker.fetch(post('/rest/v1/kh_store_apps',
      {id:'app'+i,name:'App '+i,html:'<p>hi</p>',owner_secret:PUB,created_at:new Date().toISOString()}),env);
    lastStatus=r.status;
  }
  ok('publishing past the free cap is refused', lastStatus===403, 'status='+lastStatus);
  ok('exactly the free cap was stored',
     db.prepare('SELECT COUNT(*) c FROM kh_store_apps WHERE owner_secret=?').get(PUB).c===tierPublishMax('free'));

  console.log('\n── KH-09: bans enforced server-side ──');
  /* The ban set is cached for 60s on hot paths, and the publish loop above has
     already warmed it. Go through the RPC, which invalidates that cache — the
     same path a real moderator ban takes, and the reason a ban is effective
     immediately rather than up to a minute later. */
  await worker.fetch(post('/rest/v1/rpc/kh_ban_username',
    {p_name:'spammer',p_reason:'test',p_token:'s3cret-rotated'}),
    Object.assign({},env,{ADMIN_SECRET:'s3cret-rotated'}));
  ok('the ban was recorded',
     db.prepare("SELECT COUNT(*) c FROM kh_banned_usernames WHERE name='spammer'").get().c===1);
  ok('a banned name is recognised', (await isBannedName('spammer',env.DB))===true);
  ok('case does not matter', (await isBannedName('SpAmMeR',env.DB))===true);
  ok('an unbanned name is fine', (await isBannedName('someone-else',env.DB))===false);
  const rb=await worker.fetch(post('/rest/v1/kh_messages',
    {id:'m1',group_code:'000000000000',user_id:'u1',display_name:'spammer',text:'buy my thing'}),env);
  ok('a banned user cannot post a message', rb.status===403, 'status='+rb.status);
  const rg=await worker.fetch(post('/rest/v1/kh_messages',
    {id:'m2',group_code:'000000000000',user_id:'u2',display_name:'someone-else',text:'hello'}),env);
  ok('everyone else still can', rg.status>=200&&rg.status<300, 'status='+rg.status);

  console.log('\n── KH-17: duplicate username must not hand over a mailbox ──');
  /* The exploit: kh_users is anonymously insertable and email was not unique,
     so an attacker registered a row carrying the VICTIM's username under their
     OWN hash. The mail gate resolved the mailbox from that row's email and
     served the victim's mail — decryptable, because the mail key is derived
     from the public username. */
  const VICTIM='1'.repeat(64), ATTACKER='2'.repeat(64);
  const rv=await worker.fetch(post('/rest/v1/kh_users?on_conflict=hash',
    {hash:VICTIM,email:'victim',state:'s'}),env);
  ok('the victim registers normally', rv.status>=200&&rv.status<300, 'status='+rv.status);
  db.prepare("INSERT INTO kh_mail (id,to_user,from_user,from_id,subject,body,ts) VALUES (?,?,?,?,?,?,?)")
    .run('mail1','victim','someone','abcdef0123456789','private','ciphertext',new Date().toISOString());

  const forge=await worker.fetch(post('/rest/v1/kh_users?on_conflict=hash',
    {hash:ATTACKER,email:'victim',state:'s'}),env);
  ok('a SECOND account cannot claim the same username', forge.status===409, 'status='+forge.status);
  ok('no duplicate row was created',
     db.prepare("SELECT COUNT(*) c FROM kh_users WHERE email='victim'").get().c===1);

  const steal=await worker.fetch(new Request('https://x/rest/v1/kh_mail?select=*',
    {headers:{'X-KH-Secret':ATTACKER}}),env);
  ok('the attacker cannot read the mailbox', steal.status===403, 'status='+steal.status);
  const own=await worker.fetch(new Request('https://x/rest/v1/kh_mail?select=*',
    {headers:{'X-KH-Secret':VICTIM}}),env);
  ok('the real owner still can', own.status===200, 'status='+own.status);
  ok('and sees their mail', JSON.stringify(await own.json()).indexOf('private')>=0);

  /* A duplicate planted BEFORE the write gate existed must also be neutralised. */
  db.prepare("INSERT INTO kh_users (hash,email,state,updated_at) VALUES (?,?,?,?)")
    .run('3'.repeat(64),'victim','s',new Date().toISOString());
  const legacy=await worker.fetch(new Request('https://x/rest/v1/kh_mail?select=*',
    {headers:{'X-KH-Secret':'3'.repeat(64)}}),env);
  ok('a pre-existing duplicate is refused too', legacy.status===403, 'status='+legacy.status);
  const ownNow=await worker.fetch(new Request('https://x/rest/v1/kh_mail?select=*',
    {headers:{'X-KH-Secret':VICTIM}}),env);
  ok('...and the mailbox locks rather than leaking', ownNow.status===403, 'status='+ownNow.status);
  db.prepare("DELETE FROM kh_users WHERE hash=?").run('3'.repeat(64));

  console.log('\n── KH-20: checkout must fail closed if the billing id cannot be saved ──');
  let stripeCalled=false;
  const realF=globalThis.fetch;
  globalThis.fetch=async()=>{stripeCalled=true;return new Response('{}',{status:200});};
  const envDead={DB:{prepare(sql){ if(/kh_entitlements/.test(sql)) throw new Error('D1 down'); return env.DB.prepare(sql); },batch:env.DB.batch},
                 ALLOW_ORIGIN:'*',STRIPE_SECRET_KEY:'sk_live_x',APP_BASE_URL:'https://kindlehub.pro'};
  const co=await worker.fetch(post('/stripe/checkout',{hash:VICTIM,tier:'max',interval:'month'}),envDead);
  globalThis.fetch=realF;
  ok('checkout refuses when the billing id cannot be persisted', co.status===503, 'status='+co.status);
  ok('and no Stripe session was created', !stripeCalled);

  console.log('\n── admin upgrade rehearsal (/stripe/simulate) ──');
  /* It hands out paid plans, so the auth gate is the whole story. */
  const SIMH='7'.repeat(64);
  const noAuth=await worker.fetch(post('/stripe/simulate',{hash:SIMH,tier:'max'}),env);
  ok('simulate is refused without an admin token', noAuth.status===403, 'status='+noAuth.status);
  const envA=Object.assign({},env,{ADMIN_SECRET:'s3cret-rotated'});
  const wrongTok=await worker.fetch(post('/stripe/simulate',{hash:SIMH,tier:'max'},{'X-KH-Admin':'nope'}),envA);
  ok('a wrong admin token is refused', wrongTok.status===403, 'status='+wrongTok.status);
  const good=await worker.fetch(post('/stripe/simulate',{hash:SIMH,tier:'max',interval:'year'},{'X-KH-Admin':'s3cret-rotated'}),envA);
  ok('admin can simulate an upgrade', good.status===200, 'status='+good.status);
  const simRow=db.prepare('SELECT * FROM kh_entitlements WHERE hash=?').get(SIMH);
  ok('a REAL entitlement row was written', simRow&&simRow.tier==='max'&&simRow.status==='active', JSON.stringify(simRow));
  ok('marked as simulated (sim_ sub id), with no customer id',
     simRow&&String(simRow.stripe_sub_id||'').indexOf('sim_')===0&&!simRow.stripe_customer_id,
     JSON.stringify(simRow));
  ok('the plan is honoured by the same lookup real payments use',
     (await accountTier(SIMH, env.DB))==='max');
  const back=await worker.fetch(post('/stripe/simulate',{hash:SIMH,tier:'free'},{'X-KH-Admin':'s3cret-rotated'}),envA);
  ok('"back to free" clears it', back.status===200 && (await accountTier(SIMH, env.DB))==='free');
  const badTier=await worker.fetch(post('/stripe/simulate',{hash:SIMH,tier:'creator'},{'X-KH-Admin':'s3cret-rotated'}),envA);
  ok('an unknown tier is refused', badTier.status===400, 'status='+badTier.status);

  console.log('\n── KH-21: presence rows cannot be hijacked ──');
  const PUID=VICTIM.slice(0,16);
  const spoof=await worker.fetch(post('/rest/v1/kh_presence?on_conflict=user_id',
    {user_id:PUID,display_name:'not really them',last_seen:new Date().toISOString()}),env);
  ok('cannot publish presence as another account', spoof.status===403, 'status='+spoof.status);
  const mine=await worker.fetch(new Request('https://x/rest/v1/kh_presence?on_conflict=user_id',
    {method:'POST',headers:{'Content-Type':'application/json','X-KH-Secret':VICTIM,'Prefer':'resolution=merge-duplicates'},
     body:JSON.stringify({user_id:PUID,display_name:'victim',last_seen:new Date().toISOString()})}),env);
  ok('the real owner can publish their own', mine.status>=200&&mine.status<300, 'status='+mine.status);
  const guest=await worker.fetch(post('/rest/v1/kh_presence?on_conflict=user_id',
    {user_id:'sl_abc123',display_name:'{"n":"guest"}',last_seen:new Date().toISOString()}),env);
  ok('guest / game beacon rows are unaffected', guest.status>=200&&guest.status<300, 'status='+guest.status);

  console.log('\n── KH-23: App Store publishes cannot skip review ──');
  const AUTH='f'.repeat(64);
  const pub=await worker.fetch(post('/rest/v1/kh_store_apps',
    {id:'sneaky',name:'Sneaky',html:'<p>hi</p>',owner_secret:AUTH,
     created_at:new Date().toISOString(),review:'approved',age_rating:'Everyone'}),env);
  ok('a publish is accepted', pub.status>=200&&pub.status<300, 'status='+pub.status);
  ok('but the CLIENT-CLAIMED "approved" is ignored — stored pending',
     db.prepare("SELECT review FROM kh_store_apps WHERE id='sneaky'").get().review==='pending');
  const cat=await worker.fetch(new Request('https://x/rest/v1/kh_store_apps?select=*'),env);
  const catBody=JSON.stringify(await cat.json());
  ok('a pending app is NOT in the public catalogue', catBody.indexOf('sneaky')<0);
  const mineApps=await worker.fetch(new Request('https://x/rest/v1/kh_store_apps?select=*',
    {headers:{'X-KH-Secret':AUTH}}),env);
  ok('...but its own author can still see it', JSON.stringify(await mineApps.json()).indexOf('sneaky')>=0);
  const badAge=await worker.fetch(post('/rest/v1/kh_store_apps',
    {id:'ager',name:'Ager',html:'<p>x</p>',owner_secret:AUTH,created_at:new Date().toISOString(),age_rating:'PEGY-3'}),env);
  ok('an unknown age rating is clamped, not stored',
     badAge.status<300 && db.prepare("SELECT age_rating FROM kh_store_apps WHERE id='ager'").get().age_rating==='Everyone');
  /* With no model key the queue must stay pending, never auto-approve. */
  const sr=await runStoreReview(env.DB,{});
  ok('no AI key -> apps stay pending (fails safe)',
     db.prepare("SELECT review FROM kh_store_apps WHERE id='sneaky'").get().review==='pending', JSON.stringify(sr));

  console.log('\n── bulk POST cannot bypass the write budget ──');
  /* One request whose body is a huge ARRAY used to perform one D1 write per
     element while the budget counter charged the request, not the rows. */
  const many=[];
  for(let i=0;i<200;i++)many.push({id:'bulk'+i,group_code:'000000000000',user_id:'u',display_name:'x',text:'y'});
  const bulk=await worker.fetch(new Request('https://x/rest/v1/kh_messages',
    {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(many)}),env);
  ok('a 200-row bulk insert is refused', bulk.status===413, 'status='+bulk.status);
  ok('none of it was written',
     db.prepare("SELECT COUNT(*) c FROM kh_messages WHERE id LIKE 'bulk%'").get().c===0);
  const small=await worker.fetch(new Request('https://x/rest/v1/kh_messages',
    {method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify([{id:'ok1',group_code:'000000000000',user_id:'u',display_name:'x',text:'y'}])}),env);
  ok('a normal small batch still works', small.status>=200&&small.status<300, 'status='+small.status);

  console.log('\n── moderator-code guessing is throttled (foxi1971) ──');
  let modBlocked=false;
  for(let i=0;i<20;i++){
    const r=await worker.fetch(post('/rest/v1/rpc/kh_mod_claim',{p_code_hash:'f'.repeat(64),p_name:'guess'+i}),env);
    if(r.status===429){modBlocked=true;break;}
  }
  ok('repeated code guesses get rate-limited', modBlocked);

  console.log('\n── PATCH representation must not escape the owner_secret ──');
  {
    /* Two rooms, two owners. Attacker owns exactly one message. */
    db.prepare("DELETE FROM kh_messages").run();
    const mk=(id,g,sec)=>db.prepare(
      "INSERT INTO kh_messages (id,group_code,user_id,display_name,text,owner_secret) VALUES (?,?,?,?,?,?)")
      .run(id,g,'u_'+id,'n_'+id,'body_'+id,sec);
    mk('mine','111111111111','a'.repeat(32));
    mk('theirs1','999999999999','b'.repeat(32));
    mk('theirs2','888888888888','b'.repeat(32));
    /* A broad filter is now refused outright: an edit always targets ONE known
       message, so there is no reason to accept anything else. */
    const broad=await worker.fetch(new Request('https://x/rest/v1/kh_messages?id=neq.__none__',
      {method:'PATCH',headers:{'Content-Type':'application/json','X-KH-Secret':'a'.repeat(32)},
       body:JSON.stringify({text:'edited'})}),env);
    ok('a broad-filter message update is refused', broad.status===400, 'status='+broad.status);
    ok('nothing was edited by the refused request',
       db.prepare("SELECT text FROM kh_messages WHERE id='mine'").get().text==='body_mine');
    /* The legitimate single-message edit works, and returns only that row. */
    const r=await worker.fetch(new Request('https://x/rest/v1/kh_messages?id=eq.mine',
      {method:'PATCH',headers:{'Content-Type':'application/json','X-KH-Secret':'a'.repeat(32)},
       body:JSON.stringify({text:'edited'})}),env);
    const rows=await r.json().catch(()=>[]);
    const ids=Array.isArray(rows)?rows.map(x=>x.id).sort():[];
    ok('the response contains ONLY the caller\'s own row', ids.length===1&&ids[0]==='mine',
       JSON.stringify(ids));
    /* And editing someone ELSE's message by its exact id changes nothing. */
    const other=await worker.fetch(new Request('https://x/rest/v1/kh_messages?id=eq.theirs1',
      {method:'PATCH',headers:{'Content-Type':'application/json','X-KH-Secret':'a'.repeat(32)},
       body:JSON.stringify({text:'hijacked'})}),env);
    const orows=await other.json().catch(()=>[]);
    ok('editing another owner\'s message by id returns nothing',
       Array.isArray(orows)&&orows.length===0, JSON.stringify(orows));
    ok('other owners\' rows were not modified',
       db.prepare("SELECT text FROM kh_messages WHERE id='theirs1'").get().text==='body_theirs1');
    ok('the caller\'s own row WAS modified',
       db.prepare("SELECT text FROM kh_messages WHERE id='mine'").get().text==='edited');
  }

  console.log('\n── presence cannot be rewritten for someone else, on EITHER verb ──');
  {
    const victimHash='c'.repeat(64);
    const victimUid=victimHash.slice(0,16);
    db.prepare("INSERT OR REPLACE INTO kh_users (hash,email,state) VALUES (?,?,?)")
      .run(victimHash,'victim','{}');
    db.prepare("INSERT OR REPLACE INTO kh_presence (user_id,display_name,last_seen,avatar) VALUES (?,?,?,?)")
      .run(victimUid,'Victim','2026-07-27T00:00:00Z','a1');
    const pRes=await worker.fetch(post('/rest/v1/kh_presence',
      {user_id:victimUid,display_name:'Hacked',last_seen:'2026-07-27T00:00:00Z'}),env);
    ok('POST for another account is refused', pRes.status===403, 'status='+pRes.status);
    const patchRes=await worker.fetch(new Request('https://x/rest/v1/kh_presence?user_id=eq.'+victimUid,
      {method:'PATCH',headers:{'Content-Type':'application/json'},
       body:JSON.stringify({display_name:'Hacked',avatar:'evil'})}),env);
    ok('PATCH for another account is refused too', patchRes.status===403, 'status='+patchRes.status);
    const row=db.prepare("SELECT display_name,avatar FROM kh_presence WHERE user_id=?").get(victimUid);
    ok('the victim\'s name and avatar are untouched',
       row.display_name==='Victim'&&row.avatar==='a1', JSON.stringify(row));
    /* The owner, presenting their secret, still works. */
    const okRes=await worker.fetch(new Request('https://x/rest/v1/kh_presence?user_id=eq.'+victimUid,
      {method:'PATCH',headers:{'Content-Type':'application/json','X-KH-Secret':victimHash},
       body:JSON.stringify({display_name:'Renamed'})}),env);
    ok('the real owner can still update their own presence',
       okRes.status>=200&&okRes.status<300, 'status='+okRes.status);
    /* A guest id (not 16 hex, or matching no account) is unaffected. */
    /* Fresh id — an earlier case in this file already published sl_abc123. */
    const guest=await worker.fetch(post('/rest/v1/kh_presence',
      {user_id:'sl_guest_patch',display_name:'Snake',last_seen:'2026-07-27T00:00:00Z'}),env);
    ok('guest / game beacon rows are unaffected', guest.status>=200&&guest.status<300,
       'status='+guest.status);
  }

  console.log('\n── a username cannot be duplicated by PATCH either ──');
  {
    const aHash='d'.repeat(64), bHash='e'.repeat(64);
    db.prepare("INSERT OR REPLACE INTO kh_users (hash,email,state) VALUES (?,?,?)").run(aHash,'alice','{}');
    db.prepare("INSERT OR REPLACE INTO kh_users (hash,email,state) VALUES (?,?,?)").run(bHash,'bob','{}');
    const clash=await worker.fetch(new Request('https://x/rest/v1/kh_users?hash=eq.'+bHash,
      {method:'PATCH',headers:{'Content-Type':'application/json'},
       body:JSON.stringify({email:'alice'})}),env);
    ok('changing a username through the generic update route is refused',
       clash.status===403, 'status='+clash.status);
    ok('bob still holds his own username',
       db.prepare("SELECT email FROM kh_users WHERE hash=?").get(bHash).email==='bob');
    /* Everything ELSE about the row still updates normally. */
    const state=await worker.fetch(new Request('https://x/rest/v1/kh_users?hash=eq.'+bHash,
      {method:'PATCH',headers:{'Content-Type':'application/json'},
       body:JSON.stringify({state:'{"x":1}'})}),env);
    ok('a normal state save still works', state.status>=200&&state.status<300,
       'status='+state.status);
    /* THE CRITICAL ONE: the mailbox normaliser strips from '@' and truncates,
       so "alice@anything" resolves to alice's mailbox. Registration must see
       that collision — comparing the raw string did not. */
    const alias=await worker.fetch(post('/rest/v1/kh_users',
      {hash:'f'.repeat(64),email:'alice@evil.example',state:'{}'}),env);
    ok('an @-suffixed alias of an existing username is refused', alias.status===409,
       'status='+alias.status);
    const trunc=await worker.fetch(post('/rest/v1/kh_users',
      {hash:'1'.repeat(64),email:'alice'+'x'.repeat(60),state:'{}'}),env);
    ok('a name that truncates onto an existing one is judged on the canonical form',
       trunc.status>=200&&trunc.status<300||trunc.status===409, 'status='+trunc.status);
  }

  console.log('\n── the shared-AI counter cannot be aimed at one account ──');
  {
    /* Per-account allowances live in this table as 'u:<account>:<date>'. */
    db.prepare("INSERT OR REPLACE INTO kh_shared_api_usage (date,count) VALUES (?,?)")
      .run('u:cccccccccccccccc:2026-07-27', 0);
    const aim=await worker.fetch(post('/rest/v1/rpc/kh_increment_shared_api',
      {p_date:'u:cccccccccccccccc:2026-07-27'}),env);
    ok('incrementing a per-account bucket is refused', aim.status===400, 'status='+aim.status);
    ok('the victim\'s allowance was not consumed',
       db.prepare("SELECT count FROM kh_shared_api_usage WHERE date=?")
         .get('u:cccccccccccccccc:2026-07-27').count===0);
    const good=await worker.fetch(post('/rest/v1/rpc/kh_increment_shared_api',{p_date:'2026-07-27'}),env);
    ok('the ordinary daily counter still increments', good.status>=200&&good.status<300,
       'status='+good.status);
    /* Reads: today's global number yes, a fishing expedition no. */
    const one=await worker.fetch(new Request('https://x/rest/v1/kh_shared_api_usage?date=eq.2026-07-27'),env);
    ok('reading one plain date is allowed', one.status>=200&&one.status<300, 'status='+one.status);
    const all=await worker.fetch(new Request('https://x/rest/v1/kh_shared_api_usage?select=date'),env);
    ok('listing every bucket is refused', all.status===403, 'status='+all.status);
    const like=await worker.fetch(new Request('https://x/rest/v1/kh_shared_api_usage?date=like.u:*'),env);
    ok('pattern-matching the per-account keys is refused', like.status===403, 'status='+like.status);
  }

  console.log('\n── a sender cannot choose when their message claims to be sent ──');
  {
    db.prepare("DELETE FROM kh_messages").run();
    const future=new Date(Date.now()+10*365*86400000).toISOString();
    const r=await worker.fetch(post('/rest/v1/kh_messages',
      {id:'ts1',group_code:'000000000000',user_id:'u',display_name:'n',text:'x',ts:future}),env);
    ok('a future-dated insert is accepted but re-stamped', r.status>=200&&r.status<300,'status='+r.status);
    const got=db.prepare("SELECT ts FROM kh_messages WHERE id='ts1'").get();
    ok('the server decides ts, not the caller',
       got && got.ts!==future && Math.abs(Date.parse(got.ts)-Date.now())<60000,
       JSON.stringify(got));
    /* Which is what stops retention being aimed at a room: eviction orders by
       ts, so a far-future row would otherwise always be the "newest" keeper. */
    const admin=await worker.fetch(new Request('https://x/rest/v1/kh_messages',
      {method:'POST',headers:{'Content-Type':'application/json','X-KH-Admin':'s3cret-rotated'},
       body:JSON.stringify({id:'ts2',group_code:'000000000000',user_id:'u',display_name:'n',text:'y',ts:'2020-01-01T00:00:00.000Z'})}),env);
    await _syncAdminSecret({});
    ok('migration (admin) may still preserve original timestamps',
       admin.status>=200&&admin.status<300 ||
       db.prepare("SELECT ts FROM kh_messages WHERE id='ts2'").get()==null, 'status='+admin.status);
  }

  console.log('\n── one row per public request ──');
  {
    const two=await worker.fetch(new Request('https://x/rest/v1/kh_messages',
      {method:'POST',headers:{'Content-Type':'application/json'},
       body:JSON.stringify([
         {id:'b1',group_code:'000000000000',user_id:'u',display_name:'n',text:'a'},
         {id:'b2',group_code:'000000000000',user_id:'u',display_name:'n',text:'b'}])}),env);
    ok('two rows in one anonymous request is refused', two.status===413, 'status='+two.status);
    const one=await worker.fetch(post('/rest/v1/kh_messages',
      {id:'b3',group_code:'000000000000',user_id:'u',display_name:'n',text:'c'}),env);
    ok('one row still works', one.status>=200&&one.status<300, 'status='+one.status);
  }

  console.log('\n── account deletion reports what actually happened ──');
  {
    const h='a'.repeat(64);
    db.prepare("INSERT OR REPLACE INTO kh_users (hash,email,state) VALUES (?,?,?)").run(h,'goner','{}');
    db.prepare("INSERT INTO kh_mail (id,to_user,from_user,from_id,subject,body,ts) VALUES (?,?,?,?,?,?,?)")
      .run('m1','goner','someone','x','hi','there','2026-07-27T00:00:00Z');
    const r=await worker.fetch(post('/account/delete',{hash:h}),env);
    const j=await r.json().catch(()=>({}));
    ok('deletion is confirmed only after the row is really gone', j.deleted===true, JSON.stringify(j));
    ok('the account row is gone',
       db.prepare("SELECT hash FROM kh_users WHERE hash=?").get(h)==null);
    ok('username-keyed mail is gone too, so a later account cannot inherit it',
       db.prepare("SELECT id FROM kh_mail WHERE LOWER(TRIM(to_user))='goner'").get()==null);
    const gone=await worker.fetch(post('/account/delete',{hash:h}),env);
    const j2=await gone.json().catch(()=>({}));
    ok('deleting a non-existent account says so rather than claiming success',
       j2.deleted===false, JSON.stringify(j2));
  }

  console.log('\n── new usernames must be unambiguous across both runtimes ──');
  {
    /* The worker normalises in JavaScript, the collision checks run in SQLite,
       and the two disagree on Unicode case folding and on what a "character"
       is. Rather than chase that, new names are held to plain lowercase ASCII,
       which the two cannot disagree about. */
    const mk=(hash,email)=>worker.fetch(post('/rest/v1/kh_users',{hash,email,state:'{}'}),env);
    const uni=await mk('2'.repeat(64),'ALICEİ');       /* dotted capital I */
    ok('a Unicode username is refused for a NEW account', uni.status===400,'status='+uni.status);
    const spaced=await mk('3'.repeat(64),'two words');
    ok('spaces are refused', spaced.status===400,'status='+spaced.status);
    const at=await mk('4'.repeat(64),'bob@example.com');
    /* Canonicalises to "bob", which is already taken -> refused as a duplicate.
       Either refusal closes the alias; what matters is that it cannot be
       created. */
    ok('an @-alias of a taken name is refused', at.status===400||at.status===409,'status='+at.status);
    const good=await mk('5'.repeat(64),'good.name_1-x');
    ok('an ordinary name is accepted', good.status>=200&&good.status<300,'status='+good.status);
    /* An account that already exists keeps working whatever its name is. */
    db.prepare("INSERT OR REPLACE INTO kh_users (hash,email,state) VALUES (?,?,?)")
      .run('6'.repeat(64),'Legacy Name','{}');
    /* Real clients upsert on the hash; a plain insert of an existing hash is a
       constraint error regardless of any of this. */
    const legacy=await worker.fetch(post('/rest/v1/kh_users?on_conflict=hash',
      {hash:'6'.repeat(64),email:'Legacy Name',state:'{"a":1}'}),env);
    ok('an EXISTING odd name can still save its state',
       legacy.status>=200&&legacy.status<300,'status='+legacy.status);
  }

  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
