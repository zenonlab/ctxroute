// ═══════════════════════════════════════════════════════════════════════
// delivery-notice-pure.js — WHAT THE DAEMON TELLS THE HUMAN ABOUT ONE
// INVOCATION'S DELIVERY, DERIVED FROM `frame-sequencer-pure.js`'s FACTS.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 THE DEFECT THIS CLOSES. `frame-sequencer-pure.js` (2026-08-28) made a
//    LOST connection stop stranding a chunk — the invocation is served
//    correctly. But nothing ever told the HUMAN whether an invocation
//    finished or not: a transport that is correct but says nothing looks
//    exactly like a transport that is broken, and a system believed broken
//    ends up unplugged (skill §MULTI-FRAME TRANSPORT, same lesson as the
//    "N doc(s) WITHHELD" and "capacity alarm" notices already shipped).
//
// ✅ THE FIX: the daemon already knows, per invocation (`tool_use_id`), how
//    many pieces it declared (`nbFrames`, the action's `frames` setting) and
//    which piece a connecting request just received (`index`, decided by
//    `frame-sequencer-pure.nextIndex`). This module turns those two numbers
//    into a HUMAN-FACING verdict:
//      · the request that receives the LAST declared piece (`index ===
//        nbFrames`) ⇒ COMPLETE: every declared frame reached the daemon;
//      · an invocation that never reaches its last piece, evicted from this
//        module's own tracking table before completion ⇒ DEFERRED: its
//        remaining pieces never got served.
//
// ⚠️ WHY A SEPARATE TABLE, NOT A READ OF `frame-sequencer-pure`'s OWN MAP.
//    That map stores ONLY a served count, keyed by invocation, and DELETES
//    the entry the instant it reaches `nbFrames` — by the time this module
//    could look, the fact "how many pieces did the evicted invocation still
//    owe" would already be gone. A source poses, it does not reach into a
//    sibling's private state (the same law `gate.js` applies to `declFor`):
//    this module keeps its OWN minimal record (`nbFrames`, `served`) for
//    exactly the invocations that have not yet completed, refreshed on the
//    SAME calls and with the SAME LRU discipline as `frame-sequencer-pure`,
//    so the two tables evict in lockstep without ever reading one another.
//
// 🛑 A MAP, NEVER A PLAIN OBJECT — same reason as `frame-sequencer-pure.js`:
//    an invocation id is arbitrary harness text, and `__proto__` on a plain
//    object is an assignment to the prototype, not a key.
// 🛑 BOUNDED FOR LIFE (space doctrine): a daemon runs for weeks, so an
//    invocation whose connections never complete must never sit in this
//    table forever. `MAX_INVOCATIONS` mirrors `frame-sequencer-pure`'s bound
//    (same sizing rationale: one entry costs a string key plus two small
//    integers — negligible even at the ceiling).
//
// 🛑 THE VERDICT NAMES A COUNT, NEVER A CAUSE (skill §0sexies-ter, the
//    "N doc(s) WITHHELD" precedent): this module observes ARRIVALS, never
//    WHY a connection was lost. Widening it to guess "the daemon restarted"
//    or "the lock was busy" would be exactly the class of lie the withholding
//    notice was built to avoid.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const MAX_INVOCATIONS = 4096;

/** A fresh, empty tracking table. One per daemon instance, never shared
 *  across daemons and never persisted — losing it on restart degrades to
 *  "no notice for the invocations already in flight", never a crash. */
function createState() {
  return new Map();
}

/**
 * Observe one connecting request AFTER `frame-sequencer-pure.nextIndex` has
 * decided which content `index` it receives, and return the notice (if any)
 * this observation produces.
 *
 * @param {Map<string, {nbFrames: number, served: number}>|null|undefined} state
 *   tracking table, mutated
 * @param {string} invocationId `tool_use_id` of the action, or ''
 * @param {number} index the content index this request just received
 *   (1-based, as returned by `frame-sequencer-pure.nextIndex`)
 * @param {number} nbFrames declared frame count for this action
 * @param {number} [maxInvocations] eviction ceiling, overridable for tests
 * @returns {{kind: 'complete', nbFrames: number}|{kind: 'deferred', remaining: number}|null}
 */
