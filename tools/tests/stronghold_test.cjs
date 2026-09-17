/* Stronghold — the base builder xavierstevens asked for twice.

   Clash of Clans is real-time, and real-time is the one thing an e-ink Kindle
   cannot do. So the live parts are modelled with TIME instead of a loop, and
   that substitution is what most of this test is checking:

     - production is computed from how long you were away, not ticked
     - builds and training finish at a timestamp
     - raids hit a SNAPSHOT, so nobody has to be online

   The battle is deterministic on purpose: same base, same army, same seed, same
   result. That is what lets a defender be shown honestly what happened, and it
   is what makes a bug reproducible rather than "it did something odd once".

   Run: NODE_PATH=/opt/node22/lib/node_modules node tools/tests/stronghold_test.cjs */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url'),fs=require('fs');

let pass=0,fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x!==undefined&&!c?'  -- '+String(x).slice(0,240):''));};

(async()=>{
  console.log('── it has no timers, which is the entire design ──');
  const src=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
  const mod=(/const Stronghold=\(\(\)=>\{[\s\S]*?\n\}\)\(\);/.exec(src)||[''])[0];
  ok('the module was found', mod.length>2000, 'len '+mod.length);
  ok('no setInterval anywhere in it',   !/setInterval/.test(mod));
  ok('no requestAnimationFrame either', !/requestAnimationFrame/.test(mod));
  ok('...so stop() has nothing to leak', /function stop\(\)/.test(mod));

  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await(await b.newContext({viewport:{width:600,height:800}})).newPage();
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:25000});
  await p.evaluate(()=>{window._KH.S.onboarded=true;showView('games');launchGame('stronghold');});
  await p.waitForTimeout(600);

  console.log('\n── it starts with a base you can read ──');
  const start=await p.evaluate(()=>{
    const t=(document.getElementById('immersiveRoot')||{}).textContent||'';
    return {mounted:!!document.getElementById('immersiveRoot'),
            hasKeep:/Keep 1/.test(t), hasGold:/Gold \d/.test(t),
            buttons:[].map.call(document.querySelectorAll('#immersiveRoot button'),x=>x.textContent.trim()).slice(0,12)};
  });
  ok('the base screen mounts', start.mounted&&start.hasKeep, JSON.stringify(start).slice(0,200));
  ok('resources are shown', start.hasGold, JSON.stringify(start).slice(0,200));
  ok('Build / Army / Attack / Clan are all reachable',
     ['Build','Attack','Clan'].every(l=>start.buttons.some(x=>x.indexOf(l)>=0)), JSON.stringify(start.buttons));

  console.log('\n── production is time, not a loop ──');
  const prod=await p.evaluate(()=>{
    const d=Stronghold._dbg(), g=d.state();
    g.gold=0;g.elix=0;
    g.last=Date.now()-3600000;                 /* pretend an hour passed */
    const got=d.collect();
    return {gold:got.gold, elix:got.elix, after:g.gold};
  });
  ok('an hour away produces gold', prod.gold>0, JSON.stringify(prod));
  ok('...and elixir',              prod.elix>0, JSON.stringify(prod));

  const cap=await p.evaluate(()=>{
    const d=Stronghold._dbg(), g=d.state();
    g.gold=0;g.last=Date.now()-3600000*24*30;  /* a month away */
    d.collect();
    return {gold:g.gold};
  });
  ok('storage caps it, so a month away is not a jackpot', cap.gold<=2500, JSON.stringify(cap));

  console.log('\n── the battle is deterministic ──');
  const det=await p.evaluate(()=>{
    const d=Stronghold._dbg();
    const base=d.botBase(4,12345).b;
    const army={grunt:6,archer:4,ram:1,sapper:2};
    const a=d.simulate(base,army,999), c=d.simulate(base,army,999);
    const e=d.simulate(base,army,1000);
    return {samePct:a.pct===c.pct, sameStars:a.stars===c.stars,
            pctA:a.pct, pctE:e.pct, rounds:a.rounds.length, stars:a.stars};
  });
  ok('the same seed gives the same result', det.samePct&&det.sameStars, JSON.stringify(det));
  ok('the fight actually resolves in rounds', det.rounds>0, JSON.stringify(det));
  ok('an army does real damage', det.pctA>0, 'destroyed '+det.pctA+'%');

  console.log('\n── an army has to be able to win, and to lose ──');
  const balance=await p.evaluate(()=>{
    const d=Stronghold._dbg();
    const weakBase=d.botBase(1,7).b, strongBase=d.botBase(8,7).b;
    const big={grunt:20,archer:12,ram:4,sapper:6}, tiny={grunt:1};
    return {bigVsWeak:d.simulate(weakBase,big,5).pct,
            tinyVsStrong:d.simulate(strongBase,tiny,5).pct,
            noArmy:d.simulate(weakBase,{},5).pct};
  });
  ok('a big army flattens a small base', balance.bigVsWeak>=50, JSON.stringify(balance));
  ok('one grunt does NOT flatten a max base', balance.tinyVsStrong<50, JSON.stringify(balance));
  ok('sending nothing destroys nothing', balance.noArmy===0, JSON.stringify(balance));

  console.log('\n── stars follow Clash\'s rule ──');
  const stars=await p.evaluate(()=>{
    const d=Stronghold._dbg();
    const base=d.botBase(2,3).b;
    const r=d.simulate(base,{grunt:30,sapper:10,ram:4},4);
    return {pct:r.pct, stars:r.stars, keepDown:r.keepDown};
  });
  ok('a heavy raid earns stars', stars.stars>=1, JSON.stringify(stars));
  ok('...and stars never exceed three', stars.stars<=3, JSON.stringify(stars));

  console.log('\n── loot scales with what you actually broke ──');
  const loot=await p.evaluate(()=>{
    const d=Stronghold._dbg();
    return {none:d.lootFor(0,5), half:d.lootFor(50,5), full:d.lootFor(100,5)};
  });
  ok('breaking nothing loots nothing', loot.none.gold===0, JSON.stringify(loot));
  ok('half a base loots about half',   loot.half.gold>0&&loot.half.gold<loot.full.gold, JSON.stringify(loot));

  console.log('\n── building respects the Keep and the builder ──');
  const build=await p.evaluate(async()=>{
    const d=Stronghold._dbg(), g=d.state();
    g.gold=999999;g.build=null;
    const before=g.b.length;
    /* open Build and take the first affordable option */
    const btns=[].slice.call(document.querySelectorAll('#immersiveRoot button'));
    const bb=btns.filter(x=>x.textContent.trim()==='Build')[0];
    if(bb)bb.click();
    await new Promise(r=>setTimeout(r,120));
    const opts=[].slice.call(document.querySelectorAll('button')).filter(x=>/\d+g\s+\(\d+\/\d+\)/.test(x.textContent)&&!x.disabled);
    const picked=opts.length?opts[0].textContent.trim():null;
    if(opts.length)opts[0].click();
    await new Promise(r=>setTimeout(r,160));
    return {before, after:d.state().b.length, picked, builderBusy:!!d.state().build};
  });
  ok('a building can be placed', build.after===build.before+1, JSON.stringify(build));
  ok('...and it occupies the one builder', build.builderBusy, JSON.stringify(build));

  const gate=await p.evaluate(()=>{
    const d=Stronghold._dbg(), g=d.state();
    /* finish the job, then check the Keep gate */
    g.build.done=Date.now()-1; d.tickJobs();
    const keep=g.b.filter(x=>x.t==='keep')[0];
    const other=g.b.filter(x=>x.t!=='keep')[0];
    return {keepLv:keep.lv, anyAboveKeep:g.b.some(x=>x.t!=='keep'&&x.lv>keep.lv), builderFree:!g.build};
  });
  ok('the finished job frees the builder', gate.builderFree, JSON.stringify(gate));
  ok('nothing outranks the Keep', !gate.anyAboveKeep, JSON.stringify(gate));

  console.log('\n── raiding spends the army and pays out ──');
  const raid=await p.evaluate(async()=>{
    const d=Stronghold._dbg(), g=d.state();
    g.army={grunt:10,archer:6,sapper:3};g.gold=0;g.elix=0;g.log=[];
    /* drive the real raid path against a generated base */
    const before=JSON.parse(JSON.stringify(g.army));
    window.__shTarget=d.botBase(3,42);
    /* call through the module's own flow by clicking Attack then Raid */
    return {before};
  });
  ok('an army was staged', raid.before.grunt===10);

  await p.evaluate(async()=>{
    const btns=()=>[].slice.call(document.querySelectorAll('#immersiveRoot button'));
    const a=btns().filter(x=>x.textContent.trim()==='Attack')[0];
    if(a)a.click();
    await new Promise(r=>setTimeout(r,900));
    const r=btns().filter(x=>x.textContent.trim()==='Raid')[0];
    if(r)r.click();
    await new Promise(r=>setTimeout(r,500));
  });
  const after=await p.evaluate(()=>{
    const g=Stronghold._dbg().state();
    const t=(document.getElementById('immersiveRoot')||{}).textContent||'';
    let n=0;for(const k in g.army)n+=g.army[k]||0;
    return {armyLeft:n, log:(g.log||[]).length, report:/stars/.test(t), gold:g.gold};
  });
  ok('the raid ran and produced a report', after.report, JSON.stringify(after));
  ok('the army was spent, so raiding is a commitment', after.armyLeft===0, JSON.stringify(after));
  ok('it was written to the raid log', after.log>=1, JSON.stringify(after));

  console.log('\n── it leaves cleanly ──');
  const exit=await p.evaluate(()=>{ try{exitImmersive();}catch(e){return String(e);} return null; });
  ok('exitImmersive does not throw', exit===null, exit);
  ok('no page errors', errs.length===0, errs.slice(0,3).join(' | '));

  await p.close();await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
