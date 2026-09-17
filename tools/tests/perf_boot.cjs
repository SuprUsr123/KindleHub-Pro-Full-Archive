const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:420,height:760}});
  const cdp=await p.context().newCDPSession(p);
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:6});
  const t0=Date.now();
  await p.goto(url.pathToFileURL(require('path').resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  const domReady=Date.now()-t0;
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:90000});
  const stateReady=Date.now()-t0;
  const m=await p.evaluate(()=>({
    domNodes:document.getElementsByTagName('*').length,
    styleRules:(function(){let n=0;for(const s of document.styleSheets){try{n+=s.cssRules.length;}catch(e){}}return n;})(),
    scripts:document.querySelectorAll('script').length,
  }));
  console.log(JSON.stringify({domReady_ms:domReady,stateReady_ms:stateReady,...m}));
  await b.close();
})();
