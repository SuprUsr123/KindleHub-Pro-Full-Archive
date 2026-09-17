const {chromium}=require('/opt/node22/lib/node_modules/playwright');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:900,height:760}});
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(require('url').pathToFileURL(require('path').resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:15000});
  const r=await p.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const out={};const S=window._KH.S;
    S.onboardingDone=true;
    try{localStorage.removeItem('kh_tour_seen');}catch(e){}
    S.tutorialSeen=false;
    out.seenBefore=!!(window._khTourSeen&&window._khTourSeen());
    window._showTutorial();await sleep(400);
    out.opened=!!document.querySelector('#tourSkip');
    // "N of M" counter tells us the real length
    const m=(document.body.textContent||'').match(/(\d+)\s+of\s+(\d+)/);
    out.totalSteps=m?parseInt(m[2],10):-1;
    out.noFreeMaxClaim=!/No payment, ever|unlock Max automatically/i.test(document.body.textContent);
    // close with the X -> must mark seen durably
    document.getElementById('tourSkip').click();await sleep(200);
    out.seenFlag=(()=>{try{return localStorage.getItem('kh_tour_seen');}catch(e){return null;}})();
    // simulate a cloud pull resetting S.tutorialSeen (the real repeat bug)
    S.tutorialSeen=false;
    out.stillSeenAfterSyncWipe=!!(window._khTourSeen&&window._khTourSeen());
    return out;
  });
  console.log(JSON.stringify(r,null,1));
  const ok=r.opened&&r.totalSteps>0&&r.totalSteps<=8&&r.noFreeMaxClaim&&
           r.seenFlag==='1'&&r.stillSeenAfterSyncWipe&&!r.seenBefore&&errs.length===0;
  console.log(ok?'PASS: '+r.totalSteps+'-step tour, no false Max claim, X marks it seen, survives a sync wipe':'FAIL');
  console.log('ERRORS:',errs.length?errs.slice(0,3):'none');
  await b.close();process.exit(ok?0:1);
})();
