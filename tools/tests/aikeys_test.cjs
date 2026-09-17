/* An API key must not disappear when the cloud copy comes back empty.

   The reported loss: a key entered on the Mac, gone later. The merge was never
   the hole — an empty incoming scalar already loses to a local value. The hole
   is a WHOLESALE load. A device with no key (a fresh sign-in, or a boot where
   the stored blob failed to decode and fell back to defaults) pushes its entire
   state, so the cloud blob's key becomes empty; the next re-sign-in on the
   device that HAD the key reads that empty copy verbatim.

   So the key is mirrored on the device, outside the synced state. This file
   pins the three things that makes it correct rather than merely present: it
   fills a gap, it never resurrects a key you deliberately cleared, and it does
   not itself ride to the cloud — a synced mirror would be lost the same way it
   exists to prevent.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tools/tests/aikeys_test.cjs */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url'),fs=require('fs');

let pass=0,fail=0;
const ok=(n,c,extra)=>{
  if(c){pass++;console.log('PASS '+n);}
  else{fail++;console.log('FAIL '+n+(extra?'  -- '+String(extra).slice(0,220):''));}
};

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:600,height:800}});
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:20000});

  const r=await p.evaluate(async()=>{
    const S=window._KH.S, out={};
    const KEY='AIzaSyTESTKEYTESTKEYTESTKEYTESTKEY00';
    localStorage.removeItem('kh_ai_keys');

    /* Signed out, the mirror must stay untouched — during boot S is defaults
       and every key is blank, which would otherwise wipe a good mirror. */
    S.authToken=''; S.geminiKey=KEY;
    window._khMirrorKeys();
    out.notWrittenSignedOut = localStorage.getItem('kh_ai_keys')===null;

    /* Signed in, it records what is there. */
    S.authToken='a'.repeat(64);
    window._khMirrorKeys();
    out.mirrored = (JSON.parse(localStorage.getItem('kh_ai_keys')||'{}').geminiKey)===KEY;

    /* THE REPORTED BUG: a wholesale load hands back a state with no key. */
    S.geminiKey='';
    const did=window._khRestoreKeys();
    out.restored = did===true && S.geminiKey===KEY;

    /* Restore only fills a GAP — a key already present is never overwritten by
       an older mirrored one. */
    S.geminiKey='NEWER-KEY';
    window._khRestoreKeys();
    out.doesNotOverwrite = S.geminiKey==='NEWER-KEY';

    /* Deliberately clearing a key must STAY cleared. The mirror records blanks
       too, so the next save overwrites it and there is nothing to put back. */
    S.geminiKey='';
    window._khMirrorKeys();                 /* what save() does */
    const back=window._khRestoreKeys();
    out.clearedStaysCleared = back===false && !S.geminiKey;

    /* All four providers, not just Gemini. */
    S.geminiKey=KEY; S.openrouterKey='or-1'; S.anthropicKey='an-1'; S.openaiKey='oa-1';
    window._khMirrorKeys();
    S.geminiKey=S.openrouterKey=S.anthropicKey=S.openaiKey='';
    window._khRestoreKeys();
    out.allFour = S.geminiKey===KEY&&S.openrouterKey==='or-1'&&S.anthropicKey==='an-1'&&S.openaiKey==='oa-1';

    /* The mirror must not travel. A device with no keys would otherwise upload
       an empty mirror over a good one — the exact failure it exists to stop. */
    out.notBackedUp = window._isLsBackupSkipped
      ? window._isLsBackupSkipped('kh_ai_keys')===true : 'no fn';

    S.authToken=''; S.geminiKey='';
    return out;
  });

  ok('nothing is mirrored while signed out, so boot defaults cannot wipe it', r.notWrittenSignedOut);
  ok('a signed-in save records the key on the device', r.mirrored);
  ok('a load that arrives with no key gets this device\'s copy back', r.restored);
  ok('...but a key already present is never overwritten', r.doesNotOverwrite);
  ok('a key you deliberately cleared stays cleared', r.clearedStaysCleared);
  ok('all four providers are covered, not just Gemini', r.allFour);
  ok('the mirror itself never rides to the cloud', r.notBackedUp===true, r.notBackedUp);
  ok('no page errors', errs.length===0, errs.join(' | '));

  await p.close();await b.close();

  const src=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
  /* Any hot-path kh_ write invalidates the sync fingerprint and schedules a
     round-trip on EVERY save — the regression that once broke saving for a
     heavy account. This key is written from save(), so it must be skipped. */
  ok('kh_ai_keys is in the sync-fingerprint skip list',
     /k==='kh_boot'\|\|k==='kh_pending_fields'\|\|k==='kh_ai_keys'/.test(src));
  /* Matched against save()'s body rather than its exact first lines — other
     bookkeeping calls live there too and the order between them does not
     matter, only that the mirror is written on every save. */
  const saveBody=(src.split('function save(d=1200){')[1]||'').split('\nfunction ')[0];
  ok('save() mirrors, so the copy is always current', /_khMirrorKeys\(\);/.test(saveBody));
  ok('the cloud merge restores before it persists, repairing the cloud copy too',
     /try\{_khRestoreKeys\(\);\}catch\(_rk\)\{\}[\s\S]{0,400}if\(!opts\.skipSave\)save\(\);/.test(src));

  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
