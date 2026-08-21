// ═══════════════════════════════════════════════════════════════════════
// CLIENT-CORE — a spawned frame asks the ONE process that holds the answer.
// Shared by every harness. Inert until the switch-over.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 THIS IS THE LAST PIECE OF THE KERNEL LANE, AND IT ANSWERS ONE QUESTION:
//    **who owns the state?** Sixteen frame processes had no common ground but
//    the disk, so a FILE was made to carry a conversation between peers — a
//    lock to take turns, an atomic publish, a lock-less fallback, bounded
//    retries. Here a frame ASKS, over a kernel object, the single process that
//    knows; the kernel delivers one connection at a time onto a single-threaded
//    loop, so the serialisation the lock simulated exists ABOVE us, for free.
//
// 🛑 ONE AUTHORITY, OR NONE — THE RULE THAT MAKES THE FALLBACK SAFE, AND THE
//    TRAP IT AVOIDS IS MEASURABLE. If a local fallback WROTE to the state files
//    while the daemon holds its own memory, there would be TWO memories: a
//    `once` already delivered by one would be re-delivered by the other, for
//    ever, with nothing to see. So the fallback here **writes NOTHING** — it is
//    the very path `gate.injectLockless` was proved sufficient for (TLC,
//    `TransportCandidateFix.cfg`): deliver everything that stays correct WITHOUT
//    a record, and let a `once` wait one action.
//
// 🛑 AND THE EMPTY STATE HERE IS A FACT, NOT A GUESS. On the spawn lane the
//    lock-less path MUST read the file (07/08/2026 production bug: deciding on
//    `{}` re-emitted a delivered `once`). Here there is no file and no daemon:
//    **nothing anywhere has recorded anything**, so "nothing was recorded" is
//    the truth of the system, not an inference about it. The two situations look
//    alike and are opposites — never copy one rule onto the other.
//
// ⚠️ NO DAEMON IS AN IMMEDIATE KERNEL FACT, NEVER A TIMEOUT. A missing pipe
//    answers `ENOENT`, a dead socket `ECONNREFUSED`, at once. There is no timer
//    in this file and none may be added: a delay used as a verdict is the bug
//    this whole lane removes.
// ⚠️ THE ABSENCE IS NOT SILENT EITHER. The fallback goes through `pretool-core`,
//    which counts what it withheld and says so — one universal rule instead of a
//    daemon-specific probe. Detail: `gate.md`.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const { ask } = require('./hooks/state-client');
const pretool = require('./pretool-core');

// 🛑 A STORE THAT KNOWS NOTHING AND WRITES NOTHING — the shape of "no authority".
//    It is deliberately NOT the file store: reaching for the files here is
//    exactly the second memory the rule above forbids.
// ⚠️ `saveState` is a no-op and MUST stay one. Making it write would satisfy a
//    test and reintroduce the duplicate-delivery defect in production.
const ETAT_ABSENT = {
  loadState: () => ({}),
  saveState: () => {},
};

// 🛑 A LOCK THAT NEVER GRANTS — it hands back the caller's `fallback`, which is
//    what routes `pretool-core` into its lock-less branch. We do not duplicate
//    that branch here: a cadence rule read in two places diverges, and this repo
//    has paid that bill twice (㊱, ㊳).
// ⚠️ The parameter is named `fallback` by the lock's own contract; reading
//    anything else would silently return `undefined` and make the frame emit a
//    full delivery it may not record.
const SANS_VERROU = (_lockDir, _section, options) => (options ? options.fallback : undefined);

/**
 * @param {object} data the harness payload, verbatim
 * @param {{output: Function, emit: Function, ask?: Function, run?: Function}} deps
 *   `output` = the harness's PURE dialect (decision, doc, message) → JSON ·
 *   `emit` = the shell's I/O (print the JSON, exit) · the other two are injected
 *   by the tests only.
 * @param {{frame?: number, nbFrames?: number, budget?: number, socketPath?: string}} [options]
 */
function run(data, deps, options) {
  const o = options || {};
  // ⚠️ DESTRUCTURED, AND THE BARE `emit` IS DELIBERATE — a guardrail asked for
  //    it. `state-write-under-lock-gate` hunts the SHAPE `.emit(`, because once
  //    a write hides behind an indirection its safety can no longer be read at
  //    the call site (it bit on `legacy-mcp-inject.js` exactly that way). This
  //    module writes no state at all, so the honest answer was to match the
  //    convention every other emitter here already follows — never to ask for an
  //    exemption, which is how a real unlocked writer eventually slips in.
  const { output, emit } = deps;
  const demander = deps.ask || ask;
  const moteur = deps.run || pretool.run;

  demander(data, { frame: o.frame, frames: o.nbFrames, socketPath: o.socketPath }, (reponse) => {
    // ⚠️ The daemon answers with the FINISHED output object: it ran the same
    //    core, through the same dialect. Re-deriving anything from it here would
    //    be a second formatting of one decision.
    if (reponse) { emit(reponse); return; }

    // NO AUTHORITY REACHABLE — decide locally, deliver what needs no record,
    // write nothing, and let `pretool-core` announce what it had to withhold.
    moteur(data, (decision, fullDoc, systemMessage) => {
      emit(output(decision, fullDoc, systemMessage));
    }, { ...o, store: ETAT_ABSENT, withLock: SANS_VERROU });
  });
}

module.exports = { run, ETAT_ABSENT, SANS_VERROU };
