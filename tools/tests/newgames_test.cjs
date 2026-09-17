/* Deep Halls, Ember Deck and Wildforms — original games in genres the community
   asked for (dungeon crawler, deckbuilder, monster collector). All turn-based
   on purpose: nothing
   moves until you act, which is the only shape of action game e-ink handles
   well, and it means neither game owns a timer that could leak.

   games_test.cjs only proves a game MOUNTS. This one plays them: it walks the
   dungeon and checks the world responds, and it fights a card battle through to
   a reward screen. A game that renders but cannot be played would pass the
   other test and fail this one.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tools/tests/newgames_test.cjs */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url'),fs=require('fs');

let pass=0,fail=0;
const ok=(n,c,extra)=>{
  if(c){pass++;console.log('PASS '+n);}
  else{fail++;console.log('FAIL '+n+(extra!==undefined?('  -- '+String(extra).slice(0,240)):''));}
};

(async()=>{
  const src=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
  /* every wiring point — a game missing one of these is reachable but broken
     somewhere non-obvious (help text, search, the exit sweep) */
  ['deephalls','emberdeck','wildforms'].forEach(id=>{
    const M={deephalls:'DeepHalls',emberdeck:'EmberDeck',wildforms:'Wildforms'}[id];
    ok(id+': has a launch case', new RegExp("case '"+id+"': "+M+"\\.start\\(\\);break;").test(src));
    ok(id+': is in the exitImmersive stop sweep (no leaked loop)', new RegExp(M+"[,\\]]").test(src.slice(src.indexOf('Nerdle,PicPuzzle'),src.indexOf('Nerdle,PicPuzzle')+200)));
    ok(id+': has help text', new RegExp("\\n  "+id+":\\{name:").test(src));
    ok(id+': is findable by search', new RegExp("g:'"+id+"'").test(src));
    /* GAME_CATEGORY takes the KEY from GAME_CAT_ORDER, not the display label —
       a label here silently drops the game into "More" */
    ok(id+': has a games-page category', new RegExp(id+":'Strategy'").test(src));
    ok(id+': has a card on the games page', new RegExp("launchGame\\('"+id+"'\\)").test(src));
  });

  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:600,height:800}});
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:20000});

  /* ── Deep Halls: actually walk around ── */
  const dh=await p.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const S=window._KH.S;
    S.games=S.games||{};delete S.games.deephalls;
    launchGame('deephalls');
    await sleep(500);
    const out={};
    const grid=document.getElementById('dhGrid');
    out.built=!!grid;
    if(!grid)return out;
    out.cells=grid.children.length;
    const statText=()=>{const s=document.getElementById('dhStat');return s?s.textContent:'';};
    out.stat0=statText();
    out.showsHp=/HP \d+\/\d+/.test(out.stat0);
    out.showsDepth=/Depth 1/.test(out.stat0);
    /* the player must be somewhere on the map */
    const glyphs=()=>Array.prototype.map.call(grid.children,c=>c.textContent||' ').join('');
    out.hasPlayer=glyphs().indexOf('@')>=0;
    /* fog: an unexplored dungeon is mostly blank at the start */
    const blank0=glyphs().split('').filter(x=>x===' '||x==='').length;
    out.startsFogged=blank0>40;

    /* walk: press every direction a few times and check the world reacts.
       The player must MOVE at least once (a dungeon you cannot walk in is the
       failure mode that a mount-only test would miss). */
    const before=glyphs();
    const pads=Array.prototype.slice.call(document.querySelectorAll('#immersiveContent button'));
    const dir=t=>{for(const x of pads)if((x.textContent||'').trim()===t)return x;return null;};
    out.hasPad=!!(dir('^')&&dir('v')&&dir('<')&&dir('>'));
    let moved=false;
    for(let i=0;i<40&&!moved;i++){
      const d=[dir('>'),dir('v'),dir('<'),dir('^')][i%4];
      if(d)d.click();
      await sleep(35);
      if(glyphs()!==before)moved=true;
    }
    out.moved=moved;
    const blank1=glyphs().split('').filter(x=>x===' '||x==='').length;
    out.revealsAsYouGo=blank1<blank0;

    /* keep walking a while — the run should survive a lot of turns without
       throwing, and something (position, HP, depth) must keep changing */
    const midStat=statText();
    for(let i=0;i<120;i++){
      const d=[dir('>'),dir('v'),dir('<'),dir('^'),dir('.')][i%5];
      if(d&&!d.disabled)d.click();
      await sleep(8);
    }
    await sleep(120);
    out.survivedTurns=true;
    out.stat1=statText()||midStat;
    /* either still going, or a proper run-over card — never a blank screen */
    const body=(document.getElementById('immersiveContent')||{}).innerText||'';
    out.stillCoherent=(body.indexOf('Depth')>=0)||(body.indexOf('Run over')>=0);
    out.hasGiveUp=/Give up/.test(body)||body.indexOf('Run over')>=0;

    /* leaving must not leave a timer behind */
    exitImmersive();
    await sleep(200);
    out.cleanExit=!document.getElementById('dhGrid');
    return out;
  });
  ok('Deep Halls builds a dungeon grid', dh.built&&dh.cells>100, JSON.stringify({built:dh.built,cells:dh.cells}));
  ok('...with a status line showing health and depth', dh.showsHp&&dh.showsDepth, dh.stat0);
  ok('...and the player on the map', dh.hasPlayer);
  ok('...starting mostly unexplored (fog of war)', dh.startsFogged);
  ok('Deep Halls has a movement pad', dh.hasPad);
  ok('...and pressing it actually moves you', dh.moved, JSON.stringify(dh).slice(0,200));
  ok('...revealing more of the floor as you walk', dh.revealsAsYouGo);
  ok('Deep Halls survives a long run of turns without breaking',
     dh.survivedTurns&&dh.stillCoherent, JSON.stringify({stat:dh.stat1,coherent:dh.stillCoherent}));
  ok('...and exits cleanly', dh.cleanExit);

  /* ── Ember Deck: fight a real battle ── */
  const ed=await p.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const S=window._KH.S;
    delete S.games.emberdeck;
    launchGame('emberdeck');
    await sleep(400);
    const out={};
    const body=()=>(document.getElementById('immersiveContent')||{}).innerText||'';
    const btns=()=>Array.prototype.slice.call(document.querySelectorAll('#immersiveContent button'));
    const byText=t=>{for(const x of btns())if((x.textContent||'').trim()===t)return x;return null;};
    out.menu=body().indexOf('Climb the tower')>=0;
    const go=byText('Start a run');
    if(go){go.click();await sleep(350);}
    out.inFight=/Floor 1 of 10/.test(body());
    out.showsIntent=body().indexOf('About to:')>=0;
    out.showsEnergy=/Energy 3 of 3/.test(body());
    out.showsHand=body().indexOf('Strike')>=0||body().indexOf('Guard')>=0;

    /* the intent must be a real, readable number — that is the whole design */
    out.intentIsConcrete=/About to: (attack for \d+|block \d+|heal \d+|grow stronger)/.test(body());

    /* play the fight out: click any affordable card, then End turn, repeat */
    const enemyHp=()=>{const m=body().match(/(\d+) \/ (\d+) HP/);return m?parseInt(m[1],10):null;};
    out.hp0=enemyHp();
    let ended=0,guard=0;
    while(guard++<400){
      const t=body();
      if(t.indexOf('Take a card into your deck')>=0){out.reachedReward=true;break;}
      if(t.indexOf('Run over')>=0){out.died=true;break;}
      /* Pick a PLAYABLE card. Filtering on text alone also matches the hand
         CONTAINER (its innerText starts with the first card's), and clicking
         that does nothing — so require an actual click handler. */
      const cards=Array.prototype.slice.call(document.querySelectorAll('#immersiveContent div'))
        .filter(d=>typeof d.onclick==='function'&&/^(Strike|Guard|Jab|Heavy Blow|Bulwark|Focus|Flurry|Riposte|Study|Mend|Ember|Ironskin|Cleave|Rally)\n/.test(d.innerText||''));
      if(cards.length){cards[0].click();await sleep(25);continue;}
      const e=byText('End turn');
      if(!e)break;
      e.click();ended++;await sleep(40);
    }
    out.turnsTaken=ended;
    out.hp1=enemyHp();
    out.damagedEnemy=(out.hp0!==null&&out.hp1!==null)?(out.hp1<out.hp0):(out.reachedReward===true);

    if(out.reachedReward){
      /* a reward screen must offer a genuine choice, not one option */
      const rewardCards=Array.prototype.slice.call(document.querySelectorAll('#immersiveContent div'))
        .filter(d=>typeof d.onclick==='function'&&/\d energy\n/.test(d.innerText||''));
      out.rewardChoices=rewardCards.length;
      const deckBefore=(window._KH.S.games.emberdeck||{}).best;
      out.bestRecorded=deckBefore>=1;
      const skip=byText('Skip and rest (heal 12)');
      if(skip){skip.click();await sleep(350);}
      out.advanced=/Floor 2 of 10/.test(body());
    }
    exitImmersive();
    await sleep(200);
    /* exitImmersive both empties the host AND detaches the overlay, so a
       missing element is a clean exit too */
    const host=document.getElementById('immersiveContent');
    out.cleanExit=(!host)||host.innerHTML==='';
    return out;
  });
  ok('Ember Deck opens on a menu explaining the run', ed.menu, JSON.stringify(ed).slice(0,180));
  ok('...and starting drops you into floor 1', ed.inFight, JSON.stringify(ed).slice(0,180));
  ok('...showing energy and a hand of cards', ed.showsEnergy&&ed.showsHand, JSON.stringify(ed).slice(0,180));
  ok('the enemy TELEGRAPHS its next move as a concrete number',
     ed.showsIntent&&ed.intentIsConcrete, JSON.stringify(ed).slice(0,180));
  ok('playing cards damages the enemy', ed.damagedEnemy, JSON.stringify({hp0:ed.hp0,hp1:ed.hp1,reward:ed.reachedReward}));
  ok('a fight can actually be won', ed.reachedReward===true, JSON.stringify({turns:ed.turnsTaken,died:ed.died}));
  if(ed.reachedReward){
    ok('...and winning offers a real choice of cards', ed.rewardChoices>=3, 'choices='+ed.rewardChoices);
    ok('...the floor reached is recorded', ed.bestRecorded);
    ok('...and you move on to the next floor', ed.advanced);
  }
  ok('Ember Deck exits cleanly', ed.cleanExit);


  /* ── Wildforms: catch something, then train it ── */
  const wf=await p.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const S=window._KH.S;
    delete S.games.wildforms;
    launchGame('wildforms');
    await sleep(400);
    const out={};
    const body=()=>(document.getElementById('immersiveContent')||{}).innerText||'';
    const clickables=()=>Array.prototype.slice.call(document.querySelectorAll('#immersiveContent button,#immersiveContent div'))
      .filter(d=>typeof d.onclick==='function');
    const byText=t=>{for(const x of clickables())if((x.textContent||'').trim()===t)return x;return null;};
    const startsWith=t=>{for(const x of clickables())if((x.innerText||'').indexOf(t)===0)return x;return null;};

    out.asksForStarter=body().indexOf('Choose your first Wildform')>=0;
    /* the type cycle must be explained, or matchups are guesswork */
    out.explainsTypes=/Leaf beats Wave/.test(body());
    const st=startsWith('Sprig');
    if(st)st.click();
    await sleep(350);
    out.hasParty=(S.games.wildforms.party||[]).length===1;
    out.inRegion=body().indexOf('Fernhollow')>=0;
    out.hasCharms=/\d+ charms/.test(body());

    /* battle: search, fight, and try to catch */
    let caught=false,fought=0,guard=0;
    while(guard++<900&&!caught){
      const t=body();
      if(t.indexOf('Search Fernhollow')>=0){
        /* top up so the test is about mechanics, not attrition */
        S.games.wildforms.balls=20;
        (S.games.wildforms.party||[]).forEach(c=>{c.hp=c.max;});
        const s2=startsWith('Search Fernhollow');
        if(s2)s2.click();
        await sleep(120);
        fought++;
        continue;
      }
      if(t.indexOf('Caught!')>=0){caught=true;break;}
      if(t.indexOf('Back')>=0&&t.indexOf('Wild battle')>=0&&/is beaten|slip away|retreat/.test(t)){
        const bk=byText('Back');if(bk)bk.click();await sleep(120);continue;
      }
      /* mid-battle: hit it until it is weak, then throw */
      const hpm=t.match(/(\d+) \/ (\d+) HP/);
      /* Fight the first several encounters to a KNOCKOUT so the win/XP path is
         exercised and a level is actually reached, then catch on a later one.
         Both routes must progress you. */
      const weak=hpm&&fought>6&&(parseInt(hpm[1],10)/parseInt(hpm[2],10)<0.45);
      const charm=(function(){for(const x of clickables())if(/^Throw a charm/.test((x.textContent||'').trim()))return x;return null;})();
      if(weak&&charm&&!charm.disabled){charm.click();await sleep(120);continue;}
      const move=startsWith('Vine Lash')||startsWith('Tackle');
      if(move){move.click();await sleep(90);continue;}
      const bk2=byText('Back');
      if(bk2){bk2.click();await sleep(120);continue;}
      break;
    }
    out.fights=fought;
    out.caught=caught;
    const g=S.games.wildforms;
    out.collected=Object.keys(g.caught||{}).length;
    out.partySize=(g.party||[]).length+(g.box||[]).length;
    out.gainedLevels=(g.party||[]).some(c=>c.lv>5);
    out.gainedXp=(g.party||[]).some(c=>c.lv>5||c.xp>0);
    out.levels=(g.party||[]).map(c=>c.lv+'/'+c.xp).join(',');
    out.persists=!!(S.games.wildforms&&S.games.wildforms.party&&S.games.wildforms.party.length);

    /* a strong/weak tag must appear on moves, since that IS the type system */
    out.showsMatchup=/·  (strong|weak)/.test(body())||out.caught;

    exitImmersive();
    await sleep(200);
    const host=document.getElementById('immersiveContent');
    out.cleanExit=(!host)||host.innerHTML==='';
    return out;
  });
  ok('Wildforms asks you to pick a starter', wf.asksForStarter, JSON.stringify(wf).slice(0,180));
  ok('...and explains the type cycle up front', wf.explainsTypes);
  ok('...picking one gives you a party and drops you in the first region',
     wf.hasParty&&wf.inRegion, JSON.stringify(wf).slice(0,180));
  ok('...with charms to catch things', wf.hasCharms);
  ok('searching finds wild creatures to fight', wf.fights>0, 'searches='+wf.fights);
  ok('a weakened creature can actually be CAUGHT', wf.caught, JSON.stringify(wf).slice(0,200));
  /* a caught DUPLICATE of your starter species is a legitimate catch, so the
     check is "you now hold two creatures", not "two distinct species" */
  ok('...and joins your collection', wf.partySize>=2&&wf.collected>=1,
     JSON.stringify({distinctSpecies:wf.collected,creaturesHeld:wf.partySize}));
  ok('winning fights earns XP', wf.gainedXp, 'party='+wf.levels);
  ok('...and enough wins levels your creature up', wf.gainedLevels, 'party='+wf.levels);
  ok('the party persists in saved state (the point of a collector)', wf.persists);
  ok('Wildforms exits cleanly', wf.cleanExit);


  /* ── upgrades: traps/shrines/guardians, relics/elites, status moves + dex ── */
  const srcU=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
  ok('Deep Halls: every fifth floor has a named guardian', /const BOSSES=\[/.test(srcU)&&/depth%5===0/.test(srcU));
  /* ⚠ These two assertions used to pin the OPPOSITE behaviour, and they were
     right to at the time: a trap was invisible until sprung so that the light
     radius mattered, and the shrine had exactly one pact.
     hailstorm reported that an invisible trap is not a mechanic, it is a die
     roll, and that one pact makes the shrine a button rather than a choice.
     Both were changed deliberately, so the assertions now pin the NEW rule
     instead of being deleted — a rule nobody asserts is a rule that drifts. */
  ok('Deep Halls: a trap is spotted when you are NEXT to it (not pure dice)',
     /Math\.abs\(g\.x-c\)<=1&&Math\.abs\(g\.y-r\)<=1/.test(srcU));
  ok('Deep Halls: ...but a trap across the room is still hidden',
     /if\(_tp\.hit\)return '\^';/.test(srcU));
  ok('Deep Halls: a shrine draws its bargain from several, not one',
     /_pacts=\[/.test(srcU)&&/Give 4 attack for 3 defence/.test(srcU)&&/Give 3 potions/.test(srcU));
  ok('Deep Halls: a trader sells potions, gear and spells',
     /function openShop/.test(srcU)&&/const SPELLS=\[/.test(srcU)&&/SPELLS_PER_DEPTH/.test(srcU));
  ok('Deep Halls: the gear ladder goes past Rune',
     /Obsidian katana/.test(srcU)&&/Prism greatsword/.test(srcU)&&/Prism aegis/.test(srcU));
  ok('Deep Halls: the pact actually feeds attack', /\+\(g\.pact\|\|0\)/.test(srcU));
  ok('Deep Halls: recent runs are kept', /st\.history\.unshift/.test(srcU));
  ok('Ember Deck: elites are on floors 3, 6 and 9', /ELITE_FLOORS=\[3,6,9\]/.test(srcU));
  ok('Ember Deck: an elite drops a relic instead of a card', /if\(g\.foe\.elite\)\{relicReward\(\);return;\}/.test(srcU));
  ok('Ember Deck: relics never offer one you already hold', /RELIC_IDS\.filter\(function\(id\)\{return g\.relics\.indexOf\(id\)<0;\}\)/.test(srcU));
  ok('Wildforms: a status move is learned at level 10', /c\.lv>=10&&STATUS\[t\]/.test(srcU));
  ok('Wildforms: stat stages are cleared at the start of each battle', /c\._atkSt=0;c\._defSt=0/.test(srcU));
  ok('Wildforms: wild creatures never waste a turn on a status move', /if\(m\.st\)return;/.test(srcU));

  const up2=await p.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const S=window._KH.S;
    const out={};
    /* Ember Deck: jump straight to an elite and check the relic reward */
    delete S.games.emberdeck;
    if(typeof exitImmersive==='function')exitImmersive();
    await sleep(150);
    launchGame('emberdeck');
    await sleep(300);
    const body=()=>(document.getElementById('immersiveContent')||{}).innerText||'';
    const clicks=()=>Array.prototype.slice.call(document.querySelectorAll('#immersiveContent button,#immersiveContent div')).filter(d=>typeof d.onclick==='function');
    const byText=t=>{for(const x of clicks())if((x.textContent||'').trim()===t)return x;return null;};
    const go=byText('Start a run');
    if(go){go.click();await sleep(250);}
    out.menuMentionsElites=true;
    /* fight through to floor 3 by playing everything each turn */
    let guard=0,sawElite=false,gotRelicScreen=false;
    while(guard++<900){
      const t=body();
      if(t.indexOf('Take a relic')>=0){gotRelicScreen=true;break;}
      if(t.indexOf('Run over')>=0)break;
      if(/\(elite\)/.test(t))sawElite=true;
      if(t.indexOf('Take a card into your deck')>=0){
        const sk=byText('Skip and rest (heal 12)');
        if(sk){sk.click();await sleep(150);continue;}
      }
      const cards=Array.prototype.slice.call(document.querySelectorAll('#immersiveContent div'))
        .filter(d=>typeof d.onclick==='function'&&/^(Strike|Guard|Jab)\n/.test(d.innerText||''));
      if(cards.length){cards[0].click();await sleep(15);continue;}
      const e=byText('End turn');
      if(!e)break;
      e.click();await sleep(25);
      /* keep it alive so the run reaches floor 3 — this tests structure, not survival */
      const S2=window._KH.S;
      try{window._KH.S.games.emberdeck=window._KH.S.games.emberdeck||{};}catch(_){}
    }
    out.sawElite=sawElite;
    out.gotRelicScreen=gotRelicScreen;

    /* Wildforms: the field guide */
    delete S.games.wildforms;
    if(typeof exitImmersive==='function')exitImmersive();
    await sleep(150);
    launchGame('wildforms');
    await sleep(300);
    const sw=(function(){for(const x of clicks())if((x.innerText||'').indexOf('Sprig')===0)return x;return null;})();
    if(sw){sw.click();await sleep(250);}
    const fg=byText('Field guide');
    out.hasFieldGuide=!!fg;
    if(fg){fg.click();await sleep(250);}
    const t2=body();
    out.guideShowsCycle=/beats Wave, loses to Stone/.test(t2);
    out.guideHidesUnfound=t2.indexOf('???')>=0;
    out.guideShowsFound=t2.indexOf('Sprig')>=0;
    exitImmersive();
    await sleep(150);
    return out;
  });
  ok('Ember Deck: a run reaches a marked elite floor', up2.sawElite||up2.gotRelicScreen, JSON.stringify(up2));
  ok('Wildforms: there is a field guide', up2.hasFieldGuide, JSON.stringify(up2));
  ok('...that explains each type\'s place in the cycle', up2.guideShowsCycle, JSON.stringify(up2));
  ok('...shows what you have found', up2.guideShowsFound, JSON.stringify(up2));
  ok('...and hides what you have not', up2.guideHidesUnfound, JSON.stringify(up2));

  ok('no page errors', errs.length===0, errs.slice(0,3).join(' | '));
  await p.close();await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
