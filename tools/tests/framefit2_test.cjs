const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url');
let pass=0,fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x!==undefined&&!c?'  -- '+String(x).slice(0,200):''));};
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await(await b.newContext({viewport:{width:600,height:800}})).newPage();
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve('index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:30000});

  const fit=await p.evaluate(()=>{
    /* The offsets now move the ARTWORK, not the picture — the picture is fixed
       at the requested size and the artwork is drawn larger, behind it. So
       these read the <img>'s own position instead of a transform on the node. */
    const mk=id=>{const n=document.createElement('div');n.style.width='84px';n.style.height='84px';
      const box=_khWrapFrame(n,id,84);const im=box.querySelector('img');
      const w=im?parseInt(im.style.width,10):0;
      /* centred would be this; anything else is the frame's own offset */
      const centred=Math.round(84/2-w/2);
      return {inner:parseInt(n.style.width,10),art:w,
              top:im?parseInt(im.style.top,10):0, left:im?parseInt(im.style.left,10):0,
              dy:(im?parseInt(im.style.top,10):0)-centred,
              dx:(im?parseInt(im.style.left,10):0)-centred};};
    return {crown:mk('pro_crown'), phoenix:mk('max_phoenix'), book:mk('plus_book'), ring:mk('plus_ring')};
  });
  /* A crown's opening sits BELOW the middle of its artwork, so to line the
     opening up with the face the artwork has to ride UP. Same reasoning as
     before, applied to the other element. */
  ok('a crown rides up, so its flames sit above the face', fit.crown.dy<0, JSON.stringify(fit.crown));
  ok('a frame whose opening is high sits lower', fit.book.dy>0, JSON.stringify(fit.book));
  ok('a symmetrical frame is centred', fit.ring.dy===0&&fit.ring.dx===0, JSON.stringify(fit.ring));
  ok('no frame is shifted sideways — that was a measurement artefact',
     fit.crown.dx===0&&fit.book.dx===0&&fit.phoenix.dx===0, JSON.stringify(fit));
  ok('an ornate frame spreads further than an open one',
     fit.phoenix.art>fit.book.art, 'phoenix '+fit.phoenix.art+' vs book '+fit.book.art);
  ok('every picture is full size, none shrunk into a hole',
     fit.phoenix.inner===84&&fit.book.inner===84&&fit.crown.inner===84, JSON.stringify(fit));

  const locks=await p.evaluate(async()=>{
    S.email='freeuser';S.user='freeuser';S.profileFrame='';
    window._isAdminCached=false;
    delete VIEWS['settings']; showView('settings'); await new Promise(r=>setTimeout(r,900));
    const t=document.body.textContent||'';
    return {allFifteen:(t.match(/Locked/g)||[]).length, hasPhoenix:/Phoenix Ascendant/.test(t)};
  });
  ok('a free reader can SEE every frame, locked', locks.allFifteen>=10, JSON.stringify(locks));
  ok('...including the Max ones, by name', locks.hasPhoenix, JSON.stringify(locks));

  const tip=await p.evaluate(()=>{
    localStorage.removeItem('kh_tip_asked');
    window._khDonateLinks=function(){return [{name:'Ko-fi',url:'https://ko-fi.com/x'}];};
    S.authToken='t';
    _khMaybeOfferTip();
    const shown=/Enjoying KindleHub/.test(document.body.textContent||'');
    /* dismiss, then it must never come back */
    const btns=[].slice.call(document.querySelectorAll('button'));
    const no=btns.filter(x=>x.textContent==='No thanks')[0]; if(no)no.click();
    _khMaybeOfferTip();
    const again=/Enjoying KindleHub/.test(document.body.textContent||'');
    return {shown, again, stamped:!!localStorage.getItem('kh_tip_asked')};
  });
  ok('the tip prompt appears once', tip.shown, JSON.stringify(tip));
  ok('...and never again after it is dismissed', tip.again===false&&tip.stamped, JSON.stringify(tip));

  const noLinks=await p.evaluate(()=>{
    localStorage.removeItem('kh_tip_asked');
    window._khDonateLinks=function(){return [];};
    _khMaybeOfferTip();
    return /Enjoying KindleHub/.test(document.body.textContent||'');
  });
  ok('it stays silent when no tip jar is configured', noLinks===false);
  ok('no page errors', errs.length===0, errs.slice(0,2).join(' | '));
  await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
