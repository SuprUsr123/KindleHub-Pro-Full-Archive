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

  const mine=await p.evaluate(()=>{
    S.profileFrame='max_phoenix'; S.profileName='Aran'; S.user='Aran';
    const a=_avatarEl('Aran',24);            /* no frame arg — must resolve */
    return {framed:!!a.querySelector('img'), size:parseInt(a.style.width,10)};
  });
  ok('my avatar is framed with no frame argument passed', mine.framed, JSON.stringify(mine));

  const other=await p.evaluate(()=>{
    window._khSeedFrames={'someoneelse':'plus_laurel'};
    const a=_avatarEl('someoneelse',24);
    const b=_avatarEl('strangerwithnoframe',24);
    return {them:!!a.querySelector('img'), unknown:!!(b.querySelector&&b.querySelector('img'))};
  });
  ok('another user\'s frame is drawn from their presence row', other.them, JSON.stringify(other));
  ok('someone with no frame is simply unframed', other.unknown===false, JSON.stringify(other));

  const tap=await p.evaluate(()=>{
    const a=_avatarEl('Aran',38,null,'max_gate');
    a._khNoProfile=true;                     /* set on the BOX, as callers do */
    let opened=false; window._khOpenProfile=function(){opened=true;};
    let tileFired=false;
    const tile=document.createElement('div'); tile.onclick=function(){tileFired=true;};
    tile.appendChild(a); document.body.appendChild(tile);
    /* The avatar is the LAST child now — the artwork is appended first so it
       paints behind the face. firstChild is the frame image. */
    const inner=a.lastChild;
    inner.dispatchEvent(new MouseEvent('click',{bubbles:true}));
    return {opened, tileFired, flagReached:inner._khNoProfile===true};
  });
  ok('the opt-out reaches the node the handler is on', tap.flagReached, JSON.stringify(tap));
  ok('tapping a frame does NOT open your profile', tap.opened===false, JSON.stringify(tap));
  ok('...it reaches the tile, so the frame gets selected', tap.tileFired===true, JSON.stringify(tap));

  /* Chat message rows do NOT go through _avatarEl — .msg-avatar is an element
     the row already built and sized, and _applyIdenticon only painted a
     background onto it. So every framed avatar in the app was framed EXCEPT
     the one place people actually look at each other. */
  console.log('\n── the avatar beside a chat message ──');
  const chat=await p.evaluate(()=>{
    window._khSeedFrames={'chatty':'plus_laurel'};
    const a=document.createElement('div');
    a.className='msg-avatar'; a.style.width='34px'; a.style.height='34px';
    _applyIdenticon(a,'chatty','Chatty');
    const img=a.querySelector('img');
    const b=document.createElement('div');
    _applyIdenticon(b,'nobodyspecial','Nobody');
    return {
      framed:!!img,
      /* the picture is the element's OWN background; the artwork is a child
         behind it, which is what puts the wings around the face rather than
         over it */
      hasPicture:/background-image/.test(a.style.cssText)&&a.style.backgroundImage!=='none',
      artBehind:!!(img&&parseInt(img.style.zIndex,10)<0),
      artBigger:!!(img&&parseFloat(img.style.width)>100),   /* % of the element */
      insideFootprint:a.style.width==='34px',      /* must not grow the row */
      plainStaysPlain:!b.querySelector('img')
    };
  });
  ok('a message avatar is framed', chat.framed, JSON.stringify(chat));
  ok('...and still shows the person\'s picture at full size', chat.hasPicture, JSON.stringify(chat));
  ok('...with the artwork BEHIND the face, not over it', chat.artBehind, JSON.stringify(chat));
  ok('...and spreading wider than the circle', chat.artBigger, JSON.stringify(chat));
  ok('...without changing the row\'s own box', chat.insideFootprint, JSON.stringify(chat));
  ok('someone with no frame is still drawn plainly', chat.plainStaysPlain, JSON.stringify(chat));

  ok('no page errors', errs.length===0, errs.slice(0,2).join(' | '));
  await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
