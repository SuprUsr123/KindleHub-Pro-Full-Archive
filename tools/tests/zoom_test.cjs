/* Zoom in the Draw app and the Flipbook editor (glitchyquinn's request).

   Both canvases already converted a tap to a canvas coordinate by dividing by
   the RENDERED rect, so scaling the element in CSS is the whole mechanism —
   the backing store keeps its resolution, no stroke coordinate moves, and taps
   keep landing where you touched. This test proves that: it zooms, then taps,
   and checks the mark landed at the same canvas cell as at 100%.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tools/tests/zoom_test.cjs */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url');

let pass=0,fail=0;
const ok=(n,c,extra)=>{
  if(c){pass++;console.log('PASS '+n);}
  else{fail++;console.log('FAIL '+n+(extra!==undefined?('  -- '+String(extra).slice(0,220)):''));}
};

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:600,height:800}});
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:20000});

  /* ── Draw ── */
  const draw=await p.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const out={};
    delete window._dState;
    showView('draw');
    await sleep(500);
    const cv=document.getElementById('drawCanvas');
    if(!cv)return{err:'no canvas'};
    const intrinsic={w:cv.width,h:cv.height};
    out.hasControls=!!(document.getElementById('drawZoomIn')&&document.getElementById('drawZoomOut')&&document.getElementById('drawZoomFit'));
    out.startLabel=(document.getElementById('drawZoomLabel')||{}).textContent;
    const w100=cv.getBoundingClientRect().width;

    document.getElementById('drawZoomIn').click();
    await sleep(120);
    const w150=cv.getBoundingClientRect().width;
    out.grew=w150>w100+10;
    out.label150=(document.getElementById('drawZoomLabel')||{}).textContent;
    /* the backing store must NOT be resized — that would resample the drawing
       and move every stored stroke coordinate */
    out.backingUnchanged=(cv.width===intrinsic.w&&cv.height===intrinsic.h);

    document.getElementById('drawZoomOut').click();
    document.getElementById('drawZoomOut').click();
    await sleep(120);
    const wSmall=cv.getBoundingClientRect().width;
    out.shrank=wSmall<w100-10;
    out.labelSmall=(document.getElementById('drawZoomLabel')||{}).textContent;

    document.getElementById('drawZoomFit').click();
    await sleep(150);
    out.fitWithin=cv.getBoundingClientRect().width<=cv.parentElement.clientWidth+2;
    return out;
  });
  ok('Draw has zoom in / out / fit controls', draw.hasControls, JSON.stringify(draw));
  ok('Draw starts at 100%', draw.startLabel==='100%', draw.startLabel);
  ok('zooming in makes the canvas bigger on screen', draw.grew, JSON.stringify(draw));
  ok('...and reports the new zoom level', draw.label150==='150%', draw.label150);
  ok('zoom does NOT resize the backing store (no resampling, strokes keep their coords)',
     draw.backingUnchanged, JSON.stringify(draw));
  ok('zooming out makes it smaller', draw.shrank, JSON.stringify(draw));
  ok('Fit brings the whole width inside the frame', draw.fitWithin, JSON.stringify(draw));

  /* a tap must land on the same canvas pixel at 100% and zoomed in */
  const accuracy=await p.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const cv=document.getElementById('drawCanvas');
    const ds=window._dState;
    const strokeAt=async()=>{
      const r=cv.getBoundingClientRect();
      /* aim at a fixed fraction of the canvas, not a fixed screen point, so the
         same LOGICAL spot is tapped at both zoom levels */
      const x=r.left+r.width*0.25, y=r.top+r.height*0.10;
      cv.dispatchEvent(new MouseEvent('mousedown',{clientX:x,clientY:y,bubbles:true}));
      cv.dispatchEvent(new MouseEvent('mouseup',{clientX:x,clientY:y,bubbles:true}));
      await sleep(60);
      const l=ds.layers[ds.activeLayer].strokes;
      return l.length?l[l.length-1].pts[0]:null;
    };
    document.getElementById('drawZoomFit').click();await sleep(120);
    ds.layers[ds.activeLayer].strokes=[];
    const at100=await strokeAt();
    document.getElementById('drawZoomIn').click();
    document.getElementById('drawZoomIn').click();
    await sleep(150);
    const atZoom=await strokeAt();
    return{at100:at100,atZoom:atZoom,zoom:ds.zoom};
  });
  const near=(a,b)=>a&&b&&Math.abs(a.x-b.x)<=3&&Math.abs(a.y-b.y)<=3;
  ok('a tap lands on the same canvas point when zoomed in (coords still accurate)',
     near(accuracy.at100,accuracy.atZoom), JSON.stringify(accuracy));

  /* ── Flipbook ── */
  const flip=await p.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const out={};
    showView('flipbook');
    await sleep(500);
    const v=document.getElementById('view-flipbook');
    if(!v)return{err:'no flipbook view'};
    const cv=v.querySelector('canvas');
    if(!cv)return{err:'no canvas'};
    const btns=Array.prototype.slice.call(v.querySelectorAll('button'));
    const byText=t=>{for(let i=0;i<btns.length;i++)if((btns[i].textContent||'').trim()===t)return btns[i];return null;};
    out.hasMove=!!byText('Move');
    const zoomIn=byText('+');
    out.hasZoom=!!zoomIn;
    const w0=cv.getBoundingClientRect().width;
    const backing={w:cv.width,h:cv.height};
    if(zoomIn){zoomIn.click();await sleep(120);}
    const w1=cv.getBoundingClientRect().width;
    out.grew=w1>w0+10;
    out.backingUnchanged=(cv.width===backing.w&&cv.height===backing.h);
    out.scrolls=(function(){
      let n=cv.parentElement;
      return n&&(getComputedStyle(n).overflow==='auto'||getComputedStyle(n).overflowX==='auto');
    })();

    /* drawing while zoomed must still hit the intended cell */
    const r=cv.getBoundingClientRect();
    const cx=r.left+r.width*(2.5/28), cy=r.top+r.height*(2.5/28);   /* cell (2,2) */
    cv.dispatchEvent(new MouseEvent('mousedown',{clientX:cx,clientY:cy,bubbles:true}));
    window.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
    await sleep(120);
    /* read the pixel back off the canvas: cell (2,2) is at 25,25 in a 280px canvas */
    const g=cv.getContext('2d').getImageData(Math.round(2.5*10),Math.round(2.5*10),1,1).data;
    out.inkedAtRightCell=(g[0]<120&&g[1]<120&&g[2]<120);

    /* Move mode must hand touch back so a zoomed canvas can be panned */
    const mv=byText('Move');
    if(mv){mv.click();await sleep(80);}
    out.moveFreesTouch=cv.style.touchAction==='auto';
    const pen=byText('Draw');
    if(pen){pen.click();await sleep(80);}
    out.penLocksTouch=cv.style.touchAction==='none';
    return out;
  });
  ok('Flipbook has zoom controls', flip.hasZoom, JSON.stringify(flip));
  ok('Flipbook has a Move tool for panning a zoomed canvas', flip.hasMove, JSON.stringify(flip));
  ok('zooming enlarges the flipbook canvas', flip.grew, JSON.stringify(flip));
  ok('...without resizing the backing store', flip.backingUnchanged, JSON.stringify(flip));
  ok('the zoomed canvas sits in a scrollable holder', flip.scrolls, JSON.stringify(flip));
  ok('drawing while zoomed still marks the intended cell', flip.inkedAtRightCell, JSON.stringify(flip));
  ok('Move mode releases touch to the scroller', flip.moveFreesTouch, JSON.stringify(flip));
  ok('...and Draw mode takes it back', flip.penLocksTouch, JSON.stringify(flip));

  ok('no page errors', errs.length===0, errs.slice(0,3).join(' | '));
  await p.close();await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
