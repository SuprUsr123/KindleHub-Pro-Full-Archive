/* "On testaccount I got DM messages from my arancool3000 account."

   Signing out reset S. It did not touch the dozen-odd localStorage keys that
   live BESIDE S — notes caches, habits, topic state, and worst of all
   kh_mc_<code>, the per-room cache of raw (still-encrypted) message rows kept so
   a server-wiped room can rebuild itself.

   Those rows survived the sign-out, and a room's message key is derived from the
   room CODE alone, so they decrypted for whoever signed in next. No credential
   of the second account was involved. The synced ones were then swept into the
   new account's cloud backup, which is the "the two accounts merged
   localStorage" half of the report.

   What this pins:
     - signing out removes account content from localStorage
     - cached DM rows in particular are gone
     - switching accounts without signing out first does the same
     - device furniture (theme, device id, gateways) survives, because losing it
       on every sign-out would be its own bug
     - the default is DELETE: a key added next year is dropped unless somebody
       deliberately lists it as device-scoped

   Run: NODE_PATH=/opt/node22/lib/node_modules node tools/tests/lsleak_test.cjs */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),url=require('url'),fs=require('fs');

let pass=0,fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x!==undefined&&!c?'  -- '+String(x).slice(0,240):''));};

(async()=>{
  const src=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
  /* The window is generous because the point is only that the call sits INSIDE
     _khResetAccountData rather than somewhere a caller has to remember. A tight
     window turns every new line at the top of that function into a failure, and
     one already did: clearing the superencrypt session cache went in above it. */
  ok('the wipe runs as part of resetting an account, not as a separate step somebody can forget',
     /function _khResetAccountData\(\)\{[\s\S]{0,2000}_khWipeAccountLocalStorage\(\)/.test(src));

  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:600,height:800}});
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url.pathToFileURL(path.resolve(__dirname,'../../index.min.html')).href,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window._KH&&window._KH.S,null,{timeout:20000});

  const r=await p.evaluate(()=>{
    const out={};
    /* Stand in for what a real session leaves behind. kh_mc_ is the one that
       actually leaked private messages; the rest are ordinary app content. */
    const ACCOUNT={
      'kh_mc_845112990233':'[{"id":"m1","text":"KHE1:private message to cristian"}]',
      'kh_mc_000000000000':'[{"id":"m2","text":"KHE1:global"}]',
      'kh_habits':'[{"id":"h1","name":"read"}]',
      'kh_topic_favs':'["abc"]',
      'kh_notifs':'[{"title":"DM from aran"}]',
      'kh_custom_apps':'[{"name":"my app"}]',
      'kh_ai_keys':'{"gemini":"AIzaSy-secret"}',
      'kh_msg_lastseen_845112990233':'m1',
      'kh_draft_845112990233':'half typed',
      'kh_gazette':'{"date":"2026-07-31"}',
      'kh_session':'{"t":"tok"}',
      'kindlehub_v5_backup':'x'
    };
    const DEVICE={
      'kh_device_id':'dev-1','kh_theme':'dark','kh_fontsize':'18',
      'kh_api_gateway':'https://api.example','kh_state_gateway':'https://state.example',
      'kh_mail_gateway':'https://mail.example','kh_admin_secret':'shh',
      'kh_offline_cred':'[{"k":"..."}]','kh_last_user':'aran',
      'kh_os_wallpaper':'w1','kh_os_apporder':'["home"]','kh_darkmode':'1'
    };
    function seed(){
      Object.keys(ACCOUNT).forEach(k=>localStorage.setItem(k,ACCOUNT[k]));
      Object.keys(DEVICE).forEach(k=>localStorage.setItem(k,DEVICE[k]));
    }
    function survivors(o){return Object.keys(o).filter(k=>localStorage.getItem(k)!==null);}

    seed();
    out.seededAccount=survivors(ACCOUNT).length;
    const removed=window._khWipeAccountLocalStorage();
    out.removedCount=removed;
    out.accountLeft=survivors(ACCOUNT);
    out.deviceLeft=survivors(DEVICE).length;
    out.deviceTotal=Object.keys(DEVICE).length;
    out.deviceGone=Object.keys(DEVICE).filter(k=>localStorage.getItem(k)===null);

    /* The classification itself, since that is what a future key falls through. */
    out.mcIsAccount=!window._khLsIsDeviceKey('kh_mc_845112990233');
    out.osIsDevice=window._khLsIsDeviceKey('kh_os_wallpaper');
    out.unknownIsAccount=!window._khLsIsDeviceKey('kh_something_invented_later');
    out.keysAreCredentials=!window._khLsIsDeviceKey('kh_ai_keys');

    /* And through the real door: _khResetAccountData, which is what sign-out
       and account-switch both call. */
    seed();
    window._KH.S.authToken='a'.repeat(64);
    window._khResetAccountData();
    out.viaResetLeft=survivors(ACCOUNT);
    out.viaResetDeviceLeft=survivors(DEVICE).length;

    /* Clean up so the rest of the page is not left holding fake state. */
    Object.keys(ACCOUNT).concat(Object.keys(DEVICE)).forEach(k=>{try{localStorage.removeItem(k);}catch(_){}});
    return out;
  });

  console.log('\n── what must go ──');
  ok('the account keys were really there to begin with', r.seededAccount===12, r.seededAccount);
  ok('the wipe removes them',                            r.accountLeft.length===0, 'left: '+r.accountLeft.join(', '));
  ok('...including the cached DM rows that leaked',       r.accountLeft.indexOf('kh_mc_845112990233')<0);
  ok('...and the API key, which is a credential',         r.accountLeft.indexOf('kh_ai_keys')<0);
  ok('it reports how much it removed',                    r.removedCount>=12, r.removedCount);

  console.log('\n── what must stay ──');
  ok('device furniture survives a sign-out', r.deviceLeft===r.deviceTotal, 'lost: '+r.deviceGone.join(', '));

  console.log('\n── the classification, which is what a future key falls through ──');
  ok('a message cache counts as account content',     r.mcIsAccount);
  ok('KindleOS layout counts as device furniture',    r.osIsDevice);
  ok('a key nobody has thought of yet is account content by default', r.unknownIsAccount);
  ok('an API key is not device furniture',            r.keysAreCredentials);

  console.log('\n── through the real door ──');
  ok('resetting an account clears them too',  r.viaResetLeft.length===0, 'left: '+r.viaResetLeft.join(', '));
  ok('...and still keeps the device settings', r.viaResetDeviceLeft===r.deviceTotal);

  /* ── the other half of "what keeps a DM private" ──────────────────────────
     Wiping the cache stops the previous account reading the room. It does not
     change the fact that the room CODE is the room's only secret: the message
     key is SHA-256('khmsg::'+code). So the code has to be unguessable, and
     every generator has to agree about that. */
  const codeSrc=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
  const genLoops=(codeSrc.match(/for\s*\(\s*(?:let|var)\s+i\s*=\s*0\s*;\s*i\s*<\s*(?:6|12)\s*;\s*i\+\+\s*\)\s*c\s*\+=\s*Math\.floor\(Math\.random/g)||[]);
  ok('no room-code generator rolls its own Math.random loop any more', genLoops.length===0, genLoops.join(' | '));

  const c=await p.evaluate(()=>{
    const out={};
    out.exists=typeof window._khRoomDigits==='function';
    const codes=[];for(let i=0;i<400;i++)codes.push(window._khRoomDigits(12));
    out.rightLength=codes.every(x=>x.length===12);
    out.digitsOnly=codes.every(x=>/^[0-9]{12}$/.test(x));
    out.allDifferent=new Set(codes).size===codes.length;
    /* The modulo-bias check: a byte mod 10 makes 0-5 commoner than 6-9. Over
       4800 digits that skew is visible, so a rejection-sampled generator must
       not show it. Allow generous slack — this is catching a 20% lean, not
       measuring randomness. */
    const freq=new Array(10).fill(0);
    codes.join('').split('').forEach(d=>freq[+d]++);
    const total=codes.length*12, expect=total/10;
    out.worstSkew=Math.max(...freq.map(f=>Math.abs(f-expect)/expect));
    out.lowVsHigh=(freq[0]+freq[1]+freq[2]+freq[3]+freq[4])/(freq[5]+freq[6]+freq[7]+freq[8]+freq[9]);
    out.six=window._khRoomDigits(6).length===6;
    return out;
  });
  ok('the shared generator is there',            c.exists);
  ok('...and returns twelve digits',             c.rightLength&&c.digitsOnly);
  ok('...that do not repeat',                    c.allDifferent);
  ok('...and six when six are asked for',        c.six);
  ok('no digit is meaningfully commoner than another', c.worstSkew<0.2, 'worst skew '+c.worstSkew);
  ok('...in particular 0-4 do not outnumber 5-9, which is what byte-mod-10 does',
     c.lowVsHigh>0.9&&c.lowVsHigh<1.1, 'ratio '+c.lowVsHigh);

  ok('no page errors', errs.length===0, errs.slice(0,3).join(' | '));
  await p.close();await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
