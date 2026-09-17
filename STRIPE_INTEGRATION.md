# KindleHub — Stripe payments integration (runbook + build spec)

> **STATUS: BUILT AND SHIPPED (disabled until you set the key).**
> The code exists in `api-worker.js` (server) and `index.html` (client).
> Endpoints live at `/stripe/checkout`, `/stripe/webhook`, `/stripe/portal`,
> `/stripe/status`; entitlements are stored in the `kh_entitlements` D1 table.
> With no `STRIPE_SECRET_KEY` set, checkout returns `{disabled:true}` and the UI
> says upgrades aren't open yet — so this is already live and harmless.
>
> **To switch payments ON:** deploy the Worker, set `STRIPE_SECRET_KEY`, create
> the webhook endpoint in Stripe, set `STRIPE_WEBHOOK_SECRET`. That's it.
>
> Implements the paid tiers from `MONETIZATION_PLAN.md` with **real Stripe
> subscriptions**. Tiers: **KindleHub (Free)**, **KindleHub +**, **KindleHub
> Pro**, **KindleHub Max** — each paid tier billed **monthly or yearly**.
>
> **Nothing here handles a secret key in the client or the repo** — the Stripe
> secret lives only in the Worker env.

## Verified by tests
`/tmp/stripe_test.mjs` (54 assertions) covers, among others: a forged webhook is
rejected **and writes nothing**; a replayed webhook is rejected; `kh_entitlements`
is not reachable through the generic REST reader; the status endpoint never
leaks Stripe ids; checkout binds the payment to exactly one account; the whole
thing is inert with no key; and the inactivity sweep only ever cancels genuinely
inactive accounts, never active ones.

## Why hosted Checkout (not Stripe.js / Elements)

Target device is old Kindle Silk WebKit. Stripe.js/Elements is heavy, uses
modern JS, and is blocked by the published-app CSP + the browser. So:

- The **Worker** creates a **Stripe Checkout Session** (server-side, secret key)
  and returns its `url`.
- The **client** opens that URL with the existing scheme-safe `_khOpenExt(url)`
  — Stripe's own hosted, PCI-compliant page handles all card entry.
- On success Stripe redirects back to the app; the **webhook** (server) is the
  source of truth that grants the entitlement — never the client return URL.

## Prices (proposed — confirm/adjust)

| Tier | Monthly | Yearly |
|---|---|---|
| KindleHub + | £0.99 | £9.99 |
| KindleHub Pro | £3.99 | £39.99 |
| KindleHub Max | £8.99 | £89.99 |

**Donations: REMOVED for now** — not in the current scope, so no tip product or
prices are needed (only the 3 plan products / 6 plan Prices). Can be added later
as one-time/monthly/yearly Stripe tips.

**Subscribe on a modern device (NOT the Kindle):** Kindle Silk can't reliably
run Stripe's hosted checkout. The upgrade UI MUST show a clear note — *"Buy on a
phone or computer, not your Kindle — it then unlocks on every device
automatically"* — and ideally offer a link/QR to continue checkout elsewhere.

**Plan saves across ALL your devices (100%):** the entitlement is stored
SERVER-SIDE in `kh_entitlements` keyed by the account hash, never on the device.
On login (any device, incl. the Kindle) the client fetches its row and unlocks
the tier — buy once on your phone, your Kindle has it on next sync. Cache
`{tier, until}` for offline; re-verify on sync.

## Security scan of these additions
- **Prices are display text only** — the real charge always comes from the Stripe
  Price, so a client-edited number can't change what's billed.
- **Entitlement is server-authoritative** — the client tier drives UI only; the
  Worker enforces which pool/features a request may use from `kh_entitlements`.
  Editing `S.entitlement` locally can't actually grant Max (the Worker ignores the
  client's claimed tier for anything that costs money/quota).
- **Webhook signature verified** before any entitlement is written → nobody can
  POST a fake "they paid" event.
- **`client_reference_id` = the account hash** binds a payment to exactly one
  account (can't be applied to someone else's).
- **Cross-device sync carries no new secret** — `kh_entitlements` holds only tier
  + Stripe customer/sub ids (no card data, no PII); a user can read only their OWN
  row.
- **Donations unlock nothing** → no entitlement to forge.

## Inactivity auto-cancel (never charge a user who's stopped using KindleHub)

If a subscriber goes inactive for a whole billing period, cancel at period end so
they are NOT charged again, and tell them why.

- **Rule:** monthly plan + no activity for ~30 days, or yearly plan + no activity
  for ~365 days → cancel.
- **"Active" =** the account's last sign-in/sync (`kh_users.updated_at`, already
  bumped on every sync) — use it as `last_active` (mirror it onto the
  `kh_entitlements` row for a cheap check).
