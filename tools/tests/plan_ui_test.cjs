const {chromium}=require('/opt/node22/lib/node_modules/playwright');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:420,height:760}});
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  // Stub the worker so no real network is needed; capture what the client sends.
  await p.route('**/stripe/**', async route=>{
    const url=route.request().url();
    let body={};try{body=JSON.parse(route.request().postData()||'{}');}catch(_){}
    if(/\/stripe\/status/.test(url)) return route.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify({tier:'pro',status:'active',interval:'year',current_period_end:Math.floor(Date.now()/1000)+86400*300,manageable:true,enabled:true})});
    if(/\/stripe\/checkout/.test(url)) return route.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify({url:'https://checkout.stripe.com/pay/cs_test_1',_echo:body})});
    if(/\/stripe\/portal/.test(url)) return route.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify({url:'https://billing.stripe.com/p/1'})});
    return route.fulfill({status:404,body:'{}'});
  });
  await p.goto(require('url').pathToFileURL(require('path').resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:15000});

  const r=await p.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const out={};
    const S=window._KH.S;
    S.onboardingDone=true;

    out.apiPresent=['_khPlan','_khPlanName','_khRequirePlan','_khOpenUpgrade','_khOpenManagePlan','_khEntRefresh']
      .filter(k=>typeof window[k]!=='function');

    // signed OUT -> free, and a paid feature is gated
    S.authToken='';S.entitlement=null;
    out.signedOutPlan=window._khPlan();

    // signed in, no entitlement -> still free
    S.authToken='a'.repeat(64);
    out.noEntPlan=window._khPlan();
    out.gateBlocksFree=window._khRequirePlan('pro','Test feature')===false;
    await sleep(150);
    // the gate should have opened the upgrade sheet
    out.gateOpenedSheet=!!document.getElementById('kh-upgrade');
    const sheet=document.getElementById('kh-upgrade');
    if(sheet){
      const txt=sheet.textContent||'';
      out.sheetHasAllPlans=['KindleHub +','KindleHub Pro','KindleHub Max'].every(n=>txt.indexOf(n)>=0);
      out.sheetHasMonthly=txt.indexOf('Monthly')>=0;
      out.sheetHasYearly=txt.indexOf('Yearly')>=0;
      out.sheetWarnsAboutKindle=/phone or computer/i.test(txt);
      out.sheetSaysStripe=/Stripe/.test(txt);
      out.monthPrices=['£0.99','£3.99','£7.99'].every(x=>txt.indexOf(x)>=0);
      // flip to yearly -> yearly prices show
      const ybtn=[...sheet.querySelectorAll('button')].find(x=>/Yearly/.test(x.textContent));
      if(ybtn){ybtn.click();await sleep(120);
        const t2=sheet.textContent||'';
        out.yearPrices=['£9.99','£39.99','£79.99'].every(x=>t2.indexOf(x)>=0);}
      // click a Choose button -> should POST checkout with the right tier+interval
      window.__opened='';
      // Return a truthy fake window: the real code falls back to same-tab
      // location.href when window.open is blocked, which would navigate the test.
      window._khOpenExt=function(u){window.__opened=String(u);return {stub:1};};
      // Checkout now asks "you're signed in as X — continue?" first. Capture the
      // prompt text and auto-accept so the rest of the flow still runs.
      window.__confirmText='';
      window.kindleConfirm=function(msg,cb){window.__confirmText=String(msg||'');if(cb)cb(true);return Promise.resolve(true);};
      const choose=[...sheet.querySelectorAll('button')].find(x=>/Choose KindleHub Max/.test(x.textContent));
      if(choose){choose.click();await sleep(700);}
      out.checkoutOpened=String(window.__opened||'');
      out.confirmText=String(window.__confirmText||'');
    }
    // Already on a paid plan -> Choose must route to the PORTAL, never a second
    // checkout (the double-billing guard).
    S.entitlement={tier:'max',status:'active',until:Date.now()+86400000};
    window.__opened='';
    window._khOpenUpgrade('');
    await sleep(150);
    const sheet2=document.getElementById('kh-upgrade');
    if(sheet2){
      const choosePro=[...sheet2.querySelectorAll('button')].find(x=>/Choose KindleHub Pro/.test(x.textContent));
      if(choosePro){choosePro.click();await sleep(700);}
    }
    out.subscribedRoutesToPortal=/billing\.stripe\.com/.test(String(window.__opened||''));
    const shX=document.getElementById('kh-upgrade');if(shX)shX.remove();
    S.entitlement=null;
    // entitlement refresh -> server says pro/year
    const ent=await window._khEntRefresh();
    out.refreshedTier=ent&&ent.tier;
    out.planAfterRefresh=window._khPlan();
    out.planName=window._khPlanName(window._khPlan());
    out.proPassesProGate=window._khRequirePlan('pro','x')===true;
    out.proFailsMaxGate=window._khRequirePlan('max','x')===false;
    /* CHECKOUT INTEGRITY: whatever plan the admin is PREVIEWING must never
       change what checkout actually buys. Previewing as free and then choosing
       Max has to send tier=max — a preview is a view, not a purchase. */
    S.entitlement=null;
    window._isAdminCached=true;
    let sentBody=null;
    const _origFetch=window.fetch;
    window.fetch=function(u,o){
      if(/\/stripe\/checkout/.test(String(u))){try{sentBody=JSON.parse((o&&o.body)||'{}');}catch(_){}}
      return _origFetch.apply(this,arguments);
    };
    if(typeof window._khPlanPreviewSet==='function')window._khPlanPreviewSet('free');
    await sleep(120);
    window.__opened='';
    window._khOpenUpgrade('');
    await sleep(200);
    const sh3=document.getElementById('kh-upgrade');
    if(sh3){
      const yb=[...sh3.querySelectorAll('button')].find(x=>/Yearly/.test(x.textContent));
      if(yb){yb.click();await sleep(100);}
      const cm=[...sh3.querySelectorAll('button')].find(x=>/Choose KindleHub Max/.test(x.textContent));
      if(cm){cm.click();await sleep(700);}
    }
    out.checkoutTierIsMax=!!(sentBody&&sentBody.tier==='max');
    out.checkoutIntervalIsYear=!!(sentBody&&sentBody.interval==='year');
    out.checkoutSendsRealHash=!!(sentBody&&sentBody.hash===S.authToken);
    window.fetch=_origFetch;
    if(typeof window._khPlanPreviewSet==='function')window._khPlanPreviewSet('');
    const shY=document.getElementById('kh-upgrade');if(shY)shY.remove();
    window._isAdminCached=false;
    await sleep(120);

    // expired entitlement must NOT keep unlocking
    S.entitlement={tier:'max',status:'active',until:Date.now()-1000};
    out.expiredFallsToFree=window._khPlan()==='free';
    // a cancelled sub is not active
    S.entitlement={tier:'max',status:'past_due',until:Date.now()+86400000};
    out.pastDueNotHonoured=window._khPlan()==='free';
    return out;
  });
  console.log(JSON.stringify(r,null,1));
  const ok = r.apiPresent.length===0 && r.signedOutPlan==='free' && r.noEntPlan==='free' &&
    r.gateBlocksFree && r.gateOpenedSheet && r.sheetHasAllPlans && r.sheetHasMonthly && r.sheetHasYearly &&
    r.sheetWarnsAboutKindle && r.sheetSaysStripe && r.monthPrices && r.yearPrices &&
    /checkout\.stripe\.com/.test(r.checkoutOpened) && /signed in as/i.test(r.confirmText||'') &&
    r.subscribedRoutesToPortal && r.refreshedTier==='pro' && r.planAfterRefresh==='pro' &&
    r.proPassesProGate && r.proFailsMaxGate && r.expiredFallsToFree && r.pastDueNotHonoured &&
    r.checkoutTierIsMax && r.checkoutIntervalIsYear && r.checkoutSendsRealHash && errs.length===0;
  console.log(ok?'PASS: plan UI, gating, checkout and entitlement all behave':'FAIL');
  console.log('ERRORS:',errs.length?errs.slice(0,3):'none');
  await b.close();
  process.exit(ok?0:1);
})();
