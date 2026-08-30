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
// 🔴 SECOND DEFECT CLOSED (2026-08-30). The DEFERRED verdict above only ever
//    fires at LRU eviction — 4096 invocations later, which never happens in
//    practice. An incomplete invocation can therefore go unreported for the
//    rest of the daemon's life. But a NEW invocation of the SAME AGENT
//    (`scopeId`, `lib.scopeId(session_id, agent_id)`) proves the previous one
//    is CLOSED the instant it starts: an agent never runs two tool calls at
//    once, so a second invocation beginning is a DECIDABLE fact, not a
//    heuristic (skill §3bis — "we only inject on FACTS, never guess intent").
//    ⇒ INCOMPLETE: observing an invocation id that DIFFERS from the one
//    already in flight for this `scopeId`, while that prior invocation had
//    not reached its declared count, reports it IMMEDIATELY instead of
//    waiting for an eviction that in practice never comes.
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
// ⚠️ WHY TWO MAPS, NOT ONE KEYED BY `scopeId`. The invocation table's key
//    MUST stay `invocationId`: an empty/absent `scopeId` (a caller that does
//    not supply one — a test, a harness whose payload has no `session_id`)
//    must behave EXACTLY as before this change, and every invocation would
//    otherwise collide on the single key `''`. `scopes` is therefore an
//    ADDITIONAL, independent index — `scopeId -> invocationId currently in
//    flight for that scope` — consulted ONLY when a non-empty `scopeId` is
//    supplied, never merged into the invocation table's own keying.
//
// 🛑 TWO MAPS, NEVER PLAIN OBJECTS — same reason as `frame-sequencer-pure.js`:
//    an invocation id or a scope id is arbitrary harness text, and
//    `__proto__` on a plain object is an assignment to the prototype, not a
//    key.
// 🛑 BOUNDED FOR LIFE (space doctrine): a daemon runs for weeks, so an
//    invocation whose connections never complete, or a scope whose agent
//    never returns, must never sit in these tables forever. Both maps share
//    the SAME `maxInvocations` ceiling and the SAME LRU discipline — a scope
//    costs a string key plus one string value, negligible even at the
//    ceiling.
//
// 🛑 THE VERDICT NAMES A COUNT, NEVER A CAUSE (skill §0sexies-ter, the
//    "N doc(s) WITHHELD" precedent): this module observes ARRIVALS, never
//    WHY a connection was lost. Widening it to guess "the daemon restarted"
//    or "the lock was busy" would be exactly the class of lie the withholding
//    notice was built to avoid.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const MAX_INVOCATIONS = 4096;

/** A fresh, empty tracking state. One per daemon instance, never shared
 *  across daemons and never persisted — losing it on restart degrades to
 *  "no notice for the invocations already in flight", never a crash.
 *
 *  @returns {{invocations: Map<string, {nbFrames: number, served: number}>, scopes: Map<string, string>}}
 */
function createState() {
  return { invocations: new Map(), scopes: new Map() };
}

/**
 * Observe one connecting request AFTER `frame-sequencer-pure.nextIndex` has
 * decided which content `index` it receives, and return the notice (if any)
 * this observation produces.
 *
 * @param {{invocations: Map<string, {nbFrames: number, served: number}>, scopes: Map<string, string>}|null|undefined} state
 *   tracking state, mutated
 * @param {string} scopeId `lib.scopeId(session_id, agent_id)` of the acting
 *   agent, or '' when unavailable — see the header for why an empty value
 *   disables ONLY the incomplete-on-new-invocation trigger, nothing else
 * @param {string} invocationId `tool_use_id` of the action, or ''
 * @param {number} index the content index this request just received
 *   (1-based, as returned by `frame-sequencer-pure.nextIndex`)
 * @param {number} nbFrames declared frame count for this action
 * @param {number} [maxInvocations] eviction ceiling, overridable for tests
 * @returns {{kind: 'complete', nbFrames: number}|{kind: 'deferred', remaining: number}|{kind: 'incomplete', reached: number, declared: number}|null}
 */
