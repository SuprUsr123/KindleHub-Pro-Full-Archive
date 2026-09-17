# Cloudflare setup — every secret KindleHub reads

Three Workers, deployed separately. Each has its own env. Nothing here is in the
repo; all of it is set in the Cloudflare dashboard.

**Secret vs Variable matters:** `wrangler deploy` **replaces Variables and leaves
Secrets alone**. Anything private goes in as a **Secret** (Settings → Variables →
*Encrypt*), or your next deploy silently wipes it.

Where to set them: Workers & Pages → *the worker* → Settings → Variables and Secrets.

---

## 1. `api-worker.js` — the main backend

### Required. Without these, things are broken right now.

| Name | Type | What breaks without it |
|---|---|---|
| `DB` | D1 binding | Everything. Bind your D1 database as `DB`. |
| `ADMIN_SECRET` | **Secret** | **All admin actions.** `isAdmin()` is `sha256(token) === sha256(ADMIN_SECRET)` and **fails closed** — with this unset, *nobody* is admin server-side, no matter who is signed in. Gifting plans, bans, warnings, announcements, plan counts, moderator grants: all refused. Paste the same value into Settings → Account → ADMIN SECRET on each device. Generate: `LC_ALL=C tr -dc 'a-z' < /dev/urandom \| head -c 16; echo` |

### Strongly recommended

| Name | Type | What it does |
|---|---|---|
| `GEMINI_KEY` | **Secret** | The shared/public AI pool for users with no key of their own. **Also gates the App Store review queue** — without it every app anyone publishes sits in `pending` forever and never appears in the store. |
| `GEMINI_KEY_BACKUP` | **Secret** | The backup key you were thinking of — **it exists in the code and you never set it.** Comma-separated for several. When the primary hits Google's quota (429) or is rejected, the *same request* is retried on the next key, so the free pool never dies mid-day. This is the single cheapest fix for "public AI always busy". |
| `KH_PEPPER` | **Secret** | Envelope-encrypts sensitive columns at rest (`kh_users.state`, mail subject/body, message text) with a `KHW1:` prefix. A stolen D1 copy is useless without it. ⚠ **Once set, keep it forever** — losing it makes wrapped rows unreadable. Opt-in; unset is a no-op and old rows keep working. |
| `ALLOW_ORIGIN` | Variable | CORS origin. Defaults to `*`. Set to your domain once stable. |

### Billing — only if you are taking payments

| Name | Type | Notes |
|---|---|---|
| `STRIPE_SECRET_KEY` | **Secret** | `sk_live_…` / `sk_test_…` |
| `STRIPE_WEBHOOK_SECRET` | **Secret** | `whsec_…`. **Without this, renewals never reach us.** `current_period_end` then goes stale and subscribers get treated as lapsed. There is now a 7-day grace window and a "needs attention" count on the Plans card so this is visible instead of silent, but the real fix is the webhook. |
| `STRIPE_PRICES` | Variable | JSON price-id map. Required with a *test* key (the worker refuses a test key against baked-in live price ids). |
| `APP_BASE_URL` | Variable | Where Checkout returns to, e.g. `https://kindlehub.pro` |
| `STRIPE_LINKS`, `STRIPE_AUTOCANCEL` | Variable | Optional. |

### Optional

| Name | Default | Notes |
|---|---|---|
| `MOD_HASHES` | — | Comma-separated SHA-256 of moderator codes. Unlocks aggregate counts only. Grant/revoke by editing the env; no deploy needed. |
| `AUTO_MOD` | off | Server-side moderation cron + the App Store review queue. |
| `AUTO_MOD_BAN` | **off** | ⚠ **Leave this off.** Autonomous banning trusts report text it cannot verify. Keep it off until reports are authenticated and evidence is server-derived. |
| `ADMIN_USERNAMES` | — | Never auto-moderated. Not an admin grant. |
| `MOD_MODEL`, `MOD_MAX` | — | Moderation model + per-run cap. |
| `ANTHROPIC_KEY`, `CLAUDE_DAILY_CAP` | — | Claude-backed features. |
| `DAILY_CAP` | 3580 | Shared-AI calls per day. |
| `RESET_SECRET` | — | **Must match the email worker's.** Password-reset codes. |
| `REQ_HARD_CAP`, `WRITE_HARD_CAP`, `MONTHLY_REQ_CAP`, `MONTHLY_WRITE_CAP` | 90k/90k/9.5M/9.5M | Budget guards → read-only before an overage bill. |
| `RL_BURST`, `RL_DAY` | 100/10s, 20k/day | Per-IP limits. |
| `AGENT_SECRET`, `AGENT_WEBHOOK_URL`, `AGENT_WEBHOOK_AUTH` | — | The suggestions-queue helper. Can only set a feedback status. |
| `MAINT_*` | off | Self-maintenance. |
| `CRED_FAIL_MAX`, `CRED_FAIL_DAY` | — | Credential brute-force limits. |

---

## 2. `state-worker.js` — big state blobs on R2 (zero egress)

| Name | Type | Notes |
|---|---|---|
| `STATE_BUCKET` | R2 binding | The bucket. |
| `API_GATEWAY` | Variable | The api-worker URL. |
| `ALLOW_ORIGIN` | Variable | Defaults `*`. |

Optional — without it, blobs stay in D1, which works but costs egress.

---

## 3. `email-worker.js` — real outbound email

| Name | Type | Notes |
|---|---|---|
| `RESEND_API_KEY` | **Secret** | Resend. Free tier 100/day; the worker caps itself at 80. |
| `RESET_SECRET` | **Secret** | **Same value as the api-worker's.** |
| `API_GATEWAY` | Variable | The api-worker URL, so mail lands in the same D1. |
| `RESET_FROM` | Variable | Default `noreply@kindlehub.pro` |
| `DAILY_SEND_CAP` | Variable | Default 80. |

---

## If you set nothing else, set these four

1. **`ADMIN_SECRET`** — nothing admin works without it, and the app looks like it does.
2. **`GEMINI_KEY`** — the free AI pool *and* App Store publishing.
3. **`GEMINI_KEY_BACKUP`** — the one you meant to add. Fixes "AI always busy".
4. **`STRIPE_WEBHOOK_SECRET`** — if you're charging, renewals depend on it.

Then hit the worker URL once so `ensureSchema` creates/migrates every table.

**Workers deploy separately from the Pages site.** A change to `index.html` ships
by merging to `main`; a change to a worker needs its own deploy. After either,
Cloudflare → Caching → **Purge Everything**.
