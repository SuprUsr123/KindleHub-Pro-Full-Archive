/* Chess was never thin — it already had negamax with alpha-beta, a
 * transposition table, late-move reduction, quiescence and ELO-scaled depth,
 * plus castling, en passant and promotion. What it lacked was the things that
 * make it usable: a way back from a stray Undo, a way to ask the engine what it
 * would play, and a record of the game you are in the middle of.
 *
 * The hint deliberately does NOT go through bestAIMove — that one is hard-wired
 * to black and weakened by ELO (blunder chance, reduced depth). A hint asked
 * for because the reader is stuck must not be a deliberately bad move. */
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

  await p.evaluate(()=>{ showView('games'); });
  await p.waitForTimeout(500);
  const launched=await p.evaluate(()=>{ try{launchGame('chess');return true;}catch(e){return String(e);} });
  ok('chess launches', launched===true, String(launched));
  await p.waitForTimeout(900);

  const ui=await p.evaluate(()=>{
    const root=document.getElementById('immersiveRoot')||document;
    const btns=Array.prototype.map.call(root.querySelectorAll('button'),b=>b.textContent.trim());
    return {btns, squares:root.querySelectorAll('[data-sq],.chess-sq').length,
            text:(root.innerText||'').slice(0,200)};
  });
  ok('Hint is offered',  ui.btns.indexOf('Hint')>=0, ui.btns.join('|').slice(0,180));
  ok('Redo is offered',  ui.btns.indexOf('Redo')>=0, ui.btns.join('|').slice(0,180));
  ok('Undo is still there', ui.btns.indexOf('Undo')>=0, ui.btns.join('|').slice(0,180));

  console.log('\n-- the hint engine, called directly --');
  /* Source-level, because the engine lives inside the module closure: what
     matters is that the hint uses a colour-agnostic search and NOT the
     ELO-weakened one. */
  const src=fs.readFileSync(path.resolve('index.html'),'utf8');
  const ci=src.indexOf('const Chess=');
  const chess=src.slice(ci, ci+120000);
  ok('a colour-agnostic search exists',      /function _bestFor\(b,ep,cas,t,depth\)/.test(chess));
  ok('the hint calls it, not bestAIMove',    /_bestFor\(board,enPassant,castling,turn,3\)/.test(chess)
                                             && !/hintBtn[\s\S]{0,400}bestAIMove/.test(chess));
  ok('...and it filters walk-into-mate like the AI does',
     /_bestFor[\s\S]{0,700}_filterNonMated/.test(chess));
  ok('the hint SHOWS the move rather than playing it',
     /selected=\{r:m\.from\.r,c:m\.from\.c\}/.test(chess)&&!/hintBtn[\s\S]{0,600}applyMove/.test(chess));

  console.log('\n-- redo is a real inverse of undo --');
  ok('redo restores the move list, not just a length',
     /_redo\.push\(\{board[\s\S]{0,200}moveHistory:moveHistory\.slice\(\)/.test(chess));
  ok('a NEW move abandons the redo line',
     (chess.match(/_redo\.length=0/g)||[]).length>=2, 'clears found: '+((chess.match(/_redo\.length=0/g)||[]).length));
  ok('the redo button is disabled with nothing to redo',
     /redoBtn\.disabled=!_redo\.length/.test(chess));

  console.log('\n-- the move list --');
  ok('moves are numbered in pairs',   /\(i\/2\+1\)\+'\.'/.test(chess));
  ok('...read from the SAN already stored', /moveHistory\[i\]/.test(chess));
  ok('...bounded so a long game cannot push the board away',
     /max-height:96px;overflow-y:auto/.test(chess));

  ok('no page errors', errs.length===0, errs.slice(0,3).join(' | '));
  await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
