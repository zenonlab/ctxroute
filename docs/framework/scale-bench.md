---
rules: [{"pattern":"scale-bench.test.js","scope":["ctxroute"]}]
mode: dumb
---
# scale-bench.test.js: the SLOPE at the real sizing, never a millisecond
🛑 **ASSERT ON RATIOS ONLY.** A duration belongs to this machine; how the cost GROWS when the load quadruples belongs to the algorithm. Never add a threshold in ms, in bytes or in requests per second.
📐 **WHAT IT PROVES:** on ONE machine, ONE OS, a synthetic load, per-request cost and retained memory grow no faster than linearly from 128 to 1024 agent scopes. **NOT a certificate:** no real agents, no OS matrix, and it stops UNDER the 4096 durable ceiling, so it says NOTHING about eviction.
🔴 **MARGIN 1.67, DERIVED FROM THE MEASURED PAIR (2026-08-21) — printed by both cells on EVERY run so it can be re-derived, never inherited.** HEALTHY 0.89 · SABOTAGED 3.13 ⇒ √(0.89×3.13) = 1.67, the only sense in which a MULTIPLICATIVE threshold sits equally far from both (1.88x of headroom each way). 🛑 It was 3.0, where the sabotaged store cleared the bar by 4 % and, at the previous range, scored 2.85 — the gate CERTIFIED a defect. Sensitivity was bought by shrinking the constant (range doubled) and the noise (median of five sub-batches), NEVER by moving this number to fit a cell. ⚠️ ONE machine: CI is the confrontation, and a healthy ratio near the bar means RE-DERIVE, never widen.
🛑 **ONE READING = MEDIAN OF FIVE SUB-BATCHES, then head vs tail AVERAGES.** One collector pause inside one timed batch is what pulled a genuine 4x down to 2.85x; a mean carries that pause, a median discards it.
🛑 **THE COST IS TIMED ON `handle()`, not on a round trip.** The socket is a CONSTANT (0.17 ms, measured) and would bury the quantity being measured. `/turn` is the SENSITIVE track (tiny constant); `/pretool` is the realistic one and far blunter.
🛑 **EVERY CELL PRINTS ITS READINGS AND ITS RATIO BEFORE ASSERTING**, on success as well as failure. A gate that only speaks when it fails turns its own threshold into folklore.
🛑 **ANTI-VACUITY IS LOAD-BEARING:** levels reached, durable scopes held, requests served, one real delivery over the real socket. Flat is exactly what measuring NOTHING looks like.
⚠️ **NO TIMER, EVER** (readiness is the socket's `listening` event, completion is the child's EXIT; kill the driver in a `finally` on every path) and **HEAVY LANE by content**: no per-test timeout, the global 30 s applies, and it runs on every push.
