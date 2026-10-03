// ═══════════════════════════════════════════════════════════════════════
// state-owner-thread.js — THE SINGLE OWNER OF THE DAEMON'S STATE.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 WHAT IT IS, IN ONE SENTENCE: a dedicated thread that BLOCKS on
//    `Atomics.wait`, holds the three invocation tables and the memory store,
//    and answers whoever asks — so that N server threads share ONE memory
//    instead of N copies of it.
//
// 🔴 WHY IT HAD TO EXIST, MEASURED 2026-09-19: a `Map` handed to a worker is
//    **COPIED, never shared**. The frame sequencer's whole premise — written in
//    its own header — is *"the daemon is a SINGLE PROCESS that sees every
//    connecting request of one invocation"*. With N threads each holding their
//    own tables, that premise is false while looking exactly as if it held. The
//    cost of getting it wrong is known and was measured on the socket side the
//    day before: one document of 17 chunks over 32 frames, at 4 sockets, had
//    chunks 1..8 delivered FOUR TIMES and chunks 9..17 delivered NEVER. The
//    duplication was visible; the loss was not.
//
// 🛑 THE OWNER IS NEVER THE MAIN THREAD, AND THAT IS NOT INTERCHANGEABLE. A
//    server thread blocked on the main thread would be waiting for the main
//    EVENT LOOP to reach its message — a whole turn of the loop, not a futex
//    wake — and getting work off that loop is the entire purpose of the pool.
//
// 🛑 THE MAIN THREAD IS A CLIENT LIKE ANY OTHER. It keeps the rendezvous lane,
//    so it too asks rather than holding. One authority, no exception: the day
//    one participant answers locally, there are two memories again.
//
// ⚠️ IT DOES NOT SERVE HTTP AND MUST NEVER LEARN TO. It answers O(1) questions
//    about tables and hands values in and out of a store; the expensive work —
//    collecting the corpus, splitting it, composing an answer — belongs to the
//    threads that own the sockets. An owner that computed would be the
//    single-threaded daemon again, wearing a pool.
//
// 🔴 ITS OWN FRESHNESS IS NOT CHECKED HERE, AND THAT IS DECLARED RATHER THAN
//    HIDDEN. The point-of-use guard lives where a REQUEST is answered, i.e. in
//    the server threads; when one of them finds the code on disk changed, the
//    whole PROCESS exits and this thread dies with it. So stale logic can never
//    be served — but nothing here would notice on its own, and an owner left
//    running beside a dead server would be exactly that blind spot. It is the
//    process that lives or dies, never a thread.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const channel = require('../thread-channel-pure');
const ownerOps = require('../owner-ops');

/**
 * Build an owner over an allocated channel and a set of live tables.
 *
 * ⚠️ SPLIT IN TWO ON PURPOSE: `pump()` serves whatever is pending and RETURNS,
 *    `loop()` sleeps between pumps. A test can therefore drive the exact
 *    serving code from one thread, with no worker and no timing, which is the
 *    only way the decisions below are provable rather than hoped for.
 *
 * @param {{
 *   control: Int32Array,
 *   payload: Uint8Array,
 *   clients: number,
 *   slotBytes?: number,
 *   ops: {tables: Record<string, Function>, store: Record<string, Function>}
 * }} wiring
 * @returns {{pump: () => number, loop: () => void, stop: () => void}}
 */
