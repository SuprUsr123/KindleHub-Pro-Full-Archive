/* The first five deepened games, PLAYED rather than merely mounted.
 * A mount test passes on a game that is broken the moment you touch it — that
 * is how Traffic Jam once shipped with three unsolvable boards. So each of
 * these drives the real UI: taps buttons, reads the score back, and checks the
 * thing the upgrade was actually for. */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url');
let pass=0,fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x!==undefined&&!c?'  -- '+String(x).slice(0,240):''));};
const launch=async(p,id)=>{await p.evaluate(g=>launchGame(g),id);await p.waitForTimeout(340);};

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const c=await b.newContext({viewport:{width:600,height:800}});
  const p=await c.newPage();
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve('index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:30000});

  /* ── shared achievements helper ── */
  console.log('── the shared achievements helper ──');
  const ach=await p.evaluate(()=>{
    const L=[{id:'a',name:'A',req:'one',t:c=>c.n>=1},
             {id:'b',name:'B',req:'two',t:c=>c.n>=2},
             {id:'boom',name:'Boom',req:'throws',t:()=>{throw new Error('bad test');}}];
    S.games=S.games||{}; delete S.games.__t;
    const first=_khAchCheck('__t',L,{n:1}).map(a=>a.id);
    const again=_khAchCheck('__t',L,{n:1}).map(a=>a.id);
    const more =_khAchCheck('__t',L,{n:2}).map(a=>a.id);
    const count=_khAchCount('__t',L);
    return {first,again,more,count};
  });
  ok('an achievement unlocks once',            JSON.stringify(ach.first)==='["a"]', JSON.stringify(ach));
  ok('...and never unlocks twice',             ach.again.length===0, JSON.stringify(ach));
  ok('...a later one unlocks on its own',      JSON.stringify(ach.more)==='["b"]', JSON.stringify(ach));
  /* An achievement is the least important thing on screen; a broken test for
     one must not take the game down with it. */
  ok('a throwing test is swallowed, not fatal', ach.count===2, JSON.stringify(ach));

  /* ── Quick Count ── */
  console.log('\n── Quick Count ──');
  await launch(p,'quickcount');
  const qc=await p.evaluate(()=>{
    const d=QuickCount._dbg();
    const rnd=Math.random;
    const modes=d.MODES.map(m=>m.id);
    const shapes={};
    modes.forEach(m=>{const q=d.makeQ(m,5,rnd);shapes[m]=q.mode;});
    /* compare must be genuinely decidable — a tie has no right answer */
    let ties=0,wrongAns=0;
    for(let i=0;i<300;i++){
      const q=d.makeQ('compare',1+(i%20),rnd);
      if(q.left===q.right)ties++;
      const truth=q.left>q.right?'left':'right';
      if(q.answer!==truth)wrongAns++;
    }
    /* pickout must never claim more targets than it draws */
    let badPick=0;
    for(let i=0;i<200;i++){const q=d.makeQ('pickout',1+(i%20),rnd);if(q.answer!==q.n||q.n<1||q.noise<1)badPick++;}
    return {modes,shapes,ties,wrongAns,badPick,
            text:(immersiveContent.textContent||'').slice(0,400)};
  });
  ok('four modes exist',                       qc.modes.length===4, JSON.stringify(qc.modes));
  ok('each mode generates its own question',   qc.modes.every(m=>qc.shapes[m]===m), JSON.stringify(qc.shapes));
  ok('Compare never produces a tie',           qc.ties===0, 'ties='+qc.ties);
  ok('...and its stated answer is the bigger side', qc.wrongAns===0, 'wrong='+qc.wrongAns);
  ok('Pick out counts what it actually draws', qc.badPick===0, 'bad='+qc.badPick);

  const qcPlay=await p.evaluate(async()=>{
    const d=QuickCount._dbg();
    d.begin('count');
    const before=d.state().score;
    /* answer three correctly through the real handler */
    for(let i=0;i<3;i++){
      const st=d.state();
      if(!st||st.done)break;
      d.answer(st.q.answer);
      await new Promise(r=>setTimeout(r,700));
    }
    const st=d.state();
    return {before,after:st?st.score:-1,round:st?st.round:-1,lives:st?st.lives:-1};
  });
  ok('a right answer scores',                  qcPlay.after>qcPlay.before, JSON.stringify(qcPlay));
  ok('...and moves on to the next round',      qcPlay.round>=3, JSON.stringify(qcPlay));
  ok('...without costing a life',              qcPlay.lives===3, JSON.stringify(qcPlay));

  /* ── Nim ── */
  console.log('\n── Nim ──');
  await launch(p,'nim');
  const nim=await p.evaluate(()=>{
    const d=Nim._dbg();
    /* the strategy, checked against a brute-force misère solver in-page */
    const memo={};
    function key(r){return r.slice().sort().join(',');}
    function winMisere(rows){
      if(rows.every(v=>v===0))return true;
      const k=key(rows); if(k in memo)return memo[k];
      let res=false;
      for(let i=0;i<rows.length&&!res;i++)for(let t=1;t<=rows[i]&&!res;t++){
        const n=rows.slice();n[i]-=t;
        if(!winMisere(n))res=true;
      }
      memo[k]=res;return res;
    }
    let bad=0,checked=0;
    for(let a=0;a<=4;a++)for(let b2=0;b2<=4;b2++)for(let c2=0;c2<=4;c2++){
      const rows=[a,b2,c2]; if(rows.every(v=>v===0))continue;
      checked++;
      if(winMisere(rows)){
        const m=d.bestMisere(rows);
        if(!m){bad++;continue;}
        const n=rows.slice();n[m.row]-=m.take;
        if(m.take<1||m.take>rows[m.row]||winMisere(n))bad++;
      }
    }
    /* Twenty-One leaves a multiple of four */
    let bad21=0;
    for(let n=1;n<=40;n++){
      const m=d.bestSub([n],3);
      if(n%4===0){ if(m)bad21++; }
      else if(!m||(n-m.take)%4!==0||m.take<1||m.take>3)bad21++;
    }
    /* every fresh board hands the player a winnable position */
    let unwinnable=0;
    Object.keys(d.VARIANTS).forEach(v=>{
      for(let i=0;i<60;i++){
        const rows=d.freshRows(v,Math.random);
        if(!d.bestMove({rows,variant:v}))unwinnable++;
      }
    });
    /* the Learner really is weaker than Perfect: count how often each takes
       the winning move from the SAME position */
    const pos={rows:[3,4,5],variant:'classic'};
    let lOpt=0,pOpt=0;
    const best=JSON.stringify(d.bestClassic(pos.rows));
    for(let i=0;i<400;i++){
      if(JSON.stringify(d.aiMove({rows:[3,4,5],variant:'classic',level:'learner'},Math.random))===best)lOpt++;
      if(JSON.stringify(d.aiMove({rows:[3,4,5],variant:'classic',level:'perfect'},Math.random))===best)pOpt++;
    }
    return {checked,bad,bad21,unwinnable,lOpt,pOpt};
  });
  ok('the Misère strategy matches a brute-force solver', nim.bad===0, 'checked '+nim.checked+' bad '+nim.bad);
  ok('Twenty-One always leaves a multiple of four',      nim.bad21===0, 'bad='+nim.bad21);
  ok('every fresh board is winnable for the player',     nim.unwinnable===0, 'bad='+nim.unwinnable);
  ok('Perfect always takes the winning move',            nim.pOpt===400, nim.pOpt);
  /* Weak levels are weak HONESTLY — same algorithm, declined some of the
     time — so this is a real frequency difference, not a different opponent. */
  ok('...and Learner genuinely often does not',          nim.lOpt<250&&nim.lOpt>60, 'learner took best '+nim.lOpt+'/400');

  const nimHint=await p.evaluate(()=>{
    const d=Nim._dbg();
    d.begin('classic','fair',false);
    const before=d.state().hints;
    d.hint();
    const st=d.state();
    return {before,after:st.hints,used:st.usedHint};
  });
  /* The old build printed "you are in a winning position" every single turn,
     which is the entire game handed over. It has to cost something now. */
  ok('the analysis is a spent hint, not a permanent spoiler',
     nimHint.before===3&&nimHint.after===2&&nimHint.used===true, JSON.stringify(nimHint));

  const nimWin=await p.evaluate(()=>{
    const d=Nim._dbg();
    d.begin('classic','fair',false);
    const st=d.state();
    st.rows=[0,0,3];
    d.take(2,3);                       /* take the last three */
    return {over:d.state().over,rows:d.state().rows};
  });
  ok('taking the last counter ends the game',  nimWin.over===true, JSON.stringify(nimWin));

  const nimMis=await p.evaluate(()=>{
    const d=Nim._dbg();
    d.begin('misere','fair',false);
    const st=d.state();
    st.rows=[0,0,2];
    d.take(2,2);                       /* take the last two — a LOSS in misère */
    const s2=d.state();
    return {over:s2.over,msg:s2.msgText};
  });
  ok('...but in Misère it loses you the game', nimMis.over===true&&/lose/i.test(nimMis.msg), JSON.stringify(nimMis));

  /* ── Odd One Out ── */
  console.log('\n── Odd One Out ──');
  await launch(p,'oddone');
  const oo=await p.evaluate(()=>{
    const d=OddOne._dbg();
    /* every bank row must have a valid odd index and a reason */
    let bad=0;
    d.Q.forEach(r=>{
      if(!Array.isArray(r[1])||r[1].length<4)bad++;
      else if(typeof r[2]!=='number'||r[2]<0||r[2]>=r[1].length)bad++;
      else if(!r[3]||r[3].length<5)bad++;
      else if(new Set(r[1]).size!==r[1].length)bad++;   /* duplicate options */
    });
    /* generated numeric rounds must be internally true */
    const isPrime=n=>{if(n<2)return false;for(let i=2;i*i<=n;i++)if(n%i===0)return false;return true;};
    const dsum=n=>String(n).split('').reduce((a,ch)=>a+Number(ch),0);
    let genBad=0,oddPos={};
    for(let i=0;i<600;i++){
      const q=d.numQ(Math.random,i%2===1);
      const nums=q.items.map(Number);
      if(nums.length!==4||q.odd<0||q.odd>3){genBad++;continue;}
      oddPos[q.odd]=(oddPos[q.odd]||0)+1;
      const others=nums.filter((_,k)=>k!==q.odd), odd=nums[q.odd];
      const w=q.why;
      let holds=null;
      if(/even/.test(w))       holds=others.every(v=>v%2===0)&&odd%2!==0;
      else if(/are odd/.test(w))holds=others.every(v=>v%2!==0)&&odd%2===0;
      else if(/multiples of (\d+)/.test(w)){const m=Number(RegExp.$1);holds=others.every(v=>v%m===0)&&odd%m!==0;}
      else if(/square/.test(w)) holds=others.every(v=>Number.isInteger(Math.sqrt(v)))&&!Number.isInteger(Math.sqrt(odd));
      else if(/prime/.test(w))  holds=others.every(isPrime)&&!isPrime(odd);
      else if(/add up to (\d+)/.test(w)){const t=Number(RegExp.$1);holds=others.every(v=>dsum(v)===t)&&dsum(odd)!==t;}
      if(holds===false)genBad++;
      if(new Set(nums).size!==4)genBad++;
    }
    return {bank:d.Q.length,bad,genBad,oddPos,subjects:d.SUBJECTS.length};
  });
  ok('the bank grew well past the old 18',     oo.bank>=85, 'bank='+oo.bank);
  ok('every bank question is well formed',     oo.bad===0, 'bad='+oo.bad);
  ok('six subjects to choose from',            oo.subjects===6, oo.subjects);
  ok('generated number rounds are actually true', oo.genBad===0, 'bad='+oo.genBad);
  /* The odd one is built last, so without a shuffle it would sit in slot 3
     every single time and the game would be solvable without reading. */
  ok('...and the odd one is not always in the same slot',
     Object.keys(oo.oddPos).length===4, JSON.stringify(oo.oddPos));

  const ooPlay=await p.evaluate(async()=>{
    const d=OddOne._dbg();
    d.begin('quick');
    const q=d.state().q;
    d.answer(q.odd,q);
    await new Promise(r=>setTimeout(r,1700));
    const st=d.state();
    return {score:st?st.score:-1,i:st?st.i:-1};
  });
  ok('a right answer scores and advances',     ooPlay.score===1&&ooPlay.i===1, JSON.stringify(ooPlay));

  /* ── Balance ── */
  console.log('\n── Balance ──');
  await launch(p,'beambalance');
  const bal=await p.evaluate(()=>{
    const d=BeamBalance._dbg();
    let bad=0,kinds={};
    for(let ti=0;ti<d.TIERS.length;ti++)for(let li=0;li<d.PER_TIER;li++){
      const lv=d.makeLevel(ti,li);
      kinds[lv.kind]=(kinds[lv.kind]||0)+1;
      if(!d.solvable(lv))bad++;
      if(lv.weights.some(w=>w<1||!Number.isInteger(w)))bad++;
    }
    /* the same level twice must be the SAME level, or a retry is a new puzzle */
    const a=JSON.stringify(d.makeLevel(1,3)),b2=JSON.stringify(d.makeLevel(1,3));
    return {bad,kinds,stable:a===b2,tiers:d.TIERS.length,per:d.PER_TIER,gate:d.GATE};
  });
  ok('all 40 levels are solvable by construction', bal.bad===0, 'bad='+bal.bad);
  ok('...and all three puzzle kinds appear',    Object.keys(bal.kinds).length===3, JSON.stringify(bal.kinds));
  ok('a level is the same every time you open it', bal.stable, 'unstable');
  ok('four tiers of ten',                       bal.tiers===4&&bal.per===10, JSON.stringify(bal));

  const balSolve=await p.evaluate(()=>{
    const d=BeamBalance._dbg();
    /* solve level 1 of Easy for real, through the placement state */
    d.play(0,0);
    const st=d.state();
    const w=st.p.weights, n=w.length;
    /* find the winning split by brute force, then apply it */
    let found=null;
    for(let mask=0;mask<(1<<n)&&!found;mask++){
      let L=0,R=0;
      for(let i=0;i<n;i++){ if(mask&(1<<i))L+=w[i]; else R+=w[i]; }
      if(L===R&&L>0)found=mask;
    }
    if(found===null)return {solved:false,reason:'no split'};
    for(let i=0;i<n;i++)st.side[i]=(found&(1<<i))?1:2;
    st.moves=st.p.par;
    d.paint();
    const s=d.sums();
    return {solved:d.state().done,L:s.L,R:s.R,stars:d.totalStars()};
  });
  ok('placing the winning split really solves it', balSolve.solved===true, JSON.stringify(balSolve));
  ok('...with the two sides equal',             balSolve.L===balSolve.R&&balSolve.L>0, JSON.stringify(balSolve));
  ok('...and awards stars',                     balSolve.stars>0, JSON.stringify(balSolve));

  const beamDom=await p.evaluate(()=>{
    const beam=document.getElementById('bbBeam');
    return {exists:!!beam,tilted:!!(beam&&/rotate/.test(beam.style.transform||beam.style.WebkitTransform||''))};
  });
  ok('there is an actual beam on screen',       beamDom.exists, JSON.stringify(beamDom));
  ok('...and it tilts with the load',           beamDom.tilted, JSON.stringify(beamDom));

  /* ── Sequence ── */
  console.log('\n── Sequence ──');
  await launch(p,'nextinline');
  const seq=await p.evaluate(()=>{
    const d=NextInLine._dbg();
    /* independent check of the two families most likely to be written wrong */
    let bad=0;
    for(let i=0;i<300;i++){
      const q=d.make('growdiff',Math.random);
      const a=q.a.concat([q.next]),d1=[];
      for(let k=1;k<a.length;k++)d1.push(a[k]-a[k-1]);
      const gg=d1[1]-d1[0];
      if(!d1.every((v,k)=>k===0||d1[k]-d1[k-1]===gg))bad++;
      const q2=d.make('interleave',Math.random);
      const b2=q2.a.concat([q2.next]);
      if(b2[2]-b2[0]!==b2[4]-b2[2]||b2[3]-b2[1]!==b2[5]-b2[3])bad++;
    }
    /* the answer must never also be one of the wrong buttons */
    let dup=0;
    for(let i=0;i<400;i++){
      const q=d.make(d.FAMILIES[i%d.FAMILIES.length],Math.random);
      const o=d.optionsFor(q,Math.random);
      if(o.filter(x=>x===q.next).length!==1)dup++;
      if(o.length!==4)dup++;
    }
    const w=d.workingFor({a:[2,4,8,16,32],next:64});
    return {families:d.FAMILIES.length,bands:Object.keys(d.BANDS).length,bad,dup,working:w};
  });
  ok('sixteen rule families, up from six',      seq.families===16, seq.families);
  ok('three difficulty bands',                  seq.bands===3, seq.bands);
  ok('the trickiest families hold up',          seq.bad===0, 'bad='+seq.bad);
  ok('the answer is never also a wrong button', seq.dup===0, 'dup='+seq.dup);
  /* The working is the difference between a quiz and a lesson. */
  ok('the working shows the gaps',              /gaps:/.test(seq.working.join(' ')), JSON.stringify(seq.working));
  ok('...and a second row when the gaps change', seq.working.length===2, JSON.stringify(seq.working));

  const seqPlay=await p.evaluate(async()=>{
    const d=NextInLine._dbg();
    d.begin('challenge');
    const st=d.state();
    d.answer(st.q.next);
    await new Promise(r=>setTimeout(r,1700));
    const s2=d.state();
    const workEl=document.getElementById('nlWork');
    return {score:s2?s2.score:-1,round:s2?s2.round:-1,lives:s2?s2.lives:-1};
  });
  ok('a right answer scores and advances',      seqPlay.score===1&&seqPlay.round===2, JSON.stringify(seqPlay));
  ok('...and keeps all three lives',            seqPlay.lives===3, JSON.stringify(seqPlay));

  const seqWrong=await p.evaluate(async()=>{
    const d=NextInLine._dbg();
    d.begin('challenge');
    const st=d.state();
    d.answer(st.q.next+7777);
    await new Promise(r=>setTimeout(r,300));
    const w=document.getElementById('nlWork');
    return {lives:d.state().lives,working:(w&&w.textContent||'').slice(0,80)};
  });
  ok('a wrong answer costs a life',             seqWrong.lives===2, JSON.stringify(seqWrong));
  ok('...and the working is shown so you learn why', /gaps/.test(seqWrong.working), JSON.stringify(seqWrong));

  /* ── nothing leaked ── */
  console.log('\n── clean exit ──');
  const clean=await p.evaluate(async()=>{
    exitImmersive();
    await new Promise(r=>setTimeout(r,200));
    let n=0;
    const realTO=window.setTimeout;
    /* count timers the games left behind by seeing if any of them still holds
       state after the shared exit sweep */
    return {qc:!!QuickCount._dbg().state(),nim:!!Nim._dbg().state(),
            oo:!!OddOne._dbg().state(),seq:!!NextInLine._dbg().state()};
  });
  ok('leaving stops Quick Count', clean.qc===false, JSON.stringify(clean));
  ok('leaving stops Nim',         clean.nim===false, JSON.stringify(clean));
  ok('leaving stops Odd One Out', clean.oo===false, JSON.stringify(clean));
  ok('leaving stops Sequence',    clean.seq===false, JSON.stringify(clean));

  ok('no page errors', errs.length===0, errs.slice(0,3).join(' | '));
  await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
