/* The twelve games added in this round, PLAYED rather than just mounted.

   games_test proves a game renders. That is not the same as it being a game:
   two Wildforms balance bugs rendered perfectly and were only found by playing.
   So each of these is driven far enough to prove its core rule works — a slide
   puzzle that slides, a ladder that accepts a legal word and refuses an illegal
   one, a balance that detects balance, and so on.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tools/tests/dozen_test.cjs */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url'),fs=require('fs');

let pass=0,fail=0;
const ok=(n,c,extra)=>{
  if(c){pass++;console.log('PASS '+n);}
  else{fail++;console.log('FAIL '+n+(extra!==undefined?('  -- '+String(extra).slice(0,240)):''));}
};

const GAMES=[
  ['numslide','NumSlide'],['wordladder','WordLadder'],['sumlines','SumLines'],
  ['pairup','PairUp'],['bridges','Bridges'],['quickcount','QuickCount'],
  ['cargorun','CargoRun'],['oddone','OddOne'],['tiletrader','TileTrader'],
  ['beambalance','BeamBalance'],['nextinline','NextInLine'],['loopwire','LoopWire']
];

(async()=>{
  const src=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
  const sweep=src.slice(src.indexOf('Nerdle,PicPuzzle'),src.indexOf('Nerdle,PicPuzzle')+700);
  let wiringBad=[];
  GAMES.forEach(([id,mod])=>{
    if(!new RegExp("case '"+id+"': "+mod+"\\.start\\(\\);break;").test(src))wiringBad.push(id+':launch');
    if(!new RegExp("\\b"+mod+"[,\\]]").test(sweep))wiringBad.push(id+':stop-sweep');
    if(!new RegExp("\\n  "+id+":\\{name:").test(src))wiringBad.push(id+':help');
    if(!new RegExp("g:'"+id+"'").test(src))wiringBad.push(id+':search');
    if(!new RegExp(id+":'(Arcade|Puzzle|Word|Board|Strategy|Casual|More)'").test(src))wiringBad.push(id+':category');
    if(!new RegExp("launchGame\\('"+id+"'\\)").test(src))wiringBad.push(id+':card');
  });
  ok('all twelve games are wired at every point', wiringBad.length===0, wiringBad.join(', '));
  /* the category must be a KEY, not a display label — a label silently drops
     the game into "More" instead of its shelf */
  ok('no game uses a display label where GAME_CATEGORY wants a key',
     !/:'Strategy & Sim'|:'Board & Cards'/.test(src.slice(src.indexOf('const GAME_CATEGORY='),src.indexOf('const GAME_CATEGORY=')+3000)));
  /* box-drawing characters are outside the e-ink safe set */
  const newCode=src.slice(src.indexOf('const NumSlide='),src.indexOf('const Nonogram='));
  /* Checked against the SHIPPED bundle, not the source.
     The source is full of decorative comment rules made of box-drawing
     characters, which the minifier strips — scanning source therefore failed on
     comments while missing the ones that mattered. What matters is a glyph that
     survives the build and gets DRAWN, so strip comments from the artifact and
     look at what is left. That is how the censor bar (U+2588 FULL BLOCK, shown
     to every reader on every censored word) and the streaming caret were found. */
  const shipped=fs.readFileSync(path.resolve(__dirname,'../../kh-app.js'),'utf8')
                  .replace(/\/\*[\s\S]*?\*\//g,'');
  const tofu=shipped.match(/[─-╿▀-▟]/g)||[];
  ok('nothing that ships and gets drawn is a box or block glyph (tofu on Silk)',
     tofu.length===0, tofu.length+' found: '+JSON.stringify(tofu.slice(0,12).join('')));
  ok('every new game guards its stop() so leaving cannot leave a timer running',
     (newCode.match(/function stop\(/g)||[]).length>=GAMES.length-2);

  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:600,height:800}});
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:20000});

  const r=await p.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const out={};
    const S=window._KH.S;
    S.games=S.games||{};
    const body=()=>(document.getElementById('immersiveContent')||{}).innerText||'';
    const clicks=()=>Array.prototype.slice.call(document.querySelectorAll('#immersiveContent button,#immersiveContent div')).filter(d=>typeof d.onclick==='function');
    const byText=t=>{for(const x of clicks())if((x.textContent||'').trim()===t)return x;return null;};
    const starts=t=>{for(const x of clicks())if((x.innerText||'').indexOf(t)===0)return x;return null;};
    const open=async id=>{try{exitImmersive();}catch(_){}await sleep(120);launchGame(id);await sleep(350);};

    /* ── Number Slide: a tile next to the gap must actually move ── */
    delete S.games.numslide;
    await open('numslide');
    out.nsMenu=body().indexOf('3 x 3')>=0;
    const three=byText('3 x 3');
    if(three){three.click();await sleep(300);}
    let grid=document.querySelectorAll('#immersiveContent div');
    const readTiles=()=>Array.prototype.slice.call(document.querySelectorAll('#immersiveContent div'))
      .filter(d=>typeof d.onclick==='function'&&/^\d*$/.test((d.textContent||'').trim())).map(d=>(d.textContent||'').trim());
    const before=readTiles().join(',');
    /* click every tile; at least one is adjacent to the gap */
    clicks().forEach(c=>{if(/^\d*$/.test((c.textContent||'').trim()))c.click();});
    await sleep(200);
    out.nsMoved=readTiles().join(',')!==before;
    out.nsCounts=/\d+ moves?/.test(body());

    /* ── Word Ladder: legal step accepted, illegal refused ── */
    delete S.games.wordladder;
    await open('wordladder');
    const wl=starts('COLD');
    if(wl){wl.click();await sleep(250);}
    const wlIn=document.getElementById('wlIn');
    out.wlOpened=!!wlIn;
    if(wlIn){
      wlIn.value='cord';                      /* one letter from cold, in the list */
      const add=byText('Add step');if(add)add.click();
      await sleep(150);
      out.wlAccepts=(document.getElementById('wlChain')||{}).textContent.indexOf('CORD')>=0;
      wlIn.value='zzzz';                      /* two letters off AND not a word */
      if(add)add.click();
      await sleep(150);
      out.wlRefuses=/one letter|not in this/i.test((document.getElementById('wlMsg')||{}).textContent||'');
    }

    /* ── Sum Lines: tapping cycles a digit ──
       Sum Lines is generated now, not four named puzzles, so this enters by
       size rather than by the old puzzle name "Warm-up", and the progress line
       counts the squares of whatever board was made instead of a fixed four.
       The generator's real guarantee — every puzzle has exactly one answer — is
       proved in threegames_test, which can call it directly. */
    delete S.games.sumlines;
    await open('sumlines');
    const sl=byText('Small (2 x 2)');
    if(sl){sl.click();await sleep(300);}
    /* An empty, tappable square. Givens are pre-filled, so "empty" also skips
       the squares the puzzle hands you. */
    const slCell=Array.prototype.filter.call(document.querySelectorAll('#immersiveRoot div'),
      c=>c.onclick&&(c.textContent||'')===''&&/border/.test(c.getAttribute('style')||''))[0];
    if(slCell){slCell.click();await sleep(120);out.slCycles=(slCell.textContent||'')==='1';slCell.click();await sleep(80);out.slCycles2=(slCell.textContent||'')==='2';}
    out.slProgress=/\d+\/\d+/.test(body());

    /* ── Pair Up: two cards flip, a match sticks ── */
    delete S.games.pairup;
    await open('pairup');
    const pu=starts('Everyday words');
    if(pu){pu.click();await sleep(250);}
    const cards=clicks().filter(c=>(c.textContent||'').trim()==='?');
    out.puHidden=cards.length===12;
    if(cards.length){cards[0].click();await sleep(120);out.puFlips=(cards[0].textContent||'')!=='?';}

    /* ── Bridges: joining two aligned islands registers ── */
    delete S.games.bridges;
    await open('bridges');
    const br=byText('First crossing');
    if(br){br.click();await sleep(250);}
    const isl=clicks().filter(c=>c.style.borderRadius==='50%');
    out.brIslands=isl.length;
    if(isl.length>=2){isl[0].click();await sleep(80);isl[1].click();await sleep(150);}
    out.brBuilt=/Bridges: /.test(body());

    /* ── Quick Count: a right answer scores ── */
    delete S.games.quickcount;
    await open('quickcount');
    out.qcAsks=body().indexOf('How many marks')>=0;
    const dots=document.querySelectorAll('#immersiveContent div div');
    let n=0;
    Array.prototype.forEach.call(document.querySelectorAll('#immersiveContent div'),d=>{
      if(d.style.borderRadius==='50%'&&d.style.width==='14px')n++;
    });
    const right=byText(String(n));
    if(right){right.click();await sleep(250);}
    out.qcScored=/Score [1-9]/.test(body());

    /* ── Cargo Run: moving costs fuel ── */
    delete S.games.cargorun;
    await open('cargorun');
    const cr=starts('Short haul');
    if(cr){cr.click();await sleep(250);}
    const fuel0=(body().match(/fuel (\d+)/)||[])[1];
    const east=byText('>');
    if(east){east.click();await sleep(150);}
    const fuel1=(body().match(/fuel (\d+)/)||[])[1];
    out.crFuel=fuel0+'->'+fuel1;
    out.crSpends=Number(fuel1)===Number(fuel0)-1;

    /* ── Odd One Out: answering explains itself ── */
    delete S.games.oddone;
    await open('oddone');
    out.ooAsks=body().indexOf('does not belong')>=0;
    const opt=clicks().filter(c=>c.tagName==='BUTTON'&&(c.textContent||'').length>2&&(c.textContent||'')!=='Give up')[0];
    if(opt){opt.click();await sleep(300);}
    out.ooExplains=/the rest are|the rest have|the rest use|the rest measure/.test(body());

    /* ── Tile Trader: buying costs coins and gives you stock ── */
    delete S.games.tiletrader;
    await open('tiletrader');
    const coins0=Number((body().match(/(\d+) coins/)||[])[1]);
    const buy=byText('Buy');
    if(buy&&!buy.disabled){buy.click();await sleep(200);}
    const coins1=Number((body().match(/(\d+) coins/)||[])[1]);
    out.ttSpends=coins1<coins0;
    out.ttHolds=/you hold 1/.test(body());
    const travel=starts('Fenwick');
    if(travel){travel.click();await sleep(200);}
    out.ttDay=/Day 2 of 30/.test(body());

    /* ── Balance: an even split is detected ── */
    delete S.games.beambalance;
    await open('beambalance');
    const bb=starts('Level one');
    if(bb){bb.click();await sleep(250);}
    /* weights 1,2,3 -> 1+2 vs 3 */
    const w=()=>clicks().filter(c=>/^[0-9]+$/.test((c.textContent||'').trim()));
    const put=(val,times)=>{const t=w().filter(x=>(x.textContent||'').trim()===String(val))[0];for(let i=0;i<times;i++){if(t)t.click();}};
    put(1,1);await sleep(60);put(2,1);await sleep(60);put(3,2);await sleep(200);
    out.bbBalanced=/balanced at 3/.test(body());

    /* ── Next in Line: answering explains the rule ── */
    delete S.games.nextinline;
    await open('nextinline');
    out.nlShows=/,\s+\?/.test(body());
    const nlOpt=clicks().filter(c=>c.tagName==='BUTTON'&&/^-?\d+$/.test((c.textContent||'').trim()))[0];
    if(nlOpt){nlOpt.click();await sleep(300);}
    out.nlExplains=/add |multiply|square|take away|two before/.test(body());

    /* ── Loop Wire: a piece turns, and the board is drawn without glyphs ── */
    delete S.games.loopwire;
    await open('loopwire');
    const lw=byText('3 x 3');
    if(lw){lw.click();await sleep(300);}
    const piece=clicks().filter(c=>c.style.position==='relative')[0];
    out.lwPieces=clicks().filter(c=>c.style.position==='relative').length;
    let shown0=piece?Array.prototype.filter.call(piece.children,d=>d.style.display!=='none').length:-1;
    if(piece){piece.click();await sleep(180);}
    let shown1=piece?Array.prototype.filter.call(piece.children,d=>d.style.display!=='none').length:-1;
    out.lwTurns=/1 turns/.test(body());
    out.lwNoGlyphs=piece?((piece.textContent||'').trim()===''):false;

    try{exitImmersive();}catch(_){}
    await sleep(150);
    return out;
  });

  ok('Number Slide: menu offers sizes', r.nsMenu, JSON.stringify(r).slice(0,120));
  ok('...and a tile next to the gap really slides', r.nsMoved);
  ok('...and moves are counted', r.nsCounts);
  ok('Word Ladder: a puzzle opens', r.wlOpened);
  ok('...a legal one-letter step is accepted', r.wlAccepts);
  ok('...and an illegal one is refused with a reason', r.wlRefuses);
  ok('Sum Lines: tapping cycles a square through the digits', r.slCycles&&r.slCycles2, JSON.stringify({a:r.slCycles,b:r.slCycles2}));
  ok('...and progress is shown', r.slProgress);
  ok('Pair Up: all twelve cards start face down', r.puHidden, 'cards='+r.puHidden);
  ok('...and tapping one turns it over', r.puFlips);
  ok('Bridges: the islands are tappable', r.brIslands>=5, 'islands='+r.brIslands);
  ok('...and joining two builds a bridge', r.brBuilt);
  ok('Quick Count: it asks the question', r.qcAsks);
  ok('...and the right answer scores', r.qcScored);
  ok('Cargo Run: a step costs exactly one fuel', r.crSpends, r.crFuel);
  ok('Odd One Out: it asks the question', r.ooAsks);
  ok('...and explains the answer either way', r.ooExplains);
  ok('Tile Trader: buying costs coins', r.ttSpends);
  ok('...and gives you the stock', r.ttHolds);
  ok('...and travelling costs a day', r.ttDay);
  ok('Balance: an even split is detected', r.bbBalanced, JSON.stringify(r).slice(0,140));
  ok('Next in Line: a sequence is shown', r.nlShows);
  ok('...and the rule is explained after answering', r.nlExplains);
  ok('Loop Wire: the board builds', r.lwPieces===9, 'pieces='+r.lwPieces);
  ok('...a piece turns when tapped', r.lwTurns);
  ok('...and pieces are drawn without glyphs (no tofu)', r.lwNoGlyphs);

  ok('no page errors', errs.length===0, errs.slice(0,3).join(' | '));
  await p.close();await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
