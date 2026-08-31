// ═══════════════════════════════════════════════════════════════════════
// state-entry-rebuild-pure.js — DETERMINISTIC suite (the Stryker target)
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ IMPORTED DIRECTLY, never through a re-export: the `perTest` coverage
//    mapping misses tests that reach a mutated module indirectly, and the
//    mutants then look "covered by other tests only" — phantom survivors.
//
// ⚠️ FIXTURES AS THUNKS, evaluated INSIDE the `test()` callback. A module-level
//    const calling the mutated code produces a STATIC mutant covered by no
//    test, hence an eternal survivor (42 false ones measured in this repo).
//
// ⚠️ EXPECTED MESSAGES ARE HARDCODED IN FULL, and copied from the source rather
//    than reconstructed from memory: an expectation that READS the module under
//    test proves `x === x`. The DETAIL of a refusal is contract, not decoration.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import {
  verdict, CLASSES, EXEMPT_FROM_JUSTIFICATION, NUMERIC_IMPACT_CLASS, MIN_WHY, MIN_IMPACT,
} from '../src/state-entry-rebuild-pure.js';

const occ = (file) => ({ file, line: 1, text: 'x[k] = { a: e.a + 1 }' });
const why = () => 'the replaced record carries nothing else: it is created two lines above and read nowhere in between';
const impact = () => 'loses `denied`, the anti-loop flag: a refusal repeats on the retry';

test('an EMPTY scan against an EMPTY budget is silent (the shipped state)', () => {
  assert.deepStrictEqual(verdict([], {}), []);
});

test('a file ABSENT from the budget is held at ZERO', () => {
  assert.deepStrictEqual(verdict([occ('src/a.js')], {}),
    ['src/a.js: 1 record(s) rebuilt by literal, NOT DECLARED (a file absent from the budget is held at ZERO)']);
});

test('the ratchet is an EQUALITY — measured ABOVE the declaration is RED', () => {
  const faults = verdict([occ('src/a.js'), occ('src/a.js')], { 'src/a.js': { max: 1, class: 'INHERITED_DEBT' } });
  assert.deepStrictEqual(faults,
    ['src/a.js: 2 rebuild(s) measured, 1 declared — RATCHET CROSSED: propagate the record (`{ ...entry, … }`), or prove the class']);
});

test('the ratchet is an EQUALITY — measured BELOW the declaration is RED too (stale, the ground gained gets taken back)', () => {
  const faults = verdict([occ('src/a.js')], { 'src/a.js': { max: 3, class: 'INHERITED_DEBT' } });
  assert.deepStrictEqual(faults, ['src/a.js: 1 rebuild(s) measured, 3 declared — stale ratchet, LOWER IT']);
});

test('an EXACT declaration is silent', () => {
  assert.deepStrictEqual(verdict([occ('src/a.js')], { 'src/a.js': { max: 1, class: 'INHERITED_DEBT' } }), []);
});

test('a DORMANT PERMIT is RED — an exemption that stopped being necessary must go red, never rot', () => {
  const faults = verdict([], { 'src/a.js': { max: 2, class: 'INHERITED_DEBT' } });
  assert.deepStrictEqual(faults, ['src/a.js: DECLARED but no rebuild left — remove the entry (dormant permit)']);
});

test('a class OUTSIDE the closed list is REFUSED, and the message names the whole list', () => {
  const faults = verdict([occ('src/a.js')], { 'src/a.js': { max: 1, class: 'probably-ok' } });
  // ⚠️ An unknown class is ALSO an instructed one (it is not the exempt class),
  //    so it owes a justification too — both faults, never one silencing the other.
  assert.deepStrictEqual(faults, [
    'src/a.js: class "probably-ok" REFUSED — only DERIVES_NOTHING | DEBT | INHERITED_DEBT. '
      + 'The class says what the replaced record still carries; it is not a label.',
    'src/a.js: instructed entry WITHOUT a justification (`why`, more than 60 characters) — '
      + 'write WHICH fields the replaced record carries and why none is lost.',
  ]);
});

test('an INSTRUCTED class owes a written justification', () => {
  const faults = verdict([occ('src/a.js')], { 'src/a.js': { max: 1, class: 'DERIVES_NOTHING' } });
  assert.deepStrictEqual(faults,
    ['src/a.js: instructed entry WITHOUT a justification (`why`, more than 60 characters) — '
      + 'write WHICH fields the replaced record carries and why none is lost.']);
});

test('a justification of EXACTLY the bound is still refused (the bound is strict)', () => {
  const short = 'x'.repeat(MIN_WHY);
  const faults = verdict([occ('src/a.js')], { 'src/a.js': { max: 1, class: 'DERIVES_NOTHING', why: short } });
  assert.ok(faults.some((f) => f.includes('WITHOUT a justification')));
  const long = 'x'.repeat(MIN_WHY + 1);
  assert.deepStrictEqual(verdict([occ('src/a.js')], { 'src/a.js': { max: 1, class: 'DERIVES_NOTHING', why: long } }), []);
});

