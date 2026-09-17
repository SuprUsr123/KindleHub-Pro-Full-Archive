/* Tier-gated AI output: the free plan gets the answer as text, paid plans get
   it drawn.

   The rule that actually matters is not "paid users see more" — it is that
   NOBODY is ever shown raw markup. A reader whose plan cannot draw a chart must
   see the numbers, not the word CHART: and a wall of lines. Locked should look
   deliberate; the screenshot that started this showed a table printed as
   TABLE: / END_TABLE with pipes, which just looks broken.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tools/tests/airich_test.cjs */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url');

let pass=0,fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x!==undefined&&!c?'  -- '+String(x).slice(0,260):''));};

const TABLE=`Here you go:
TABLE:
| Category | Example | Description |
| -------- | ------- | ----------- |
| Fruit | Apple | Crisp and sweet |
| Planet | Mars | The red planet |
END_TABLE
That is the list.`;
const CHART=`Breakdown:
CHART: pie
Reading: 40
Games: 35
Chat: 25
END_CHART
Done.`;

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:600,height:800}});
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:20000});

  /* addBotMsg writes into #chatLog, which only exists once the Assistant view
     is mounted — without this every render assertion reads an empty string and
     "passes" the negative checks for the wrong reason. */
  await p.evaluate(()=>{try{showView('chat');}catch(_){}});
  await p.waitForFunction(()=>!!document.getElementById('chatLog'),null,{timeout:15000})
    .catch(async()=>{ await p.evaluate(()=>{try{showView('assistant');}catch(_){}}); });
  const haveLog=await p.evaluate(()=>!!document.getElementById('chatLog'));
  ok('the assistant view is mounted, so renders are really observed', haveLog);

  const r=await p.evaluate(async(payloads)=>{
    const out={};
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    /* Force a plan, render one bot message, read back what the reader sees. */
    async function asPlan(plan,text){
      window._khPlan=function(){return plan;};
      const log=document.getElementById('chatLog');
      if(log)log.innerHTML='';
      addBotMsg(text,false);
      await sleep(120);
      const l=document.getElementById('chatLog');
      return {txt:(l&&l.innerText)||'', html:(l&&l.innerHTML)||''};
    }
    const origPlan=window._khPlan;

    /* ── free: text, and no markup ── */
    let v=await asPlan('free',payloads.TABLE);
    out.freeNoMarkers=!/TABLE:|END_TABLE/.test(v.txt);
    out.freeNoTableEl=!/<table/i.test(v.html);
    out.freeKeepsContent=/Apple/.test(v.txt)&&/Mars/.test(v.txt);
    out.freeText=v.txt.slice(0,160);

    v=await asPlan('free',payloads.CHART);
    out.freeNoChartMarkers=!/CHART:|END_CHART/.test(v.txt);
    out.freeNoSvg=!/<svg/i.test(v.html);
    out.freeKeepsNumbers=/40/.test(v.txt)&&/Reading/.test(v.txt);

    /* ── plus: tables render, charts do not ── */
    v=await asPlan('plus',payloads.TABLE);
    out.plusTable=/<table/i.test(v.html);
    v=await asPlan('plus',payloads.CHART);
    out.plusNoChart=!/<svg/i.test(v.html);
    out.plusChartNoMarkup=!/CHART:|END_CHART/.test(v.txt);

    /* ── pro: both ── */
    v=await asPlan('pro',payloads.TABLE);
    out.proTable=/<table/i.test(v.html);
    v=await asPlan('pro',payloads.CHART);
    out.proChart=/<svg/i.test(v.html);
    out.proChartPercent=/40%|40 \(40%\)/.test(v.txt)||/%/.test(v.txt);
    out.proChartLabels=/Reading/.test(v.txt)&&/Games/.test(v.txt);

    /* ── max: everything ── */
    v=await asPlan('max',payloads.CHART);
    out.maxChart=/<svg/i.test(v.html);

    /* the entitlement helper itself */
    out.gate={
      free:['table','chart','quiz','image'].filter(f=>window._khAiRich&&(window._khPlan=function(){return 'free';})&&window._khAiRich(f)),
    };
    window._khPlan=function(){return 'plus';}; out.plusFeats=['table','chart','quiz','image'].filter(f=>window._khAiRich(f));
    window._khPlan=function(){return 'pro';};  out.proFeats =['table','chart','quiz','image'].filter(f=>window._khAiRich(f));
    window._khPlan=function(){return 'max';};  out.maxFeats =['table','chart','quiz','image'].filter(f=>window._khAiRich(f));
    window._khPlan=origPlan;

    /* a pie chart's arcs: a slice over half the circle needs the large-arc flag
       or the path silently draws the small side and the chart is simply wrong */
    const big=window._khRenderChart('pie\nMost: 90\nRest: 10');
    out.largeArc=/A54,54 0 1,1/.test(big?big.innerHTML:'');
    /* junk in, nothing out — never a half-drawn chart */
    out.chartJunk=window._khRenderChart('pie\nnot a number\n')===null;
    out.chartNegative=window._khRenderChart('pie\nA: -5\nB: -2')===null;
    return out;
  },{TABLE,CHART});

  console.log('\n── free: the answer, never the markup ──');
  ok('a table shows no TABLE:/END_TABLE markers', r.freeNoMarkers, r.freeText);
  ok('...and is not drawn as a table element',    r.freeNoTableEl);
  ok('...but every cell is still there',          r.freeKeepsContent, r.freeText);
  ok('a chart shows no CHART:/END_CHART markers', r.freeNoChartMarkers);
  ok('...and is not drawn',                       r.freeNoSvg);
  ok('...but the numbers still arrive',           r.freeKeepsNumbers);

  console.log('\n── the ladder ──');
  ok('+ draws tables',                            r.plusTable);
  ok('...but not charts',                         r.plusNoChart);
  ok('...and still shows no chart markup',        r.plusChartNoMarkup);
  ok('Pro draws tables',                          r.proTable);
  ok('...and charts',                             r.proChart);
  ok('...with labels',                            r.proChartLabels);
  ok('...and percentages, since e-ink has no colour to tell slices apart', r.proChartPercent);
  ok('Max draws charts too',                      r.maxChart);

  console.log('\n── the entitlement table ──');
  ok('+ gets tables only',        JSON.stringify(r.plusFeats)==='["table"]', JSON.stringify(r.plusFeats));
  ok('Pro adds charts and quizzes',JSON.stringify(r.proFeats)==='["table","chart","quiz"]', JSON.stringify(r.proFeats));
  ok('Max adds images',           JSON.stringify(r.maxFeats)==='["table","chart","quiz","image"]', JSON.stringify(r.maxFeats));

  console.log('\n── the chart maths ──');
  ok('a slice over half the circle sets the large-arc flag', r.largeArc);
  ok('unparseable input draws nothing rather than a broken chart', r.chartJunk);
  ok('...and so does all-negative input', r.chartNegative);

  ok('no page errors', errs.length===0, errs.slice(0,3).join(' | '));
  await p.close();await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
