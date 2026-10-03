// ═══════════════════════════════════════════════════════════════════════
// lifecycle-log-pure — the DECISION half of the daemon journal.
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ IMPORTED DIRECTLY, never through a re-export: a CJS edge behind a
//    re-export is invisible to vitest's module graph, and Stryker then runs NO
//    test at all against this file while the score reads perfectly (measured in
//    this repository on the `keys` operator: 62 phantom survivors).
// ⚠️ perTest coverage: EVERY fixture is built INSIDE its `test()` callback. A
//    module-level const calling the mutated code is a STATIC mutant covered by
//    no test — 42 false survivors were measured on that exact mistake here.
// ⚠️ Expected values are written out LITERALLY, copied from the source. Never
//    `toBe(MODULE.CONSTANT)`: that proves `x === x` and leaves the contract
//    unasserted (43 survivors, measured 2026-08-21).
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import {
  rendezvousRefusal, socketCut,
  formatEvent, shouldRotate, oneLine, isStall, isLoopBlock, loopFieldMs, LOOP_BLOCK_MS,
  EVENTS, MAX_BYTES, KEPT_FILES, TOTAL_MAX_BYTES, STALL_MS,
} from '../src/lifecycle-log-pure.js';

// ═══════════════════════════════════════════════════════════════════════
// THE CEILING — declared numbers, asserted literally.
// ═══════════════════════════════════════════════════════════════════════

test('the ceiling is 256 KB per file, 2 files, 512 KB for life', () => {
  assert.equal(MAX_BYTES, 262144);
  assert.equal(KEPT_FILES, 2);
  // 🛑 The figure `disk-writers.json` declares as this component's budget. If it
  //    ever moves, that manifest moves in the SAME gesture or the declaration
  //    becomes a permit for something else.
  assert.equal(TOTAL_MAX_BYTES, 524288);
});

// ═══════════════════════════════════════════════════════════════════════
// THE CLOSED VOCABULARY — this is what keeps the writer bounded.
// ═══════════════════════════════════════════════════════════════════════

test('the event vocabulary is exactly the eleven lifecycle facts, and it is frozen', () => {
  assert.deepEqual(EVENTS, [
    'start',
    // ⚠️ 2026-09-18: the SECOND request-born event, and it passes the same
    //    refusal for the same reason — written only when the EVENT LOOP was
    //    blocked past `LOOP_BLOCK_MS`, which an idle loop (16 ms here) never
    //    reaches. It exists because the loop fields on `serve-stall` could not
    //    see the decisive case: a burst refused whole reaches this process not
    //    at all, so no stall, so no record. What keeps it out of the
    //    per-request class is `isLoopBlock`, tested further down.
    'loop-block',
    'stale-code-exit',
    // ⚠️ 2026-08-24: a kernel notification can now end in EITHER outcome, so the
    //    quiet one has a name. It is a KERNEL event, never a request — the
    //    per-request refusal below is untouched.
    'code-unchanged',
    'watch-lost',
    'signal-exit',
    // ⚠️ 2026-09-29: the end of an ON-DEMAND daemon after an idle window — a
    //    process event like `signal-exit`, never a request.
    'idle-exit',
    'lane-degraded',
    'bind-refused',
    // ⚠️ 2026-09-02: the ONLY request-born event, and it survives the refusal
    //    below because it is written on an ANOMALY, never on a request. What
    //    keeps it out of the per-request class is `isStall`, tested further
    //    down — not this list, and not a comment.
    'serve-stall',
    // ⚠️ 2026-09-24: request-born too, kept out of the per-request class by `socketCut`,
    //    fail-closed and tested below — an ordinary close writes nothing.
    'socket-cut',
  ]);
  // A mutable vocabulary can be widened at runtime, from anywhere, by anyone —
  // including by the caller this closed list exists to constrain.
  assert.equal(Object.isFrozen(EVENTS), true);
});

