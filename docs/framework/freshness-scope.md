---
match: [freshness-scope-pure.js, freshness-scope.test.js]
mode: dumb
---
# freshness-scope-pure.js — the code is verified ONCE PER ACTION, never per frame

🔴 **PROFILED 2026-08-31, AND IT WAS 30 % OF THE DAEMON'S WORKING TIME.** The point-of-use freshness
check (`stale-code.observe()`, the guarantee that a daemon never serves code it did not compile) ran
on EVERY frame. One action is 32 frames and each verification reads 36 modules ⇒ **1,152 file reads
to answer a question whose answer cannot change between them**. `node --cpu-prof` on the live daemon
under a REAL Claude Code burst: 2,232 ms of `readFileSync` out of 7.5 s of work, **95 % of it from
this one check**. The daemon is SINGLE-THREADED: every millisecond there is a millisecond it accepts
nobody, and the kernel then refuses connections on a server that is perfectly alive.
✅ **MEASURED AFTER**: disk reads **2,342 → 215 ms** (÷11) · daemon work 7,440 → 4,919 ms · lost
connections **30 → 2 out of 384**, then **ZERO on production**. The chain profile → callers → fix →
error rate is COMPLETE, not correlational.
🛑 **THE GUARANTEE IS NOT WEAKENED WHERE IT COUNTS.** Code changes BETWEEN actions — a delivery is a
human gesture, never something landing halfway through one tool call — and every such change is still
caught on the FIRST frame of the next action. ⚠️ The residual window (a change between frame 1 and
frame N of the SAME action) is DECLARED here rather than hidden: it is bounded by one tool call.
🛑 **THIS IS NOT THE CACHE `stale-code.md` FORBIDS BY NAME.** That ban is on caching the DISK side,
which rebuilds the baseline-by-re-read defect and hands back a green that lies. Nothing here
remembers anything ABOUT A FILE — only that a given ACTION was verified, and the record dies with the
entry. The comparison itself is untouched.
⚠️ **FAILS TOWARDS MORE WORK, NEVER TOWARDS STALE CODE**: no table, no `tool_use_id`, or an eviction
⇒ VERIFY. That is the historical behaviour byte for byte, so any caller that cannot name its action
keeps the full guarantee. 🛑 An inverted condition here silently restores the per-frame waste — which
is exactly why the decision lives in a PURE module (mutated) and not in the I/O shell where it first
shipped and where Stryker never looks.
