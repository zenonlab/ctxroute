// ═══════════════════════════════════════════════════════════════════════
// freshness-scope-pure.js — one verification per ACTION, never per frame
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 WHY THIS SUITE EXISTS, AND WHY ITS ABSENCE WAS THE REAL DANGER. The
//    per-frame verification cost **30 % of the daemon's working time**
//    (profiled 2026-08-31) and produced 30 lost connections per 384, because a
//    single-threaded server that reads 1,152 files cannot accept anyone
//    meanwhile. Removing the waste is one condition; **nothing stopped a future
//    agent from putting it back** — and it would come back as a performance
//    regression nobody can see, which is this repository's worst defect class.
// 🛑 THE LOAD-BEARING CELL IS THE FIRST ONE: the SECOND frame of an action must
//    NOT verify. If that ever passes while returning `false`, the waste is back
//    and every measurement above is undone, silently.
// ⚠️ AND THE SYMMETRIC CELL MATTERS AS MUCH: a NEW action must ALWAYS verify.
//    A fix that simply answered "already done" everywhere would pass the first
//    cell and destroy the guarantee the check exists for — the daemon would
//    serve stale code for ever.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import { createState, alreadyVerified, MAX_INVOCATIONS } from '../src/freshness-scope-pure.js';

test('the FIRST frame of an action verifies, the 31 others do NOT', () => {
  const state = createState();

  assert.strictEqual(
    alreadyVerified(state, 'toolu_A'),
    false,
    'The first frame of an action MUST verify: that is where a real code change is caught.',
  );

  // The remaining frames of the SAME action ask the same question, milliseconds
  // apart. Each `true` here is 36 file reads NOT performed.
  for (let frame = 2; frame <= 32; frame += 1) {
    assert.strictEqual(
      alreadyVerified(state, 'toolu_A'),
      true,
      `Frame ${frame} re-verified. The per-frame waste is back: 32x36 = 1,152 file reads for ONE answer, ` +
        'and with it the 30-lost-connections-per-384 measured on 2026-08-31.',
    );
  }
});

test('a NEW action ALWAYS verifies — the guarantee, not the optimisation', () => {
  const state = createState();
  alreadyVerified(state, 'toolu_A');

  assert.strictEqual(
    alreadyVerified(state, 'toolu_B'),
    false,
    'A different tool call MUST verify. Code changes BETWEEN actions, so answering ' +
      '"already done" here is how a daemon serves stale code for ever.',
  );
  assert.strictEqual(
    alreadyVerified(state, 'toolu_A'),
    true,
    'And the first action stays known: two interleaved calls must not evict each other.',
  );
});

test('no id, no table ⇒ VERIFY — fail-safe, never fail-open', () => {
  const state = createState();
  for (const cas of [
    [state, ''],
    [state, undefined],
    [state, null],
    [state, 42],
    [null, 'toolu_A'],
    [undefined, 'toolu_A'],
    [{}, 'toolu_A'],
  ]) {
    assert.strictEqual(
      alreadyVerified(cas[0], cas[1]),
      false,
      `Unanswerable question ${JSON.stringify(cas[1])}: it must fall back to VERIFYING, ` +
        'which is the historical behaviour byte for byte.',
    );
  }
});

test('`__proto__` is a KEY, never the prototype', () => {
  const state = createState();
  assert.strictEqual(alreadyVerified(state, '__proto__'), false);
  assert.strictEqual(
    alreadyVerified(state, '__proto__'),
    true,
    'An invocation id is arbitrary harness text; a plain object would have written the prototype.',
  );
  assert.strictEqual(
    alreadyVerified(state, 'toolu_A'),
    false,
    'And it must not have polluted anything else.',
  );
});

test('BOUNDED FOR LIFE: the table never grows past its ceiling', () => {
  const state = createState();
  for (let i = 0; i < 10; i += 1) alreadyVerified(state, 'toolu_' + i, 3);
  assert.strictEqual(state.size, 3, 'A daemon runs for weeks: an unbounded table is a leak.');
});

test('eviction sacrifices the OLDEST, never the action still receiving frames', () => {
  const state = createState();
  alreadyVerified(state, 'old', 2);
  alreadyVerified(state, 'busy', 2);
  // `busy` is still in flight — touching it must move it to the young end.
  alreadyVerified(state, 'busy', 2);
  alreadyVerified(state, 'new', 2);

  assert.strictEqual(
    alreadyVerified(state, 'busy', 2),
    true,
    'The action still receiving frames was evicted: the LONGEST actions, the very ones this ' +
      'exists for, would pay the most.',
  );
});

test('the default ceiling is declared and sane', () => {
  assert.ok(Number.isInteger(MAX_INVOCATIONS) && MAX_INVOCATIONS > 0, 'a bound must be a bound');
  const state = createState();
  for (let i = 0; i < 5; i += 1) alreadyVerified(state, 'toolu_' + i, 0);
  assert.strictEqual(
    state.size,
    5,
    'An invalid ceiling falls back to the declared default, never to zero (which would ' +
      'evict every entry and restore the per-frame verification in silence).',
  );
});

test('AN ACTION THAT CANNOT NAME ITSELF IS VERIFIED **EVERY TIME**, never just once', () => {
  // 🔴 THE HOLE THIS CLOSES, FOUND BY MUTATION 2026-08-31 (5 survivors, all on
  //    the same guard). The suite called this with an unusable id ONCE and read
  //    `false` — but `false` is ALSO what the first call returns for a PERFECTLY
  //    VALID id. One call cannot tell "always verify" from "verify once, then
  //    skip". Removing the guard entirely still passed.
  // 🛑 WHAT WOULD ACTUALLY BREAK: the bogus id would be STORED, so the SECOND
  //    frame of that action would read "already verified" and the daemon would
  //    serve without checking its own code — the exact failure the header
  //    forbids ("no `tool_use_id` ⇒ VERIFY"). The guarantee was written, stated
  //    in prose, and measured by nothing.
  for (const bogus of ['', null, undefined, 42, {}, []]) {
    const state = createState();
    assert.strictEqual(alreadyVerified(state, bogus), false, 'first call must verify');
    assert.strictEqual(alreadyVerified(state, bogus), false, 'and so must the second');
    assert.strictEqual(alreadyVerified(state, bogus), false, 'and every one after it');
    // ⚠️ AND NOTHING IS RECORDED: a phantom entry would occupy the LRU and
    //    eventually evict a REAL action, making it verify twice for nothing.
    assert.strictEqual(state.size, 0, 'an unusable id must leave no trace at all');
  }
});
