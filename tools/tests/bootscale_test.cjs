/* Boot must not get dramatically slower the more you have saved.

   It used to. The pending-edit ledger — the thing that stops a cloud pull
   overwriting an edit you just made — was rebuilt inside save(), and building
   it means fingerprinting every note, book, deck, journal entry, event and
   published app on the account. save() is called for a keystroke, a game move,
   a view change, and boot alone makes about nineteen of them. So starting the
   app cost nineteen passes over everything you own.

   Measured on a 3 MB account: 7.7s before, 1.8s after. Empty accounts barely
   moved, which is exactly why this went unnoticed for so long — every test
   account was empty.

   This asserts the SHAPE rather than a stopwatch reading: a heavy account may
   legitimately boot somewhat slower than an empty one, but not several times
   slower. The old code failed this at ~6x. The threshold is deliberately loose
   so ordinary timing noise cannot fail it; anything that trips it is a real
   return to per-save work over the whole account.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tools/tests/bootscale_test.cjs */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const http=require('http'),fs=require('fs'),path=require('path');

let pass=0,fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x!==undefined&&!c?'  -- '+String(x).slice(0,200):''));};

const ROOT=path.resolve(__dirname,'../..');
const TYPES={'.html':'text/html','.js':'application/javascript','.css':'text/css'};
const srv=http.createServer((req,res)=>{
  const u=req.url.split('?')[0];
  const f=path.join(ROOT,u==='/'?'index.min.html':u);
  fs.readFile(f,(e,d)=>{
    if(e){res.writeHead(404);res.end('no');return;}
    const ext=path.extname(f);
    /* Real headers: the bundle is immutable-cached, so repeat boots measure the
       app starting up, not the network. */
    res.writeHead(200,{'Content-Type':TYPES[ext]||'text/plain',
      'Cache-Control': ext==='.js'?'public, max-age=31536000, immutable':'no-cache'});
    res.end(d);
  });
});

/* Seed an account of roughly `mb` megabytes through the app's own save path,
   then reload it a few times and take the median. A fresh browser context per
   size keeps one measurement's localStorage out of the other's. */
async function bootTime(browser,port,mb){
  const ctx=await browser.newContext({viewport:{width:420,height:760}});
  let p=await ctx.newPage();
  await p.goto('http://127.0.0.1:'+port+'/',{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:60000});
  const seeded=await p.evaluate(async(mb)=>{
    const S=window._KH.S;
    if(mb>0){
      const w='the quick brown fox jumps over a lazy dog while reading on a kindle screen '.split(' ');
      const para=()=>{let s='';for(let i=0;i<160;i++)s+=w[(Math.random()*w.length)|0]+' ';return s;};
      S.notes=S.notes||[];let n=0;
      while(JSON.stringify(S.notes).length<mb*1024*1024)
        S.notes.push({id:'n'+(n++),title:'Note '+n,body:para()+para(),
                      date:new Date().toISOString(),tags:['a','b']});
    }
    await window._KH.saveNow();
    return (S.notes||[]).length;
  },mb);
  await p.close();
  const t=[];
  for(let i=0;i<3;i++){
    p=await ctx.newPage();
    const cdp=await ctx.newCDPSession(p);
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:6});   /* stand in for a Kindle */
    const t0=Date.now();
    await p.goto('http://127.0.0.1:'+port+'/',{waitUntil:'domcontentloaded'});
    await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:180000});
    t.push(Date.now()-t0);
    await p.close();
  }
  await ctx.close();
  t.sort((a,b)=>a-b);
  return {ms:t[1],notes:seeded,all:t};
}

(async()=>{
  await new Promise(r=>srv.listen(0,r));
  const port=srv.address().port;
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});

  const empty=await bootTime(b,port,0);
  const heavy=await bootTime(b,port,3);
  const ratio=heavy.ms/empty.ms;

  console.log('empty account  '+empty.ms+'ms  '+JSON.stringify(empty.all));
  console.log('3 MB account   '+heavy.ms+'ms  '+JSON.stringify(heavy.all)+'  ('+heavy.notes+' notes)');
  console.log('ratio          '+ratio.toFixed(2)+'x   (was ~6x when save() rebuilt the ledger)\n');

  ok('the heavy account actually got seeded',   heavy.notes>800, heavy.notes);
  ok('boot does not scale badly with how much you have saved', ratio<3, ratio.toFixed(2)+'x');

  /* The property behind the number, so a failure says WHY rather than just
     "slow today". Both call sites are load-bearing: the write keeps the ledger
     durable across a reload, the merge keeps it current when it is read. */
  const src=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
  const saveFns=(/function save\(d=1200\)\{[\s\S]*?\nfunction savePref/.exec(src)||[''])[0];
  ok('save() does not fingerprint the whole account', !/_khTrackItemEdits\(\)/.test(saveFns));
  ok('...the write path does',   /_khTrackItemEdits\(\)/.test((/function _persistState\(\)\{[\s\S]*?\n\}/.exec(src)||[''])[0]));
  ok('...and so does the merge', /_khTrackItemEdits\(\)/.test((/function mergeCloudState\(cloudState,opts\)\{[\s\S]{0,900}/.exec(src)||[''])[0]));

  await b.close();srv.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
