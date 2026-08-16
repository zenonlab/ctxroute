// ═══════════════════════════════════════════════════════════════════════
// SCOPE OF THE LANGUAGE — PROVEN BY EXHAUSTIVE ENUMERATION, not by reading
// ═══════════════════════════════════════════════════════════════════════
//
// 🛑 WHY THIS FILE EXISTS (12/08/2026). The skill promised for three
//    weeks: « OR+AND+NOT = functional completeness ⇒ ANY
//    condition is expressible ». It was FALSE, and nobody could see it:
//    the sentence was plausible, well written, and **nothing confronted it with the
//    engine**. A promise about the scope of a language is not re-read — it
//    is CALCULATED.
//
// ⚠️ METHOD: we enumerate ALL the possible declarations over a tiny
//    universe of atoms, we compute the truth table each one produces BY
//    CALLING THE REAL ENGINE (`sources/file.js::matchingDocs`), then we close
//    that set under UNION (several `rules` in a doc = OR). The result
//    is the EXACT set of expressible conditions. No deduction.
//
// 🛑 NEVER A REIMPLEMENTATION OF THE MATCHER HERE. If we recoded the semantics
//    to « predict » the tables, we would prove that our copy agrees
//    with itself. That is the mistake that cost a session on 31/07/2026
//    (3 home-made probes, 3 false verdicts). We call the source, full stop.
//
// ⚠️ 3 ATOMS ARE ENOUGH, and it is a REASONED choice: the thesis to refute is
//    « at most TWO positive conjunctions ». A counter-example with 3 is therefore the
//    smallest possible; widening the universe would cost exponentially without
//    proving anything more (2^(2^n) tables).
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import { matchingDocs } from '../src/sources/file.js';

const ATOMES = ['aaa', 'bbb', 'ccc'];
const N = ATOMES.length;
const NB_MONDES = 1 << N; // 8 payloads: each subset of present atoms

// A « world » = which atoms are present in the gesture. We place them in the
// PATH: it is the only place seen at once by `match` (the path), `scope`
// (all the params — the path is one of them) and `exclude` (since ㊼: all the
// params ∪ the context).
// ⇒ the 3 operators look at the SAME universe, so the comparison is fair.
// ⚠️ THIS CHOICE MAKES THE MEASUREMENT INSENSITIVE TO ㊼, AND THAT IS INTENDED: this harness measures
//    BOOLEAN EXPRESSIVENESS (which truth tables), not the universe of each
//    operator. Measured before AND after the fix: 120/256 in both cases.
//    What ㊼ brings (« unless ANOTHER param contains X ») is a widening
//    of the UNIVERSE — it is proven in `sources-file.property.test.js`, not here.
function payloadDuMonde(m) {
  const presents = ATOMES.filter((_, i) => m & (1 << i));
  return { toolName: 'Read', toolInput: { file_path: '/x/' + presents.join('/') + '/f.js' } };
}

// Truth table of a set of rules = a bitmask over the 8 worlds.
// ⚠️ Computed by the REAL engine.
function table(rules) {
  let t = 0;
  for (let m = 0; m < NB_MONDES; m++) {
    if (matchingDocs(rules, payloadDuMonde(m)).length > 0) t |= 1 << m;
  }
  return t;
}

const sousEnsembles = (xs) => {
  const out = [];
  for (let k = 0; k < 1 << xs.length; k++) out.push(xs.filter((_, i) => k & (1 << i)));
  return out;
};

// ALL the expressible rules: 1 pattern × every scope × every exclude.
function toutesLesRegles() {
  const out = [];
  for (const pattern of ATOMES) {
    for (const scope of sousEnsembles(ATOMES)) {
      for (const exclude of sousEnsembles(ATOMES)) {
        const r = { pattern, doc: 'd' };
        if (scope.length) r.scope = scope;
        if (exclude.length) r.exclude = exclude;
        out.push(r);
      }
    }
    // ⚠️ ㊺① — the GROUPED form of `scope` (AND of ORs). WITHOUT it, the enumeration
    //    CANNOT produce A ∧ B ∧ C and part ② would go green by
    //    proving only that the GENERATOR is incomplete. An enumeration
    //    that does not offer a form of the language MEASURES a scope that does not exist.
    const groupesPossibles = sousEnsembles(ATOMES).filter((g) => g.length > 0);
    for (const combi of sousEnsembles(groupesPossibles)) {
      if (combi.length === 0) continue;
      for (const exclude of sousEnsembles(ATOMES)) {
        const r = { pattern, doc: 'd', scope: combi };
        if (exclude.length) r.exclude = exclude;
        out.push(r);
      }
    }
  }
  return out;
}

