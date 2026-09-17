/* The landing page is the one file that talks to people who have not used the
 * app, so the only thing worth testing is whether what it SAYS is true. It
 * claimed "100% free, forever — every feature, no tiers or paywall" while the
 * app was running Stripe checkout, and "30+ games" while the grid held 82. */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const fs=require('fs'),path=require('path'),url=require('url');
let pass=0,fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x!==undefined&&!c?'  -- '+String(x).slice(0,240):''));};

(async()=>{
  const src=fs.readFileSync(path.resolve('landing.html'),'utf8');
  const app=fs.readFileSync(path.resolve('index.html'),'utf8');
  const cards=(app.match(/\bgc\('/g)||[]).length;

  console.log('── what it claims is true ──');
  /* The claim that broke: the app has had paid plans since the Stripe work. */
  ok('it no longer claims there are no tiers or paywall',
     !/no tiers or paywall/i.test(src)&&!/100% free, forever/i.test(src), 'stale free claim still present');
  ok('...and it says plainly what the paid plans buy',
     /AI messages/i.test(src)&&/cloud storage/i.test(src)&&/£0\.99|&pound;0\.99/.test(src));
  ok('...while still being clear the apps and games are free',
     /[Ee]very app and (all|every) .*game/i.test(src));

  const claimed=(src.match(/(\d+)\+\s*games/)||[])[1];
  ok('the game count claim is backed by the real card count',
     claimed&&cards>=Number(claimed), 'claims '+claimed+'+, app has '+cards);
  ok('...and it is not still stuck on 30',
     Number(claimed)>=80, 'claims '+claimed);

  /* The measured numbers are quoted; they must match what the notes recorded,
     because a made-up benchmark on a landing page is the worst kind of wrong. */
  ok('the boot figures quoted are the measured ones',
     /1727ms/.test(src)&&/815ms/.test(src)&&/1021ms/.test(src)&&/428ms/.test(src));

  console.log('\n── nothing dangerous or dead in it ──');
  /* A Cloudflare bot-challenge script had been pasted into the committed file.
     It builds a hidden iframe and pulls a script — exactly the class of thing
     that errors on Silk, and it does not belong in source control either. */
  ok('the injected Cloudflare challenge script is gone',
     !/__CF\$cv\$params/.test(src)&&!/challenge-platform/.test(src));
  ok('no external scripts or stylesheets at all',
     !/<script[^>]+src=/i.test(src)&&!/<link[^>]+stylesheet/i.test(src));
  /* It is the first thing a Kindle loads, so it has to stay small. */
  ok('the page is still small', src.length<26000, src.length+' bytes');

  console.log('\n── it actually renders ──');
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await(await b.newContext({viewport:{width:600,height:800}})).newPage();
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve('landing.html')).href,{waitUntil:'load'});

  const r=await p.evaluate(()=>{
    const q=s=>document.querySelectorAll(s).length;
    /* nothing may push the page sideways on a 600px Kindle screen */
    const over=document.documentElement.scrollWidth>document.documentElement.clientWidth+1;
    const links=Array.prototype.map.call(document.querySelectorAll('a[href]'),a=>a.getAttribute('href'));
    return {h1:(document.querySelector('h1')||{}).textContent||'',
            sections:q('section'),cards:q('.card'),faqs:q('details'),figs:q('.fig'),
            over,scrollW:document.documentElement.scrollWidth,
            links,
            title:document.title,
            ld:!!document.querySelector('script[type="application/ld+json"]')};
  });
  ok('there is a heading',                  r.h1.length>10, r.h1);
  ok('the sections are all there',          r.sections>=6, r.sections);
  ok('the feature cards render',            r.cards>=8, r.cards);
  ok('the numbers strip renders',           r.figs===4, r.figs);
  ok('the FAQ renders',                     r.faqs>=6, r.faqs);
  ok('structured data survived',            r.ld);
  /* 600px is the Kindle Paperwhite viewport; a horizontal scroll there is the
     difference between "a website" and "a website for this device". */
  ok('nothing overflows at 600px',          r.over===false, 'scrollWidth '+r.scrollW);
  ok('every link is internal',              r.links.every(h=>h.charAt(0)==='/'||h.charAt(0)==='#'), JSON.stringify(r.links));
  ok('no page errors',                      errs.length===0, errs.slice(0,2).join(' | '));

  /* And it must read at phone width too, since that is where a Reddit link
     gets opened first. */
  await p.setViewportSize({width:360,height:740});
  const narrow=await p.evaluate(()=>({
    over:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,
    w:document.documentElement.scrollWidth}));
  ok('nothing overflows at 360px either',   narrow.over===false, 'scrollWidth '+narrow.w);

  await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
