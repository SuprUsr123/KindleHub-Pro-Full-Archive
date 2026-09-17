/* Pixel Hop — is every platform actually REACHABLE?

   The user reported "impossible to jump onto platforms" and they were right in
   the literal sense: a jump from the ground topped out at player-top y=128.9,
   and standing on a floater whose top is y=150 needs the player top to reach
   150-22 = 128. It missed by nine tenths of a pixel. A mount test cannot see
   that, and neither can a play test that taps Jump a few times and calls the
   result "hard".

   So this mirrors tick()'s exact integration — same order of operations, same
   clamps — reads the real constants and level tables straight out of the running
   bundle, and asserts each floater can be landed on from the ground beside it.
   If someone retunes GRAV/JUMP or lowers a platform, this fails.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tools/tests/platformer_test.cjs */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url');

let pass=0,fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x!==undefined&&!c?'  -- '+String(x).slice(0,220):''));};

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await(await b.newContext({viewport:{width:600,height:800}})).newPage();
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:30000});

  /* The constants and levels are closure-scoped, so read them from a live game
     rather than re-declaring numbers here — a copy would drift silently. */
  await p.evaluate(()=>{ Platformer.start(); });
  const info=await p.evaluate(()=>{
    const d=Platformer._dbg?Platformer._dbg():null;
    return d?d.geom():null;
  });
  ok('the game exposes its geometry for testing', !!info, JSON.stringify(info));
  if(!info){ await p.close(); await b.close(); console.log('\n'+pass+' passed, '+(fail+1)+' failed'); process.exit(1); }

  const {GRAV,JUMP,PH,PW,MAXVX,MOVE,FRICT,AIR_FRICT,GROUND_TOP,levels}=info;
  console.log('   GRAV='+GRAV+' JUMP='+JUMP+' MAXVX='+MAXVX+' AIR_FRICT='+AIR_FRICT);

  /* Same integration as tick(): gravity, clamp, move, then resolve. */
  function apexFromGround(){
    let y=GROUND_TOP-PH, vy=JUMP, min=y;
    for(let i=0;i<400;i++){ vy+=GRAV; if(vy>14)vy=14; y+=vy; if(y<min)min=y; if(vy>0&&y>=GROUND_TOP-PH)break; }
    return min;
  }
  const apex=apexFromGround();
  console.log('   apex from ground: player-top y='+apex.toFixed(1)+' (rise '+((GROUND_TOP-PH)-apex).toFixed(1)+'px)');

  let unreachable=[], tight=[];
  levels.forEach((L,li)=>{
    L.plats.forEach(pl=>{
      if(pl.y>=GROUND_TOP)return;                 /* that's the ground itself */
      const need=pl.y-PH;                         /* player top when standing on it */
      const clear=need-apex;                      /* positive = we get above it */
      if(clear<0)unreachable.push('L'+(li+1)+' y='+pl.y+' short by '+(-clear).toFixed(1)+'px');
      else if(clear<6)tight.push('L'+(li+1)+' y='+pl.y+' only '+clear.toFixed(1)+'px');
    });
  });
  ok('every floating platform can be reached from the ground', unreachable.length===0, unreachable.join(' | '));
  ok('...with more than a pixel of margin, not by luck', tight.length===0, tight.join(' | '));

  /* Horizontal reach has to survive the whole hop too: the one-tap Jump buttons
     hold a direction and the arc must still cross the widest pit. */
  function hopDistance(){
    let y=GROUND_TOP-PH, vy=JUMP, vx=MAXVX, x=0;
    for(let i=0;i<400;i++){
      vx=Math.min(MAXVX,vx+MOVE);                 /* direction held for the hop */
      x+=vx; vy+=GRAV; if(vy>14)vy=14; y+=vy;
      if(vy>0&&y>=GROUND_TOP-PH)break;
    }
    return x;
  }
  const reach=hopDistance();
  let widest=0,where='';
  levels.forEach((L,li)=>{
    const ground=L.plats.filter(q=>q.y>=GROUND_TOP).sort((a,b)=>a.x-b.x);
    for(let i=0;i+1<ground.length;i++){
      const gap=ground[i+1].x-(ground[i].x+ground[i].w);
      if(gap>widest){widest=gap;where='level '+(li+1);}
    }
  });
  console.log('   widest pit '+widest+'px in '+where+', a full hop covers '+reach.toFixed(0)+'px');
  ok('every pit is jumpable', reach>widest+PW, 'reach '+reach.toFixed(0)+' vs pit '+widest);

  /* And prove it in the real game, not only on paper: drive the actual loop. */
  const climbed=await p.evaluate((geo)=>{
    const d=Platformer._dbg();
    d.reset();                       /* level 1, at spawn */
    const g=d.state();
    const floor=geo.GROUND_TOP-geo.PH;
    /* Level 1's first floater is x=250..330, top y=150. Run at it and hop. */
    let landedHigh=false,best=999;
    for(let t=0;t<300;t++){
      g.right=true; g.left=false;
      if(g.x>190&&g.x<250&&g.onGround)g.jbuf=geo.JBUF;
      d.tick();
      if(g.y<best)best=g.y;
      if(g.onGround&&g.y<floor-10){landedHigh=true;break;}
    }
    return {landedHigh:landedHigh,y:Math.round(g.y),x:Math.round(g.x),highest:Math.round(best),floor:floor};
  },{GROUND_TOP,PH,JBUF:info.JBUF}).catch(e=>({err:String(e)}));
  ok('driving the real loop, the player lands on a raised platform',
     climbed&&climbed.landedHigh===true, JSON.stringify(climbed));

  ok('no page errors', errs.length===0, errs.slice(0,3).join(' | '));
  await p.evaluate(()=>{try{Platformer.stop();}catch(_){}}); 
  await p.close();await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
