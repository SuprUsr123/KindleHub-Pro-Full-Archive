/* Regression: a physical keyboard must never be suppressed by the on-screen one.
   The KindleHub keyboard sets the target readOnly to stop the native keyboard
   appearing; on a device with real keys that silently DROPS keystrokes, which is
   what ate half of every chat message. Typing must free the field immediately. */
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
    S.onboardingDone=true;
    /* Force the on-screen keyboard ON, the worst case for a desktop browser. */
    S.kindleKeyboardMode='always';
    if(window._khKeyboard&&window._khKeyboard.refresh)window._khKeyboard.refresh();
    await sleep(200);

    const ta=document.createElement('textarea');
    ta.id='kbfix-probe';
    document.body.appendChild(ta);
    ta.focus();
    await sleep(400);                       /* let focusin / the 1.5s net attach */
    out.wentReadOnly=!!ta.readOnly;         /* the suppression we're testing */
    return out;
  });

  /* Now type for real. Playwright's keyboard produces trusted keydown events,
     exactly like a physical keyboard. */
  await p.focus('#kbfix-probe');
  await p.keyboard.type('hello world', {delay:15});
  await p.waitForTimeout(250);

  const r2=await p.evaluate(()=>({
    value:document.getElementById('kbfix-probe').value,
    readOnly:document.getElementById('kbfix-probe').readOnly,
  }));

  /* And the suggestion bar must not carry stale AI completions across messages. */
  const r3=await p.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const ta=document.getElementById('kbfix-probe');
    ta.value='';                            /* simulate "message sent" */
    if(window._khKeyboard&&window._khKeyboard.refresh)window._khKeyboard.refresh();
    await sleep(120);
    const bar=document.getElementById('kh-kbd-sugg');
    return {barText:bar?(bar.textContent||''):'(no bar)'};
  });

  console.log(JSON.stringify({...r,...r2,...r3},null,1));
  const ok = r2.value==='hello world' && r2.readOnly===false &&
             !/hello|world/i.test(r3.barText) && errs.length===0;
  console.log(ok?'PASS: physical typing is never swallowed; no stale suggestions'
                :'FAIL');
  if(r2.value!=='hello world')console.log('  typed value was:',JSON.stringify(r2.value));
  console.log('ERRORS:',errs.length?errs.slice(0,3):'none');
  await b.close();
  process.exit(ok?0:1);
})();
