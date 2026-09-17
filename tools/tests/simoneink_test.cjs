const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url'),fs=require('fs');
let pass=0,fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x!==undefined&&!c?'  -- '+String(x).slice(0,200):''));};
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await(await b.newContext({viewport:{width:600,height:800}})).newPage();
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:30000});
  const src=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
  ok('the star is gone from a lit pad', !/const want=on\?\('\\u2605/.test(src));
  ok('a lit pad still inverts a large solid area', /p\.style\.background=on\?'var\(--fg\)':'var\(--card\)';/.test(src));
  ok('...with a thicker ring', /p\.style\.borderWidth=on\?'7px':'2px';/.test(src));
  ok('the number never changes, so nothing waits on glyph rendering',
     /if\(p\.textContent!==n\)p\.textContent=n;/.test(src));
  ok('e-ink pads stay lit far longer', /else\{lit=_eink\?700:340;gap=_eink\?260:170;\}/.test(src));
  ok('...and the gap is long enough to draw them going dark',
     /gap=Math\.max\(_eink\?220:120/.test(src));
  ok('your own taps are visible too', /setLit\(i,false\);\},_ei\?420:180\);/.test(src));
  ok('other screens keep the brisk timing', /lit=_eink\?700:340/.test(src)&&/:340;gap=_eink\?260:170/.test(src));
  const live=await p.evaluate(async()=>{
    launchGame('simon'); await new Promise(r=>setTimeout(r,400));
    return {mounted:/Simon|Watch|Level/i.test(immersiveContent.textContent||'')};
  });
  ok('Simon still mounts', live.mounted, JSON.stringify(live));
  ok('no page errors', errs.length===0, errs.slice(0,2).join(' | '));
  await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
