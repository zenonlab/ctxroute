// ═══════════════════════════════════════════════════════════════════════
// INVOCATION SNAPSHOT — the arrival order survives the daemon's death
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 WHY THIS EXISTS, MEASURED IN PRODUCTION 2026-09-19, ON THE OPERATOR'S OWN
//    CONVERSATIONS. This daemon dies BY DESIGN at every delivery of new code
//    (`process.exit(90)`), and the accepted criterion is that a restart is
//    invisible from the agent's point of view. It is not, for an invocation IN
//    FLIGHT. Two states were conflated and only one of them survived:
//      · `doc-seen-` says WHICH documents were delivered — disk, write-through,
//        it survives, and that half was proven;
//      · the three invocation tables say WHICH CHUNK the k-th arriving frame
//        serves — RAM, and they die with the process.
//    So a restart keeps every document marked seen AND resets the arrival
//    counter: the frames landing afterwards are counted as the FIRST and
//    re-serve chunk 1. **The document is not re-decided; the CHUNK is
//    re-served**, which the agent sees as its skill arriving a second time in
//    the middle of a conversation.
//
// 🛑 THE COST IS PAID AT DEATH, NEVER IN SERVICE — that is the whole reason
//    this shape was chosen over the alternatives. Writing these tables on every
//    frame would be 32 disk writes per action on a machine whose SSD wear is a
//    declared budget, and it was refused for that. One write while the process
//    is exiting costs a serving daemon exactly nothing.
// 🛑 AND IT IS THEREFORE NOT A DEVELOPMENT FEATURE. A guard against a
//    PRODUCTION defect that only runs in development protects the machine where
//    the defect does not matter. The operator's development-mode switch is for
//    what costs CONTINUOUSLY (the freshness check on every action); this costs
//    once, at the end.
//
// 🔑 WHICH DEATHS THIS COVERS, AND IT IS THE FREQUENT ONE: `process.exit(90)`
//    fires `'exit'`, so the stale-code restart — every code delivery, the death
//    that bit the operator today — is fully covered. `SIGKILL` and a power loss
//    are not, by definition, and that residual is BOUNDED: it costs exactly what
//    happens today, a re-served opening chunk, on a death that is rare instead
//    of routine.
//
// 🛑 PURE, AND THAT IS NOT A STYLE CHOICE. Stryker does not mutate an I/O shell,
//    so a fail-open written next door would ship measured by nothing — and a
//    fail-open that silently adopts garbage is how a snapshot poisons the very
//    state it exists to preserve.

'use strict';

const frameSequencer = require('./frame-sequencer-pure');

/**
 * 🛑 THE SHAPE IS VERSIONED, AND AN UNKNOWN VERSION IS REFUSED RATHER THAN
 *    GUESSED. These tables carry the arrival order of live invocations: adopting
 *    a shape this code does not understand would not "lose a little", it would
 *    make the sequencer serve the wrong chunk to a real agent. Refusing costs
 *    exactly what today costs — a fresh table — which is the failure we already
 *    accept.
 */
const VERSION = 1;

/** The three tables, named ONCE so encode and decode cannot drift apart. */
const TABLES = ['sequencer', 'notice', 'carryover'];

/**
 * ⚠️ THE CEILING IS IMPORTED, NEVER RETYPED. The tables are already bounded for
 *    life at `MAX_INVOCATIONS` and evicted least-recently-touched; a snapshot
 *    that could hold more would let a file grow past the memory it restores
 *    into — the space defect this repository declares for every writer.
 */
const MAX = frameSequencer.MAX_INVOCATIONS;

/**
 * Turns the three live tables into something `JSON.stringify` accepts.
 *
 * ⚠️ A `Map` serialises to `{}` — silently. That is why the entries are spread
 *    into arrays here rather than handed to the caller's `JSON.stringify`: the
 *    failure mode of forgetting is an EMPTY snapshot that looks perfectly valid,
 *    restores nothing, and reproduces the exact defect this module closes.
 * @param {{sequencer?: Map<string, any>, notice?: Map<string, any>, carryover?: Map<string, any>}} states
 * @returns {{v: number, sequencer: Array, notice: Array, carryover: Array}}
 */
function encode(states) {
  const out = /** @type {any} */ ({ v: VERSION });
  for (const name of TABLES) {
    const table = states && states[name];
    // ⚠️ KEEP THE MOST RECENT, NEVER THE FIRST: these tables are LRU-ordered by
    //    insertion, so the tail is what is still in flight — which is precisely
    //    what a restart must not lose. Truncating the head would preserve the
    //    invocations that no longer matter.
    const entries = table instanceof Map ? [...table.entries()] : [];
    // Stryker disable next-line ConditionalExpression,EqualityOperator: EQUIVALENT mutants,
    //    and the test STAYS. At or under the ceiling `slice(length - MAX)` takes a negative or
    //    zero start, which keeps EVERY entry — the same array either branch yields. 🛑 KEPT
    //    rather than rewritten as `slice(-MAX)`: the branch says the ceiling out loud, and a
    //    removal is mandated, never discovered by a score. Cells ⑤ and ⑨ pin both sides.
    out[name] = entries.length > MAX ? entries.slice(entries.length - MAX) : entries;
  }
  return out;
}

