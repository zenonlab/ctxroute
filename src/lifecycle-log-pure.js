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

const { formatRecord } = require('./log-pure');

// ⚠️ THE CLOSED VOCABULARY OF A DAEMON LIFE. Every entry happens ONCE per
//    process life (or once per lane), never on something a client can trigger.
//    🛑 NEVER add a name a REQUEST can reach: that is the one change that turns
//    a bounded journal into a traffic-proportional writer.
//    · `start`           — the process began serving; says WHERE it listens.
//    · `loop-block`      — the EVENT LOOP itself was blocked beyond
//                          `LOOP_BLOCK_MS` (2026-09-18). 🔑 IT EXISTS BECAUSE
//                          THE FIELDS ON `serve-stall` LEFT A MEASURED HOLE: a
//                          refused connection NEVER REACHES this process, so a
//                          burst refused in its entirety produces no request,
//                          no stall, and therefore no record — precisely the
//                          second `http-lane.md` measured (32 POSTs, 31 lost,
//                          the daemon receiving NOTHING). The question "was the
//                          loop blocked when they were refused?" then went
//                          unanswered in the one case that decides it.
//                          🔑 IT NEEDS NO TIMER: the runtime's histogram samples
//                          CONTINUOUSLY and is reset only when we write, so a
//                          block SURVIVES inside it across the refused burst and
//                          the first request that gets through afterwards still
//                          carries the peak. Asked on EVERY request, never only
//                          on stalled ones — that is what closes the hole.
//                          🛑 STILL NOT A LINE PER REQUEST: an idle loop measures
//                          16 ms here and the threshold is 100, so a healthy
//                          night writes ZERO. The predicate `isLoopBlock` is
//                          FAIL-CLOSED like `isStall`, for the same reason.
//    · `stale-code-exit` — our own code moved; we refuse to serve yesterday's
//                          logic and let the OS restart us. It carries WHAT the
//                          kernel reported (`kernelEvent`·`file`·`dir`, built by
//                          `http-server.staleCodeFields`): a death whose CAUSE
//                          is unnamed is only half observable — measured 169
//                          such exits in one day with no way to tell which file.
//                          🛑 FIELDS, NOT A NEW EVENT: the list below stays
//                          closed and the frequency stays untouched.
//    · `code-unchanged`  — the kernel raised a notification and the comparison
//                          found NOTHING different (2026-08-24). It is the
//                          NORMAL case: libuv subscribes ReadDirectoryChangesW
//                          to `FILE_NOTIFY_CHANGE_LAST_ACCESS` among others, so
//                          merely READING a file raises one — measured, 258
//                          deaths in a day on a copy nothing had written to.
//                          🛑 IT IS A KERNEL EVENT, NEVER A REQUEST: it fires on
//                          filesystem activity under our own directories, so the
//                          journal stays bounded by what the disk does, not by
//                          what the fleet asks. A guard nobody can see deciding
//                          is a guard nobody can trust — hence the line.
//    · `watch-lost`      — a watcher raised `'error'` (the kernels' "events were
//                          LOST" signal) and could not be re-armed. Once per
//                          directory, at most once per process life.
//    · `signal-exit`     — a supervisor asked us to stop (SIGTERM/SIGINT).
//    · `lane-degraded`   — ONE transport could not take its address. The FIELDS
//                          say which lane and whether it was `fatal`: the
//                          rendezvous survives it (the port keeps serving),
//                          the PORT does not — a port-less daemon would still
//                          hold the rendezvous and refuse its own replacement
//                          as a duplicate, for ever. One FACT, two policies;
//                          a second event name would have been a synonym, and
//                          the ceiling is a consequence of this list's size.
//    · `bind-refused`    — the kernel refused the address (a second instance).
//                          The only error that legitimately kills the daemon.
//    · `idle-exit`       — an ON-DEMAND daemon left because a whole idle window
//                          passed with no request (2026-09-29, `lifecycle-pure`).
//                          At most once per process life, like `signal-exit`:
//                          it is the end of the process, never a request.
const EVENTS = Object.freeze([
  'start',
  'loop-block',
  'stale-code-exit',
  'code-unchanged',
  'watch-lost',
  'signal-exit',
  'idle-exit',
  'lane-degraded',
  'bind-refused',
  // ⚠️ `serve-stall` (2026-09-02) — THE ONLY REQUEST-BORN EVENT, AND IT IS STILL
  //    NOT A LINE PER REQUEST. It is written ONLY when serving ONE request took
  //    longer than `STALL_MS`, i.e. on an ANOMALY: a healthy night writes ZERO
  //    lines, so the traffic-proportional writer this header forbids cannot
  //    exist. 🛑 NEVER relax it into a duration logged every time "to see the
  //    distribution" — that is exactly the per-request writer, wearing a
  //    threshold as a disguise.
  // 🔴 WHY IT WAS ADDED, measured 2026-09-02: production loses connections in an
  //    ALL-OR-NOTHING pattern — a single action losing 30 of its 32 frames while
  //    the busiest seconds of the same night lose nothing. That shape says the
  //    single-threaded daemon was ENTIRELY unavailable for a moment, and NOTHING
  //    in this journal could say so: it records kernel events only, so the
  //    daemon stayed silent through every episode. The candidate cause is the
  //    cross-process lock, which BUSY-WAITS by design (see `http-lane.md`), but
  //    no instrument existed to confirm or kill it — hypotheses were costing one
  //    night each.
  'serve-stall',
  // ⚠️ `socket-cut` (2026-09-24) — a connection this daemon closed ABNORMALLY: a request read and
  //    never answered, bytes received and never parsed, a socket error, or a handler that threw.
  //    Request-born like `serve-stall`, and kept out of the per-request class the same way: by a
  //    fail-closed predicate (`socketCut`), never by a comment. An ordinary close writes nothing.
  'socket-cut',
]);

