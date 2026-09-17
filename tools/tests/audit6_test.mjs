/* Six reported P1s, each reproduced the way the report described it, then
   re-run against the fix.

   Two of these were mine, written earlier the same day, and both were invisible
   to the tests I wrote alongside them:

     - the app-cloud auth test only ever tried MALFORMED hashes ('' and
       'not-a-hash'), both of which fail a regex. It never tried a well-formed
       hash for an account that does not exist, which is the actual attack.
     - the byte counter used `x | 0`, and every fixture was kilobytes, so the
       32-bit wrap above 2 GB never showed up.

   Worth writing down: a negative test that only feeds obviously-wrong input
   proves the parser works, not that the door is locked.

   Run: NODE_PATH=/opt/node22/lib/node_modules node --experimental-sqlite tools/tests/audit6_test.mjs */
import { DatabaseSync } from 'node:sqlite';
import { webcrypto } from 'node:crypto';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
import worker, { ensureSchema } from '../../api-worker.js';
import { safeBytes } from '../../cloud-worker.js';

let pass=0,fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x!==undefined&&!c?'  -- '+String(x).slice(0,200):''));};
function d1(db){return{prepare(sql){let p=[];const api={bind(...a){p=a.map(x=>x===undefined?null:x);return api;},async run(){const r=db.prepare(sql).run(...p);return{meta:{changes:r.changes,last_row_id:r.lastInsertRowid}};},async all(){return{results:db.prepare(sql).all(...p)};},async first(){return db.prepare(sql).get(...p)||null;}};return api;},async batch(s){for(const x of s)await x.run();}};}

const REAL='1'.repeat(64);        // an account that exists
const GHOST='9'.repeat(64);       // a well-formed hash that never registered

