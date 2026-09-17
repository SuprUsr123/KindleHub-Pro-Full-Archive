/* The Games page: short cards, and per-game settings inside the game.

   The user's words: "the list is very long", "wall wrap toggle in snake should
   not be in the box but in the game", "descriptions should only show when you
   press ? icon".

   What made this worth checking rather than eyeballing: most of those card
   controls were DEAD. Every game that had a difficulty dropdown on its card
   grew its own in-game menu during the deepening rounds, and nothing has read
   the card's ids since — grep found one reference each, the definition. So the
   page was showing settings that silently did nothing. Snake's own module
   comment even says the speed and wall-wrap moved onto the board.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tools/tests/gamecards_test.cjs */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url'),fs=require('fs');

let pass=0,fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x!==undefined&&!c?'  -- '+String(x).slice(0,240):''));};

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await(await b.newContext({viewport:{width:600,height:800}})).newPage();
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:30000});
  await p.evaluate(()=>showView('games'));
  await p.waitForTimeout(500);

  console.log('── the list got shorter ──');
  const shape=await p.evaluate(()=>{
    const cards=[].slice.call(document.querySelectorAll('.kh-cat-grid .card'));
    let visibleDesc=0,withQ=0,hidden=[];
    cards.forEach(c=>{
      const ps=[].slice.call(c.querySelectorAll('p'));
      ps.forEach(x=>{
        if((x.textContent||'').length<=45)return;
        if(x.style.display!=='none')visibleDesc++; else hidden.push(x);
      });
      if([].slice.call(c.querySelectorAll('button')).some(x=>x.textContent==='?'))withQ++;
    });
    const host=document.querySelector('#mainHost');
    const shortH=Math.round(host.scrollHeight);
    /* Reveal every description and re-measure. Comparing the page against
       ITSELF is the only honest way to state the saving: a fixed pixel budget
       would just encode today's game count. */
    hidden.forEach(x=>{x.style.display='';});
    const longH=Math.round(host.scrollHeight);
    hidden.forEach(x=>{x.style.display='none';});
    return {cards:cards.length, visibleDesc, withQ, shortH, longH};
  });
  console.log('   '+shape.cards+' cards · '+shape.shortH+'px ('+(Math.round(shape.shortH/800*10)/10)+
              ' screens) · '+shape.longH+'px with every description shown');
  ok('no card shows its description until you ask', shape.visibleDesc===0, JSON.stringify(shape));
  ok('the cards that have a description offer a ? to read it', shape.withQ>40, JSON.stringify(shape));
  ok('hiding the descriptions is worth a real chunk of the page',
     shape.shortH < shape.longH*0.93, JSON.stringify(shape));
  /* A per-card budget rather than a total, so adding games does not fail this
     and REMOVING games cannot make a regression pass. Measured against main
     before this change: 5734px for 87 cards = 66px each; now 4568 = 53px. */
  ok('the page stays under 58px of scrolling per game',
     shape.shortH/shape.cards < 58, Math.round(shape.shortH/shape.cards)+'px per card');

  const toggle=await p.evaluate(()=>{
    const cards=[].slice.call(document.querySelectorAll('.kh-cat-grid .card'));
    let card=null;
    cards.forEach(c=>{ if(!card&&[].slice.call(c.querySelectorAll('button')).some(x=>x.textContent==='?'))card=c; });
    if(!card)return {err:'no card with a ?'};
    const d=[].slice.call(card.querySelectorAll('p')).filter(x=>(x.textContent||'').length>45)[0];
    const q=[].slice.call(card.querySelectorAll('button')).filter(x=>x.textContent==='?')[0];
    const before=d.style.display;
    q.click(); const shown=d.style.display!=='none';
    q.click(); const hidden=d.style.display==='none';
    return {before,shown,hidden,text:(d.textContent||'').slice(0,40)};
  });
  ok('tapping ? reveals the description', toggle.shown===true, JSON.stringify(toggle));
  ok('tapping it again hides it', toggle.hidden===true, JSON.stringify(toggle));

  console.log('\n── settings are in the game, not in the box ──');
  const cardOpts=await p.evaluate(()=>{
    /* nothing selectable should be sitting VISIBLY on a card any more */
    const cards=[].slice.call(document.querySelectorAll('.kh-cat-grid .card'));
    let visible=0,names=[];
    cards.forEach(c=>{
      [].slice.call(c.querySelectorAll('select,input[type="checkbox"]')).forEach(n=>{
        let e=n,shown=true;
        while(e&&e!==c){ if(e.style&&e.style.display==='none'){shown=false;break;} e=e.parentNode; }
        if(shown){visible++;names.push(n.id||n.type);}
      });
    });
    return {visible,names:names.slice(0,6),registered:Object.keys(window._khGameOpts||{})};
  });
  ok('no dropdown or checkbox is left on a card', cardOpts.visible===0, JSON.stringify(cardOpts));
  ok('the games that DO have settings registered them', cardOpts.registered.length>=4, JSON.stringify(cardOpts));

  const inGame=await p.evaluate(()=>{
    const gid=Object.keys(window._khGameOpts)[0];
    window._currentGame=gid;
    enterImmersive('Test','');
    const btn=document.getElementById('immersiveOpts');
    const shown=btn&&btn.style.display!=='none';
    btn.click();
    /* the REAL control must now be inside the sheet, not a copy */
    const sel=document.querySelector('.card select, .card input[type="checkbox"]');
    const idInSheet=sel?sel.id:'';
    const sameNode=idInSheet?document.querySelectorAll('#'+idInSheet).length:0;
    /* change it, close, and check the value survived where the game reads it */
    if(sel&&sel.tagName==='SELECT'&&sel.options.length>1)sel.selectedIndex=sel.options.length-1;
    const want=sel?sel.value:'';
    [].slice.call(document.querySelectorAll('button')).filter(x=>x.textContent==='Done').forEach(x=>x.click());
    const after=document.getElementById(idInSheet);
    return {gid,shown,idInSheet,copies:sameNode,want,
      readsBack:after?after.value:'(gone)', backOnCard:!!(after&&after.closest('.kh-cat-grid'))};
  });
  ok('a game with settings shows an Options button', inGame.shown===true, JSON.stringify(inGame));
  ok('the sheet holds the REAL control, not a second one with the same id',
     inGame.copies===1, JSON.stringify(inGame));
  ok('a change made in-game is what the game reads afterwards',
     inGame.want!==''&&inGame.readsBack===inGame.want, JSON.stringify(inGame));
  ok('and the control goes back where it came from', inGame.backOnCard===true, JSON.stringify(inGame));

  const noOpts=await p.evaluate(()=>{
    window._currentGame='deephalls';           /* has no card settings */
    enterImmersive('Deep Halls','');
    const btn=document.getElementById('immersiveOpts');
    return btn.style.display==='none';
  });
  ok('a game with no settings does not offer an empty Options button', noOpts===true);

  console.log('\n── the dead controls are gone from the source ──');
  const src=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
  ['snakeWalls','snakeSpeed','hangmanDiff','hangmanCat','c4Mode','c4Diff','memCount','msDiff'].forEach(id=>{
    ok("'"+id+"' no longer exists — nothing ever read it", src.indexOf("'"+id+"'")<0);
  });
  ['wordleLen','sudokuDiff','tttMode','ckDiff','tdBiome'].forEach(id=>{
    ok("'"+id+"' kept — its game really does read it", src.indexOf("'"+id+"'")>=0);
  });

  ok('no page errors', errs.length===0, errs.slice(0,3).join(' | '));
  await p.close();await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
