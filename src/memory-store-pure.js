// ═══════════════════════════════════════════════════════════════════════
// MEMORY-STORE-PURE — the DECISIONS of a daemon's state. Zero I/O.
// ═══════════════════════════════════════════════════════════════════════
//
// 🛑 EXTRACTED FROM `memory-store.js` ON PURPOSE (2026-08-20), and the reason is
//    the house rule that has already bitten here: a decision buried inside an
//    I/O shell is a decision NOBODY MUTATES — Stryker never touches an I/O file
//    (equivalent mutants guaranteed), so the LRU, the ceiling and the shape
//    validation would have shipped measured by nothing. `scope-reach-pure.js`
//    was born the same way, and it was `/stack-audit` that found it.
// ⚠️ WHAT LIVES HERE: everything that DECIDES — which key wins, which scope is
//    evicted, what a snapshot is allowed to contain. What lives next door:
//    reading and writing the file, and nothing else.
// ⚠️ A `Map`, never a plain object: insertion order is part of the contract (it
//    IS the LRU, with no second structure), and a session id is arbitrary text
//    from a harness — on an object, `__proto__` is not a key but an assignment
//    to the prototype.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

// 🛑 A CEILING IN THE SAME GESTURE AS THE WRITER — the space doctrine, applied
//    to RAM. A daemon runs for weeks and no payload ever says "this session is
//    over". Unbounded growth is not "a big number", it is a DATED outage.
// ⚠️ THE BOUND IS A COUNT, NEVER AN INFERENCE ABOUT DEATH. We do not guess that
//    a session ended — that is undecidable from here, and guessing it is what
//    this whole refactor removes. We keep the N most recently used and drop the
//    coldest: no clock, no liveness probe, nothing to tune.
// ⚠️ Eviction hits the LEAST RECENTLY USED — by construction the scope nobody
//    has touched. Losing one costs at most one extra delivery.
// 🔴 THIS LINE READ "512: far above any real fleet use" UNTIL 2026-08-21, AND IT
//    WAS WRITTEN BEFORE THE SIZING WAS STATED. The target is HUNDREDS of
//    parallel agents; the number, and above all the single shared ceiling, were
//    sized for a handful. A comment that reassures about a figure nobody
//    re-derived is exactly how a limit ships unnoticed — the arithmetic now
//    lives below, in the open, so the next reader can refute it.
const MAX_SCOPES = 4096;

// 🔴 TWO CLASSES OF KEY, TWO LIFETIMES — AND MIXING THEM IN ONE LRU IS A DEFECT
//    THE MAINTAINER'S SIZING EXPOSED (2026-08-21). The target is **hundreds of
//    parallel agents**, and the keys of this map do not age alike:
//      · DURABLE (`doc-seen-`, `turn-count-`, `remainder-`) — one per agent
//        scope, alive as long as that agent is. Losing one costs a re-delivery.
//      · EPHEMERAL (`plan-`) — one per tool INVOCATION, useful only while the
//        frames of that single action are running. Measured on the live install:
//        **544 of 615 state files (88 %) were plans.**
//    With a single ceiling, the ephemeral flood EVICTS THE DURABLE: one busy
//    agent would erase every other agent's memory in a few hundred tool calls,
//    and each eviction re-delivers a `once`. Silent, and it scales with the very
//    thing we are sizing for.
// ⚠️ 🛑 THE FIX IS A CEILING PER CLASS, never a bigger number: growth of one
//    class must not be payable by the other. Arithmetic, written so it can be
//    re-checked: 3 durable keys per agent ⇒ 4096 ≈ **1300 simultaneous agents**;
//    plans die within their action, so 2048 covers far more concurrent
//    invocations than a fleet can have in flight. Order of magnitude of the
//    memory held: a few MB. If you change a number, change this paragraph.
const PREFIXE_EPHEMERE = 'plan-';
const MAX_EPHEMERAL = 2048;

