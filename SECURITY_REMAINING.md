# What is still open, and why

Written 27 July 2026, after working through the external review of `fb8fa81`
and the multi-agent bug hunt. Everything not listed here was fixed and has a
regression test. This file exists so the remaining items are a decision rather
than an oversight.

## Deploy before any of the server-side work counts

`api-worker.js`, `email-worker.js` and (if it is deployed) `state-worker.js`
all changed. Until they are redeployed, the client-side half is live and the
server-side half is not.

`state-worker.js` gained an optional `API_GATEWAY` variable. Set it to the D1
worker's URL. Without it, the "does this account exist?" check cannot run and
the worker behaves as it did before — anyone who knows a 64-character hash can
allocate an object in the bucket.

---

## Open: the account-key architecture (review KH-A04, KH-A09)

**This is the real one.** `SHA-256("kh::" + username + "::" + password)` is
simultaneously:

- the account's primary key,
- the bearer credential,
- the password-recovery secret, and
- the AES-256-GCM key for everything the account stores.

It is unsalted and fast, so an offline guess costs one hash. Public reads
expose the first sixteen characters, which is enough to test guesses. A full
disclosure is both account access and decryption of all of it — there is no
second factor anywhere in that chain.

Group chat has the same shape one level down: the conversation key is one
SHA-256 of a twelve-digit room code, and player search deliberately publishes a
hash prefix from which an inbox code is derived deterministically.

**Why it is not fixed here.** The fix is `ACCOUNT_V2_PLAN.md`: random account
ids, a per-account salt, a memory-hard verifier, short-lived server sessions,
and a separate data key. That is a migration for every existing account, and a
migration done wrong locks people out of data only their password can decrypt.
It needs dual-read, migrate-on-login, and a sunset — staged over weeks, with a
way back at each step. Doing it inside a batch of unrelated fixes would be
reckless.

**What was done instead**, as far as it goes without a migration: `KH_PEPPER`
wraps the sensitive columns at rest, so a stolen database copy is not
immediately readable; the state-worker now takes the key in a header rather
than a query string; and the sixteen-character prefix is no longer accepted as
proof of anything (presence now requires the full hash).

## Open: identity is still caller-asserted (KH-A06 remainder, KH-A13)

Timestamps are now stamped server-side, which was the part that let one caller
delete another's chat history. But the *identity* on a message, a score, a
reaction or a comment is still whatever the client sent. Impersonation, vote
manipulation and score forgery remain possible for anyone willing to call the
API directly.

The honest fix is the same server sessions KH-A04 needs — derive the writer
from the session instead of trusting the payload. It is not a patch; it is the
same migration.

## Open: rate limiters are not atomic (KH-A14)

Both the D1 counters and the Cache API limiters are read-modify-write, several
are per-colo, and several fail open. They raise the cost of abuse; they do not
bound it. Cloudflare Rate Limiting or a Durable Object would. Worth doing, but
it is a deployment change rather than a code change, and the global budget
guard already stops a runaway bill.

## Open: model output still runs in the host page (KH-A16)

The local AI-fix feature executes model-produced JavaScript in the host realm
after the user confirms. A denylist of literal names is not a security
boundary. Same for the Sheets formula engine, which evaluates formula text with
`Function` — currently only reachable by a user typing into their own sheet, so
it is self-harm rather than a path in.

Fix is an opaque-origin worker for the first and a real tokenizer/interpreter
for the second. Both are contained rewrites, neither is a migration — this is
the most tractable of the remaining items and the obvious next one to take.

## Open: reset-email abuse (KH-A18)

`/reset/request` takes an account-like value and a destination address with no
binding between them, so rotating the value can send branded mail to arbitrary
addresses and burn the shared daily cap. Verification alone does not reset an
account, so this is abuse and availability, not takeover. Wants a stored
recovery-contact binding plus limits by IP, account and destination.

## Repository history

Old commits still contain the decommissioned Supabase project URL and its
anonymous key. Removing them from the current tree revoked nothing. Confirm the
project is shut down or the key rotated, and treat any account whose state
lived there as needing a password change.
