/* Registration: the username grammar is the SERVER's, so it must be checked and
   explained here. Three people in one day typed a name with a space, got as far
   as the insert, and were shown "Register error SB POST /kh_users → HTTP 400". */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url');
let pass=0,fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x!==undefined&&!c?'  -- '+String(x).slice(0,200):''));};
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await(await b.newContext()).newPage();
  await p.goto(url.pathToFileURL(path.resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:30000});
  const r=await p.evaluate(async()=>{
    const out={};
    let net=0; const real=window.fetch;
    window.fetch=function(){net++;return real.apply(this,arguments);};
    out.space=await authRegister('Math Assistant','pw123456');
    out.caps =await authRegister('BloxMind','pw123456');
    out.digitspace=await authRegister('watermelon 20232','pw123456');
    out.net=net;                       /* must be ZERO — refused before any request */
    window.fetch=real;
    return out;
  });
  ok('a name with a space is refused', r.space.success===false, JSON.stringify(r.space));
  ok('...naming the actual problem', /spaces/i.test(r.space.error||''), r.space.error);
  ok('...and suggesting the fixed name', /math_assistant/.test(r.space.error||''), r.space.error);
  ok('a name with capitals is refused', r.caps.success===false&&/capital/i.test(r.caps.error||''), r.caps.error);
  ok('...suggesting the lowercase form', /bloxmind/.test(r.caps.error||''), r.caps.error);
  ok('the real reported name is caught too', r.digitspace.success===false&&/watermelon_20232/.test(r.digitspace.error||''), r.digitspace.error);
  ok('none of them reached the network', r.net===0, 'requests='+r.net);
  const good=await p.evaluate(()=>{
    /* a legal name must NOT be blocked by the new gate — checked by driving it
       to the point where it tries the network, then failing there */
    const real=window.fetch; window.fetch=function(){return Promise.reject(new Error('offline'));};
    return authRegister('math_assistant','pw123456').then(r=>{window.fetch=real;return r;});
  });
  ok('a legal name gets past the gate', !/cannot contain/i.test(good.error||''), JSON.stringify(good));
  await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
