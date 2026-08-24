// ═══════════════════════════════════════════════════════════════════════
// deadline.js — EVERY DISPOSABLE PROCESS CARRIES ITS OWN DEADLINE
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ REASON FOR EXISTING — incident MEASURED on 15/07/2026:
//    875 zombie `statusline.js` processes, one of them 20 HOURS old, 0.8 GB of RAM
//    free out of 16. Cause: Claude Code on Windows does not always close the stdin
//    of the hook it spawns (documented Anthropic bug, anthropics/claude-code#68626:
//    "the headless worker blocks waiting for stdin EOF the launcher never sends").
//    The hook waits for an `end` that NEVER comes. It does not crash, it logs nothing:
//    it lives forever. On Windows, no process group reaps it —
//    the parent dies, the child remains (736 orphans measured).
//
// ⚠️ THE CENTRAL POINT — TOTAL INDEPENDENCE FROM THE HARNESS:
//    This timer asks NOBODY for permission. EOF or not, parent dead or alive,
//    pipe held by an inherited handle or not, Claude Code v2 or v9: THE PROCESS DIES.
//    That is what makes the system immune to a third-party bug that can be neither
//    fixed, nor foreseen, nor waited on for a fix. We depend on no
//    Anthropic behavior. That is THE property to preserve — never trade it
//    for "waiting a bit more just in case".
//
// ⚠️ `.unref()` IS MANDATORY, it is NOT an optimization detail:
//    - normal case  : stdin closes → we write → node exits. The unref'd timer does
//                     NOT hold the loop → ZERO added latency. Without unref(),
//                     EVERY tool call would wait for the full delay. Unacceptable.
//    - zombie case  : the EOF never comes, but the stdin handle keeps the loop
//                     ALIVE → the unref'd timer fires anyway → death.
//    That is exactly the asymmetry sought. Removing unref() = breaking everything in one
//    direction; removing the timer = breaking everything in the other. Both, never one alone.
//
// ⚠️ KNOWN, ACCEPTED LIMIT: node is single-threaded — a timer cannot
//    fire during a SYNCHRONOUS operation. A hook blocking in a
//    giant `readFileSync` or an `execSync` escapes the deadline. The hooks read
//    small local files (a few ms) → negligible risk, but REAL.
//    Absolute zero would require a Windows Job Object (the OS kills, not the process) =
//    a native dependency. Rejected: a bazooka for a mosquito. To be reconsidered ONLY
//    if a zombie is one day measured DESPITE this deadline.
//
// ⚠️ NEVER reimplement a deadline setTimeout elsewhere: single source.
//    Sealed by the static gate `deadline-gate.test.js` — every hook that reads stdin
//    MUST go through here. An instruction in prose would be forgotten; the gate, not.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

// 2 s: well above the real work of a hook (measured: 1-36 ms) and well
// below the user's patience. ⚠️ DO NOT increase it "to be safe":
// the delay is NEVER paid in the normal case (unref), it is paid ONLY by a
// process that is already broken. Lengthening it protects nothing, it just delays the death of a dead man.
//
// ⚠️⚠️ THE WHOLE PARAGRAPH ABOVE IS FALSE. KEPT ON PURPOSE AS A WARNING.
//
// It was 2000 ms and had NEVER been measured under load. REAL REGRESSION IN
// PROD on 15/07/2026, caught by the differential (a test written for a COMPLETELY OTHER
// subject): under 24 parallel spawns, 19/24 `protect-files.js` exited BEFORE
// having injected anything at all. Silently uninjected docs = THE CLASS
// OF BUG this framework exists to kill, reintroduced by its own safeguard.
//
// THE REASONING ERROR: `.unref()` prevents the timer from HOLDING the event
// loop — it does NOT prevent it from FIRING during legitimate work in progress.
// Measured node boot: ~1 s at rest (already half of the 2 s budget), far more
// under CPU contention. The delay IS therefore paid by normal work as soon as the
// machine is loaded.
//
// ⚠️ RULE: a deadline BOUNDS THE INFINITE, it optimizes NOTHING. The zombies lived
//    20 HOURS: 30 s is 2400× better AND cannot interfere with any real work
//    (a hook that exceeds 30 s is broken, not slow). Always choose the LARGEST
//    value that still bounds usefully — never the smallest that "seems enough".
// ⚠️ NEVER lower this threshold again without measuring it UNDER LOAD (24 parallel
//    spawns, cf `deadline-load.test.js`). A tight threshold kills legitimate
//    work SILENTLY — that is worse than the zombie it claims to avoid.
const DEFAULT_MS = 30000;

/**
 * Arms the deadline of the current process. To be called AS EARLY AS POSSIBLE, before any I/O.
 *
 * @param {object} [opts]
 * @param {number} [opts.ms]      - delay (default 30000 — cf header, value corrected after a real regression). Env CTXROUTE_DEADLINE_MS for the tests.
 * @param {Function} [opts.onExpire] - best-effort BEFORE exiting (e.g. writing what we have).
 *                                     ⚠️ If it throws, we exit ANYWAY: an emergency
 *                                     output that can fail is not an output.
 * @returns {Function} disarm() — disarms (tests only; never in prod).
 */
function arm(opts) {
  const o = opts || {};
  const envMs = Number(process.env.CTXROUTE_DEADLINE_MS);
  const ms = Number.isFinite(o.ms) ? o.ms : Number.isFinite(envMs) && envMs > 0 ? envMs : DEFAULT_MS;

  const t = setTimeout(() => {
    // ⚠️ try/catch MANDATORY: the sole purpose of this block is to guarantee process.exit().
    //    An exception here would resurrect the zombie we have just condemned.
    try {
      if (typeof o.onExpire === 'function') o.onExpire();
    } catch (e) {
      /* best-effort: the output takes precedence over the rendering */
    }
    // ⚠️ exit(0) and NEVER exit(1): a hook that exits non-zero can be interpreted
    //    as a refusal by the harness (blocking a tool). Fail-open, always:
    //    the deadline protects the MACHINE, it must never hinder the USER.
    process.exit(0);
  }, ms);

  // ⚠️ See the header: without this .unref(), every tool call would pay `ms`.
  if (typeof t.unref === 'function') t.unref();

  return function disarm() {
    clearTimeout(t);
  };
}

module.exports = { arm, DEFAULT_MS };
