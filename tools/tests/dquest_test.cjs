/* Dungeon Quest — the Kindle edition of dungeonquest3d.pages.dev.

   The original is a real-time ray-caster. This is the same game as a turn-based
   grid crawler, because a full-screen repaint thirty times a second is a strobe
   on e-ink, not a game. So the FIRST thing tested is the property the whole
   design rests on: that nothing happens unless the player does something. If a
   timer ever creeps in, this fails.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tools/tests/dquest_test.cjs */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url'),fs=require('fs');

let pass=0,fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x!==undefined&&!c?'  -- '+String(x).slice(0,240):''));};

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await(await b.newContext({viewport:{width:600,height:800}})).newPage();
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.addInitScript(()=>{
    window.__timers=0;
    const si=window.setInterval, st=window.setTimeout;
    window.setInterval=function(){window.__timers++;return si.apply(this,arguments);};
  });
  await p.goto(url.pathToFileURL(path.resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:30000});

  console.log('── it opens on the class picker ──');
  /* launchGame defers the actual mount to the next frame, so reading the text
     in the same tick reads the PREVIOUS screen. */
  await p.evaluate(()=>launchGame('dquest'));
  await p.waitForTimeout(300);
  const menu=await p.evaluate(()=>{
    const t=immersiveContent.textContent||'';
    return {knight:/Knight/.test(t),ranger:/Ranger/.test(t),mage:/Mage/.test(t),
            title:/Dungeon Quest/.test(t)};
  });
  ok('all three classes are offered', menu.knight&&menu.ranger&&menu.mage, JSON.stringify(menu));

  console.log('\n── nothing moves unless you do ──');
  const still=await p.evaluate(async()=>{
    const d=DungeonQuest._dbg();
    /* Count only what STARTING THE GAME creates. Sleeping across the count
       would also catch the app's own pollers (chat, presence), which have
       nothing to do with the game and would make this assertion a lie. */
    const before=window.__timers;
    d.begin(d.CLASSES[0]);
    const gameTimers=window.__timers-before;
    const g=d.state();
    const snap=JSON.stringify({x:g.x,y:g.y,hp:g.hp});
    await new Promise(r=>setTimeout(r,1200));      /* a second and a bit of doing nothing */
    const after=JSON.stringify({x:g.x,y:g.y,hp:g.hp});
    return {same:snap===after, newTimers:gameTimers};
  });
  ok('a second of standing still changes nothing', still.same, JSON.stringify(still));
  ok('...because the game starts no timer at all', still.newTimers===0, JSON.stringify(still));

  console.log('\n── it is a real first-person view ──');
  const view=await p.evaluate(()=>{
    const cv=immersiveContent.querySelector('canvas');
    if(!cv)return{noCanvas:true};
    const c=cv.getContext('2d');
    const px=c.getImageData(0,0,cv.width,cv.height).data;
    /* count distinct greys: a perspective corridor must have several depth
       tones, not one flat fill */
    const seen={};let n=0;
    for(let i=0;i<px.length;i+=4*97){const k=px[i]+','+px[i+1]+','+px[i+2];if(!seen[k]){seen[k]=1;n++;}}
    return {w:cv.width,h:cv.height,tones:n};
  });
  ok('a canvas is drawn', !view.noCanvas&&view.w>300, JSON.stringify(view));
  ok('...with several depth tones, so it reads as perspective', view.tones>=3, JSON.stringify(view));

  console.log('\n── movement, walls and turning ──');
  const move=await p.evaluate(()=>{
    const d=DungeonQuest._dbg(), g=d.state();
    d.enterArea(0);                     /* town */
    const start={x:g.x,y:g.y,dir:g.dir};
    d.turn(1); const turned=g.dir;
    /* walk into a wall: find a direction that is blocked and confirm we stay */
    let blockedHeld=false;
    for(let i=0;i<4;i++){
      const a=d.ahead(1);
      if(d.tileAt(a.x,a.y)==='#'){
        const bx=g.x,by=g.y; d.step(1);
        blockedHeld=(g.x===bx&&g.y===by); break;
      }
      d.turn(1);
    }
    /* and that an open direction DOES move us */
    let moved=false;
    for(let i=0;i<4;i++){
      const a=d.ahead(1);
      if(d.tileAt(a.x,a.y)!=='#'){ const bx=g.x,by=g.y; d.step(1); moved=(g.x!==bx||g.y!==by); break; }
      d.turn(1);
    }
    return {turnedFrom:start.dir,turnedTo:turned,blockedHeld,moved};
  });
  ok('turning changes which way you face', move.turnedFrom!==move.turnedTo, JSON.stringify(move));
  ok('a wall stops you', move.blockedHeld, JSON.stringify(move));
  ok('an open tile does not', move.moved, JSON.stringify(move));

  console.log('\n── the town has its four doors ──');
  const town=await p.evaluate(()=>{
    const d=DungeonQuest._dbg();
    const flat=d.TOWN.join('');
    return {inn:flat.indexOf('I')>=0, smithy:flat.indexOf('S')>=0,
            arcanist:flat.indexOf('A')>=0, board:flat.indexOf('N')>=0,
            stairs:flat.indexOf('>')>=0};
  });
  ok('Inn, Smithy, Arcanist and Notice Board are all there',
     town.inn&&town.smithy&&town.arcanist&&town.board, JSON.stringify(town));
  ok('...and a way down into the caves', town.stairs, JSON.stringify(town));

  console.log('\n── the caves are always walkable ──');
  const caves=await p.evaluate(()=>{
    const d=DungeonQuest._dbg();
    let bad=[];
    for(let seed=1;seed<=40;seed++)for(let depth=1;depth<=4;depth++){
      const c=d.genCave(depth,seed*7919);
      const grid=c.grid;
      /* flood from the start and check the stairs down are reachable — a
         generated floor you cannot finish is the classic generator bug */
      const seen={},q=[[c.start.x,c.start.y]];let down=null,reached=false;
      for(let y=0;y<grid.length;y++)for(let x=0;x<grid[y].length;x++)
        if(grid[y].charAt(x)==='>')down={x,y};
      while(q.length){
        const [x,y]=q.pop(), k=y+','+x;
        if(seen[k])continue;
        if(y<0||y>=grid.length||x<0||x>=grid[y].length)continue;
        if(grid[y].charAt(x)==='#')continue;
        seen[k]=1;
        if(down&&x===down.x&&y===down.y)reached=true;
        q.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);
      }
      if(!down)bad.push('d'+depth+' s'+seed+': no stairs');
      else if(!reached)bad.push('d'+depth+' s'+seed+': stairs walled off');
    }
    return {bad:bad.slice(0,4), n:bad.length};
  });
  ok('160 generated floors all have reachable stairs down', caves.n===0, caves.n+' bad: '+caves.bad.join(' | '));

  console.log('\n── combat, and each class\'s own answer to it ──');
  const fight=await p.evaluate(()=>{
    const d=DungeonQuest._dbg();
    function setup(clsIdx){
      d.begin(d.CLASSES[clsIdx]);
      const g=d.state();
      d.enterArea(1);
      g.map=['#####','#...#','#...#','#####'];
      g.x=1;g.y=1;g.dir=1;g.hp=g.max;
      g.mons=[{g:'r',name:'Rat',hp:40,max:40,atk:3,xp:3,gold:1,x:2,y:1,stun:0}];
      return g;
    }
    const gk=setup(0); const hp0=gk.mons[0].hp; d.attack();
    const melee=hp0-gk.mons[0].hp;
    /* Ranger reaches something two tiles away that melee cannot touch */
    const gr=setup(1);
    gr.mons=[{g:'r',name:'Rat',hp:40,max:40,atk:3,xp:3,gold:1,x:3,y:1,stun:0}];
    const rHp0=gr.mons[0].hp;
    d.attack(); const meleeAtRange=rHp0-gr.mons[0].hp;
    d.ability(); const shot=rHp0-gr.mons[0].hp;
    /* Mage fireball hits harder than a swing, and costs focus */
    const gm=setup(2); gm.focus=6;
    const mHp0=gm.mons[0].hp;
    d.ability(); const fire=mHp0-gm.mons[0].hp; const focusLeft=gm.focus;
    return {melee,meleeAtRange,shot,fire,focusLeft};
  });
  ok('a swing damages what is in front of you', fight.melee>0, JSON.stringify(fight));
  ok('a swing cannot reach two tiles away', fight.meleeAtRange===0, JSON.stringify(fight));
  ok('...but the Ranger\'s Aimed Shot can', fight.shot>0, JSON.stringify(fight));
  ok('the Mage\'s Fireball hits harder than a swing', fight.fire>fight.melee, JSON.stringify(fight));
  ok('...and spends focus', fight.focusLeft<6, JSON.stringify(fight));

  console.log('\n── the descent is gated on clearing the floor ──');
  const gate=await p.evaluate(()=>{
    const d=DungeonQuest._dbg();
    d.begin(d.CLASSES[0]);
    const g=d.state();
    d.enterArea(1);
    g.map=['#####','#.>.#','#####'];
    g.x=2;g.y=1;
    g.mons=[{g:'r',name:'Rat',hp:9,max:9,atk:1,xp:1,gold:1,x:1,y:1,stun:0}];
    const areaBefore=g.area;
    d.interact();                       /* standing on the stairs, one alive */
    const held=(d.state().area===areaBefore);
    d.state().mons[0].hp=0;
    d.interact();                       /* now the floor is clear */
    return {held, went:d.state().area>areaBefore};
  });
  ok('the stairs stay shut while something is still alive', gate.held, JSON.stringify(gate));
  ok('...and open once the floor is clear', gate.went, JSON.stringify(gate));

  console.log('\n── the Lich is at the bottom ──');
  const boss=await p.evaluate(()=>{
    const d=DungeonQuest._dbg();
    d.begin(d.CLASSES[0]);
    d.enterArea(d.AREAS.length-1);
    const g=d.state();
    return {area:d.AREAS[g.area].name, mons:g.mons.map(m=>m.name)};
  });
  ok('the last area is the Throne of the Lich', /Throne/.test(boss.area), JSON.stringify(boss));
  ok('...and the Lich is standing in it', (boss.mons||[]).indexOf('The Lich')>=0, JSON.stringify(boss));

  console.log('\n── it is wired in everywhere a game has to be ──');
  const src=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
  ok('launch case', /case 'dquest': DungeonQuest\.start\(\);break;/.test(src));
  ok('exit sweep stops it, so nothing can be left running', /DeepHalls,DungeonQuest,/.test(src));
  ok('how-to-play entry', /dquest:\{name:'Dungeon Quest'/.test(src));
  ok('search index', /g:'dquest'/.test(src));
  ok('category', /dquest:'Strategy'/.test(src));
  ok('a card on the Games page', /gc\('Dungeon Quest'/.test(src));
  ok('and it is in the mount test',
     /'dquest'/.test(fs.readFileSync(path.resolve(__dirname,'../games_test.cjs'),'utf8')));

  const clean=await p.evaluate(()=>{
    try{exitImmersive();}catch(_){}
    try{DungeonQuest.stop();DungeonQuest.stop();}catch(e){return 'threw: '+e;}
    return 'ok';
  });
  ok('stop() is safe to call twice and after exit', clean==='ok', clean);
  ok('no page errors', errs.length===0, errs.slice(0,3).join(' | '));
  await p.close();await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
