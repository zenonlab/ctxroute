// ═══════════════════════════════════════════════════════════════════════
// thread-channel-pure.js — THE WIRE BETWEEN A SERVER THREAD AND THE OWNER.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 WHY A WIRE AT ALL, AND THE FACT THAT FORCED IT (measured 2026-09-19).
//    A `Map` handed to a worker thread is **COPIED, NEVER SHARED**: the worker
//    writes an entry and the main thread never sees it, each thread owning its
//    own V8 isolate. Only a `SharedArrayBuffer` crosses. So the three
//    invocation tables — whose whole premise is *one authority sees every
//    connecting request of one invocation* — cannot simply be passed around.
//    One thread OWNS them and the others ASK. This file is the asking.
//
// 🛑 THE ASKING IS SYNCHRONOUS, AND THAT IS NOT A STYLE CHOICE. `pretool-core`
//    calls `carryover.pendingFor` INSIDE `withLock`, and `lock.js` BUSY-WAITS:
//    an asynchronous round trip there would let one request hold the lock while
//    another spins for the whole deadline — a self-deadlock that reads as a
//    slow daemon. A blocking futex round trip keeps the critical section short
//    and synchronous, which is the only shape that section admits.
//
// 📐 MEASURED BEFORE BEING CHOSEN (three concordant passes, Windows, Node
//    22.15.1): a table operation IN LINE costs 39-71 ns · a synchronous
//    round trip between two threads costs **1.48 / 1.65 / 1.57 µs** · ONE
//    acquisition of the cross-process lock costs **~1,300 µs**. A round trip is
//    therefore ~800× cheaper than a lock this daemon already pays, and routing
//    every table operation of a whole action (32 frames × 3 operations) costs
//    **0.15 ms against an action's ~133 ms — 0.11 %**.
//
// 🔴 THE TRAP THIS FILE EXISTS TO MAKE UNBUILDABLE — PAID FOR BY A PROBE THAT
//    HUNG FOR TEN MINUTES ON 0.4 s OF CPU. A bare `Atomics.wait(view, i,
//    expected)` blocks FOR EVER on a single missed wake-up: the value it was
//    told to expect changed before it went to sleep, so the notify it was
//    waiting for had already happened. ✅ **THE CORRECT IDIOM IS A BOUNDED WAIT
//    INSIDE A LOOP THAT RE-CHECKS THE VALUE.** The bound is NOT a delay and it
//    optimises nothing: it turns *"I was not woken"* into *"look again"* rather
//    than into a freeze. Whether a wake-up that has not arrived ever will is
//    the halting question — hence the `undecidable` motive in
//    `temporal-budget.json`, declared in the same gesture as this file.
//
// 🛑 THE OWNER IS NEVER THE MAIN THREAD. If it were, a blocked server thread
//    would be waiting for the main thread's EVENT LOOP to reach its message —
//    a whole turn of the loop, not a futex wake — and the main loop is exactly
//    what this design exists to get off the critical path.
//
// ⚠️ THIS MODULE IS PURE: it owns the LAYOUT and the DECISIONS (which slot,
//    which offset, does this payload fit, should the wait go round again). It
//    performs no `Atomics` call, opens no buffer and knows no worker. That is
//    what makes every one of those decisions mutation-testable, which none of
//    them would be inside a shell.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

// ── THE CONTROL WORD OF EVERY EXCHANGE ────────────────────────────────
/** Nobody is asking anything on this slot. */
const IDLE = 0;
/** A request is posted in this slot's payload region; the owner must answer. */
const REQUEST = 1;
/** The owner answered; the payload region holds the result. */
const RESPONSE = 2;
/** The owner refused or threw; the payload region holds the reason. */
const FAILURE = 3;

// ── THE FIXED HEAD OF THE CONTROL ARRAY ───────────────────────────────
/**
 * The doorbell. A client bumps it AFTER posting, so the owner has exactly one
 * address to sleep on however many clients exist.
 *
 * 🔑 ONE DOORBELL AND NOT ONE WAIT PER CLIENT, because `Atomics.wait` sleeps on
 *    ONE address: an owner waiting per client would have to poll, and polling
 *    is the busy loop this whole design avoids.
 */
