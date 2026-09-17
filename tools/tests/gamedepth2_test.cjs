/* The second five deepened games. Same rule as the first: a mount test proves
 * a game LOADS, only a playability test proves it is a game. Each of these
 * checks the specific claim the upgrade makes — uniqueness, solvability,
 * the actual rules — not just that a screen appeared. */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url');
let pass=0,fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x!==undefined&&!c?'  -- '+String(x).slice(0,260):''));};
const launch=async(p,id)=>{await p.evaluate(g=>launchGame(g),id);await p.waitForTimeout(340);};

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await(await b.newContext({viewport:{width:600,height:800}})).newPage();
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve('index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:30000});

  /* ── Futoshiki ── */
  console.log('── Futoshiki: every puzzle has exactly ONE answer ──');
  await launch(p,'futoshiki');
  const fu=await p.evaluate(()=>{
    const d=Futoshiki._dbg();
    let bad=0,n=0,slowest=0;
    const shape={};
    for(const diff of d.DIFFS)for(const N of d.SIZES){
      const t0=Date.now();
      const q=d.gen(N,diff.id,N*7919+diff.id.length*131);
      const ms=Date.now()-t0; if(ms>slowest)slowest=ms;
      n++;
      /* THE property. The old build never checked it, which is why you could
         satisfy every clue on screen and be told you were wrong. */
      if(d.countSolutions(N,q.hs,q.vs,q.given,3)!==1)bad++;
      /* the stored answer must itself obey every clue */
      const cur={};
      for(let r=0;r<N;r++)for(let c=0;c<N;c++)cur[r+','+c]=q.sol[r][c];
      const v=d.violations(q,cur);
      if(v===null||v.length)bad++;
      shape[diff.id+N]=Object.keys(q.given).length+'g/'+(Object.keys(q.hs).length+Object.keys(q.vs).length)+'s';
    }
    /* the daily must be the same puzzle on every device, so generation cannot
       depend on anything but the seed */
    const a=JSON.stringify(d.gen(5,'steady',999)),b2=JSON.stringify(d.gen(5,'steady',999));
    return {n,bad,slowest,shape,deterministic:a===b2,sizes:d.SIZES.length,diffs:d.DIFFS.length};
  });
  ok('every generated puzzle has exactly one solution', fu.bad===0, 'checked '+fu.n+' bad '+fu.bad);
  ok('four sizes and three difficulties',              fu.sizes===4&&fu.diffs===3, JSON.stringify(fu));
  ok('generation stays inside a second',               fu.slowest<1000, fu.slowest+'ms');
  ok('the same seed gives the same puzzle',            fu.deterministic, 'not deterministic');
  console.log('   clues by size: '+JSON.stringify(fu.shape));

  const fuPlay=await p.evaluate(async()=>{
    const d=Futoshiki._dbg();
    d.begin(4,'gentle',false);
    await new Promise(r=>setTimeout(r,400));
    const st=d.state();
    if(!st)return {ok:false,why:'no state'};
    /* fill in the whole answer through the real tap path */
    const N=st.p.N;
    for(let r=0;r<N;r++)for(let c=0;c<N;c++){
      const k=r+','+c;
      if(st.p.given[k]!=null)continue;
      d.select(k);
      d.put(st.p.sol[r][c]);
    }
    return {ok:true,done:d.state().done};
  });
  ok('filling in a correct grid wins',                 fuPlay.ok&&fuPlay.done===true, JSON.stringify(fuPlay));

  const fuJudge=await p.evaluate(() => {
    const d=Futoshiki._dbg();
    const q=d.gen(4,'gentle',31337);
    /* a DIFFERENT grid that still obeys every clue must be accepted — the win
       is judged on the clues, not on the stored picture */
    const cur={};
    for(let r=0;r<4;r++)for(let c=0;c<4;c++)cur[r+','+c]=q.sol[r][c];
    const clean=d.violations(q,cur);
    cur['0,0']=cur['0,0']===1?2:1;   /* break it deliberately */
    const dirty=d.violations(q,cur);
    return {clean:clean&&clean.length,dirty:dirty&&dirty.length};
  });
  ok('a legal grid reports no violations',             fuJudge.clean===0, JSON.stringify(fuJudge));
  ok('...and a broken one does',                       fuJudge.dirty>0, JSON.stringify(fuJudge));

  /* ── Mahjong Match ── */
  console.log('\n── Mahjong Match: every board can be finished ──');
  await launch(p,'mahjong');
  const mj=await p.evaluate(()=>{
    const d=MahjongMatch._dbg();
    let bad=0,odd=0,n=0;
    d.LAYOUTS.forEach(L=>{
      if(d.slotsOf(L).length%2)odd++;      /* an odd slot count strands a tile */
      for(let s=0;s<40;s++){
        const board=d.gen(L,Math.random);
        n++;
        if(!board){bad++;return;}
        /* replaying the recorded order must actually clear the board — this is
           the proof, and it is what the old random deal could not give */
        if(!d.verify(board))bad++;
        if(board.left%2)bad++;
      }
    });
    return {n,bad,odd,layouts:d.LAYOUTS.length};
  });
  ok('four layouts, none with an odd slot count',      mj.odd===0&&mj.layouts===4, JSON.stringify(mj));
  ok('every dealt board replays to empty',             mj.bad===0, 'checked '+mj.n+' bad '+mj.bad);

  const mjPlay=await p.evaluate(async()=>{
    const d=MahjongMatch._dbg();
    d.begin('grid',false);
    await new Promise(r=>setTimeout(r,150));
    const st=d.state();
    if(!st)return {ok:false};
    const before=st.left;
    /* play the recorded winning line right through */
    let guard=0;
    while(d.state().left>0&&guard++<200){
      const s=d.state();
      const pair=s.order.find(pr=>s.tiles[pr[0]]&&s.tiles[pr[1]]);
      if(!pair)break;
      d.tap(pair[0]);
      d.tap(pair[1]);
    }
    const s2=d.state();
    return {ok:true,before,after:s2.left,done:s2.done,moves:s2.moves};
  });
  ok('the winning line really clears the board',       mjPlay.after===0&&mjPlay.done===true, JSON.stringify(mjPlay));
  ok('...and it took the expected number of moves',    mjPlay.moves===mjPlay.before/2, JSON.stringify(mjPlay));

  const mjBlocked=await p.evaluate(()=>{
    const d=MahjongMatch._dbg();
    /* a tile boxed in on both sides must not be selectable */
    const board=d.gen(d.LAYOUTS[0],Math.random);
    const keys=Object.keys(board.tiles).map(Number);
    const boxed=keys.filter(k=>!d.freeIn(board.tiles,k));
    return {boxed:boxed.length,total:keys.length};
  });
  ok('a full row leaves its middle tiles blocked',     mjBlocked.boxed>0, JSON.stringify(mjBlocked));

  /* ── Peg Solitaire ── */
  console.log('\n── Peg Solitaire ──');
  await launch(p,'pegs');
  const pg=await p.evaluate(()=>{
    const d=PegSolitaire._dbg();
    const counts={};
    let bad=0;
    d.BOARDS.forEach(B=>{
      const s=d.fresh(B);
      counts[B.id]=d.pegsLeft(s.b);
      if(!d.allMoves(s.b).length)bad++;      /* a board with no opening move */
      if(d.pegsLeft(s.b)<6)bad++;
    });
    return {counts,bad,boards:d.BOARDS.length};
  });
  ok('five boards, every one with a legal opening',    pg.bad===0&&pg.boards===5, JSON.stringify(pg));
  console.log('   pegs per board: '+JSON.stringify(pg.counts));
  /* Hand-typed peg counts were wrong on three of five boards within an hour of
     being written. A label that disagrees with the board is worse than none. */
  const pgLabel=await p.evaluate(()=>{
    const d=PegSolitaire._dbg();
    return d.BOARDS.map(B=>({id:B.id,note:d.boardNote(B),real:d.pegsLeft(d.fresh(B).b)}))
      .filter(r=>r.note.indexOf(r.real+' pegs')!==0);
  });
  ok('...and every board\'s label matches its real peg count',
     pgLabel.length===0, JSON.stringify(pgLabel));

  const pgPlay=await p.evaluate(()=>{
    const d=PegSolitaire._dbg();
    d.begin('cross',false);
    const before=d.pegsLeft(d.state().b);
    const m=d.allMoves(d.state().b)[0];
    d.tap(m.fx,m.fy);            /* select */
    d.tap(m.tx,m.ty);            /* jump */
    const after=d.pegsLeft(d.state().b);
    const moves=d.state().moves;
    d.undo();
    const undone=d.pegsLeft(d.state().b);
    d.redo();
    const redone=d.pegsLeft(d.state().b);
    return {before,after,moves,undone,redone};
  });
  ok('a jump takes exactly one peg',                   pgPlay.after===pgPlay.before-1, JSON.stringify(pgPlay));
  ok('undo puts it back',                              pgPlay.undone===pgPlay.before, JSON.stringify(pgPlay));
  ok('redo takes it again',                            pgPlay.redone===pgPlay.before-1, JSON.stringify(pgPlay));

  const pgShow=await p.evaluate(()=>{
    const d=PegSolitaire._dbg();
    d.begin('cross',false);
    const m=d.allMoves(d.state().b)[0];
    d.tap(m.fx,m.fy);
    /* selecting a peg must MARK where it can go — the old build made you tap
       around blindly on a 36px grid */
    const cell=d.state().cells[m.ty][m.tx];
    return {marked:/solid/.test(cell.style.border)||cell.textContent==='o'};
  });
  ok('selecting a peg shows where it can land',        pgShow.marked, JSON.stringify(pgShow));

  const pgEnd=await p.evaluate(()=>{
    const d=PegSolitaire._dbg();
    d.begin('plus',false);
    const st=d.state();
    /* strand the board deliberately and check it notices */
    for(let y=0;y<7;y++)for(let x=0;x<7;x++)if(st.b[y][x]===1)st.b[y][x]=0;
    st.b[3][3]=1;
    d.tap(3,3);
    return {moves:d.allMoves(st.b).length,done:d.state().done};
  });
  ok('a board with no jumps left is finished',         pgEnd.moves===0&&pgEnd.done===true, JSON.stringify(pgEnd));

  /* ── Gomoku ── */
  console.log('\n── Gomoku ──');
  await launch(p,'gomoku');
  const go=await p.evaluate(()=>{
    const d=Gomoku._dbg();
    const N=9;
    /* it must take an immediate win */
    let b=new Array(N*N).fill(0);
    [0,1,2,3].forEach(i=>{b[4*N+i]=2;});
    const win=d.aiMove(b,N,'steady',Math.random);
    /* and it must block an immediate loss when it has no win of its own */
    let b2=new Array(N*N).fill(0);
    [0,1,2,3].forEach(i=>{b2[4*N+i]=1;});
    b2[0]=2;b2[N+5]=2;
    const block=d.aiMove(b2,N,'steady',Math.random);
    /* five in a row must be recognised in every direction */
    let b3=new Array(N*N).fill(0);
    for(let i=0;i<5;i++)b3[(2+i)*N+(2+i)]=1;
    const diag=d.wins(b3,N,4,4,1);
    let b4=new Array(N*N).fill(0);
    for(let i=0;i<4;i++)b4[3*N+i]=1;
    const four=d.wins(b4,N,3,3,1);
    return {win,block,diag,four,levels:d.LEVELS.length,sizes:d.SIZES.length};
  });
  ok('three board sizes, four opponents',              go.sizes===3&&go.levels===4, JSON.stringify(go));
  ok('the engine takes an immediate win',              go.win===4*9+4, 'played '+go.win+' wanted '+(4*9+4));
  ok('...and blocks an immediate loss',                go.block===4*9+4, 'played '+go.block+' wanted '+(4*9+4));
  ok('five in a row is seen diagonally',               go.diag===true, JSON.stringify(go));
  ok('...and four in a row is NOT a win',              go.four===false, JSON.stringify(go));

  const goPlay=await p.evaluate(async()=>{
    const d=Gomoku._dbg();
    d.begin(9,'gentle',false);
    const st=d.state();
    /* set up four of ours and take the fifth through the real tap path */
    for(let i=0;i<4;i++)st.b[2*9+i]=1;
    st.turn=1;
    d.tap(2*9+4);
    await new Promise(r=>setTimeout(r,120));
    return {over:d.state().over,msg:(d.state().msg&&d.state().msg.textContent)||''};
  });
  ok('completing five wins the game',                  goPlay.over===true&&/win/i.test(goPlay.msg), JSON.stringify(goPlay));

  const goStrength=await p.evaluate(()=>{
    const d=Gomoku._dbg();
    /* Severe and Steady are the SAME engine at different depths, so on a
       position with one obvious answer they must agree — a stronger level
       that disagreed here would be a different (probably worse) player. */
    const N=9;
    let b=new Array(N*N).fill(0);
    [0,1,2,3].forEach(i=>{b[4*N+i]=2;});
    const a=d.aiMove(b.slice(),N,'severe',Math.random);
    const c=d.aiMove(b.slice(),N,'steady',Math.random);
    /* and Gentle declines its best answer some of the time */
    let b2=new Array(N*N).fill(0);
    b2[4*N+4]=1;b2[4*N+5]=1;
    const best=d.aiMove(b2.slice(),N,'steady',()=>0.99);
    let differs=0;
    for(let i=0;i<200;i++)if(d.aiMove(b2.slice(),N,'gentle',Math.random)!==best)differs++;
    return {a,c,differs};
  });
  ok('Severe and Steady agree on a forced win',        goStrength.a===goStrength.c, JSON.stringify(goStrength));
  ok('...but Gentle genuinely wanders',                goStrength.differs>10&&goStrength.differs<180, 'differs '+goStrength.differs+'/200');

  /* ── Dominoes ── */
  console.log('\n── Dominoes ──');
  await launch(p,'dominoes');
  const dm=await p.evaluate(()=>{
    const d=Dominoes._dbg();
    /* the full double-six set, no duplicates */
    const st=d.deal(Math.random);
    const all=st.you.concat(st.ai,st.draw);
    const seen={};
    let dup=0;
    all.forEach(t=>{const k=t[0]+'-'+t[1];if(seen[k])dup++;seen[k]=1;});
    /* placing must match the touching numbers */
    const line=[[3,5]];
    const both=d.fitsWhere(line,[3,5]);
    const leftOnly=d.fitsWhere(line,[3,1]);
    const none=d.fitsWhere(line,[2,4]);
    const L=d.placeOn(line,[1,3],'l');
    const R=d.placeOn(line,[5,2],'r');
    return {count:all.length,dup,both,leftOnly,none,
            L:L&&L[0],R:R&&R[R.length-1],
            Lends:L&&d.ends(L),Rends:R&&d.ends(R),levels:d.LEVELS.length,target:d.TARGET};
  });
  ok('a full double-six set is dealt',                 dm.count===28&&dm.dup===0, JSON.stringify(dm));
  ok('a tile that fits both ends is reported as both', dm.both==='both', JSON.stringify(dm));
  ok('...one that fits only the left says left',       dm.leftOnly==='l', JSON.stringify(dm));
  ok('...and one that fits neither says so',           dm.none===null, JSON.stringify(dm));
  /* Orientation is the whole rule: the touching halves must match. */
  ok('playing left orients the tile to match',         dm.Lends&&dm.Lends[0]===1, JSON.stringify(dm.Lends));
  ok('playing right orients the tile to match',        dm.Rends&&dm.Rends[1]===2, JSON.stringify(dm.Rends));
  ok('three opponents, match to 100',                  dm.levels===3&&dm.target===100, JSON.stringify(dm));

  const dmChoice=await p.evaluate(()=>{
    const d=Dominoes._dbg();
    d.begin('fair',false);
    const st=d.state();
    /* THE thing the old build decided for you: a tile matching both ends */
    st.line=[[3,3]];
    st.you=[[3,5]];
    st.turn=1;
    d.pick(0);
    const s2=d.state();
    const asked=(document.body.textContent||'').indexOf('Which end')>=0;
    return {asked,stillInHand:s2.you.length===1};
  });
  ok('a tile that fits both ends ASKS which end',      dmChoice.asked, JSON.stringify(dmChoice));
  ok('...and is not played until you say',             dmChoice.stillInHand, JSON.stringify(dmChoice));

  const dmScore=await p.evaluate(()=>{
    const d=Dominoes._dbg();
    d.begin('fair',false);
    const st=d.state();
    /* emptying your hand scores the pips left in theirs */
    st.you=[];
    st.ai=[[6,6],[4,3]];      /* 12 + 7 = 19 */
    st.line=[[1,1]];
    st.over=false;
    d.endRound(1,'domino');
    const after=d.state();
    return {you:after.youScore,expect:19};
  });
  ok('winning a round scores the loser\'s pips',       dmScore.you===19, JSON.stringify(dmScore));

  const dmBlock=await p.evaluate(()=>{
    const d=Dominoes._dbg();
    d.begin('fair',false);
    const st=d.state();
    st.you=[[1,1]];           /* 2 pips */
    st.ai=[[6,6]];            /* 12 pips */
    st.line=[[3,3]];
    st.over=false;
    d.endRound(null,'blocked');
    const a=d.state();
    return {you:a.youScore,ai:a.aiScore};
  });
  ok('a blocked game goes to the lower count',         dmBlock.you===10&&dmBlock.ai===0, JSON.stringify(dmBlock));

  const dmDraw=await p.evaluate(()=>{
    const d=Dominoes._dbg();
    d.begin('fair',false);
    const st=d.state();
    st.line=[[3,3]];
    st.you=[[3,5]];           /* CAN play */
    st.turn=1;
    const before=st.you.length;
    d.drawTile();
    return {before,after:d.state().you.length};
  });
  /* You may not fish for a better tile when you already have a legal move. */
  ok('you cannot draw while you have a tile that fits', dmDraw.after===dmDraw.before, JSON.stringify(dmDraw));

  /* ── clean exit ── */
  console.log('\n── clean exit ──');
  const clean=await p.evaluate(async()=>{
    exitImmersive();
    await new Promise(r=>setTimeout(r,220));
    return {fu:!!Futoshiki._dbg().state(),mj:!!MahjongMatch._dbg().state(),
            pg:!!PegSolitaire._dbg().state(),go:!!Gomoku._dbg().state(),
            dm:!!Dominoes._dbg().state()};
  });
  ok('leaving stops Futoshiki',      clean.fu===false, JSON.stringify(clean));
  ok('leaving stops Mahjong Match',  clean.mj===false, JSON.stringify(clean));
  ok('leaving stops Peg Solitaire',  clean.pg===false, JSON.stringify(clean));
  ok('leaving stops Gomoku',         clean.go===false, JSON.stringify(clean));
  ok('leaving stops Dominoes',       clean.dm===false, JSON.stringify(clean));

  ok('no page errors', errs.length===0, errs.slice(0,3).join(' | '));
  await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
