/* Stocks: some tickers frozen at "138h ago" while one says "just now".

   Every symbol walks the same three free CORS proxies, and fetchAll fired the
   whole watchlist at once — fourteen symbols is ~42 near-simultaneous requests
   at those proxies. They rate-limit, the first few land, the rest fail and keep
   their cached price. Refreshing a stale one by hand then fails too, because
   the minute's allowance is already spent by the stampede.

   The interesting thing to pin is the shape of the fix, not the network: a
   bounded pool, not a return to the sequential version it replaced (where one
   13-second timeout blocked every ticker queued behind it). So this drives
   fetchAll with a stubbed fetch and watches how many requests are in flight.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tools/tests/stocks_test.cjs */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url'),fs=require('fs');

let pass=0,fail=0;
const ok=(n,c,extra)=>{
  if(c){pass++;console.log('PASS '+n);}
  else{fail++;console.log('FAIL '+n+(extra?'  -- '+String(extra).slice(0,240):''));}
};

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:600,height:800}});
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:20000});

  const r=await p.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const S=window._KH.S;
    S.onboardingDone=true;
    /* A watchlist big enough that "all at once" and "three at a time" cannot be
       confused for each other. */
    S.stockWatch=['AAPL','TSLA','GOOGL','AMZN','MSFT','META','NVDA','NFLX','AMD','INTC','BABA','V','JPM','DIS'];

    /* Stub the network: every request takes a beat, so concurrency is
       observable, and each resolves with a Yahoo-shaped chart so a ticker
       actually succeeds rather than falling through every proxy. */
    let inFlight=0, peak=0, total=0;
    const realFetch=window.fetch;
    window.fetch=async function(u){
      inFlight++; if(inFlight>peak)peak=inFlight; total++;
      await sleep(60);
      inFlight--;
      const body=JSON.stringify({chart:{result:[{meta:{regularMarketPrice:100,previousClose:99,currency:'USD',symbol:'X'},
        timestamp:[1,2],indicators:{quote:[{close:[99,100]}]}}],error:null}});
      return new Response(body,{status:200,headers:{'Content-Type':'application/json'}});
    };

    const tab=document.querySelector('nav .tab[data-view="stocks"]');
    if(tab)tab.click(); else if(window.showView)window.showView('stocks');
    await sleep(2600);
    window.fetch=realFetch;
    return {peak, total, watch:S.stockWatch.length};
  });

  console.log(JSON.stringify(r));
  /* The whole point: never the entire watchlist at once. */
  ok('the watchlist is not fired at the proxies all at once',
     r.peak>0 && r.peak < r.watch, 'peak in flight '+r.peak+' of '+r.watch);
  ok('...but more than one at a time, so one slow symbol cannot block the rest',
     r.peak>1, 'peak '+r.peak);
  ok('every symbol still gets fetched', r.total>=r.watch, r.total+' requests for '+r.watch+' symbols');
  ok('no page errors', errs.length===0, errs.join(' | '));

  await p.close();await b.close();

  const src=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
  ok('the pool is bounded in the source, not just by luck', /var _q=watchlist\.slice\(\), POOL=3;/.test(src));
  ok('...and the old fire-everything call is gone',
     !/await Promise\.all\(watchlist\.map\(t=>fetchOne\(t,false\)/.test(src));

  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
