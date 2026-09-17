# KindleHub — scaling on the Cloudflare free tier

Free-tier hard limits (reset 00:00 UTC): **Workers 100k requests/day**,
**D1 100k row-writes/day**, D1 5 GB storage / 5M reads/day, R2 10 GB + $0 egress.
The api-worker self-limits at **90k** (10% margin) and returns `503` past that, so
Cloudflare is never actually exceeded — but that 503 means the site goes
read-only, which is exactly what we want to avoid until we're much bigger.

## What keeps us under the cap

1. **Adaptive fleet backoff (closed loop).** Every Worker response carries
   `X-KH-Load` = % of the daily budget used. Each client reads it and, once load
   passes ~55%, its background pollers (presence, chat notifier, room poll) start
   skipping ticks — ramping to ~85% skipped near the cap. The whole fleet slows
   together, so load rises toward the limit and *flattens* instead of crossing
   it. User actions (send, sync) are never throttled — only live-update latency
   degrades. This is the main mechanism: **service stays up, it just gets a bit
   less real-time under peak load.**
2. **Presence writes halved.** Heartbeat 40s → 70s, "online" window 60s → 150s.
   Presence was the single most frequent write.
3. Existing guards: per-IP rate limit, round-robin chat notifier (1 cheap probe
   per 45s), poll pauses when the tab is hidden, weekly-staggered re-sync.

## Rough headroom (order-of-magnitude)

A typical Kindle session (~20 active min/day) costs ~50–60 Worker requests and
~25 writes. So:

| Users (registered) | Daily-active (~25%) | Requests/day | Verdict |
|---|---|---|---|
| 500  | ~125  | ~7k   | trivial |
| 2000 | ~500  | ~28k  | comfortable |
| 5000 | ~1250 | ~70k  | **fits, backoff is the safety valve** |

5000 registered users is **feasible on free tier** with the backoff absorbing
spikes. It is *not guaranteed* on a viral day where daily-active runs far above
25% (thousands concurrently in chat) — then the backoff keeps chat alive but
slower. If we want a hard guarantee with zero degradation:

## The definitive fix for 5000+: Workers Paid — $5/month

Raises limits to **10,000,000 requests/day** and D1 to **50M writes/day**
(≈100× headroom). At $5/mo flat, 5000 users never come close — room for 50k+.
This is the honest answer if we want certainty rather than graceful degradation.

## Optional extra (no code): edge-cache the global reads

Add a Cloudflare **Cache Rule** for `…/rest/v1/kh_announcements*` and
`…/rest/v1/kh_scores*` (global, non-per-user, low-churn) with a short edge TTL
(30–60s). A cache HIT is served *without* invoking the Worker, so it doesn't
count against the 100k. Do **not** cache kh_users / kh_mail / kh_messages
(per-user + sensitive).

## Deploy gates (do these when shipping)

1. **Migrate users to D1 first.** The app now routes ALL auth to the D1 Worker
   (`KH_DEFAULT_API_GATEWAY`), the legacy backend is severed. If any of the ~172
   accounts still live only on the legacy backend, run the admin **migration**
   (Admin → Local Insights) and confirm the copy BEFORE this build goes live, or
   those users can't log in.
2. **Set `KH_PEPPER`** in the Worker (Variables & Secrets) to a long random value
   and keep it permanently — enables envelope-at-rest.
3. Redeploy `api-worker.js`, upload `index.min.html`, Cloudflare **Purge
   Everything**.
