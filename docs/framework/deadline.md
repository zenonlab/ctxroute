---
rules: [{"pattern":"deadline.js","scope":["ctxroute"],"rank":533},{"pattern":"deadline.test.js","scope":["ctxroute"],"rank":534},{"pattern":"deadline-gate.test.js","scope":["ctxroute"],"rank":535},{"pattern":"deadline-load.test.js","scope":["ctxroute"],"rank":545}]
mode: dumb
rank: 533
---
# deadline.js — process deadline (anti-zombie)

⚠️ EVERY hook that reads stdin MUST call `deadline.arm()` BEFORE any I/O. Without it: guaranteed zombie. Measured 2026-07-15 — 875 live `statusline.js` processes, one 20 h old, 0.8 GB of free RAM out of 16.
⚠️ CAUSE = Claude Code Windows bug (anthropics/claude-code#68626): the harness does not always send EOF on stdin → the hook waits for an `end` that NEVER comes. Windows has no process group: parent dead, child alive (736 orphans measured).
⚠️ **THRESHOLD = 30 s. NEVER LOWER IT** without measuring it UNDER LOAD (24 parallel spawns, `deadline-load.test.js`). It was 2 s "since the delay is never paid in normal times" — FALSE, never measured: 19/24 `protect-files.js` exited BEFORE injecting → mute docs, SILENTLY. `.unref()` prevents the timer from HOLDING the loop, NOT from FIRING during legitimate work (node boot ≈ 1 s idle, far more under contention).
⚠️ A deadline BOUNDS THE INFINITE, it optimizes NOTHING: take the LARGEST value that still bounds usefully, never the smallest that "seems enough". A tight threshold kills legitimate work silently = worse than the zombie.
⚠️ NEVER remove `.unref()`: without it, every tool call pays the FULL delay. Both halves (timer + unref), never just one.
⚠️ `exit(0)` ALWAYS: a hook exiting ≠0 may be read as a refusal by the harness. Fail-open — the deadline protects the MACHINE, never against the user.
⚠️ Standalone by contract (`deadline-stays-standalone`): depends on NOTHING → copyable as-is. The copy in `~/.claude/hooks/` is sealed by the drift test `deadline-vendor.test.js`.
Accepted limit: node is single-threaded → a timer does not interrupt a SYNCHRONOUS operation. Absolute zero = Windows Job Object (rejected: native dependency).
Gates = `deadline-gate.test.js` (repo) · `hooks-fleet-gate.test.js` (fleet) · Proofs = `deadline.test.js` (real spawn + negative-check) · `deadline-load.test.js` (under load).
