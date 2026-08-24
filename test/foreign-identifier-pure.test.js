// ═══════════════════════════════════════════════════════════════════════
// THE DETERMINISTIC SUITE OF `src/foreign-identifier-pure.js` — Stryker's target
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️⚠️ WHY IT EXISTS SEPARATELY FROM `foreign-identifier-gate.test.js`. Stryker does NOT mutate
//    test code, so the gate's verdict had to leave the suite and become a PURE module. This file is
//    what MEASURES that module: without it the extraction would only have MOVED the unverifiable
//    rule, not removed it.
//
// ⚠️ IMPORTED DIRECTLY, never through a re-export: an indirection loses the `perTest` coverage
//    mapping and Stryker then runs every test for every mutant.
// ⚠️ FIXTURES AS THUNKS, never module-level constants: a value computed once at module load is a
//    STATIC mutant for `perTest` — 42 false survivors were measured in this repository that way.
// ⚠️ EXPECTED MESSAGES HARDCODED IN FULL, never rebuilt from the module's own constants: a test
//    that recomputes the sentence it checks passes whatever the sentence becomes.

import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  verdict, dictionaryFaults, isForeignLanguageDictionary,
  CLASSES, EXEMPT_FROM_JUSTIFICATION, NUMERIC_IMPACT_CLASS, ENGLISH_LOCALE, MIN_WHY, MIN_IMPACT,
} from '../src/foreign-identifier-pure.js';

const occ = (file) => ({ file, line: 1, identifier: 'verrou', word: 'verrou' });
const why = () => 'x'.repeat(MIN_WHY + 1);
const impact = () => 'y'.repeat(MIN_IMPACT);

test('an EMPTY scan against an EMPTY budget is silent', () => {
  assert.deepStrictEqual(verdict([], {}), []);
});

test('a file ABSENT from the budget is held at ZERO', () => {
  assert.deepStrictEqual(verdict([occ('src/a.js'), occ('src/a.js')], {}),
    ['src/a.js: 2 foreign identifier(s), NOT DECLARED (a file absent from the budget is held at ZERO)']);
});

test('the ratchet is an EQUALITY — measured ABOVE is RED', () => {
  assert.deepStrictEqual(
    verdict([occ('src/a.js'), occ('src/a.js')], { 'src/a.js': { max: 1, class: 'INHERITED_DEBT' } }),
    ['src/a.js: 2 foreign identifier(s) measured, 1 declared — RATCHET CROSSED: rename the identifier in English, or prove the class']);
});

test('the ratchet is an EQUALITY — measured BELOW is RED too (a stale declaration widens the budget for free)', () => {
  assert.deepStrictEqual(
    verdict([occ('src/a.js')], { 'src/a.js': { max: 3, class: 'INHERITED_DEBT' } }),
    ['src/a.js: 1 foreign identifier(s) measured, 3 declared — stale ratchet, LOWER IT']);
});

test('measured EXACTLY the declaration is silent', () => {
  assert.deepStrictEqual(
    verdict([occ('src/a.js'), occ('src/a.js')], { 'src/a.js': { max: 2, class: 'INHERITED_DEBT' } }), []);
});

test('a DORMANT PERMIT is RED — a declaration whose occurrences are gone', () => {
  assert.deepStrictEqual(verdict([], { 'src/a.js': { max: 1, class: 'INHERITED_DEBT' } }),
    ['src/a.js: DECLARED but no foreign identifier left — remove the entry (dormant permit)']);
});

test('an unknown class is REFUSED, and the message names the closed list', () => {
  const faults = verdict([occ('src/a.js')], { 'src/a.js': { max: 1, class: 'legacy', why: why() } });
  assert.deepStrictEqual(faults, ['src/a.js: class "legacy" REFUSED — only '
    + CLASSES.join(' | ')
    + '. The class says WHY a name that is not English may stay; it is not a label.']);
});

