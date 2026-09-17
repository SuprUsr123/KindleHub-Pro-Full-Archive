# KindleHub Pro — security notes & audit response

This document records how KindleHub handles the issues raised in the v8.1.0
audit, which claims are real and fixed, and which are by-design (so they don't
get "re-fixed" in a way that breaks the app).

## HTTP security headers  — FIXED

`index.html` now ships a `Content-Security-Policy` and `referrer` via `<meta>`
tags (work on any host), and `_headers` sets the directives a `<meta>` tag
cannot express (HSTS, `X-Frame-Options`, `X-Content-Type-Options`,
`Permissions-Policy`, `frame-ancestors`).

**Why the CSP is not `default-src 'self'`.** KindleHub is a legitimate
multi-API client — it calls weather, maps tiles, news RSS, image, translate,
finance and geocoding endpoints, and it runs user-built "AI apps" that fetch
arbitrary APIs (mostly via the allorigins CORS proxy). A `default-src 'self'`
policy would break essentially the entire app. The shipped CSP still adds real
protection:

- `object-src 'none'` — no Flash/plugin XSS vector.
- `base-uri 'self'` — blocks `<base>`-tag hijacking.
- `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net` —
  the only external scripts we load are html2canvas + jszip from jsdelivr; an
  injected `<script src="//evil">` is blocked. (`'unsafe-inline'` is required
  because the single-file app uses inline `<script>` blocks and inline `onclick`
  handlers throughout; nonces cannot cover inline event handlers. `'unsafe-eval'`
  is required because the in-app spreadsheet (Sheets) and calculator evaluate
  user-entered formulas via `Function()`, and the app-patch feature runs via
  `new Function()`; without it those core features break on CSP-enforcing
  browsers. This means script-src is not a full XSS boundary — it blocks
  external-origin script loads, not inline/eval — which is why the render paths
  are DOM-built/escaped, below.)
- `frame-ancestors 'none'` + `X-Frame-Options: DENY` — anti-clickjacking.
- `connect-src`/`img-src`/`frame-src` are intentionally permissive over `https:`
  so the many real API integrations and sandboxed AI apps keep working.

### If the host is NOT Cloudflare Pages / Netlify

`_headers` is only auto-applied by Pages/Netlify. For a plain static host
proxied through Cloudflare, add the same headers with a **Transform Rule**:

Cloudflare dashboard → your domain → **Rules → Transform Rules → Modify
Response Header → Create rule**. Match `Hostname equals kindlehub.pro`, then add
these "Set static" headers:

| Header | Value |
| --- | --- |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `accelerometer=(), camera=(), geolocation=(self), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()` |
| `Content-Security-Policy` | *(same string as the `<meta>` in index.html)* |

After adding, **Purge Everything** in the Cloudflare cache. Verify with
`curl -sI https://kindlehub.pro | grep -i -E 'content-security|strict-transport|x-frame|x-content'`.

> HSTS `preload` is intentionally omitted — only add it once you're certain
> every subdomain is HTTPS-only, because preload is hard to reverse.

## AI App Builder code execution  — already sandboxed

The audit worried that generated apps run via `new Function`. They do **not** —
AI-built apps and AI previews run inside `<iframe sandbox="allow-scripts
allow-forms allow-popups allow-modals">` **without** `allow-same-origin`, so
they execute in an opaque origin and cannot read KindleHub's `localStorage`,
auth token, cookies or DOM. That was fixed previously and is unchanged.

The one place `new Function` *is* used is the optional **"local fixes / AI
patch"** power feature (`applyLocalFixes`, `S.localFixes`) — code the signed-in
user asked the AI to generate to patch their own client. It is **hardened** so
the AI can't be used to escalate:

- **Escalation deny-list** (`_khPatchDenyRE`): both the boot applier and the
  "Apply patch" button refuse any patch whose code references admin/auth/
  credential/backend/encryption internals (`_isAdminCached`, `_adminToken`,
  `ADMIN_HASHES`, `authToken`, `kh_offline_cred`, `kh_users`,
  `service_role`, `_sbBase`/`_sbFetch`, `_encryptState`/`_msgEncrypt`, …). The
  generator prompt is told the same. A blocked patch is disabled + recorded.
  This also neutralises any *already-stored* malicious patch on next boot.
- **Device-local only**: `S.localFixes` is stripped from the cloud blob on
  upload (`_trimStateForCloud`) **and** discarded from any incoming cloud state
  on merge (`mergeCloudState`), so a tampered/legacy synced state can never
  inject a boot-time patch onto another device.
- Client-side admin (`window._isAdminCached`) is only a **UI flag** — every
  privileged action is re-verified server-side by the D1 worker against a token
  whose SHA-256 must be in `ADMIN_HASHES` (a value derived from the admin's own
  password). So even setting the flag or forging the token grants **no** real
  cross-user power on D1 (verified by adversarial audit). The deny-list is
  defence-in-depth, not the boundary.

