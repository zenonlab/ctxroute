// ═══════════════════════════════════════════════════════════════════════
// delivery-notice-pure.test.js — the completion/deferral/incomplete
// verdict, derived from the SAME facts `frame-sequencer-pure.js` already
// computes.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createState, observe, messageFor, MAX_INVOCATIONS } from '../src/delivery-notice-pure.js';

test('createState returns a fresh, empty state with two Maps', () => {
  const s = createState();
  assert.ok(s.invocations instanceof Map);
  assert.ok(s.scopes instanceof Map);
  assert.strictEqual(s.invocations.size, 0);
  assert.strictEqual(s.scopes.size, 0);
});

test('observe returns null when there is no state', () => {
  assert.strictEqual(observe(null, 'scope-1', 'inv-1', 1, 8), null);
  assert.strictEqual(observe(undefined, 'scope-1', 'inv-1', 1, 8), null);
  assert.strictEqual(observe({}, 'scope-1', 'inv-1', 1, 8), null);
  assert.strictEqual(observe({ invocations: new Map() }, 'scope-1', 'inv-1', 1, 8), null, 'missing scopes Map must refuse too');
});

// ⚠️ EACH INVALID CASE ALSO ASSERTS THE STATE IS UNTOUCHED (fresh state per
//    case). A guard that only returns `null` on paper can be BYPASSED by a
//    mutant while the function still falls through to `return null;` at the
//    very end (no eviction ever fires with a fresh state) — the RETURN VALUE
//    alone cannot tell "refused before touching state" from "processed and
//    happened to answer null anyway". The state's emptiness is the only
//    observable a bypassed guard cannot fake, because a bypassed guard
//    reaches `state.invocations.set(...)` a few lines later.
test('observe returns null when the invocation id is unusable, and NEVER touches the state', () => {
  for (const bad of ['', undefined, null, 42]) {
    const s = createState();
    assert.strictEqual(observe(s, 'scope-1', bad, 1, 8), null);
    assert.strictEqual(s.invocations.size, 0, `invocationId=${String(bad)} must not touch the table`);
    assert.strictEqual(s.scopes.size, 0, `invocationId=${String(bad)} must not touch the scope index`);
  }
});

test('observe returns null when nbFrames < 2, and accepts nbFrames === 2 (the exact boundary)', () => {
  const s = createState();
  assert.strictEqual(observe(s, 'scope-1', 'inv-1', 1, 1), null);
  assert.strictEqual(observe(s, 'scope-1', 'inv-1', 1, 0), null);
  assert.strictEqual(observe(s, 'scope-1', 'inv-1', 1, -3), null);
  assert.strictEqual(observe(s, 'scope-1', 'inv-1', 1, 1.5), null);
  assert.strictEqual(s.invocations.size, 0, 'none of the rejected nbFrames may touch the table');
  // nbFrames === 2 is the LOWEST value that still activates tracking — the
  // boundary itself, distinguishing `< 2` from an off-by-one `<= 2` mutant.
  const done = observe(s, 'scope-1', 'inv-2', 2, 2);
  assert.deepStrictEqual(done, { kind: 'complete', nbFrames: 2 });
});

test('observe returns null when the index is unusable, and NEVER touches the state', () => {
  for (const bad of [0, -1, 'x', undefined]) {
    const s = createState();
    assert.strictEqual(observe(s, 'scope-1', 'inv-1', bad, 8), null);
    assert.strictEqual(s.invocations.size, 0, `index=${String(bad)} must not touch the table`);
  }
});

test('COMPLETE: the request receiving the last declared piece produces the completion notice', () => {
  const s = createState();
  assert.strictEqual(observe(s, 'scope-1', 'inv-1', 1, 4), null);
  assert.strictEqual(observe(s, 'scope-1', 'inv-1', 2, 4), null);
  assert.strictEqual(observe(s, 'scope-1', 'inv-1', 3, 4), null);
  const notice = observe(s, 'scope-1', 'inv-1', 4, 4);
  assert.deepStrictEqual(notice, { kind: 'complete', nbFrames: 4 });
});

test('COMPLETE: an index beyond nbFrames also completes (never grows unbounded)', () => {
  const s = createState();
  const notice = observe(s, 'scope-1', 'inv-1', 9, 4);
  assert.deepStrictEqual(notice, { kind: 'complete', nbFrames: 4 });
});

test('COMPLETE: the invocation record is spent, not kept, once completion fires', () => {
  const s = createState();
  observe(s, 'scope-1', 'inv-1', 1, 2);
  observe(s, 'scope-1', 'inv-1', 2, 2);
  assert.strictEqual(s.invocations.has('inv-1'), false);
});

