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
// ⚠️ The journal writer, for the one thing this store used to swallow in
//    silence: a write that is LOST. Fail-open, never throws.
const log = require('./log');

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
 * 🔴 AND THE COUNT OF IMMEDIATE RETRIES WAS THE WRONG BOUND — REPRODUCED LOCALLY
 *    2026-10-02, after two months as "unreproducible". A 10 s race (instead of the
 *    suite's 1.5 s) read `{}` 28 times out of 83,245 on Windows, EVERY ONE after
 *    exactly 20 consecutive `ENOENT`, i.e. this loop running out. Measured with no
 *    bound: the window lasts 8-17 ms (105 immediate reads) — the WRITER losing the
 *    processor between the two halves of a replacing rename, one scheduler quantum.
 *    No count of immediate reads covers a quantum on every machine, and waiting
 *    longer would charge that wait to every read of a state that truly does not
 *    exist yet.
 * ✅ SO THE QUESTION IS ASKED OF WHAT KNOWS: is a write of THIS key in flight? Its
 *    temporary sibling (`<name>.<pid>.<rand>.tmp`, `saveState` below) exists from
 *    before the rename until it completes — MEASURED present in 3 windows out of 3.
 *    No sibling ⇒ the absence is a FACT and `{}` is TRUE, answered at once. A sibling
 *    ⇒ the read is retried; on Windows listing the directory itself waits for the
 *    rename to finish (10-17 ms measured), so the next read lands after it.
 * ⚠️ BOUNDED STILL, by the same `RENAME_RETRIES`: a writer killed between its tmp and
 *    its rename leaves a sibling behind, and a reader of that key then pays the bound
 *    and answers `{}` exactly as before, until the PreCompact sweep removes the tmp.
 *
 * @param {(chemin: string) => string} lire injected reader (the real one is `fs`)
 * @param {string} filePath
 * @param {(chemin: string) => boolean} [writeInFlight] whether a write of `filePath`
 *   is under way (the real one lists the directory); injected by the suite
 */
function readThrough(lire, filePath, writeInFlight = writeInFlightOnDisk) {
  for (let i = 0; i < RENAME_RETRIES; i += 1) {
    try {
      return JSON.parse(lire(filePath));
    } catch (err) {
      if (!err || /** @type {NodeJS.ErrnoException} */ (err).code !== 'ENOENT') return {};
      if (!writeInFlight(filePath)) return {};
    }
  }
  return {};
}

/**
 * Does a temporary sibling of `filePath` exist, i.e. is a `saveState` of that key
 * between its write and its rename? Fail-open to "no": an unreadable directory
 * cannot hold a write in flight we could wait for.
 * @param {string} filePath
 * @returns {boolean}
 */
function writeInFlightOnDisk(filePath) {
  let names;
  try { names = fs.readdirSync(path.dirname(filePath)); } catch { return false; }
  return names.some((n) => isTmpOf(filePath, n));
}

// 🛑 THE TEMPORARY NAME HAS TWO READERS AND ONE AUTHOR, AND THEY LIVE SIDE BY SIDE ON
//    PURPOSE. `saveState` writes `tmpFileFor(dest)`; `writeInFlightOnDisk` recognises it
//    with `isTmpOf`. If the two drift apart, the reader stops seeing writes in flight and
//    the 2026-10-02 re-delivery comes back with no cell red but the one that pairs them
//    (`session-store.test.js`, "the tmp saveState writes is the tmp the reader recognises").
//    ⚠️ The shape (`<dest>.<pid>.<rand>.tmp`) also carries the store's PREFIX, which is
//    what lets the PreCompact sweep and the age eviction find an orphan: keep both.
/** @param {string} dest @returns {string} a unique temporary sibling of `dest` */
function tmpFileFor(dest) {
  return `${dest}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
}

/** @param {string} dest @param {string} name a directory entry @returns {boolean} */
function isTmpOf(dest, name) {
  return name.startsWith(path.basename(dest) + '.') && name.endsWith('.tmp');
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
  const tmp = tmpFileFor(dest);
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
    let last = null;
    for (let i = 0; i < RENAME_RETRIES; i++) {
      try { fs.renameSync(tmp, dest); return; } catch (err) { last = err; /* retry right away */ }
    }
    fs.unlinkSync(tmp); // exhausted: never leave a leftover abandoned in state/
    // 🛑 THE WRITE IS LOST HERE, AND IT IS SAID (2026-10-04, M): the caller
    //    carries on fail-open, the journal keeps the trace.
    log.hookError('session-store', Object.assign(
      new Error(`state write lost: rename failed ${RENAME_RETRIES} times (${prefix})`),
      { code: last && /** @type {any} */ (last).code }));
  } catch (err) {
    /* fail-open: an unwritable store never breaks the injection — but it is said */
    log.hookError('session-store', err);
    try { fs.unlinkSync(tmp); } catch { /* nothing to clean up */ }
  }
}

/**
 * ERASE EVERY STATE WHOSE FILE NAME STARTS WITH `prefixeCle` (2026-08-22).
 *
 * 🔑 IT LIVES HERE BECAUSE THIS MODULE OWNS THE FILES. Until today the sweep was
 *    written inline in `ctxroute-reset.js`, and the daemon — which now writes the
 *    durable class through to these same files — grew a SECOND copy of it. Two
 *    hand-written traversals of one truth diverge, and this repository has paid
 *    that bill twice (㊱, ㊳). One owner, two callers.
 * ⚠️ A PURGE ONLY EVER DESTROYS AND IS IDEMPOTENT — that is what makes it the one
 *    operation safe to perform on both lanes: it can never RECORD a delivery, so
 *    it cannot make two memories. Every other operation stays daemon-only on the
 *    client lane.
 * ⚠️ AN EMPTY PREFIX IS REFUSED, LOUDLY. Every name starts with the empty string,
 *    so one malformed caller would erase the WHOLE fleet's memory in a single
 *    call — the same guard the daemon's `/purge` route already carries.
 * ⚠️ FAIL-OPEN like every write here: an unreadable directory yields 0, never an
 *    exception. A purge that cannot run costs one document not re-injected; a
 *    purge that throws costs the compaction it was called from.
 * ⚠️ ONE `readdir` PER CALL, and the traversal is the DIRECTORY's size — the same
 *    order the eviction sweep already pays on this folder, which is bounded by
 *    count (`state-eviction-pure.js`). It is NOT sized by the number of prefixes:
 *    a caller purging five prefixes should read the listing once, which is why
 *    this takes ONE prefix and returns a count rather than doing the loop itself.
 *
 * @param {string} keyPrefix file-name prefix, e.g. `doc-seen-<scope>`
 * @param {string[]} [listing] the directory listing, when the caller already has it
 * @returns {number} how many files were actually removed
 */
function purgeByPrefix(keyPrefix, listing) {
  if (typeof keyPrefix !== 'string' || keyPrefix === '') return 0;
  const dir = paths.stateDir();
  let itemNames = listing;
  if (!Array.isArray(itemNames)) {
    try { itemNames = fs.readdirSync(dir); } catch { return 0; }
  }
  let n = 0;
  for (const f of itemNames) {
    if (!f.startsWith(keyPrefix) || !f.endsWith('.json')) continue;
    try { fs.rmSync(path.join(dir, f), { force: true }); n += 1; } catch { /* fail-open */ }
  }
  return n;
}

module.exports = { storeFile, loadState, saveState, readThrough, purgeByPrefix, tmpFileFor, isTmpOf };
