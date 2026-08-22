// ═══════════════════════════════════════════════════════════════════════
// MEMORY-STORE — the state of a LIVING daemon. Same API as `session-store`,
// no disk in the path that DECIDES.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 WHY THIS EXISTS, AND IT IS AN ARCHITECTURE STATEMENT, NOT AN OPTIMISATION.
//    Sixteen short-lived processes had no common ground but the disk, so a FILE
//    was made to carry a CONVERSATION between them: a lock to take turns, a
//    tmp+rename to publish, a lock-less fallback when the lock was taken,
//    bounded retries when Windows refused. Every layer simulated, by hand, the
//    one thing an operating system already does: SERIALISE. Three flaky bugs
//    came out of that simulation, all in one day.
// 🛑 THE RULE THIS FILE ENFORCES: the KERNEL for what is alive, the DISK only to
//    survive the death of the process. A daemon accepts connections one at a
//    time onto a single-threaded loop — the mutual exclusion is already there,
//    given by the kernel, for free and without a name. So the state lives HERE,
//    in memory, and nothing coordinates through a file ever again.
//
// ⚠️ THE DISK IS A SAVE, NEVER A CHANNEL. The snapshot is written by the SINGLE
//    owner and read ONCE, at startup, before the socket is open — that is, at
//    the only instant in the daemon's life when no one else can exist. There is
//    therefore no concurrent reader, hence no lock, hence no window, hence no
//    retry on contention: those existed only because a reader was holding the
//    file while the writer wanted to replace it.
// 🛑 BUT THE WRITE STAYS ATOMIC (tmp + rename), AND THE REASON CHANGED. It no
//    longer protects a concurrent reader — it protects against a CRASH. A
//    machine that dies mid-write leaves a truncated file whatever the
//    concurrency, and a corrupt save is worse than no save.
// ⚠️ NO `fsync`, AND THAT IS A DECISION, NOT AN OMISSION. `fsync` buys
//    durability across a POWER LOSS. This state describes a LIVING session, and
//    no session survives a reboot: we would be paying a synchronous flush on
//    every action for a guarantee with no meaning here. If one day this store
//    holds something that must outlive the machine, that trade changes — and it
//    must be re-decided, not inherited.
//
// ⚠️ FAIL-OPEN, IDENTICAL TO THE DISK STORE: an unreadable snapshot yields an
//    EMPTY state, never an exception. The worst case is a document delivered
//    once more, never a hook that breaks an agent's action.
//
// 🔑 THE SNAPSHOT IS NO LONGER WRITTEN ON EVERY MUTATION (2026-08-21), AND THE
//    PROVEN PROPERTY CHANGED — say it plainly rather than let a reader assume the
//    old one. It WAS *"the state survives a restart"*. It IS NOW: **the state
//    survives a CLEAN restart ENTIRELY, and a `kill -9` loses at most the last N
//    mutations.** Losing a mutation costs at most a RE-DELIVERY of a document —
//    never a wrong action, never a corrupt state. That is why the trade is
//    acceptable, and it is the only reason that may be cited for it.
// 🛑 TWO AUTHORITIES, BOTH FACTS, NEITHER A CLOCK: a COUNT of mutations
//    (`memory-store-pure.persistTick`) and this process's own CLEAN EXIT
//    (`flush`). The rule of both lives NEXT DOOR because Stryker never mutates an
//    I/O file — a threshold written HERE would ship measured by nothing. This
//    file only OBEYS: it counts, and it calls.
// 🛑 NO TIMER, NO DEBOUNCE, NO TTL anywhere on this path.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const fs = require('fs');
const path = require('path');
// The single source of paths — a writer names its destination through it, never
// through a literal or an ad-hoc `path.join(__dirname, 'state')`.
const paths = require('./paths');
// 🛑 THE DECISIONS LIVE NEXT DOOR, AND THAT SPLIT IS NOT COSMETIC. Stryker never
//    mutates an I/O file (equivalent mutants guaranteed), so an LRU or a shape
//    check written HERE would ship measured by nothing. This file owns the
//    disk; `memory-store-pure.js` owns what decides.
const pur = require('./memory-store-pure');

