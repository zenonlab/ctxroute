// ═══════════════════════════════════════════════════════════════════════
// TURN-CORE — the turn counter's read-modify-write, in ONE place.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 WHY A FILE FOR FOUR LINES. The counter now has TWO writers: the spawned
//    `turn-count.js` shell, which owns the on-disk store, and the DAEMON, which
//    owns the state in memory and must serve the same shell once it becomes a
//    client. The increment rule — "anything that is not an integer is zero" — is
//    a rule about the SHAPE of that store, and a shape rule read in two places
//    diverges. This repository has paid that bill twice (㊱, ㊳).
//
// 🛑 IT IS A READ-MODIFY-WRITE, SO IT MUST BE ONE INDIVISIBLE STEP FROM THE
//    CALLER'S POINT OF VIEW. On the disk lane the caller wraps it in the
//    cross-process lock; on the daemon lane the KERNEL already serialises the
//    callers (one connection at a time onto a single-threaded loop), so the
//    mutual exclusion exists above us, for free. 🔴 NEVER split it into a
//    `load` request and a `save` request over the socket: two round trips are
//    two moments, and two processes crossing between them lose a turn — that is
//    a file made to carry a conversation between peers, rebuilt over a socket.
//
// ⚠️ SHARED CORE: no `process.exit`, no output, no environment, no arguments —
//    it RETURNS the new value and the caller decides what to do with it.
// ⚠️ ZERO DEPENDENCIES on purpose: it is handed a `store`, it never chooses one.
//    Choosing the backend is `store-resolve.js`'s job, and `store` and
//    `withLock` travel together — never one without the other.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

/**
 * READS THE COUNTER AND WRITES ITS SUCCESSOR.
 *
 * ⚠️ AN ABSENT OR MALFORMED COUNTER IS ZERO, NEVER AN ERROR — fail-open, like
 *    every state read in this framework. Worst case the `turn` drift restarts,
 *    which costs one re-injection; a throw here would take down the hook that
 *    counts every turn of every agent.
 *
 * @param {{loadState: Function, saveState: Function}} store
 * @param {string} prefix  the store prefix (`turn-count-`), passed by the owner
 *   of the counter — this module declares no prefix of its own, so nothing new
 *   has to be added to the PreCompact purge loop.
 * @param {string} scopeId  `lib.scopeId(session_id, agent_id)` — composed by the
 *   caller, NEVER here (single source, `lib-pure.scopeId`).
 * @returns {number} the counter AFTER the increment.
 */
function bump(store, prefix, scopeId) {
  const s = store.loadState(prefix, scopeId);
  const turns = s && Number.isInteger(s.turns) ? s.turns : 0;
  const next = turns + 1;
  store.saveState(prefix, scopeId, { turns: next });
  return next;
}

module.exports = { bump };
