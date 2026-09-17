# KindleHub Cloud — what it is, and what has to be built before it can be sold

> **Status: PLAN / not implemented.** Nothing here is in the app yet.
>
> Companion docs, so this one does not repeat them:
> - `PRICING_MATHS.md` — what it costs and what to charge. **Read it first.**
> - `MONETIZATION_PLAN.md` — the AI quota ladder (this doc is storage, not AI).
> - `STRIPE_INTEGRATION.md` — how payment already works.

---

## 0. The thing to know before anything else

`PRICING_MATHS.md` recommends **50 GB on Max**. The app today caps Max at
**100 MB** (`TIER_STATE_BYTES` in `api-worker.js` ~2506, mirrored by
`_storageLimit` in `index.html` ~18979). That is a **500× gap, and it is not a
number you can raise.**

The reason is the shape of the storage, not the size of the limit. Everything a
user owns lives in **one encrypted blob**:

- it is gzip-packed and mirrored into `localStorage['kindlehub_v5']` on the device;
- it is AES-GCM encrypted whole, so **any** change re-encrypts and re-uploads **all** of it;
- D1 stores it in 1.8 MB chunks (`CHUNK_PREFIX`, `kh_state_parts`, ~397) because a
  single D1 value cannot exceed ~2 MB;
- the Kindle browser has roughly 5 MB of `localStorage` and has to gzip the whole
  thing on the main thread on every save.

So the blob cannot become a gigabyte on any device, and *especially* not on the
device the whole product exists for. **100 MB is already generous for this
design — it is not the limit being too low, it is the design not being a
filesystem.**

**Therefore: selling storage means building a second storage system.** Not
raising a constant. That is what this document is for.

---

## 1. What KindleHub Cloud is

Two stores with different jobs, not one store with a bigger number.

| | **State** (exists today) | **Vault** (to build) |
|---|---|---|
| Holds | settings, notes, journal, flashcards, game saves, contacts | books, drawings, flipbooks, images, published apps, exports |
| Shape | one blob, read+written whole | one object per item, fetched on demand |
| Size | **megabytes** — stays capped | **gigabytes** — this is what the plan sells |
| Where | R2 via `state-worker.js`, or D1 chunks | R2, one key per item |
| On device | fully resident, always | **never fully resident** — fetched when opened |
| Encryption | AES-GCM, whole blob | AES-GCM, **per item, own key** |
| Sync | every change, everywhere | on demand, per item |

The split matters because it is the only way a Kindle can be a first-class
client of a 50 GB account: it holds the small blob, and it holds *references* to
the big things, fetching one when you open it. A 2 GB photo library on a Kindle
is a list of names until you tap one.

### What Cloud is NOT

- **Not a Dropbox.** No arbitrary file upload, no folder tree, no desktop client.
  Items are things KindleHub made, so it always knows how to render them.
- **Not a CDN.** Vault objects are private and per-account. Published apps stay
  where they are (`S.publishedApps`).
- **Not a way to make chat bigger.** Message caps exist for moderation and
  storage-bound reasons that are unrelated.

---

## 2. Quotas

Storage numbers follow `PRICING_MATHS.md` §3. Everything not listed is
unchanged and free.

| Plan | State (blob) | **Vault** | Max item | Uploads/day |
|---|---|---|---|---|
| Free | 1 MB | **0** — Vault is a paid feature | — | — |
| + | 3 MB | **1 GB** | 25 MB | 200 |
| Pro | 50 MB | **10 GB** | 100 MB | 1,000 |
| Max | 100 MB | **50 GB** | 500 MB | 5,000 |

Three deliberate choices:

- **Free gets no Vault at all.** Not a small Vault — none. A free tier that
  stores gigabytes is the one thing that can produce a bill with no revenue
  attached, and "1 MB, but everything in the app works" is an honest free tier.
- **The state cap does not move.** It is a device constraint, not a plan
  feature. Selling a bigger blob would sell a slower Kindle.
- **Uploads/day is a real limit, not a formality.** `PRICING_MATHS.md` §5 makes
  the point: total storage is bounded by the plan, but **Class A operations are
  not**. Many small writes cost more in ops than in bytes. Bound the rate.

---

## 3. Enforcement — where the number is actually true

The client cap is advisory. `_storageLimit()` runs in the browser and anyone can
skip it, exactly like the ban list did before it was moved server-side (audit
KH-09). **Every quota below is enforced in the Worker or it does not exist.**

1. **Usage is a stored number, not a scan.** A `kh_vault` row per item
   (`user_hash, item_id, bytes, kind, created`) and a per-account total. Listing
   an R2 prefix to add up sizes on every upload is a Class B op per object and
   gets slower as the account grows — the exact shape of bug that only appears
   for your heaviest user.