function observe(state, scopeId, invocationId, index, nbFrames, maxInvocations) {
  // 🛑 FAIL-SILENT WHENEVER OBSERVATION CANNOT APPLY — same three guards as
  //    `frame-sequencer-pure.nextIndex`, so any caller unable to supply
  //    tracking (a test, a future client) simply never sees a notice, rather
  //    than a fabricated one.
  if (!state || !(state.invocations instanceof Map) || !(state.scopes instanceof Map)) return null;
  if (typeof invocationId !== 'string' || invocationId === '') return null;
  // ⚠️ A single-frame action never fragments, so "complete"/"deferred" carry
  //    no information there — the guard mirrors `frame-sequencer-pure`'s own
  //    `nbFrames < 2` fail-open, for the same reason.
  if (!Number.isInteger(nbFrames) || nbFrames < 2) return null;
  if (!Number.isInteger(index) || index < 1) return null;

  const cap = Number.isInteger(maxInvocations) && maxInvocations > 0 ? maxInvocations : MAX_INVOCATIONS;

  // ── A NEW INVOCATION OF THE SAME AGENT PROVES THE PRIOR ONE IS CLOSED.
  //    `scopeId` empty/non-string ⇒ this whole block is skipped, and the
  //    rest of the function behaves EXACTLY as it did before this trigger
  //    existed (the header's ` WHY TWO MAPS` note).
  let incomplete = null;
  if (typeof scopeId === 'string' && scopeId !== '') {
    const priorInvocationId = state.scopes.get(scopeId);
    // ⚠️ NO SEPARATE `priorInvocationId !== undefined` GUARD, ON PURPOSE
    //    (equivalent-mutant law, cf. the header's note on `Math.max`/
    //    `Math.min`): a first-ever observation of a scope leaves
    //    `priorInvocationId` as `undefined`, which trivially differs from
    //    `invocationId` (always a non-empty string) — so the branch below is
    //    entered, but `state.invocations.get(undefined)` can never match a
    //    real record (every stored key is a validated non-empty string),
    //    hence `priorRecord` is always falsy there. A guard that can never
    //    change the outcome cannot be exercised on its false side by any
    //    real input, hence no test could ever kill a mutant of it.
    if (priorInvocationId !== invocationId) {
      // A record still present under the PRIOR invocation id means it had
      // not reached its declared count when this new one started — a
      // completed invocation is deleted from `state.invocations` the moment
      // it completes (below), so its absence here already means "nothing to
      // report", never a lost signal.
      const priorRecord = state.invocations.get(priorInvocationId);
      if (priorRecord) {
        incomplete = { kind: 'incomplete', reached: priorRecord.served, declared: priorRecord.nbFrames };
        state.invocations.delete(priorInvocationId);
      }
    }
    // Refresh this scope's current invocation, LRU-style (read-then-delete,
    // not a plain `set`), so an active scope is never the one an eviction
    // sacrifices.
    state.scopes.delete(scopeId);
    state.scopes.set(scopeId, invocationId);
    while (state.scopes.size > cap) {
      const oldestScope = state.scopes.keys().next().value;
      state.scopes.delete(oldestScope);
    }
  }

  // ── THE LAST DECLARED PIECE JUST ARRIVED: every frame reached the daemon.
  if (index >= nbFrames) {
    // Nothing left to track for this invocation — the record (if any) is
    // spent, exactly like `frame-sequencer-pure` deletes its own entry here.
    state.invocations.delete(invocationId);
    // 🔑 THE RARE INFORMATION PRIMES OVER THE ROUTINE ONE: a prior
    //    invocation reported incomplete is more informative than this one
    //    completing normally.
    return incomplete || { kind: 'complete', nbFrames };
  }

  // ── STILL INCOMPLETE: refresh this invocation's record (read-then-delete,
  //    not a plain `set`, so re-insertion lands on the young end of the Map
  //    — the LRU discipline that keeps an ACTIVE invocation from ever being
  //    the one an eviction sacrifices).
  state.invocations.delete(invocationId);
  state.invocations.set(invocationId, { nbFrames, served: index });

  // ⚠️ AT MOST ONE EVICTION PER OBSERVATION IN PRACTICE (the table only ever
  //    grows by one entry per call), but the loop stays general — it drains
  //    down to the cap rather than assuming a single overflow, exactly like
  //    `frame-sequencer-pure.nextIndex`'s own eviction loop. Only the LAST
  //    entry evicted this way is reported: two real evictions in a single
  //    observation would mean the cap was crossed by more than one, which
  //    the sizing note above rules out as unreachable in practice.
  let evicted = null;
  while (state.invocations.size > cap) {
    const oldestKey = state.invocations.keys().next().value;
    evicted = state.invocations.get(oldestKey);
    state.invocations.delete(oldestKey);
  }
  // 🔑 SAME PRIORITY AS ABOVE: an incomplete verdict from the scope trigger
  //    beats whatever this observation would otherwise report.
  if (incomplete) return incomplete;
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
 * @param {{kind: 'complete', nbFrames: number}|{kind: 'deferred', remaining: number}|{kind: 'incomplete', reached: number, declared: number}|null} notice
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
  if (notice.kind === 'incomplete') {
    return `ctxroute: only ${notice.reached} of ${notice.declared} frames reached the daemon`;
  }
  return '';
}

module.exports = { createState, observe, messageFor, MAX_INVOCATIONS };
