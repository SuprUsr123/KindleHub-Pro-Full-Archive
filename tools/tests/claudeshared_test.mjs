/* Claude on the shared key.

   The point of this feature is that a reader gets Claude without owning an API
   key. The point of THIS file is that the owner does not get a surprise bill
   for it, because unlike every other shared model these calls are not free.

   So the assertions split in two. One half is that the translation works at all
   — a Gemini-shaped request in, Anthropic's stream back out as Gemini-shaped
   SSE, because that is what lets the client stay ignorant of the difference.
   The other half is that every path which could spend money without being
   asked to is closed: no key means the models do not exist, the counter is
   separate from the free pool, an unmeterable call is refused rather than
   served, and nothing falls onto Claude by accident.

   Run: node --experimental-sqlite tools/tests/claudeshared_test.mjs */
import { DatabaseSync } from 'node:sqlite';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import worker, { ensureSchema } from '../../api-worker.js';

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

/* Anthropic's real stream shape, so the translation is tested against what it
   will actually be handed rather than a convenient fiction. */
const ANTHROPIC_SSE = [
  'event: message_start',
  'data: {"type":"message_start","message":{"id":"m1","role":"assistant"}}',
  '',
  'event: content_block_delta',
  'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}',
  '',
  'event: content_block_delta',
  'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" there"}}',
  '',
  'event: message_stop',
  'data: {"type":"message_stop"}',
  '',
].join('\n');

let lastCall = null, upstreamStatus = 200, upstreamBody = ANTHROPIC_SSE;
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, init) => {
  lastCall = { url: String(u), init };
  if (String(u).indexOf('api.anthropic.com') >= 0) {
    if (upstreamStatus >= 400) return new Response('{"error":{"message":"nope"}}', { status: upstreamStatus });
    return new Response(new Blob([upstreamBody]).stream(), { status: 200 });
  }
  /* The Gemini path — enough of a stream to prove it still works. */
  return new Response(new Blob(['data: {"candidates":[{"content":{"parts":[{"text":"gem"}]}}]}\n\n']).stream(), { status: 200 });
};

const PROXY = 'https://x/functions/v1/kh-gemini-proxy';
/* A real Pro account, so the per-plan message allowance (5/day on free) never
   answers first and hide what is being tested here. Claude IS metered against
   that allowance like any other shared model — a reader out of messages does
   not get to spend Claude money — which is exactly why the test needs headroom
   rather than a bypass. */
const ACC = 'a'.repeat(64);
const call = (env, model, payload) =>
  worker.fetch(new Request(PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, hash: ACC, payload: payload || { contents: [{ role: 'user', parts: [{ text: 'hi' }] }] } }),
  }), env, { waitUntil() {} });

const readSSE = async res => {
  const t = await res.text();
  return t.split('\n').filter(l => l.indexOf('data: ') === 0).map(l => {
    try { return JSON.parse(l.slice(6)); } catch { return null; }
  }).filter(Boolean);
};

const base = { DB, ALLOW_ORIGIN: '*', GEMINI_KEY: 'g-key' };
await ensureSchema(DB, base);
db.prepare('INSERT INTO kh_users(hash,email,state) VALUES(?,?,?)').run(ACC, 'tester', '{}');
db.prepare("INSERT INTO kh_entitlements(hash,tier,status) VALUES(?,'pro','active')").run(ACC);

/* ── with no key the models do not exist ─────────────────────────────────── */
let r = await call(base, 'claude-haiku-4-5-20251001');
let j = await r.json().catch(() => ({}));
ok('with no ANTHROPIC_KEY a Claude model is not a model at all',
   r.status === 400 && j.code === 'BAD_MODEL', r.status + ' ' + JSON.stringify(j));
ok('...and nothing was sent to Anthropic',
   !lastCall || lastCall.url.indexOf('anthropic') < 0, lastCall && lastCall.url);

/* ── with a key it translates both ways ──────────────────────────────────── */
const env = Object.assign({}, base, { ANTHROPIC_KEY: 'sk-ant-test', CLAUDE_DAILY_CAP: '3' });

r = await call(env, 'claude-haiku-4-5-20251001', {
  contents: [
    { role: 'user',  parts: [{ text: 'first' }] },
    { role: 'model', parts: [{ text: 'reply' }] },
    { role: 'user',  parts: [{ text: 'second' }] },
  ],
  systemInstruction: { parts: [{ text: 'be brief' }] },
  generationConfig: { temperature: 0.4, maxOutputTokens: 8192 },
});
ok('a Claude request reaches Anthropic', lastCall && lastCall.url.indexOf('api.anthropic.com') >= 0, lastCall && lastCall.url);

const sent = JSON.parse(lastCall.init.body);
ok('the key travels as x-api-key, not a bearer token',
   lastCall.init.headers['x-api-key'] === 'sk-ant-test' && !!lastCall.init.headers['anthropic-version']);
ok('Gemini roles become Anthropic roles',
   sent.messages.length === 3 && sent.messages[1].role === 'assistant' && sent.messages[2].content === 'second',
   JSON.stringify(sent.messages));
ok('systemInstruction becomes system', sent.system === 'be brief', sent.system);
ok('temperature carries over', sent.temperature === 0.4, sent.temperature);
ok('max_tokens is required by Anthropic and is set — and trimmed, because output is billed',
   sent.max_tokens === 4096, sent.max_tokens);
ok('the stream is asked for', sent.stream === true);

