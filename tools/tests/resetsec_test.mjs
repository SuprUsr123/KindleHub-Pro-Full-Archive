/* Account takeover through the password-reset form.

   THE BUG, as reported: "anyone could change recovery email to their OWN email
   and access my account."

   The reset form asked for a username AND a destination address, and emailed the
   6-digit code to whatever was typed in the second box. A username is public —
   it is printed beside every message its owner has ever sent. So: type somebody
   else's username, type your own email, receive their reset code.

   The root cause was architectural rather than careless. The recovery email
   lived only inside the end-to-end encrypted state blob, which the server
   cannot read, so the server had no way to know where a code should go — and
   asked whoever was standing at the screen.

   The fix is a server-side copy, written only by a session that already holds
   the account key. What this pins:

     - setting an address requires the ACCOUNT hash (username AND password)
     - the caller cannot choose the KEY it is stored under; the server derives
       it from the username on the account row
     - reading an address back requires the reset service secret
     - the reset request carries no destination at all any more

   Run: NODE_PATH=/opt/node22/lib/node_modules node --experimental-sqlite tools/tests/resetsec_test.mjs */
import { DatabaseSync } from 'node:sqlite';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
import worker, { ensureSchema } from '../../api-worker.js';

let pass=0,fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x!==undefined&&!c?'  -- '+String(x).slice(0,220):''));};
function d1(db){return{prepare(sql){let p=[];const api={bind(...a){p=a.map(x=>x===undefined?null:x);return api;},async run(){const r=db.prepare(sql).run(...p);return{meta:{changes:r.changes,last_row_id:r.lastInsertRowid}};},async all(){return{results:db.prepare(sql).all(...p)};},async first(){return db.prepare(sql).get(...p)||null;}};return api;},async batch(s){for(const x of s)await x.run();}};}
const sha=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(b=>b.toString(16).padStart(2,'0')).join('');

const VICTIM='a'.repeat(64);      // the victim's account hash (username+password)
const ATTACKER='b'.repeat(64);    // the attacker's own account

