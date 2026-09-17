/* Read and post KindleHub chat messages from the command line, so a scheduled
   session can be talked to from the Kindle instead of from a laptop.

     node tools/agent/kh-agent.mjs --read [--limit 20]
     node tools/agent/kh-agent.mjs --say "text"
     node tools/agent/kh-agent.mjs --pending          (messages awaiting a reply)

   LIVE PROGRESS — one message that grows, not twenty
     node tools/agent/kh-agent.mjs --start "Looking at the crash"   -> prints a handle
     node tools/agent/kh-agent.mjs --append <handle> "found it"
     node tools/agent/kh-agent.mjs --finish <handle> "fixed, PR #12"
   --start posts one message and prints a handle; --append rewrites THAT message
   with the extra line added, so a long job reads as a single note filling in
   rather than a stream of separate messages. The handle is "<id>:<secret>" and
   exists only in the running session — it is printed to stdout, never stored.
   Past ~3500 characters --append starts a fresh message and prints a NEW
   handle, because a message has a size limit and silently truncating the tail
   would lose exactly the part you were waiting for.

   WHY THIS NEEDS NO PASSWORD
   A room's message key is SHA-256("khmsg::" + room code) — it is derived from
   the room code alone, not from any account. So this tool never touches account
   credentials, never logs in, and cannot read anything except the one room
   whose code it was given. Losing this config leaks that room and nothing else.

   CONFIGURATION
     KH_AGENT_ROOM    REQUIRED. The 12-digit code of a PRIVATE room. This is the
                      only secret here, so it is never defaulted and never
                      committed — set it in the environment.
     KH_API_GATEWAY   optional; defaults to the URL the app already ships
     KH_AGENT_NAME    optional; display name to post under
     KH_AGENT_OWNER   optional; whose messages to pick up

   WHY A PRIVATE ROOM IS THE AUTHORISATION
   Message identity is caller-asserted everywhere in this app — a display name
   proves nothing, so "only act on the owner's messages" cannot be enforced by
   checking the name. What DOES bound it is the room: anyone who does not know
   the twelve-digit code cannot write into it at all. Treat the code as the
   credential, keep the room private, and rotate it if it ever leaks. The owner
   check below is a convenience filter, not a security boundary, and it is
   labelled as such so nobody later mistakes it for one. */

/* The gateway defaults to the one the app itself ships as KH_DEFAULT_API_GATEWAY
   — it is already public in index.html, so defaulting to it exposes nothing new
   and leaves the room code as the only value anyone has to configure. */
const DEFAULT_GATEWAY = 'https://kindlehub-api.arancool3000.workers.dev';
const GATEWAY = (process.env.KH_API_GATEWAY || DEFAULT_GATEWAY).replace(/\/+$/, '');
/* Digits only, so a code written 9830-2803-7620 works as typed. */
const ROOM = (process.env.KH_AGENT_ROOM || '').replace(/\D/g, '');
const NAME = process.env.KH_AGENT_NAME || 'KindleHub Agent';
const OWNER = (process.env.KH_AGENT_OWNER || 'arancool3000').trim();

const args = process.argv.slice(2);
const has = n => args.includes(n);
const val = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };

/* One place to end on a clear line rather than a stack trace — every failure
   here is something the reader has to act on, not debug. */
function fail(msg) {
  console.error(msg);
  process.exit(1);
}
function need() {
  /* Only the room code has to be supplied. It is the one value that is
     genuinely secret here, so it is never defaulted and never committed. */
  if (!ROOM || ROOM.length < 6) {
    console.error('Not configured. Set KH_AGENT_ROOM to the chat room code.');
    console.error('See AGENT_SETUP.md. Nothing was sent.');
    process.exit(2);
  }
}

/* ── the app's message crypto, byte-for-byte ─────────────────────────────── */
const b64 = u8 => Buffer.from(u8).toString('base64');
const unb64 = s => new Uint8Array(Buffer.from(s, 'base64'));