2. **Check before the write, not after.** `total + incoming > quota` → `413`
   with the real numbers, so the client can say "this would put you 40 MB over"
   rather than "upload failed".
3. **Signed, single-use, expiring upload URLs.** The Worker authorises; R2
   receives. The Worker never proxies the bytes — that is what keeps a 500 MB
   upload from costing Worker CPU time.
4. **The account hash is not the object key.** `state-worker.js` keys objects by
   `SHA-256(username+password)` and that is defensible for one opaque blob, but
   a Vault has many objects, listable prefixes, and URLs that end up in logs.
   Use a random per-account `vault_id`, stored in the account row.
5. **Deletion on churn** (`PRICING_MATHS.md` §5): a cancelled account holding
   50 GB costs $0.75/month forever. Downgrade → read-only immediately, delete
   **30 days** after the paid period ends, with email warnings at 7 and 1 days.
   This must be a scheduled job, not a hope.

---

## 4. Encryption

Per-item keys, derived — never stored:

    item_key = HKDF(account_key, salt = item_id)

- The account key never leaves the device (it is already `SHA-256(user+pass)`).
- A leaked single item key exposes exactly one item.
- **The server cannot read anything**, which is the existing promise and must not
  weaken just because the objects got bigger.

The known cost, and it must be said out loud in the UI: **forget the password
and the Vault is gone too.** That is already true of the state blob, but "my
settings" and "my 8 GB of drawings" are different sizes of loss. Anything that
would let the server recover data would also let the server read it. Pick one,
say which, do not imply both.

---

## 5. What the user actually sees

- **Settings → Storage**: a bar (state vs vault vs free), the plan's number,
  biggest items, "delete" per item. One screen, no jargon.
- **Per-item state**: `Cloud` / `On this device` / `Uploading`. A Kindle showing
  50 GB it cannot hold needs to make that obviously fine, not look broken.
- **At 90%**: one notice, dismissible. **At 100%**: uploads fail with the
  number, everything else keeps working — never read-only, never a blocked app.
  (Same lesson as the read-only-at-95% cloud guard you had me remove.)
- **Downgrade over quota**: existing items stay and stay readable; new uploads
  refuse until under. Deleting a user's data because they stopped paying £4 is
  how you lose them permanently rather than for a month.

---

## 6. Build order

Each step is shippable and useful alone. Stop at any point.

1. **Turn on `state-worker.js`** — already written, tested, and deployed to
   nothing. Removes sync egress cost immediately, changes no UI, benefits every
   user including free. *Do this regardless of whether anything else here
   happens.*
2. **Monthly AI cap** — `PRICING_MATHS.md` §3. Not storage, but it is the thing
   standing between the current prices and a real bill. Highest value per hour
   of work in either document.
3. **`kh_vault` table + usage accounting + the Storage screen** — showing people
   what they use, before selling them more of it.
4. **Signed upload/download URLs + one item kind end to end.** Drawings first:
   they are already big, already local-only, and already lost when a device
   dies. One kind proves the whole path.
5. **The rest of the kinds** — flipbooks, book files, exports.
6. **Retention job** — before the first paid account exists, not after.

---

## 7. Honest open questions

- **Does anyone want this?** Nobody has asked for cloud storage. The requests in
  the feedback queue are games, mod tools and bugs. Storage was reverse-engineered
  from a pricing ladder, and that is a bad reason to build a filesystem. It might
  be better as the thing that makes Pro/Max *feel* substantial rather than as a
  headline — `PRICING_MATHS.md` already concludes storage is "a reason not to
  worry, not the product".
- **What does a Kindle do with 50 GB?** Genuinely: not much. The value is that
  the drawing survives the device. Be careful not to sell a number that the
  main device cannot use.
- **Is per-item encryption worth losing server-side dedupe/compression?** Yes,
  but it should be a decision, not an accident.
- **Free tier and Vault: really zero?** Zero is defensible and safe. A 100 MB
  free Vault would be a nicer product and a permanent, unbounded, unpaid cost.

---

## 8. Grep anchors

| What | Where |
|---|---|
| State size caps (server, authoritative) | `api-worker.js` `TIER_STATE_BYTES` ~2506 |
| State size caps (client, advisory) | `index.html` `_storageLimit` ~18979 |
| Blob chunking for D1's 2 MB ceiling | `api-worker.js` `CHUNK_PREFIX` / `kh_state_parts` ~397 |
| R2 state storage (written, not deployed) | `state-worker.js` (180 lines) |
| Client R2 path | `index.html` `_r2PutState` / `_r2GetState` / `_stateGatewayUrl` |
| Plan resolution | `index.html` `_khPlan` · `api-worker.js` `entEval` |
| Per-IP rate limiting to copy for uploads | `state-worker.js` `rlHit` |
| Daily/global budget guards | `api-worker.js` `dailyUsed` |
