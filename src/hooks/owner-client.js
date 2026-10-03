// ═══════════════════════════════════════════════════════════════════════
// owner-client.js — ASKING THE OWNER THREAD, SYNCHRONOUSLY.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 WHAT THIS IS: the other end of `state-owner-thread.js`. It exposes EXACTLY
//    the shape `owner-ops.createOps` exposes — same groups, same names, same
//    positional arguments — so a caller cannot tell whether it holds the tables
//    or merely asks for them. That identity is not a convenience: it is what
//    makes the third differential (single-thread against multi-thread) a
//    question about ROUTING and never about behaviour.
//
// 🛑 THE SHAPE IS DERIVED FROM `OP_NAMES`, NEVER RE-TYPED. An operation added
//    to the wire vocabulary appears here by itself; a hand-written twin would
//    be one rename away from a method that silently does not exist.
//
// 🛑 EVERY CALL BLOCKS, AND THAT IS THE REQUIREMENT, NOT A LIMITATION.
//    `pretool-core` asks `pendingFor` INSIDE `withLock`, and `lock.js`
//    busy-waits: an asynchronous round trip there would hold the lock while
//    another thread spun for the whole deadline. Measured cost of one blocking
//    round trip: 1.48-1.65 µs, against ~1,300 µs for one acquisition of the
//    cross-process lock this daemon already pays.
//
// 🔴 THE WAIT IS BOUNDED AND RE-CHECKS — the ten-minute hang of 2026-09-19 was
//    a bare `Atomics.wait` with neither. One missed wake-up is enough: the
//    value changed before the sleeper looked, so the notify it waits for has
//    already happened and will not happen again. The bound turns *"I was not
//    woken"* into *"look again"*, and its exhaustion is a NAMED refusal, never
//    a longer wait (`undecidable`, `temporal-budget.json`).
//
// 🔑 THE READ CACHE IS VALID ONLY WHILE NOBODY HAS WRITTEN. It holds answers to
//    `store.loadState` and it is discarded whole the moment the shared
//    generation moves — which the owner bumps after EVERY write, from any
//    thread. So it can only ever fail towards a round trip. 📐 It exists for a
//    measured reason: a memoised plan is **313 KB** on this fleet's real
//    corpus and 32 frames read it, so without a memo one action would pay
//    **44 ms** of JSON round trips against its own ~133 ms. With one, the plan
//    crosses once per THREAD instead of once per frame.
// 🛑 IT IS NOT A SECOND MEMORY, AND THE DISTINCTION IS THE WHOLE ARGUMENT: a
//    second memory ANSWERS when the first would have answered differently. This
//    one is erased by any write anywhere before it can.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const channel = require('../thread-channel-pure');
const { OP_NAMES, CACHEABLE } = require('../owner-ops');

/**
 * How many memoised reads one client keeps.
 *
 * ⚠️ BOUNDED BECAUSE EVERYTHING THAT WRITES IS BOUNDED (fleet doctrine: a
 *    component with no ceiling does not exist). One action reads a handful of
 *    keys, and the whole table is dropped on the next write anyway.
 */
const MAX_MEMO = 32;

/**
 * ⚠️ NAMED SHAPES, and they are the SAME ones `owner-ops.createOps` returns.
 *    That identity is the whole point: a caller must not be able to tell a
 *    client from the tables themselves, or the two roads have already drifted.
 * @typedef {{loadState: Function, saveState: Function, purge: Function}} RemoteStore
 * @typedef {{nextIndex: Function, notice: Function, isHarvested: Function,
 *   observe: Function, pendingFor: Function, markHarvested: Function}} RemoteTables
 * @typedef {{tables: RemoteTables, store: RemoteStore,
 *   stats: () => {roundTrips: number, memoHits: number}}} OwnerFacade
 */

/**
 * Build a client over an already-allocated channel.
 *
 * @param {{
 *   control: Int32Array,
 *   payload: Uint8Array,
 *   clients: number,
 *   index: number,
 *   slotBytes?: number,
 *   ceilingMs?: number
 * }} wiring
 * @returns {OwnerFacade}
 */
