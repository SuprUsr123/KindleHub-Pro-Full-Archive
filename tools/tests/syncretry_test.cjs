/* "Sometimes things don't register."

   The scheduled push had two bare `return`s in it: one when the page was
   hidden, one when the radio was off. Both left _stateDirty true and NO timer
   holding the work, so the edit sat there until some unrelated event happened
   to schedule another push. On a Kindle the screen sleeps constantly and the
   radio comes and goes, so that was the common case rather than the rare one.

   What this pins is that a push which cannot run RIGHT NOW is still pending
   afterwards, and that waking up pushes before it pulls — otherwise the first
   thing a device does on waking is merge an older cloud copy against a newer
   local edit.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tools/tests/syncretry_test.cjs */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url'),fs=require('fs');

let pass=0,fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x!==undefined&&!c?'  -- '+String(x).slice(0,240):''));};

(async()=>{
  const src=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');

  /* Source-level, because the bug was the ABSENCE of a reschedule and the
     easiest way to reintroduce it is to write `return` again. */
  ok('a hidden page re-arms the push instead of dropping it',
     /if\(document\.hidden&&!force\)\{\s*_syncTimer=setTimeout\(function\(\)\{_syncTimer=null;scheduleCloudSync\(false\);\},_SYNC_RETRY_MS\);\s*return;\s*\}/.test(src));
  ok('an offline device re-arms it too',
     /if\(navigator\.onLine===false\)\{\s*_syncTimer=setTimeout\(function\(\)\{_syncTimer=null;scheduleCloudSync\(false\);\},_SYNC_RETRY_MS\);\s*return;\s*\}/.test(src));
  ok('the retry gap is long enough not to spin on a sleeping Kindle',
     /const _SYNC_RETRY_MS=(\d+);/.test(src) && Number((/const _SYNC_RETRY_MS=(\d+);/.exec(src)||[])[1])>=30000,
     (/const _SYNC_RETRY_MS=(\d+);/.exec(src)||[])[1]);
  ok('coming back pushes pending edits BEFORE pulling',
     /if\(_stateDirty\)\{try\{scheduleCloudSync\(true\);\}catch\(_\)\{\}\}\s*\n\s*_maybePullFromCloud\(\);/.test(src));
  ok('there is a post-load sync, bounded to the first few loads of a session',
     /_POST_LOAD_SYNC_TIMES=3/.test(src) && /sessionStorage\.getItem\('kh_postload_sync'\)/.test(src));
  ok('...five seconds after the load, as asked',
     /const _POST_LOAD_SYNC_MS=5000;/.test(src));
  ok('the post-load sync respects a Cloudflare limit rather than hammering it',
     /_khPostLoadSync[\s\S]{0,900}_khCfBlocked\(true\)/.test(src));

  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:600,height:800}});
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:20000});

  const r=await p.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const out={};
    out.hasPostLoad=typeof window._khPostLoadSync==='function';
    /* The post-load sync must stop after a few loads rather than firing on
       every single one forever. */
    try{sessionStorage.removeItem('kh_postload_sync');}catch(_){}
    const S=window._KH.S; S.authToken='e'.repeat(64); S.syncEnabled=true;
    let fired=0;
    for(let i=0;i<6;i++){ window._khPostLoadSync(); }
    try{ fired=parseInt(sessionStorage.getItem('kh_postload_sync')||'0',10); }catch(_){}
    out.armedTimes=fired;
    /* signed out: it must not arm at all */
    try{sessionStorage.removeItem('kh_postload_sync');}catch(_){}
    S.authToken='';
    window._khPostLoadSync();
    let signedOut=0;
    try{ signedOut=parseInt(sessionStorage.getItem('kh_postload_sync')||'0',10); }catch(_){}
    out.signedOutArmed=signedOut;
    S.authToken='e'.repeat(64);
    return out;
  });

  ok('the post-load sync is exposed',            r.hasPostLoad);
  ok('...and stops after three loads, not every load forever', r.armedTimes===3, 'armed '+r.armedTimes);
  ok('...and does nothing at all when signed out', r.signedOutArmed===0, 'armed '+r.signedOutArmed);
  ok('no page errors', errs.length===0, errs.slice(0,3).join(' | '));

  await p.close();await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
