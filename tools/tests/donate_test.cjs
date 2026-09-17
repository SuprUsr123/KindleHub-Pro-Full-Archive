/* Tip jar (twix2, 4 votes).

   KindleHub is free and stays free — this gates nothing and unlocks nothing.
   It is a plain outbound link, because a payment SDK would not render on old
   Silk and the app should never touch card details.

   The property worth defending: a money link is the ONE place in the app where
   a wrong destination is actively harmful. It would look exactly like the real
   thing while sending someone else's money somewhere else. So the destination
   is allow-listed to known donation platforms — even a stolen admin token
   cannot point it at an arbitrary domain — and a rejected link is reported to
   the admin rather than silently dropped.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tools/tests/donate_test.cjs */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url'),fs=require('fs');

let pass=0,fail=0;
const ok=(n,c,extra)=>{
  if(c){pass++;console.log('PASS '+n);}
  else{fail++;console.log('FAIL '+n+(extra!==undefined?('  -- '+String(extra).slice(0,240)):''));}
};

(async()=>{
  const src=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
  ok('the tip-jar record is filtered out of the announcements widget',
     /_DONATE_TAG\)===0\)return false;/.test(src));
  ok('...and never rendered as announcement text',
     /if\(t\.indexOf\(_DONATE_TAG\)===0\)return '';/.test(src));
  ok('it reuses the announcement fetch the capacity guard already makes (no extra request)',
     /donateRec===null&&tx\.indexOf\(_DONATE_TAG\)===0/.test(src));

  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:600,height:800}});
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:20000});

  /* the allow-list */
  const gate=await p.evaluate(()=>{
    const good=[
      'https://ko-fi.com/someone',
      'https://buymeacoffee.com/someone',
      'https://github.com/sponsors/someone',
      'https://patreon.com/someone',
      'https://paypal.me/someone'
    ];
    const bad=[
      'http://ko-fi.com/someone',                 /* not https */
      'https://evil.example/pay',                 /* not a donation platform */
      'https://github.com/arancool3000/repo',     /* github, but not Sponsors */
      'https://ko-fi.com.evil.example/someone',   /* lookalike host */
      'javascript:alert(1)',
      ''
    ];
    /* the check lives on the page as _donateUrlOk */
    const f=window._donateUrlOk||(typeof _donateUrlOk!=='undefined'?_donateUrlOk:null);
    if(!f)return{err:'no url checker exposed'};
    return{
      goodAccepted:good.filter(u=>!f(u)),
      badRejected:bad.filter(u=>f(u))
    };
  }).catch(e=>({err:String(e)}));

  if(gate.err){
    /* the helper is a module-local const in the minified build — exercise it
       through the public setter instead */
    const via=await p.evaluate(async()=>{
      let posted=null;
      window._announceRpc=async function(fn,args){posted=args.p_text;return true;};
      window._adminToken='tok';
      await window._khDonateSet([
        {label:'Ko-fi',url:'https://ko-fi.com/someone'},
        {label:'Bad',url:'https://evil.example/pay'},
        {label:'Repo',url:'https://github.com/arancool3000/repo'},
        {label:'Plain',url:'http://ko-fi.com/someone'}
      ]);
      let list=[];try{list=JSON.parse(String(posted||'').replace('[[KH_DONATE]]',''));}catch(_){}
      return{posted:posted,list:list,links:window._khDonateLinks()};
    });
    ok('only allow-listed donation hosts survive being saved',
       via.list.length===1&&via.list[0].url==='https://ko-fi.com/someone', JSON.stringify(via.list));
    ok('...and the surviving link is what the app offers',
       via.links.length===1&&via.links[0].url==='https://ko-fi.com/someone', JSON.stringify(via.links));
  }else{
    ok('every allow-listed donation platform is accepted', gate.goodAccepted.length===0, JSON.stringify(gate.goodAccepted));
    ok('non-https, lookalike hosts, plain GitHub repos and javascript: are all refused',
       gate.badRejected.length===0, JSON.stringify(gate.badRejected));
  }

  /* the card only appears when links exist, and never gates anything.
     Views are cached once built, so each case gets a fresh page rather than a
     re-show that would hand back the DOM built under the previous state. */
  const settingsText=async(stored)=>{
    await p.evaluate(v=>{if(v===null)localStorage.removeItem('kh_donate');else localStorage.setItem('kh_donate',v);},stored);
    await p.reload({waitUntil:'domcontentloaded'});
    await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:20000});
    return await p.evaluate(async()=>{
      const sleep=ms=>new Promise(r=>setTimeout(r,ms));
      showView('settings');
      await sleep(1800);
      const v=document.getElementById('view-settings');
      return v?(v.textContent||''):'';
    });
  };
  const card={};
  card.hiddenWhenUnset=(await settingsText(null)).indexOf('Support KindleHub')<0;
  const tSet=await settingsText(JSON.stringify([{label:'Ko-fi',url:'https://ko-fi.com/someone'}]));
  card.shownWhenSet=tSet.indexOf('Support KindleHub')>=0;
  card.saysItIsOptional=tSet.indexOf('unlocks nothing')>=0;
  card.saysFree=tSet.indexOf('free and always will be')>=0;
  card.noPaymentHandling=tSet.indexOf('never handles your payment details')>=0;
  /* the button must open exactly the saved URL, not something derived from it */
  card.opened=await p.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    let opened=null;
    window.open=function(u){opened=u;return null;};
    const bs=Array.prototype.slice.call(document.querySelectorAll('button'));
    for(const x of bs)if((x.textContent||'').trim()==='Ko-fi'){x.click();break;}
    await sleep(150);
    return opened;
  });
  card.junkIgnored=(await settingsText(JSON.stringify([{label:'X',url:'https://evil.example/pay'}]))).indexOf('Support KindleHub')<0;

  ok('no links set means no card at all (never a dead Support button)', card.hiddenWhenUnset, JSON.stringify(card));
  ok('setting a link shows the card', card.shownWhenSet, JSON.stringify(card));
  ok('...saying plainly that the app is free and this unlocks nothing',
     card.saysFree&&card.saysItIsOptional, JSON.stringify(card));
  ok('...and that KindleHub never handles payment details', card.noPaymentHandling);
  ok('the button opens exactly the saved link', card.opened==='https://ko-fi.com/someone', String(card.opened));
  ok('a stored link on a non-allow-listed host renders nothing', card.junkIgnored, JSON.stringify(card));

  ok('no page errors', errs.length===0, errs.slice(0,3).join(' | '));
  await p.close();await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
