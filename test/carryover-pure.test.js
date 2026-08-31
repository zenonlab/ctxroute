// ═══════════════════════════════════════════════════════════════════════
// carryover-pure.test.js — the DECISION, isolated from every socket.
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ WHY A SEPARATE SUITE FROM `http-carryover.test.js`. That one proves the
//    BEHAVIOUR end to end (content survives an action, nothing twice); this
//    one is what Stryker mutates. A decision left in the I/O shell is
//    measured by nothing — the exact reason `freshness-scope-pure.js` was
//    extracted the same week, after shipping inside `http-server.js` where
//    an inverted condition would have passed green.
//
// 🛑 EVERY CELL BELOW EXISTS BECAUSE ITS ABSENCE IS SILENT. A carryover that
//    does too little loses content for ever; one that does too much delivers
//    the same text twice and eats the budget the real content needs. Both
//    failures look like a healthy system from the outside.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert/strict';
// 🛑 STATIC IMPORT, NEVER `createRequire` — `mutation-workflow-gate` requires
//    it and it is right: Stryker's per-test coverage maps mutants through the
//    STATIC module graph, so a dynamically required module is mutated with its
//    mutants measured by nothing, and the per-file floor cannot redden.
import * as carryover from '../src/carryover-pure.js';

/** A frame plan shaped like `budget.planFrames` returns one. */
function plan(...groups) {
  return groups.map((ids) => ({
    text: ids.join('+'),
    emitted: ids,
    deferred: [],
    segments: ids.map((id) => ({ id, text: 'body of ' + id })),
    marker: 'm',
  }));
}

test('THE LOAD-BEARING CELL: what no frame carried is what comes back', () => {
  const frames = plan(['a'], ['b'], ['c'], ['d']);
  // Two frames connected ⇒ `a` and `b` went out, `c` and `d` never did.
  const out = carryover.unserved(frames, 2);
  assert.deepEqual(out.map((s) => s.id), ['c', 'd']);
  // ⚠️ THE TEXT TRAVELS, NOT THE ID: the queue stores text, because an id
  //    produced by `fragment()` exists nowhere upstream and a document
  //    edited since would otherwise glue two versions together.
  assert.equal(out[0].text, 'body of c');
});

test('THE SYMMETRIC CELL: every frame connected ⇒ NOTHING comes back', () => {
  // 🛑 Without this cell, a carryover that always returns everything would
  //    pass the cell above and re-deliver the whole corpus at every action.
  const frames = plan(['a'], ['b'], ['c']);
  assert.deepEqual(carryover.unserved(frames, 3), []);
  // And past the end is still nothing, never a wrap-around.
  assert.deepEqual(carryover.unserved(frames, 99), []);
});

test('FAIL-SAFE INPUTS yield an EMPTY carryover — today s behaviour, never a guess', () => {
  assert.deepEqual(carryover.unserved(null, 1), []);
  assert.deepEqual(carryover.unserved(undefined, 1), []);
  assert.deepEqual(carryover.unserved(plan(['a']), -1), []);
  assert.deepEqual(carryover.unserved(plan(['a']), 1.5), []);
  assert.deepEqual(carryover.unserved(plan(['a']), 'two'), []);
  // A frame with no `segments` (an EMPTY frame, or a plan from an older
  // shape) is skipped, never crashed on.
  assert.deepEqual(carryover.unserved([null, { text: '' }, ...plan(['z'])], 0).map((s) => s.id), ['z']);
});

test('AN INVOCATION THAT OWES NOTHING IS NEVER LISTED', () => {
  const st = carryover.createState();
  carryover.observe(st, 'S', 'complete', 8, 8);
  carryover.observe(st, 'S', 'partial', 3, 8);
  assert.deepEqual(carryover.pendingFor(st, 'S', 'now'), [{ invocationId: 'partial', served: 3 }]);
});

test('THE CURRENT INVOCATION NEVER HARVESTS ITSELF', () => {
  // 🛑 Harvesting oneself would hand one's own plan back to oneself, for ever.
  const st = carryover.createState();
  carryover.observe(st, 'S', 'me', 1, 8);
  assert.deepEqual(carryover.pendingFor(st, 'S', 'me'), []);
});

test('SCOPES ARE ISOLATED: one agent never harvests another', () => {
  // ⚠️ The scope is `lib.scopeId(session, agent)`: master and sub-agents have
  //    DISTINCT contexts, so content owed to one must never surface in the
  //    other. That hole cost sub-agents their skills once already.
  const st = carryover.createState();
  carryover.observe(st, 'other-agent', 'theirs', 2, 8);
  carryover.observe(st, 'S', 'mine', 2, 8);
  assert.deepEqual(carryover.pendingFor(st, 'S', 'now'), [{ invocationId: 'mine', served: 2 }]);
});

test('HARVESTED ONCE, NEVER TWICE — and it stops serving', () => {
  const st = carryover.createState();
  carryover.observe(st, 'S', 'x', 2, 8);
  assert.equal(carryover.isHarvested(st, 'x'), false);
  carryover.markHarvested(st, 'x');
  assert.equal(carryover.isHarvested(st, 'x'), true);
  // ⚠️ A harvested invocation leaves the pending list: a second harvester
  //    must not take the same segments a third time.
  assert.deepEqual(carryover.pendingFor(st, 'S', 'now'), []);
});

