/* Notification tray layering across SHELL + ORIENTATION changes (task #131).
   The tray's layer/parent was only recomputed on a notification push, never when
   the shell or orientation changed, so:
     - landscape + KindleOS: the tray was trapped inside #rotateRoot's
       transform:rotate(90deg) and could not rise above the launcher (the
       persistent "Notification Center vanished in OS mode");
     - entering KindleOS with an existing notification left the handle behind the
       launcher until the next push;
     - returning to an app left the handle floating over app dialogs.
   Fix: re-parent + re-stack the tray at show time and on every shell/orientation
   change (document.body on the OS home to escape the transform trap; #rotateRoot
   in app).

   Run: NODE_PATH=/opt/node22/lib/node_modules node tools/tests/notiflayer_test.cjs */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url'),fs=require('fs');
const KD_Z=500000;
let pass=0,fail=0;
const ok=(n,c,extra)=>{if(c){pass++;console.log('PASS '+n);}else{fail++;console.log('FAIL '+n+(extra!==undefined?('  -- '+String(extra).slice(0,200)):''));}};

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:600,height:800}});/* portrait, so landscape rotation engages */
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:20000});

  const r=await p.evaluate(async(KD_Z)=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const out={};const S=window._KH.S;S.onboardingDone=true;
    try{localStorage.setItem('kh_os_unlocked','1');}catch(e){}
    const findPanel=()=>Array.prototype.slice.call(document.querySelectorAll('body div,#rotateRoot div'))
      .filter(d=>/Notifications/.test(d.textContent||'')&&/Clear all/.test(d.textContent||'')&&getComputedStyle(d).position==='fixed')[0]||null;
    const findHandle=()=>{
      /* the handle carries an inline SVG chevron and is display:flex when there are notifs */
      const all=Array.prototype.slice.call(document.querySelectorAll('body>div,#rotateRoot>div,#kd-root div'));
      return all.filter(d=>getComputedStyle(d).position==='fixed'&&d.querySelector&&d.querySelector('svg polyline')&&getComputedStyle(d).display!=='none'&&d.getBoundingClientRect().height<40)[0]||null;
    };
    /* Node.contains (not a parentElement walk — that skips SVG namespaced nodes,
       and the handle's hit target is its inline <svg> chevron). */
    const hitInside=(elm,x,y)=>{var h=document.elementFromPoint(Math.round(x),Math.round(y));return{inside:!!(h&&(h===elm||elm.contains(h))),hitKd:!!(h&&h.closest&&h.closest('#kd-root'))};};

    /* ── Defect 1: LANDSCAPE + KindleOS — the tray must be reachable, not trapped. ── */
    try{window.toggleLandscape&&window.toggleLandscape(true);}catch(e){out.landErr=String(e);}
    await sleep(150);
    out.isLandscape=!!(S.landscapeMode);
    window.launchKindleDesktop();
    await sleep(1200);
    out.osHome1=(typeof window._khOsHome==='function')&&window._khOsHome();
    try{window._khPushNotif&&window._khPushNotif({icon:'bell',title:'L',body:'landscape'});}catch(e){}
    await sleep(250);
    try{window._khOpenNotifs&&window._khOpenNotifs();}catch(e){}
    await sleep(450);
    let panel=findPanel();
    out.panelFoundLand=!!panel;
    if(panel){
      const rr=panel.getBoundingClientRect();
      const t=hitInside(panel,rr.left+rr.width/2,rr.top+14);
      out.panelReachableLand=t.inside;       /* want true (was false: trapped) */
      out.panelHitKdLand=t.hitKd;            /* want false */
      out.panelZLand=parseInt(getComputedStyle(panel).zIndex,10)||0;
      out.panelParentLand=panel.parentElement===document.body?'body':(panel.parentElement&&panel.parentElement.id||'?');
    }
    /* close the tray, then leave landscape + OS to reset */
    try{window._khCloseNotifs&&window._khCloseNotifs();}catch(e){}
    await sleep(300);
    const exit1=Array.prototype.filter.call(document.querySelectorAll('#kd-root button'),x=>(x.textContent||'').trim()==='Exit KindleOS')[0];
    if(exit1)exit1.click();
    await sleep(800);
    try{window.toggleLandscape&&window.toggleLandscape(false);}catch(e){}
    await sleep(200);

    /* ── Defect 2: PORTRAIT — enter KindleOS with an existing notif; the HANDLE
          (not just the opened panel) must be reachable, without opening it. ── */
    window._khNotifs=[];
    try{window._khPushNotif&&window._khPushNotif({icon:'chat',title:'P',body:'portrait'});}catch(e){}
    await sleep(250);
    window.launchKindleDesktop();
    await sleep(1200);
    out.osHome2=(typeof window._khOsHome==='function')&&window._khOsHome();
    let handle=findHandle();
    out.handleFoundOs=!!handle;
    if(handle){
      out.handleZOs=parseInt(getComputedStyle(handle).zIndex,10)||0;
      out.handleAboveKd=out.handleZOs>KD_Z;                 /* want true */
      const hr=handle.getBoundingClientRect();
      const t=hitInside(handle,hr.left+hr.width/2,hr.top+hr.height/2);
      out.handleReachableOs=t.inside;                        /* want true (was behind kd-root) */
    }

    /* ── Defect 3: leave KindleOS — the handle must drop BELOW the app-modal layer
          so it can't float over dialogs. ── */
    const exit2=Array.prototype.filter.call(document.querySelectorAll('#kd-root button'),x=>(x.textContent||'').trim()==='Exit KindleOS')[0];
    if(exit2)exit2.click();
    await sleep(900);
    out.leftOs=!document.getElementById('kd-root');
    handle=findHandle();
    out.handleFoundApp=!!handle;
    if(handle){
      out.handleZApp=parseInt(getComputedStyle(handle).zIndex,10)||0;
      out.handleBelowModalApp=out.handleZApp<100050&&out.handleZApp>0;   /* app modals sit at ~100050 */
      out.handleParentApp=handle.parentElement===document.body?'body':(handle.parentElement&&handle.parentElement.id||'?');
    }
    return out;
  },KD_Z);

  console.log(JSON.stringify(r,null,1));
  ok('landscape rotation engaged', r.isLandscape, 'landErr='+r.landErr);
  ok('KindleOS home reached (landscape)', r.osHome1);
  ok('Defect 1: the tray panel is REACHABLE in landscape KindleOS (not trapped)', r.panelFoundLand&&r.panelReachableLand, 'reachable='+r.panelReachableLand+' hitKd='+r.panelHitKdLand);
  ok('Defect 1: it is mounted on body (escapes the #rotateRoot transform)', r.panelParentLand==='body', r.panelParentLand);
  ok('Defect 2: the HANDLE is above the launcher on OS entry', r.handleFoundOs&&r.handleAboveKd, 'z='+r.handleZOs);
  ok('Defect 2: the handle is actually the element you touch (not behind kd-root)', r.handleReachableOs, 'reachable='+r.handleReachableOs);
  ok('Defect 3: back in the app the handle drops below the modal layer', r.handleFoundApp&&r.handleBelowModalApp, 'z='+r.handleZApp);
  ok('no page errors', errs.length===0, errs.slice(0,4).join(' | '));

  await p.close();await b.close();

  const src=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
  ok('the tray re-parents by shell (body on OS home)', /var host=\(os&&document\.body\)\|\|_overlayHost\(\);/.test(src));
  ok('a sync hook is exported', /window\._khNotifSyncLayer=function/.test(src));
  ok('resize re-syncs the tray layer (landscape toggle + rotation)', /addEventListener\('resize',function\(\)\{try\{window\._khNotifSyncLayer/.test(src));
  const hooks=(src.match(/window\._khNotifSyncLayer\(\)/g)||[]).length;
  ok('shell transitions call the sync hook (enter/exit/open/close/unlock)', hooks>=5, 'callsites='+hooks);

  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
