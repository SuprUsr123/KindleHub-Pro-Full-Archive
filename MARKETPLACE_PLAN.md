# KindleHub — Paid App Marketplace + Tips (PLAN)

> **Status: PLAN / not built.** Records the design for (1) letting any user
> publish **paid** apps on the App Store with a tiered revenue split to the
> creator, and (2) optional **tips**. Depends on the Stripe work in
> `STRIPE_INTEGRATION.md`. The revenue-share part specifically needs **Stripe
> Connect**, which is a larger build than the subscription flow.

## 1. Paid app publishing + revenue share

Today apps publish free (`S.publishedApps`, AI-reviewed, sandboxed). This adds a
**price** to a published app and pays the seller, minus KindleHub's cut.

### The creator's cut, by the SELLER's tier
| Seller's plan | KindleHub's cut | Seller keeps |
|---|---|---|
| Free | 30% | 70% |
| KindleHub + | 10% | 90% |
| KindleHub Pro | 5% | 95% |
| KindleHub Max | 3% (option to lower further) | 97%+ |

Lower cut = a real perk of paying for a plan (incentivises upgrades). The cut is
Stripe's **`application_fee_percent`** on each sale — Stripe splits the money
automatically and pays the seller their share.

### Why this needs Stripe Connect (the hard part)
To pay a third-party seller you cannot just take their money into your account —
that's legally "money transmission." Stripe **Connect** handles it:
- Each seller onboards a **Connect account** (Express is simplest: Stripe hosts
  the sign-up, collects their KYC/bank details, handles their tax) before they
  can price an app.
- A buyer's payment is a **Checkout Session** with
  `payment_intent_data.application_fee_amount` (your cut) +
  `transfer_data.destination` (the seller's Connect account) — Stripe routes the
  split and pays out the seller on their schedule.
- **Refunds, chargebacks, disputes, 1099/tax reporting** are Stripe's job, not
  ours — that's the whole reason to use Connect.

### Flow
1. Seller (any tier) taps **Sell this app** in the App Store → if they have no
   Connect account yet, open Stripe Express onboarding (`_khOpenExt`).
2. They set a price; we store it on the `S.publishedApps` entry +
   server-side (a `kh_store_prices` row keyed by app id → {price, seller_acct}).
3. Buyer taps **Buy** → Worker creates a Checkout Session with the tier-based
   `application_fee_percent` + the seller's `destination` → hosted checkout.
4. Webhook `checkout.session.completed` → grant the buyer the app (record the
   entitlement, unlock the sandboxed app for them).
5. Seller sees earnings in Stripe's Express dashboard; KindleHub takes its cut
   automatically.

### Open questions
- Payment model: one-time buy vs. the seller charging their own subscription
  (start with **one-time buy** — simpler).
- Minimum price / currency; refunds window; content policy for paid apps
  (the AI review already gates quality/safety — keep it, maybe stricter for paid).
- Do buyers on higher tiers get a discount? (TBD.)
- Tax on the buyer side (Stripe Tax).

### Scope estimate
This is the **largest** item on the roadmap — Connect onboarding + per-sale split
+ buyer entitlements + a seller earnings surface. It's its own focused build
**after** the subscription flow (`STRIPE_INTEGRATION.md`) is live and proven.

## 2. Tips (easy — do with the subscription build)

An optional "support KindleHub" tip, separate from any plan (see also
`DONATE_PLAN.md`, which favoured an outbound link — this supersedes it with real
Stripe tips):
- A **"Leave a tip"** button in Settings → About and on the upgrade sheet.
- Opens a one-time **Stripe Checkout** (`mode=payment`) with preset amounts
  (£1 / £3 / £5 / custom). No Connect needed — it's just a payment to the
  KindleHub account.
- Unlocks nothing (pure thank-you), so no entitlement to track.

## 3. Related AI asks (belong to the monetization/Stripe build, not this doc)
- **Backup system key**: add `GEMINI_KEY_BACKUP` (+ optional other-provider keys)
  to the Worker; the shared proxy falls back to it when the primary key's daily
  quota is spent, so the free pool never fully dies. Small Worker change.
- **Gemma-free AI games**: route game AI (Infinite Craft, Akinator, …) to the
  Gemma models (14,400/day free quota) so AI-powered games are free for everyone
  and never draw from a paid message quota. Small client change.
- **Own API keys = Pro/Max**: gate the existing Settings key fields (Gemini /
  OpenRouter / Anthropic / OpenAI) to Pro/Max; optionally a multi-key list for
  rotation. Part of the tier gating in `MONETIZATION_PLAN.md`.

## Build order
1. Subscription flow (`STRIPE_INTEGRATION.md`) — Free/+/Pro/Max.
2. Tips (trivial add-on to #1).
3. Backup key + Gemma-free games (small, independent — can land any time).
4. **Marketplace + revenue share (Stripe Connect)** — the big one, last.
