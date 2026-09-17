# KindleHub

KindleHub is a single-page web app designed for Kindle's built-in browser. It includes notes, books, games, chat, mail, calendar, RSS, weather, and optional AI features.

This repository is intentionally simple to host: the main app is `index.html`, with no application server or build step required.

## Quick start: static hosting

You need:

- A web host that serves static HTML, CSS, JavaScript, and images
- A Supabase project if you want accounts, cloud sync, chat, scores, or community features
- A domain is optional; a host-provided URL works

### 1. Download or clone the repository

```sh
git clone https://github.com/SuprUsr123/KindleHub-Pro-Full-Archive
cd KindleHub-Pro-Full-Archive
```

Do not commit private keys, worker secrets, or service-role credentials.

### 2. Configure Supabase

1. Create a project at [supabase.com](https://supabase.com/).
2. Open the Supabase SQL Editor.
3. Paste the complete contents of [`schema.sql`](schema.sql) and run it.
4. In **Project Settings > API**, copy the project URL and the **anon/public** key.
5. Open [`index.html`](index.html) and replace these two values near the backend configuration:

```js
let SUPABASE_URL='https://your-project.supabase.co';
let SUPABASE_ANON_KEY='your-anon-key';
```

The anon key is intended to be used in browser code. Never put the Supabase `service_role` key in `index.html` or any other public file.

The SQL schema contains the tables, policies, functions, rate limits, and storage guards used by the app. Re-run the full file after pulling a schema update.

### 3. Publish the files

Upload the repository contents to any static host. The important entry points are:

- `index.html` - the app
- `landing.html` - optional landing page
- `404.html` - optional error page
- `icon.svg` and other assets - icons used by the site

Examples of suitable hosts include Cloudflare Pages, GitHub Pages, Netlify, Vercel static hosting, or a normal web server such as Nginx.

For a local smoke test, use a static server instead of opening the file directly:

```sh
python3 -m http.server 8080
```

Then open <http://localhost:8080>.

### 4. Test the deployment

Open the published site, register a test account, and verify:

1. The app loads on desktop and on the Kindle browser.
2. You can log out and back in.
3. A note or book survives a refresh.
4. Chat or another cloud-backed feature can read and write data.
5. Admin diagnostics show the expected backend.

The app stores local data in the browser and synchronizes encrypted account state when cloud sync is enabled. Existing data does not automatically move between unrelated Supabase projects; export or migrate it before changing projects.

## Regenerate the smaller deploy build

`index.html` is the readable source file. `index.min.html` is a generated deployment artifact and should not be edited by hand.

When you change `index.html`:

```sh
cd tools
npm install
node minify.mjs
cd ..
```

Deploy the regenerated `index.min.html` as `index.html` only if your hosting process expects the minified artifact. Keep both files in the repository so the readable source remains available.

## Extending the app with Claude Code or another coding agent

You can use [Claude Code](https://docs.anthropic.com/en/docs/claude-code), GitHub Copilot, or another coding agent from the repository root to add features and fix bugs. Give the agent the repository files and ask it to make the change directly in the working tree.

### Claude helper files

These repository documents are the project's Claude-specific working context. Point Claude Code at the relevant files before starting a task:

| Helper | Use it for |
| --- | --- |
| [`CLAUDE_RULEBOOK.md`](CLAUDE_RULEBOOK.md) | Required pre-merge checklist covering Kindle Silk compatibility, e-ink performance, state and sync safety, security, builds, tests, and Git workflow. Read this before changing code or opening a PR. |
| [`.claude/CLAUDE.md`](.claude/CLAUDE.md) | Architecture memory and grep anchors for the app, views, state, games, reader, backend, workers, sync, and known pitfalls. Read this first when navigating the codebase. |
| [`HANDOFF.md`](HANDOFF.md) | Current session handoff, branch/deployment notes, recent completed work, test commands, and the next feature backlog. Read this when continuing work from another Claude session. |
| [`AGENT_SETUP.md`](AGENT_SETUP.md) | Setup and security model for the optional Kindle-to-agent messaging routine, including `KH_AGENT_ROOM`, polling, progress messages, and request-closing commands. Read this only when working on the remote agent helper. |
| [`BUILTIN_CLAUDE_PLAN.md`](BUILTIN_CLAUDE_PLAN.md) | Product and implementation plan for Claude/OpenAI keys and a possible built-in Claude Haiku feature. Read this before changing AI plans, pricing, metering, or Claude proxy work. |

The helper files are guidance, not a replacement for inspecting the current source. If a helper conflicts with the implementation, verify the behavior in code and update the relevant helper document when the repository's architecture or workflow changes. Never commit values such as `KH_AGENT_ROOM`, API keys, service-role keys, Worker secrets, or webhook credentials.

Before asking an agent to work, tell it:

- The feature or bug, including the user-visible behavior you expect
- Whether the change is for the app, a Cloudflare Worker, the schema, or the build tooling
- Which backend you use: Supabase, Cloudflare D1, or both
- How you want the change verified

The main application is intentionally a large single file. Agents should edit [`index.html`](index.html), not `index.min.html`, and should preserve the existing inline-script structure and browser compatibility. The target includes old Kindle Silk browsers, so new code should avoid assuming modern APIs, avoid unnecessary network requests and DOM rewrites, and keep touch targets usable on an e-ink screen.

### Recommended agent workflow

1. Start from the smallest relevant code path, nearby view builder, game module, worker handler, or test.
2. Ask the agent to inspect the existing implementation and state one hypothesis before changing unrelated code.
3. Make a focused change and preserve existing public names, storage keys, backend contracts, and security checks.
4. Ask the agent to run a narrow validation immediately after editing.
5. For an `index.html` script change, run the inline JavaScript syntax check:

```sh
LAST=$(grep -n "^</script>" index.html | sed -n 2p | cut -d: -f1)
FIRST=$(grep -n "^<script>" index.html | sed -n 2p | cut -d: -f1)
sed -n "$((FIRST+1)),$((LAST-1))p" index.html > /tmp/kindlehub.js
node --check /tmp/kindlehub.js
```

6. Regenerate `index.min.html` with the command above when the source changed.
7. Test the changed feature in a browser, then test the generated deployment artifact as well.

For larger changes, ask the agent to use the existing browser test tooling in [`tools/games_test.cjs`](tools/games_test.cjs) or to add a small focused test. Do not ask an agent to commit secrets, Supabase service-role keys, Gemini keys, Resend keys, or Cloudflare credentials. Keep those in provider secret settings or local environment configuration.

Useful request format:

```text
In this KindleHub repository, add [feature] to [specific view/module].
Inspect the nearby implementation first. Preserve old Kindle Silk compatibility,
existing localStorage/cloud-sync contracts, and the current backend security model.
Edit index.html rather than index.min.html. Run the narrowest relevant validation,
regenerate index.min.html if needed, and report any remaining risks.
```

If an agent creates a new database field, endpoint, Worker environment variable, or persisted local-storage key, have it update this README and the relevant schema or deployment instructions in the same change.

Other planning and operational references may be useful for specific work: [`CLOUDFLARE_SETUP.md`](CLOUDFLARE_SETUP.md) for Worker variables and deployment, [`SECURITY.md`](SECURITY.md) and [`SECURITY_REMAINING.md`](SECURITY_REMAINING.md) for security status, and [`ACCOUNT_V2_PLAN.md`](ACCOUNT_V2_PLAN.md) for the account migration design. These are project references rather than general Claude instructions.

## Cloudflare D1 backend (optional)

The included [`api-worker.js`](api-worker.js) replaces the Supabase REST backend for chat, mail, scores, announcements, presence, feedback, errors, bans, and visits. It is useful when you want the API and database on Cloudflare or want to avoid Supabase egress charges.

### Dashboard setup

1. In Cloudflare, create a D1 database named `kindlehub`.
2. Create a Worker, paste in the complete contents of `api-worker.js`, and deploy it.
3. In the Worker settings, add a D1 binding:
   - Variable name: `DB`
   - Database: `kindlehub`
4. Open the Worker URL once. The Worker creates its tables automatically on the first request.
5. In KindleHub, open **Admin > Local Insights > API gateway (Cloudflare D1)**, enter the Worker URL, save, and reload.

Do not paste `schema-d1.sql` into the Cloudflare dashboard editor. The Worker auto-creates the schema. If you use Wrangler instead, the equivalent setup is:

```sh
npm install --global wrangler
wrangler login
wrangler d1 create kindlehub
```

Create `wrangler.toml` beside `api-worker.js` using the database ID printed by Wrangler:

```toml
name = "kindlehub-api"
main = "api-worker.js"
compatibility_date = "2024-09-23"

[[d1_databases]]
binding = "DB"
database_name = "kindlehub"
database_id = "PASTE_DATABASE_ID_HERE"
```

Then deploy:

```sh
wrangler deploy
```

Optional Worker variables and secrets:

- `GEMINI_KEY` - Google AI Studio key for the shared AI proxy
- `DAILY_CAP` - daily shared AI request cap; defaults to `3580`
- `ALLOW_ORIGIN` - allowed browser origin; use your site URL instead of `*` for a private deployment

Keep `GEMINI_KEY` as a Worker secret. Never place it in client-side JavaScript.

## Cloudflare R2 state storage (optional)

[`state-worker.js`](state-worker.js) stores encrypted per-user state in R2 instead of the Supabase state table.

1. Create an R2 bucket, for example `kindlehub-state`.
2. Create and deploy a Worker containing `state-worker.js`.
3. Add an R2 binding named `STATE_BUCKET` pointing to that bucket.
4. Optionally set `ALLOW_ORIGIN` to your site origin.
5. In **Admin > Local Insights > State gateway (Cloudflare R2)**, paste the Worker URL and save.
6. Run **Sync Now** for an account to move its state to R2.

The state is encrypted in the browser before upload. Leave the setting blank to keep state storage in Supabase.

## Optional email gateway

[`email-worker.js`](email-worker.js) enables real addresses such as `username@kindlehub.pro`. It is optional; internal app mail works without it.

You need:

- A Cloudflare-managed domain with Email Routing enabled
- A Resend account and verified sending domain
- Worker secrets named `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, and `RESEND_API_KEY`

Deploy the worker, configure a catch-all Email Routing rule to send mail to it, then set the deployed URL in **Admin > Local Insights > Mail gateway**. The Supabase service-role key belongs only in the Worker secret settings, never in the repository or browser.

## Optional AI

The app can use a user's own Gemini/OpenRouter key, or a shared proxy. For a shared proxy, deploy `api-worker.js` with `GEMINI_KEY`, or use the Supabase Edge Function instructions embedded in the app's admin diagnostics. A shared key has usage and cost implications, so keep a daily cap and monitor it.

## Custom domains and HTTPS

Use HTTPS in production. Cloudflare Pages, GitHub Pages, Netlify, and Vercel provide HTTPS automatically. For a custom domain:

1. Add the domain in your hosting provider.
2. Add the DNS records it provides.
3. Set the site's canonical URLs in `landing.html`, `sitemap.xml`, and `robots.txt` if you use those files.
4. Update any `ALLOW_ORIGIN` Worker variables to the final origin.

## Updating

1. Pull the latest source.
2. Review changes to `schema.sql` and apply them in Supabase when required.
3. Regenerate `index.min.html` if the source changed.
4. Redeploy the static files.
5. Redeploy `api-worker.js`, `state-worker.js`, or `email-worker.js` separately if those files changed.
6. Purge the host/CDN cache if an old HTML file is still being served.

## Troubleshooting

- **The app loads but cloud features fail:** confirm `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and that the full `schema.sql` ran successfully.
- **A Cloudflare API gateway fails:** confirm the Worker has a D1 binding named exactly `DB`, then open its URL once and reload KindleHub.
- **AI fails:** check that `GEMINI_KEY` is configured in the selected proxy and that its daily cap has not been reached.
- **Old code is still visible:** purge the CDN cache and check that the host is serving the latest `index.html`.
- **Kindle rendering is broken:** serve the site over HTTPS, test the minified build, and avoid adding modern browser APIs without checking old Silk compatibility.

## Project layout

| File | Purpose |
| --- | --- |
| `index.html` | Readable KindleHub application source |
| `index.min.html` | Generated minified deployment artifact |
| `landing.html` | Optional public landing page |
| `schema.sql` | Supabase schema and policies |
| `api-worker.js` | Cloudflare D1 API Worker |
| `state-worker.js` | Cloudflare R2 state Worker |
| `email-worker.js` | Optional inbound/outbound email Worker |
| `schema-d1.sql` | D1 schema reference/manual Wrangler input |
| `tools/minify.mjs` | Minifies the app for deployment |
