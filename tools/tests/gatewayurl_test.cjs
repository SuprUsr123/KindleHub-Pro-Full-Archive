/* The "HTTP 405 — could not send the email" report, pinned.
 *
 * The mail gateway field held 'email-worker.arancool3000.workers.dev' with no
 * https:// in front of it. That is not an address, it is a RELATIVE PATH, so
 * every send POSTed to https://kindlehub.pro/email-worker.…/send — our own
 * static site, which answers a POST with 405. The Worker was configured
 * perfectly the whole time and was never asked.
 *
 * These assertions are about where a request GOES, which is the only thing
 * that was ever wrong. */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url');
let pass=0,fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x!==undefined&&!c?'  -- '+String(x).slice(0,220):''));};
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await(await b.newContext({viewport:{width:600,height:800}})).newPage();
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve('index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:30000});

  console.log('── a host with no scheme is completed, not accepted ──');
  const n=await p.evaluate(()=>{
    const f=window._khNormGatewayUrl;
    return {
      bare:      f('email-worker.arancool3000.workers.dev'),
      trailing:  f('email-worker.arancool3000.workers.dev/'),
      spaced:    f('  email-worker.arancool3000.workers.dev  '),
      https:     f('https://email-worker.arancool3000.workers.dev'),
      httpKept:  f('http://192.168.1.9:8787'),
      off:       f('off'),
      empty:     f(''),
      nullish:   f(null),
      slashes:   f('//email-worker.arancool3000.workers.dev')
    };
  });
  ok('a bare host gains https://', n.bare==='https://email-worker.arancool3000.workers.dev', n.bare);
  ok('...and loses the trailing slash', n.trailing==='https://email-worker.arancool3000.workers.dev', n.trailing);
  ok('...and surrounding spaces', n.spaced==='https://email-worker.arancool3000.workers.dev', n.spaced);
  ok('a full URL is left exactly as it is', n.https==='https://email-worker.arancool3000.workers.dev', n.https);
  /* Someone pointing at a worker on their own machine meant http. Rewriting
     that to https would break a case that was working. */
  ok('an explicit http:// is NOT rewritten', n.httpKept==='http://192.168.1.9:8787', n.httpKept);
  ok('the opt-out word is still the opt-out word', n.off==='off', n.off);
  ok('blank stays blank', n.empty===''&&n.nullish==='', JSON.stringify([n.empty,n.nullish]));
  ok('a protocol-relative // is not left to inherit file://', /^https:\/\/[a-z]/.test(n.slashes), n.slashes);

  console.log('\n── and the request actually leaves the site ──');
  const where=await p.evaluate(()=>{
    localStorage.setItem('kh_mail_gateway','email-worker.arancool3000.workers.dev');
    const gw=_mailGatewayUrl();
    /* This is the whole bug in one line: what the browser resolves the send
       URL to. Before the fix it resolved against the page, not the worker. */
    const resolved=new URL(gw+'/send',location.href).href;
    localStorage.removeItem('kh_mail_gateway');
    return {gw, resolved, pageOrigin:location.origin};
  });
  ok('the stored scheme-less value is read back as a real URL', /^https:\/\//.test(where.gw), where.gw);
  ok('...so /send resolves to the worker', /^https:\/\/email-worker\.arancool3000\.workers\.dev\/send$/.test(where.resolved), where.resolved);
  ok('...and NOT to a path on our own site', where.resolved.indexOf(where.pageOrigin)!==0, where.resolved+' vs '+where.pageOrigin);

  console.log('\n── the other two gateways had the same hole ──');
  const others=await p.evaluate(()=>{
    localStorage.setItem('kh_state_gateway','kindlehub-state.arancool3000.workers.dev');
    localStorage.setItem('kh_api_gateway','kindlehub-api.arancool3000.workers.dev');
    const st=_stateGatewayUrl(), ap=_apiGatewayUrl();
    localStorage.removeItem('kh_state_gateway');
    localStorage.removeItem('kh_api_gateway');
    return {st, ap};
  });
  ok('the state gateway is completed too', others.st==='https://kindlehub-state.arancool3000.workers.dev', others.st);
  /* The API gateway never 405'd because it REJECTED a scheme-less value and
     silently fell back to the default — safe, but it meant a custom gateway
     typed without https:// was quietly ignored. Now it is honoured. */
  ok('a scheme-less API gateway is now honoured, not silently ignored', others.ap==='https://kindlehub-api.arancool3000.workers.dev', others.ap);

  ok('no page errors', errs.length===0, errs.slice(0,2).join(' | '));
  await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
