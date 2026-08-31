// ═══════════════════════════════════════════════════════════════════════
// STATE-CRDT-PURE — the three DURABLE key classes as structures whose
// writes COMMUTE. Zero I/O, zero state, zero clock, zero randomness.
// ═══════════════════════════════════════════════════════════════════════
//

'use strict';

// 🔑 WHY THIS EXISTS, AND IT IS A THEORY PROBLEM, NOT AN IMPLEMENTATION ONE.
//    Two actors performing a read-modify-write on one state have exactly three
//    outcomes, and there is no fourth:
//      (a) MUTUAL EXCLUSION — correct as long as everybody agrees on the
//          ADDRESS of the lock and every exemption stays true;
//      (b) OPERATIONS THAT COMMUTE — correct UNCONDITIONALLY;
//      (c) A SINGLE WRITER — correct as long as that writer is alive.
//    This repository is in (a) and paid BOTH of its conditions on 2026-08-23:
//    the lock address was hand-written in four places (a fifth spelling is
//    another lock, and two locks are no lock), and an exemption that carried its
//    OWN expiry clause IN BOLD went stale on 2026-08-22 with nothing going red.
//    **Measured: 209 lost read-modify-writes out of 800** on one `remainder-`
//    key; control with both writers locked, 0–1 of 800.
//    (c) does not close the class either: the daemon dies BY DESIGN at every
//    edit of this repository, so a window remains — and a RARE race is worse
//    than a frequent one, because it is undebuggable.
//    ⇒ this module is (b).
//
// 🛑 NOTHING USES IT YET, AND THAT IS DELIBERATE (expand/contract). It is
//    delivered PROVEN and UNWIRED; the switch-over is a separate gesture, made
//    when no agent is running. Wiring it here would be a destructive migration
//    of a shared state — forbidden by the house rule "all consumers or none".
//
// 🛑 THE LOCK STAYS. This is a BELT, not a replacement: (b) makes the lock's two
//    conditions stop being load-bearing, it does not make the lock wrong.
//
// ═══════════════════════════════════════════════════════════════════════
// WHAT A "STRUCTURE WHOSE WRITES COMMUTE" IS HERE, PRECISELY
// ═══════════════════════════════════════════════════════════════════════
// Every structure below is a JOIN-SEMILATTICE: `merge` is commutative,
// associative and idempotent, and every write is monotone (it can only move a
// state UP the lattice). Those four facts together are what make an
// INTERLEAVING of two writers converge — no lock, no order, no clock.
// The only three lattice pieces used, and there are no others:
//   · G-SET     — a set that only grows. Merge = union.
//   · G-COUNTER — one slot per WRITER, each slot only grows.
//                 Merge = per-slot MAX. Value = SUM of the slots.
//   · MAX-REGISTER — a key → number map where a value only grows.
//                 Merge = per-key MAX.
// 🛑 A PLAIN COUNTER IS NOT COMMUTATIVE (`x = x + 1` from two readers of the
//    same `x` yields x+1, not x+2 — that IS the 209 lost updates). A counter
//    PER WRITER whose value is the sum IS.
// 🛑 REMOVAL IS NEVER COMMUTATIVE. Wherever the current code REMOVES or RESETS,
//    this module replaces it by an ADDITION to a second growing structure and
//    reads the DIFFERENCE. That is the whole trick, applied three times:
//      · the queue's "consume"      → `emitted`, remaining = decided − emitted
//      · the drift counter's "reset" → `recalled`, drift = actions − recalled
//      · the refusal's toggle        → `denied`, denied ⇔ denied[d] === recalled[d]
//
// ═══════════════════════════════════════════════════════════════════════
// THE WRITER IDENTITY — MEASURED, NEVER INVENTED
// ═══════════════════════════════════════════════════════════════════════
// 🛑 This repository forbids fabricating an identifier: a hash or an id is
//    MEASURED, and what is not measurable is not an identifier. A G-Counter
//    needs one, so the question is not "what shall we generate" but "what
//    ALREADY distinguishes one writer from another".
// 📐 WHAT WAS FOUND, by reading the writers themselves:
//    · THE LANE — `client.clientLane(process.argv)`, an ARGUMENT that already
//      exists and already decides which memory a shell writes to. It is a
//      CLOSED set of two: the DAEMON (one process, one endpoint) and a SPAWNED
//      shell. That pair is EXACTLY the pair that raced on 2026-08-23.
//    · per-frame, on the gate lane only: `tool_use_id` + `--frame k`, both
//      measured (a harness field and a wiring argument).
// 🔴 WHAT WAS NOT FOUND, STATED AND NOT HIDDEN: there is NO measured identity
//    that separates two concurrent SPAWNED peers writing the same key.
//    `process.pid` was considered and REFUSED: pids are recycled, and a recycled
//    slot in a G-Counter loses the earlier process's contribution SILENTLY —
//    the one failure mode this repository refuses outright.
// 🔑 SO THE IDENTITY IS THE LANE, AND THE CHOICE IS ALSO WHAT BOUNDS THE SPACE.
//    A G-Counter's slot count grows with the number of DISTINCT writers, and
//    there is NO compaction of a slot that preserves commutativity (dropping a
//    slot loses its count; folding cold slots into a base is not idempotent).
//    ⇒ a per-process identity would be a monotone growth with no eviction, i.e.
//    a DATED outage. A closed two-element set has a ceiling BY CONSTRUCTION.
//    Residual, written rather than implied: two spawned peers share a slot and
//    can still lose an update between them — the cross-process lock (kept as a
//    belt) is what serialises that pair, and `WRITERS` is where a third
//    identity would be declared the day one is measured.
// ⚠️ JSDoc IS A VERIFIED CONTRACT HERE (`npm run check:types`), so the three
//    lattices are NAMED rather than described as `object` at each call site: a
//    shape written N times drifts, and the checker cannot read a shape it is
//    not given.
/** @typedef {Record<string, number>} Counter one slot per WRITER, each only grows */
/** @typedef {Record<string, boolean>} GSet a set that only grows */
/** @typedef {Record<string, number>} MaxReg a key -> number map where a value only grows */
/** @typedef {{actions: Counter, seen: GSet, recalled: MaxReg, recalledTurn: MaxReg, denied: MaxReg}} DocSeen */
/** @typedef {{turns: Counter, refused: boolean}} Turns */
/** @typedef {{seq: number, text: string}} DecidedSeg */
/** @typedef {{decided: Record<string, DecidedSeg>, emitted: GSet, emissions: Counter}} Remainder */

