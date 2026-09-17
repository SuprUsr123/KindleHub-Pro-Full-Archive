# KindleHub Pro — session handoff (continue here)

Working branch: **`claude/claude-md-review-fguoni`** · merges to `main` via **squash** PR.
Deploy: merge → take **both** `index.min.html` and `kh-app.js` from `main` (the HTML loads the app from the bundle; one without the other is a blank page) → upload to host → Cloudflare **Purge Everything**. Redeploy `api-worker.js` when it changed (self-bootstraps new D1 tables).

## Build / test (always run before merging)
- Rebuild deploy artifact + Silk syntax gate: `cd tools && node minify.mjs` (writes `../index.min.html` + `../kh-app.js`; FAILS on banned old-WebKit syntax). `--inline` emits one self-contained file instead.
- Client headless: `NODE_PATH=/opt/node22/lib/node_modules node <test>.cjs` (chromium at `/opt/pw-browsers/chromium`; load `index.min.html`; seed `S.onboardingDone=true` + remove `#kh-welcome-ov`).
- Games: `NODE_PATH=/opt/node22/lib/node_modules node tools/games_test.cjs` (expect **39, 0 flagged**). Boot: `/tmp/boot_smoke.cjs` (16/16).
- Worker: `node --check api-worker.js`; unit tests `node --experimental-sqlite <t>.mjs` (D1 shim pattern in `/tmp/modgrant_test.mjs`, `/tmp/modworker_test.mjs`, `/tmp/adminsecret_test.mjs`).
- **Silk ban-list** (breaks the app on old Kindle): optional chaining, nullish coalescing, logical-assignment, numeric separators, parameterless `catch`, modern regex flags (s/y/d/named-groups/lookbehind), BigInt. async/await + object spread are OK. Name these in words in comments, never spell the literal sequence (the gate scans raw text).
- Git after a squash merge diverges: `git fetch origin main && git -c user.email=noreply@anthropic.com -c user.name="Claude" merge -X ours --no-edit origin/main` → push. GitHub MCP: `owner:arancool3000, repo:kindlehub-pro`. Force-push is blocked.