test('EVERY declared event actually renders (an inert vocabulary entry is a lie)', () => {
  const rendered = EVENTS.map((e) => formatEvent({ at: '2026-08-22T00:00:00.000Z', event: e }));
  assert.deepEqual(rendered, [
    '2026-08-22T00:00:00.000Z event=start',
    '2026-08-22T00:00:00.000Z event=loop-block',
    '2026-08-22T00:00:00.000Z event=stale-code-exit',
    '2026-08-22T00:00:00.000Z event=code-unchanged',
    '2026-08-22T00:00:00.000Z event=watch-lost',
    '2026-08-22T00:00:00.000Z event=signal-exit',
    '2026-08-22T00:00:00.000Z event=idle-exit',
    '2026-08-22T00:00:00.000Z event=lane-degraded',
    '2026-08-22T00:00:00.000Z event=bind-refused',
    '2026-08-22T00:00:00.000Z event=serve-stall',
    '2026-08-22T00:00:00.000Z event=socket-cut',
  ]);
});

// ═══════════════════════════════════════════════════════════════════════
// THE STALL THRESHOLD — this predicate is what keeps `serve-stall` out of the
// per-request class the vocabulary exists to forbid.
// ═══════════════════════════════════════════════════════════════════════

test('🛑 A HEALTHY REQUEST WRITES NOTHING — the anti-SSD-wear contract, second door', () => {
  // The measured cost of a healthy request on this daemon is ~11 ms. If this
  // predicate ever answered `true` there, `serve-stall` would BE the line per
  // request — the writer the closed vocabulary was built to make impossible,
  // reached through a threshold instead of through a name.
  assert.equal(isStall({ elapsedMs: 11 }), false);
  assert.equal(isStall({ elapsedMs: 200 }), false);
  assert.equal(isStall({ elapsedMs: 999 }), false);
});

test('the threshold is a limit REACHED, not exceeded — same convention as the ceiling', () => {
  assert.equal(STALL_MS, 1000);
  assert.equal(isStall({ elapsedMs: 1000 }), true);
  assert.equal(isStall({ elapsedMs: 1001 }), true);
  assert.equal(isStall({ elapsedMs: 30000 }), true);
});

test('FAIL-CLOSED, the INVERSE of the rotation ceiling, and the asymmetry is the point', () => {
  // `shouldRotate` errs towards WRITING because losing the trace of a death is
  // the worse outcome. Here the worse outcome is a line on every request, so an
  // unreadable duration must answer `false`.
  assert.equal(isStall({ elapsedMs: NaN }), false);
  // 🔑 INFINITY IS WHAT MAKES THE `Number.isFinite` GUARD REAL (2026-10-01): NaN
  //    already fails `>=`, so it proved nothing — but `Infinity >= 1000` is TRUE,
  //    and without the guard an unreadable duration would WRITE a line.
  assert.equal(isStall({ elapsedMs: Infinity }), false);
  assert.equal(isStall({ elapsedMs: 'abc' }), false);
  assert.equal(isStall({ elapsedMs: undefined }), false);
  assert.equal(isStall({}), false);
  assert.equal(isStall(), false);
  // An absurd or absent threshold disarms the event rather than arming it on
  // everything — a zero threshold would make EVERY duration a stall.
  assert.equal(isStall({ elapsedMs: 5000, thresholdMs: 0 }), false);
  assert.equal(isStall({ elapsedMs: 5000, thresholdMs: -1 }), false);
  assert.equal(isStall({ elapsedMs: 5000, thresholdMs: NaN }), false);
});

test('numeric strings are accepted on both sides (a duration read back from text is still one)', () => {
  assert.equal(isStall({ elapsedMs: '2000' }), true);
  assert.equal(isStall({ elapsedMs: '10' }), false);
  assert.equal(isStall({ elapsedMs: 2000, thresholdMs: '3000' }), false);
});

test('🛑 A PER-REQUEST OR HEARTBEAT EVENT WRITES NOTHING — the anti-SSD-wear contract', () => {
  // This is the whole reason the vocabulary is closed rather than free-form: one
  // agent action is 16 requests on this daemon, so a line per request would be a
  // disk writer growing with TRAFFIC. Whoever adds one must edit the list and
  // face this cell — they cannot do it in passing inside a handler.
  assert.equal(formatEvent({ at: '2026-08-22T00:00:00.000Z', event: 'request' }), null);
  assert.equal(formatEvent({ at: '2026-08-22T00:00:00.000Z', event: 'heartbeat' }), null);
  assert.equal(formatEvent({ at: '2026-08-22T00:00:00.000Z', event: 'alive' }), null);
});

