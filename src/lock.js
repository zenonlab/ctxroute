#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// Inter-process lock, synchronous, based on fs.mkdirSync (I/O — no mutation)
// ═══════════════════════════════════════════════════════════════════════
//
// PROBLEM SOLVED: Claude Code can execute INDEPENDENT tool calls
// in parallel (documented in the system prompt: "make all independent tool
// calls in parallel"). If two concurrent MCP calls target the SAME
// session_id, two distinct `node legacy-mcp-inject.js` processes can
// read→modify→write state/ctxroute-seen-<session_id>.json at the same time:
// a classic read-modify-write race condition, silent lost update
// (the 2nd process overwrites the state of the 1st without seeing its changes).
// ⚠️ Doctrine signal: "NON-SERIALIZED concurrency on shared mutable state"
// → serialization mandatory (not just documenting the risk).
//
// FIX: `fs.mkdirSync` is ATOMIC at the OS level (Windows AND POSIX) — two
// processes attempting to create the SAME directory, only one succeeds, the other
// receives EEXIST. We use it as a cross-process lock primitive: the
// process that succeeds at the mkdir owns the lock, and deletes it when releasing it.
//
// ⚠️ SYNCHRONOUS and brief by construction: each hook is a short-lived
// process (reads stdin, decides, exits). No deadlock possible between
// DIFFERENT processes of this hook (same lock, same resource, never nested).
// ⚠️ A DEAD HOLDER MUST BE FREED: if a process dies while holding the lock,
// the lock directory survives it (no OS removes a directory on process exit)
// and would stay orphaned forever. WHO IS ASKED about that death is the
// subject of the next block, and it is the whole design of this file.
//
// ═══════════════════════════════════════════════════════════════════════
// 🛑 WE ASK THE KERNEL WHETHER THE HOLDER LIVES. WE NEVER TIME IT.
// ═══════════════════════════════════════════════════════════════════════
// 🔴 UNTIL 2026-08-23 THIS FILE READ `Date.now() - mtime > 5000` AND CALLED
//    THAT A DEATH. It is an INFERENCE, and it was the only clock used as a
//    liveness verdict in all of `src/`. Forcing a lock on it lets a SECOND
//    writer into the critical section while the first is merely DESCHEDULED —
//    a lost update, in silence, precisely when the machine is saturated, i.e.
//    precisely when hundreds of agents run. TLC proved it before the code did
//    (`specs/tla/State.tla`, run `StateStaleForcing`: the lock is TAKEN and a
//    record is lost anyway).
// ✅ THE AUTHORITY IS LOCAL AND IT ANSWERS INSTANTLY: the OPERATING SYSTEM
//    knows whether a process exists. `process.kill(pid, 0)` sends NO signal —
//    official Node doc (v22, read 2026-08-23): *"Sending signal 0 can be used
//    as a platform independent way to test for the existence of a process."*
//    `ESRCH` is therefore a PROOF of death; nothing else in this file is.
//    Same rule as `kernel-bind.js`, which asks the kernel who owns a socket
//    instead of deducing it from a file's presence. No probe, no heartbeat,
//    no delay used as a verdict.
//
// 🛑 THE PROOF ONLY RUNS ONE WAY, AND THAT ASYMMETRY IS THE DESIGN.
//    · `ESRCH`                  ⇒ no process carries that pid ⇒ the holder is
//                                 DEAD. Forced immediately, with no waiting.
//    · returns true, or `EPERM` ⇒ a process carries that pid. NOT a proof it
//                                 is OUR holder (see residual ① below), but it
//                                 is enough to FORBID forcing: a living holder
//                                 must never be evicted. We wait, and the
//                                 fail-open timeout below bounds the wait.
//    ⇒ we force on a PROVEN death and on nothing else. "Probably dead" is the
//    exact sentence this file exists to stop saying.
//
// 🛑 KNOWN RESIDUAL ①, PID REUSE — NAMED, NOT HIDDEN, AND NOT CLOSEABLE HERE.
//    The same Node doc says it outright: *"the signal may be delivered to some
//    other process with the same PID"*. A recycled pid therefore answers
//    "alive" for a dead holder, and that lock is never forced: contenders fail
//    open (their write is SKIPPED) until the unrelated process exits.
//    ⚠️ MEASURED, NOT ASSUMED: making a pid unique in time needs the holder's
//    START TIME, and Node exposes none — `os` has no process start time, no
//    boot id and no process enumeration (v22 API index, read 2026-08-23), and
//    `/proc/<pid>/stat` exists on Linux ONLY. There is no cross-OS pure-Node
//    answer, and a native module is refused: this repo is public and installs
//    anywhere. ⇒ DECLARED as a residual. Do NOT "fix" it with a timer — that
//    is the defect this block removed.
//
// 🛑 KNOWN RESIDUAL ②, THE TWO-SYSCALL WINDOW — and it is why ONE clock still
//    exists in this file, scoped to nothing else. `mkdirSync` is the atomic
//    step, so the holder can only write WHO IT IS on the following syscall. A
//    death landing between the two leaves a lock NOBODY CAN IDENTIFY: the
//    kernel cannot be asked about a pid that was never recorded. That is
//    `undecidable` in the temporal budget's vocabulary — no local authority
//    holds the fact — so THERE, and only there, an unidentified lock is forced
//    after `UNIDENTIFIED_HOLDER_MS`.
//    ⚠️ NEVER widen this clock back to identified locks: an identified holder
//    is answered by the kernel, and the kernel is never overruled by a delay.
//    ⚠️ A holder that CANNOT record itself RELEASES instead of holding (see
//    `withLock`), so "no record" means "died in the window" and never "alive
//    but unwritten" — without that, this clock would re-open the lost update.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const fs = require('fs');
const path = require('path');

