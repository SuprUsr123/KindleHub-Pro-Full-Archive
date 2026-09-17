/* A database created by an EARLIER deploy must still receive new columns.

   ensureSchema has a cheap fast path: if kh_config.schema_v matches SCHEMA_V it
   returns early and skips ALL DDL and ALL column migrations. SCHEMA_V used to be
   a hand-maintained literal, so forgetting to bump it meant every existing
   database skipped the new migration FOREVER and any statement touching the new
   column threw a generic 500 "Internal error". That is what broke "Gift a plan":
   kh_entitlements had no last_event_id, which stripeWriteEnt writes on every
   entitlement write (checkout AND gifts).

   SCHEMA_V is now DERIVED from the DDL + migration text, so it cannot be
   forgotten. This test pins that, and pins the end-to-end repair.

   Run: NODE_PATH=/opt/node22/lib/node_modules node --experimental-sqlite tools/tests/schemamig_test.mjs */
import { DatabaseSync } from 'node:sqlite';
import { webcrypto } from 'node:crypto';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import worker, { ensureSchema } from '../../api-worker.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
let pass=0,fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x&&!c?('  -- '+String(x).slice(0,200)):''));};
function d1(db){return{prepare(sql){let p=[];const api={bind(...a){p=a.map(x=>x===undefined?null:x);return api;},async run(){const r=db.prepare(sql).run(...p);return{meta:{changes:r.changes,last_row_id:r.lastInsertRowid}};},async all(){return{results:db.prepare(sql).all(...p)};},async first(){return db.prepare(sql).get(...p)||null;}};return api;},async batch(s){for(const x of s)await x.run();}};}

const SECRET='admintestsecret';

/* ── 1. the stamp is derived, not a literal ── */
const src=fs.readFileSync(path.resolve(__dirname,'../../api-worker.js'),'utf8');
ok('SCHEMA_V is derived from the schema content, not a hand-typed literal',
   /const SCHEMA_V\s*=\s*_schemaStamp\(\)/.test(src));
ok('...and the migrations live in a list the stamp can hash',
   /const SCHEMA_MIGRATIONS\s*=\s*\[/.test(src));
ok('...and ensureSchema runs that list', /for\(const _mig of SCHEMA_MIGRATIONS\)/.test(src));

/* ── 2. THE REAL BUG: a DB stamped by an older deploy, missing a new column ── */
const db=new DatabaseSync(':memory:');
const DB=d1(db);
const env={ADMIN_SECRET:SECRET, DB};

/* Build the "old deploy" shape by hand: kh_entitlements WITHOUT last_event_id,
   and a schema_v stamp already present (as an older deploy would have left). */
db.prepare("CREATE TABLE kh_config (k TEXT PRIMARY KEY, v TEXT)").run();
db.prepare("CREATE TABLE kh_entitlements (hash TEXT PRIMARY KEY, tier TEXT DEFAULT 'free', status TEXT DEFAULT '', interval TEXT DEFAULT '', current_period_end INTEGER DEFAULT 0, stripe_customer_id TEXT DEFAULT '', stripe_sub_id TEXT DEFAULT '', updated_at TEXT)").run();
db.prepare("CREATE TABLE kh_users (hash TEXT PRIMARY KEY, email TEXT, state TEXT, updated_at TEXT)").run();
db.prepare("INSERT INTO kh_config(k,v) VALUES('schema_v','v2026-07-27a')").run();

const cols0=db.prepare("PRAGMA table_info(kh_entitlements)").all().map(c=>c.name);
ok('the simulated OLD database really is missing last_event_id', cols0.indexOf('last_event_id')<0, cols0.join(','));

await ensureSchema(DB, env);
const cols1=db.prepare("PRAGMA table_info(kh_entitlements)").all().map(c=>c.name);
ok('ensureSchema ADDS the missing column despite the pre-existing stamp',
   cols1.indexOf('last_event_id')>=0, cols1.join(','));
ok('...and re-stamps to the derived version',
   (db.prepare("SELECT v FROM kh_config WHERE k='schema_v'").get()||{}).v!=='v2026-07-27a');

/* ── 3. end to end: Gift a plan now succeeds on that repaired database ── */
const TARGET='mr.ultimate';
db.prepare("INSERT INTO kh_users (hash,email,state,updated_at) VALUES (?,?,?,?)")
  .run('b'.repeat(64), TARGET, '{}', new Date().toISOString());
const res=await worker.fetch(new Request('https://x/rest/v1/rpc/kh_grant_plan',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({p_token:SECRET,p_name:TARGET,p_tier:'plus',p_days:365})
}), env, {waitUntil(){}});
const body=await res.json().catch(()=>({}));
ok('Gift a plan returns 200 (was a generic 500 "Internal error")', res.status===200, res.status+' '+JSON.stringify(body));
ok('...and the entitlement row is actually written',
   (db.prepare("SELECT tier,status FROM kh_entitlements WHERE hash=?").get('b'.repeat(64))||{}).tier==='plus');

/* ── 4. gifting a name that does not exist gives a CLEAR message, not a 500 ── */
const res2=await worker.fetch(new Request('https://x/rest/v1/rpc/kh_grant_plan',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({p_token:SECRET,p_name:'nobody-here-at-all',p_tier:'plus',p_days:31})
}), env, {waitUntil(){}});
const body2=await res2.json().catch(()=>({}));
ok('an unknown username gives a readable "no account" message, not Internal error',
   res2.status===404 && /No account called/i.test(String(body2.message||'')), res2.status+' '+JSON.stringify(body2));

console.log('\n'+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