const WRITERS = ['daemon', 'spawn'];

// ═══════════════════════════════════════════════════════════════════════
// 🛑 THE SPACE DECLARES ITSELF — CEILINGS AND COMPACTION, IN THE SAME GESTURE
// ═══════════════════════════════════════════════════════════════════════
//
// A set that only grows… GROWS. This machine stays on for YEARS with no
// operator, so monotone growth is not "a big number", it is a DATED outage.
// Every growing structure below therefore declares, HERE, where its bound comes
// from — and a bound is proven by WHAT IT DELETES, never by existing (this fleet
// has already paid a retention targeting `*.tar.gz` while the script produced
// `*.sql.gz`: 0 bytes removed since forever, disk at 87 %).
//
// ① `actions`, `turns`, `emissions` (G-COUNTERS) — bounded by `WRITERS.length`
//    = 2, BY CONSTRUCTION. Not "large": CLOSED. See the writer-identity note.
// ② `seen` / `recalled` / `denied` (doc-seen) — one entry per DOCUMENT of the
//    corpus, so they are bounded by the CORPUS, not by time. A session cannot
//    make them grow past the number of documents that exist.
// ③ `decided` / `emitted` (remainder) — the ONLY pair that grows with TRAFFIC,
//    and the only one with a compaction rule of its own (`compactRemainder`).
// ④ THE SCOPE ITSELF — `MAX_SCOPES` / `MAX_EPHEMERAL` and the LRU by SCOPE in
//    `memory-store-pure.js` are UNCHANGED and remain the outer ceiling.
//    🛑 EVICTION BY SCOPE IS WHAT PRESERVES COMMUTATIVITY: dropping a whole
//    scope drops both sides of every difference at once, so two peers that both
//    evict converge. Evicting one ELEMENT does not: removing a `decided` entry
//    whose `emitted` twin is still there RESURRECTS nothing, but removing an
//    `emitted` entry whose `decided` twin survives re-delivers the document.
//    ⇒ never evict by element, and never age a durable key out.

