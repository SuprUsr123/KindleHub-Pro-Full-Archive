/* The admin secret, the agent secret and a moderator code are bearer tokens:
   whoever holds one is that role. Their only defence is being unguessable, and
   the general per-IP limits cannot be that defence — they are deliberately
   loose (240 per 10s, 150,000 a day) because Kindle Silk routes a whole region
   through one shared Amazon proxy IP, so tightening them would take those users
   offline. 150,000 guesses a day is a lot of guesses.

   So failures are counted separately and tightly. What makes a tight limit safe
   here is that only FAILURES count: an ordinary user never sends one of these
   headers, and the owner sends a token that works, so neither ever contributes.

   The subtle part — and the reason this file exists — is that being over the
   limit has to refuse the request BEFORE the token is evaluated. Counting
   failures but still honouring a correct guess would leave the door open to
   exactly the attack the counter is for.

   Run: node --experimental-sqlite tools/tests/credbrute_test.mjs */
import { DatabaseSync } from 'node:sqlite';
import { webcrypto } from 'node:crypto';
import worker, { ensureSchema, _syncAdminSecret } from '../../api-worker.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

let pass = 0, fail = 0;
const ok = (n, c, extra) => {
  if (c) { pass++; console.log('PASS ' + n); }
  else { fail++; console.log('FAIL ' + n + (extra !== undefined ? '  -- ' + extra : '')); }
};

const db = new DatabaseSync(':memory:');
const DB = {
  prepare(sql) {
    const st = db.prepare(sql);
    return {
      bind(...b) { this._b = b; return this; },
      async run() { st.run(...(this._b || [])); return { meta: {} }; },
      async first() { return st.get(...(this._b || [])) || null; },
      async all() { return { results: st.all(...(this._b || [])) }; },
    };
  },
};

/* The guard reads and writes through the Cache API, which the other worker
   suites do not define — there, rlHit fails open and every limiter is inert.
   A memory-backed cache is the whole point here, so this one provides it. */
const store = new Map();
globalThis.caches = {
  default: {
    async match(k) { return store.has(k) ? new Response(store.get(k)) : undefined; },
    async put(k, r) { store.set(k, await r.text()); },
  },
};

const ADMIN = 'admin-code-under-test';
const AGENT = 'agent-code-under-test';
const MOD   = 'mod-code-under-test';
const modHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(MOD)))]
  .map(b => b.toString(16).padStart(2, '0')).join('');
const env = { DB, ADMIN_SECRET: ADMIN, AGENT_SECRET: AGENT, MOD_HASHES: modHash, ALLOW_ORIGIN: '*' };

await ensureSchema(DB, env);
await _syncAdminSecret(env);

const IP = '203.0.113.9', OTHER = '198.51.100.4';
const req = (token, ip, header) => new Request('https://api.test/rest/v1/kh_feedback?select=id', {
  headers: Object.assign({ 'cf-connecting-ip': ip || IP },
    token ? { [header || 'x-kh-admin']: token } : {}),
});
const call = (r) => worker.fetch(r, env, { waitUntil() {} });

/* ── an ordinary request is never touched ──────────────────────────────── */
let r = await call(req(null));
ok('a request with no credential header is untouched', r.status !== 429, 'status ' + r.status);

/* ── the right token works, and does not accumulate ────────────────────── */
r = await call(req(ADMIN));
ok('the correct admin secret is accepted', r.status !== 429, 'status ' + r.status);
for (let i = 0; i < 20; i++) await call(req(ADMIN));
r = await call(req(ADMIN));
ok('...and twenty correct uses do not trip anything', r.status !== 429, 'status ' + r.status);

/* ── wrong tokens accumulate, and then the door shuts ──────────────────── */
let firstLock = -1;
for (let i = 0; i < 14; i++) {
  const res = await call(req('wrong-guess-' + i));
  if (res.status === 429 && firstLock < 0) firstLock = i;
}
ok('repeated wrong tokens are locked out', firstLock >= 0, 'never locked');
ok('...after about ten, not after hundreds', firstLock >= 8 && firstLock <= 11, 'locked at attempt ' + firstLock);

const body = await (await call(req('another-guess'))).text();
ok('the refusal identifies itself so the client can explain it', body.indexOf('CF_CRED') >= 0, body.slice(0, 120));

/* ── THE ONE THAT MATTERS: past the limit, a CORRECT token is refused too.
   Counting failures but still honouring a lucky guess would leave open the
   exact attack the counter exists to stop. ─────────────────────────────── */
r = await call(req(ADMIN));
ok('past the limit even the correct secret is refused, not merely counted',
   r.status === 429, 'status ' + r.status);

/* ── the lockout is per connection, not global ─────────────────────────── */
r = await call(req(ADMIN, OTHER));
ok('another connection is unaffected', r.status !== 429, 'status ' + r.status);
r = await call(req(null, IP));
ok('...and the locked connection can still use the app normally',
   r.status !== 429, 'status ' + r.status);

/* ── the agent secret is guarded by the same counter ───────────────────── */
const IP2 = '203.0.113.77';
for (let i = 0; i < 12; i++) await call(req('bad-agent-' + i, IP2, 'x-kh-agent'));
r = await call(req(AGENT, IP2, 'x-kh-agent'));
ok('the agent secret is guarded too', r.status === 429, 'status ' + r.status);

/* ── a valid MOD code sent in the admin header is not a failure ─────────
   isMod is a legitimate use of that header; counting it would lock out every
   moderator after ten ordinary requests. */
const IP3 = '203.0.113.88';
for (let i = 0; i < 14; i++) await call(req(MOD, IP3));
r = await call(req(MOD, IP3));
ok('a valid moderator code is not counted as a failed admin attempt',
   r.status !== 429, 'status ' + r.status);

/* ── no cache, no lockout: the backstop must never become the failure ──── */
const saved = globalThis.caches;
globalThis.caches = { default: { async match() { throw new Error('no cache'); }, async put() { throw new Error('no cache'); } } };
r = await call(req(ADMIN, '203.0.113.200'));
ok('with the cache unavailable the guard fails open rather than locking everyone out',
   r.status !== 429, 'status ' + r.status);
globalThis.caches = saved;

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
