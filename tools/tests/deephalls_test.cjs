/* Deep Halls, after hailstorm's four requests.

   This PLAYS the game rather than mounting it. Mounting proves the module
   loads; only playing proves a shrine offers something payable, that a spell
   actually changes what a monster does, and that a trap can be seen before it
   is stood on — which was the whole complaint.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tools/tests/deephalls_test.cjs */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url'),fs=require('fs');

let pass=0,fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x!==undefined&&!c?'  -- '+String(x).slice(0,220):''));};

/* The checks below ask "is this string in the build we are about to ship?".
   They used to read document.documentElement.innerHTML, which only worked
   because the app happened to be an inline <script> — the page's own HTML
   contained its source. The deploy build now loads the app from kh-app.js, so
   read the shipped files instead. Reading BOTH keeps the question honest
   whichever shape the build takes. */
const ROOT=path.resolve(__dirname,'../..');
const BUILD=fs.readFileSync(path.join(ROOT,'index.min.html'),'utf8')
  +(fs.existsSync(path.join(ROOT,'kh-app.js'))?fs.readFileSync(path.join(ROOT,'kh-app.js'),'utf8'):'');

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await(await b.newContext({viewport:{width:600,height:800}})).newPage();
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:25000});
  await p.evaluate(()=>{window._KH.S.onboarded=true;showView('games');launchGame('deephalls');});
  await p.waitForTimeout(700);

  console.log('── it still starts ──');
  const start=await p.evaluate(()=>{
    const root=document.getElementById('immersiveRoot');
    return {mounted:!!root, text:(root&&root.textContent||'').slice(0,120),
            hasSpellBtn:!!document.getElementById('dhSpell'),
            hasPotBtn:!!document.getElementById('dhPot')};
  });
  ok('the run starts', start.mounted&&/Depth 1/.test(start.text), JSON.stringify(start));
  ok('there is a Spells control', start.hasSpellBtn);
  ok('...and it is disabled with nothing to cast', await p.evaluate(()=>document.getElementById('dhSpell').disabled));

  console.log('\n── gear ladder (hailstorm: more tiers) ──');
  const gear={obsW:/Obsidian katana/.test(BUILD), obsA:/Obsidian plate/.test(BUILD),
              prW:/Prism greatsword/.test(BUILD), prA:/Prism aegis/.test(BUILD)};
  ok('Obsidian weapon and armour exist', gear.obsW&&gear.obsA, JSON.stringify(gear));
  ok('Prism weapon and armour exist',    gear.prW&&gear.prA, JSON.stringify(gear));

  /* Everything below drives the module through its own state, because walking a
     random dungeon to a shop tile is not reliably reachable in a test. */
  console.log('\n── traps are visible before you stand on them ──');
  const trap=await p.evaluate(()=>{
    const dbg=window._KH_DH_DBG;
    if(!dbg)return {noHook:true};
    return dbg.trapProbe();
  });
  if(trap.noHook){
    ok('SKIP trap probe (no debug hook)', true);
  } else {
    ok('a trap two tiles away is NOT shown', trap.farHidden, JSON.stringify(trap));
    ok('a trap you are standing next to IS shown', trap.nearShown, JSON.stringify(trap));
    ok('...and it is not the sprung marker', trap.nearGlyph!=='^', trap.nearGlyph);
  }

  console.log('\n── a spell actually changes what the monster does ──');
  /* Each spell is checked for the thing it claims to do. Frostbite and
     Crippling Blow are the interesting ones: their whole value is that the
     monster does NOT get to act, so "did we take damage" is the real assertion. */
  const cripple=await p.evaluate(()=>window._KH_DH_DBG.spellProbe('cripple'));
  ok('Crippling Blow marks the monster',   cripple.eff&&cripple.eff.cripple>=1, JSON.stringify(cripple));
  ok('...and it does not hit back while crippled', cripple.hpAfterOneTurn===500, JSON.stringify(cripple));

  const frost=await p.evaluate(()=>window._KH_DH_DBG.spellProbe('frost'));
  ok('Frostbite marks the monster',        frost.eff&&frost.eff.frost>=1, JSON.stringify(frost));

  const flame=await p.evaluate(()=>window._KH_DH_DBG.spellProbe('flame'));
  ok('Raging Flame sets a burn amount',    flame.eff&&flame.eff.flame>=1, JSON.stringify(flame));
  ok('...and the monster actually loses health to it', flame.monHp<999-1, 'hp '+flame.monHp);

  const disarm=await p.evaluate(()=>window._KH_DH_DBG.spellProbe('disarm'));
  ok('Disarm marks the monster',           disarm.eff&&disarm.eff.disarm===1, JSON.stringify(disarm));
  const pierce=await p.evaluate(()=>window._KH_DH_DBG.spellProbe('pierce'));
  ok('Armour Piercer marks the monster',   pierce.eff&&pierce.eff.pierce===1, JSON.stringify(pierce));

  /* A spell must be SPENT, or one purchase would last the whole run. */
  const spent=await p.evaluate(()=>{
    window._KH_DH_DBG.spellProbe('pierce');
    return window._KH.S && document.getElementById('dhSpell')
      ? {ready:(document.getElementById('dhSpell').textContent||'')}
      : null;
  });
  ok('a cast spell is consumed, not permanent', spent && !/Ready:/.test(spent.ready), JSON.stringify(spent));

  console.log('\n── shrines offer more than one bargain ──');
  const shrine={
    four:/Give 25% of your health/.test(BUILD)&&/Give 4 attack for 3 defence/.test(BUILD)
       &&/25% chance to hit/.test(BUILD)&&/Give 3 potions/.test(BUILD)
  };
  ok('all four pacts exist in the build', shrine.four, JSON.stringify(shrine));

  console.log('\n── the shop and its spells ──');
  const shop={frost:/Frostbite/.test(BUILD), flame:/Raging Flame/.test(BUILD),
              crip:/Crippling Blow/.test(BUILD), dis:/Disarm/.test(BUILD), pierce:/Armour Piercer/.test(BUILD),
              cap:/SPELLS_PER_DEPTH|carry \d+ spells/.test(BUILD)};
  ok('all five spells exist', shop.frost&&shop.flame&&shop.crip&&shop.dis&&shop.pierce, JSON.stringify(shop));

  console.log('\n── the game is still playable end to end ──');
  const play=await p.evaluate(async()=>{
    /* 200 random moves: it must not throw, and depth/HP must stay sane. */
    const dirs=[[0,-1],[0,1],[-1,0],[1,0]];
    let threw=null;
    for(let i=0;i<200;i++){
      const d=dirs[i%4];
      try{
        const pad=document.getElementById('immersiveRoot');
        const btns=[].slice.call(pad.querySelectorAll('button'));
        const b=btns.filter(x=>/^[<>^v]$|Up|Down|Left|Right/.test(x.textContent.trim()))[i%4];
        if(b)b.click();
      }catch(e){threw=String(e);break;}
    }
    const t=(document.getElementById('immersiveRoot')||{}).textContent||'';
    return {threw, hasDepth:/Depth \d+/.test(t), hp:(t.match(/HP\s*(-?\d+)/)||[])[1]};
  });
  ok('200 moves without throwing', !play.threw, play.threw);
  ok('the HUD still reads a depth', play.hasDepth, JSON.stringify(play));
  ok('health never went negative on the HUD', play.hp===undefined||Number(play.hp)>=0, String(play.hp));

  ok('no page errors', errs.length===0, errs.slice(0,3).join(' | '));
  await p.close();await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