test('an INCOMPLETE observation produces no notice by itself', () => {
  const s = createState();
  assert.strictEqual(observe(s, 'scope-1', 'inv-1', 1, 8), null);
  assert.strictEqual(observe(s, 'scope-1', 'inv-1', 2, 8), null);
  assert.strictEqual(s.invocations.has('inv-1'), true);
});

test('DEFERRED: an invocation evicted before completion reports its remaining pieces', () => {
  const s = createState();
  const cap = 1;
  // 'inv-1' declared 5 pieces, only 3 ever connected — it never completes.
  observe(s, '', 'inv-1', 1, 5, cap);
  observe(s, '', 'inv-1', 2, 5, cap);
  observe(s, '', 'inv-1', 3, 5, cap);
  // A DIFFERENT invocation's first observation pushes the table past the
  // cap and evicts 'inv-1' — this is the "next action" the design speaks of.
  const notice = observe(s, '', 'inv-2', 1, 5, cap);
  assert.deepStrictEqual(notice, { kind: 'deferred', remaining: 2 });
});

test('DEFERRED: eviction of an ALREADY-complete invocation reports nothing (it was already removed)', () => {
  const s = createState();
  const cap = 1;
  observe(s, '', 'inv-1', 1, 2, cap);
  observe(s, '', 'inv-1', 2, 2, cap); // completes and is deleted
  // 'inv-2' has nothing to evict — the table was already empty.
  const notice = observe(s, '', 'inv-2', 1, 2, cap);
  assert.strictEqual(notice, null);
});

test('two DIFFERENT invocations are tracked independently until one completes', () => {
  const s = createState();
  assert.strictEqual(observe(s, 'scope-a', 'inv-a', 1, 5), null);
  assert.strictEqual(observe(s, 'scope-b', 'inv-b', 1, 5), null);
  assert.strictEqual(observe(s, 'scope-a', 'inv-a', 2, 5), null);
  const done = observe(s, 'scope-b', 'inv-b', 5, 5);
  assert.deepStrictEqual(done, { kind: 'complete', nbFrames: 5 });
  assert.strictEqual(s.invocations.has('inv-a'), true);
});

test('touching an invocation moves it to the young end, so it survives eviction', () => {
  const s = createState();
  const cap = 2;
  observe(s, '', 'a', 1, 10, cap);
  observe(s, '', 'b', 1, 10, cap);
  // Re-touch 'a': it must no longer be the coldest entry.
  observe(s, '', 'a', 2, 10, cap);
  const notice = observe(s, '', 'c', 1, 10, cap);
  assert.deepStrictEqual(notice, { kind: 'deferred', remaining: 9 });
  assert.strictEqual(s.invocations.has('a'), true);
  assert.strictEqual(s.invocations.has('b'), false);
  assert.strictEqual(s.invocations.has('c'), true);
});

test('an invalid maxInvocations argument falls back to the module default, never to 0 or negative', () => {
  const s = createState();
  observe(s, '', 'a', 1, 10, 0);
  observe(s, '', 'b', 1, 10, -5);
  observe(s, '', 'c', 1, 10, NaN);
  assert.strictEqual(s.invocations.has('a'), true);
  assert.strictEqual(s.invocations.has('b'), true);
  assert.strictEqual(s.invocations.has('c'), true);
});

test('MAX_INVOCATIONS is exported and is a positive integer', () => {
  assert.ok(Number.isInteger(MAX_INVOCATIONS));
  assert.ok(MAX_INVOCATIONS > 0);
});

// ── INCOMPLETE: a new invocation of the SAME scope proves the prior one is
//    closed. This is the DECIDABLE, IMMEDIATE trigger — no 4096-invocation
//    wait required. ──────────────────────────────────────────────────────

test('INCOMPLETE: a new invocation of the SAME scope reports the prior one immediately, with the exact numbers', () => {
  const s = createState();
  // Agent 'scope-1' starts an action declaring 8 frames, only 3 connect.
  observe(s, 'scope-1', 'inv-A', 1, 8);
  observe(s, 'scope-1', 'inv-A', 2, 8);
  observe(s, 'scope-1', 'inv-A', 3, 8);
  // The SAME agent starts a NEW action ('inv-B') before 'inv-A' ever
  // reached its 8th frame -- this is DECIDABLE proof 'inv-A' is closed.
  const notice = observe(s, 'scope-1', 'inv-B', 1, 4);
  assert.deepStrictEqual(notice, { kind: 'incomplete', reached: 3, declared: 8 });
});

test('INCOMPLETE: fires on the VERY FIRST observation of a scope-mate invocation (no wait for eviction)', () => {
  const s = createState();
  observe(s, 'scope-1', 'inv-A', 1, 100); // declared 100, only 1 ever connects
  const notice = observe(s, 'scope-1', 'inv-B', 1, 2);
  assert.deepStrictEqual(notice, { kind: 'incomplete', reached: 1, declared: 100 });
});

