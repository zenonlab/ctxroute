// ═══════════════════════════════════════════════════════════════════════
// collect-scope-pure.js — the corpus is COLLECTED once per ACTION, never
// once per frame.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 MEASURED 2026-09-18, AND IT IS THE SAME DEFECT `freshness-scope-pure.js`
//    CLOSED ONE LAYER DOWN. The harness opens ONE connection PER FRAME and an
//    action is 32 frames, so `collect-core.collectAll` — **6.36 ms on the real
//    corpus with the resident cache armed** — ran 32 times to answer a question
//    whose answer cannot change between them. On a real 32-frame action:
//    **282.92 ms of single-threaded CPU, of which ~198 ms was that
//    recomputation.**
// ✅ MEASURED AFTER, byte-for-byte differential on that same action:
//    **510.7 ms → 143 ms**, 25 emissions and 190,276 characters IDENTICAL,
//    ONE real collection instead of 32.
// 🔑 WHY IT MATTERS BEYOND LATENCY, and the reason is already written in
//    `freshness-scope.md`: the daemon is SINGLE-THREADED, so every millisecond
//    spent here is a millisecond during which it accepts nobody and does not
//    drain its sockets — and the kernel then refuses connections on a server
//    that is perfectly alive. The same fix one layer down took lost connections
//    from 30 of 384 to 2, then to zero on production.
//
// 🛑 THIS IS NOT A CORPUS CACHE, AND THE DISTINCTION IS LOAD-BEARING.
//    `corpus.js` owns corpus residency and its KERNEL invalidation; that layer
//    decides when the knowledge on disk has moved, and nothing here may second-
//    guess it. This table remembers only that ONE ACTION already had its
//    accumulator built, and the record dies with the entry. A doc edited
//    between two actions is picked up by the next action's first frame, exactly
//    as before.
// ⚠️ AND THE WINDOW IS DECLARED, NEVER HIDDEN: a doc edited between frame 1 and
//    frame N of the SAME action is served as it was at frame 1. That is bounded
//    by one tool call, it is the SAME residual `freshness-scope-pure.js`
//    declares for the code, and it is the price of delivering one coherent
//    action instead of 32 differently-dated halves.
//
// 🛑 FAILS TOWARDS MORE WORK, NEVER TOWARDS STALE KNOWLEDGE: no table, no
//    `tool_use_id`, or an eviction ⇒ COLLECT. Every caller unable to name its
//    action (a spawned hook, a test, a harness with no `tool_use_id`) therefore
//    keeps the historical behaviour BYTE FOR BYTE — which is what leaves the
//    spawn lane and every differential untouched (extension contract §6).
// 🛑 AN INVERTED CONDITION HERE WOULD SERVE ONE ACTION'S DOCUMENTS TO ANOTHER,
//    silently. That is why the decision lives in a PURE module, mutated, and
//    not in the I/O shell where Stryker never looks — the same reason its twin
//    was extracted on 2026-08-31.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

// ⚠️ SMALLER THAN THE FRESHNESS CEILING (4096) ON PURPOSE, and it is the one
//    real difference between the two modules: an entry here holds a whole
//    ACCUMULATOR (bodies included, tens of KB), where its twin holds the
//    integer 1. The ceiling therefore answers a MEMORY question, and a few
//    dozen actions in flight is already far beyond anything measured — the
//    client opens at most one connection at a time (`http-lane.md`), so the
//    live set is a handful.
const MAX_INVOCATIONS = 64;

/** A fresh, empty table. One per daemon instance, never persisted — losing it
 *  on restart degrades to "collect once more", never to stale knowledge. */
function createState() {
  return new Map();
}

/**
 * The accumulator already built for this action, or `null`.
 *
 * 🛑 `null` IS THE FAIL-SAFE ANSWER and the caller must read it as "collect":
 *    no table, or no invocation id, can never mean "there is nothing to serve".
 *
 * @param {Map<string, object>|null|undefined} state tracking table, mutated
 * @param {unknown} invocationId `tool_use_id` of the action, or ''
 * @returns {object|null} the memoised accumulator, or null when it must be built
 */
function lookup(state, invocationId) {
  if (!(state instanceof Map)) return null;
  if (typeof invocationId !== 'string' || invocationId === '') return null;
  if (!state.has(invocationId)) return null;
  const acc = state.get(invocationId);
  // ⚠️ RE-INSERT ON THE YOUNG END: an action still receiving frames must never
  //    be the one an eviction sacrifices — that would make the LONGEST actions,
  //    the ones this exists for, pay the most. Same rule as its twin.
  state.delete(invocationId);
  state.set(invocationId, acc);
  return acc;
}

/**
 * Remember the accumulator built for this action, and evict down to the cap.
 *
 * ⚠️ A NON-OBJECT IS NEVER STORED: handing back something a caller would then
 *    read fields off is how a memo turns into a silent wrong answer. Refusing
 *    to store simply means the next frame collects again.
 *
 * @param {Map<string, object>|null|undefined} state tracking table, mutated
 * @param {unknown} invocationId `tool_use_id` of the action, or ''
 * @param {unknown} acc accumulator to memoise
 * @param {number} [maxInvocations] eviction ceiling, overridable for tests
 * @returns {boolean} true when it was stored
 */
function remember(state, invocationId, acc, maxInvocations) {
  if (!(state instanceof Map)) return false;
  if (typeof invocationId !== 'string' || invocationId === '') return false;
  if (acc === null || typeof acc !== 'object') return false;

  state.delete(invocationId);
  state.set(invocationId, acc);
  const cap =
    Number.isInteger(maxInvocations) && maxInvocations > 0 ? maxInvocations : MAX_INVOCATIONS;
  // ⚠️ A LOOP, though one pass is enough in practice (the table grows by one
  //    entry per stored action): it drains down to the cap rather than assuming
  //    a single overflow, exactly like its twin and `frame-sequencer-pure`.
  while (state.size > cap) {
    state.delete(state.keys().next().value);
  }
  return true;
}

module.exports = { createState, lookup, remember, MAX_INVOCATIONS };
