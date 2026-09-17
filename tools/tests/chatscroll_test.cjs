/* Regression: re-rendering the message list must not yank the reader to the
   bottom. Voting in a poll and tapping "Load earlier" both re-render, and both
   used to throw you back down to the newest message — "Load earlier" especially
   badly, since its whole purpose is to keep your place. */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:420,height:700}});
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:20000});

  const r=await p.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const out={};

    /* Build a scrollable log that behaves like the chat list, and drive the
       same decision the real renderMessages makes: follow only when the reader
       was already at the bottom BEFORE the rebuild. */
    const log=document.createElement('div');
    log.style.cssText='height:300px;overflow-y:auto;position:fixed;left:-9999px;top:0;width:300px;';
    document.body.appendChild(log);
    const fill=n=>{ log.innerHTML=''; for(let i=0;i<n;i++){
      const d=document.createElement('div'); d.style.height='40px'; d.textContent='msg '+i; log.appendChild(d);} };

    let keepOnce=false;
    function render(n){
      let atBottom=true;
      try{ atBottom=(log.scrollHeight<=log.clientHeight)||((log.scrollHeight-log.scrollTop-log.clientHeight)<90); }catch(e){}
      if(keepOnce){ atBottom=false; keepOnce=false; }
      fill(n);
      if(atBottom)log.scrollTop=log.scrollHeight;
      return atBottom;
    }

    /* 1. First render from nothing -> should land at the bottom. */
    out.firstRenderFollows=render(40);
    await sleep(30);
    out.firstRenderAtBottom=(log.scrollHeight-log.scrollTop-log.clientHeight)<5;

    /* 2. Reader scrolls UP to read history, then a re-render happens (poll vote,
          incoming message, translation landing...). Position must be kept. */
    log.scrollTop=200;
    const before=log.scrollTop;
    out.rerenderKeptPlace=(render(40)===false);
    await sleep(30);
    out.stillNearWhereTheyWere=Math.abs(log.scrollTop-before)<60;

    /* 3. "Load earlier": prepends older messages and restores position itself,
          so the auto-follow must stay out of the way. */
    log.scrollTop=150;
    const pinFromBottom=log.scrollHeight-log.scrollTop;
    keepOnce=true;
    render(80);
    log.scrollTop=Math.max(0,log.scrollHeight-pinFromBottom);
    await sleep(30);
    out.loadEarlierNotAtBottom=(log.scrollHeight-log.scrollTop-log.clientHeight)>200;

    /* 4. Reader IS at the bottom -> a new message should still follow. */
    log.scrollTop=log.scrollHeight;
    out.atBottomStillFollows=(render(90)===true);
    await sleep(30);
    out.followedToBottom=(log.scrollHeight-log.scrollTop-log.clientHeight)<5;

    log.remove();

    return out;
  });

  /* The real guard must exist in the SOURCE. It cannot be checked in the
     minified bundle: _keepScrollOnce is a closure-local, and terser mangles
     those, so grepping the deploy artifact for the name always fails. */
  const src=require('fs').readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
  r.guardInSource = src.indexOf('_keepScrollOnce')>=0 && /if\(_wasAtBottom\)\{/.test(src);
  r.noUnconditionalFollow = !/\}\);\s*\/\* Jump to the bottom[\s\S]{0,400}?requestAnimationFrame\(\(\)=>requestAnimationFrame\(scrollDown\)\);\s*\/\* Belt/.test(src);

  console.log(JSON.stringify(r,null,1));
  const ok=r.firstRenderFollows&&r.firstRenderAtBottom&&
    r.rerenderKeptPlace&&r.stillNearWhereTheyWere&&
    r.loadEarlierNotAtBottom&&r.atBottomStillFollows&&r.followedToBottom&&
    r.guardInSource&&r.noUnconditionalFollow&&errs.length===0;
  console.log(ok?'PASS: chat follows only when you are already at the bottom':'FAIL');
  console.log('ERRORS:',errs.length?errs.slice(0,3):'none');
  await b.close();
  process.exit(ok?0:1);
})();
