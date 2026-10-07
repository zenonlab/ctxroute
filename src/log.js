// ═══════════════════════════════════════════════════════════════════════
// log.js — THE ONLY DOOR TO A JOURNAL ON DISK. It decides NOTHING.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 ONE WRITER FOR EVERY JOURNAL (2026-10-04). Which journal and event exist is
//    `log-journals-pure.js`; the setting, the level, the format and the rotation
//    plan are `log-pure.js`, both pure and mutated. This file only reads the
//    config, stats, renames, removes and appends. 🛑 Nothing else in `src/`
//    appends to a file: `journal-writer-gate.test.js` holds every append
//    primitive to THIS file, so a new journal is necessarily a registry entry
//    with a ceiling, never a `appendFileSync` slipped into a handler.
//
// 🛑 FAIL-OPEN, WITHOUT EXCEPTION. A hook or a daemon must NEVER fail because its
//    journal did: a full disk, a read-only directory, a locked file, an
//    unreadable config all mean NO LINE (or a line under the defaults), and the
//    caller carries on. `write` RETURNS a boolean and NEVER throws.
//
// ⚠️ THE SETTING IS RE-READ WHEN THE CONFIG FILE CHANGES, never frozen at load:
//    switching `logging.level` to `debug` and back takes effect at the next
//    record, in the long-lived daemon too, without a restart. The parsed value
//    is kept while the file's size and mtime stay the same — one `stat` per
//    record, measured in the K work item (`log.md`).
//
// ⚠️ A REFUSED SETTING IS SAID, ONCE PER PROCESS AND PER REASON, in the journal
//    itself (`logging-refused`), and the journal runs on the defaults: the
//    adopter learns why the setting did not apply, and errors are still kept.
//
// ⚠️ THE ROTATION TAKES A LOCK, THE APPEND DOES NOT. Several hook processes may
//    write `ctxroute-hooks.log` at once: two concurrent rotations would shift the
//    files twice and lose a generation. The lock is taken ONLY when the size
//    says a rotation is due (rare), and the size is asked again under it — the
//    other process may have rotated already. Lock unavailable ⇒ no rotation this
//    time, the line is still written (a slightly oversized file beats a lost
//    trace). An append of one short line with `O_APPEND` needs no lock.
//
// ⚠️ PATHS FROM `paths.js` ONLY (`stateDir()`, resolved lazily at each call).
//    `state/` is gitignored, which is what makes it the right home for a file
//    carrying a pid and an OS error message on a PUBLIC repository.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const fs = require('fs');
const path = require('path');
const paths = require('./paths');
const pure = require('./log-pure');
const journals = require('./log-journals-pure');
const { withLock } = require('./lock');

/** @type {{key: string, result: ReturnType<typeof pure.resolveLogging>}|null} */
let cached = null;
/** @type {Set<string>} refusals already written by this process */
const refusalsSaid = new Set();

/**
 * The `logging` setting in force, re-read only when the config file changed.
 * @returns {ReturnType<typeof pure.resolveLogging>}
 */
function settings() {
  let file = '';
  try {
    file = paths.configPath();
    const st = fs.statSync(file);
    const key = file + '|' + st.size + '|' + st.mtimeMs;
    if (cached !== null && cached.key === key) return cached.result;
    const result = pure.resolveLogging(JSON.parse(fs.readFileSync(file, 'utf8')));
    cached = { key, result };
    return result;
  } catch {
    // Absent or unreadable config ⇒ the defaults, like every other reader here.
    cached = null;
    return pure.resolveLogging({});
  }
}

/**
 * The absolute path of a journal's current file, or `null` for an unknown one.
 * @param {string} journal a key of `log-journals-pure.journals()`
 * @returns {string|null}
 */
function journalPath(journal) {
  const j = journals.journalOf(journal);
  return j === null ? null : path.join(paths.stateDir(), j.file);
}

/**
 * Would this event be written right now? Lets a caller skip building the
 * fields of a `debug` record when the level is `error`.
 * @param {string} journal
 * @param {string} event
 * @returns {boolean}
 */
function enabled(journal, event) {
  try {
    const severity = journals.severityOf(journal, event);
    return severity !== null && pure.admits(settings().settings.level, severity);
  } catch {
    return false;
  }
}

/**
 * Rotates `file` if it reached `maxBytes`, under the journal's lock.
 * @param {string} file
 * @param {{maxBytes: number, keptFiles: number}} s
 */
function rotateIfDue(file, s) {
  const sizeOf = () => {
    try {
      return fs.statSync(file).size;
    } catch {
      return 0;
    }
  };
  if (!pure.shouldRotate({ sizeBytes: sizeOf(), maxBytes: s.maxBytes })) return;
  withLock(path.join(path.dirname(file), `.lock-log-${path.basename(file)}`), () => {
    // ⚠️ ASKED AGAIN UNDER THE LOCK: another process may have rotated meanwhile.
    if (!pure.shouldRotate({ sizeBytes: sizeOf(), maxBytes: s.maxBytes })) return;
    const plan = pure.rotationPlan(s.keptFiles);
    for (const suffix of plan.remove) fs.rmSync(file + suffix, { force: true });
    for (const [from, to] of plan.rename) {
      try {
        fs.renameSync(file + from, file + to);
      } catch {
        /* absent generation (young journal) ⇒ nothing to shift */
      }
    }
  }, { fallback: undefined });
}

