/* The dashboard round: layout control, a toolbar you can put away, a
   weather-only board, and the LAN Remote.

   The Remote is the part worth testing hard, and not for the reason you would
   guess. The mechanism is trivial — HTTP to an address on your own network.
   What is NOT trivial is that a page served over https CANNOT make requests to
   a plain http address. Browsers block it as mixed content, and no fetch option
   gets around it. So the failure this feature invites is a control pad that
   looks perfect and does nothing, on a device the user is standing next to.
   Every assertion below is about the app KNOWING which case it is in and saying
   so, rather than about a request succeeding.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tools/tests/dashremote_test.cjs */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url'),fs=require('fs');

let pass=0,fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x!==undefined&&!c?'  -- '+String(x).slice(0,240):''));};

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await(await b.newContext({viewport:{width:600,height:800}})).newPage();
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:30000});

  console.log('── the buttons can be put away ──');
  await p.evaluate(()=>{S.dashChrome='';S.dashClockOnly=false;S.dashWeatherOnly=false;S.dashCols=0;_khOpenDashboard();});
  await p.waitForTimeout(400);
  const shown=await p.evaluate(()=>{
    const bs=[].slice.call(document.querySelectorAll('#kh-dashboard button')).map(x=>x.textContent.trim());
    return {n:bs.length,has:bs.indexOf('Hide buttons')>=0,list:bs.slice(0,12)};
  });
  ok('the toolbar is there to begin with', shown.has, JSON.stringify(shown));

  const hidden=await p.evaluate(()=>{
    [].slice.call(document.querySelectorAll('#kh-dashboard button')).forEach(x=>{if(x.textContent.trim()==='Hide buttons')x.click();});
    const bs=[].slice.call(document.querySelectorAll('#kh-dashboard button')).map(x=>x.textContent.trim());
    return {list:bs.slice(0,6), menu:bs.indexOf('Menu')>=0, torch:bs.indexOf('Torch')>=0, saved:S.dashChrome};
  });
  ok('Hide buttons really removes them', hidden.torch===false, JSON.stringify(hidden));
  ok('...but never leaves you stranded — one Menu remains', hidden.menu===true, JSON.stringify(hidden));
  ok('...and the choice is remembered', hidden.saved==='hidden');

  const back=await p.evaluate(()=>{
    [].slice.call(document.querySelectorAll('#kh-dashboard button')).forEach(x=>{if(x.textContent.trim()==='Menu')x.click();});
    return [].slice.call(document.querySelectorAll('#kh-dashboard button')).map(x=>x.textContent.trim()).indexOf('Torch')>=0;
  });
  ok('Menu brings the toolbar back', back===true);

  console.log('\n── weather only ──');
  const wx=await p.evaluate(()=>{
    S.dashChrome='';S.dashWeatherOnly=true;S.dashClockOnly=false;
    S.dashWidgets=S.dashWidgets||{};S.dashWidgets.quote=true;S.dashWidgets.news=true;
    _khOpenDashboard();
    const t=document.getElementById('kh-dashboard').textContent||'';
    return {hasQuote:/Quote/.test(t), weatherOnlyBtn:/Show widgets/.test(t)};
  });
  ok('weather only drops the other cards', wx.hasQuote===false, JSON.stringify(wx));
  ok('...and the toolbar offers the way back', wx.weatherOnlyBtn===true, JSON.stringify(wx));

  const excl=await p.evaluate(()=>{
    /* the picker writes both, so it can never leave both true */
    S.dashClockOnly=true;S.dashWeatherOnly=true;
    _khOpenDashboard();
    const t=document.getElementById('kh-dashboard').textContent||'';
    return {clockWins:!/Quote/.test(t)};
  });
  ok('with both set, clock only wins rather than producing a blank board', excl.clockWins);

  console.log('\n── columns ──');
  const cols=await p.evaluate(()=>{
    S.dashWeatherOnly=false;S.dashClockOnly=false;
    const read=()=>{const g=document.querySelector('#kh-dashboard div[style*="grid-template-columns"]');
      return g?g.style.gridTemplateColumns:'';};
    S.dashCols=1;_khOpenDashboard();const one=read();
    S.dashCols=2;_khOpenDashboard();const two=read();
    S.dashCols=0;_khOpenDashboard();const auto=read();
    return {one,two,auto};
  });
  ok('one column really is one', /repeat\(1,/.test(cols.one), JSON.stringify(cols));
  ok('two columns really is two', /repeat\(2,/.test(cols.two), JSON.stringify(cols));
  ok('automatic still behaves as before', /repeat\(\d,/.test(cols.auto), JSON.stringify(cols));

  console.log('\n── the Remote ──');
  const setup=await p.evaluate(()=>{
    S.dashCols=0;
    S.dashRemote={music:'192.168.1.20:8080', pc:'192.168.1.20:8765'};
    S.dashWidgets=S.dashWidgets||{}; S.dashWidgets.remote=true;
    _khOpenDashboard();
    const t=document.getElementById('kh-dashboard').textContent||'';
    return {card:/MUSIC/.test(t)&&/COMPUTER/.test(t), play:/Play/.test(t), open:/Open control/.test(t)};
  });
  ok('the Remote card renders both halves', setup.card, JSON.stringify(setup));
  ok('...with transport buttons', setup.play, JSON.stringify(setup));
  ok('...and a way into the computer', setup.open, JSON.stringify(setup));

  const noAddr=await p.evaluate(()=>{
    S.dashRemote={};_khOpenDashboard();
    return /Set it up/.test(document.getElementById('kh-dashboard').textContent||'');
  });
  ok('with no address it invites you to set one, not an empty box', noAddr===true);

  const saveFlow=await p.evaluate(()=>{
    /* the card has to be ON for its own "Set it up" button to exist; what we
       are proving is that SAVING switches it on for someone who reached the
       sheet another way, so clear only the address */
    S.dashWidgets.remote=true;S.dashRemote={};
    _khOpenDashboard();
    S.dashWidgets.remote=false;
    /* through the button, not the closure-scoped function — the helper is not
       reachable from the page, and reaching for it would be testing something
       the reader can never do */
    [].slice.call(document.querySelectorAll('#kh-dashboard button')).forEach(x=>{if(x.textContent.trim()==='Set it up')x.click();});
    const ins=[].slice.call(document.querySelectorAll('input[placeholder*="192.168"]'));
    if(ins.length<2)return {err:'fields missing',n:ins.length};
    ins[0].value='192.168.1.50:8080';
    [].slice.call(document.querySelectorAll('button')).forEach(x=>{if(x.textContent.trim()==='Save')x.click();});
    return {music:(S.dashRemote||{}).music, turnedOn:S.dashWidgets.remote===true};
  });
  ok('saving an address stores it', saveFlow.music==='192.168.1.50:8080', JSON.stringify(saveFlow));
  ok('...and switches the widget on, rather than hiding it behind another setting',
     saveFlow.turnedOn===true, JSON.stringify(saveFlow));

  console.log('\n── the https/http rule, which is what actually breaks this ──');
  const src=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
  ok('reachability is decided by the PAGE\'s scheme, both directions',
     /function _remoteReachable\(url\)[\s\S]{0,320}location\.protocol!=='https:'\)return true;[\s\S]{0,120}return \/\^https:\/i\.test\(url\)/.test(src));
  ok('a blocked command explains itself instead of failing quietly',
     /if\(!_remoteReachable\(url\)\)\{[\s\S]{0,300}Blocked: this page is https/.test(src));
  ok('the card warns before you press anything',
     /is http and this page is https, so the browser blocks the buttons/.test(src));
  ok('Open is offered as the path that always works — navigation is not blocked',
     /Open control[\s\S]{0,220}_khOpenExt\(pc\)/.test(src));
  ok('the embed is only offered when the page could actually load it',
     /if\(_remoteReachable\(pc\)\)\{[\s\S]{0,220}Show here/.test(src));
  ok('a framed device is sandboxed like a published app — no same-origin',
     /_khDashRemoteFrame[\s\S]{0,2400}allow-scripts allow-forms allow-modals/.test(src));
  ok('a frame that never loads says so rather than showing a white box',
     /_khDashRemoteFrame[\s\S]{0,2800}If nothing appears/.test(src));
  ok('the setup sheet names the tunnel address as the way round it',
     /https tunnel address, use that one/.test(src));

  ok('no page errors', errs.length===0, errs.slice(0,3).join(' | '));
  await p.close();await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
