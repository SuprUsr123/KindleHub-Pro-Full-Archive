/* Boot must not ask the backend the same question several times.

   Measured on a real load: fifteen requests went out after the page was already
   painted and interactive, including the reserved-record query four times in
   2.4 seconds and ipapi.co twice. On broadband that is invisible; on Kindle
   Wi-Fi each one is seconds, they serialise, and the browser keeps its loading
   indicator lit the whole time — which is what "it looks fully loaded and then
   loads for another 30 seconds" actually is.

   The fix is single-flight + a short TTL at the _sbFetch chokepoint, so this
   tests THAT rather than counting boot requests: a count depends on a live
   backend and on which features happen to be enabled, and would be flaky.
   fetch is stubbed so requests succeed (in CI they cannot reach the worker, and
   a FAILED request is deliberately never cached).

   Run: NODE_PATH=/opt/node22/lib/node_modules node tools/tests/bootreq_test.cjs */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url'),fs=require('fs');

let pass=0,fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x!==undefined&&!c?'  -- '+String(x).slice(0,240):''));};

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await(await b.newContext({viewport:{width:600,height:800}})).newPage();
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:30000});

  /* Count real network attempts by replacing fetch, and let each one succeed. */
  await p.evaluate(()=>{
    window.__hits=[];
    window.__realFetch=window.fetch;
    window.fetch=function(u,o){
      window.__hits.push(String(u));
      return Promise.resolve({
        ok:true,status:200,
        headers:{get:function(k){return k==='content-type'?'application/json':null;}},
        text:function(){return Promise.resolve('[{"n":1}]');},
        json:function(){return Promise.resolve([{n:1}]);}
      });
    };
  });

  const concurrent=await p.evaluate(async()=>{
    window.__hits=[];
    const r=await Promise.all([
      _sbSelect('kh_announcements','select=text&active=eq.true'),
      _sbSelect('kh_announcements','select=text&active=eq.true'),
      _sbSelect('kh_announcements','select=text&active=eq.true'),
      _sbSelect('kh_announcements','select=text&active=eq.true')
    ]);
    return {hits:window.__hits.length, allGotRows:r.every(x=>Array.isArray(x)&&x.length===1)};
  });
  ok('four callers asking at once make ONE request', concurrent.hits===1, JSON.stringify(concurrent));
  ok('...and every one of them still gets the answer', concurrent.allGotRows, JSON.stringify(concurrent));

  const sequential=await p.evaluate(async()=>{
    window.__hits=[];
    await _sbSelect('kh_groups','code=eq.000000000000&select=name');
    await new Promise(r=>setTimeout(r,60));
    await _sbSelect('kh_groups','code=eq.000000000000&select=name');
    await _sbSelect('kh_groups','code=eq.000000000000&select=name');
    return window.__hits.length;
  });
  ok('a repeat moments later is served from the short cache', sequential===1, 'hits='+sequential);

  const distinct=await p.evaluate(async()=>{
    window.__hits=[];
    await _sbSelect('kh_messages','select=id&limit=1');
    await _sbSelect('kh_messages','select=id&limit=2');
    return window.__hits.length;
  });
  ok('a DIFFERENT query is not answered from the wrong cache entry', distinct===2, 'hits='+distinct);

  console.log('\n── the guards that stop it being wrong ──');
  const fresh=await p.evaluate(async()=>{
    /* A caller that mutates what it got back must not corrupt the next one. */
    window.__hits=[];
    const a=await _sbSelect('kh_scores','select=name');
    a.push({injected:true});
    const c=await _sbSelect('kh_scores','select=name');
    return {mutated:a.length, next:c.length, hits:window.__hits.length};
  });
  ok('each caller gets its own copy, not a shared array',
     fresh.next===1&&fresh.mutated===2, JSON.stringify(fresh));

  const afterWrite=await p.evaluate(async()=>{
    window.__hits=[];
    /* a query no earlier block used — the TTL is 6s and these run in ms, so
       reusing one would start from a cache hit and quietly test nothing */
    await _sbSelect('kh_messages','select=id&group_code=eq.zzz');  /* fills the cache */
    await _sbFetch('/kh_messages',{method:'POST',body:'{}'});      /* a write */
    await _sbSelect('kh_messages','select=id&group_code=eq.zzz');  /* must NOT be cached */
    return window.__hits.length;
  });
  ok('sending a message invalidates that table, so the re-read is real',
     afterWrite===3, 'hits='+afterWrite+' (expected read+write+read)');

  const stateUncached=await p.evaluate(async()=>{
    window.__hits=[];
    await _sbSelect('kh_users','select=updated_at&hash=eq.abc');
    await _sbSelect('kh_users','select=updated_at&hash=eq.abc');
    return window.__hits.length;
  });
  ok('the sync path is never cached — it compares updated_at and must see truth',
     stateUncached===2, 'hits='+stateUncached);

  const perCredential=await p.evaluate(async()=>{
    window.__hits=[];
    await _sbSelect('kh_mail','select=id',      'secret-of-user-one');
    await _sbSelect('kh_mail','select=id',      'secret-of-user-two');
    return window.__hits.length;
  });
  ok('two different accounts do not share one cached read', perCredential===2, 'hits='+perCredential);

  const failNotCached=await p.evaluate(async()=>{
    window.fetch=function(){return Promise.reject(new Error('offline'));};
    window.__hits=[];
    let n=0;
    try{await _sbSelect('kh_feedback','select=id');}catch(_){n++;}
    try{await _sbSelect('kh_feedback','select=id');}catch(_){n++;}
    return n;
  });
  ok('a failure is not remembered — the next attempt really tries again', failNotCached===2, 'threw='+failNotCached);

  console.log('\n── the other duplicated boot lookup ──');
  const src=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
  ok('ipapi.co is fetched through one shared helper, not per feature',
     (src.match(/fetch\('https:\/\/ipapi\.co\/json\/'\)/g)||[]).length===1, 'still fetched in more than one place');
  ok('the language auto-detect uses it', /_khAutoDetectLang[\s\S]{0,600}_ipapiOnce\(\)/.test(src));
  ok('and so does the geo cache', /function _getGeo[\s\S]{0,600}_ipapiOnce\(\)/.test(src));
  ok('a failing request no longer holds a socket for 12s twice',
     /const _tmoMs=_isStatePath\?60000:8000;/.test(src));

  ok('no page errors', errs.length===0, errs.slice(0,3).join(' | '));
  await p.close();await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
