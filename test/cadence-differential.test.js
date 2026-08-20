// ═══════════════════════════════════════════════════════════════════════
// cadence-differential.test.js — THE MODEL ⟷ THE ENGINE, ON THE CADENCE
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 WHY (19/08/2026): the twin of `spec-differential.test.js`, for the half of
//    the language that had no machine judge. Every other cadence test CALLS the
//    engine, so they prove what it DOES, never what it SHOULD DO — and the
//    cadence axis had already paid that twice, both times "accepted and inert"
//    (`enforce` not transported to the MCP channel, i.e. mute exactly where the
//    founding incident lives; then `defaults.mcp` short-circuited by a source
//    that FILLED a default). Both found by ARMING them for real, never by a test.
//
// 📐 METHOD, identical to the matching side: EXHAUSTIVE enumeration on a finite
//    domain — a proof, not a sample. Zero dependency; on a domain you can
//    exhaust, a `for` loop is strictly stronger than a solver.
// 🛑 NEVER reimplement `gate.js` here to "predict" the answers: we call the
//    source, period. And a divergence is NEVER silenced by "adjusting" the
//    model — you DECIDE which side is right and you write it down.
// ⚠️ THE DOMAIN MUST CARRY EVERY FORM OF THE CADENCE: the 4 cascade stages, the
//    INVALID values (they are what prove the total fallback), the two drift
//    units, the alternation flag, and the filter at BOTH stages. Removing one
//    makes a whole class unreachable — the lesson of the depth hole of 14/08.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert/strict';
import gate from '../src/gate.js';
import * as spec from '../src/cadence-spec.js';
import { KNOWN } from '../src/frontmatter.js';

// The owner sources of the real registry, plus `undefined` = the parity path
// (no `owners` passed at all, i.e. what every differential replays).
const SOURCES = ['file', 'mcp', 'skill', 'tool', undefined];

// ⚠️ EVERY LIST CARRIES AN INVALID VALUE, ON PURPOSE. The total fallback ("an
//    invalid value ignores itself and we go down") is a LOAD-BEARING promise: a
//    domain of valid values only would never test it.
const VALEURS = {
  mode: [undefined, 'dumb', 'once', 'smart', 'bogus'],
  threshold: [undefined, 0, 1, 3, 'x'],
  driftUnit: [undefined, 'tool', 'turn', 'x'],
  enforce: [undefined, true, false, 'x'],
};
const CLE_GLOBALE = { mode: 'mode', threshold: 'defaultThreshold', driftUnit: 'defaultDriftUnit', enforce: 'enforce' };

// ── ⓪ THE DOMAIN EXERCISES EVERY CADENCE KEY OF THE VOCABULARY ──────────
// 🔴 THE CLASS THIS CLOSES: on 19/08/2026 `keys` shipped into the vocabulary and into NO
//    judge — only PROSE said an operator must be taught to its models, and the operator
//    shipped outside anyway. A machine now refuses it, on BOTH halves of the language.
// ⚠️ DERIVED FROM `KNOWN` (the whole vocabulary), so a word added tomorrow lands here by
//    itself and stays RED until someone either exercises it or declares why it is not a
//    cadence key. Every exclusion below is a DECISION, never a convenience.
const HORS_CADENCE = {
  match: 'a TRIGGER: it selects, it does not schedule (spec-differential + triggers-gate)',
  mcp: 'corpus routing by PATH, consumed by no cadence resolver',
  rules: 'a TRIGGER in per-entry form (same judges as `match`)',
  tool: 'a TRIGGER on the tool name (same judges)',
  inject: 'disarms a doc upstream of any cadence — it never reaches `decide`',
  scope: 'a MATCHING filter — judged by spec-differential, on the other half',
  exclude: 'a MATCHING filter — same',
  keys: 'the MATCHING key universe — same',
  rank: 'an emission ORDER: it decides no delivery (loader.test.js)',
  note: 'the ONLY field the engine NEVER reads — an author comment, inert by contract',
};
// 🛑 BOUND DECLARED HERE, NOT RAISED GLOBALLY (2026-08-20). These tests ENUMERATE a domain, so
//    their cost follows the domain, not the machine. CI measured 6,232 ms against ~3,600 ms
//    locally and the 5 s wall of the fast lane BROKE — after having already been grazed at
//    4,992 ms. Raising the lane to 30 s would make 1,000 tests that should fail in 5 s wait for
//    30. A timeout is a BOUND, never a wait: it lengthens nothing, it only refuses what runs long.
//    ⚠️ Growing the domain is what moves this number — re-measure, never bump it to silence a red.