- **How:** the Worker's existing `scheduled()` cron (same one running
  auto-moderation) walks `kh_entitlements WHERE status='active'`; for any whose
  `last_active` is older than its interval, call Stripe
  `POST /v1/subscriptions/{id}` with `cancel_at_period_end=true` — they keep what
  they already paid for, it simply doesn't renew (**no next charge**) — then set
  the row `status='canceled_inactive'`.
- **Notify:** drop a targeted announcement + push — *"Your KindleHub &lt;tier&gt;
  was paused because you hadn't used it in a while — you won't be charged again.
  Resubscribe any time in Settings."* — so it's never a silent surprise.
- **Grace:** check a few days BEFORE renewal (not on the exact day); any sign-in
  refreshes `last_active`, so someone who returns just in time keeps their plan.
- **Safety:** this path only ever CANCELS, never charges; cancel-at-period-end
  needs no refund logic; Stripe still owns billing (we only flip the renewal flag
  server-side via the secret key).

Free is £0 (no Stripe object). Currency GBP (Stripe can present local currency
later via multi-currency Prices).

---

## PART A — What YOU do in the Stripe Dashboard (once)

Do this in **Test mode** first, then repeat/switch to Live.

1. **Create 3 Products**: "KindleHub +", "KindleHub Pro", "KindleHub Max".
2. For **each** Product create **2 recurring Prices** (GBP):
   - Monthly (`recurring.interval = month`) at the price above.
   - Yearly (`recurring.interval = year`) at the price above.
   → You now have **6 Price IDs** (`price_...`). Copy them.
3. **Enable the Customer Portal**: Settings → Billing → Customer portal → activate
   (lets subscribers cancel / change plan / update card themselves).
4. **Get your keys**: Developers → API keys → **Secret key** (`sk_...`). (You do
   NOT give me this — it goes in the Worker env in Part B.)
5. **Create the webhook** (after the Worker is deployed, Part C):
   Developers → Webhooks → Add endpoint →
   URL = `https://<your-api-worker>/stripe/webhook`, events:
   `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`. Copy the **Signing secret** (`whsec_...`).

## PART B — What YOU set in the Cloudflare Worker env (api-worker)

`wrangler secret put` (or the dashboard → Settings → Variables):

