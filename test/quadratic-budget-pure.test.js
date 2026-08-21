// ═══════════════════════════════════════════════════════════════════════
// `src/quadratic-budget-pure.js` — DETERMINISTIC suite (Stryker target).
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ SEPARATE FROM `quadratic-gate.test.js` ON PURPOSE: the gate proves the
//    WIRING (real scan, real manifest, real rule), this suite proves the
//    DECISION. Mixing them would make the proof of the reasoning depend on the
//    state of the repository on the day it runs — and a contract that changes
//    verdict at every commit is no longer a contract.
//
// ⚠️ THE MODULE IS IMPORTED DIRECTLY, never through a re-export: `perTest`
//    coverage loses the mapping across a re-export and reports PHANTOM
//    survivors (measured on this fleet).
//
// ⚠️ FIXTURES ARE THUNKS, evaluated INSIDE each `test()`. A `const` built at
//    module load belongs to NO test, so its mutants are "static" and survive
//    with no test able to kill them (42 false survivors measured on this fleet).
//
// ⚠️ EXPECTED MESSAGES ARE WRITTEN OUT IN FULL, never derived from the module:
//    deriving them would prove `x === x` and would stay green on an inverted
//    comparison. The message IS the contract — it is what a person reads at
//    3 a.m. when a push goes red.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import {
  verdict,
  CLASSES,
  EXEMPT_FROM_JUSTIFICATION,
  NUMERIC_IMPACT_CLASS,
  MIN_WHY,
  MIN_IMPACT,
} from '../src/quadratic-budget-pure.js';

/** A justification comfortably over the bound (thunk: never a module-level const). */
const goodWhy = () => 'The inner traversal runs over the CLOSED list of admissible classes, four constants of the module.';
/** A numeric impact comfortably over the bound. */
const goodImpact = () => 'At 10,000 pages this would be 50 million pairs, about 40 s per build.';
/** A string of exactly `n` characters — bounds are proven ON the bound, never near it. */
const chars = (n) => 'x'.repeat(n);

const occ = (file, n) => {
  const out = [];
  for (let i = 0; i < n; i += 1) out.push({ file, line: i + 1, text: 'for (a) { for (b) {} }' });
  return out;
};

test('the CLOSED list of classes is exactly the four expected words, in order', () => {
  // Written out in full: deriving this from the module would demonstrate x === x
  // and would stay green if a fifth class were slipped in.
  assert.deepStrictEqual(CLASSES, ['O(N)', 'O(N log N)', 'DEBT', 'INHERITED_DEBT']);
  assert.strictEqual(EXEMPT_FROM_JUSTIFICATION, 'INHERITED_DEBT');
  assert.strictEqual(NUMERIC_IMPACT_CLASS, 'DEBT');
  assert.strictEqual(MIN_WHY, 60);
  assert.strictEqual(MIN_IMPACT, 40);
});

test('an empty scan against an empty budget is SILENT', () => {
  assert.deepStrictEqual(verdict([], {}), []);
});

test('a file ABSENT from the budget is held at ZERO', () => {
  assert.deepStrictEqual(verdict(occ('src/new.js', 2), {}), [
    'src/new.js: 2 nested traversal(s), NOT DECLARED (a file absent from the budget is held at ZERO)',
  ]);
});

test('a declaration that TELLS THE TRUTH is silent', () => {
  const files = { 'src/a.js': { max: 3, class: 'O(N)', why: goodWhy() } };
  assert.deepStrictEqual(verdict(occ('src/a.js', 3), files), []);
});

test('measured ABOVE the declaration: RATCHET CROSSED', () => {
  const files = { 'src/a.js': { max: 2, class: 'O(N)', why: goodWhy() } };
  assert.deepStrictEqual(verdict(occ('src/a.js', 5), files), [
    'src/a.js: 5 nested traversal(s) measured, 2 declared — RATCHET CROSSED: prove the class, or remove the nesting',
  ]);
});

test('measured BELOW the declaration: the ratchet is STALE and must be lowered', () => {
  // ⚠️ AN EQUALITY, NOT A CEILING. A declaration nobody uses widens the budget
  //    for free and in silence: the ground gained is taken back by the next
  //    writer, who inherits the old ceiling.
  const files = { 'src/a.js': { max: 7, class: 'O(N)', why: goodWhy() } };
  assert.deepStrictEqual(verdict(occ('src/a.js', 4), files), [
    'src/a.js: 4 nested traversal(s) measured, 7 declared — stale ratchet, LOWER IT',
  ]);
});

test('a declaration with NO occurrence left is a DORMANT PERMIT', () => {
  const files = { 'src/gone.js': { max: 1, class: 'O(N)', why: goodWhy() } };
  assert.deepStrictEqual(verdict([], files), [
    'src/gone.js: DECLARED but no nested traversal left — remove the entry (dormant permit)',
  ]);
});

test('a class outside the CLOSED list is REFUSED', () => {
  const files = { 'src/a.js': { max: 1, class: 'small', why: goodWhy() } };
  assert.deepStrictEqual(verdict(occ('src/a.js', 1), files), [
    'src/a.js: class "small" REFUSED — only O(N) | O(N log N) | DEBT | INHERITED_DEBT. '
    + 'The class says what the inner traversal runs over; it is not a label.',
  ]);
});