(async()=>{
  const db=new DatabaseSync(':memory:');
  const env={DB:d1(db),ALLOW_ORIGIN:'*'};
  await ensureSchema(env.DB);
  db.prepare("INSERT OR REPLACE INTO kh_users (hash,email,state,updated_at) VALUES (?,?,?,?)").run(REAL,'realuser','',new Date().toISOString());

  const rpc=(fn,p,hdr)=>worker.fetch(new Request('https://x/rest/v1/rpc/'+fn,{method:'POST',
    headers:Object.assign({'Content-Type':'application/json'},hdr||{}),body:JSON.stringify(p)}),env,{waitUntil(){}})
    .then(async r=>({status:r.status,body:await r.text()}));
  const post=(table,row,hdr)=>worker.fetch(new Request('https://x/rest/v1/'+table,{method:'POST',
    headers:Object.assign({'Content-Type':'application/json','CF-Connecting-IP':'203.0.113.9'},hdr||{}),
    body:JSON.stringify(row)}),env,{waitUntil(){}})
    .then(async r=>({status:r.status,body:await r.text()}));
  const SECRET={'X-KH-Secret':REAL};

  console.log('── P1-1: app-cloud auth was a regex, not a check ──');
  let r=await rpc('kh_app_put',{p_hash:GHOST,p_app:'chess',p_room:'g',p_key:'k',p_value:'v'});
  ok('a well-formed hash that never registered is refused', r.status===401, r.status+' '+r.body);
  r=await rpc('kh_app_put',{p_hash:REAL,p_app:'chess',p_room:'g',p_key:'k',p_value:'v'});
  ok('...a real account still works', r.status===200, r.status+' '+r.body);
  r=await rpc('kh_app_get',{p_hash:GHOST,p_app:'chess',p_room:'g',p_key:'k'});
  ok('reads are refused too, so a ghost cannot even peek', r.status===401, r.status);
  /* The seizure the report described: overwrite an existing key as a nobody. */
  const seized=db.prepare("SELECT v FROM kh_app_data WHERE app='chess' AND room='g' AND k='k'").get();
  await rpc('kh_app_put',{p_hash:GHOST,p_app:'chess',p_room:'g',p_key:'k',p_value:'SEIZED'});
  const after=db.prepare("SELECT v FROM kh_app_data WHERE app='chess' AND room='g' AND k='k'").get();
  ok('an existing room key cannot be seized by a ghost', after && after.v===seized.v, JSON.stringify(after));

  console.log('\n── P1-2: the byte counter wrapped at 2 GB ──');
  ok('3 GB survives instead of becoming zero', safeBytes(3145728000)===3145728000, String(safeBytes(3145728000)));
  ok('50 GB survives',                         safeBytes(53687091200)===53687091200, String(safeBytes(53687091200)));
  ok('a negative reading floors at zero',      safeBytes(-5)===0);
  ok('junk floors at zero',                    safeBytes('abc')===0 && safeBytes(null)===0 && safeBytes(Infinity)===0);
  ok('past the safe-integer range floors rather than lying', safeBytes(Number.MAX_SAFE_INTEGER+10)===0);

  console.log('\n── P1-4: sixty forged rows emptied a mailbox ──');
  /* The victim's real mail, then sixty forged inserts from nobody. */
  db.prepare("INSERT INTO kh_mail (id,to_user,from_user,from_id,subject,body,ts) VALUES (?,?,?,?,?,?,?)")
    .run('real-1','victim','friend','','hello','important',new Date(Date.now()-9e8).toISOString());
  for(let i=0;i<62;i++){
    await post('kh_mail',{id:'forged-'+i,to_user:'victim',from_user:'nobody',from_id:'',subject:'x',body:'x',ts:new Date().toISOString()});
  }
  let survived=db.prepare("SELECT id FROM kh_mail WHERE id='real-1'").get();
  ok('the victim\'s real mail is still there', !!survived, 'rows now: '+db.prepare("SELECT COUNT(*) c FROM kh_mail WHERE to_user='victim'").get().c);
  /* And a VERIFIED sender still gets retention, so the cap is not abandoned. */
  for(let i=0;i<3;i++){
    await post('kh_mail',{id:'auth-'+i,to_user:'victim2',from_user:'realuser',from_id:'',subject:'x',body:'x',ts:new Date().toISOString()},SECRET);
  }
  ok('a verified write still runs retention', db.prepare("SELECT COUNT(*) c FROM kh_mail WHERE to_user='victim2'").get().c===3);

  console.log('\n── P1-5: fifty forged messages emptied Global Chat ──');
  db.prepare("INSERT INTO kh_messages (id,group_code,user_id,display_name,text,ts) VALUES (?,?,?,?,?,?)")
    .run('keep-me','000000000000','aaaa','someone','the real message',new Date(Date.now()-9e8).toISOString());
  let accepted=0;
  for(let i=0;i<55;i++){
    /* rotating user_id — the bypass the report used */
    const res=await post('kh_messages',{id:'spam-'+i,group_code:'000000000000',user_id:'rot'+i,display_name:'anyone',text:'spam',ts:new Date().toISOString()});
    if(res.status>=200&&res.status<300)accepted++;
  }
  survived=db.prepare("SELECT id FROM kh_messages WHERE id='keep-me'").get();
  ok('the real message survives fifty-five forged ones', !!survived,
     'accepted '+accepted+', rows '+db.prepare("SELECT COUNT(*) c FROM kh_messages WHERE group_code='000000000000'").get().c);
  ok('...and rotating user_id no longer buys a fresh rate-limit bucket', accepted<55, 'accepted '+accepted+' of 55');

  console.log('\n── P1-6: unlimited account farming ──');
  let made=0,refused=0;
  for(let i=0;i<30;i++){
    /* Must be EXACTLY 64 hex. An earlier version of this fixture produced 63
       characters, the registration branch skipped it, and the test reported a
       missing cap that was in fact present but unreachable. */
    const h=(i.toString(16).padStart(4,'0')+'abcdef0123456789').repeat(4).slice(0,64);
    const res=await post('kh_users',{hash:h,email:'farm'+i,state:'',updated_at:new Date().toISOString()});
    if(res.status>=200&&res.status<300)made++; else if(res.status===429)refused++;
  }
  ok('account creation from one address is capped', refused>0, 'made '+made+', refused '+refused);
  ok('...but a reasonable number still get through, so a shared network works', made>=8, 'made '+made);
  /* An existing account syncing must NEVER hit the registration limit. */
  const sync=await worker.fetch(new Request('https://x/rest/v1/kh_users?on_conflict=hash',{method:'POST',
    headers:{'Content-Type':'application/json','CF-Connecting-IP':'203.0.113.9','X-KH-Secret':REAL},
    body:JSON.stringify({hash:REAL,email:'realuser',state:'x',updated_at:new Date().toISOString()})}),env,{waitUntil(){}})
    .then(async x=>({status:x.status,body:await x.text()}));
  ok('an existing account syncing is not treated as a registration', sync.status!==429, sync.status+' '+sync.body);

  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
