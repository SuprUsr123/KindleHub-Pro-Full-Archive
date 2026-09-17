/* Profile fields (display name / avatar / status) must sync device→cloud→device.
   This pins the mechanism so a future change can't silently strand a profile
   edit on one device (the "profile changes on localStorage but not on the cloud"
   report). The fields are plain scalar S values, so they ride the normal state
   blob + the pending-edit ledger that protects an edit until it's uploaded.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tools/tests/profilesync_test.cjs */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url');

let pass=0,fail=0;
const ok=(n,c,extra)=>{if(c){pass++;console.log('PASS '+n);}else{fail++;console.log('FAIL '+n+(extra!==undefined?('  -- '+String(extra).slice(0,200)):''));}};

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:600,height:800}});
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:20000});

  const r=await p.evaluate(async()=>{
    const S=window._KH.S,out={};
    S.authToken='a'.repeat(64);S.syncEnabled=true;
    window._khPrevScalars=window._khScalarSnapshot?window._khScalarSnapshot():null;
    try{window._khClearPendingFields&&window._khClearPendingFields();}catch(_){}

    S.profileName='MacName';S.profileAvatar='AVX1:test';S.profileStatus='hello';
    window.saveNow();
    out.namePending=!!(window._khFieldPending&&window._khFieldPending('profileName'));
    out.avatarPending=!!(window._khFieldPending&&window._khFieldPending('profileAvatar'));

    let safe=null;try{safe=window._buildSafeState?window._buildSafeState():null;}catch(e){out.safeErr=String(e);}
    out.nameUploaded=!!(safe&&safe.profileName==='MacName');
    out.avatarUploaded=!!(safe&&safe.profileAvatar==='AVX1:test');
    out.statusUploaded=!!(safe&&safe.profileStatus==='hello');

    /* a stale cloud pull must NOT revert the local edit while it's still pending */
    await window.mergeCloudState({profileName:'OldCloudName',profileAvatar:'AVX1:old'},{skipSave:true});
    out.keptLocalWhilePending=(S.profileName==='MacName');

    /* after a successful upload the ledger clears and a NEWER cloud value is adopted */
    try{window._khClearPendingFields&&window._khClearPendingFields();}catch(_){}
    window._khPrevScalars=window._khScalarSnapshot?window._khScalarSnapshot():null;
    await window.mergeCloudState({profileName:'KindleName'},{skipSave:true});
    out.adoptsNewerAfterSync=(S.profileName==='KindleName');
    return out;
  });

  console.log(JSON.stringify(r,null,1));
  ok('a display-name edit is marked pending (protected from a stale pull)', r.namePending);
  ok('an avatar edit is marked pending too', r.avatarPending);
  ok('the display name IS in the uploaded state (reaches the cloud)', r.nameUploaded);
  ok('the avatar IS in the uploaded state', r.avatarUploaded);
  ok('the status IS in the uploaded state', r.statusUploaded);
  ok('a stale cloud pull does not revert the edit while pending', r.keptLocalWhilePending);
  ok('after a successful sync, a newer cloud value is adopted', r.adoptsNewerAfterSync);
  ok('no page errors', errs.length===0, errs.slice(0,3).join(' | '));

  await p.close();await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
