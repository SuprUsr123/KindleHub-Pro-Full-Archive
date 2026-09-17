/* The AGENT role exists so an automated helper can tick suggestions off the
   list without holding the admin secret.

   The helper reads text other people wrote — chat, suggestions, bug reports —
   so anything the key CAN do, a stranger can try to talk it into doing. That
   makes the boundary the interesting part, and it is what this file tests:
   the key sets a feedback status and does nothing else. Not ban. Not warn. Not
   announce. Not read anything gated. Marking a suggestion wrongly is undone by
   re-opening it; the actions against a PERSON are not in the role at all.

   Run: node --experimental-sqlite tools/tests/agentrole_test.mjs */
import { DatabaseSync } from 'node:sqlite';
import { webcrypto } from 'node:crypto';
import worker, { ensureSchema, isAgent, _syncAdminSecret, _pokeReset } from '../../api-worker.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

let pass = 0, fail = 0;
const ok = (n, c, extra) => {
  if (c) { pass++; console.log('PASS ' + n); }
  else { fail++; console.log('FAIL ' + n + (extra ? '  -- ' + extra : '')); }
};

/* Minimal D1 shim over node:sqlite — same approach the other worker suites use. */
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

const AGENT = 'agent-code-under-test';
const ADMIN = 'admin-code-under-test';
const env = { DB, AGENT_SECRET: AGENT, ADMIN_SECRET: ADMIN, ALLOW_ORIGIN: '*' };

await ensureSchema(DB, env);
await _syncAdminSecret(env);

/* One open suggestion to work on. */
db.prepare("INSERT INTO kh_feedback(id,type,text,votes,status,author,date) VALUES('s1','request','a suggestion',3,'open','someone','2026-07-01')").run();

const call = (method, path, headers, body) =>
  worker.fetch(new Request('https://x/rest/v1/' + path, {
    method,
    headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}),
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env, { waitUntil() {} });

const statusOf = id => (db.prepare('SELECT status FROM kh_feedback WHERE id=?').get(id) || {}).status;

/* ── the one thing it is for ─────────────────────────────────────────────── */
let r = await call('PATCH', 'kh_feedback?id=eq.s1', { 'X-KH-Agent': AGENT, Prefer: 'return=minimal' },
  { status: 'done', status_at: new Date().toISOString() });
ok('the agent key marks a suggestion done', r.status === 204 && statusOf('s1') === 'done', r.status + ' ' + statusOf('s1'));

r = await call('PATCH', 'kh_feedback?id=eq.s1', { 'X-KH-Agent': AGENT, Prefer: 'return=minimal' }, { status: 'open' });
ok('...and can put it back', statusOf('s1') === 'open');

/* ── and nothing else ────────────────────────────────────────────────────── */
r = await call('PATCH', 'kh_feedback?id=eq.s1', { 'X-KH-Agent': AGENT, Prefer: 'return=minimal' },
  { status: 'done', text: 'rewritten by the agent', author: 'someone else', votes: 9999 });
const row = db.prepare('SELECT * FROM kh_feedback WHERE id=?').get('s1');
ok('extra columns are stripped, not written', row.text === 'a suggestion' && row.author === 'someone' && row.votes === 3,
   JSON.stringify({ text: row.text, author: row.author, votes: row.votes }));

r = await call('PATCH', 'kh_feedback?id=eq.s1', { 'X-KH-Agent': AGENT, Prefer: 'return=minimal' }, { status: 'deleted' });
ok('an invented status is refused', r.status === 400, String(r.status));

/* ── the queue: "Do it" approves, the helper builds, the helper closes ───── */
r = await call('PATCH', 'kh_feedback?id=eq.s1', { 'X-KH-Admin': ADMIN, Prefer: 'return=minimal' }, { status: 'queued' });
ok('the owner can queue a suggestion', statusOf('s1') === 'queued', statusOf('s1'));

r = await call('PATCH', 'kh_feedback?id=eq.s1', { 'X-KH-Agent': AGENT, Prefer: 'return=minimal' },
  { status: 'done', status_at: new Date().toISOString() });
ok('the helper closes what it built', statusOf('s1') === 'done', statusOf('s1'));

/* The owner's instruction rides on the row as a [BUILD] comment, appended
   through the same RPC any comment uses — so it is visible afterwards rather
   than hidden in a field, and it cannot lose-update a community comment. */
db.prepare("INSERT INTO kh_feedback(id,type,text,votes,status,author,date,comments) VALUES('s2','request','two things',1,'queued','someone','2026-07-02','[]')").run();
r = await call('POST', 'rpc/kh_add_comment', {},
  { p_table: 'kh_feedback', p_id: 's2', p_comment: { author: 'arancool3000', text: '[BUILD] do the first one but not the second' } });
const s2 = db.prepare('SELECT comments FROM kh_feedback WHERE id=?').get('s2');
const notes = JSON.parse(s2.comments || '[]').map(c => c.text).filter(t => t.indexOf('[BUILD]') === 0);
ok('the owner note is stored on the row', notes.length === 1 && /not the second/.test(notes[0]),
   JSON.stringify(notes));

/* A queued item must survive the 7-day prune — it is approved work waiting to
   be done, not a resolved row. */
const old = new Date(Date.now() - 30 * 86400000).toISOString();
db.prepare('UPDATE kh_feedback SET status_at=?, date=? WHERE id=?').run(old, old, 's2');
db.prepare("INSERT INTO kh_feedback(id,type,text,status,status_at,date) VALUES('s3','request','resolved ages ago','done',?,?)").run(old, old);
await call('POST', 'kh_feedback', {}, { id: 's4', type: 'request', text: 'a new one' });
const alive = id => !!db.prepare('SELECT id FROM kh_feedback WHERE id=?').get(id);
ok('the prune keeps a queued item', alive('s2'));
ok('...and still clears a long-resolved one', !alive('s3'));