test('an absent, empty or non-string instant writes nothing', () => {
  // A lifecycle record whose job is to say WHEN is worthless without its instant.
  assert.equal(formatEvent({ event: 'start' }), null);
  assert.equal(formatEvent({ at: '', event: 'start' }), null);
  // ⚠️ A NUMBER has no `length`, so a bare length check would let this through
  //    as a timestamp — that is why the `typeof` guard exists.
  assert.equal(formatEvent({ at: 42, event: 'start' }), null);
  assert.equal(formatEvent({ at: null, event: 'start' }), null);
});

test('called with nothing at all it refuses instead of throwing (fail-open)', () => {
  assert.equal(formatEvent(), null);
  assert.equal(formatEvent(null), null);
});

// ═══════════════════════════════════════════════════════════════════════
// THE RECORD ITSELF
// ═══════════════════════════════════════════════════════════════════════

test('fields are appended in order, as key=value', () => {
  const line = formatEvent({
    at: '2026-08-22T01:02:03.000Z',
    event: 'stale-code-exit',
    fields: { pid: 4242, code: 90, uptimeMs: 51000 },
  });
  assert.equal(line, '2026-08-22T01:02:03.000Z event=stale-code-exit pid=4242 code=90 uptimeMs=51000');
});

test('null and undefined fields are OMITTED, never printed as a value', () => {
  const line = formatEvent({
    at: '2026-08-22T01:02:03.000Z',
    event: 'start',
    fields: { lane: 'port', fd: null, port: 8787, extra: undefined },
  });
  assert.equal(line, '2026-08-22T01:02:03.000Z event=start lane=port port=8787');
});

test('0, false and the empty string are VALUES and are kept', () => {
  // An absent fact must read as absent; a fact that IS zero must read as zero.
  // Collapsing the two would make `fd=0` (a real inherited descriptor) vanish.
  const line = formatEvent({
    at: '2026-08-22T01:02:03.000Z',
    event: 'start',
    fields: { fd: 0, degraded: false, message: '' },
  });
  assert.equal(line, '2026-08-22T01:02:03.000Z event=start fd=0 degraded=false message=');
});

test('a non-object `fields` contributes nothing (a string is truthy and has keys)', () => {
  assert.equal(
    formatEvent({ at: '2026-08-22T01:02:03.000Z', event: 'start', fields: 'ab' }),
    '2026-08-22T01:02:03.000Z event=start',
  );
  assert.equal(
    formatEvent({ at: '2026-08-22T01:02:03.000Z', event: 'start', fields: null }),
    '2026-08-22T01:02:03.000Z event=start',
  );
  assert.equal(
    formatEvent({ at: '2026-08-22T01:02:03.000Z', event: 'start' }),
    '2026-08-22T01:02:03.000Z event=start',
  );
});

test('🛑 ONE RECORD IS ONE LINE — a newline in a value cannot forge a second entry', () => {
  // The values logged here include an OS error message, i.e. text this process
  // does not author. A journal is line-delimited: without this, a crafted or
  // merely multi-line error would fabricate records.
  const line = formatEvent({
    at: '2026-08-22T01:02:03.000Z',
    event: 'lane-degraded',
    fields: { message: 'bind failed\nevent=start pid=1' },
  });
  assert.equal(line, '2026-08-22T01:02:03.000Z event=lane-degraded message=bind failed event=start pid=1');
  assert.equal(line.includes('\n'), false);
});

test('the instant is collapsed too (the same forgery through the other door)', () => {
  const line = formatEvent({ at: 'a\r\nb', event: 'start' });
  assert.equal(line, 'a b event=start');
});

