/* Dashboard: watch faces, the timer, header slots, the boxed/plain switch, the
   full-screen picker — and the data bugs that made three widgets permanently
   wrong (agenda read a field calendar events do not have, habits read a list
   that is not in S, countdown read `label` where the app writes `title`). */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url'),fs=require('fs');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:420,height:760}});
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:20000});

  const r=await p.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const out={};const S=window._KH.S;
    S.onboardingDone=true;
    const p2=n=>(n<10?'0':'')+n;
    const now0=new Date();
    const dk=now0.getFullYear()+'-'+p2(now0.getMonth()+1)+'-'+p2(now0.getDate());

    /* Seed each source in the shape the REAL app writes it. */
    S.books=[{title:'Dune',author:'Frank Herbert',pages:400,page:100,status:'reading'}];
    /* Calendar events: year / month (0-based) / day — there is no `date`. */
    const soon=new Date(Date.now()+2*86400000);
    S.calEvents=[{id:'e1',year:soon.getFullYear(),month:soon.getMonth(),day:soon.getDate(),time:'09:30',title:'Dentist'}];
    /* Habits live in localStorage, and the day-log is an object. */
    const hl={};hl[dk]=true;
    localStorage.setItem('kh_habits',JSON.stringify([{name:'Read',log:hl},{name:'Walk',log:{}}]));
    /* Countdowns carry `title`. */
    const cd=new Date(Date.now()+5*86400000);
    S.countdowns=[{id:'c1',title:'Holiday',date:cd.getFullYear()+'-'+p2(cd.getMonth()+1)+'-'+p2(cd.getDate())}];

    S.dashWidgets=Object.assign(window._khDashDefaults(),
      {agenda:true,habits:true,countdown:true,reading:true,moon:true,timer:true,date:true,clock:true,
       news:false,stocks:false,onthisday:false,ask:false,quote:false,note:false,goal:false,greeting:false,
       condition:false,temp:false,feels:false,wind:false,humidity:false,hilo:false,sun:false});
    S.dashHeader=[];S.dashCompact=false;S.dashClockOnly=false;S.dashCardStyle='boxed';
    S.dashClockStyle='digital';
    S.dashAlarm={enabled:false,time:'07:00',style:'fade',fadeMin:10,overnight:true};

    const open=()=>window._khOpenDashboard();
    const ovv=()=>document.getElementById('kh-dashboard');
    const shut=()=>{const o=ovv();if(o)o.remove();};
    const T=()=>{const o=ovv();return o?(o.textContent||''):'';};

    open();await sleep(700);
    out.opened=!!ovv();
    let t=T();

    /* ── the three data bugs ── */
    out.agendaFinds=/Dentist/.test(t)&&/09:30/.test(t);
    out.habitsCounts=/1 of 2 done/.test(t);
    out.countdownNamed=/days until Holiday/.test(t);
    out.noPlaceholderName=!/until your date/.test(t);
    out.readingOk=/Dune/.test(t)&&/25%/.test(t);
    /* Battery is gone for good — Kindle Silk has no Battery Status API. */
    out.noBattery=!/Battery/i.test(t);
    out.noBatteryInPicker=(function(){
      try{
        const gs=window._khDashGroups();
        for(const g of gs)for(const it of g.items)if(it.k==='battery')return false;
        return true;
      }catch(e){return false;}
    })();
    out.timerCard=/Timer/.test(t)&&/5:00/.test(t);
    out.noAstralEmoji=!/[\u{1F300}-\u{1FAFF}]/u.test(t);
    shut();await sleep(120);

    /* ── every watch face builds and draws something ── */
    out.faceResults={};
    const FACES=['digital','stack','flip','words','binary','seg','mono',
                 'classic','roman','minimal','bold','ring','swiss','arc'];
    for(const f of FACES){
      S.dashClockStyle=f;
      open();await sleep(340);
      const o=ovv();
      out.faceResults[f]={mounted:!!o,svg:o?o.querySelectorAll('svg').length:0};
      shut();await sleep(80);
    }
    out.allFacesMount=FACES.every(f=>out.faceResults[f].mounted);
    /* Every dial face must actually draw SVG, not fall back to digits. */
    out.dialsDrawSvg=['classic','roman','minimal','bold','ring','swiss','arc']
      .every(f=>out.faceResults[f].svg>0);
    /* The catalogue and the builder must agree — a face listed but not built
       would show as an empty clock, which is exactly what you cannot see from
       source. */
    out.faceCatalogueComplete=(function(){
      try{return window._khDashFaces().length===FACES.length;}catch(e){return false;}
    })();

    /* The word clock must spell a time rather than print digits. */
    S.dashClockStyle='words';open();await sleep(420);
    const wt=T();
    out.wordsSpellsTime=/(o’clock|past|to)/i.test(wt)&&
      /(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)/i.test(wt);
    shut();await sleep(80);

    /* ── clock-only screen ── */
    S.dashClockStyle='digital';S.dashClockOnly=true;
    open();await sleep(500);
    const ct=T();
    out.clockOnlyHidesWidgets=!/Dentist/.test(ct)&&!/Holiday/.test(ct)&&!/Dune/.test(ct);
    out.clockOnlyKeepsToolbar=/Show widgets/.test(ct);
    shut();await sleep(80);
    S.dashClockOnly=false;

    /* ── header slots ── a widget moved up sits beside the date, and leaves the
          grid so it is never drawn twice. */
    S.dashHeader=['countdown'];
    open();await sleep(500);
    const ht=T();
    out.headerShowsCountdown=/Holiday/.test(ht);
    out.countdownNotDuplicated=((ht.match(/Holiday/g)||[]).length===1);
    shut();await sleep(80);

    /* Date off + a widget in the header = "instead of the date". */
    S.dashWidgets.date=false;S.dashHeader=['reading'];
    open();await sleep(500);
    const rt=T();
    out.headerReplacesDate=!/Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/.test(rt)&&/Dune/.test(rt);
    shut();await sleep(80);
    S.dashWidgets.date=true;S.dashHeader=[];

    /* ── boxed vs plain ── */
    const cardBgCount=()=>{
      const o=ovv();if(!o)return 0;let n=0;
      Array.prototype.forEach.call(o.querySelectorAll('div'),d=>{
        const bs=(d.style&&d.style.background)||'';
        if(bs.indexOf('--card')>=0)n++;
      });
      return n;
    };
    S.dashCardStyle='boxed';open();await sleep(450);
    out.boxedCount=cardBgCount();shut();await sleep(80);
    S.dashCardStyle='plain';open();await sleep(450);
    out.plainCount=cardBgCount();shut();await sleep(80);
    out.plainDropsBoxes=(out.boxedCount>0&&out.plainCount<out.boxedCount);

    /* ── the picker is FULL SCREEN and tabbed (it used to be a 90vh sheet with
          one very long scroll) ── */
    S.dashCardStyle='boxed';
    open();await sleep(450);
    const gear=Array.prototype.filter.call(document.querySelectorAll('#kh-dashboard button'),
      x=>(x.textContent||'').trim()==='Settings')[0];
    out.gearFound=!!gear;
    if(gear){gear.click();await sleep(450);}
    const pk=document.getElementById('kh-dash-picker');
    out.pickerOpens=!!pk;
    if(pk){
      const rect=pk.getBoundingClientRect();
      out.pickerFullScreen=(rect.height>=window.innerHeight-2)&&(rect.top<=1);
      const ptxt=pk.textContent||'';
      out.pickerTabs=/Widgets/.test(ptxt)&&/Clock/.test(ptxt)&&/Layout/.test(ptxt);
      /* Widgets tab: tiles in a 2-across grid, so far less scrolling. */
      out.pickerUsesGrid=Array.prototype.filter.call(pk.querySelectorAll('div'),
        d=>(d.style&&/repeat\(\s*2\s*,\s*1fr\s*\)/.test(d.style.gridTemplateColumns||''))).length>0;
      const scroller=pk.querySelector('div[style*="overflow"]');
      out.pickerScreens=scroller?Math.round(scroller.scrollHeight/Math.max(1,scroller.clientHeight)*10)/10:null;
      out.headerOfferPresent=/Put in the header|Put weather in the header/.test(ptxt);

      const clickTab=async(name)=>{
        const bs=Array.prototype.filter.call(pk.querySelectorAll('button'),
          x=>(x.textContent||'').trim()===name);
        if(bs[0]){bs[0].click();await sleep(340);}
      };
      await clickTab('Clock');
      const p2t=pk.textContent||'';
      out.clockTabFaces=/Classic/.test(p2t)&&/Words/.test(p2t)&&/Binary/.test(p2t)&&/Roman/.test(p2t);
      out.clockTabPreviews=pk.querySelectorAll('svg').length>=4;
      /* Each tab must fit in roughly a screen or two, not the old long scroll. */
      const sc2=pk.querySelector('div[style*="overflow"]');
      out.clockTabScreens=sc2?Math.round(sc2.scrollHeight/Math.max(1,sc2.clientHeight)*10)/10:null;

      await clickTab('Layout');
      out.layoutTabNoBoxes=/No boxes/.test(pk.textContent||'');
      pk.remove();
    }
    shut();await sleep(100);

    /* ── the light alarm must fire for EVERY wake style. Flash and Slow flash
          have no fade, and the old window test measured against a target that
          was always in the future, so those two could never go off. ── */
    out.alarmStyles={};
    for(const sty of ['fade','flash','flashslow']){
      const past=new Date(Date.now()-60000);
      S.dashAlarm={enabled:true,time:p2(past.getHours())+':'+p2(past.getMinutes()),style:sty,fadeMin:10,overnight:true};
      open();await sleep(1500);
      out.alarmStyles[sty]=!!document.getElementById('kh-dash-alarm');
      const av=document.getElementById('kh-dash-alarm');if(av)av.remove();
      shut();await sleep(150);
    }
    out.allStylesFire=['fade','flash','flashslow'].every(k=>out.alarmStyles[k]);
    S.dashAlarm={enabled:false,time:'07:00',style:'fade',fadeMin:10,overnight:true};

    /* ── LAYOUT: nothing may be silently cut off, and the settings panel must
          not be rotated twice in landscape (it is a child of the board, which
          already carries the rotation). ── */
    S.dashWidgets=Object.assign(window._khDashDefaults(),{});
    Object.keys(S.dashWidgets).forEach(k=>{S.dashWidgets[k]=true;});
    S.dashHeader=[];S.dashCompact=false;S.dashClockOnly=false;S.dashCardStyle='boxed';
    const layout=()=>{
      const o=ovv();if(!o)return null;
      let clipped=0,scroller=null;
      o.querySelectorAll('div').forEach(d=>{
        const cs=getComputedStyle(d);
        if((cs.overflowY==='hidden'||cs.overflow==='hidden')&&d.scrollHeight-d.clientHeight>6&&d.clientHeight>0)clipped++;
        if((cs.overflowY==='auto'||cs.overflowY==='scroll')&&d.scrollHeight>d.clientHeight+4&&!scroller)scroller=d;
      });
      let reach=null;
      if(scroller){
        scroller.scrollTop=scroller.scrollHeight;
        const last=scroller.lastElementChild;
        if(last)reach=(last.getBoundingClientRect().bottom<=scroller.getBoundingClientRect().bottom+6);
        scroller.scrollTop=0;
      }
      return {clipped,hasScroller:!!scroller,reach};
    };
    S.dashLandscape=false;open();await sleep(800);
    let L=layout();
    out.portraitNothingClipped=(L&&L.clipped===0);
    out.portraitScrollsToTheEnd=(L&&L.hasScroller&&L.reach===true);
    shut();await sleep(120);
    S.dashLandscape=true;open();await sleep(800);
    L=layout();
    out.landscapeNothingClipped=(L&&L.clipped===0);
    out.landscapeScrollsToTheEnd=(L&&L.hasScroller&&L.reach===true);
    /* The settings panel, opened while the board is rotated. */
    const gear2=Array.prototype.filter.call(document.querySelectorAll('#kh-dashboard button'),
      x=>(x.textContent||'').trim()==='Settings')[0];
    if(gear2){gear2.click();await sleep(450);}
    const pk2=document.getElementById('kh-dash-picker');
    if(pk2){
      const pr=pk2.getBoundingClientRect(),br=ovv().getBoundingClientRect();
      out.pickerNotDoubleRotated=(getComputedStyle(pk2).transform==='none');
      out.pickerFillsBoardInLandscape=(Math.abs(pr.x-br.x)<4&&Math.abs(pr.y-br.y)<4&&
        Math.abs(pr.width-br.width)<4&&Math.abs(pr.height-br.height)<4);
      /* Done must be drawn ON the board, not off the edge of it. A hit-test
         here is unreliable — earlier panels in the same page can still be
         fading — so assert the geometry, which is what actually broke. */
      const dn=Array.prototype.filter.call(pk2.querySelectorAll('button'),x=>(x.textContent||'').trim()==='Done')[0];
      out.pickerDoneOnScreen=(function(){
        if(!dn)return false;
        const r=dn.getBoundingClientRect();
        if(!r.width||!r.height)return false;
        return r.x>=br.x-2&&r.y>=br.y-2&&r.right<=br.right+2&&r.bottom<=br.bottom+2;
      })();
      pk2.remove();
    }
    shut();await sleep(120);
    S.dashLandscape=false;
    /* A normal set of widgets must still fit one screen — no scrollbar. */
    S.dashWidgets=Object.assign(window._khDashDefaults(),
      {news:false,stocks:false,onthisday:false,moon:false,note:false,quote:false,
       habits:false,countdown:false,reading:false,timer:false,ask:false});
    open();await sleep(700);
    L=layout();
    out.normalSetStillFitsOneScreen=(L&&L.clipped===0&&L.hasScroller===false);
    shut();await sleep(120);

    /* ── timer actually counts down ── */
    S.dashWidgets.timer=true;S.dashHeader=[];
    open();await sleep(450);
    const start=Array.prototype.filter.call(document.querySelectorAll('#kh-dashboard button'),
      x=>(x.textContent||'').trim()==='Start')[0];
    out.timerStartBtn=!!start;
    if(start){
      start.click();
      await sleep(2500);
      /* 5:00 preset, ~2s elapsed -> reads 4:5x, never still 5:00. */
      out.timerCountsDown=/4:5\d/.test(T());
    }
    shut();
    return out;
  });

  /* Fixes that live in closures terser mangles have to be asserted in SOURCE. */
  const src=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
  r.alarmFixInSource = src.indexOf('_alarmTsOn')>=0 && /for\(var dd=-1;dd<=1;dd\+\+\)/.test(src);
  r.visListenerRemoved = /removeEventListener\('visibilitychange',_onVis\)/.test(src);
  r.batteryGoneFromSource = src.indexOf('getBattery')<0 && src.indexOf('batteryCard')<0;

  console.log(JSON.stringify(r,null,1));
  const ok=r.opened&&
    r.agendaFinds&&r.habitsCounts&&r.countdownNamed&&r.noPlaceholderName&&r.readingOk&&
    r.noBattery&&r.noBatteryInPicker&&r.batteryGoneFromSource&&
    r.timerCard&&r.noAstralEmoji&&
    r.allFacesMount&&r.dialsDrawSvg&&r.wordsSpellsTime&&
    r.clockOnlyHidesWidgets&&r.clockOnlyKeepsToolbar&&
    r.headerShowsCountdown&&r.countdownNotDuplicated&&r.headerReplacesDate&&
    r.plainDropsBoxes&&
    r.gearFound&&r.pickerOpens&&r.pickerFullScreen&&r.pickerTabs&&r.pickerUsesGrid&&
    r.headerOfferPresent&&r.clockTabFaces&&r.clockTabPreviews&&r.layoutTabNoBoxes&&
    r.allStylesFire&&r.alarmFixInSource&&r.visListenerRemoved&&
    r.portraitNothingClipped&&r.portraitScrollsToTheEnd&&
    r.landscapeNothingClipped&&r.landscapeScrollsToTheEnd&&
    r.pickerNotDoubleRotated&&r.pickerFillsBoardInLandscape&&r.pickerDoneOnScreen&&
    r.normalSetStillFitsOneScreen&&
    r.timerStartBtn&&r.timerCountsDown&&
    errs.length===0;
  console.log(ok?'PASS: faces, timer, header slots, plain style, full-screen picker, alarm styles':'FAIL');
  console.log('ERRORS:',errs.length?errs.slice(0,3):'none');
  await b.close();
  process.exit(ok?0:1);
})();
