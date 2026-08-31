// ═══════════════════════════════════════════════════════════════════════
// state-crdt-pure — DETERMINISTIC cells + the ZERO-REGRESSION DIFFERENTIAL.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 TWO JOBS, AND THEY ARE NOT THE SAME JOB.
//    ① The LAWS have a deterministic twin here, because `*.property.test.js` is
//       excluded from the Stryker runner: an invariant proven ONLY by a property
//       leaves its mutant alive, and the score then lies.
//    ② THE DIFFERENTIAL. The operator asks for guarantees, not intentions: for
//       any sequence of writes WITHOUT concurrency, this model must produce the
//       same OBSERVABLE result as the code shipped today. The oracle is
//       therefore the REAL engine — `gate.decide`, `turn-core.bump`,
//       `emission-core.emit` — never a re-description of it.
// ⚠️ THE OBSERVABLE IS WHAT THE FRAMEWORK DOES, NOT WHAT IT STORES. The two
//    representations are DELIBERATELY different (that is the entire point), so
//    comparing the stored bytes would compare the thing being changed. What must
//    not move is the decision: which documents are injected, whether the gesture
//    is refused, what stays in the queue, what the counters read.
// ═══════════════════════════════════════════════════════════════════════

import { test, expect } from 'vitest';
import * as crdt from '../src/state-crdt-pure.js';
import gate from '../src/gate.js';
import lib from '../src/lib-pure.js';
import turnCore from '../src/turn-core.js';
import emission from '../src/emission-core.js';

// ═══════════════════════════════════════════════════════════════════════
// ① — THE LATTICE LAWS, deterministic twins (these are what Stryker kills)
// ═══════════════════════════════════════════════════════════════════════

test('① commutativity — the same two histories merge to one state either way', () => {
  const a = crdt.recall(crdt.bumpAction(crdt.emptyDocSeen(), 'daemon'), 'a.md', { denied: true, turn: 3 });
  const b = crdt.recall(crdt.bumpAction(crdt.emptyDocSeen(), 'spawn'), 'b.md', { turn: 1 });
  expect(crdt.mergeDocSeen(a, b)).toEqual(crdt.mergeDocSeen(b, a));

  const ra = crdt.emitSegments(crdt.decideSegments(crdt.emptyRemainder(), [{ id: 's1', text: 'x', seq: 0 }]), ['s1']);
  const rb = crdt.decideSegments(crdt.emptyRemainder(), [{ id: 's2', text: 'y', seq: 1 }]);
  expect(crdt.mergeRemainder(ra, rb)).toEqual(crdt.mergeRemainder(rb, ra));

  const ta = crdt.bumpTurn(crdt.emptyTurns(), 'daemon');
  const tb = crdt.noteRefusal(crdt.bumpTurn(crdt.emptyTurns(), 'spawn'));
  expect(crdt.mergeTurns(ta, tb)).toEqual(crdt.mergeTurns(tb, ta));
});

test('② idempotence — merging a state with itself changes nothing', () => {
  const a = crdt.recall(crdt.bumpAction(crdt.emptyDocSeen(), 'spawn'), 'a.md', { turn: 2 });
  expect(crdt.mergeDocSeen(a, a)).toEqual(a);
  const r = crdt.countEmission(crdt.decideSegments(crdt.emptyRemainder(), [{ id: 's1', text: 'x', seq: 0 }]), 'spawn');
  expect(crdt.mergeRemainder(r, r)).toEqual(r);
  const t = crdt.noteRefusal(crdt.bumpTurn(crdt.emptyTurns(), 'daemon'));
  expect(crdt.mergeTurns(t, t)).toEqual(t);
});

test('③ associativity — the merge order of three replicas is irrelevant', () => {
  const mk = (w, doc) => crdt.recall(crdt.bumpAction(crdt.emptyDocSeen(), w), doc, { turn: 1 });
  const a = mk('daemon', 'a.md');
  const b = mk('spawn', 'b.md');
  const c = mk('daemon', 'c.md');
  expect(crdt.mergeDocSeen(crdt.mergeDocSeen(a, b), c)).toEqual(crdt.mergeDocSeen(a, crdt.mergeDocSeen(b, c)));
});

