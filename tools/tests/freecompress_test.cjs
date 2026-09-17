/* The free plan gets a "very simple" compression on its LOCAL blob so 1 MB of
   quota holds more — the dictionary substitution only, NOT gzip and NOT the
   data-dropping supercompress.

   The thing that is easy to get catastrophically wrong (and WAS, once): WHERE it
   runs. _compStr is O(dict x length) — ~90 token passes over the whole blob — so
   doing it on the save path cost ~70ms per save on a 500 KB state here, which is
   ~1s+ on a Kindle, on EVERY chat send / AI reply / view change. The site crawled
   for everyone. So: save() writes RAW (fast), and the compression is applied by
   the THROTTLED _upgradeStoredCompression (skips <80 KB, at most once/15s).

   This test pins both halves: the save path stays fast, AND the blob still ends
   up compressed + readable.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tools/tests/freecompress_test.cjs */
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

  const SK='kindlehub_v5';
  const r=await p.evaluate((SK)=>{
    const S=window._KH.S,out={};
    const bigNotes=()=>{const a=[];for(let i=0;i<2200;i++)a.push({id:'note'+i,title:'Note '+i,text:'compressible reading content number '+i+' with some repeated structure',date:'2026-07-30T10:00:00.000Z',tags:['reading'],pinned:false});return a;};

    /* ── a FREE (here: logged-out) user ── */
    S.authToken='';S.entitlement=null;S.notes=bigNotes();
    const raw=JSON.stringify(S).length;
    out.rawKB=Math.round(raw/1024);

    /* ── THE REGRESSION GUARD: a save must be FAST. It writes raw; no ~90-pass
          compression allowed on this path. ── */
    window.saveNow();                              /* warm + let the throttled upgrade take its turn */
    const times=[];
    for(let k=0;k<5;k++){
      S.notes[0].text='edit '+k;
      const t0=performance.now(); window.saveNow(); times.push(performance.now()-t0);
    }
    out.saveMs=times.map(x=>Math.round(x));
    out.medianSaveMs=Math.round(times.slice().sort((a,b)=>a-b)[2]);
    out.savedRawFast=(localStorage.getItem(SK)||'').charAt(0)==='{';   /* raw on the hot path */

    /* ── the space win still happens, via the deferred/throttled upgrade ── */
    window._lastCompressAt=0;                       /* clear the 15s throttle for the test */
    try{ if(typeof window._upgradeStoredCompression==='function')window._upgradeStoredCompression(JSON.stringify(S)); }catch(e){ out.upErr=String(e); }
    const stored=localStorage.getItem(SK)||'';
    out.deferredMarker=stored.slice(0,5);
    out.deferredSmaller=stored.length<raw;
    out.deferredSavedPct=Math.round((1-stored.length/raw)*100);

    /* ...and every byte round-trips back (no data loss) */
    try{ const obj=JSON.parse(window._decompStr(stored.slice(5)));
      out.roundTrips=Array.isArray(obj.notes)&&obj.notes.length===2200&&obj.notes[2199].text==='compressible reading content number 2199 with some repeated structure'; }
    catch(e){ out.roundTrips=false; out.rtErr=String(e); }
    out.meterReflects=window._dataUsageBytes()<raw;

    /* ── a PAID user never gets the dictionary form (gzip path instead) ── */
    S.authToken='a'.repeat(64);
    S.entitlement={tier:'max',status:'active',until:0};
    window._lastCompressAt=0;
    window.saveNow();
    out.paidNotDict=(localStorage.getItem(SK)||'').slice(0,5)!=='KHD1:';
    return out;
  },SK);

  console.log(JSON.stringify(r,null,1));
  ok('a save on a ~'+r.rawKB+' KB free state stays FAST (no compression on the hot path)',
     r.medianSaveMs<35, 'median '+r.medianSaveMs+'ms — saves: '+JSON.stringify(r.saveMs));
  ok('...and the hot path writes the RAW blob', r.savedRawFast);
  ok('the deferred upgrade still stores the KHD1 (dictionary) form', r.deferredMarker==='KHD1:', r.deferredMarker+' '+(r.upErr||''));
  ok('...and it is genuinely smaller than the raw JSON', r.deferredSmaller, r.deferredSavedPct+'% saved');
  ok('...with every byte round-tripping back (no data loss)', r.roundTrips, r.rtErr);
  ok('...and the usage meter reflects the compressed size', r.meterReflects);
  ok('a paid user never gets the dictionary form', r.paidNotDict);

  /* ── boot must READ a KHD1 blob back correctly ── */
  await p.evaluate((SK)=>{
    const S=window._KH.S;S.authToken='';S.entitlement=null;
    S.notes=[{id:'boot1',text:'survives a reload',tags:[],date:'2026-07-30T10:00:00.000Z',pinned:false}];
    S.profileName='BootTestUser';
    window.saveNow();
    /* force the compressed form on disk regardless of size/throttle */
    try{ const j=JSON.stringify(S); const packed='KHD1:'+window._compStr(j);
         if(window._decompStr(packed.slice(5))===j)localStorage.setItem(SK,packed); }catch(_){}
  },SK);
  const marker=await p.evaluate((SK)=>localStorage.getItem(SK).slice(0,5),SK);
  await p.reload({waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:20000});
  const afterBoot=await p.evaluate(()=>({
    name:window._KH.S.profileName,
    note:(window._KH.S.notes&&window._KH.S.notes[0]&&window._KH.S.notes[0].text)||'(gone)'
  }));
  ok('the stored blob really was the compressed form before reload', marker==='KHD1:', marker);
  ok('boot reads a KHD1 blob back — data survives a reload', afterBoot.name==='BootTestUser'&&afterBoot.note==='survives a reload', JSON.stringify(afterBoot));
  ok('no page errors', errs.length===0, errs.slice(0,3).join(' | '));

  await p.close();await b.close();

  const src=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
  /* the save path must not call the compressor at all */
  const persist=(src.match(/function _persistState\(\)\{[\s\S]*?\n\}/)||[''])[0]
                  .replace(/\/\*[\s\S]*?\*\//g,'');   /* the comment explains the trap; only CODE matters */
  ok('_persistState does NOT call _compStr (that was the site-wide slowdown)', persist.length>0&&persist.indexOf('_compStr')<0);
  ok('the deferred upgrade handles the free tier', /_khSimpleCompressLocal\(\)\)\{[\s\S]{0,400}KHD1:/.test(src));
  ok('the deferred upgrade only trusts a byte-for-byte round-trip', /_decompStr\(_sp\.slice\(5\)\)===jsonStr/.test(src));
  ok('the boot loader handles the KHD1 marker', /r\.slice\(0,5\)==='KHD1:'/.test(src));

  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
