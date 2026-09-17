# CLAUDE_RULEBOOK.md — check every change against this BEFORE merging

Every rule here exists because it was **broken once and hurt real users**. The
"why" is the incident, not a theory. If you are about to merge, walk the
relevant sections and confirm each line.

**Meta-rule, and the one the history most supports:** almost every worst
incident — the boot-brick, the sync thrash, the site-wide save slowdown, the
resurrection bugs, the tofu purge, the login crash — was **invisible in headless
Chromium** and only visible on a real Kindle or a heavy real account. Where a
rule has a test, run it. Where it doesn't, the rule *is* the test.

CI already runs on every PR: worker `node --check`, the minifier old-WebKit gate,
`audit_test` / `stripe_test` / `tier_test` / `bypass_test`, and a secret scan.
**Everything else below is manual — you must run it.**

---

## A. Kindle Silk / old-WebKit

- [ ] **A1. No ES2020+ syntax.** Banned: optional chaining, nullish coalescing, logical-assignment, numeric separators, parameterless `catch{}`, regex lookbehind/named-groups/`\p{}`/`s`,`y`,`d` flags. (async/await + object spread are fine.)
  *Silk throws a SyntaxError that kills the WHOLE script, and headless Chromium never sees it.* → minifier gate (CI).
- [ ] **A2. The ban covers strings too** — template literals, code snippets, prompt text, AI/user-generated app HTML. *The one that shipped was string data.* When you *write about* these operators, name them in words — spelling the sequence trips the gate.
- [ ] **A3. No Silk-hostile CSS**: `aspect-ratio`, flex `gap`, `position:sticky`, custom properties inside `calc()`, `inset` shorthand, subgrid, `clamp()`/`vw`. *Silk ignores them silently → squished layouts.*
- [ ] **A4. `navigator.onLine === false`, never `!navigator.onLine`.** *Undefined on Silk → truthy → scores never submitted.*
- [ ] **A5. Route around known Silk quirks** — clipboard shim, no `destination-out`, track your own caret on readOnly fields, no `confirm()`, avoid `Array.find` in hot Kindle paths.
- [ ] **A6. Rendered text = ASCII + the `EINK_SYMBOLS` safe list.** *Astral-plane emoji are tofu boxes.* (Chess/card glyphs are audited exceptions.)

## B. e-ink repaint

- [ ] **B1.** Guard text writes: `if(el.textContent!==v)el.textContent=v`.
- [ ] **B2.** A repeating tick never rebuilds a list — build once, update changed text only.
- [ ] **B3.** While a view is detached, write to the in-scope ref, not `getElementById` (*silently no-ops → 1s empty flash*).
- [ ] **B4.** Debounce per-keystroke re-renders (~200ms); leave single-cell edits instant.
- [ ] **B5.** Only ONE full-screen surface live — hide the one underneath. *"Layered pages are what glitch on Kindle" — the user's own diagnosis.*
- [ ] **B6.** No animations/transitions/smooth scroll; never clear+re-append an already-mounted cached view.
- [ ] **B7.** Overlays mount into `_overlayHost()` and pick their layer at SHOW time (`_khZ`/`_khOsHome`). *Landscape rotates `#rotateRoot`; a surface under `#kd-root` (z 500000) is invisible in OS mode.* → `osmode_test`, `notiflayer_test`.

## C. Hot paths

- [ ] **C1. A new `kh_*` key written on a hot path MUST go in the `_maybeSync` skip list.** *The wrapper schedules a pull+push for any `kh_*` write; `kh_pending_fields` on every save killed the skip-sync short-circuit and thrashed heavy accounts.* → `sync_test`.
- [ ] **C2. No O(size) transform on the `save()` path.** Compaction lives in the throttled `_upgradeStoredCompression` (<80KB skipped, ≤1/15s). *`_compStr` on every save = 69ms median on 400KB → 0.5–1.5s per keystroke-ish action on a Kindle; the site crawled for everyone.* → `freecompress_test` **has a perf guard**.
- [ ] **C3.** Every loop module has a no-op-safe `stop()` **and** is in the `exitImmersive` stop-list (lazy ones as `window.X`). *Otherwise every launch stacks another live loop until Silk crashes.* → `games_test` (0 of 70), `memleak_test`.
- [ ] **C4.** Anything created per view build (observers, listeners, intervals) is torn down. *One MutationObserver per `<select>` = the "freezes until I restart the Kindle" report.* → `memleak_test`.
- [ ] **C5.** Deferred timers stored in a handle + cancelled; async callbacks guarded by an `_active` check before repainting.
- [ ] **C6.** New pollers check `_khCfBlocked()` / `_khLoadSkip()` and pause on `document.hidden`. (User actions never back off.)
- [ ] **C7. Do not add work to boot and do not micro-optimise it.** *85–89% of boot is PARSING the bundle; all boot JS is ~10%.* New top-level code makes boot strictly worse.