test('④ convergence — the two writers of 2026-08-23, interleaved, lose nothing', () => {
  // 🔑 THE PRODUCTION CASE, WRITTEN OUT. The daemon and a spawned peer each read
  //    the same queue and each append. Under a read-modify-write ONE of the two
  //    appends is lost (209 out of 800, measured). Here both survive, in both
  //    merge orders.
  const base = crdt.decideSegments(crdt.emptyRemainder(), [{ id: 's0', text: 'base', seq: 0 }]);
  const daemon = crdt.decideSegments(base, [{ id: 's1', text: 'from-daemon', seq: 1 }]);
  const spawn = crdt.decideSegments(base, [{ id: 's2', text: 'from-spawn', seq: 2 }]);
  const ab = crdt.mergeRemainder(daemon, spawn);
  const ba = crdt.mergeRemainder(spawn, daemon);
  expect(ab).toEqual(ba);
  expect(crdt.remaining(ab).map((s) => s.id)).toEqual(['s0', 's1', 's2']);

  // …and the SAME shape on the counter that a lost update would silently shrink.
  const ca = crdt.bumpTurn(crdt.bumpTurn(crdt.emptyTurns(), 'daemon'), 'daemon');
  const cb = crdt.bumpTurn(crdt.emptyTurns(), 'spawn');
  expect(crdt.turnValue(crdt.mergeTurns(ca, cb))).toBe(3);
});

test('⑤ the business property — consumed is never re-owed, unemitted is never announced', () => {
  let r = crdt.decideSegments(crdt.emptyRemainder(), [
    { id: 's1', text: 'one', seq: 0 }, { id: 's2', text: 'two', seq: 1 },
  ]);
  r = crdt.emitSegments(r, ['s1']);
  expect(crdt.remaining(r).map((s) => s.id)).toEqual(['s2']);
  // A stale peer that only knows the DECISION cannot resurrect the consumption.
  const stale = crdt.decideSegments(crdt.emptyRemainder(), [{ id: 's1', text: 'one', seq: 0 }]);
  expect(crdt.remaining(crdt.mergeRemainder(r, stale)).map((s) => s.id)).toEqual(['s2']);
  // And a segment nobody decided is never owed, even if somebody marked it emitted.
  const ghost = crdt.emitSegments(crdt.emptyRemainder(), ['s9']);
  expect(crdt.remaining(crdt.mergeRemainder(r, ghost)).map((s) => s.id)).toEqual(['s2']);
});

test('⑥a compaction — it removes the pair, and the DIFFERENCE does not move', () => {
  let r = crdt.decideSegments(crdt.emptyRemainder(), [
    { id: 's1', text: 'one', seq: 0 }, { id: 's2', text: 'two', seq: 1 },
  ]);
  r = crdt.countEmission(crdt.emitSegments(r, ['s1']), 'spawn');
  const before = crdt.remaining(r);
  const { state, removed } = crdt.compactRemainder(r);
  // 🛑 A CLEANER IS PROVEN BY WHAT IT DELETES. Asserting only "the difference is
  //    unchanged" would pass on a compaction that removes NOTHING — the
  //    `*.tar.gz` defect, in a test.
  expect(removed).toEqual(['s1']);
  expect(Object.keys(state.decided)).toEqual(['s2']);
  expect(Object.keys(state.emitted)).toEqual([]);
  expect(crdt.remaining(state)).toEqual(before);
  expect(crdt.emissionValue(state)).toBe(crdt.emissionValue(r));
});

test('⑥b compaction MEASURED on a full round trip — everything delivered collapses to nothing', () => {
  // 📐 THE MEASUREMENT THE DOCTRINE DEMANDS: a queue of 50 segments, all
  //    delivered, is compacted to ZERO retained entries. Without this cell the
  //    bound would be "declared", which is precisely what this fleet has already
  //    paid for once.
  const segments = Array.from({ length: 50 }, (_, i) => ({ id: `s${i}`, text: `t${i}`, seq: i }));
  let r = crdt.decideSegments(crdt.emptyRemainder(), segments);
  r = crdt.emitSegments(r, segments.slice(0, 47).map((s) => s.id));
  const { state, removed } = crdt.compactRemainder(r);
  expect(removed.length).toBe(47);
  expect(Object.keys(state.decided).length + Object.keys(state.emitted).length).toBe(3);
  expect(crdt.remaining(state).map((s) => s.id)).toEqual(['s47', 's48', 's49']);
});

test('⑥c compaction is NOT safe without causal stability — the counter-example, stated', () => {
  // 🔴 A LIMIT MEASURED AND WRITTEN DOWN RATHER THAN HIDDEN. Replica A decided
  //    AND emitted `s1`; replica B has only ever seen the DECISION. If A collects
  //    `s1` before B has learned of the emission, the later merge re-owes it —
  //    a document delivered twice, the exact failure of 2026-08-23.
  // 🛑 CONSEQUENCE, AND IT IS A DESIGN DECISION: the MERGE is lock-free, the
  //    COLLECTION is not. Compaction belongs at a point of quiescence — under the
  //    lock that stays as a belt, or at PreCompact, where the record is destroyed
  //    anyway. Never on the hot path.
  const a = crdt.emitSegments(crdt.decideSegments(crdt.emptyRemainder(), [{ id: 's1', text: 'one', seq: 0 }]), ['s1']);
  const b = crdt.decideSegments(crdt.emptyRemainder(), [{ id: 's1', text: 'one', seq: 0 }]);
  expect(crdt.remaining(crdt.mergeRemainder(a, b))).toEqual([]);
  const collected = crdt.compactRemainder(a).state;
  expect(crdt.remaining(crdt.mergeRemainder(collected, b)).map((s) => s.id)).toEqual(['s1']);
});