/**
 * THE COMPACTION RULE, AND IT IS THE ONLY ONE THAT IS SAFE.
 *
 * 🔑 Remove a segment ONLY when it is present in BOTH `decided` AND `emitted`.
 *    The observable is the DIFFERENCE `decided − emitted`; an id in both
 *    contributes NOTHING to it, so dropping it from both leaves the difference
 *    bit for bit unchanged — and it stays unchanged after any later merge,
 *    because a peer that still carries the pair re-adds BOTH halves.
 * 🛑 REMOVING FROM ONE SIDE ONLY IS THE DEFECT. Drop it from `emitted` alone and
 *    the segment is owed again — a document delivered twice, the exact failure
 *    of 2026-08-23. Drop it from `decided` alone and a peer's un-merged
 *    `decided` half revives it. Both halves, or neither.
 * ⚠️ IT RETURNS WHAT IT REMOVED. A cleaner that matches nothing is
 *    indistinguishable from one that works, so the caller — and the test — gets
 *    the NAMES, never a boolean.
 *
 * @param {Remainder} r
 * @returns {{state: Remainder, removed: string[]}}
 */
function compactRemainder(r) {
  const removed = [];
  const decided = {};
  const emitted = {};
  for (const id of Object.keys(r.decided)) {
    if (Object.prototype.hasOwnProperty.call(r.emitted, id)) { removed.push(id); continue; }
    decided[id] = r.decided[id];
  }
  for (const id of Object.keys(r.emitted)) {
    if (Object.prototype.hasOwnProperty.call(r.decided, id)) continue;
    emitted[id] = true;
  }
  return { state: { decided, emitted, emissions: { ...r.emissions } }, removed: removed.sort() };
}

// ═══════════════════════════════════════════════════════════════════════
// THE THREE LATTICE PIECES — nothing else is used anywhere below.
// ═══════════════════════════════════════════════════════════════════════

/**
 * G-COUNTER MERGE — per-slot MAX.
 * ⚠️ MAX and never SUM: a slot holds a writer's ABSOLUTE count, so merging by
 *    addition would double every already-merged contribution. Max is what makes
 *    the merge idempotent, and idempotence is what makes re-merging harmless.
 */
function mergeCounter(a, b) {
  const out = { ...a };
  for (const k of Object.keys(b)) out[k] = Math.max(out[k] === undefined ? 0 : out[k], b[k]);
  return out;
}

/** SUM of the slots — the counter's value. */
function counterValue(c) {
  let n = 0;
  for (const k of Object.keys(c)) n += c[k];
  return n;
}

/**
 * ONE WRITER'S SLOT GOES UP BY ONE.
 * 🛑 A NAMED REFUSAL ON AN UNDECLARED WRITER, never a quiet new slot. An
 *    unbounded set of slots is a monotone growth with no possible compaction,
 *    i.e. a dated outage — and a silent one, since the counter would keep
 *    answering plausible values.
 */
function bumpCounter(c, writer) {
  if (!WRITERS.includes(writer)) {
    throw new Error(`state-crdt: unknown writer "${writer}" — expected ${WRITERS.join(' | ')}`);
  }
  return { ...c, [writer]: (c[writer] === undefined ? 0 : c[writer]) + 1 };
}

/** MAX-REGISTER MERGE — per-key MAX. A value only ever grows. */
function mergeMaxReg(a, b) {
  const out = { ...a };
  for (const k of Object.keys(b)) out[k] = Math.max(out[k] === undefined ? -Infinity : out[k], b[k]);
  return out;
}

/** G-SET MERGE — union. */
function mergeSet(a, b) {
  const out = { ...a };
  for (const k of Object.keys(b)) out[k] = true;
  return out;
}