async function msgKey(code) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('khmsg::' + (code || '')));
  return crypto.subtle.importKey('raw', buf, {name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
}
async function gzip(str) {
  const cs = new CompressionStream('gzip');
  const w = cs.writable.getWriter(); w.write(new TextEncoder().encode(str)); w.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}
async function gunzip(u8) {
  const ds = new DecompressionStream('gzip');
  const w = ds.writable.getWriter(); w.write(u8); w.close();
  return new TextDecoder().decode(await new Response(ds.readable).arrayBuffer());
}
async function encrypt(code, plain) {
  const key = await msgKey(code);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const utf8 = new TextEncoder().encode(plain);
  let body = utf8, prefix = 'enc1:';
  try { const gz = await gzip(plain); if (gz.length < utf8.length) { body = gz; prefix = 'enc2:'; } } catch {}
  const buf = await crypto.subtle.encrypt({name: 'AES-GCM', iv}, key, body);
  return prefix + b64(iv) + '.' + b64(new Uint8Array(buf));
}
async function decrypt(code, cipher) {
  if (typeof cipher !== 'string') return cipher;
  const gz = cipher.startsWith('enc2:'), plain = cipher.startsWith('enc1:');
  if (!gz && !plain) return cipher;                       /* legacy plaintext */
  try {
    const parts = cipher.slice(5).split('.');
    if (parts.length !== 2) return cipher;
    const key = await msgKey(code);
    const buf = await crypto.subtle.decrypt({name: 'AES-GCM', iv: unb64(parts[0])}, key, unb64(parts[1]));
    const u8 = new Uint8Array(buf);
    return gz ? await gunzip(u8) : new TextDecoder().decode(u8);
  } catch { return '[could not decrypt]'; }
}

/* ── transport ───────────────────────────────────────────────────────────── */
async function rest(path, init) {
  let res;
  try {
    res = await fetch(GATEWAY + '/rest/v1/' + path, init);
  } catch (e) {
    fail('Could not reach ' + GATEWAY + ': ' + e.message);
  }
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    /* A sandbox that blocks the host reports it as an ordinary HTTP error, so
       the raw text reads like a server fault when it is really a local network
       policy. Say which it is — the fix is in a completely different place. */
    if (/not in allowlist|egress/i.test(body)) {
      fail('This environment blocks ' + new URL(GATEWAY).host + '.\n' +
           'Its egress policy does not permit the KindleHub backend, and that\n' +
           'policy is fixed when an environment is created — there is no setting\n' +
           'to change. Run this somewhere with ordinary network access; nothing\n' +
           'about the agent or the room needs changing.');
    }
    fail(res.status + ' from the gateway: ' + body);
  }
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

async function read(limit) {
  const rows = await rest('kh_messages?group_code=eq.' + encodeURIComponent(ROOM) +
    '&select=id,user_id,display_name,text,ts&order=ts.desc&limit=' + limit);
  const out = [];
  for (const r of (rows || [])) {
    out.push({id: r.id, name: r.display_name || '', ts: r.ts, text: await decrypt(ROOM, r.text)});
  }
  return out.reverse();
}

function newId() {
  return 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
async function post(text, secret) {
  const id = newId();
  const body = {
    id,
    group_code: ROOM,
    user_id: 'agent_' + NAME.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 24),
    display_name: NAME,
    text: await encrypt(ROOM, text),
  };
  if (secret) body.owner_secret = secret;
  await rest('kh_messages', {
    method: 'POST',
    headers: {'Content-Type': 'application/json', Prefer: 'return=minimal'},
    body: JSON.stringify(body),
  });
  return id;
}
async function say(text) { await post(text); }

/* Rewrite one message in place. The server gates this on the owner_secret we
   set when posting and on an exact primary key, so this can only ever touch
   the agent's own message — never anybody else's. */
const PROGRESS_MAX = 3500;
async function edit(id, secret, text) {
  await rest('kh_messages?id=eq.' + encodeURIComponent(id), {
    method: 'PATCH',
    headers: {'Content-Type': 'application/json', 'X-KH-Secret': secret, Prefer: 'return=minimal'},
    body: JSON.stringify({text: await encrypt(ROOM, text), edited: 1}),
  });
}
async function readOne(id) {
  const rows = await rest('kh_messages?id=eq.' + encodeURIComponent(id) + '&select=text&limit=1');
  const r = (rows || [])[0];
  return r ? await decrypt(ROOM, r.text) : '';
}
function randomSecret() {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

/* Messages after the agent's own last reply — i.e. what has not been answered.
   Deriving this from the thread means no state file, nothing to get out of
   sync, and nothing to commit on every run. */
function pendingFrom(msgs) {
  let lastMine = -1;
  for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].name === NAME) { lastMine = i; break; }
  const after = msgs.slice(lastMine + 1);
  /* The owner filter is a convenience, NOT authorisation — see the header. */
  return OWNER ? after.filter(m => m.name === OWNER) : after;
}

const limit = Math.max(1, Math.min(50, parseInt(val('--limit') || '20', 10) || 20));

need();
if (has('--start')) {
  const text = val('--start');
  if (!text) { console.error('--start needs text'); process.exit(2); }
  const secret = randomSecret();
  const id = await post(text, secret);
  /* stdout IS the handle — capture it, do not log it anywhere durable */
  console.log(id + ':' + secret);
} else if (has('--append') || has('--finish')) {
  const flag = has('--finish') ? '--finish' : '--append';
  const handle = val(flag);
  const i = args.indexOf(flag);
  const text = args[i + 2];
  if (!handle || handle.indexOf(':') < 0 || !text) {
    console.error('Usage: ' + flag + ' <id:secret> "text"');
    process.exit(2);
  }
  const id = handle.slice(0, handle.indexOf(':'));
  const secret = handle.slice(handle.indexOf(':') + 1);
  const prev = await readOne(id);
  const next = prev ? (prev + '\n' + text) : text;
  if (next.length > PROGRESS_MAX) {
    /* Roll over rather than truncate: the tail is the part being waited for. */
    const s2 = randomSecret();
    const id2 = await post(text, s2);
    console.log(id2 + ':' + s2);
  } else {
    await edit(id, secret, next);
    console.log(handle);
  }
} else if (has('--say')) {
  const text = val('--say');
  if (!text) { console.error('--say needs text'); process.exit(2); }
  await say(text);
  console.log('sent');
} else if (has('--pending')) {
  console.log(JSON.stringify(pendingFrom(await read(limit)), null, 1));
} else {
  console.log(JSON.stringify(await read(limit), null, 1));
}