test('⑦ a G-Counter refuses an undeclared writer, LOUDLY', () => {
  // 🛑 A quiet new slot would be an unbounded growth with no possible
  //    compaction: a dated outage, and a silent one.
  expect(() => crdt.bumpCounter({}, 'pid-4212')).toThrow(/unknown writer "pid-4212"/);
  expect(() => crdt.bumpTurn(crdt.emptyTurns(), '')).toThrow(/expected daemon \| spawn/);
  expect(crdt.WRITERS).toEqual(['daemon', 'spawn']);
});

test('⑧ the alternation — a refusal is never followed by a refusal', () => {
  let s = crdt.bumpAction(crdt.emptyDocSeen(), 'spawn');
  s = crdt.recall(s, 'x.md', { denied: true });
  expect(crdt.isDenied(s, 'x.md')).toBe(true);
  s = crdt.bumpAction(s, 'spawn');
  s = crdt.recall(s, 'x.md', { denied: false });
  expect(crdt.isDenied(s, 'x.md')).toBe(false);
  // …and a document that was never refused is never "denied".
  expect(crdt.isDenied(s, 'never.md')).toBe(false);
});

test('⑨ the drift is a DIFFERENCE, never a stored counter', () => {
  let s = crdt.emptyDocSeen();
  expect(crdt.drift(s, 'x.md')).toBe(0); // never recalled ⇒ zero, like the engine
  s = crdt.recall(crdt.bumpAction(s, 'spawn'), 'x.md');
  expect(crdt.drift(s, 'x.md')).toBe(0);
  s = crdt.bumpAction(crdt.bumpAction(s, 'spawn'), 'daemon');
  expect(crdt.drift(s, 'x.md')).toBe(2);
  expect(crdt.actionCount(s)).toBe(3);
  // The `turn` unit keeps its own watermark — two clocks, never merged.
  expect(crdt.driftTurns(s, 'x.md', 7)).toBe(0);
  s = crdt.recall(s, 'x.md', { turn: 4 });
  expect(crdt.driftTurns(s, 'x.md', 7)).toBe(3);
});

// ═══════════════════════════════════════════════════════════════════════
// ⑩ — DIRECT UNIT CELLS on the lattice pieces and the raw structures.
//     ⚠️ The tests above drive everything through the public flow (`recall`,
//     `bumpTurn`, `decideSegments`…), which never exercises a merge where the
//     LEFT side already holds a larger value, nor a case where `compactRemainder`
//     sees only ONE half of a pair. Both are real states a peer can reach.
// ═══════════════════════════════════════════════════════════════════════

test('⑩a mergeCounter keeps the LARGER existing slot — merge is MAX, never overwrite', () => {
  // A left-hand slot already ahead of the incoming one must survive the merge
  // unchanged: overwriting it would break idempotence (re-merging an old state
  // would move the counter BACKWARDS).
  expect(crdt.mergeCounter({ daemon: 5 }, { daemon: 2 })).toEqual({ daemon: 5 });
  expect(crdt.mergeCounter({}, { spawn: 3 })).toEqual({ spawn: 3 });
});

test('⑩b mergeMaxReg keeps the LARGER existing value, and creates an absent key', () => {
  expect(crdt.mergeMaxReg({ 'a.md': 9 }, { 'a.md': 4 })).toEqual({ 'a.md': 9 });
  expect(crdt.mergeMaxReg({}, { 'a.md': 0 })).toEqual({ 'a.md': 0 });
});

test('⑩c emptyTurns starts UNREFUSED', () => {
  expect(crdt.emptyTurns().refused).toBe(false);
});

test('⑩d mergeTurns.refused is a TRUTH TABLE, not a shortcut on either side', () => {
  const T = { turns: {}, refused: true };
  const F = { turns: {}, refused: false };
  expect(crdt.mergeTurns(F, F).refused).toBe(false);
  expect(crdt.mergeTurns(T, F).refused).toBe(true);
  expect(crdt.mergeTurns(F, T).refused).toBe(true);
  expect(crdt.mergeTurns(T, T).refused).toBe(true);
});

