/* The client half of "I granted myself a plan and it didn't work".

   The server was right to refuse — the app was sending the login name as its
   admin token, and the Worker only accepts ADMIN_SECRET. What made it a bug
   rather than a misconfiguration is that NOTHING SAID SO: the admin screens all
   rendered, and a refused credential was reported as "the Worker has not been
   redeployed", which sends you to Cloudflare to fix something that is fine.

   What this pins:
     - a 403 is worded as a credential problem and never mentions redeploying
     - a 404 is still worded as a deploy problem, because that one really is
     - any admin call that gets a 403 records the verdict, so the app knows
     - the Plans card states the problem up front instead of failing per-button
     - saving an admin secret no longer claims success without asking the server

   Run: NODE_PATH=/opt/node22/lib/node_modules node tools/tests/admincred_test.cjs */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url'),fs=require('fs');

let pass=0,fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x!==undefined&&!c?'  -- '+String(x).slice(0,240):''));};

(async()=>{
  const src=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');

  /* The wording that sent the owner to Cloudflare is gone from both plan
     dialogs. Checked in source because it is the exact string that misled. */
  ok('the gift dialog no longer blames a missing deploy for every failure',
     !/Could not grant that\. If the Worker has not been redeployed/.test(src));
  ok('the plan list no longer blames a missing deploy for every failure',
     !/Could not load\. The Worker may not have this yet/.test(src));
  ok('the admin secret is no longer described as optional',
     !/Optional but recommended\. Set a random ADMIN_SECRET/.test(src));
  ok('a refused credential is recorded from ordinary admin traffic',
     /_khNoteAdminStatus/.test(src) && /if\(status===403\)window\._adminServerOk=false/.test(src));

  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:600,height:800}});
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:20000});

  const r=await p.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const out={};

    /* ── wording ── */
    const m403=window._khRpcErrMsg({ok:false,status:403,body:'{"message":"unauthorized"}'},'grant that plan','Gifting a plan');
    const m404=window._khRpcErrMsg({ok:false,status:404,body:'unknown function: kh_grant_plan'},'grant that plan','Gifting a plan');
    out.m403=m403; out.m404=m404;
    out.r403NoRedeploy=!/redeploy/i.test(m403);
    out.r403Actionable=/ADMIN_SECRET/.test(m403)&&/Settings/.test(m403);
    out.r404SaysRedeploy=/redeploy api-worker\.js/i.test(m404);
    /* the 404 text used to be moderator-specific even when a plan call raised it */
    out.r404NotModOnly=/Gifting a plan/.test(m404)&&!/moderator system/i.test(m404);

    /* ── the verdict is learned from a real refusal ── */
    window._isAdminCached=true;
    window._adminToken='arancool3000';   /* what _checkAdmin sets with no secret saved */
    window._adminServerOk=null;
    const realFetch=window.fetch;
    let calls=[];
    window.fetch=async function(u,o){
      const s=String(u);
      if(/\/rest\/v1\/rpc\//.test(s)){
        calls.push(s);
        return new Response('{"message":"unauthorized"}',{status:403,headers:{'Content-Type':'application/json'}});
      }
      return realFetch.apply(this,arguments);
    };
    const okv=await window._khAdminServerOk(true);
    out.probeRan=calls.length>0;
    out.probeIsReadOnly=calls.some(s=>/kh_plan_counts/.test(s));  /* counts only — cannot change data */
    out.verdictFalse=okv===false&&window._adminServerOk===false;
    out.warning=window._khAdminCredWarning();
    out.warnsNoSecret=/no admin secret saved/i.test(out.warning)&&/refused/i.test(out.warning);

    /* with a secret saved the wording has to change — "you have none" would be
       wrong and unactionable when the real problem is that it is the wrong one */
    try{localStorage.setItem('kh_admin_secret','wrong-secret-value');}catch(_){}
    out.warningWithSecret=window._khAdminCredWarning();
    out.warnsWrongSecret=/not the one your Worker expects/i.test(out.warningWithSecret);
    /* the failure that started this: both values LOOKED identical because the
       difference was a trailing newline. If the message does not say so, the
       admin re-pastes the same invisible whitespace and fails again. */
    out.warnsWhitespace=/(trailing space|newline|whitespace)/i.test(out.warningWithSecret);
    try{localStorage.removeItem('kh_admin_secret');}catch(_){}

    /* THIRD state, and the one that used to be indistinguishable: the Worker
       has no ADMIN_SECRET at all. Nothing this device pastes can ever work, so
       telling the admin to check their copy sends them to fix the wrong end.
       Asked through the real code path — the Worker's health endpoint. */
    window.fetch=async function(u,o){
      const s=String(u);
      if(/\/rest\/v1\/rpc\//.test(s))
        return new Response('{"message":"unauthorized"}',{status:403,headers:{'Content-Type':'application/json'}});
      if(/\/$/.test(s)||/kindlehub-api/.test(s))
        return new Response('{"ok":true,"service":"kindlehub-api","adminConfigured":false}',{status:200,headers:{'Content-Type':'application/json'}});
      return realFetch.apply(this,arguments);
    };
    out.workerSaysNone=await window._khWorkerHasAdminSecret();
    out.warningWorkerNone=window._khAdminCredWarning();
    out.warnsWorkerHasNone=/no admin secret set at all/i.test(out.warningWorkerNone);
    out.namesTheEnvVar=/ADMIN_SECRET/.test(out.warningWorkerNone);

    /* a success flips it back, so a fixed credential clears the warning */
    window.fetch=async function(u,o){
      if(/\/rest\/v1\/rpc\//.test(String(u)))
        return new Response('{"free":1,"plus":0,"pro":0,"max":0,"total":1}',{status:200,headers:{'Content-Type':'application/json'}});
      return realFetch.apply(this,arguments);
    };
    const okv2=await window._khAdminServerOk(true);
    out.recovers=okv2===true&&window._khAdminCredWarning()==='';

    /* a dropped connection must NOT be reported as a bad credential */
    window._adminServerOk=null;
    window.fetch=async function(u,o){
      if(/\/rest\/v1\/rpc\//.test(String(u)))throw new Error('network down');
      return realFetch.apply(this,arguments);
    };
    await window._khAdminServerOk(true);
    out.networkStaysUnknown=window._adminServerOk===null;

    window.fetch=realFetch;
    return out;
  });

  ok('a 403 is not reported as a missing deploy',            r.r403NoRedeploy, r.m403);
  ok('...and it says exactly what to do about it',           r.r403Actionable, r.m403);
  ok('a real 404 still says to redeploy the Worker',         r.r404SaysRedeploy, r.m404);
  ok('...worded for whatever called it, not always moderators', r.r404NotModOnly, r.m404);
  ok('the credential check actually asks the server',        r.probeRan);
  ok('...using a read-only counts call, so it cannot change anything', r.probeIsReadOnly);
  ok('a refusal is recorded as a verdict',                   r.verdictFalse);
  ok('...and explained as a missing secret when none is saved', r.warnsNoSecret, r.warning);
  ok('...or as the WRONG secret when one is saved',          r.warnsWrongSecret, r.warningWithSecret);
  ok('...naming whitespace, which is what actually differed', r.warnsWhitespace, r.warningWithSecret);
  ok('the Worker is asked whether it has a secret at all',   r.workerSaysNone===false, JSON.stringify(r.workerSaysNone));
  ok('...and "the Worker has none" is its own message',      r.warnsWorkerHasNone, r.warningWorkerNone);
  ok('...which names the variable to set',                   r.namesTheEnvVar, r.warningWorkerNone);
  ok('a working credential clears the warning',              r.recovers);
  ok('a dropped connection is not mistaken for a bad credential', r.networkStaysUnknown);

  /* ── "Check my admin setup" ───────────────────────────────────────────
     Two wrong guesses at this bug in a row (a scheme-less mail gateway, then
     whitespace on the Worker's copy) and it was still refused. From inside the
     app a refusal looks identical whether the Worker has no secret, has a
     different one, is an older build, or is not the Worker being asked — so
     the diagnostic has to tell those four apart. Each is checked here. */
  console.log('\n── the setup check tells the four cases apart ──');
  const stub=(healthBody,rpcStatus)=>({healthBody,rpcStatus});
  const runDiag=async(healthBody,rpcOk,stored)=>p.evaluate(async(a)=>{
    const real=window.fetch;
    window.fetch=async function(u){
      const s=String(u);
      if(/rpc/.test(s))return new Response(a.rpcOk?'{"free":1,"plus":0,"pro":0,"max":0,"total":1}':'{}',
        {status:a.rpcOk?200:403,headers:{'Content-Type':'application/json'}});
      return new Response(a.healthBody,{status:200,headers:{'Content-Type':'application/json'}});
    };
    if(a.stored==null){try{localStorage.removeItem('kh_admin_secret');}catch(_){}}
    else{try{localStorage.setItem('kh_admin_secret',a.stored);}catch(_){}}
    window._khWorkerAdminSet=null;window._adminServerOk=null;window._isAdminCached=true;
    const steps=await window._khAdminDiagnose();
    window.fetch=real;
    return steps;
  },{healthBody,rpcOk,stored});

  const API='"ok":true,"service":"kindlehub-api"';
  const oldW=await runDiag('{'+API+'}',false,'  my-secret-value\n');
  /* An older Worker cannot answer, and "cannot tell" must never be shown as
     "your secret is wrong" — that is what sent the owner to fix the wrong end. */
  ok('an older Worker is named as older, not as a bad secret',
     oldW[2].ok===null&&/before this check existed/i.test(oldW[2].text), JSON.stringify(oldW[2]));
  ok('...and it says to redeploy',      /[Rr]edeploy api-worker/.test(oldW[2].text), oldW[2].text);
  ok('a stray newline in storage is reported', /stray space or newline/i.test(oldW[3].text), oldW[3].text);
  /* The length shown has to be the trimmed one, or comparing it against
     Cloudflare by eye would send you chasing a difference that is not there. */
  ok('...and the length shown is the trimmed length', /^15 characters/.test(oldW[3].text), oldW[3].text);

  const noneW=await runDiag('{'+API+',"adminConfigured":false}',false,'abc123');
  ok('a Worker with no secret set says exactly that',
     noneW[2].ok===false&&/NO admin secret/.test(noneW[2].text), JSON.stringify(noneW[2]));

  const wrongW=await runDiag('{"ok":true,"service":"something-else"}',false,'abc123');
  ok('an address that is not the API worker is called out',
     wrongW[1].ok===false&&/wrong Worker/i.test(wrongW[1].text), JSON.stringify(wrongW[1]));

  const goodW=await runDiag('{'+API+',"adminConfigured":true}',true,'abc123');
  ok('a working setup reports every step green',
     goodW.every(x=>x.ok===true), JSON.stringify(goodW.map(x=>x.label+':'+x.ok)));

  const noSecret=await runDiag('{'+API+',"adminConfigured":true}',false,null);
  ok('a device with nothing saved is told so, not blamed for a mismatch',
     noSecret[3].ok===false&&/no admin secret is saved here/i.test(noSecret[3].text), JSON.stringify(noSecret[3]));
  await p.evaluate(()=>{try{localStorage.removeItem('kh_admin_secret');}catch(_){}});

  /* ── "could not tell" is not "refused" ────────────────────────────────
     Reported as: the card said "Could not reach the server to check this
     credential" while the toast said "the server did NOT accept it", on an
     account whose moderator list — an admin RPC using the SAME token — was on
     screen full of server data. Three separate mistakes made that possible and
     each is pinned here. */
  console.log('\n── an inconclusive check is not a refusal ──');
  const tri=await p.evaluate(async()=>{
    const out={};
    const real=window.fetch;
    window._isAdminCached=true;
    window._adminToken='some-secret';

    /* 1. A 404 means the Worker has no such RPC — an older build. It says
          nothing whatever about the credential. */
    window._adminServerOk=null;window._khAdminEverOk=false;
    window.fetch=async u=>/rpc/.test(String(u))
      ? new Response('unknown function',{status:404})
      : real.apply(window,arguments);
    out.on404=await window._khAdminServerOk(true);

    /* 2. A dead connection is not a verdict either. */
    window._adminServerOk=null;window._khAdminEverOk=false;
    window.fetch=async u=>{ if(/rpc/.test(String(u)))throw new Error('offline'); return real.apply(window,arguments); };
    out.onNetwork=await window._khAdminServerOk(true);

    /* 3. A 403 IS a verdict. */
    window._adminServerOk=null;window._khAdminEverOk=false;
    window.fetch=async u=>/rpc/.test(String(u))
      ? new Response('{}',{status:403,headers:{'Content-Type':'application/json'}})
      : real.apply(window,arguments);
    out.on403=await window._khAdminServerOk(true);

    /* 4. An admin call that already SUCCEEDED is proof, and a later probe that
          cannot run must not be able to un-prove it. */
    window._adminServerOk=null;window._khAdminEverOk=false;
    window._khNoteAdminStatus(200);                 /* e.g. the moderator list */
    out.afterRealSuccess=window._adminServerOk;
    window.fetch=async u=>/rpc/.test(String(u))
      ? new Response('nope',{status:500})
      : real.apply(window,arguments);
    out.survivesBadProbe=await window._khAdminServerOk(true);

    window.fetch=real;
    window._adminServerOk=null;window._khAdminEverOk=false;
    return out;
  });
  ok('a 404 leaves the verdict unknown, not refused',   tri.on404===null, JSON.stringify(tri));
  ok('a dropped connection leaves it unknown too',      tri.onNetwork===null, JSON.stringify(tri));
  ok('...but a 403 really is a refusal',                tri.on403===false, JSON.stringify(tri));
  ok('an admin call that worked is recorded as proof',  tri.afterRealSuccess===true, JSON.stringify(tri));
  /* This is the one that mattered: the moderator list had already loaded. */
  ok('...and an inconclusive probe cannot un-prove it', tri.survivesBadProbe===true, JSON.stringify(tri));

  /* The save handler must read all three states. Written as `ok ? a : b` it
     reported every failed CHECK as a refused SECRET. */
  ok('the save handler branches on three states, not two',
     /if\(ok===true\)toast\(/.test(src)&&/else if\(ok===false\)toast\(/.test(src)&&
     !/toast\(ok\?'Admin secret saved and accepted/.test(src));

  ok('no page errors', errs.length===0, errs.slice(0,3).join(' | '));
  await p.close();await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
