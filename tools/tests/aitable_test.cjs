/* Two reports: "tables for ai still don't work", and the shared-model picker
 * being unreachable / its quota block eating the sheet.
 *
 * The table RENDERER was never broken — driven directly it produces a real
 * <table> from all four shapes a model emits. What was broken was WHEN it was
 * asked: _khPlan() answers 'free' while _isAdminCached is still resolving, so a
 * reply landing in that window was flattened to text permanently, because the
 * bubble is already built by the time the real plan arrives. */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url'),fs=require('fs');
let pass=0,fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x!==undefined&&!c?'  -- '+String(x).slice(0,240):''));};

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await(await b.newContext({viewport:{width:600,height:800}})).newPage();
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve('index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:30000});

  console.log('── every shape a model emits becomes a table ──');
  const r=await p.evaluate(()=>{
    const log=document.createElement('div');log.id='chatLog';document.body.appendChild(log);
    const cases={
      md:'Here:\n\n| City | Temp |\n| --- | --- |\n| London | 12 |\n| Paris | 15 |\n\nDone.',
      markers:'TABLE:\n| City | Temp |\n| --- | --- |\n| London | 12 |\nEND_TABLE',
      spaced:'TABLE:\n| A | B |\n| - | - |\n| 1 | 2 |\nEND TABLE',
      oneline:'TABLE: A|B  1|2  END TABLE'
    };
    const out={paid:{}};
    window._isAdminCached=true;
    out.plan=_khPlan();
    Object.keys(cases).forEach(function(k){
      log.innerHTML='';
      try{addBotMsg(cases[k]);}catch(e){out.paid[k]='THREW '+String(e).slice(0,70);return;}
      out.paid[k]={tables:log.querySelectorAll('table').length,
                   leaked:/TABLE:|END_TABLE/.test(log.innerText)};
    });
    /* free: flattened prose, and NEVER raw markup */
    window._isAdminCached=false;S.authToken='';
    log.innerHTML='';addBotMsg(cases.md);
    out.free={tables:log.querySelectorAll('table').length,
              leaked:/TABLE:|END_TABLE|\|\s*---/.test(log.innerText),
              readable:/London/.test(log.innerText)};
    /* THE BUG: plan still resolving, signed in, previously known paid */
    localStorage.setItem('kh_last_plan','pro');
    S.authToken='t'; window._isAdminCached=undefined;
    out.midBoot={plan:_khPlan(),rich:_khAiRich('table')};
    /* a signed-OUT reader in the same window must NOT be upgraded */
    S.authToken='';
    out.guestMidBoot=_khAiRich('table');
    localStorage.removeItem('kh_last_plan');
    return out;
  });
  ok('markdown pipes render as a table',   r.paid.md.tables===1&&!r.paid.md.leaked, JSON.stringify(r.paid.md));
  ok('TABLE:/END_TABLE renders',           r.paid.markers.tables===1, JSON.stringify(r.paid.markers));
  ok('END TABLE with a space renders',     r.paid.spaced.tables===1, JSON.stringify(r.paid.spaced));
  ok('the one-line form renders',          r.paid.oneline.tables===1, JSON.stringify(r.paid.oneline));
  ok('a free reader gets prose, not markup',
     r.free.tables===0&&!r.free.leaked&&r.free.readable, JSON.stringify(r.free));
  ok('a paid reader mid-boot is NOT downgraded to plain text',
     r.midBoot.rich===true, JSON.stringify(r.midBoot));
  ok('...but a signed-out reader is not upgraded either',
     r.guestMidBoot===false, String(r.guestMidBoot));

  console.log('\n── the shared model picker ──');
  const src=fs.readFileSync(path.resolve('index.html'),'utf8');
  const drop=src.slice(src.indexOf('const modelDrop=el('),src.indexOf('const modelDrop=el(')+1400);
  ok('the whole sheet scrolls, not just the list',
     /overflow-y:auto/.test(drop)&&!/overflow:hidden/.test(drop), drop.slice(600,900));
  ok('the quota block is chips, not a row per model',
     /flex-wrap:wrap/.test(src.slice(src.indexOf('LEFT TODAY'),src.indexOf('LEFT TODAY')+700)));
  ok('...and still names every model with its remaining count',
     /m\.name\+' '\+m\.remaining/.test(src));

  ok('no page errors', errs.length===0, errs.slice(0,3).join(' | '));
  await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
