/* KindleOS mode: surfaces raised from the LAUNCHER must actually be visible.
   The launcher (#kd-root) is a full-screen fixed layer at z-index 500000 that
   is hidden whenever a built-in app opens — so anything reached through an app
   was always fine, and anything raised from the launcher itself was painted
   behind it and looked like it had vanished. */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url'),fs=require('fs');

const KD_Z=500000;

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:618,height:716}});
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:20000});

  const r=await p.evaluate(async(KD_Z)=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const out={};const S=window._KH.S;S.onboardingDone=true;
    try{localStorage.setItem('kh_os_unlocked','1');}catch(e){}
    /* Find the notification tray by its own text, not by a z-index that is the
       very thing under test. */
    const findTray=()=>{
      const all=Array.prototype.slice.call(document.querySelectorAll('body div, #rotateRoot div'));
      const panel=all.filter(d=>/Notifications/.test(d.textContent||'')&&/Clear all/.test(d.textContent||'')
        &&getComputedStyle(d).position==='fixed')[0];
      return panel||null;
    };
    const z=el=>el?parseInt(getComputedStyle(el).zIndex,10)||0:0;

    /* ── 1. NORMAL app mode: the tray keeps its ordinary app-shell layer, so it
           does not float above every dialog. ── */
    try{window._khPushNotif&&window._khPushNotif({icon:'bell',title:'Test',body:'Hello'});}catch(e){}
    await sleep(300);
    try{window._khOpenNotifs&&window._khOpenNotifs();}catch(e){}
    await sleep(400);
    let tray=findTray();
    out.trayFoundInApp=!!tray;
    out.trayZInApp=z(tray);
    out.trayNotHoggingInApp=(out.trayZInApp>0&&out.trayZInApp<KD_Z);
    /* close it again */
    try{window._khCloseNotifs&&window._khCloseNotifs();}catch(e){}
    const bd=document.querySelector('div[style*="rgba(0, 0, 0, 0.28)"],div[style*="rgba(0,0,0,.28)"]');
    if(bd)bd.click();
    await sleep(300);

    /* ── 2. KindleOS launcher: the tray must rise ABOVE it. ── */
    window.launchKindleDesktop();
    await sleep(1200);
    out.osHome=!!document.getElementById('kd-root');
    out.osHomeReported=(typeof window._khOsHome==='function')&&window._khOsHome();
    try{window._khOpenNotifs&&window._khOpenNotifs();}catch(e){}
    await sleep(450);
    tray=findTray();
    out.trayFoundInOs=!!tray;
    out.trayZInOs=z(tray);
    out.trayAboveOs=(out.trayZInOs>KD_Z);
    /* and it must really be the thing you touch, not merely a big number */
    if(tray){
      const rr=tray.getBoundingClientRect();
      const hit=document.elementFromPoint(Math.round(rr.left+rr.width/2),Math.round(rr.top+14));
      let n=hit,inside=false;while(n){if(n===tray){inside=true;break;}n=n.parentElement;}
      out.trayIsTopmostInOs=inside;
    }
    if(bd)bd.click();
    await sleep(250);

    /* ── 3. Storage banner: app-shell chrome, mounted so landscape rotates it,
           and kept off the launcher where it lands on the dock. ── */
    try{window._checkStorageHealth&&window._checkStorageHealth(true);}catch(e){}
    await sleep(300);
    const ban=document.getElementById('kh-storage-banner');
    out.bannerExists=!!ban;
    if(ban){
      out.bannerParent=ban.parentElement?(ban.parentElement.id||ban.parentElement.tagName):'?';
      out.bannerInRotateRoot=(out.bannerParent==='rotateRoot');
      out.bannerHiddenOnOsHome=(getComputedStyle(ban).display==='none');
    }

    /* ── 4. Leaving the launcher brings the banner back. Driven through the
           real Control Centre button rather than an internal, so the test
           exercises the path a user actually takes. ── */
    const exitBtn=Array.prototype.filter.call(document.querySelectorAll('#kd-root button'),
      x=>(x.textContent||'').trim()==='Exit KindleOS')[0];
    out.exitBtnFound=!!exitBtn;
    if(exitBtn)exitBtn.click();
    await sleep(900);
    out.leftOs=!document.getElementById('kd-root')||document.getElementById('kd-root').style.display==='none';
    try{window._checkStorageHealth&&window._checkStorageHealth(true);}catch(e){}
    await sleep(300);
    const ban2=document.getElementById('kh-storage-banner');
    out.bannerBackInApp=!!ban2&&getComputedStyle(ban2).display!=='none';
    return out;
  },KD_Z);

  /* The launcher tip used to be a 180-character toast that wrapped across the
     middle of whatever dialog was open. */
  const src=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
  const tip=(src.match(/toast\('Tip: long-press[^']*'/)||[''])[0];
  r.tipLength=tip.length;
  r.tipIsShort=(tip.length>0&&tip.length<90);
  r.tipChecksForDialog=/querySelector\('#kh-upgrade,#kh-dashboard,#kh-launcher,#kh-dash-picker'\)/.test(src);
  r.osHelperExists=/function _khOsHome\(\)/.test(src);

  console.log(JSON.stringify(r,null,1));
  let ok=r.trayFoundInApp&&r.trayNotHoggingInApp&&
    r.osHome&&r.osHomeReported&&r.trayFoundInOs&&r.trayAboveOs&&r.trayIsTopmostInOs&&
    r.bannerExists&&r.bannerInRotateRoot&&r.bannerHiddenOnOsHome&&
    r.leftOs&&r.bannerBackInApp&&
    r.tipIsShort&&r.tipChecksForDialog&&r.osHelperExists&&
    errs.length===0;
  /* ── the Control Centre must be opaque ──
     It sits over the live home screen, and was a translucent gradient under a
     56px blurred shadow. Old Silk composites that badly: the panel painted and
     the alpha regions did not, so the Control Centre came up half-drawn with
     the desktop showing through a white band. A flat fill has nothing to
     composite — it either draws or it does not. */
  const ccSrc=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
  const ccPanel=(ccSrc.match(/kdCC\.style\.cssText='([^']*)'/)||['',''])[1];
  const ccDim=(ccSrc.match(/kdCCDim\.style\.cssText='([^']*)'/)||['',''])[1];
  const ccOpaque = ccPanel.indexOf('rgba')<0 && ccPanel.indexOf('gradient')<0;
  const ccNoBlur = ccPanel.indexOf('box-shadow')<0;
  const dimOpaque = ccDim.indexOf('rgba')<0;
  /* A dozen tiles each animating a background is a dozen partial refreshes on a
     screen that repaints in whole frames. */
  const tilesNotAnimated = !/min-height:72px[^']*transition:/.test(ccSrc);
  console.log(JSON.stringify({ccOpaque,ccNoBlur,dimOpaque,tilesNotAnimated}));
  ok = ok && ccOpaque && ccNoBlur && dimOpaque && tilesNotAnimated;

  console.log(ok?'PASS: launcher-raised surfaces are visible in KindleOS, app chrome stays out of it':'FAIL');

  console.log('ERRORS:',errs.length?errs.slice(0,3):'none');
  await b.close();
  process.exit(ok?0:1);
})();
