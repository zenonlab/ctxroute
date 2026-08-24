// ═══════════════════════════════════════════════════════════════════════
// GATE — A MODEL MAY NOT SHARE CODE WITH WHAT IT JUDGES
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 THE CLASS THIS FILE MECHANISES. This repository owns INDEPENDENT MODELS whose only reason to
//    exist is to CONTRADICT the engine: `src/cadence-spec.js` (11,346 exhaustive cases against
//    `gate.js`) and `src/language-spec.js` (892,224 cases against the four sources). They are
//    written FROM THE INTENTION, never from the code they judge — and on 2026-08-23 it was found
//    that `cadence-spec.js` had copied the SHAPE of `gate.js`: both wrote
//    `{ seen: true, sinceLastCall: entry.sinceLastCall + 1 }`, the engine lost a flag and the
//    model lost the same flag. **The heaviest judge in the repository certified a production bug,
//    in silence, for weeks.** A model that copies its defendant cannot contradict it.
//
// 🔴 AND THE SYMPTOM WAS ALREADY WRITTEN DOWN: `jscpd` had reported those two loops as an 11-line
//    clone, the model's own comment mentioned it, and it was read as duplication noise. The trace
//    existed; nobody made the link. That is what a machine is for.
//
// 🛑 STRICT SEPARATION OF POWERS, DO NOT BLUR IT:
//      · `src/model-twin-pure.js` → `tokenize` + `sharedRuns` = DETECTION, with NO exemption;
//      · `model-twin-budget.json` = POLICY (admissible classes) and RATCHET (which runs, why);
//      · `src/model-twin-pure.js` → `verdict` = the CONFRONTATION, PURE hence MUTATED.
//    A verdict written in this file would be unverifiable: Stryker does not mutate test code, so
//    an inverted comparison here would stay green for ever.
//
// 📐 WHY NOT `jscpd`, WHICH THIS REPOSITORY ALREADY OWNS AND ALREADY RUNS AT 1 %. MEASURED
//    2026-08-23 on the seven derived pairs, with the 2026-08-23 defect restored in BOTH files and
//    without it — the numbers are IDENTICAL at every setting from 5 lines/50 tokens down to
//    1 line/10 tokens. jscpd has ZERO sensitivity to this class, for a structural reason: its
//    window is a LINE window and the defect is a 13-token EXPRESSION on a single line. Worse,
//    jscpd 5.0.12 emits NO file name in any reporter (`name: ""` in the JSON, line ranges only in
//    `consoleFull`), so a per-pair verdict cannot even name the pair that agreed. The signal is
//    the shared TOKEN RUN, and nothing in the toolbox measured it.
//
// ⚠️ ANTI-VACUITY (four layers, none replaces another): a FLOOR on the derivation (in the pure
//    module, so it is mutated), a WITNESS pair fabricated in the OS tmpdir whose detection is
//    REQUIRED, a DECOY pair that must yield nothing, and the INVERSE half — a permit that is no
//    longer needed must REDDEN, or dormant permits accumulate and the gate hollows out on its own.
//
// ⚠️ WITNESSES AND DECOYS LIVE IN THE OS TMPDIR, outside every production perimeter: a fabricated
//    file inside `src/` or `test/` would make the arbo, doc-coverage and english-only gates go red
//    AT RANDOM (vitest runs suites in parallel). A gate must never make another gate flaky.
//
// ⚠️ IN-MEMORY SABOTAGE ONLY — the verdict is a pure function of (findings, budget), so every
//    negative check runs on fabricated data. Never write into the working tree.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  CLASSES, MIN_WHY, isPure, tokenize, sharedRuns, pairKey, derivePairs, floorFaults, verdict,
} from '../src/model-twin-pure.js';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const budget = JSON.parse(fs.readFileSync(path.join(repo, 'model-twin-budget.json'), 'utf8'));
const stryker = JSON.parse(fs.readFileSync(path.join(repo, 'stryker.conf.json'), 'utf8'));

