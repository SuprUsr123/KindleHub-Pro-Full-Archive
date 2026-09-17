/* "What if a trojan image is sent to a KindleHub user?"

   The scary version does not happen, and it is worth being exact about why
   rather than reassuring.

   A received image is only ever put into an <img src>. A browser loading SVG
   through <img> runs no script inside it — that holds on every engine including
   the old Silk on a Kindle. There is no window.open, no innerHTML and no iframe
   anywhere in that path, so there is no route from a crafted image to running
   code, and no account takeover.

   What the old filter DID allow, by accepting anything starting `data:image/`:
     - SVG, which this app never sends and whose decoder is an XML parser, so it
       accepts entity-expansion bombs that can hang a device
     - any size at all, because the 12,000-character budget is applied when
       SENDING, and a message posted straight to the API skips that entirely

   Neither is code execution. Both spoil somebody's afternoon, and both are one
   filter away. This pins the filter AND the structural property it rests on —
   because if a later change renders one of these through innerHTML or opens it
   in a tab, SVG stops being inert, and that change would look harmless in
   review.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tools/tests/imgsafe_test.cjs */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url'),fs=require('fs');

let pass=0,fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x!==undefined&&!c?'  -- '+String(x).slice(0,200):''));};

(async()=>{
  const src=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');

  console.log('── the structural property everything else rests on ──');
  const viewer=(/function _khOpenImageViewer\(dataUrl\)\{[\s\S]*?\n\}/.exec(src)||[''])[0];
  ok('the fullscreen viewer builds an <img>, nothing else', /el\('img',\{src:dataUrl/.test(viewer), viewer.slice(0,160));
  ok('...and never opens the URL as a page',   !/window\.open|location\.href\s*=/.test(viewer));
  ok('...and never puts it through innerHTML', !/innerHTML/.test(viewer));

  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:600,height:800}});
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:20000});

  const r=await p.evaluate(()=>{
    const P=window._khImgParse;
    const real='data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA==';
    const out={};
    out.acceptsJpeg = P('KHIMG1:'+real)===real;
    out.acceptsPng  = P('KHIMG1:data:image/png;base64,iVBORw0KGgo=')!==null;
    out.acceptsGif  = P('KHIMG1:data:image/gif;base64,R0lGODlhAQAB')!==null;
    out.acceptsWebp = P('KHIMG1:data:image/webp;base64,UklGRh4AAABX')!==null;

    /* the format we never send, whose decoder is an XML parser */
    out.rejectsSvg = P('KHIMG1:data:image/svg+xml;base64,PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+')===null;
    out.rejectsSvgPlain = P('KHIMG1:data:image/svg+xml,<svg onload="alert(1)"/>')===null;
    out.rejectsHtml = P('KHIMG1:data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==')===null;
    out.rejectsJs   = P('KHIMG1:javascript:alert(1)')===null;
    /* markup smuggled after a legitimate-looking prefix */
    out.rejectsSmuggled = P('KHIMG1:data:image/png;base64,iVBOR"><script>alert(1)</script>')===null;
    out.rejectsSpaces   = P('KHIMG1:data:image/png;base64,iVBO R0')===null;
    out.rejectsRaw      = P('KHIMG1:data:image/png,<svg/onload=alert(1)>')===null;

    /* The cap the receiver decodes must stay ABOVE the budget the sender
       shrinks to, or the app rejects its own photos. It was hardcoded at 64000
       while sending shrank to 110000, so anything in between arrived, failed to
       parse, and fell through to the plain-text branch — the recipient saw the
       raw KHIMG1: string in the bubble. Assert the RELATIONSHIP, not a number,
       because a number is exactly what drifted. */
    out.sendBudget = window._KH_IMG_SEND_BUDGET;
    out.renderCap  = window._KH_IMG_MAX;
    const atBudget='data:image/jpeg;base64,'+'A'.repeat(window._KH_IMG_SEND_BUDGET-40);
    out.acceptsLargestSendable = P('KHIMG1:'+atBudget)!==null;
    const midBand='data:image/jpeg;base64,'+'A'.repeat(80000);   /* the band that broke */
    out.acceptsMidBand = P('KHIMG1:'+midBand)!==null;

    const big='data:image/jpeg;base64,'+'A'.repeat(window._KH_IMG_MAX+5000);
    out.rejectsHuge = P('KHIMG1:'+big)===null;
    const okSize='data:image/jpeg;base64,'+'A'.repeat(11000);
    out.acceptsNormalSize = P('KHIMG1:'+okSize)!==null;

    out.notAnImage = P('just a message')===null;
    return out;
  });

  console.log('\n── what a real image looks like ──');
  ok('a JPEG from this app is accepted', r.acceptsJpeg);
  ok('...and a PNG, which some engines return instead', r.acceptsPng);
  ok('...gif and webp too, for headroom', r.acceptsGif&&r.acceptsWebp);
  ok('a normal-sized image is fine', r.acceptsNormalSize);
  ok('the render cap is above the send budget, so we accept our own photos',
     r.renderCap > r.sendBudget, 'send '+r.sendBudget+' vs render '+r.renderCap);
  ok('...an image at the largest size we ever SEND still renders', r.acceptsLargestSendable);
  ok('...and one in the 64-110 KB band that used to show as raw text', r.acceptsMidBand);

  console.log('\n── what is now refused ──');
  ok('SVG carrying a script tag',        r.rejectsSvg);
  ok('SVG carrying an onload handler',   r.rejectsSvgPlain);
  ok('an HTML data URL',                 r.rejectsHtml);
  ok('a javascript: URL',                r.rejectsJs);
  ok('markup smuggled after a valid-looking prefix', r.rejectsSmuggled);
  ok('whitespace inside the base64',     r.rejectsSpaces);
  ok('a non-base64 data URL',            r.rejectsRaw);
  ok('something far larger than we ever send', r.rejectsHuge);
  ok('an ordinary text message is not an image', r.notAnImage);

  /* The end-to-end claim: even if something SVG-shaped reached an <img>, it
     would not execute. Demonstrated rather than asserted. */
  const executed=await p.evaluate(async()=>{
    window.__pwned=false;
    const svg='data:image/svg+xml;base64,'+btoa('<svg xmlns="http://www.w3.org/2000/svg"><script>window.__pwned=true</script></svg>');
    const im=document.createElement('img');
    im.src=svg;
    document.body.appendChild(im);
    await new Promise(r=>setTimeout(r,600));
    im.remove();
    return window.__pwned;
  });
  console.log('\n── the claim itself, demonstrated ──');
  ok('script inside an SVG loaded via <img> does not run', executed===false, 'pwned='+executed);

  ok('no page errors', errs.length===0, errs.slice(0,3).join(' | '));
  await p.close();await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