test('oneLine collapses every run of CR/LF into a single space and leaves the rest alone', () => {
  assert.equal(oneLine('a\nb'), 'a b');
  assert.equal(oneLine('a\r\n\r\nb'), 'a b');
  assert.equal(oneLine('a b'), 'a b');
  assert.equal(oneLine(90), '90');
  assert.equal(oneLine(false), 'false');
});

// ═══════════════════════════════════════════════════════════════════════
// ROTATION — the ceiling, decided here, applied by the shell.
// ═══════════════════════════════════════════════════════════════════════

test('the ceiling is a limit REACHED, not exceeded', () => {
  assert.equal(shouldRotate({ sizeBytes: 262143, maxBytes: 262144 }), false);
  assert.equal(shouldRotate({ sizeBytes: 262144, maxBytes: 262144 }), true);
  assert.equal(shouldRotate({ sizeBytes: 999999, maxBytes: 262144 }), true);
  assert.equal(shouldRotate({ sizeBytes: 0, maxBytes: 262144 }), false);
});

test('FAIL-OPEN: an absurd ceiling or an unreadable size means DO NOT rotate, hence still write', () => {
  // The inverse of a gate, deliberately. The worst case is a slightly oversized
  // file; refusing to write would lose the trace of a death.
  assert.equal(shouldRotate({ sizeBytes: 10, maxBytes: 0 }), false);
  assert.equal(shouldRotate({ sizeBytes: 10, maxBytes: -1 }), false);
  assert.equal(shouldRotate({ sizeBytes: 10, maxBytes: 'x' }), false);
  assert.equal(shouldRotate({ sizeBytes: 'x', maxBytes: 10 }), false);
  assert.equal(shouldRotate({ sizeBytes: Infinity, maxBytes: 10 }), false);
  assert.equal(shouldRotate({}), false);
  assert.equal(shouldRotate(), false);
});

test('numeric strings are accepted on both sides (a size read back from text is still a size)', () => {
  assert.equal(shouldRotate({ sizeBytes: '300000', maxBytes: '262144' }), true);
  assert.equal(shouldRotate({ sizeBytes: '10', maxBytes: '262144' }), false);
});

// ═══════════════════════════════════════════════════════════════════════
// `isLoopBlock` — FAIL-CLOSED, exactly like `isStall` and for the same reason:
// it decides whether to WRITE, and a line per request is the traffic-
// proportional disk writer the module header forbids.
// ═══════════════════════════════════════════════════════════════════════

test('a healthy loop writes NOTHING — the idle measurement is 16 ms here', () => {
  assert.equal(isLoopBlock({ loopMaxMs: 16 }), false);
  assert.equal(isLoopBlock({ loopMaxMs: 99 }), false);
});

test('a real block is recorded, and the bound is INCLUSIVE', () => {
  assert.equal(isLoopBlock({ loopMaxMs: 100 }), true);
  assert.equal(isLoopBlock({ loopMaxMs: 265 }), true);
});

// 🛑 `null` IS NOT ZERO. `Number(null)` is 0, which would pass `Number.isFinite`
//    and read as "the loop was never blocked" — a verdict on a measurement that
//    never happened, the lying green this repository refuses.
test('an ABSENT measurement is silence, never a verdict of zero', () => {
  assert.equal(isLoopBlock({ loopMaxMs: null }), false);
  assert.equal(isLoopBlock({ loopMaxMs: undefined }), false);
  assert.equal(isLoopBlock({}), false);
  assert.equal(isLoopBlock(), false);
  assert.equal(isLoopBlock(null), false);
});

test('an unreadable peak is silence', () => {
  assert.equal(isLoopBlock({ loopMaxMs: 'slow' }), false);
  assert.equal(isLoopBlock({ loopMaxMs: NaN }), false);
  // ⚠️ `Infinity` IS SILENCE TOO, and the expectation written here FIRST said the
  //    opposite: `Number.isFinite` refuses it, so an absurd peak is treated
  //    exactly like an unreadable one. The CODE was right, the cell was wrong.
  assert.equal(isLoopBlock({ loopMaxMs: Infinity }), false);
});

