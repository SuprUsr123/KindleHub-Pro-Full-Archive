import { DatabaseSync } from 'node:sqlite';
import { webcrypto } from 'node:crypto';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
import worker,{ensureSchema,stripeWriteEnt} from '../../api-worker.js';
let pass=0,fail=0;const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x&&!c?'  -- '+x:''));};
function d1(db){return{prepare(sql){let p=[];const a={bind(...x){p=x.map(v=>v===undefined?null:v);return a;},async run(){const r=db.prepare(sql).run(...p);return{meta:{changes:r.changes}};},async all(){return{results:db.prepare(sql).all(...p)};},async first(){return db.prepare(sql).get(...p)||null;}};return a;},async batch(s){for(const x of s)await x.run();}};}
globalThis.fetch=async()=>new Response('data: {}\n\n',{status:200,headers:{'Content-Type':'text/event-stream'}});
const db=new DatabaseSync(':memory:');
const env={DB:d1(db),GEMINI_KEY:'k',ALLOW_ORIGIN:'*'};
await ensureSchema(env.DB);
const H='a'.repeat(64), HP='b'.repeat(64);
/* Issue #3: an account only gets its own allowance bucket once it EXISTS in
   kh_users — a made-up hash falls back to a shared IP bucket. Seed both. */
db.prepare("INSERT OR REPLACE INTO kh_users (hash,email,state,updated_at) VALUES (?,?,?,?)").run(H,'a','',new Date().toISOString());
db.prepare("INSERT OR REPLACE INTO kh_users (hash,email,state,updated_at) VALUES (?,?,?,?)").run(HP,'b','',new Date().toISOString());
const call=(hash,model)=>worker.fetch(new Request('https://x/functions/v1/kh-gemini-proxy',{method:'POST',headers:{'Content-Type':'application/json','cf-connecting-ip':'1.2.3.4'},body:JSON.stringify({model:model||'gemini-3.5-flash-lite',payload:{},hash:hash})}),env);
// FREE: 5/day
let last;for(let i=0;i<5;i++){last=await call(H);}
ok('free tier: first 5 calls allowed', last.status===200, 'status='+last.status);
const sixth=await call(H);
const sj=await sixth.json().catch(()=>({}));
ok('free tier: 6th call blocked (429 TIER_CAP)', sixth.status===429&&sj.code==='TIER_CAP', 'status='+sixth.status+' '+JSON.stringify(sj));
ok('cap message names the real limit', sj.cap===5&&sj.tier==='free', JSON.stringify(sj));
// model tiering: free cannot use a scarce Flash model
const scarce=await call(HP,'gemini-3.5-flash');
const scj=await scarce.json().catch(()=>({}));
ok('free tier refused a Pro-only model (403 TIER_MODEL)', scarce.status===403&&scj.code==='TIER_MODEL', 'status='+scarce.status);
// PRO: bigger pool + full models
await stripeWriteEnt(env.DB,HP,'pro','active','month',Math.floor(Date.now()/1000)+8640000,'cus','sub');
const proScarce=await call(HP,'gemini-3.5-flash');
ok('pro tier CAN use the scarce model', proScarce.status===200, 'status='+proScarce.status);
let pl;for(let i=0;i<20;i++){pl=await call(HP);}
ok('pro tier still fine after 20 calls (500/day)', pl.status===200, 'status='+pl.status);
// a client CANNOT claim a tier
const liar=await worker.fetch(new Request('https://x/functions/v1/kh-gemini-proxy',{method:'POST',headers:{'Content-Type':'application/json','cf-connecting-ip':'1.2.3.4'},body:JSON.stringify({model:'gemini-3.5-flash-lite',payload:{},hash:H,tier:'max'})}),env);
ok('client-claimed tier is ignored (still capped)', liar.status===429, 'status='+liar.status);
// guests metered by IP
const g=await call('');
ok('signed-out guest is metered, not rejected', g.status===200||g.status===429, 'status='+g.status);
console.log(pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