const HELP =
  '\n→ WAY OUT: REWRITE the model\'s statement in its OWN words — quantifiers, a partition, a table'
  + '\n   — never the engine\'s. If the two can only be written one way, the model has stopped being'
  + '\n   independent and its differential proves only that a copy agrees with itself.'
  + '\n🛑 NEVER declare a run just to make a push go through: that grants the model the right to be'
  + '\n   a twin, which is exactly the state that kept a production bug green for weeks.';

/**
 * Perimeter = the files TRACKED BY GIT. Derived, never listed.
 * 🛑 SCRUB THE WHOLE `GIT_*` FAMILY: git EXPORTS `GIT_DIR`/`GIT_INDEX_FILE` to every hook it runs,
 *    a child INHERITS them and they BEAT `cwd` — under a poisoned env this perimeter would be
 *    ANOTHER repository's, and a mute perimeter is indistinguishable from a clean one.
 */
function tracked() {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('GIT_')) delete env[k];
  // ⚠️ WRITTEN `env: env`, NOT the `{ env }` shorthand: `git-env-door-gate` reads the
  //    EXPLICIT property and reports a shorthand as "no env: option". It scrubs either way —
  //    the judge cannot see it and ACCUSES rather than allows. Paid twice on 2026-08-23.
  const out = execFileSync('git', ['ls-files'],
    { cwd: repo, env: env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  // ⚠️ ONE TRAVERSAL PER STATEMENT, never a chain: to the neighbouring quadratic rule,
  //    `a.map(f).filter(g)` is a traversal nested in a traversal — a judge must not be its own
  //    first defendant.
  const lines = out.split('\n');
  const trimmed = lines.map((s) => s.trim());
  const js = trimmed.filter((f) => /[.](js|mjs|cjs)$/.test(f));
  return js.filter((f) => fs.existsSync(path.join(repo, f)));
}

const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf8');

const RELATIVE_IMPORT = /(?:from\s+|require\(\s*)['"](\.[^'"]+)['"]/g;

/** Resolve a relative specifier the way node does for this repository (extension optional). */
function resolveFrom(fromFile, spec) {
  const joined = path.posix.join(path.posix.dirname(fromFile), spec);
  const norm = path.posix.normalize(joined);
  return /[.](js|mjs|cjs)$/.test(norm) ? norm : norm + '.js';
}

function importsOf(rel) {
  const text = read(rel);
  const out = [];
  RELATIVE_IMPORT.lastIndex = 0;
  let m = RELATIVE_IMPORT.exec(text);
  while (m) {
    out.push(resolveFrom(rel, m[1]));
    m = RELATIVE_IMPORT.exec(text);
  }
  return out;
}

/** The four measured facts the derivation consumes. */
function facts() {
  const files = tracked();
  const src = files.filter((f) => f.startsWith('src/'));
  const tests = files.filter((f) => f.startsWith('test/'));
  const production = files.filter((f) => f.startsWith('src/') || f.startsWith('tools/'));
  const pure = src.filter((f) => isPure(read(f)));
  const importedByProduction = [];
  for (const f of production) for (const spec of importsOf(f)) importedByProduction.push(spec);
  // ⚠️ ONE TRAVERSAL PER STATEMENT: to the neighbouring quadratic rule a chained
  //    `a.map(f).filter(g)` is a traversal nested in a traversal.
  const testImports = [];
  for (const f of tests) {
    const specs = importsOf(f);
    const fromSrc = specs.filter((s) => s.startsWith('src/'));
    testImports.push({ file: f, imports: fromSrc });
  }
  return { pure, mutated: stryker.mutate, importedByProduction, testImports };
}

/** Every shared run really measured, across every derived pair. */
function measure(pairs, minTokens) {
  const cache = new Map();
  const tokensOf = (rel) => {
    if (!cache.has(rel)) cache.set(rel, tokenize(read(rel)));
    return cache.get(rel);
  };
  const findings = [];
  for (const p of pairs) {
    const runs = sharedRuns(tokensOf(p.model), tokensOf(p.judged), minTokens);
    for (const r of runs) findings.push({ pair: pairKey(p.model, p.judged), ...r });
  }
  return findings;
}

const PAIRS = derivePairs(facts());
const FINDINGS = measure(PAIRS, budget.minTokens);

// ── ① THE GATE ──────────────────────────────────────────────────────────
test('GATE: every run of code shared by a model and its defendant is DECLARED', () => {
  const faults = verdict(FINDINGS, budget.pairs);
  assert.deepStrictEqual(faults, [],
    'MODEL-TWIN VIOLATION(S) (' + faults.length + '):\n  ' + faults.join('\n  ')
    + '\n\n🛑 A model that shares code with what it judges cannot contradict it — it only proves'
    + '\n   that a copy agrees with itself. That is how 11,346 exhaustive cases stayed GREEN on a'
    + '\n   production bug for weeks.'
    + HELP);
});

// ── ② ANTI-VACUITY: THE DERIVATION REALLY MEASURED SOMETHING ────────────
test('ANTI-VACUITY: the derivation finds the models, and the pairs are the ones declared', () => {
  assert.deepStrictEqual(floorFaults(PAIRS), [],
    'the derivation came back below its floor — it would certify instead of protecting');
  // ⚠️ A FLOOR MEASURES A QUANTITY, NEVER AN IDENTITY. The budget's keys and the derived pairs
  //    must be the SAME SET: a pair that silently leaves the derivation (a model that becomes
  //    importable from production, a suite that stops confronting it) would take its findings
  //    with it and the gate would go green on a pair nobody looks at any more.
  const derivedKeys = PAIRS.map((p) => pairKey(p.model, p.judged));
  const derived = derivedKeys.sort();
  const declaredPairs = Object.keys(budget.pairs).sort();
  assert.deepStrictEqual(derived, declaredPairs,
    'the derived pairs and the declared pairs disagree — one of the two is stale');
});

// ── ③ ANTI-VACUITY: THE DETECTOR REALLY DETECTS ─────────────────────────
test('WITNESS: a fabricated twin IS detected, and a fabricated stranger is NOT', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'model-twin-'));
  // ⚠️ THE WITNESS IS THE REAL FORM ENCOUNTERED, not a textbook case: the very statement that
  //    2026-08-23 found duplicated in `gate.js` and `cadence-spec.js`.
  const shared = 'next[doc] = { seen: true, sinceLastCall: entry.sinceLastCall + 1, turn: turnCount };';
  const engine = 'function decide(state) {\n  const entry = state.a;\n  ' + shared + '\n  return next;\n}\n';
  const model = 'function modelDecide(state) {\n  const entry = state.a;\n  ' + shared + '\n  return next;\n}\n';
  // ⚠️ THE DECOY SHARES THE SUBJECT AND NOT THE CODE — same identifiers, different statements.
  //    Without it, a detector that returned EVERYTHING would pass the witness cell.
  const stranger = 'function other(state) {\n  const entry = state.a;\n  if (!entry) return 0;\n  return entry.turn;\n}\n';
  // ⚠️ AND A THIRD CELL, because comments are the bulk of this repository: two files carrying the
  //    SAME long comment must be invisible. A detector that read prose would drown in it.
  const prose = '// ' + shared + ' ' + shared + ' ' + shared + '\nconst z = 1;\n';

  fs.writeFileSync(path.join(dir, 'engine.js'), engine);
  const T = (s) => tokenize(s);
  const hit = sharedRuns(T(engine), T(model), budget.minTokens);
  assert.ok(hit.length >= 1,
    'THE DETECTOR IS MUTE: a fabricated twin carrying the real 2026-08-23 statement was not found'
    + ' — a green from a mute detector is indistinguishable from a green repository');
  assert.ok(hit[0].text.includes('sinceLastCall'),
    'the detector found something, but not the witness run: ' + hit[0].text);

  assert.deepStrictEqual(sharedRuns(T(engine), T(stranger), budget.minTokens), [],
    'THE DETECTOR RETURNS TOO MUCH: two files that merely share a SUBJECT were reported as twins');
  assert.deepStrictEqual(sharedRuns(T(engine), T(prose), budget.minTokens), [],
    'THE DETECTOR READS COMMENTS: prose is not shared code, and this repository is mostly prose');
  fs.rmSync(dir, { recursive: true, force: true });
});