// ═══════════════════════════════════════════════════════════════════════
// HOW OFTEN THE SNAPSHOT IS WRITTEN — a COUNT, and the daemon's CLEAN EXIT.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 THE DEFECT, MEASURED 2026-08-21 AND IT SURFACED AS A TEST TIMEOUT, NOT AS A
//    DESIGN REVIEW — which is the honest way to say nobody had measured it. The
//    shell rewrote the WHOLE snapshot on EVERY state write: O(total state) of
//    disk per tool call. Invisible while the ceiling was 512; at the sizing this
//    project targets (hundreds of parallel agents, ceilings 4096 + 2048) it is
//    megabytes written per action, on a machine with an open work item on SSD
//    wear.
//
// 🛑 TWO AUTHORITIES, NOT ONE, AND NEITHER IS A CLOCK.
//    ① a COUNT of mutations (`persistTick`) — a FACT this module owns;
//    ② the daemon's own CLEAN EXIT (`shouldFlush`) — an EVENT the runtime tells
//       us about.
//    A count ALONE still writes far too often for nothing at low traffic. A
//    clean exit ALONE loses everything on `kill -9`, and this daemon is killed
//    on purpose every time its code changes (`watchOwnCode` ⇒ exit 90). TOGETHER
//    the worst case is bounded and small.
// 🛑 NO TIMER, EVER — no `setInterval` flush, no debounce, no TTL. A temporal
//    call is detected by AST here and the budget admits only `distant` and
//    `undecidable` as motives; neither fits a count the process itself holds.
//
// 🛑 WHAT THE PROVEN PROPERTY BECOMES, SAID PLAINLY. It was *"the state survives
//    a restart"*. It is now *"the state survives a CLEAN restart ENTIRELY, and a
//    `kill -9` loses at most the last N mutations"*. **Losing a mutation costs at
//    most a RE-DELIVERY of a document — never a wrong action, never a corrupt
//    state.** That is the whole reason this trade is acceptable, and it is the
//    same cost the architecture already accepts in three other places (LRU
//    eviction, a fail-open corrupt snapshot, a lock-less local decision).
//
// ⚠️ N = 64, AND HERE IS THE ARITHMETIC, WRITTEN SO IT CAN BE REFUTED.
//    · LOWER BOUND — N must exceed the mutations of ONE action, or nothing is
//      fixed. The wiring declares **16 frames per tool call**, each able to
//      mutate the state; add the turn counter and the remainder queue. Any N
//      below ~20 still writes at least one full snapshot per action, i.e. the
//      defect intact with extra code. ⇒ N > 16.
//    · UPPER BOUND — the loss window. A `kill -9` loses at most N−1 = **63**
//      mutations, hence at most 63 documents delivered once more. Measured on the
//      live install, the whole state was **615 entries**: 63 is ~10 % of it, so
//      the worst case is a tenth of one machine's memory re-delivered ONCE, never
//      the memory itself. At N = 1024 the same crash would re-deliver up to 1023
//      documents — an entire session's knowledge budget, which stops being "one
//      extra delivery" and becomes a visible flood.
//    · WHAT IT BUYS — the amortised disk cost per mutation drops from S to S/64
//      (S = the whole snapshot). That is the same factor as putting the write
//      path back at the scale it was silently sized for.
//    ⚠️ 64 is not a round number chosen for looking nice: it is the power of two
//      inside [17, 1023] that sits furthest from BOTH bounds. If you move it,
//      rewrite this paragraph — a number nobody re-derives is how a limit ships
//      unnoticed, and this module has already paid that bill once (`512: far
//      above any real fleet use`).
const PERSIST_EVERY = 64;

/**
 * AUTHORITY ①: THE COUNT. One mutation happened — must the snapshot be written
 * NOW, and what is the new backlog?
 * ⚠️ PURE ON PURPOSE, and that is not cosmetic: Stryker never mutates the I/O
 *    shell, so this rule written next door would ship measured by NOTHING.
 * ⚠️ The counter RESETS on a write, it does not wrap: the backlog is "mutations
 *    NOT yet on disk", so after a write there are none by definition.
 * @param {number} pending mutations not yet written
 * @param {number} every the N above
 * @returns {{pending: number, persist: boolean}}
 */
function persistTick(pending, every) {
  const n = pending + 1;
  if (n >= every) return { pending: 0, persist: true };
  return { pending: n, persist: false };
}

/**
 * AUTHORITY ②: THE CLEAN EXIT. Is there anything the count had not yet flushed?
 * 🛑 A FLUSH WITH AN EMPTY BACKLOG MUST NOT WRITE. Writing anyway would put back
 *    one full O(total state) write on a path that runs on every stale-code exit —
 *    i.e. ten times in two minutes while an agent edits this repository.
 * @param {number} pending mutations not yet written
 * @returns {boolean}
 */
function shouldFlush(pending) {
  return pending > 0;
}

/** @param {string} k */
function isEphemeral(k) {
  return k.startsWith(PREFIXE_EPHEMERE);
}

/** @param {string} prefix @param {string} sessionId */
function key(prefix, sessionId) {
  return `${prefix}${sessionId}`;
}

/** @returns {{durable: Map<string,object>, ephemere: Map<string,object>}} */
function createState() {
  return { durable: new Map(), ephemere: new Map() };
}

/**
 * 🛑 TWO MAPS, AND THE REASON IS A COST, NOT A TASTE. A first version kept ONE
 *    map and walked it to enforce a budget per class — which made EVERY WRITE
 *    scan the whole state, i.e. a quadratic write path. It was caught the same
 *    hour by two cells timing out at 4096 entries, and it is exactly the "and at
 *    10,000?" defect this house forbids. Two maps give each class its own LRU,
 *    and eviction is back to deleting the first key: constant, amortised.
 * @param {{durable: Map<string,object>, ephemere: Map<string,object>}} etat
 * @param {string} k
 */
