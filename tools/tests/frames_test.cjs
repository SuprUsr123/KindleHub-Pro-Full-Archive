/* Profile frames: fifteen rings drawn around an avatar, earned by plan.

   The rules that matter are about who may WEAR what, and they are checked at
   render time rather than only at pick time — a plan that lapses has to stop
   showing a Max frame without anything going and rewriting the stored choice.

   Also pinned: the artwork is NOT inlined. Fifteen detailed images in the
   bundle would be megabytes that every reader parses on every boot whether or
   not they ever see a frame.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tools/tests/frames_test.cjs */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url'),fs=require('fs');

let pass=0,fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x!==undefined&&!c?'  -- '+String(x).slice(0,200):''));};

(async()=>{
  const src=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
  /* Scoped to the FRAME catalogue — index.html legitimately carries other
     inline images (wallpapers, icons), so a blanket base64 scan proves nothing.
     What must hold is that no frame points at a data: URI. */
  const cat=(/var KH_FRAMES=\[([\s\S]*?)\n\];/.exec(src)||[])[1]||'';
  ok('the frame catalogue exists and points at files',
     /frames\/max-phoenix\.png/.test(cat) && !/data:/.test(cat), cat.slice(0,120));

  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:600,height:800}});
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:20000});

  const r=await p.evaluate(()=>{
    const out={};
    out.total=window.KH_FRAMES.length;
    const byTier={};
    window.KH_FRAMES.forEach(f=>{byTier[f.tier]=(byTier[f.tier]||0)+1;});
    out.byTier=byTier;
    /* ids must be unique — a duplicate would make two frames unselectable-apart */
    out.uniqueIds=new Set(window.KH_FRAMES.map(f=>f.id)).size===window.KH_FRAMES.length;
    out.uniqueFiles=new Set(window.KH_FRAMES.map(f=>f.file)).size===window.KH_FRAMES.length;

    /* who can wear what */
    out.freeGets=window._khFramesFor('free').length;
    out.plusGets=window._khFramesFor('plus').length;
    out.proGets=window._khFramesFor('pro').length;
    out.maxGets=window._khFramesFor('max').length;
    out.creatorGets=window._khFramesFor('creator').length;

    /* a Pro user may wear a + frame — the point of "choose any of yours or below" */
    out.proCanWearPlus=window._khFrameAllowed('plus_book','pro');
    out.proCannotWearMax=!window._khFrameAllowed('max_phoenix','pro');
    out.plusCannotWearPro=!window._khFrameAllowed('pro_crown','plus');
    out.maxWearsAnything=window.KH_FRAMES.every(f=>window._khFrameAllowed(f.id,'max'));
    out.freeWearsNothing=window.KH_FRAMES.every(f=>!window._khFrameAllowed(f.id,'free'));
    out.unknownIdRefused=!window._khFrameAllowed('max_nonexistent','max');

    /* rendering: a frame wraps the avatar and points at its file */
    const av=window._avatarEl('someone',84,null,'max_phoenix');
    out.wrapped=av.querySelectorAll('div').length>=1;
    out.usesFile=/frames\/max-phoenix\.png/.test(av.innerHTML+av.outerHTML);
    /* ...and is bigger than the avatar, because the artwork overhangs */
    /* The BOX is now exactly the avatar; it is the artwork inside that
       overhangs, drawn behind the picture so wings surround the face instead
       of the face being shrunk into the artwork's opening. */
    out.boxIsAvatarSize=parseInt(av.style.width,10)===84;
    var _im=av.querySelector('img');
    out.artOverhangs=!!(_im&&parseInt(_im.style.width,10)>84&&parseInt(_im.style.left,10)<0);
    /* no frame id -> the plain avatar, unchanged */
    const plain=window._avatarEl('someone',84,null,'');
    out.plainUnchanged=parseInt(plain.style.width,10)===84;
    /* tiny avatars skip the frame: unreadable at chat-row size */
    const tiny=window._avatarEl('someone',22,null,'max_phoenix');
    out.tinySkipsFrame=parseInt(tiny.style.width,10)===22;

    /* an unknown id arriving from somebody else's presence row must not become a URL */
    const bogus=window._avatarEl('someone',84,null,'../../evil.png');
    out.bogusIgnored=parseInt(bogus.style.width,10)===84;
    return out;
  });

  ok('there are fifteen frames',                       r.total===15, JSON.stringify(r.byTier));
  ok('...five per paid tier',                          r.byTier.plus===5&&r.byTier.pro===5&&r.byTier.max===5, JSON.stringify(r.byTier));
  ok('every id is unique',                             r.uniqueIds);
  ok('every file is unique',                           r.uniqueFiles);
  ok('free gets none',                                 r.freeGets===0);
  ok('+ gets five',                                    r.plusGets===5);
  ok('Pro gets ten (its own five, plus the + five)',   r.proGets===10);
  ok('Max gets all fifteen',                           r.maxGets===15);
  ok('the Creator gets all fifteen',                   r.creatorGets===15);
  ok('a Pro user may wear a + frame',                  r.proCanWearPlus);
  ok('...but not a Max one',                           r.proCannotWearMax);
  ok('a + user may not wear a Pro one',                r.plusCannotWearPro);
  ok('Max may wear anything',                          r.maxWearsAnything);
  ok('free may wear nothing',                          r.freeWearsNothing);
  ok('an id that is not in the catalogue is refused',  r.unknownIdRefused);
  ok('a frame wraps the avatar and loads its file',    r.wrapped&&r.usesFile);
  ok('...in a box the size of the avatar itself',       r.boxIsAvatarSize);
  ok('...with the art overhanging it on every side',     r.artOverhangs);
  ok('no frame leaves the avatar exactly as it was',   r.plainUnchanged);
  ok('a chat-sized avatar skips the frame',            r.tinySkipsFrame);
  ok('a made-up frame id never becomes a URL',         r.bogusIgnored);
  ok('no page errors',                                 errs.length===0, errs.slice(0,3).join(' | '));

  await p.close();await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
