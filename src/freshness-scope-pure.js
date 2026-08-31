// ═══════════════════════════════════════════════════════════════════════
// freshness-scope-pure.js — ONE CODE VERIFICATION PER ACTION, NOT PER FRAME
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 THE DEFECT THIS CLOSES, PROFILED 2026-08-31 AND OPEN SINCE 2026-08-24.
//    The daemon compares the bytes it COMPILED with the bytes on disk before
//    answering — a real guarantee (`stale-code.md`), and it ran on EVERY frame.
//    An action is 32 frames, each verification reads 36 modules, so ONE tool
//    call cost **1,152 file reads to answer a question whose answer cannot
//    change between them**. `node --cpu-prof` on the live daemon, driven by a
//    REAL Claude Code burst: of 7.5 s of actual work, **2,232 ms (30 %) was
//    `readFileSync`**, and 95 % of that traced back to this one check.
// ✅ MEASURED AFTER: disk reads **2,342 ms → 215 ms** (÷11), the daemon's total
//    work 7,440 → 4,919 ms, and the connection failures a real burst produces
//    **30 → 2 out of 384** (÷15). The chain is complete, not correlational.
//
// 🛑 WHY THIS IS NOT THE CACHE `stale-code.md` FORBIDS BY NAME. That ban is on
//    caching the DISK side — remembering what a file contained, which rebuilds
//    the "baseline by re-read" defect and hands back a green that lies. Nothing
//    here remembers anything ABOUT A FILE: this records only that a given
//    ACTION has already been verified, and the record dies with the entry. The
//    comparison itself is untouched.
// 🛑 THE GUARANTEE IS NOT WEAKENED WHERE IT COUNTS. Code changes BETWEEN
//    actions — a delivery is a human gesture, not something that lands halfway
//    through one tool call — and every such change is still caught, on the
//    first frame of the next action.
// ⚠️ THE RESIDUAL WINDOW, DECLARED RATHER THAN HIDDEN: a change landing between
//    frame 1 and frame N of the SAME action is served by that action's
//    remaining frames. Bounded by one tool call, and the daemon exits on the
//    next one.
//
// 🛑 A MAP, NEVER A PLAIN OBJECT — an invocation id is arbitrary harness text,
//    and `__proto__` on a plain object writes the prototype instead of a key.
//    Same law as `frame-sequencer-pure.js` and `delivery-notice-pure.js`.
// 🛑 BOUNDED FOR LIFE (space doctrine): a daemon runs for weeks, so an
//    invocation whose frames never complete must never sit here for ever.
//    Eviction is LRU by re-insertion, ceiling mirroring the sequencer's.
// ⚠️ AN EVICTION COSTS ONE EXTRA VERIFICATION, NEVER A WRONG ANSWER — the
//    forgotten invocation simply verifies again. The failure mode of this
//    module is doing MORE work, never serving stale code, which is why it
//    needs no alarm and why the ceiling can be chosen for memory alone.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const MAX_INVOCATIONS = 4096;

/** A fresh, empty table. One per daemon instance, never persisted — losing it
 *  on restart degrades to "verify once more", never to a missed verification. */
function createState() {
  return new Map();
}

/**
 * Has this invocation already had its code verified during this action?
 * Records it as verified when the answer is no.
 *
 * 🛑 FAIL-SAFE WHENEVER THE QUESTION CANNOT BE ASKED — no table, or no
 *    invocation id, ⇒ `false`, i.e. VERIFY. That is the historical behaviour
 *    byte for byte, so any caller unable to name its action (a test, a future
 *    client, a harness with no `tool_use_id`) keeps the full guarantee rather
 *    than silently losing it.
 *
 * @param {Map<string, 1>|null|undefined} state tracking table, mutated
 * @param {unknown} invocationId `tool_use_id` of the action, or ''
 * @param {number} [maxInvocations] eviction ceiling, overridable for tests
 * @returns {boolean} true when the verification may be SKIPPED
 */
function alreadyVerified(state, invocationId, maxInvocations) {
  if (!(state instanceof Map)) return false;
  if (typeof invocationId !== 'string' || invocationId === '') return false;

  if (state.has(invocationId)) {
    // ⚠️ RE-INSERT ON THE YOUNG END: an invocation still receiving frames must
    //    never be the one an eviction sacrifices — that would make the LONGEST
    //    actions, the ones this exists for, pay the most.
    state.delete(invocationId);
    state.set(invocationId, 1);
    return true;
  }

  state.set(invocationId, 1);
  const cap =
    Number.isInteger(maxInvocations) && maxInvocations > 0 ? maxInvocations : MAX_INVOCATIONS;
  // ⚠️ A LOOP, THOUGH ONE PASS IS ENOUGH IN PRACTICE (the table grows by one
  //    entry per call): it drains down to the cap rather than assuming a single
  //    overflow, exactly like `frame-sequencer-pure`'s own eviction.
  while (state.size > cap) {
    state.delete(state.keys().next().value);
  }
  return false;
}

module.exports = { createState, alreadyVerified, MAX_INVOCATIONS };
