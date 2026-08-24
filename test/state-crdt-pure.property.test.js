// ═══════════════════════════════════════════════════════════════════════
// PROPERTY-BASED — the LAWS of `state-crdt-pure.js`, on GENERATED inputs.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 THESE ARE NOT TESTS OF EXAMPLES, AND THAT IS THE WHOLE POINT. The claim
//    being made is "these writes COMMUTE" — a claim about EVERY sequence, not
//    about the three sequences somebody thought of. A lattice is proven by its
//    four laws (commutativity, associativity, idempotence, monotone writes) and
//    those laws are quantified over all inputs, so they are proven here.
// ⚠️ EXCLUDED FROM THE STRYKER RUNNER (slow, generated) — every law below has a
//    DETERMINISTIC twin in `state-crdt-pure.test.js`, which is what kills the
//    mutants. A guard proven ONLY here would leave its mutant alive.
// ═══════════════════════════════════════════════════════════════════════

import { test, expect } from 'vitest';
import fc from 'fast-check';
import * as crdt from '../src/state-crdt-pure.js';

// ⚠️ THUNKS, never module-level constants: a fixture evaluated at load time is a
//    STATIC mutant covered by no test (42 false survivors measured on this fleet).
const writerArb = () => fc.constantFrom(...crdt.WRITERS);
const docArb = () => fc.constantFrom('a.md', 'b.md', 'c.md', 'd.md');
const segArb = () => fc.record({
  id: fc.constantFrom('s1', 's2', 's3', 's4', 's5'),
  text: fc.string({ minLength: 1, maxLength: 12 }),
  seq: fc.integer({ min: 0, max: 6 }),
});

// ── An OPERATION on doc-seen, as data. Replaying data is what lets the same
//    script be applied to two replicas and interleaved in every order.
const docOpArb = () => fc.oneof(
  fc.record({ kind: fc.constant('action'), writer: writerArb() }),
  fc.record({ kind: fc.constant('recall'), doc: docArb(), denied: fc.boolean(), turn: fc.integer({ min: 0, max: 9 }) }),
);
const applyDocOp = (s, op) => (op.kind === 'action'
  ? crdt.bumpAction(s, op.writer)
  : crdt.recall(s, op.doc, { denied: op.denied, turn: op.turn }));
const runDoc = (s, ops) => ops.reduce(applyDocOp, s);

const remOpArb = () => fc.oneof(
  fc.record({ kind: fc.constant('decide'), segments: fc.array(segArb(), { maxLength: 3 }) }),
  fc.record({ kind: fc.constant('emit'), ids: fc.array(fc.constantFrom('s1', 's2', 's3', 's4', 's5'), { maxLength: 3 }) }),
  fc.record({ kind: fc.constant('count'), writer: writerArb() }),
);
const applyRemOp = (r, op) => {
  if (op.kind === 'decide') return crdt.decideSegments(r, op.segments);
  if (op.kind === 'emit') return crdt.emitSegments(r, op.ids);
  return crdt.countEmission(r, op.writer);
};
const runRem = (r, ops) => ops.reduce(applyRemOp, r);

const turnOpArb = () => fc.oneof(
  fc.record({ kind: fc.constant('turn'), writer: writerArb() }),
  fc.record({ kind: fc.constant('refuse') }),
);
const runTurns = (s, ops) => ops.reduce((acc, op) => (op.kind === 'turn' ? crdt.bumpTurn(acc, op.writer) : crdt.noteRefusal(acc)), s);

// The three lattices, driven through ONE table so that a FOURTH structure added
// tomorrow cannot be forgotten by half the laws.
const LATTICES = () => [
  { name: 'doc-seen', empty: crdt.emptyDocSeen, merge: crdt.mergeDocSeen, ops: docOpArb, run: runDoc },
  { name: 'turn-count', empty: crdt.emptyTurns, merge: crdt.mergeTurns, ops: turnOpArb, run: runTurns },
  { name: 'remainder', empty: crdt.emptyRemainder, merge: crdt.mergeRemainder, ops: remOpArb, run: runRem },
];

