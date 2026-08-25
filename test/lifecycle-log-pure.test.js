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

import {
  formatEvent, shouldRotate, oneLine,
  EVENTS, MAX_BYTES, KEPT_FILES, TOTAL_MAX_BYTES,
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

test('the event vocabulary is exactly the seven lifecycle facts, and it is frozen', () => {
  assert.deepEqual(EVENTS, [
    'start',
    'stale-code-exit',
    // ⚠️ 2026-08-24: a kernel notification can now end in EITHER outcome, so the
    //    quiet one has a name. It is a KERNEL event, never a request — the
    //    per-request refusal below is untouched.
    'code-unchanged',
    'watch-lost',
    'signal-exit',
    'lane-degraded',
    'bind-refused',
  ]);
  // A mutable vocabulary can be widened at runtime, from anywhere, by anyone —
  // including by the caller this closed list exists to constrain.
  assert.equal(Object.isFrozen(EVENTS), true);
});

test('EVERY declared event actually renders (an inert vocabulary entry is a lie)', () => {
  const rendered = EVENTS.map((e) => formatEvent({ at: '2026-08-22T00:00:00.000Z', event: e }));
  assert.deepEqual(rendered, [
    '2026-08-22T00:00:00.000Z event=start',
    '2026-08-22T00:00:00.000Z event=stale-code-exit',
    '2026-08-22T00:00:00.000Z event=code-unchanged',
    '2026-08-22T00:00:00.000Z event=watch-lost',
    '2026-08-22T00:00:00.000Z event=signal-exit',
    '2026-08-22T00:00:00.000Z event=lane-degraded',
    '2026-08-22T00:00:00.000Z event=bind-refused',
  ]);
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
