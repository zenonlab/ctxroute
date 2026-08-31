// ═══════════════════════════════════════════════════════════════════════
// carryover-pure.js — CONTENT PROMISED TO A FRAME THAT NEVER CONNECTED
//                     GOES BACK IN THE QUEUE INSTEAD OF BEING DROPPED.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 THE DEFECT, PROVEN 2026-08-30 AND CLOSED HERE. `emission-core.emit`
//    persists ONLY what overflows the LAST frame of a plan, and it runs ONCE
//    per invocation (frames 2..N replay the memoized plan and write nothing).
//    So when fewer frames CONNECT than the plan has chunks, the leftover
//    chunks are neither delivered nor queued — while `doc-seen-` already
//    records the document as delivered, so no later action re-decides it.
//    MEASURED in production: 10 of 32 connections on one action, chunks
//    11..19 of 19 never seen again, on any subsequent action. Not a delay:
//    a permanent, SILENT loss — the one failure this project refuses.
//
// 🔑 TWO CAUSES, ONE REMEDY. "Too much content" and "a connection was lost"
//    must end in the SAME place — the queue — and leave at the next action.
//    `frame-sequencer-pure.js` (2026-08-28) already made the frames that DO
//    connect carry the next undelivered chunk; it can do nothing for chunks
//    no connection ever comes to fetch. This module is that missing half.
//
// 🛑 WHAT THIS MODULE REFUSES TO ASSUME, AND IT IS THE WHOLE DESIGN.
//    "This invocation is finished" is NOT AN AVAILABLE FACT: no harness
//    emits a closing event, and an agent runs several tool calls AT ONCE
//    (measured 2026-08-30 — a notice built on that premise fired 31 false
//    alarms out of 32). So nothing here waits for an end, and nothing here
//    infers one. The only moments used are FACTS: a frame arrived, and a
//    NEW invocation is deciding its plan.
//
// ✅ THE MECHANISM, in one sentence: when an invocation decides its plan, it
//    HARVESTS the not-yet-served segments of the other pending invocations
//    of the same scope and carries them itself — and a harvested invocation
//    stops serving, for ever.
//    ⚠️ THAT SECOND HALF IS NOT OPTIONAL: without it, a late frame of the
//    harvested invocation would serve a chunk the harvester has just taken
//    over, and the agent would receive it TWICE. Ownership moves; it is
//    never shared. Nothing is ever "probably dead" here — the transfer is
//    atomic because the daemon is single-threaded, so no lock, no timer and
//    no liveness probe exist in this file, by construction.
//    ⚠️ HARVESTING A STILL-LIVE INVOCATION IS THEREFORE HARMLESS, and that
//    is deliberate: its content rides on the harvester's frames instead of
//    its own. Worst case some content is deferred by ONE action. That trade
//    — a possible one-action delay against a permanent loss — is the whole
//    point, and it is the "consolation, never a repair" the doctrine states.
//
// 🛑 THE TARGET IS NOT "NO FRAME IS EVER LOST" — that is impossible (Two
//    Generals, and we are the SERVER: the harness opens the connections).
//    The target is the one safety engineering actually uses: the agent never
//    works without the knowledge it is owed, and a loss never stays SILENT.
//
// ⚠️ FAILS TOWARDS TODAY'S BEHAVIOUR, NEVER TOWARDS A GUESS. Any input this
//    module cannot read (no table, no invocation id, a plan it cannot
//    re-split) yields an EMPTY carryover — that is byte-for-byte the
//    behaviour before this file existed. The opposite default (carry
//    everything when unsure) would re-deliver content that already arrived
//    and eat the budget the real content needs, on the hot path.
//
// ⚠️ A MAP, NEVER A PLAIN OBJECT, and LRU-BOUNDED — same law as
//    `frame-sequencer-pure.js`, `delivery-notice-pure.js` and
//    `freshness-scope-pure.js`: `__proto__` is an ordinary key in a Map, and
//    a long-lived daemon must never grow a table for ever. The space
//    doctrine's reason, written: an eviction costs at most one un-harvested
//    invocation — i.e. today's behaviour for that one action — never a wrong
//    answer.
//
// ⚠️ WHY A TABLE OF ITS OWN AND NOT A READ OF THE SEQUENCER'S. The sequencer
//    DELETES an invocation's entry the moment its last frame is served, so
//    its map cannot answer "which invocations are still incomplete". Same
//    precedent and same reason as `delivery-notice-pure.js`: fed from the
//    SAME call sites, with the SAME LRU discipline, never by reaching into
//    another module's bookkeeping.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