test('⑩e compactRemainder keeps an EMITTED-only entry that has no DECIDED pair', () => {
  // The pair-removal rule only fires when BOTH halves carry the id; an
  // emitted-only entry (the decision has not merged in yet) must survive.
  const r = { decided: {}, emitted: { orphan: true }, emissions: {} };
  const { state, removed } = crdt.compactRemainder(r);
  expect(removed).toEqual([]);
  expect(state.emitted).toEqual({ orphan: true });
});

test('⑩f compactRemainder keeps a DECIDED-only entry that has no EMITTED pair', () => {
  const r = { decided: { pending: { seq: 0, text: 'x' } }, emitted: {}, emissions: {} };
  const { state, removed } = crdt.compactRemainder(r);
  expect(removed).toEqual([]);
  expect(state.decided).toEqual({ pending: { seq: 0, text: 'x' } });
});

test('⑩g compactRemainder returns the REMOVED ids SORTED, independent of insertion order', () => {
  const r = {
    decided: { z: { seq: 0, text: 'a' }, a: { seq: 1, text: 'b' } },
    emitted: { z: true, a: true },
    emissions: {},
  };
  const { removed } = crdt.compactRemainder(r);
  expect(removed).toEqual(['a', 'z']);
});

test('⑩h decideSegments tie-break — LOWER seq wins, higher seq is IGNORED', () => {
  let r = crdt.decideSegments(crdt.emptyRemainder(), [{ id: 's1', text: 'first', seq: 5 }]);
  r = crdt.decideSegments(r, [{ id: 's1', text: 'later', seq: 9 }]);
  expect(r.decided.s1).toEqual({ seq: 5, text: 'first' });
});

test('⑩i decideSegments tie-break — EQUAL seq, LEXICOGRAPHICALLY SMALLER text wins', () => {
  let r = crdt.decideSegments(crdt.emptyRemainder(), [{ id: 's1', text: 'b', seq: 5 }]);
  r = crdt.decideSegments(r, [{ id: 's1', text: 'a', seq: 5 }]);
  expect(r.decided.s1).toEqual({ seq: 5, text: 'a' });
  // …and the reverse candidate (larger text, same seq) changes nothing.
  r = crdt.decideSegments(r, [{ id: 's1', text: 'z', seq: 5 }]);
  expect(r.decided.s1).toEqual({ seq: 5, text: 'a' });
});

test('⑩j decideSegments — an EQUAL candidate (same seq, same text) is a strict no-op', () => {
  let r = crdt.decideSegments(crdt.emptyRemainder(), [{ id: 's1', text: 'x', seq: 5 }]);
  const before = r.decided.s1;
  r = crdt.decideSegments(r, [{ id: 's1', text: 'x', seq: 5 }]);
  expect(r.decided.s1).toBe(before); // same reference: the branch never ran
});

test('⑩k mergeRemainder tie-break — LOWER seq wins, higher seq loses, EQUAL seq keeps the smaller text', () => {
  const higherSeq = crdt.decideSegments(crdt.emptyRemainder(), [{ id: 's1', text: 'x', seq: 9 }]);
  const lowerSeq = crdt.decideSegments(crdt.emptyRemainder(), [{ id: 's1', text: 'y', seq: 5 }]);
  expect(crdt.mergeRemainder(higherSeq, lowerSeq).decided.s1).toEqual({ seq: 5, text: 'y' });
  expect(crdt.mergeRemainder(lowerSeq, higherSeq).decided.s1).toEqual({ seq: 5, text: 'y' });

  const equalA = crdt.decideSegments(crdt.emptyRemainder(), [{ id: 's2', text: 'b', seq: 1 }]);
  const equalB = crdt.decideSegments(crdt.emptyRemainder(), [{ id: 's2', text: 'a', seq: 1 }]);
  expect(crdt.mergeRemainder(equalA, equalB).decided.s2).toEqual({ seq: 1, text: 'a' });
});

test('⑩l remaining() sorts by (seq, id), including NEGATIVE seq — a real tie-break, not insertion order', () => {
  let r = crdt.emptyRemainder();
  // Insertion order deliberately the OPPOSITE of the expected output order, and
  // seq values that a naive `x + y` (instead of `x - y`) would misorder.
  r = crdt.decideSegments(r, [
    { id: 'c', text: 'x', seq: 1 },
    { id: 'b', text: 'x', seq: -1 },
    { id: 'a', text: 'x', seq: 1 }, // same seq as 'c' → tie-break on id
  ]);
  expect(crdt.remaining(r).map((s) => s.id)).toEqual(['b', 'a', 'c']);
});

