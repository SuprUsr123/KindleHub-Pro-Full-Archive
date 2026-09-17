import { DatabaseSync } from 'node:sqlite';
import { webcrypto } from 'node:crypto';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
import worker,{ensureSchema} from '../../api-worker.js';
let pass=0,fail=0;const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x&&!c?'  -- '+x:''));};
function d1(db){return{prepare(sql){let p=[];const a={bind(...x){p=x.map(v=>v===undefined?null:v);return a;},async run(){const r=db.prepare(sql).run(...p);return{meta:{changes:r.changes}};},async all(){return{results:db.prepare(sql).all(...p)};},async first(){return db.prepare(sql).get(...p)||null;}};return a;},async batch(s){for(const x of s)await x.run();}};}
globalThis.fetch=async()=>new Response('data: {}\n\n',{status:200,headers:{'Content-Type':'text/event-stream'}});
const db=new DatabaseSync(':memory:');const env={DB:d1(db),GEMINI_KEY:'k',ALLOW_ORIGIN:'*'};
await ensureSchema(env.DB);
const H='a'.repeat(64);
/* the account must EXIST for it to get its own bucket (issue #3) */
db.prepare("INSERT OR REPLACE INTO kh_users (hash,email,state,updated_at) VALUES (?,?,?,?)").run(H,'u','', new Date().toISOString());
const call=(model,extra)=>worker.fetch(new Request('https://x/functions/v1/kh-gemini-proxy',{method:'POST',headers:{'Content-Type':'application/json','cf-connecting-ip':'9.9.9.9'},body:JSON.stringify(Object.assign({model:model||'gemini-3.5-flash-lite',payload:{},hash:H},extra||{}))}),env);
// burn the free allowance
let last;for(let i=0;i<6;i++)last=await call();
ok('free allowance exhausted (429)', last.status===429, 'status='+last.status);
// THE BYPASS: a "new chat" sends no history — the counter is per ACCOUNT+DAY
const newChat=await call('gemini-3.5-flash-lite',{fresh:true,conversationId:'brand-new'});
ok('NEW CHAT does NOT reset the limit', newChat.status===429, 'status='+newChat.status);
// nor does claiming a different tier or a "free" flag
const flag=await call('gemini-3.5-flash-lite',{free:true,tier:'max',isGame:true});
ok('client-supplied free/tier/isGame flags are ignored', flag.status===429, 'status='+flag.status);
// GAMES: gemma is unmetered even when the plan allowance is spent
const game=await call('gemma-4-31b-it');
ok('GAMES still work after the limit (gemma unmetered)', game.status===200, 'status='+game.status);
for(let i=0;i<30;i++)await call('gemma-4-31b-it');
const gameAfter=await call('gemma-4-31b-it');
ok('gemma stays free after 30+ more calls', gameAfter.status===200, 'status='+gameAfter.status);
// and gemma did NOT consume the paid allowance
const stillBlocked=await call('gemini-3.5-flash-lite');
ok('gemma usage did not affect the plan counter', stillBlocked.status===429);
// #3: random unknown hashes must NOT each get a fresh allowance
let rotated=0;
for(let i=0;i<25;i++){
  const fake=(i.toString(16).repeat(64)).slice(0,64);
  const r=await call('gemini-3.5-flash-lite');
  const rr=await worker.fetch(new Request('https://x/functions/v1/kh-gemini-proxy',{method:'POST',headers:{'Content-Type':'application/json','cf-connecting-ip':'9.9.9.9'},body:JSON.stringify({model:'gemini-3.5-flash-lite',payload:{},hash:fake})}),env);
  if(rr.status===200)rotated++;
}
/* Unknown identities all share ONE IP bucket, so rotating hashes yields a small
   BOUNDED total (the IP's own free allowance) instead of a fresh 5 per hash.
   Before the fix, 25 rotations would have yielded 25 successes. */
ok('rotating 25 random hashes is bounded by the IP bucket, not 5-each',
   rotated<=5, rotated+' of 25 fake hashes got through (unbounded = broken)');
console.log(pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
