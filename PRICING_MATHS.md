# What KindleHub actually costs to run, and what Max should cost

The question was: how do you compete with the big cloud companies, include 50 GB
on Max, and not lose money?

Short answer: **don't compete on storage.** Storage is where they are strongest
and you are weakest. Compete on the thing none of them will ever build — a real
computer on a Kindle — and make the storage generous enough that nobody thinks
about it. The maths below says you can afford that easily. What you **cannot**
currently afford is the AI allowance, and that is a bug in the pricing, not in
the product.

> Verify current rates before acting: Cloudflare and Google both change prices.
> Figures below are the published rates I have, and the *method* is what matters.

---

## 1. The cost side

### Storage — R2

| | |
|---|---|
| Storage | **$0.015 / GB-month** |
| Egress | **$0** |
| Class A ops (writes) | $4.50 / million |
| Class B ops (reads) | $0.36 / million |

**50 GB fully used = 50 × $0.015 = $0.75/user/month.**

Realistically most people will store a fraction of it. At 10% average fill
(5 GB) it is **$0.075/user/month**. But price for the full 50 GB, because the
one person who fills it is the one you must still be profitable on.

### Compute — Workers Paid + D1

$5/month flat, including 10M requests. D1 comes with it (25 bn row reads,
50 M row writes, 5 GB). At a few thousand requests per user per month, marginal
compute cost per user is **fractions of a penny**. Ignore it — but keep the
existing budget guards, because they are what stops a runaway becoming a bill.

### AI — and this is the whole problem

Assume a typical KindleHub message is ~500 input + ~300 output tokens. At Gemini
Flash-class rates (~$0.075/M in, ~$0.30/M out) that is about
**$0.00013 per message**.

Now apply the advertised caps:

| Plan | Cap/day | Possible/month | Cost if fully used |
|---|---|---|---|
| Free | 5 | 150 | $0.02 |
| + | 50 | 1,500 | $0.20 |
| Pro | 500 | 15,000 | **$1.95** |
| Max | 2,000 | 60,000 | **$7.80** |

**Max sells for £7.99 (~$10). Stripe takes ~1.5% + 20p, so you net ~£7.6 (~$9.5).
A Max user who actually uses their allowance costs $7.80 in AI alone.** Add 50 GB
of storage at $0.75 and you are at $8.55 against $9.50 of revenue — about a 10%
margin, before a single other cost.

That is not a business. And it gets worse: **there is no monthly cap in the code,
only a daily one.** A daily cap does not bound a monthly bill. `TIER_DAILY` is
the only limit that exists (`grep -c "AI_CAP_MONTH\|TIER_MONTHLY" api-worker.js`
→ 0).

### The bit that connects to "the public AI is always busy"

The shared pool runs on `GEMINI_KEY`. If that is a **free-tier** key, then AI
costs you nothing — and it also cannot serve the paid caps, which is exactly why
people see "AI busy". So today:

- Paid tiers are being served from a key that cannot support them → complaints.
- The moment you attach a **paid** key to fix that, the table above becomes your
  real bill.

**"Max feels pointless" and "the public AI is always busy" are the same problem
seen from two ends.** Selling 2,000 messages a day off a free-tier key means the
number is not real; making it real at the current price is unprofitable.

---

## 2. The competition, honestly

| | Storage | Price/month |
|---|---|---|
| iCloud+ | 50 GB | $0.99 |
| Google One | 100 GB | $1.99 |
| OneDrive | 100 GB | $1.99 |
| Dropbox | 2 TB | $11.99 |

**50 GB is worth about £1 on the open market.** You will never win that fight —
they have the scale and they treat storage as a loss-leader for their ecosystem.

What you have that they do not:

1. **It runs on a Kindle.** iCloud does not. Google Drive does not. This is the
   entire moat and it is a good one — a Kindle owner has no alternative.
2. **Zero egress.** R2 charges nothing to read data out, so heavy readers do not
   cost you more. Every competitor prices egress in.
3. **Bundling.** Storage plus AI plus the apps plus 70 games plus no ads.

So the pitch is not "50 GB for £X". It is **"everything on your Kindle, and
enough storage that you never think about it."** The 50 GB is a *reason not to
worry*, not the product.

---

## 3. What I recommend

### Fix the cap shape first — this is the important one

A daily cap bounds a bad day. A **monthly** cap bounds the bill. Add one:

| Plan | Daily | **Monthly** | Worst-case AI cost |
|---|---|---|---|
| Free | 5 | 100 | $0.01 |
| + | 50 | 800 | $0.10 |
| Pro | 500 | 6,000 | $0.78 |
| Max | 2,000 | 20,000 | **$2.60** |

The daily number — the one on the card — does not change, so nothing you have
advertised is withdrawn. But the monthly ceiling turns Max's worst case from
$7.80 to $2.60. Almost nobody will ever touch it: 20,000 messages a month is
660 a day, every day. Anyone who does hit it is a case worth looking at
individually.

### Then the price

| Plan | Now | Recommend | Storage | Worst-case cost | Margin |
|---|---|---|---|---|---|
| Free | £0 | £0 | 1 MB | ~$0.01 | loss-leader |
| + | £0.99 | **£0.99 — unchanged** | 1 GB | ~$0.11 | ~87% |
| Pro | £3.99 | **£3.99 — unchanged** | 10 GB | ~$0.93 | ~76% |
| Max | £7.99 | **£7.99 — unchanged** | **50 GB** | ~$3.35 | ~66% |

Yearly at 10× monthly (two months free) — the usual shape, and it improves cash
flow and cuts churn.

**Max stays at £7.99 — owner's decision, and it works.** At £7.99 with 50 GB the
margin is ~66% *provided the monthly cap below is in place*. Without that cap it
is roughly 10% and one heavy user wipes it out. So at this price the cap is not
an optimisation, it is the thing that makes the price viable. Do the cap first,
then never think about it again.

**Raise the storage on + and Pro too.** 3 MB and 50 MB are *megabytes* — they
read as a rounding error next to "50 GB" and make the ladder look broken. 1 GB
and 10 GB cost $0.015 and $0.15 respectively. They are essentially free to give
and they make the ladder legible.

### What actually makes Max worth having

Not the storage, and not a badge. Max should be the plan where **the AI stops
being a text box**: rendered tables, quizzes, charts, inline images. That is a
visible difference every single day, which is what people renew for. Storage is
what stops them cancelling; features are what make them subscribe.

---

## 4. Before you charge anyone

1. **`STRIPE_WEBHOOK_SECRET` must be set.** Without it renewals never arrive.
   There is now a 7-day grace window and an "attention" count so this is visible
   instead of silent, but that is a safety net, not a fix.
2. **Confirm the baked-in price IDs are yours.** `STRIPE_PRICES_DEFAULT` in
   `api-worker.js` carries specific `price_…` ids. If they are not the live ones
   in your Stripe account, checkout fails. Override with `STRIPE_PRICES`.
3. **Decide the AI key question.** Free-tier key = "AI busy" complaints and paid
   tiers that do not deliver. Paid key = the table in §1. There is no third
   option, and `GEMINI_KEY_BACKUP` only buys headroom, not capacity.
4. **A refund policy**, written down, before the first payment.

## 5. When you switch storage on

50 GB per Max user only works because R2 charges nothing for egress. Two rules
that follow:

- **Delete on churn.** A cancelled account still storing 50 GB costs $0.75/month
  forever. Deleting 30 days after cancellation is normal and expected.
- **Cap upload rate, not just total.** Total storage is bounded by the plan;
  Class A operations are not. Someone writing many small objects in a loop costs
  more in ops than in storage.