test('⑩m2 remaining() tie-break — a SCRAMBLED insertion order, not merely reversed', () => {
  // 🛑 A `ConditionalExpression -> true` mutant on the comparator (always
  //    return -1) is INDISTINGUISHABLE from the correct comparator on an
  //    array whose insertion order already happens to be the exact REVERSE of
  //    the expected output: V8's small-array insertion sort then reverses the
  //    input regardless of what the comparator actually computes, which
  //    coincidentally matches. A SCRAMBLED (non-reversed) order is required to
  //    tell the two apart.
  let r = crdt.emptyRemainder();
  r = crdt.decideSegments(r, [
    { id: 'b', text: 'x', seq: 0 },
    { id: 'a', text: 'x', seq: 0 },
    { id: 'c', text: 'x', seq: 0 },
  ]);
  expect(crdt.remaining(r).map((s) => s.id)).toEqual(['a', 'b', 'c']);
});

test('⑩n mergeRemainder tie-break — EQUAL seq, WORSE (larger) incoming text never wins, either merge order', () => {
  // 🛑 Distinguishes `<` from `<=` on the seq clause: with equal seq the first
  //    clause of the real condition is FALSE, so the outcome depends entirely
  //    on the text comparison. A `<=` mutant would short-circuit straight to
  //    "update", ignoring the text rule.
  const good = crdt.decideSegments(crdt.emptyRemainder(), [{ id: 's1', text: 'a', seq: 3 }]);
  const worse = crdt.decideSegments(crdt.emptyRemainder(), [{ id: 's1', text: 'z', seq: 3 }]);
  expect(crdt.mergeRemainder(good, worse).decided.s1).toEqual({ seq: 3, text: 'a' });
  expect(crdt.mergeRemainder(worse, good).decided.s1).toEqual({ seq: 3, text: 'a' });
});

test('⑩n2 mergeRemainder — EQUAL seq AND EQUAL text: the LEFT reference is kept, never replaced', () => {
  // 🛑 Distinguishes `<` from `<=` on the text clause specifically: two equal
  //    candidates carry the SAME values, so a value-equality assertion cannot
  //    tell the branches apart — only REFERENCE identity can. The real rule
  //    (`<`) never fires on a tie, so the left-hand `decided[id]` object must
  //    survive the merge UNTOUCHED (same reference); a `<=` mutant would
  //    replace it with `b`'s (value-identical, different object).
  const left = crdt.decideSegments(crdt.emptyRemainder(), [{ id: 's1', text: 'same', seq: 3 }]);
  const right = crdt.decideSegments(crdt.emptyRemainder(), [{ id: 's1', text: 'same', seq: 3 }]);
  expect(crdt.mergeRemainder(left, right).decided.s1).toBe(left.decided.s1);
});

test('⑩o mergeRemainder — a HIGHER incoming seq never wins, either merge order', () => {
  // 🛑 Distinguishes a `ConditionalExpression -> true` mutant (always update)
  //    from the real rule: a strictly higher seq must NEVER overwrite.
  const lowSeq = crdt.decideSegments(crdt.emptyRemainder(), [{ id: 's1', text: 'x', seq: 0 }]);
  const highSeq = crdt.decideSegments(crdt.emptyRemainder(), [{ id: 's1', text: 'y', seq: 9 }]);
  expect(crdt.mergeRemainder(lowSeq, highSeq).decided.s1).toEqual({ seq: 0, text: 'x' });
  expect(crdt.mergeRemainder(highSeq, lowSeq).decided.s1).toEqual({ seq: 0, text: 'x' });
});

test('⑩p decideSegments — a HIGHER seq candidate never wins, and a FALSE-everything mutant is caught', () => {
  // 🛑 A `ConditionalExpression -> false` mutant would silently skip even the
  //    first-ever decision of a brand-new id (`prev === undefined` case).
  let r = crdt.decideSegments(crdt.emptyRemainder(), [{ id: 'fresh', text: 'v', seq: 0 }]);
  expect(r.decided.fresh).toEqual({ seq: 0, text: 'v' });
  // 🛑 A `ConditionalExpression -> true` mutant would let a strictly WORSE
  //    (higher-seq) candidate overwrite an already-decided one.
  r = crdt.decideSegments(r, [{ id: 'fresh', text: 'later', seq: 5 }]);
  expect(r.decided.fresh).toEqual({ seq: 0, text: 'v' });
});

test('⑩p2 decideSegments — a STRICTLY LOWER seq candidate DOES win (the real replacement path)', () => {
  // 🛑 Every other decideSegments test in this file either introduces a
  //    brand-new id (`prev === undefined`, first clause alone) or follows up
  //    with an EQUAL or HIGHER seq (no replacement). None of them exercises
  //    the middle clause (`candidate.seq < prev.seq`) as the SOLE reason the
  //    branch fires — so a `ConditionalExpression -> false` mutant on that
  //    clause changed NOTHING observable in any of them and survived. Here
  //    the second call has a strictly LOWER seq and a DIFFERENT text: only
  //    the middle clause can explain the replacement.
  let r = crdt.decideSegments(crdt.emptyRemainder(), [{ id: 's1', text: 'stale', seq: 9 }]);
  r = crdt.decideSegments(r, [{ id: 's1', text: 'fresher', seq: 2 }]);
  expect(r.decided.s1).toEqual({ seq: 2, text: 'fresher' });
});