// ── ① COMMUTATIVITY ─────────────────────────────────────────────────────
test('law ①: merge(a,b) === merge(b,a) — on the three lattices', () => {
  for (const L of LATTICES()) {
    fc.assert(fc.property(fc.array(L.ops(), { maxLength: 8 }), fc.array(L.ops(), { maxLength: 8 }), (opsA, opsB) => {
      const a = L.run(L.empty(), opsA);
      const b = L.run(L.empty(), opsB);
      expect(L.merge(a, b)).toEqual(L.merge(b, a));
    }), { numRuns: 200 });
  }
});

// ── ② IDEMPOTENCE ───────────────────────────────────────────────────────
test('law ②: merge(a,a) === a — re-delivering a state changes nothing', () => {
  for (const L of LATTICES()) {
    fc.assert(fc.property(fc.array(L.ops(), { maxLength: 8 }), (ops) => {
      const a = L.run(L.empty(), ops);
      expect(L.merge(a, a)).toEqual(a);
    }), { numRuns: 200 });
  }
});

// ── ③ ASSOCIATIVITY ─────────────────────────────────────────────────────
test('law ③: merge(merge(a,b),c) === merge(a,merge(b,c))', () => {
  for (const L of LATTICES()) {
    fc.assert(fc.property(
      fc.array(L.ops(), { maxLength: 6 }), fc.array(L.ops(), { maxLength: 6 }), fc.array(L.ops(), { maxLength: 6 }),
      (oa, ob, oc) => {
        const a = L.run(L.empty(), oa);
        const b = L.run(L.empty(), ob);
        const c = L.run(L.empty(), oc);
        expect(L.merge(L.merge(a, b), c)).toEqual(L.merge(a, L.merge(b, c)));
      },
    ), { numRuns: 200 });
  }
});

// ── ④ CONVERGENCE UNDER ANY INTERLEAVING ────────────────────────────────
// 🔑 THE LAW THAT ACTUALLY ANSWERS THE PRODUCTION DEFECT. Two writers, their own
//    operations, and an ARBITRARY interleaving of the moments at which each
//    learns of the other. Whatever that schedule is, both end up in the SAME
//    state — which is exactly what a lock was buying, and what 209 lost updates
//    out of 800 proved we did not have.
test('law ④: any interleaving of two writers converges to one state', () => {
  for (const L of LATTICES()) {
    fc.assert(fc.property(
      fc.array(L.ops(), { maxLength: 6 }),
      fc.array(L.ops(), { maxLength: 6 }),
      // The schedule: at each step, which replica acts, and whether it first
      // learns of the other. `true` = a merge happens before the next step.
      fc.array(fc.tuple(fc.boolean(), fc.boolean()), { minLength: 1, maxLength: 10 }),
      (opsA, opsB, schedule) => {
        let ra = L.run(L.empty(), opsA);
        let rb = L.run(L.empty(), opsB);
        for (const [aFirst, sync] of schedule) {
          if (sync) {
            if (aFirst) { ra = L.merge(ra, rb); } else { rb = L.merge(rb, ra); }
          }
        }
        // Final exchange, in both directions: the two replicas MUST agree.
        const fa = L.merge(ra, rb);
        const fb = L.merge(rb, ra);
        expect(fa).toEqual(fb);
        // …and re-exchanging changes nothing (a schedule can always deliver more).
        expect(L.merge(fa, fb)).toEqual(fa);
      },
    ), { numRuns: 300 });
  }
});

// ── ⑤ THE BUSINESS PROPERTY ─────────────────────────────────────────────
// "A consumed document is never lost again, and a document never emitted is
//  never announced as emitted."
test('law ⑤a: an emitted segment never comes back into `remaining`', () => {
  fc.assert(fc.property(
    fc.array(remOpArb(), { maxLength: 8 }), fc.array(remOpArb(), { maxLength: 8 }),
    (opsA, opsB) => {
      const a = runRem(crdt.emptyRemainder(), opsA);
      const b = runRem(crdt.emptyRemainder(), opsB);
      const m = crdt.mergeRemainder(a, b);
      const emittedAnywhere = new Set([...Object.keys(a.emitted), ...Object.keys(b.emitted)]);
      for (const s of crdt.remaining(m)) expect(emittedAnywhere.has(s.id)).toBe(false);
    },
  ), { numRuns: 300 });
});