- `STRIPE_SECRET_KEY = sk_...`
- `STRIPE_WEBHOOK_SECRET = whsec_...`
- `STRIPE_PRICES` — the 6 real Price IDs (received; baked into the Worker as the
  default, so you don't strictly need to set this env var, but you CAN to override):
  ```json
  {"plus":{"month":"price_1Tx6uaCqmll1R4xF3u1RUr6i","year":"price_1Tx6uaCqmll1R4xF5FBEdsLT"},"pro":{"month":"price_1Tx6wkCqmll1R4xFbqzhZG3x","year":"price_1Tx6wkCqmll1R4xFF8KjNFqR"},"max":{"month":"price_1Tx6zHCqmll1R4xF87XtvfOn","year":"price_1Tx6zHCqmll1R4xFvHb4bGL3"}}
  ```
- `APP_BASE_URL = https://kindlehub.pro` (for Checkout success/cancel redirects)

Until `STRIPE_SECRET_KEY` is set, the checkout endpoint returns
`{disabled:true}` and the client shows "Upgrades open soon" — safe no-op, so the
code can ship before you finish Stripe setup.

---

## PART C — What I build (server, `api-worker.js`)

New table `kh_entitlements` (added to `SCHEMA_DDL` + `schema-d1.sql`):
```
kh_entitlements(
  hash TEXT PRIMARY KEY,        -- KindleHub account key (== kh_users.hash)
  tier TEXT NOT NULL,           -- 'free' | 'plus' | 'pro' | 'max'
  status TEXT,                  -- 'active' | 'canceled' | 'past_due' ...
  interval TEXT,                -- 'month' | 'year'
  current_period_end INTEGER,   -- unix secs; grace until this
  stripe_customer_id TEXT,
  stripe_sub_id TEXT,
  updated_at TEXT
)
```

Endpoints (all under the existing Worker router; secret key used server-side only):

1. **`POST /stripe/checkout`** — body `{tier, interval}` + `X-KH-Secret` (the
   caller proves account ownership like other authed writes). Resolves the Price
   ID from `STRIPE_PRICES`, creates a Checkout Session
   (`mode=subscription`, `client_reference_id = <account hash>`,
   `success_url = APP_BASE_URL + '/?upgraded=1'`, `cancel_url = APP_BASE_URL`),
   reuses/creates the Stripe customer, returns `{url}`. Returns `{disabled:true}`
   if no secret key.
2. **`POST /stripe/webhook`** — verifies the `Stripe-Signature` HMAC against
   `STRIPE_WEBHOOK_SECRET` (raw body). On:
   - `checkout.session.completed` → read `client_reference_id` (hash), the
     subscription, its price → map price→tier/interval → **upsert
     `kh_entitlements`** (tier, status=active, period end, customer/sub ids).
   - `customer.subscription.updated` → refresh status/tier/period end.
   - `customer.subscription.deleted` → set tier='free', status='canceled'.
   Idempotent (keyed by hash + sub id). Always 200 on handled events.
3. **`POST /stripe/portal`** — body + `X-KH-Secret` → creates a Billing Portal
   session for the account's `stripe_customer_id`, returns `{url}` (Manage/cancel).
4. **`GET /rest/v1/kh_entitlements?hash=eq.<h>`** — already covered by the generic
   PostgREST reader; the client reads its own row at login to learn its tier.
   (Server enforces that a non-admin can only read their OWN hash's row.)

**Server is the source of truth.** The AI message-pool enforcement
(`MONETIZATION_PLAN.md`) reads the tier from `kh_entitlements` server-side — the
client tier only drives UI, never the actual pool a request may draw from.

## PART D — What I build (client, `index.html`)

1. **Tier resolution** — `_khTier()` gains an entitlement source: at login fetch
   `kh_entitlements` for the account hash, cache `{tier, status, current_period_end}`
   in `S.entitlement`; `_khTier()` returns `max|pro|plus|free` (admin still
   `creator`). Offline grace until `current_period_end`. (Careful rename: today's
   internal baseline string is `pro` — becomes `free`; audit every `_khTier()`
   call-site per the plan's §8.)
2. **Upgrade / Pricing UI** — one reusable `_khOpenUpgrade(feature)` sheet:
   the 4 tiers, a **Monthly ⇄ Yearly** toggle (yearly shows "2 months free"),
   feature bullets, and a **Subscribe** button → `POST /stripe/checkout` →
   `_khOpenExt(url)`. Current tier badged; "Manage subscription" → `/stripe/portal`.
   Mounted in **3 entry points** (as requested):
   - **Setup wizard** — a "Choose your plan" step (Free selected by default; the
     paid options open Checkout, non-blocking — you can finish onboarding on Free).
   - **Settings → Account** — a "Plan" card showing current tier + Upgrade/Manage.
   - **Profile** — a small tier badge + "Upgrade" link.
3. **Premium gating** (per `MONETIZATION_PLAN.md`) — every locked feature calls a
   single guard `_khRequirePlan(minTier, feature)` that either proceeds or opens
   `_khOpenUpgrade(feature)`:
   - AI message quota (Free 5/day, Plus 25–50 variable, Pro/Max pools).
   - KindleHub Intelligence actions → Pro/Max.
   - Own API keys → Pro/Max (hide key fields for Free/Plus).
   - Better models unlocked by tier in `buildAIModelPicker`.
   - AI-powered games bill a message unless Pro/Max.
4. **Return handling** — on `?upgraded=1` boot param, re-fetch the entitlement and
   toast "You're on <tier> now".

## PART E — Testing

- Stripe **Test mode** + test card `4242 4242 4242 4242`.
- Webhook locally via the Stripe CLI: `stripe listen --forward-to <worker>/stripe/webhook`.
- Worker unit test with a mocked Stripe fetch + a signed webhook body
  (`/tmp/stripe_test.mjs`), plus a headless client test of the upgrade sheet +
  tier gating.

## Phased build order

1. **Foundation** — `kh_entitlements` table + `/stripe/checkout` + `/stripe/webhook`
   + `/stripe/portal` (Worker), and client `_khTier()` reading the entitlement +
   the `_khOpenUpgrade` sheet in Settings. (Ships safely disabled until env set.)
2. **Wire-in** — setup-wizard plan step + profile badge; `_khRequirePlan` guard.
3. **Gating** — apply the guard to the AI quota, KHI, own-keys, model picker, AI
   games (the `MONETIZATION_PLAN.md` rules). Rename baseline `pro`→`free`.
4. **Polish** — yearly toggle copy, `?upgraded=1` handling, Manage-subscription,
   proration/cancel messaging.

## Security checklist

- Secret key + webhook secret: **Worker env only**, never client/repo.
- Webhook **signature verified** before trusting any event.
- Entitlement is **server-authoritative**; client tier is cosmetic.
- `client_reference_id` binds the Stripe customer to the KindleHub account hash so
  a payment maps to exactly one account.
- No PII beyond the Stripe customer/sub ids stored in D1.
