/* Connections: the calendar subscription, ntfy, and outgoing webhooks.
 *
 * None of these services is reachable from the build sandbox, so every network
 * call here is answered by a MOCK that speaks the real protocol. That tests
 * the half I can be responsible for — what is sent, how the reply is read, and
 * what is said when it fails — and it is honest about what it does not cover:
 * whether the live service behaves as documented. Which is exactly why every
 * connector has a Test button that reports the status code in words. */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url'),fs=require('fs');
let pass=0,fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x!==undefined&&!c?'  -- '+String(x).slice(0,300):''));};

const ICS=[
'BEGIN:VCALENDAR','VERSION:2.0',
'BEGIN:VEVENT','UID:one@example.com','SUMMARY:Dentist',
'DTSTART;TZID=Europe/London:20260715T090000','DTEND;TZID=Europe/London:20260715T093000',
'LOCATION:High Street','END:VEVENT',
'BEGIN:VEVENT','UID:two@example.com','SUMMARY:All day thing',
'DTSTART;VALUE=DATE:20260716','DTEND;VALUE=DATE:20260717','END:VEVENT',
'BEGIN:VEVENT','UID:three@example.com','SUMMARY:In UTC',
'DTSTART:20260715T120000Z','END:VEVENT',
'END:VCALENDAR'].join('\r\n');

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await(await b.newContext({viewport:{width:600,height:800}})).newPage();
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve('index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:30000});

  console.log('── the shared iCal parser ──');
  /* Hoisted out of the Calendar view so the subscription and the one-off
     import cannot drift. The timezone handling below was wrong once already
     (every event an hour out in BST) and is not worth getting right twice. */
  const ics=await p.evaluate(t=>{
    const rows=_khParseIcsEvents(t);
    return {n:rows.length,
            titles:rows.map(r=>r.title),
            first:rows[0],
            allDay:rows[1]&&rows[1].allDay,
            /* DTEND on an all-day event is EXCLUSIVE — "16th to 17th" is one
               day, not two, and getting that wrong shows a phantom extra day */
            endDay:rows[1]&&rows[1].endDay,
            utcRow:rows[2]};
  },ICS);
  ok('three events are parsed',            ics.n===3, JSON.stringify(ics.titles));
  ok('the title and location survive',     ics.first&&ics.first.title==='Dentist'&&/High Street/.test(ics.first.note||''), JSON.stringify(ics.first));
  ok('a zoned time is kept as a time',     ics.first&&/^\d\d:\d\d$/.test(ics.first.time||''), JSON.stringify(ics.first&&ics.first.time));
  ok('an all-day event is marked all-day', ics.allDay===true, JSON.stringify(ics));
  ok('...and its exclusive DTEND is pulled back a day', ics.endDay===16, JSON.stringify(ics));
  ok('a UTC event converts to local',      ics.utcRow&&/^\d\d:\d\d$/.test(ics.utcRow.time||''), JSON.stringify(ics.utcRow));

  console.log('\n── the calendar subscription ──');
  const sub=await p.evaluate(async(t)=>{
    const out={};
    S.calEvents=[{id:'mine',title:'Typed by hand',year:2026,month:6,day:1}];
    localStorage.removeItem('kh_connections');
    _khConnSet('calsub',{url:'https://example.com/basic.ics'});
    const real=window.fetch;
    let hits=0;
    window.fetch=async u=>{hits++;return new Response(t,{status:200});};
    const r1=await _khCalSubRefresh(true);
    out.first={ok:r1.ok,count:r1.count,total:S.calEvents.length};
    /* Refreshing must REPLACE what it brought, not add it again. */
    const r2=await _khCalSubRefresh(true);
    out.second={ok:r2.ok,total:S.calEvents.length};
    out.mineSurvived=S.calEvents.some(e=>e.id==='mine');
    out.tagged=S.calEvents.filter(e=>e.src==='calsub').length;
    window.fetch=real;
    /* Unsubscribing takes its own events and nothing else. */
    _khCalSubRemove(true);
    out.afterRemove={total:S.calEvents.length,mine:S.calEvents.some(e=>e.id==='mine')};
    out.hits=hits;
    return out;
  },ICS);
  ok('a subscription pulls the events in',   sub.first.ok&&sub.first.count===3, JSON.stringify(sub.first));
  /* The bug this design exists to prevent: import twice, get six events. */
  ok('refreshing REPLACES rather than duplicating', sub.second.total===sub.first.total, JSON.stringify(sub));
  ok('...and never touches what you typed',  sub.mineSurvived===true, JSON.stringify(sub));
  ok('subscription events are tagged',       sub.tagged===3, JSON.stringify(sub));
  ok('unsubscribing removes only its own',   sub.afterRemove.total===1&&sub.afterRemove.mine===true, JSON.stringify(sub.afterRemove));

  const subFail=await p.evaluate(async()=>{
    const out={};
    _khConnSet('calsub',{url:'https://example.com/basic.ics'});
    const real=window.fetch;
    window.fetch=async()=>new Response('<html>not a calendar</html>',{status:200});
    const r=await _khCalSubRefresh(true);
    out.notIcal={ok:r.ok,reason:r.reason,tried:(r.tried||[]).join(' | ')};
    window.fetch=async()=>{throw new Error('offline');};
    const r2=await _khCalSubRefresh(true);
    out.offline={ok:r2.ok,reason:r2.reason};
    window.fetch=real;
    localStorage.removeItem('kh_connections');
    return out;
  });
  ok('a page that is not a calendar is refused', subFail.notIcal.ok===false, JSON.stringify(subFail.notIcal));
  /* "It did not work" is useless; "each of these four was tried and this is
     what each said" is a diagnosis. */
  ok('...and it lists what was tried',       /direct/.test(subFail.notIcal.tried)&&/allorigins/.test(subFail.notIcal.tried), subFail.notIcal.tried);
  ok('being offline is reported, not silent', subFail.offline.ok===false&&!!subFail.offline.reason, JSON.stringify(subFail.offline));

  console.log('\n── ntfy ──');
  const topic=await p.evaluate(()=>({
    empty:_khNtfyTopicOk(''),
    bad:_khNtfyTopicOk('has spaces'),
    /* The topic name IS the credential — anyone who knows it can read and
       send — so a short one is refused rather than quietly accepted. */
    short:_khNtfyTopicOk('kindle'),
    good:_khNtfyTopicOk('my-kindle-9f2a7c1b')
  }));
  ok('an empty topic is refused',            topic.empty!=='', topic.empty);
  ok('spaces are refused',                   topic.bad!=='', topic.bad);
  ok('a guessable topic is refused as a privacy risk', /private|guess/i.test(topic.short), topic.short);
  ok('a long one is accepted',               topic.good==='', topic.good);

  const ntfy=await p.evaluate(async()=>{
    const out={};
    _khConnSet('ntfy',{topic:'my-kindle-9f2a7c1b'});
    const real=window.fetch;
    let seen=null;
    window.fetch=async(u,o)=>{seen={u:String(u),m:(o&&o.method)||'GET',body:o&&o.body,h:(o&&o.headers)||{}};
      return new Response('',{status:200});};
    const s=await _khNtfySend('hello there','A title');
    out.sent=s.ok;out.url=seen.u;out.method=seen.m;out.body=seen.body;out.title=seen.h.Title;

    /* ntfy answers with one JSON object PER LINE, not a JSON array — reading
       it with JSON.parse on the whole body returns nothing at all. */
    const lines=[
      JSON.stringify({id:'a',time:1000,event:'open'}),
      JSON.stringify({id:'b',time:1100,event:'message',title:'One',message:'first'}),
      JSON.stringify({id:'c',time:1200,event:'message',message:'second'}),
      ''].join('\n');
    window.fetch=async()=>new Response(lines,{status:200});
    const poll=await _khNtfyPoll(0);
    out.polled=poll.ok;out.msgs=(poll.messages||[]).map(m=>m.message);

    /* Pushed into the Notification Center once, and only once. */
    let pushed=0;
    const realPush=window._khPushNotif;
    window._khPushNotif=function(){pushed++;};
    _khConnSet('ntfy',{topic:'my-kindle-9f2a7c1b',lastSeen:0});
    await _khNtfyFetchNew();
    const firstPush=pushed;
    await _khNtfyFetchNew();
    out.pushedFirst=firstPush;out.pushedTwice=pushed;
    window._khPushNotif=realPush;

    window.fetch=async()=>new Response('nope',{status:500});
    const bad=await _khNtfySend('x');
    out.errReason=bad.reason;out.errOk=bad.ok;
    window.fetch=real;
    localStorage.removeItem('kh_connections');
    return out;
  });
  ok('a send POSTs to the topic',            ntfy.sent&&ntfy.method==='POST'&&/ntfy\.sh\/my-kindle-9f2a7c1b$/.test(ntfy.url), JSON.stringify({u:ntfy.url,m:ntfy.method}));
  ok('...with the text as the body',         ntfy.body==='hello there', JSON.stringify(ntfy.body));
  ok('...and the title as a header',         ntfy.title==='A title', JSON.stringify(ntfy.title));
  /* This is the shape mistake that would silently return zero messages. */
  ok('the line-delimited reply is read',     ntfy.polled&&ntfy.msgs.length===2, JSON.stringify(ntfy.msgs));
  ok('...ignoring non-message events',       JSON.stringify(ntfy.msgs)==='["first","second"]', JSON.stringify(ntfy.msgs));
  ok('new messages reach the notifications', ntfy.pushedFirst===2, JSON.stringify(ntfy));
  ok('...and are not delivered twice',       ntfy.pushedTwice===ntfy.pushedFirst, JSON.stringify(ntfy));
  ok('a server error names the status',      ntfy.errOk===false&&/500/.test(ntfy.errReason||''), ntfy.errReason);

  console.log('\n── outgoing webhook ──');
  const hook=await p.evaluate(async()=>{
    const out={};
    out.kinds={
      discord:_khHookKind('https://discord.com/api/webhooks/123/abc'),
      discordapp:_khHookKind('https://discordapp.com/api/webhooks/1/x'),
      slack:_khHookKind('https://hooks.slack.com/services/T/B/X'),
      other:_khHookKind('https://example.com/hook')
    };
    out.bodies={
      discord:JSON.parse(_khHookBody('discord','text','T')),
      slack:JSON.parse(_khHookBody('slack','text','T')),
      generic:JSON.parse(_khHookBody('generic','text','T'))
    };
    _khConnSet('hook',{url:'https://discord.com/api/webhooks/123/abc'});
    const real=window.fetch;
    let seen=null;
    window.fetch=async(u,o)=>{seen={u:String(u),m:o&&o.method,ct:(o&&o.headers&&o.headers['Content-Type'])||''};
      return new Response(null,{status:204});};
    const r=await _khHookSend('hi','KindleHub');
    out.sent=r.ok;out.ct=seen.ct;out.method=seen.m;

    window.fetch=async()=>new Response('',{status:404});
    out.notFound=(await _khHookSend('x')).reason;
    window.fetch=async()=>new Response('',{status:401});
    out.refused=(await _khHookSend('x')).reason;
    window.fetch=async()=>{throw new Error('Failed to fetch');};
    out.blocked=(await _khHookSend('x')).reason;
    window.fetch=real;

    /* An https page cannot reach a plain-http address. Saying "could not
       connect" there sends someone debugging their own network for an hour. */
    _khConnSet('hook',{url:'http://192.168.1.50/hook'});
    /* Checked with an explicit page protocol so the RULE is pinned rather than
       whatever protocol happens to have loaded the test. */
    out.mixedHelper=_khMixedContentWarning('http://192.168.1.50/hook','https:');
    out.httpsFine=_khMixedContentWarning('https://example.com/hook','https:');
    out.httpPageFine=_khMixedContentWarning('http://192.168.1.50/hook','http:');
    localStorage.removeItem('kh_connections');
    return out;
  });
  ok('Discord is recognised',                hook.kinds.discord==='discord'&&hook.kinds.discordapp==='discord', JSON.stringify(hook.kinds));
  ok('Slack is recognised',                  hook.kinds.slack==='slack', JSON.stringify(hook.kinds));
  ok('anything else gets the generic shape', hook.kinds.other==='generic', JSON.stringify(hook.kinds));
  ok('Discord gets a content field',         hook.bodies.discord.content&&/T/.test(hook.bodies.discord.content), JSON.stringify(hook.bodies.discord));
  ok('Slack gets a text field',              typeof hook.bodies.slack.text==='string', JSON.stringify(hook.bodies.slack));
  ok('generic gets title and text',          hook.bodies.generic.title==='T'&&hook.bodies.generic.text==='text', JSON.stringify(hook.bodies.generic));
  ok('a webhook send goes out as a POST',    hook.sent&&hook.method==='POST', JSON.stringify(hook));
  /* application/json would make this a CORS preflight, which most webhook
     endpoints refuse — Discord and Slack both accept text/plain. */
  ok('...as text/plain, to avoid a preflight', /text\/plain/.test(hook.ct||''), hook.ct);
  ok('a 404 says the address is wrong',      /404/.test(hook.notFound||''), hook.notFound);
  ok('a 401 says it was refused',            /refused|deleted|regenerated/i.test(hook.refused||''), hook.refused);
  ok('a blocked request names both causes',  /connection/i.test(hook.blocked||'')&&/web page/i.test(hook.blocked||''), hook.blocked);
  ok('an http address on an https page is explained', /https/i.test(hook.mixedHelper||'')&&hook.mixedHelper!=='', hook.mixedHelper);
  ok('...and an https one is fine',          hook.httpsFine==='', hook.httpsFine);
  /* On an http page there is no mixed content and nothing to warn about. */
  ok('...and it does not cry wolf on an http page', hook.httpPageFine==='', hook.httpPageFine);

  console.log('\n── the page ──');
  const view=await p.evaluate(async()=>{
    showView('connections');
    await new Promise(r=>setTimeout(r,320));
    const host=document.getElementById('mainHost');
    const t=host.textContent||'';
    return {cards:host.querySelectorAll('.card').length,
            hasCal:/Calendar subscription/.test(t),
            hasNtfy:/ntfy/.test(t),
            hasHook:/webhook/i.test(t),
            /* the single most common reason one of these will not work */
            warnsMixed:/plain http/i.test(t),
            tests:Array.prototype.filter.call(host.querySelectorAll('button'),
              x=>/Test|Send a test|Check for/.test(x.textContent||'')).length,
            over:document.documentElement.scrollWidth>document.documentElement.clientWidth+1};
  });
  ok('the page renders three connectors',    view.cards>=3&&view.hasCal&&view.hasNtfy&&view.hasHook, JSON.stringify(view));
  ok('every connector can be tested',        view.tests>=3, JSON.stringify(view));
  ok('the http/https trap is stated up front', view.warnsMixed, JSON.stringify(view));
  ok('nothing overflows at 600px',           view.over===false, JSON.stringify(view));

  /* ── the bug-hunt round: everything below is a confirmed defect ────────── */
  console.log('\n-- connector settings are credentials, not content --');
  const sync=await p.evaluate(()=>({
    skipped:_isLsBackupSkipped('kh_connections'),
    /* the comparison that makes the point: an ordinary content key is NOT skipped */
    contentNotSkipped:_isLsBackupSkipped('kh_custom_apps')===false
  }));
  ok('kh_connections never rides to the cloud', sync.skipped===true, JSON.stringify(sync));
  ok('...while ordinary content still does',    sync.contentNotSkipped, JSON.stringify(sync));

  console.log('\n-- an event id depends on its UID and nothing else --');
  const ids=await p.evaluate(()=>{
    const feed=(evs)=>'BEGIN:VCALENDAR\n'+evs.map(u=>
      'BEGIN:VEVENT\nUID:'+u+'\nDTSTART:20260310T090000Z\nSUMMARY:E '+u.slice(-3)+'\nEND:VEVENT').join('\n')+'\nEND:VCALENDAR';
    const three=_khParseIcsEvents(feed(['aaa@example.com','bbb@example.com','ccc@example.com']));
    /* delete the FIRST event upstream — b and c must keep their ids */
    const two=_khParseIcsEvents(feed(['bbb@example.com','ccc@example.com']));
    /* Outlook-style UIDs: same long prefix, differ only at the end */
    const pre='040000008200E00074C5B7101A82E008000000000';
    const long=_khParseIcsEvents(feed([pre+'1111111111111111111',pre+'2222222222222222222']));
    return {bBefore:three[1].id,bAfter:two[0].id,cBefore:three[2].id,cAfter:two[1].id,
            longA:long[0].id,longB:long[1].id,longCount:long.length};
  });
  ok('an upstream deletion does not rename the survivors',
     ids.bBefore===ids.bAfter&&ids.cBefore===ids.cAfter, JSON.stringify(ids));
  ok('two long UIDs sharing a prefix get different ids',
     ids.longA!==ids.longB&&ids.longCount===2, JSON.stringify(ids));

  console.log('\n-- a repeating event repeats --');
  const rr=await p.evaluate(()=>{
    const y=new Date().getFullYear()-1;
    const wk='BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:w@example.com\n'+
      'DTSTART;TZID=Europe/London:'+y+'0108T090000\nRRULE:FREQ=WEEKLY;BYDAY=MO\n'+
      'SUMMARY:Standup\nEND:VEVENT\nEND:VCALENDAR';
    const rows=_khParseIcsEvents(wk);
    const now=Date.now();
    const future=rows.filter(r=>new Date(r.year,r.month,r.day).getTime()>now).length;
    /* a bounded, capped expansion — never "every Monday forever" */
    const capped=rows.length<=120;
    /* COUNT is honoured */
    const c3=_khParseIcsEvents('BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:c@example.com\n'+
      'DTSTART:'+(new Date().getFullYear())+'0105T090000Z\nRRULE:FREQ=DAILY;COUNT=3\n'+
      'SUMMARY:Three\nEND:VEVENT\nEND:VCALENDAR');
    return {rows:rows.length,future:future,capped:capped,count3:c3.length,
            uniq:new Set(rows.map(r=>r.id)).size===rows.length,
            stats:window._khIcsLastStats};
  });
  ok('a weekly event appears many times, not once', rr.rows>10, JSON.stringify(rr));
  ok('...including in the future',                  rr.future>0, JSON.stringify(rr));
  ok('...bounded, never unrolled forever',          rr.capped, JSON.stringify(rr));
  ok('...each occurrence with its own id',          rr.uniq, JSON.stringify(rr));
  ok('COUNT=3 yields at most 3',                    rr.count3<=3&&rr.count3>0, JSON.stringify(rr));
  ok('and the parse reports what it saw',           !!(rr.stats&&rr.stats.repeating>=1), JSON.stringify(rr.stats));

  console.log('\n-- a failing calendar backs off instead of hammering --');
  const bo=await p.evaluate(async()=>{
    localStorage.setItem('kh_connections',JSON.stringify({calsub:{url:'https://example.com/bad.ics'}}));
    let calls=0;
    const real=window.fetch;
    window.fetch=async()=>{calls++;return new Response('nope',{status:500});};
    /* awaited, so the whole proxy chain has finished before we count */
    await window._khCalSubMaybeRefresh();
    const first=calls;
    await new Promise(r=>setTimeout(r,20));
    /* the very next tick must NOT try again */
    await window._khCalSubMaybeRefresh();
    await new Promise(r=>setTimeout(r,20));
    const second=calls;
    window.fetch=real;
    const cfg=JSON.parse(localStorage.getItem('kh_connections')||'{}').calsub||{};
    localStorage.removeItem('kh_connections');
    return {first,second,lastTry:!!cfg.lastTry,fails:cfg.fails||0,lastAt:cfg.lastAt||0};
  });
  ok('a failure is recorded as an attempt',   bo.lastTry&&bo.fails===1, JSON.stringify(bo));
  ok('...without claiming success',           bo.lastAt===0, JSON.stringify(bo));
  ok('...and the next tick does not retry',   bo.second===bo.first&&bo.first>0, JSON.stringify(bo));

  console.log('\n-- ntfy keeps what it could not show --');
  const hold=await p.evaluate(async()=>{
    localStorage.setItem('kh_connections',JSON.stringify({ntfy:{topic:'a-topic-long-enough'}}));
    const real=window.fetch, realPush=window._khPushNotif;
    window.fetch=async()=>new Response(
      JSON.stringify({id:'m1',event:'message',time:1755000100,message:'one'})+'\n'+
      JSON.stringify({id:'m2',event:'message',time:1755000200,message:'two'}),{status:200});
    /* the tray refuses everything, exactly as it does while the Dashboard is up */
    window._khPushNotif=function(){return false;};
    const n=await window._khNtfyFetchNew();
    const after=JSON.parse(localStorage.getItem('kh_connections')||'{}').ntfy||{};
    /* now it will accept — the messages must still be there */
    const got=[];
    window._khPushNotif=function(x){got.push(x.key);return true;};
    const n2=await window._khNtfyFetchNew();
    window.fetch=real;window._khPushNotif=realPush;
    localStorage.removeItem('kh_connections');
    return {refused:n,watermark:after.lastSeen||0,delivered:n2,keys:got};
  });
  ok('a refused message is not counted',      hold.refused===0, JSON.stringify(hold));
  ok('...and the watermark does not move',    hold.watermark===0, JSON.stringify(hold));
  ok('...so it arrives once it can be shown', hold.delivered===2, JSON.stringify(hold));
  ok('...keyed by ntfy id, so repeats differ',
     hold.keys.length===2&&hold.keys[0]!==hold.keys[1]&&/ntfy:m1/.test(hold.keys[0]), JSON.stringify(hold));

  console.log('\n-- an explicit 0 means 0 --');
  const zero=await p.evaluate(async()=>{
    localStorage.setItem('kh_connections',JSON.stringify({ntfy:{topic:'a-topic-long-enough',lastSeen:1755000100}}));
    let seen='';
    const real=window.fetch;
    window.fetch=async(u)=>{seen=String(u);return new Response('',{status:200});};
    await window._khNtfyPoll(0);
    window.fetch=real;
    localStorage.removeItem('kh_connections');
    return {url:seen};
  });
  ok('"check for messages" asks from the start, not the watermark',
     /since=1h/.test(zero.url)&&!/since=1755000100/.test(zero.url), zero.url);

  console.log('\n-- a slug that is a game and a view opens the game --');
  const slug=await p.evaluate(()=>({
    bothExist:(typeof BUILDERS==='object'&&!!BUILDERS.connections)&&
              (typeof GAME_HELP==='object'&&!!GAME_HELP.connections)
  }));
  ok('/connections is still both a game and a page', slug.bothExist, JSON.stringify(slug));
  const src=fs.readFileSync(path.resolve('index.html'),'utf8');
  ok('...and the deep link checks the game first',
     src.indexOf("var isGame=(typeof GAME_HELP==='object'&&GAME_HELP[s]);")>0);
  /* Scoped to the connector block: bare fetch() is fine elsewhere in the app,
     what matters is that none of THESE four can hang a button forever. */
  const connRegion=src.slice(src.indexOf('function _khConnFetch('),src.indexOf('window._khHookSend='));
  ok('every connector fetch is time-bounded',
     connRegion.length>1000&&(connRegion.match(/_khConnFetch\(/g)||[]).length>=5,
     'region '+connRegion.length+' calls '+(connRegion.match(/_khConnFetch\(/g)||[]).length);

  ok('no page errors', errs.length===0, errs.slice(0,3).join(' | '));
  await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