// ⚠️ THE STALL THRESHOLD — 1 second, and the number is DERIVED, not chosen. A
//    healthy request on this daemon is ~11 ms (measured 2026-08-22), so a whole
//    SECOND is ~90x the normal cost: far outside any scheduling noise a loaded
//    machine can produce, and far below the harness bound (10 s) at which the
//    frame is lost anyway. Between those two lives everything worth a line.
// 🛑 Do NOT lower it "to catch more": the closer it gets to 11 ms, the closer
//    this event gets to being written on every request — the writer the header
//    forbids, reached by a slider instead of a decision.
const STALL_MS = 1000;
// 🔑 DERIVED FROM MEASUREMENT ON THIS MACHINE, NEVER PICKED (2026-09-18).
//    Floor: an IDLE loop measures **16 ms** (witness, twice) and a healthy frame
//    is **3.64 ms** in production — so 100 ms is ~6x anything normal and cannot
//    fire on a healthy night, which is what keeps this out of the
//    traffic-proportional writer the header forbids.
//    Ceiling: the worst `handleMs` ever journalled here is **283 ms**, so the
//    threshold sits well BELOW the events it exists to catch.
// 🛑 NEVER LOWER IT "TO SEE THE DISTRIBUTION" — the same slider warning
//    `STALL_MS` carries. The closer this gets to 16 ms, the closer the journal
//    gets to one line per request, reached by a knob instead of a decision.
const LOOP_BLOCK_MS = 100;

// 🔑 THE CEILING, THE ROTATION AND THE LINE FORMAT LEFT THIS FILE ON 2026-10-04.
//    They were `MAX_BYTES` (256 KB) × `KEPT_FILES` (2), constants in the code;
//    they are now the `logging` setting of `ctxroute-config.json`, decided in
//    `log-pure.js` (same defaults, so an absent setting is the old journal to
//    the byte), and the disk is touched only by `log.js`. This file keeps what
//    is the DAEMON's: its closed vocabulary and the predicates that keep it rare.

/**
 * Did serving ONE request take long enough to be worth a line?
 *
 * 🛑 THIS PREDICATE IS THE WHOLE CEILING OF `serve-stall`. The header forbids a
 *    writer that grows with traffic; what keeps this event out of that class is
 *    not a comment, it is this function answering `false` on the ~11 ms that a
 *    healthy request costs. It lives HERE, pure and mutated, for the same reason
 *    `shouldRotate` does: a threshold written next to the `appendFileSync` is
 *    measured by NOTHING, and an unmeasured threshold REASSURES while the disk
 *    fills.
 * ⚠️ FAIL-CLOSED, THE INVERSE OF `shouldRotate`, AND THE ASYMMETRY IS DELIBERATE.
 *    That one protects a trace we must never lose, so it errs towards writing.
 *    This one protects the SSD against a per-request writer, so an unreadable
 *    duration must answer `false`: a `NaN` treated as "long" would log on every
 *    request the moment a caller passes something odd — the exact failure the
 *    ceiling exists to make impossible.
 * ⚠️ `>=` matches `shouldRotate`: a limit REACHED, not exceeded. One convention
 *    for both thresholds of this module, never two that a reader must recall.
 *
 * @param {{elapsedMs?: unknown, thresholdMs?: unknown}} [input]
 * @returns {boolean}
 */
