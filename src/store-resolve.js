// ═══════════════════════════════════════════════════════════════════════
// STORE-RESOLVE — the SINGLE point that says which memory a shell decides on.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 BORN OF A DEFECT MEASURED IN PRODUCTION ON 2026-08-21, AND THE MEASUREMENT
//    IS THE WHOLE JUSTIFICATION. The injection state has FOUR consumers — the
//    PreToolUse gate, the session gate (it SHARES the `remainder-` queue with
//    it), the turn counter, and the PreCompact reset. Wiring ONLY the gate to
//    the daemon moved that one consumer's memory into RAM while the other three
//    kept reading and writing the disk. Sequence run against the live install:
//    inject → the `once` is consumed → run the REAL PreCompact hook → ask again
//    ⇒ the daemon answered **2 bytes**. After a compaction, skills and `once`
//    documents NEVER came back: no error, no badge, no red gate.
//
// 🔑 THE ROOT CAUSE WAS NEVER "WE FORGOT THE RESET". It was that ANY shell could
//    open the store itself, so a change made OUTSIDE the repository (the
//    harness wiring) silently split the ownership of one state. The doctrine
//    already said "the backend is an ARGUMENT, never an ambient setting" and
//    "`store` and `withLock` travel TOGETHER" — and it did not stop anyone.
//    **A rule only prose guards is not a rule.** This module removes the
//    capability instead of repeating the advice: the import of a store module
//    is forbidden everywhere else (dependency-cruiser), and reaching one
//    directly is a cell of the layer table.
//
// ⚠️ A SHARED STATE IS MIGRATED FOR ALL ITS CONSUMERS OR FOR NONE (expand /
//    contract). A partial migration is a split brain, and a split brain here is
//    SILENT — that is what makes it worse than a crash.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const disque = require('./session-store');
const lockModule = require('./lock');

// 🛑 THE INERT PAIR — reads nothing, writes nothing, and both halves say so.
//    It is what a frame uses when NO authority is reachable: it delivers what
//    needs no record and records nothing. A fallback that WROTE would make two
//    memories, and a `once` delivered by one would be re-delivered by the other
//    for ever, with nothing to see.
// ⚠️ Its emptiness is a FACT here (no daemon, no file), the exact OPPOSITE of
//    the spawn lane where reading the file is mandatory — deciding on `{}` there
//    re-emitted an already delivered `once` (production bug, 2026-08-07). The two
//    situations look alike and the rules are inverted: never copy one onto the
//    other.
const ETAT_ABSENT = { loadState: () => ({}), saveState: () => {} };
const SANS_VERROU = (_lockDir, _section, options) => (options ? options.fallback : undefined);

// The CLOSED list of backends. A closed base, like every other vocabulary here:
// a fifth name would have to be a synonym of one of these, and a synonym is
// duplication. `client` is declared and reserved for the daemon lane, which owns
// the endpoints; it is NOT resolvable until those exist, and asking for it is a
// LOUD refusal rather than a silent fallback to the disk.
const BACKENDS = ['disk', 'none', 'client'];

/**
 * WHICH MEMORY DOES THIS SHELL DECIDE ON?
 *
 * 🛑 IT RETURNS THE PAIR, ALWAYS BOTH, NEVER ONE. Memory plus a file lock is a
 *    lock protecting nothing (pure cost); disk plus an empty lock is the
 *    production bug of 2026-08-07, deliberately reintroduced. Whoever gets to
 *    choose one half separately can build the incoherent combination — so
 *    nobody gets to.
 * 🛑 THE BACKEND IS AN ARGUMENT, NEVER AN ENVIRONMENT VARIABLE. Env vars are
 *    INHERITED: one leak and a spawned hook reads an EMPTY memory instead of the
 *    real state, every `once` re-delivered, no error anywhere. An ambient switch
 *    on a state backend manufactures silent bugs.
 * ⚠️ NO ARGUMENT = TODAY'S BEHAVIOUR, BYTE FOR BYTE — the historical disk pair,
 *    so every existing differential stays green with no edit. That parity is
 *    what makes a switch-over safe, and it is checked by a cell.
 *
 * @param {{backend?: string}} [options]
 * @returns {{store: {loadState: Function, saveState: Function}, withLock: Function}}
 */
function resolveStore(options) {
  const nom = (options && options.backend) || 'disk';
  if (!BACKENDS.includes(nom)) {
    // FAIL-CLOSED, and it names the value: a resolution that quietly fell back
    // to the disk would hand a second memory to a caller that asked for another
    // one — the very defect this module exists to remove.
    throw new Error(`store-resolve: unknown backend "${nom}" — expected ${BACKENDS.join(' | ')}`);
  }
  if (nom === 'none') return { store: ETAT_ABSENT, withLock: SANS_VERROU };
  if (nom === 'client') {
    // 🔑 THE DISK PAIR, AND THAT IS NOT A DEGRADATION — IT IS THE TRUTH ITSELF
    //    (2026-08-22). The daemon no longer OWNS the durable state: it writes it
    //    through to these very files. So a client that cannot reach the daemon
    //    is not falling back to a SECOND memory — it is reading the ONE memory
    //    directly, just without the daemon's speed.
    // 🛑 THIS USED TO THROW, and the refusal was correct AT THE TIME: while the
    //    daemon held the truth in RAM, answering with the disk pair would have
    //    rebuilt the split brain of 2026-08-21 while looking perfectly healthy.
    //    What changed is not this line's boldness, it is WHO OWNS THE STATE.
    // ⚠️ NEVER re-introduce an empty pair here. `ETAT_ABSENT` writes nothing, so
    //    a `once` it delivers is delivered again for ever, with nothing to see.
    return { store: disque, withLock: lockModule.withLock };
  }
  return { store: disque, withLock: lockModule.withLock };
}

module.exports = { resolveStore, BACKENDS, ETAT_ABSENT, SANS_VERROU };
