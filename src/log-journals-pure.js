// ═══════════════════════════════════════════════════════════════════════
// log-journals-pure.js — THE CLOSED REGISTRY OF JOURNALS. Pure, ZERO I/O.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 ONE ENTRY = ONE FILE + ITS CLOSED VOCABULARY, each event with its severity
//    (`log-pure.SEVERITIES`). The writer `log.js` refuses any journal or event
//    outside this table (`null` ⇒ nothing written), so a new journal or a new
//    event is an edit HERE, facing its cells, never a line slipped into a
//    handler. The ceiling every journal can reach is derived from this table
//    and `log-pure.BOUNDS` alone: that is what `disk-writers.json` declares.
//
//    · `daemon` — the state daemon's life (`lifecycle-log-pure.EVENTS`, all
//      `event`, i.e. always written), `daemon-error` (a failure the daemon
//      survived, `error`) and `request`, one line per served request, `debug` ONLY. 🛑 `request` stays out of `lifecycle-log-pure.EVENTS`:
//      that list is the always-on vocabulary, and a request-born name there
//      would be the traffic-proportional writer it forbids.
//    · `hooks`  — the spawned hooks: `hook-error` (a hook failed and stayed
//      fail-open, always written) and `hook-trace` (what it decided, `debug`).
//    · `logging-refused`, in BOTH: the `logging` setting was refused by name and
//      the journal runs on the defaults (`log.js` writes it once per process).
//
// ⚠️ THE TABLE IS BUILT BY A FUNCTION, NEVER AT MODULE LOAD: a value computed at
//    import runs under no test, so mutation marks it covered by nobody and lets
//    a broken table survive (measured 2026-10-04 on this file). It costs a dozen
//    entries per call.
// ⚠️ IT IS A SEPARATE MODULE FROM `log-pure.js` ON PURPOSE: `lifecycle-log-pure`
//    renders its lines through `log-pure`, and this table needs its vocabulary.
//    One file holding both would be an import cycle.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const { EVENTS: DAEMON_EVENTS } = require('./lifecycle-log-pure');
const { BOUNDS } = require('./log-pure');

/**
 * The registry, frozen at every level.
 * @returns {Readonly<Record<string, {file: string, events: Readonly<Record<string, string>>}>>}
 */
function journals() {
  /** @type {Record<string, string>} */
  const daemon = {};
  for (const e of DAEMON_EVENTS) daemon[e] = 'event';
  daemon.request = 'debug';
  daemon['daemon-error'] = 'error';
  daemon['logging-refused'] = 'error';
  return Object.freeze({
    daemon: Object.freeze({ file: 'ctxroute-daemon.log', events: Object.freeze(daemon) }),
    hooks: Object.freeze({
      file: 'ctxroute-hooks.log',
      events: Object.freeze({ 'hook-error': 'error', 'hook-trace': 'debug', 'logging-refused': 'error' }),
    }),
  });
}

/**
 * The whole cost of every journal on the disk, for life, at the WORST setting
 * the bounds allow — whatever the adopter writes, the disk never holds more.
 * @returns {{files: number, bytes: number}}
 */
function worstCase() {
  const files = Object.keys(journals()).length * BOUNDS.keptFiles.max;
  return { files, bytes: files * BOUNDS.maxBytes.max };
}

/**
 * The journal's entry, or `null` when the registry does not know it.
 *
 * ⚠️ The `typeof` is a TYPE GUARD on a public contract, not a redundancy:
 *    `Object.hasOwn` coerces its key, so `['daemon']` would otherwise pass.
 *
 * @param {unknown} journal
 * @returns {{file: string, events: Readonly<Record<string, string>>}|null}
 */
function journalOf(journal) {
  const all = journals();
  if (typeof journal !== 'string' || !Object.hasOwn(all, journal)) return null;
  return all[journal];
}

/**
 * The severity of an event in a journal, or `null` when either is unknown.
 * Same type guard as `journalOf`, for the same coercion.
 *
 * @param {unknown} journal
 * @param {unknown} event
 * @returns {string|null}
 */
function severityOf(journal, event) {
  const j = journalOf(journal);
  if (j === null || typeof event !== 'string' || !Object.hasOwn(j.events, event)) return null;
  return j.events[event];
}

module.exports = { journals, worstCase, journalOf, severityOf };
