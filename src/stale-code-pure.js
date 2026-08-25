// ═══════════════════════════════════════════════════════════════════════
// stale-code-pure.js — IS THE CODE THIS PROCESS IS RUNNING STILL THE CODE ON
// DISK? Pure decision, ZERO I/O.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 THE DEFECT IT CLOSES, MEASURED 2026-08-24. The daemon used to exit 90 on
//    ANY `fs.watch` notification, concluding "my code changed". That conclusion
//    was an INFERENCE, and it was FALSE: an independent witness watching the
//    same directories caught the event at the exact millisecond of a death
//    (18:47:19.717Z) on the FROZEN copy — `mtime` 13:46:20 unchanged, `ctime`
//    13:53:22 unchanged, **only `atime` had moved**. The content had not been
//    written since the copy was built, and the daemon had killed itself 258
//    times. Merely READING a file was enough to kill the service.
//
// 📐 WHY, FROM THE VENDORS THEMSELVES — do NOT re-research this:
//    · libuv `src/win/fs-event.c` subscribes ReadDirectoryChangesW to eight
//      filters INCLUDING `FILE_NOTIFY_CHANGE_LAST_ACCESS`, `..._ATTRIBUTES`,
//      `..._SECURITY` and `..._CREATION`; all of them arrive as
//      `FILE_ACTION_MODIFIED` ⇒ `UV_CHANGE` ⇒ Node's `'change'`.
//    · Microsoft `fsutil behavior` (page updated 2026-02-16): *"One hour is the
//      maximum amount of time that NTFS can defer updating Last Access Time on
//      disk."* That deferral is why a plain read killed the daemon up to an
//      hour later, and why the deaths landed exactly one hour apart.
//    · NOT a Windows quirk: inotify `IN_ATTRIB` fires on timestamps and
//      permissions, FSEvents raises `kFSEventStreamEventFlagItemInodeMetaMod`.
//
// ✅ SO THE DECISION BECOMES AN OBSERVATION. We no longer ask the kernel "did
//    something happen?" and infer the answer; we COMPARE the bytes this process
//    compiled against the bytes on disk, at the point of use. A notification
//    that says nothing changed can no longer kill anything — and, symmetrically,
//    a notification that never arrives can no longer let stale code be served.
//    All three vendors document event LOSS and prescribe exactly one remedy:
//    ReadDirectoryChangesW buffer overflow / `ERROR_NOTIFY_ENUM_DIR` ⇒ *"you
//    should compute the changes by enumerating"*; inotify `IN_Q_OVERFLOW` ⇒
//    *"rebuild part or all of the application cache"*; FSEvents `MustScanSubDirs`
//    ⇒ rescan. Comparing at the point of use IS that rescan, and it makes the
//    kernel's non-determinism stop mattering.
//
// ⚠️ CONTRACT: ZERO I/O — no `fs`, no `path`, no `process`, no clock, no
//    `console`. It RECEIVES what was observed and RETURNS a verdict. The shell
//    reads the disk and decides to die. 🛑 NEVER put a read back here "to
//    simplify": that would lose the mutability which is the whole reason this
//    file exists, exactly as for `temporal-budget-pure.js`.
//
// 🛑 FAIL-CLOSED, THE OPPOSITE OF EVERY OTHER DEFAULT IN THIS REPOSITORY. The
//    injection path is fail-open because a missing document costs knowledge;
//    here a wrong answer costs a GREEN THAT LIES — the daemon serving yesterday's
//    logic while looking perfectly healthy. Anything we cannot verify is STALE.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

// ⚠️ WHAT AN EMPTY OBSERVATION SET MEANS, and it is not "nothing to check". The
//    set is DERIVED from the module loader hook; empty means the hook was never
//    installed, i.e. this process cannot vouch for a single one of its modules.
//    Serving then would be the green that lies, so it is a refusal BY NAME.
const NOTHING_RECORDED = 'no module was recorded: the load hook was never installed, '
  + 'so this process cannot vouch for a single byte of its own code';

/**
 * @typedef {object} Observation what was seen about ONE loaded module.
 * @property {string} file its absolute path
 * @property {string|null} recorded the exact source this process COMPILED
 * @property {string|null} current the source on disk NOW — `null` means the file
 *   is gone, which is a change like any other, not an absence of information
 * @property {string|null} error what the read threw, `null` when it did not.
 *   A file we can no longer READ is a file we can no longer vouch for.
 */

