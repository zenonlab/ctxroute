// ═══════════════════════════════════════════════════════════════════════
// lifecycle-log-pure.js — WHAT A DAEMON LIFE EVENT LOOKS LIKE, AND WHEN THE
// JOURNAL TURNS OVER. Pure decision, ZERO I/O.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 THE DEFECT IT CLOSES, MEASURED 2026-08-22: the daemon died and restarted
//    NINE TIMES IN ONE HOUR (exit 90) and left NOTHING — no time, no reason, no
//    way to count. The deaths themselves are BY DESIGN (`watchOwnCode` refuses
//    to serve stale logic, the OS restarts us) and on Linux socket activation
//    even makes them free. What was wrong is that a thing which runs for months
//    unattended had NO trace of its own life. An unobservable failure costs one
//    round trip PER HYPOTHESIS — this repository has already paid that twice.
//
// 🛑 SPACE DECLARES ITSELF. A journal without a CEILING does not exist as a
//    component: it is an ARCHITECTURE bug, never an operations one. The ceiling
//    and the eviction are decided HERE, in the same gesture as the writer, and
//    declared in `disk-writers.json`. The question is never "is it big?" but
//    "at 10 years, what is it worth?" — and the answer is fixed: 512 KB, for
//    life, whatever the traffic and whatever the uptime.
//
// 🛑 THE SHAPE IS THE FLEET'S, DELIBERATELY — one convention, never two that
//    drift. The operator's hook fleet already solved exactly this problem in
//    `maintenance/reaper-core.js`: `shouldRotate({sizeBytes, maxBytes})` plus a
//    single rename onto `.1` that OVERWRITES, which is what bounds the whole
//    thing to two files. Same ceiling (256 KB), same shape, same fail-open
//    posture. ⚠️ IT IS RE-IMPLEMENTED AND NOT IMPORTED, on purpose: `ctxroute`
//    is a PUBLIC repository and must not depend on a personal fleet tool. Copy
//    the SHAPE across that boundary, never the file.
//
// 🛑 EVENTS ONLY — NEVER A HEARTBEAT, NEVER ONE LINE PER REQUEST. SSD wear is a
//    real constraint on the machine this runs on, and the same fleet tool
//    carries a gate that turns RED if anyone adds a "nothing to do" line to it.
//    One action of an agent costs 16 requests: a per-request line would be a
//    disk writer that GROWS WITH TRAFFIC, i.e. exactly the unbounded writer this
//    file exists to forbid. ⇒ the vocabulary is a CLOSED LIST below, and an
//    event outside it is a NAMED REFUSAL (`null`), not a line. Adding a
//    per-request event therefore means editing this list and facing its judge —
//    it cannot be done in passing, inside a handler, by someone in a hurry.
//
// ⚠️ FAIL-OPEN THROUGHOUT, the OPPOSITE default of a gate: unusable input
//    produces NO line, never an exception. A daemon must NEVER die because its
//    logging failed, and housekeeping must never delay the service.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

// ⚠️ THE CLOSED VOCABULARY OF A DAEMON LIFE. Every entry happens ONCE per
//    process life (or once per lane), never on something a client can trigger.
//    🛑 NEVER add a name a REQUEST can reach: that is the one change that turns
//    a bounded journal into a traffic-proportional writer.
//    · `start`           — the process began serving; says WHERE it listens.
//    · `stale-code-exit` — our own code moved; we refuse to serve yesterday's
//                          logic and let the OS restart us. It carries WHAT the
//                          kernel reported (`kernelEvent`·`file`·`dir`, built by
//                          `http-server.staleCodeFields`): a death whose CAUSE
//                          is unnamed is only half observable — measured 169
//                          such exits in one day with no way to tell which file.
//                          🛑 FIELDS, NOT A NEW EVENT: the list below stays
//                          closed and the frequency stays untouched.
//    · `signal-exit`     — a supervisor asked us to stop (SIGTERM/SIGINT).
//    · `lane-degraded`   — ONE transport could not be taken; the other keeps
//                          serving. Announced rather than suffered in silence.
//    · `bind-refused`    — the kernel refused the address (a second instance).
//                          The only error that legitimately kills the daemon.
const EVENTS = Object.freeze([
  'start',
  'stale-code-exit',
  'signal-exit',
  'lane-degraded',
  'bind-refused',
]);