function observe(state, invocationId, index, nbFrames, maxInvocations) {
  // 🛑 FAIL-SILENT WHENEVER OBSERVATION CANNOT APPLY — same three guards as
  //    `frame-sequencer-pure.nextIndex`, so any caller unable to supply
  //    tracking (a test, a future client) simply never sees a notice, rather
  //    than a fabricated one.
  if (!(state instanceof Map)) return null;
  if (typeof invocationId !== 'string' || invocationId === '') return null;
  // ⚠️ A single-frame action never fragments, so "complete"/"deferred" carry
  //    no information there — the guard mirrors `frame-sequencer-pure`'s own
  //    `nbFrames < 2` fail-open, for the same reason.
  if (!Number.isInteger(nbFrames) || nbFrames < 2) return null;
  if (!Number.isInteger(index) || index < 1) return null;

  // ── THE LAST DECLARED PIECE JUST ARRIVED: every frame reached the daemon.
  if (index >= nbFrames) {
    // Nothing left to track for this invocation — the record (if any) is
    // spent, exactly like `frame-sequencer-pure` deletes its own entry here.
    state.delete(invocationId);
    return { kind: 'complete', nbFrames };
  }

  // ── STILL INCOMPLETE: refresh this invocation's record (read-then-delete,
  //    not a plain `set`, so re-insertion lands on the young end of the Map
  //    — the LRU discipline that keeps an ACTIVE invocation from ever being
  //    the one an eviction sacrifices).
  state.delete(invocationId);
  state.set(invocationId, { nbFrames, served: index });

  const cap = Number.isInteger(maxInvocations) && maxInvocations > 0 ? maxInvocations : MAX_INVOCATIONS;
  // ⚠️ AT MOST ONE EVICTION PER OBSERVATION IN PRACTICE (the table only ever
  //    grows by one entry per call), but the loop stays general — it drains
  //    down to the cap rather than assuming a single overflow, exactly like
  //    `frame-sequencer-pure.nextIndex`'s own eviction loop. Only the LAST
  //    entry evicted this way is reported: two real evictions in a single
  //    observation would mean the cap was crossed by more than one, which
  //    the sizing note above rules out as unreachable in practice.
  let evicted = null;
  while (state.size > cap) {
    const oldestKey = state.keys().next().value;
    evicted = state.get(oldestKey);
    state.delete(oldestKey);
  }
  // ⚠️ NO GUARD ON `remaining` HERE, ON PURPOSE (equivalent-mutant law, cf.
  //    `frame-sequencer-pure.js`'s own header on `Math.max`/`Math.min`): an
  //    entry only ever enters this table a few lines above, while
  //    `index < nbFrames` STRICTLY — so any record reaching eviction owes a
  //    remainder that is ALWAYS positive. A comparator here could never be
  //    exercised on its false side by a real input, hence no test could ever
  //    kill a mutant of it — the fix is removing the ambiguous comparator,
  //    never chasing an unreachable branch with a case.
  if (evicted) return { kind: 'deferred', remaining: evicted.nbFrames - evicted.served };
  return null;
}

/**
 * Render a notice as the exact text shown to the human. PURE formatting,
 * kept apart from `observe()` so a caller can decide (`showNotification`,
 * once-per-action) without this module ever touching that policy.
 *
 * 🛑 THE TEXT NAMES NUMBERS, NEVER A CAUSE — see the header. Wording is
 *    frozen: it is asserted VERBATIM by the differential/integration suites.
 *
 * @param {{kind: 'complete', nbFrames: number}|{kind: 'deferred', remaining: number}|null} notice
 * @returns {string} empty string when there is nothing to say
 */
function messageFor(notice) {
  if (!notice) return '';
  if (notice.kind === 'complete') {
    const k = notice.nbFrames;
    return `ctxroute: all ${k} chunk(s) delivered — ${k} of ${k} declared frames reached the daemon`;
  }
  if (notice.kind === 'deferred') {
    return `ctxroute: ${notice.remaining} chunk(s) deferred to the next action`;
  }
  return '';
}

module.exports = { createState, observe, messageFor, MAX_INVOCATIONS };
