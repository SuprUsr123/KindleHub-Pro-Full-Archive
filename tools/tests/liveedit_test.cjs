const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url'),fs=require('fs');
let pass=0,fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x!==undefined&&!c?'  -- '+String(x).slice(0,220):''));};
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await(await b.newContext({viewport:{width:600,height:800}})).newPage();
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:30000});

  const first=await p.evaluate(()=>{
    localStorage.removeItem('kh_gedit_probation');localStorage.removeItem('kh_gedit_cleared');
    _khApplyGlobalEdit({css:'body{opacity:.99}',ts:12345});
    return {applied:!!document.getElementById('kh-gedit-css'),
            prob:JSON.parse(localStorage.getItem('kh_gedit_probation')||'null')};
  });
  ok('a fresh edit is applied', first.applied, JSON.stringify(first));
  ok('...and put on probation until the app proves it survived', first.prob&&first.prob.ts===12345, JSON.stringify(first));

  const second=await p.evaluate(()=>{
    /* the app never confirmed alive — simulate the next load */
    _khApplyGlobalEdit({css:'body{display:none}',ts:12345});
    return {applied:!!document.getElementById('kh-gedit-css'),
            note:!!document.getElementById('kh-gedit-recovered'),
            cleared:!!localStorage.getItem('kh_gedit_cleared')};
  });
  ok('the same edit is NOT applied again after a load that never came up', second.applied===false, JSON.stringify(second));
  ok('...the reader is told what happened', second.note, JSON.stringify(second));
  ok('...and it is remembered as cleared, so a poll cannot bring it back', second.cleared, JSON.stringify(second));

  const confirmed=await p.evaluate(()=>{
    document.getElementById('kh-gedit-recovered').remove();
    localStorage.removeItem('kh_gedit_cleared');localStorage.removeItem('kh_gedit_probation');
    _khApplyGlobalEdit({css:'body{opacity:.99}',ts:999});
    _khGeditConfirmAlive();                       /* the app came up fine */
    const probGone=!localStorage.getItem('kh_gedit_probation');
    _khApplyGlobalEdit({css:'body{opacity:.99}',ts:999});   /* next load */
    return {probGone, stillApplied:!!document.getElementById('kh-gedit-css')};
  });
  ok('a healthy boot clears the probation', confirmed.probGone, JSON.stringify(confirmed));
  ok('...so a good edit keeps working on the next load', confirmed.stillApplied, JSON.stringify(confirmed));

  const src=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
  ok('a burst of errors reverts and reloads', /_geditErrs\.length<6\)return;/.test(src)&&/localStorage.setItem\(_GEDIT_RELOADED,'1'\)/.test(src)&&/location\.reload/.test(src));
  ok('...exactly once, so it cannot loop', /if\(reloaded\)return;/.test(src));
  ok('the app confirms itself alive only after something is on screen',
     /host&&host\.offsetHeight>40/.test(src));

  ok('score names never publish the placeholder', /if\(_fallback==='Reader'\)_fallback='';/.test(src));
  ok('...and prefer the name the reader chose', /var _pn=String\(\(S\.profileName\|\|''\)\)\.trim\(\);/.test(src));
  ok('retro buttons are hard-edged with an offset shadow',
     /body\.simple-ui \.btn,[\s\S]{0,120}box-shadow:3px 3px 0 0 var\(--fg\)/.test(src));
  ok('...and press down onto their own shadow', /transform:translate\(3px,3px\)/.test(src));
  ok('corners are 3px everywhere in retro', /body\.simple-ui \.simple-feat-card\{border-radius:3px !important;\}/.test(src));
  ok('a framed avatar reserves room so it cannot cover a name',
     /var _pad=_khFrameOverhangPx\(f\.id,size\);[\s\S]{0,300}margin:_pad\+'px'/.test(src));

  ok('no page errors', errs.length===0, errs.slice(0,3).join(' | '));
  await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