test('⓪ the DOMAIN exercises every CADENCE key of the vocabulary', () => {
  const exerces = new Set(Object.keys(VALEURS));
  assert.ok(exerces.size >= 3, `suspicious domain: only ${exerces.size} settings exercised`);
  const manquants = KNOWN.filter((k) => !(k in HORS_CADENCE) && !exerces.has(k));
  assert.deepStrictEqual(
    manquants, [],
    `cadence key(s) the exhaustive domain NEVER exercises: ${manquants.join(', ')} — this differential therefore measures a cadence that is not ours. Extend the domain, or declare the key in HORS_CADENCE WITH ITS REASON. Shipping a behaviour INCLUDES its judges.`,
  );
  // INVERSE CHECK: a justification that has become false must turn red too — the same
  // discipline as ASYMETRIES_JUSTIFIEES. An excluded key that the domain DOES exercise
  // means the reason is stale, and a stale reason is how a gate starts lying.
  const perimees = Object.keys(HORS_CADENCE).filter((k) => exerces.has(k));
  assert.deepStrictEqual(perimees, [], `STALE justification(s): ${perimees.join(', ')} are declared out of the cadence yet the domain exercises them.`);
});

// ── ① THE CASCADE, EXHAUSTIVELY, SETTING BY SETTING ─────────────────────
const RESOLVEURS = {
  mode: gate.modeForDoc,
  threshold: gate.thresholdForDoc,
  driftUnit: gate.driftUnitForDoc,
  enforce: gate.enforceForDoc,
};

test('CADENCE ⟷ ENGINE ①: the 4-stage cascade, EXHAUSTIVE on every setting', { timeout: 30000 }, () => {
  const divergences = [];
  let cas = 0;
  for (const reglage of Object.keys(RESOLVEURS)) {
    for (const entree of VALEURS[reglage]) {
      for (const categorie of VALEURS[reglage]) {
        for (const globale of VALEURS[reglage]) {
          for (const source of SOURCES) {
            const config = { [CLE_GLOBALE[reglage]]: globale };
            if (source) config.defaults = { [source]: { [reglage]: categorie } };
            const decl = { [reglage]: entree };
            const moteur = RESOLVEURS[reglage](config, decl, source);
            const modele = spec.resolve(reglage, config, decl, source);
            cas++;
            if (moteur !== modele) {
              divergences.push(`${reglage} entry=${JSON.stringify(entree)} defaults=${JSON.stringify(categorie)} global=${JSON.stringify(globale)} source=${source} engine=${JSON.stringify(moteur)} spec=${JSON.stringify(modele)}`);
            }
          }
        }
      }
    }
  }
  // ⚠️ ANTI-DORMANCY: an empty domain would go green while proving NOTHING — a
  //    defect this repo has paid for three times (deps-purity, deadline-gate,
  //    layers-gate). The count is DISPLAYED so it can be quoted, never guessed.
  assert.ok(cas >= 1000, `suspicious domain: ${cas} cases`);
  console.log(`  → cascade: ${cas} cases`);
  assert.deepStrictEqual(divergences.slice(0, 5), [],
    `${divergences.length} cascade divergence(s). DECIDE which side is right, never align the spec on the engine.`);
});

