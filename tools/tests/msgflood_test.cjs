/* The spam flood: someone pasted ~100 000 YouTube links into the global room
 * and the room could not be opened afterwards — so the admin could not reach
 * the menu to ban them, which is the worst possible moment to lose the UI.
 *
 * The cause was not the length. _linkifyEl builds one <a> element WITH an
 * event listener per URL, so one message tried to create 100 000 nodes and
 * 100 000 listeners in a single bubble.
 *
 * The send limit only stops the NEXT one. What rescues a room already full of
 * it is the render clamp and the anchor ceiling, so those are tested against a
 * message that is already in the log. */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url'),fs=require('fs');
let pass=0,fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x!==undefined&&!c?'  -- '+String(x).slice(0,240):''));};

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await(await b.newContext({viewport:{width:600,height:800}})).newPage();
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve('index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:30000});

  console.log('── what may be sent ──');
  const lim=await p.evaluate(()=>{
    const link='https://www.youtube.com/watch?v=dQw4w9WgXcQ ';
    return {
      normal:  _khMsgTooLong('hello, this is a perfectly ordinary message'),
      long:    _khMsgTooLong('x'.repeat(KH_MSG_MAX_CHARS+1)),
      atLimit: _khMsgTooLong('x'.repeat(KH_MSG_MAX_CHARS)),
      /* 400 short links is comfortably UNDER the character cap and still 400
         anchors — length alone does not catch this. */
      manyLinks: _khMsgTooLong(link.repeat(40)),
      linkCount: (link.repeat(40).match(/https?:\/\//g)||[]).length,
      linkLen:   link.repeat(40).length,
      /* An encoded payload is legitimately long and is drawn as a card, never
         linkified, so the cap must not apply to it. */
      image:   _khMsgTooLong('KHIMG1:data:image/jpeg;base64,'+'A'.repeat(9000)),
      app:     _khMsgTooLong('KHAPP1:'+'B'.repeat(9000)),
      max:KH_MSG_MAX_CHARS,maxLinks:KH_MSG_MAX_LINKS
    };
  });
  ok('an ordinary message is fine',              lim.normal==='', lim.normal);
  ok('a message at the limit is fine',           lim.atLimit==='', lim.atLimit);
  ok('one character over is refused',            /2,000|2000/.test(lim.long)&&lim.long!=='', lim.long);
  ok('...and the refusal says the actual length',/\d[\d,]* characters/.test(lim.long), lim.long);
  /* This is the one a pure length check would miss. */
  ok('a link flood UNDER the character cap is still refused',
     lim.manyLinks!==''&&lim.linkLen<lim.max, 'len '+lim.linkLen+' links '+lim.linkCount+' verdict '+lim.manyLinks);
  ok('...and it says how many links',            /\d+ links/.test(lim.manyLinks), lim.manyLinks);
  ok('an image payload is not caught by the text cap', lim.image==='', lim.image);
  ok('nor is a shared app',                      lim.app==='', lim.app);

  console.log('\n── a message ALREADY in the log cannot freeze the room ──');
  /* Driven through the real chat, because the renderer is closure-scoped
     inside the Messages view — and because opening the room is exactly the
     thing that stopped working. */
  const clamp=await p.evaluate(async()=>{
    const now=Date.now();
    const spam=('https://www.youtube.com/watch?v=aaaaaaaaaaa ').repeat(3000);
    S.authToken='t';S.email='tester';S.user='tester';
    window._groupFetchMessages=async()=>[
      {id:'s1',userId:'spammer',displayName:'Spammer',text:spam,ts:new Date(now-60000).toISOString()},
      {id:'s2',userId:'spammer',displayName:'Spammer',text:spam,ts:new Date(now-30000).toISOString()},
      {id:'ok1',userId:'friend',displayName:'Friend',text:'help',ts:new Date(now-10000).toISOString()}
    ];
    window._groupMembers=async()=>[{}];
    S.msgGroups=[{code:'999999999999',name:'Flooded room',joinedAt:now-9e6}];
    showView('messages');
    await new Promise(r=>setTimeout(r,340));
    let target=null;
    document.getElementById('mainHost').querySelectorAll('*').forEach(e=>{
      if((e.textContent||'').indexOf('Flooded room')>=0)target=e;});
    const t0=Date.now();
    if(target)target.dispatchEvent(new MouseEvent('click',{bubbles:true}));
    await new Promise(r=>setTimeout(r,900));
    const ms=Date.now()-t0;
    const rows=document.querySelectorAll('.msg-row').length;
    const anchors=document.querySelectorAll('.msg-bubble a').length;
    const moreBtns=Array.prototype.filter.call(document.querySelectorAll('.msg-action-btn'),
      x=>/Show the rest/.test(x.textContent||'')).length;
    return {ms,rows,anchors,moreBtns,perMsgCap:KH_MSG_MAX_LINKS,
            sentLinks:(spam.match(/https?:\/\//g)||[]).length*2};
  });
  ok('the flooded room still opens',             clamp.rows===3, JSON.stringify(clamp));
  /* 6 000 links were sent across two messages. */
  ok('...having been sent 6,000 links',          clamp.sentLinks===6000, JSON.stringify(clamp));
  /* Three messages, two of them floods: the total anchors must stay bounded by
     the per-message ceiling, not by what was sent. */
  ok('...with anchors bounded across the whole log',
     clamp.anchors<=clamp.perMsgCap*3, clamp.anchors+' anchors');
  ok('...and the long ones are folded behind a tap', clamp.moreBtns===2, JSON.stringify(clamp));
  ok('...quickly enough to use',                 clamp.ms<3000, clamp.ms+'ms');

  const expand=await p.evaluate(async()=>{
    const btn=Array.prototype.filter.call(document.querySelectorAll('.msg-action-btn'),
      x=>/Show the rest/.test(x.textContent||''))[0];
    if(!btn)return {found:false};
    const t0=Date.now();
    btn.click();
    await new Promise(r=>setTimeout(r,200));
    return {found:true,ms:Date.now()-t0,
            anchors:document.querySelectorAll('.msg-bubble a').length,
            cap:KH_MSG_MAX_LINKS*3};
  });
  /* Deliberately opening it must not reproduce the freeze either. */
  ok('opening the rest is still bounded',        expand.found&&expand.anchors<=expand.cap,
     JSON.stringify(expand));

  console.log('\n── the admin delete ──');
  const del=await p.evaluate(async()=>{
    const out={};
    /* refuses without a filter, so a caller cannot ask for "everything" */
    window._isAdminCached=true;
    out.noFilter=await window._khAdminDeleteMessages({});
    /* refuses for a non-admin */
    window._isAdminCached=false;
    out.notAdmin=await window._khAdminDeleteMessages({id:'x'});
    /* sends a filtered DELETE with the admin header when it should */
    window._isAdminCached=true;
    window._adminToken='secret';
    let seen=null;
    const real=window.fetch;
    window.fetch=async(u,o)=>{seen={u:String(u),m:o&&o.method,h:(o&&o.headers)||{}};return new Response(null,{status:204});};
    out.ok=await window._khAdminDeleteMessages({user_id:'spammer',group_code:'999999999999'});
    window.fetch=real;
    out.url=seen&&seen.u;out.method=seen&&seen.m;
    out.hadAdminHeader=!!(seen&&(seen.h['X-KH-Admin']||seen.h['x-kh-admin']));
    return out;
  });
  ok('an unfiltered delete is refused',          del.noFilter===false, JSON.stringify(del));
  ok('a non-admin is refused',                   del.notAdmin===false, JSON.stringify(del));
  ok('a filtered admin delete goes out',         del.ok===true&&del.method==='DELETE', JSON.stringify(del));
  ok('...against kh_messages, filtered',         /kh_messages\?/.test(del.url||'')&&/user_id=eq\.spammer/.test(del.url||''), del.url);
  ok('...carrying the admin token',              del.hadAdminHeader, JSON.stringify(del));

  console.log('\n── the worker half ──');
  const w=fs.readFileSync(path.resolve('api-worker.js'),'utf8');
  ok('an admin may now delete chat rows',        /ADMIN_DELETE_OK[^;]*'kh_messages'/.test(w));
  /* Still bounded: handleDelete refuses an unfiltered delete on every table
     except the two where clearing everything is the point. */
  ok('...but never without a filter',
     /if\(adminOk && !where && table!=='kh_errors' && table!=='kh_presence'\)/.test(w));

  ok('no page errors', errs.length===0, errs.slice(0,3).join(' | '));
  await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