/**
 * THE VERDICT — pure, total, deterministic.
 *
 * ⚠️ ONE PASS over the observations, deliberately: this runs before EVERY
 *    request, and a traversal chained on a traversal would make the guard's cost
 *    grow with the number of modules for no gain (`quadratic-budget.json`).
 * ⚠️ Returns the REASONS, never a bare boolean: a death whose cause is unnamed
 *    is only half observable — 169 exits in one day said WHICH file only after
 *    someone went looking for it.
 *
 * @param {Observation[]} observations what the shell measured
 * @returns {{stale: boolean, checked: number, reasons: string[]}}
 */
function verdict(observations) {
  const list = Array.isArray(observations) ? observations : [];
  // 🛑 THE ANTI-VACUITY FLOOR IS IN THE DECISION ITSELF, not only in its suite.
  //    A guard that verifies NOTHING is indistinguishable from a guard that
  //    verifies everything and finds it clean — this repository's worst defect.
  if (list.length === 0) return { stale: true, checked: 0, reasons: [NOTHING_RECORDED] };

  const reasons = [];
  for (const o of list) {
    // ⚠️ ORDER MATTERS AND IT IS THE ORDER OF CERTAINTY: an unreadable file
    //    tells us nothing about its content, so it is reported as unreadable and
    //    never as "differs" — a message that named the wrong cause would send
    //    the next reader looking for an edit that never happened.
    if (o.error !== null && o.error !== undefined) {
      reasons.push(o.file + ': UNREADABLE now (' + o.error + ')');
    } else if (o.current === null || o.current === undefined) {
      reasons.push(o.file + ': GONE from disk');
    } else if (o.current !== o.recorded) {
      reasons.push(o.file + ': content DIFFERS from the bytes this process compiled');
    }
  }

  // ⚠️ SORTED: the message must not depend on the order in which the loader
  //    happened to walk the modules, or the same defect reads differently from
  //    one death to the next and people stop trusting the journal.
  return { stale: reasons.length > 0, checked: list.length, reasons: reasons.sort() };
}

/**
 * Is this loaded file OURS, i.e. code whose change must cost us our life?
 *
 * 🛑 `node_modules` IS OUT OF SCOPE DELIBERATELY, and the reason is written
 *    rather than assumed: a dependency cannot change without an INSTALL, which
 *    is a deliberate act that restarts the service anyway. Watching or verifying
 *    it would buy nothing and cost a read per request per dependency.
 *
 * @param {unknown} file a key of the module cache
 * @returns {boolean}
 */
function inScope(file) {
  return typeof file === 'string' && file.length > 0 && !file.includes('node_modules');
}

/**
 * The DIRECTORY a loaded file lives in — the unit the kernel watch is armed on.
 *
 * 🛑 DIRECTORIES, NEVER FILES, AND IT IS LOAD-BEARING. Git does not write in
 *    place: it writes a temporary file and RENAMES it over the target. A watch
 *    on the FILE follows the dead inode and goes silently deaf — the worst
 *    outcome, since a deaf watcher is indistinguishable from a quiet one.
 * ⚠️ Both separators, because the same code runs on all three kernels.
 * ⚠️ A path with no separator (or one that starts with it) has no usable parent
 *    here and yields `null` rather than an empty string, which `fs.watch` would
 *    resolve to the current working directory — a watch on the wrong place.
 *
 * @param {string} file
 * @returns {string|null}
 */
function dirOf(file) {
  const cut = Math.max(file.lastIndexOf('/'), file.lastIndexOf('\\'));
  if (cut < 1) return null;
  return file.slice(0, cut);
}

/**
 * The set of directories to watch, DERIVED from what was really loaded.
 *
 * ⚠️ NEVER A HAND-WRITTEN GLOB: a module added tomorrow watches itself, and a
 *    list only ever knows the past.
 *
 * @param {string[]} files the keys of the module cache (or of the recorded set)
 * @returns {string[]} unique directories, sorted so the result is reproducible
 */
function watchedDirs(files) {
  const dirs = new Set();
  for (const file of files) {
    if (!inScope(file)) continue;
    const dir = dirOf(file);
    if (dir !== null) dirs.add(dir);
  }
  return [...dirs].sort();
}

module.exports = { verdict, inScope, dirOf, watchedDirs, NOTHING_RECORDED };
