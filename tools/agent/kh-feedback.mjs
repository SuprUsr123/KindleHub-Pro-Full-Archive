/* Read the community suggestions and bug reports from the command line, so a
   session can work through them without anyone copying text out of the app.

     node tools/agent/kh-feedback.mjs --list                 open items, most-voted first
     node tools/agent/kh-feedback.mjs --list --type bug      just bugs
     node tools/agent/kh-feedback.mjs --list --all           include done/ignored
     node tools/agent/kh-feedback.mjs --show <id>            one item and its comments
     node tools/agent/kh-feedback.mjs --comment <id> "text"  reply on the thread
     node tools/agent/kh-feedback.mjs --done <id>            mark it done
     node tools/agent/kh-feedback.mjs --ignore <id>          mark it ignored
     node tools/agent/kh-feedback.mjs --reopen <id>          put it back
     node tools/agent/kh-feedback.mjs --queued               work the owner approved

   THE QUEUE
   The owner presses "Do it" beside a suggestion in the admin panel. That sets
   its status to `queued` and, if they typed one, saves their instruction as a
   [BUILD] comment on the same row — so "do the first one but not the second"
   travels with the suggestion instead of living in a side channel. --queued
   prints those items with their notes already pulled out. Build it, then
   --done it.

   Reading and commenting need NO credentials: the suggestions page is public
   inside the app, and comments go through the same atomic append RPC every user
   uses. Changing STATUS needs KH_AGENT_SECRET, a key whose only power is
   exactly that — it cannot ban, warn, announce, or read anything gated. Losing
   it costs you some mis-ticked suggestions, which you re-open.

   The `id` printed here is the same one close-requests.mjs takes, so the flow
   is: read an item, do the work, put "Closes KH-<id>" in the PR body.

   CONFIGURATION
     KH_API_GATEWAY    optional; defaults to the URL the app already ships
     KH_AGENT_SECRET   required only for --done / --ignore / --reopen. Must match
                       AGENT_SECRET on the Worker. */

const DEFAULT_GATEWAY = 'https://kindlehub-api.arancool3000.workers.dev';
const GATEWAY = (process.env.KH_API_GATEWAY || DEFAULT_GATEWAY).replace(/\/+$/, '');

const args = process.argv.slice(2);
const has = n => args.includes(n);
const val = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };

function fail(msg) { console.error(msg); process.exit(1); }

async function rest(path, init) {
  let res;
  try { res = await fetch(GATEWAY + '/rest/v1/' + path, init); }
  catch (e) { fail('Could not reach ' + GATEWAY + ': ' + e.message); }
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    /* A sandbox that blocks the host reports it as an ordinary HTTP error, so
       the raw text reads like a server fault when it is really a local network
       policy. Say which — the fix is in a completely different place. */
    if (/not in allowlist|egress/i.test(body)) {
      fail('This environment blocks ' + new URL(GATEWAY).host + '.\n' +
           'Its egress policy does not permit the KindleHub backend. Run this\n' +
           'somewhere with ordinary network access; nothing here needs changing.');
    }
    fail(res.status + ' from the gateway: ' + body);
  }
  const t = await res.text();
  return t ? JSON.parse(t) : [];
}

/* The app writes feedback with type 'request' or 'bug'. Anything else is
   treated as-is rather than guessed at. */
async function list() {
  const type = val('--type');
  let q = 'kh_feedback?select=id,type,text,votes,status,author,date,comments' +
          '&order=votes.desc&limit=200';
  if (type) q += '&type=eq.' + encodeURIComponent(type);
  if (!has('--all')) q += '&status=eq.open';
  const rows = await rest(q);
  if (!rows.length) { console.log('Nothing open.'); return; }
  for (const r of rows) {
    const n = (() => { try { return JSON.parse(r.comments || '[]').length; } catch { return 0; } })();
    console.log(
      String(r.votes == null ? 0 : r.votes).padStart(3) + ' votes  ' +
      '[' + (r.type || '?') + ']' + (r.status && r.status !== 'open' ? ' (' + r.status + ')' : '') +
      (n ? '  ' + n + ' comment' + (n === 1 ? '' : 's') : '') + '\n' +
      '  KH-' + r.id + '  by ' + (r.author || 'anonymous') + (r.date ? '  ' + String(r.date).slice(0, 10) : '') + '\n' +
      '  ' + String(r.text || '').replace(/\s+/g, ' ').slice(0, 300) + '\n');
  }
  console.log(rows.length + ' item' + (rows.length === 1 ? '' : 's') +
              '. Put "Closes KH-<id>" in a PR body, then run tools/close-requests.mjs --scan');
}

