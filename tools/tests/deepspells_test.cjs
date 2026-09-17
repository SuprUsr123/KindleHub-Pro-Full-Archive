const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url'),fs=require('fs');
let pass=0,fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x!==undefined&&!c?'  -- '+String(x).slice(0,200):''));};
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await(await b.newContext({viewport:{width:600,height:800}})).newPage();
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:30000});
  const r=await p.evaluate(async()=>{
    launchGame('deephalls'); await new Promise(r=>setTimeout(r,250));
    const d=window._KH_DH_DBG;
    if(!d||!d.spellProbe)return{noHook:true};
    return {eff:d.spellProbe('frost').eff, own:d.spellOwnProbe('frost')};
  });
  ok('a spell still lands on the monster', r.eff&&r.eff.frost>0, JSON.stringify(r.eff));
  const o=r.own||{};
  ok('you KEEP the spell after casting it', o.owned===true, JSON.stringify(o));
  ok('...but it is not castable again straight away', o.readyBefore===true&&o.readyAfterCast===false, JSON.stringify(o));
  ok('...nor one depth later', o.readyOneDepthLater===false, JSON.stringify(o));
  ok('...and it is back two depths later', o.readyTwoDepthsLater===true, JSON.stringify(o));
  ok('the ready-count drops while it is cold and returns with it',
     o.countAtCast===0&&o.countWhenBack===1, JSON.stringify(o));
  const src=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
  ok('you can carry three, not four', /const SPELL_SLOTS=3;/.test(src));
  ok('the cooldown is two depths', /const SPELL_RECHARGE_DEPTHS=2;/.test(src));
  ok('casting no longer removes the spell', !/g\.spells\.splice\(idx,1\)/.test(src));
  ok('...it stamps a cooldown instead', /g\.spellCd\[id\]=g\.depth;/.test(src));
  ok('the cooldown is read off the depth, so nothing has to tick it',
     /function _spellReadyAt\(id\)[\s\S]{0,200}cd\[id\]\+SPELL_RECHARGE_DEPTHS/.test(src));
  ok('a recharging spell cannot be cast', /if\(!_spellReady\(id\)\)\{say\(sp\.name\+' is still recharging/.test(src));
  ok('the shop refuses a duplicate', /indexOf\(sp\.id\)>=0\)return false;/.test(src));
  ok('the counter shows what is READY, not what is owned', /var _n=_spellsReadyCount\(\);/.test(src));
  ok('the mail manual no longer claims outside mail is unsupported',
     !/isn't supported — @kindlehub\.pro is a KindleHub-only address/.test(src));
  ok('...and says what actually decides it', /works when the mail gateway is switched on/.test(src));
  ok('no page errors', errs.length===0, errs.slice(0,2).join(' | '));
  await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
