/* Two reports, one cause: the cloud copy of a thing you just changed comes
   back and overwrites your change.

   1. "notes need to save on the CLOUD". Notes DO travel — but the list branch
      of the merge is cloud-first, so when both sides carry the same id the
      cloud copy wins. That is right when the cloud is ahead and wrong for the
      whole window between an edit and the upload that carries it. Edit a note,
      reload before the push lands, and the old text is back. The pending ledger
      already solved exactly this for scalar fields; it now covers the items
      inside the merged lists too.

   2. "localstorage and cloud have a lot of fights — the to-do app". The board
      lived in localStorage['kh_kanban'] and reached the cloud only inside the
      localStorage side-car, which a pull writes back WHOLESALE. Two devices
      overwrote each other's whole board. It is a tracked list in the state now,
      so it merges by task instead.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tools/tests/synclists_test.cjs */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url'),fs=require('fs');

let pass=0,fail=0;
const ok=(n,c,extra)=>{
  if(c){pass++;console.log('PASS '+n);}
  else{fail++;console.log('FAIL '+n+(extra?'  -- '+String(extra).slice(0,240):''));}
};

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:600,height:800}});
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:20000});

  const r=await p.evaluate(async()=>{
    const S=window._KH.S,out={};
    const CLEAN=()=>{
      S.deletedItems={};window._khPrevIds=null;window._khPrevItems=null;
      try{localStorage.removeItem('kh_pending_fields');}catch(_e){}
    };
    S.authToken='a'.repeat(64);S.syncEnabled=true;

    /* ── 1. a note edited here beats the cloud's older copy ──────────────── */
    CLEAN();
    S.notes=[{id:'n1',text:'original',date:'2026-07-01T10:00:00.000Z',tags:[]}];
    window._khTrackItemEdits();                       /* baseline: what save() does */
    S.notes[0].text='EDITED HERE';                    /* the user types */
    S.notes[0].date='2026-07-29T12:00:00.000Z';
    window._khTrackItemEdits();                       /* the save that follows */
    out.editIsMarkedPending=window._khFieldPending('notes:n1')===true;
    await window.mergeCloudState({notes:[{id:'n1',text:'stale cloud copy',date:'2026-07-01T10:00:00.000Z',tags:[]}]},{skipSave:true});
    out.editedNote=(S.notes[0]||{}).text;
    out.editSurvivesThePull=out.editedNote==='EDITED HERE';

    /* ...and once the upload has actually happened, the cloud copy IS ours, so
       another device's later edit must be accepted normally again. */
    window._khClearPendingFields();
    window._khPrevItems=window._khItemSnapshot();
    await window.mergeCloudState({notes:[{id:'n1',text:'from the other device',date:'2026-07-30T09:00:00.000Z',tags:[]}]},{skipSave:true});
    out.afterUploadOtherDeviceWins=(S.notes[0]||{}).text==='from the other device';

    /* An id this device has never seen is an ADDITION, not an edit — marking
       those pending would pin every incoming item and never converge. */
    CLEAN();
    S.notes=[];window._khTrackItemEdits();
    S.notes=[{id:'n9',text:'brand new',date:'2026-07-29T10:00:00.000Z',tags:[]}];
    window._khTrackItemEdits();
    out.additionNotMarked=window._khFieldPending('notes:n9')===false;

    /* A deleted note still stays deleted — the tombstone wins over pending. */
    CLEAN();
    S.notes=[{id:'n2',text:'doomed',date:'2026-07-01T10:00:00.000Z',tags:[]}];
    window._khTrackDeletions();
    S.notes=[];
    window._khTrackDeletions();
    await window.mergeCloudState({notes:[{id:'n2',text:'doomed',date:'2026-07-01T10:00:00.000Z',tags:[]}]},{skipSave:true});
    out.deletedStaysDeleted=(S.notes||[]).length===0;

    /* Books get the same protection — it was never notes-specific. */
    CLEAN();
    S.books=[{id:'b1',title:'A Book',status:'reading'}];
    window._khTrackItemEdits();
    S.books[0].status='finished';
    window._khTrackItemEdits();
    await window.mergeCloudState({books:[{id:'b1',title:'A Book',status:'reading'}]},{skipSave:true});
    out.bookEditSurvives=(S.books[0]||{}).status==='finished';

    /* ── 2. the To-Do board ───────────────────────────────────────────────── */
    CLEAN();
    S.kanban=[];
    try{localStorage.removeItem('kh_kanban_migrated');}catch(_e){}
    localStorage.setItem('kh_kanban',JSON.stringify({
      todo:[{id:11,text:'legacy todo',created:'2026-07-01T10:00:00.000Z'}],
      doing:[],done:[{id:12,text:'legacy done',created:'2026-07-01T10:00:00.000Z'}]}));
    const board=window._khKanbanBoard();
    out.legacyMigrated=board.todo.length===1&&board.done.length===1
      &&board.todo[0].text==='legacy todo';

    /* The migration is a UNION: another device may already have pushed its own
       board, and this device's local-only tasks still have to survive that. */
    CLEAN();
    S.kanban=[{id:'other',text:'from the laptop',created:'2026-07-02T10:00:00.000Z',col:'todo'}];
    try{localStorage.removeItem('kh_kanban_migrated');}catch(_e){}
    const b2=window._khKanbanBoard();
    out.migrationUnions=b2.todo.length===2;

    /* The old key must not ride the side-car any more, or a pull writes it
       straight back over the board — the fight this move exists to end. */
    out.legacyKeyNotBackedUp=window._isLsBackupSkipped('kh_kanban')===true;
    out.migrationFlagNotBackedUp=window._isLsBackupSkipped('kh_kanban_migrated')===true;

    /* Two devices' tasks combine rather than one replacing the other. */
    CLEAN();
    S.kanban=[{id:'k1',text:'added on the kindle',created:'2026-07-29T10:00:00.000Z',col:'todo'}];
    window._khTrackItemEdits();
    await window.mergeCloudState({kanban:[{id:'k2',text:'added on the laptop',created:'2026-07-29T09:00:00.000Z',col:'todo'}]},{skipSave:true});
    out.boardsCombine=(S.kanban||[]).length===2;

    /* Moving a task to Done is an EDIT of that task, so an older cloud copy
       must not drag it back to To Do. */
    CLEAN();
    S.kanban=[{id:'k3',text:'finish the thing',created:'2026-07-29T10:00:00.000Z',col:'todo'}];
    window._khTrackItemEdits();
    S.kanban[0].col='done';
    window._khTrackItemEdits();
    await window.mergeCloudState({kanban:[{id:'k3',text:'finish the thing',created:'2026-07-29T10:00:00.000Z',col:'todo'}]},{skipSave:true});
    out.moveToDoneSticks=(S.kanban[0]||{}).col==='done';

    /* A deleted task stays deleted across a pull. */
    CLEAN();
    S.kanban=[{id:'k4',text:'delete me',created:'2026-07-29T10:00:00.000Z',col:'todo'}];
    window._khTrackDeletions();
    S.kanban=[];
    window._khTrackDeletions();
    await window.mergeCloudState({kanban:[{id:'k4',text:'delete me',created:'2026-07-29T10:00:00.000Z',col:'todo'}]},{skipSave:true});
    out.deletedTaskStaysDeleted=(S.kanban||[]).length===0;

    /* The fingerprint must actually notice an edit rather than only a length
       change, and must stay bounded on a very large item. */
    out.fpSeesSameLengthEdit=window._khItemFp({id:'x',t:'aaaa'})!==window._khItemFp({id:'x',t:'aaab'});
    const big={id:'y',html:'z'.repeat(400000)};
    const t0=performance.now();for(let i=0;i<200;i++)window._khItemFp(big);
    out.fpBoundedMs=performance.now()-t0;
    out.fpIsBounded=out.fpBoundedMs<200;

    S.notes=[];S.books=[];S.kanban=[];S.authToken='';
    return out;
  });

  console.log(JSON.stringify(r,null,1));
  ok('editing a note marks it pending', r.editIsMarkedPending);
  ok('an edit made here is not overwritten by the cloud\'s older copy', r.editSurvivesThePull, r.editedNote);
  ok('...and once uploaded, another device\'s later edit is accepted again', r.afterUploadOtherDeviceWins);
  ok('a brand-new item is an addition, not an edit', r.additionNotMarked);
  ok('a deleted note still stays deleted', r.deletedStaysDeleted);
  ok('books get the same protection, not just notes', r.bookEditSurvives);
  ok('the legacy To-Do board is migrated into the synced state', r.legacyMigrated);
  ok('...as a union, so another device\'s board does not erase this one\'s', r.migrationUnions);
  ok('the old kh_kanban key no longer rides the side-car', r.legacyKeyNotBackedUp);
  ok('...nor does the per-device migration flag', r.migrationFlagNotBackedUp);
  ok('two devices\' tasks combine instead of one replacing the other', r.boardsCombine);
  ok('moving a task to Done is not dragged back by an older cloud copy', r.moveToDoneSticks);
  ok('a deleted task stays deleted', r.deletedTaskStaysDeleted);
  ok('the fingerprint notices an edit that does not change the length', r.fpSeesSameLengthEdit);
  ok('...and stays cheap on a very large item', r.fpIsBounded, r.fpBoundedMs+'ms for 200 hashes of 400KB');
  ok('no page errors', errs.length===0, errs.join(' | '));

  await p.close();await b.close();

  const src=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
  ok('the board is a tracked list, so it gets tombstones too',
     /_KH_TRACKED_LISTS=\[[^\]]*'kanban'\]/.test(src));
  ok('the merge consults the pending ledger for list items',
     /if\(_khFieldPending\(key\+':'\+id\)&&localById\.has\(id\)\)merged\.push\(localById\.get\(id\)\);/.test(src));
  ok('item edits are tracked from save(), like scalar edits',
     /function save\(d=1200\)\{\n  _khTrackFieldEdits\(\);\n  _khTrackItemEdits\(\);/.test(src));
  ok('...and from saveNow()', /function saveNow\(\)\{\n  _khTrackFieldEdits\(\);\n  _khTrackItemEdits\(\);/.test(src));
  ok('a successful upload re-seeds the item baseline',
     /_khClearPendingFields\(\);[\s\S]{0,200}window\._khPrevItems=_khItemSnapshot\(\);/.test(src));
  ok('the migration flag is device-local, never a field in S',
     /localStorage\.getItem\('kh_kanban_migrated'\)==='1'/.test(src) && !/S\.kanbanMigrated/.test(src));
  ok('nothing writes the raw board key any more',
     !/localStorage\.setItem\('kh_kanban'/.test(src));

  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