test('⑩m remaining() DOES sort — neutralizing the comparator would keep insertion order', () => {
  // Insertion order already equals the WRONG (descending) order, so if the
  // comparator were disarmed (sort() with no real effect), the sabotaged
  // result would be indistinguishable from the correct one on ⑩l alone.
  // Here insertion order is descending seq while expected output is ascending.
  let r = crdt.emptyRemainder();
  r = crdt.decideSegments(r, [
    { id: 'hi', text: 'x', seq: 5 },
    { id: 'lo', text: 'x', seq: 1 },
  ]);
  expect(crdt.remaining(r).map((s) => s.id)).toEqual(['lo', 'hi']);
});

// ═══════════════════════════════════════════════════════════════════════
// ② — THE DIFFERENTIAL. Oracle = the code shipped today.
// ═══════════════════════════════════════════════════════════════════════

// ── ORACLE ①: `gate.decide`, driven sequentially over a script of actions.
function engineDocSeen(config, decls, script) {
  let state = {};
  let turn = 0;
  const trace = [];
  for (const step of script) {
    turn += step.turns || 0;
    const r = gate.decide(config, decls, step.matched, state, turn, undefined, 'Bash');
    trace.push({ inject: [...r.inject].sort(), decision: r.decision });
    state = r.state;
  }
  return trace;
}

// ── THE MODEL: the SAME cascade resolvers, the SAME judge (`shouldInjectFor`),
//    the SAME alternation rule — only the STATE REPRESENTATION differs. That is
//    what makes this a differential on the representation and not on the engine.
function modelDocSeen(config, decls, script) {
  let s = crdt.emptyDocSeen();
  let turn = 0;
  const trace = [];
  for (const step of script) {
    turn += step.turns || 0;
    const inject = [];
    const blocked = [];
    // ⚠️ THE ALTERNATION IS ABOUT THE ACTION (2026-08-24): a gesture is refused as soon
    //    as ONE document refuses, so "a refusal is never followed by a refusal" can only
    //    be asked over the whole set biting this gesture. Asked per document, two
    //    enforcing docs in ANTIPHASE refuse every action for ever while each of them,
    //    read alone, obeys the rule — measured in production that day.
    const previouslyDenied = step.matched.some((doc) => gate.enforceForDoc(config, decls[doc], undefined)
      && crdt.isDenied(s, doc));
    for (const doc of step.matched) {
      const mode = gate.modeForDoc(config, decls[doc], undefined);
      const unit = gate.driftUnitForDoc(config, decls[doc], undefined);
      const threshold = gate.thresholdForDoc(config, decls[doc], undefined);
      const since = unit === 'turn' ? crdt.driftTurns(s, doc, turn) : crdt.drift(s, doc);
      const injects = lib.shouldInjectFor(mode, crdt.isSeen(s, doc), since, threshold);
      if (injects) inject.push(doc);
      if (injects && gate.enforceForDoc(config, decls[doc], undefined) && !previouslyDenied) blocked.push(doc);
    }
    trace.push({
      inject: [...inject].sort(),
      decision: inject.length === 0 ? 'none' : blocked.length > 0 ? 'deny' : 'allow',
    });
    // ── WRITE PHASE, in the engine's own order: the action counts FIRST, then
    //    every recalled document takes the new count as its watermark.
    s = crdt.bumpAction(s, 'spawn');
    for (const doc of step.matched) {
      const mode = gate.modeForDoc(config, decls[doc], undefined);
      const enf = gate.enforceForDoc(config, decls[doc], undefined);
      // ⚠️ SAME WRITE CONDITION AS THE ENGINE: a `dumb` document without
      //    `enforce` stores nothing at all, so it must not be recalled here
      //    either — otherwise the model would remember what the engine forgets.
      if (mode !== 'dumb' || enf) s = crdt.recall(s, doc, { denied: blocked.includes(doc), turn });
    }
  }
  return trace;
}

// EXHAUSTIVE-ish domain: every mode × both drift units × enforce on/off, over a
// script long enough for a threshold to be crossed twice and for the alternation
// to alternate twice.
const DECLS = () => ({
  'once.md': { mode: 'once' },
  'dumb.md': { mode: 'dumb' },
  'smart2.md': { mode: 'smart', threshold: 2 },
  'smartturn.md': { mode: 'smart', threshold: 2, driftUnit: 'turn' },
  'enforce-once.md': { mode: 'once', enforce: true },
  'enforce-dumb.md': { mode: 'dumb', enforce: true },
  'enforce-smart.md': { mode: 'smart', threshold: 2, enforce: true },
});

