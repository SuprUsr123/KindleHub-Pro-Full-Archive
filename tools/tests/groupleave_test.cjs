/* "I left a DM and it keeps coming back."
   Device A leaves group X and pushes its state to the cloud (msgGroups without X,
   leftGroups WITH X, and — the fix — groupLeftAt[X]=<leave time>). Device B still
   holds a stale copy of X locally because it hasn't processed the leave yet. When
   B merges the cloud, it must HONOUR A's leave (drop X), not let its own stale copy
   resurrect it. But a GENUINE re-join (join stamped AFTER the leave) must still win.

   The distinguishing signal is time: a group survives the tombstone only if its
   joinedAt is newer than its leftAt. A code with no leftAt (left before this
   feature shipped) keeps the old presence-wins behaviour so nothing existing breaks.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tools/tests/groupleave_test.cjs */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url'),fs=require('fs');

let pass=0,fail=0;
const ok=(n,c,extra)=>{
  if(c){pass++;console.log('PASS '+n);}
  else{fail++;console.log('FAIL '+n+(extra!==undefined?('  -- '+String(extra).slice(0,200)):''));}
};

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:600,height:800}});
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:20000});

  const r=await p.evaluate(async()=>{
    const S=window._KH.S,out={};
    S.authToken='a'.repeat(64);S.syncEnabled=true;S.deletedItems={};
    const X='123456789012';
    const now=(typeof NOW==='function')?NOW().getTime():Date.now();/* epoch ms, as production stores it */

    /* ── Case 1 (the bug): another of MY devices left X at t=now and pushed. This
       device still holds a stale X (joined long ago, BEFORE the leave). The leave
       must win — X is dropped. ── */
    S.msgGroups=[{code:X,name:'DM: me & bob',joinedAt:now-100000}];/* joined before the leave */
    S.leftGroups=[];S.groupLeftAt={};
    await window.mergeCloudState({msgGroups:[],leftGroups:[X],groupLeftAt:{[X]:now}},{skipSave:true});
    out.case1_removed = !(S.msgGroups||[]).some(g=>g.code===X);   /* want true */
    out.case1_tomb    = (S.leftGroups||[]).indexOf(X)>=0;         /* leave propagates */

    /* ── Case 2 (must still work): I genuinely RE-JOINED X just now (joinedAt newer
       than the stale cloud tombstone). The re-join wins — X stays. ── */
    S.msgGroups=[{code:X,name:'DM: me & bob',joinedAt:now}];/* joined AFTER the old leave */
    S.leftGroups=[];S.groupLeftAt={};
    await window.mergeCloudState({msgGroups:[],leftGroups:[X],groupLeftAt:{[X]:now-100000}},{skipSave:true});
    out.case2_kept = (S.msgGroups||[]).some(g=>g.code===X);      /* want true */
    out.case2_untomb = (S.leftGroups||[]).indexOf(X)<0;          /* tombstone cleared by the re-join */

    /* ── Case 3 (never-worse / transition): a PRE-FEATURE cloud left X but uploaded
       no groupLeftAt. With no timestamp we keep the OLD presence-wins behaviour, so
       a local copy still cancels it. (This is the documented transition gap — it is
       no worse than before the fix, and closes once every device runs the new build.) ── */
    S.msgGroups=[{code:X,name:'DM: me & bob'}];/* no joinedAt, like a legacy entry */
    S.leftGroups=[];S.groupLeftAt={};
    await window.mergeCloudState({msgGroups:[],leftGroups:[X]},{skipSave:true});
    out.case3_presenceWins = (S.msgGroups||[]).some(g=>g.code===X);/* want true (unchanged) */

    /* ── Case 3b (DATA LOSS GUARD): a LEGACY entry (no joinedAt, from before
       stamping existed) must NEVER be dropped just because some device recorded
       a leave for that code. We have no evidence about when it was joined, and
       guessing wrong deletes a live conversation — reported as a DM folder
       falling from 15 chats to 6. Losing a chat is worse than one lingering. ── */
    const L1='444444444444',L2='555555555555',L3='666666666666';
    S.msgGroups=[{code:L1,name:'DM: a'},{code:L2,name:'DM: b'},{code:L3,name:'DM: c'}];/* no joinedAt on any */
    S.leftGroups=[];S.groupLeftAt={};
    await window.mergeCloudState({msgGroups:[],leftGroups:[L1,L2,L3],groupLeftAt:{[L1]:now,[L2]:now,[L3]:now}},{skipSave:true});
    out.case3b_legacyKept=(S.msgGroups||[]).length===3;
    out.case3b_count=(S.msgGroups||[]).length;

    /* ── Case 4: a group I'm genuinely in and never left is untouched. ── */
    const Y='222222222222';
    S.msgGroups=[{code:Y,name:'My group',joinedAt:now}];
    S.leftGroups=[];S.groupLeftAt={};
    await window.mergeCloudState({msgGroups:[{code:Y,name:'My group'}],leftGroups:[],groupLeftAt:{}},{skipSave:true});
    out.case4_kept = (S.msgGroups||[]).some(g=>g.code===Y);      /* want true */

    /* the leave helper stamps a timestamp; the join helper clears it */
    S.groupLeftAt={};S.leftGroups=[];
    if(typeof _khNoteGroupLeft==='function')_khNoteGroupLeft('999');
    out.leftStamped = !!(S.groupLeftAt&&S.groupLeftAt['999']);
    /* CRITICAL: it must be stored as a NUMBER (epoch ms), not a Date object —
       a Date serialises to an ISO string on save, and after a reload the numeric
       ">" comparisons in the merge would silently break. */
    out.leftIsNumber = typeof (S.groupLeftAt&&S.groupLeftAt['999'])==='number';
    if(typeof _khNoteGroupJoin==='function')_khNoteGroupJoin('999');
    out.joinCleared = !(S.groupLeftAt&&S.groupLeftAt['999']);

    /* ── Case 5: the whole thing must survive a JSON round-trip (save→reload).
       Stamp a leave, serialise+parse S (what localStorage does), and re-run the
       merge against the reloaded values — the left group must STILL be dropped. ── */
    const Z='333333333333';
    S.msgGroups=[{code:Z,name:'DM: z',joinedAt:now-100000}];
    S.leftGroups=[Z];S.groupLeftAt={};
    if(typeof _khNoteGroupLeft==='function')_khNoteGroupLeft(Z);/* stamps NOW().getTime() */
    const roundTrip=JSON.parse(JSON.stringify({msgGroups:S.msgGroups,leftGroups:S.leftGroups,groupLeftAt:S.groupLeftAt}));
    S.msgGroups=roundTrip.msgGroups;S.leftGroups=roundTrip.leftGroups;S.groupLeftAt=roundTrip.groupLeftAt;
    out.case5_leftAtStillNumber = typeof roundTrip.groupLeftAt[Z]==='number';
    /* a stale cloud copy (no info) pulls in; the reloaded leave must still hold */
    await window.mergeCloudState({msgGroups:[{code:Z,name:'DM: z',joinedAt:now-100000}],leftGroups:[Z],groupLeftAt:{[Z]:roundTrip.groupLeftAt[Z]}},{skipSave:true});
    out.case5_stillGoneAfterReload = !(S.msgGroups||[]).some(g=>g.code===Z);

    return out;
  });

  console.log(JSON.stringify(r,null,1));
  ok('Case 1: a DM another device left is DROPPED (no resurrection)', r.case1_removed, 'stillThere='+(!r.case1_removed));
  ok('Case 1: the leave tombstone still propagates', r.case1_tomb);
  ok('Case 2: a genuine re-join (newer than the leave) is KEPT', r.case2_kept);
  ok('Case 2: the re-join clears the tombstone', r.case2_untomb);
  ok('Case 3: a pre-feature leave (no timestamp) keeps old presence-wins behaviour', r.case3_presenceWins);
  ok('Case 3b: LEGACY entries with no joinedAt are never dropped (no vanishing chats)',
     r.case3b_legacyKept, 'kept '+r.case3b_count+' of 3');
  ok('Case 4: a group I never left is untouched', r.case4_kept);
  ok('_khNoteGroupLeft stamps a leave timestamp', r.leftStamped);
  ok('...stored as a NUMBER (survives JSON serialization, not a Date object)', r.leftIsNumber);
  ok('_khNoteGroupJoin clears the leave timestamp on re-join', r.joinCleared);
  ok('Case 5: leave timestamp is a number after a save→reload round-trip', r.case5_leftAtStillNumber);
  ok('Case 5: a left DM stays gone after a full reload of the stored state', r.case5_stillGoneAfterReload);
  ok('no page errors', errs.length===0, errs.slice(0,3).join(' | '));

  await p.close();await b.close();

  /* source-level: every leave site stamps, and the merge is timestamp-gated */
  const src=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
  ok('the merge gates re-joins on joinedAt > leftAt', /var jt=_khGroupJoinTs\(g\);[\s\S]{0,200}return jt>lt;/.test(src));
  ok('...and an un-stamped legacy entry is never destroyed', /if\(!jt\)return true;/.test(src));
  ok('groupLeftAt is a synced default field', /groupLeftAt:\{\}/.test(src));
  const leftCalls=(src.match(/_khNoteGroupLeft\(/g)||[]).length;
  ok('both group-leave sites stamp a timestamp (>=2 call sites + the def)', leftCalls>=3, 'calls='+leftCalls);
  ok('joins stamp joinedAt as epoch-ms (NOW().getTime()), never a Date object', /joinedAt:NOW\(\)\.getTime\(\)/.test(src)&&!/joinedAt:NOW\(\)[^.]/.test(src));
  ok('the merge keeps the FRESHER joinedAt entry (no first-wins downgrade)', /_khGroupJoinTs\(g\)>_khGroupJoinTs\(ex\)/.test(src));

  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
