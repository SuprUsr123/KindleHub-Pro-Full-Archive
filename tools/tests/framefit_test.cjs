/* The frames fit, and they show everywhere. */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url');
let pass=0,fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x!==undefined&&!c?'  -- '+String(x).slice(0,200):''));};
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await(await b.newContext({viewport:{width:600,height:800}})).newPage();
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve('index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:30000});

  const r=await p.evaluate(()=>{
    const out={boxes:[],inners:{},arts:{},small:null,none:null};
    KH_FRAMES.forEach(function(f){
      const node=document.createElement('div');
      node.style.width='84px';node.style.height='84px';
      const box=_khWrapFrame(node,f.id,84);
      out.boxes.push(parseInt(box.style.width,10));
      out.inners[f.id]=parseInt(node.style.width,10);
      const im=box.querySelector('img');
      out.arts[f.id]=im?parseInt(im.style.width,10):0;
    });
    /* a chat-row sized avatar must still get its frame */
    const n2=document.createElement('div');n2.style.width='22px';n2.style.height='22px';
    const b2=_khWrapFrame(n2,'max_gate',22);
    out.small={box:parseInt(b2.style.width,10),inner:parseInt(n2.style.width,10),wrapped:b2!==n2};
    /* no frame chosen must pass the node straight through */
    const n3=document.createElement('div');
    out.none=(_khWrapFrame(n3,'',40)===n3);
    return out;
  });

  /* ⚠ REVERSED contract. This file used to assert the opposite of every line
     below: that the box was a fixed larger footprint and the PICTURE shrank to
     each frame's opening. That is what the user saw and rejected — on the
     phoenix (opening 24%) their face came out under half the size of an
     unframed avatar, sitting in a hole in the middle of a picture. Now the
     picture is exactly the size asked for, every time, and the ARTWORK is the
     thing that varies and overhangs. */
  const uniqueBoxes=[...new Set(r.boxes)];
  ok('the box is exactly the size asked for, whatever the frame',
     uniqueBoxes.length===1&&uniqueBoxes[0]===84, JSON.stringify(uniqueBoxes));
  ok('every frame shows the picture at FULL size — never shrunk into a hole',
     Object.values(r.inners).every(v=>v===84), JSON.stringify(r.inners));
  ok('the artwork is what varies, sized from each frame\'s opening',
     new Set(Object.values(r.arts)).size>=4, JSON.stringify(r.arts));
  ok('every frame overhangs the picture, so the wings are AROUND it',
     Object.values(r.arts).every(v=>v>84), JSON.stringify(r.arts));
  ok('an ornate frame spreads further than a plain ring',
     r.arts.max_phoenix>r.arts.plus_book,
     'phoenix '+r.arts.max_phoenix+' vs book '+r.arts.plus_book);
  ok('...but nothing runs away with the layout',
     Object.values(r.arts).every(v=>v<=84*2.6+1), JSON.stringify(r.arts));
  ok('frames now render at chat-row size too', r.small.wrapped&&r.small.inner===22, JSON.stringify(r.small));
  ok('no frame chosen still returns the plain avatar', r.none===true);
  ok('no page errors', errs.length===0, errs.slice(0,2).join(' | '));
  await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