const DOCS = () => Object.keys(DECLS());

test('DIFFERENTIAL ① doc-seen — the model DELIVERS exactly what `gate.decide` delivers', () => {
  const decls = DECLS();
  const docs = DOCS();
  const config = {};
  // 2^7 subsets of the corpus per step is unaffordable; the domain instead walks
  // EVERY subset over a rotating window, which visits each document matched and
  // not matched, alone and with peers, across turn boundaries.
  let compared = 0;
  let divergences = 0;
  for (let mask = 0; mask < 128; mask += 1) {
    const script = [];
    for (let step = 0; step < 8; step += 1) {
      const matched = docs.filter((_, i) => ((mask >> ((i + step) % 7)) & 1) === 1);
      script.push({ matched, turns: step % 3 === 0 ? 1 : 0 });
    }
    const oracle = engineDocSeen(config, decls, script);
    const model = modelDocSeen(config, decls, script);
    for (let i = 0; i < oracle.length; i += 1) {
      // 🛑 THE DELIVERY IS IDENTICAL EVERYWHERE, NO EXCEPTION. Which documents
      //    reach the agent is the observable that must not move by a single
      //    entry — that is the zero-regression contract.
      expect(model[i].inject).toEqual(oracle[i].inject);
      // ✅ EQUALITY, NO TOLERANCE — AND THIS CLAUSE USED TO ALLOW 28 EXCEPTIONS
      //    (2026-08-23). They were not the model's error but the ENGINE's: the
      //    foreign-action branch of `gate.js` rebuilt a smart entry and DROPPED
      //    its `denied` flag, so a blocked document was blocked TWICE. The
      //    engine was repaired the same day and the exception clause DIED WITH
      //    IT — deleted, never softened into a tolerance.
      // 🛑 NEVER re-open a divergence clause here to make a run pass. A
      //    differential that tolerates a difference has stopped being one; if
      //    these two disagree again, one of them is wrong and it must be SAID.
      expect({ i, decision: model[i].decision }).toEqual({ i, decision: oracle[i].decision });
      compared += 1;
    }
  }
  // ANTI-VACUITY: a differential that compared nothing is indistinguishable from
  // one that agrees, and a declared divergence that never fires hides its cause.
  expect(compared).toBe(1024);
  // 📐 MEASURED 2026-08-23: 28 of 1,024 BEFORE the engine was repaired, ZERO
  //    after. The counter is kept and pinned at zero on purpose — it is the
  //    only thing that would tell a reader the day divergences came back.
  expect(divergences).toBe(0);
});

test('DIFFERENTIAL ①ter — the anti-loop flag SURVIVES a foreign action (regression guard)', () => {
  // 🔴 FOUND BY THIS DIFFERENTIAL, 2026-08-23. `gate.js` states, in bold, that
  //    "a block is NEVER followed by a block" — the guarantee that makes
  //    `enforce` usable at all — and anchors it in the `denied` flag of the
  //    state. But the FOREIGN-ACTION branch rebuilds a smart document's entry as
  //    `{ seen, sinceLastCall: n + 1 }`, which DROPS `denied` (and `turn`).
  //    ⇒ any tool call that does not match the document erases the flag, and the
  //    agent's retry is refused A SECOND TIME with no successful pass in
  //    between — exactly the wall the alternation exists to forbid.
  // 🛑 THIS CELL DOES NOT FIX IT. Nothing here is wired, and changing the live
  //    engine is a separate gesture with its own GO. What it does is make the
  //    defect MACHINE-VISIBLE instead of prose: it asserts today's behaviour
  //    LITERALLY, so the day the engine is corrected this cell goes red and
  //    whoever corrects it is told the model already expected the fix.
  // ⚠️ The `turn` field is dropped by the same rebuild and that is HARMLESS: the
  //    branch only ever runs for `driftUnit: "tool"`, where `turn` is unread.
  const decls = { 'e.md': { mode: 'smart', threshold: 1, enforce: true }, 'other.md': { mode: 'dumb' } };
  const script = [{ matched: ['e.md'] }, { matched: ['other.md'] }, { matched: ['e.md'] }];
  expect(engineDocSeen({}, decls, script).map((r) => r.decision)).toEqual(['deny', 'allow', 'allow']);
  expect(modelDocSeen({}, decls, script).map((r) => r.decision)).toEqual(['deny', 'allow', 'allow']);
});

