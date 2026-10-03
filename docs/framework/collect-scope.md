---
match: [collect-scope-pure.js, collect-scope.test.js]
mode: smart
threshold: 30
---
# collect-scope-pure.js — the corpus is COLLECTED once per ACTION, never per frame

🔴 **MEASURED 2026-09-18, AND IT IS `freshness-scope-pure.js`'s DEFECT ONE LAYER UP.** The harness
opens ONE connection PER FRAME and an action is 32 frames, so `collect-core.collectAll` — **6.36 ms
on the real corpus with the resident cache armed** — ran 32 times to answer a question whose answer
cannot change between them. One real 32-frame action: **282.92 ms of single-threaded CPU, of which
~198 ms was that recomputation.**
✅ **MEASURED AFTER, byte-for-byte differential on that same action**: **510.7 → 143 ms**, 25
emissions and 190,276 characters IDENTICAL, **ONE** real collection instead of 32.
🔑 **WHY IT IS NOT A LATENCY QUESTION**: the daemon is SINGLE-THREADED, so every millisecond here is
a millisecond it accepts nobody and does not drain its sockets — and Windows then answers
`WSAECONNREFUSED` on a listening socket that is perfectly alive (`http-lane.md`). The same fix one
layer down took lost connections from 30 of 384 to 2, then to zero in production.

🛑 **THE MEMOISATION IS THE SHELL'S, NEVER THE CORE'S.** `pretool-core.run` takes a `collect`
argument exactly as it takes `store` and `withLock` — only a LONG-LIVED process can know that two
requests belong to ONE action. Absent it falls back to `collectAll`, i.e. the spawn lane and every
differential BYTE FOR BYTE (extension contract §6). **Never an environment variable**: inherited by
children, so one leak hands a spawned hook another process's collector.

🛑 **THIS IS NOT A CORPUS CACHE, and the distinction is load-bearing.** `corpus.js` owns residency
and its KERNEL invalidation; nothing here second-guesses that layer. This table remembers only that
ONE ACTION already built its accumulator, and the record dies with the entry. A doc edited between
two actions is picked up by the next action's first frame, exactly as before.
⚠️ **THE WINDOW IS DECLARED, NEVER HIDDEN**: a doc edited between frame 1 and frame N of the SAME
action is served as it was at frame 1. Bounded by one tool call — the SAME residual its twin
declares for the code, and the price of delivering ONE coherent action instead of 32 differently
dated halves.

🛑 **FAILS TOWARDS MORE WORK, NEVER TOWARDS STALE KNOWLEDGE**: no table, no `tool_use_id`, an
eviction, or a non-object accumulator ⇒ COLLECT. A `null` from `lookup` can never mean "there is
nothing to serve".
⚠️ **CEILING 64, LOWER THAN ITS TWIN'S 4096 ON PURPOSE**: an entry holds a whole accumulator (bodies
included, tens of KB) where its twin holds the integer 1, so the ceiling answers a MEMORY question.
The client opens at most one connection at a time, so the live set is a handful.
🛑 **AN INVERTED CONDITION HERE WOULD SERVE ONE ACTION'S DOCUMENTS TO ANOTHER, silently** — which is
why the decision is PURE and mutated, and not in the I/O shell where Stryker never looks.
