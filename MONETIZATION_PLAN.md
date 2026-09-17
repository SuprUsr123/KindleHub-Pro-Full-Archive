# KindleHub — AI Message-Quota & Tier Plan (PLAN)

> **Status: PLAN / not implemented. Nothing here is in `index.html` yet.**
> This records the intended monetization model: what each paid tier gets, how
> AI messages are metered and pooled, and which AI surfaces become paid. Non‑AI
> features stay 100% free for everyone. Written from the app as it actually
> works today (grep anchors below) so it can be built without re‑discovery.
>
> Supersedes the AI/feature portion of `PRICING_PLAN.md` (that doc is the
> 1,600‑name internal ladder — names + prices only). This doc defines what the
> **4 public tiers** actually *do*.

---

## 1. The four public tiers

| Tier | Price (idea) | AI messages / day | Pool type | Own API keys | KindleHub Intelligence | Models |
|---|---|---|---|---|---|---|
| **KindleHub** (Free) | £0 | **5** | shared with + | No | No | basic (flash‑lite + Gemma) |
| **KindleHub +** | ~£1.99/mo | **25–50** (variable) | shared with Free | No | No | basic (flash‑lite + Gemma) |
| **KindleHub Pro** | ~£4.99/mo | **1,000–10,000** | **own** dedicated pool | **Yes** | **Yes** | + Flash models |
| **KindleHub Max** | ~£9.99/mo | first‑come from **shared Max pool** (no per‑user cap; ≥ Pro floor) | shared Max pool | **Yes** | **Yes** | + Pro/best models |

Prices are the anchor from the earlier chat proposal; final numbers TBD (offer
annual at ~2 months free). The internal cosmetic name ladder in
`PRICING_PLAN.md` still maps onto these 4 public groupings.

**Everything that is free today stays free at every tier** — the reader, Free
Library, games, KindleOS, chat/mail, notes/journal/flashcards, all the apps,
cloud sync. Only **AI usage** is metered and tiered. This is deliberately a
"pay for AI, not for the app" model.

---

## 2. The message‑quota model (the core of this plan)

A **"message"** = one billable AI call. Today only the Assistant chat increments
a counter (`S.aiMsgCount` at `index.html` ~35913); this plan makes that counter
**authoritative** and routes **every** AI call through one gate.

### 2.1 Pools

Four daily budgets, all reset 00:00 UTC (matching the existing
`kh_shared_api_usage` counter and `SHARED_KEY_DAILY_CAP`):

1. **Free+Plus shared pool** — Free and + draw from **one** shared budget. This
   is the current shared Gemini free‑tier budget (`SHARED_KEY_DAILY_CAP`, today
   29,880/day: 2× Flash‑Lite @500 + 4× Flash @20 + 2× Gemma @14,400). Free users
   spend at most 5/day each; Plus users spend a variable 25–50 (below), all from
   this same pool.
2. **Pro own pool** — each Pro user gets a **dedicated** daily allowance,
   **1,000 floor, burstable to 10,000**, not contended with Free/Plus. Served
   from a paid Gemini key/quota the operator funds (see §7 billing).
3. **Max shared pool** — Max users share a **separate** large pool on a
   **first‑come‑first‑served** basis: **no per‑user hard cap**. A heavy Max user
   can keep going until the Max pool for the day is spent. When it *is* spent,
   Max users fall back to **at least the Pro floor (1,000/day)** so Max is never
   worse than Pro.

Free and + **never** touch the Pro or Max pools, so a paid user's quality of
service can't be degraded by free traffic — the reason to split the pools.

### 2.2 The variable KindleHub+ allowance (25–50)

Plus is deliberately *not* a fixed number — it flexes with how healthy the
shared Free+Plus pool is, so early users can't drain it and late users aren't
starved. Computed per user at send time from the live shared counter
(`readSharedKeyUsage()` already returns `{used, cap, remaining}`):

```
fracDayElapsed = secondsSinceUtcMidnight / 86400          // 0..1
expectedByNow  = cap * fracDayElapsed                      // even‑pace target
pace           = used / max(1, expectedByNow)              // >1 = draining ahead of pace
plusToday      = clamp(25, 50, round(50 / max(1, pace)))   // ahead → tighten to 25, on/behind pace → up to 50
```

So on a quiet morning Plus users see ~50; when the pool is being hammered ahead
of pace, Plus tightens toward 25 to protect the day. Free stays a flat 5 (it's
the floor everyone is guaranteed). Show the number live in the Assistant so it's
never a mystery ("Plus: 41 messages left today").

