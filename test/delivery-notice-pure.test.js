// ═══════════════════════════════════════════════════════════════════════
// delivery-notice-pure.test.js — the completion/deferral verdict, derived
// from the SAME facts `frame-sequencer-pure.js` already computes.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createState, observe, messageFor, MAX_INVOCATIONS } from '../src/delivery-notice-pure.js';

test('createState returns a fresh, empty Map', () => {
  const s = createState();
  assert.ok(s instanceof Map);
  assert.strictEqual(s.size, 0);
});

test('observe returns null when there is no state map', () => {
  assert.strictEqual(observe(null, 'inv-1', 1, 8), null);
  assert.strictEqual(observe(undefined, 'inv-1', 1, 8), null);
  assert.strictEqual(observe({}, 'inv-1', 1, 8), null);
});

// ⚠️ EACH INVALID CASE ALSO ASSERTS THE STATE IS UNTOUCHED (fresh map per
//    case). A guard that only returns `null` on paper can be BYPASSED by a
//    mutant while the function still falls through to `return null;` at the
//    very end (no eviction ever fires with a fresh map) — the RETURN VALUE
//    alone cannot tell "refused before touching state" from "processed and
//    happened to answer null anyway". The state's emptiness is the only
//    observable a bypassed guard cannot fake, because a bypassed guard
//    reaches `state.set(...)` a few lines later.
test('observe returns null when the invocation id is unusable, and NEVER touches the table', () => {
  for (const bad of ['', undefined, null, 42]) {
    const s = createState();
    assert.strictEqual(observe(s, bad, 1, 8), null);
    assert.strictEqual(s.size, 0, `invocationId=${String(bad)} must not touch the table`);
  }
});

test('observe returns null when nbFrames < 2, and accepts nbFrames === 2 (the exact boundary)', () => {
  const s = createState();
  assert.strictEqual(observe(s, 'inv-1', 1, 1), null);
  assert.strictEqual(observe(s, 'inv-1', 1, 0), null);
  assert.strictEqual(observe(s, 'inv-1', 1, -3), null);
  assert.strictEqual(observe(s, 'inv-1', 1, 1.5), null);
  assert.strictEqual(s.size, 0, 'none of the rejected nbFrames may touch the table');
  // nbFrames === 2 is the LOWEST value that still activates tracking — the
  // boundary itself, distinguishing `< 2` from an off-by-one `<= 2` mutant.
  const done = observe(s, 'inv-2', 2, 2);
  assert.deepStrictEqual(done, { kind: 'complete', nbFrames: 2 });
});

test('observe returns null when the index is unusable, and NEVER touches the table', () => {
  for (const bad of [0, -1, 'x', undefined]) {
    const s = createState();
    assert.strictEqual(observe(s, 'inv-1', bad, 8), null);
    assert.strictEqual(s.size, 0, `index=${String(bad)} must not touch the table`);
  }
});

test('COMPLETE: the request receiving the last declared piece produces the completion notice', () => {
  const s = createState();
  assert.strictEqual(observe(s, 'inv-1', 1, 4), null);
  assert.strictEqual(observe(s, 'inv-1', 2, 4), null);
  assert.strictEqual(observe(s, 'inv-1', 3, 4), null);
  const notice = observe(s, 'inv-1', 4, 4);
  assert.deepStrictEqual(notice, { kind: 'complete', nbFrames: 4 });
});

test('COMPLETE: an index beyond nbFrames also completes (never grows unbounded)', () => {
  const s = createState();
  const notice = observe(s, 'inv-1', 9, 4);
  assert.deepStrictEqual(notice, { kind: 'complete', nbFrames: 4 });
});

test('COMPLETE: the invocation record is spent, not kept, once completion fires', () => {
  const s = createState();
  observe(s, 'inv-1', 1, 2);
  observe(s, 'inv-1', 2, 2);
  assert.strictEqual(s.has('inv-1'), false);
});

test('an INCOMPLETE observation produces no notice by itself', () => {
  const s = createState();
  assert.strictEqual(observe(s, 'inv-1', 1, 8), null);
  assert.strictEqual(observe(s, 'inv-1', 2, 8), null);
  assert.strictEqual(s.has('inv-1'), true);
});

