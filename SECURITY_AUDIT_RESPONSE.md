# Security audit response — 26 July 2026

Response to the deep security audit of commit `0e2a78c` (`main`). This tracks
every finding: what is fixed, what is deliberately deferred, and what needs an
account migration rather than a patch.

**Status key:** ✅ fixed · 🟡 partially fixed · 📋 planned (needs migration) ·
⚙️ needs operator action (not a code change) · ⏸ accepted risk

| ID | Finding | Status |
|----|---------|--------|
| KH-01 | Anonymous hash prefixes enable offline password cracking | 📋 planned |
| KH-02 | Server stores the account AES key beside the ciphertext | 📋 planned |
| KH-03 | Public-username admin fallback → site-wide JS execution | ✅ fixed |
| KH-04 | Master key leaks into URLs, logs, Stripe, localStorage | 🟡 partial |
| KH-05 | Password recovery does not revoke the old D1 credential | 🟡 partial |
| KH-06 | Paid storage/publishing limits are client-only | ✅ fixed |
| KH-07 | Invented hashes bypass per-account AI quotas | ✅ fixed |
| KH-08 | Stripe config/event processing can produce wrong billing | ✅ fixed |
| KH-09 | Bans enforced only in browser JavaScript | ✅ fixed |
| KH-10 | Deployed browser proxy is an open CORS proxy | ⚙️ operator |
| KH-11 | Social endpoints permit impersonation / vote forgery | 📋 planned |
| KH-12 | Reset email abuse + non-atomic attempt limiting | ⏸ dormant |
| KH-13 | AI previews have a weaker sandbox than installed apps | ✅ fixed |
| KH-14 | CSP + local admin secret amplify any XSS | 🟡 partial |
| KH-15 | No DMARC record | ⚙️ operator |
| KH-16 | CI/security assurance gaps | 🟡 partial |

---

## Fixed

### KH-03 / KH-14 — the site-wide RCE chain (highest priority, both ends closed)

The audit correctly identified a one-request path from "knows a public username"
to "runs arbitrary JavaScript in every visitor's browser". Both halves are gone.

**The gate.** `isAdmin()` used to fall back to `ADMIN_HASHES` — which contains
the SHA-256 of the admin's *public* username — whenever `ADMIN_SECRET` was
unset. It now fails closed: admin requires `ADMIN_SECRET`, and with no secret
configured nobody is admin. Comparison is constant-work.

**The payload.** Two separate paths eval'd server-supplied code:
`[[KH_EDIT]]` (Website Editor) and `[[KH_FIX]]` (maintenance channel). Both are
removed. What remains is inert: CSS (now stripped of `@import`,
`url(javascript:)`, `expression()`, `-moz-binding`) and a plain-text banner. The
editor's JS tab, its "Test JS on my device" eval, and "Fix a live error" went
with it. The repo auto-deploys on merge, so live JS was never worth this risk.

`localFixes` was checked and is *not* a remote-code path: it is device-local,
stripped on upload, and explicitly rejected from any cloud pull.

### KH-06 — plan limits are now the server's decision

Storage bytes and App Store publish counts are enforced in the Worker against
`kh_entitlements` (`TIER_STATE_BYTES` / `TIER_PUBLISH_MAX`). The client keeps its
copies for a friendly early warning only.

**Grandfathered on purpose.** Accounts already over their cap — they were never
stopped before — may keep saving at up to their current size. Only *growth* past
the cap is refused. Enforcing the cap strictly would have locked existing free
users out of sync, which is a worse outcome than the abuse it prevents.

### KH-07 — invented hashes no longer reset AI quotas

The proxy verifies the hash exists in `kh_users`. Unknown hashes share a single
per-IP bucket, so rotating random hashes no longer buys 5 fresh messages each.
Game models (`gemma*`) remain unmetered by design.

### KH-08 — billing integrity

- `stripePriceMap()` uses the strict parser. A malformed `STRIPE_PRICES` no
  longer falls back to the built-in **live** ids.
- Checkout refuses to run when key mode and price config disagree
  (`stripeModeProblem`) — a test key with live prices is now a 503, not a
  confusing failure at Stripe.