// Closure under UNION: a doc can carry several `rules`, which unite as an OR.
// ⇒ the REACHABLE set is the closure of the elementary tables under the OR operator.
function atteignables() {
  const base = new Set(toutesLesRegles().map((r) => table([r])));
  const vus = new Set([0, ...base]); // 0 = the always-false condition (no rule)
  let file = [...vus];
  while (file.length) {
    const suivant = [];
    for (const t of file) {
      for (const b of base) {
        const u = t | b;
        if (!vus.has(u)) { vus.add(u); suivant.push(u); }
      }
    }
    file = suivant;
  }
  return vus;
}

// The INTENDED truth table, described extensionally (never through the engine).
function voulue(predicat) {
  let t = 0;
  for (let m = 0; m < NB_MONDES; m++) {
    const present = (i) => Boolean(m & (1 << i));
    if (predicat(present)) t |= 1 << m;
  }
  return t;
}

test('SCOPE ①: TWO positive conjunctions are expressible (A ∧ B)', () => {
  const atteint = atteignables();
  const cible = voulue((p) => p(0) && p(1));
  assert.ok(atteint.has(cible),
    'A ∧ B should be expressible — that is the scope announced by the skill.');
});

test('SCOPE ②: THREE positive conjunctions ARE EXPRESSIBLE (A ∧ B ∧ C) — ㊺① SHIPPED', () => {
  // 🔴 VERDICT INVERTED ON 14/08/2026, NOT DELETED — that is the protocol written in
  //    this file since 12/08 (« if the scope changes, we INVERT »). The test
  //    remains the ONLY thing that prevents a scope promise from coming back without
  //    proof: yesterday it proved an IMPOSSIBILITY, today a CAPABILITY.
  // ⚠️ What made it expressible: `scope: [["a"],["b"]]` = AND of ORs (㊺①),
  //    a FORM of the existing key — ZERO vocabulary word created.
  const atteint = atteignables();
  const cible = voulue((p) => p(0) && p(1) && p(2));
  assert.ok(atteint.has(cible),
    'A ∧ B ∧ C is NO LONGER expressible: ㊺① has regressed (the grouped form of `scope`).\n'
    + '   NEVER delete this test — invert it if the scope changes DELIBERATELY.');
});

test('SCOPE ③: the negation is indeed available (A ∧ ¬C)', () => {
  const atteint = atteignables();
  const cible = voulue((p) => p(0) && !p(2));
  assert.ok(atteint.has(cible), 'A ∧ ¬C should be expressible through `exclude`.');
});

test('SCOPE ⑤: EXACT CHARACTERISATION — the sayable = EVERYTHING that is false on the EMPTY gesture', () => {
  // 🔴 THIS IS THE ANSWER TO ㊻ (« prove the completeness, stop asserting it »), and
  //    it ARRIVED with ㊺① on 14/08/2026. A COUNT (128/256) says nothing:
  //    the CHARACTERISATION is needed, otherwise we do not know WHAT is missing.
  // ✅ MEASURED: the reachable set is EXACTLY { f | f(empty gesture) = false },
  //    0 missing and 0 extra. The language is therefore COMPLETE, up to ONE
  //    STRUCTURAL constraint: nothing is injected on a gesture that contains nothing.
  // 🛑 THAT CONSTRAINT IS INTENDED, NOT A HOLE — it is the project's load-bearing wall
  //    (« we only inject on FACTS », §3bis of the mental model). A language that
  //    could say « inject when NOTHING happens » would violate its reason for being.
  // ⚠️ This test replaces any SENTENCE about the scope: never again « we can do
  //    everything » without a machine behind it.
  const atteint = atteignables();
  const attendu = new Set();
  for (let t = 0; t < 1 << NB_MONDES; t++) if ((t & 1) === 0) attendu.add(t); // bit 0 = the empty world
  const manquants = [...attendu].filter((t) => !atteint.has(t));
  const enTrop = [...atteint].filter((t) => !attendu.has(t));
  assert.deepStrictEqual(manquants, [], 'conditions WITHOUT the empty gesture have become INEXPRESSIBLE: a scope regression');
  assert.deepStrictEqual(enTrop, [], 'a condition TRUE on the empty gesture has become expressible: the load-bearing wall « we only inject on facts » has fallen');
});

test('SCOPE ④: ANTI-DORMANCY — the enumeration really observes something', () => {
  // ⚠️ Without this part, an error that made the set EMPTY would turn ②
  //    green while proving NOTHING — the « gate that certifies instead of protecting ».
  const atteint = atteignables();
  assert.ok(atteint.size >= 8, `suspicious reachable set (${atteint.size})`);
  assert.ok(atteint.size < (1 << NB_MONDES),
    'ALL the tables are reachable: the language would be complete, which ② denies.');
  // The EXACT count is the measured fact; it is displayed so that it can be quoted, never guessed.
  console.log(`  → expressible conditions: ${atteint.size} out of ${1 << NB_MONDES} possible (3 atoms)`);
});