// ── ②③ DELIVERY AND DRIFT, THROUGH THE REAL `decide` ────────────────────
test('CADENCE ⟷ ENGINE ②③: delivery and drift, EXHAUSTIVE (both units)', { timeout: 30000 }, () => {
  const divergences = [];
  let cas = 0;
  for (const mode of spec.MODES) {
    for (const unite of spec.DRIFT_UNITS) {
      // ⚠️ FOUR thresholds, not three: the anti-dormancy floor below demands 300 cases and
      //    three gave 288. 🛑 The floor is NOT lowered to fit — a floor that yields to the
      //    domain stops being a floor. The DOMAIN widens.
      for (const seuil of [1, 2, 3, 4]) {
        for (const vu of [false, true]) {
          for (const derive of [0, 1, 2, 3]) {
            for (const turnCount of [0, 5]) {
              // The memory is built so the DRIFT is exactly `derive` in the doc's
              // own unit — that is what makes the two units comparable.
              const state = vu
                ? { a: { seen: true, sinceLastCall: unite === 'tool' ? derive : 0, turn: turnCount - (unite === 'turn' ? derive : 0) } }
                : {};
              const decls = { a: { mode, threshold: seuil, driftUnit: unite } };
              const args = [{}, decls, ['a'], state, turnCount, { a: 'file' }, 'Bash'];
              const m = gate.decide(...args);
              const s = spec.decide(...args);
              cas++;
              if (JSON.stringify(m) !== JSON.stringify(s)) {
                divergences.push(`mode=${mode} unit=${unite} seuil=${seuil} vu=${vu} derive=${derive} turn=${turnCount}\n    engine=${JSON.stringify(m)}\n    spec  =${JSON.stringify(s)}`);
              }
            }
          }
        }
      }
    }
  }
  assert.ok(cas >= 300, `suspicious domain: ${cas} cases`);
  console.log(`  → delivery/drift: ${cas} cases`);
  assert.deepStrictEqual(divergences.slice(0, 3), [],
    `${divergences.length} delivery divergence(s). DECIDE which side is right.`);
});

// ── ④⑤ THE WHOLE DECISION: memory, alternation, filter ──────────────────
// ⚠️ TWO docs are REQUIRED: `b` lives in the memory WITHOUT being selected, and
//    that is the only way to reach the "a gesture that ignored me makes me
//    drift" rule. With a single doc the whole clause is unreachable and the
//    differential would pass by vacuity.
const MEMOIRES = () => [
  {},
  { a: { seen: true, sinceLastCall: 0, turn: 0 } },
  { a: { seen: true, sinceLastCall: 2, turn: 0 } },
  { a: { seen: true, sinceLastCall: 0, turn: 0, denied: true } },
  { a: { seen: true, sinceLastCall: 0, turn: 0, denied: false } },
  { b: { seen: true, sinceLastCall: 1, turn: 0 } },
  { a: { seen: true, sinceLastCall: 1, turn: 0 }, b: { seen: true, sinceLastCall: 3, turn: 0 } },
];
const FILTRES = () => [
  {},
  { filterMode: 'blacklist', filterList: ['Bash'] },
  { filterMode: 'whitelist', filterList: ['Autre'] },
  { filterMode: 'blacklist', filterList: ['*'] },
  { filterMode: 'blacklist', filterList: ['stripe'] },
  { filterMode: 'bogus', filterList: ['Bash'] },
];