// The ceiling and every eviction rule live in `memory-store-pure.js`.
const MAX_SCOPES = pur.MAX_SCOPES;
const MAX_EPHEMERAL = pur.MAX_EPHEMERAL;

// ⚠️ THE DEFAULT CLEAN-EXIT REGISTRAR, INJECTABLE — a test must be able to fire
//    the exit path without ending the process, and 2,000 stores must not pile
//    2,000 listeners onto a long-lived emitter.
// 🛑 `'exit'` AND NOTHING ELSE, AND THE REASON IS THE HOUSE RULE. Installing a
//    `SIGTERM`/`SIGINT` listener SUPPRESSES Node's default termination, i.e. a
//    STORE would start deciding whether its caller lives or dies — the exact
//    defect found on macOS CI when `createServer` threw on `EADDRINUSE`. A store
//    saves; a shell decides to die.
// ⚠️ The handler must stay SYNCHRONOUS: nothing asynchronous scheduled from
//    `'exit'` ever runs (Node doc). `fs.writeFileSync` is precisely what is
//    allowed there.
const DEFAULT_EXIT_HOOK = (fn) => {
  process.on('exit', fn);
  return () => process.off('exit', fn);
};

/**
 * @param {{ snapshotPath?: string|null,
 *           durableStore?: {loadState: Function, saveState: Function, purgeByPrefix: Function}|null,
 *           onExit?: (fn: () => void) => (() => void) }} [options]
 * @returns {{ loadState: Function, saveState: Function, purge: Function,
 *            restore: Function, size: Function, scopes: Function,
 *            flush: Function, close: Function }}
 */