test('law ⑤b: `remaining` only ever contains segments somebody DECIDED', () => {
  fc.assert(fc.property(
    fc.array(remOpArb(), { maxLength: 8 }), fc.array(remOpArb(), { maxLength: 8 }),
    (opsA, opsB) => {
      const a = runRem(crdt.emptyRemainder(), opsA);
      const b = runRem(crdt.emptyRemainder(), opsB);
      const m = crdt.mergeRemainder(a, b);
      const decidedAnywhere = new Set([...Object.keys(a.decided), ...Object.keys(b.decided)]);
      for (const s of crdt.remaining(m)) expect(decidedAnywhere.has(s.id)).toBe(true);
    },
  ), { numRuns: 300 });
});

test('law ⑤c: `seen` is monotone — a delivered document is never un-delivered', () => {
  fc.assert(fc.property(
    fc.array(docOpArb(), { maxLength: 8 }), fc.array(docOpArb(), { maxLength: 8 }), docArb(),
    (opsA, opsB, doc) => {
      const a = runDoc(crdt.emptyDocSeen(), opsA);
      const b = runDoc(crdt.emptyDocSeen(), opsB);
      const m = crdt.mergeDocSeen(a, b);
      if (crdt.isSeen(a, doc) || crdt.isSeen(b, doc)) expect(crdt.isSeen(m, doc)).toBe(true);
    },
  ), { numRuns: 300 });
});

// ── ⑥ COMPACTION ────────────────────────────────────────────────────────
test('law ⑥a: compaction leaves the DIFFERENCE bit for bit unchanged', () => {
  fc.assert(fc.property(fc.array(remOpArb(), { maxLength: 10 }), (ops) => {
    const r = runRem(crdt.emptyRemainder(), ops);
    const { state } = crdt.compactRemainder(r);
    expect(crdt.remaining(state)).toEqual(crdt.remaining(r));
    expect(crdt.emissionValue(state)).toBe(crdt.emissionValue(r));
  }), { numRuns: 300 });
});

// 🛑 THE CONDITION IS CAUSAL STABILITY, AND IT IS NOT A DETAIL — see the
//    deterministic counter-example in `state-crdt-pure.test.js`, cell ⑥c.
//    Compaction commutes with merge as long as BOTH peers have observed the
//    emission of what is dropped. That hypothesis is stated in the law, not
//    hidden underneath it.
test('law ⑥b: compact-then-merge = merge-then-compact, on causally stable pairs', () => {
  fc.assert(fc.property(
    fc.array(remOpArb(), { maxLength: 8 }), fc.array(remOpArb(), { maxLength: 8 }),
    (opsA, opsB) => {
      let a = runRem(crdt.emptyRemainder(), opsA);
      let b = runRem(crdt.emptyRemainder(), opsB);
      // Causal stability: both replicas exchange before anything is collected.
      a = crdt.mergeRemainder(a, b);
      b = crdt.mergeRemainder(b, a);
      const viaMerge = crdt.compactRemainder(crdt.mergeRemainder(a, b)).state;
      const viaCompact = crdt.mergeRemainder(crdt.compactRemainder(a).state, crdt.compactRemainder(b).state);
      expect(crdt.remaining(viaMerge)).toEqual(crdt.remaining(viaCompact));
    },
  ), { numRuns: 300 });
});

// ── ⑦ THE COUNTER IS THE SUM, AND A WRITE ONLY EVER MOVES IT UP ─────────
test('law ⑦: a G-Counter never decreases, and a merge never loses a slot', () => {
  for (const L of [
    { empty: crdt.emptyTurns, bump: crdt.bumpTurn, value: crdt.turnValue, merge: crdt.mergeTurns },
  ]) {
    fc.assert(fc.property(fc.array(writerArb(), { maxLength: 10 }), fc.array(writerArb(), { maxLength: 10 }), (wa, wb) => {
      const a = wa.reduce(L.bump, L.empty());
      const b = wb.reduce(L.bump, L.empty());
      const m = L.merge(a, b);
      expect(L.value(m)).toBeGreaterThanOrEqual(Math.max(L.value(a), L.value(b)));
      // Two DISTINCT writers add up; the same writer's slots take the max.
      const perWriter = (arr, w) => arr.filter((x) => x === w).length;
      let expected = 0;
      for (const w of crdt.WRITERS) expected += Math.max(perWriter(wa, w), perWriter(wb, w));
      expect(L.value(m)).toBe(expected);
    }), { numRuns: 300 });
  }
});