- Deterministic idempotency keys on checkout creation.
- Processed event ids recorded in `kh_stripe_events`; stale events cannot
  overwrite newer state (monotonic on `event.created`).
- Webhook bodies capped at 256 KB before any HMAC work.

### KH-09 — bans enforced server-side

`kh_messages`, `kh_store_apps`, `kh_presence` and `kh_scores` writes check the
ban list. The set is cached 60s on hot paths but **invalidated on ban/unban**, so
a moderator's ban takes effect on the next message. Reads stay open — a ban stops
you speaking, not reading. Fails open on a DB error, so a D1 blip cannot lock out
the site.

### KH-13 — preview sandbox matches installed apps

AI builder previews now get the same CSP wrapper as published apps
(`connect-src 'none'`, `form-action 'none'`) and lose `allow-popups` /
`allow-downloads`. Installed apps lost those too.

The mail bridge accepted `postMessage` from *any* iframe — including the in-app
browser. It now matches `ev.source` against an explicit registry of installed-app
frames (`_khRegisterAppFrame`) and requires a per-frame random nonce, so one
frame cannot impersonate another and a merely-viewed page cannot reach it.

### KH-05 — recovery: partially addressed (correcting an earlier over-claim)

An earlier revision of this document marked KH-05 fixed. That was wrong and is
corrected here. What exists is `POST /account/delete`, which does remove the
`kh_users` row — but the *recovery/rekey* flow does not yet call it, and the
generic REST delete still excludes `kh_users`. So after a password change the
old row can still linger.

This now interacts with the KH-17 fix below: a username is claimed by one hash,
so a rekey that leaves the old row behind will make the new write fail with 409
rather than silently create a duplicate. That is the safe direction — a visible
failure, not a silent mailbox split — but the rekey flow still needs wiring to
delete-then-write. Tracked as the next server change.

---

## Partially fixed

### KH-04 — master key in URLs, Stripe, localStorage

**Fixed:** Stripe no longer sees the account hash. Checkout sends an opaque
`kh_<32 hex>` billing id, resolved back to an account only inside D1
(`billingIdFor` / `hashForBillingId`). This was a real leak of the AES key to a
third party and its staff, and it is closed.

**Still open:** the hash is still sent in `hash=eq.<value>` query strings and
mirrored into `kh_session`. Both are consequences of the same root cause as
KH-01/KH-02 — one value serving as lookup key, bearer credential and encryption
key — and are fixed by the migration below, not by a patch.

### KH-14 — CSP breadth

Removing both `eval()` paths is the substantive part. `script-src` still carries
`unsafe-inline`/`unsafe-eval` because the single-file architecture is built from
inline scripts and inline `onclick` handlers; moving to nonces is a large
mechanical change tracked separately. `new Function()` remains for the
user-approved local patch runner, which never accepts cloud input.

### KH-16 — CI

Tests now live in `tools/tests/` and run from a clean checkout rather than
`/tmp`, and `audit_test.mjs` covers the authorization boundaries above. Pinning
actions to commit SHAs and widening the secret-scanning patterns are still to do.

---

## Second-round findings (addendum audit, KH-17 … KH-26)

### KH-17 — Critical: duplicate username → mailbox takeover. ✅ FIXED

The most serious finding in either report, and correct. `kh_users` is
anonymously insertable and `email` was not unique, while the mail read gate
resolved the mailbox from whatever email sat on the row the caller's secret
pointed at. So an attacker registered *their own* hash under a *victim's*
username and read that victim's mail — and could decrypt it, because the mail
key is derived from `mail:<public username>`.

Two locks, because one alone is not enough:

1. **Write:** a username is claimed by the first hash to register it. A write
   under a different hash returns 409.
2. **Read:** a mailbox whose username is held by more than one account is
   refused outright. This matters because lock 1 only stops *new* duplicates —
   this one neutralises any planted before the fix, turning a leak into a lock.

Both fail closed on a DB error. Regression test plants the exact attack.

### KH-20 — High: checkout could use an unsaved billing id. ✅ FIXED

`billingIdFor` returned the generated id even when both the write and the
read-back failed, so Stripe got an id that existed nowhere — the customer pays
and the webhook can never map it back to an account. Worst of all it was most
likely precisely when D1 was already unhealthy. It now returns '' and checkout
refuses with 503 before any Stripe session is created. Test asserts no Stripe
call happens.

