// ═══════════════════════════════════════════════════════════════════════
// frame-sequencer-pure.js — WHICH CONTENT INDEX A CONNECTING FRAME RECEIVES.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 THE DEFECT THIS CLOSES, MEASURED 2026-08-28. Windows disables TCP
//    retransmission on loopback (`SIO_TCP_INITIAL_RTO`, libuv `src/win/tcp.c`,
//    "so connect() fails instantly if the port is unreachable") ⇒ ~6% of the
//    connections a declared frame opens against 127.0.0.1:8787 are lost in
//    silence (ETIMEDOUT — 1459 failures measured by ETW kernel trace, 100%
//    timeout, 0 refusal). A NAKED Node server loses as much (6.1%) as this
//    daemon (5.9%); a .NET client on the SAME server loses 0%. No Node version
//    fixes it, and it is neither our code nor Claude Code's.
// 🛑 THE OLD DESIGN ATTRIBUTED CHUNK k TO FRAME k, BY THE URL'S OWN NUMBER.
//    When frame k's connection never reaches the daemon, chunk k is delivered
//    NOWHERE, while other frames of the SAME action connect empty-handed — and
//    the document is still counted delivered. That is a silent bug on the
//    house's own doctrine ("zero SILENT bugs").
// ✅ THE FIX: the daemon is a SINGLE PROCESS that sees every connecting request
//    of one invocation (`tool_use_id`) — it already knows what it has served.
//    So a connecting frame receives the NEXT UNDELIVERED content index, never
//    the index its own URL happened to carry. As long as at least as many
//    frames connect as there are real content chunks, every chunk reaches
//    SOMEONE — which frame carried it stops mattering, exactly as the `CHUNK
//    j/m` marker already makes reassembly independent of arrival order
//    (RFC 6455 framing, §MULTI-FRAME TRANSPORT of the skill).
//
// ⚠️ THIS MODULE DECIDES ONLY THE MAPPING invocation × arrival ⇒ content index.
//    It knows NOTHING about documents, chunks, budgets, or the wire — that
//    stays entirely in `emission-core.js`/`budget.js`, untouched. The house
//    rule ("a source poses, it never resolves") applies here in its mirror
//    form: this module never touches WHAT is served, only WHICH SLOT a request
//    is handed.
//
// 🛑 A MAP, NEVER A PLAIN OBJECT — an invocation id is arbitrary text from a
//    harness; on an object, `__proto__` is not a key but an assignment to the
//    prototype (same reason `memory-store-pure.js` uses a Map).
// 🛑 BOUNDED FOR LIFE, DECLARED AT THE POINT OF CREATION (the space doctrine).
//    A daemon runs for weeks; an invocation whose Windows connections are ALL
//    lost but one never reaches its full count and would sit in this map
//    forever if nothing evicted it. The bound is a COUNT, never an inference
//    about a session/action being "over" — we do not guess that, we evict the
//    LEAST RECENTLY TOUCHED entry, exactly the discipline `memory-store-pure`
//    already applies to the durable/ephemeral state maps.
// 📐 SIZING, written so it can be refuted: one entry costs one string key (a
//    `tool_use_id`, tens of bytes) plus one small integer — a few hundred bytes
//    for thousands of entries. `MAX_INVOCATIONS = 4096` mirrors
//    `memory-store-pure.MAX_SCOPES`: far above any realistic count of
//    concurrent tool calls in flight, and cheap even if it is reached.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const MAX_INVOCATIONS = 4096;

/** A fresh, empty tracking table. One per daemon instance (per `createServer`
 *  call), never shared across daemons and never persisted — losing it on a
 *  restart degrades to "serve the URL's own frame number", never a crash. */
function createState() {
  return new Map();
}