test('a non-positive or unreadable threshold is silence, never a flood', () => {
  assert.equal(isLoopBlock({ loopMaxMs: 5000, thresholdMs: 0 }), false);
  assert.equal(isLoopBlock({ loopMaxMs: 5000, thresholdMs: -1 }), false);
  assert.equal(isLoopBlock({ loopMaxMs: 5000, thresholdMs: 'x' }), false);
});

test('an explicit threshold overrides the declared default', () => {
  assert.equal(isLoopBlock({ loopMaxMs: 50, thresholdMs: 40 }), true);
  assert.equal(isLoopBlock({ loopMaxMs: 50, thresholdMs: 60 }), false);
});

// ⚠️ CONTRACT VALUE WRITTEN HARDCODED — never derived from the module, which
//    would demonstrate `x === x` and leave its mutant alive.
test('the declared threshold is 100 ms', () => {
  assert.equal(LOOP_BLOCK_MS, 100);
});

// ---------------------------------------------------------------------------
// `loopFieldMs` — THE LYING ZERO, CAUGHT IN PRODUCTION (2026-09-18)
//
// 🔴 THE DEFECT THESE CELLS EXIST FOR IS NOT HYPOTHETICAL: four real
//    `serve-stall` lines of `state/ctxroute-daemon.log` carry
//    `loopMaxMs=0 loopMeanMs=NaN`. The histogram had just been reset and held no
//    sample, so `max` was 0 and `mean` NaN — and a ZERO in that field reads as
//    "the loop was never blocked", i.e. it EXONERATES the daemon on a
//    measurement that never happened. The module header forbade it in those
//    exact words on the same day the field shipped.
// 🛑 THE FIRST CELL BELOW IS THE DEFECT ITSELF, copied from the real reading.
// ---------------------------------------------------------------------------

test('an EMPTY window reports null, never the zero that would exonerate', () => {
  // the exact shape of the production defect: a freshly reset histogram
  assert.equal(loopFieldMs(0, 0), null);
  assert.equal(loopFieldMs(Number.NaN, 0), null);
});

test('a window that collected samples reports whole milliseconds', () => {
  assert.equal(loopFieldMs(261_000_000, 42), 261);
  assert.equal(loopFieldMs(16_400_000, 7), 16);
  assert.equal(loopFieldMs(16_600_000, 7), 17);
});

test('the COUNT is the authority, never the value', () => {
  // a plausible-looking peak with no sample behind it is still nothing measured
  assert.equal(loopFieldMs(261_000_000, 0), null);
  // and a real sample whose value is unreadable never reaches a journal line
  assert.equal(loopFieldMs(Number.NaN, 42), null);
  assert.equal(loopFieldMs(Number.POSITIVE_INFINITY, 42), null);
});