// ⚠️ CEILING PER FILE — 256 KB, the fleet's figure, and it is not a taste. A
//    lifecycle line weighs ~60 bytes, so 256 KB holds thousands of daemon lives:
//    far past anything anyone re-reads. Do NOT raise it "to keep more history".
const MAX_BYTES = 256 * 1024;

// ⚠️ FILES KEPT — the current journal and exactly ONE predecessor. The bound is
//    not a policy written somewhere, it is a CONSEQUENCE of the mechanism: the
//    rotation renames onto `.1`, and a rename OVERWRITES. 🛑 NEVER move to a
//    `.1 .2 .3` scheme: the bound would stop being structural and become a
//    number someone has to maintain.
const KEPT_FILES = 2;

// The whole cost of this component on the disk, for life, at any traffic and any
// uptime. This is the figure `disk-writers.json` declares as its budget.
const TOTAL_MAX_BYTES = MAX_BYTES * KEPT_FILES;

/**
 * Collapses anything into ONE line.
 *
 * 🛑 LOAD-BEARING, NOT COSMETIC: a journal is line-delimited, so a value
 *    carrying a newline would FORGE an extra entry — and the values logged here
 *    include an OS error message, i.e. text this process does not author. One
 *    record must remain one line whatever it is handed.
 *
 * @param {unknown} value
 * @returns {string}
 */
function oneLine(value) {
  return String(value).replace(/[\r\n]+/g, ' ');
}

/**
 * Must the journal turn over BEFORE this write?
 *
 * ⚠️ FAIL-OPEN, DELIBERATELY THE INVERSE OF A GATE: an unreadable size or an
 *    absurd ceiling means we do NOT rotate, hence we still WRITE. The worst case
 *    is a slightly oversized file; refusing to write would lose the trace of a
 *    death, which is the entire reason this exists. NEVER invert this default.
 * ⚠️ `>=` and not `>`: the ceiling is a limit REACHED, not exceeded. A
 *    `maxBytes` of 0 is refused by `maxBytes > 0` (it would rotate on every
 *    single write); a negative or NaN ceiling is refused by the same test.
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
 * Renders ONE lifecycle record, or REFUSES by name.
 *
 * ⚠️ AN UNKNOWN EVENT RETURNS `null`, IT DOES NOT GET LOGGED. That is what keeps
 *    the vocabulary closed and the writer bounded (see the header): a caller
 *    cannot invent a per-request event on the spot.
 * ⚠️ An absent or empty timestamp also returns `null`: a lifecycle record whose
 *    only job is to say WHEN is worth nothing without its instant, and writing
 *    it anyway would spend disk on a line nobody can use.
 * ⚠️ Fields that are `null`/`undefined` are OMITTED rather than printed empty —
 *    the caller passes the same shape whichever lane it is on, and an absent
 *    fact must read as absent, never as a value.
 *
 * @param {{at?: unknown, event?: unknown, fields?: unknown}} [input]
 * @returns {string|null} the record WITHOUT its trailing newline (the shell adds
 *   it), or `null` when there is nothing legitimate to write.
 */
function formatEvent(input) {
  const o = input || {};
  // ⚠️ A CAST, NEVER A RUNTIME GUARD. `includes` already answers `false` for a
  //    number, an object or `undefined`, so a `typeof` here would change nothing
  //    at run time — it would only add an EQUIVALENT mutant that no test could
  //    ever kill. The cast satisfies `check:types` and costs zero instructions.
  const event = /** @type {string} */ (o.event);
  if (!EVENTS.includes(event)) return null;
  // ⚠️ The `typeof` is NOT redundant with the length test: a NUMBER has no
  //    `length`, so `undefined === 0` is false and a bare length check would let
  //    `at: 42` through as a timestamp.
  if (typeof o.at !== 'string' || o.at.length === 0) return null;
  const fields = o.fields;
  let detail = '';
  // ⚠️ The `typeof` is load-bearing here too: a STRING is truthy and
  //    `Object.keys('ab')` answers `['0','1']`, i.e. a record made of noise.
  if (fields && typeof fields === 'object') {
    for (const key of Object.keys(fields)) {
      const value = fields[key];
      if (value === null || value === undefined) continue;
      detail += ' ' + key + '=' + oneLine(value);
    }
  }
  return oneLine(o.at) + ' event=' + event + detail;
}

module.exports = {
  formatEvent, shouldRotate, oneLine,
  EVENTS, MAX_BYTES, KEPT_FILES, TOTAL_MAX_BYTES,
};