## D. State, sync & data safety

- [ ] **D1.** Nothing non-serializable in `S` (functions/DOM) — `JSON.stringify` throws.
- [ ] **D2.** No bulk/regenerable data in `S` (book text, screenshots, chat bodies are all kept elsewhere).
- [ ] **D3.** Never push to cloud when `window.__khStateLoadFailed` — *that overwrote good cloud data with an empty default: "logged out → everything gone".*
- [ ] **D4.** A new synced id-list goes in `_KH_TRACKED_LISTS` or its deletions get no tombstones and the merge resurrects them.
- [ ] **D5. Never trust the shape of a field an older build may have written — coerce (`_khAsItemList`).** *A legacy `{todo,doing,done}` board threw inside `mergeCloudState`, which runs at LOGIN — the account could not be opened at all.* Salvage, never discard. → `loginshape_test`.
- [ ] **D6. Presence is not evidence — gate merges on a timestamp**, stored as `NOW().getTime()` **numbers**, normalised via `_khTsMs`. *A Date serialises to an ISO string and silently breaks numeric `>` after a reload.* → `groupleave_test`, `friendreq_test`.
- [ ] **D7.** An un-uploaded local edit beats the cloud (`_khFieldPending`); clear the ledger only after a genuinely successful sync. → `sync_test`, `profilesync_test`.
- [ ] **D8.** Device-local prefs never sync; secrets never enter the backup. (`kh_custom_apps` stays synced on purpose — it's content.)
- [ ] **D9.** Never truncate an encrypted column server-side — reject with 413. *Slicing ciphertext is silent permanent data loss.*
- [ ] **D10.** `NOW()` for display, `_localDayKey()` for streaks. UTC only where it matches a **server** bucket.
- [ ] **D11.** Don't re-break the storage-full heuristics (only a real QuotaExceededError means full; banner suppressed for synced+online users).
- [ ] **D12.** Never invent a cumulative counter for something the system doesn't store.

## E. Security

- [ ] **E1.** Regenerate, never `innerHTML`, an imported fragment (icons in `KHAPP1:` codes).
- [ ] **E2.** Published/AI apps keep BOTH the `_khAppCsp` meta and the no-`allow-same-origin`/no-`allow-popups` sandbox. *Sandbox alone doesn't stop exfiltration.*
- [ ] **E3.** External URLs only via `_khOpenExt` (http/https, `noopener,noreferrer`).
- [ ] **E4. Never add a short/guessable token to `_ADMIN_HASHES`** — `_checkAdmin` also tokenises the user-settable display name.
- [ ] **E5.** Auth/crypto internals stay blocked from AI + admin site edits (`_khSiteBlockRE`).
- [ ] **E6.** Server-side authz fails CLOSED; a mod can never act on an admin.
- [ ] **E7. Never trust a client-supplied verdict, score or location** — re-derive server-side.
- [ ] **E8.** A non-admin PATCH is column-filtered, not just rate-limited.
- [ ] **E9.** Never store the plaintext password — the auth hash IS the AES key.
- [ ] **E10.** No credentials in tracked files.
- [ ] **E11. A gate that only the SERVER enforces must have a client surface that shows what the server decided.** The app unlocks admin on the login name; the Worker accepts only `ADMIN_SECRET` and fails closed. Both are right on their own, and together they meant every admin screen rendered while every admin action was refused — gifts, plan list, bans, warnings, announcements, moderator grants. *Reported as "I granted myself a plan and it didn't work."* → `_khAdminServerOk` / `_khAdminCredWarning`, pinned by `admincred_test` + `adminmismatch_test`.
- [ ] **E12. Never word an authorisation failure as a deployment failure.** A 403 means the credential was refused; only a 404 means the Worker is missing the code. *Two dialogs hardcoded "the Worker has not been redeployed" for every failure, which sent the owner to Cloudflare to redeploy a Worker that was working.* Route admin RPC failures through `_khRpcErrMsg`.
- [ ] **E13. Do not report a credential as saved-and-working without asking the server.** "Save admin secret" said "the app now authenticates with it" having verified nothing.

### E-mod. Moderation (added after two wrongful bans)
- [ ] **E-mod1. Opaque/encoded text is never evidence.** Chat carries apps/images/polls/flipbooks as `KH…` codes and messages are E2E-encrypted. *A user was banned for "severe harassment" over a flipbook payload.* → `modsafety_test`.
- [ ] **E-mod2. A BAN must quote text that really appears in the report** — verify the quote server-side; downgrade to human review otherwise.
- [ ] **E-mod3. An AI must not autonomously ban a person.** BAN verdicts queue for admin approval unless `AUTO_MOD_BAN=1`. *A wrong ban costs far more than a slow one.*
- [ ] **E-mod4.** An unusual/silly/misspelled username is not a violation; unsure means ESCALATE.

## F. Build & deploy

- [ ] **F1.** Edit `index.html`; regenerate the deploy build (`cd tools && node minify.mjs`); commit **all three** — `index.html`, `index.min.html` AND `kh-app.js`. Never hand-edit either generated file.
- [ ] **F1b.** The build is now TWO files: `index.min.html` (~110 KB shell) loads the app from `kh-app.js` named by content hash. Committing the HTML without the bundle, or with a stale hash, ships a **blank site**. `tools/tests/buildshape_test.cjs` and a CI step both check the committed pair agrees. `node minify.mjs --inline` reverts to one self-contained file if it ever misbehaves on a device.
- [ ] **F2.** Terser stays `compress`+`mangle` with `toplevel:false` on both — load-bearing in both directions.
- [ ] **F3.** Before merge: `games_test` (0 of 70) + the relevant `tools/tests/*` + the Silk gate, then load `index.min.html` headless and assert zero pageerrors. *Most tests run against the MIN build — a minifier break only shows there.*
- [ ] **F4. A client change that depends on Worker behaviour is NOT live until the Worker is redeployed — say so explicitly in the PR and the summary.**
- [ ] **F5.** Before `wrangler deploy`, confirm sensitive values are Worker **Secrets**, not Variables (deploy wipes plain Variables). **`KH_PEPPER` must be kept forever.**
- [ ] **F6.** Never tell the user to download/rename/upload. Merge auto-deploys; if it doesn't show: purge the **domain's** cache, then `?v=N`.

## G. Content & naming

- [ ] **G1. Never rewrite a proper noun or a URL in a terminology pass.** *A blanket Ultra→Max rename renamed the creator's own product "Chem Ultra AI" and broke its link.* Scope renames to strings you have individually inspected.
- [ ] **G2.** UI copy quotes the enforced number, and every copy of that number changes together (client cap + worker cap + plan bullets). Never label a metric the data can't support.
- [ ] **G3.** A free account is never shown or treated as paid.
- [ ] **G4.** A new game is wired at all SEVEN points (launch case, stop-list, `GAME_MAP`, `GAME_CATEGORY`, `GAME_HELP`, grid card, `games_test` id).
- [ ] **G8. `games_test` proves a game MOUNTS, not that it can be PLAYED.** Anything with rules gets a test that plays it — moves and the world responds, a fight can be won, progression actually progresses. *Two Wildforms balance bugs (a bad matchup capped at 1 damage a turn; seven wins for the first level) rendered perfectly and passed the mount check.*
- [ ] **G8a. `GAME_CATEGORY` takes the KEY from `GAME_CAT_ORDER`, not the display label.** A label silently drops the game into "More" and nothing errors. *Three games shipped that way.*
- [ ] **G9. A puzzle with more than one valid answer is a broken puzzle.** Judge a win against the RULES, not a stored answer key, and prove uniqueness with a solver before shipping. *Three shipped nonograms had two solutions each, so a legal grid was rejected with no way to know why.*
- [ ] **G5.** A new view needs tab HTML + `NAV_TABS` + `BUILDERS.xxx`. *A view id with no builder used to BRICK the app on every subsequent boot.*
- [ ] **G6.** User text shown to OTHERS goes through `_dispName`/`_censorText`; a user's own private content is never censored.
- [ ] **G7. Never promise a billing behaviour that isn't switched on.** The inactivity auto-cancel notice is gated on the server reporting `autocancel:true` (`STRIPE_AUTOCANCEL`). Never hardcode it.

## G-priv. Anything published outside the encrypted blob

- [ ] **GP1. `S` is end-to-end encrypted — that is the privacy model.** Anything moved OUT of it (e.g. the profile card on `kh_presence`) is world-readable. Publish only what the user typed into that surface, never anything derived from their data, and say so plainly in the UI.
- [ ] **GP2.** Bound it server-side, not just client-side. *Presence is written by every client every ~100s, so anything on that row is multiplied by the whole user base.*
- [ ] **GP3. Allow-list the destination of any money link.** A wrong destination looks exactly like the real thing while sending someone else's money elsewhere. A rejected link is reported to the admin, never silently dropped.
- [ ] **GP4.** A config surface that stores nothing must not report success.

## H. Git workflow

- [ ] **H1.** Dev branch only; never push to `main`; squash PR.
- [ ] **H2.** After a squash merge, do NOT force-push to "restart from main" (and force-push is blocked anyway).
- [ ] **H3.** Recipe: `git fetch origin main` → `git merge origin/main` INTO the branch → resolve generated files with **ours** → rebuild min → commit.
- [ ] **H3a. Do this BETWEEN every squash merge, not just the first.** Skipping it does not fail loudly: GitHub happily reports `merged: true` and creates a squash commit that changes **NOTHING**. *Three consecutive PRs merged as EMPTY commits this way — the API said merged, the commits were on `main`, and none of the code was.*
- [ ] **H3b. After merging, PROVE it landed.** `git show origin/main:<file> | grep <a symbol you added>`, or `git show --stat <squash-sha>` and check the file list is not empty. A green merge response is not evidence.
- [ ] **H3c.** Re-verify against `origin/main` after a `git fetch`, not against a ref you fetched before the merge.
- [ ] **H4. Verify `git diff --stat origin/main HEAD` lists ONLY your intended files** before opening the PR. *Two 5 MB HTML files make an accidental revert easy to miss.*
- [ ] **H5.** Re-`Read` `index.html` before an `Edit` after any external write; grep the anchor instead of trusting remembered line numbers.

---

## I. Performance

- [ ] **I1. Measure before and after, paired and repeated.** Single runs on a throttled browser vary by ±200ms on a ~2000ms boot. *A 5-sample A/B showed a 111ms "win" that vanished (-7ms) at 11 samples.*
- [ ] **I2. Profile before optimising.** Over 70% of building the games page is browser layout and paint, not JavaScript — so DOM containment helped and rewriting the JS would not have.
- [ ] **I3. Never call something that parses `localStorage` from inside a sort comparator or a per-item render.** *`_isFav` did, costing ~800 reads + JSON.parse per repaint.*
- [ ] **I4. `content-visibility` is a no-op on old Silk.** It is still worth having, but never describe it to the user as a Kindle speed-up.

## Deliberate non-fixes — do not re-litigate without new information

- **Boot code-splitting** — too risky on Silk without on-device testing, and now MEASURED as barely worth it: removing 729 KB of source (14% of the bundle) moved boot by only 110ms of ~1900ms (6%). The old "85-89% of boot is parsing" note overstates how much boot time tracks bundle size.
- **Lazy-initialising game modules** — measured at -7ms over 11 paired runs. An engine already pre-parses an IIFE body instead of fully compiling it, so the wrapper buys nothing.
- **Lowering `#kd-root`'s z-index** — would re-order every modal; a prior design did exactly that and broke everything.
- **The account-key architecture** (`ACCOUNT_V2_PLAN.md`) — a migration done wrong locks people out of data only their password can decrypt.