test('an INSTRUCTED entry owes a justification — the bound is proven ON both sides', () => {
  const tooShort = { 'src/a.js': { max: 1, class: 'O(N log N)', why: chars(MIN_WHY) } };
  assert.deepStrictEqual(verdict(occ('src/a.js', 1), tooShort), [
    'src/a.js: instructed entry WITHOUT a justification (`why`, more than 60 characters) — '
    + 'write WHAT the inner traversal runs over and why it is bounded.',
  ]);
  const justEnough = { 'src/a.js': { max: 1, class: 'O(N log N)', why: chars(MIN_WHY + 1) } };
  assert.deepStrictEqual(verdict(occ('src/a.js', 1), justEnough), []);
});

test('a non-string justification is not a justification', () => {
  const files = { 'src/a.js': { max: 1, class: 'O(N)', why: 999 } };
  assert.deepStrictEqual(verdict(occ('src/a.js', 1), files), [
    'src/a.js: instructed entry WITHOUT a justification (`why`, more than 60 characters) — '
    + 'write WHAT the inner traversal runs over and why it is bounded.',
  ]);
});

test('INHERITED_DEBT is EXEMPT from justification, ON PURPOSE', () => {
  // ⚠️ Demanding a sentence for each would produce INVENTED ones, and an invented
  //    justification makes the case look SETTLED — strictly worse than an honest
  //    blank. 🛑 Never extend this exemption to another class.
  const files = { 'src/legacy.js': { max: 4, class: 'INHERITED_DEBT' } };
  assert.deepStrictEqual(verdict(occ('src/legacy.js', 4), files), []);
});

test('a DEBT owes a NUMERIC impact — the bound is proven ON both sides', () => {
  const tooShort = {
    'src/a.js': { max: 1, class: 'DEBT', why: goodWhy(), impact: chars(MIN_IMPACT - 1) },
  };
  assert.deepStrictEqual(verdict(occ('src/a.js', 1), tooShort), [
    'src/a.js: DEBT without a NUMERIC `impact` (at least 40 characters) — '
    + 'write what it costs at 10,000. A budget measures quantity, never gravity.',
  ]);
  const justEnough = {
    'src/a.js': { max: 1, class: 'DEBT', why: goodWhy(), impact: chars(MIN_IMPACT) },
  };
  assert.deepStrictEqual(verdict(occ('src/a.js', 1), justEnough), []);
});

test('a DEBT with no impact at all is refused, and so is a non-string one', () => {
  const missing = { 'src/a.js': { max: 1, class: 'DEBT', why: goodWhy() } };
  assert.strictEqual(verdict(occ('src/a.js', 1), missing).length, 1);
  const notAString = { 'src/a.js': { max: 1, class: 'DEBT', why: goodWhy(), impact: 12345 } };
  assert.strictEqual(verdict(occ('src/a.js', 1), notAString).length, 1);
  const fine = { 'src/a.js': { max: 1, class: 'DEBT', why: goodWhy(), impact: goodImpact() } };
  assert.deepStrictEqual(verdict(occ('src/a.js', 1), fine), []);
});

test('a DEBT still owes its `why`: the impact does not replace it', () => {
  const files = { 'src/a.js': { max: 1, class: 'DEBT', why: 'too short', impact: goodImpact() } };
  assert.deepStrictEqual(verdict(occ('src/a.js', 1), files), [
    'src/a.js: instructed entry WITHOUT a justification (`why`, more than 60 characters) — '
    + 'write WHAT the inner traversal runs over and why it is bounded.',
  ]);
});

test('several defects on ONE file are ALL reported, never just the first', () => {
  const files = { 'src/a.js': { max: 1, class: 'whatever', why: 'short' } };
  const faults = verdict(occ('src/a.js', 3), files);
  assert.strictEqual(faults.length, 3);
});

test('the report is SORTED, so the same defect always reads the same way', () => {
  // ⚠️ The message must not depend on the order the scanner walked the disk,
  //    otherwise the same defect reads differently from one run to the next and
  //    people stop trusting the output.
  const faults = verdict(occ('src/z.js', 1).concat(occ('src/a.js', 1)), {});
  assert.deepStrictEqual(faults, [
    'src/a.js: 1 nested traversal(s), NOT DECLARED (a file absent from the budget is held at ZERO)',
    'src/z.js: 1 nested traversal(s), NOT DECLARED (a file absent from the budget is held at ZERO)',
  ]);
});

test('HOMONYMS are distinct entries: the key is a RELATIVE PATH, never a basename', () => {
  // ⚠️ Two homonyms melted into one key would make the red NON-ACTIONABLE: one
  //    would know there is one nesting too many without knowing in WHICH file.
  const measured = occ('src/sources/file.js', 1).concat(occ('src/hooks/file.js', 1));
  const files = { 'src/sources/file.js': { max: 1, class: 'INHERITED_DEBT' } };
  assert.deepStrictEqual(verdict(measured, files), [
    'src/hooks/file.js: 1 nested traversal(s), NOT DECLARED (a file absent from the budget is held at ZERO)',
  ]);
});

test('a key colliding with an Object prototype name is not read as "already counted"', () => {
  // Unreachable in production (every scanned path carries an extension), but the
  // `Map` that makes it impossible is a deliberate choice and this cell states it.
  assert.deepStrictEqual(verdict(occ('constructor', 1), {}), [
    'constructor: 1 nested traversal(s), NOT DECLARED (a file absent from the budget is held at ZERO)',
  ]);
});
