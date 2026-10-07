// ═══════════════════════════════════════════════════════════════════════
// log-pure.js — HOW EVERY JOURNAL OF THIS PROJECT BEHAVES. Pure, ZERO I/O.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 WHY IT EXISTS (2026-10-04): the project had ONE journal (the daemon's life,
//    `lifecycle-log`) whose rotation was two constants in the code, NO setting
//    an adopter could reach, and hooks that swallowed their own errors in an
//    empty `catch`. A failure at night left nothing: `claude --debug` only sees
//    "exit 0", because the error was eaten before. An open-source tool must say
//    what went wrong WHERE the adopter looks, with a size they chose.
//
// 🔑 WHAT IS DECIDED HERE, AND ONLY HERE:
//    ① the `logging` setting of `ctxroute-config.json` — read, bounded, or REFUSED
//       by name (never a guessed default for a value the adopter actually wrote);
//    ② whether a record is written at the configured level;
//    ③ the line format;
//    ④ the rotation plan — which renames, which removals — for N kept files.
//    The REGISTRY of journals (which file, which events) is `log-journals-pure.js`;
//    the shell that touches the disk is `log.js`. Nothing else writes a journal
//    (`journal-writer-gate.test.js`).
//
// 🛑 TWO LEVELS, AND ERRORS ARE NEVER BEHIND `debug` (decision 2026-10-04). A
//    failure at night with debug off must still leave its line, or the journal
//    is useless on the one night that matters. `error` (the default) keeps
//    errors AND the daemon's life events (rare by construction); `debug` adds
//    the verbose trace (one line per request on the daemon, the hooks'
//    decisions). Debug is OFF by default: SSD wear is real, and a per-request
//    writer is exactly what `lifecycle-log-pure` forbids outside an explicit,
//    adopter-chosen, bounded mode.
//
// 🛑 BOUNDED FOR LIFE, WHATEVER THE SETTING. Each journal holds at most
//    `keptFiles` files of `maxBytes` (the current one included), and BOTH knobs
//    have hard bounds below. The rotation plan also REMOVES every suffix past
//    `keptFiles` up to the bound, so LOWERING `keptFiles` frees the disk at the
//    next rotation instead of stranding old files for ever. ⇒ the worst case is
//    a CONSTANT (`log-journals-pure.worstCase()`), the figure
//    `disk-writers.json` declares.
//
// ⚠️ ROTATION BY SIZE IN THE PROCESS, NOT `logrotate`, AND IT IS A DECLARED
//    CHOICE: this runs on Windows, macOS and Linux, and no rotation tool is
//    shared by the three. The shape is the fleet's (rename onto `.1`, a rename
//    OVERWRITES), generalised to N files.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

// ⚠️ THE CLASSES A RECORD CAN BELONG TO. `event` = a daemon life event (start,
//    exit, stall…), always written; `error` = a failure, always written;
//    `debug` = the verbose trace, written only at level `debug`.
const SEVERITIES = Object.freeze(['event', 'error', 'debug']);

// The values an adopter may write in `logging.level`.
const LEVELS = Object.freeze(['error', 'debug']);

// 🔑 THE DEFAULTS ARE TODAY'S DAEMON JOURNAL, TO THE BYTE: 256 KB × 2 files.
//    An absent `logging` key changes nothing that already runs.
const DEFAULTS = Object.freeze({ level: 'error', maxBytes: 256 * 1024, keptFiles: 2 });

// 🛑 HARD BOUNDS — the schema carries the SAME numbers and a cell ties them.
//    `maxBytes` ≥ 16 KB: below that a rotation would fire every few lines and
//    the journal would hold almost nothing. ≤ 8 MB: a journal is re-read by a
//    human, and 8 MB × 10 is already more than anyone reads. `keptFiles` 1..10:
//    1 = the current file only (a rotation starts it over).
const BOUNDS = Object.freeze({
  maxBytes: Object.freeze({ min: 16 * 1024, max: 8 * 1024 * 1024 }),
  keptFiles: Object.freeze({ min: 1, max: 10 }),
});

