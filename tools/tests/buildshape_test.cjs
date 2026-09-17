/* The deploy build is now TWO files, and that is a new way to ship a dead site.

   index.min.html no longer contains the app; it names kh-app.js by content
   hash. So there are two new failure modes, both silent in a diff and both
   fatal in production:

     - kh-app.js is missing (someone regenerated the HTML but only committed
       one of the two files) → every visitor gets a blank page;
     - the ?v= hash does not match the file that shipped alongside it → a
       reader can be served new HTML with an app that is no longer there.

   Neither shows up in any other test, because every other test loads the build
   off disk where both files sit next to each other and simply works. This one
   checks the artifact itself, and then proves the app still boots from it.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tools/tests/buildshape_test.cjs */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url'),fs=require('fs'),crypto=require('crypto');

let pass=0,fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x!==undefined&&!c?'  -- '+String(x).slice(0,240):''));};

const ROOT=path.resolve(__dirname,'../..');
const HTML=path.join(ROOT,'index.min.html'), APP=path.join(ROOT,'kh-app.js');

(async()=>{
  console.log('── the two files agree ──');
  const html=fs.readFileSync(HTML,'utf8');
  const ref=/<script src="kh-app\.js\?v=([a-f0-9]+)"><\/script>/.exec(html);

  if(!ref){
    /* --inline is a supported build mode (the one-command revert), so a
       self-contained build is not a failure — but then it must really be
       self-contained, and no orphan bundle may be left lying around. */
    ok('single-file build carries the app inline', html.length>1000000, 'html is only '+html.length+' bytes with no kh-app.js reference');
    ok('...and no stale kh-app.js is left behind', !fs.existsSync(APP));
  } else {
    ok('index.min.html names the app bundle', true);
    ok('kh-app.js actually exists', fs.existsSync(APP), 'the HTML references a file that is not in the repo');
    if(fs.existsSync(APP)){
      const code=fs.readFileSync(APP);
      const want=crypto.createHash('sha256').update(code).digest('hex').slice(0,10);
      ok('the ?v= hash matches the bundle that shipped with it', ref[1]===want,
         'html says '+ref[1]+', file hashes to '+want+' — regenerate with: cd tools && node minify.mjs');
      ok('the bundle is the real app, not a stub', code.length>1000000, code.length+' bytes');

      /* Relative, not root-absolute: "/kh-app.js" would 404 for every test
         that opens the build over file://, and we would only find out when
         the whole suite went red at once. */
      ok('the src is relative so file:// still works', !/src="\//.test(ref[0]), ref[0]);

      /* The Silk gate runs inside the minifier before the split, so this is
         belt and braces — it catches a hand-edited bundle, which the rulebook
         forbids but which would otherwise reach a Kindle unchecked. */
      const HOSTILE=[[/[)\]\w$]\?\?=/g,'??='],[/[)\]\w$]\?\?(?!=)/g,'??'],
                     [/[)\]\w$]\?\.\s*[A-Za-z_$([]/g,'?.'],[/(?:^|[^A-Za-z0-9_$])catch\s*\{/g,'catch{}'],
                     [/[)\]\w$]\s*\|\|=/g,'||='],[/[)\]\w$]\s*&&=/g,'&&=']];
      const s=code.toString('utf8'); const hits=[];
      for(const [re,label] of HOSTILE){re.lastIndex=0;let m;while((m=re.exec(s)))hits.push(label);}
      ok('the bundle is free of Kindle-hostile syntax', hits.length===0, hits.slice(0,5).join(', '));
    }
  }

  console.log('\n── and the app still boots from it ──');
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await(await b.newContext({viewport:{width:600,height:800}})).newPage();
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  const failed=[];p.on('requestfailed',r=>failed.push(r.url().split('/').pop()));
  await p.goto(url.pathToFileURL(HTML).href,{waitUntil:'domcontentloaded'});
  let booted=true;
  try{await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:30000});}catch(e){booted=false;}
  ok('the app boots', booted);
  ok('nothing failed to load', failed.length===0, failed.join(', '));

  if(booted){
    const r=await p.evaluate(()=>({
      views:Object.keys(BUILDERS).length,
      games:typeof launchGame==='function',
      /* a global defined in the lifted block, reachable from an inline one:
         proves execution order survived the move */
      shared:typeof STORE_APPS!=='undefined'&&typeof _khTier==='function',
      kbd:!!window._khKeyboard
    }));
    ok('the view table is intact', r.views>60, 'only '+r.views+' views');
    ok('globals from the lifted block are visible to the inline blocks', r.shared&&r.kbd, JSON.stringify(r));
    ok('games are reachable', r.games);
  }
  ok('no page errors', errs.length===0, errs.slice(0,3).join(' | '));

  await p.close();await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