// ── ④ THE INVERSE HALF ──────────────────────────────────────────────────
test('INVERSE: an undeclared run reddens, and a permit that is no longer needed reddens too', () => {
  const pair = pairKey('src/m.js', 'src/e.js');
  const run = { pair, tokens: 20, text: 'a b c', aLine: 1, bLine: 2 };
  assert.deepStrictEqual(verdict([run], { [pair]: { shared: [{ text: 'a b c', class: 'INHERITED_TWIN' }] } }), [],
    'a declared run must be tolerated, or the gate is unsatisfiable and gets unplugged');
  assert.ok(verdict([run], {}).length === 1, 'an UNDECLARED shared run must redden');
  // 🛑 THE HALF THAT ROTS IF NOBODY WATCHES IT. An exemption that stops being necessary must
  //    redden, otherwise permits pile up until the budget tolerates a twin nobody remembers.
  const dormant = verdict([], { [pair]: { shared: [{ text: 'a b c', class: 'INHERITED_TWIN' }] } });
  assert.ok(dormant.length === 1 && dormant[0].startsWith('DORMANT PERMIT'),
    'a permit whose run has disappeared must redden: ' + JSON.stringify(dormant));
});

// ── ⑤ THE POLICY DESCRIBES WHAT THE VERDICT DECIDES ─────────────────────
test('POLICY: the manifest documents the classes the gate admits, and only those', () => {
  assert.deepStrictEqual(budget.classes.slice().sort(), CLASSES.slice().sort(),
    'the manifest documents classes the gate does not admit (or the reverse)');
  // ⚠️ A `CONTRACT` run is an ACT OF INSTRUCTION and owes a sentence; `INHERITED_TWIN` is the
  //    measurement of the day and is exempt ON PURPOSE — demanding a sentence per run would
  //    produce INVENTED ones, and a false justification makes a case look settled.
  const pair = pairKey('src/m.js', 'src/e.js');
  const run = { pair, tokens: 20, text: 'a b c', aLine: 1, bLine: 2 };
  const short = verdict([run], { [pair]: { shared: [{ text: 'a b c', class: 'CONTRACT', why: 'because' }] } });
  assert.ok(short.length === 1 && short[0].includes(String(MIN_WHY)),
    'a CONTRACT run with a token justification must redden: ' + JSON.stringify(short));
  const unknown = verdict([run], { [pair]: { shared: [{ text: 'a b c', class: 'SMALL' }] } });
  assert.ok(unknown.length === 1 && unknown[0].startsWith('UNKNOWN CLASS'),
    'an invented class must redden: ' + JSON.stringify(unknown));
});

// ── ⑥ THE THRESHOLD IS A MEASUREMENT, AND IT STAYS ONE ──────────────────
test('THRESHOLD: the declared minimum is the one that was measured, and it is a ratchet', () => {
  // 📐 CHOSEN BY MEASUREMENT 2026-08-23 and written in the budget's `_doc_min`: 12 tokens is the
  //    largest window that still CONTAINS the 13-token statement of the 2026-08-23 defect, and at
  //    that window ten control pairs of ENGINE files (which share a subject but judge nothing)
  //    produced only 3 runs of harness boilerplate.
  // 🛑 RAISING IT IS HOW THIS GATE WOULD BE DISARMED WITHOUT A SINGLE RED: at 14 the defect's own
  //    statement stops being visible, at 18 three quarters of today's twins vanish. The number is
  //    therefore asserted HARDCODED here, never read back from the file it guards.
  assert.strictEqual(budget.minTokens, 12,
    'the threshold moved: re-measure the control pairs and the defect run BEFORE changing it');
});