test('DEFERRED: an invocation evicted before completion reports its remaining pieces', () => {
  const s = createState();
  const cap = 1;
  // 'inv-1' declared 5 pieces, only 3 ever connected — it never completes.
  observe(s, 'inv-1', 1, 5, cap);
  observe(s, 'inv-1', 2, 5, cap);
  observe(s, 'inv-1', 3, 5, cap);
  // A DIFFERENT invocation's first observation pushes the table past the
  // cap and evicts 'inv-1' — this is the "next action" the design speaks of.
  const notice = observe(s, 'inv-2', 1, 5, cap);
  assert.deepStrictEqual(notice, { kind: 'deferred', remaining: 2 });
});

test('DEFERRED: eviction of an ALREADY-complete invocation reports nothing (it was already removed)', () => {
  const s = createState();
  const cap = 1;
  observe(s, 'inv-1', 1, 2, cap);
  observe(s, 'inv-1', 2, 2, cap); // completes and is deleted
  // 'inv-2' has nothing to evict — the table was already empty.
  const notice = observe(s, 'inv-2', 1, 2, cap);
  assert.strictEqual(notice, null);
});

test('two DIFFERENT invocations are tracked independently until one completes', () => {
  const s = createState();
  assert.strictEqual(observe(s, 'inv-a', 1, 5), null);
  assert.strictEqual(observe(s, 'inv-b', 1, 5), null);
  assert.strictEqual(observe(s, 'inv-a', 2, 5), null);
  const done = observe(s, 'inv-b', 5, 5);
  assert.deepStrictEqual(done, { kind: 'complete', nbFrames: 5 });
  assert.strictEqual(s.has('inv-a'), true);
});

test('touching an invocation moves it to the young end, so it survives eviction', () => {
  const s = createState();
  const cap = 2;
  observe(s, 'a', 1, 10, cap);
  observe(s, 'b', 1, 10, cap);
  // Re-touch 'a': it must no longer be the coldest entry.
  observe(s, 'a', 2, 10, cap);
  const notice = observe(s, 'c', 1, 10, cap);
  assert.deepStrictEqual(notice, { kind: 'deferred', remaining: 9 });
  assert.strictEqual(s.has('a'), true);
  assert.strictEqual(s.has('b'), false);
  assert.strictEqual(s.has('c'), true);
});

test('an invalid maxInvocations argument falls back to the module default, never to 0 or negative', () => {
  const s = createState();
  observe(s, 'a', 1, 10, 0);
  observe(s, 'b', 1, 10, -5);
  observe(s, 'c', 1, 10, NaN);
  assert.strictEqual(s.has('a'), true);
  assert.strictEqual(s.has('b'), true);
  assert.strictEqual(s.has('c'), true);
});

test('MAX_INVOCATIONS is exported and is a positive integer', () => {
  assert.ok(Number.isInteger(MAX_INVOCATIONS));
  assert.ok(MAX_INVOCATIONS > 0);
});

// ── messageFor: THE EXACT WIRE TEXT ─────────────────────────────────────

test('messageFor(null) is the empty string', () => {
  assert.strictEqual(messageFor(null), '');
  assert.strictEqual(messageFor(undefined), '');
});

test('messageFor renders the COMPLETE text VERBATIM, with the real numbers', () => {
  assert.strictEqual(
    messageFor({ kind: 'complete', nbFrames: 32 }),
    'ctxroute: all 32 chunk(s) delivered — 32 of 32 declared frames reached the daemon',
  );
});

test('messageFor renders the DEFERRED text VERBATIM, with the real number', () => {
  assert.strictEqual(
    messageFor({ kind: 'deferred', remaining: 7 }),
    'ctxroute: 7 chunk(s) deferred to the next action',
  );
});

test('messageFor ignores an unknown kind (fail-silent, never a fabricated sentence)', () => {
  assert.strictEqual(messageFor({ kind: 'mystery' }), '');
});
