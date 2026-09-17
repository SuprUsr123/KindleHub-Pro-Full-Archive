/* The pixel art tool, and the frame spacing fix that came with it.

   The old tool was one brush, a palette, Clear and Fill-All. What is tested
   here is that each new tool actually PUTS PIXELS WHERE IT SAYS — a fill that
   floods the wrong region, a line that leaves gaps, or a mirror that only some
   tools honour all look identical to working code from the outside.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tools/tests/pixelart_test.cjs */
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
  await p.evaluate(()=>showView('pixelart'));
  await p.waitForTimeout(400);

  console.log('── it mounts with real tools ──');
  const ui=await p.evaluate(()=>{
    const t=(document.getElementById('view-pixelart')||{}).textContent||'';
    return {pen:/Pen/.test(t),erase:/Eraser/.test(t),fill:/Fill/.test(t),line:/Line/.test(t),
            box:/Box/.test(t),oval:/Oval/.test(t),pick:/Pick/.test(t),
            undo:/Undo/.test(t),mirror:/Mirror/.test(t),sprites:/Sprites/.test(t),
            send:/Send to chat/.test(t),dbg:typeof window._khPixelDbg==='function'};
  });
  ok('every tool is offered', ui.pen&&ui.erase&&ui.fill&&ui.line&&ui.box&&ui.oval&&ui.pick, JSON.stringify(ui));
  ok('undo, mirror, sprites and share are there', ui.undo&&ui.mirror&&ui.sprites&&ui.send, JSON.stringify(ui));
  ok('the test hook exists', ui.dbg);

  console.log('\n── the tools do what they say ──');
  const draw=await p.evaluate(()=>{
    const d=window._khPixelDbg();
    d.setColour('#ff0000');
    d.mirror(false,false);
    d.put(3,3,'#ff0000');
    const c=d.cells(),W=d.W();
    return {one:c[3*W+3], neighbour:c[3*W+4]};
  });
  ok('a pen stroke colours exactly the square it was given', draw.one==='#ff0000'&&draw.neighbour==='', JSON.stringify(draw));

  const mirror=await p.evaluate(()=>{
    const d=window._khPixelDbg();
    d.render();                        /* fresh canvas */
    d.setColour('#00ff00'); d.mirror(true,false);
    d.put(1,5,'#00ff00');
    const c=d.cells(),W=d.W();
    return {left:c[5*W+1], right:c[5*W+(W-1-1)]};
  });
  ok('mirror puts the same pixel on both sides', mirror.left==='#00ff00'&&mirror.right==='#00ff00', JSON.stringify(mirror));

  const flood=await p.evaluate(()=>{
    const d=window._khPixelDbg();
    d.render(); d.mirror(false,false);
    const W=d.W(),H=d.H();
    /* wall down the middle, then flood the LEFT half only */
    for(let y=0;y<H;y++)d.put(Math.floor(W/2),y,'#000000');
    d.fill(0,0,'#0000ff');
    const c=d.cells();
    return {leftFilled:c[0]==='#0000ff', rightUntouched:c[W-1]==='',
            wallKept:c[Math.floor(W/2)]==='#000000'};
  });
  ok('fill floods its own region', flood.leftFilled, JSON.stringify(flood));
  ok('...and does NOT cross a wall', flood.rightUntouched, JSON.stringify(flood));
  ok('...leaving the wall itself alone', flood.wallKept, JSON.stringify(flood));

  /* A 64x64 flood of an empty canvas is the case that took the page down when
     this was written recursively — 4096 frames deep. */
  const big=await p.evaluate(()=>{
    const d=window._khPixelDbg();
    d.unpack({w:64,h:64,pal:[],d:''});
    d.render();
    const t0=Date.now();
    d.fill(0,0,'#123456');
    const c=d.cells();
    let n=0;for(let i=0;i<c.length;i++)if(c[i]==='#123456')n++;
    return {n, ms:Date.now()-t0};
  });
  ok('a full 64x64 flood completes without blowing the stack',
     big.n===4096, JSON.stringify(big));
  console.log('   (took '+big.ms+'ms)');

  console.log('\n── undo ──');
  const undo=await p.evaluate(()=>{
    const d=window._khPixelDbg();
    d.unpack({w:16,h:16,pal:[],d:''}); d.render();
    const before=d.undoDepth();
    /* through the canvas, so the undo snapshot is taken the way a tap takes it */
    const cv=document.querySelector('#view-pixelart canvas');
    const r=cv.getBoundingClientRect();
    cv.dispatchEvent(new MouseEvent('mousedown',{clientX:r.left+10,clientY:r.top+10,bubbles:true}));
    window.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
    const painted=d.cells().some(x=>x!=='');
    const after=d.undoDepth();
    [].slice.call(document.querySelectorAll('#view-pixelart button')).forEach(x=>{if(x.textContent==='Undo')x.click();});
    return {before, after, painted, clean:d.cells().every(x=>x==='')};
  });
  ok('a tap on the canvas paints', undo.painted, JSON.stringify(undo));
  ok('...and records an undo step', undo.after>undo.before, JSON.stringify(undo));
  ok('Undo puts it back', undo.clean, JSON.stringify(undo));

  console.log('\n── sprites survive a save and reload ──');
  const round=await p.evaluate(()=>{
    const d=window._khPixelDbg();
    d.unpack({w:16,h:16,pal:[],d:''}); d.render(); d.mirror(false,false);
    d.put(2,2,'#ff0000'); d.put(3,3,'#00ff00'); d.put(4,4,'#ff0000');
    const packed=d.pack();
    d.unpack({w:16,h:16,pal:[],d:''});          /* wipe */
    d.unpack(packed);                            /* and restore */
    const c=d.cells(),W=d.W();
    return {size:packed.d.length, pal:packed.pal.length,
            a:c[2*W+2], b:c[3*W+3], c:c[4*W+4], empty:c[0]};
  });
  ok('a sprite packs to one character per cell', round.size===256, JSON.stringify(round));
  ok('...with only the colours it uses', round.pal===2, JSON.stringify(round));
  ok('...and comes back exactly as drawn',
     round.a==='#ff0000'&&round.b==='#00ff00'&&round.c==='#ff0000'&&round.empty==='', JSON.stringify(round));

  console.log('\n── frames no longer sit on the messages around them ──');
  const space=await p.evaluate(()=>{
    window._khSeedFrames={'framed':'max_phoenix'};
    const a=document.createElement('div');
    a.style.width='30px';a.style.height='30px';
    document.body.appendChild(a);
    _applyIdenticon(a,'framed','Framed');
    const img=a.querySelector('img');
    const over=_khFrameOverhangPx('max_phoenix',30);
    return {margin:a.style.margin, over,
            art:img?parseFloat(img.style.width):0,
            plainMargin:(function(){const b=document.createElement('div');b.style.width='30px';
              _applyIdenticon(b,'nobody','N');return b.style.margin;})()};
  });
  ok('a framed chat avatar reserves room for its wings', /\d+px/.test(space.margin), JSON.stringify(space));
  ok('...matching how far the art actually reaches', space.over>0&&space.margin.indexOf(space.over+'px')===0, JSON.stringify(space));
  ok('an unframed avatar is left alone, so rows still line up', space.plainMargin==='', JSON.stringify(space));

  const capped=await p.evaluate(()=>({
    small:_khFrameOverhangPx('max_phoenix',30),
    large:_khFrameOverhangPx('max_phoenix',84)
  }));
  ok('the overhang is capped so a chat row cannot be swamped', capped.small<=18, JSON.stringify(capped));
  ok('...while a big avatar still gets the full spread', capped.large>capped.small, JSON.stringify(capped));

  const src=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
  ok('one place decides the artwork size, so the two painters cannot drift',
     /function _khFrameScaleFor\(id,size\)/.test(src) &&
     (src.match(/_khFrameScaleFor\(/g)||[]).length>=4);

  ok('no page errors', errs.length===0, errs.slice(0,3).join(' | '));
  await p.close();await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
