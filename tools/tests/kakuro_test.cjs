/* Kakuro — the user said "doesn't work", and it didn't, three ways.

   Each assertion below targets one of them, because the failures were exactly
   the kind a mount test sails through:
     - "New puzzle" swapped the state object and left the OLD board on screen;
       worse, the new state had no cell map, so Check found zero blanks and zero
       mistakes and declared an instant win.
     - There were no black squares: one run per row, one per column. Not a
       Kakuro.
     - The win was graded against the stored answer instead of the clues, so a
       different-but-legal grid was rejected. This is the same mistake the
       Nonogram round already paid for once, which is why it gets its own test
       that builds a genuinely different valid solution and demands it wins.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tools/tests/kakuro_test.cjs */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url');

let pass=0,fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x!==undefined&&!c?'  -- '+String(x).slice(0,260):''));};

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await(await b.newContext({viewport:{width:600,height:800}})).newPage();
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:30000});

  console.log('── the puzzles are well formed, across many seeds ──');
  const geo=await p.evaluate(()=>{
    const d=Kakuro._dbg();
    let bad=[],runs=0,minRun=99,maxRun=0,noBlack=0;
    ['easy','medium','hard'].forEach(lv=>{
      for(let s=1;s<=70;s++){
        const g=d.gen(lv,s*104729);
        if(!g){bad.push(lv+' seed '+s+': no puzzle');continue;}
        let blacks=0;for(let i=0;i<g.W*g.H;i++)if(g.black[i])blacks++;
        if(blacks<=g.W+g.H)noBlack++;            /* only the border = not a Kakuro */
        ['h','v'].forEach(dir=>{
          g.runs[dir].forEach(r=>{
            runs++;
            if(r.cells.length<2)bad.push(lv+' s'+s+': run of '+r.cells.length);
            if(r.cells.length>9)bad.push(lv+' s'+s+': run of '+r.cells.length+' cannot hold distinct digits');
            minRun=Math.min(minRun,r.cells.length);maxRun=Math.max(maxRun,r.cells.length);
            /* the generated fill must itself satisfy the clue it produced */
            let sum=0,seen={},dup=false;
            r.cells.forEach(c=>{const v=g.sol[c];if(seen[v])dup=true;seen[v]=1;sum+=v;});
            if(dup)bad.push(lv+' s'+s+': repeated digit in a run');
            if(sum!==r.sum)bad.push(lv+' s'+s+': clue '+r.sum+' but fill sums '+sum);
          });
        });
        /* every white square must belong to BOTH a row run and a column run */
        for(let i=0;i<g.W*g.H;i++)if(!g.black[i]){
          const rc=g.runs.cell[i];
          if(!rc||rc.h===undefined||rc.v===undefined)bad.push(lv+' s'+s+': a square with no run');
        }
      }
    });
    return {bad:bad.slice(0,5),badN:bad.length,runs,minRun,maxRun,noBlack};
  });
  console.log('   '+geo.runs+' runs checked, lengths '+geo.minRun+'-'+geo.maxRun);
  ok('210 generated puzzles are all well formed', geo.badN===0, geo.badN+' problems: '+geo.bad.join(' | '));
  ok('every puzzle has real black squares, not just a border', geo.noBlack===0, geo.noBlack+' had none');

  console.log('\n── a win is judged on the CLUES, not the stored answer ──');
  /* Build a DIFFERENT legal grid: find a rectangle of four white squares whose
     values are a,b / b,a and swap them. Row sums, column sums and the no-repeat
     rule are all preserved, so it is a genuine second solution — and grading
     against the stored answer is exactly what would reject it. */
  const alt=await p.evaluate(()=>{
    const d=Kakuro._dbg();
    for(let s=1;s<=400;s++){
      const g=d.gen('medium',s*7919);if(!g)continue;
      const W=g.W;
      for(let y1=1;y1<g.H;y1++)for(let y2=y1+1;y2<g.H;y2++)
        for(let x1=1;x1<W;x1++)for(let x2=x1+1;x2<W;x2++){
          const A=y1*W+x1,B=y1*W+x2,C=y2*W+x1,D=y2*W+x2;
          if(g.black[A]||g.black[B]||g.black[C]||g.black[D])continue;
          const cA=g.runs.cell[A],cB=g.runs.cell[B],cC=g.runs.cell[C],cD=g.runs.cell[D];
          if(cA.h!==cB.h||cC.h!==cD.h)continue;      /* same row run */
          if(cA.v!==cC.v||cB.v!==cD.v)continue;      /* same column run */
          if(g.sol[A]===g.sol[B])continue;
          if(g.sol[A]!==g.sol[D]||g.sol[B]!==g.sol[C])continue;
          return {seed:s*7919,swap:[A,B,C,D]};
        }
    }
    return null;
  });
  ok('found a puzzle with a genuinely different second solution', !!alt, 'none in 400 seeds');
  if(alt){
    const verdict=await p.evaluate((a)=>{
      const d=Kakuro._dbg();
      Kakuro.start();
      /* replace the live puzzle with the one we analysed */
      const g=d.gen('medium',a.seed);
      const live=d.state();
      for(const k in g)live[k]=g[k];
      /* fill with the SWAPPED grid — legal, but not what the generator made */
      for(const k in g.sol)live.cur[k]=g.sol[k];
      const [A,B,C,D]=a.swap;
      live.cur[A]=g.sol[B];live.cur[B]=g.sol[A];
      live.cur[C]=g.sol[D];live.cur[D]=g.sol[C];
      const differs=(live.cur[A]!==g.sol[A]);
      return {differs:differs, wins:d.solved()};
    },alt);
    ok('the grid we submitted really is different from the generated one', verdict.differs);
    ok('...and it is accepted as solved', verdict.wins===true, JSON.stringify(verdict));
  }

  console.log('\n── an empty or wrong board is NOT a win (the instant-win bug) ──');
  const neg=await p.evaluate(()=>{
    const d=Kakuro._dbg();
    Kakuro.start();
    const g=d.state();
    const empty=d.solved();
    /* one square wrong: right count, wrong sum */
    for(const k in g.sol)g.cur[k]=g.sol[k];
    const full=d.solved();
    const first=Object.keys(g.sol)[0];
    g.cur[first]=(g.sol[first]%9)+1;
    const spoilt=d.solved();
    return {empty,full,spoilt};
  });
  ok('a blank board is not solved', neg.empty===false);
  ok('the generated answer is solved', neg.full===true);
  ok('changing one square breaks it again', neg.spoilt===false);

  console.log('\n── "New puzzle" really rebuilds the board ──');
  const renew=await p.evaluate(()=>{
    Kakuro.start();
    const d=Kakuro._dbg();
    const before={cells:Object.keys(d.state().cells).length, sig:JSON.stringify(d.state().runs.h.map(r=>r.sum))};
    /* the button, not the internal call — the old bug lived in the handler */
    const btns=[].slice.call(immersiveContent.querySelectorAll('button'));
    let np=null;btns.forEach(b=>{if(b.textContent==='New puzzle')np=b;});
    if(np)np.click();
    const st=d.state();
    return {had:before.cells>0, still:Object.keys(st.cells||{}).length,
      changed:JSON.stringify(st.runs.h.map(r=>r.sum))!==before.sig,
      solvedNow:d.solved(), domCells:immersiveContent.querySelectorAll('div').length>10};
  });
  ok('the board has tappable squares to begin with', renew.had);
  ok('after New puzzle the cell map is still populated', renew.still>0, JSON.stringify(renew));
  ok('...the puzzle actually changed', renew.changed, JSON.stringify(renew));
  ok('...and the fresh empty board is NOT reported as solved', renew.solvedNow===false, JSON.stringify(renew));

  console.log('\n── it plays: tap a square, tap a digit ──');
  const play=await p.evaluate(()=>{
    Kakuro.start();
    const d=Kakuro._dbg();
    const g=d.state();
    const keys=Object.keys(g.cells);
    /* select the first white square through the DOM, then press a pad button */
    g.cells[keys[0]].click();
    const btns=[].slice.call(immersiveContent.querySelectorAll('button'));
    let five=null;btns.forEach(b=>{if(b.textContent==='5')five=b;});
    if(five)five.click();
    const wrote=g.cur[keys[0]]===5&&g.cells[keys[0]].textContent==='5';
    /* now solve it properly and see the win message */
    for(const k in g.sol){d.select(parseInt(k,10));d.put(g.sol[k]);}
    return {wrote:wrote, msg:g.msg.textContent, solved:(S.games.kakuro||{}).solved||0};
  });
  ok('tapping a square then a digit writes it', play.wrote, JSON.stringify(play));
  ok('completing the grid is announced as a win', /Solved in/.test(play.msg||''), play.msg);
  ok('...and the solved count went up', play.solved>=1, String(play.solved));

  ok('no page errors', errs.length===0, errs.slice(0,3).join(' | '));
  await p.evaluate(()=>{try{Kakuro.stop();}catch(_){}});
  await p.close();await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
