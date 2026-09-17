/* "The more you use it, the slower it gets until the Kindle freezes and needs a
   restart — especially in OS mode."

   That is a memory leak with a linear growth rate, and the way to find which one
   is to instrument the handle-creating APIs before boot and see what climbs with
   use rather than settling. The culprit was a MutationObserver created for every
   enhanced <select> that was NEVER disconnected: each one pins its (soon
   detached) subtree so the DOM can't be collected, and fires its callback on
   every future mutation. KindleOS churns view builds on each app open/close, so
   it leaked fastest there — matching the report exactly.

   Silk's WebView has ~256 MB. Dozens of live subtree observers plus the DOM they
   pin is what eventually froze it. This asserts the observers do NOT accumulate:
   a handful of long-lived global ones is fine, linear growth with navigation is
   the bug.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tools/tests/memleak_test.cjs */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url'),fs=require('fs');

let pass=0,fail=0;
const ok=(n,c,extra)=>{
  if(c){pass++;console.log('PASS '+n);}
  else{fail++;console.log('FAIL '+n+(extra!==undefined?('  -- '+String(extra).slice(0,200)):''));}
};

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:600,height:800}});
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));

  /* Count live handles: net of created minus disconnected/cleared. A leak only
     ever goes up. Installed BEFORE the app boots. */
  await p.addInitScript(()=>{
    const C={mo:0,ro:0,si:0};window.__leak=C;
    if(window.MutationObserver){const MO=window.MutationObserver;window.MutationObserver=function(cb){C.mo++;const o=new MO(cb);const d=o.disconnect.bind(o);o.disconnect=function(){C.mo--;return d();};return o;};}
    if(window.ResizeObserver){const RO=window.ResizeObserver;window.ResizeObserver=function(cb){C.ro++;const o=new RO(cb);const d=o.disconnect.bind(o);o.disconnect=function(){C.ro--;return d();};return o;};}
    const _si=window.setInterval,_ci=window.clearInterval,live=new Set();
    window.setInterval=function(){const id=_si.apply(this,arguments);live.add(id);C.si=live.size;return id;};
    window.clearInterval=function(id){live.delete(id);C.si=live.size;return _ci.apply(this,arguments);};
  });

  await p.goto(url.pathToFileURL(path.resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:20000});
  await p.evaluate(()=>{window._KH.S.onboardingDone=true;});
  await new Promise(r=>setTimeout(r,700));

  const read=()=>p.evaluate(()=>JSON.parse(JSON.stringify(window.__leak)));
  const base=await read();

  /* Views with <select> elements are the ones that used to leak — settings,
     weather, tools especially. Five laps so a leak of ~1/nav would be obvious. */
  const views=['home','games','reading','notes','calendar','settings','weather','tools','draw'];
  for(let lap=0;lap<5;lap++)for(const v of views){
    await p.evaluate(id=>{try{window.showView(id);}catch(e){}},v);
    await new Promise(r=>setTimeout(r,60));
  }
  const afterNav=await read();

  /* KindleOS open/close — the user's "especially in OS mode". */
  await p.evaluate(()=>{try{if(window.launchKindleDesktop)window.launchKindleDesktop();}catch(e){}});
  await new Promise(r=>setTimeout(r,500));
  const osApps=['notes','calendar','weather','games','tools','settings'];
  for(let lap=0;lap<6;lap++)for(const a of osApps){
    await p.evaluate(id=>{try{if(window.openApp)window.openApp({nav:id,id:id,name:id});else window.showView(id);}catch(e){}},a);
    await new Promise(r=>setTimeout(r,55));
    await p.evaluate(()=>{try{if(window.closeApp)window.closeApp();}catch(e){}});
    await new Promise(r=>setTimeout(r,45));
  }
  const afterOS=await read();

  console.log('MutationObservers  boot '+base.mo+'  → 45 navs '+afterNav.mo+'  → +36 OS cycles '+afterOS.mo);
  console.log('setInterval        boot '+base.si+'  → 45 navs '+afterNav.si+'  → +36 OS cycles '+afterOS.si);
  console.log('ResizeObserver     boot '+base.ro+'  → 45 navs '+afterNav.ro+'  → +36 OS cycles '+afterOS.ro);

  /* Before the fix this grew ~1 per navigation: 45 navs → +30, plus OS churn.
     A few is normal (transient overlays, the one global select watcher); dozens
     is the leak. The gate is generous — anything under ~10 total growth across
     81 view builds is clearly bounded, not linear. */
  const moGrowth=afterOS.mo-base.mo;
  ok('MutationObservers do not accumulate with navigation', moGrowth<=10, moGrowth+' new over 81 view builds');
  ok('...and specifically not across KindleOS open/close', afterOS.mo-afterNav.mo<=6, (afterOS.mo-afterNav.mo)+' over 36 OS cycles');
  ok('background intervals stay bounded too', afterOS.si-base.si<=4, (afterOS.si-base.si)+' new intervals');
  ok('ResizeObservers stay bounded', afterOS.ro-base.ro<=6, (afterOS.ro-base.ro)+' new');
  ok('no page errors during the churn', errs.length===0, errs.slice(0,3).join(' | '));

  await p.close();await b.close();

  const src=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
  ok('the per-select observer that leaked is gone',
     !/const obs=new MutationObserver\(syncLabel\);/.test(src));
  ok('...replaced by a label stashed for the single global re-sync',
     /sel\._khSyncLabel=syncLabel;/.test(src));
  ok('the global select watcher re-syncs in-DOM labels instead',
     /select\[data-kh-selected\]/.test(src) && /_khSyncLabel/.test(src));

  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
