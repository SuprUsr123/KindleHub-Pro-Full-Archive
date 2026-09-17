const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url');
let pass=0,fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x!==undefined&&!c?'  -- '+String(x).slice(0,200):''));};
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await(await b.newContext({viewport:{width:600,height:800}})).newPage();
  await p.goto(url.pathToFileURL(path.resolve('index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:30000});
  const r=await p.evaluate(()=>{
    document.body.classList.add('simple-ui');
    const g=el=>{const c=getComputedStyle(el);return {sh:c.boxShadow,tr:c.transform};};
    const btn=document.querySelector('.header-controls .btn');
    const tab=document.querySelector('#mainNav .tab');
    const rest={btn:g(btn),tab:g(tab)};
    // :active can't be forced from JS, so read the RULE the stylesheet holds
    let found={hdr:false,nav:false,clip:true};
    for(const ss of document.styleSheets){
      let rules;try{rules=ss.cssRules;}catch(e){continue;}
      for(const rule of rules||[]){
        const t=rule.selectorText||'';
        if(/simple-ui .header-controls .btn:active/.test(t)&&/translate\(2px, ?2px\)/.test(rule.style.transform||''))found.hdr=true;
        /* The nav presses with an INSET shadow — it cannot use a drop shadow,
           see the regression note below. */
        if(/simple-ui #mainNav .tab:active/.test(t)&&/inset/.test(rule.style.boxShadow||''))found.nav=true;
      }
    }
    const nav=document.querySelector('#mainNav');
    const de=document.documentElement;
    /* html,body are overflow:hidden BY DESIGN — this is a fixed app shell and
       the content scrolls inside #app. So find the real scroller rather than
       asserting against the wrong element. */
    let scroller=null;
    document.querySelectorAll('#app *').forEach(function(e){
      if(scroller)return;
      const oy=getComputedStyle(e).overflowY;
      if((oy==='auto'||oy==='scroll')&&e.clientHeight>200)scroller=e;
    });
    /* make it genuinely overflow so "can it scroll" is a real question */
    let scrolled=false,tag='none';
    if(scroller){
      tag=(scroller.id||scroller.tagName).toLowerCase();
      const pad=document.createElement('div');
      pad.style.height='3000px';scroller.appendChild(pad);
      scroller.scrollTop=500;
      scrolled=scroller.scrollTop>0;
      scroller.scrollTop=0;pad.remove();
    }
    return {rest,found,
      navOverflow:getComputedStyle(nav).overflowX,
      navSW:nav.scrollWidth, navCW:nav.clientWidth,
      navReached:(function(){nav.scrollLeft=999;var v=nav.scrollLeft;nav.scrollLeft=0;return v;})(),
      navScrollable:(function(){
        if(nav.scrollWidth<=nav.clientWidth+1)return true;/* all tabs already fit */
        nav.scrollLeft=999;var moved=nav.scrollLeft>0;nav.scrollLeft=0;return moved;
      })(),
      sw:de.scrollWidth, cw:de.clientWidth,
      pageOverflow:de.scrollWidth>de.clientWidth+1,
      scroller:tag, canScroll:scrolled};
  });
  ok('header button carries a retro drop shadow', /2px/.test(r.rest.btn.sh)&&r.rest.btn.sh!=='none', r.rest.btn.sh);
  ok('nav tab carries one too',                   /2px/.test(r.rest.tab.sh)&&r.rest.tab.sh!=='none', r.rest.tab.sh);
  ok('header presses in on tap',                  r.found.hdr, JSON.stringify(r.found));
  ok('nav presses in on tap',                     r.found.nav, JSON.stringify(r.found));
  /* THE REGRESSION. nav is overflow-x:auto — a horizontally scrolling strip of
     ~40 tabs. Forcing overflow:visible on it to make room for a drop shadow
     laid the whole strip out at full width, blew the page out sideways and took
     the laptop scrollbar with it. The nav must keep scrolling, and the page
     must never scroll horizontally. */
  ok('the nav still scrolls sideways, not the page',
     /auto|scroll/.test(r.navOverflow), r.navOverflow);
  /* The real harm, measured directly. html,body are overflow:hidden, so a blown
     out nav is CLIPPED rather than reported as page overflow — which is why
     "does the page overflow" passes either way and is not the guard. What
     actually breaks is that overflow:visible removes the strip's ability to
     scroll, so every tab past the viewport becomes unreachable. */
  ok('tabs past the edge stay reachable',
     r.navScrollable, 'scrollWidth '+r.navSW+' clientWidth '+r.navCW+' reached '+r.navReached);
  ok('the content still scrolls vertically',
     r.canScroll, 'scroller='+r.scroller);
  /* html and body are overflow:hidden by design, so the bar on the right
     belongs to main. It measured a gutter of ZERO — an overlay bar reserving no
     width, so there was a track to look at but nothing to put a pointer on, and
     dragging it did nothing. A grabbable scrollbar has to occupy layout. */
  const bar=await p.evaluate(()=>{
    const out={};
    [false,true].forEach(function(retro){
      document.body.classList.toggle('simple-ui',retro);
      const m=document.querySelector('main');
      m.scrollTop=0;m.scrollTop=200;
      out[retro?'retro':'classic']={gutter:m.offsetWidth-m.clientWidth,
                                    moved:m.scrollTop>0};
      m.scrollTop=0;
    });
    document.body.classList.remove('simple-ui');
    return out;
  });
  ok('the scrollbar occupies width, so it can be dragged',
     bar.classic.gutter>=8&&bar.retro.gutter>=8, JSON.stringify(bar));
  ok('...in both looks, and still scrolls',
     bar.classic.moved&&bar.retro.moved, JSON.stringify(bar));
  await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