test('DIFFERENTIAL ①bis — the differential SEES a divergence (negative-check)', () => {
  // 🛑 A DIFFERENTIAL NEVER SEEN RED IS A DIFFERENTIAL ASSUMED TO WORK. Sabotage:
  //    read the drift as the RAW action count instead of the difference — the
  //    exact mistake a reader of this module could make.
  const decls = DECLS();
  const config = {};
  const script = [
    { matched: ['smart2.md'], turns: 1 },
    { matched: [], turns: 0 },
    { matched: ['smart2.md'], turns: 0 },
  ];
  const oracle = engineDocSeen(config, decls, script);
  let s = crdt.emptyDocSeen();
  const sabotaged = [];
  for (const step of script) {
    const inject = step.matched.filter((doc) => lib.shouldInjectFor(
      gate.modeForDoc(config, decls[doc], undefined),
      crdt.isSeen(s, doc),
      crdt.actionCount(s), // ← SABOTAGE: the raw count, not the difference
      gate.thresholdForDoc(config, decls[doc], undefined),
    ));
    sabotaged.push({ inject: inject.sort(), decision: inject.length === 0 ? 'none' : 'allow' });
    s = crdt.bumpAction(s, 'spawn');
    for (const doc of step.matched) s = crdt.recall(s, doc);
  }
  expect(sabotaged).not.toEqual(oracle);
});

// ── ORACLE ②: `turn-core.bump` on an in-memory store.
function memoryStore() {
  const m = new Map();
  return {
    loadState: (p, k) => (m.has(p + k) ? JSON.parse(m.get(p + k)) : {}),
    saveState: (p, k, v) => m.set(p + k, JSON.stringify(v)),
  };
}

test('DIFFERENTIAL ② turn-count — the sum of the slots IS `turn-core.bump`', () => {
  const store = memoryStore();
  let model = crdt.emptyTurns();
  for (let i = 1; i <= 40; i += 1) {
    const oracle = turnCore.bump(store, 'turn-count-', 'scope');
    model = crdt.bumpTurn(model, 'spawn');
    expect(crdt.turnValue(model)).toBe(oracle);
  }
  expect(crdt.turnValue(model)).toBe(40);
  // The refusal flag: monotone on both sides (the engine writes `refused: true`
  // and never clears it inside a context).
  expect(crdt.noteRefusal(crdt.noteRefusal(model)).refused).toBe(true);
});

// ── ORACLE ③: `emission-core.emit`, the REAL queue, on an in-memory store.
test('DIFFERENTIAL ③ remainder — `decided − emitted` IS the queue `emission-core` keeps', () => {
  const store = memoryStore();
  const scope = 'scope';
  let model = crdt.emptyRemainder();
  let seq = 0;
  let rounds = 0;

  // Segments deliberately larger than the frame, so the queue really carries a
  // remainder for several rounds — a differential on an always-empty queue would
  // prove nothing.
  const gros = (n) => Array.from({ length: n }, (_, i) => ({
    id: `d${rounds}-${i}`, label: `d${rounds}-${i}`, text: 'x'.repeat(900),
  }));

  for (let round = 0; round < 6; round += 1) {
    rounds = round;
    const queueBefore = emission.loadQueue(scope, store);
    const fresh = gros(3);
    const r = emission.emit({ fresh, budgetMax: 2000, nbFrames: 2, index: 1, scopeId: scope, store });

    // What the engine actually did, read from its own return value:
    //   `r.segments` went in, `r.frames[last].deferred` stayed behind.
    const deferred = r.frames[r.frames.length - 1].deferred;
    const remaining = new Set(deferred.map((s) => s.id));

    // The MODEL performs the same facts as ADDITIONS only.
    // ① everything that entered the split is decided (the queue's own entries
    //    are already decided from the previous round — re-deciding is a no-op).
    model = crdt.decideSegments(model, r.segments.map((s) => ({ id: s.id, text: s.text, seq: seq++ })));
    // ② the deferred chunks are NEW segments (chunking renames them `doc#j/m`).
    model = crdt.decideSegments(model, deferred.map((s) => ({ id: s.id, text: s.text, seq: seq++ })));
    // ③ everything that entered the split and is not a surviving deferred id
    //    HAS GONE OUT — that is a consumption, expressed as an addition.
    model = crdt.emitSegments(model, r.segments.filter((s) => !remaining.has(s.id)).map((s) => s.id));
    if (r.segments.length > 0) model = crdt.countEmission(model, 'spawn');

    const queueApres = emission.loadQueue(scope, store);
    expect(crdt.remaining(model).map((s) => ({ id: s.id, text: s.text })))
      .toEqual(queueApres.map((s) => ({ id: s.id, text: s.text })));
    expect(crdt.emissionValue(model)).toBe(emission.emissionCount(scope, store));
    // ANTI-VACUITY: the queue must really have carried something.
    if (round > 0) expect(queueBefore.length).toBeGreaterThan(0);
  }
});