### KH-19 — High: webhook retry loss. ✅ ALREADY FIXED (commit 9c60efa)

Independently found and fixed before this addendum arrived; the addendum was
written against a snapshot that predates it. Event ids are now recorded only
after the handler succeeds, with a failure-injection regression test.

The addendum's *additional* point stands and is **not** fixed: the stale-event
guard is a non-atomic read-then-write, and same-second events have no
tie-breaker. Low impact (it needs two subscription changes inside one second)
but real. Fix is a conditional UPDATE with a monotonic version column — queued
with the other billing work.

### KH-21 — High: presence directory. 🟡 PARTIALLY FIXED

**Fixed — spoofing:** presence rows are keyed on an account-hash prefix and were
anonymously upsertable, so anyone could overwrite another person's row: force
them offline, rename them, change their avatar everywhere. A write for an id
belonging to a real account now requires that account's secret. Guests and the
Slither `sl_*` beacons are unaffected (their ids match no account).

**Still open — readability:** the directory is still publicly readable
cross-origin, exposing stable ids, display names, exact `last_seen` and avatars.
Gating reads needs sessions (KH-01 Stage 3). Two things worth doing sooner and
independently: set `ALLOW_ORIGIN` to the real origin instead of `*`, and return
a coarse online/offline flag rather than an exact timestamp.

### KH-22 / KH-06 — paid entitlements server-side. 🟡 MOSTLY FIXED

Storage bytes and App Store publish counts are now enforced in the Worker
against `kh_entitlements` (commit f00cc49 — the addendum predates it).

Still client-only: **online multiplayer**. `_khRequirePlan` gates the lobby in
the browser, but the room/messaging backend does not check membership. And the
**R2 state worker** still accepts 16 MB for any well-formed hash without
consulting entitlements — the D1 path is bounded, R2 is not.

### KH-23 — High: App Store review bypass. ❌ NOT FIXED

Correct and unaddressed. AI review, duplicate-name checks, publisher identity
and the age rating all run in the browser; the server accepts a direct insert
and checks only size, rate and (now) the per-plan count. `ageRating` has no
column, so a directly-inserted row shows as "Everyone" to child users.

This is a content-safety issue, not a data-security one, and it needs an
authenticated publish endpoint with pending/approved states plus an `age_rating`
column — a schema change and a client change together. Deliberately not rushed
into this batch.

### KH-24 — anonymous large account allocation. 🟡 MOSTLY FIXED

The D1 half is bounded: an invented hash has no entitlement, so it gets the free
tier's 1.5 MB cap rather than 16 MB. The R2 worker is still unbounded, and there
is still no global account-creation budget or abandoned-account cleanup.

### KH-25 — Medium: rate limiters are non-atomic and fail open. ❌ NOT FIXED

Correct. `checkRate` reads, evaluates, then writes, so parallel requests can all
pass; a D1 error returns true. Deliberate for availability, but wrong for
cost-sensitive writes. Proper fix is a Durable Object or Cloudflare's rate
limiting product; a cheap improvement is one conditional UPDATE checking
affected rows. Not attempted here because getting it wrong locks users out.

### KH-26 — CI does not run the tests. ✅ FIXED

CI now runs `audit_test`, `stripe_test`, `tier_test` and `bypass_test` on every
PR and push, so the webhook-retry and authorization regressions are caught
automatically. The secret scanner was also widened to Stripe live/test keys and
webhook secrets, Anthropic keys, GitHub tokens, AWS keys, Slack tokens and
Resend keys, and now scans Markdown too.

---

## Needs a migration, not a patch

### KH-01 + KH-02 — the account key architecture

This is the audit's most important finding and it is correct. Today:

```
value = SHA-256("kh::" + username + "::" + password)
```

That single unsalted value is the D1 row key, the bearer credential, **and** the
AES key. The API also returns its first 16 hex characters to anonymous callers
(so friend search can work), which is a 64-bit offline password verifier: an
attacker hashes candidate passwords against a known username and compares. A
6-character minimum makes dictionary attacks cheap, and a hit yields full account
takeover *and* decryption.

