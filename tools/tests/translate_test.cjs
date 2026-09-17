const {chromium}=require('/opt/node22/lib/node_modules/playwright');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:500,height:800}});
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  // stub the translate API: Portuguese -> English, English -> unchanged
  await p.route('**/translate_a/single*', route=>{
    const u=route.request().url();
    const q=decodeURIComponent((u.match(/[&?]q=([^&]*)/)||[])[1]||'');
    const map={'a minha conta sumiu dnd':'my account disappeared','oi glr br':'hi guys br'};
    const out=map[q.toLowerCase()]||q;             // unknown -> echo (same language)
    route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([[[out,q]]])});
  });
  await p.goto(require('url').pathToFileURL(require('path').resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:15000});
  const r=await p.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const out={};const S=window._KH.S;
    out.defaultOn=(S.chatAutoTranslate!==false);
    out.fnExists=typeof window._khAutoTranslate==='function';
    // foreign message -> translation appended
    const b1=document.createElement('div');document.body.appendChild(b1);
    await window._khAutoTranslate('m1','a minha conta sumiu dnd',b1);
    await sleep(250);
    out.foreignTranslated=!!b1.querySelector('.kh-msg-tr');
    out.foreignText=(b1.querySelector('.kh-msg-tr')||{}).textContent||'';
    // same-language message -> NOTHING appended (self-detecting, no badge on English)
    const b2=document.createElement('div');document.body.appendChild(b2);
    await window._khAutoTranslate('m2','hello how are you',b2);
    await sleep(250);
    out.sameLangUntouched=!b2.querySelector('.kh-msg-tr');
    // cached: second call on same id must not duplicate
    await window._khAutoTranslate('m1','a minha conta sumiu dnd',b1);
    await sleep(150);
    out.noDuplicate=(b1.querySelectorAll('.kh-msg-tr').length===1);
    // media codes skipped
    const b3=document.createElement('div');document.body.appendChild(b3);
    await window._khAutoTranslate('m3','KHSTK1:fire',b3);
    await sleep(150);
    out.mediaSkipped=!b3.querySelector('.kh-msg-tr');
    // toggle off respected
    S.chatAutoTranslate=false;
    const b4=document.createElement('div');document.body.appendChild(b4);
    await window._khAutoTranslate('m4','oi glr br',b4);
    await sleep(200);
    out.offRespected=!b4.querySelector('.kh-msg-tr');
    return out;
  });
  console.log(JSON.stringify(r,null,1));
  const ok=r.defaultOn&&r.fnExists&&r.foreignTranslated&&/account/i.test(r.foreignText)&&
    r.sameLangUntouched&&r.noDuplicate&&r.mediaSkipped&&r.offRespected&&errs.length===0;
  console.log(ok?'PASS: foreign chat auto-translates, same-language left alone, cached, toggleable':'FAIL');
  console.log('ERRORS:',errs.length?errs.slice(0,3):'none');
  await b.close();process.exit(ok?0:1);
})();