test('INCOMPLETE: a DIFFERENT scope never triggers it -- scopes are tracked independently', () => {
  const s = createState();
  observe(s, 'scope-1', 'inv-A', 1, 8); // incomplete, but on scope-1
  const notice = observe(s, 'scope-2', 'inv-B', 1, 4); // unrelated scope, first ever
  assert.strictEqual(notice, null);
});

test('INCOMPLETE: re-observing the SAME invocation id on the SAME scope never fires it (no new invocation started)', () => {
  const s = createState();
  observe(s, 'scope-1', 'inv-A', 1, 8);
  const notice = observe(s, 'scope-1', 'inv-A', 2, 8); // still 'inv-A'
  assert.strictEqual(notice, null);
});

test('INCOMPLETE: a scope whose prior invocation already COMPLETED reports nothing -- there is nothing to report', () => {
  const s = createState();
  observe(s, 'scope-1', 'inv-A', 1, 2);
  observe(s, 'scope-1', 'inv-A', 2, 2); // completes, record deleted
  const notice = observe(s, 'scope-1', 'inv-B', 1, 4);
  assert.strictEqual(notice, null, 'inv-A completed cleanly -- inv-B starting is ordinary, not news');
});

test('INCOMPLETE PRIMES over the current invocation completing on the SAME call', () => {
  const s = createState();
  observe(s, 'scope-1', 'inv-A', 1, 8); // incomplete
  // inv-B's FIRST call also happens to be its LAST (single connecting frame
  // observed at index === nbFrames) -- it would report 'complete' on its
  // own, but the rarer information about inv-A must win.
  const notice = observe(s, 'scope-1', 'inv-B', 2, 2);
  assert.deepStrictEqual(notice, { kind: 'incomplete', reached: 1, declared: 8 });
});

test('INCOMPLETE PRIMES over a DEFERRED eviction happening on the SAME call', () => {
  const s = createState();
  const cap = 1;
  observe(s, 'scope-1', 'inv-A', 1, 8, cap); // incomplete, on scope-1
  // A totally unrelated invocation's observation would normally evict and
  // report inv-A as DEFERRED -- but this specific call is ALSO a new
  // invocation on scope-1, so INCOMPLETE must win over DEFERRED too.
  const notice = observe(s, 'scope-1', 'inv-B', 1, 5, cap);
  assert.deepStrictEqual(notice, { kind: 'incomplete', reached: 1, declared: 8 });
});

test('INCOMPLETE: the new invocation is still tracked normally afterwards (side effects happen even though the notice is swapped)', () => {
  const s = createState();
  observe(s, 'scope-1', 'inv-A', 1, 8); // incomplete
  observe(s, 'scope-1', 'inv-B', 1, 4); // fires INCOMPLETE for inv-A, but tracks inv-B
  assert.strictEqual(s.invocations.has('inv-B'), true);
  const done = observe(s, 'scope-1', 'inv-B', 4, 4);
  assert.deepStrictEqual(done, { kind: 'complete', nbFrames: 4 }, 'inv-B must still complete normally afterwards');
});

// ── THE SCOPE INDEX HAS ITS OWN BOUNDED-FOR-LIFE LRU EVICTION, INDEPENDENT
//    OF THE INVOCATIONS TABLE'S OWN LRU. Proven by BEHAVIOUR, not by
//    inspecting the Map: a real invocation record can OUTLIVE the scope
//    entry that pointed to it, and the effect is that a scope-mate arriving
//    later no longer resurrects it as an incomplete report.
test('scope index evicts its OWN oldest entry, independently of the invocations table', () => {
  const s = createState();
  // 1) A real, still-incomplete invocation on 'scope-old'.
  observe(s, 'scope-old', 'inv-old', 1, 5, 100);
  // 2) A second scope -- padding, so the scope index has 2 entries.
  observe(s, 'scope-pad', 'inv-pad', 1, 5, 100);
  // 3) RE-TOUCH 'inv-old' WITHOUT touching its scope (scopeId ''), moving it
  //    to the YOUNG end of the invocations table only. After this, the
  //    invocations table's oldest entry is 'inv-pad', while the SCOPE
  //    index's oldest entry is STILL 'scope-old' (never re-touched).
  observe(s, '', 'inv-old', 2, 5, 100);
  // 4) A THIRD scope, with a cap of 2 -- both tables now hold 3 entries and
  //    must each evict their OWN oldest: scopes evicts 'scope-old',
  //    invocations evicts 'inv-pad' (not 'inv-old', re-touched above).
  observe(s, 'scope-final', 'inv-final', 1, 5, 2);
  assert.strictEqual(s.scopes.has('scope-old'), false, 'the scope index must evict its OWN oldest entry');
  assert.strictEqual(s.invocations.has('inv-old'), true, 'inv-old was re-touched -- it must survive the SAME eviction pass');
  // 5) PROOF BY BEHAVIOUR: 'inv-old' is STILL incomplete in the invocations
  //    table, yet a new invocation on 'scope-old' must NOT resurrect it --
  //    the scope index no longer remembers it was ever there.
  const notice = observe(s, 'scope-old', 'inv-old-2', 1, 4, 100);
  assert.strictEqual(notice, null, 'scope-old was evicted -- it must not report inv-old as incomplete');
});