test('CADENCE ⟷ ENGINE ④⑤: memory, alternation and filter, EXHAUSTIVE', { timeout: 30000 }, () => {
  const divergences = [];
  let cas = 0;
  for (const mode of spec.MODES) {
    for (const enforce of [undefined, true, false]) {
      for (const unite of spec.DRIFT_UNITS) {
        for (const memoire of MEMOIRES()) {
          for (const filtre of FILTRES()) {
            for (const surCategorie of [false, true]) {
              for (const toolName of ['Bash', 'mcp__stripe__pay']) {
                for (const matched of [['a'], ['a', 'b'], []]) {
                  // The filter pair is placed at the GLOBAL stage or at the
                  // CATEGORY stage — the two must not be mixable, and the only
                  // way to prove it is to enumerate both.
                  const config = surCategorie ? { defaults: { file: { ...filtre } } } : { ...filtre };
                  const decls = {
                    a: { mode, threshold: 2, driftUnit: unite, enforce },
                    b: { mode: 'smart', threshold: 2, driftUnit: 'tool' },
                  };
                  const owners = { a: 'file', b: 'file' };
                  const args = [config, decls, matched, memoire, 3, owners, toolName];
                  const m = gate.decide(...args);
                  const s = spec.decide(...args);
                  cas++;
                  if (JSON.stringify(m) !== JSON.stringify(s)) {
                    divergences.push(`mode=${mode} enforce=${enforce} unit=${unite} tool=${toolName} matched=${JSON.stringify(matched)} filtre=${JSON.stringify(filtre)}@${surCategorie ? 'defaults' : 'global'} memoire=${JSON.stringify(memoire)}\n    engine=${JSON.stringify(m)}\n    spec  =${JSON.stringify(s)}`);
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  assert.ok(cas >= 3000, `suspicious domain: ${cas} cases`);
  console.log(`  → memory/alternation/filter: ${cas} cases`);
  assert.deepStrictEqual(divergences.slice(0, 3), [],
    `${divergences.length} decision divergence(s). DECIDE which side is right.`);
});

// ── NEGATIVE-CHECKS: a differential never seen turning red proves nothing ──
test('NEGATIVE-CHECK: the differential DETECTS a false cadence semantics', () => {
  // Each sabotage is a REAL defect this repo has lived, or its exact mirror.
  const sabotages = [
    {
      nom: 'the cascade skips the `defaults.{source}` stage (defect ㊳: an INERT stage)',
      decide: (config, decls, matched, state, turn, owners, tool) => {
        const sansCategorie = { ...config, defaults: undefined };
        return spec.decide(sansCategorie, decls, matched, state, turn, owners, tool);
      },
      config: { defaults: { file: { mode: 'dumb' } } },
      decls: { a: {} },
    },
    {
      nom: 'the refusal no longer alternates (an infinite loop, the reason ⑤ exists)',
      decide: (config, decls, matched, state, turn, owners, tool) => {
        const r = spec.decide(config, decls, matched, state, turn, owners, tool);
        // it re-blocks even when the previous gesture was already refused
        return { ...r, decision: r.inject.length ? 'deny' : r.decision };
      },
      config: {},
      decls: { a: { mode: 'dumb', enforce: true } },
      state: { a: { seen: true, sinceLastCall: 0, turn: 0, denied: true } },
    },
    {
      nom: 'a filtered doc is RECALLED anyway (its drift would be erased in silence)',
      decide: (config, decls, matched, state, turn, owners, tool) => {
        const r = spec.decide(config, decls, matched, state, turn, owners, tool);
        return { ...r, filteredOut: [] };
      },
      config: { filterMode: 'blacklist', filterList: ['Bash'] },
      decls: { a: { mode: 'smart', threshold: 1 } },
      state: { a: { seen: true, sinceLastCall: 5, turn: 0 } },
    },
    {
      nom: 'an invalid value is TAKEN instead of ignored (the total fallback dies)',
      decide: (config, decls, matched, state, turn, owners, tool) => {
        const r = spec.decide(config, decls, matched, state, turn, owners, tool);
        return { ...r, decision: 'none', inject: [] };
      },
      config: { mode: 'bogus' },
      decls: { a: {} },
    },
  ];

  for (const s of sabotages) {
    const args = [s.config, s.decls, ['a'], s.state || {}, 3, { a: 'file' }, 'Bash'];
    const vrai = gate.decide(...args);
    const faux = s.decide(...args);
    assert.notStrictEqual(
      JSON.stringify(faux), JSON.stringify(vrai),
      `SABOTAGE UNDETECTED — "${s.nom}": the differential would have let this defect through, so it proves nothing about it.`,
    );
  }
});

test('NEGATIVE-CHECK: the model is NOT a copy — it decides on its own', () => {
  // 🛑 If the model merely delegated to the engine, every divergence would be
  //    impossible BY CONSTRUCTION and the three parts above would be theatre.
  //    We check that the model answers with the engine ABSENT from the equation:
  //    a pure resolution, computed here, on a case whose answer is known by hand.
  assert.strictEqual(spec.resolve('mode', {}, {}, 'skill'), 'once',
    'a skill defaults to `once` — project knowledge, not a guardrail');
  assert.strictEqual(spec.resolve('mode', { mode: 'dumb' }, {}, 'skill'), 'once',
    'a skill SKIPS the global stage — unifying would flip every skill at the first global mode');
  assert.strictEqual(spec.resolve('mode', { mode: 'dumb' }, {}, 'file'), 'dumb',
    'a doc DOES read the global stage');
  assert.strictEqual(spec.resolve('enforce', { enforce: true }, {}, 'file'), false,
    '`enforce` has NO global stage — a global refusal would reject the first action of every session');
  assert.strictEqual(spec.resolve('enforce', { defaults: { file: { enforce: true } } }, { enforce: false }, 'file'), false,
    'an explicit `false` is a VALUE: it is the only way to opt out of a category');
  assert.strictEqual(spec.resolve('threshold', {}, {}, 'file'), 4, 'framework threshold');
  assert.strictEqual(spec.livre('once', true, 99, 1), false, '`once` already seen: never again');
  assert.strictEqual(spec.livre('dumb', true, 0, 99), true, '`dumb` never consults memory');
  assert.strictEqual(spec.livre('smart', false, 0, 99), true, 'a first time is a first time, in every mode');
});
