const {chromium}=require('/opt/node22/lib/node_modules/playwright');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:900,height:800}});
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(require('url').pathToFileURL(require('path').resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:15000});
  const r=await p.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const out={};const S=window._KH.S;
    S.onboardingDone=true;S.authToken='a'.repeat(64);S.entitlement=null;
    window._isAdminCached=false;
    // FREE user
    out.plan=window._khPlan();
    out.tier=window._khTier();                      // must NOT be 'pro'
    out.tierIsNotPro=(window._khTier()!=='pro');
    window._khUpdateHeaderBadge&&window._khUpdateHeaderBadge();
    await sleep(150);
    const logo=document.querySelector('header .logo');
    out.logoText=logo?logo.textContent.trim():'';
    out.logoDoesNotSayPro=!/Pro/.test(out.logoText);
    const badge=document.getElementById('kh-tier-badge');
    out.badgeHidden=!badge||badge.style.display==='none';
    // free must NOT pass a Max gate
    out.freeBlockedFromMax=(window._khRequireMax('X')===false);
    // now actually Pro
    S.entitlement={tier:'pro',status:'active',until:Date.now()+86400000};
    out.planAsPro=window._khPlan();
    window._khUpdateHeaderBadge();await sleep(120);
    out.logoAsPro=document.querySelector('header .logo').textContent.trim();
    out.proStillBlockedFromMax=(window._khRequireMax('X')===false);
    const sh=document.getElementById('kh-upgrade');if(sh)sh.remove();
    // Max
    S.entitlement={tier:'max',status:'active',until:Date.now()+86400000};
    out.tierAsMax=window._khTier();
    out.maxPassesMaxGate=(window._khRequireMax('X')===true);
    window._khUpdateHeaderBadge();await sleep(120);
    out.badgeAsMax=(document.getElementById('kh-tier-badge')||{}).textContent||'';
    return out;
  });
  console.log(JSON.stringify(r,null,1));
  const ok=r.plan==='free'&&r.tierIsNotPro&&r.logoDoesNotSayPro&&r.badgeHidden&&
    r.freeBlockedFromMax&&r.planAsPro==='pro'&&/Pro/.test(r.logoAsPro)&&
    r.proStillBlockedFromMax&&r.tierAsMax==='max'&&r.maxPassesMaxGate&&
    r.badgeAsMax==='MAX'&&errs.length===0;
  console.log(ok?'PASS: a free account is never shown or treated as Pro':'FAIL');
  console.log('ERRORS:',errs.length?errs.slice(0,3):'none');
  await b.close();process.exit(ok?0:1);
})();