const RETRY_DELAY_MS = 10;
// ⚠️ Env var RESERVED FOR TESTS (same doctrine as the env vars of paths.js —
//    never a user setting): the CONCURRENCY tests prove
//    the ATOMICITY of the lock (no lost write), not its AVAILABILITY (the
//    fail-open timeout, a separate and intentional choice). Under load (saturated CI, parallel
//    suites = 30 spawns), 2 s expire LEGITIMATELY → fallback → write
//    skipped = false red on atomicity. The test raises the timeout to
//    neutralize the availability dimension. In PROD: always 2000 ms.
const DEFAULT_TIMEOUT_MS = Number(process.env.CTXROUTE_LOCK_TIMEOUT_MS) || 2000;

// 🛑 THE ONLY CLOCK LEFT IN THIS FILE, AND IT JUDGES ONE THING: a lock whose
//    holder was NEVER RECORDED (residual ② at the top). An IDENTIFIED holder is
//    decided by the kernel, instantly, and this number never applies to it.
//    ⚠️ NEVER rename this back to something that reads like a general staleness
//    bound: the name is what stops the next reader from widening its scope.
const UNIDENTIFIED_HOLDER_MS = 5000;

// The holder writes its pid HERE, inside the lock directory it just won.
const HOLDER_FILE = 'holder';

/**
 * Is the lock's recorded holder PROVABLY dead?
 *
 * 🛑 FAIL-CLOSED ON IGNORANCE: every path that is not a kernel proof of death
 *    returns `false`. Forcing a lock we are not sure about is exactly the lost
 *    update this module was rewritten to remove — when in doubt we WAIT, and
 *    `withLock`'s fail-open timeout keeps that wait bounded.
 *
 * @param {string} lockDir
 * @returns {{dead: boolean, identified: boolean}} `dead` is a PROOF, never a guess.
 *   `identified` says whether a holder pid could be read at all — the caller
 *   needs that to tell "the kernel says alive" from "there is nobody to ask".
 */
function holderStatus(lockDir) {
  let brut;
  try {
    brut = fs.readFileSync(path.join(lockDir, HOLDER_FILE), 'utf8');
  } catch (e) {
    // ⚠️ ONLY a genuine ABSENCE counts as "unidentified". Any other read error
    //    (permissions, I/O) is a REAL problem, and treating it as an absence
    //    would hand the clock a case the kernel could have answered.
    return { dead: false, identified: !(e && e.code === 'ENOENT') };
  }
  const pid = Number(String(brut).trim());
  if (!Number.isInteger(pid) || pid <= 0) return { dead: false, identified: false };
  try {
    process.kill(pid, 0); // sends NOTHING — documented existence test
    return { dead: false, identified: true }; // a process carries that pid
  } catch (e) {
    // ESRCH = no such process. THE proof, and the only one.
    // EPERM = it exists but belongs to another user ⇒ ALIVE, never forced.
    return { dead: !!e && e.code === 'ESRCH', identified: true };
  }
}

/** Removes an abandoned lock, holder record included. */
function forceRelease(lockDir) {
  try { fs.rmSync(lockDir, { recursive: true, force: true }); } catch { /* another contender won the race */ }
}

// Short synchronous BLOCKING wait (fs.mkdirSync busy-wait). No setTimeout
// possible in pure synchronous code → loop on Atomics.wait (available Node >=8.10, zero deps).
function sleepMs(ms) {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    // Fallback if SharedArrayBuffer is unavailable (restricted environment):
    // bounded CPU busy-loop — costly but only for a delay of a few ms.
    const end = Date.now() + ms;
    while (Date.now() < end) { /* intentional busy-wait, bounded by RETRY_DELAY_MS */ }
  }
}

