---
rules: [{"pattern":"corpus-cache.js","scope":["ctxroute"]},{"pattern":"corpus-cache.test.js","scope":["ctxroute"]}]
mode: dumb
---
# corpus-cache.js — the daemon stops re-reading what nothing changed
📐 **MEASURED 2026-08-20: a round trip is 41.49 ms of which the TRANSPORT is 0.17 ms.** The other 41 ms were the corpus re-read — the same cost the spawn lane paid, hidden inside node's startup. **The win was never in the pipe**, and anyone optimising the transport again is optimising 0.4 % of the problem.
🛑 **OFF BY DEFAULT, AND THAT IS WHAT KEEPS THE DIFFERENTIALS HONEST.** Only the daemon's `require.main` block calls `enableCache`; every spawned hook, the lint, `explain.js` and every test walk the disk exactly as before, so `pretool-differential` and `mcp-differential` run on the UNCHANGED path. A cache switched on globally would compare a cached engine against a frozen oracle and prove nothing.
🛑 **INVALIDATION IS A KERNEL EVENT, NEVER A TTL, A POLL, AN mtime OR A HASH.** The watch DROPS the entry; it never exits the process — that job belongs to `watchOwnCode`, and the two answer OPPOSITELY on purpose: a doc changing is normal, code changing is not.
🛑 **WATCH DIRECTORIES, NOT FILES.** Git renames over its target, so a file watch follows the dead inode and goes SILENTLY deaf — worse than no watch. The watched set is DERIVED from the walk itself (`dirsOut`), so a directory created tomorrow is covered: creating it is an event in its parent.
⚠️ **FAIL-OPEN, ALL-OR-NOTHING PER ROOT**: if any `watch()` throws, the watchers already armed are closed and that root is NOT cached — we hand back the freshly read corpus. **We never serve what we cannot be told about**, and we never crash the daemon for housekeeping.
⚠️ **CEILING 8 ROOTS, and it cannot grow with uptime, traffic or sessions** — the keys are `(directory, prefix)` pairs, never sessions. One entry is one snapshot of one root: ~4 MB for the biggest, a few MB in total. Past the ceiling we READ THROUGH rather than evict a neighbour: an LRU would let a fourth root thrash the three that matter on every request, which reads as "the cache does nothing" with nothing to see.
🛑 **EVERY HAND-OUT IS A FRESH ARRAY OF FRESH OBJECTS.** Without that, one consumer mutating an entry poisons every later request — a corruption visible only on the SECOND call, i.e. never in a test that makes one.
⚠️ **STILL RE-READ, DECLARED: the SKILL BODIES.** `skillAdapter` reads them directly, not through `readCorpus`, so a 90–120 KB skill is not covered. Closing it needs a second seam — one gesture, one seam.