test('A LATE FRAME OF A HARVESTED INVOCATION DOES NOT RESURRECT IT', () => {
  // 🛑 `observe` must PRESERVE the flag. Rebuilding the entry would clear it
  //    (the exact class that broke the enforce alternation on 2026-08-23:
  //    propagate, never rebuild), and the invocation would start serving
  //    again content another one now owns — a duplicate.
  const st = carryover.createState();
  carryover.observe(st, 'S', 'x', 2, 8);
  carryover.markHarvested(st, 'x');
  carryover.observe(st, 'S', 'x', 3, 8);
  assert.equal(carryover.isHarvested(st, 'x'), true);
  assert.deepEqual(carryover.pendingFor(st, 'S', 'now'), []);
});

test('THE SERVED COUNT ONLY EVER GROWS', () => {
  // ⚠️ Frames arrive in ANY order and the sequencer CLAMPS its index at
  //    `nbFrames`, so a later arrival can legitimately report a smaller or
  //    equal number. Going backwards would re-harvest content already sent.
  const st = carryover.createState();
  carryover.observe(st, 'S', 'x', 5, 8);
  carryover.observe(st, 'S', 'x', 2, 8);
  assert.deepEqual(carryover.pendingFor(st, 'S', 'now'), [{ invocationId: 'x', served: 5 }]);
});

test('UNTRACKABLE ARRIVALS ARE IGNORED, never recorded as a phantom', () => {
  const st = carryover.createState();
  carryover.observe(st, 'S', '', 1, 8);          // no invocation id
  carryover.observe(st, '', 'x', 1, 8);          // no scope
  carryover.observe(st, 'S', 'y', 0, 8);         // no served index
  carryover.observe(st, 'S', 'z', 1, 1);         // single frame ⇒ nothing to sequence
  assert.equal(st.size, 0);
  assert.deepEqual(carryover.pendingFor(st, 'S', 'now'), []);
  // And every entry point survives a missing table.
  carryover.observe(null, 'S', 'x', 1, 8);
  carryover.markHarvested(null, 'x');
  assert.equal(carryover.isHarvested(null, 'x'), false);
  assert.deepEqual(carryover.pendingFor(null, 'S', 'now'), []);
  assert.equal(carryover.isHarvested(carryover.createState(), ''), false);
});

test('A NON-STRING SCOPE OR ID IS REFUSED, not merely an EMPTY one', () => {
  // 🛑 KILLS THE MUTANT `typeof x !== 'string'` -> `false` (measured 2026-08-31).
  //    Testing only the EMPTY string leaves the type half unmeasured, and a
  //    `null` scope would then be STORED: an entry no `pendingFor` can ever
  //    match, kept until eviction — dead weight that owes content for ever.
  const st = carryover.createState();
  carryover.observe(st, null, 'a', 1, 8);
  carryover.observe(st, 42, 'b', 1, 8);
  carryover.observe(st, 'S', null, 1, 8);
  carryover.observe(st, 'S', 42, 1, 8);
  assert.equal(st.size, 0);
});

test('TWO FRAMES IS ALREADY A FRAGMENTED ACTION', () => {
  // 🛑 KILLS THE MUTANT `nbFrames < 2` -> `<= 2`. Two frames is the SMALLEST
  //    action that can lose one, so refusing it would blind the carryover
  //    exactly where the loss is proportionally worst.
  const st = carryover.createState();
  carryover.observe(st, 'S', 'x', 1, 2);
  assert.deepEqual(carryover.pendingFor(st, 'S', 'now'), [{ invocationId: 'x', served: 1 }]);
});

test('`__proto__` IS AN ORDINARY INVOCATION ID', () => {
  // 🛑 A plain object would treat it as the prototype and silently lose the
  //    entry — the reason every table in this daemon is a Map.
  const st = carryover.createState();
  carryover.observe(st, 'S', '__proto__', 2, 8);
  assert.deepEqual(carryover.pendingFor(st, 'S', 'now'), [{ invocationId: '__proto__', served: 2 }]);
  carryover.markHarvested(st, '__proto__');
  assert.equal(carryover.isHarvested(st, '__proto__'), true);
});

test('THE TABLE IS BOUNDED FOR LIFE, and eviction costs at most one carryover', () => {
  const st = carryover.createState();
  for (let i = 0; i < 5; i += 1) carryover.observe(st, 'S', 'inv-' + i, 1, 8, 3);
  assert.equal(st.size, 3);
  // ⚠️ The COLDEST goes first: an invocation still receiving frames must
  //    never be the one sacrificed.
  assert.deepEqual(carryover.pendingFor(st, 'S', 'now').map((p) => p.invocationId), ['inv-2', 'inv-3', 'inv-4']);
  // An invocation touched again survives an eviction that would otherwise
  // have reached it.
  carryover.observe(st, 'S', 'inv-2', 2, 8, 3);
  carryover.observe(st, 'S', 'inv-5', 1, 8, 3);
  assert.deepEqual(carryover.pendingFor(st, 'S', 'now').map((p) => p.invocationId), ['inv-4', 'inv-2', 'inv-5']);
  // A bogus ceiling falls back to the module's own, never to zero.
  const st2 = carryover.createState();
  carryover.observe(st2, 'S', 'a', 1, 8, 0);
  carryover.observe(st2, 'S', 'b', 1, 8, -1);
  assert.equal(st2.size, 2);
  assert.equal(carryover.MAX_INVOCATIONS, 4096);
});

test('MARKING AN UNKNOWN INVOCATION CREATES NOTHING', () => {
  // ⚠️ An entry evicted between the harvest and the mark must not be
  //    resurrected as a half-built record: `pendingFor` reads `scopeId`,
  //    `served` and `nbFrames`, and a record missing them would be a
  //    phantom that owes an unknown amount.
  const st = carryover.createState();
  carryover.markHarvested(st, 'ghost');
  assert.equal(st.size, 0);
  assert.equal(carryover.isHarvested(st, 'ghost'), false);
});
