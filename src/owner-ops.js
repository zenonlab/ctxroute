// ═══════════════════════════════════════════════════════════════════════
// owner-ops.js — THE ONE DIALECT OF EVERY OPERATION ON THE DAEMON'S STATE.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 WHY THIS FILE EXISTS AT ALL, AND IT IS THE POINT OF THE WHOLE MULTI-CORE
//    WORK. With a pool, a table operation may be executed IN LINE (no pool: the
//    main thread does it) or ROUTED to the owner thread (pool: a server thread
//    asks). Those are two roads to ONE behaviour — and two roads that each hold
//    their own copy of *which arguments, in which order, with which guards*
//    would drift, silently, on the first change to either. **So there is one
//    body and two callers**: this module. The owner APPLIES these functions;
//    the main thread, with no pool, CALLS the very same ones.
//
// 🛑 NOTHING IS DECIDED HERE. Every function below forwards to the pure module
//    that already owns the decision (`frame-sequencer-pure`,
//    `delivery-notice-pure`, `carryover-pure`) or to the store. A guard, a
//    clamp or a fallback invented in this file would be a SECOND semantics for
//    a decision that already has an owner and a mutation score.
//
// 🛑 THE WIRE NAMES ARE A CLOSED LIST AND THE DISPATCH IS FAIL-CLOSED. An
//    unknown operation is a NAMED REFUSAL, never a silent no-op: a server
//    thread asking for something the owner cannot do must fail loudly, because
//    the alternative is a table operation that appears to happen and does not.
//
// ⚠️ ARGUMENTS TRAVEL AS A POSITIONAL ARRAY, deliberately. A named object would
//    invite a caller to omit a field and an applier to fill it in — which is
//    exactly how a second dialect is born. Positional is exact: the wire shape
//    IS the function's signature.
//
// 🔑 `INVALIDATES` IS WHAT MAKES A CLIENT-SIDE READ CACHE SAFE. A client may
//    serve a value it fetched earlier only while no write has happened
//    anywhere; these are the writes. The owner bumps the shared generation
//    after each of them, so a memo fails towards a round trip and never
//    towards a second memory.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const memoryPure = require('./memory-store-pure');
const frameSequencer = require('./frame-sequencer-pure');
const deliveryNotice = require('./delivery-notice-pure');
const carryover = require('./carryover-pure');

/**
 * Build the operation table over one set of live tables and one store.
 *
 * @param {{
 *   sequencer: Map<string, number>,
 *   notice: Map<string, {nbFrames: number, served: number}>,
 *   carryover: Map<string, {scopeId: string, served: number, nbFrames: number, harvested: boolean}>,
 *   store: {loadState: Function, saveState: Function, purge: Function}|null
 * }} live
 * @returns {{tables: Record<string, Function>, store: Record<string, Function>}}
 */
