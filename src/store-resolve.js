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

const path = require('path');
const disk = require('./session-store');
const lockModule = require('./lock');
const paths = require('./paths');
const lib = require('./lib-pure');

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
const STATE_ABSENT = { loadState: () => ({}), saveState: () => {} };
const WITHOUT_LOCK = (_lockDir, _section, options) => (options ? options.fallback : undefined);

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
  const itemName = (options && options.backend) || 'disk';
  if (!BACKENDS.includes(itemName)) {
    // FAIL-CLOSED, and it names the value: a resolution that quietly fell back
    // to the disk would hand a second memory to a caller that asked for another
    // one — the very defect this module exists to remove.
    throw new Error(`store-resolve: unknown backend "${itemName}" — expected ${BACKENDS.join(' | ')}`);
  }
  if (itemName === 'none') return { store: STATE_ABSENT, withLock: WITHOUT_LOCK };
  if (itemName === 'client') {
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
    return { store: disk, withLock: lockModule.withLock };
  }
  return { store: disk, withLock: lockModule.withLock };
}

// ═══════════════════════════════════════════════════════════════════════
// THE ADDRESS OF THE LOCK — one name per state class, declared HERE.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 WHY IT LIVES BESIDE `resolveStore` AND NOWHERE ELSE. A lock only serialises
//    the writers that take the SAME name: two spellings of one lock are two
//    locks, and two locks are NO lock — silently, with every suite green. This
//    module already owns "which memory you write to"; the address of the mutual
//    exclusion around that memory is the same fact, so it is the same owner.
//
// 🔴 MEASURED 2026-08-23, AND IT IS WHY THESE FUNCTIONS EXIST. The daemon writes
//    the durable class THROUGH to `session-store` since 2026-08-22, i.e. onto the
//    very files a spawned client reads and rewrites under this lock. Its `/emit`
//    and `/turn` routes took NO lock — "one thread, one connection at a time",
//    which serialises the daemon's OWN callers and serialises NOTHING against a
//    spawned peer. Two real processes crossing on one `remainder-` key lost
//    **209 updates out of 800** (control, both writers locked: 0–1 of 800). The
//    write is atomic (tmp + rename), so nothing was ever corrupt — what
//    disappeared is a RECORDED DELIVERY, i.e. a document delivered twice, in
//    silence, which is the one failure mode this repository refuses outright.
// 🛑 SO A NEW WRITER OF A DURABLE KEY DOES NOT COMPOSE ITS OWN LOCK NAME. Ask
//    here, or the serialisation you think you have is a coincidence of spelling.
// ⚠️ `sanitizeSessionId` is applied HERE, once: a scope id is arbitrary text and
//    a raw one would produce a directory name the other writers never form.

/**
 * The lock guarding a scope's INJECTION state — `doc-seen-`, `plan-` and the
 * `remainder-` queue shared by the PreToolUse gate and the session gate.
 * @param {string} scopeId `lib.scopeId(session_id, agent_id)`
 * @returns {string}
 */
function docLockDir(scopeId) {
  return path.join(paths.stateDir(), `.lock-doc-${lib.sanitizeSessionId(scopeId)}`);
}

/**
 * The lock guarding a scope's TURN COUNTER (`turn-count-`), which also carries
 * the "refusal already announced" flag.
 * ⚠️ A SEPARATE NAME FROM `docLockDir`, DELIBERATELY: the counter is bumped once
 *    per human turn while the injection state is written on every action, and
 *    merging them would make every frame queue behind the counter for nothing.
 * @param {string} scopeId `lib.scopeId(session_id, agent_id)`
 * @returns {string}
 */
function turnLockDir(scopeId) {
  return path.join(paths.stateDir(), `.lock-turn-${lib.sanitizeSessionId(scopeId)}`);
}

// ═══════════════════════════════════════════════════════════════════════
// WHICH LOCK GUARDS WHICH STATE CLASS — the enumeration, in code.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 BORN OF THE LAST WRITER LEFT OUTSIDE, 2026-08-23. `/emit` and `/turn` were
//    brought under the lock that morning and the PreCompact PURGE was not: it
//    deletes durable state files with no mutual exclusion at all, on both lanes.
//    TLC exhibits the consequence (`specs/tla/State.tla`, run `StatePurgeWindow`):
//    a writer whose snapshot PREDATES the purge republishes it afterwards, a
//    `doc-seen-` record is RESURRECTED, and a document that was owed is WITHHELD
//    for the whole rest of the session. No error, no badge, nothing red.
//
// 🔑 WHY THE TABLE LIVES HERE AND NOWHERE ELSE. A purge sweeps FIVE prefixes
//    that STRADDLE BOTH addresses, so it is the first caller that has to ask
//    "which lock guards this key?" — and that is the same question as "what is
//    the address", which this module already owns. The two JSDoc blocks above
//    already ENUMERATED the classes, in prose; prose is what goes stale.
// 🛑 A CALLER NEVER COMPOSES A LOCK NAME AND NEVER CLASSIFIES A KEY ITSELF. A
//    lock only serialises writers that take the SAME name: two spellings are two
//    locks, and two locks are NO lock — silently, with every suite green.
// ⚠️ THE SCOPE IS DERIVED FROM THE KEY, NEVER PASSED BESIDE IT. A key IS
//    `<prefix><scopeId>`, so the scope is what remains once the prefix is
//    removed: taking it as a second argument would let a caller hand a key and a
//    scope that do not match, i.e. take the wrong lock while looking correct.
// 🛑 AN UNDECLARED PREFIX IS A NAMED REFUSAL, never a default to one of the two.
//    Guessing an address is exactly how a second lock is born. A sixth store
//    therefore declares its class here in the same gesture as its prefix — and
//    `store-resolve.test.js` confronts this table with `ctxroute-reset.js`'s
//    purge loop, so the omission is RED before it can ship.

/** Keys guarded by `turnLockDir` — the turn counter and its refusal flag. */
const TURN_KEYS = ['turn-count-'];
/** Keys guarded by `docLockDir` — the injection state and its queue. */
const DOC_KEYS = ['doc-seen-', 'ctxroute-seen-', 'plan-', 'remainder-'];

/**
 * THE LOCK GUARDING A STATE KEY (or a key PREFIX, which is a key of the empty
 * scope followed by the scope — the same string either way).
 * @param {string} key e.g. `doc-seen-<scope>`, `turn-count-<scope>`
 * @returns {string} the lock directory, at the SAME address as every other writer
 */
function lockDirForKey(key) {
  const k = String(key);
  for (const p of TURN_KEYS) if (k.startsWith(p)) return turnLockDir(k.slice(p.length));
  for (const p of DOC_KEYS) if (k.startsWith(p)) return docLockDir(k.slice(p.length));
  throw new Error(
    `store-resolve: no lock class declared for state key "${k}" — declare its prefix in `
    + 'TURN_KEYS or DOC_KEYS. Never compose a lock name at the call site: two spellings are two '
    + 'locks, and two locks are no lock.');
}

module.exports = {
  resolveStore, BACKENDS, STATE_ABSENT, WITHOUT_LOCK,
  docLockDir, turnLockDir, lockDirForKey, TURN_KEYS, DOC_KEYS,
};