// Mirrors `frame-sequencer-pure.MAX_INVOCATIONS` — one entry is a short id, a
// scope id and two small integers.
const MAX_INVOCATIONS = 4096;

/** A fresh tracking table. One per daemon instance, never persisted: losing
 *  it on a restart degrades to "no carryover", i.e. today's behaviour. */
function createState() {
  return new Map();
}

/**
 * Record one connecting frame of one invocation.
 *
 * @param {Map<string, {scopeId: string, served: number, nbFrames: number, harvested: boolean}>|null|undefined} state
 * @param {string} scopeId agent scope (session, or session+agent)
 * @param {string} invocationId `tool_use_id`, or ''
 * @param {number} servedIndex the content index just served (1-based, as
 *   returned by `frame-sequencer-pure.nextIndex`) — after the k-th arrival
 *   this IS the number of frames served so far
 * @param {number} nbFrames declared frame count for this action
 * @param {number} [maxInvocations] eviction ceiling, overridable for tests
 * @returns {void}
 */
function observe(state, scopeId, invocationId, servedIndex, nbFrames, maxInvocations) {
  if (!(state instanceof Map)) return;
  if (typeof scopeId !== 'string' || scopeId === '') return;
  if (typeof invocationId !== 'string' || invocationId === '') return;
  if (!Number.isInteger(servedIndex) || servedIndex < 1) return;
  if (!Number.isInteger(nbFrames) || nbFrames < 2) return;
  const previous = state.get(invocationId);
  // ⚠️ READ-THEN-DELETE, then re-insert: LRU by re-insertion, so eviction hits
  //    the coldest invocation, never one that is actively receiving frames.
  state.delete(invocationId);
  // ⚠️ `Math.max` AND NOT A COMPARATOR GUARD — frames may arrive in any order
  //    and the sequencer CLAMPS its index at `nbFrames`, so a later arrival can
  //    legitimately report the same number twice. Taking the maximum keeps the
  //    count monotonic without a boundary comparator (an equivalent mutant by
  //    construction, cf the sequencer's own header).
  const served = previous ? Math.max(previous.served, servedIndex) : servedIndex;
  const harvested = previous ? previous.harvested === true : false;
  state.set(invocationId, { scopeId, served, nbFrames, harvested });
  const cap = Number.isInteger(maxInvocations) && maxInvocations > 0 ? maxInvocations : MAX_INVOCATIONS;
  // ⚠️ EVICT AFTER INSERTING: the entry just touched is the youngest and must
  //    never be the one an eviction removes.
  while (state.size > cap) state.delete(state.keys().next().value);
}

/**
 * Has this invocation's remaining content been taken over by another one?
 * A harvested invocation must serve NOTHING more — that is what makes the
 * transfer of ownership exact instead of a duplication.
 *
 * @param {Map|null|undefined} state
 * @param {string} invocationId
 * @returns {boolean}
 */
function isHarvested(state, invocationId) {
  if (!(state instanceof Map)) return false;
  // ⚠️ NO STRING GUARD HERE, AND ITS ABSENCE IS DELIBERATE (mutation, 2026-08-31).
  //    `Map.get` already answers `undefined` for a key no `observe` could ever
  //    have stored — a non-string, or the empty id `observe` refuses. A guard
  //    that cannot change an answer is an EQUIVALENT MUTANT, i.e. an eternal
  //    survivor, and this house eliminates equivalence at the source rather
  //    than freezing dead code with a test. 5 survivors removed by deleting it.
  const entry = state.get(invocationId);
  return entry ? entry.harvested === true : false;
}

