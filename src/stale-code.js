// ═══════════════════════════════════════════════════════════════════════
// stale-code.js — THE BASELINE: the exact bytes this process COMPILED, and the
// reading of what is on disk now. The I/O half of `stale-code-pure.js`.
// ═══════════════════════════════════════════════════════════════════════
//
// 🛑 THE BASELINE IS WHAT NODE COMPILED, NEVER A RE-READ — this is the whole
//    design and it is violable in one line. Reading the files again at startup
//    would open a window in which the baseline records the NEW bytes while the
//    OLD code runs: the daemon would then serve stale logic and compare itself
//    clean for ever. A GREEN THAT LIES, built on purpose. So the source is taken
//    at the ONE instant where it is a fact rather than a measurement: the moment
//    the module system hands it to V8.
//
// 📐 WHERE THE HOOK SITS, AND WHY IT IS `_compile` AND NOT `_extensions['.js']`.
//    Both are the CommonJS load path; only one is windowless. `_extensions['.js']`
//    RECEIVES a filename and reads the file itself, so a hook there must either
//    read a SECOND time (a window, however small — the very thing forbidden
//    above) or REIMPLEMENT Node's loader, losing its `package.json` type check
//    and its ESM refusal. `Module.prototype._compile(content, filename)` is
//    handed the exact string that is about to be compiled: recording it costs no
//    read, no window and no reimplementation. MEASURED on Node 22.15.1: the
//    recorded string equals `fs.readFileSync(file, 'utf8')` byte for byte,
//    shebang included.
// ⚠️ A module loaded LATER is captured by the same hook automatically — that is
//    what makes the verified set DERIVED and not a list. A list only ever knows
//    the past.
//
// ⚠️ `node_modules` IS OUT OF SCOPE, with its reason in `stale-code-pure.js`: an
//    install is a deliberate act that restarts the service anyway.
//
// 🛑 THIS FILE NEVER DECIDES AND NEVER DIES. It records and it reads; the
//    verdict belongs to the pure module and the exit belongs to the shell. A
//    core that kills the process is untestable and uncallable from anywhere else
//    — the house rule `createServer` already broke once, in August.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const fsDefault = require('fs');
const pure = require('./stale-code-pure');

// ⚠️ MODULE-LEVEL STATE, DELIBERATELY, AND IT IS THE ONE IN THIS REPOSITORY.
//    The recorder must be reachable by the bootstrap that ARMS it and by the
//    server that CONSULTS it, and they are two different files in one process:
//    the module cache is what makes them share one map instead of two truths.
//    ⚠️ It grows with the number of MODULES (bounded by the repository), never
//    with traffic or uptime — the accumulation classes audited in
//    `http-server.js` do not apply.
// 🔴 IT IS THE BOOTSTRAP'S LIVE MAP, NOT A COPY OF IT — AND THE FIRST VERSION
//    COPIED, WHICH IS WHY THE PROBE CAUGHT IT. The bootstrap hands the map over
//    BEFORE requiring the server, so a copy taken at that instant holds exactly
//    the two modules loaded so far: MEASURED `verifiedModules=2` on a daemon
//    that had compiled nineteen. Every module loaded afterwards — at startup or
//    lazily, hours later — must enter the set BY ITSELF; that is what makes the
//    verified set DERIVED and not a snapshot of one moment.
let source = null;

// 🛑 THE HOOK ITSELF LIVES IN THE BOOTSTRAP, NOT HERE, AND THAT IS NOT A STYLE
//    CHOICE. Arming it from this file would require LOADING this file first —
//    so this file and `stale-code-pure.js` would be compiled before the hook
//    exists and could never be recorded, i.e. the two modules that decide
//    freshness would be the only two nobody vouches for. The bootstrap arms a
//    six-line interception with a bare `Map`, then requires us, then hands the
//    map over: everything after its own first statement is recorded, itself
//    included. What is left unverified is the bootstrap alone — a file with no
//    semantics, DECLARED rather than hidden.

/**
 * A leading byte-order mark is stripped from BOTH sides or from neither.
 *
 * ⚠️ Node hands `_compile` the file as it is; a disk read with the same encoding
 *    gives back the same string. This exists so the two sides stay comparable
 *    even on a file someone saved with a BOM — an editor's decision must never
 *    read as a code change.
 * @param {string} text
 * @returns {string}
 */
function stripBom(text) {
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}

