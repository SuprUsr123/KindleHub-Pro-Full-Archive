# Boot performance — measurement and plan

Measured 26 July 2026 against `index.min.html`, headless Chromium at **6× CPU
throttling** to stand in for a Kindle's processor. Reproduce with the scripts
described at the bottom.

## What the numbers say

| Metric | Value |
|---|---|
| DOM ready | **2568 ms** |
| App state ready (`window._KH.S`) | **2854 ms** |
| DOM nodes at first paint | 417 |
| CSS rules | 400 |
| `<script>` blocks | 7 |

CPU profile of the same boot:

```
total profiled            2960 ms
  (program)               2507 ms   ← V8 parsing/compiling the bundle
  home (render)            102 ms
  (anonymous)               36 ms
  (idle)                    23 ms
  showView                  21 ms
```

**85% of boot is the browser parsing JavaScript.** Everything KindleHub actually
*does* at startup — building the home view, mounting the shell, reading state —
totals about 160 ms. The DOM is small (417 nodes) and the CSS is small (400
rules); neither is the problem.

So: **there is nothing meaningful to win by optimising our own boot code.** A
perfect 100 ms saving in `home` would move a 2.9 s boot to 2.8 s. The cost is
the size of the script the browser must compile before anything can run.

## Where the size is

```
block 1:     1 KB
block 2:     2 KB
block 3:     0 KB
block 4:     1 KB
block 5:  3070 KB   ← the entire application
block 6:    30 KB
```

One 3 MB inline script. The minifier already runs terser with `compress` and
`mangle` (`toplevel:false`, so cross-block globals and inline `onclick`
handlers survive) plus clean-css — 4.63 MB of source becomes 3.11 MB. There is
no further easy win there; the remaining bytes are real code.

### Why the obvious fixes do not apply

- **`defer` / `async`** — ignored by the spec on *inline* scripts. They only
  affect scripts with `src`. Adding the attribute would change nothing.
- **More aggressive minification** — already enabled. Going further means
  `mangle: {toplevel: true}`, which renames globals and would break every
  inline `onclick` in the markup and every cross-`<script>` reference.
- **Compression** — Cloudflare already gzips/brotlis the response. That reduces
  *transfer*, not *parse*, and parse is what the profile shows.

## The actual fix: parse less before first paint

The only lever that moves this number is reducing how much JavaScript must be
compiled before the app can show something. Roughly half the bundle is content
that is never needed at startup — 55 game modules, plus the larger reference
apps (Stars' catalogues, Animals' database, Elements, Formulas).

**Proposal — split the bundle, keep the single-file option.**

1. Teach `tools/minify.mjs` to emit two artifacts instead of one:
   `index.min.html` (shell, boot, views, ~1.2 MB inline) and `kh-extras.js`
   (game modules + big reference data, external, `defer`).
2. Game launch already funnels through one place (`launchGame` → `_doLaunch`),
   and `exitImmersive`'s stop-sweep is the only other direct reference. Both run
   on user action, well after a deferred script has executed, so `const Snake`
   and friends resolve normally through the shared global lexical scope.
3. Keep a `--single` build flag producing today's one-file output, so
   sideloading a Kindle with a lone HTML file still works.

Expected: first paint at roughly 1.2 MB of parse instead of 3.1 MB — call it
**~1.0–1.2 s instead of ~2.6 s** on the throttled profile. The games then
compile in the background while the user is looking at the home screen.

**Why this was not done in this session:** it changes what gets deployed (two
files instead of one, so `_redirects` and the Cloudflare Pages setup change
too), and a mistake in the split boundary is a white screen for all 350 users
rather than a degraded experience. It wants its own session with its own
verification pass — not a tail-end change alongside a security batch.

### Smaller, independent wins worth doing at the same time

- `home` is 102 ms and is the first thing rendered. Some widgets (weather,
  countdown, daily goal) could mount empty and fill in on the next tick, so the
  shell paints sooner.
- The 400 CSS rules are cheap, but `content-visibility` is already applied to
  the two biggest grids; the same hint could cover the games grid.
- Nothing else in the profile clears 40 ms.

## Reproducing

Both scripts drive headless Chromium at `Emulation.setCPUThrottlingRate: 6`:

- **Timings** — navigate to `index.min.html`, record `domcontentloaded`, then
  wait for `window._KH && window._KH.S`, then read DOM/CSS counts.
- **Profile** — same navigation wrapped in `Profiler.start()` /
  `Profiler.stop()`, aggregating self-time per call frame.

Run them before and after any change here; a speed claim without both numbers
is a guess.
