// ═══════════════════════════════════════════════════════════════════════
// frame-sequencer-pure.test.js — which content index a connecting frame gets.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 WHAT THIS PROVES: given N declared frames of ONE invocation, and given
// that only SOME of them ever connect (Windows loopback ETIMEDOUT — see the
// module header), each connecting request must receive the NEXT undelivered
// content index, never the index its own URL happened to carry. That is what
// makes "the frames that arrive carry everything there is to deliver" true.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createState, nextIndex, MAX_INVOCATIONS } from '../src/frame-sequencer-pure.js';

test('createState returns a fresh, empty Map', () => {
  const s = createState();
  assert.ok(s instanceof Map);
  assert.strictEqual(s.size, 0);
});

test('fails open to the requested frame when there is no state map', () => {
  assert.strictEqual(nextIndex(null, 'inv-1', 7, 8), 7);
  assert.strictEqual(nextIndex(undefined, 'inv-1', 7, 8), 7);
  assert.strictEqual(nextIndex({}, 'inv-1', 7, 8), 7);
});

test('fails open to the requested frame when nbFrames < 2 (a single frame is always index 1 upstream)', () => {
  const s = createState();
  assert.strictEqual(nextIndex(s, 'inv-1', 1, 1), 1);
  assert.strictEqual(nextIndex(s, 'inv-1', 1, 0), 1);
  assert.strictEqual(nextIndex(s, 'inv-1', 1, -3), 1);
  assert.strictEqual(nextIndex(s, 'inv-1', 1, 1.5), 1);
});

test('fails open to the requested frame when the invocation id is unusable', () => {
  const s = createState();
  assert.strictEqual(nextIndex(s, '', 5, 8), 5);
  assert.strictEqual(nextIndex(s, undefined, 5, 8), 5);
  assert.strictEqual(nextIndex(s, null, 5, 8), 5);
  assert.strictEqual(nextIndex(s, 42, 5, 8), 5);
});

test('falls back to 1 when even the requested frame is unusable and tracking cannot apply', () => {
  assert.strictEqual(nextIndex(null, 'inv-1', 0, 8), 1);
  assert.strictEqual(nextIndex(null, 'inv-1', -1, 8), 1);
  assert.strictEqual(nextIndex(null, 'inv-1', 'x', 8), 1);
  assert.strictEqual(nextIndex(null, 'inv-1', undefined, 8), 1);
});

test('nbFrames === 2 is the LOWEST value that still activates tracking (the boundary itself)', () => {
  const s = createState();
  // nbFrames < 2 disables tracking entirely (falls open to the requested
  // frame — asserted above); exactly 2 is the smallest value where tracking
  // must still run, distinguishing this boundary from an off-by-one mutant.
  assert.strictEqual(nextIndex(s, 'inv-1', 2, 2), 1);
  assert.strictEqual(nextIndex(s, 'inv-1', 1, 2), 2);
});

test('the served index is capped at the CURRENT calls nbFrames, even if it shrank mid-invocation', () => {
  const s = createState();
  // A caller that declared a LARGER frame count on earlier requests of the
  // same invocation and a SMALLER one on a later request must never receive
  // an index beyond the current call's nbFrames — the cap protects against
  // an inconsistent caller, it does not merely mirror `next`.
  for (let i = 1; i <= 5; i += 1) nextIndex(s, 'inv-1', i, 10);
  assert.strictEqual(nextIndex(s, 'inv-1', 1, 3), 3);
});

test('first connecting request of a fresh invocation always gets index 1, whatever it asked for', () => {
  const s = createState();
  assert.strictEqual(nextIndex(s, 'inv-1', 5, 8), 1);
});

test('sequential arrivals of the SAME invocation get sequential indices, regardless of URL frame numbers', () => {
  const s = createState();
  // Simulates connections arriving in a DIFFERENT order than their own
  // declared frame number — exactly the Windows loopback scenario, where the
  // physical frame that connects carries no meaning any more.
  assert.strictEqual(nextIndex(s, 'inv-1', 5, 8), 1);
  assert.strictEqual(nextIndex(s, 'inv-1', 2, 8), 2);
  assert.strictEqual(nextIndex(s, 'inv-1', 8, 8), 3);
  assert.strictEqual(nextIndex(s, 'inv-1', 1, 8), 4);
});

test('never exceeds nbFrames — the last possible slot is nbFrames itself, never beyond', () => {
  const s = createState();
  for (let i = 1; i <= 4; i += 1) assert.strictEqual(nextIndex(s, 'inv-1', i, 4), i);
  // A 5th connecting request for an already-exhausted invocation must not
  // overflow past nbFrames — it is capped, never allowed to grow unbounded.
  assert.ok(nextIndex(s, 'inv-1', 1, 4) <= 4);
});

test('an exhausted invocation (served === nbFrames) is dropped from the map, not kept', () => {
  const s = createState();
  for (let i = 1; i <= 3; i += 1) nextIndex(s, 'inv-1', i, 3);
  assert.strictEqual(s.has('inv-1'), false);
});

test('two DIFFERENT invocations are tracked independently', () => {
  const s = createState();
  assert.strictEqual(nextIndex(s, 'inv-a', 1, 5), 1);
  assert.strictEqual(nextIndex(s, 'inv-b', 1, 5), 1);
  assert.strictEqual(nextIndex(s, 'inv-a', 1, 5), 2);
  assert.strictEqual(nextIndex(s, 'inv-b', 1, 5), 2);
});

test('eviction: the LEAST RECENTLY TOUCHED invocation is dropped first once the ceiling is reached', () => {
  const s = createState();
  const cap = 3;
  nextIndex(s, 'old', 1, 10, cap);   // 'old' becomes the coldest entry
  nextIndex(s, 'b', 1, 10, cap);
  nextIndex(s, 'c', 1, 10, cap);
  assert.strictEqual(s.size, 3);
  // A 4th DISTINCT invocation pushes the map past the ceiling.
  nextIndex(s, 'd', 1, 10, cap);
  assert.strictEqual(s.size, cap);
  assert.strictEqual(s.has('old'), false);
  assert.strictEqual(s.has('d'), true);
});

test('touching an invocation moves it to the young end, so it survives eviction', () => {
  const s = createState();
  const cap = 2;
  nextIndex(s, 'a', 1, 10, cap);
  nextIndex(s, 'b', 1, 10, cap);
  // Re-touch 'a': it must no longer be the coldest entry.
  nextIndex(s, 'a', 1, 10, cap);
  nextIndex(s, 'c', 1, 10, cap);
  assert.strictEqual(s.has('a'), true);
  assert.strictEqual(s.has('b'), false);
  assert.strictEqual(s.has('c'), true);
});

test('an invalid maxInvocations argument falls back to the module default, never to 0 or negative', () => {
  const s = createState();
  // With a bogus ceiling the module must not crash nor evict everything on the
  // very next call — it silently falls back to MAX_INVOCATIONS.
  nextIndex(s, 'a', 1, 10, 0);
  nextIndex(s, 'b', 1, 10, -5);
  nextIndex(s, 'c', 1, 10, NaN);
  assert.strictEqual(s.has('a'), true);
  assert.strictEqual(s.has('b'), true);
  assert.strictEqual(s.has('c'), true);
});

test('MAX_INVOCATIONS is exported and is a positive integer', () => {
  assert.ok(Number.isInteger(MAX_INVOCATIONS));
  assert.ok(MAX_INVOCATIONS > 0);
});
