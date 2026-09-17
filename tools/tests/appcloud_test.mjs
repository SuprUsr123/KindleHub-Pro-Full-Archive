/* Community-app cloud storage: the thing that makes an app multiplayer.

   A published app runs under connect-src 'none' with no same-origin, so it
   cannot make a network call — that is the whole reason running a stranger's
   code is safe. Multiplayer therefore goes through the host page, which calls
   these RPCs. The properties that must hold:

     - two players in the same room see each other's writes
     - two rooms never collide, and two APPS never collide, because the app id
       is stamped by the host rather than sent by the app
     - quotas come from the payer's plan and are enforced HERE, not in the
       browser, since the browser is the thing being sandboxed
     - a signed-out visitor cannot write at all

   Run: NODE_PATH=/opt/node22/lib/node_modules node --experimental-sqlite tools/tests/appcloud_test.mjs */
import { DatabaseSync } from 'node:sqlite';
import { webcrypto } from 'node:crypto';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
import worker, { ensureSchema, stripeWriteEnt } from '../../api-worker.js';

let pass=0,fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x!==undefined&&!c?'  -- '+String(x).slice(0,200):''));};
function d1(db){return{prepare(sql){let p=[];const api={bind(...a){p=a.map(x=>x===undefined?null:x);return api;},async run(){const r=db.prepare(sql).run(...p);return{meta:{changes:r.changes,last_row_id:r.lastInsertRowid}};},async all(){return{results:db.prepare(sql).all(...p)};},async first(){return db.prepare(sql).get(...p)||null;}};return api;},async batch(s){for(const x of s)await x.run();}};}

const A='a'.repeat(64), B='b'.repeat(64), FREE='c'.repeat(64);

(async()=>{
  const db=new DatabaseSync(':memory:');
  const env={DB:d1(db),ALLOW_ORIGIN:'*'};
  await ensureSchema(env.DB);
  const now=Math.floor(Date.now()/1000);
  for(const [h,name,tier] of [[A,'alice','max'],[B,'bob','max'],[FREE,'carol',null]]){
    db.prepare("INSERT OR REPLACE INTO kh_users (hash,email,state,updated_at) VALUES (?,?,?,?)").run(h,name,'',new Date().toISOString());
    if(tier) await stripeWriteEnt(env.DB,h,tier,'active','month',now+30*86400,'cus_'+name,'sub_'+name,0);
  }
  const call=(fn,p)=>worker.fetch(new Request('https://x/rest/v1/rpc/'+fn,{method:'POST',
    headers:{'Content-Type':'application/json'},body:JSON.stringify(p)}),env,{waitUntil(){}} )
    .then(async r=>({status:r.status, body:await r.text()}));
  const j=s=>{try{return JSON.parse(s);}catch(_){return null;}};

  console.log('\n── two players, one room: that is multiplayer ──');
  await call('kh_app_put',{p_hash:A,p_app:'chess',p_room:'game7',p_key:'move',p_value:'e2e4'});
  let r=await call('kh_app_get',{p_hash:B,p_app:'chess',p_room:'game7',p_key:'move'});
  ok('the other player reads what the first one wrote', j(r.body)&&j(r.body).v==='e2e4', r.body);
  await call('kh_app_put',{p_hash:B,p_app:'chess',p_room:'game7',p_key:'reply',p_value:'e7e5'});
  r=await call('kh_app_list',{p_hash:A,p_app:'chess',p_room:'game7'});
  ok('...and listing the room shows both moves', (j(r.body).rows||[]).length===2, r.body);

  console.log('\n── the walls between rooms and between apps ──');
  r=await call('kh_app_get',{p_hash:A,p_app:'chess',p_room:'game8',p_key:'move'});
  ok('a different room does not see it', j(r.body)&&j(r.body).v===null, r.body);
  r=await call('kh_app_get',{p_hash:A,p_app:'checkers',p_room:'game7',p_key:'move'});
  ok('a different APP does not see it', j(r.body)&&j(r.body).v===null, r.body);

  console.log('\n── signed out means read-only ──');
  r=await call('kh_app_put',{p_hash:'',p_app:'chess',p_room:'game7',p_key:'x',p_value:'1'});
  ok('a write with no account is refused', r.status===401, r.status+' '+r.body);
  r=await call('kh_app_put',{p_hash:'not-a-hash',p_app:'chess',p_room:'g',p_key:'x',p_value:'1'});
  ok('...and so is a made-up one', r.status===401, r.status);

  console.log('\n── the app id and room cannot be used to escape ──');
  r=await call('kh_app_get',{p_hash:A,p_app:'../other',p_room:'game7',p_key:'move'});
  ok('a path-like app id is rejected outright', r.status===400, r.status+' '+r.body);
  r=await call('kh_app_get',{p_hash:A,p_app:'chess',p_room:'a,b)--',p_key:'move'});
  ok('...and so is a room name with punctuation in it', r.status===400, r.status+' '+r.body);

  console.log('\n── quotas come from the plan, and are enforced here ──');
  const big='x'.repeat(3000);
  r=await call('kh_app_put',{p_hash:FREE,p_app:'chess',p_room:'g',p_key:'k',p_value:big});
  ok('a free player cannot store an oversized value', r.status===413 && /APP_VALUE/.test(r.body), r.status+' '+r.body);
  r=await call('kh_app_put',{p_hash:A,p_app:'chess',p_room:'g',p_key:'k',p_value:big});
  ok('...but a Max player can', r.status===200, r.status+' '+r.body);
  const q=j(r.body);
  ok('the response tells the app its plan and allowance',
     !!q && q.tier==='max' && q.quota && q.quota.writesPerDay>0, r.body);

  console.log('\n── a write budget that actually runs out ──');
  /* Drive a free account past its daily writes. The counter is shared with the
     AI meter's table, so this also proves the two do not collide. */
  const wkey='a:'+FREE.slice(0,32)+':'+new Date().toISOString().slice(0,10);
  db.prepare("INSERT INTO kh_shared_api_usage(date,count) VALUES(?,?) ON CONFLICT(date) DO UPDATE SET count=?")
    .run(wkey,500,500);
  r=await call('kh_app_put',{p_hash:FREE,p_app:'chess',p_room:'g',p_key:'k2',p_value:'small'});
  ok('past the daily write allowance the save is refused',
     r.status===429 && /APP_QUOTA/.test(r.body), r.status+' '+r.body);
  ok('...with a message a player can act on', /plan can save/.test(r.body), r.body);
  r=await call('kh_app_get',{p_hash:FREE,p_app:'chess',p_room:'game7',p_key:'move'});
  ok('...but READING still works, so the game is not unplayable', r.status===200, r.status);

  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