### 2.3 What spends a message

- **Assistant chat** — 1 message per send (the existing chokepoint).
- **AI‑powered games** — e.g. Infinite Craft's AI combos (`InfiniteCraft` →
  `khiCall`), online Akinator, any game that calls the model — **spend 1 message
  from your daily quota**, *unless* you're **Pro or Max** (their large/uncapped
  pools make game AI effectively free). Free/Plus: an AI‑game call draws from the
  5 / 25–50. Offline game fallbacks (Infinite Craft's ~110 seed combos, offline
  Akinator) do **not** spend anything.
- **KindleHub Intelligence actions** — Pro/Max only (see §4), billed to their
  pool (effectively free for them).

Everything routes through one helper (proposed): `_khConsumeMessage(kind)` →
returns allow/deny, decrements the local `S.aiMsgCount` **and** the server pool
counter, and shows the friendly "you're out for today — resets at midnight UTC,
upgrade for more" state on deny. Both the chat sender and every `khiCall`
game/feature call it first.

---

## 3. Model access ladder (better models unlock higher up)

Maps onto the existing `GEMINI_GROUPS` / `SHARED_MODEL_QUOTAS` / the shared
fallback chain. Higher tiers *add* models, never remove:

| Tier | Text models available |
|---|---|
| Free, + | **Basic**: Gemini Flash‑Lite (3.5 / 3.1 flash‑lite, 500/day each) + **Gemma** (4‑31B / 4‑26B, 14,400/day each). High‑quota, cheap, keeps the shared pool alive. |
| Pro | Basic **+ Flash** (3.6 / 3.5 / 2.5 Flash) — noticeably better quality. |
| Max | Pro **+ the best**: Gemini **Pro** models (e.g. 2.5‑pro / 3.1‑pro). |

The model picker (`buildAIModelPicker`) filters options by
`_khTier()` so lower tiers simply don't see the locked models (with an "upgrade
to unlock" hint). Gemma stays the deep fallback for Free/Plus so the free pool
is very hard to exhaust.

---

## 4. KindleHub Intelligence = Pro feature

**KHI** (the pervasive in‑app AI — mail draft/summarise/polish, note/journal
summarise, the "AI everywhere" actions gated today by
`khiEnabled()` = `S.khIntelligence && hasAnyKey()`) becomes a **Pro & Max**
feature.

- Free/Plus still get the **Assistant chat** (metered by their 5 / 25–50), but
  **not** the embedded KHI actions scattered across the app.
- Pro/Max get KHI everywhere, billed to their pool.
- Implementation: `khiEnabled()` gains a tier check → `S.khIntelligence &&
  (tier==='pro'||tier==='max')` (own‑key no longer required, since Pro/Max have
  a pool). The per‑surface KHI buttons hide/upsell for Free/Plus.

*(Decision to confirm: does the standalone Assistant chat count as "KHI" and
thus Pro‑only, or is basic chat available to all within quota? This plan assumes
**basic chat for all within quota; KHI‑everywhere for Pro+** — the more
generous, more upsell‑friendly reading.)*

---

## 5. Own API keys = Pro & Max only

Today anyone can paste a Gemini/OpenRouter/Anthropic/OpenAI key for unlimited
free AI (`geminiKey`/`openrouterKey`/`anthropicKey`/`openaiKey` in `S`), which
undercuts the whole model. New rule:

- **Adding and using your own API key on ANY AI feature is Pro/Max only.**
- Free/Plus: the key fields + the "use my own key" provider options are hidden
  (or shown as a locked "Pro" upsell). Free/Plus always run on the shared
  bundled path within their quota.
- Pro/Max: full own‑key support (unlimited when they bring their own key, on top
  of / instead of their pool). This is a genuine Pro/Max perk, not just a limit.

---

## 6. Remove the free "KindleHub AI" Llama surfaces

Part of the same shift — the "free unlimited built‑in AI" framing goes away:

