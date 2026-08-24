// ═══════════════════════════════════════════════════════════════════════
// lifecycle-log.js — THE I/O HALF of the daemon journal. It decides NOTHING.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 WHY IT EXISTS, MEASURED 2026-08-22: the state daemon died and restarted
//    NINE TIMES IN ONE HOUR with exit code 90 and left NO TRACE AT ALL — no
//    instant, no reason, nothing to count. The deaths are correct by design
//    (`watchOwnCode` refuses to serve stale logic); the SILENCE was the defect.
//    A process meant to run for months unattended must be able to say what
//    happened to it, or every diagnosis becomes a guess.
//
// 🛑 THE DECISION IS NOT HERE. `lifecycle-log-pure.js` decides whether to rotate
//    and what a record looks like; this file only asks the filesystem. Written
//    next to the `appendFileSync` those rules would be measured by NOTHING —
//    Stryker never mutates I/O, so a false rule would sit green for ever, and a
//    false gate REASSURES. Same split as `state-eviction` / `state-eviction-pure`.
//
// 🛑 BOUNDED FOR LIFE, AND THE BOUND IS STRUCTURAL. 256 KB per file, and the
//    rotation renames the journal onto `.1` — a rename OVERWRITES, so exactly
//    two files can ever exist: 512 KB, at any traffic, at any uptime. That is
//    the number declared in `disk-writers.json`. ⚠️ NEVER turn this into a
//    `.1 .2 .3` scheme and NEVER add a second log file: the ceiling would stop
//    being a consequence of the mechanism and become a number to maintain.
//
// 🛑 FAIL-OPEN, WITHOUT EXCEPTION — a daemon must NEVER die because its logging
//    failed. A full disk, a read-only directory, a file locked by another
//    process, a `state/` that cannot be created: all of them mean NO LINE, and
//    the service carries on untouched. Housekeeping never delays and never
//    breaks the thing it observes. ⚠️ That is why `record` RETURNS a boolean
//    instead of throwing, and why NOTHING in this file re-raises.
//
// ⚠️ THE PATH COMES FROM `paths.js`, NEVER FROM A LITERAL and never from an
//    ad-hoc `path.join(__dirname, 'state')`. That exact duplication has already
//    diverged silently in this repository twice. `state/` is gitignored, which
//    is also what makes it the right home for a file that carries a pid and an
//    OS error message on a PUBLIC repository.
//
// ⚠️ IT IS SWEPT BY NOBODY, AND THAT IS DELIBERATE. `state-eviction` bounds the
//    `.json` stores by count; this journal bounds ITSELF by size, which is the
//    right policy for an append-only file and the wrong one for a store. The
//    eviction sees a `.log` and leaves it alone — two ceilings, one per class,
//    never one mechanism pretending to cover both.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const fs = require('fs');
const path = require('path');
const paths = require('./paths');
const pure = require('./lifecycle-log-pure');

// ⚠️ ONE fixed name, plus the `.1` its own rotation produces. A journal whose
//    name varies is a journal nobody finds at the moment they need it.
const FILE_NAME = 'ctxroute-daemon.log';

// ⚠️ LAZY, like every accessor of `paths.js`: resolving at load time would
//    freeze the address before the environment a test set can be read.
function logPath() {
  return path.join(paths.stateDir(), FILE_NAME);
}

/**
 * Writes ONE lifecycle record, or writes nothing at all.
 *
 * ⚠️ THE ROTATION IS DECIDED BEFORE THE WRITE, on the size the filesystem
 *    reports. An absent file reports nothing, which is size 0, which is "do not
 *    rotate" — the creation path and the steady path are the same code.
 * ⚠️ The directory is created here rather than assumed. This is called a handful
 *    of times per DAEMON LIFE, never per request, so an idempotent `mkdirSync`
 *    costs nothing and removes a whole class of "the very first record of a
 *    fresh clone is lost".
 *
 * @param {string} event one of `pure.EVENTS`; anything else writes NOTHING.
 * @param {Record<string, unknown>} [fields] extra facts, `null`/`undefined` omitted.
 * @param {{file?: string, maxBytes?: number, now?: () => string}} [opts]
 *   INJECTION POINTS FOR TESTS ONLY — production passes none of them. ⚠️ Do not
 *   promote them to configuration: a journal of deaths that moves around is a
 *   journal nobody finds when it matters.
 * @returns {boolean} whether a line actually reached the disk. Callers ignore
 *   it; the suite does not, and that is what stops this being a silent no-op.
 */
function record(event, fields, opts) {
  try {
    const o = opts || {};
    const clock = typeof o.now === 'function' ? o.now : () => new Date().toISOString();
    const line = pure.formatEvent({ at: clock(), event, fields });
    // ⚠️ A REFUSED EVENT IS NOT AN ERROR, it is the closed vocabulary doing its
    //    job. Returning here is what keeps an unknown name from ever costing a
    //    byte of disk.
    if (line === null) return false;
    const file = o.file || logPath();
    const maxBytes = o.maxBytes === undefined ? pure.MAX_BYTES : o.maxBytes;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    let sizeBytes = 0;
    try {
      sizeBytes = fs.statSync(file).size;
    } catch {
      /* absent ⇒ size 0 ⇒ no rotation, we create it */
    }
    if (pure.shouldRotate({ sizeBytes, maxBytes })) {
      // ⚠️ THE RENAME OVERWRITES `.1`, AND THAT IS THE ENTIRE CEILING. It is not
      //    a cleanup step that could be forgotten: the bound is the operation.
      fs.renameSync(file, file + '.1');
    }
    fs.appendFileSync(file, line + '\n');
    return true;
  } catch {
    /* 🛑 the trace must NEVER cost the service — see the header */
    return false;
  }
}

module.exports = { record, logPath, FILE_NAME };