test('an INSTRUCTED class owes a justification longer than the bound — both sides of it', () => {
  const short = { max: 1, class: 'PROTOCOL_NAME', why: 'x'.repeat(MIN_WHY) };
  assert.ok(verdict([occ('src/a.js')], { 'src/a.js': short })
    .includes('src/a.js: instructed entry WITHOUT a justification (`why`, more than ' + MIN_WHY
      + ' characters) — name the contract that forbids the rename.'));
  const long = { max: 1, class: 'PROTOCOL_NAME', why: 'x'.repeat(MIN_WHY + 1) };
  assert.deepStrictEqual(verdict([occ('src/a.js')], { 'src/a.js': long }), []);
});

test('a NON-STRING justification is refused exactly like a missing one', () => {
  for (const bad of [undefined, null, 42, {}, ['x'.repeat(MIN_WHY + 1)]]) {
    const faults = verdict([occ('src/a.js')], { 'src/a.js': { max: 1, class: 'PROTOCOL_NAME', why: bad } });
    assert.strictEqual(faults.length, 1, String(bad) + ' passed as a justification');
  }
});

test('`INHERITED_DEBT` is EXEMPT from justification, and it is the ONLY exempt class', () => {
  assert.strictEqual(EXEMPT_FROM_JUSTIFICATION, 'INHERITED_DEBT');
  assert.deepStrictEqual(verdict([occ('src/a.js')], { 'src/a.js': { max: 1, class: 'INHERITED_DEBT' } }), []);
  for (const c of CLASSES) {
    if (c === EXEMPT_FROM_JUSTIFICATION) continue;
    assert.ok(verdict([occ('src/a.js')], { 'src/a.js': { max: 1, class: c } }).length > 0,
      'class ' + c + ' was let through without a justification');
  }
});

test('`DEBT` owes a NUMERIC impact ON TOP of its justification — both sides of the bound', () => {
  assert.strictEqual(NUMERIC_IMPACT_CLASS, 'DEBT');
  const tooShort = { max: 1, class: 'DEBT', why: why(), impact: 'y'.repeat(MIN_IMPACT - 1) };
  assert.deepStrictEqual(verdict([occ('src/a.js')], { 'src/a.js': tooShort }),
    ['src/a.js: DEBT without a NUMERIC `impact` (at least ' + MIN_IMPACT
      + ' characters) — say who reads that name and what its opacity costs. A budget measures quantity, never gravity.']);
  const ok = { max: 1, class: 'DEBT', why: why(), impact: impact() };
  assert.deepStrictEqual(verdict([occ('src/a.js')], { 'src/a.js': ok }), []);
});

test('a NON-STRING impact is refused exactly like a missing one', () => {
  for (const bad of [undefined, null, 7, {}]) {
    const faults = verdict([occ('src/a.js')], { 'src/a.js': { max: 1, class: 'DEBT', why: why(), impact: bad } });
    assert.strictEqual(faults.length, 1, String(bad) + ' passed as an impact');
  }
});

test('a key colliding with `Object.prototype` is NOT read as declared (fail-open trap)', () => {
  // ⚠️ `JSON.parse` returns a plain object, so `files['constructor']` is TRUTHY. Indexing instead
  //    of walking OWN keys would read an undeclared file as declared, both comparisons would be
  //    false, and the gate would go SILENT on it. A guard that fails OPEN is worse than no guard.
  assert.deepStrictEqual(verdict([occ('constructor')], {}),
    ['constructor: 1 foreign identifier(s), NOT DECLARED (a file absent from the budget is held at ZERO)']);
  assert.deepStrictEqual(verdict([occ('toString')], {}),
    ['toString: 1 foreign identifier(s), NOT DECLARED (a file absent from the budget is held at ZERO)']);
});

test('HOMONYM paths are counted SEPARATELY — a budget key is a path, never a basename', () => {
  const faults = verdict([occ('src/lint.js'), occ('tools/lint.js')], {});
  assert.strictEqual(faults.length, 2);
  assert.ok(faults[0].startsWith('src/lint.js'));
  assert.ok(faults[1].startsWith('tools/lint.js'));
});