## ✅ DONE + merged this session (all live-deployable)
Stars brightness/trajectory/IP-location; stocks fetch; friends dedupe; **KindleOS dock/grid cutoff** (visualViewport + `grid-auto-rows:min-content`); full **News Article View** + a **reliable fetch** (own worker `vpn.arancool3000.workers.dev` → Jina Reader `r.jina.ai` → proxies, all under a 12s fail-open cap); App-Store new-app OS-grid entries; **"67"** meme filter; **moderator grant system** (one-time codes → request → approve/decline → revoke, mod can't ban admin; `kh_mod_grants` + RPCs); report cascade; AI severity triage; sports pens; perf (3× boot JSON.parse → 1×, Slides debounce); Stash + Verse Library apps; **notifications fire on boot** (`_notifyTick` immediate sweep, start 800ms); **security**: AUTO_MOD no longer trusts client `AI:` verdicts, shared-API per-IP cap, maint stage-only default, D1 per-field length caps, country-level location, **ADMIN_SECRET admin-token rotation**.

## 🔧 Config the user must do (dashboard-side, NOT code)
1. Set a random `ADMIN_SECRET` on the api-worker (env) + redeploy, then paste it in Settings → Account → Moderators. Then the public username stops granting admin.
2. Delete the **legacy backend** project (its dashboard) if it still exists. Code uses D1 already.
3. AUTO_MOD / MAINT need nothing — safe in code now.

## ⏳ TODO — feature backlog (not started; start here)
Do quick ones first, then the big ones. Anchors are text to grep (line #s drift).

### App Store (grep `appstore:()=>` ~L53326, helpers ~L9401-9670)
- **Install-state bug** (`_khStoreInstalled(view)` = `S.navHidden[view]!==true`): OS grid shows every `BUILTIN_APPS` entry regardless of `navHidden`, so default-hidden apps read "not installed" though they're on the home grid. FIX: add `S.storeRemoved={}` as the single install flag → `_khStoreInstalled = !S.storeRemoved[view]`; `_khStoreRemove` sets storeRemoved+navHidden(false→hide nav)+rebuild; `_khStoreInstall` clears it; make KindleOS `allApps()` (~L4868 `function allApps(){return [...BUILTIN_APPS,...]}`) filter out `storeRemoved`. So Remove hides from BOTH nav and OS grid; every BUILTIN app reads installed by default. Ensure Verse Library (`verses`) + Fretboard (`chords`) are removable.
- **Home vs Apps split**: page is too crowded (Featured `STORE_FEATURED` L9401, "Editors' Choice" ~L53579). Add a Home tab (editorial/hero/featured) + an Apps tab (search + categories + Get/Open/Remove + `_khOtherStorePages` "More Pages"). Keep Publish + My Apps tabs.
- **Unique community names**: in `_khPublishApp` (~L9560) reject a name that case-insensitively equals an existing `S.publishedApps[].name` (and ideally a first-party STORE_APPS name).

### KindleOS iOS-style folders (grep `launchKindleDesktop`, `buildPages` ~L5688, `makeIcon` ~L5655, `osState`/`persistOS`, `allApps` ~L4868, `startKindleOSTour`, page-swipe touch handlers)
Model `osState.folders=[{id,name,auto:true,apps:[appId,...]}]`. Long-press (~450ms) an icon to enter drag; drop onto another app → createFolder(a,b); drop onto a folder → addToFolder. Render a folder tile (≤4 mini icons + name) that opens an overlay of its apps (tap → `openApp`) with a rename input (sets `auto=false`). autoName = majority STORE_APPS `cat` of members (else "Folder"). Dissolve a 1-app folder back to a loose icon. Apps in a folder are removed from the top-level grid. Persist via `persistOS`; rebuild `buildPages`. Add one tour line. ⚠ don't fight the horizontal page-swipe gesture (long-press gate).

### Other
- **Flipbook** (new app, optional in App Store): frame-by-frame 1-bit animation editor; post to chat as a sequence via the existing media path (grep `KHIMG1:`/`_khImgCode`/`_khDownscaleImage`, `_sendPayload`) — send frames + a play control, or a tiny sprite-sheet. e-ink-safe, keyless.
- **base44-style app builder**: improve the KindleOS AI app builder (grep `_khCallActiveAI`, `_khSilkScan`, the builder system prompt / "CRITICAL KINDLE WEBKIT COMPATIBILITY RULES") to generate **JS too** (not html-only), return an explanation/change summary, and NOT demand an image-generation API (use inline SVG / picsum / the existing image search). Keep the CSP-sandboxed iframe + risk-flag scan.
- **KHI toggle trim**: the KindleHub Intelligence settings card has a long explanation — cut it to just the toggle (grep `khiEnabled`, the Intelligence settings card in `settings`/`_defer`).
- **Keyboard polish** (grep `_khKeyboard`, `applyInputmodeAll`, `_kbCaret`): usability improvements.

## 🔐 Deep security migrations (staged, break-the-world — plan a compat window)
1. Salted PBKDF2/Argon2 auth + separate encryption key (today: unsalted `SHA-256(username+password)` = id + key + credential; public search returns the 16-hex prefix). 2. Random per-conversation keys + server membership checks (today room-code = address+password). 3. Server-derived identity for messages/comments/scores/presence (client sends `display_name`/`user_id` unauthenticated → impersonation). 4. R2 state-worker: require an account credential + smaller cap (`state-worker.js`, currently accepts any 64-hex hash, 16MB). 5. Per-account AI limits + remove/replace the public `kh_increment_shared_api` RPC (proxy publicly callable; daily cap < per-IP cap). 6. Inbound mail SPF/DKIM/DMARC labelling (`email-worker.js`). 7. Tighter CSP (drop `unsafe-eval`; SRI on jsDelivr).

Each is real; none should be a hot merge that logs users out. Build behind a version flag, migrate on next login, keep the old path readable during the window.