/**
 * Reads the `logging` setting of a config, or REFUSES it by name.
 *
 * 🛑 A VALUE THE ADOPTER WROTE IS NEVER REPLACED BY A GUESS. Absent key ⇒ the
 *    defaults (today's behaviour). Present and wrong (unknown key, unknown
 *    level, out of bounds, not an integer) ⇒ `{ ok: false, refusal }`, and the
 *    shell writes that refusal into the journal and runs on the defaults, so
 *    errors are still recorded AND the adopter is told why their setting did
 *    not apply.
 *
 * @param {unknown} config the whole parsed config (or anything)
 * @returns {{ok: boolean, refusal?: string, settings: {level: string, maxBytes: number, keptFiles: number}}}
 */
function resolveLogging(config) {
  // ⚠️ NO `typeof` GUARD: a primitive has no `logging` property, so `'x'.logging`
  //    is already `undefined` — a guard would be an equivalent mutant.
  const raw = config ? /** @type {any} */ (config).logging : undefined;
  if (raw === undefined) return { ok: true, settings: { ...DEFAULTS } };
  const refuse = (/** @type {string} */ why) => ({ ok: false, refusal: why, settings: { ...DEFAULTS } });
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return refuse('`logging` must be an object');
  }
  for (const key of Object.keys(raw)) {
    if (!Object.hasOwn(DEFAULTS, key) && key !== 'note') return refuse(`\`logging.${key}\` is not a known key`);
  }
  const settings = { ...DEFAULTS };
  if (raw.level !== undefined) {
    if (!LEVELS.includes(raw.level)) {
      return refuse(`\`logging.level\` is ${JSON.stringify(raw.level)}, expected one of ${LEVELS.join(', ')}`);
    }
    settings.level = raw.level;
  }
  for (const key of /** @type {const} */ (['maxBytes', 'keptFiles'])) {
    if (raw[key] === undefined) continue;
    const v = raw[key];
    const b = BOUNDS[key];
    if (!Number.isInteger(v) || v < b.min || v > b.max) {
      return refuse(`\`logging.${key}\` is ${JSON.stringify(v)}, expected an integer from ${b.min} to ${b.max}`);
    }
    settings[key] = v;
  }
  return { ok: true, settings };
}

/**
 * Is a record of this severity written at this configured level?
 *
 * 🛑 FAIL-TOWARDS-WRITING FOR FAILURES, FAIL-TOWARDS-SILENCE FOR THE TRACE.
 *    `event` and `error` are written at EVERY level, an unknown level included:
 *    losing the trace of a failure is the worse outcome. `debug` is written
 *    ONLY when the level is exactly `debug`: a per-request writer must never
 *    switch on by accident.
 *
 * @param {unknown} level the configured level
 * @param {unknown} severity the record's class
 * @returns {boolean}
 */
function admits(level, severity) {
  if (severity === 'event' || severity === 'error') return true;
  return severity === 'debug' && level === 'debug';
}

/**
 * Collapses anything into ONE line.
 *
 * 🛑 LOAD-BEARING, NOT COSMETIC: a journal is line-delimited, so a value
 *    carrying a newline would FORGE an extra entry — and the values logged
 *    include OS error messages, i.e. text this process does not author.
 *
 * @param {unknown} value
 * @returns {string}
 */
function oneLine(value) {
  return String(value).replace(/[\r\n]+/g, ' ');
}

/**
 * Renders ONE record, or REFUSES by name.
 *
 * ⚠️ An event outside `vocabulary` ⇒ `null` (nothing written). An absent or
 *    empty instant ⇒ `null`: a record whose job is to say WHEN is worth nothing
 *    without it. `null`/`undefined` fields are OMITTED, never printed empty.
 *
 * @param {{at?: unknown, event?: unknown, fields?: unknown, vocabulary?: readonly string[]}} [input]
 * @returns {string|null} the record without its trailing newline
 */
