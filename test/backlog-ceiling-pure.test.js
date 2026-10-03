// backlog-ceiling-pure — the daemon SAYS what the kernel will allow, and never
// refuses to start over it.
//
// 🔴 THIS MODULE REPLACES A WALL. An installer precondition shipped on 2026-09-17
//    refusing to install when `net.core.somaxconn` sat below 4096, for a
//    burst-refusal class measured ABSENT hours later (peak 32 against a 232-deep
//    queue; no connection attempt on the wire at all). The Redis pattern is the
//    industry answer and it is the opposite: OBSERVE, RECORD, never block.
//
// 🛑 EVERY CELL IS A SEEN-RED on a distinct fault, and cell ④ is the one that
//    matters most: an UNKNOWN ceiling must never be rendered as a measured zero.
// 🛑 STATIC IMPORT, NEVER `createRequire` — and a gate caught exactly that on the
//    first run of this file. Stryker's `perTest` coverage maps a mutant to the
//    suites that STATICALLY import it; a dynamic require leaves the module muted
//    with no suite attached, so every mutant "survives" for lack of a LAUNCHED
//    test rather than a missing one. A misleading massacre, and a score that lies.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { backlogFields } from '../src/backlog-ceiling-pure.js';

test('① a kernel ceiling BELOW what we asked for is named as capped', () => {
  const f = backlogFields(65535, 128);
  assert.equal(f.backlog, 65535);
  assert.equal(f.backlogCap, 128);
  assert.equal(f.backlogCapped, true, 'a silent cap is exactly what this exists to surface');
});

test('② a kernel ceiling ABOVE what we asked for is NOT an accusation', () => {
  const f = backlogFields(511, 65535);
  assert.equal(f.backlogCapped, false);
  assert.equal(f.backlogCap, 65535, 'the ceiling is still recorded — it is a fact, not a complaint');
});

test('③ equality is not a cap — the kernel grants exactly what was asked', () => {
  assert.equal(backlogFields(4096, 4096).backlogCapped, false);
});

test('④ SEEN RED: an UNKNOWN ceiling is null and never accuses', () => {
  // Off Linux the file does not exist. Rendering that as 0 would assert a measured
  // zero — "I could not measure" is never "it is low", and a journal line that
  // accuses a kernel nobody read is worse than no line at all.
  const f = backlogFields(65535, null);
  assert.equal(f.backlogCap, null, 'unknown must stay null, never collapse to a number');
  assert.equal(f.backlogCapped, false, 'an absent measurement can never produce a verdict');
});

test('⑤ garbage in is null out, never a fabricated number', () => {
  assert.deepEqual(backlogFields('65535', 128).backlog, null);
  assert.deepEqual(backlogFields(NaN, 128).backlog, null);
  assert.deepEqual(backlogFields(0, 128).backlog, null);
  assert.deepEqual(backlogFields(65535, -1).backlogCap, null);
  assert.deepEqual(backlogFields(65535, 'bas').backlogCap, null);
  // ⚠️ A zero ceiling is a LEGITIMATE reading, not garbage: some containers report
  //    it. It must survive as 0 and produce a cap verdict, never be filtered out.
  const zero = backlogFields(511, 0);
  assert.equal(zero.backlogCap, 0);
  assert.equal(zero.backlogCapped, true);
});

test('⑥ an INFINITE or NUMERIC-STRING value is not a measurement either', () => {
  // `-1` and `'bas'` above are refused by the sign test alone, so they never prove the
  // finiteness and type tests are there. Infinity passes the sign test and a numeric
  // string passes it by coercion: only `Number.isFinite` stands between them and a
  // fabricated figure. Seen red with `Number.isFinite(x)` replaced by `true`, and with
  // `(typeof x === 'number' || Number.isFinite(x)) && …` — the grouping Stryker applies.
  assert.equal(backlogFields(Infinity, 128).backlog, null);
  assert.equal(backlogFields(65535, Infinity).backlogCap, null);
  assert.equal(backlogFields(65535, '128').backlogCap, null);
  assert.equal(backlogFields(65535, Infinity).backlogCapped, false);
});