/* ── pressing "Do it" wakes the helper ───────────────────────────────────
   Approving a suggestion and the helper that builds it were connected by
   nothing: you pressed the button, then had to go and start a session. A
   webhook closes that. What matters is that it fires on approval, says only
   THAT there is work (a leaked URL must not read anybody's suggestions), never
   blocks the owner's request, and does not exist at all when unconfigured. */
const pokes = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, init) => { pokes.push({ url: String(u), init }); return new Response('ok'); };
const waited = [];
const callCtx = (method, path, headers, body, e) =>
  worker.fetch(new Request('https://x/rest/v1/' + path, {
    method, headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}),
    body: body === undefined ? undefined : JSON.stringify(body),
  }), e || env, { waitUntil(p) { waited.push(p); } });

db.prepare("INSERT INTO kh_feedback(id,type,text,status,date) VALUES('p1','request','wake me','open','2026-07-01')").run();
await callCtx('PATCH', 'kh_feedback?id=eq.p1', { 'X-KH-Admin': ADMIN, Prefer: 'return=minimal' }, { status: 'queued' });
ok('unconfigured, approving pokes nothing at all', pokes.length === 0, JSON.stringify(pokes));

const hookEnv = Object.assign({}, env, { AGENT_WEBHOOK_URL: 'https://hook.example/fire', AGENT_WEBHOOK_AUTH: 'Bearer tok' });
db.prepare("INSERT INTO kh_feedback(id,type,text,status,date) VALUES('p2','request','build this','open','2026-07-01')").run();
let pr = await callCtx('PATCH', 'kh_feedback?id=eq.p2', { 'X-KH-Admin': ADMIN, Prefer: 'return=minimal' }, { status: 'queued' }, hookEnv);
ok('configured, approving pokes the helper', pokes.length === 1, JSON.stringify(pokes.map(p => p.url)));
ok('...and the owner\'s request still succeeds', pr.status === 204, pr.status);
ok('...through waitUntil, so it never blocks or fails the approval', waited.length >= 1, waited.length);
const body = pokes.length ? JSON.parse(pokes[0].init.body) : {};
ok('...saying only THAT there is work, never what it is',
   body.event === 'kh_queue' && !JSON.stringify(body).match(/build this/), JSON.stringify(body));
ok('...with the auth header when one is set', pokes[0].init.headers.Authorization === 'Bearer tok');

/* Queueing five in a row should wake it once — it reads the whole queue. */
db.prepare("INSERT INTO kh_feedback(id,type,text,status,date) VALUES('p3','request','and this','open','2026-07-01')").run();
await callCtx('PATCH', 'kh_feedback?id=eq.p3', { 'X-KH-Admin': ADMIN, Prefer: 'return=minimal' }, { status: 'queued' }, hookEnv);
ok('a burst of approvals wakes it once, not once each', pokes.length === 1, pokes.length);

/* Only approval wakes it. Closing something out is not new work. */
_pokeReset();
await callCtx('PATCH', 'kh_feedback?id=eq.p2', { 'X-KH-Agent': AGENT, Prefer: 'return=minimal' }, { status: 'done' }, hookEnv);
ok('marking something DONE does not wake it', pokes.length === 1, pokes.length);
globalThis.fetch = realFetch;

r = await call('PATCH', 'kh_announcements?id=eq.1', { 'X-KH-Agent': AGENT, Prefer: 'return=minimal' }, { text: 'hello everyone' });
ok('it cannot touch announcements', r.status === 400 || r.status === 403, String(r.status));

/* The RPCs that act on a PERSON must not accept it. */
for (const fn of ['kh_ban_username', 'kh_unban_username', 'kh_warn_username']) {
  r = await call('POST', 'rpc/' + fn, {}, { p_token: AGENT, p_name: 'someone', p_text: 'x' });
  ok('it cannot ' + fn.replace('kh_', '').replace(/_/g, ' '), r.status === 403, String(r.status));
}
r = await call('POST', 'rpc/kh_post_announcement', {}, { p_token: AGENT, p_text: 'everyone read this' });
ok('it cannot post an announcement', r.status === 403, String(r.status));

r = await call('POST', 'rpc/kh_plan_counts', {}, { p_token: AGENT });
ok('it cannot read the plan counts', r.status === 403, String(r.status));

/* ── the role fails closed ───────────────────────────────────────────────── */
ok('a wrong key is not the agent', (await isAgent('not-the-key', env)) === false);
ok('an empty key is not the agent', (await isAgent('', env)) === false);
ok('with AGENT_SECRET unset the role does not exist',
   (await isAgent(AGENT, { DB, ALLOW_ORIGIN: '*' })) === false);

r = await call('PATCH', 'kh_feedback?id=eq.s1', { 'X-KH-Agent': 'wrong', Prefer: 'return=minimal' }, { status: 'done' });
ok('a wrong key cannot set a status', r.status === 400 && statusOf('s1') === 'done', String(r.status));

/* ── admin still works, and is still more ────────────────────────────────── */
r = await call('PATCH', 'kh_feedback?id=eq.s1', { 'X-KH-Admin': ADMIN, Prefer: 'return=minimal' },
  { status: 'ignored', text: 'admins may edit anything' });
const row2 = db.prepare('SELECT * FROM kh_feedback WHERE id=?').get('s1');
ok('admin is unaffected and still broader', row2.status === 'ignored' && row2.text === 'admins may edit anything');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
