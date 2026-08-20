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
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const fs = require('fs');
const path = require('path');
// 🛑 THE DECISIONS LIVE NEXT DOOR, AND THAT SPLIT IS NOT COSMETIC. Stryker never
//    mutates an I/O file (equivalent mutants guaranteed), so an LRU or a shape
//    check written HERE would ship measured by nothing. This file owns the
//    disk; `memory-store-pure.js` owns what decides.
const pur = require('./memory-store-pure');

// The ceiling and every eviction rule live in `memory-store-pure.js`.
const MAX_SCOPES = pur.MAX_SCOPES;

/**
 * @param {{ snapshotPath?: string|null }} [options]
 * @returns {{ loadState: Function, saveState: Function, purge: Function,
 *            restore: Function, size: Function, scopes: Function }}
 */
function createMemoryStore(options) {
  const snapshotPath = (options && options.snapshotPath) || null;
  // ⚠️ A `Map` and not a plain object, DELIBERATELY: insertion order is part of
  //    the contract (it is what makes LRU eviction possible without a second
  //    structure), and a session id is arbitrary text that must never be able
  //    to collide with `__proto__` or a prototype method.
  const etat = new Map();

  const cle = pur.key;

  function loadState(prefix, sessionId) {
    const v = pur.touch(etat, cle(prefix, sessionId));
    return v === undefined ? {} : v;
  }

  function saveState(prefix, sessionId, state) {
    const k = cle(prefix, sessionId);
    etat.delete(k);
    etat.set(k, state);
    // ⚠️ EVICT IN THE SAME GESTURE AS THE WRITE. Doing it "later", on a timer or
    //    at shutdown, is the same as not doing it: the timer is one more
    //    temporal call to justify, and a shutdown that never happens evicts
    //    nothing.
    pur.evict(etat, MAX_SCOPES);
    ecrireSnapshot();
  }

  /**
   * PURGE BY PREFIX — what `ctxroute-reset.js` does on the disk store: a
   * compaction empties the real context, so the memory of what was injected
   * before it no longer describes anything.
   * ⚠️ It is an ORDER received from the harness (an EVENT), never a deduction
   *    made here about a session being over.
   */
  function purge(prefixeCle) {
    const n = pur.purge(etat, prefixeCle);
    if (n > 0) ecrireSnapshot();
    return n;
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
      fs.writeFileSync(tmp, JSON.stringify([...etat]));
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
    if (!snapshotPath) return 0;
    try {
      return pur.adopt(JSON.parse(fs.readFileSync(snapshotPath, 'utf8')), etat, MAX_SCOPES);
    } catch {
      return 0;
    }
  }

  return {
    loadState,
    saveState,
    purge,
    restore,
    size: () => etat.size,
    scopes: () => [...etat.keys()],
  };
}

module.exports = { createMemoryStore, MAX_SCOPES };