function isStall(input) {
  const o = input || {};
  const elapsedMs = Number(o.elapsedMs);
  const thresholdMs = o.thresholdMs === undefined ? STALL_MS : Number(o.thresholdMs);
  if (!(thresholdMs > 0)) return false;
  if (!Number.isFinite(elapsedMs)) return false;
  return elapsedMs >= thresholdMs;
}

/**
 * Was the EVENT LOOP itself blocked long enough to be worth a line?
 *
 * 🔑 WHY A SECOND PREDICATE RATHER THAN A FIELD ON `serve-stall` (2026-09-18).
 *    The loop fields rode that event and it left a MEASURED hole: a refused
 *    connection NEVER REACHES this process, so a burst refused in its entirety
 *    produces no request, hence no stall, hence no record at all —
 *    `http-lane.md` measured exactly that second (32 POSTs issued, 31 lost, the
 *    daemon receiving NOTHING). The question "was the loop blocked when they
 *    were refused?" therefore went unanswered in the one case that matters most.
 * 🔑 WHAT CLOSES IT, AND IT NEEDS NO TIMER: the runtime's histogram samples
 *    CONTINUOUSLY and we only reset it when we write. A block survives inside it
 *    across a refused burst, so the FIRST request that gets through afterwards
 *    still carries the peak — recovery is instant (`http-lane.md`), so such a
 *    request always comes. Asking this on EVERY request, instead of only on
 *    stalled ones, is what makes the instrument decisive.
 *
 * 🛑 FAIL-CLOSED, exactly like `isStall` and for the same reason: this decides
 *    whether to WRITE, and a line per request is the traffic-proportional disk
 *    writer this module's header forbids. An unreadable peak, an absent
 *    measurement (`null` — the runtime does not expose the histogram) or a
 *    non-positive threshold ⇒ `false`, i.e. SILENCE.
 * ⚠️ `null` MUST NOT be read as zero here. `Number(null)` is 0, which would pass
 *    `Number.isFinite` and compare as "the loop was never blocked" — a verdict
 *    on a measurement that never happened. It is refused BEFORE the conversion.
 *
 * @param {{loopMaxMs?: unknown, thresholdMs?: unknown}} [input]
 * @returns {boolean} true when the block deserves a record
 */
function isLoopBlock(input) {
  const o = input || {};
  // 🛑 NO EXPLICIT `null`/`undefined` GUARD HERE, AND THAT IS A MEASURED
  //    DECISION, NOT AN OVERSIGHT (2026-09-18). One was written and REMOVED:
  //    Stryker proved it EQUIVALENT — `Number(undefined)` is `NaN`, refused by
  //    `Number.isFinite` below, and `Number(null)` is `0`, which can never reach
  //    a threshold the line above has already forced to be POSITIVE. The guard
  //    could not change a single verdict, so it was dead code, and a test
  //    written to keep it would have FROZEN dead code for ever.
  // ⚠️ THE INTENT IT CARRIED IS STILL HONOURED, by arithmetic instead of by a
  //    branch: an ABSENT measurement never reads as "the loop was never
  //    blocked", because `0` is below every admissible threshold. If that ever
  //    stops being true — a threshold of zero or less — the line above already
  //    answers `false` first. The cells for `null`/`undefined` stay in the
  //    suite: they assert the BEHAVIOUR, which survives the guard's removal.
  const loopMaxMs = Number(o.loopMaxMs);
  const thresholdMs = o.thresholdMs === undefined ? LOOP_BLOCK_MS : Number(o.thresholdMs);
  if (!(thresholdMs > 0)) return false;
  if (!Number.isFinite(loopMaxMs)) return false;
  return loopMaxMs >= thresholdMs;
}

