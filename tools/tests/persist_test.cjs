/* "never saves your account on anything but kindle"

   The report was exact, and the device split was the whole clue.

   _jsInflate resolves its output ceiling with `maxOut || KH_INFLATE_MAX`.
   KH_INFLATE_MAX is a `var` declared ~15,000 lines BELOW the boot state loader
   that calls it. Function declarations hoist; `var` initialisers do not — so at
   boot the ceiling was `undefined`, `Math.min(isize, undefined)` was NaN, and
   `new Uint8Array(NaN)` is a ZERO-length buffer. Inflate could never grow its
   output, so reading the saved blob failed.

   A failed boot read sets window.__khStateLoadFailed, and _persistState returns
   early on that flag — deliberately, so a transient read error can't clobber
   good data. The two together turn one bad read into "nothing I do is ever
   saved again", with no error anywhere.

   Kindle Silk escaped it for a reason that has nothing to do with Kindles:
   Silk has no CompressionStream, so _packState can't produce a KHZ1/KHZ2 blob
   there and the loader never calls _jsInflate at all. Every modern browser
   compresses, so every modern browser broke.

   The trigger is a state big enough to be stored compressed — which on Safari's
   ~5 MB localStorage means any substantial account, because the raw write
   throws quota and falls through to the compressed path.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tools/tests/persist_test.cjs */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url');

let pass=0,fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x!==undefined&&!c?'  -- '+String(x).slice(0,220):''));};

/* Refuse writes past a budget, the way Safari refuses past ~5 MB. */
const SQUEEZE=`(function(){
  var BUDGET=5*1024*1024, orig=Storage.prototype.setItem;
  Storage.prototype.setItem=function(k,v){
    var total=0;
    for(var i=0;i<localStorage.length;i++){var kk=localStorage.key(i);if(kk===k)continue;total+=kk.length+(localStorage.getItem(kk)||'').length;}
    if(total+String(k).length+String(v).length>BUDGET){var e=new Error('QuotaExceededError');e.name='QuotaExceededError';throw e;}
    return orig.call(this,k,v);
  };
})();`;

(async()=>{
  const FILE=url.pathToFileURL(path.resolve(__dirname,'../../index.min.html')).href;
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const ctx=await b.newContext({viewport:{width:1200,height:800}});
  const p=await ctx.newPage();
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(FILE,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:25000});

  console.log('── the ceiling resolves before it is declared ──');
  const cap=await p.evaluate(()=>({
    noArg:_khInflateCap(undefined),
    zero:_khInflateCap(0),
    explicit:_khInflateCap(4096),
    junk:_khInflateCap('abc')
  }));
  ok('a missing maxOut still yields a real ceiling', cap.noArg>0&&isFinite(cap.noArg), JSON.stringify(cap));
  ok('...and 0 / junk fall back rather than poisoning the maths', cap.zero>0&&cap.junk>0, JSON.stringify(cap));
  ok('an explicit ceiling is still honoured', cap.explicit===4096, String(cap.explicit));

  /* The exact arithmetic that failed. A zero-length output buffer is the whole
     bug: everything downstream is correct and still produces nothing. */
  const buf=await p.evaluate(c=>({
    good:new Uint8Array(Math.min(1234567,c)).length,
    poisoned:new Uint8Array(Math.min(1234567,undefined)|0).length
  }),cap.noArg);
  ok('the ceiling sizes a real buffer (a NaN one is zero-length)', buf.good>0&&buf.poisoned===0, JSON.stringify(buf));

  console.log('\n── a big account on a 5 MB browser ──');
  const saved=await p.evaluate(async sq=>{
    (0,eval)(sq);
    const S=window._KH.S;
    S.authToken='a'.repeat(64); S.userId='a'.repeat(16); S.email='probeuser';
    S.syncEnabled=true; S.onboarded=true;
    S.notes=[];
    for(let i=0;i<9000;i++)S.notes.push({id:'n'+i,title:'Note '+i,body:'x'.repeat(700),date:new Date().toISOString()});
    const rawLen=JSON.stringify(S).length;
    if(typeof saveNow==='function')await saveNow(); else save();
    await new Promise(r=>setTimeout(r,2500));
    const blob=localStorage.getItem('kindlehub_v5')||'';
    return {rawLen, marker:blob.slice(0,5), storedLen:blob.length, session:!!localStorage.getItem('kh_session')};
  },SQUEEZE);
  ok('the raw blob really is over the quota', saved.rawLen>5*1024*1024, saved.rawLen+' bytes');
  ok('so it is stored compressed, the path Kindles never take', saved.marker==='KHZ2:'||saved.marker==='KHZ1:', saved.marker);
  ok('the compressed blob fits', saved.storedLen>0&&saved.storedLen<5*1024*1024, String(saved.storedLen));

  console.log('\n── reload: does the account come back? ──');
  await p.reload({waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:25000});
  const back=await p.evaluate(()=>({
    authed:!!window._KH.S.authToken,
    email:window._KH.S.email||'',
    notes:(window._KH.S.notes||[]).length,
    loadFailed:!!window.__khStateLoadFailed
  }));
  ok('the boot read succeeded',            back.loadFailed===false, 'loadFailed='+back.loadFailed);
  ok('the account is still signed in',     back.authed&&back.email==='probeuser', JSON.stringify(back));
  /* The one that actually failed before: auth survived via the tiny kh_session
     mirror, so "signed in" alone would have passed while all data was gone. */
  ok('...and the DATA came back, not just the session', back.notes===9000, 'notes='+back.notes);

  console.log('\n── and saving still works afterwards ──');
  const resaved=await p.evaluate(async sq=>{
    (0,eval)(sq);
    window._KH.S.notes.push({id:'after-reload',title:'after',body:'z',date:''});
    const before=(localStorage.getItem('kindlehub_v5')||'').length;
    if(typeof saveNow==='function')await saveNow(); else save();
    await new Promise(r=>setTimeout(r,2000));
    return {before, after:(localStorage.getItem('kindlehub_v5')||'').length,
            loadFailed:!!window.__khStateLoadFailed};
  },SQUEEZE);
  ok('a save after the reload is not silently disabled', resaved.loadFailed===false, JSON.stringify(resaved));

  await p.reload({waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:25000});
  const third=await p.evaluate(()=>{
    const n=window._KH.S.notes||[];
    let found=false;for(let i=0;i<n.length;i++)if(n[i]&&n[i].id==='after-reload')found=true;
    return {count:n.length, found, loadFailed:!!window.__khStateLoadFailed};
  });
  ok('the edit made after the reload persisted too', third.found&&third.count===9001, JSON.stringify(third));

  ok('no page errors', errs.length===0, errs.slice(0,3).join(' | '));
  await p.close();await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
