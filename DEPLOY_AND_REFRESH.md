# Deploy & Refresh — "I made changes but the site still shows the old version"

This is the checklist for when a fix is in the code (merged to `main`) but you're
still seeing the old behaviour on your Kindle or Mac. Nine times out of ten it's a
**cached bundle** or a **worker that wasn't redeployed** — not a code bug.

There are **two separate things** that deploy independently. A change to one does
NOT update the other:

| What | Where it lives | How it deploys |
|------|----------------|----------------|
| The **site** (`index.html` → `index.min.html` + `kh-app.js`) | Cloudflare **Pages** | Auto-deploys when you merge to `main` |
| The **workers** (`api-worker.js`, `email-worker.js`, `state-worker.js`) | Cloudflare **Workers** | Must be redeployed **separately** |

---

## 1. Site changes (games, apps, UI, sync, profile, dashboard…)

These are in `index.html`. To ship them:

1. Merge the PR to `main`. Cloudflare Pages rebuilds automatically (a minute or two).
2. **Purge the Cloudflare cache** so visitors stop getting the old file.
3. **Hard-refresh** the device you're testing on.

### Where is "Purge Everything"?
Cloudflare dashboard → pick the **domain** (kindlehub.pro) in the top list →
left sidebar **Caching** → **Configuration** → the **Purge Everything** button
(bottom of that page) → confirm.

> If you only see a Pages project and no "Caching" menu, click the **domain name**
> itself first (not the Pages project). Caching lives on the domain/zone, not on
> the Pages project.

### How do I hard-refresh?
The reliable trick that works **everywhere, including Kindle**: add a throwaway
query string to the URL and open it:

```
https://kindlehub.pro/?v=2
```

Change the number (`?v=3`, `?v=4`…) each time. The browser treats it as a new URL
so it can't serve a cached copy. This is the easiest way on a Kindle, where the
"clear cache" menu is buried.

Per-browser hard refresh (if you'd rather):
- **Mac Chrome / Edge / Brave:** `Cmd+Shift+R`.
- **Mac Safari:** `Cmd+Opt+E` (empties the cache), then `Cmd+R`. If you don't have
  the option, Safari → Settings → Advanced → tick "Show Develop menu", then
  Develop → **Empty Caches**.
- **Kindle (Silk / experimental browser):** use the `?v=2` trick above. Or Menu →
  Settings → **Clear history / cache**, then reopen.

---

## 2. Worker changes (AI daily cap, payments, mail, rate limits, moderation cron)

These are in `api-worker.js` (and the two other worker files). Merging to `main`
does **NOT** deploy them — you have to push the worker itself.

Symptoms that mean "the worker is stale, redeploy it":
- The **AI message cap** doesn't reset, or counts wrong ("used all 5 today" a week
  later) — the metering lives in `api-worker.js`.
- **Payments** say "no subscription found" / a payment link is "broken" — the
  Stripe checkout + webhook are in `api-worker.js`.
- **Mail** won't send (gateway 405) — `email-worker.js`.

### How to redeploy a worker
Cloudflare dashboard → **Workers & Pages** → click the worker (e.g.
`kindlehub-api`) → **Deployments** tab → if it's connected to this GitHub repo it
redeploys on push; otherwise use **Deploy** / the CLI:

```
npx wrangler deploy                     # api-worker (wrangler.toml)
npx wrangler deploy -c wrangler.email.toml
npx wrangler deploy -c wrangler.state.toml
```

After a worker redeploy, hit the worker's URL once in a browser (you should get a
small health response) to confirm it's live.

---

## 3. Quick "which one is it?" guide

| You changed / expected… | Redeploy the site? | Redeploy the worker? |
|---|:---:|:---:|
| A game, app, page, dashboard, chat UI, sync/merge logic | ✅ (auto on merge + purge) | — |
| **Profile name / avatar syncing** between devices | ✅ | — |
| **AI daily message cap** behaviour | — | ✅ api-worker |
| **Stripe payments** / entitlements | — | ✅ api-worker |
| **Real email** sending | — | ✅ email-worker |
| Per-IP rate limits, budget guard, moderation cron | — | ✅ api-worker |

When in doubt: merge to `main`, **Purge Everything**, redeploy the api-worker, and
open the site with `?v=<new number>`. That clears all three failure modes at once.

---

## 4. Note on account-specific state (profile, chats, notes)

Cross-device state (profile name, avatar, notes, chats) syncs through the
**account state blob**, not the file cache. If a device is showing old *account*
data:
- Make sure both devices are **signed in to the same account** (aran ≡ arancool3000,
  same password → same data).
- The device that made the edit uploads it on its next sync; the other device
  adopts it on its next pull (within a minute or two of opening the app online).
- A device stuck on a **stale bundle** can't run the current sync code — so fix the
  cache first (section 1), *then* judge whether sync is actually behaving.

The sync mechanism itself is covered by regression tests
(`tools/tests/profilesync_test.cjs`, `sync_test.cjs`, `synclists_test.cjs`).
