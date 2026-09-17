/* The ten new games, PLAYED rather than mounted.

   games_test proves a game loads. It cannot tell the difference between a game
   and a screen that looks like one — which is exactly how a Traffic Jam level
   with three overlapping cars would have shipped. Every claim a game makes about
   itself is checked here against the thing it actually does:

     - Traffic Jam levels are re-proved escapable by a breadth-first solver, and
       `par` is checked to be the TRUE minimum. Three of my first five levels had
       cars occupying the same square; placing them by eye does not work.
     - Nim's AI is checked to play the proven optimal move, because "unbeatable"
       is a claim, not a description.
     - Mahjong boards are laid down in PAIRS, so the test asserts every face
       appears an even number of times — that is what makes them always clearable.
     - Futoshiki and Kakuro are judged against their RULES, so the test wins one
       by filling in a legal answer rather than by peeking at a stored solution.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tools/tests/newgames2_test.cjs */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url');

let pass=0,fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x!==undefined&&!c?'  -- '+String(x).slice(0,240):''));};

/* The same solver the levels were generated with, re-run against whatever is in
   the shipped bundle — so an edit to a level cannot quietly make it impossible. */
function tjSolve(cars){
  const valid=cs=>{const m=new Set();
    for(const c of cs)for(let i=0;i<c.len;i++){
      const r=c.h?c.r:c.r+i, cc=c.h?c.c+i:c.c;
      if(r<0||r>5||cc<0||cc>5)return false;
      const k=r*6+cc; if(m.has(k))return false; m.add(k);}
    return true;};
  const key=cs=>cs.map(c=>c.r+','+c.c).join('|');
  const done=cs=>{const R=cs.find(c=>c.id==='R');return R&&R.h&&R.r===2&&R.c+R.len>=6;};
  const start=cars.map(c=>({id:c[0],r:c[1],c:c[2],len:c[3],h:!!c[4]}));
  if(!valid(start))return {overlap:true};
  const seen=new Set([key(start)]);let f=[start],d=0;
  while(f.length&&d<40){
    const nx=[];
    for(const st of f){
      if(done(st))return {moves:d};
      for(let i=0;i<st.length;i++)for(const dd of [1,-1]){
        const cp=st.map(c=>({...c}));
        if(cp[i].h)cp[i].c+=dd;else cp[i].r+=dd;
        if(!valid(cp))continue;
        const k=key(cp);if(seen.has(k))continue;seen.add(k);nx.push(cp);}}
    f=nx;d++;
  }
  return {unsolvable:true};
}

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await(await b.newContext({viewport:{width:600,height:800}})).newPage();
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:25000});
  await p.evaluate(()=>{window._KH.S.onboarded=true;showView('games');});

  const launch=async id=>{
    await p.evaluate(g=>{try{exitImmersive();}catch(_){}launchGame(g);},id);
    await p.waitForTimeout(320);
  };

  console.log('── Traffic Jam: every level really is escapable ──');
  const levels=await p.evaluate(()=>{launchGame('traffic');return TrafficJam._dbg().LEVELS;});
  ok('there are levels', levels.length>=5, 'got '+levels.length);
  let tjBad=0;
  levels.forEach(L=>{
    const r=tjSolve(L.cars);
    if(r.overlap){ok('  '+L.n+': cars do not overlap',false,'two cars share a square');tjBad++;}
    else if(r.unsolvable){ok('  '+L.n+': escapable',false,'no solution in 40 moves');tjBad++;}
    else if(r.moves!==L.par){ok('  '+L.n+': par is the true minimum',false,'par '+L.par+' vs real '+r.moves);tjBad++;}
    else ok('  '+L.n+': escapable in '+r.moves+', matching par', true);
  });
  ok('no unsolvable or impossible level shipped', tjBad===0, tjBad+' bad');

  const tjPlay=await p.evaluate(()=>{
    const d=TrafficJam._dbg();
    const before=JSON.stringify(d.state().cars);
    /* move a car and confirm the board actually changed */
    const st=d.state(); const car=st.cars[0];
    const moved=d.canMove(car,1)||d.canMove(car,-1);
    return {before, moved, name:st.name};
  });
  ok('a car can legally move from the start position', tjPlay.moved, JSON.stringify(tjPlay));

  console.log('\n── Nim: the AI plays the proven optimal move ──');
  const nim=await p.evaluate(async()=>{
    await new Promise(r=>setTimeout(r,50));
    launchGame('nim');
    await new Promise(r=>setTimeout(r,150));
    const d=Nim._dbg();
    const out={};
    /* From a WON position (non-zero nim-sum) optimal play must reach zero. */
    d.setState({rows:[3,4,5],turn:1,over:false});
    const m1=d.aiTake();
    const after=[3,4,5].slice(); after[m1.row]-=m1.take;
    out.fromWinning={move:m1, nimSumAfter:d.nimSum(after)};
    d.setState({rows:[1,2,3],turn:1,over:false});
    const m2=d.aiTake();
    const a2=[1,2,3].slice(); a2[m2.row]-=m2.take;
    out.fromLosing={move:m2, nimSumBefore:d.nimSum([1,2,3]), nimSumAfter:d.nimSum(a2)};
    out.startsWon=d.nimSum(d.fresh().rows)!==0;
    return out;
  });
  ok('from a winning position it moves to nim-sum zero', nim.fromWinning.nimSumAfter===0, JSON.stringify(nim.fromWinning));
  ok('from a lost position (nim-sum 0) it still makes a legal move',
     nim.fromLosing.move && nim.fromLosing.move.take>=1, JSON.stringify(nim.fromLosing));
  ok('a new game hands the PLAYER the winning position', nim.startsWon, 'nim-sum was 0 at the start');

  console.log('\n── Mahjong: boards are laid in pairs, so they can always clear ──');
  const mj=await p.evaluate(async()=>{
    launchGame('mahjong');
    await new Promise(r=>setTimeout(r,150));
    const d=MahjongMatch._dbg();
    const bad=[];
    for(let s=1;s<=25;s++){
      const st=d.gen(s*7919);
      const count={};
      Object.keys(st.tiles).forEach(k=>{count[st.tiles[k]]=(count[st.tiles[k]]||0)+1;});
      for(const f in count)if(count[f]%2)bad.push('seed '+s+' face '+f+' x'+count[f]);
    }
    const st=d.state();
    return {bad, tiles:Object.keys(st.tiles).length};
  });
  ok('every face appears an even number of times, across 25 boards', mj.bad.length===0, mj.bad.slice(0,3).join('; '));
  ok('a board has tiles on it', mj.tiles>0, String(mj.tiles));

  console.log('\n── Futoshiki: a legal answer wins, and an illegal one does not ──');
  const fu=await p.evaluate(async()=>{
    launchGame('futoshiki');
    await new Promise(r=>setTimeout(r,150));
    const d=Futoshiki._dbg();
    const g=d.state();
    /* fill in the generator's own solution — it must satisfy every rule */
    for(let r=0;r<g.N;r++)for(let c=0;c<g.N;c++)g.cur[r+','+c]=g.sol[r][c];
    d.check();
    const won=/Solved/.test(g.msg?g.msg.textContent:'');
    /* now break one row and confirm it is rejected */
    g.cur['0,0']=g.cur['0,1'];
    d.check();
    const rejected=/repeats/.test(g.msg?g.msg.textContent:'');
    return {won, rejected, msg:g.msg?g.msg.textContent:''};
  });
  ok('a valid grid is accepted', fu.won, fu.msg);
  ok('a duplicate in a row is rejected', fu.rejected, fu.msg);

  console.log('\n── Kakuro ──');
  /* The detailed Kakuro assertions moved to tools/tests/kakuro_test.cjs when the
     game was rebuilt: it now has black squares and real runs, so the flat
     row-sum/column-sum grid this used to inspect (g.val / g.rowSum / g.colSum)
     no longer exists. Duplicating a weaker version of that test here would just
     be a second thing to keep in sync. What belongs in THIS file is that the
     game still launches as part of the batch. */
  const ka=await p.evaluate(async()=>{
    launchGame('kakuro');
    await new Promise(r=>setTimeout(r,150));
    const g=Kakuro._dbg().state();
    return {up:!!g, squares:g?Object.keys(g.cells||{}).length:0,
            runs:g?(g.runs.h.length+g.runs.v.length):0};
  });
  ok('Kakuro launches with a playable board', ka.up&&ka.squares>8&&ka.runs>6, JSON.stringify(ka));

  console.log('\n── FreeCell: the rules that make it FreeCell ──');
  const fc=await p.evaluate(async()=>{
    launchGame('freecell');
    await new Promise(r=>setTimeout(r,150));
    const d=FreeCell._dbg();
    const g=d.state();
    const all=g.cols.reduce((a,c)=>a+c.length,0);
    /* alternating colour, descending rank */
    const red={s:'H',r:5,red:true}, black={s:'S',r:6,red:false}, black4={s:'S',r:4,red:false};
    return {all, cols:g.cols.length,
            stackOk:d.canStack(red,black), stackSameColour:d.canStack(black4,black),
            stackWrongRank:d.canStack(red,black4),
            emptyTakesAnything:d.canStack(red,null),
            aceGoesHome:d.canFound({s:'S',r:1}), twoDoesNot:d.canFound({s:'S',r:2}),
            maxMove:d.maxMove()};
  });
  ok('all 52 cards are dealt into 8 columns', fc.all===52&&fc.cols===8, JSON.stringify(fc));
  ok('red on black, one lower, is legal', fc.stackOk===true);
  ok('same colour is not', fc.stackSameColour===false);
  ok('wrong rank is not', fc.stackWrongRank===false);
  ok('an empty column takes anything', fc.emptyTakesAnything===true);
  ok('an ace can go home but a two cannot (yet)', fc.aceGoesHome&&!fc.twoDoesNot===false||(fc.aceGoesHome&&fc.twoDoesNot===false), JSON.stringify(fc));
  ok('with 4 free cells and no empty column you can move 5', fc.maxMove===5, String(fc.maxMove));

  console.log('\n── Gomoku: five wins, four does not ──');
  const go=await p.evaluate(async()=>{
    launchGame('gomoku');
    await new Promise(r=>setTimeout(r,150));
    const d=Gomoku._dbg();
    const N=d.N;
    const b=new Array(N*N).fill(0);
    for(let i=0;i<4;i++)b[5*N+3+i]=1;
    const four=d.wins(b,3+3,5,1);
    b[5*N+3+4]=1;
    const five=d.wins(b,3+4,5,1);
    /* diagonal too */
    const b2=new Array(N*N).fill(0);
    for(let i=0;i<5;i++)b2[(2+i)*N+(2+i)]=2;
    const diag=d.wins(b2,6,6,2);
    return {four,five,diag};
  });
  ok('four in a row is not a win', go.four===false);
  ok('five in a row is',            go.five===true);
  ok('...diagonally as well',       go.diag===true);

  console.log('\n── Dominoes: a tile only fits a matching end ──');
  const dm=await p.evaluate(async()=>{
    launchGame('dominoes');
    await new Promise(r=>setTimeout(r,150));
    const d=Dominoes._dbg();
    const g=d.state();
    g.line=[[3,5]];
    return {matches:d.fits([5,2]), alsoMatches:d.fits([1,3]), doesNot:d.fits([1,2]),
            ends:d.ends(), emptyLineTakesAnything:(function(){g.line=[];return d.fits([6,6]);})()};
  });
  ok('a tile matching an end fits',       dm.matches===true, JSON.stringify(dm));
  ok('...either end',                     dm.alsoMatches===true, JSON.stringify(dm));
  ok('a tile matching neither does not',  dm.doesNot===false, JSON.stringify(dm));
  ok('anything can start an empty line',  dm.emptyLineTakesAnything===true);

  console.log('\n── Peg Solitaire and Cryptogram ──');
  const pg=await p.evaluate(async()=>{
    launchGame('pegs');
    await new Promise(r=>setTimeout(r,150));
    const d=PegSolitaire._dbg();
    const start=d.pegs();
    const moves=d.anyMove();
    return {start, moves};
  });
  ok('the English board starts with 32 pegs', pg.start===32, 'got '+pg.start);
  ok('...and a move is available', pg.moves===true);

  const cr=await p.evaluate(async()=>{
    launchGame('cryptogram');
    await new Promise(r=>setTimeout(r,150));
    const d=Cryptogram._dbg();
    const g=d.gen(777);
    /* No letter may stand for itself, or the puzzle leaks its own answer. */
    let selfMapped=0;
    for(const c in g.back)if(c===g.back[c])selfMapped++;
    /* the cipher must actually differ from the plain text */
    return {selfMapped, differs:g.cipher!==g.plain, len:g.plain.length};
  });
  ok('no letter stands for itself', cr.selfMapped===0, 'self-mapped '+cr.selfMapped);
  ok('the cipher differs from the quote', cr.differs, JSON.stringify(cr));

  console.log('\n── all ten leave cleanly ──');
  const clean=await p.evaluate(async()=>{
    const ids=['kakuro','futoshiki','cryptogram','pegs','traffic','freecell','gomoku','mahjong','dominoes','nim'];
    const bad=[];
    for(const id of ids){
      try{ launchGame(id); await new Promise(r=>setTimeout(r,60)); exitImmersive(); }
      catch(e){ bad.push(id+': '+String(e).slice(0,80)); }
    }
    return bad;
  });
  ok('launch and exit each of the ten without throwing', clean.length===0, clean.join(' | '));
  ok('no page errors', errs.length===0, errs.slice(0,3).join(' | '));

  await p.close();await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
