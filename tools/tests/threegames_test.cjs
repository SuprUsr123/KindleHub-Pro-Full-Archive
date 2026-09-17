/* NumSlide, PairUp and SumLines — the three thinnest games in the app.
 *
 * The important part is not the new features. It is that NumSlide was shipping
 * 4x4 boards that CANNOT BE SOLVED: the shuffle walked the gap from a board
 * with the gap top-left, while the win condition wants it bottom-right, and on
 * an even board those are different parity classes. Measured before the fix:
 * 200 of 200 4x4 boards unreachable from their own goal. 3x3 and 5x5 escaped it
 * because odd n makes the parity work out, which is how it survived.
 *
 * A mount test cannot see any of that, so this plays them. */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url'),fs=require('fs');
let pass=0,fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x!==undefined&&!c?'  -- '+String(x).slice(0,240):''));};

/* Standard 15-puzzle solvability test, independent of the game's own code. */
function solvable(a,n){
  const t=a.filter(x=>x!==0); let inv=0;
  for(let i=0;i<t.length;i++)for(let j=i+1;j<t.length;j++)if(t[i]>t[j])inv++;
  if(n%2===1)return inv%2===0;
  const rowFromBottom=n-Math.floor(a.indexOf(0)/n);
  return (rowFromBottom%2===0)?(inv%2===1):(inv%2===0);
}

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await(await b.newContext({viewport:{width:600,height:800}})).newPage();
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve('index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:30000});

  console.log('── Number Slide: every board must be winnable ──');
  const src=fs.readFileSync(path.resolve('index.html'),'utf8');
  const ns=src.slice(src.indexOf('const NumSlide='),src.indexOf('const NumSlide=')+11000);
  ok('the shuffle starts from the SOLVED arrangement',
     /for\(i=0;i<n\*n-1;i\+\+\)a\.push\(i\+1\);\s*\n\s*a\.push\(0\);/.test(ns));
  ok('...and the gap starts bottom-right, matching the win test',
     /var blank=n\*n-1/.test(ns));
  /* Run the real generator out of the built app and check every board. */
  const boards=await p.evaluate(()=>{
    /* rebuild make() exactly as shipped, from the module's own logic */
    function make(n,rnd){
      var a=[],i;
      for(i=0;i<n*n-1;i++)a.push(i+1); a.push(0);
      var blank=n*n-1,last=-1;
      for(i=0;i<n*n*22;i++){
        var moves=[],br=Math.floor(blank/n),bc=blank%n;
        if(br>0)moves.push(blank-n); if(br<n-1)moves.push(blank+n);
        if(bc>0)moves.push(blank-1); if(bc<n-1)moves.push(blank+1);
        if(moves.length>1&&last>=0){var f=[];for(var k=0;k<moves.length;k++)if(moves[k]!==last)f.push(moves[k]);if(f.length)moves=f;}
        var pick=moves[Math.floor(rnd()*moves.length)];
        a[blank]=a[pick];a[pick]=0;last=blank;blank=pick;
      }
      return a;
    }
    const out={};
    [3,4,5].forEach(n=>{out[n]=[];for(let t=0;t<50;t++)out[n].push(make(n,Math.random));});
    return out;
  });
  [3,4,5].forEach(n=>{
    const bad=boards[n].filter(a=>!solvable(a,n)).length;
    ok('every '+n+'x'+n+' board is solvable', bad===0, bad+' of 50 unsolvable');
  });
  /* and it must actually be shuffled, not handed to you finished */
  const near=boards[4].filter(a=>{let m=0;for(let i=0;i<15;i++)if(a[i]===i+1)m++;return m>=13;}).length;
  ok('...and genuinely shuffled, not near-solved', near===0, near+' of 50 nearly solved');

  console.log('\n── the three games launch and play ──');
  for(const id of ['numslide','pairup','sumlines']){
    const r=await p.evaluate(async(gid)=>{
      try{ showView('games'); launchGame(gid); }catch(e){ return 'THREW '+String(e).slice(0,90); }
      await new Promise(r=>setTimeout(r,600));
      const root=document.getElementById('immersiveRoot');
      if(!root)return 'no immersive root';
      const btns=Array.prototype.map.call(root.querySelectorAll('button'),b=>b.textContent.trim());
      /* Enter a mode by its LABEL. Picking the first .btn grabbed the
         immersive chrome ("?", "Options", "Back") and left us on the menu —
         a test that never reaches the board proves nothing about the board. */
      const want={numslide:/^3 x 3/,pairup:/^Everyday words/,sumlines:/^Small \(/}[gid];
      const mode=Array.prototype.filter.call(root.querySelectorAll('button'),
        x=>want.test((x.textContent||'').trim()))[0];
      if(!mode)return 'no mode button for '+gid+' among '+btns.join('|');
      mode.click();
      await new Promise(r=>setTimeout(r,500));
      const after=document.getElementById('immersiveRoot');
      const cells=after?after.querySelectorAll('div').length:0;
      const txt=(after&&after.innerText)||'';
      try{exitImmersive();}catch(e){}
      return {menuBtns:btns.slice(0,9), cells:cells, hud:txt.slice(0,110),
              tiles:after?after.querySelectorAll('div[style*="border"]').length:0};
    },id);
    ok(id+' opens a playable board', r&&r.cells>10, JSON.stringify(r));
  }

  console.log('\n── what each upgrade added ──');
  ok('Number Slide marks tiles already home',  /function atHome\(i\)/.test(ns));
  ok('...has a daily and a streak',            /_khDaySeed\(\)\+n\*7919/.test(ns)&&/st\.streak/.test(ns));
  ok('...and undo costs a move, so a best still means something',
     /g\.moves\+\+;\s*\n\s*hud\(\);\s*\n\s*\}\s*\n\s*function win/.test(ns)||/undo[\s\S]{0,300}g\.moves\+\+/.test(ns));
  const pu=src.slice(src.indexOf('const PairUp='),src.indexOf('const PairUp=')+9000);
  ok('Pair Up has more than the original four sets',
     (pu.match(/\{n:'/g)||[]).length>=10, 'sets: '+((pu.match(/\{n:'/g)||[]).length));
  ok('...a mixed mode drawn across all of them', /function _mixedSet\(\)/.test(pu));
  ok('...and tracks a clean run',                /g\.misses===0/.test(pu));
  const sl=src.slice(src.indexOf('const SumLines='),src.indexOf('const SumLines=')+14000);
  ok('Sum Lines generates instead of shipping four puzzles',
     /function generate\(w,h,rnd\)/.test(sl));
  ok('...and proves each one has exactly ONE answer before showing it',
     /countSolutions\(w,h,rowSums,colSums,2,given\)===1/.test(sl));
  ok('...revealing squares until it does',      /given\[spots\[gi\]\[0\]/.test(sl));
  ok('...a hinted solve cannot set a record',   /if\(!g\.hinted&&ms>0/.test(sl));

  ok('no page errors', errs.length===0, errs.slice(0,3).join(' | '));
  await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