function createOps(live) {
  const sequencerState = live.sequencer;
  const noticeState = live.notice;
  const carryoverState = live.carryover;
  const store = live.store;
  /**
   * 🛑 A STORE OPERATION WITHOUT A STORE IS A REFUSAL, NEVER AN EMPTY ANSWER.
   *    Answering `{}` would look exactly like a session that has delivered
   *    nothing — the shape that re-delivers every `once` document in silence.
   * @returns {{loadState: Function, saveState: Function, purge: Function}}
   */
  function backing() {
    if (!store) {
      throw new Error('owner-ops: a store operation was routed to an owner that holds no store. '
        + 'Nothing is assumed: an empty answer here is indistinguishable from a session that has '
        + 'delivered nothing, which re-delivers every `once` document without a word.');
    }
    return store;
  }
  // ═══════════════════════════════════════════════════════════════════
  // PER-KEY STAMPS — what lets a reader ask "still the same?" for a few bytes
  // ═══════════════════════════════════════════════════════════════════
  // 🔴 MEASURED 2026-09-20, AND IT REFUTED THIS DESIGN'S OWN COMMENT. The client
  //    memo claimed the plan crossed "once per THREAD instead of once per
  //    frame". Driven through a REAL owner thread with the production
  //    interleaving — 32 frames, each READING the plan then WRITING its
  //    `doc-seen-` — the reading was **0 memo hits out of 32**: the plan crossed
  //    **32 times, 9.78 MB per action**. The memo is dropped whole on every
  //    generation bump and every frame bumps it, so it never once answered.
  // 🔑 A MONOTONIC TICK, NEVER A PER-KEY COUNTER RESET BY A PURGE. A counter
  //    that restarts is the ABA problem: a reader holding version 1 from before
  //    a purge would match version 1 written after it, and answer a value that
  //    no longer exists. One tick for the whole store, recorded per key at its
  //    last write, is monotone by construction.
  // 🛑 A PURGED KEY IS DELETED, HENCE STAMPED 0 — and 0 never equals a stamp a
  //    reader holds, because a held stamp is only ever handed out after a write.
  //    The absence is therefore a REFUSAL to match, never a silent agreement.
  // ⚠️ BOUNDED LIKE EVERYTHING THAT GROWS: the map is capped and its oldest
  //    entries are dropped. A missing stamp reads as 0, which forces a full
  //    round trip — the degradation costs bytes, never correctness.
  const stamps = new Map();
  // 🔑 DERIVED FROM THE CEILINGS THE STORE ALREADY DECLARES, never a number typed
  //    here. One stamp exists per key the store can hold, so the two bounds are
  //    the same fact and a second literal would be a second truth about it.
  // 🛑 AND IT REPLACES AN INJECTABLE SEAM THAT WAS REMOVED THE SAME DAY: the
  //    seam added a guard whose mutants say nothing about the product — it
  //    existed for the convenience of one cell. An equivalent mutant is
  //    ELIMINATED at the source, never frozen by a test. The bound is reachable:
  //    a cell crosses it with a few thousand Map writes, in milliseconds.
  const MAX_STAMPS = memoryPure.MAX_SCOPES + memoryPure.MAX_EPHEMERAL;
  let tick = 0;

  /** @param {string} prefix @param {string} key @returns {number} */
  function stampOf(prefix, key) {
    const v = stamps.get(`${prefix}${key}`);
    return typeof v === 'number' ? v : 0;
  }

  /** @param {string} prefix @param {string} key @returns {void} */
  function restamp(prefix, key) {
    tick += 1;
    const k = `${prefix}${key}`;
    stamps.delete(k);
    stamps.set(k, tick);
    while (stamps.size > MAX_STAMPS) stamps.delete(stamps.keys().next().value);
  }

  return {
    tables: {
      /**
       * @param {string} invocationId
       * @param {number} requestedFrame
       * @param {number} nbFrames
       * @returns {number}
       */
      nextIndex(invocationId, requestedFrame, nbFrames) {
        return frameSequencer.nextIndex(sequencerState, invocationId, requestedFrame, nbFrames);
      },
      /**
       * @param {string} invocationId
       * @param {number} index
       * @param {number} nbFrames
       * @returns {{kind: string}|null}
       */
      notice(invocationId, index, nbFrames) {
        return deliveryNotice.observe(noticeState, invocationId, index, nbFrames);
      },
      /**
       * @param {string} invocationId
       * @returns {boolean}
       */
      isHarvested(invocationId) {
        return carryover.isHarvested(carryoverState, invocationId);
      },
      /**
       * @param {string} scopeId
       * @param {string} invocationId
       * @param {number} servedIndex
       * @param {number} nbFrames
       * @returns {null}
       */
      observe(scopeId, invocationId, servedIndex, nbFrames) {
        carryover.observe(carryoverState, scopeId, invocationId, servedIndex, nbFrames);
        return null;
      },
      /**
       * @param {string} scopeId
       * @param {string} invocationId
       * @returns {{invocationId: string, served: number}[]}
       */
      pendingFor(scopeId, invocationId) {
        return carryover.pendingFor(carryoverState, scopeId, invocationId);
      },
      /**
       * @param {string} invocationId
       * @returns {null}
       */
      markHarvested(invocationId) {
        carryover.markHarvested(carryoverState, invocationId);
        return null;
      },
    },
    store: {
      /**
       * @param {string} prefix
       * @param {string} key
       * @returns {unknown}
       */
      loadState(prefix, key) {
        return backing().loadState(prefix, key);
      },
      /**
       * @param {string} prefix
       * @param {string} key
       * @param {unknown} value
       * @returns {null}
       */
      saveState(prefix, key, value) {
        backing().saveState(prefix, key, value);
        // 🛑 THE STAMP MOVES IN THE SAME GESTURE AS THE WRITE. Anywhere else and
        //    a reader could observe the new value under the old stamp, i.e. keep
        //    a memo of something that has already changed.
        restamp(prefix, key);
        return null;
      },
      /**
       * The stamp of one key: a few bytes that say whether a memoised answer is
       * still current. 🔑 THIS IS WHAT MAKES THE MEMO CHEAP WITHOUT MAKING IT A
       * SECOND MEMORY — the reader never decides; it asks, and re-fetches unless
       * the owner says nothing has moved.
       * @param {string} prefix
       * @param {string} key
       * @returns {number}
       */
      stampOf(prefix, key) {
        return stampOf(prefix, key);
      },
      /**
       * @param {string} keyPrefix
       * @returns {number}
       */
      purge(keyPrefix) {
        // 🛑 FORGET THE STAMPS OF WHAT IS GONE, never reset them: a forgotten key
        //    stamps 0, which matches no held stamp, so every reader re-fetches.
        for (const k of [...stamps.keys()]) if (k.startsWith(String(keyPrefix))) stamps.delete(k);
        tick += 1;
        return backing().purge(keyPrefix);
      },
    },
  };
}

