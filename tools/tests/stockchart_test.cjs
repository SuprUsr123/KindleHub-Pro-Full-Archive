/* Stocks upgrade: ranges on the chart, a portfolio that works in any currency,
   and a way to find a company without already knowing its symbol.

   The portfolio one is a real bug rather than a missing feature. The summary
   filtered to currency==='USD' and then required two of them, so somebody
   holding only London tickers — priced in GBp — had holdings entered, values
   computed, and NO summary at all, with nothing on screen saying why.

   Network is stubbed. These are Yahoo endpoints behind three CORS proxies;
   letting the test hit them would make it fail on Yahoo's bad days and prove
   nothing about this code. What matters here is the URL asked for, the parsing,
   and what ends up on screen.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tools/tests/stockchart_test.cjs */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url');

let pass=0,fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x!==undefined&&!c?'  -- '+String(x).slice(0,260):''));};

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:600,height:800}});
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));

  /* Intercept before load so nothing ever leaves. */
  const asked=[];
  await p.route('**/*',route=>{
    const u=route.request().url();
    if(/finance\.yahoo\.com|codetabs|allorigins|corsproxy|stooq/.test(u)){
      asked.push(u);
      if(/finance%2Fsearch|finance\/search/.test(u)){
        return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({quotes:[
          {symbol:'MKS.L',shortname:'Marks and Spencer Group plc',exchDisp:'LSE',quoteType:'EQUITY'},
          {symbol:'MAKSF',shortname:'Marks and Spencer Group plc',exchDisp:'Other OTC',quoteType:'EQUITY'},
          {symbol:'MKS240119C00001000',shortname:'an option contract',exchDisp:'OPR',quoteType:'OPTION'}
        ]})});
      }
      if(/chart/.test(u)){
        /* A gap in the middle: Yahoo pads non-trading slots with null, and an
           unguarded chart turns that into a line down to zero. */
        return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({chart:{result:[{
          timestamp:[1,2,3,4,5,6],
          indicators:{quote:[{close:[100,null,110,120,null,130]}]}
        }]}})});
      }
      return route.fulfill({status:500,body:'nope'});
    }
    return route.continue();
  });

  await p.goto(url.pathToFileURL(path.resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:20000});

  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  async function openStocks(){
    await p.evaluate(()=>{try{delete VIEWS.stocks;}catch(_){}try{showView('stocks');}catch(_){}});
    await sleep(1100);
  }

  /* ── the portfolio bug: a London-only holder ── */
  await p.evaluate(()=>{
    localStorage.setItem('kh_stocks',JSON.stringify(['MKS.L','BP.L']));
    localStorage.setItem('kh_stocks_hold',JSON.stringify({'MKS.L':{shares:100,avgCost:300},'BP.L':{shares:50,avgCost:400}}));
    localStorage.setItem('kh_stocks_cache',JSON.stringify({
      'MKS.L':{price:350,prev:340,currency:'GBp',name:'Marks and Spencer',spark:[330,335,340,345,350],ts:Date.now()},
      'BP.L': {price:420,prev:425,currency:'GBp',name:'BP plc',spark:[430,428,425,422,420],ts:Date.now()}
    }));
  });
  await openStocks();
  let t=await p.evaluate(()=>document.getElementById('mainHost').textContent||'');

  console.log('\n── a London-only portfolio is no longer invisible ──');
  ok('the summary appears at all',            /Portfolio/.test(t), t.slice(0,240));
  ok('...priced in pounds, not dollars',      t.indexOf('£')>=0 && t.indexOf('$')<0, t.slice(0,240));
  ok('...with today\'s move on the holding',  /today/.test(t), t.slice(0,240));
  ok('...and the all-time gain',              /all time/.test(t), t.slice(0,240));
  /* 100 sh at 350p = £350, 50 at 420p = £210 -> £560 */
  ok('the total is right',                    /560/.test(t), t.slice(0,320));

  /* ── mixed currencies are not silently added together ── */
  await p.evaluate(()=>{
    localStorage.setItem('kh_stocks',JSON.stringify(['MKS.L','AAPL']));
    localStorage.setItem('kh_stocks_hold',JSON.stringify({'MKS.L':{shares:100,avgCost:300},'AAPL':{shares:10,avgCost:150}}));
    localStorage.setItem('kh_stocks_cache',JSON.stringify({
      'MKS.L':{price:350,prev:340,currency:'GBp',name:'M and S',spark:[340,350],ts:Date.now()},
      'AAPL': {price:200,prev:198,currency:'USD',name:'Apple',spark:[198,200],ts:Date.now()}
    }));
  });
  await openStocks();
  t=await p.evaluate(()=>document.getElementById('mainHost').textContent||'');
  console.log('\n── two currencies stay two numbers ──');
  ok('each currency gets its own line',       /GBp/.test(t)&&/USD/.test(t), t.slice(0,320));
  ok('both totals are shown',                 t.indexOf('£')>=0 && t.indexOf('$')>=0, t.slice(0,320));

  /* ── chart ranges ── */
  await p.evaluate(()=>{
    localStorage.setItem('kh_stocks',JSON.stringify(['AAPL']));
    localStorage.setItem('kh_stocks_hold',JSON.stringify({}));
    localStorage.setItem('kh_stocks_cache',JSON.stringify({
      'AAPL':{price:200,prev:198,currency:'USD',name:'Apple',open:199,high:201,low:197,vol:1000,spark:[190,192,196,198,200],ts:Date.now()}
    }));
  });
  await openStocks();
  const chartsBefore=asked.filter(u=>/chart/.test(u)).length;
  await p.evaluate(()=>{
    const rows=[].slice.call(document.querySelectorAll('#stock-grid > *'));
    if(rows[0])rows[0].click();
  });
  await sleep(800);
  let d=await p.evaluate(()=>{
    const h=document.getElementById('mainHost');
    return {text:h.textContent||'',buttons:[].slice.call(h.querySelectorAll('button')).map(e=>(e.textContent||'').trim())};
  });
  console.log('\n── the chart is no longer stuck on five days ──');
  ok('the detail view opened',                /Back to Watchlist/.test(d.text), d.text.slice(0,160));
  ok('every range is offered',                ['5D','1M','3M','6M','1Y','5Y','Max'].every(r=>d.buttons.indexOf(r)>=0), JSON.stringify(d.buttons.slice(0,22)));
  ok('it opens on the data already in memory, with no request',
     /5-DAY CHART/.test(d.text) && asked.filter(u=>/chart/.test(u)).length===chartsBefore,
     'charts before '+chartsBefore+' now '+asked.filter(u=>/chart/.test(u)).length);
  ok('...and states the change over that period, which is the point of a range',
     /% over 5D/.test(d.text), d.text.slice(0,420));

  const before=asked.length;
  await p.evaluate(()=>{
    const bs=[].slice.call(document.querySelectorAll('#mainHost button'));
    for(const x of bs){if((x.textContent||'').trim()==='1Y'){x.click();return;}}
  });
  await sleep(1600);
  d=await p.evaluate(()=>({text:document.getElementById('mainHost').textContent||''}));
  console.log('\n── picking a longer range ──');
  ok('it goes and fetches one',               asked.length>before, 'before '+before+' after '+asked.length);
  ok('...asking for a whole year',            asked.some(u=>/range%3D1y|range=1y/.test(u)), asked.slice(-2).join(' | ').slice(0,200));
  ok('...at a weekly interval, so a Kindle is not drawing 250 points',
     asked.some(u=>/interval%3D1wk|interval=1wk/.test(u)), asked.slice(-2).join(' | ').slice(0,200));
  ok('the heading follows the choice',        /1Y CHART/.test(d.text), d.text.slice(0,320));
  ok('gaps are dropped, not drawn as a fall to zero — 4 of 6 points survive',
     /4 points/.test(d.text), d.text.slice(0,420));
  ok('...and the period change is recomputed for it', /% over 1Y/.test(d.text), d.text.slice(0,420));

  /* ── company search ── */
  await p.evaluate(()=>{
    const bs=[].slice.call(document.querySelectorAll('#mainHost button'));
    for(const x of bs){if((x.textContent||'').trim()==='Back to Watchlist'){x.click();return;}}
  });
  await sleep(600);
  await p.evaluate(()=>{
    const bs=[].slice.call(document.querySelectorAll('#mainHost button'));
    /* The tab reads "Quick Add" on screen even though the code calls it
       'browse' — matching the internal name here found nothing. */
    for(const x of bs){if(/^Quick Add$/i.test((x.textContent||'').trim())){x.click();return;}}
  });
  await sleep(800);
  const hasSearch=await p.evaluate(()=>/FIND A COMPANY/.test(document.getElementById('mainHost').textContent||''));
  console.log('\n── finding a company ──');
  ok('the Browse tab offers a search', hasSearch);

  if(hasSearch){
    await p.evaluate(()=>{
      const inp=[].slice.call(document.querySelectorAll('#mainHost input')).filter(i=>/Company name/i.test(i.placeholder||''))[0];
      if(inp)inp.value='marks and spencer';
      const bs=[].slice.call(document.querySelectorAll('#mainHost button'));
      for(const x of bs){if((x.textContent||'').trim()==='Search'){x.click();return;}}
    });
    await sleep(1800);
    const s=await p.evaluate(()=>({text:document.getElementById('mainHost').textContent||''}));
    ok('a company name finds its symbol',     /MKS\.L/.test(s.text), s.text.slice(0,320));
    ok('...with the exchange, so two listings can be told apart', /LSE/.test(s.text), s.text.slice(0,320));
    ok('option contracts are filtered out — they cannot be tracked here',
       !/MKS240119C/.test(s.text), s.text.slice(0,320));

    const added=await p.evaluate(async()=>{
      const rows=[].slice.call(document.querySelectorAll('#mainHost button'));
      for(const x of rows){if((x.textContent||'').trim()==='Add'){x.click();break;}}
      await new Promise(r=>setTimeout(r,500));
      try{return JSON.parse(localStorage.getItem('kh_stocks')||'[]');}catch(_){return[];}
    });
    ok('...and Add really puts it on the watchlist', added.indexOf('MKS.L')>=0, JSON.stringify(added));
  }

  ok('no page errors', errs.length===0, errs.slice(0,3).join(' | '));
  await p.close();await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
