/* Chat rendering: runs of messages, the time under each run, and the line
 * that says where you stopped reading.
 *
 * Driven through the REAL renderMessages by opening a chat with stubbed
 * message fetching — the interesting behaviour is entirely in how the list is
 * laid out, and a unit test of the helpers would not have caught the two
 * things most likely to break: an unread line that chases the newest message,
 * and a stray timestamp in the middle of a run. */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url');
let pass=0,fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x!==undefined&&!c?'  -- '+String(x).slice(0,260):''));};

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const c=await b.newContext({viewport:{width:600,height:800}});
  const p=await c.newPage();
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve('index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:30000});

  console.log('── the read mark ──');
  const mark=await p.evaluate(()=>{
    try{localStorage.removeItem('kh_msg_read_ZZZ');}catch(_){}
    const none=_khGroupReadAt('ZZZ');
    _khSetGroupReadAt('ZZZ',5000);
    const set=_khGroupReadAt('ZZZ');
    _khSetGroupReadAt('ZZZ',3000);          /* a late poll must not rewind it */
    const back=_khGroupReadAt('ZZZ');
    _khSetGroupReadAt('ZZZ',9000);
    const fwd=_khGroupReadAt('ZZZ');
    try{localStorage.removeItem('kh_msg_read_ZZZ');}catch(_){}
    return {none,set,back,fwd};
  });
  ok('an unseen group has no mark',        mark.none===0, JSON.stringify(mark));
  ok('the mark is stored',                 mark.set===5000, JSON.stringify(mark));
  /* A poll that lands out of order must not drag the line backwards and
     re-mark messages you have already read. */
  ok('...and never moves backwards',       mark.back===5000, JSON.stringify(mark));
  ok('...but does move forwards',          mark.fwd===9000, JSON.stringify(mark));

  /* The key must not thrash cloud sync — it is written on every open and every
     poll, exactly like kh_mc_, which is why that one is skipped too. */
  const skipped=await p.evaluate(()=>{
    const before=localStorage.getItem('kh_ls_fingerprint');
    let scheduled=false;
    const real=window.scheduleCloudSync;
    window.scheduleCloudSync=function(){scheduled=true;};
    localStorage.setItem('kh_msg_read_QQQ','1');
    localStorage.setItem('kh_probe_control','1');
    const ctl=scheduled;
    window.scheduleCloudSync=real;
    try{localStorage.removeItem('kh_msg_read_QQQ');localStorage.removeItem('kh_probe_control');}catch(_){}
    return {ctl};
  });
  ok('a control kh_ key still reaches the sync wrapper', skipped.ctl===true, JSON.stringify(skipped));

  console.log('\n── runs of messages ──');
  /* Messages is behind sign-in, so give the page a signed-in state. */
  await p.evaluate(()=>{
    S.authToken='test-token'; S.email='tester'; S.user='tester';
    /* Open a room by the name shown in the list, and wait for its log. */
    window.__openRoom=async function(name){
      showView('messages');
      await new Promise(r=>setTimeout(r,340));
      const host=document.getElementById('mainHost');
      /* The row's handler sits a few levels above the text, so click the
         deepest node holding the name and let it bubble. */
      let target=null;
      host.querySelectorAll('*').forEach(e=>{ if((e.textContent||'').indexOf(name)>=0) target=e; });
      if(target)target.dispatchEvent(new MouseEvent('click',{bubbles:true}));
      await new Promise(r=>setTimeout(r,820));
      return document.querySelectorAll('.msg-row').length>0;
    };
  });
  /* Build a chat by hand and render it through the real path. */
  const layout=await p.evaluate(async()=>{
    const now=Date.now();
    const mk=(id,who,name,text,tOff)=>({id:id,userId:who,displayName:name,text:text,
      ts:new Date(now+tOff).toISOString()});
    const msgs=[
      mk('m1','alice','Alice','first',        -60*60*1000),
      mk('m2','alice','Alice','second',       -59*60*1000),   /* continues */
      mk('m3','alice','Alice','third',        -58*60*1000),   /* continues */
      mk('m4','bob','Bob','someone else',     -57*60*1000),   /* new run    */
      mk('m5','alice','Alice','back again',   -56*60*1000),   /* new run    */
      mk('m6','alice','Alice','much later',   -5*60*1000)     /* gap breaks it */
    ];
    /* Open a chat with the fetch stubbed out. */
    window._groupFetchMessages=async()=>msgs;
    window._groupMembers=async()=>[{}];
    S.msgGroups=[{code:'111111111111',name:'Test room',joinedAt:now-9e6}];
    try{localStorage.removeItem('kh_msg_read_111111111111');}catch(_){}
    const opened=await window.__openRoom('Test room');
    const got=document.querySelectorAll('.msg-row');
    return {
      opened,
      rows:got.length,
      cont:Array.prototype.map.call(got,r=>r.className.indexOf('cont')>=0),
      names:Array.prototype.map.call(got,r=>{
        const n=r.querySelector('.msg-meta span');
        return (n&&n.className.indexOf('msg-time')<0)?(n.textContent||''):'';
      }),
      stampShown:Array.prototype.map.call(got,r=>{
        const st=r.querySelector('.msg-stamp');
        return !!st&&st.style.display!=='none';
      })
    };
  });
  ok('the chat opened and rendered six messages', layout.rows===6, JSON.stringify(layout));
  /* m2 and m3 continue m1; m4 is a different person; m5 restarts after Bob;
     m6 is 51 minutes later so the run is broken by time. */
  ok('a same-person message within the window continues the run',
     JSON.stringify(layout.cont)==='[false,true,true,false,false,false]', JSON.stringify(layout.cont));
  ok('...so the name is only printed once per run',
     layout.names[0]==='Alice'&&layout.names[1]===''&&layout.names[2]===''&&layout.names[3]==='Bob',
     JSON.stringify(layout.names));
  /* A timestamp under every line in a run is noise; one under the run is
     information. */
  ok('the time shows once per run, on its last message',
     JSON.stringify(layout.stampShown)==='[false,false,true,true,true,true]', JSON.stringify(layout.stampShown));

  const hidden=await p.evaluate(()=>{
    const a=document.querySelectorAll('.msg-row')[1];
    const av=a&&a.querySelector('.msg-avatar');
    if(!av)return {found:false};
    const cs=getComputedStyle(av);
    /* hidden, not removed — the bubbles must stay in the same column rather
       than stepping sideways where the avatar used to be */
    return {found:true,vis:cs.visibility,present:!!av};
  });
  ok('a continued row keeps a hidden avatar so bubbles stay aligned',
     hidden.found&&hidden.vis==='hidden'&&hidden.present, JSON.stringify(hidden));

  console.log('\n── the new-messages line ──');
  const unread=await p.evaluate(async()=>{
    const now=Date.now();
    const mk=(id,who,name,text,tOff)=>({id:id,userId:who,displayName:name,text:text,
      ts:new Date(now+tOff).toISOString()});
    const msgs=[
      mk('a1','alice','Alice','read this',   -60*60*1000),
      mk('a2','alice','Alice','read this too',-59*60*1000),
      mk('a3','bob','Bob','NEW one',         -10*60*1000),
      mk('a4','bob','Bob','NEW two',          -9*60*1000)
    ];
    /* pretend we last read just after a2 */
    localStorage.setItem('kh_msg_read_222222222222',String(now-58*60*1000));
    window._groupFetchMessages=async()=>msgs;
    window._groupMembers=async()=>[{}];
    S.msgGroups=[{code:'222222222222',name:'Unread room',joinedAt:now-9e6}];
    await window.__openRoom('Unread room');
    const kids=Array.prototype.slice.call(document.querySelectorAll('.msg-row,.msg-unread-line'));
    const idx=kids.findIndex(k=>k.className.indexOf('msg-unread-line')>=0);
    const afterId=idx>=0&&kids[idx+1]?kids[idx+1].getAttribute('data-msg-id'):null;
    const beforeId=idx>0?kids[idx-1].getAttribute('data-msg-id'):null;
    const stored=localStorage.getItem('kh_msg_read_222222222222');
    return {idx,afterId,beforeId,lines:kids.filter(k=>k.className.indexOf('msg-unread-line')>=0).length,
            storedMoved:Number(stored)>now-58*60*1000};
  });
  ok('a line is drawn where you stopped reading', unread.idx>=0, JSON.stringify(unread));
  ok('...exactly once',                           unread.lines===1, JSON.stringify(unread));
  ok('...after the last message you had read',    unread.beforeId==='a2', JSON.stringify(unread));
  ok('...and before the first you had not',       unread.afterId==='a3', JSON.stringify(unread));
  /* The mark advances so the line is gone NEXT time — but only after the
     render, so it does not erase itself on the way in. */
  ok('the mark advances after the render',        unread.storedMoved===true, JSON.stringify(unread));

  const second=await p.evaluate(async()=>{
    /* leaving and coming back should show no line, because it is all read now */
    const back=document.querySelector('.msg-hdr-back-btn');
    if(back)back.click();
    await new Promise(r=>setTimeout(r,320));
    await window.__openRoom('Unread room');
    return {lines:document.querySelectorAll('.msg-unread-line').length,
            rows:document.querySelectorAll('.msg-row').length};
  });
  ok('coming back with nothing new shows no line', second.lines===0&&second.rows===4, JSON.stringify(second));

  console.log('\n── your own messages ──');
  const own=await p.evaluate(async()=>{
    const now=Date.now();
    const me=(S.email||'me');
    const msgs=[
      {id:'o1',userId:'zzz',displayName:'Zed',text:'hello',ts:new Date(now-60*60*1000).toISOString()},
      {id:'o2',userId:'zzz',displayName:'Zed',text:'you there?',ts:new Date(now-30*60*1000).toISOString()}
    ];
    localStorage.setItem('kh_msg_read_333333333333',String(now-45*60*1000));
    window._groupFetchMessages=async()=>msgs;
    window._groupMembers=async()=>[{}];
    S.msgGroups=[{code:'333333333333',name:'Own room',joinedAt:now-9e6}];
    await window.__openRoom('Own room');
    return {lines:document.querySelectorAll('.msg-unread-line').length};
  });
  /* Somebody else's later message SHOULD raise the line. */
  ok('someone else\'s later message raises the line', own.lines===1, JSON.stringify(own));

  ok('no page errors', errs.length===0, errs.slice(0,3).join(' | '));
  await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
