// ═══════════════════════════════════════════════════════════════════════
// lifecycle-log.js — THE DAEMON'S JOURNAL OF ITS OWN LIFE. A thin door onto `log.js`.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 WHY IT EXISTS, MEASURED 2026-08-22: the state daemon died and restarted
//    NINE TIMES IN ONE HOUR with exit code 90 and left NO TRACE AT ALL — no
//    instant, no reason, nothing to count. The deaths are correct by design
//    (`watchOwnCode` refuses to serve stale logic); the SILENCE was the defect.
//    A process meant to run for months unattended must be able to say what
//    happened to it, or every diagnosis becomes a guess.
//
// 🔑 SINCE 2026-10-04 IT WRITES THROUGH `log.js`, THE ONE JOURNAL WRITER, and
//    keeps EVERYTHING it did before (each item held by `lifecycle-log.test.js`):
//    ① `record(event, fields, opts)` returns a boolean and NEVER throws;
//    ② an event outside `lifecycle-log-pure.EVENTS` writes NOTHING — not even
//       the file — and so does an absent instant;
//    ③ the file is `state/ctxroute-daemon.log`, from `paths.js`, lazily;
//    ④ the directory is created if missing (a fresh clone loses no record);
//    ⑤ the rotation happens BEFORE the write, at size >= the ceiling, and a
//       rename OVERWRITES the oldest file — 256 KB × 2 files by default, now
//       the `logging` setting (`maxBytes`, `keptFiles`), bounded by `log-pure`;
//    ⑥ `opts.file`/`opts.maxBytes`/`opts.now` are injection points for tests.
//
// 🛑 THE VOCABULARY STAYS CLOSED HERE, NARROWER THAN THE `daemon` JOURNAL'S:
//    that journal also knows `request` (debug only) and `logging-refused`, and
//    neither is a life event. `record` therefore filters on `EVENTS` FIRST, so a
//    caller can never reach the per-request trace through this door.
//
// 🛑 FAIL-OPEN, WITHOUT EXCEPTION — a daemon must NEVER die because its logging
//    failed (see `log.js`).
//
// ⚠️ IT IS SWEPT BY NOBODY BUT ITS OWN ROTATION, AND THAT IS DELIBERATE.
//    `state-eviction` bounds the `.json` stores by count; a journal bounds
//    ITSELF by size. Two ceilings, one per class.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const log = require('./log');
const pure = require('./lifecycle-log-pure');
const { journals } = require('./log-journals-pure');

// ⚠️ ONE fixed name, plus the `.1`… its rotation produces. A journal whose name
//    varies is a journal nobody finds at the moment they need it.
const FILE_NAME = journals().daemon.file;

/** @returns {string} the daemon journal's current file */
function logPath() {
  return /** @type {string} */ (log.journalPath('daemon'));
}

/**
 * Writes ONE lifecycle record, or writes nothing at all.
 *
 * @param {string} event one of `pure.EVENTS`; anything else writes NOTHING.
 * @param {Record<string, unknown>} [fields] extra facts, `null`/`undefined` omitted.
 * @param {{file?: string, maxBytes?: number, now?: () => string}} [opts]
 *   INJECTION POINTS FOR TESTS ONLY — production passes none of them.
 * @returns {boolean} whether a line actually reached the disk.
 */
function record(event, fields, opts) {
  try {
    if (!pure.EVENTS.includes(event)) return false;
    const o = opts || {};
    return log.write('daemon', event, fields, {
      file: o.file,
      now: o.now,
      settings: o.maxBytes === undefined ? undefined : { maxBytes: o.maxBytes },
    });
  } catch {
    /* 🛑 the trace must NEVER cost the service */
    return false;
  }
}

module.exports = { record, logPath, FILE_NAME };