// ═══════════════════════════════════════════════════════════════════════
// ① `doc-seen-` — what has already been delivered to one agent scope
// ═══════════════════════════════════════════════════════════════════════
//
// 📐 THE REAL SHAPE TODAY (`gate.js`), not the intuitive one: an entry is
//    `{ seen: true, sinceLastCall: n, turn: t, denied?: bool }`. So it is NOT
//    "a set that only grows" — it carries a counter that RESETS and a flag that
//    TOGGLES, and neither of those commutes as written.
// ✅ ALL THREE ARE EXPRESSIBLE AS GROWING STRUCTURES, and the code itself gave
//    the recipe: the `turn` drift unit ALREADY works this way
//    (`since = turnCount - entry.turn` — a monotone counter minus a watermark).
//    The `tool` unit is the SAME quantity written in the non-commutative form.
//      · `seen`          → G-SET.
//      · `sinceLastCall` → `actions` (G-COUNTER of actions in this scope)
//                          minus `recalled[doc]` (MAX-REGISTER watermark).
//      · `denied`        → `denied[doc]` (MAX-REGISTER) equal to `recalled[doc]`
//                          ⇔ the last recall of that doc was a refusal.
// ⚠️ `turn` (the driftUnit-`turn` watermark) is ALSO a max-register and is kept
//    as `recalledTurn`, because the two units measure different clocks.

/** @returns {DocSeen} */
function emptyDocSeen() {
  return { actions: {}, seen: {}, recalled: {}, recalledTurn: {}, denied: {} };
}

/** ONE ACTION HAPPENED IN THIS SCOPE — the monotone clock the drift is read against. */
function bumpAction(s, writer) {
  return { ...s, actions: bumpCounter(s.actions, writer) };
}

/** How many actions this scope has seen — the value the watermarks are compared to. */
function actionCount(s) {
  return counterValue(s.actions);
}

/**
 * A DOCUMENT WAS RECALLED (matched by this gesture), delivered or not.
 *
 * ⚠️ IT WRITES WATERMARKS, IT NEVER RESETS ANYTHING — that is the entire point.
 *    `recalled[doc]` takes the CURRENT action count, so the drift read later is
 *    `actions − recalled[doc]`: zero right now, growing by itself afterwards,
 *    with nobody having to write anything in between.
 * ⚠️ `denied` is written only when the gesture was REFUSED, and it is written to
 *    the SAME value as `recalled`. `isDenied` then compares the two: equal ⇒ the
 *    last thing that happened to this doc was a refusal ⇒ the next one must pass
 *    (the alternation "a block is never followed by a block").
 * @param {DocSeen} s
 * @param {string} docId
 * @param {{denied?: boolean, turn?: number}} [opts]
 */
function recall(s, docId, opts) {
  const o = opts || {};
  const at = actionCount(s);
  const out = {
    ...s,
    seen: { ...s.seen, [docId]: true },
    recalled: mergeMaxReg(s.recalled, { [docId]: at }),
    recalledTurn: Number.isInteger(o.turn)
      ? mergeMaxReg(s.recalledTurn, { [docId]: o.turn })
      : s.recalledTurn,
    denied: o.denied === true ? mergeMaxReg(s.denied, { [docId]: at }) : s.denied,
  };
  return out;
}

/** Has this document ever been delivered in this scope? */
function isSeen(s, docId) {
  return s.seen[docId] === true;
}

/**
 * THE DRIFT, IN THE `tool` UNIT — actions elapsed since the last recall.
 * ⚠️ A DOCUMENT NEVER RECALLED HAS A DRIFT OF ZERO, exactly like `gate.js`
 *    (`entry ? entry.sinceLastCall : 0`). It is the ABSENCE of an entry that the
 *    engine reads as zero, never a stored zero — same here.
 */
function drift(s, docId) {
  return s.recalled[docId] === undefined ? 0 : actionCount(s) - s.recalled[docId];
}

/** THE DRIFT, IN THE `turn` UNIT — `turnCount − entry.turn`, unchanged. */
function driftTurns(s, docId, turnCount) {
  return s.recalledTurn[docId] === undefined ? 0 : turnCount - s.recalledTurn[docId];
}

