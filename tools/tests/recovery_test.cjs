/* The Recovery screen destroyed an account.
 *
 * It said "Your saved data is safe." and then offered, as the big black PRIMARY
 * button, "Reset & Reload" — a bare localStorage.clear() with no confirmation.
 * A reader whose Kindle showed a startup error read the reassurance, pressed the
 * obvious button, and lost everything. It also wiped the device id and the
 * gateway URLs, which the deliberate delete-account flow is careful to keep, so
 * the reset device could not even reach the backend to restore itself.
 *
 * These assertions are about the RULE, not the pixels: what each button is
 * allowed to remove. A keep-list is verified by seeding real keys and running
 * the shipped logic over them, because "does it delete the account" is the only
 * question that matters here and it must be answered against the built file. */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url'),fs=require('fs');
let pass=0,fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x!==undefined&&!c?'  -- '+String(x).slice(0,260):''));};

(async()=>{
  const src=fs.readFileSync(path.resolve('index.html'),'utf8');
  const rec=src.slice(src.indexOf('KindleHub Pro — Recovery')-2200,
                      src.indexOf('KindleHub Pro — Recovery')+5200);

  console.log('── what the screen may do ──');
  /* The exact shape that caused the loss: a clear() wired straight to a button
     attribute, so one tap and it is gone. */
  ok('no button attribute wipes storage outright',
     !/onclick="[^"]*localStorage\.clear\(\)/.test(src));
  ok('the destructive path asks first',
     /window\.confirm\(warn\)/.test(rec)&&/cannot be undone|not yet synced/.test(rec));
  ok('the primary action is to retry, not to erase',
     rec.indexOf('khRecReload')<rec.indexOf('khRecWipe'), 'wipe must not come first');
  /* Checked against the SHIPPED bundle. The source explains, in a comment, what
     the old copy said — and scanning source made that comment fail the test,
     which is the same trick that broke the deploy workflow (a grep for the
     placeholder matched the comment saying the placeholder was gone). */
  const shipped=fs.readFileSync(path.resolve('kh-app.js'),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
  ok('the screen no longer promises safety next to a delete button',
     !/Your saved data is safe\./.test(shipped));
  ok('an erase still leaves the device able to reach the backend',
     /kh_device_id','kh_api_gateway','kh_state_gateway','kh_mail_gateway'/.test(rec));

  console.log('\n── the repair keep-list, run for real ──');
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await(await b.newContext({viewport:{width:600,height:800}})).newPage();
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve('index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:30000});

  /* Lift the keep-list out of the shipped source and apply it exactly as the
     button does, over a storage seeded with the things a reader would lose. */
  const keepLine=(src.match(/var keep=\{'kindlehub_v5'[\s\S]*?\};/)||[])[0];
  ok('the repair keep-list is present in the source', !!keepLine, keepLine);

  const res=await p.evaluate(function(keepSrc){
    var seeded={
      'kindlehub_v5':'THE-ACCOUNT-AND-EVERYTHING-IN-IT',
      'kh_session':'boot-mirror','kh_device_id':'dev-1',
      'kh_api_gateway':'https://api.example.workers.dev',
      'kh_offline_cred':'encrypted-blob','kh_last_user':'aran',
      'kh_admin_secret':'shh','kh_custom_apps':'[{"name":"mine"}]',
      'kh_habits':'{"read":true}',
      /* the things a repair SHOULD clear */
      'kh_gedit':'{"css":"*{display:none}"}','kh_gedit_probation':'{"ts":1}',
      'kh_boot':'hints','kh_mc_000000000000':'cached-msgs','kh_notifs':'[]',
      'kh_darkmode':'1'
    };
    localStorage.clear();
    for(var k in seeded)localStorage.setItem(k,seeded[k]);
    var keep;eval(keepSrc);            /* the shipped list, verbatim */
    var doomed=[],i,kk;
    for(i=0;i<localStorage.length;i++){kk=localStorage.key(i);if(kk&&!keep[kk])doomed.push(kk);}
    for(i=0;i<doomed.length;i++)localStorage.removeItem(doomed[i]);
    var out={survivors:{},removed:doomed.slice().sort()};
    for(i=0;i<localStorage.length;i++){kk=localStorage.key(i);out.survivors[kk]=localStorage.getItem(kk);}
    localStorage.clear();
    return out;
  },keepLine);

  ok('a repair NEVER touches the account',
     res.survivors['kindlehub_v5']==='THE-ACCOUNT-AND-EVERYTHING-IN-IT', JSON.stringify(res.survivors));
  ok('...nor the way back in',
     res.survivors['kh_offline_cred']==='encrypted-blob'&&res.survivors['kh_last_user']==='aran',
     JSON.stringify(res.survivors));
  ok('...nor the backend address',
     res.survivors['kh_api_gateway']==='https://api.example.workers.dev', JSON.stringify(res.survivors));
  ok('...nor apps and habits the reader made',
     !!res.survivors['kh_custom_apps']&&!!res.survivors['kh_habits'], JSON.stringify(res.survivors));
  /* and it must actually repair something, or it is just a slower reload */
  ok('a repair DOES clear a bricking style edit',
     res.removed.indexOf('kh_gedit')>=0&&res.removed.indexOf('kh_gedit_probation')>=0,
     res.removed.join(','));
  ok('...and boot hints and caches',
     res.removed.indexOf('kh_boot')>=0&&res.removed.indexOf('kh_mc_000000000000')>=0,
     res.removed.join(','));

  console.log('\n── the rollback notice says itself once ──');
  const said=await p.evaluate(()=>{
    var shown=0;
    var realNote=window._khGeditNote;
    /* count banners by watching the node the notice creates */
    localStorage.removeItem('kh_gedit_noted');
    var edit={ts:12345,css:'body{display:none}'};
    localStorage.setItem('kh_gedit_probation',JSON.stringify({ts:12345,at:Date.now()}));
    var before=document.querySelectorAll('#kh-gedit-recovered').length;
    window._khApplyGlobalEdit(edit);
    var after1=document.querySelectorAll('#kh-gedit-recovered').length;
    /* the poll re-detects the same quarantined edit on the next load */
    localStorage.setItem('kh_gedit_probation',JSON.stringify({ts:12345,at:Date.now()}));
    window._khApplyGlobalEdit(edit);
    var after2=document.querySelectorAll('#kh-gedit-recovered').length;
    Array.prototype.forEach.call(document.querySelectorAll('#kh-gedit-recovered'),n=>n.remove());
    localStorage.removeItem('kh_gedit_noted');
    return {before,after1,after2,
            noted:localStorage.getItem('kh_gedit_noted'),
            cleared:!!localStorage.getItem('kh_gedit_cleared'),
            stillStored:!!localStorage.getItem('kh_gedit')};
  });
  /* The bar is gone by request: correct the first time, intolerable when it
     reappeared on every load while the edit stayed published and the reader
     could do nothing about it. What must survive is the ROLLBACK. */
  ok('a rolled-back edit is never announced', said.after1===0&&said.after2===0, JSON.stringify(said));
  ok('...and the edit really was dropped',
     said.cleared&&!said.stillStored, JSON.stringify(said));

  console.log('\n── a bricking style edit must not be immortal ──');
  /* The banner that "comes back each reload". _gatherLocalStorage sweeps every
     kh_* key that is not skipped, so the broken edit was backed up to the cloud
     and RESTORED after the quarantine deleted it — applied, bricked, reverted,
     restored, on every reload and on every device on the account. */
  const gedit=await p.evaluate(()=>({
    edit:_isLsBackupSkipped('kh_gedit'),
    prob:_isLsBackupSkipped('kh_gedit_probation'),
    cleared:_isLsBackupSkipped('kh_gedit_cleared'),
    noted:_isLsBackupSkipped('kh_gedit_noted'),
    /* the sweep is the thing that actually decides it */
    swept:(function(){
      localStorage.setItem('kh_gedit','{"css":"*{display:none}","ts":1}');
      var bag=_gatherLocalStorage();
      localStorage.removeItem('kh_gedit');
      return Object.prototype.hasOwnProperty.call(bag,'kh_gedit');
    })()
  }));
  ok('the live edit is not backed up',        gedit.edit===true, JSON.stringify(gedit));
  ok('...nor its safety flags',               gedit.prob&&gedit.cleared&&gedit.noted, JSON.stringify(gedit));
  ok('...and the real sweep leaves it out',   gedit.swept===false, JSON.stringify(gedit));

  console.log('\n── the login name is not a server credential ──');
  /* api-worker isAdmin(): "if(!_ADMIN_SECRET_HASH) return false; // fail closed
     — never the username". Sending it could only ever fail, and the Worker
     counts failed privileged tokens per IP, so the owner's own device burned
     its lockout budget having never typed a code. */
  const w=fs.readFileSync(path.resolve('api-worker.js'),'utf8');
  ok('the worker still refuses a username outright',
     /if\(!_ADMIN_SECRET_HASH\)\s*return false;/.test(w));
  const idFn=src.slice(src.indexOf('async function _khAdminIdentity'),
                       src.indexOf('window._khAdminIdentity='));
  ok('identity no longer arms the admin token',
     !/_adminToken=tokens\[i\]/.test(idFn), idFn.slice(0,200));
  ok('...while a saved secret still does',
     /if\(_as\)\{window\._adminToken=_as;/.test(src));

  console.log('\n── a gift can say why ──');
  const gift=src.slice(src.indexOf('function _khGiftPlan'),src.indexOf('window._khGiftPlan='));
  ok('the gift dialog takes a note',      /noteIn=document\.createElement\('textarea'\)/.test(gift));
  ok('...prefilled but never clobbering typing',
     /_noteTouched/.test(gift)&&/if\(!_noteTouched\)noteIn\.value=_defaultNote\(\)/.test(gift));
  ok('...sent only after the grant succeeded',
     gift.indexOf('kh_post_announcement')>gift.indexOf('r&&r.ok&&d&&d.ok'), 'note must follow the grant');
  ok('...and a failed note never fails the gift',
     /could not be sent/.test(gift));

  console.log('\n── a refusal must come from the server ──');
  /* "It says refused but I have all my admin tools." The save handler set
     _isAdminCached=undefined, fired _checkAdmin() WITHOUT awaiting it, then
     probed — and the probe's first line reads _isAdminCached. It returned early
     every time, and the handler reported a refusal without one request having
     been sent. */
  const verdict=await p.evaluate(async()=>{
    var calls=0;
    var realRpc=window._khRpcCallEx;
    window._khRpcCallEx=async function(){calls++;return {status:200,ok:true};};
    window._isAdminCached=undefined;
    /* the exact state the save handler creates */
    var early=await window._khAdminServerOk(true);
    window._isAdminCached=true;
    window._adminToken='a-real-secret';
    window._adminServerOk=null;
    var good=await window._khAdminServerOk(true);
    window._khRpcCallEx=async function(){calls++;return {status:403,ok:false};};
    window._adminServerOk=null;window._khAdminEverOk=false;
    var refused=await window._khAdminServerOk(true);
    window._khRpcCallEx=realRpc;
    return {early:early,good:good,refused:refused,calls:calls};
  });
  ok('an unresolved client is NOT a refusal',  verdict.early!==false, JSON.stringify(verdict));
  ok('a 2xx is an acceptance',                 verdict.good===true, JSON.stringify(verdict));
  ok('only a 403 is a refusal',                verdict.refused===false, JSON.stringify(verdict));
  const saveFn=src.slice(src.indexOf("var _secSave=txt('button','Save admin secret'"),
                         src.indexOf("c.appendChild(_secSave);"));
  ok('the save handler waits for identity before asking',
     /\.then\(function\(\)\{ return \(typeof _checkAdmin==='function'\)\?_checkAdmin\(\):null; \}\)/.test(saveFn),
     saveFn.slice(0,240));

  console.log('\n── the banner is gone ──');
  const banner=await p.evaluate(()=>{
    document.querySelectorAll('#kh-gedit-recovered').forEach(n=>n.remove());
    window._khGeditNote&&window._khGeditNote('test');
    return document.querySelectorAll('#kh-gedit-recovered').length;
  });
  ok('the rollback bar is never drawn', banner===0, 'found '+banner);
  ok('...but the rollback itself still runs',
     /localStorage\.removeItem\('kh_gedit'\)/.test(src));

  console.log('\n── the AI is told what slop is ──');
  const sys=src.slice(src.indexOf('function buildSYS'),src.indexOf('function buildSYS')+9000);
  ok('slop is named and defined',      /AI slop/.test(sys)&&/padding/.test(sys));
  ok('opening filler is banned',       /Certainly, Absolutely, Of course/.test(sys));
  ok('closing filler is banned',       /I hope this helps/.test(sys));
  ok('length must match the question', /A factual question gets one or two sentences/.test(sys));
  ok('not knowing is allowed',         /say 'I don't know' and stop|I don\\'t know/.test(sys));

  ok('no page errors', errs.length===0, errs.slice(0,3).join(' | '));
  await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