const chunks = await readSSE(r);
ok('Anthropic\'s stream comes back in the Gemini shape the client parses',
   chunks.length === 2 &&
   chunks[0].candidates[0].content.parts[0].text === 'Hello' &&
   chunks[1].candidates[0].content.parts[0].text === ' there',
   JSON.stringify(chunks));
ok('...and non-text events are dropped rather than passed through',
   chunks.every(c => c.candidates), JSON.stringify(chunks));

/* ── the counter is Claude's own ─────────────────────────────────────────── */
const countOf = k => (db.prepare('SELECT count FROM kh_shared_api_usage WHERE date=?').get(k) || {}).count || 0;
const today = new Date().toISOString().slice(0, 10);
ok('Claude bills its own counter', countOf('claude:' + today) === 1, countOf('claude:' + today));

const gemBefore = countOf(today);
await call(env, 'gemini-3.5-flash-lite');
ok('a free Gemini call does not touch the Claude counter',
   countOf('claude:' + today) === 1 && countOf(today) === gemBefore + 1,
   'claude=' + countOf('claude:' + today) + ' gem=' + countOf(today));

/* ── the cap ─────────────────────────────────────────────────────────────── */
await call(env, 'claude-haiku-4-5-20251001');
await call(env, 'claude-haiku-4-5-20251001');
r = await call(env, 'claude-haiku-4-5-20251001');
j = await r.json().catch(() => ({}));
ok('past its daily allowance Claude reports busy', r.status === 503 && j.code === 'CLAUDE_CAP',
   r.status + ' ' + JSON.stringify(j));
ok('...as a 503, which the client already retries on the next model',
   r.status === 503, r.status);

/* Gemini must still answer while Claude is capped — that is the whole point of
   using 503 instead of a hard error. */
r = await call(env, 'gemini-3.5-flash-lite');
ok('the free models keep working while Claude is capped', r.status === 200, r.status);

/* ── an upstream failure never becomes a dead end ────────────────────────── */
upstreamStatus = 401;
const env2 = Object.assign({}, env, { CLAUDE_DAILY_CAP: '99' });
r = await call(env2, 'claude-haiku-4-5-20251001');
j = await r.json().catch(() => ({}));
ok('a rejected Anthropic key surfaces as busy, not as a fatal error',
   r.status === 503 && j.code === 'CLAUDE_ERR', r.status + ' ' + JSON.stringify(j));
upstreamStatus = 200;

/* ── an unknown Claude-ish id is still refused ───────────────────────────── */
r = await call(env2, 'claude-opus-9-imaginary');
ok('an id that merely looks like Claude is refused', r.status === 400, r.status);

globalThis.fetch = realFetch;

/* ── the client half: nothing may fall onto Claude by accident ───────────── */
const src = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const chain = (src.match(/const SHARED_KEY_FALLBACK_CHAIN=\[([\s\S]*?)\];/) || [])[1] || '';
ok('Claude is NOT in the automatic fallback chain', chain.indexOf('claude') < 0, chain.slice(0, 120));
/* It is deliberately NOT offered any more. "Free, no key needed" meant no key
   from the READER — every message billed the owner's Anthropic account, which
   BUILTIN_CLAUDE_PLAN.md says needs a hard budget decision first. It also never
   worked: the deployed Worker answers 400 {"code":"BAD_MODEL"}, so the option's
   only effect was to hand people an error. The Worker half below still works
   and still fails closed without ANTHROPIC_KEY, so switching it on stays a
   deliberate act rather than a default. */
ok('the picker does NOT offer Claude as free-with-no-key',
   !/group:'Claude — free to use, no key needed'/.test(src));
ok('...and a stored Claude pick is cleared at boot rather than 400ing forever',
   /a saved Claude id lands here as well and is cleared/i.test(src));
ok('a Claude pick is tried first with the free chain behind it',
   /else if\(opts&&opts\.model&&isSharedClaude\(opts\.model\)\)_chain=\[opts\.model\]\.concat\(SHARED_KEY_FALLBACK_CHAIN\.slice\(\)\);/.test(src));
ok('the free plan is not filtered out of Claude',
   /SHARED_BASIC_MODELS\.indexOf\(m\)>=0\|\|isSharedClaude\(m\)/.test(src));
ok('an exhausted Gemini day does not pre-block a Claude pick',
   /const _wantClaude=isSharedClaude\(\(opts&&opts\.model\)\|\|S\.sharedModel\);/.test(src));
ok('the picker shows a readable name rather than a bare model id',
   /function _sharedLabel\(id\)\{/.test(src));

/* The two lists have to agree or a pick is offered that the Worker refuses. */
const workerSrc = readFileSync(new URL('../../api-worker.js', import.meta.url), 'utf8');
const clientIds = (src.match(/const SHARED_CLAUDE_MODELS=\[([\s\S]*?)\];/) || [])[1] || '';
const workerIds = (workerSrc.match(/const PROXY_CLAUDE_MODELS = new Set\(\[([\s\S]*?)\]\);/) || [])[1] || '';
const idsOf = t => (t.match(/'([^']+)'/g) || []).map(x => x.slice(1, -1)).sort().join(',');
ok('client and Worker offer exactly the same Claude models',
   idsOf(clientIds) === idsOf(workerIds) && idsOf(clientIds).length > 0,
   idsOf(clientIds) + '  vs  ' + idsOf(workerIds));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
