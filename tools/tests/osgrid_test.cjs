/* "On Kindle there should be 16 apps per page but there are 12."

   iconsPerPage() subtracted 22px for the page dots on top of the page's own
   26px bottom padding, which already reserves them. On a screen with just
   enough room for four rows that double-reserve took one away — hence twelve
   icons and a row of dead space above the dock. The plan now also shrinks the
   tile a little, but only when that is what buys the fourth row. */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url'),fs=require('fs');

const SIZES=[
  /* height, the fewest icons a page must hold */
  [690,16],   /* the short Kindle viewport that was showing 12 */
  [700,16],
  [800,20],   /* taller screens keep their extra rows */
];

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  let ok=true;const rows=[];
  for(const [h,want] of SIZES){
    const p=await b.newPage({viewport:{width:600,height:h}});
    const errs=[];p.on('pageerror',e=>errs.push(String(e)));
    await p.goto(url.pathToFileURL(path.resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
    await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:20000});
    const r=await p.evaluate(async()=>{
      const sleep=ms=>new Promise(r=>setTimeout(r,ms));
      window._KH.S.onboardingDone=true;
      window.launchKindleDesktop();await sleep(1500);
      const root=document.getElementById('kd-root');
      const un=root?Array.prototype.filter.call(root.querySelectorAll('*'),
        x=>/swipe up|unlock|slide/i.test((x.textContent||'').trim())&&x.children.length===0)[0]:null;
      if(un){un.click();await sleep(800);}
      await sleep(1400);
      const cell=root&&root.querySelector('[data-kd-app],[data-kd-folder]');
      const page=cell&&cell.parentNode;
      const track=page&&page.parentNode;
      const counts=track?Array.prototype.slice.call(track.children)
        .map(pg=>pg.querySelectorAll('[data-kd-app],[data-kd-folder]').length):[];
      /* A full page must not overflow its own box — clipping a row would trade
         one bug for another. */
      let overflows=false;
      if(track)Array.prototype.forEach.call(track.children,pg=>{
        if(pg.scrollHeight>pg.clientHeight+2)overflows=true;
      });
      return {per:Math.max.apply(null,counts.concat([0])),cellH:cell?cell.offsetHeight:0,overflows:overflows};
    });
    const pass=r.per>=want&&!r.overflows&&errs.length===0;
    if(!pass)ok=false;
    rows.push({height:h,want:want,got:r.per,cellH:r.cellH,overflows:r.overflows,errs:errs.length,pass:pass});
    await p.close();
  }
  console.log(JSON.stringify(rows,null,1));

  const src=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
  /* A coloured square with a letter in it is not an icon. On a grid where
     everything else is drawn it reads as one that failed to load, which is what
     "a whole ton of apps have no icons" meant — every app DID have something,
     it just was not artwork. Every NAV_TABS view without a hand-made
     BUILTIN_APPS entry now has real line art; the letter stays only as the
     fallback for a view added later, so nothing can render blank. */
  const artBlock=(src.match(/var _OS_AUTO_ART=\{([\s\S]*?)\n  \};/)||[''])[1]||'';
  const artKeys=(artBlock.match(/\n\s+([a-z0-9]+):'/g)||[]).map(x=>x.trim().replace(/:'$/,''));
  const navBlock=(src.match(/const NAV_TABS=\[([\s\S]*?)\n\];/)||[''])[1]||'';
  const navs=(navBlock.match(/\['([a-z0-9]+)',/g)||[]).map(x=>x.slice(2,-2));
  const builtin=new Set((src.match(/nav:'([a-z0-9]+)'/g)||[]).map(x=>x.slice(5,-1)));
  const lettered=navs.filter(v=>!builtin.has(v)&&v!=='home'&&v!=='settings');
  const stillLettered=lettered.filter(v=>artKeys.indexOf(v)<0);
  console.log(JSON.stringify({autoApps:lettered.length,withArt:artKeys.length,stillLettered}));
  const everyAutoAppHasArt=stillLettered.length===0;
  const letterFallbackKept=/inner='<text x="24" y="32"/.test(src);
  console.log(JSON.stringify({everyAutoAppHasArt,letterFallbackKept}));
  ok=ok&&everyAutoAppHasArt&&letterFallbackKept;
  const noDoubleReserve=!/\(h-22\)\/\(rowH\+2\)/.test(src);
  const planExists=/function _kdGridPlan\(\)\{/.test(src)&&/iconsPerPage\(\)\{return _kdGridPlan\(\)\.per;\}/.test(src);
  const tileHasAFloor=/KD_TILE_MIN=52/.test(src);
  console.log(JSON.stringify({noDoubleReserve,planExists,tileHasAFloor}));
  ok=ok&&noDoubleReserve&&planExists&&tileHasAFloor;

  console.log(ok?'PASS: a short Kindle screen fits four rows, and no page clips a row':'FAIL');
  await b.close();
  process.exit(ok?0:1);
})();