- **Remove the `workersai` provider** ("KindleHub AI — free built‑in Llama/Qwen
  on Cloudflare Workers AI"): the provider option, its models
  (`KH_WORKERS_AI_MODELS`, `@cf/meta/llama-*`), the "Free AI (Llama)" labels, and
  the picker branding (anchors: `index.html` ~35088–35102, ~35466, ~35632; the
  `S.workersAiModel` field; the `/kh-workers-ai` worker route).
- **Remove the free OpenRouter Llama options** from the pickers
  (`meta-llama/llama-3.3-70b-instruct:free`, `llama-4-maverick:free`) — OpenRouter
  stays only as a **Pro/Max own‑key** provider (§5), not a free fallback.
- The only "free AI" is now the **metered shared Gemini pool** (Free 5, Plus
  25–50). Cleaner story, and it's what actually has quota headroom (Gemma).

---

## 7. Entitlement & billing (the hard dependency)

Metering is the easy half; **knowing who is Free/Plus/Pro/Max** is the blocker —
the app's only backend is the Cloudflare D1 Worker, with no billing today.

- **Tier source of truth**: a server‑signed entitlement on the D1 worker
  (e.g. a `kh_entitlements` row keyed by the account hash → `{tier, until}`),
  returned at login and cached in `S`. The client‑side `_khTier()` must **not**
  be trusted for pool spend — the **worker** enforces which pool a request may
  draw from (the client tier only drives UI). Otherwise anyone edits `S.tier`.
- **Payment**: out of scope for the app itself (same stance as `DONATE_PLAN.md`)
  — use a hosted checkout (Stripe / Ko‑fi / Play/App Store IAP), whose webhook
  writes the `kh_entitlements` row. Kindle Silk can't run heavy checkout SDKs, so
  purchase happens on a **hosted page** (open via `_khOpenExt`), not in‑app.
- **Grace / offline**: cache `{tier, until}` so a paid user keeps their tier
  offline until `until`; re‑verify on next sync.

---

## 8. Migration & grandfathering

- **Internal name collision (important):** today `_khTier()` returns **`'pro'`
  as the free baseline** and the header brands everyone "Pro". The new paid
  "Pro" is a *different* thing. Rename the internal baseline string
  `pro` → **`free`**, and introduce `plus` / `pro` / `max`. Audit every
  `_khTier()==='pro'`, `_khRequireUltra`, `_storageLimit`, and the header badge
  (`_khUpdateHeaderBadge`) call‑site during the rename — this is the riskiest
  mechanical part.
- **Earned‑Ultra:** the current usage‑earned `ultra` tier disappears from the
  paid ladder. Grandfather existing earned‑ultra users to **Plus** for a
  transition window (or a fixed credit), then sunset. Decide before launch.
- **Existing free users:** default everyone to **Free (5/day)**. Communicate via
  the one‑time in‑app notice mechanism (like `_khMaybeShowStoreNotice`) so the
  new limit isn't a silent surprise. Consider a launch grace period.
- **Storage caps** (`_storageLimit`: creator 12MB / ultra 3MB / pro 1.5MB)
  should re‑map to the new tiers (Free 1.5MB / + 3MB / Pro 6MB / Max 12MB, TBD).

---

## 9. Implementation sketch (plan only — do NOT build yet)

Client (`index.html`), all behind the entitlement from §7:

1. `_khConsumeMessage(kind)` — the one gate. Reads tier → today's allowance
   (Free 5, Plus `plusToday`, Pro floor/burst, Max FCFS) → checks the right pool
   → decrements local `S.aiMsgCount` + server counter → allow/deny + upsell on
   deny. Route **`sendChat` (~35912)** and **every game/feature `khiCall`**
   through it.
2. `plusAllowanceToday()` — the §2.2 formula off `readSharedKeyUsage()`.
3. `modelsForTier(tier)` — filter `buildAIModelPicker` (§3).
4. `khiEnabled()` — add the Pro/Max tier check (§4).
5. Gate the own‑key fields/providers to Pro/Max (§5).
6. Remove `workersai` + free‑Llama options (§6).
7. Live "N messages left today" readout in the Assistant + a small tier badge.

Worker (`api-worker.js`): split `kh_shared_api_usage` into pool buckets
(`freeplus` / `pro:<user>` / `max`), enforce per‑pool caps **server‑side**, and
add `kh_entitlements` (tier source of truth). This is the only backend change
and it's a **deploy gate**.

---

## 10. Open decisions for the creator

- Final prices + annual discount; which checkout provider.
- Confirm §4 assumption (basic chat free‑within‑quota vs all chat = KHI/Pro).
- Pro burst ceiling (10,000 hard vs soft) and Max pool daily size.
- Earned‑Ultra grandfathering (→ Plus window? fixed credit? hard sunset?).
- Whether Free gets AI *games* at all, or games are Plus+ (this plan: Free's 5
  can be spent on games too).
- Storage‑cap re‑mapping numbers.

## 11. Explicitly NOT in this plan

- No code in `index.html` yet — this is the spec only.
- No in‑app card entry (hosted checkout only).
- No change to any non‑AI feature — the app stays free to use.
