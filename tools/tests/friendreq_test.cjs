/* "I clear the friend request and it keeps coming back."
   One person can leave SEVERAL FRIEND_REQUEST rows in your inbox (they re-clicked,
   or a flaky-wifi send retried) — each a different message id. Declining only
   tombstoned the ONE row you saw, so the duplicates re-prompted on every replay.

   Fix: a content-level decline stamp keyed on the declined message's timestamp.
   All of that person's requests sent at/around that time or earlier are silenced;
   a genuinely LATER request still comes through (so a real re-ask isn't lost).

   Run: NODE_PATH=/opt/node22/lib/node_modules node tools/tests/friendreq_test.cjs */
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
    S.friends=[];S.friendRequests=[];S.friendReqTombs=[];S.friendDeclinedAt={};
    const H='abcdef123456';/* fromHash → 16-hex hash */
    const base=1700000000000;/* fixed message-timeline ts */
    /* the real inbox send path stamps ts as an ISO string (new Date().toISOString()),
       so the test must use that shape — a numeric ts would hide the parse bug */
    const req=(id,ms)=>({type:'FRIEND_REQUEST',id:id,ts:new Date(ms).toISOString(),payload:{fromHash:H,fromUserId:'u_'+H,fromName:'Duplicator'}});

    /* 1. first request arrives → becomes pending */
    window._khOnFriendRequest(req('m1',base));
    out.pendingAfter1=(S.friendRequests||[]).some(x=>x.hash===H);

    /* 2. decline it → gone, and a decline stamp is recorded */
    window._khDeclineFriendRequest(H);
    out.goneAfterDecline=!(S.friendRequests||[]).some(x=>x.hash===H);
    out.declineStamped=!!(S.friendDeclinedAt&&S.friendDeclinedAt[H]);

    /* 3. a DUPLICATE (different id, same burst: ts a little earlier AND a little
          later, both within the margin) must NOT re-prompt */
    window._khOnFriendRequest(req('m2',base-5000));
    window._khOnFriendRequest(req('m3',base+4000));
    out.dupSuppressed=!(S.friendRequests||[]).some(x=>x.hash===H);
    out.dupTombstoned=(S.friendReqTombs||[]).indexOf('m2')>=0 && (S.friendReqTombs||[]).indexOf('m3')>=0;

    /* 4. a genuinely LATER request (well past the 10-min margin) DOES come through */
    window._khOnFriendRequest(req('m4',base+20*60000));
    out.newRequestGetsThrough=(S.friendRequests||[]).some(x=>x.hash===H);
    out.stampCleared=!(S.friendDeclinedAt&&S.friendDeclinedAt[H]);

    /* 5. accepting a request clears any decline stamp for that person */
    S.friendRequests=[];S.friends=[];S.friendDeclinedAt={};
    window._khOnFriendRequest(req('m5',base+40*60000));
    window._khAcceptFriendRequest(H);
    out.acceptedFriend=(S.friends||[]).some(f=>f.hash===H);
    out.acceptClearsStamp=!(S.friendDeclinedAt&&S.friendDeclinedAt[H]);

    /* 6. the decline stamp unions newest-wins across devices in the merge */
    S.friends=[];S.friendRequests=[];S.friendDeclinedAt={G:100};
    await window.mergeCloudState({friendDeclinedAt:{G:500,K:900}},{skipSave:true});
    out.mergeUnions=(S.friendDeclinedAt&&S.friendDeclinedAt.G===500&&S.friendDeclinedAt.K===900);

    return out;
  });

  console.log(JSON.stringify(r,null,1));
  ok('a first friend request becomes pending', r.pendingAfter1);
  ok('declining removes it and records a decline stamp', r.goneAfterDecline&&r.declineStamped);
  ok('DUPLICATES of a declined request do NOT re-prompt (the bug)', r.dupSuppressed, 'dupSuppressed='+r.dupSuppressed);
  ok('...and each duplicate is durably tombstoned so replays are cheap', r.dupTombstoned);
  ok('a genuinely LATER request still comes through', r.newRequestGetsThrough);
  ok('...and clears the decline stamp', r.stampCleared);
  ok('accepting a request adds the friend', r.acceptedFriend);
  ok('...and clears any decline stamp', r.acceptClearsStamp);
  ok('friendDeclinedAt unions newest-wins in the merge', r.mergeUnions);
  ok('no page errors', errs.length===0, errs.slice(0,3).join(' | '));

  await p.close();await b.close();

  const src=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
  ok('decline records a content-level stamp', /_khNoteFriendDeclined\(hash/.test(src));
  ok('friendDeclinedAt is a synced default field', /friendDeclinedAt:\{\}/.test(src));
  ok('the message ts is parsed ISO-safe (not a raw + coercion that would NaN)', /_msgTs=_khTsMs\(env&&env\.ts\)/.test(src));

  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