(async()=>{
  const db=new DatabaseSync(':memory:');
  const env={DB:d1(db),ALLOW_ORIGIN:'*',RESET_SECRET:'reset-secret-value'};
  await ensureSchema(env.DB);
  db.prepare("INSERT OR REPLACE INTO kh_users (hash,email,state,updated_at) VALUES (?,?,?,?)").run(VICTIM,'arancool3000','',new Date().toISOString());
  db.prepare("INSERT OR REPLACE INTO kh_users (hash,email,state,updated_at) VALUES (?,?,?,?)").run(ATTACKER,'malloryy','',new Date().toISOString());

  const call=(fn,p,hdr)=>worker.fetch(new Request('https://x/rest/v1/rpc/'+fn,{method:'POST',
    headers:Object.assign({'Content-Type':'application/json'},hdr||{}),body:JSON.stringify(p)}),env,{waitUntil(){}})
    .then(async r=>({status:r.status,body:await r.text()}));
  const j=s=>{try{return JSON.parse(s);}catch(_){return null;}};
  const RS={'X-KH-Reset-Secret':'reset-secret-value'};

  console.log('── only the account holder can nominate an address ──');
  let r=await call('kh_recovery_set',{p_hash:VICTIM,p_email:'arancool3000@gmail.com'});
  ok('the real owner can set theirs', r.status===200, r.status+' '+r.body);

  r=await call('kh_recovery_set',{p_hash:'',p_email:'mallory@evil.test'});
  ok('with no account hash it is refused', r.status===401, r.status+' '+r.body);
  r=await call('kh_recovery_set',{p_hash:'f'.repeat(64),p_email:'mallory@evil.test'});
  ok('a made-up account hash is refused', r.status===401, r.status+' '+r.body);
  r=await call('kh_recovery_set',{p_hash:VICTIM,p_email:'not an email'});
  ok('a malformed address is refused',   r.status===400, r.status+' '+r.body);

  console.log('\n── THE TAKEOVER ITSELF ──');
  /* The attacker holds their OWN valid account. They know the victim's
     username, because usernames are public. Can they point the victim's reset
     anywhere? The key is derived server-side from the row belonging to the
     hash they presented, so the only address they can move is their own. */
  const victimU=await sha('arancool3000');
  r=await call('kh_recovery_set',{p_hash:ATTACKER,p_email:'mallory@evil.test',p_u:victimU});
  ok('an attacker CAN set their own address (they are a real user)', r.status===200, r.status);
  let row=db.prepare('SELECT email FROM kh_recovery WHERE u=?').get(victimU);
  ok('...but the victim\'s address is UNCHANGED — the key came from the server, not the request',
     row && row.email==='arancool3000@gmail.com', JSON.stringify(row));
  const attackerU=await sha('malloryy');
  row=db.prepare('SELECT email FROM kh_recovery WHERE u=?').get(attackerU);
  ok('...their address landed under THEIR key', row && row.email==='mallory@evil.test', JSON.stringify(row));

  console.log('\n── the address cannot be read by the public ──');
  r=await call('kh_recovery_lookup',{p_u:victimU});
  ok('without the reset secret, refused', r.status===403, r.status+' '+r.body);
  r=await call('kh_recovery_lookup',{p_u:victimU},{'X-KH-Reset-Secret':'wrong'});
  ok('with the wrong secret, refused',    r.status===403, r.status+' '+r.body);
  r=await call('kh_recovery_lookup',{p_u:victimU},RS);
  ok('the mail worker can read it',       r.status===200 && j(r.body).email==='arancool3000@gmail.com', r.status+' '+r.body);
  r=await call('kh_recovery_lookup',{p_u:await sha('nobody-at-all')},RS);
  ok('an account with nothing on file returns an empty address, not an error',
     r.status===200 && j(r.body).email==='', r.status+' '+r.body);

  console.log('\n── the table is not reachable as an ordinary REST table ──');
  /* Not exposed through the REST surface at ALL — it is absent from the column
     map, so it 404s before any gate is consulted. That is stronger than a 403,
     which would confirm the table exists. The named gate in fetch() is a second
     lock for the day somebody adds it to that map without thinking. Either
     refusal is fine here; being SERVED is not. */
  const rest=(m,path,hdr)=>worker.fetch(new Request('https://x/rest/v1/'+path,{method:m,
    headers:Object.assign({'Content-Type':'application/json'},hdr||{}),
    body:m==='GET'?undefined:JSON.stringify({u:victimU,email:'mallory@evil.test'})}),env,{waitUntil(){}})
    .then(async r=>({status:r.status,body:await r.text()}));
  r=await rest('GET','kh_recovery?select=*');
  ok('reading the table outright is refused', r.status===403||r.status===404, r.status+' '+r.body);
  ok('...and the refusal returns no address', !/gmail\.com|@/.test(r.body), r.body);
  r=await rest('POST','kh_recovery');
  ok('writing to it outright is refused',     r.status===403||r.status===404, r.status+' '+r.body);
  const stillMine=db.prepare('SELECT email FROM kh_recovery WHERE u=?').get(victimU);
  ok('...and really wrote nothing',           stillMine && stillMine.email==='arancool3000@gmail.com', JSON.stringify(stillMine));

  console.log('\n── clearing ──');
  r=await call('kh_recovery_set',{p_hash:VICTIM,p_email:''});
  ok('the owner can clear their address', r.status===200, r.status+' '+r.body);
  row=db.prepare('SELECT email FROM kh_recovery WHERE u=?').get(victimU);
  ok('...and it is really gone',          !row, JSON.stringify(row));

  console.log('\n── the destination is no longer an input, anywhere ──');
  const mail=readFileSync(new URL('../../email-worker.js',import.meta.url),'utf8');
  const app =readFileSync(new URL('../../index.html',import.meta.url),'utf8');
  /* resetRequest must not read a destination out of the request body. */
  const reqFn=(/async function resetRequest\(req, env\) \{[\s\S]*?\n\}/.exec(mail)||[''])[0];
  ok('the mail worker no longer takes `to` from the request', !/b\.to/.test(reqFn), reqFn.slice(0,200));
  ok('...it looks the address up instead', /resetLookupEmail\(env, u\)/.test(reqFn));
  ok('...using the reset secret to do so',  /X-KH-Reset-Secret/.test(mail));
  ok('the client sends only the username hash', /_khResetPost\('\/reset\/request',\{u:uHash\}\)/.test(app));
  ok('...and the form has no destination box at all', !/placeholder:'Recovery email'/.test(app));

  console.log('\n── an account that has no address on file ──');
  /* It must look exactly like one that does, or the form becomes a way to test
     whether a username exists and whether it can be reset. */
  ok('the mail worker returns ok:true either way',
     /No account, or no recovery address[\s\S]{0,400}return json\(\{ ok: true \}\)/.test(mail));

  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
