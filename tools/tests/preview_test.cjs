const {chromium}=require('/opt/node22/lib/node_modules/playwright');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:420,height:760}});
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(require('url').pathToFileURL(require('path').resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:15000});
  const r=await p.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const out={};const S=window._KH.S;
    S.onboardingDone=true;S.authToken='a'.repeat(64);S.entitlement=null;

    // NON-admin must not be able to use it
    window._isAdminCached=false;S.planPreview='max';
    out.nonAdminIgnored=window._khPlan()!=='max';
    window._khPlanPreviewSet('pro');
    out.nonAdminCannotSet=(S.planPreview!=='pro');
    S.planPreview='';

    // admin
    window._isAdminCached=true;
    out.adminBase=window._khPlan();                 // creator
    window._khPlanPreviewSet('free');
    out.asFree=window._khPlan();
    out.legacyTierAsFree=window._khTier();          // 'pro' == free baseline
    out.freeIsGatedOutOfPro=window._khRequirePlan('pro','x')===false;
    // close the upgrade sheet the gate opened
    const sh=document.getElementById('kh-upgrade');if(sh)sh.remove();
    await sleep(120);
    /* The floating preview pill was REMOVED — it covered the app during exactly
       the moments you are trying to look at the app. Assert it never appears. */
    out.noBanner=!document.getElementById('kh-plan-preview');

    window._khPlanPreviewSet('max');
    out.asMax=window._khPlan();
    out.legacyTierAsMax=window._khTier();
    out.maxPassesMaxGate=window._khRequirePlan('max','x')===true;

    window._khPlanPreviewSet('plus');
    out.asPlus=window._khPlan();
    out.plusBlockedFromPro=window._khRequirePlan('pro','x')===false;
    const sh2=document.getElementById('kh-upgrade');if(sh2)sh2.remove();

    // exit the way the UI now offers: the Settings card's "Off (real plan)"
    window._khPlanPreviewSet('');
    await sleep(150);
    out.afterExitPlan=window._khPlan();             // back to creator
    out.stillNoBanner=!document.getElementById('kh-plan-preview');

    // the settings card exists for admin only
    out.cardForAdmin=(function(){try{return !!window._khBuildPlanPreviewCard();}catch(e){return false;}})();

    // Regression: switching preview must REBUILD the page, not just the banner.
    // Previously only kh-tier-changed fired, so the banner said "Previewing as
    // Max" while everything on screen was still rendered for the old plan.
    out.rerenderExposed=(typeof window._khRerenderCurrentView==='function');
    window.__rerendered=0;
    if(out.rerenderExposed){
      const _orig=window._khRerenderCurrentView;
      window._khRerenderCurrentView=function(){window.__rerendered++;return _orig.apply(this,arguments);};
    }
    window._khPlanPreviewSet('max');
    await sleep(200);
    out.rerenderCalled=window.__rerendered>0;
    out.planIsMaxAfterRerender=window._khPlan()==='max';
    window._khPlanPreviewSet('');
    await sleep(150);
    const shZ=document.getElementById('kh-upgrade');if(shZ)shZ.remove();
    return out;
  });
  console.log(JSON.stringify(r,null,1));
  const ok = r.nonAdminIgnored && r.nonAdminCannotSet && r.adminBase==='creator' &&
    r.asFree==='free' && r.legacyTierAsFree==='free' && r.freeIsGatedOutOfPro &&
    r.noBanner &&
    r.asMax==='max' && r.legacyTierAsMax==='max' && r.maxPassesMaxGate &&
    r.asPlus==='plus' && r.plusBlockedFromPro &&
    r.afterExitPlan==='creator' && r.stillNoBanner && r.cardForAdmin &&
    r.rerenderExposed && r.rerenderCalled && r.planIsMaxAfterRerender && errs.length===0;
  console.log(ok?'PASS: admin can preview every plan; non-admin cannot; exits cleanly':'FAIL');
  console.log('ERRORS:',errs.length?errs.slice(0,3):'none');
  await b.close();
  process.exit(ok?0:1);
})();
