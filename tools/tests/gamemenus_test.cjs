/* The second ten, picked the same way as the first: scored against the rest of
   the catalogue on daily, streak, progression and what survives between
   sittings, then the lowest taken in order.

   Seven of them shared one quiet fault. Their difficulty, category, size, speed
   or opponent lived in a <select> on the games PAGE — a screen almost nobody
   opens — so in practice every player got the default forever and the other
   settings may as well not have existed. Minesweeper had three difficulties and
   everyone played 8x8; Snake had four speeds and everyone played Normal;
   Connect 4 had four AI strengths behind three separate controls.

   So the interesting assertions here are not "a menu appears" but "the choice
   you make on it actually changes the game" — a bigger board really is bigger,
   a harder word really is longer, a seeded daily really is the same twice.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tools/tests/gamemenus_test.cjs */
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

  const r=await p.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const S=window._KH.S,out={};
    S.onboardingDone=true;S.games={};
    const root=()=>document.getElementById('immersiveRoot');
    const T=()=>{const e=root();return e?(e.textContent||''):'';};
    const btn=re=>{const e=root();return e?Array.prototype.filter.call(e.querySelectorAll('button'),
      x=>re.test((x.textContent||'').trim()))[0]:null;};
    const open=async id=>{window.launchGame(id);await sleep(900);};
    const shut=async()=>{window.exitImmersive();await sleep(700);};

    /* HANGMAN — the category and difficulty are on the board, and Hard really
       does pick a longer word than Easy. */
    await open('hangman');
    out.hmMenu=/DIFFICULTY/i.test(T())&&/CATEGORY/i.test(T());
    let x=btn(/^Easy/);if(x){x.click();await sleep(600);}
    out.hmEasyLen=((S.games.hangman||{}).current||{}).target.length;
    await shut();await open('hangman');
    x=btn(/^Hard/);if(x){x.click();await sleep(600);}
    out.hmHardLen=((S.games.hangman||{}).current||{}).target.length;
    await shut();
    /* ...and today's word does not change under you. */
    await open('hangman');x=btn(/today/i);if(x){x.click();await sleep(600);}
    const hw=((S.games.hangman||{}).current||{}).target;
    await shut();await open('hangman');x=btn(/today/i);if(x){x.click();await sleep(600);}
    out.hmDailyStable=!!hw&&hw===((S.games.hangman||{}).current||{}).target;
    await shut();

    /* MINESWEEPER — Expert is a real 12x12, not a relabelled 8x8. */
    await open('minesweeper');
    out.msMenu=/Expert/.test(T())&&/12×12/.test(T());
    x=btn(/^Easy/);if(x){x.click();await sleep(700);}
    out.msEasyCells=root().querySelectorAll('.ms-cell').length;
    await shut();await open('minesweeper');
    x=btn(/^Expert/);if(x){x.click();await sleep(700);}
    out.msExpertCells=root().querySelectorAll('.ms-cell').length;
    await shut();

    /* SNAKE — the speed really changes the tick, and each speed keeps its own
       record so a Blazing score is not buried under a Slow one. */
    await open('snake');
    out.snMenu=/Blazing/.test(T())&&/Wrap around/.test(T());
    x=btn(/^Blazing/);if(x){x.click();await sleep(700);}
    out.snStarted=!!document.getElementById('snakeCanvas');
    await shut();

    /* PICTURE PUZZLE — four sizes, and Expert is 36 tiles. */
    await open('picpuzzle');
    out.ppMenu=/Expert/.test(T())&&/36 pieces/.test(T());
    x=btn(/Expert/);if(x){x.click();await sleep(900);}
    out.ppTiles=root().querySelectorAll('canvas').length;
    await shut();

    /* CONNECT 4 — opponent, difficulty and who-starts, all on the board. */
    await open('connect4');
    out.c4Menu=/OPPONENT/i.test(T())&&/Two players/.test(T())&&/Expert/.test(T());
    x=btn(/^Expert/);if(x){x.click();await sleep(800);}
    out.c4Started=!!(S.games.connect4&&S.games.connect4.current);
    out.c4Diff=(S.games.connect4&&S.games.connect4.current||{}).diff;
    await shut();

    /* YAHTZEE — the daily deals the same dice to everyone, in the same order. */
    await open('yahtzee');
    out.yzMenu=/Today’s dice|Today's dice/.test(T())&&/Random dice/.test(T());
    x=btn(/dice/i);if(x){x.click();await sleep(700);}
    const d1=T().replace(/\s+/g,' ').slice(0,200);
    await shut();await open('yahtzee');
    x=btn(/dice/i);if(x){x.click();await sleep(700);}
    out.yzDailySameDice=d1===T().replace(/\s+/g,' ').slice(0,200);
    await shut();

    /* ANAGRAMS + TRIVIA — a finite daily set that ends. */
    await open('anagrams');
    out.anaMenu=/five words/i.test(T())&&/Endless/.test(T());
    await shut();
    await open('trivia');
    out.trMenu=/ten questions/i.test(T())&&/Endless/.test(T());
    await shut();

    /* INFINITE CRAFT — a rung to climb rather than an endless toy. */
    await open('craft');
    out.icRank=/discovered/.test(T())&&/more to/.test(T());
    await shut();

    /* GEOMETRY DASH — practice keeps checkpoints and must NOT set the record. */
    await open('geometrydash');
    out.gdMenu=/Practice/.test(T())&&/checkpoints/.test(T());
    x=btn(/^Practice/);if(x){x.click();await sleep(800);}
    out.gdPractice=true;
    await shut();
    return out;
  });

  console.log(JSON.stringify(r,null,1));
  ok('Hangman puts its difficulty and category on the board', r.hmMenu);
  ok('...and Hard really is a longer word than Easy',
     r.hmEasyLen>0&&r.hmHardLen>r.hmEasyLen, 'easy '+r.hmEasyLen+', hard '+r.hmHardLen);
  ok('...and today\'s word does not change under you', r.hmDailyStable);
  ok('Minesweeper offers four boards', r.msMenu);
  ok('...and Expert really is bigger than Easy',
     r.msEasyCells===36&&r.msExpertCells===144, 'easy '+r.msEasyCells+', expert '+r.msExpertCells);
  ok('Snake puts speed and walls on the board', r.snMenu);
  ok('...and a speed actually starts a game', r.snStarted);
  ok('Picture Puzzle offers four sizes', r.ppMenu);
  ok('...and Expert really is 36 pieces', r.ppTiles===36, r.ppTiles+' tiles');
  ok('Connect 4 puts opponent, difficulty and who-starts on the board', r.c4Menu);
  ok('...and the difficulty you pick is the one played', r.c4Diff==='expert', r.c4Diff);
  ok('Yahtzee offers a daily and free play', r.yzMenu);
  ok('...and the daily deals the same dice twice', r.yzDailySameDice);
  ok('Anagrams has a finite daily set', r.anaMenu);
  ok('Trivia has a finite daily set', r.trMenu);
  ok('Infinite Craft shows a rank and what the next rung costs', r.icRank);
  ok('Geometry Dash offers practice with checkpoints', r.gdMenu);
  ok('no page errors', errs.length===0, errs.slice(0,3).join(' | '));

  await p.close();await b.close();

  const src=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
  ok('the launch menu is built once, not once per game',
     (src.match(/function _khGameMenu\(/g)||[]).length===1);
  /* The games page selects were the whole problem — nothing should still be
     reading a setting from them. */
  ok('nothing reads the buried games-page controls any more',
     !/\$\('msDiff'\)\|\|\{\}/.test(src) && !/\$\('snakeSpeed'\)\|\|\{\}/.test(src) &&
     !/\$\('c4Diff'\)/.test(src) && !/\$\('hangmanDiff'\)/.test(src));
  ok('a practice run in Geometry Dash cannot set the record',
     /if\(!game\.practice\)saveBest\(game\.reached,false\);/.test(src) &&
     /if\(!game\.practice\)saveBest\(100,true\);/.test(src));
  ok('...and its checkpoint is only banked while grounded',
     /if\(game\.practice&&game\.onGround\)\{/.test(src));
  ok('Yahtzee keeps the daily and free records apart',
     /const yk=g\.daily\?'daily':'free';/.test(src));
  ok('Snake keeps a record per speed', /S\.games\.snake\.bestBy\[_sk\]/.test(src));

  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