const DOORBELL = 0;
/**
 * Bumped by the owner whenever a WRITE makes a cached read stale.
 *
 * 🔑 THIS IS WHAT LETS A CLIENT MEMOISE A READ WITHOUT OWNING ANYTHING. A
 *    client may serve a value it fetched earlier only while this number has not
 *    moved; any write, by any thread, moves it. The cache therefore fails
 *    towards a round trip — never towards a second memory, which is the defect
 *    this whole architecture exists to remove.
 */
const GENERATION = 1;
/** Set to 1 to tell the owner to return. Read on every loop turn. */
const SHUTDOWN = 2;
/**
 * Set to 1 by the owner once it has SAVED what must cross the death.
 *
 * 🔴 WITHOUT IT A CLEAN STOP LOSES THE ARRIVAL ORDER, and it would look exactly
 *    like a clean stop. `process.exit` kills a worker outright — no `exit`
 *    event, no `finally` — so a main thread that asked the owner to stop and
 *    left immediately would kill it mid-save, on every SIGTERM. The invocations
 *    in flight would then have their opening chunks re-served, which is the
 *    defect measured on 2026-09-19, reintroduced by the shutdown path.
 * ⚠️ WAITING ON IT IS BOUNDED AND RE-CHECKS, like every other wait here.
 */
const DRAINED = 3;
/** How many fixed words precede the per-client slots. */
const HEADER = 4;

/**
 * Bytes reserved per client for one request or one response.
 *
 * 📐 SIZED ON A MEASUREMENT, NEVER ON A FEELING. The largest payload that
 *    crosses is a memoised PLAN — the segments of one action — measured at
 *    **313 KB** on this fleet's real corpus. Four megabytes is thirteen times
 *    that, and it is the SPACE this capability declares: N workers cost
 *    `N × 4 MB` of shared memory for the life of the daemon, which is why the
 *    worker ceiling is 8 and why the default pool is 0.
 * 🛑 A PAYLOAD ABOVE THIS IS A NAMED REFUSAL, NEVER A TRUNCATION. Half a plan
 *    is indistinguishable from a whole one to whoever reads it back, and a
 *    transport that silently delivers half of a document is precisely the
 *    class this repository refuses.
 */
function defaultSlotBytes() {
  return 4 * 1024 * 1024;
}

/**
 * The default, as a value — kept for the callers that read it as a constant.
 * ⚠️ DERIVED FROM THE FUNCTION ABOVE, never re-typed: a module-level literal is
 *    evaluated at IMPORT, outside every test's window, so nothing can measure
 *    it. Inside a function a cell can call it, and the arithmetic is judged.
 */
const SLOT_BYTES = defaultSlotBytes();

/**
 * Ceiling on the number of clients ONE channel serves.
 *
 * 🔴 IT IS THE WORKER CEILING **PLUS ONE**, AND WRITING `8` HERE WAS A REAL
 *    DEFECT — found 2026-09-20 by a bench, not by a test. The MAIN THREAD is a
 *    client like every other participant (slot 0, for the rendezvous lane), so a
 *    pool of `MAX_WORKERS` needs `MAX_WORKERS + 1` slots. At 8 the daemon
 *    REFUSED TO START on `workers: 8` — a value the schema accepts and
 *    `poolSize` returns without a word. Loud, so never silent; and still a
 *    capability the operator could declare and not have.
 * 🛑 DERIVED, NEVER RE-TYPED. The comment that used to sit here said the two
 *    numbers "must stay the same", which is exactly how a drift is written down
 *    and then trusted: they are not the same number, they are one number and an
 *    arithmetic relation. Importing the owner of the first is what makes the
 *    second impossible to get wrong.
 * ⚠️ Importing `worker-pool-pure` keeps this module PURE — that one imports
 *    nothing at all, by its own rule.
 */
const MAX_CLIENTS = require('./worker-pool-pure').MAX_WORKERS + 1;

