// ═══════════════════════════════════════════════════════════════════════
// SESSION-STORE — per-session state I/O (JSON file under state/). SHARED.
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ Extracted on 16/07/2026 (jscpd gate): legacy-mcp-inject.js (dedup by SERVER,
//    prefix 'ctxroute-seen-') and doc-inject.js (dedup by DOC, 'doc-seen-')
//    carried the SAME storeFile/loadState/saveState trio — two copies of one
//    and the same truth that diverge silently.
// ⚠️ FAIL-OPEN: unreadable state = {} (start over), unwritable state =
//    silence (never break the injection over a disk problem).
// ⚠️ DISTINCT prefixes are mandatory: the two hooks coexist in state/,
//    a shared prefix would mix servers and docs in the same file.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const fs = require('fs');
const path = require('path');
const { sanitizeSessionId } = require('./lib-pure');
const paths = require('./paths');

// Number of IMMEDIATE retries of the `rename` (no waiting, cf saveState).
// 20 measured as sufficient under a pathological load (reader in a tight loop):
// 1,045 failures → 0. In production the contention is nowhere near.
const RENAME_RETRIES = 20;

function storeFile(prefix, sessionId) {
  return path.join(paths.stateDir(), `${prefix}${sanitizeSessionId(sessionId)}.json`);
}

/**
 * READ A STATE, CROSSING THE WINDOW IN WHICH ITS NAME DOES NOT EXIST.
 *
 * 🔴 THE DEFECT, AND ITS CAUSE IS ESTABLISHED — TWO CONCORDANT CI MEASUREMENTS
 *    (2026-08-20). Replacing a file on a Windows runner leaves a window during
 *    which the NAME is absent. A reader landing in it gets `ENOENT`, answers
 *    `{}`, and that `{}` ASSERTS "nothing has ever been injected" ⇒ the document
 *    is delivered a second time. Measured twice on the same suite:
 *    `{"ENOENT":512}` then `{"ENOENT":593,"transient":1}` — **100 % absence,
 *    zero EPERM, zero partial read**, and the `transient` proves the file WAS
 *    there right after. The atomic write was never in question.
 * 🛑 UNREPRODUCIBLE LOCALLY — 0 out of 7,164 even with reader and writer pinned
 *    to a SINGLE core. That is why the retry is not "tested" by racing: the
 *    DECISION is isolated from the I/O and exercised directly (house doctrine),
 *    with the reader injected. Racing to prove a race is how a suite becomes
 *    flaky in turn.
 * ⚠️ ONLY `ENOENT` IS RETRIED, and that is the whole guarantee: absence is the
 *    ONE error a concurrent rename can fabricate. `EPERM`, `EACCES` or a
 *    truncated JSON are REAL problems — retrying them would hide them, and
 *    hiding a problem is how a silent bug is born.
 * ⚠️ NO DELAY, and none is needed: the window is closed by the OS itself, so an
 *    IMMEDIATE retry either finds the file or proves it is genuinely gone. Same
 *    shape and same bound as the write side above.
 * ⚠️ A state that never existed still answers `{}` — a TRUE `{}` — after
 *    exhausting the attempts in a few microseconds. That case has its own
 *    counter-proof in the suite; the retry may cross an absence, it may never
 *    invent a presence.
 *
 * @param {(chemin: string) => string} lire injected reader (the real one is `fs`)
 * @param {string} chemin
 */
function readThrough(lire, chemin) {
  for (let i = 0; i < RENAME_RETRIES; i += 1) {
    try {
      return JSON.parse(lire(chemin));
    } catch (err) {
      if (err && /** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT') continue;
      return {};
    }
  }
  return {};
}

function loadState(prefix, sessionId) {
  return readThrough((c) => fs.readFileSync(c, 'utf8'), storeFile(prefix, sessionId));
}

// 🛑 ATOMIC WRITE MANDATORY — tmp + `rename`, NEVER a direct `writeFileSync`
//    on the destination. The latter TRUNCATES before filling: a concurrent
//    reader sees an empty file, `loadState` returns `{}`, and that `{}` ASSERTS
//    "nothing has ever been injected" ⇒ phantom re-injection. MEASURED on the
//    real size of the corpus: 9,596 hollow reads out of 24,147.
//    The lock-less fallback of `pretool-core.js` reads WITHOUT a lock by construction —
//    so it is up to the writer to make the state uninterruptible. `rename` is
//    atomic on POSIX as well as on Windows. Same pattern as `canary-check.js`.
// ⚠️ UNIQUE tmp name (pid + randomness): two writers of different sessions
//    are not serialized with each other. It carries the store's PREFIX, so
//    `ctxroute-reset.js` sweeps it like the rest — never an orphan leftover.
function saveState(prefix, sessionId, state) {
  const dest = storeFile(prefix, sessionId);
  const tmp = `${dest}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  try {
    fs.mkdirSync(paths.stateDir(), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(state));
    // ⚠️ BOUNDED RETRY MANDATORY — ON WINDOWS, REPLACING A FILE BEING
    //    READ FAILS WITH `EPERM`. MEASURED: 1,045 failures over a 2 s
    //    run, all swallowed by the `catch` ⇒ WRITE LOST SILENTLY, hence
    //    an unrecorded `once`, hence the re-injection we have just fixed.
    //    The atomic write ALONE moved the defect instead of closing it.
    // ⚠️ This is NOT a delay (no `sleep`, no timer): the window lasts
    //    a few microseconds, an IMMEDIATE retry suffices. Measured after
    //    the retry: 0 hollow reads AND 0 lost writes.
    for (let i = 0; i < RENAME_RETRIES; i++) {
      try { fs.renameSync(tmp, dest); return; } catch { /* retry right away */ }
    }
    fs.unlinkSync(tmp); // exhausted: never leave a leftover abandoned in state/
  } catch {
    /* fail-open: an unwritable store never breaks the injection */
    try { fs.unlinkSync(tmp); } catch { /* nothing to clean up */ }
  }
}

module.exports = { storeFile, loadState, saveState, readThrough };
