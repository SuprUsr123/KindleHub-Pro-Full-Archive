/* Payment Links, and being able to tell a real plan from a rehearsal.

   Two ways to lose money here and they pull in opposite directions.

   One: a Payment Link opened without a client_reference_id. Stripe charges the
   card, the webhook arrives carrying nothing that identifies the payer, and the
   customer sits on free with a charge on their statement. So the URL must only
   ever leave the Worker with an account attached, and a payment that arrives
   unattributable has to be parked somewhere visible rather than dropped.

   Two: an entitlement that exists with nothing behind it. The /stripe/simulate
   rehearsal writes a genuine row on purpose — that is what makes it a real test
   — which means "Pro" can be true in D1 and absent from Stripe without anything
   being wrong. Unless the owner can see WHICH, a correct count reads as a bug.

   Run: node --experimental-sqlite tools/tests/paylink_test.mjs */
import { DatabaseSync } from 'node:sqlite';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import worker, { ensureSchema, _syncAdminSecret } from '../../api-worker.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

let pass = 0, fail = 0;
const ok = (n, c, extra) => {
  if (c) { pass++; console.log('PASS ' + n); }
  else { fail++; console.log('FAIL ' + n + (extra ? '  -- ' + String(extra).slice(0, 300) : '')); }
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

const ADMIN = 'admin-code-under-test';
const env = { DB, ADMIN_SECRET: ADMIN, ALLOW_ORIGIN: '*' };
await ensureSchema(DB, env);
await _syncAdminSecret(env);

const ACC = 'b'.repeat(64);
db.prepare('INSERT INTO kh_users(hash,email,state) VALUES(?,?,?)').run(ACC, 'payer', '{}');

const post = (path, body, headers) =>
  worker.fetch(new Request('https://x' + path, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}),
    body: JSON.stringify(body),
  }), env, { waitUntil() {} });

