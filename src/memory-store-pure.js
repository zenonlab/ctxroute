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
  MAX_SCOPES, MAX_EPHEMERAL, PREFIXE_EPHEMERE,
};