function createOwner(wiring) {
  const { control, payload, clients, ops } = wiring;
  const slotBytes = wiring.slotBytes;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  /**
   * Serve every request currently posted. Returns how many were served.
   *
   * ⚠️ A FULL SCAN, NEVER A QUEUE. There are at most nine slots, so the scan is
   *    a constant; a queue would be shared mutable state between threads —
   *    the very thing this design exists to have exactly one of.
   *
   * @returns {number}
   */
  function pump() {
    let served = 0;
    for (let i = 0; i < clients; i += 1) {
      const stateAt = channel.stateIndex(clients, i);
      if (Atomics.load(control, stateAt) !== channel.REQUEST) continue;
      const lengthAt = channel.lengthIndex(clients, i);
      const offset = channel.payloadOffset(clients, i, slotBytes);
      const length = Atomics.load(control, lengthAt);
      let verdict = channel.RESPONSE;
      let text;
      let invalidates = false;
      try {
        const asked = JSON.parse(decoder.decode(payload.subarray(offset, offset + length)));
        const value = ownerOps.apply(ops, asked.op, asked.args);
        invalidates = ownerOps.INVALIDATES.includes(asked.op);
        // ⚠️ WRAPPED IN AN OBJECT so `undefined` survives the wire: a bare
        //    `JSON.stringify(undefined)` is the empty string, which parses as
        //    nothing and would read as a failure.
        text = JSON.stringify({ value: value === undefined ? null : value });
      } catch (err) {
        // 🛑 A THROW IS ANSWERED, NEVER SWALLOWED AND NEVER LEFT PENDING. A slot
        //    left in REQUEST would block its client until the ceiling, and a
        //    caller that waited thirty seconds to learn nothing is worse than
        //    one told immediately what failed.
        verdict = channel.FAILURE;
        text = (err && /** @type {Error} */ (err).message) || String(err);
      }
      const bytes = encoder.encode(text);
      const room = channel.fits(bytes.length, slotBytes);
      if (!room.ok) {
        verdict = channel.FAILURE;
        // 🛑 THE REFUSAL ITSELF IS CLAMPED, AND THAT IS NOT THE TRUNCATION THIS
        //    FILE REFUSES ELSEWHERE. A slot too small to carry a plan can be too
        //    small to carry the sentence explaining it; losing the tail of a
        //    DIAGNOSTIC costs a reader some words, losing the tail of a PLAN
        //    delivers half a document while looking whole. Clamping a message is
        //    the only way this branch can report at all.
        const refusal = encoder
          .encode(`the answer does not fit: ${room.refusal}`)
          .subarray(0, channel.slotSize(slotBytes));
        payload.set(refusal, offset);
        Atomics.store(control, lengthAt, refusal.length);
      } else {
        payload.set(bytes, offset);
        Atomics.store(control, lengthAt, bytes.length);
      }
      // 🔑 THE GENERATION MOVES BEFORE THE ANSWER IS VISIBLE. A client that read
      //    the answer first and the generation second could keep a memo filled
      //    by a value the write it just made has already replaced.
      if (invalidates) Atomics.add(control, channel.GENERATION, 1);
      Atomics.store(control, stateAt, verdict);
      Atomics.notify(control, stateAt);
      served += 1;
    }
    return served;
  }

  /**
   * Serve for ever, sleeping between rounds.
   *
   * 🛑 THE DOORBELL IS READ **BEFORE** THE SCAN, and that ordering is the whole
   *    correctness of the sleep: a request posted between the scan and the wait
   *    has already changed the number we were told to expect, so `Atomics.wait`
   *    returns `not-equal` immediately instead of sleeping through it. Reading
   *    it after the scan is the classic lost wake-up.
   * 🛑 THE WAIT IS BOUNDED ANYWAY. Belt and braces, and cheap: the slice only
   *    ever costs anything if a notify was missed, which is precisely the case
   *    that hung a probe for ten minutes on 0.4 s of CPU.
   * @returns {void}
   */
  function loop() {
    while (Atomics.load(control, channel.SHUTDOWN) === 0) {
      const doorbell = Atomics.load(control, channel.DOORBELL);
      if (pump() > 0) continue;
      if (Atomics.load(control, channel.SHUTDOWN) !== 0) return;
      Atomics.wait(control, channel.DOORBELL, doorbell, channel.WAIT_SLICE_MS);
    }
  }

  /** Ask the loop to return at its next turn. */
  function stop() {
    Atomics.store(control, channel.SHUTDOWN, 1);
    Atomics.notify(control, channel.DOORBELL);
  }

  return { pump, loop, stop };
}

module.exports = { createOwner };