/** Was the LAST recall of this document a refusal? (the anti-loop alternation) */
function isDenied(s, docId) {
  return s.denied[docId] !== undefined && s.denied[docId] === s.recalled[docId];
}

function mergeDocSeen(a, b) {
  return {
    actions: mergeCounter(a.actions, b.actions),
    seen: mergeSet(a.seen, b.seen),
    recalled: mergeMaxReg(a.recalled, b.recalled),
    recalledTurn: mergeMaxReg(a.recalledTurn, b.recalledTurn),
    denied: mergeMaxReg(a.denied, b.denied),
  };
}

// ═══════════════════════════════════════════════════════════════════════
// ② `turn-count-` — the conversation-turn counter (driftUnit `turn`)
// ═══════════════════════════════════════════════════════════════════════
//
// 📐 REAL SHAPE TODAY (`turn-core.bump`, `turn-count.js`): `{ turns: n }` plus a
//    `refused: true` flag that says "the kernel refusal has already been
//    announced in this context".
// ✅ `turns` → G-COUNTER (value = sum). `refused` → a monotone flag, i.e. a
//    one-element G-SET: it is set once and never cleared inside a context (the
//    PreCompact purge is what clears it, by destroying the whole record).

/** @returns {Turns} */
function emptyTurns() {
  return { turns: {}, refused: false };
}

function bumpTurn(s, writer) {
  return { turns: bumpCounter(s.turns, writer), refused: s.refused };
}

function turnValue(s) {
  return counterValue(s.turns);
}

/** ⚠️ MONOTONE: `false → true` only. A flag that could go back down would not commute. */
function noteRefusal(s) {
  return { turns: s.turns, refused: true };
}

function mergeTurns(a, b) {
  return { turns: mergeCounter(a.turns, b.turns), refused: a.refused === true || b.refused === true };
}

// ═══════════════════════════════════════════════════════════════════════
// ③ `remainder-` — the queue of segments decided but not yet emitted
// ═══════════════════════════════════════════════════════════════════════
//
// 📐 REAL SHAPE TODAY (`emission-core.js`): `{ segments: [...], emissions: n }`.
//    `segments` is an ORDERED LIST that is READ, rewritten whole, and shrunk as
//    content goes out. **Removing from a list is never commutative** — this is
//    the one real difficulty of the three, and it is the key that lost 209
//    updates out of 800.
// ✅ THE FORM THAT COMMUTES, and it is the operator's own lead, VALIDATED here:
//    "consumed" stops being a REMOVAL and becomes an ADDITION to a second
//    growing set. Two G-structures, so two commuting operations, and deletion
//    no longer exists anywhere:
//      · `decided` — id → { seq, text }, add-only.
//      · `emitted` — id → true, add-only.
//      · remaining = `decided` MINUS `emitted`.
//    Whatever order the two writers' operations arrive in, both sets end up
//    identical, hence so does their difference.
// 🛑 ORDER MUST CONVERGE TOO, or two peers would deliver the same queue in two
//    orders and RFC 6455's "never interleaved" would break. The order is
//    `(seq, id)` — `seq` is a number the CALLER supplies (its insertion index)
//    and `id` is the tie-break, so the order is a TOTAL order computed from the
//    data alone: no clock, no arrival order, no writer.
// ⚠️ WHERE THE BOUNDARY IS: the per-document dedup (`budget.orderSegments`,
//    `baseId`) stays exactly where it is. This structure answers "which segments
//    are still owed, in what order", nothing else — a second implementation of
//    the dedup would be a second truth about one rule.

/** @returns {Remainder} */
function emptyRemainder() {
  return { decided: {}, emitted: {}, emissions: {} };
}

/**
 * SEGMENTS WERE DECIDED — they are owed until they are emitted.
 * ⚠️ IDEMPOTENT BY KEY: re-deciding an id already present changes nothing, which
 *    is what makes a replay of the same gesture harmless. On a conflict the
 *    LOWER `seq` wins, then the lexicographically smaller text — a rule computed
 *    from the values, so two peers resolve it the same way with no coordination.
 * @param {Remainder} r
 * @param {{id: string, text: string, seq: number}[]} segments
 */