/**
 * How long ONE `Atomics.wait` sleeps before the loop re-checks.
 *
 * ⚠️ THIS IS NOT A LATENCY: a notify wakes the sleeper immediately, so the
 *    slice is only what bounds a MISSED notify. Making it smaller buys nothing
 *    and burns wake-ups; making it larger delays only the pathological case.
 */
const WAIT_SLICE_MS = 50;

/**
 * How long a client keeps re-checking before it declares the owner lost.
 *
 * 🛑 IT ONLY HAS TO BE LARGE, NEVER RIGHT — same law as the doctor's file
 *    wait. The owner answers in microseconds; anything approaching this number
 *    means it is dead or wedged, and that is a NAMED refusal, never a longer
 *    wait. `undecidable`: nothing local can decide whether a wake-up that has
 *    not arrived ever will.
 */
const WAIT_CEILING_MS = 30000;

/**
 * The usable slot size, from an optional override.
 *
 * ⚠️ A NONSENSE OVERRIDE IS 0, NOT THE DEFAULT. Falling back would hand a test
 *    that asked for a tiny channel the production one, and its overflow cell
 *    would then prove nothing.
 *
 * @param {unknown} [slotBytes]
 * @returns {number}
 */
function slotSize(slotBytes) {
  // ⚠️ `== null` CATCHES BOTH `undefined` AND `null` IN ONE COMPARISON, and that
  //    is elimination rather than style: written as two `===` the second is a
  //    branch no caller can reach separately, i.e. an eternal survivor.
  if (slotBytes == null) return defaultSlotBytes();
  // 🛑 NO `typeof` GUARD BESIDE `Number.isInteger`, AND THE ABSENCE IS
  //    DELIBERATE — same law `declared-paths-pure.listenersOf` states about
  //    itself: `Number.isInteger` already answers false for every non-number, so
  //    a type check next to it is a branch NO input can distinguish. An
  //    equivalent mutant is removed at the source, never frozen by a test.
  if (!Number.isInteger(slotBytes) || /** @type {number} */ (slotBytes) < 1) return 0;
  return /** @type {number} */ (slotBytes);
}

/**
 * How many `Int32` words a control array needs for `clients` clients.
 *
 * @param {unknown} clients
 * @returns {number} 0 when the count is not usable — the caller REFUSES, it
 *   never allocates a channel nobody can address.
 */
function controlLength(clients) {
  // 🛑 SAME ELIMINATION AS ABOVE: `Number.isInteger` is the whole type check.
  if (!Number.isInteger(clients)) return 0;
  const count = /** @type {number} */ (clients);
  if (count < 1 || count > MAX_CLIENTS) return 0;
  return HEADER + count * 2;
}

/**
 * How many BYTES the payload region needs.
 *
 * @param {unknown} clients
 * @param {unknown} [slotBytes] overridable so a test drives a small channel —
 *   production never passes it.
 * @returns {number} 0 when the shape is not usable.
 */
function payloadLength(clients, slotBytes) {
  // ⚠️ THE ADDRESSABILITY QUESTION IS ASKED OF `controlLength`, never re-derived
  //    here: two places deciding "is this a usable client count" is two answers.
  if (controlLength(clients) === 0) return 0;
  // 🛑 NO SECOND GUARD ON THE SLOT SIZE, AND ITS ABSENCE IS DELIBERATE: an
  //    unusable slot is already 0, and 0 times anything is 0 — the guard and its
  //    absence return the SAME value on every input, i.e. an EQUIVALENT mutant
  //    no test could ever distinguish. Removed at the source rather than frozen.
  return /** @type {number} */ (clients) * slotSize(slotBytes);
}

/**
 * Where client `index`'s state word lives in the control array.
 *
 * @param {unknown} clients
 * @param {unknown} index
 * @returns {number} -1 when the pair is not addressable.
 */
function stateIndex(clients, index) {
  if (controlLength(clients) === 0) return -1;
  // 🛑 NO `typeof` BESIDE `Number.isInteger` — equivalent mutant, removed at
  //    the source.
  if (!Number.isInteger(index)) return -1;
  const slot = /** @type {number} */ (index);
  if (slot < 0 || slot >= /** @type {number} */ (clients)) return -1;
  return HEADER + slot;
}

