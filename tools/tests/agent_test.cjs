/* The agent tool re-implements the app's message crypto in Node. If the two
   ever drift, the agent posts something the app renders as gibberish (or worse,
   silently reads nothing) — and that is invisible until someone tries it on a
   real device. So this test encrypts in ONE and decrypts in the OTHER, both
   directions, against the real shipped code in index.min.html. */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url'),fs=require('fs');
const {execFileSync}=require('child_process');

const ROOM='481920375146';
const SAMPLES=[
  'hello',
  'a short one',
  /* long enough that the app prefers the gzip form (enc2), so both branches
     of the prefix logic are exercised */
  'the quick brown fox jumps over the lazy dog. '.repeat(40),
  'unicode: café — naïve — ✓ ★ °',
  'pipes|and|newlines\nsecond line',
];

(async()=>{
  const agent=path.resolve(__dirname,'../agent/kh-agent.mjs');
  const src=fs.readFileSync(agent,'utf8');

  /* Node side: pull the two functions out of the tool by importing it with a
     flag that makes it do nothing, then re-deriving here would duplicate the
     code under test. Instead run the real file's crypto through a tiny harness
     that reuses its exact source. */
  const harness=path.resolve(__dirname,'../../.agent-crypto-harness.mjs');
  const body=src
    .slice(src.indexOf('/* ── the app\'s message crypto'), src.indexOf('/* ── transport'))
    .replace(/^\s*\/\* ──.*$/m,'');
  /* Results cross the process boundary base64-encoded. Printing them raw and
     trimming would silently eat leading/trailing whitespace, and a message that
     ends in a space is exactly the kind of thing that must survive intact. */
  fs.writeFileSync(harness,
    body+'\nconst [,,mode,code,payload]=process.argv;\n'+
    "const inp=Buffer.from(payload,'base64').toString('utf8');\n"+
    "const out=(mode==='enc')?await encrypt(code,inp):await decrypt(code,inp);\n"+
    "console.log(Buffer.from(out,'utf8').toString('base64'));\n");

  const run=(mode,code,txt)=>Buffer.from(
    execFileSync('node',[harness,mode,code,Buffer.from(txt,'utf8').toString('base64')],
      {encoding:'utf8'}).trim(),'base64').toString('utf8');
  const nodeEnc=(code,txt)=>run('enc',code,txt);
  const nodeDec=(code,ct)=>run('dec',code,ct);

  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage();
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:20000});

  let pass=0,fail=0;
  const ok=(n,c)=>{if(c){pass++;console.log('PASS '+n);}else{fail++;console.log('FAIL '+n);}};

  for(const sample of SAMPLES){
    const label=JSON.stringify(sample.slice(0,28))+(sample.length>28?'…':'');

    /* app encrypts → the tool must read it */
    const appCt=await p.evaluate(([r,s])=>window._msgEncrypt(r,s),[ROOM,sample]);
    ok('the tool reads what the app wrote  '+label, nodeDec(ROOM,appCt)===sample);

    /* tool encrypts → the app must read it */
    const toolCt=nodeEnc(ROOM,sample);
    const back=await p.evaluate(([r,c])=>window._msgDecrypt(r,c),[ROOM,toolCt]);
    ok('the app reads what the tool wrote  '+label, back===sample);
  }

  /* A different room must NOT decrypt — the room code is the whole boundary. */
  const ct=nodeEnc(ROOM,'secret');
  ok('another room cannot read it', nodeDec('999999999999',ct)==='[could not decrypt]');

  /* Both prefixes really do occur, so the gzip branch is not dead code. */
  const prefixes=new Set(SAMPLES.map(s=>nodeEnc(ROOM,s).slice(0,5)));
  ok('both the plain and compressed forms are produced', prefixes.has('enc1:')&&prefixes.has('enc2:'));

  /* The tool must refuse to run without configuration rather than guess. */
  const unconf=(()=>{
    try{
      execFileSync('node',[path.resolve(__dirname,'../agent/kh-agent.mjs'),'--read'],
        {encoding:'utf8',env:{...process.env,KH_AGENT_ROOM:''},stdio:['ignore','pipe','pipe']});
      return false;
    }catch(e){return /Not configured/.test(String(e.stderr||''));}
  })();
  ok('it refuses to run unconfigured instead of guessing', unconf);

  ok('no page errors', errs.length===0);
  try{fs.unlinkSync(harness);}catch(_){}
  await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