function mapFor(etat, k) {
  return isEphemeral(k) ? etat.ephemere : etat.durable;
}

/** @param {{durable: Map, ephemere: Map}} etat */
function set(etat, k, v) {
  const m = mapFor(etat, k);
  // ⚠️ DELETE THEN SET — insertion order IS the LRU, so re-writing an existing
  //    key must move it to the young end, never leave it where it was.
  m.delete(k);
  m.set(k, v);
}

/** @param {{durable: Map, ephemere: Map}} etat */
function size(etat) {
  return etat.durable.size + etat.ephemere.size;
}

/** @param {{durable: Map, ephemere: Map}} etat */
function keys(etat) {
  return [...etat.durable.keys(), ...etat.ephemere.keys()];
}

/** @param {{durable: Map, ephemere: Map}} etat */
function entries(etat) {
  return [...etat.durable, ...etat.ephemere];
}

/**
 * ONE CLASS, ONE LRU — deleting the first key is the whole algorithm.
 * @param {Map<string, object>} m
 * @param {number} plafond
 */
function elaguer(m, plafond) {
  let retires = 0;
  while (m.size > plafond) { m.delete(m.keys().next().value); retires += 1; }
  return retires;
}

/**
 * @param {{durable: Map, ephemere: Map}} etat
 * @param {number} max ceiling of the DURABLE class (one per agent scope)
 * @param {number} [maxEphemeral] ceiling of the EPHEMERAL class (one per invocation)
 */
function evict(etat, max, maxEphemeral) {
  const plafondEphemere = maxEphemeral === undefined ? MAX_EPHEMERAL : maxEphemeral;
  // `Map.keys()` yields in insertion order, so the first key IS the coldest.
  // ⚠️ TWO EXPLICIT CALLS rather than a loop over pairs: a `[Map, number]` tuple
  //    widens to `number | Map` for the type checker, which then refuses
  //    `.delete` on it. The loop was prettier and untypable — and a contract the
  //    checker cannot read is a contract nobody enforces.
  return elaguer(etat.durable, max) + elaguer(etat.ephemere, plafondEphemere);
}

/**
 * READ = A USE. Re-inserting moves the entry to the young end.
 * ⚠️ Without this, the BUSIEST session is the one evicted: it is read at every
 *    action but rewritten only when something changes, so a pure write-order
 *    LRU would rank it as cold. Measured intent, not a refinement.
 */
function touch(etat, k) {
  const m = mapFor(etat, k);
  const v = m.get(k);
  if (v === undefined) return undefined;
  m.delete(k);
  m.set(k, v);
  return v;
}

/**
 * WHAT A SNAPSHOT IS ALLOWED TO CONTAIN.
 * 🛑 `JSON.parse` succeeding is NOT the guardrail — a perfectly valid JSON can
 *    carry an object where an array is expected, or a pair that is not a pair.
 *    The SHAPE check is the guardrail, and it is fail-open: what does not
 *    conform is DROPPED, never thrown. A corrupt save costs one extra
 *    delivery; a daemon refusing to start would cost the fleet its injection.
 * @param {unknown} brut
 * @param {{durable: Map, ephemere: Map}} etat
 * @param {number} max
 * @param {number} [maxEphemeral]
 */
function adopt(brut, etat, max, maxEphemeral) {
  if (!Array.isArray(brut)) return 0;
  for (const paire of brut) {
    if (!Array.isArray(paire) || paire.length !== 2) continue;
    const [k, v] = paire;
    if (typeof k !== 'string' || !v || typeof v !== 'object' || Array.isArray(v)) continue;
    set(etat, k, v);
  }
  evict(etat, max, maxEphemeral);
  return size(etat);
}

/**
 * PURGE BY PREFIX — what a compaction means: the real context was emptied, so
 * the memory of what was injected before no longer describes anything.
 * ⚠️ It is an ORDER received from the harness (an EVENT), never a deduction
 *    made here about a session being over.
 */
function purge(etat, prefixeCle) {
  let n = 0;
  // ⚠️ BOTH CLASSES, ALWAYS. A compaction empties the real context: leaving the
  //    plans of that scope behind would keep a memo of an action whose context
  //    no longer exists — and forgetting one map is the silent half of a purge.
  for (const m of [etat.durable, etat.ephemere]) {
    for (const k of [...m.keys()]) if (k.startsWith(prefixeCle)) { m.delete(k); n += 1; }
  }
  return n;
}

module.exports = {
  key, createState, mapFor, set, size, keys, entries,
  evict, touch, adopt, purge, isEphemeral,
  persistTick, shouldFlush,
  MAX_SCOPES, MAX_EPHEMERAL, PREFIXE_EPHEMERE, PERSIST_EVERY,
};