test('a NON-STRING justification does not count as one', () => {
  const faults = verdict([occ('src/a.js')], { 'src/a.js': { max: 1, class: 'DERIVES_NOTHING', why: 12345 } });
  assert.ok(faults.some((f) => f.includes('WITHOUT a justification')));
});

test('DEBT owes a NUMERIC impact ON TOP of its justification', () => {
  const faults = verdict([occ('src/a.js')], { 'src/a.js': { max: 1, class: 'DEBT', why: why() } });
  assert.deepStrictEqual(faults,
    ['src/a.js: DEBT without a NUMERIC `impact` (at least 40 characters) — '
      + 'name the fields at risk and what their loss costs. A budget measures quantity, never gravity.']);
});

test('DEBT with both a why and an impact is silent, and the impact bound is inclusive', () => {
  assert.strictEqual(impact().length >= MIN_IMPACT, true);
  assert.deepStrictEqual(verdict([occ('src/a.js')], { 'src/a.js': { max: 1, class: 'DEBT', why: why(), impact: impact() } }), []);
  const tooShort = 'x'.repeat(MIN_IMPACT - 1);
  assert.ok(verdict([occ('src/a.js')], { 'src/a.js': { max: 1, class: 'DEBT', why: why(), impact: tooShort } })
    .some((f) => f.includes('without a NUMERIC `impact`')));
  // ⚠️ boundary strictly AT the bound: exactly MIN_IMPACT characters must be SILENT
  //    (the check is `< MIN_IMPACT`, never `<= MIN_IMPACT`) — without this case a
  //    mutant loosening `<` into `<=` survives, since every other fixture sits
  //    either well above or exactly one character below the bound.
  const exact = 'x'.repeat(MIN_IMPACT);
  assert.deepStrictEqual(
    verdict([occ('src/a.js')], { 'src/a.js': { max: 1, class: 'DEBT', why: why(), impact: exact } }),
    []);
});

test('INHERITED_DEBT is EXEMPT from justification, and only it', () => {
  assert.strictEqual(EXEMPT_FROM_JUSTIFICATION, 'INHERITED_DEBT');
  assert.deepStrictEqual(verdict([occ('src/a.js')], { 'src/a.js': { max: 1, class: 'INHERITED_DEBT' } }), []);
  assert.strictEqual(NUMERIC_IMPACT_CLASS, 'DEBT');
  // an INHERITED_DEBT is never asked for an impact either
  assert.deepStrictEqual(verdict([occ('src/b.js')], { 'src/b.js': { max: 1, class: 'INHERITED_DEBT' } }), []);
});

test('the closed list is exactly three classes, in that order', () => {
  assert.deepStrictEqual(CLASSES, ['DERIVES_NOTHING', 'DEBT', 'INHERITED_DEBT']);
});

test('an inherited key of Object.prototype is NOT read as a declaration (the fail-open trap)', () => {
  // ⚠️ Indexing a `JSON.parse` object with `constructor` yields a TRUTHY value,
  //    so an undeclared file would read as DECLARED and BOTH ratchet comparisons
  //    would be false ⇒ the gate goes SILENT on it. `Object.entries` walks OWN
  //    keys only, which removes the class by construction.
  const faults = verdict([occ('constructor')], {});
  assert.deepStrictEqual(faults,
    ['constructor: 1 record(s) rebuilt by literal, NOT DECLARED (a file absent from the budget is held at ZERO)']);
});

test('several faults on one file, and the output is SORTED (a message must not depend on disk order)', () => {
  const faults = verdict(
    [occ('src/z.js'), occ('src/a.js')],
    { 'src/a.js': { max: 1, class: 'nope' } });
  assert.deepStrictEqual(faults, [
    'src/a.js: class "nope" REFUSED — only DERIVES_NOTHING | DEBT | INHERITED_DEBT. '
      + 'The class says what the replaced record still carries; it is not a label.',
    'src/a.js: instructed entry WITHOUT a justification (`why`, more than 60 characters) — '
      + 'write WHICH fields the replaced record carries and why none is lost.',
    'src/z.js: 1 record(s) rebuilt by literal, NOT DECLARED (a file absent from the budget is held at ZERO)',
  ]);
});

test('HOMONYM paths are distinct keys — a basename would make the red non-actionable', () => {
  const faults = verdict([occ('src/a.js'), occ('test/a.js')], { 'src/a.js': { max: 1, class: 'INHERITED_DEBT' } });
  assert.deepStrictEqual(faults,
    ['test/a.js: 1 record(s) rebuilt by literal, NOT DECLARED (a file absent from the budget is held at ZERO)']);
});
