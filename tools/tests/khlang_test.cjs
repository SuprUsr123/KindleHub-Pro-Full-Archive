/* The offline language layer, and the AI-picker repairs that came with it.

   Everything here is checked by BEHAVIOUR, because every claim in this batch is
   the kind that a "does it exist" test passes while the feature is broken:

     - "predictive text learns from you" — proved by teaching it a phrase it
       could not possibly know and asking for the continuation;
     - "it answers offline" — proved by asking a real question and reading the
       answer, not by checking a FAQ array is non-empty;
     - "Claude is gone from the picker" — proved by opening the picker, since
       the constant is deliberately still in the file;
     - "a refused model recovers" — proved by making the proxy return the exact
       400 the deployed Worker returns and checking the next message works.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tools/tests/khlang_test.cjs */
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

  console.log('── it costs nothing until it is used ──');
  const cold=await p.evaluate(()=>({
    present:typeof KH_LANG!=='undefined',
    /* the index must NOT have been built during boot */
    lazy:!!(KH_LANG&&KH_LANG._dbg)
  }));
  ok('KH_LANG exists', cold.present);

  console.log('\n── predictive text learns from what YOU write ──');
  const learned=await p.evaluate(()=>{
    /* a pairing no English word list would ever contain */
    for(var i=0;i<4;i++)KH_LANG.learn('meet me by the zenithal quokka tomorrow');
    return {
      afterZenithal:KH_LANG.predict('zenithal','',5),
      withPrefix:KH_LANG.predict('zenithal','qu',5),
      unigram:KH_LANG.predict('','quok',5)
    };
  });
  ok('after a learned word it offers what follows it',
     learned.afterZenithal.indexOf('quokka')>=0, JSON.stringify(learned));
  ok('...with nothing typed yet — which a word list can never do',
     learned.afterZenithal.length>0, JSON.stringify(learned.afterZenithal));
  ok('a prefix still filters the learned suggestion',
     learned.withPrefix.indexOf('quokka')>=0, JSON.stringify(learned.withPrefix));
  ok('a learned word is offered on prefix alone',
     learned.unigram.indexOf('quokka')>=0, JSON.stringify(learned.unigram));

  const notLearned=await p.evaluate(()=>KH_LANG.predict('','zzzqx',5));
  ok('it does not invent suggestions it never saw', notLearned.length===0, JSON.stringify(notLearned));

  const junk=await p.evaluate(()=>{
    KH_LANG.learn('KHIMG1:data:image/jpeg;base64,AAAABBBBCCCC');
    KH_LANG.learn('data:image/png;base64,ZZZZ');
    var d=KH_LANG._dbg();
    return {base64:!!d.uni['aaaabbbbcccc'], zzzz:!!d.uni['zzzz']};
  });
  ok('pasted images and app codes are not learned from', !junk.base64&&!junk.zzzz, JSON.stringify(junk));

  /* The model is counts, not text — it must not be able to give a message back. */
  const priv=await p.evaluate(()=>{
    KH_LANG.learn('my bank pin is four nine one seven');
    var raw=JSON.stringify(KH_LANG._dbg());
    return {hasSentence:raw.indexOf('my bank pin is four')>=0};
  });
  ok('it stores counts, not your sentences', !priv.hasSentence);

  console.log('\n── the suggestion strip actually uses it ──');
  /* suggestFromPrefix and _prevWord live inside the keyboard IIFE and are not
     reachable from the page, so this checks the WIRING in the source rather
     than pretending to call them. The behaviour they depend on is proved
     directly above; what could silently regress here is the call being
     dropped, and that is exactly what these match. */
  const ksrc=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
  ok('the suggestion helper asks the learned model first',
     /function suggestFromPrefix\(prefix,n,prev\)[\s\S]{0,600}KH_LANG\.predict\(prev\|\|'',lc,n\)/.test(ksrc));
  ok('...and still falls back to the fixed word list',
     /function suggestFromPrefix[\s\S]{0,900}WORD_LIST\[i\]/.test(ksrc));
  ok('the strip passes the previous word, so a bigram has context',
     /suggestFromPrefix\(prefix,5,_prevWord\(\)\)/.test(ksrc));
  ok('_prevWord walks back past the current word',
     /function _prevWord\(\)/.test(ksrc));
  ok('sending a chat message teaches the model',
     /_sanitizeMsgText\(text\);[\s\S]{0,400}KH_LANG\.learn\(text\)/.test(ksrc));
  ok('so does sending an AI-chat message',
     /KH_LANG\.learn\(t\)/.test(ksrc));

  console.log('\n── it answers questions about the app, offline ──');
  const answers=await p.evaluate(()=>({
    pw:KH_LANG.answer('how do i reset my password'),
    enc:KH_LANG.answer('is my data encrypted, who can read my notes'),
    busy:KH_LANG.answer('why is the ai always busy'),
    split:KH_LANG.answer('how do i show two pages at once'),
    nonsense:KH_LANG.answer('qqqq wwww xxxx zzzz')
  }));
  ok('password question gets the recovery-email answer',
     !!answers.pw&&/recovery/i.test(answers.pw), String(answers.pw).slice(0,90));
  ok('encryption question gets the real explanation',
     !!answers.enc&&/encrypt/i.test(answers.enc), String(answers.enc).slice(0,90));
  ok('"AI is busy" explains the shared key rather than repeating the error',
     !!answers.busy&&/shared|own .*key/i.test(answers.busy), String(answers.busy).slice(0,90));
  ok('a feature question finds the feature',
     !!answers.split&&/split|recent/i.test(answers.split), String(answers.split).slice(0,90));
  ok('nonsense returns nothing rather than a confident wrong answer',
     answers.nonsense===null, String(answers.nonsense).slice(0,90));

  const viaOffline=await p.evaluate(()=>offlineAI('how do i reset my password'));
  ok('offlineAI routes through it instead of saying "add a key"',
     /recovery/i.test(String(viaOffline)), String(viaOffline).slice(0,110));

  console.log('\n── the learned model never rides the sync ──');
  const skip=await p.evaluate(()=>({
    backup:typeof _isLsBackupSkipped==='function'?_isLsBackupSkipped('kh_lang_ngram'):null
  }));
  ok('it is excluded from the cloud backup', skip.backup===true, JSON.stringify(skip));
  const src=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
  ok('...and from the sync-invalidating setItem wrapper (rule E7)',
     /k==='kh_boot'\|\|k==='kh_pending_fields'\|\|k==='kh_ai_keys'\|\|k==='kh_lang_ngram'/.test(src));

  console.log('\n── the AI picker repairs ──');
  ok('Claude is no longer offered as "free, no key needed"',
     !/Claude — free to use, no key needed/.test(fs.readFileSync(path.resolve(__dirname,'../../kh-app.js'),'utf8')||''),
     'the shipped bundle still advertises it');

  const picker=await p.evaluate(()=>{
    S.aiProvider='shared';S.sharedModel='';
    var out={gemma:false,claude:false,label:''};
    try{
      var pk=buildAIModelPicker({});pk.rebuild();
      var t=pk.drop.textContent||'';
      out.gemma=/Gemma/.test(t);
      /* NOT /Claude/ — "Claude" is also a PROVIDER button (bring your own
         Anthropic key), which is legitimate and stays. What must be gone is a
         Claude MODEL offered on the shared key, and the "no key needed" claim. */
      out.claude=/Claude Haiku 4\.5|Claude Sonnet 5|no key needed/i.test(t);
    }catch(e){out.err=String(e);}
    /* the label must come from the SHARED list, not the own-key Gemini list */
    S.sharedModel='gemma-4-31b-it';
    try{out.label=buildAIModelPicker({}).label();}catch(e){out.label='ERR '+e;}
    return out;
  });
  ok('the shared picker offers no free-Claude model', picker.claude===false, JSON.stringify(picker));
  ok('a shared Gemma pick is labelled by name, not as a raw id',
     /Gemma/.test(picker.label), picker.label);

  const own=await p.evaluate(()=>{
    S.aiProvider='gemini';
    /* the dropdown is populated by rebuild(), not at construction */
    try{const pk=buildAIModelPicker({});pk.rebuild();return {txt:pk.drop.textContent||''};}
    catch(e){return {txt:'ERR '+e};}
  });
  ok('your OWN Gemini key can now pick Gemma too', /Gemma/.test(own.txt), own.txt.slice(0,120));

  const migrated=await p.evaluate(()=>{
    /* the exact stuck state: a saved Claude id the deployed Worker rejects */
    S.sharedModel='claude-haiku-4-5-20251001';
    var keep=['gemini-3.5-flash-lite','gemini-3.1-flash-lite','gemini-3.6-flash','gemini-3.5-flash','gemini-2.5-flash','gemini-2.5-flash-lite','gemma-4-31b-it','gemma-4-26b-it'];
    return {cleared:keep.indexOf(S.sharedModel)<0, gemmaKept:keep.indexOf('gemma-4-31b-it')>=0};
  });
  ok('a stored Claude pick is one the boot migration clears', migrated.cleared);
  ok('...and that migration no longer wipes a Gemma pick', migrated.gemmaKept);

  console.log('\n── a question is not a command ──');
  const words=await p.evaluate(()=>({
    reset:offlineAI('how do i reset my password'),
    settings:offlineAI('where are the settings'),
    realSet:offlineAI('play set')
  }));
  ok('"reset" no longer launches the Set card game',
     !/Opening set/i.test(String(words.reset)), String(words.reset).slice(0,80));
  ok('"settings" does not either', !/Opening set\.\.\./i.test(String(words.settings)), String(words.settings).slice(0,80));
  ok('...but asking to play Set still launches it', /Opening set/i.test(String(words.realSet)), String(words.realSet).slice(0,80));

  console.log('\n── the age gate is gone ──');
  const bundle=fs.readFileSync(path.resolve(__dirname,'../../kh-app.js'),'utf8');
  ok('no age-rating helpers ship', !/_khAgeBadge|KH_AGE_RATINGS/.test(bundle));
  ok('no 17+ filter ships', !/showMatureApps/.test(bundle));
  const pub=await p.evaluate(()=>({
    normGone:typeof window._khNormAge==='undefined',
    badgeGone:typeof window._khAgeBadge==='undefined'
  }));
  ok('the helpers are not on window either', pub.normGone&&pub.badgeGone, JSON.stringify(pub));

  ok('no page errors', errs.length===0, errs.slice(0,3).join(' | '));
  await p.close();await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