// ⚠️ ANTI-VACUITY: the guard must actually be REACHED with a real prior
//    record for the notice to fire -- an evicted-away prior invocation
//    (already reported via DEFERRED) must NOT be reported a second time.
test('INCOMPLETE: a prior invocation already evicted from the table reports nothing (no double notice)', () => {
  const s = createState();
  // Simulate a scope whose prior invocation was ALREADY evicted from the
  // invocations table (e.g. by MAX_INVOCATIONS LRU, as in the DEFERRED
  // cells above -- it was already reported once) while the scope index
  // still remembers it started that invocation. This is EXACTLY the guard
  // `if (priorRecord)` exists for: state.scopes and state.invocations are
  // two independent tables (the header's `WHY TWO MAPS`), so one can point
  // to an invocation id the other no longer holds.
  s.scopes.set('scope-1', 'inv-A');
  const notice = observe(s, 'scope-1', 'inv-B', 1, 4);
  assert.strictEqual(notice, null, 'inv-A record is gone -- nothing left to report a second time');
});

test('scopeId empty or non-string leaves behaviour EXACTLY as before this trigger existed', () => {
  for (const bad of ['', undefined, null, 42, {}]) {
    const s = createState();
    observe(s, bad, 'inv-A', 1, 8);
    // A second, DIFFERENT invocation would trigger INCOMPLETE with a real
    // scopeId -- with an unusable one, it must not, and the scope index
    // must stay completely untouched.
    const notice = observe(s, bad, 'inv-B', 1, 4);
    assert.strictEqual(notice, null, `scopeId=${String(bad)} must never trigger the incomplete notice`);
    assert.strictEqual(s.scopes.size, 0, `scopeId=${String(bad)} must never touch the scope index`);
  }
});

// ⚠️ SEEN RED, IN MEMORY: sabotage the scope-lookup guard the way a mutant
//    would (skip the "already had a DIFFERENT invocation" check and always
//    look up the CURRENT invocation id instead), prove the cell above goes
//    red, then restore. This proves the positive test is not vacuous --
//    it can actually FAIL when the trigger breaks.
test('SEEN RED: sabotaging the scope-vs-invocation comparison makes the positive cell fail', () => {
  const s = createState();
  observe(s, 'scope-1', 'inv-A', 1, 8);
  observe(s, 'scope-1', 'inv-A', 2, 8);
  observe(s, 'scope-1', 'inv-A', 3, 8); // reached=3, declared=8

  // Sabotaged re-implementation of ONLY the trigger's comparison: looks up
  // the scope's record but keys the invocations table by the CURRENT
  // invocation id instead of the PRIOR one -- the mutant this project's
  // doctrine calls out ("reads its own id instead of the id it displaced").
  function sabotagedIncomplete(state, scopeId, invocationId) {
    if (typeof scopeId !== 'string' || scopeId === '') return null;
    const priorInvocationId = state.scopes.get(scopeId);
    if (priorInvocationId === undefined || priorInvocationId === invocationId) return null;
    // BUG: looks up `invocationId` (itself) instead of `priorInvocationId`.
    const record = state.invocations.get(invocationId);
    if (!record) return null;
    return { kind: 'incomplete', reached: record.served, declared: record.nbFrames };
  }

  const sabotaged = sabotagedIncomplete(s, 'scope-1', 'inv-B');
  assert.throws(
    () => assert.deepStrictEqual(sabotaged, { kind: 'incomplete', reached: 3, declared: 8 }),
    'the sabotaged comparison must NOT reproduce the real verdict',
  );

  // RESTORED: the real function is untouched and still correct.
  const real = observe(s, 'scope-1', 'inv-B', 1, 4);
  assert.deepStrictEqual(real, { kind: 'incomplete', reached: 3, declared: 8 });
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

test('messageFor renders the INCOMPLETE text VERBATIM, with the real numbers', () => {
  assert.strictEqual(
    messageFor({ kind: 'incomplete', reached: 3, declared: 8 }),
    'ctxroute: only 3 of 8 frames reached the daemon',
  );
});

test('messageFor ignores an unknown kind (fail-silent, never a fabricated sentence)', () => {
  assert.strictEqual(messageFor({ kind: 'mystery' }), '');
});
