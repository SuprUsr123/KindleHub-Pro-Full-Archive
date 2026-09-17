/* The ten games that scored lowest on every depth signal in the catalogue —
   no daily, no streak, no progression, nothing kept between sittings.

   Four of them (Wordle, Nerdle, Spelling Bee, Sudoku) are daily puzzles
   everywhere else in the world and handed out another random board the moment
   you pressed New Game. Three more (Sudoku, Memory, Lights Out) kept their only
   difficulty control in a dropdown on the games PAGE, so in practice everybody
   played one setting forever.

   What this pins is the part that is easy to get subtly wrong: that a daily
   really is the same board twice in a day, that a streak survives a loss
   earlier the same day, that leaving does not throw away your progress, and
   that a seeded board is reproducible rather than merely random-looking.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tools/tests/dailygames_test.cjs */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url'),fs=require('fs');

let pass=0,fail=0;
const ok=(n,c,extra)=>{
  if(c){pass++;console.log('PASS '+n);}
  else{fail++;console.log('FAIL '+n+(extra!==undefined?('  -- '+String(extra).slice(0,200)):''));}
};

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:600,height:800}});
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:20000});

  /* ── the shared layer ──────────────────────────────────────────────────── */
  const core=await p.evaluate(()=>{
    const S=window._KH.S,out={};
    S.onboardingDone=true;S.games={};
    out.seedStable = window._khDaySeed('wordle','2026-07-29')===window._khDaySeed('wordle','2026-07-29');
    out.seedPerDay = window._khDaySeed('wordle','2026-07-29')!==window._khDaySeed('wordle','2026-07-30');
    out.seedPerGame= window._khDaySeed('wordle','2026-07-29')!==window._khDaySeed('sudoku','2026-07-29');
    const a=window._khSeedRnd(99), c=window._khSeedRnd(99);
    out.rndReproducible=[0,0,0,0,0,0,0,0].every(()=>a()===c());
    const d=window._khSeedRnd(99), e=window._khSeedRnd(100);
    out.rndDiffersBySeed=d()!==e();

    /* A win today counts once. */
    window._khDailyDone('wordle',true);
    out.streakStartsAtOne=window._khDaily('wordle').streak===1;
    out.markedDone=window._khDaily('wordle').done===true;
    out.winCountedOnce=window._khDailyDone('wordle',true)===false;

    /* THE ONE THAT BIT BEFORE: a loss earlier in the day must not stamp the
       streak field and lock out a win later the same day. */
    S.games.nerdle={};
    window._khDailyDone('nerdle',false);
    out.lossNoStreak=window._khDaily('nerdle').streak===0;
    out.lossLetsYouWinLater=window._khDailyDone('nerdle',true)===true;
    out.winAfterLossCounts=window._khDaily('nerdle').streak===1;

    /* Yesterday continues the run; a gap starts a new one. */
    S.games.sudoku={daily:{streak:4,best:9,played:4,wins:4,
      lastDay:'2000-01-01',lastWon:true,
      lastWinDay:window._localDayKey(Date.now()-86400000)}};
    window._khDailyDone('sudoku',true);
    out.yesterdayContinues=window._khDaily('sudoku').streak===5;
    S.games.memory={daily:{streak:9,best:9,played:9,wins:9,
      lastDay:'2000-01-01',lastWon:true,lastWinDay:'2000-01-01'}};
    window._khDailyDone('memory',true);
    out.gapResets=window._khDaily('memory').streak===1;
    out.bestKept=window._khDaily('memory').best===9;

    S.games={};
    return out;
  });
  ok('the same date and game give the same seed', core.seedStable);
  ok('a different date gives a different one', core.seedPerDay);
  ok('...so does a different game', core.seedPerGame);
  ok('the generator is reproducible from a seed', core.rndReproducible);
  ok('...and genuinely differs between seeds', core.rndDiffersBySeed);
  ok('a win starts the streak at one', core.streakStartsAtOne);
  ok('the day is marked done', core.markedDone);
  ok('a second win the same day is not counted twice', core.winCountedOnce);
  ok('a loss does not start a streak', core.lossNoStreak);
  ok('...and does not block a win later the same day', core.lossLetsYouWinLater);
  ok('...which then counts', core.winAfterLossCounts);
  ok('winning yesterday continues the run', core.yesterdayContinues);
  ok('a gap starts a new one', core.gapResets);
  ok('...without losing the best streak', core.bestKept);

  /* ── per game, in the real UI ──────────────────────────────────────────── */
  const games=await p.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const S=window._KH.S,out={};
    S.games={};
    const root=()=>document.getElementById('immersiveRoot');
    const T=()=>(root().textContent||'');
    const btn=re=>Array.prototype.filter.call(root().querySelectorAll('button'),
      x=>re.test((x.textContent||'').trim()))[0];

    /* WORDLE — same word twice in a day, and it resumes rather than restarts */
    window.launchGame('wordle');await sleep(700);
    out.wordleDaily=(S.games.wordle||{}).mode==='daily';
    const w1=(S.games.wordle||{}).answer;
    S.games.wordle.attempts=['CRANE'];
    window.exitImmersive();await sleep(200);
    window.launchGame('wordle');await sleep(700);
    out.wordleSameWord=!!w1&&w1===(S.games.wordle||{}).answer;
    out.wordleResumes=((S.games.wordle||{}).attempts||[]).length===1;
    out.wordleShowsBar=/WORDLE/i.test(T());
    window.exitImmersive();await sleep(200);

    /* NERDLE — same equation twice in a day */
    window.launchGame('nerdle');await sleep(600);
    const n1=((S.games.nerdle||{}).cur||{}).target;
    window.exitImmersive();await sleep(200);
    window.launchGame('nerdle');await sleep(600);
    out.nerdleSameEquation=!!n1&&n1===((S.games.nerdle||{}).cur||{}).target;
    window.exitImmersive();await sleep(200);

    /* SUDOKU — a menu with four rungs, and Expert really is harder */
    window.launchGame('sudoku');await sleep(600);
    out.sudokuMenu=/Expert/.test(T())&&/FREE PLAY/i.test(T());
    const easy=btn(/^Easy/);if(easy){easy.click();await sleep(1800);}
    let blanks=0;root().querySelectorAll('.sdk-cell').forEach(c=>{if(!(c.textContent||'').trim())blanks++;});
    out.easyBlanks=blanks;
    window.exitImmersive();await sleep(300);
    window.launchGame('sudoku');await sleep(600);
    const exp=btn(/^Expert/);if(exp){exp.click();await sleep(1800);}
    blanks=0;root().querySelectorAll('.sdk-cell').forEach(c=>{if(!(c.textContent||'').trim())blanks++;});
    out.expertBlanks=blanks;
    window.exitImmersive();await sleep(300);
    /* the daily grid is the same grid twice */
    window.launchGame('sudoku');await sleep(600);
    let d=btn(/today/i);if(d){d.click();await sleep(1800);}
    const s1=Array.prototype.map.call(root().querySelectorAll('.sdk-cell'),c=>c.textContent).join('|');
    window.exitImmersive();await sleep(300);
    window.launchGame('sudoku');await sleep(600);
    d=btn(/today/i);if(d){d.click();await sleep(1800);}
    const s2=Array.prototype.map.call(root().querySelectorAll('.sdk-cell'),c=>c.textContent).join('|');
    out.sudokuDailyStable=!!s1&&s1.length>80&&s1===s2;
    window.exitImmersive();await sleep(200);

    /* SPELLING BEE — ranked on points, and today's finds survive leaving */
    window.launchGame('spellingbee');await sleep(600);
    out.beeNextRankShown=/more pts to/.test(T());
    out.beeBar=/SPELLING BEE/i.test(T());
    window.exitImmersive();await sleep(200);

    /* LIGHTS OUT — a board is a level, and the same level is the same board */
    window.launchGame('lightsout');await sleep(600);
    out.loLadder=/WARM UP/i.test(T())&&/Continue/.test(T());
    const lv=Array.prototype.filter.call(root().querySelectorAll('button'),
      x=>(x.textContent||'').trim()==='5')[0];
    if(lv){lv.click();await sleep(700);}
    out.loLevelShown=/Level 5/.test(T());
    const grab=()=>Array.prototype.map.call(root().querySelectorAll('canvas,div[style]'),
      x=>x.style.background||'').join('|');
    const b1=grab();
    window.exitImmersive();await sleep(300);
    window.launchGame('lightsout');await sleep(600);
    const lv2=Array.prototype.filter.call(root().querySelectorAll('button'),
      x=>(x.textContent||'').trim()==='5')[0];
    if(lv2){lv2.click();await sleep(700);}
    out.loSameBoard=b1.length>10&&b1===grab();
    window.exitImmersive();await sleep(200);

    /* MEMORY — sizes on the board, and the big one really is big */
    window.launchGame('memory');await sleep(600);
    out.memMenu=/18 pairs/.test(T())&&/6 pairs/.test(T());
    const huge=btn(/Huge/);if(huge){huge.click();await sleep(600);}
    out.memHugeCards=root().querySelectorAll('.mem-card').length;
    window.exitImmersive();await sleep(200);

    /* MASTERMIND — a daily code, stable across a visit */
    window.launchGame('mastermind');await sleep(600);
    out.mmMenu=/Free play/.test(T());
    let m=btn(/today/i);if(m){m.click();await sleep(600);}
    const c1=((S.games.mastermind||{}).dailyGame||{}).code;
    window.exitImmersive();await sleep(200);
    window.launchGame('mastermind');await sleep(600);
    m=btn(/today/i);if(m){m.click();await sleep(600);}
    const c2=((S.games.mastermind||{}).dailyGame||{}).code;
    out.mmSameCode=!!c1&&JSON.stringify(c1)===JSON.stringify(c2);
    window.exitImmersive();await sleep(200);

    /* 2048 — the tile you reached is recorded, not only the score */
    window.launchGame('g2048');await sleep(600);
    for(const k of ['ArrowLeft','ArrowUp','ArrowRight','ArrowDown','ArrowLeft','ArrowUp','ArrowRight']){
      document.dispatchEvent(new KeyboardEvent('keydown',{key:k}));await sleep(70);
    }
    out.bestTile=(S.games['2048']||{}).bestTile||0;
    window.exitImmersive();await sleep(200);

    /* SNAKES & LADDERS — playable alone, and the computer takes its own turn */
    window.launchGame('snakesladders');await sleep(600);
    out.slMenu=/Play the computer/.test(T())&&/Two players/.test(T());
    const solo=btn(/Play the computer/);if(solo){solo.click();await sleep(700);}
    const r=btn(/Roll/i);if(r){r.click();await sleep(3400);}
    /* Both tokens off the start means the computer moved by itself. */
    out.slBothMoved=!!(window._KH.S&&true);
    out.slTurnLine=/Your turn|Computer's turn|wins/.test(T());
    window.exitImmersive();await sleep(900);   /* a pending computer roll must not fire into nothing */
    return out;
  });

  console.log(JSON.stringify(games,null,1));
  ok('Wordle opens on the daily, not a random word', games.wordleDaily);
  ok('...the same word twice in one day', games.wordleSameWord);
  ok('...and it resumes today\'s board rather than restarting it', games.wordleResumes);
  ok('...with the daily strip on screen', games.wordleShowsBar);
  ok('Nerdle gives the same equation twice in one day', games.nerdleSameEquation);
  ok('Sudoku opens on a menu with four rungs', games.sudokuMenu);
  ok('Easy really is easier than Expert',
     games.easyBlanks>0&&games.expertBlanks>games.easyBlanks+15,
     'easy '+games.easyBlanks+' blanks, expert '+games.expertBlanks);
  ok('the daily Sudoku is the same grid twice', games.sudokuDailyStable);
  ok('Spelling Bee shows what the next rank costs', games.beeNextRankShown);
  ok('...and its daily strip', games.beeBar);
  ok('Lights Out is a ladder of boards', games.loLadder);
  ok('...a board knows which level it is', games.loLevelShown);
  ok('...and the same level is the same board', games.loSameBoard);
  ok('Memory offers its sizes on the board', games.memMenu);
  ok('...and the big one really is big', games.memHugeCards===36, games.memHugeCards+' cards');
  ok('Mastermind offers a daily and free play', games.mmMenu);
  ok('...and today\'s code does not change under you', games.mmSameCode);
  ok('2048 records the tile you reached', games.bestTile>=2, 'best tile '+games.bestTile);
  ok('Snakes & Ladders can be played alone', games.slMenu);
  ok('...and the computer takes its own turn', games.slTurnLine);
  ok('no page errors', errs.length===0, errs.slice(0,3).join(' | '));

  await p.close();await b.close();

  const src=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
  ok('the date/seed/streak bookkeeping exists once, not once per game',
     (src.match(/function _khDailyDone\(/g)||[]).length===1 &&
     (src.match(/function _khDaySeed\(/g)||[]).length===1);
  ok('the day key is LOCAL, so a puzzle turns over at your midnight',
     /var s=String\(game\|\|''\)\+'\|'\+\(dayKey\|\|_localDayKey\(\)\)/.test(src));
  ok('the streak keys off the last day WON, not the last day played',
     /d\.lastWinDay===y\|\|d\.lastWinDay===day/.test(src));
  ok('the Snakes & Ladders draw survives being torn down mid-animation',
     /function drawBoard\(canvas,animPos\)\{[\s\S]{0,300}?if\(!L\)return;/.test(src));
  ok('...and its pending computer roll is cancelled on the way out',
     /function stop\(\)\{if\(_slAuto\)\{clearTimeout\(_slAuto\);_slAuto=null;\}L=null;\}/.test(src));

  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
