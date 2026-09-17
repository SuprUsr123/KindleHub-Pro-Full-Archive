const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const url=require('url');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:420,height:760}});
  const cdp=await p.context().newCDPSession(p);
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:6});
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.start');
  await p.goto(url.pathToFileURL(require('path').resolve(__dirname,'../../index.min.html')).href,{waitUntil:'load'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:90000});
  const {profile}=await cdp.send('Profiler.stop');
  // self-time per function
  const byId={}; profile.nodes.forEach(n=>byId[n.id]=n);
  const self={};
  const total=profile.timeDeltas.reduce((a,b)=>a+b,0);
  profile.samples.forEach((id,i)=>{ self[id]=(self[id]||0)+(profile.timeDeltas[i]||0); });
  const rows=Object.entries(self).map(([id,us])=>{
    const n=byId[id]||{callFrame:{}};
    const f=n.callFrame||{};
    return {fn:(f.functionName||'(anonymous)')+' :'+(f.lineNumber||0), ms:Math.round(us/1000)};
  }).filter(r=>r.ms>15).sort((a,b)=>b.ms-a.ms).slice(0,14);
  console.log('total profiled ms:',Math.round(total/1000));
  rows.forEach(r=>console.log(String(r.ms).padStart(6),'ms ',r.fn));
  await b.close();
})();
