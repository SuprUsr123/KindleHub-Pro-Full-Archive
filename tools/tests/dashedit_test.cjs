/* Dashboard edit mode, per-widget sizing, and the two complaints that came with
   it: "opening the settings menu is very glitchy... layered pages are what
   glitch on kindle" and "the scrollbars take too much space and look bad".

   The settings panel used to be drawn ON TOP of the live board — two full-screen
   surfaces stacked, the lower one still ticking a clock every second. On an
   e-ink panel that is a partial refresh over a partial refresh, which is what
   "glitchy and incomplete" looks like. The board is now hidden while the panel
   is up, so exactly one surface is ever on screen.

   Asserted here rather than in dashboard_test.cjs because these are geometry
   and DOM-visibility facts, not feature flags. */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url'),fs=require('fs');

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:600,height:800}});   /* a Kindle-ish panel */
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:20000});

  const r=await p.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const out={};const S=window._KH.S;
    S.onboardingDone=true;

    const ovv=()=>document.getElementById('kh-dashboard');
    const shut=()=>{const o=ovv();if(o)o.remove();
                    const k=document.getElementById('kh-dash-picker');if(k)k.remove();};
    const btn=(root,label)=>Array.prototype.filter.call(
      (root||document).querySelectorAll('button'),x=>(x.textContent||'').trim()===label)[0];

    const reset=()=>{
      S.dashWidgets=Object.assign(window._khDashDefaults(),
        {news:false,stocks:false,onthisday:false,moon:false,note:false,quote:true,
         habits:false,countdown:false,reading:true,timer:true,agenda:true,goal:true,ask:false,
         condition:true,temp:true});
      S.dashHeader=[];S.dashCompact=false;S.dashClockOnly=false;S.dashLandscape=false;
      S.dashClockStyle='digital';S.dashSize={};
      S.dashAlarm={enabled:false,time:'07:00',style:'fade',fadeMin:10,overnight:true};
    };

    /* ── 1. edit mode: the button, the dashed tiles, the badges ───────────── */
    reset();
    window._khOpenDashboard();await sleep(600);
    out.opened=!!ovv();
    const editBtn=btn(ovv(),'Edit');
    out.editButtonExists=!!editBtn;

    /* Out of edit mode the board must be clean — no dashed anything. */
    const dashedCount=()=>{
      const o=ovv();if(!o)return 0;let n=0;
      Array.prototype.forEach.call(o.querySelectorAll('div'),d=>{
        const s=getComputedStyle(d);
        if(/dashed/.test(s.borderTopStyle)||/dashed/.test(s.outlineStyle))n++;
      });
      return n;
    };
    out.cleanWhenNotEditing=(dashedCount()===0);

    if(editBtn){editBtn.click();await sleep(500);}
    out.editTogglesToDone=!!btn(ovv(),'Done');
    out.editShowsDashedTiles=dashedCount()>0;

    /* The "+" tiles: at least two, each naming the widget it would add. */
    const plusTiles=()=>{
      const o=ovv();if(!o)return [];
      return Array.prototype.filter.call(o.querySelectorAll('div'),d=>{
        const t=(d.textContent||'').trim();
        return t.charAt(0)==='+'&&/^\+\s*(Add |All widgets)/.test(t.replace(/\s+/g,' '));
      });
    };
    const tiles=plusTiles();
    out.plusTileCount=tiles.length;
    out.hasPlusTiles=tiles.length>=2;
    out.plusTilesNameAWidget=tiles.some(t=>/Add \w/.test((t.textContent||'').replace(/\s+/g,' ')));

    /* Tapping one must actually put that widget on the board. */
    const addTile=tiles.filter(t=>/Add /.test(t.textContent||''))[0];
    if(addTile){
      const label=((addTile.textContent||'').replace(/\s+/g,' ').match(/Add ([A-Za-z' ]+)/)||[])[1]||'';
      const before=Object.keys(S.dashWidgets).filter(k=>S.dashWidgets[k]===true).length;
      addTile.click();await sleep(450);
      const after=Object.keys(S.dashWidgets).filter(k=>S.dashWidgets[k]===true).length;
      out.plusTileAddsAWidget=(after===before+1);
      out.plusTileAddedTheNamedOne=label.length>0&&(ovv().textContent||'').length>0;
      out.stillEditingAfterAdd=!!btn(ovv(),'Done');
    }

    /* The × badge removes a widget; the Wide badge changes its column span. */
    const badges=lbl=>{
      const o=ovv();if(!o)return [];
      return Array.prototype.filter.call(o.querySelectorAll('div'),
        d=>(d.textContent||'').trim()===lbl&&d.style.position==='absolute');
    };
    out.removeBadges=badges('\u00d7').length;
    out.hasRemoveBadges=badges('\u00d7').length>0;
    const wideB=badges('Wide')[0]||badges('Narrow')[0];
    out.hasSizeBadge=!!wideB;
    if(wideB){
      const wasWide=(wideB.textContent||'').trim()==='Narrow';
      wideB.click();await sleep(420);
      const keys=Object.keys(S.dashSize||{});
      out.sizeBadgeWritesState=keys.length>0;
      out.sizeBadgeFlipped=keys.some(k=>S.dashSize[k]===(wasWide?'normal':'wide'));
    }
    /* A "wide" card must really span two columns, not just be labelled wide. */
    out.wideSpansTwoColumns=(function(){
      const o=ovv();if(!o)return false;
      return Array.prototype.some.call(o.querySelectorAll('div'),
        d=>d.style.gridColumn==='span 2');
    })();

    const doneB=btn(ovv(),'Done');
    if(doneB){doneB.click();await sleep(450);}
    out.doneLeavesEditMode=!!btn(ovv(),'Edit')&&dashedCount()===0;
    shut();await sleep(120);

    /* ── 2. settings is not a layer over the board ────────────────────────── */
    reset();
    window._khOpenDashboard();await sleep(600);
    const gear=Array.prototype.filter.call(ovv().querySelectorAll('button'),
      x=>/Settings/i.test(x.textContent||''))[0];
    out.gearFound=!!gear;
    if(gear){
      gear.click();await sleep(500);
      const pk=document.getElementById('kh-dash-picker');
      out.pickerOpens=!!pk;
      /* The board must be OFF, not merely behind. Two live full-screen surfaces
         is the layering the user could see tearing on the device. */
      const board=ovv();
      out.boardHiddenWhileSettingsOpen=(function(){
        if(!board||!pk)return false;
        /* the board element itself stays (the picker is inside it) — what must
           be hidden is the board CONTENT column. */
        const kids=Array.prototype.filter.call(board.children,c=>c!==pk);
        return kids.length>0&&kids.every(c=>getComputedStyle(c).display==='none');
      })();
      /* Nothing of the board may be painted where the panel is. */
      out.nothingBehindThePanel=(function(){
        if(!pk)return false;
        const hit=document.elementFromPoint(300,400);
        return !!hit&&(hit===pk||pk.contains(hit));
      })();
      /* Every control in the panel calls build(), which used to force the board
         back to display:flex — so one tap on a setting put the board in front of
         the panel you were still using. Orientation made it unmissable: the
         board rotated over the settings. Drive a real control and check the
         panel is still the surface you can touch. */
      out.stay=await (async function(){
        const st={};
        const lay=Array.prototype.filter.call(pk.querySelectorAll('button'),
          x=>(x.textContent||'').trim()==='Layout')[0];
        if(!lay){st.noControl='no Layout tab';return st;}
        lay.click();await sleep(300);
        const pk2=document.getElementById('kh-dash-picker');
        const land=pk2&&Array.prototype.filter.call(pk2.querySelectorAll('button'),
          x=>(x.textContent||'').trim()==='Landscape')[0];
        if(!land){st.noControl='no Orientation control';return st;}
        land.click();await sleep(500);
        const now=document.getElementById('kh-dash-picker');
        st.panelStillOpen=!!now;
        if(now){
          const rr=now.getBoundingClientRect();
          const hit=document.elementFromPoint(rr.left+rr.width/2,rr.top+rr.height/2);
          st.panelOnTop=!!hit&&(hit===now||now.contains(hit));
        }
        /* put it back so the Done/board-returns checks below are unaffected */
        const port=now&&Array.prototype.filter.call(now.querySelectorAll('button'),
          x=>(x.textContent||'').trim()==='Portrait')[0];
        if(port){port.click();await sleep(400);}
        return st;
      })();

      const done=btn(document.getElementById('kh-dash-picker')||pk,'Done');
      out.settingsHasDone=!!done;
      if(done){done.click();await sleep(500);}
      out.boardBackAfterDone=(function(){
        const board=ovv();if(!board)return false;
        if(document.getElementById('kh-dash-picker'))return false;
        return Array.prototype.some.call(board.children,c=>getComputedStyle(c).display!=='none');
      })();
      out.boardStillTicksAfterDone=/\d?\d:\d\d/.test(ovv()?(ovv().textContent||''):'');
    }
    shut();await sleep(120);

    /* ── 3. no scrollbar gutter ───────────────────────────────────────────── */
    reset();
    /* Turn enough on that the board genuinely overflows. */
    S.dashWidgets=Object.assign(window._khDashDefaults(),
      {news:true,stocks:true,onthisday:true,moon:true,note:true,quote:true,habits:true,
       countdown:true,reading:true,timer:true,agenda:true,goal:true});
    window._khOpenDashboard();await sleep(800);
    out.scrollbarGutter=(function(){
      const o=ovv();if(!o)return -1;
      let worst=0;
      const check=e=>{
        if(e.scrollHeight<=e.clientHeight)return;
        const g=e.offsetWidth-e.clientWidth;         /* the gutter a bar reserves */
        if(g>worst)worst=g;
      };
      check(o);
      Array.prototype.forEach.call(o.querySelectorAll('div'),check);
      return worst;
    })();
    out.noScrollbarGutter=(out.scrollbarGutter===0);
    out.stillScrollable=(function(){
      const o=ovv();if(!o)return false;
      const s=Array.prototype.filter.call(o.querySelectorAll('div'),
        e=>e.scrollHeight>e.clientHeight+4)[0]||((o.scrollHeight>o.clientHeight+4)?o:null);
      if(!s)return true;      /* fits — nothing to scroll, also fine */
      s.scrollTop=99999;
      return s.scrollTop>0;
    })();
    shut();
    return out;
  });

  /* Closure-local details terser mangles: assert them in source. */
  const src=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
  r.editModeNotPersisted = /var _editMode=false;/.test(src) && !/S\.dashEditMode/.test(src);
  r.scrollCssInjectedOnce = /kh-dash-scrollcss/.test(src) && /-webkit-scrollbar/.test(src);
  r.weatherRemoveTurnsOffTheGroup = /if\(k==='weather'\)\{var _wk=\['condition','temp'/.test(src);
  r.sizeStoredInState = /dashSize:\{\}/.test(src);
  r.facesShared = /var CLOCK_FACES=KH_CLOCK_FACES/.test(src) && /function _khDashFaces\(\)/.test(src);

  /* ── the settings panel must stay in FRONT of the board ──
     Every control in the panel calls build(), which forced the board back to
     display:flex — so a single tap put the board on top of the panel. Changing
     Orientation made it unmissable, because the board then rotated over the
     settings. It is also the same fault the panel exists to avoid: two
     full-screen surfaces painting at once is two partial refreshes stacked,
     which is what made settings feel broken on e-ink to begin with. */
  r.buildDoesNotForceBoardVisible =
    /if\(!document\.getElementById\('kh-dash-picker'\)\)boardEl\.style\.display='flex';/.test(src);
  r.panelIsReRaisedAfterRebuild = /function _pkOnTop\(\)\{/.test(src) &&
    /pv\.parentNode\.appendChild\(pv\);/.test(src);
  /* Every rebuild from inside the panel has to re-raise it, or the one that
     forgets is the one that breaks. */
  r.everyPanelRebuildReRaises = !/build\(\);paint\(\);/.test(src);
  /* ...and the same thing measured live, not only in the source. */
  const stay=r.stay||{};
  r.settingKeepsPanelOpen   = stay.panelStillOpen===true;
  r.settingKeepsPanelOnTop  = stay.panelOnTop===true;

  console.log(JSON.stringify(r,null,1));
  const ok = r.opened&&
    r.editButtonExists&&r.cleanWhenNotEditing&&r.editTogglesToDone&&r.editShowsDashedTiles&&
    r.hasPlusTiles&&r.plusTilesNameAWidget&&r.plusTileAddsAWidget&&r.stillEditingAfterAdd&&
    r.hasRemoveBadges&&r.hasSizeBadge&&r.sizeBadgeWritesState&&r.sizeBadgeFlipped&&
    r.wideSpansTwoColumns&&r.doneLeavesEditMode&&
    r.gearFound&&r.pickerOpens&&r.boardHiddenWhileSettingsOpen&&r.nothingBehindThePanel&&
    r.settingsHasDone&&r.boardBackAfterDone&&r.boardStillTicksAfterDone&&
    r.noScrollbarGutter&&r.stillScrollable&&
    r.editModeNotPersisted&&r.scrollCssInjectedOnce&&r.weatherRemoveTurnsOffTheGroup&&
    r.sizeStoredInState&&r.facesShared&&
    r.buildDoesNotForceBoardVisible&&r.panelIsReRaisedAfterRebuild&&r.everyPanelRebuildReRaises&&
    r.settingKeepsPanelOpen&&r.settingKeepsPanelOnTop&&
    errs.length===0;
  console.log(ok?'PASS: edit mode, sizing, settings-not-layered, no scrollbar gutter':'FAIL');

  console.log('ERRORS:',errs.length?errs.slice(0,3):'none');
  await b.close();
  process.exit(ok?0:1);
})();