function createClient(wiring) {
  const { control, payload, clients, index } = wiring;
  const slotBytes = wiring.slotBytes;
  const ceilingMs = wiring.ceilingMs;
  const stateAt = channel.stateIndex(clients, index);
  const lengthAt = channel.lengthIndex(clients, index);
  const offset = channel.payloadOffset(clients, index, slotBytes);
  if (stateAt === -1 || lengthAt === -1 || offset === -1) {
    throw new Error(`owner-client: slot ${JSON.stringify(index)} of ${JSON.stringify(clients)} is not addressable. `
      + 'A thread with no slot cannot ask the owner anything, and answering locally would be a second memory.');
  }
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const memo = new Map();
  let memoGeneration = -1;
  let roundTrips = 0;
  let memoHits = 0;

  /**
   * Drop the memo when anything has been written since it was filled.
   * @returns {void}
   */
  function syncMemo() {
    const now = Atomics.load(control, channel.GENERATION);
    if (now !== memoGeneration) {
      memo.clear();
      memoGeneration = now;
    }
  }

  /**
   * One blocking round trip.
   * @param {string} name
   * @param {unknown[]} args
   * @returns {unknown}
   */
  function request(name, args) {
    const bytes = encoder.encode(JSON.stringify({ op: name, args }));
    const room = channel.fits(bytes.length, slotBytes);
    if (!room.ok) throw new Error(`owner-client: ${room.refusal}`);
    payload.set(bytes, offset);
    Atomics.store(control, lengthAt, bytes.length);
    Atomics.store(control, stateAt, channel.REQUEST);
    Atomics.add(control, channel.DOORBELL, 1);
    Atomics.notify(control, channel.DOORBELL);
    roundTrips += 1;
    const startedAt = Date.now();
    // 🛑 BOUNDED **AND** RE-CHECKING — either one alone is the freeze.
    while (Atomics.load(control, stateAt) === channel.REQUEST) {
      if (!channel.keepWaiting(Date.now() - startedAt, ceilingMs)) {
        throw new Error(`owner-client: the state owner did not answer ${name} within `
          + `${ceilingMs || channel.WAIT_CEILING_MS} ms. It answers in microseconds, so this is a dead or `
          + 'wedged owner, not a slow one. Refusing by name rather than waiting longer: deciding '
          + 'locally here would be the second memory this whole design removes.');
      }
      Atomics.wait(control, stateAt, channel.REQUEST, channel.WAIT_SLICE_MS);
    }
    const verdict = Atomics.load(control, stateAt);
    const length = Atomics.load(control, lengthAt);
    const text = decoder.decode(payload.subarray(offset, offset + length));
    Atomics.store(control, stateAt, channel.IDLE);
    if (verdict === channel.FAILURE) {
      throw new Error(`owner-client: the state owner refused ${name} — ${text}`);
    }
    return JSON.parse(text).value;
  }

  /**
   * One operation, memoised when the vocabulary says it may be.
   * @param {string} name
   * @param {unknown[]} args
   * @returns {unknown}
   */
  function call(name, args) {
    if (!CACHEABLE.includes(name)) return request(name, args);
    const key = `${name} ${JSON.stringify(args)}`;
    const held = memo.get(key);
    const moved = Atomics.load(control, channel.GENERATION) !== memoGeneration;
    // ⚡ NOTHING HAS BEEN WRITTEN SINCE THE MEMO WAS FILLED — today's fast path,
    //    unchanged, and it costs not one byte on the wire.
    if (held !== undefined && !moved) {
      memoHits += 1;
      return held.value;
    }
    // 🔴 SOMETHING WAS WRITTEN — AND UNTIL 2026-09-20 THAT DROPPED THE WHOLE MEMO,
    //    WHICH MADE IT INERT. MEASURED through a REAL owner thread on the
    //    production interleaving (32 frames, each READING the plan then WRITING
    //    its `doc-seen-`): **0 memo hits out of 32**, the plan crossing **32
    //    times, 9.78 MB per action**. Every frame writes, so the memo was erased
    //    before it ever answered once.
    // 🔑 THE FIX ASKS INSTEAD OF ASSUMING. A write elsewhere says nothing about
    //    THIS key, so the client asks the owner for its STAMP — a few bytes —
    //    and keeps what it holds only if the owner says the key has not moved.
    //    The memo therefore still cannot answer differently from a round trip:
    //    it is revalidated, never trusted.
    // 🛑 A FIRST ATTEMPT FROZE THE PLAN CLASS OUTRIGHT, on the reasoning that a
    //    plan key is written at most once. **The suite refused it** — cell ⑩
    //    rewrites a plan key and the frozen answer was stale, and cell ⑧ caught
    //    the routed path diverging from the in-line one. An invariant that is
    //    ASSUMED rather than sealed is exactly the second memory this design
    //    exists to remove. Never reintroduce it.
    if (held !== undefined) {
      const stamp = /** @type {number} */ (request('store.stampOf', args));
      if (stamp === held.stamp) {
        memoGeneration = Atomics.load(control, channel.GENERATION);
        memoHits += 1;
        return held.value;
      }
    }
    syncMemo();
    const value = request(name, args);
    const stamp = /** @type {number} */ (request('store.stampOf', args));
    memo.set(key, { stamp, value });
    while (memo.size > MAX_MEMO) memo.delete(memo.keys().next().value);
    return value;
  }

  const client = /** @type {any} */ ({ tables: {}, store: {}, stats: () => ({ roundTrips, memoHits }) });
  // 🛑 DERIVED FROM THE CLOSED VOCABULARY, never re-typed here.
  for (const name of OP_NAMES) {
    const dot = name.indexOf('.');
    const group = name.slice(0, dot);
    const fn = name.slice(dot + 1);
    const table = group === 'tables' ? client.tables : client.store;
    table[fn] = (...args) => call(name, args);
  }
  return /** @type {OwnerFacade} */ (client);
}

module.exports = { createClient, MAX_MEMO };