/**
 * Where client `index`'s payload LENGTH lives in the control array.
 *
 * @param {unknown} clients
 * @param {unknown} index
 * @returns {number} -1 when the pair is not addressable.
 */
function lengthIndex(clients, index) {
  const state = stateIndex(clients, index);
  if (state === -1) return -1;
  return state + /** @type {number} */ (clients);
}

/**
 * Where client `index`'s payload region starts.
 *
 * @param {unknown} clients
 * @param {unknown} index
 * @param {unknown} [slotBytes]
 * @returns {number} -1 when the pair is not addressable.
 */
function payloadOffset(clients, index, slotBytes) {
  if (stateIndex(clients, index) === -1) return -1;
  const slot = slotSize(slotBytes);
  if (slot === 0) return -1;
  return /** @type {number} */ (index) * slot;
}

/**
 * May a payload of this many bytes be posted?
 *
 * 🛑 REFUSAL IS NAMED AND CARRIES BOTH NUMBERS. "It did not fit" sends the
 *    reader looking for a bug; "313,442 bytes against a 4,194,304-byte slot"
 *    tells them whether the cap is wrong or the payload is.
 *
 * @param {unknown} byteLength
 * @param {unknown} [slotBytes]
 * @returns {{ok: boolean, refusal: string|null}}
 */
function fits(byteLength, slotBytes) {
  const slot = slotSize(slotBytes);
  if (slot === 0) {
    return { ok: false, refusal: 'the channel slot size is not a positive integer.' };
  }
  // 🛑 NO `typeof` BESIDE `Number.isInteger` — equivalent mutant, removed at
  //    the source.
  if (!Number.isInteger(byteLength) || /** @type {number} */ (byteLength) < 0) {
    return { ok: false, refusal: `a payload length must be a non-negative integer, received ${JSON.stringify(byteLength)}.` };
  }
  if (/** @type {number} */ (byteLength) > slot) {
    return {
      ok: false,
      refusal: `a payload of ${byteLength} byte(s) does not fit the channel slot of ${slot}. `
        + 'Nothing is truncated: half a plan reads exactly like a whole one, and a transport that '
        + 'silently delivers half a document is the class this repository refuses. Raise '
        + '`SLOT_BYTES`, or stop routing a payload this large across threads.',
    };
  }
  return { ok: true, refusal: null };
}

/**
 * Should a bounded wait go round again?
 *
 * 🔴 THIS IS THE DECISION THE TEN-MINUTE HANG PAID FOR, AND IT IS WHY IT LIVES
 *    IN A PURE MODULE: a bare `Atomics.wait` blocks for ever on one missed
 *    wake-up, so the loop must RE-CHECK, and a loop that re-checks for ever is
 *    the same freeze wearing a different hat. Bounded AND re-checking, or the
 *    idiom is wrong.
 *
 * @param {unknown} elapsedMs how long the caller has been waiting
 * @param {unknown} [ceilingMs]
 * @returns {boolean} false ⇒ the caller must REFUSE by name, never wait more.
 */
function keepWaiting(elapsedMs, ceilingMs) {
  // 🛑 NO `typeof` BESIDE `Number.isInteger`, AND NONE BESIDE `Number.isFinite`
  //    EITHER: both already answer false for every non-number, so a type check
  //    next to them is a branch no input can reach on its own.
  const ceiling = Number.isInteger(ceilingMs) && /** @type {number} */ (ceilingMs) > 0
    ? /** @type {number} */ (ceilingMs)
    : WAIT_CEILING_MS;
  if (!Number.isFinite(elapsedMs)) return false;
  return /** @type {number} */ (elapsedMs) < ceiling;
}

module.exports = {
  IDLE, REQUEST, RESPONSE, FAILURE,
  DOORBELL, GENERATION, SHUTDOWN, DRAINED, HEADER,
  SLOT_BYTES, defaultSlotBytes, MAX_CLIENTS, WAIT_SLICE_MS, WAIT_CEILING_MS,
  controlLength, payloadLength, slotSize, stateIndex, lengthIndex, payloadOffset,
  fits, keepWaiting,
};