function createMemoryStore(options) {
  const snapshotPath = (options && options.snapshotPath) || null;
  // ⚠️ `Map`s and not plain objects, DELIBERATELY: insertion order is part of
  //    the contract (it is what makes LRU eviction possible without a second
  //    structure), and a session id is arbitrary text that must never be able
  //    to collide with `__proto__` or a prototype method.
  // ⚠️ TWO of them since 21/08/2026, one per LIFETIME (`createState`): a `plan-`
  //    is born at every tool call and dies with its action, a scope key lives as
  //    long as its agent. Under one shared ceiling the ephemeral flood evicted
  //    the durable — one busy agent erasing the whole fleet's memory, silently.
  const etat = pur.createState();

  const cle = pur.key;

  // 🔑 WRITE-THROUGH ON THE DURABLE KEYS — THE DAEMON IS A CACHE, NOT AN OWNER
  //    (2026-08-22). Until today this store OWNED the durable state in RAM and
  //    saved it every N mutations. That made the daemon a SINGLE POINT OF
  //    FAILURE: it dies BY DESIGN at every edit of this repository (stale-code
  //    exit, dozens of times a day), and each death withheld every `once`
  //    document from the WHOLE fleet — 15 silent minutes measured that morning.
  // 🛑 THE FIX IS NOT "DIE LESS". Raising a restart budget from 3 to 100 is the
  //    same patch with a bigger number; the regime is permanent, so the DEATH
  //    must become free. The disk (`session-store`) is the truth again, this
  //    store forwards to it, and a client that cannot reach the daemon reads the
  //    SAME files — never a second memory.
  // ⚠️ ONLY THE DURABLE CLASS. A `plan-` is born at every tool call and dies
  //    with its action (88 % of the state files measured on the live install):
  //    forwarding those would buy nothing and cost one disk write per frame, on
  //    a machine whose SSD wear is a declared budget. Losing an ephemeral key
  //    costs a recomputation, never a re-delivery — that asymmetry is the whole
  //    justification, and it is why the two classes are treated differently.
  // 🛑 NO CACHE OF THE DURABLE CLASS IN RAM, DELIBERATELY. A cached copy would
  //    need validating against a fallback writer, and a validation that is ever
  //    wrong re-delivers documents in silence. One process reading one file is
  //    already sixteen times cheaper than what the disk lane did.
  // 🛑 THE CLASSIFICATION ITSELF IS NOT DECIDED HERE — `pur.isWriteThrough` owns
  //    it, for the same reason `persistTick` lives next door: a rule written in
  //    an I/O shell is a rule Stryker never mutates, hence a rule NOTHING
  //    measures. Inverted, it would send the durable class into RAM and the
  //    ephemeral one to disk with every suite still green. This line may only
  //    ask "do I even have a disk store", which is the shell's own business.
  const durable = (options && options.durableStore) || null;
  const estDurable = (k) => durable !== null && pur.isWriteThrough(k);

  function loadState(prefix, sessionId) {
    if (estDurable(cle(prefix, sessionId))) return durable.loadState(prefix, sessionId);
    const v = pur.touch(etat, cle(prefix, sessionId));
    return v === undefined ? {} : v;
  }

  function saveState(prefix, sessionId, state) {
    if (estDurable(cle(prefix, sessionId))) {
      // ⚠️ `session-store.saveState` is ATOMIC (tmp + bounded rename retries), so
      //    a concurrent reader never sees a half-written file. The read-modify-
      //    write around it is serialised by the caller's `withLock`, which the
      //    daemon now takes for real instead of the no-op it used to pass.
      durable.saveState(prefix, sessionId, state);
      return;
    }
    pur.set(etat, cle(prefix, sessionId), state);
    // ⚠️ EVICT IN THE SAME GESTURE AS THE WRITE. Doing it "later", on a timer or
    //    at shutdown, is the same as not doing it: the timer is one more
    //    temporal call to justify, and a shutdown that never happens evicts
    //    nothing.
    // 🛑 AND THIS IS WHY EVICTION DOES **NOT** FOLLOW THE SNAPSHOT'S CADENCE.
    //    The ceiling bounds RAM, which the count would let overshoot by N
    //    entries; the snapshot bounds DISK, which is what the count exists to
    //    spare. Two budgets, two rhythms — never merge them "for symmetry".
    pur.evict(etat, MAX_SCOPES, MAX_EPHEMERAL);
    compter();
  }

  /**
   * PURGE BY PREFIX — what `ctxroute-reset.js` does on the disk store: a
   * compaction empties the real context, so the memory of what was injected
   * before it no longer describes anything.
   * ⚠️ It is an ORDER received from the harness (an EVENT), never a deduction
   *    made here about a session being over.
   */
  function purge(prefixeCle) {
    let n = pur.purge(etat, prefixeCle);
    // 🛑 THE DURABLE CLASS NOW LIVES ON DISK, SO THE PURGE MUST REACH IT THERE.
    //    Forgetting this half would leave a compaction erasing only the
    //    ephemeral keys: skills and `once` documents would never come back, the
    //    exact production symptom of 2026-08-21. A purge only ever DESTROYS and
    //    is idempotent, so doing it on both sides can never make two memories.
    // 🛑 AND THE SWEEP IS NOT WRITTEN HERE — `session-store.purgeByPrefix` owns
    //    it, because that module owns the files. Written inline it would be a
    //    SECOND hand-made traversal beside the one in `ctxroute-reset.js`, and
    //    two enumerations of one truth diverge (paid twice: ㊱, ㊳).
    if (durable !== null) n += durable.purgeByPrefix(prefixeCle);
    if (n > 0) compter();
    return n;
  }

  // ⚠️ THE BACKLOG: mutations NOT yet on disk. A plain integer, owned by this
  //    shell, read by the pure rule. It is never a timestamp and never a size.
  let enAttente = 0;

  /**
   * ONE MUTATION HAPPENED. The DECISION belongs to `memory-store-pure`; all this
   * function may do is carry the number there and obey the answer.
   * 🛑 NEVER inline a `>=` here: a threshold in an I/O file is a rule Stryker
   *    cannot mutate, hence a rule nothing measures.
   */
  function compter() {
    const t = pur.persistTick(enAttente, pur.PERSIST_EVERY);
    enAttente = t.pending;
    if (t.persist) ecrireSnapshot();
  }

  /**
   * AUTHORITY ② — THE CLEAN EXIT. Writes what the count had not yet flushed.
   *
   * ✅ WHICH EXIT PATHS THIS REALLY COVERS, and it is a list of FACTS about the
   *    runtime, not a hope:
   *      · the event loop emptying (a normal end);
   *      · `process.exit(code)` called explicitly — **this includes the
   *        stale-code restart, `process.exit(90)` in `hooks/http-server.js`,
   *        which is the daemon's MOST FREQUENT death by far** (every edit of this
   *        repository triggers it);
   *      · an uncaught exception, after the default fatal handler.
   * 🛑 WHICH PATHS IT CANNOT COVER — STATED, never implied covered:
   *      · `SIGKILL` / `kill -9` / a power loss: nothing runs, by definition.
   *        That is the case the COUNT bounds, and its cost is at most N−1
   *        re-delivered documents.
   *      · `SIGTERM` / `SIGINT` / `SIGHUP` **with no listener installed** — Node
   *        terminates on the default action and `'exit'` does NOT fire. **A
   *        supervisor's `systemctl stop` takes that path today.** Closing it
   *        requires a SIGNAL HANDLER, and a signal handler belongs to the
   *        executable SHELL (it decides the process's fate), never to a store:
   *        `store.flush()` then `process.exit()` is the shape it must take. Until
   *        a shell does that, a supervisor stop degrades to the `kill -9` case —
   *        bounded, and written here rather than discovered.
   *      · `process.abort()` and a native crash: same, nothing runs.
   * ⚠️ FAIL-OPEN like every write here: `ecrireSnapshot` swallows its own errors.
   * @returns {boolean} whether anything was actually written
   */
  function flush() {
    if (!pur.shouldFlush(enAttente)) return false;
    enAttente = 0;
    ecrireSnapshot();
    return true;
  }

  // ⚠️ REGISTERED ONLY WHEN THERE IS A FILE TO WRITE. A volatile store (no
  //    `snapshotPath`) has nothing to save, so it must not attach a listener to
  //    a long-lived emitter — the suite builds hundreds of them.
  const desarmer = snapshotPath
    ? ((options && options.onExit) || DEFAULT_EXIT_HOOK)(flush)
    : null;

  /** Releases the exit hook. For a test, or a caller that owns several stores. */
  function close() {
    if (typeof desarmer === 'function') desarmer();
  }

  // 🛑 ATOMIC, FOR THE CRASH — never for a concurrent reader (there is none).
  //    A unique temporary name is kept for one reason only: two daemons of two
  //    DIFFERENT repositories could share a state directory, and a shared tmp
  //    name would make them truncate each other's file.
  function ecrireSnapshot() {
    if (!snapshotPath) return;
    const tmp = `${snapshotPath}.${process.pid}.tmp`;
    try {
      fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify(pur.entries(etat)));
      fs.renameSync(tmp, snapshotPath);
    } catch {
      // fail-open: a save that cannot be written must never break an injection.
      try { fs.unlinkSync(tmp); } catch { /* nothing to clean up */ }
    }
  }

  /**
   * RESTORE — called ONCE, at startup, BEFORE the socket is open.
   * 🛑 That ordering is the whole guarantee: at that instant the daemon is the
   *    only thing that exists, so this read has no concurrency to fear. Calling
   *    it later would reintroduce, by hand, the very race this file removes.
   * ⚠️ Anything unreadable or malformed yields an EMPTY state — a fail-open,
   *    exactly like the disk store. A corrupt save costs one extra delivery,
   *    never a broken action.
   */
  function restore() {
    // ⚠️ WHAT WAS JUST READ IS ALREADY ON DISK: the backlog is zero by
    //    definition. Leaving a stale count here would make the first mutation
    //    after a restart land at an arbitrary point in the cycle.
    enAttente = 0;
    if (!snapshotPath) return 0;
    try {
      return pur.adopt(JSON.parse(fs.readFileSync(snapshotPath, 'utf8')), etat, MAX_SCOPES, MAX_EPHEMERAL);
    } catch {
      return 0;
    }
  }

  return {
    loadState,
    saveState,
    purge,
    restore,
    flush,
    close,
    size: () => pur.size(etat),
    scopes: () => pur.keys(etat),
  };
}

module.exports = { createMemoryStore, MAX_SCOPES, MAX_EPHEMERAL, PERSIST_EVERY: pur.PERSIST_EVERY };
