/* Live-device reports:
     - "Failed to load this page. TypeError: BUILDERS[e] is not a function",
       and it came back on EVERY boot. The dashboard's Timer widget tapped
       through to a view id nobody ever wrote a builder for; showView stored it
       as currentView, so the dead view was restored on every later load. One
       bad tap bricked the app until localStorage was cleared.
     - The Passwords app (and sixteen others) never appeared on the KindleOS
       home screen after being installed — BUILTIN_APPS was a second, hand-kept
       list that had drifted from NAV_TABS.
     - Online multiplayer was behind a paid plan.
     - The assistant printed "TABLE: a|b END TABLE" instead of a table. */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url'),fs=require('fs');

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:600,height:800}});
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:20000});

  const r=await p.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const out={};const S=window._KH.S;
    S.onboardingDone=true;

    /* ── 1. an unknown view falls back to home instead of bricking ───────── */
    window.showView('timer');await sleep(400);
    out.unknownViewDoesNotBrick=(function(){var h=document.getElementById('mainHost');
      return !h||!/Failed to load this page/.test(h.textContent||'');})();
    out.unknownViewLandsOnHome=(window._KH.currentView?window._KH.currentView:null)==='home'
      ||!!document.getElementById('view-home');
    /* ...and it must not be left behind as the view to restore next boot. */
    out.deadViewNotRemembered=(function(){
      try{return (window._KH.currentView||'')!=='timer';}catch(e){return false;}
    })();

    /* The widget that caused it now points somewhere real. */
    S.dashWidgets=Object.assign(window._khDashDefaults(),{timer:true});
    window._khOpenDashboard();await sleep(600);
    out.dashboardOpens=!!document.getElementById('kh-dashboard');
    const dsh=document.getElementById('kh-dashboard');if(dsh)dsh.remove();

    /* ── 2. every installed page reaches the KindleOS home screen ────────── */
    /* The app list lives in the launcher's closure, so it has to be built. */
    try{window.launchKindleDesktop();}catch(e){}
    await sleep(1200);
    out.osCoverage=(function(){
      try{
        const navs=window._KH.NAV_TABS.map(t=>t[0])
          .filter(v=>v!=='home'&&v!=='settings'&&typeof window._KH.BUILDERS[v]==='function');
        const apps=window._khOsAllApps().map(a=>a.nav).filter(Boolean);
        const missing=navs.filter(v=>apps.indexOf(v)<0);
        return {missing:missing,count:apps.length};
      }catch(e){return {missing:['ERR:'+e],count:0};}
    })();
    out.everyPageOnTheHomeScreen=out.osCoverage.missing.length===0;
    out.passwordsAppPresent=out.osCoverage.missing.indexOf('passgen')<0;

    try{var _kd=document.getElementById('kd-root');if(_kd)_kd.remove();}catch(e){}
    /* ── 3. online multiplayer is free ───────────────────────────────────── */
    S.entitlement=null;                       /* a free account */
    let lobbyOpened=false;
    try{
      window.KH_MP.openLobby({gameName:'test',onConnected:function(){}});
      await sleep(300);
      lobbyOpened=!!document.getElementById('kh-mp-lobby');
      const lb=document.getElementById('kh-mp-lobby');if(lb)lb.remove();
    }catch(e){}
    out.freeAccountCanPlayOnline=lobbyOpened;
    out.noUpgradeSheet=!document.getElementById('kh-upgrade');

    /* ── 4. the assistant's tables render as tables ──────────────────────── */
    const tbl=(txt)=>{
      const t=window.renderTableBlock(txt);
      if(!t)return null;
      return Array.prototype.map.call(t.querySelectorAll('tr'),tr=>
        Array.prototype.map.call(tr.children,c=>c.textContent));
    };
    out.pipeWrapped=tbl('| A | B |\n| --- | --- |\n| 1 | 2 |');
    out.bareRows=tbl('A|B|C\n1|2|3');
    out.oneLine=tbl('hello|bye|test   1|2|3');
    out.keepsAllColumns=!!(out.bareRows&&out.bareRows[0]&&out.bareRows[0].length===3
                           &&out.bareRows[0][0]==='A'&&out.bareRows[0][2]==='C');
    out.oneLineSplitsRows=!!(out.oneLine&&out.oneLine.length===2&&out.oneLine[1][0]==='1');
    /* A plain markdown table with no markers gets wrapped for the renderer. */
    const wrapped=window._khWrapMdTables('here:\n| A | B |\n|---|---|\n| 1 | 2 |\ndone');
    out.markdownTableWrapped=/TABLE:/.test(wrapped)&&/END_TABLE/.test(wrapped);
    return out;
  });

  const src=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
  r.showViewGuardsMissingBuilder = /if\(typeof BUILDERS\[id\]!=='function'\)\{/.test(src);
  r.timerWidgetTargetsTools = !/crow\('timer',\(_tmr\.mode==='stopwatch'\?'Stopwatch':'Timer'\),'timer'\)/.test(src);
  r.plansNoLongerSellMultiplayer = src.indexOf("'Online multiplayer games'")<0;
  r.tableRegexIsLenient = /TABLE:\[ \\t\]\*\\n\?/.test(src);

  console.log(JSON.stringify(r,null,1));
  const ok = r.unknownViewDoesNotBrick&&r.unknownViewLandsOnHome&&r.deadViewNotRemembered&&
    r.dashboardOpens&&r.everyPageOnTheHomeScreen&&r.passwordsAppPresent&&
    r.freeAccountCanPlayOnline&&r.noUpgradeSheet&&
    r.keepsAllColumns&&r.oneLineSplitsRows&&r.markdownTableWrapped&&
    r.showViewGuardsMissingBuilder&&r.timerWidgetTargetsTools&&
    r.plansNoLongerSellMultiplayer&&r.tableRegexIsLenient&&
    errs.length===0;
  console.log(ok?'PASS: no boot-brick, every page on the OS home, free multiplayer, real tables':'FAIL');
  console.log('ERRORS:',errs.length?errs.slice(0,3):'none');
  await b.close();
  process.exit(ok?0:1);
})();
