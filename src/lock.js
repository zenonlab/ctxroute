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
// ⚠️ TIMEOUT + stale file: if a process dies while holding the lock (crash),
// the lock directory would stay orphaned forever without this mechanism —
// any lock older than STALE_MS is considered abandoned and forced.
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
const STALE_MS = 5000; // a lock older than this = dead process, we force it

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
      acquired = true;
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') break; // unexpected error (permissions...) → fail-open, no lock
      // Lock already taken by ANOTHER process: if stale (crash), force it.
      try {
        const st = fs.statSync(lockDir);
        if (Date.now() - st.mtimeMs > STALE_MS) {
          fs.rmdirSync(lockDir); // releases the abandoned lock, retries immediately
          continue;
        }
      } catch {
        // lock vanished between the mkdirSync and the statSync (the other released it) → retry
      }
      sleepMs(RETRY_DELAY_MS);
    }
  }

  if (!acquired) return fallback; // timeout: fail-open, never blocks the hook

  try {
    return fn();
  } finally {
    try { fs.rmdirSync(lockDir); } catch { /* already deleted or permission — fail-open */ }
  }
}

module.exports = { withLock };
