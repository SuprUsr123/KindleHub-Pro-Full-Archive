# Account v2 — auth hardening plan (staged, backward‑compatible)

Status: **planning doc only.** No behaviour changes yet. This documents *how* we
would close the biggest finding from the security audit without breaking any of
the ~350 existing accounts. Nothing here ships until we choose to start Phase 1.

---

## The problem (why v2 exists)

Today a single value does three jobs:

```
key = SHA-256("kh::" + username + "::" + password)
```

* **Database lookup key** — `kh_users.hash = key` (how we find your row).
* **AES‑GCM encryption key** — your whole state blob is encrypted with `key`.
* **De‑facto recovery secret** — the old "write down this random string" flow was
  effectively handing the user this same value.

Because the **lookup key equals the decryption key**, a dump of the `kh_users`
table is *self‑decrypting*: whoever holds a row's `hash` also holds the exact key
that decrypts that row's `state`. The envelope‑at‑rest pepper (`KH_PEPPER`) on the
Worker mitigates a raw D1 theft, but the architecture is still wrong: lookup and
decryption must be **different** keys, and the decryption key must be derived in a
way that a server dump can't reproduce.

Related, already being fixed separately:

* **Email password reset** (see the email‑reset work) replaces the
  "remember a random string" recovery entirely. That is a prerequisite for v2,
  because once lookup ≠ encryption key, a lost password can no longer be silently
  recovered from the hash — you need a real out‑of‑band reset channel (email).

---

## v2 key model

Derive **two independent keys** from the password, and add a per‑user random salt
so identical passwords don't collide and rainbow tables don't apply.

```
salt          = 16 random bytes, stored in kh_users.salt (public, per user)
masterKey     = PBKDF2(password, salt, iters=150k, SHA-256, 32 bytes)   // never leaves the device
lookupKey     = SHA-256("kh-lookup::" + username + "::" + salt)         // sent to server as the row id
encKey        = HKDF(masterKey, info="kh-enc")                          // AES-256-GCM state key
authVerifier  = SHA-256("kh-verify::" + masterKey)                      // proves you know the password
```

Properties:

* **lookupKey** is derived from username + salt only — it identifies the row but
  reveals nothing that decrypts it.
* **encKey** comes from PBKDF2 over the password and **never touches the network**.
  A stolen D1 dump has `salt`, `lookupKey`, `authVerifier`, and ciphertext — none of
  which yield `encKey` without the password (and PBKDF2 makes brute force costly).
* **authVerifier** lets the server (optionally) confirm a login attempt without ever
  seeing the password or the encryption key.
* `WebCrypto` provides `deriveKey`/`deriveBits` (PBKDF2 + HKDF) on the Silk engines
  we support — verify on a real device before committing to iteration count.

New/changed columns on `kh_users`: `salt TEXT`, `ver INTEGER DEFAULT 1`
(1 = legacy scheme, 2 = new scheme), `auth_verifier TEXT`. All nullable /
best‑effort ALTER so legacy rows keep working.

---

## Staged rollout (no flag day, no forced logouts)

**Phase 0 — prerequisites**
* Ship email password reset (real 6‑digit code, 10‑min expiry). Done/in progress.
* Add `salt`, `ver`, `auth_verifier` columns (schema‑d1.sql + Worker SCHEMA_DDL +
  ALTER). No client change yet.

**Phase 1 — dual‑read, write‑legacy**
* Client learns to derive BOTH schemes. On login: try the v2 `lookupKey` first; if
  the row's `ver` is 1 (or no v2 row exists), fall back to the legacy `hash`.
* Still *writes* legacy so an older client (cached PWA / other device) can still read.
* Ship + soak for a couple of weeks so the new client is everywhere.

**Phase 2 — migrate on login (opportunistic, per user)**
* When a legacy user logs in with the v2‑capable client, we have their password in
  memory → generate `salt`, derive `encKey`, **re‑encrypt their state**, write the
  new row keyed by `lookupKey` with `ver=2` + `auth_verifier`, and delete/tombstone
  the old `hash` row after a confirmed successful write.
* Users who never log in stay on v1 indefinitely — that's fine; nothing breaks.
* A dashboard counter (v1 vs v2 row counts) tracks migration progress.

**Phase 3 — legacy sunset (optional, much later)**
* Once >95% of *active* accounts are `ver=2`, stop writing legacy and require a
  password re‑entry (or email reset) for the stragglers. Never delete a v1 row we
  can't re‑encrypt without stranding that user's data — leave them until they log in.

---

## Migration safety rules

* **Never** delete a legacy row until the v2 row is confirmed written AND readable.
* Re‑encryption happens **only** on a live login (we have the password in memory);
  we never attempt server‑side re‑encryption (the server can't — that's the point).
* Keep the offline‑cred cache working across the switch (it stores an encrypted
  local copy; re‑key it in the same login).
* The account alias (`aran` ↔ `arancool3000`) must flow into `lookupKey` derivation
  exactly as it does into `_userKey` today, so the merged account stays merged.
* Admin gate: match ONLY the authenticated login identity, not the user‑settable
  display name `S.user` (this closes the pre‑existing "display‑name token" surface
  noted in the audit — worth doing as part of v2).

---

## Open questions (decide before Phase 1)

1. PBKDF2 iteration count vs Silk CPU — 150k may be too slow on an old Kindle; benchmark.
2. Do we want the optional server‑side `authVerifier` check, or keep auth purely
   client‑side (simpler, but no server‑side brute‑force throttle on login)?
3. Migration window length for Phase 1 soak.
4. Whether to bundle the admin‑gate `S.user` fix into v2 or ship it independently first.

---

*This is a design doc. It intentionally changes nothing until we explicitly start
Phase 0.*