// Acquires the lock (blocking, with a timeout), runs `fn`, ALWAYS releases the
// lock (even if `fn` throws). Returns the value of `fn`, or `fallback` if the
// lock could not be acquired within the timeout (FAIL-OPEN: never block
// the hook indefinitely because of lock contention).
function withLock(lockDir, fn, { timeoutMs = DEFAULT_TIMEOUT_MS, fallback = undefined } = {}) {
  // ⚠️ REAL BUG (found in CI 15/07/2026, NOT locally): on a FRESH
  // checkout, the PARENT directory of lockDir (state/) does not exist yet →
  // fs.mkdirSync(lockDir) fails with ENOENT (not EEXIST) → interpreted as
  // an "unexpected error" → lock never acquired → fallback everywhere. Locally,
  // state/ already existed from previous runs, hiding the bug.
  // FIX: create the chain of PARENT directories once, upfront, with
  // `recursive: true` (idempotent — safe even if several concurrent processes
  // call it at the same time, none throws EEXIST). The acquisition of the lock
  // itself remains on the mkdirSync WITHOUT recursive just after (only this
  // last level must be atomic/exclusive).
  try { fs.mkdirSync(path.dirname(lockDir), { recursive: true }); } catch { /* fail-open below if really broken */ }

  const deadline = Date.now() + timeoutMs;
  let acquired = false;

  while (Date.now() < deadline) {
    try {
      fs.mkdirSync(lockDir); // atomic: fails with EEXIST if already taken
      // 🛑 SAY WHO WE ARE, OR DO NOT HOLD. A lock nobody can identify can only
      //    ever be freed by the clock, so a holder that cannot record itself
      //    RELEASES instead — otherwise "no record" would stop meaning "died in
      //    the two-syscall window" and the clock would re-open the lost update
      //    on a perfectly ALIVE holder.
      try {
        fs.writeFileSync(path.join(lockDir, HOLDER_FILE), String(process.pid));
      } catch {
        forceRelease(lockDir);
        break; // fail-open: no lock, rather than an unidentifiable one
      }
      acquired = true;
      break;
    } catch (e) {
      // 🔴 A TRANSIENT KERNEL CODE IS NOT A REFUSAL, AND TREATING IT AS ONE
      //    SILENTLY DROPPED STATE WRITES — MEASURED 2026-08-23 at the live fan-out.
      //    On Windows a directory whose deletion is still PENDING answers `EPERM`
      //    to `mkdir`, and the previous line read every code but `EEXIST` as
      //    unrecoverable: the section never ran, the caller took the fallback, and
      //    the update was never made. **12 of 768 acquisitions (1.6 %) with 32
      //    writers on one address** — 32 is exactly the frame count of ONE action.
      // 🛑 THE FIX IS TO KEEP TRYING UNTIL THE DEADLINE, NEVER TO RAISE THE
      //    TIMEOUT: the deadline already bounds us, and a longer wait would trade a
      //    dropped write for a slower hook without removing the class.
      // ⚠️ THE LIST IS CLOSED AND EVERY MEMBER IS A KERNEL FACT ABOUT A
      //    DIRECTORY IN TRANSITION, never a guess: `EPERM`/`EACCES` (deletion
      //    pending on Windows), `EBUSY` (the entry is being operated on),
      //    `ENOTEMPTY`/`ENOENT` (a peer is releasing between our two syscalls).
      //    A code OUTSIDE it is a REAL defect — a broken path, a read-only volume
      //    — and it still breaks out at once. Widening this list to "retry
      //    everything" would turn a permission bug into a two-second hang.
      const TRANSIENT = e.code === 'EPERM' || e.code === 'EACCES' || e.code === 'EBUSY'
        || e.code === 'ENOTEMPTY' || e.code === 'ENOENT';
      if (TRANSIENT) { sleepMs(RETRY_DELAY_MS); continue; }
      if (e.code !== 'EEXIST') break; // a real, non-transient failure → fail-open, no lock
      // Lock already taken by ANOTHER process. ASK THE KERNEL whether it lives.
      const state = holderStatus(lockDir);
      if (state.dead) {
        forceRelease(lockDir); // PROVEN dead: released at once, no waiting
        continue;
      }
      if (!state.identified) {
        // Nobody to ask (residual ②): the ONLY case the clock still judges.
        try {
          const st = fs.statSync(lockDir);
          if (Date.now() - st.mtimeMs > UNIDENTIFIED_HOLDER_MS) {
            forceRelease(lockDir);
            continue;
          }
        } catch {
          // lock vanished between the mkdirSync and the statSync (the other released it) → retry
        }
      }
      sleepMs(RETRY_DELAY_MS);
    }
  }

  if (!acquired) return fallback; // timeout: fail-open, never blocks the hook

  try {
    return fn();
  } finally {
    // ⚠️ RECURSIVE, and that is NOT cosmetic: the lock directory now contains
    //    the holder record, so a plain `rmdirSync` would throw ENOTEMPTY and
    //    leave the lock behind — held by nobody, freed only by the clock.
    forceRelease(lockDir);
  }
}

module.exports = { withLock };