/**
 * Which invocations of this scope still owe content, other than the one
 * deciding right now?
 *
 * ⚠️ INCOMPLETE MEANS `served < nbFrames` — a purely observed fact, never a
 *    judgement about whether more frames are coming. An invocation whose
 *    frames all connected owes nothing and is never listed.
 * ⚠️ THE CURRENT INVOCATION IS EXCLUDED: harvesting oneself would hand one's
 *    own plan back to oneself, an infinite hand-off.
 *
 * @param {Map|null|undefined} state
 * @param {string} scopeId
 * @param {string} currentInvocationId the invocation deciding its plan
 * @returns {{invocationId: string, served: number}[]} oldest first (Map
 *   insertion order). ⚠️ THE COUNT TRAVELS WITH THE ID, in ONE reading: a
 *   caller that fetched the id here and the count by a second lookup could
 *   observe two different instants — the entry may have been touched by a
 *   frame arriving in between. One read, one fact.
 */
function pendingFor(state, scopeId, currentInvocationId) {
  const out = [];
  if (!(state instanceof Map)) return out;
  // ⚠️ NO SCOPE GUARD HERE EITHER, same reason and same measurement: `observe`
  //    REFUSES to store a non-string or empty scope, so no entry can ever match
  //    one — the comparison below already answers "nothing". 4 more survivors.
  for (const [id, entry] of state) {
    if (id === currentInvocationId) continue;
    if (entry.scopeId !== scopeId) continue;
    if (entry.harvested === true) continue;
    if (entry.served >= entry.nbFrames) continue;
    out.push({ invocationId: id, served: entry.served });
  }
  return out;
}

/**
 * Mark an invocation harvested: it will serve nothing more.
 *
 * ⚠️ NEVER re-inserted on the young end here: a harvested entry is dead
 *    weight kept only so a late frame can be refused. Letting eviction reach
 *    it first is correct — once it is gone, a late frame simply serves its
 *    own plan again, which is today's behaviour.
 *
 * @param {Map|null|undefined} state
 * @param {string} invocationId
 * @returns {void}
 */
function markHarvested(state, invocationId) {
  if (!(state instanceof Map)) return;
  const entry = state.get(invocationId);
  if (!entry) return;
  state.set(invocationId, { ...entry, harvested: true });
}

/**
 * The segments of a plan that no connecting frame ever carried.
 *
 * ⚠️ THE LAST FRAME'S `deferred` IS DELIBERATELY NOT INCLUDED: it was already
 *    persisted by `emission-core.emit` when the plan was decided. Adding it
 *    here would queue the same text twice — conservation AND uniqueness, the
 *    two properties this transport owes (one of them was missing once, and it
 *    produced an orphan chunk in production).
 *
 * @param {{segments?: {id: string, text: string}[]}[]} frames the re-split plan
 * @param {number} servedFrames how many frames actually connected
 * @returns {{id: string, text: string}[]} segments to hand back to the queue
 */
function unserved(frames, servedFrames) {
  const out = [];
  if (!Array.isArray(frames)) return out;
  if (!Number.isInteger(servedFrames) || servedFrames < 0) return out;
  // ⚠️ `slice` THEN `flat()`, NEVER AN INDEXED LOOP — and this is elimination,
  //    not decoration (mutation, 2026-08-31). `i < frames.length` mutated to
  //    `<=` reads one past the end, which yields `undefined`, which the guard
  //    below already skips: an EQUIVALENT MUTANT, unkillable by any input. The
  //    house rule is to remove the ambiguous comparator, never to write a test
  //    that freezes dead code. `slice` is safe here because a negative or
  //    non-integer `servedFrames` was refused above — without that guard it
  //    would count from the END and carry the wrong frames.
  //    ⚠️ Groups then `flat()` and not a loop inside a loop: `quadratic-gate`
  //    refuses the nesting, and the work is linear in the content owed.
  //    ⚠️ ONE TRAVERSAL PER STATEMENT: the `slice` is hoisted out of the loop
  //    header, because inside it `quadratic-gate` reads an array method nested
  //    in a loop — the very shape that once hid a real O(N²) here.
  const owed = frames.slice(servedFrames);
  for (const frame of owed) {
    if (frame && Array.isArray(frame.segments)) out.push(frame.segments);
  }
  return out.flat();
}

module.exports = { createState, observe, isHarvested, pendingFor, markHarvested, unserved, MAX_INVOCATIONS };
