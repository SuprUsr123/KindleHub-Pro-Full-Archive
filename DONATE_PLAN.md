# KindleHub — "Donate to the developer" (PLAN)

> **Status: SHIPPED (Phase 1).** The outbound-link tip jar described below is
> implemented. Admin → Local Insights → "Tip jar" sets the links; leave them
> blank and no card appears anywhere. Hosts are allow-listed (ko-fi, Buy Me a
> Coffee, GitHub Sponsors, Patreon, Liberapay, PayPal.me). Original plan text
> follows.
>
> **Original status: PLAN / not implemented.** KindleHub is free and stays free. This
> document records how an *optional* "support the creator" flow could work if
> and when it's added. Nothing here ships until the creator decides to build it.
> Prompted by a community request ("is there a way to donate to the dev?").

## Goals

- Give users who *want* to say thank-you a friction-light way to do so.
- **Never** nag, gate features, or interrupt anyone. Donating unlocks nothing —
  the whole app is already free; this is a tip jar, not a paywall.
- Fit the platform: old Kindle Silk WebKit, a single self-contained HTML file, a
  strict CSP on published apps, no analytics, no data collection.

## Constraints (why this is a plan, not a one-liner)

1. **No payment backend.** The app's only server is the Cloudflare D1 Worker; it
   has no billing integration and shouldn't handle card data.
2. **Kindle browser is weak.** Third-party checkout SDKs (Stripe.js, PayPal
   buttons) are heavy and often don't render on Silk. External scripts are also
   blocked by the published-app CSP.
3. **Trust + safety.** Any "pay" surface must be unmistakably the real creator
   and never look like it's collecting money under false pretenses. It must be a
   plain outbound link to a reputable, creator-owned page — not an in-app form.
4. **Global audience.** Users are worldwide, so the mechanism must not assume one
   country's payment rails.

## Recommended approach — a simple outbound link (Phase 1)

The lowest-risk, highest-compatibility option is **no in-app payments at all** —
just a link to a hosted donation page the creator already controls:

- Add a small **"Support KindleHub"** card in **Settings → About / Also by the
  creator** (next to the existing `cAlso` creator-links card).
- One or two buttons that open, via the existing scheme-safe `_khOpenExt(url)`
  helper (same one the creator-project links already use):
  - **Ko-fi** (`ko-fi.com/<creator>`) — no fee to receive, one-off or monthly,
    works in a plain browser tab, no login required to give.
  - **Buy Me a Coffee** (`buymeacoffee.com/<creator>`) — similar.
  - (Optional) **GitHub Sponsors** for the developer-heavy Reddit audience.
- Copy stays honest and pressure-free, e.g.:
  > "KindleHub is free and always will be. If it's made your Kindle more useful
  > and you'd like to chip in for hosting, there's a tip jar — entirely optional,
  > and it unlocks nothing extra. Thank you."
- **No emoji** in the button labels (Silk tofu); plain text + the existing
  line-icon style. e-ink-safe, static, no new network calls on load.

### Why a link, not an embedded checkout
The donation page (Ko-fi/BMC) handles cards, currencies, receipts, refunds, tax,
and fraud — all the parts KindleHub must *not* touch. We just point at it.

## Phase 2 (optional, only if there's real demand)

- A tiny **"supporters" wall**: people who tip can (opt-in) leave a first name /
  handle that shows on a static Credits/Contributors card. Store as a plain list
  the creator curates by hand — **no** automatic payment→identity linkage (that
  would need webhooks + PII handling we're avoiding).
- A **one-time "thanks" cosmetic** (e.g. a supporter badge on the profile). This
  must be granted *manually by the creator*, never auto-unlocked by a payment,
  so there's no entitlement backend and no "pay to win/paywall" perception.

## Explicitly out of scope

- In-app card entry / stored payment methods.
- Subscriptions or recurring billing inside the app (see `PRICING_PLAN.md` for
  the separate, also-hypothetical paid-tier ladder — that's a different thing).
- Anything that conditions app features on having donated.
- Crypto wallets (volatile, scam-adjacent, poor fit for the audience).

## UI placement summary

| Where | What |
|---|---|
| Settings → About / Also by the creator | "Support KindleHub" card, 1–2 outbound tip-jar buttons via `_khOpenExt` |
| (Phase 2) Credits/Contributors card | Opt-in, hand-curated supporters list |

## Open decisions for the creator

- Which platform(s): Ko-fi vs Buy Me a Coffee vs GitHub Sponsors (or all).
- The exact account URLs (must be creator-owned and verified).
- Whether to do Phase 2 at all.

## Effort estimate

- **Phase 1:** ~1 small card + 1–2 `_khOpenExt` buttons + copy. Client-only, no
  worker/schema/env change, no deploy gate beyond the normal merge. A few lines.
- **Phase 2:** a static list + an opt-in field; still client-only, manual
  granting. Larger only in curation effort, not code.