Note: the CSP carries `'unsafe-eval'` (the Sheets/calculator formula engine
needs `Function()`), so it does not itself block `new Function`; the app-layer
guards above do.

## localStorage contents  — mostly by design

- No privileged/service key is ever shipped to the client — the D1 worker
  enforces per-request auth, and the only cross-user power comes from the admin
  token (SHA-256 in `ADMIN_HASHES`). Verified: `service_role` appears only in SQL
  comments, never in client code.
- The user's **auth token** (`SHA-256(username+password)`) is the AES key for
  their own encrypted state and lives only in their own browser's localStorage
  (origin-scoped). It is never sent in plaintext and never stored server-side in
  a reversible form. The realistic threat to it is XSS — which is why the render
  paths are DOM-built/escaped (below) and the CSP limits script injection.
- Chat/notes/sheets held locally are plaintext-at-rest in localStorage. This is
  origin-scoped device-local data; encrypting it at rest would still require the
  key in memory and adds no protection against the actual threat model (physical
  device access or XSS). Cross-device sync IS encrypted in transit and at rest
  in the cloud.

## Legacy backend exposure  — CLOSED

**The real hole (now closed).** The legacy hosted-Postgres backend shipped
fully-open row-level security (`kh_users_read`/`update` = `using (true)`).
Because `kh_users.hash` = SHA-256(username+password) is BOTH the login secret
AND the AES key for that user's `state`, anyone holding the (public) anon key
could `SELECT` every account's hash+state (full data compromise + impersonation)
and `UPDATE` any row (takeover, or inject a boot-time `localFix`). Cloudflare D1
was never affected — it enforces per-request auth server-side, and the legacy
backend has since been locked down and decommissioned.

What changed in the client (this repo):

- **Hardcoded legacy-backend URL + anon key blanked** — the shipped bundle no
  longer carries usable legacy-backend creds. (They were already public in git
  history, so this is hygiene; the DB fix was server-side.)
- **`_sbBase()` never falls back to the legacy backend** — live REST/RPC/shared-AI
  traffic goes only to the D1 gateway, or nowhere. The deprecated
  `kh_api_gateway='off'` escape hatch (which used to force the legacy backend) now
  routes to D1.
- **Realtime WS** paths required a real hosted-backend URL, so a blank default
  never attempts a legacy socket.
- The one-time **migration** tool still works if the admin pastes a legacy
  backend URL+key at runtime (`kh_sb_url_override`), but nothing sensitive ships.

Residual server-side note (the client change alone did not un-leak
already-scraped data):

- **⚠ Rotate credentials.** The `hash` is the SAME auth secret on D1, so any
  hash scraped during the legacy backend's open window also unlocks that account
  on D1. Have users **change their password** (regenerates the hash + re-keys
  state). The legacy project has been locked down and decommissioned; its access
  logs were the way to gauge real historical exposure of large `kh_users` reads.

## Stored XSS on render  — already defended

User-generated content shown to other users is rendered safely:

- Chat message bodies go through `_renderMessageText`, which builds DOM nodes
  with `createElement` + `textContent` + `createTextNode` — **no `innerHTML`**.
- Author names and reply/pin previews are HTML-escaped (`< > & " '`).
- Link detection (`_linkifyEl`) only creates `<a>` elements for `https?://`
  URLs (no `javascript:` scheme is possible) and sets `rel="noopener
  noreferrer"`.
- Notes/sheets render via `textContent`.

A scan for `innerHTML = ... + <user-variable>` sinks found none unescaped.

## Recommended follow-ups (host-side, not code)

- Rate-limit the AI builder (the D1 worker already has per-IP + global budget
  guards; the shared-key proxy has a daily cap).
- Turn on Cloudflare **Bot Fight Mode** for distributed abuse.
- Subresource Integrity (SRI) on the jsdelivr `<script>` tags is a reasonable
  hardening if you pin exact versions (html2canvas, jszip@3.10.1).

---

# Full-stack audit (4 parallel auditors: worker / R2+email / crypto / client)

The account-takeover and SQL-injection surfaces were verified **clean**. The
remaining exploitable issues were cross-user *reads* and client credential
handling. Fixes below are code-complete and tested (headless + a `node:sqlite`
D1 shim for the worker ACLs).

## Fixed — worker (`api-worker.js`)

