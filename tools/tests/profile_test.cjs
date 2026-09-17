/* Profile pages — tap someone's picture and see who they are.
   (glitchyquinn, 2 votes: hobbies, friends list, pronouns, username.)

   The design question this pins: everything about an account normally lives in
   S, which is end-to-end encrypted, so NOBODY else can read it. A profile is
   the one thing that only means something if other people CAN see it. So the
   few profile fields ride the kh_presence row instead — the row that is already
   written on every heartbeat and already carries the display name and avatar.

   What must stay true:
     - only what the user typed into the profile card ever leaves the encrypted
       blob; nothing is derived from their private data
     - the friends list is opt-out and honours the switch
     - the published blob is bounded, because presence is written by every
       client every ~100s and the Worker refuses an oversized row
     - your OWN profile renders with no network call, so it works offline
     - other people's text is censored on the way in, same rule as chat

   Run: NODE_PATH=/opt/node22/lib/node_modules node tools/tests/profile_test.cjs */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url'),fs=require('fs');

let pass=0,fail=0;
const ok=(n,c,extra)=>{
  if(c){pass++;console.log('PASS '+n);}
  else{fail++;console.log('FAIL '+n+(extra!==undefined?('  -- '+String(extra).slice(0,240)):''));}
};

(async()=>{
  /* ── worker side ── */
  const w=fs.readFileSync(path.resolve(__dirname,'../../api-worker.js'),'utf8');
  ok('the Worker knows the kh_presence.profile column',
     /kh_presence:\[[^\]]*'profile'/.test(w));
  ok('...and an existing database self-heals it via a migration',
     /ALTER TABLE kh_presence ADD COLUMN profile/.test(w));
  ok('...and a fresh database creates it',
     /CREATE TABLE IF NOT EXISTS kh_presence[^"]*profile TEXT/.test(w));
  ok('the Worker bounds the published profile (presence is written by everyone)',
     /row\.profile[^\n]*length > 1200/.test(w));

  /* ── client ── */
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:600,height:800}});
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:20000});

  /* what actually gets published */
  const blob=await p.evaluate(()=>{
    const S=window._KH.S,out={};
    S.profilePronouns='they/them';
    S.profileHobbies='Reading, chess';
    S.profileBio='Hello there.';
    S.profileStatus='On page 300';
    S.friends=[{name:'alice',hash:'aaaa'},{name:'bob',hash:'bbbb'}];
    S.profileShowFriends=true;
    S.notes=[{id:'n1',title:'PRIVATE NOTE',body:'my secret'}];
    S.email='someone@kindlehub';
    S.authToken='f'.repeat(64);

    const withFriends=window._khMyProfileBlob();
    out.withFriends=withFriends;
    let parsed={};try{parsed=JSON.parse(withFriends);}catch(_){}
    out.parsed=parsed;
    /* nothing private may appear in the published blob */
    out.leaksNotes=withFriends.indexOf('PRIVATE NOTE')>=0||withFriends.indexOf('my secret')>=0;
    out.leaksToken=withFriends.indexOf(S.authToken)>=0;

    S.profileShowFriends=false;
    let noF={};try{noF=JSON.parse(window._khMyProfileBlob());}catch(_){}
    out.friendsOffRespected=!noF.f;
    S.profileShowFriends=true;

    /* an empty profile publishes nothing at all */
    const keep={p:S.profilePronouns,h:S.profileHobbies,b:S.profileBio,s:S.profileStatus,f:S.friends};
    S.profilePronouns='';S.profileHobbies='';S.profileBio='';S.profileStatus='';S.friends=[];
    /* the derived stat line is opt-in, so an untouched profile publishes nothing
       even though the account clearly HAS books/notes/games */
    S.books=[{id:'b1'}];S.notes=[{id:'n1'}];S.games={snake:{best:3}};
    S.profileShowStats=false;
    out.emptyPublishesNothing=window._khMyProfileBlob()==='';
    S.profileShowStats=true;
    out.optInStillNeedsTheSwitch=window._khMyProfileBlob().indexOf('"g"')>=0;
    S.profileShowStats=false;
    S.profilePronouns=keep.p;S.profileHobbies=keep.h;S.profileBio=keep.b;S.profileStatus=keep.s;S.friends=keep.f;

    /* a huge profile must still fit the Worker's limit */
    S.profileBio='x'.repeat(5000);
    S.profileHobbies='y'.repeat(5000);
    S.friends=[];for(let i=0;i<200;i++)S.friends.push({name:'friend-with-a-long-name-'+i});
    const big=window._khMyProfileBlob();
    out.bigLen=big.length;
    out.bigFits=big.length<=1200;
    S.profileBio=keep.b;S.profileHobbies=keep.h;S.friends=keep.f;
    return out;
  });
  ok('the published card carries pronouns, hobbies, bio and status',
     blob.parsed.p==='they/them'&&blob.parsed.h==='Reading, chess'&&blob.parsed.b==='Hello there.'&&blob.parsed.s==='On page 300',
     JSON.stringify(blob.parsed));
  ok('...and the friends list when it is switched on',
     Array.isArray(blob.parsed.f)&&blob.parsed.f.length===2, JSON.stringify(blob.parsed.f));
  ok('NOTHING private leaks into the published card',
     !blob.leaksNotes&&!blob.leaksToken, JSON.stringify({notes:blob.leaksNotes,token:blob.leaksToken}));
  ok('switching the friends list off really stops publishing it', blob.friendsOffRespected);
  ok('an empty profile publishes nothing at all (no empty row churn)', blob.emptyPublishesNothing);
  ok('...even though the account has books, notes and games — the stat line is opt-IN',
     blob.emptyPublishesNothing&&blob.optInStillNeedsTheSwitch, JSON.stringify({empty:blob.emptyPublishesNothing,onWhenAsked:blob.optInStillNeedsTheSwitch}));
  ok('an over-long profile is trimmed to fit the Worker limit, not refused',
     blob.bigFits&&blob.bigLen>0, 'len='+blob.bigLen);

  /* the presence heartbeat actually sends it */
  const src=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
  ok('the presence heartbeat publishes the profile',
     /_sbUpsert\('kh_presence',\{[^}]*profile:_khMyProfileBlob\(\)/.test(src));

  /* MY profile renders with no network */
  const own=await p.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const S=window._KH.S;
    S.profileName='Testy';
    S.profilePronouns='they/them';
    S.profileHobbies='Reading, chess';
    S.profileBio='Hello there.';
    S.profileShowFriends=true;
    S.friends=[{name:'alice'},{name:'bob'}];
    /* make every network read fail, to prove the own-profile path needs none */
    const realFetch=window.fetch;
    window.fetch=()=>Promise.reject(new Error('network is off for this test'));
    window._khOpenProfile(window._khMyName(),S.profileName);
    await sleep(400);
    const t=document.body.innerText||'';
    const out={
      name:t.indexOf('Testy')>=0,
      pronouns:t.indexOf('they/them')>=0,
      hobbies:t.indexOf('Reading, chess')>=0,
      bio:t.indexOf('Hello there.')>=0,
      friends:t.indexOf('alice')>=0&&t.indexOf('bob')>=0,
      /* the heading is CSS-uppercased, and innerText reflects text-transform */
      friendCount:t.toLowerCase().indexOf('friends (2)')>=0,
      editButton:t.indexOf('Edit my profile')>=0,
      noAddFriend:t.indexOf('Add friend')<0
    };
    window.fetch=realFetch;
    /* close it */
    const btns=Array.prototype.slice.call(document.querySelectorAll('button'));
    for(const x of btns)if((x.textContent||'').trim()==='Back'){x.click();break;}
    await sleep(120);
    return out;
  });
  ok('my own profile renders with NO network call (works offline)',
     own.name&&own.pronouns&&own.hobbies&&own.bio, JSON.stringify(own));
  ok('...shows my friends list', own.friends&&own.friendCount, JSON.stringify(own));
  ok('...offers Edit, and does not offer to friend myself',
     own.editButton&&own.noAddFriend, JSON.stringify(own));

  /* someone else's profile: fetched, and their text is censored */
  const other=await p.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    /* stub the backend read that _khFetchProfile makes */
    window._sbSelect=async function(table,q){
      if(table!=='kh_presence')return [];
      return [{user_id:'abc123def4567890',display_name:'quinn@x',avatar:'',
        profile:JSON.stringify({p:'she/her',h:'Drawing and shit',b:'Hi, I make flipbooks.',f:['zoe','max']}),
        last_seen:new Date().toISOString()}];
    };
    window._sbActive=function(){return true;};
    delete window._khProfileCacheReset;
    window._khOpenProfile('abc123def4567890','quinn');
    await sleep(500);
    const t=document.body.innerText||'';
    return {
      name:t.indexOf('quinn')>=0,
      pronouns:t.indexOf('she/her')>=0,
      bio:t.indexOf('I make flipbooks')>=0,
      friends:t.indexOf('zoe')>=0&&t.indexOf('max')>=0,
      censored:t.indexOf('Drawing and shit')<0&&t.indexOf('Drawing and')>=0,
      canAdd:t.indexOf('Add friend')>=0,
      canReport:t.indexOf('Report')>=0
    };
  });
  ok('another person\'s profile loads from the presence row',
     other.name&&other.pronouns&&other.bio, JSON.stringify(other));
  ok('...including their friends list', other.friends, JSON.stringify(other));
  ok('...with their free text censored, same rule as chat', other.censored, JSON.stringify(other));
  ok('...and offers Add friend + Report', other.canAdd&&other.canReport, JSON.stringify(other));

  /* every avatar in the app is the way in */
  const tappable=await p.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    /* count profile overlays rather than matching text — a leftover overlay
       from an earlier step would otherwise look like a fresh one */
    const overlays=()=>document.querySelectorAll('div[style*="100010"]').length;
    let guard=0;
    while(overlays()>0&&guard++<6){
      const bs=Array.prototype.slice.call(document.querySelectorAll('button'));
      let hit=false;
      for(const x of bs)if((x.textContent||'').trim()==='Back'){x.click();hit=true;break;}
      if(!hit)break;
      await sleep(120);
    }
    const before=overlays();
    const a=window._avatarEl('somebody',32,'somebody');
    const out={hasHandler:typeof a.onclick==='function',pointer:a.style.cursor==='pointer',before:before};

    /* a decorative avatar must NOT open anything */
    a._khNoProfile=true;
    document.body.appendChild(a);
    a.click();
    await sleep(250);
    out.afterOptOut=overlays();
    out.optOutWorks=(out.afterOptOut===before);

    /* ...but a normal one must */
    a._khNoProfile=false;
    a.click();
    await sleep(350);
    out.afterTap=overlays();
    out.tapOpens=(out.afterTap>before);
    a.remove();
    return out;
  });
  ok('avatars are tappable', tappable.hasHandler&&tappable.pointer, JSON.stringify(tappable));
  ok('...and tapping one really opens a profile', tappable.tapOpens, JSON.stringify(tappable));
  ok('...while a decorative avatar opts out and opens nothing', tappable.optOutWorks, JSON.stringify(tappable));


  /* ── upgrades: role badge + opt-in stat line ── */
  const up=await p.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const S=window._KH.S;
    const out={};
    S.profilePronouns='they/them';S.profileHobbies='';S.profileBio='';S.profileStatus='';
    S.friends=[];S.profileShowFriends=false;
    S.books=[{id:'b1'},{id:'b2'}];
    S.notes=[{id:'n1'}];
    S.games={snake:{best:3},maze:{best:1}};
    S.profileShowStats=true;   /* explicitly opted in */
    let blob={};try{blob=JSON.parse(window._khMyProfileBlob()||'{}');}catch(_){}
    out.statLine=blob.g||'';
    out.hasStats=!!blob.g;
    /* the stat line must be COUNTS, never a list of what you did */
    out.countsOnly=/^[0-9]/.test(String(blob.g||''))&&String(blob.g||'').indexOf('snake')<0;
    S.profileShowStats=false;
    let blob2={};try{blob2=JSON.parse(window._khMyProfileBlob()||'{}');}catch(_){}
    out.statsOptOut=!blob2.g;
    return out;
  });
  ok('a short stat line is published', up.hasStats, JSON.stringify(up));
  ok('...as counts only, never a list of what you did', up.countsOnly, up.statLine);
  ok('...and is off unless you switch it on', up.statsOptOut, JSON.stringify(up));

  const badge=await p.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    window._sbActive=function(){return true;};
    window._sbSelect=async function(table){
      if(table!=='kh_presence')return [];
      return [{user_id:'bbbb1111cccc2222',display_name:'mod@x',avatar:'',
        profile:JSON.stringify({p:'he/him',r:'mod',g:'4 games played'}),last_seen:new Date().toISOString()}];
    };
    window._khOpenProfile('bbbb1111cccc2222','modperson');
    await sleep(450);
    const t=document.body.innerText||'';
    const out={badge:/Moderator/i.test(t),stats:t.indexOf('4 games played')>=0};
    const bs=Array.prototype.slice.call(document.querySelectorAll('button'));
    for(const x of bs)if((x.textContent||'').trim()==='Back'){x.click();break;}
    await sleep(150);
    return out;
  });
  ok('a role badge shows on the profile', badge.badge, JSON.stringify(badge));
  ok('...alongside their stat line', badge.stats, JSON.stringify(badge));

  ok('no page errors', errs.length===0, errs.slice(0,3).join(' | '));
  await p.close();await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
