/* Battleship and Othello, two players.

   The thing worth testing here is not that a second player exists — it is that
   neither of them can see what they are not supposed to see.

   Pass-and-play puts both fleets on one screen, so the risk is obvious: a
   hand-over screen that still draws a board, or an opponent grid rendered with
   its ships showing, hands the game away. Online the risk is the same one
   moved a layer down — if a device ever holds the other player's layout, the
   secrecy is decorative. So this asserts the curtain is genuinely empty of
   grids, that an opponent board never paints a ship, and that the online code
   answers shots rather than shipping fleets around.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tools/tests/twoplayer_test.cjs */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url'),fs=require('fs');

let pass=0,fail=0;
const ok=(n,c,extra)=>{
  if(c){pass++;console.log('PASS '+n);}
  else{fail++;console.log('FAIL '+n+(extra?'  -- '+String(extra).slice(0,220):''));}
};
const sleepSrc='const sleep=ms=>new Promise(r=>setTimeout(r,ms));';

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:600,height:800}});
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:20000});
  await p.evaluate(()=>{window._KH.S.onboardingDone=true;});

  /* ── Battleship ─────────────────────────────────────────────────────────── */
  const bs=await p.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const out={};
    const txtOf=()=>document.getElementById('immersiveContent').innerText;
    const btn=re=>Array.prototype.filter.call(
      document.querySelectorAll('#immersiveContent button, #immersiveContent div'),
      x=>re.test((x.textContent||'').trim())&&x.querySelectorAll('button').length===0)[0];
    const grids=()=>document.querySelectorAll('#immersiveContent div[style*="grid-template-columns"]').length;
    /* A cell painted with the foreground colour is a ship the player can see. */
    const shipCells=g=>Array.prototype.filter.call(g.children,c=>/var\(--fg\)/.test(c.style.background)).length;

    window.launchGame('battleship');await sleep(700);
    out.menu=txtOf();
    out.menuGrids=grids();

    btn(/^2 Players$/).click();await sleep(400);
    out.placeP1=txtOf().slice(0,60);
    btn(/^Auto Place$/).click();await sleep(300);
    out.p1Ships=shipCells(document.querySelectorAll('#immersiveContent div[style*="grid-template-columns"]')[0]);
    btn(/^Ready$/).click();await sleep(300);

    /* The hand-over screen. Nothing may be on it. */
    out.handoff1=txtOf();
    out.handoff1Grids=grids();

    btn(/^I'm Player 2$/).click();await sleep(400);
    out.placeP2=txtOf().slice(0,60);
    btn(/^Auto Place$/).click();await sleep(300);
    btn(/^Ready$/).click();await sleep(300);
    out.handoff2=txtOf();
    out.handoff2Grids=grids();

    btn(/^I'm Player 1$/).click();await sleep(400);
    out.battle=txtOf();
    const gs=document.querySelectorAll('#immersiveContent div[style*="grid-template-columns"]');
    out.battleGrids=gs.length;
    /* Top grid is the enemy's waters. It must not paint a single ship. */
    out.enemyVisibleShips=gs.length?shipCells(gs[0]):-1;
    out.ownVisibleShips=gs.length>1?shipCells(gs[1]):-1;

    /* Fire one shot — it must hand over, not stay on the board. */
    gs[0].children[0].click();await sleep(400);
    out.afterShot=txtOf();
    out.afterShotGrids=grids();
    window.exitImmersive&&window.exitImmersive();await sleep(250);
    return out;
  });

  ok('Battleship opens a mode menu with all three ways to play',
     /1 Player/.test(bs.menu)&&/2 Players/.test(bs.menu)&&/Play Online/.test(bs.menu),bs.menu);
  ok('Auto Place fills player 1\'s fleet', bs.p1Ships===17, 'ship cells: '+bs.p1Ships);
  ok('after player 1 is ready it asks for the hand-over', /Player 2's turn/.test(bs.handoff1), bs.handoff1);
  ok('the hand-over screen draws NO grid', bs.handoff1Grids===0, 'grids: '+bs.handoff1Grids);
  ok('player 2 then places their own fleet', /placing Carrier/.test(bs.placeP2), bs.placeP2);
  ok('the second hand-over hides the boards too', bs.handoff2Grids===0&&/Player 1's turn/.test(bs.handoff2), bs.handoff2);
  ok('the battle shows both boards', bs.battleGrids===2, 'grids: '+bs.battleGrids);
  ok('the opponent board never paints a ship', bs.enemyVisibleShips===0, 'visible: '+bs.enemyVisibleShips);
  ok('your own board does show your fleet', bs.ownVisibleShips===17, 'visible: '+bs.ownVisibleShips);
  ok('firing hands the device over instead of staying put',
     bs.afterShotGrids===0&&/fired/.test(bs.afterShot), bs.afterShot);

  /* ── Reversi ────────────────────────────────────────────────────────────── */
  const rv=await p.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const out={};
    const hud=()=>{const h=document.getElementById('rvHud');return h?h.textContent:'';};
    const btn=re=>Array.prototype.filter.call(document.querySelectorAll('#immersiveContent button'),
      x=>re.test((x.textContent||'').trim()))[0];
    /* A legal-move marker is the small translucent dot the board paints. */
    const marks=()=>document.querySelectorAll('#immersiveContent div[style*="border-radius: 50%"][style*="opacity: 0.5"]').length;

    const before=JSON.parse(JSON.stringify((window._KH.S.games&&window._KH.S.games.reversi)||{}));
    window.launchGame('reversi');await sleep(700);
    out.menu=document.getElementById('immersiveContent').innerText;

    btn(/^Pass and play$/).click();await sleep(500);
    out.hud0=hud();
    out.marks0=marks();
    out.hasUndo=!!btn(/^Undo$/);

    /* Dark's four opening moves are marked; take one. */
    const cells=document.querySelectorAll('#immersiveContent div[style*="grid-template-columns"] > div');
    let moved=false;
    for(let i=0;i<cells.length&&!moved;i++){
      if(cells[i].querySelector('div[style*="opacity: 0.5"]')){cells[i].click();moved=true;}
    }
    await sleep(400);
    out.movedOk=moved;
    out.hud1=hud();
    out.marks1=marks();

    const after=(window._KH.S.games&&window._KH.S.games.reversi)||{};
    out.ladderUnchanged=(after.ladderProgress||0)===(before.ladderProgress||0);
    out.winsUnchanged=(after.totalWins||0)===(before.totalWins||0);
    out.gamesUnchanged=(after.totalGames||0)===(before.totalGames||0);
    window.exitImmersive&&window.exitImmersive();await sleep(250);
    return out;
  });

  ok('Reversi offers pass-and-play and online',
     /Pass and play/.test(rv.menu)&&/Play online/.test(rv.menu),rv.menu);
  ok('...and says up front that neither counts towards the Ladder',
     /Ladder, the Daily or the leaderboard/.test(rv.menu));
  ok('pass-and-play names the sides instead of "You"',
     /Dark/.test(rv.hud0)&&/Light/.test(rv.hud0)&&!/You/.test(rv.hud0), rv.hud0);
  ok('dark is on move first with its four openings marked', /Dark to move/.test(rv.hud0)&&rv.marks0===4,
     rv.hud0+' marks='+rv.marks0);
  ok('a move passes the turn to light', rv.movedOk&&/Light to move/.test(rv.hud1), rv.hud1);
  ok('and light gets its own legal moves marked', rv.marks1>0, 'marks: '+rv.marks1);
  ok('Undo stays available on one device', rv.hasUndo);
  ok('a two-player move touches no single-player progress',
     rv.ladderUnchanged&&rv.winsUnchanged&&rv.gamesUnchanged,
     JSON.stringify({l:rv.ladderUnchanged,w:rv.winsUnchanged,g:rv.gamesUnchanged}));

  ok('no page errors', errs.length===0, errs.join(' | '));
  await p.close();await b.close();

  /* ── source-level guarantees the DOM cannot show ────────────────────────── */
  const src=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');

  /* Online Battleship must ask for a square and be told the answer. If it ever
     serialises a fleet, the secrecy is gone whatever the UI does. */
  ok('online Battleship sends coordinates, not a fleet',
     /netSend\(\{t:'SH',r:r,c:c\}\)/.test(src)&&/const reply=\{t:'RS'/.test(src));
  ok('...and the defender is the one who resolves the shot',
     /function _onShot\(p\)\{[\s\S]{0,600}fireAt\(G\.p\[G\.me\],r,c\)/.test(src));
  ok('...and a re-delivered shot replays its original answer',
     /if\(G\.seenShots\[k\]\)\{netSend\(G\.seenShots\[k\]\);return;\}/.test(src));
  ok('a sunk ship reveals only squares the attacker already hit',
     /cells=ship\.cells\.slice\(\)/.test(src));

  /* Reversi online is the opposite trade — nothing is hidden, so the whole
     board travels and cannot drift. */
  ok('online Reversi publishes the settled board',
     /netSend\(\{t:'ST',b:_ser\(\),tn:turn,lm:lastMove,ov:over\}\)/.test(src));
  ok('...after the pass/end has been resolved, not before',
     /advanceTurn\(\);[\s\S]{0,400}netSend\(\{t:'ST'/.test(src));
  ok('...and a history replay collapses to one adopt',
     /function _queueAdopt\(p\)\{/.test(src)&&/_pendTO=setTimeout/.test(src));
  ok('two-player Reversi is excluded from ladder, daily and leaderboard',
     /if\(_is2P\(\)\)\{[\s\S]{0,700}g\.twoPlayer=\(g\.twoPlayer\|\|0\)\+1;/.test(src)&&
     /return;\n    \}\n    g\.totalGames\+\+;/.test(src));
  ok('no undo online', /if\(mode!=='online'\)rr\.appendChild\(Object\.assign\(txt\('button','Undo'/.test(src));

  /* Both need to be reachable from an invite, and both must stop cleanly. */
  ok('both register an invite acceptor',
     /_khGameAcceptors\|\|\{\}\)\.reversi=function/.test(src)&&
     /_khGameAcceptors\|\|\{\}\)\.battleship=function/.test(src));
  ok('Battleship now exposes stop() so the exit sweep can reach it',
     /return\{start,restore,stop,startOnline\};/.test(src));
  ok('...and its AI timer is tracked so leaving cancels it',
     /_aiTO=setTimeout\(function\(\)\{/.test(src)&&/function stop\(\)\{if\(_aiTO\)\{clearTimeout\(_aiTO\);/.test(src));

  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
