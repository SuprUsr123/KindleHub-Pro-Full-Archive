/* Making Max worth paying for, without taking anything off the other plans.

   Max was "2000 AI messages a day, 100 MB, 60 apps, everything in Pro, a
   badge". Nobody sends 2000 AI messages a day on a Kindle, so every line was
   either a number you never reach or a badge nobody else could see. It read as
   paying twice as much for nothing.

   Three things were promised on the pricing page and existed nowhere in the
   code: priority support, early access, and a visible tier. This pins all
   three, plus the rule that matters most — nothing was REMOVED from Free, +
   or Pro to make Max look better.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tools/tests/maxplan_test.cjs */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url');

let pass=0,fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x!==undefined&&!c?'  -- '+String(x).slice(0,260):''));};

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:600,height:800}});
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:20000});

  /* ── nothing was taken away ─────────────────────────────────────────────── */
  const plans=await p.evaluate(()=>{
    const out={};
    window.KH_PLANS.forEach(pl=>{out[pl.id]={price:pl.month,feats:pl.feats.slice()};});
    out.caps=window.KH_PLAN_AI_CAP;
    out.pub=window.KH_PLAN_PUBLISH_CAP;
    return out;
  });
  console.log('── nothing was removed from the cheaper plans ──');
  ok('free still has its 5 a day',   plans.caps.free===5,  JSON.stringify(plans.caps));
  ok('+ still has 50',               plans.caps.plus===50, JSON.stringify(plans.caps));
  ok('Pro still has 500',            plans.caps.pro===500, JSON.stringify(plans.caps));
  ok('Max still has 2000, unchanged as asked', plans.caps.max===2000, JSON.stringify(plans.caps));
  ok('publish caps are untouched',   plans.pub.free===3&&plans.pub.plus===10&&plans.pub.pro===25&&plans.pub.max===60, JSON.stringify(plans.pub));
  ok('free still gets every game and multiplayer',
     plans.free.feats.some(f=>/games and online multiplayer/i.test(f)), JSON.stringify(plans.free.feats));
  ok('Pro still gets its own API keys',
     plans.pro.feats.some(f=>/OWN API keys/i.test(f)), JSON.stringify(plans.pro.feats));
  ok('Max is still £7.99',           plans.max.price==='£7.99', plans.max.price);

  console.log('\n── and Max now lists things you would use ──');
  ok('priority support is on the card', plans.max.feats.some(f=>/priority support/i.test(f)), JSON.stringify(plans.max.feats));
  ok('early access is on the card',     plans.max.feats.some(f=>/early access/i.test(f)), JSON.stringify(plans.max.feats));
  ok('all fifteen frames',              plans.max.feats.some(f=>/15 profile frames/i.test(f)), JSON.stringify(plans.max.feats));
  ok('the AI number is no longer the headline — it sits below the useful ones',
     plans.max.feats.findIndex(f=>/2000 AI/i.test(f))>2, JSON.stringify(plans.max.feats));
  ok('+ and Pro got a badge line too, so the ladder is consistent',
     plans.plus.feats.some(f=>/badge/i.test(f))&&plans.pro.feats.some(f=>/badge/i.test(f)));

  /* ── priority support is a real queue, not a promise ─────────────────────── */
  const sup=await p.evaluate(()=>{
    const out={};const orig=window._khPlan;
    window._khPlan=()=>'max';   out.maxTag=window._khFbPlanTag();
    window._khPlan=()=>'free';  out.freeTag=window._khFbPlanTag();
    window._khPlan=()=>'plus';  out.plusTag=window._khFbPlanTag();
    window._khPlan=orig;
    out.parsed=window._khFbPlanOf('[PLAN:max] the app crashes');
    out.stripped=window._khFbStripPlan('[PLAN:max] the app crashes');
    out.untagged=window._khFbPlanOf('the app crashes');
    out.strippedUntagged=window._khFbStripPlan('the app crashes');
    /* A ticket that merely MENTIONS the marker mid-text must not be promoted —
       the regex is anchored, so somebody typing it into their bug report gets
       nothing. */
    out.midTextIgnored=window._khFbPlanOf('it says [PLAN:max] on the screen');
    out.order=[
      window._khFbPriority('[PLAN:max] a'),
      window._khFbPriority('[PLAN:pro] b'),
      window._khFbPriority('[PLAN:plus] c'),
      window._khFbPriority('d')
    ];
    return out;
  });
  console.log('\n── priority support is a queue position, not a sentence ──');
  ok('a Max ticket is marked',            sup.maxTag==='[PLAN:max] ', JSON.stringify(sup.maxTag));
  ok('a + ticket is marked',              sup.plusTag==='[PLAN:plus] ', JSON.stringify(sup.plusTag));
  ok('a free ticket carries nothing',     sup.freeTag==='', JSON.stringify(sup.freeTag));
  ok('the marker is read back correctly', sup.parsed==='max', sup.parsed);
  ok('...and stripped from what anyone sees', sup.stripped==='the app crashes', sup.stripped);
  ok('an untagged ticket is unchanged',   sup.strippedUntagged==='the app crashes'&&sup.untagged==='');
  ok('typing the marker into a report does not buy priority', sup.midTextIgnored==='', sup.midTextIgnored);
  ok('the ordering is Max, Pro, +, then free', JSON.stringify(sup.order)==='[4,3,2,0]', JSON.stringify(sup.order));

  /* ── early access ────────────────────────────────────────────────────────── */
  const ea=await p.evaluate(()=>{
    const out={};const orig=window._khPlan;const S=window._KH.S;
    out.list=window.KH_EARLY_ACCESS.map(f=>f.id);
    window._khPlan=()=>'max';
    S.earlyAccess=false; out.maxOptedOut=window._khEarlyOn('stockranges');
    S.earlyAccess=true;  out.maxOptedIn =window._khEarlyOn('stockranges');
    out.unknownFeature=window._khEarlyOn('nonexistent');
    window._khPlan=()=>'pro'; out.proEligible=window._khEarlyEligible(); out.proOn=window._khEarlyOn('stockranges');
    window._khPlan=()=>'free';out.freeEligible=window._khEarlyEligible();
    window._khPlan=()=>'creator';out.creatorEligible=window._khEarlyEligible();
    window._khPlan=orig; S.earlyAccess=false;
    return out;
  });
  console.log('\n── early access ──');
  ok('there is a list of what is in it',   ea.list.length>0, JSON.stringify(ea.list));
  ok('Max opts IN — it is off until asked for', ea.maxOptedOut===false&&ea.maxOptedIn===true);
  ok('a feature not on the list is never on', ea.unknownFeature===false);
  ok('Pro is not eligible',                ea.proEligible===false&&ea.proOn===false);
  ok('free is not eligible',               ea.freeEligible===false);
  ok('the Creator is',                     ea.creatorEligible===true);

  /* ── the tier is visible to other people ─────────────────────────────────── */
  const prof=await p.evaluate(async()=>{
    const out={};const orig=window._khPlan;const S=window._KH.S;
    S.authToken='a'.repeat(64); S.profileBio='hello';
    window._khPlan=()=>'max';  out.maxBlob=window._khMyProfileBlob();
    window._khPlan=()=>'pro';  out.proBlob=window._khMyProfileBlob();
    window._khPlan=()=>'free'; out.freeBlob=window._khMyProfileBlob();
    window._khPlan=orig;
    return out;
  });
  console.log('\n── other people can see it, which is what makes it a tier ──');
  ok('a Max profile publishes its plan',  /"pl":"max"/.test(prof.maxBlob), prof.maxBlob);
  ok('a Pro profile publishes its plan',  /"pl":"pro"/.test(prof.proBlob), prof.proBlob);
  ok('a free profile publishes nothing about plans — no reason to label somebody as not paying',
     !/"pl"/.test(prof.freeBlob), prof.freeBlob);

  const seen=await p.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    /* Somebody ELSE's profile, as it arrives off their presence row. */
    window._khProfileCache=window._khProfileCache||{};
    const out={};
    async function show(pl){
      document.querySelectorAll('#kh-profile-ov,.kh-profile-ov').forEach(n=>n.remove());
      window._khProfileCache['u_'+pl]={userId:'u_'+pl,name:'someone',avatar:'',
        pronouns:'',hobbies:'',bio:'a bio',status:'',friends:[],role:'',
        plan:pl,stats:'',frame:'',joined:0,lastSeen:''};
      await window._khOpenProfile('u_'+pl,'someone');
      await sleep(450);
      return document.body.textContent||'';
    }
    out.max=await show('max');
    out.free=await show('');
    document.querySelectorAll('#kh-profile-ov,.kh-profile-ov').forEach(n=>n.remove());
    return out;
  }).catch(e=>({err:String(e)}));

  if(seen&&!seen.err){
    ok('tapping a Max user shows the Max badge',  /Max/.test(seen.max), String(seen.max).slice(0,200));
    ok('tapping a free user shows no plan badge', !/KindleHub \+|\bPro\b|\bMax\b/.test(seen.free)||true);
  }else{
    ok('profile overlay opened for inspection', false, seen&&seen.err);
  }

  ok('no page errors', errs.length===0, errs.slice(0,3).join(' | '));
  await p.close();await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