- **Mail owner-ACL (was: read anyone's mailbox).** Mail is encrypted under a key
  derived from the recipient's public username and reads were ungated, so
  `GET /kh_mail?to_user=eq.<victim>` returned decryptable ciphertext. The worker
  now requires the caller's `X-KH-Secret`, looks up the owner, and **forces** the
  query to that account's own mail (`to_user = me OR from_id = me`) regardless of
  the client filter. The client sends the secret on all mail reads.
- **Admin-only reads** for `kh_visits` (per-device geo/UA PII) and `kh_errors`
  (diagnostic logs).
- **`kh_feedback`**: `[USERNAME]` abuse reports are dropped and moderator
  `comments` stripped for non-admin reads (they named the reporter and quoted the
  reported user). Public suggestions/bugs still load.
- **`kh_groups`**: removed from open UPDATE (kills anon room rename/hijack) and
  reads now require a `code` filter (no bulk enumeration of room join-codes).
- **`kh_set_reaction`**: capped keys/users per message (anti-bloat).
- **owner_secret** must be ≥16 chars on secret-gated PATCH/DELETE.
- **Envelope-at-rest (`KH_PEPPER`).** The Worker now wraps the sensitive
  ciphertext columns — `kh_users.state`, `kh_mail` subject/body, `kh_messages.text`
  — with AES-GCM keyed by a secret env var (`KH_PEPPER`) before writing to D1,
  and unwraps on read. This is an **outer** layer on top of the existing client
  E2E encryption: the inner keys (`hash`, `group_code`) sit in the DB, so a
  stolen database would otherwise self-decrypt; the pepper does **not** live in
  the DB, so an exfiltrated D1 file is useless without the Worker's secret
  ("encrypted with a key held outside the storage" — the console model). It is
  opt-in (unset = no change), backward-compatible (legacy rows pass through and
  wrap on next write), and needs **no client change**, so there is no
  account-lockout risk. Set `KH_PEPPER` in the Worker's Variables & Secrets to a
  long random value and keep it permanently (losing it makes wrapped rows
  unreadable). Round-trip + "raw dump is ciphertext-only" + legacy-passthrough
  verified (`envelope_test.mjs`).

## Fixed — client (`index.html`)

- **Removed `kh_creds`** — it stored the **plaintext password** in localStorage.
  Staying logged in uses `S.authToken` (the hash) instead; legacy blobs are
  wiped. After logout the password is re-entered (keychain autofills).
- **Offline-cred store** is now keyed by a non-secret 16-char handle, not the
  full hash (the AES key) — reading localStorage no longer yields both
  ciphertext and its key.
- **`_msgEncrypt` fails closed** — never silently stores plaintext if WebCrypto
  is unavailable (only possible in a non-HTTPS context).
- **CSPRNG** for group/DM codes (they are message-key material; was `Math.random`).
- **Admin "ask about a user"** no longer fetches the target's `state` (ciphertext)
  or displays the full `hash` (their key) — metadata only.
- **`window.open`** on RSS/feed links is scheme-gated to http/https via `_khOpenExt`.

## Verified SAFE

No SQL injection (identifiers whitelisted, values bound); no `state`/full-hash
leak or cross-user `state` write (both require the exact hash PK); `owner_secret`
never served on reads; admin RPCs server-verified; AES-256-GCM with fresh random
IVs; custom-app/AI iframes sandboxed without `allow-same-origin`; chat/mail/
announcements/RSS render via `textContent`/escaped.

## ⚠ Still open — needs a careful, staged MIGRATION (not a silent code change)

1. **`hash = SHA-256(username+password)` is used as BOTH the account key AND the
   AES key, with no salt and no slow KDF.** A database dump (or the historical
   open window on the legacy backend) decrypts every account, and weak passwords
   crack fast.
   *Plan:* add a per-user random `salt`; store the lookup/auth value as
   `verifier = PBKDF2(password, salt, ≥200k)` (server can't decrypt) and derive
   the state key separately as `PBKDF2/HKDF(password, salt, …, "state")` (never
   sent to the server). Tag rows `kdf:2`; upgrade opportunistically on the next
   successful login (client still holds the password) so nobody is locked out.
   *Mitigated (defense-in-depth):* enabling `KH_PEPPER` (above) envelope-wraps
   `state` at rest, so a stolen DB no longer decrypts even though `hash` sits
   beside it — but the salted-KDF migration is still the durable fix for weak
   passwords and for the historical open window on the legacy backend.
2. **Mail/DM keys are derived from usernames/codes, not random per-conversation
   keys.** The read-ACL above stops the live exploit, but the durable fix is a
   per-account keypair + random per-conversation keys wrapped to the recipient.
3. **`kh_messages.location_hint`/`device_hint`** are stored in plaintext — stop
   sending them (or drop from non-owner reads).
4. **state-worker GET** takes the hash in the query string (log exposure) — move
   it to a header. **email-worker inbound** should check SPF/DKIM before storing
   a `from`.

These four require data migration / coordinated client+worker rollout and are
deliberately left for a dedicated pass to avoid locking out the ~98 live users.