/**
 * Which content index (1-based) should THIS connecting request receive?
 *
 * 🛑 FAIL-OPEN TO THE URL'S OWN NUMBER whenever tracking is impossible or
 *    pointless: no state map, no usable invocation id, or fewer than 2
 *    declared frames (a single frame always carries index 1 regardless, and
 *    `pretool-core.run` ignores `options.frame` in that case already — cf
 *    its `fragmented` gate). Degrading to the OLD behaviour rather than
 *    inventing a verdict is what keeps every caller that cannot supply a
 *    tracking map (a test, a future client) byte-identical to today.
 *
 * ⚠️ `requestedFrame` IS THE FLOOR, NEVER READ AS AN INSTRUCTION. It is the
 *    URL's `?frame=` value — what today's design would have served — and it
 *    is returned verbatim on every fail-open path. Once tracking is active it
 *    is NOT consulted again: the whole point is that the physical frame
 *    number carries no meaning any more, only ARRIVAL ORDER does.
 *
 * @param {Map<string, number>|null|undefined} state tracking table, mutated
 * @param {string} invocationId `tool_use_id` of the action, or ''
 * @param {number} requestedFrame the URL's own `?frame=` (1-based), the
 *   fallback value when tracking cannot apply
 * @param {number} nbFrames declared frame count for this action
 * @param {number} [maxInvocations] eviction ceiling, overridable for tests
 * @returns {number} the content index (1-based) this request must be served
 */
function nextIndex(state, invocationId, requestedFrame, nbFrames, maxInvocations) {
  const cap = Number.isInteger(maxInvocations) && maxInvocations > 0 ? maxInvocations : MAX_INVOCATIONS;
  // ⚠️ `Math.max`, NOT a `>= 1 ? … : 1` GUARD — a boundary comparator here is an
  //    EQUIVALENT MUTANT BY CONSTRUCTION: the default (1) and the boundary (1)
  //    are the SAME NUMBER, so `>= 1` vs `> 1` produce IDENTICAL output at the
  //    one input where they would otherwise disagree (`requestedFrame === 1`).
  //    No test can ever kill that mutant — the fix is to remove the ambiguous
  //    comparator, not to write a test for it (house rule: an equivalent
  //    mutant is eliminated at the source, never chased with a case).
  const fallback = Number.isInteger(requestedFrame) ? Math.max(requestedFrame, 1) : 1;
  if (!(state instanceof Map)) return fallback;
  if (!Number.isInteger(nbFrames) || nbFrames < 2) return fallback;
  if (typeof invocationId !== 'string' || invocationId === '') return fallback;

  // ⚠️ READ-THEN-DELETE, NOT A PLAIN `get`: re-inserting on the young end is
  //    what makes eviction hit the coldest invocation first — an entry that is
  //    actively receiving requests must never be the one sacrificed.
  const served = state.has(invocationId) ? state.get(invocationId) : 0;
  state.delete(invocationId);
  const next = served + 1;
  // ⚠️ `Math.min`, NOT a `< nbFrames ? … : nbFrames` GUARD — same reasoning as
  //    the fallback above. `next` never exceeds `nbFrames` by more than the
  //    exact tie (the only reachable "else" case is `next === nbFrames`,
  //    where both branches of ANY comparator agree), so `<` vs `<=` is an
  //    EQUIVALENT MUTANT no test can distinguish. `Math.min` states the
  //    intent directly and turns a comparator swap into a Math.max swap,
  //    which real inputs (e.g. a caller whose declared `nbFrames` shrinks
  //    mid-invocation) DO distinguish.
  const index = Math.min(next, nbFrames);

  // ⚠️ EXHAUSTED ⇒ DROPPED, NEVER KEPT. Once `nbFrames` requests of ONE
  //    invocation have been served, there is nothing left to hand out — an
  //    entry lingering past this point would only ever be dead weight, and the
  //    normal (all-frames-connect) case must not grow the map at all in
  //    steady state.
  if (next < nbFrames) {
    state.set(invocationId, next);
    // ⚠️ EVICT AFTER INSERTING, NEVER BEFORE: the entry just touched is always
    //    the youngest and must never be the one an eviction removes.
    while (state.size > cap) state.delete(state.keys().next().value);
  }
  return index;
}

module.exports = { createState, nextIndex, MAX_INVOCATIONS };
