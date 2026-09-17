# Where boot time goes

Measured, not guessed, so nobody has to derive it again. All numbers are the
median of six loads at a **6× CPU throttle** (a stand-in for Kindle Silk — this
box is far faster than the target, so raw numbers here are optimistic; the
*shape* is what transfers).

```
first paint            141 ms
first contentful paint 484 ms      the shell, nav and header are on screen
domInteractive        2315 ms      the app can respond
load                  2394 ms
```

## The finding

A CPU profile of the boot window attributes **85–89% of it to `(program)`** —
the browser's own work, which here is almost entirely **compiling the 3.2 MB of
JavaScript**. Actual JS execution is about 250 ms of the total.

```
2106ms   89%  (program)          <- parsing/compiling the bundle
  63ms    3%  _bytesOf
  39ms    2%  addEventListener
  20ms    1%  el
   ...
```

Two consequences worth internalising:

1. **Micro-optimising app code cannot move this number.** The whole of the JS
   that runs at boot is ~10% of boot. Halving it would save ~120 ms of 2315.
2. **The main thread is blocked for the entire 484 ms → 2315 ms window.** No
   spinner can animate, no "loading" message can appear, no tap can be handled.
   Taps are queued, not lost, but the app is frozen. Nothing written in
   JavaScript can improve that window, because JavaScript is what is blocking.

The bundle is already minified with terser `compress` + `mangle`
(`toplevel:false` on both, so cross-script globals and inline `onclick` are
safe) — that win is taken. The remaining 3.2 MB is real code.

## What was changed

`_bytesOf` built `new Blob([str])` over the entire stored state — a full copy of
a several-hundred-KB string purely to read its length back — and was the single
most expensive JS call at boot. A packed state blob is `KHZ1:`/`KHZ2:` plus
base64, ASCII by construction, so its byte count *is* its length. Fast path
added; it no longer appears in the profile.

That is ~63 ms of a 2315 ms boot. Real, and invisible: run-to-run noise on the
same build is 2100–2533 ms. It is recorded here so the size of the win is not
overstated later.

## The one lever that would actually move it

Ship fewer bytes to the parser at boot. The only large, cleanly separable chunk
is the **game modules** (~1.2–1.5 MB of the 3.2 MB, 55 modules). Most sessions
never open a game.

This was **measured, not assumed** — an experiment that moved the big script
into a string compiled after load:

```
                       domInteractive   load    compile of the deferred part
inline (today)              2255 ms    2330 ms   —
deferred as a JS string     1695 ms    2989 ms   1218 ms
```

So deferring buys **~25% off time-to-interactive** and costs a 1218 ms freeze
whenever the deferred part is finally compiled. It is a win only if that compile
is *skipped* for most sessions — i.e. the games are compiled on first launch of
a game, not on load.

Note the deferred figure still pays to *scan* a 3.2 MB string literal. Parking
the payload in a `<script type="text/plain">` element instead would skip even
that (the HTML tokeniser just seeks the closing tag), and should do better than
1695 ms — but it requires `new Function`/`eval` on the payload, which cuts
against the no-eval posture from KH-03/KH-14. That trade needs a decision, not
a quiet refactor.

### What it would involve

- `tools/minify.mjs` learns to split a marked region into a separate payload.
- The `exitImmersive` stop-sweep is the **only** module-scope reference to the
  game modules, and it builds an array literal of bare identifiers — one missing
  binding throws before `forEach` runs and skips *every* stop, which is exactly
  the trap already documented for `window.CandyCrush`. It would have to resolve
  names tolerantly instead.
- `_doLaunch`'s switch is evaluated at call time and needs no change.

### Why it was not done in this pass

It changes how the app boots, for 429 live users, on a codebase where a boot
regression has already happened once (the `BUILDERS[e] is not a function`
brick). The trade — everyone's boot gets faster, anyone who opens a game pays a
one-off freeze — is a product decision, and the eval question is a security
decision. Both belong to the owner, with the numbers above in hand.