/**
 * Converts ONE reading of the runtime's event-loop histogram into a field, or
 * `null` when there is nothing to report.
 *
 * 🔴 IT EXISTS BECAUSE THE FIELDS SHIPPED A LYING ZERO ON THEIR FIRST DAY
 *    (2026-09-18, found in production by reading the journal). Four `serve-stall`
 *    lines carry `loopMaxMs=0 loopMeanMs=NaN` — the histogram had just been
 *    RESET and had collected no sample yet, so `max` is `0` and `mean` is `NaN`.
 *    The module header, written the same day, forbids exactly this: **`null`,
 *    NEVER ZERO, when the runtime does not expose it** — because zero reads as
 *    "the loop was never blocked", which is a verdict on a measurement that never
 *    happened. The rule was written and then not applied to the EMPTY-WINDOW
 *    case, which is the one that actually occurs.
 * 🛑 THE DECISION LIVES HERE AND NOT BESIDE THE HISTOGRAM. Written in the daemon
 *    shell it would be a verdict Stryker never mutates, and this repository has
 *    paid that class more than any other.
 * ⚠️ `count` IS THE AUTHORITY, never the value. A window that collected ZERO
 *    samples has no maximum and no mean, whatever bytes the object happens to
 *    hold — asking the VALUE whether it is trustworthy is how `0` got through in
 *    the first place. A non-finite value is refused as well, so `NaN` can never
 *    reach a journal line either way.
 *
 * @param {unknown} nanos the histogram's reading, in NANOSECONDS
 * @param {unknown} sampleCount how many samples that window collected
 * @returns {number|null} whole milliseconds, or `null` when nothing was measured
 */
function loopFieldMs(nanos, sampleCount) {
  const n = Number(sampleCount);
  if (!Number.isFinite(n) || n <= 0) return null;
  const v = Number(nanos);
  if (!Number.isFinite(v)) return null;
  return Math.round(v / 1e6);
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
  // 🔑 THE RENDERING IS `log-pure.formatRecord`, ONE FORMAT FOR EVERY JOURNAL;
  //    what stays HERE is the daemon's closed vocabulary, which is what keeps an
  //    unknown name from costing a byte.
  return formatRecord({ at: o.at, event: o.event, fields: o.fields, vocabulary: EVENTS });
}

/**
 * The fields of a `bind-refused` record on the RENDEZVOUS lane, from the error `kernel-bind` hands on.
 *
 * 🔴 WHY IT IS HERE AND NOT INLINE IN `main` (2026-09-23): `branch` (owner-alive · rebind-failed) and
 *    `unlinkCode` are what told a correct refusal from the macOS defect on the runner, and written
 *    inside `main` nothing could see them disappear — the one gap of that day's audit. Pure, mutated.
 * ⚠️ Absent annotations stay absent (`formatEvent` omits null/undefined): an error `kernel-bind` did
 *    not annotate must never read as a branch it did not take.
 * @param {{code?: string, rendezvous?: string, unlinkCode?: string|null}} err the kernel's error, annotated
 * @param {number} pid
 */
function rendezvousRefusal(err, pid) {
  const e = err || {};
  return { lane: 'rendezvous', code: e.code, branch: e.rendezvous, unlinkCode: e.unlinkCode, pid };
}

/**
 * The fields of a `socket-cut` record, or `null` when the connection ended the ordinary way.
 *
 * 🔴 WHY IT EXISTS (2026-09-24): from 2026-09-23 10:42Z the harness saw `read ECONNRESET` on
 *    1.44 % of its POSTs — 903 of them, against ≤ 0.07 % on every earlier day — and a reset says only
 *    that SOMEBODY slammed the connection: this daemon (a request it read and never answered, or
 *    bytes it received and threw away) or something between the two processes. The daemon could not
 *    say which, because none of those paths wrote anything. This record is the daemon's half of the
 *    answer; its SILENCE while resets continue is the other half.
 * 🛑 FAIL-CLOSED, LIKE `isStall`, AND IT IS THE WHOLE CEILING: an ordinary close (every request
 *    answered, nothing unread, no error) answers `null`, and so does anything unreadable (`NaN`
 *    compares false). Every action ends with the harness's idle sockets closing — a line for those
 *    would be the per-request writer this module forbids.
 * @param {{requests?: unknown, answered?: unknown, unreadBytes?: unknown, errorCode?: unknown, threw?: unknown}} [input]
 * @returns {{inFlight: boolean, unreadBytes: number|null, errorCode: string|null, threw: string|null}|null}
 */
function socketCut(input) {
  const o = input || {};
  const inFlight = Number(o.requests) > Number(o.answered);
  const unread = Number(o.unreadBytes);
  const unreadBytes = unread > 0 ? unread : null;
  const errorCode = typeof o.errorCode === 'string' && o.errorCode.length > 0 ? o.errorCode : null;
  const threw = typeof o.threw === 'string' && o.threw.length > 0 ? o.threw : null;
  if (!inFlight && unreadBytes === null && errorCode === null && threw === null) return null;
  return { inFlight, unreadBytes, errorCode, threw };
}

module.exports = {
  rendezvousRefusal, socketCut,
  formatEvent, isStall, isLoopBlock, loopFieldMs,
  EVENTS, STALL_MS, LOOP_BLOCK_MS,
};