/* ── the link always carries an account ──────────────────────────────────── */
let r = await post('/stripe/link', { hash: ACC, tier: 'pro', interval: 'month' });
let j = await r.json();
ok('a payment link comes back for a real plan', r.status === 200 && /^https:\/\/buy\.stripe\.com\//.test(j.url || ''), JSON.stringify(j));
ok('...with a client_reference_id attached — without one the payment cannot be attributed',
   /[?&]client_reference_id=kh_[a-f0-9]{32}/.test(j.url || ''), j.url);

const bid = (String(j.url).match(/client_reference_id=(kh_[a-f0-9]{32})/) || [])[1];
const stored = db.prepare('SELECT billing_id FROM kh_entitlements WHERE hash=?').get(ACC);
ok('the billing id is the one stored for this account, so the webhook can map it back',
   stored && stored.billing_id === bid, bid + ' vs ' + (stored && stored.billing_id));
ok('the account hash is NOT in the URL — it is also the encryption key',
   String(j.url).indexOf(ACC) < 0);

r = await post('/stripe/link', { hash: ACC, tier: 'pro', interval: 'year' });
const yUrl = (await r.json()).url || '';
ok('monthly and yearly are different links', yUrl && yUrl.split('?')[0] !== String(j.url).split('?')[0], yUrl);

r = await post('/stripe/link', { hash: ACC, tier: 'enterprise', interval: 'month' });
ok('an unknown plan is refused', r.status === 400, r.status);
r = await post('/stripe/link', { hash: 'not-a-hash', tier: 'pro', interval: 'month' });
ok('a malformed account is refused', r.status === 400, r.status);

/* A well-formed hash for an account that was never registered used to produce a
   live payment link and an entitlement row — so a payment could be attributed
   to an identity nobody owns, and claimed later by registering it. */
r = await post('/stripe/link', { hash: 'f'.repeat(64), tier: 'pro', interval: 'month' });
ok('a well-formed hash with no account behind it gets no link', r.status === 403, r.status);
ok('...and no billing identity was created for it',
   !db.prepare('SELECT hash FROM kh_entitlements WHERE hash=?').get('f'.repeat(64)));

/* Every one of the six must be a real Stripe link, or a plan silently cannot
   be bought. */
const wsrc = readFileSync(new URL('../../api-worker.js', import.meta.url), 'utf8');
const linkBlock = (wsrc.match(/const STRIPE_LINKS_DEFAULT = \{([\s\S]*?)\n\};/) || [])[1] || '';
const urls = (linkBlock.match(/'https:\/\/buy\.stripe\.com\/[A-Za-z0-9]+'/g) || []);
ok('all six plan/interval links are present', urls.length === 6, urls.length + ' found');
ok('...and all six are distinct', new Set(urls).size === 6, urls.join(' '));
for (const tier of ['plus', 'pro', 'max']) {
  for (const iv of ['month', 'year']) {
    const res = await post('/stripe/link', { hash: ACC, tier, interval: iv });
    const u = (await res.json()).url || '';
    if (!/^https:\/\/buy\.stripe\.com\/[A-Za-z0-9]+\?client_reference_id=/.test(u)) {
      ok(tier + '/' + iv + ' resolves to a usable link', false, u);
    }
  }
}
ok('every tier and interval resolves to a usable link', true);

/* ── a payment nobody can be matched to is parked, not dropped ───────────── */
const conf = () => { const x = db.prepare("SELECT v FROM kh_config WHERE k='stripe_unmapped'").get(); return x ? JSON.parse(x.v || '[]') : []; };
ok('nothing is parked to begin with', conf().length === 0);

/* The webhook is signature-gated, so drive the parking branch directly — it is
   the one where money has already changed hands. */
const { stripeParkUnmapped } = await import('../../api-worker.js');
const SESSION = { id: 'cs_test_unmapped', subscription: 'sub_orphan', client_reference_id: '',
                  customer_details: { email: 'someone@example.com' }, amount_total: 500, currency: 'gbp' };
await stripeParkUnmapped(SESSION, DB);
let parked = conf();
ok('an unattributable payment is parked where the admin can see it',
   parked.length === 1 && parked[0].sub === 'sub_orphan' && parked[0].email === 'someone@example.com',
   JSON.stringify(parked));
ok('...with the amount, so it can be matched against Stripe',
   parked[0].amount === 500 && parked[0].currency === 'gbp', JSON.stringify(parked[0]));
await stripeParkUnmapped(SESSION, DB);
ok('...and a redelivery of the same session does not park it twice', conf().length === 1, conf().length);
for (let i = 0; i < 60; i++) await stripeParkUnmapped({ id: 'cs_' + i, subscription: 'sub_' + i }, DB);
ok('...and the list is capped so retries cannot grow it without bound',
   conf().length === 50, conf().length);

/* ── a rehearsal grant is visibly a rehearsal ────────────────────────────── */
r = await post('/stripe/simulate', { hash: ACC, tier: 'pro', interval: 'month' }, { 'X-KH-Admin': ADMIN });
ok('the admin rehearsal grants Pro', r.status === 200, r.status);

const rpc = (fn, body) => post('/rest/v1/rpc/' + fn, body);
r = await rpc('kh_plan_list', { p_token: ADMIN });
j = await r.json();
ok('the paid accounts can be listed', r.status === 200 && Array.isArray(j.rows), JSON.stringify(j).slice(0, 200));
const row = (j.rows || [])[0] || {};
ok('...the rehearsal grant is labelled as one, not as a payment',
   row.source === 'simulated' && String(row.sub || '').indexOf('sim_') === 0,
   JSON.stringify(row));
ok('...and it names the account so it can be chased', row.who === 'payer', row.who);
ok('the account hash is never returned — it is the encryption key',
   JSON.stringify(j).indexOf(ACC) < 0);
ok('the parked payment rides along so both halves are on one screen',
   Array.isArray(j.unmapped), JSON.stringify(j.unmapped || []).slice(0, 120));

r = await rpc('kh_plan_list', { p_token: 'not-the-admin' });
ok('a non-admin cannot list who is paying', r.status === 403, r.status);

/* A REAL subscription must read differently from the rehearsal. */
db.prepare("UPDATE kh_entitlements SET stripe_sub_id='sub_real123', stripe_customer_id='cus_x' WHERE hash=?").run(ACC);
j = await (await rpc('kh_plan_list', { p_token: ADMIN })).json();
ok('a real subscription is labelled as real', (j.rows[0] || {}).source === 'stripe', JSON.stringify(j.rows[0]));

/* And a paid tier with NO subscription id at all — which should never happen —
   must not be quietly indistinguishable from a healthy one. */
db.prepare("UPDATE kh_entitlements SET stripe_sub_id='', stripe_customer_id='' WHERE hash=?").run(ACC);
j = await (await rpc('kh_plan_list', { p_token: ADMIN })).json();
ok('a paid tier with no subscription at all is flagged, not hidden',
   (j.rows[0] || {}).source === 'none', JSON.stringify(j.rows[0]));

/* ── gifting a plan, by username ─────────────────────────────────────────── */
db.prepare("UPDATE kh_entitlements SET stripe_sub_id='', stripe_customer_id='', tier='free', status='' WHERE hash=?").run(ACC);
db.prepare("INSERT INTO kh_users(hash,email,state) VALUES(?,?,?)").run('c'.repeat(64), 'MrUltimate', '{}');

r = await rpc('kh_grant_plan', { p_token: ADMIN, p_name: 'MrUltimate', p_tier: 'pro', p_days: 90 });
j = await r.json();
ok('a plan can be gifted by username, with no hash in hand', r.status === 200 && j.ok, JSON.stringify(j));
let ent = db.prepare('SELECT tier,status,stripe_sub_id FROM kh_entitlements WHERE hash=?').get('c'.repeat(64));
ok('...the entitlement is really written', ent && ent.tier === 'pro' && ent.status === 'active', JSON.stringify(ent));
ok('...marked a gift, so it never reads as a sale', String(ent.stripe_sub_id).indexOf('gift_') === 0, ent.stripe_sub_id);
ok('...the username is matched case-insensitively, as everywhere else', j.name === 'mrultimate', j.name);
ok('...and they are told why, so a plan appearing is not read as a billing error',
   !!db.prepare("SELECT id FROM kh_announcements WHERE targets LIKE '%mrultimate%'").get());
ok('the account hash is not handed back', JSON.stringify(j).indexOf('c'.repeat(64)) < 0);

j = await (await rpc('kh_plan_list', { p_token: ADMIN })).json();
ok('a gift is labelled a gift in the list',
   (j.rows || []).some(x => x.who === 'MrUltimate' && x.source === 'gift'), JSON.stringify(j.rows));

r = await rpc('kh_grant_plan', { p_token: ADMIN, p_name: 'nobody-here', p_tier: 'pro' });
ok('an unknown username is refused', r.status === 404, r.status);
r = await rpc('kh_grant_plan', { p_token: 'not-admin', p_name: 'MrUltimate', p_tier: 'max' });
ok('a non-admin cannot gift plans', r.status === 403, r.status);

/* A real subscriber must not be overwritten — that would desync us from Stripe
   and could drop somebody off a plan they are paying for. */
db.prepare("UPDATE kh_entitlements SET stripe_sub_id='sub_live1' WHERE hash=?").run('c'.repeat(64));
r = await rpc('kh_grant_plan', { p_token: ADMIN, p_name: 'MrUltimate', p_tier: 'max' });
ok('a real Stripe subscription is never overwritten by a gift', r.status === 409, r.status);

db.prepare("UPDATE kh_entitlements SET stripe_sub_id='gift_pro_1' WHERE hash=?").run('c'.repeat(64));
r = await rpc('kh_grant_plan', { p_token: ADMIN, p_name: 'MrUltimate', p_tier: 'free' });
ent = db.prepare('SELECT tier FROM kh_entitlements WHERE hash=?').get('c'.repeat(64));
ok('a gift can be taken back', r.status === 200 && ent.tier === 'free', JSON.stringify(ent));

/* ── the client asks the Worker for the link, never builds one ───────────── */
const csrc = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
ok('the client never hard-codes a payment link', csrc.indexOf('buy.stripe.com') < 0);
ok('...it asks the Worker, which attaches the account',
   /_khStripePost\('\/stripe\/link',\{hash:S\.authToken,tier:planId,interval:interval\}\)/.test(csrc));
ok('checkout falls back to the link rather than dead-ending',
   /if\(r\.json\.disabled\|\|\(!r\.json\.url&&r\.json\.code!=='HAS_SUB'&&r\.status!==409\)\)\{\s*_khStripeLinkGo/.test(csrc));
ok('an existing subscriber is still sent to the portal, not to a second checkout',
   /r\.json\.code==='HAS_SUB'\|\|r\.status===409/.test(csrc));
/* The Kindle used to be refused outright, which is where nearly every upgrade
   ended given who uses this app. */
ok('a Kindle is handed the link instead of being told to find a computer',
   /if\(_isK\)\{_khKindlePaySheet\(planId,btn\);return;\}/.test(csrc) &&
   csrc.indexOf("Payments don't work in the Kindle browser") < 0);
const paySheet = (csrc.match(/function _khKindlePaySheet\(planId,btn\)\{[\s\S]*?\n    \}\n/) || [''])[0];
ok('...as a QR built from the account-attached link, not a bare one',
   /_khStripePost\('\/stripe\/link'/.test(paySheet) &&
   /api\.qrserver\.com[\s\S]{0,80}encodeURIComponent\(url\)/.test(paySheet),
   paySheet ? 'sheet found, ' + paySheet.length + ' chars' : 'sheet not found');
ok('...with the address shown too, since a Kindle on bad wifi may not load the QR',
   /ua\.textContent=url;/.test(csrc) && /im\.onerror=function\(\)\{try\{im\.remove\(\);\}/.test(csrc));
ok('the admin can open the who-is-paying list', /function _khPlanWho\(host\)\{/.test(csrc));
ok('...with a Gift button that asks by username, not by hash',
   /function _khGiftPlan\(after\)\{/.test(csrc) &&
   /_adminRpc\('kh_grant_plan',\{p_token:window\._adminToken\|\|'',p_name:nm,/.test(csrc));
ok('...and a test grant is spelled out there rather than shown as a sale',
   /TEST GRANT — not a payment, nothing in Stripe/.test(csrc));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