function decideSegments(r, segments) {
  const decided = { ...r.decided };
  for (const s of segments) {
    const prev = decided[s.id];
    const candidate = { seq: s.seq, text: s.text };
    if (prev === undefined || candidate.seq < prev.seq || (candidate.seq === prev.seq && candidate.text < prev.text)) {
      decided[s.id] = candidate;
    }
  }
  return { decided, emitted: r.emitted, emissions: r.emissions };
}

/**
 * SEGMENTS WENT OUT.
 * ⚠️ AN ID MAY BE MARKED EMITTED BEFORE IT IS KNOWN AS DECIDED — that is not a
 *    defect, it is what makes the two halves independent, hence commutative. The
 *    difference is computed at READ time, so the two facts may arrive in any
 *    order.
 */
function emitSegments(r, ids) {
  const emitted = { ...r.emitted };
  for (const id of ids) emitted[id] = true;
  return { decided: r.decided, emitted, emissions: r.emissions };
}

/**
 * THE COUNTER THE CANARY USES AS A DENOMINATOR — a G-COUNTER, one slot per lane.
 * ⚠️ Same rule as today: it counts only the passes where content really left.
 */
function countEmission(r, writer) {
  return { decided: r.decided, emitted: r.emitted, emissions: bumpCounter(r.emissions, writer) };
}

function emissionValue(r) {
  return counterValue(r.emissions);
}

/**
 * WHAT IS STILL OWED, IN ORDER — `decided` minus `emitted`, sorted by `(seq, id)`.
 * 🛑 THE ONLY OBSERVABLE OF THIS STRUCTURE. Everything commutativity has to
 *    preserve is preserved here and nowhere else, which is why the compaction
 *    rule is stated as "the DIFFERENCE is unchanged".
 */
function remaining(r) {
  const ids = Object.keys(r.decided).filter((id) => r.emitted[id] !== true);
  // 🛑 EQUIVALENT-MUTANT NOTE, resolved by REMOVAL, never by a pinning test:
  //    `ids` comes from `Object.keys`, whose entries are UNIQUE by construction
  //    — `x === y` can never fire, so a third ("equal") branch on the id
  //    tie-break is DEAD CODE, indistinguishable from a two-way comparator on
  //    every reachable input. The two-way form below is the whole comparator.
  ids.sort((x, y) => {
    const dx = r.decided[x];
    const dy = r.decided[y];
    if (dx.seq !== dy.seq) return dx.seq - dy.seq;
    // Stryker disable next-line EqualityOperator: EQUIVALENT mutant, PROVEN —
    // `x <= y` vs `x < y` differ ONLY when `x === y`, which never happens here
    // (ids are Object.keys entries, unique by construction, re-proven above).
    // For any x !== y, `x <= y` and `x < y` return the identical boolean, so
    // this mutant produces byte-identical output on every reachable input —
    // there is no test that could ever kill it without pinning dead ground.
    return x < y ? -1 : 1;
  });
  return ids.map((id) => ({ id, text: r.decided[id].text }));
}

function mergeRemainder(a, b) {
  const decided = { ...a.decided };
  for (const id of Object.keys(b.decided)) {
    const prev = decided[id];
    const candidate = b.decided[id];
    if (prev === undefined || candidate.seq < prev.seq || (candidate.seq === prev.seq && candidate.text < prev.text)) {
      decided[id] = candidate;
    }
  }
  return {
    decided,
    emitted: mergeSet(a.emitted, b.emitted),
    emissions: mergeCounter(a.emissions, b.emissions),
  };
}

module.exports = {
  WRITERS,
  // lattice pieces
  mergeCounter, counterValue, bumpCounter, mergeMaxReg, mergeSet,
  // ① doc-seen
  emptyDocSeen, bumpAction, actionCount, recall, isSeen, drift, driftTurns, isDenied, mergeDocSeen,
  // ② turn-count
  emptyTurns, bumpTurn, turnValue, noteRefusal, mergeTurns,
  // ③ remainder
  emptyRemainder, decideSegments, emitSegments, countEmission, emissionValue, remaining,
  mergeRemainder, compactRemainder,
};
