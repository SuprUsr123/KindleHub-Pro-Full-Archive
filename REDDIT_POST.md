# r/kindlejailbreak post

Post as **text**, not link. Put the URL in your own first comment, not the body —
see the notes at the bottom for why.

---

## Title

**I've spent months turning the stock Kindle browser into a full OS — 81 games, a launcher, chat, and a Gutenberg reader. No jailbreak needed.**

---

## Body

Everything on my Kindle that isn't reading is a compromise, so about a year ago I started building the thing I actually wanted, inside the one place Amazon can't take away: the browser.

It's one page. You open a URL and you get a home screen with an app grid, folders, a lock screen and a dock — the whole thing runs in Silk. No sideload, no jailbreak, nothing to flash. It also means an OTA update can't break it and a factory reset doesn't cost you anything.

**What's in it right now:**

- **81 games.** All turn-based or tap-driven, because that's the only shape e-ink handles. Sudoku, nonograms with four difficulty tiers, Kakuro, chess, a Mario-ish platformer, a roguelike, a deckbuilder, a monster collector, 8-ball with real physics. Two-player over the network for a few of them.
- **A launcher mode.** Wallpaper, app folders you make by dragging one icon onto another, a lock screen with widgets, a control centre. It looks like a phone and behaves like one.
- **Project Gutenberg, built in.** Search, open, read paginated full text, position saved. 70,000-odd free books without leaving the page.
- **Notes, journal, flashcards** with proper SM-2 spaced repetition, a calendar, habits, a spreadsheet, a drawing app.
- **Chat and DMs**, end-to-end encrypted, plus a small app store where you can publish an HTML app you wrote and other people can install it. Published apps run sandboxed with a CSP that blocks all network access, so nothing you install can phone home.
- **A dashboard/bedside mode**: 14 watch faces, alarm with a light-based wake, timer, weather. It just picked up a remote that controls music and your PC over your own Wi-Fi.

**The e-ink engineering is most of the work.** Every screen builds its DOM once and then only rewrites the characters that changed, because on e-ink a full repaint is a visible flash. The clock updates two digits, not a clock. Games repaint the dozen cells whose glyph changed, not the board.

The other half is that Silk's WebKit is *old*. Optional chaining, nullish coalescing, logical assignment — any of them throws a SyntaxError that kills the entire script, and none of it shows up when you test in Chrome. There's a gate in the build that scans the minified output as raw text and refuses to produce a build if any of it slipped in. I added that gate after shipping a version that worked perfectly everywhere except on an actual Kindle.

**Recent thing I'm pleased with:** boot was slow and I'd assumed it was the megabytes of JavaScript. It wasn't — it was that the script was *inline*. A browser can compile an external script on a background thread while it downloads, and keep the compiled bytecode between visits; it can do neither for an inline one. Splitting the bundle out into its own file took a cold load from 1727ms to 815ms and a warm one from 1021ms to 428ms, without deleting a single feature.

**What it isn't:** it's a web app, so it's bound by what the browser allows. No filesystem, no sideloading, no touching KUAL, no replacing the reader. Video is hopeless on e-ink and I haven't pretended otherwise. And it's slower on a Paperwhite than on your laptop, obviously.

Free, no ads, no account needed to use most of it. I'm one person and I've broken it plenty of times — the changelog is mostly me fixing things real users found. Happy to answer anything about the e-ink or old-WebKit side, that's the genuinely interesting part.

Link in the comments so this doesn't trip the filter.

---

## How to not get removed

The last attempt was eaten by Reddit's spam filter, and there are only a handful
of reasons that happens. Worth doing all of these:

1. **No URL in the post body.** A naked domain from an account without much
   karma in that sub is the single most common automatic removal. Post the text,
   then add the link as your own first comment. This is normal practice and
   nobody minds.
2. **Post it as a text post, not a link post.**
3. **Check the sub's rules page for a required flair** before submitting — a
   missing flair is an automod removal on a lot of subs and it looks like a
   spam filter when it happens.
4. **Don't cross-post the same text.** Identical bodies across subreddits is
   exactly what the site-wide filter looks for. If you want it elsewhere,
   rewrite it for that audience.
5. **Reply to comments for the first hour or two.** A post whose author never
   returns gets reported as an ad; one where the author is answering technical
   questions almost never does.
6. **If it vanishes anyway**, message the moderators politely and ask — it's
   usually the automatic filter rather than a human, and mods approve these
   routinely when you ask.

Note on r/eReader: you've been banned there, so don't post from an alt — ban
evasion is a site-wide offence and would put the main account at risk too.
r/kindle is also strict about anything that looks like promotion. r/kindlejailbreak
is the right home for this; r/eink and r/selfhosted are plausible later, with
text written fresh for each.
