/* Sign-in must never be taken down by a field whose SHAPE is from an older
   build. mergeCloudState runs during login and used to call .forEach on
   whatever it found in a tracked list, so a To-Do board still stored in the
   legacy {todo,doing,done} object form threw
   "(S[key] || []).forEach is not a function" and the account could not be
   opened at all.

   The fix coerces both sides through _khAsItemList, salvaging the legacy shape
   into the flat array instead of discarding the user's tasks.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tools/tests/loginshape_test.cjs */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url');

let pass=0,fail=0;
const ok=(n,c,extra)=>{if(c){pass++;console.log('PASS '+n);}else{fail++;console.log('FAIL '+n+(extra!==undefined?('  -- '+String(extra).slice(0,220)):''));}};

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:600,height:800}});
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:20000});

  const r=await p.evaluate(async()=>{
    const S=window._KH.S,out={};
    S.authToken='a'.repeat(64);S.syncEnabled=true;S.deletedItems={};
    const legacy=()=>({todo:[{id:'t1',text:'buy milk',created:'2026-07-01T00:00:00.000Z'}],
                       doing:[{id:'t2',text:'write notes',created:'2026-07-02T00:00:00.000Z'}],
                       done:[{id:'t3',text:'ship it',created:'2026-07-03T00:00:00.000Z'}]});

    /* 1. LOCAL still legacy (device hasn't opened To-Do since the change) */
    S.kanban=legacy();
    try{ await window.mergeCloudState({kanban:[{id:'t4',text:'from cloud',created:'2026-07-04T00:00:00.000Z',col:'todo'}]},{skipSave:true});
         out.localLegacyOk=true; }
    catch(e){ out.localLegacyOk=false; out.localErr=String(e); }
    out.localIsArray=Array.isArray(S.kanban);
    out.localTaskKept=(S.kanban||[]).some(t=>t&&t.text==='buy milk');
    out.cloudTaskMerged=(S.kanban||[]).some(t=>t&&t.text==='from cloud');
    out.colPreserved=((S.kanban||[]).filter(t=>t&&t.text==='ship it')[0]||{}).col==='done';

    /* 2. CLOUD still legacy (another device on an older build pushed it) */
    S.kanban=[{id:'t9',text:'local only',created:'2026-07-05T00:00:00.000Z',col:'todo'}];
    try{ await window.mergeCloudState({kanban:legacy()},{skipSave:true}); out.cloudLegacyOk=true; }
    catch(e){ out.cloudLegacyOk=false; out.cloudErr=String(e); }
    out.cloudLegacyIsArray=Array.isArray(S.kanban);
    out.cloudLegacySalvaged=(S.kanban||[]).some(t=>t&&t.text==='write notes');
    out.localSurvived=(S.kanban||[]).some(t=>t&&t.text==='local only');

    /* 3. Junk shapes must not crash either (string / number / null) */
    const junk=['nonsense',42,null,{unexpected:true}];
    out.junkOk=true;
    for(const j of junk){
      S.kanban=j;
      try{ await window.mergeCloudState({kanban:j},{skipSave:true}); }
      catch(e){ out.junkOk=false; out.junkErr=String(e); }
      if(!Array.isArray(S.kanban)){out.junkOk=false;out.junkErr='left non-array for '+JSON.stringify(j);}
    }

    /* 4. the other tracked lists are equally protected */
    S.notes={not:'an array'};
    try{ await window.mergeCloudState({notes:[{id:'n1',text:'hello'}]},{skipSave:true}); out.notesOk=Array.isArray(S.notes); }
    catch(e){ out.notesOk=false; out.notesErr=String(e); }
    return out;
  });

  console.log(JSON.stringify(r,null,1));
  ok('a legacy LOCAL kanban no longer crashes the login merge', r.localLegacyOk, r.localErr);
  ok('...it is normalised to an array', r.localIsArray);
  ok('...and the user\'s existing tasks are SALVAGED, not discarded', r.localTaskKept);
  ok('...their column is preserved', r.colPreserved);
  ok('...and the cloud copy still merges in', r.cloudTaskMerged);
  ok('a legacy CLOUD kanban no longer crashes the merge', r.cloudLegacyOk, r.cloudErr);
  ok('...its tasks are salvaged', r.cloudLegacySalvaged);
  ok('...and local-only tasks survive', r.localSurvived);
  ok('junk shapes (string/number/null/object) never crash and always normalise', r.junkOk, r.junkErr);
  ok('other tracked lists are protected the same way', r.notesOk, r.notesErr);
  ok('no page errors', errs.length===0, errs.slice(0,3).join(' | '));

  await p.close();await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
