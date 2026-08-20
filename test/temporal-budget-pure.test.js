// temporal-budget-pure.test.js — the DECISIONS of the temporal budget gate (PURE module, MUTATED).
//
// ⚠️ WHAT THIS SUITE PROTECTS: the rule that decides whether the gate screams or keeps quiet. As long
//    as it lived inside `temporal-budget-gate.test.js`, Stryker did not mutate it — an inverted
//    comparison, a bound turned into its non-strict twin, a `sort` that no longer sorts would have
//    stayed green for ever. A false gate is worse than no gate: it REASSURES.
// ⚠️ HERMETIC: zero fs, zero spawn, zero ast-grep. The scan lives in the gate; the verdict lives here.
// ⚠️ IMPORTED DIRECTLY from the mutated file, NEVER through a re-export: `perTest` coverage misses the
//    tests that go through a re-export, which produces PHANTOM survivors (measured 2026-07-16 on
//    another repo: a lying 45 % that became a real 100 % once the import was made direct).
// ⚠️ FIXTURES ARE THUNKS, never module-level `const`: under `perTest` coverage, an expression evaluated
//    at module load belongs to NO test, so its mutants sit uncovered and SURVIVE (42 false survivors
//    measured here in July, score 76.67 % instead of 99.33 %).
// ⚠️ EXPECTED MESSAGES ARE WRITTEN OUT IN FULL, hardcoded. They ARE the contract the human reads on a
//    red gate — and a test deriving its expectation from the code it checks would be mutated along
//    with it, hence invisible.

import { test, expect } from 'vitest';
import { verdict, ADMISSIBLE } from '../src/temporal-budget-pure.js';

// ── THUNKS (see the header: never a const evaluated at module load) ──────────
const call = (file) => ({ file });
const decl = (over) => ({
  count: 1,
  motive: 'undecidable',
  why: 'the harness may never send EOF: no local authority can say whether it will',
  ...over,
});
const truthful = () => ({ 'src/deadline.js': decl() });

test('a budget that tells the truth is SILENT (a gate screaming at healthy code gets unplugged)', () => {
  expect(verdict([call('src/deadline.js')], truthful())).toEqual([]);
});

test('a temporal call in an UNDECLARED file is caught (default of the ratchet = ZERO)', () => {
  expect(verdict([call('src/deadline.js'), call('src/lock.js')], truthful())).toEqual([
    'src/lock.js: 1 temporal call(s), NOT DECLARED (a file absent from the budget is held at ZERO)',
  ]);
});

test('every occurrence of the same file is COUNTED, not collapsed into one', () => {
  expect(verdict([call('src/lock.js'), call('src/lock.js'), call('src/lock.js')], {})).toEqual([
    'src/lock.js: 3 temporal call(s), NOT DECLARED (a file absent from the budget is held at ZERO)',
  ]);
});

test('MORE calls than declared = ratchet CROSSED', () => {
  expect(verdict([call('src/deadline.js'), call('src/deadline.js')], truthful())).toEqual([
    'src/deadline.js: 2 temporal call(s) measured, 1 declared — RATCHET CROSSED: prove the motive, or remove the wait',
  ]);
});

test('FEWER calls than declared = STALE ratchet, which must be lowered', () => {
  // ⚠️ A declaration nobody uses widens the budget for free, in silence — same doctrine as a stale
  //    layer justification. This is the half of the ratchet everyone forgets.
  expect(verdict([call('src/deadline.js')], { 'src/deadline.js': decl({ count: 3 }) })).toEqual([
    'src/deadline.js: 1 temporal call(s) measured, 3 declared — stale ratchet, LOWER IT',
  ]);
});

test('a declaration whose calls have ALL disappeared is caught', () => {
  expect(verdict([], truthful())).toEqual([
    'src/deadline.js: DECLARED but no temporal call left — remove the entry (stale ratchet)',
  ]);
});

test('`distant` and `undecidable` are the two ADMISSIBLE motives, and they are silent', () => {
  // ⚠️ The two words are written OUT, never read from ADMISSIBLE: deriving them from the value under
  //    test would make the mutant that empties the list invisible.
  for (const motive of ['distant', 'undecidable']) {
    expect(verdict([call('src/deadline.js')], { 'src/deadline.js': decl({ motive }) }), motive).toEqual([]);
  }
  expect(ADMISSIBLE).toEqual(['distant', 'undecidable']);
});

test('any OTHER motive is REFUSED — `local` is the exact word this gate exists to refuse', () => {
  expect(verdict([call('src/deadline.js')], { 'src/deadline.js': decl({ motive: 'local' }) })).toEqual([
    'src/deadline.js: motive "local" REFUSED — only distant | undecidable. In LOCAL the kernel KNOWS: a delay is a BUG, not a setting.',
  ]);
});

test('a motive without a usable justification is REFUSED (bound: 39 refused, 40 accepted)', () => {
  // ⚠️ THE BOUND IS TESTED ON BOTH SIDES: without the 40-character case, `<` turned into `<=` would
  //    survive for ever — a bound tested on one side only is a bound that is not tested.
  const short = verdict([call('src/deadline.js')], { 'src/deadline.js': decl({ why: 'x'.repeat(39) }) });
  expect(short).toEqual(['src/deadline.js: the motive carries no usable justification (`why`)']);
  expect(verdict([call('src/deadline.js')], { 'src/deadline.js': decl({ why: 'x'.repeat(40) }) })).toEqual([]);
});

test('a NON-STRING justification is REFUSED, never an exception (fail-closed)', () => {
  // ⚠️ A malformed manifest must make the gate GO RED, never CRASH: a gate dying on the defect it
  //    reports is a gate people delete.
  for (const why of [undefined, null, 42, {}, ['x'.repeat(50)], true]) {
    expect(verdict([call('src/deadline.js')], { 'src/deadline.js': decl({ why }) }), String(why)).toEqual([
      'src/deadline.js: the motive carries no usable justification (`why`)',
    ]);
  }
});

test('several defects on the SAME file are all reported, never just the first', () => {
  // A gate reporting one fault at a time turns a fix into N round trips.
  expect(verdict(
    [call('src/deadline.js'), call('src/deadline.js')],
    { 'src/deadline.js': decl({ motive: 'local', why: 'too short' }) },
  )).toEqual([
    'src/deadline.js: 2 temporal call(s) measured, 1 declared — RATCHET CROSSED: prove the motive, or remove the wait',
    'src/deadline.js: motive "local" REFUSED — only distant | undecidable. In LOCAL the kernel KNOWS: a delay is a BUG, not a setting.',
    'src/deadline.js: the motive carries no usable justification (`why`)',
  ]);
});

test('the faults are SORTED — the message must not depend on the walk order of the disk', () => {
  // ⚠️ Two runs finding the same defects must PRINT the same thing: an output that reshuffles itself is
  //    an output people stop diffing.
  const scrambled = verdict([call('src/zzz.js'), call('src/aaa.js'), call('src/mmm.js')], {});
  expect(scrambled).toEqual([
    'src/aaa.js: 1 temporal call(s), NOT DECLARED (a file absent from the budget is held at ZERO)',
    'src/mmm.js: 1 temporal call(s), NOT DECLARED (a file absent from the budget is held at ZERO)',
    'src/zzz.js: 1 temporal call(s), NOT DECLARED (a file absent from the budget is held at ZERO)',
  ]);
});

test('an EMPTY scan against an EMPTY budget is silent (the verdict is total)', () => {
  expect(verdict([], {})).toEqual([]);
});