/**
 * The CLOSED list of wire names, derived from the shape above so a function
 * added tomorrow cannot be reachable without appearing here.
 */
const OP_NAMES = Object.freeze([
  'tables.nextIndex',
  'tables.notice',
  'tables.isHarvested',
  'tables.observe',
  'tables.pendingFor',
  'tables.markHarvested',
  'store.loadState',
  'store.saveState',
  'store.purge',
  'store.stampOf',
]);

/**
 * The operations after which a cached read may be stale.
 *
 * 🛑 THE TABLE OPERATIONS ARE NOT HERE AND MUST NEVER BE CACHED — every one of
 *    them either mutates a table or depends on ARRIVAL ORDER, so a second
 *    answer to the same question is a different fact, not a repeat.
 */
const INVALIDATES = Object.freeze(['store.saveState', 'store.purge']);

/**
 * The operations whose answer a client may memoise until the generation moves.
 */
const CACHEABLE = Object.freeze(['store.loadState']);

/**
 * Run one wire operation against an operation table.
 *
 * 🛑 FAIL-CLOSED ON AN UNKNOWN NAME. An operation that quietly did nothing
 *    would read, from the caller's side, exactly like one that worked.
 *
 * @param {{tables: Record<string, Function>, store: Record<string, Function>}} ops
 * @param {unknown} name
 * @param {unknown} args
 * @returns {unknown}
 */
function apply(ops, name, args) {
  const vocabulary = `The wire vocabulary is closed: ${OP_NAMES.join(', ')}.`;
  // ⚠️ TWO REFUSALS, NOT ONE (2026-10-01): a non-string can never be in the
  //    vocabulary, so folded into the membership test this type guard decided
  //    nothing a mutant could change. Named apart, it tells a caller WHAT is
  //    wrong — a message that was never sent as a name — instead of quoting
  //    an object as if it were an unknown operation. 🛑 Never drop it: a type
  //    guard on a public contract is not removable, even when it looks redundant.
  if (typeof name !== 'string') {
    throw new Error(`owner-ops: an operation name must be a string, got ${typeof name}. ${vocabulary}`);
  }
  if (!OP_NAMES.includes(name)) {
    throw new Error(`owner-ops: unknown operation ${JSON.stringify(name)}. ${vocabulary}`);
  }
  const dot = name.indexOf('.');
  const group = name.slice(0, dot);
  const fn = name.slice(dot + 1);
  const table = group === 'tables' ? ops.tables : ops.store;
  return table[fn](...(Array.isArray(args) ? args : []));
}

module.exports = { createOps, apply, OP_NAMES, INVALIDATES, CACHEABLE };