test('the faults are SORTED — the message never depends on the scanner walk order', () => {
  const faults = verdict([occ('src/z.js'), occ('src/a.js'), occ('src/m.js')], {});
  assert.deepStrictEqual(faults.map((f) => f.split(':')[0]), ['src/a.js', 'src/m.js', 'src/z.js']);
});

test('SEVERAL defects on ONE declaration are all reported, never only the first', () => {
  // Three at once: the stale ratchet, the refused class, and the missing justification.
  const faults = verdict([occ('src/a.js')], { 'src/a.js': { max: 9, class: 'nope' } });
  assert.strictEqual(faults.length, 3);
});

// ── THE SEAL ON THE REFERENCE ────────────────────────────────────────────
const DICTS = () => ['en_us', 'softwareTerms', '[words]'];

test('the English-only configuration is SILENT (the control — without it the reds prove nothing)', () => {
  assert.deepStrictEqual(dictionaryFaults(DICTS(), DICTS(), ENGLISH_LOCALE, ['en_us']), []);
});

test('a SECOND LOCALE is REFUSED — it opens a whole language in one word', () => {
  assert.deepStrictEqual(dictionaryFaults(DICTS(), DICTS(), 'en,fr', ['en_us']),
    ['cspell.json `language` is "en,fr" — it must be exactly "en". A second locale opens that '
      + 'ENTIRE language in silence and the gate stops protecting.']);
});

test('a FOREIGN dictionary asked for by the config is REFUSED', () => {
  const faults = dictionaryFaults(DICTS(), DICTS(), ENGLISH_LOCALE, ['en_us', 'fr-fr']);
  assert.ok(faults.some((f) => f.includes('cspell.json `dictionaries` enables "fr-fr"')));
});

test('a FOREIGN dictionary LOADED without being asked for is REFUSED (inherited or global config)', () => {
  const faults = dictionaryFaults(DICTS().concat(['de-de']), DICTS().concat(['de-de']), ENGLISH_LOCALE, ['en_us']);
  assert.ok(faults.some((f) => f.includes('cspell LOADED "de-de"')));
});

test('the ACTIVE set is an EQUALITY — an undeclared dictionary is RED', () => {
  assert.deepStrictEqual(dictionaryFaults(DICTS().concat(['medical']), DICTS(), ENGLISH_LOCALE, ['en_us']),
    ['cspell LOADED an UNDECLARED dictionary "medical" — declare it in '
      + '`foreign-identifier-budget.json` after checking it carries no natural language but English.']);
});

test('the ACTIVE set is an EQUALITY — a STALE declaration is RED too', () => {
  assert.deepStrictEqual(dictionaryFaults(DICTS(), DICTS().concat(['gone']), ENGLISH_LOCALE, ['en_us']),
    ['the manifest declares dictionary "gone" which cspell does NOT load — stale declaration, '
      + 'remove it (a declaration nobody uses hides the set that is really in force).']);
});

test('the dictionary faults are SORTED', () => {
  const faults = dictionaryFaults(DICTS().concat(['zz-zz', 'aa-aa']), DICTS(), ENGLISH_LOCALE, ['en_us']);
  assert.deepStrictEqual(faults.slice().sort(), faults);
});

test('a natural language is recognised BY THE SHAPE of its name, English excepted', () => {
  // ⚠️ Not a list of forbidden locales — that would miss the one nobody anticipated, which is the
  //    very defect this whole gate exists to avoid, committed one level down.
  for (const foreign of ['fr', 'fr-fr', 'de_de', 'pt-br', 'es', 'ja', 'nl-nl']) {
    assert.strictEqual(isForeignLanguageDictionary(foreign), true, foreign + ' was not seen as foreign');
  }
  for (const english of ['en', 'en_us', 'en-gb', 'EN_US']) {
    assert.strictEqual(isForeignLanguageDictionary(english), false, english + ' was accused');
  }
  for (const technical of ['softwareTerms', 'aws', '[words]', 'coding-compound-terms', 'k8s', 'npm']) {
    assert.strictEqual(isForeignLanguageDictionary(technical), false, technical + ' was accused');
  }
});