/**
 * Takes over the LIVE map the bootstrap's interception writes into.
 *
 * 🛑 THE MAP IS KEPT BY REFERENCE, NEVER COPIED, and that is the whole point: it
 *    keeps filling as modules load, so a module required lazily hours from now
 *    is verified without anybody declaring it.
 * ⚠️ THE FILTERING AND THE NORMALISATION HAPPEN AT READ TIME, here and not in
 *    the bootstrap: the bootstrap must stay a dumb interception with nothing to
 *    get wrong, and the rule for what is OURS has one owner
 *    (`stale-code-pure.inScope`).
 *
 * @param {Map<string, string>} raw filename ⇒ the source that was compiled
 * @returns {number} how many modules this process can vouch for right now
 */
function adopt(raw) {
  if (raw && typeof raw.entries === 'function') source = raw;
  return count();
}

/**
 * ONE PASS over the live map, yielding only what is OURS, normalised.
 * ⚠️ Not a materialised list: this runs before every request, and building an
 *    intermediate collection per call would be a traversal chained on a
 *    traversal for nothing (`quadratic-budget.json`).
 * @param {(file: string, recordedSource: string) => void} visit
 */
function each(visit) {
  if (source === null) return;
  for (const [filename, content] of source) {
    if (pure.inScope(filename) && typeof content === 'string') visit(filename, stripBom(content));
  }
}

/**
 * How many modules this process can vouch for. ANTI-VACUITY, exposed on purpose:
 * a guard that verifies nothing looks exactly like a guard that finds everything
 * clean, and this repository's worst defect has never been a red gate.
 * @returns {number}
 */
function count() {
  let n = 0;
  each(() => { n += 1; });
  return n;
}

/** @returns {string[]} the files this process compiled — the DERIVED set. */
function files() {
  const out = [];
  each((file) => out.push(file));
  return out;
}

/**
 * Reads the disk NOW and hands the pure verdict what it needs.
 *
 * ⚠️ SYNCHRONOUS, AND THAT IS LOAD-BEARING: this runs on the request path, where
 *    `http-server.js` documents at length why nothing may become asynchronous
 *    (a blocking cross-process lock held across an await is a self-deadlock that
 *    reads as a slow daemon). It is also why there is NO timer, NO debounce and
 *    NO polling here: the comparison is a fact, taken when it is needed.
 * 📐 ONE PASS, and the cost is a `readFileSync` per loaded module. MEASURED on
 *    this machine 2026-08-24, never reasoned about: **36 modules, 3.66-3.73 ms
 *    per verification**, ~1.3 MB of source read per request. Against the ~11 ms
 *    a frame costs in production (resident corpus) that is **+34 % per request,
 *    ~118 ms on a 32-frame action — material, and said so rather than smoothed
 *    over.**
 * 🛑 THE ANSWER IS NOT A CACHE. Caching the DISK side is the baseline-by-re-read
 *    defect wearing another hat: it would compare the code we run against bytes
 *    we read once and stopped watching, i.e. hand back the green that lies this
 *    whole file exists to remove. Whoever reopens it MEASURES first — hashes
 *    instead of bytes, or one verification per ACTION (`tool_use_id`) instead of
 *    one per frame — and proves the equivalence before branching.
 * ⚠️ AN ERROR IS DATA, NEVER AN EXCEPTION: a file we can no longer READ is a
 *    file we can no longer vouch for, and the pure verdict says so by name.
 *
 * @param {{readFileSync: Function}} [fs] injected in tests
 * @returns {import('./stale-code-pure').Observation[]}
 */
function observe(fs) {
  const io = fs || fsDefault;
  const observations = [];
  each((file, compiled) => {
    try {
      observations.push({ file, recorded: compiled, current: stripBom(io.readFileSync(file, 'utf8')), error: null });
    } catch (err) {
      // ⚠️ `ENOENT` is reported as GONE rather than as an error, because the two
      //    are different facts and a message naming the wrong one sends the next
      //    reader looking for an edit that never happened.
      const code = /** @type {NodeJS.ErrnoException} */ (err).code;
      if (code === 'ENOENT') observations.push({ file, recorded: compiled, current: null, error: null });
      else observations.push({ file, recorded: compiled, current: null, error: String(code || err) });
    }
  });
  return observations;
}

/**
 * The verdict on THIS process, right now. One call, so no caller can take half
 * of the pair and compare a baseline against nothing.
 * @param {{readFileSync: Function}} [fs] injected in tests
 * @returns {{stale: boolean, checked: number, reasons: string[]}}
 */
function check(fs) {
  return pure.verdict(observe(fs));
}

module.exports = { adopt, observe, check, count, files, stripBom };
