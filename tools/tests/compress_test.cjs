/* "Where is the free basic compression?"

   It was there — _upgradeStoredCompression has always written the KHD1
   dictionary form for free accounts — but running automatically is not the same
   as existing, as far as the person using it is concerned. There was no button
   anywhere and no sentence in the UI that used the word.

   Worse, the one button that mentioned compression at all refused free
   accounts. That banner only appears when somebody is running OUT OF ROOM, so a
   free reader met a storage-full warning with a button that sold them a plan
   instead of freeing anything.

   What this pins:
     - a free account can compress on demand, and it really shrinks the blob
     - what it wrote is still readable, because a compressor that loses data is
       worse than no compressor
     - the Storage card says which compression this plan gets
     - the storage banner does something for whoever pressed it, on any plan

   Run: NODE_PATH=/opt/node22/lib/node_modules node tools/tests/compress_test.cjs */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url'),fs=require('fs');

let pass=0,fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x!==undefined&&!c?'  -- '+String(x).slice(0,240):''));};

(async()=>{
  const src=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
  ok('the storage banner no longer refuses free accounts outright',
     !/_khRequirePlan\((?:'|")plus(?:'|"),\s*(?:'|")Supercompress/.test(src));

  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:600,height:800}});
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:20000});

  const r=await p.evaluate(async()=>{
    const out={};
    const S=window._KH.S;
    /* Shaped like a real account: MANY SMALL RECORDS, because the dictionary
       substitutes repeated field names. An earlier version of this test used a
       few records with long prose bodies in them and measured a 6% win, which
       says nothing about the compressor and everything about the fixture. */
    S.notes=[];
    for(let i=0;i<250;i++)S.notes.push({id:'n'+i,title:'Note '+i,
      body:'Some thoughts about chapter '+i+'.',date:'2026-07-'+(1+i%28),pinned:false,tags:['reading']});
    S.calEvents=[];
    for(let i=0;i<200;i++)S.calEvents.push({id:'e'+i,year:2026,month:i%12,day:1+i%28,time:'09:00',title:'Event '+i});
    S.books=[];
    for(let i=0;i<120;i++)S.books.push({id:'b'+i,title:'Book '+i,author:'Author '+i,status:'reading',pages:300,readerPos:12});

    out.hasBasic=typeof window.compressBasic==='function';
    const raw=JSON.stringify(S).length;
    /* Put the RAW blob on disk first, so "bytes freed" is measured against the
       state we are actually compressing rather than against whatever small
       compressed blob happened to be there from boot. */
    try{localStorage.setItem('kindlehub_v5',JSON.stringify(S));}catch(_){}
    const freed=await window.compressBasic();
    const stored=(localStorage.getItem('kindlehub_v5')||'');
    out.raw=raw;
    out.storedLen=stored.length;
    out.usedDictionary=stored.slice(0,5)==='KHD1:';
    out.smaller=stored.length<raw;
    out.ratio=stored.length/raw;
    out.freedSomething=freed>0;

    /* The only thing that really matters about a compressor. */
    let back=null;
    try{ back=JSON.parse(window._decompStr(stored.slice(5))); }catch(_){}
    out.roundTrips=!!back && Array.isArray(back.notes) && back.notes.length===250
                   && back.notes[249].title==='Note 249'
                   && Array.isArray(back.calEvents) && back.calEvents.length===200
                   && Array.isArray(back.books) && back.books[119].author==='Author 119';
    return out;
  });

  console.log('\n── a free account can compress, on purpose, now ──');
  ok('there is a function to call',              r.hasBasic);
  ok('it writes the dictionary form',            r.usedDictionary);
  ok('...which is smaller than the raw state',   r.smaller, r.storedLen+' vs '+r.raw);
  /* Measured at 0.71 on this fixture. The threshold is loose because the win
     depends on the shape of what somebody stored — but a regression that broke
     the substitution table entirely would land near 1.0 and be caught. */
  ok('...by roughly the amount the settings card claims', r.ratio<0.82, 'ratio '+r.ratio);
  ok('...and it reports the bytes it freed',     r.freedSomething);
  ok('everything reads back exactly',            r.roundTrips);

  /* The Storage card only renders when signed in and syncing — that is the only
     situation with a budget to be near.

     Read BUTTONS, not innerText: the settings sections start collapsed, so the
     card is in the document but not in the rendered text. And drop VIEWS.settings
     between plans, because settings is view-cached — without that the second
     plan silently re-reads the first plan's render and every assertion passes
     for the wrong reason. */
  const ui=await p.evaluate(async()=>{
    const out={};
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const S=window._KH.S;
    S.authToken='a'.repeat(64); S.syncEnabled=true;
    const orig=window._khPlan;

    async function cardFor(plan){
      window._khPlan=function(){return plan;};
      try{showView('home');}catch(_){}
      await sleep(120);
      /* VIEWS is a top-level const, so it is a global LEXICAL binding — reachable
         as a bare name, but never as a window property. */
      try{delete VIEWS.settings;}catch(_){}
      try{showView('settings');}catch(_){}
      await sleep(2200);
      const host=document.getElementById('mainHost');
      const buttons=[].slice.call(host.querySelectorAll('button')).map(e=>(e.textContent||'').trim());
      return {buttons:buttons, text:(host&&host.textContent)||''};
    }
    out.free=await cardFor('free');
    out.pro=await cardFor('pro');
    window._khPlan=orig;
    return out;
  });
  const freeCmp=ui.free.buttons.filter(t=>/ompress/i.test(t));
  const proCmp =ui.pro.buttons.filter(t=>/ompress/i.test(t));

  console.log('\n── and the card says which one you get ──');
  ok('a free account is offered a compress button',
     freeCmp.indexOf('Compress now')>=0, JSON.stringify(freeCmp));
  ok('...is told its data is already being compacted',
     /compacted automatically/.test(ui.free.text));
  ok('...and is told plainly what a paid plan adds',
     /gzip/.test(ui.free.text));
  ok('...and is NOT offered a button its plan does not have',
     freeCmp.indexOf('Supercompress')<0, JSON.stringify(freeCmp));
  ok('a paid account still gets Supercompress',
     proCmp.indexOf('Supercompress')>=0, JSON.stringify(proCmp));
  ok('...and the keep-everything variant',
     proCmp.indexOf('Compress (keep all)')>=0, JSON.stringify(proCmp));
  ok('...and is not offered the free one instead',
     proCmp.indexOf('Compress now')<0, JSON.stringify(proCmp));

  ok('no page errors', errs.length===0, errs.slice(0,3).join(' | '));
  await p.close();await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
