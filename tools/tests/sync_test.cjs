/* Two "it keeps not remembering things" bugs, both reported from a real device:

   1. Correcting the recovery email kept reverting to the old misspelling. The
      generic merge branch had one rule for plain values — a non-empty cloud
      value wins — which is right when the cloud is ahead and wrong for the
      whole window between an edit here and the upload that carries it.

   2. KindleOS wallpaper / accent / font size / folders / home-grid order were
      swept into the cloud side-car and written back over the local copy on the
      next pull, so a rearranged home screen reverted. That state describes THIS
      device and screen; it has no business on the cloud. */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url'),fs=require('fs');

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:600,height:800}});
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:20000});

  const r=await p.evaluate(async()=>{
    const out={};const S=window._KH.S;
    S.onboardingDone=true;

    /* ── 1. an edit here survives a pull that predates it ─────────────────── */
    window._khClearPendingFields();
    window._khPrevScalars=null;
    S.recoveryEmail='arancooll3000@gmail.com';   /* the wrong one, as synced */
    window.saveNow();                            /* seeds the snapshot */
    S.recoveryEmail='arancool3000@gmail.com';    /* the user fixes it */
    window.saveNow();                            /* records it as pending */
    out.editIsPending=window._khFieldPending('recoveryEmail');

    /* A pull carrying the OLD value must not undo the correction. */
    window.mergeCloudState({recoveryEmail:'arancooll3000@gmail.com'},{skipSave:true});
    out.localEditSurvivesPull=(S.recoveryEmail==='arancool3000@gmail.com');

    /* ── the edit that has not been WRITTEN yet ───────────────────────────
       save() debounces the localStorage write by 1.2s, and the pending ledger
       is now built on that same write rather than on every save() call — which
       is what stopped boot re-fingerprinting the whole account nineteen times.
       That leaves a window: type a correction, and a pull lands before the
       write does. The merge refreshes the ledger before reading it, so the
       edit still wins. Without that refresh this is silent data loss, and it
       would look exactly like the bug the ledger was added to fix. */
    window._khClearPendingFields();
    window._khPrevScalars=null;
    S.recoveryEmail='old@gmail.com';
    window.saveNow();                            /* baseline, written */
    S.recoveryEmail='typed-just-now@gmail.com';
    window.save(1200);                           /* debounced — NOT written yet */
    out.unwrittenEditNotYetOnDisk=!/typed-just-now/.test(localStorage.getItem('kindlehub_v5')||'');
    window.mergeCloudState({recoveryEmail:'old@gmail.com'},{skipSave:true});
    out.unwrittenEditSurvivesPull=(S.recoveryEmail==='typed-just-now@gmail.com');

    /* Fields the user did NOT touch still come down from the cloud — this must
       not turn into "the cloud can never update anything". */
    window.mergeCloudState({dailyGoal:'read a chapter'},{skipSave:true});
    out.untouchedFieldStillSyncs=(S.dailyGoal==='read a chapter');

    /* Once the upload succeeds the cloud value IS ours, so the guard lifts and
       another device's later edit is accepted. */
    window._khClearPendingFields();
    window._khPrevScalars=null;
    window.mergeCloudState({recoveryEmail:'newdevice@gmail.com'},{skipSave:true});
    out.otherDeviceWinsAfterUpload=(S.recoveryEmail==='newdevice@gmail.com');

    /* Signing out must not carry one account's pending edits to the next. */
    window.saveNow();                            /* baseline */
    S.recoveryEmail='pending@gmail.com';window.saveNow();
    const wasPending=window._khFieldPending('recoveryEmail');
    window._khResetAccountData();
    out.pendingClearedOnAccountReset=wasPending&&!window._khFieldPending('recoveryEmail');

    /* ── 1b. the ledger must not itself trigger a sync ───────────────────── */
    /* It is a kh_* key written on EVERY save. The auto-sync wrapper reacts to
       kh_* writes by invalidating the sync fingerprint and scheduling a
       pull+push, so letting it through meant the "nothing changed, skip the
       round-trip" short-circuit could never hold and a heavy account spent its
       time re-uploading instead of settling. */
    out.ledgerDoesNotInvalidateFingerprint=(function(){
      try{
        if(typeof window._stateFingerprint!=='function')return true;/* not exposed here */
        const before=window._stateFingerprint();
        localStorage.setItem('kh_pending_fields','{"x":1}');
        return window._stateFingerprint()===before;
      }catch(e){return false;}
    })();
    /* ...and a save that adds no NEW pending field must not rewrite it. */
    out.ledgerOnlyWritesWhenItChanges=(function(){
      try{
        window._khClearPendingFields();window._khPrevScalars=null;
        window.saveNow();                       /* baseline */
        S.dailyGoal='x1';window.saveNow();      /* marks dailyGoal */
        const first=localStorage.getItem('kh_pending_fields');
        S.dailyGoal='x2';window.saveNow();      /* same field again */
        return localStorage.getItem('kh_pending_fields')===first;
      }catch(e){return false;}
    })();

    /* ── 2. device-local KindleOS state stays off the cloud ──────────────── */
    localStorage.setItem('kh_os_wallmode','gradient');
    localStorage.setItem('kh_os_order',JSON.stringify(['a','b']));
    localStorage.setItem('kh_os_folders',JSON.stringify([{id:'f1'}]));
    localStorage.setItem('kh_fontsize','large');
    localStorage.setItem('kh_darkmode','1');
    localStorage.setItem('kh_custom_apps',JSON.stringify([{id:'mine'}]));
    localStorage.setItem('kh_notes_extra','keep me');
    const bag=window._gatherLocalStorage();
    out.wallpaperNotUploaded=!('kh_os_wallmode' in bag);
    out.gridOrderNotUploaded=!('kh_os_order' in bag);
    out.foldersNotUploaded=!('kh_os_folders' in bag);
    out.fontSizeNotUploaded=!('kh_fontsize' in bag);
    out.darkModeNotUploaded=!('kh_darkmode' in bag);
    out.pendingLedgerNotUploaded=!('kh_pending_fields' in bag);
    /* ...but apps the user BUILT are content and must follow them. */
    out.customAppsStillUploaded=('kh_custom_apps' in bag);
    out.otherDataStillUploaded=('kh_notes_extra' in bag);

    /* And a pull cannot write another device's layout over this one. */
    window.mergeCloudState({_lsBackup:{kh_os_wallmode:'white',kh_os_order:'[]'}},{skipSave:true});
    out.pullCannotRestoreLayout=(localStorage.getItem('kh_os_wallmode')==='gradient'
                                 &&localStorage.getItem('kh_os_order')==='["a","b"]');
    return out;
  });

  const src=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
  r.pendingClearedOnSuccessfulSync = /_syncOk=true;[\s\S]{0,300}?_khClearPendingFields\(\);/.test(src);
  /* The ledger is built where the state is WRITTEN and refreshed where it is
     READ — never on every save(), which made each one cost a pass over the
     whole account. Pinned in both directions: present at the two right places,
     and absent from the hot one. */
  const persistFn=(/function _persistState\(\)\{[\s\S]*?\n\}/.exec(src)||[''])[0];
  const saveFns=(/function save\(d=1200\)\{[\s\S]*?\nfunction savePref/.exec(src)||[''])[0];
  const mergeHead=(/function mergeCloudState\(cloudState,opts\)\{[\s\S]{0,900}/.exec(src)||[''])[0];
  r.ledgerBuiltOnWrite   = /_khTrackFieldEdits\(\);/.test(persistFn) && /_khTrackItemEdits\(\);/.test(persistFn);
  r.ledgerRefreshedOnMerge = /_khTrackFieldEdits\(\);/.test(mergeHead) && /_khTrackItemEdits\(\);/.test(mergeHead);
  r.ledgerNotOnEverySave = !/_khTrackItemEdits\(\)/.test(saveFns);
  r.mergeChecksPending = /if\(_khFieldPending\(key\)\)return;/.test(src);
  r.ledgerInWrapperSkipList = /k==='kh_boot'\|\|k==='kh_pending_fields'/.test(src);
  /* The baseline must exist before the session's first save, or the edit most
     likely to race a boot-time pull is the one left unprotected. */
  r.baselineSeededAtBoot = /window\._khPrevScalars=_khScalarSnapshot\(\);\}catch\(_\)\{\}/.test(src);

  console.log(JSON.stringify(r,null,1));
  const ok = r.editIsPending&&r.localEditSurvivesPull&&r.untouchedFieldStillSyncs&&
    r.otherDeviceWinsAfterUpload&&r.pendingClearedOnAccountReset&&
    r.wallpaperNotUploaded&&r.gridOrderNotUploaded&&r.foldersNotUploaded&&
    r.fontSizeNotUploaded&&r.darkModeNotUploaded&&r.pendingLedgerNotUploaded&&
    r.customAppsStillUploaded&&r.otherDataStillUploaded&&r.pullCannotRestoreLayout&&
    r.pendingClearedOnSuccessfulSync&&r.mergeChecksPending&&
    r.ledgerBuiltOnWrite&&r.ledgerRefreshedOnMerge&&r.ledgerNotOnEverySave&&
    r.unwrittenEditNotYetOnDisk&&r.unwrittenEditSurvivesPull&&
    r.baselineSeededAtBoot&&r.ledgerDoesNotInvalidateFingerprint&&
    r.ledgerOnlyWritesWhenItChanges&&r.ledgerInWrapperSkipList&&
    errs.length===0;
  console.log(ok?'PASS: local edits win until uploaded; device state stays off the cloud':'FAIL');
  console.log('ERRORS:',errs.length?errs.slice(0,3):'none');
  await b.close();
  process.exit(ok?0:1);
})();