/**
 * Writes ONE record to a journal, or nothing at all.
 *
 * @param {string} journal a key of `log-journals-pure.journals()`
 * @param {string} event an event of that journal's vocabulary
 * @param {Record<string, unknown>} [fields] extra facts, `null`/`undefined` omitted
 * @param {{file?: string, now?: () => string, settings?: Partial<typeof pure.DEFAULTS>}} [opts]
 *   INJECTION POINTS FOR TESTS ONLY — production passes none. `settings` stands
 *   in for the resolved setting, UNBOUNDED on purpose (a rotation test needs a
 *   40-byte ceiling the schema would refuse). 🛑 Never promote it to config.
 * @returns {boolean} whether a line reached the disk
 */
function write(journal, event, fields, opts) {
  try {
    const o = opts || {};
    const j = journals.journalOf(journal);
    const severity = journals.severityOf(journal, event);
    if (j === null || severity === null) return false;
    const resolved = o.settings === undefined ? settings() : { ok: true, settings: { ...pure.DEFAULTS, ...o.settings } };
    if (!pure.admits(resolved.settings.level, severity)) return false;
    const clock = typeof o.now === 'function' ? o.now : () => new Date().toISOString();
    const vocabulary = Object.keys(j.events);
    const line = pure.formatRecord({ at: clock(), event, fields, vocabulary });
    if (line === null) return false;
    const file = o.file || path.join(paths.stateDir(), j.file);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    let text = line + '\n';
    if (!resolved.ok && !refusalsSaid.has(file + '|' + resolved.refusal)) {
      refusalsSaid.add(file + '|' + resolved.refusal);
      const said = pure.formatRecord({
        at: clock(), event: 'logging-refused', vocabulary, fields: { reason: resolved.refusal, pid: process.pid },
      });
      if (said !== null) text = said + '\n' + text;
    }
    rotateIfDue(file, resolved.settings);
    fs.appendFileSync(file, text);
    return true;
  } catch {
    /* 🛑 the trace must NEVER cost the caller — see the header */
    return false;
  }
}

/**
 * The ONE way a spawned hook records that it failed and stayed fail-open.
 *
 * 🛑 IT NEVER CHANGES WHAT THE HOOK DOES: no output to the agent, no exit
 *    code, no throw — the hook still leaves as it would have. It only makes
 *    the failure FINDABLE (`state/ctxroute-hooks.log`), at every level.
 *
 * @param {string} hook the hook's file name, e.g. `wrap-up-stop`
 * @param {unknown} err what was caught
 * @returns {boolean} whether the line reached the disk
 */
function hookError(hook, err) {
  return reportOnce('hooks', 'hook-error', { hook, ...errorFields(err), pid: process.pid });
}

// ⚠️ ONE LINE PER DISTINCT FAILURE AND PROCESS. A failure that repeats on every
//    request of the long-lived daemon (an unreadable docs folder, a broken
//    payload shape) would otherwise flood the journal and rotate every OTHER
//    error out of it. The first occurrence names it; that is what finds it.
//    Bounded: past `MAX_DISTINCT` keys the set stops growing and lines are
//    written again (a flood of DIFFERENT failures is itself worth seeing).
const MAX_DISTINCT = 256;
/** @type {Set<string>} */
const reported = new Set();

/**
 * @param {string} journal
 * @param {string} event
 * @param {Record<string, unknown>} fields
 * @returns {boolean}
 */
function reportOnce(journal, event, fields) {
  const key = [journal, event, fields.hook, fields.site, fields.error, fields.code].join('|');
  if (reported.has(key)) return false;
  if (reported.size < MAX_DISTINCT) reported.add(key);
  return write(journal, event, fields);
}

/**
 * The daemon's twin of `hookError`: a failure the daemon survived, written to
 * `ctxroute-daemon.log` as `daemon-error`, at every level.
 *
 * 🛑 SAME RULE: it never changes what the daemon answers or whether it lives.
 *
 * @param {string} site where it failed, e.g. `handle`, `snapshot-load`
 * @param {unknown} err what was caught
 * @returns {boolean}
 */
function daemonError(site, err) {
  return reportOnce('daemon', 'daemon-error', { site, ...errorFields(err), pid: process.pid });
}

/**
 * The fields of a caught value: message, `code`, and the FIRST stack frame.
 * ⚠️ The first frame only: it names the file and line that threw, and a whole
 *    stack would carry the operator's home path once per frame.
 * @param {unknown} err
 * @returns {{error: string, code?: string, at?: string}}
 */
function errorFields(err) {
  const e = /** @type {any} */ (err);
  const error = e instanceof Error ? e.message : String(err);
  const code = e && typeof e === 'object' && typeof e.code === 'string' ? e.code : undefined;
  const at = e instanceof Error && typeof e.stack === 'string' ? (e.stack.split('\n')[1] || '').trim().replace(/^at /, '') : undefined;
  return { error, code, at };
}

module.exports = { write, enabled, hookError, daemonError, journalPath, settings };