/* Items the owner approved, with their instructions separated out. The [BUILD]
   prefix is what distinguishes an instruction to the helper from an ordinary
   comment by a community member on the same thread. */
function buildNotes(row) {
  let cs = [];
  try { cs = JSON.parse(row.comments || '[]'); } catch {}
  return cs.map(c => String(c.text || ''))
           .filter(t => t.indexOf('[BUILD]') === 0)
           .map(t => t.slice(7).trim())
           .filter(Boolean);
}
async function queued() {
  const rows = await rest('kh_feedback?status=eq.queued' +
    '&select=id,type,text,votes,author,date,comments&order=votes.desc&limit=50');
  if (!rows.length) { console.log('Nothing queued.'); return; }
  for (const r of rows) {
    console.log('KH-' + r.id + '  [' + (r.type || '?') + ']  ' + (r.votes || 0) + ' votes  by ' + (r.author || 'anonymous'));
    console.log('  ' + String(r.text || '').replace(/\s+/g, ' '));
    const notes = buildNotes(r);
    if (notes.length) {
      console.log('  INSTRUCTIONS FROM THE OWNER:');
      for (const n of notes) console.log('    - ' + n);
    }
    console.log('');
  }
  console.log(rows.length + ' queued. Build one, then: --done <id>');
}

async function show(id) {
  const rows = await rest('kh_feedback?id=eq.' + encodeURIComponent(id) +
    '&select=id,type,text,votes,status,author,date,comments&limit=1');
  const r = rows[0];
  if (!r) fail('No item with id ' + id + '.');
  console.log('KH-' + r.id + '  [' + (r.type || '?') + ']  ' + (r.votes || 0) + ' votes  ' + (r.status || 'open'));
  console.log('by ' + (r.author || 'anonymous') + (r.date ? '  ' + String(r.date).slice(0, 10) : ''));
  console.log('\n' + String(r.text || ''));
  let comments = [];
  try { comments = JSON.parse(r.comments || '[]'); } catch {}
  if (comments.length) {
    console.log('\n--- ' + comments.length + ' comment' + (comments.length === 1 ? '' : 's') + ' ---');
    for (const c of comments) {
      console.log('\n' + (c.author || 'anonymous') + (c.date ? '  ' + String(c.date).slice(0, 10) : '') +
                  '\n' + String(c.text || ''));
    }
  }
}

const AGENT_SECRET = process.env.KH_AGENT_SECRET || '';

/* Comments append through the same RPC the app uses, so two comments in the
   same second cannot lose-update each other and no client ever sends the whole
   array. No credential — commenting on a public suggestion is public. */
async function comment(id, text) {
  await rest('rpc/kh_add_comment', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      p_table: 'kh_feedback', p_id: id,
      p_comment: {author: process.env.KH_AGENT_NAME || 'KindleHub Agent', text: String(text)},
    }),
  });
}
async function setStatus(id, status) {
  if (!AGENT_SECRET) {
    fail('Changing status needs KH_AGENT_SECRET (matching AGENT_SECRET on the\n' +
         'Worker). Reading and commenting need nothing. Nothing was changed.');
  }
  await rest('kh_feedback?id=eq.' + encodeURIComponent(id), {
    method: 'PATCH',
    headers: {'Content-Type': 'application/json', 'X-KH-Agent': AGENT_SECRET, Prefer: 'return=minimal'},
    body: JSON.stringify({status, status_at: new Date().toISOString()}),
  });
}

if (has('--comment')) {
  const id = val('--comment');
  const i = args.indexOf('--comment');
  const text = args[i + 2];
  if (!id || !text) fail('Usage: --comment <id> "text"');
  await comment(id, text);
  console.log('commented on KH-' + id);
} else if (has('--done') || has('--ignore') || has('--reopen')) {
  const flag = has('--done') ? '--done' : (has('--ignore') ? '--ignore' : '--reopen');
  const status = flag === '--done' ? 'done' : (flag === '--ignore' ? 'ignored' : 'open');
  const id = val(flag);
  if (!id) fail('Usage: ' + flag + ' <id>');
  await setStatus(id, status);
  console.log('KH-' + id + ' -> ' + status);
} else if (has('--queued')) {
  await queued();
} else if (has('--show')) {
  const id = val('--show');
  if (!id) fail('--show needs an id');
  await show(id);
} else if (has('--list') || !args.length) {
  await list();
} else {
  console.error('Usage: --list [--type bug|request] [--all] | --queued | --show <id>\n' +
                '       --comment <id> "text" | --done <id> | --ignore <id> | --reopen <id>');
  process.exit(2);
}