/**
 * Rebuilds the three tables from a parsed snapshot.
 *
 * 🛑 FAIL-OPEN TO EMPTY, ALWAYS, AND NEVER HALFWAY. Anything unreadable, of an
 *    unknown version, or not shaped as entries yields THREE EMPTY tables — never
 *    two good ones and a broken third, which would make the sequencer and the
 *    carryover disagree about the same invocation. Empty is exactly today's
 *    behaviour, i.e. the worst case we already live with.
 * @param {unknown} raw the parsed snapshot, or anything at all
 * @returns {{sequencer: Map<string, any>, notice: Map<string, any>, carryover: Map<string, any>}}
 */
function decode(raw) {
  const empty = () => ({ sequencer: new Map(), notice: new Map(), carryover: new Map() });
  if (!raw || typeof raw !== 'object') return empty();
  const src = /** @type {any} */ (raw);
  if (src.v !== VERSION) return empty();

  const built = /** @type {any} */ ({});
  for (const name of TABLES) {
    const entries = src[name];
    if (!Array.isArray(entries)) return empty();
    const table = new Map();
    for (const pair of entries) {
      // ⚠️ A key that is not a string, or a pair that is not a pair, means the
      //    file was not written by this code. One bad entry condemns the whole
      //    snapshot rather than being skipped: a partially adopted table is a
      //    table nobody can reason about.
      if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string') return empty();
      // 🔴 THE THREE TABLES DO NOT HOLD THE SAME SHAPE, AND ASSUMING THEY DID
      //    MADE THIS MODULE REFUSE ITS OWN SNAPSHOT — caught 2026-09-19 by the
      //    cell that drives the REAL sequencer, after five cells built on a
      //    FABRICATED fixture had passed. `frame-sequencer-pure` stores a plain
      //    NUMBER (the count of arrivals); `delivery-notice-pure` and
      //    `carryover-pure` store records. A check written for "an object" would
      //    have rejected every real snapshot, silently, and the daemon would have
      //    restarted with empty tables exactly as before — a fix that ships
      //    INERT, which is this repository's oldest failure shape.
      // 🛑 SO THE TEST OF A VALUE IS WHAT IT MUST NOT BE: absent, or a form no
      //    table of ours ever writes. A finite number and a record both pass; a
      //    string, a null and a NaN do not.
      const value = pair[1];
      const isRecord = typeof value === 'object' && value !== null;
      // Stryker disable next-line ConditionalExpression: EQUIVALENT on this line only, and the
      //    guard STAYS. `typeof value === 'number'` → `true`: `Number.isFinite` never coerces
      //    (ECMAScript: false for anything whose type is not Number), so no value tells them
      //    apart. 🛑 KEPT: it is the explicit type guard of a decode that reads anything at all.
      //    `Number.isFinite(value)` → `true`, silenced here too, is pinned by cell ⑧ (NaN,
      //    Infinity), seen red by hand.
      const isCount = typeof value === 'number' && Number.isFinite(value);
      const usable = isRecord || isCount;
      if (!usable) return empty();
      table.set(pair[0], pair[1]);
      if (table.size > MAX) return empty();
    }
    built[name] = table;
  }
  return built;
}

/**
 * Copies restored entries INTO the live tables, in place.
 *
 * 🛑 IN PLACE, BECAUSE THE CALLER ALREADY HANDED THESE MAPS TO EVERY SOCKET.
 *    `main` builds the three tables once and passes them to every `createServer`
 *    of the port lane — that sharing is what closed the 2026-09-19 duplication
 *    defect, where one table per socket re-served chunks 1..8 four times each.
 *    Replacing a table with a new object here would hand the servers a map
 *    nobody writes to and rebuild that defect from the other end.
 * @param {{sequencer?: Map, notice?: Map, carryover?: Map}} live
 * @param {{sequencer: Map, notice: Map, carryover: Map}} restored
 * @returns {number} how many entries were adopted, across all three tables
 */
function adopt(live, restored) {
  let n = 0;
  for (const name of TABLES) {
    const target = live && live[name];
    const source = restored && restored[name];
    if (!(target instanceof Map) || !(source instanceof Map)) continue;
    for (const [k, v] of source) { target.set(k, v); n += 1; }
  }
  return n;
}

module.exports = { encode, decode, adopt, VERSION, TABLES, MAX };