function formatRecord(input) {
  const o = input || {};
  // ⚠️ A CAST, NEVER A RUNTIME GUARD: `includes` already answers `false` for a
  //    number, an object or `undefined`.
  const event = /** @type {string} */ (o.event);
  // No vocabulary at all means no event is known: nothing is written.
  if (!Array.isArray(o.vocabulary) || !o.vocabulary.includes(event)) return null;
  // ⚠️ The `typeof` is NOT redundant with the length test: a NUMBER has no
  //    `length`, so a bare length check would let `at: 42` through.
  if (typeof o.at !== 'string' || o.at.length === 0) return null;
  const fields = o.fields;
  let detail = '';
  // ⚠️ `typeof` is load-bearing: a STRING is truthy and `Object.keys('ab')`
  //    answers `['0','1']`, i.e. a record made of noise.
  if (fields && typeof fields === 'object') {
    for (const key of Object.keys(fields)) {
      const value = fields[key];
      if (value === null || value === undefined) continue;
      detail += ' ' + key + '=' + oneLine(value);
    }
  }
  return oneLine(o.at) + ' event=' + event + detail;
}

/**
 * Must the journal turn over BEFORE this write?
 *
 * ⚠️ FAIL-OPEN, THE INVERSE OF A GATE: an unreadable size or an absurd ceiling
 *    means do NOT rotate, hence still WRITE — a slightly oversized file beats a
 *    lost trace. NEVER invert this default. `>=`: the ceiling is a limit REACHED.
 *    A `maxBytes` of 0, negative or NaN is refused by `maxBytes > 0`.
 *
 * @param {{sizeBytes?: unknown, maxBytes?: unknown}} [input]
 * @returns {boolean}
 */
function shouldRotate(input) {
  const o = input || {};
  const sizeBytes = Number(o.sizeBytes);
  const maxBytes = Number(o.maxBytes);
  if (!(maxBytes > 0)) return false;
  if (!Number.isFinite(sizeBytes)) return false;
  return sizeBytes >= maxBytes;
}

/**
 * The removals and renames of ONE rotation, in the order they must run.
 *
 * 🔑 `keptFiles` = files on disk INCLUDING the current one. With k kept:
 *    remove `.k` … `.(max-1)` (stranded by a lowered setting), then shift
 *    `.(k-2)` → `.(k-1)` … `.1` → `.2`, then current → `.1`. Each rename
 *    OVERWRITES its target, which is what drops the oldest file. With k = 1 the
 *    current file itself is removed: the journal starts over.
 * ⚠️ Suffixes only (`''` = the current file); the shell joins them to the path.
 *    An unusable `keptFiles` falls back to the DEFAULT (2), never to "keep
 *    everything": the plan must stay bounded whatever it is handed.
 *
 * @param {unknown} keptFiles
 * @returns {{remove: string[], rename: Array<[string, string]>}}
 */
function rotationPlan(keptFiles) {
  const n = Number(keptFiles);
  const k = Number.isInteger(n) && n >= BOUNDS.keptFiles.min && n <= BOUNDS.keptFiles.max ? n : DEFAULTS.keptFiles;
  const remove = [];
  for (let i = k; i < BOUNDS.keptFiles.max; i += 1) remove.push('.' + i);
  if (k === 1) return { remove: [...remove, ''], rename: [] };
  /** @type {Array<[string, string]>} */
  const rename = [];
  for (let i = k - 2; i >= 1; i -= 1) rename.push(['.' + i, '.' + (i + 1)]);
  rename.push(['', '.1']);
  return { remove, rename };
}

module.exports = {
  resolveLogging, admits, formatRecord, oneLine, shouldRotate, rotationPlan,
  SEVERITIES, LEVELS, DEFAULTS, BOUNDS,
};