test('an unusable count is refused, in every shape', () => {
  for (const bad of [null, undefined, -1, Number.NaN, 'x', {}]) {
    assert.equal(loopFieldMs(261_000_000, bad), null, `count=${String(bad)}`);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// bind-refused ON THE RENDEZVOUS SAYS WHICH BRANCH REFUSED (2026-09-23)
// ═══════════════════════════════════════════════════════════════════════
// 🔴 `branch`/`unlinkCode` are what told a correct refusal from the macOS defect on the runner.
//    The error is PRODUCED by the real `kernel-bind` (the caller's exact shape), then formatted.
const { bind: kernelBind } = createRequire(import.meta.url)('../src/kernel-bind.js');
const oneFailure = (errors) => {
  const handlers = [];
  const pending = errors.slice();
  return {
    once(evt, cb) { if (evt === 'error') handlers.push(cb); },
    listen(_p, ok) { const e = pending.shift(); if (e) handlers[handlers.length - 1](e); else ok(); },
  };
};
const inUse = () => Object.assign(new Error('listen EADDRINUSE'), { code: 'EADDRINUSE' });
const refusedBy = (probeSaysAlive, unlink) => {
  let got = null;
  kernelBind(oneFailure([inUse(), inUse()]), '/tmp/x.sock', () => {}, (e) => { got = e; },
    { platform: 'darwin', probe: (_c, done) => done(probeSaysAlive), unlink });
  return got;
};

test('bind-refused: a living owner is journalled as branch=owner-alive, with no unlink field', () => {
  const line = formatEvent({ at: 'T', event: 'bind-refused', fields: rendezvousRefusal(refusedBy(true, () => {}), 7) });
  assert.equal(line, 'T event=bind-refused lane=rendezvous code=EADDRINUSE branch=owner-alive pid=7');
});

test('bind-refused: a re-bind that failed after the cleanup names the branch AND what the unlink met', () => {
  const permissionDenied = () => { throw Object.assign(new Error('EPERM'), { code: 'EPERM' }); };
  assert.equal(formatEvent({ at: 'T', event: 'bind-refused', fields: rendezvousRefusal(refusedBy(false, permissionDenied), 7) }),
    'T event=bind-refused lane=rendezvous code=EADDRINUSE branch=rebind-failed unlinkCode=EPERM pid=7');
});

test('bind-refused: an error kernel-bind never annotated claims no branch it did not take', () => {
  assert.deepEqual(rendezvousRefusal({ code: 'EADDRINUSE' }, 3),
    { lane: 'rendezvous', code: 'EADDRINUSE', branch: undefined, unlinkCode: undefined, pid: 3 });
  assert.deepEqual(rendezvousRefusal(null, 3),
    { lane: 'rendezvous', code: undefined, branch: undefined, unlinkCode: undefined, pid: 3 });
});

// ── `socket-cut` — WHO HUNG UP (2026-09-24) ─────────────────────────────────
// 🔴 From 2026-09-23 10:42Z the harness read `read ECONNRESET` on 1.44 % of its POSTs (≤ 0.07 % on
//    every earlier day). These cells pin the predicate that decides whether a closing connection is
//    worth a line: every abnormal close speaks, an ordinary one never does.

test('socket-cut: an ordinary close (every request answered, nothing unread, no error) writes NOTHING', () => {
  assert.equal(socketCut({ requests: 3, answered: 3, unreadBytes: 0, errorCode: null, threw: null }), null);
  assert.equal(socketCut({ requests: 0, answered: 0, unreadBytes: 0 }), null);
  assert.equal(socketCut(undefined), null);
  assert.equal(socketCut({}), null);
});

test('socket-cut: a request read and never answered is a line, and says so', () => {
  assert.deepEqual(socketCut({ requests: 2, answered: 1, unreadBytes: 0 }),
    { inFlight: true, unreadBytes: null, errorCode: null, threw: null });
});

test('socket-cut: bytes received and never parsed are a line, with their count', () => {
  assert.deepEqual(socketCut({ requests: 1, answered: 1, unreadBytes: 1 }),
    { inFlight: false, unreadBytes: 1, errorCode: null, threw: null });
});

test('socket-cut: a socket error or a handler that threw is a line, carrying its reason', () => {
  assert.deepEqual(socketCut({ requests: 1, answered: 1, unreadBytes: 0, errorCode: 'ECONNRESET' }),
    { inFlight: false, unreadBytes: null, errorCode: 'ECONNRESET', threw: null });
  assert.deepEqual(socketCut({ requests: 1, answered: 1, unreadBytes: 0, threw: 'boom' }),
    { inFlight: false, unreadBytes: null, errorCode: null, threw: 'boom' });
});

test('socket-cut: FAIL-CLOSED — unreadable counts, empty strings and non-strings never make a line', () => {
  assert.equal(socketCut({ requests: 'x', answered: 1, unreadBytes: NaN }), null);
  assert.equal(socketCut({ requests: 1, answered: 1, unreadBytes: -5 }), null);
  assert.equal(socketCut({ requests: 1, answered: 1, errorCode: '', threw: '' }), null);
  assert.equal(socketCut({ requests: 1, answered: 1, errorCode: 42, threw: {} }), null);
});

test('socket-cut: the rendered line reads in one grep, omitted fields stay omitted', () => {
  assert.equal(formatEvent({ at: 'T', event: 'socket-cut', fields: { ...socketCut({ requests: 1, answered: 0 }), pid: 7 } }),
    'T event=socket-cut inFlight=true pid=7');
});
