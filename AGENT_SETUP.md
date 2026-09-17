# Talking to the agent from your Kindle

**Read this first: it does not work in the Default environment, and one setting
will not fix that.**

## The blocker is the network policy, not a variable

This session runs in an Anthropic cloud environment called "Default — trusted
network access". Its egress policy does not include `*.workers.dev`, so the
agent tool gets a 403 the moment it tries to reach the backend:

    This environment blocks kindlehub-api.arancool3000.workers.dev.

That policy is chosen when an environment is CREATED. There is no per-host
allowlist to edit afterwards, which is why hunting through settings finds
nothing — there is nothing there to find. To let the agent through you would
create a new environment with a network policy that permits the Worker host and
run the routine there. The policies are documented at
https://code.claude.com/docs/en/claude-code-on-the-web

Until then the routine fires every two hours, sees the block, and exits
silently. It costs nothing and needs no attention.

## Then, and only then: one variable

    KH_AGENT_ROOM = 983028037620

Everything else defaults. The gateway defaults to the URL the app already ships
publicly in `index.html` (the same free Worker that carries chat, mail and sync
— there is nothing new to pay for), and the owner name defaults to
`arancool3000`. Override with `KH_API_GATEWAY`, `KH_AGENT_OWNER` or
`KH_AGENT_NAME` if you need to.

The room code is the one genuinely secret value here, which is why it is the one
thing not defaulted and not committed.

## Live progress instead of twenty messages

A long job posts ONE message and rewrites it as it goes, so the thread reads as
a single note filling in rather than a stream of updates:

    node tools/agent/kh-agent.mjs --start "Looking at the crash"   # prints a handle
    node tools/agent/kh-agent.mjs --append <handle> "found it"
    node tools/agent/kh-agent.mjs --finish <handle> "fixed, PR #12"

The rewrite is gated server-side on an owner secret and an exact message id, so
it can only ever touch the agent's own message. Past ~3500 characters it starts
a fresh message and prints a new handle, because a message has a size limit and
truncating would drop the newest line — the one being waited for.

## About checking for messages

The routine checks every two hours, and an empty check is close to free: the
first thing it runs is one cheap request, and it ends the turn immediately when
nothing is waiting. There is no push channel into a scheduled session — nothing
can wake one the instant you send a message — so a cheap check on a timer is
the honest version of "notify me". Ask for a shorter interval if two hours feels
slow; the cost scales with how often it looks, not with how much you send.

## Why there is no password anywhere in this

A room's message key is `SHA-256("khmsg::" + room code)`. It is derived from the
room code alone, not from any account, so the tool never sees your password,
never logs in, and can read exactly one room. If the config ever leaked, it
would leak that room and nothing else — not your account, not your data, not
anyone else's conversations.

## The room code is the authorisation, and that is the whole of it

Message identity in this app is caller-asserted: a display name is just a string
the sender chose, so "only obey the owner" cannot be enforced by checking a
name. What actually bounds the agent is that nobody who does not know the twelve
digits can write into the room at all.

Treat the code like a password. If it leaks, make a new room and change the
variable — do not rely on the owner-name filter, which is a convenience for
skipping other people's chatter and is labelled as such in the source.

The routine also refuses a set of things outright, whoever appears to be asking:
printing or exfiltrating a secret, weakening a security control, banning or
moderating anyone, spending money, messaging people outside the room, or pushing
to any branch but the dev branch. Someone who obtained the room code must not
thereby obtain everything else.

## Using it

Message the room from your Kindle. Within two hours the agent reads anything
posted after its own last reply, does the work — reproduce, fix, test, PR,
squash-merge — and replies once saying what it actually did, including when it
failed, refused, or could not reproduce the problem.

It replies exactly once per batch, and that reply is what marks the batch
handled, so nothing is silently dropped and nothing is answered twice.

By hand:

    node tools/agent/kh-agent.mjs --read          # recent messages
    node tools/agent/kh-agent.mjs --pending       # awaiting a reply
    node tools/agent/kh-agent.mjs --say "text"    # post

## Closing community requests

Unrelated to the agent, same idea. Put `Closes KH-<id>` in a commit or PR body —
tap a request's id in the admin panel to copy the line — and after merging:

    node tools/close-requests.mjs --scan

Needs `KH_API_GATEWAY` and `KH_ADMIN_SECRET`. Without them it prints what it
would close rather than failing, which is what you want in CI.
