/* Data-integrity regressions found by the bug hunt and verified against the
   code that actually writes each thing:
     - a FAILED cloud upload was recorded as a successful sync, and the
       fingerprint guard then skipped every later sync, so the edit stayed on
       the device while the app claimed to be synced;
     - "delete account" ran authLogout, whose farewell sync re-uploaded the
       account straight after the server deleted it;
     - signing out left the previous user's content in S, so the next account
       to sign in merged it in and uploaded it — along with their paid tier;
     - "Use my location" wrote to three inputs that no longer exist. */
const path=require('path'),fs=require('fs');
const src=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
let pass=0,fail=0;
const ok=(name,cond)=>{if(cond){pass++;console.log('PASS '+name);}else{fail++;console.log('FAIL '+name);}};

/* ── syncToCloud must report failure, and the scheduler must believe it ── */
const syncFn=src.slice(src.indexOf('async function syncToCloud(){'),
                       src.indexOf('async function syncToCloud(){')+4200);
ok('syncToCloud returns false when the upload throws',
   /catch\(e\)\{[\s\S]*?_stateDirty=true;\s*return false;/.test(syncFn));
ok('a coalesced sync does not claim to be done',
   /if\(_syncInFlight\)\{_syncQueued=true;return false;\}/.test(syncFn));
ok('syncToCloud reports success explicitly',/_syncOk=true;/.test(syncFn)&&/return _syncOk;/.test(syncFn));
ok('an offline/failed-load guard is NOT reported as a successful sync',
   /__khStateLoadFailed\)return false;/.test(syncFn)&&/navigator\.onLine===false\)return false;/.test(syncFn));
ok('the scheduler only stamps the fingerprint on a real success',
   /var ok=await syncToCloud\(\);\s*if\(ok\)\{_lastSyncedHash=fp;_stateDirty=false;\}/.test(src));
ok('a failed scheduled sync stays dirty so it retries',
   /else\{_stateDirty=true;\}/.test(src)&&/catch\(e\)\{console\.warn\('Sync failed',e\);_stateDirty=true;\}/.test(src));

/* ── delete account must not re-upload ── */
ok('authLogout takes a skipFarewellSync option',/async function authLogout\(opts\)\{/.test(src));
ok('the farewell sync is conditional',/if\(S\.authToken&&!opts\.skipFarewellSync\)try\{await syncToCloud\(\);\}/.test(src));
ok('account deletion skips the farewell sync',
   /await authLogout\(\{skipFarewellSync:true\}\)/.test(src));

/* ── sign-out must not leave one user's data for the next ── */
ok('there is an account-data reset',/function _khResetAccountData\(\)\{/.test(src));
ok('logout calls it',/S\.userId=null;S\.authToken=null;S\.email=null;S\.syncEnabled=false;S\._encKey=null;\s*_khResetAccountData\(\);/.test(src));
ok('the reset rebuilds from defaultState',/var fresh=defaultState\(\);/.test(src));
ok('the reset clears the cached paid tier',/S\.entitlement=null;/.test(src));
ok('device-only preferences are preserved by an explicit list',
   /var KH_DEVICE_KEYS=\[/.test(src));
ok('the device list does not contain content fields',(function(){
  const m=src.match(/var KH_DEVICE_KEYS=\[([\s\S]*?)\];/);
  if(!m)return false;
  const bad=['notes','books','games','calEvents','msgGroups','publishedApps','flashDecks',
             'mdJournals','entitlement','authToken','email','friends','savedChatHistory'];
  return !bad.some(k=>m[1].indexOf("'"+k+"'")>=0);
})());
ok('logout caches an encrypted copy first, so the wipe cannot lose unsynced work',
   /var _packed=await _encryptState\(_hadKey,_buildSafeState\(\)\);/.test(src));
ok('switching accounts without a sign-out also resets',
   /if\(S\.authToken&&S\.authToken!==key\)\{[\s\S]{0,400}?_khResetAccountData\(\);/.test(src));

/* ── the location control ── */
ok('Use my location no longer touches the deleted coordinate inputs',
   !/_latInp\.value=loc\.lat/.test(src));
ok('...and updates the picker it actually has',
   /locSel\.value='__custom__';\s*_customPanel2\.style\.display='flex';\s*_cityInp\.value=/.test(src));
ok('no dead _latInp/_lonInp/_cNameInp code remains (comments aside)',
   !/_latInp\s*[.=]|_lonInp\s*[.=]|_cNameInp\s*[.=]/.test(src));
ok('the town search is not still labelled "Custom coordinates"',
   !/Custom coordinates\.\.\./.test(src));

/* ── a published app must not be able to comment out its own CSP ── */
ok('the CSP injection point is found on a comment-masked copy',
   /function _khMaskInert\(str\)\{/.test(src)&&/function _khTagEnd\(str,re\)\{/.test(src));
ok('_khWrapAppSecure no longer blind-replaces the first <head> match',
   !/s\.replace\(\/<head\[\^>\]\*>\/i,function\(m\)\{return m\+csp;\}\)/.test(src));
/* And prove the hole was real: the OLD logic put the policy inside the comment. */
(function(){
  const oldLogic=(h,csp)=>/<head[^>]*>/i.test(h)?h.replace(/<head[^>]*>/i,m=>m+csp):h;
  const decoy='<!-- <head> --><html><head></head><body>evil</body></html>';
  const out=oldLogic(decoy,'[CSP]'),i=out.indexOf('[CSP]'),b=out.slice(0,i);
  ok('(sanity) the old logic really was escapable',b.lastIndexOf('<!--')>b.lastIndexOf('-->'));
})();

console.log('\n'+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