It cannot be fixed in place, because every existing account's data is encrypted
under exactly this value. The staged migration below extends
`ACCOUNT_V2_PLAN.md`, and is designed so no user is logged out or loses data.

**Stage 1 — stop the bleeding (no client change).**
Replace the exposed prefix with a *keyed* id: `HMAC(SERVER_PEPPER, hash)`
truncated. Still stable and still usable for friend search, but no longer
computable offline, so it stops being a password verifier. The Worker accepts
both old and new ids during the overlap so existing friend lists keep working.

**Stage 2 — split the three roles.** On next login, derive:
- `account_id` — random, opaque, public. Used in URLs, Stripe, R2 object names.
- `verifier` — Argon2id (PBKDF2-SHA512 fallback for old Silk) over
  password + per-account random salt. Stored server-side. Proves identity.
- `data_key` — derived separately via HKDF with a different context string.
  **Never transmitted.** Encrypts state, exactly as today.

The server then holds a slow salted verifier and ciphertext it cannot read —
which is what "end-to-end encrypted" is supposed to mean, and what the current
copy in the app claims but does not deliver.

**Stage 3 — sessions.** Login returns a short-lived opaque session token sent in
an `Authorization` header. Quotas, bans and social identity key off the
server-resolved `account_id`, which closes KH-11 as a side effect.

**Stage 4 — dual-read, then sunset.** Read v1 or v2; write v2. Migrate each
account silently at login (the plaintext is in memory at that moment, so
re-encryption is free). After the long tail, refuse v1 and delete the old rows.

**Interim honesty fix (ship immediately, independent of the above):** the app's
E2E-encryption copy is not accurate for the D1 path. It should say data is
encrypted in transit and at rest and that the operator does not read it —
not that the operator *cannot*. Overstating this is the kind of claim users make
security decisions on.

### KH-11 — impersonation and vote forgery

Reactions, comments, votes, presence, scores and message authorship are all
caller-supplied. Fixing this properly means server-resolved identity, i.e. it
depends on Stage 3 above. Doing it before then would mean inventing a second,
throwaway identity mechanism.

Impact today is nuisance-tier — fake reactions, forged leaderboard scores,
impersonated display names — not account compromise or data loss. Sequenced after
the account work rather than patched twice.

---

## Operator action (not code)

### KH-10 — the open browser proxy

`vpn.arancool3000.workers.dev` is an unauthenticated public CORS proxy: anyone
can burn its quota and use KindleHub infrastructure to fetch arbitrary URLs. Its
source is **not in this repository**, so its SSRF, redirect and size behaviour
could not be reviewed.

Recommended: put the source in version control, require a short-lived token
issued to KindleHub sessions, rate-limit per IP, cap streamed bytes, and apply
destination rules *after* DNS resolution and after every redirect. Until then it
is a standing abuse risk to the free-tier budget the rest of the app depends on.

### KH-15 — email anti-spoofing

SPF exists with `~all`; there is no DMARC record. Since the domain publishes
`security@kindlehub.pro`, spoofed mail is a credible phishing route.

1. DKIM for every legitimate sender (Resend provides records).
2. `_dmarc.kindlehub.pro TXT "v=DMARC1; p=none; rua=mailto:you@…"`, read reports.
3. Move to `p=quarantine`, then `p=reject`; tighten SPF to `-all`.
4. Add a CAA record.

### Standing deploy gates

- `ADMIN_SECRET` is now **required** — without it nobody is admin. Verify it is
  set before deploying this Worker build.
- `KH_PEPPER` for envelope-at-rest (keep it forever once set).
- `STRIPE_PRICES` must be set when using a test key.

---

## Accepted for now

### KH-12 — reset email abuse

Real, but dormant: the client ships with no default mail gateway, so
`/reset/request` is unreachable in production. To be fixed **before** external
mail is re-enabled: prove the account exists and that `to` is its recorded
recovery address, add per-IP and global attempt limits, and make the attempt
counter atomic. Note the audit's own finding that this is not by itself account
takeover — the 64-character recovery key is still required.

---

## Correction to the audit

One item is already fixed and the audit's snapshot predates it: KH-04's Stripe
metadata leak. Commit `f0e5399` replaced the account hash with an opaque billing
id before the audit was published. The rest of KH-04 stands.
