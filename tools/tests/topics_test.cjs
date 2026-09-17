/* Topics — a browsable forum, not a list of chat rooms.

   The user's complaint was fair: "it is just chat groups". A flat list of names
   with a Create box tells you nothing — you cannot tell a busy room from a dead
   one, find anything, or know what a topic is for before joining.

   What this pins:
     - categories and a description survive the round trip through the group
       name, and topics created BEFORE this still parse (they must not vanish)
     - the list shows real activity: message count, last-active, and a decrypted
       preview of the newest message
     - the activity query is bounded to one page of topics, because the server
       caps a room at 30 messages and only a bounded query can return an exact
       count rather than a truncated one presented as exact
     - search and category filtering actually filter
     - typing is debounced (a re-render per keystroke is a full e-ink repaint)

   Run: NODE_PATH=/opt/node22/lib/node_modules node tools/tests/topics_test.cjs */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url'),fs=require('fs');

let pass=0,fail=0;
const ok=(n,c,extra)=>{
  if(c){pass++;console.log('PASS '+n);}
  else{fail++;console.log('FAIL '+n+(extra!==undefined?('  -- '+String(extra).slice(0,240)):''));}
};

(async()=>{
  const src=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
  /* What matters is the INVARIANT, not the constant: each activity query must
     stay inside the row limit so the message counts shown are exact rather than
     a truncated window presented as exact. The page size was 12 because ONE
     query covered a page; it is now 24, with the fetch going out in ACT_CHUNK
     batches. Assert the arithmetic, so the page size can change again without
     this test having to be edited — and so it still fails if someone raises the
     chunk past what the row limit can hold. */
  const _chunk=(/var ACT_CHUNK=(\d+)/.exec(src)||[])[1];
  /* Anchor on the activity query's own select list — a bare limit= matches
     several other queries in the file, and the first one it found was not this. */
  const _lim=(/group_code,ts,text,display_name&order=ts\.desc&limit=(\d+)/.exec(src)||[])[1];
  ok('each activity query stays inside the row limit (chunk x 30-msg cap <= limit)',
     !!_chunk && !!_lim && (Number(_chunk)*30)<=Number(_lim),
     'chunk='+_chunk+' limit='+_lim);
  ok('the list pages independently of that bound',
     /var PAGE=24;/.test(src));
  ok('search is debounced, not a re-render per keystroke',
     /qIn\.oninput=\(typeof khDebounce==='function'\)/.test(src));

  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:600,height:800}});
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:20000});

  const r=await p.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const out={};
    const S=window._KH.S;
    S.authToken='e'.repeat(64);S.email='tester@kh';S.msgGroups=[];

    const NOWISO=new Date().toISOString();
    const OLD=new Date(Date.now()-9*86400000).toISOString();
    /* three topics: a new-style one with a category + description, a LEGACY one
       with neither, and a quiet one */
    const GROUPS=[
      {code:'100000000001',name:'TOPIC: [book] Book club :: What we are reading this month',creator:'alice',created_at:OLD},
      {code:'100000000002',name:'TOPIC: Old School Topic',creator:'bob',created_at:OLD},
      {code:'100000000003',name:'TOPIC: [game] Chess corner :: Play and analyse',creator:'carol',created_at:NOWISO}
    ];
    /* the busy room is the legacy one, so "Busiest" cannot be confused with
       "has a category" */
    const MSGS=[
      {group_code:'100000000001',ts:new Date(Date.now()-3600000).toISOString(),text:'hello from book club',display_name:'alice'},
      {group_code:'100000000002',ts:new Date(Date.now()-60000).toISOString(),text:'newest message here',display_name:'bob'},
      {group_code:'100000000002',ts:new Date(Date.now()-120000).toISOString(),text:'older one',display_name:'bob'},
      {group_code:'100000000002',ts:new Date(Date.now()-180000).toISOString(),text:'oldest one',display_name:'zed'}
    ];
    /* background pollers also read kh_messages, so keep ALL queries and look
       for the batch one rather than trusting whichever landed last */
    const msgQueries=[];
    window._sbActive=function(){return true;};
    window._sbSelect=async function(table,q){
      if(table==='kh_groups')return GROUPS.slice();
      if(table==='kh_messages'){msgQueries.push(q);return MSGS.slice();}
      return [];
    };
    /* messages are stored encrypted; these are plaintext, and _msgDecrypt
       returns non-prefixed input unchanged, so the preview path is exercised */
    showView('topics');
    await sleep(900);
    const v=document.getElementById('view-topics');
    if(!v)return{err:'no topics view'};
    const t=()=>v.innerText||'';

    out.legacyStillShows=t().indexOf('Old School Topic')>=0;
    out.newStyleTitle=t().indexOf('Book club')>=0;
    out.descriptionShown=t().indexOf('What we are reading this month')>=0;
    out.categoryShown=t().indexOf('Books & Reading')>=0&&t().indexOf('Games')>=0;
    out.legacyIsGeneral=t().indexOf('General')>=0;
    const batchQ=msgQueries.filter(x=>/group_code=in\./.test(x))[0]||'';
    out.msgQuery=batchQ||('none of: '+msgQueries.join(' | '));
    out.msgQueryBounded=/limit=400/.test(batchQ);
    out.countShown=/3 messages/.test(t());
    out.activeShown=/active \d+[mhd] ago/.test(t());
    out.previewShown=t().indexOf('newest message here')>=0;
    out.previewAuthor=t().indexOf('bob: newest message here')>=0;

    /* category filter. The create form has chips with the SAME labels, so the
       lookup has to be scoped or it clicks the wrong one. */
    const btns=(root)=>Array.prototype.slice.call((root||v).querySelectorAll('button'));
    const byText=(x,root)=>{const a=btns(root);for(let i=0;i<a.length;i++)if((a[i].textContent||'').trim()===x)return a[i];return null;};
    const filterRow=()=>document.getElementById('topicCatFilter');
    /* the create card is a .card too — only count cards inside the list */
    const cardTitles=()=>Array.prototype.slice.call(document.getElementById('topicList').querySelectorAll('.card')).map(c=>(c.innerText||'').split('\n')[0]);
    const games=byText('Games',filterRow());
    if(games){games.click();await sleep(250);}
    out.filterWorks=t().indexOf('Chess corner')>=0&&t().indexOf('Book club')<0;
    const all=byText('All',filterRow());
    if(all){all.click();await sleep(250);}
    out.filterClears=t().indexOf('Book club')>=0;

    /* search */
    const q=v.querySelector('input[placeholder="Search topics"]');
    if(q){q.value='chess';q.dispatchEvent(new Event('input',{bubbles:true}));await sleep(500);}
    out.searchWorks=t().indexOf('Chess corner')>=0&&t().indexOf('Book club')<0;
    if(q){q.value='';q.dispatchEvent(new Event('input',{bubbles:true}));await sleep(500);}

    /* sorting: Busiest must put the 3-message room first */
    const busy=byText('Busiest');
    if(busy){busy.click();await sleep(300);}
    const order=cardTitles();
    out.busiestFirst=order.length>0&&order[0].indexOf('Old School')>=0;
    out.order=order.slice(0,4);

    /* Newest must put the newly-created topic first */
    const nw=byText('Newest');
    if(nw){nw.click();await sleep(300);}
    const order2=cardTitles();
    out.newestFirst=order2.length>0&&order2[0].indexOf('Chess corner')>=0;
    out.order2=order2.slice(0,3);

    /* creating: the name must carry the category + description */
    let created=null;
    window._groupCreate=async function(name){created=name;return{code:'100000000009',name:name};};
    const start=byText('Start a topic')||v.querySelector('.card');
    if(start)start.click();
    await sleep(200);
    const ti=v.querySelector('input[placeholder="Name it — e.g. Book club"]');
    const di=v.querySelector('input[placeholder="One line: what is it for?"]');
    if(ti)ti.value='Help desk';
    if(di)di.value='Ask anything';
    const helpCat=byText('Help & Questions',document.getElementById('topicNewCat'));
    if(helpCat)helpCat.click();
    await sleep(100);
    const mk=byText('Create topic');
    if(mk)mk.click();
    await sleep(400);
    out.created=created;
    out.packsCategory=String(created||'').indexOf('TOPIC: [help] Help desk :: Ask anything')===0;
    return out;
  });

  if(r.err){ok('topics view builds',false,r.err);}
  else{
    ok('a topic created BEFORE this change still shows', r.legacyStillShows, JSON.stringify(r).slice(0,200));
    ok('...and falls into General rather than disappearing', r.legacyIsGeneral);
    ok('a topic shows its title and description', r.newStyleTitle&&r.descriptionShown, JSON.stringify(r).slice(0,200));
    ok('...and its category', r.categoryShown);
    ok('the activity query is one bounded batch over the visible page',
       r.msgQueryBounded, r.msgQuery);
    ok('the list shows how many messages a topic holds', r.countShown);
    ok('...and when it was last active', r.activeShown);
    ok('...and a preview of the newest message', r.previewShown, JSON.stringify(r).slice(0,200));
    ok('...attributed to whoever wrote it', r.previewAuthor);
    ok('filtering by category works', r.filterWorks);
    ok('...and clears again', r.filterClears);
    ok('search filters the list', r.searchWorks);
    ok('sorting by Busiest puts the busiest room first', r.busiestFirst, JSON.stringify(r.order));
    ok('sorting by Newest puts the newest topic first', r.newestFirst, JSON.stringify(r.order2));
    ok('creating a topic records its category and description',
       r.packsCategory, String(r.created));
  }

  /* ── upgrades: favourites, Mine filter, unread ── */
  const up2=await p.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const out={};
    /* the create step above jumps into Messages, so come back to Topics first */
    try{localStorage.removeItem('kh_topic_favs');}catch(_){}
    showView('topics');
    await sleep(900);
    const v=document.getElementById('view-topics');
    if(!v)return{err:'topics view did not rebuild'};
    const btns=(root)=>Array.prototype.slice.call((root||v).querySelectorAll('button'));
    const byText=(x,root)=>{const a=btns(root);for(let i=0;i<a.length;i++)if((a[i].textContent||'').trim()===x)return a[i];return null;};
    const list=()=>document.getElementById('topicList');
    const titles=()=>Array.prototype.slice.call(list().querySelectorAll('.card')).map(c=>(c.innerText||'').split('\n')[0]);

    out.hasMine=!!byText('Mine');
    out.hasSave=!!byText('☆ Save');

    /* save the last topic — it must jump to the top of the list */
    const cards=Array.prototype.slice.call(list().querySelectorAll('.card'));
    const lastTitle=(cards[cards.length-1].innerText||'').split('\n')[0];
    const saves=btns(list()).filter(b=>(b.textContent||'').trim()==='☆ Save');
    if(saves.length)saves[saves.length-1].click();
    await sleep(300);
    out.favFirst=titles()[0]===lastTitle;
    out.favLabel=!!byText('★ Saved');

    /* Mine shows only joined-or-saved topics */
    const mine=byText('Mine');
    if(mine){mine.click();await sleep(300);}
    out.mineCount=titles().length;
    out.mineOnlySaved=titles().length===1&&titles()[0]===lastTitle;
    if(mine){mine.click();await sleep(300);}
    out.mineClears=titles().length>1;
    return out;
  });
  if(up2.err){ok('Topics rebuilds for the upgrade checks',false,up2.err);}
  ok('Topics offers a Mine filter and a Save button', up2.hasMine&&up2.hasSave, JSON.stringify(up2));
  ok('saving a topic floats it to the top', up2.favFirst, JSON.stringify(up2));
  ok('...and the button says so', up2.favLabel);
  ok('Mine shows only topics you joined or saved', up2.mineOnlySaved, JSON.stringify(up2));
  ok('...and turning it off restores the full list', up2.mineClears, JSON.stringify(up2));

  const srcU=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
  ok('favourites are device-local, not in the synced state blob',
     /localStorage\.setItem\('kh_topic_favs'/.test(srcU)&&!/S\.topicFavs/.test(srcU));
  ok('"new since you looked" is stamped when you open a topic',
     /kh_topic_seen_'\+g\.code/.test(srcU)&&/new since you looked/.test(srcU));

  ok('no page errors', errs.length===0, errs.slice(0,3).join(' | '));
  await p.close();await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
