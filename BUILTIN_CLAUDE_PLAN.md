# Plan: built-in Claude for Pro and Max

**Status: PLAN ONLY — nothing here is built.** Written at the user's request
("maybe make a plan for adding free haiku for pro and max users up to like a
certain limit. just a plan for now").

Two separate things, deliberately kept apart:

1. **Bring-your-own Claude/OpenAI keys** — a paid-plan feature, cheap for us,
   ready to ship. Costs us nothing; the user pays Anthropic/OpenAI directly.
2. **Built-in Claude Haiku** — we pay. Needs a hard budget before it ships.

---

## Part 1 — bring-your-own keys (ready, near-zero risk)

The client already speaks Anthropic and OpenAI (`callAnthropic` / `callOpenAI`
around index.html:8324/8340) and `buildAIModelPicker` already has provider
entries for both. What's needed is only the gating and the copy:

- Key entry fields for Claude and GPT live behind `_khRequirePlan('pro', …)`.
  Free and + see the fields greyed with "Use your own Claude or GPT key —
  KindleHub Pro".
- The plan sheet already says "Use your OWN API keys (Gemini, Claude, GPT,
  OpenRouter)" on Pro, so the promise is made; this makes it true.
- **Cost to us: £0.** The user's key, the user's bill.

⚠️ One real caveat to fix at the same time: personal API keys are currently
synced inside the account state blob, which the server can decrypt (see
SECURITY_AUDIT_RESPONSE.md, KH-02). Storing *more* third-party keys there raises
the stakes. Either keep Claude/OpenAI keys **device-local** (like
`kh_admin_secret` already is), or ship this after the account-key migration.
Device-local is the smaller change and is the recommendation.

---

## Part 2 — built-in Claude Haiku for Pro and Max

### Why Haiku, and not the rest

Deliberately **excluding Opus and Sonnet-class models, and excluding Fable.**
Fable is a creative-writing model — a Kindle audience would use it for long
generations, which is exactly the expensive shape, for a feature nobody asked
for. Haiku is the only tier where the numbers work at these prices.

### The numbers (the part that decides whether this ships)

Haiku 4.5 is roughly **$1 / M input, $5 / M output**. A realistic KindleHub
chat turn — a short question, a short answer, plus a system prompt and a couple
of turns of history — is about **1,500 in / 400 out**:

```
per message  ≈ (1500/1e6 × $1) + (400/1e6 × $5)
             ≈ $0.0015 + $0.0020  ≈ $0.0035   (~0.28p)
```

Against revenue, per user per month:

| Plan | Revenue | Gross after ~3% fees | Messages until it eats 25% of revenue |
|------|---------|----------------------|----------------------------------------|
| Pro | £3.99 | ~£3.87 | ~345/mo (~11/day) |
| Max | £7.99 | ~£7.75 | ~690/mo (~23/day) |

So the honest, safe allowance is roughly:

- **Pro: 10 Haiku messages/day** (~£0.85/mo at full use)
- **Max: 25 Haiku messages/day** (~£2.10/mo at full use)

Real usage will be far below the cap — most people won't hit it daily — so
expected cost is perhaps a third of that. But **the cap is what bounds the
downside**, and the downside is what matters: at 100 Pro subscribers all
maxing out, that is ~£85/mo of API spend against ~£387/mo of revenue. Survivable.
Without a cap, one enthusiastic user with a script is unbounded.

Gemini stays the default for everyone. Haiku is a *quality* option on top, not a
replacement — which also means if Anthropic pricing moves, we turn Haiku off and
nothing breaks.

### How it plugs in (small, because the plumbing exists)

The metering built this session already does most of the work:

- `TIER_DAILY` in api-worker.js meters per account per day in
  `kh_shared_api_usage`, keyed `u:<hash>:<date>`. Add a **separate** key
  namespace `c:<hash>:<date>` so Haiku has its own budget and cannot eat the
  Gemini allowance (or vice versa).
- `accountTier()` already resolves the real plan from `kh_entitlements`, so
  gating is `tier==='pro'||tier==='max'` — no new identity work.
- Add `ANTHROPIC_KEY` to the Worker env and a `handleClaudeProxy` alongside
  `handleGeminiProxy`, same shape: `{model, payload}` in, SSE out.
- Pin the model server-side to Haiku. **Never** let the client choose the model
  on the built-in key — that is how a 20× more expensive model gets requested.
- Client: one extra entry in the shared-provider list, shown only to Pro/Max,
  labelled "Claude Haiku (included)". Reuses `buildAIModelPicker`.

### Hard limits before it goes live

1. `ANTHROPIC_KEY` set with a **spend cap configured in the Anthropic console**.
   Belt and braces — do not rely solely on our own counter.
2. A global daily ceiling in the Worker (e.g. `CLAUDE_DAILY_MAX`), so a bug in
   our per-account metering cannot run up an unbounded bill. Past it, Haiku
   degrades to Gemini with a plain message.
3. Per-request output cap (`max_tokens`) — the output side is 5× the input
   price, so an unbounded response is the expensive failure mode.
4. Ship to **Max only** for the first month, watch the real cost per user, then
   extend to Pro. Max is the smaller and more committed group.

### What this is worth

Pro and Max currently differ from free mostly by *quantity*. "Claude, included"
is a difference in *kind*, and it is the single most quotable line on the plan
sheet. It is also the feature most likely to make someone pick Max over Pro,
because the cap difference (10/day vs 25/day) is concrete.

---

## Sequencing

1. **Now:** ship bring-your-own Claude/OpenAI keys, device-local, Pro+ gated.
   Zero cost, immediate value, tests the demand for Claude at all.
2. **Watch:** how many Pro/Max users actually add a Claude key. If very few do,
   built-in Haiku is not the feature to spend money on.
3. **Then:** built-in Haiku for Max, with all four limits above in place.
4. **Later:** extend to Pro once a month of real cost data exists.

Explicitly not planned: Opus/Sonnet-class models on our key, and Fable in any
form.
