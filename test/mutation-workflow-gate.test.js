// ═══════════════════════════════════════════════════════════════════════
// GATE — the mutation workflow MUST mirror stryker.conf.json
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ RAISON D'ÊTRE: GitHub Actions' `paths:` and Stryker's
//    `mutate`/`commandRunner` are TWO TRUTHS about one single question —
//    "which files justify re-running the mutation?". Without this gate,
//    adding a module to `mutate` while forgetting `paths:` gives: the module
//    is mutated, but the job NEVER fires when it changes ⇒ TOTAL and SILENT
//    loss of coverage, with a CI that stays green.
//
//    That is the exact bug class this whole repo fights (two sources drifting
//    without showing anything) — introducing it into the ANTI-drift gate
//    would be the ultimate irony. Placed in the SAME gesture as the workflow.
//
// ⚠️ DELIBERATELY NOT a pure test: it validates SHIPPED ARTEFACTS (like
//    config-gate.test.js), so it reads the real files, hardcoded, without
//    going through paths.js — it must stay blind to any environment override.
//    It is NOT in the Stryker runner (there is no decision to mutate).
//
// ⚠️ DELIBERATELY DUMB PARSING (regex on the `- 'x'` lines): depending on a
//    YAML parser to read our own workflow would add a dependency and a bug
//    surface to read 13 known lines. Same doctrine as the YAML subset of
//    frontmatter.js.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

import { test } from 'vitest';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const WF = path.join(RACINE, '.github', 'workflows', 'mutation.yml');
const STRYKER = path.join(RACINE, 'stryker.conf.json');
const VITEST_STRYKER = path.join(RACINE, 'vitest.stryker.config.mjs');

const yml = fs.readFileSync(WF, 'utf8');
const conf = JSON.parse(fs.readFileSync(STRYKER, 'utf8'));
const vitestStryker = fs.readFileSync(VITEST_STRYKER, 'utf8');

// Extracts the `- 'x'` entries of the `paths:` block (up to the next key).
function pathsDuWorkflow() {
  const block = /\n\s*paths:\s*\n([\s\S]*?)\n\s{2}\w+:/.exec(yml);
  assert.ok(block, '`paths:` block not found in mutation.yml — has the filter disappeared?');
  return [...block[1].matchAll(/^\s*-\s*'([^']+)'/gm)].map((m) => m[1]);
}

// The suites really launched by Stryker = the `include` of the DEDICATED
// vitest config (vitest.stryker.config.mjs). Same dumb parsing doctrine:
// regex over the `'x.test.js'` literals, no dynamic ESM import to read 5 lines.
function suitesDuRunner() {
  return [...vitestStryker.matchAll(/'([^']+\.test\.js)'/g)].map((m) => m[1]);
}

test('GATE: every mutated module triggers the mutation workflow', () => {
  const paths = pathsDuWorkflow();
  assert.ok(Array.isArray(conf.mutate) && conf.mutate.length > 0, 'stryker `mutate` empty — the harness proves nothing');
  for (const f of conf.mutate) {
    assert.ok(paths.includes(f),
      `\`${f}\` is MUTATED by Stryker but absent from the \`paths:\` of mutation.yml:\n` +
      '      the job will NEVER fire when this file changes = coverage lost IN SILENCE.');
  }
});

test('GATE: every suite launched by Stryker triggers the workflow', () => {
  const paths = pathsDuWorkflow();
  const suites = suitesDuRunner();
  assert.ok(suites.length > 0, 'no suite found in `vitest.stryker.config.mjs` — the harness proves nothing');
  for (const s of suites) {
    assert.ok(paths.includes(s),
      `\`${s}\` is launched by Stryker but absent from the \`paths:\`: a change to this test\n` +
      '      could break the score without anybody seeing it.');
  }
});

// ═══════════════════════════════════════════════════════════════════════
// 🔴 THE PER-FILE FLOOR MUST BE RUN IN THIS WORKFLOW (14/08/2026)
// ═══════════════════════════════════════════════════════════════════════
// `mutation-plancher-gate` is MUTE without `reports/mutation.json` — INTENDED
// locally. But the report exists ONLY in this job: elsewhere it was therefore
// INERT, and nobody could see it since its silence is legitimate.
// MEASURED that day: `docfacts.js` at 81.19 % with 15 survivors, CI GREEN,
// because `thresholds.break` is an AVERAGE (99.05 global).
// 🛑 The fix (one more step in the YAML) WAS PROTECTED BY NOTHING: removing it
//    would have made the floor inert AGAIN, in silence. Hence this part — the
//    fleet rule is to seal the class in the SAME gesture.
test('GATE: the PER-FILE floor is run in the mutation job (where the report exists)', () => {
  const yml = fs.readFileSync(path.join(import.meta.dirname, '..', '.github', 'workflows', 'mutation.yml'), 'utf8');
  assert.ok(/mutation-floor-gate\.test\.js/.test(yml),
    'The mutation job does NOT run `mutation-floor-gate.test.js`.\n' +
    '      Without it, the PER-FILE floor is INERT: it is mute without a report,\n' +
    '      and the report only exists in this job. A module can then collapse\n' +
    '      under the AVERAGE of `thresholds.break` without anything going red (measured:\n' +
    '      docfacts.js at 81.19 % with 15 survivors, CI green).');
  // ⚠️ `if: always()`: without it, a red on the GLOBAL threshold short-circuits
  //    the step and the PER-FILE verdict — the one that NAMES the offending
  //    module — disappears precisely when it is most useful.
  assert.ok(/if:\s*always\(\)/.test(yml),
    'The floor step must be `if: always()`: a red on the GLOBAL threshold\n' +
    '      would otherwise hide the PER-FILE verdict, the only one naming the culprit.');
});

// ⚠️ Without this, a `paths:` could cite a file DELETED long ago: the filter
//    would look complete while protecting a phantom.
test('GATE: no `paths:` targets a non-existent file', () => {
  for (const p of pathsDuWorkflow()) {
    assert.ok(fs.existsSync(path.join(RACINE, p)), `\`${p}\` is filtered in mutation.yml but does not exist.`);
  }
});

// ⚠️ The mutation config AND the deps MUST re-trigger: changing a threshold or
//    a Stryker version without re-running = a stale score that is treated as
//    authoritative.
test('GATE: the mutation config and the deps re-trigger the job', () => {
  const paths = pathsDuWorkflow();
  for (const f of ['stryker.conf.json', 'vitest.stryker.config.mjs', 'package.json', 'package-lock.json', '.github/workflows/mutation.yml']) {
    assert.ok(paths.includes(f), `\`${f}\` must re-trigger the mutation (otherwise a stale score becomes authoritative).`);
  }
});

// ⚠️ NEGATIVE-CHECK: a gate that cannot fail is worse than an absent one
//    (lesson of 15/07: a GREEN test exercising NOTHING, 7 occurrences). We
//    prove that the detection BITES, without ever touching the real files.
test('NEGATIVE-CHECK: the gate really DETECTS a module missing from the paths', () => {
  const paths = pathsDuWorkflow();
  const fakeOnes = [...conf.mutate, 'module-never-filtered.js'];
  const missingOnes = fakeOnes.filter((f) => !paths.includes(f));
  assert.deepStrictEqual(missingOnes, ['module-never-filtered.js'],
    'the gate does not detect a missing module: it proves NOTHING.');
});

// ⚠️ RUNNER ANTI-REGRESSION GATE (maintainer decision 16/07/2026, cf
//    stryker-runner-choice.md): node:test/commandRunner = the degraded mode
//    that cost 12 min PER RUN (1 Node process per mutant, coverage off).
//    Going back must be IMPOSSIBLE in silence — not a preference, a gate.
test('GATE: the Stryker runner is vitest, NEVER command/commandRunner', () => {
  assert.strictEqual(conf.testRunner, 'vitest',
    `testRunner="${conf.testRunner}": the degraded commandRunner mode is BANNED (12 min/run measured on 15/07/2026).`);
  assert.ok(!('commandRunner' in conf),
    '`commandRunner` key present in stryker.conf.json: a vestige of the degraded mode, to be deleted.');
  assert.strictEqual(conf.coverageAnalysis, 'perTest',
    'coverageAnalysis must stay "perTest": that is the WHOLE gain of the vitest runner (a mutant only re-runs the tests covering it).');
});

// ⚠️ The perTest gain requires GRANULAR test() calls: a return of node:test in
//    a Stryker suite (require/import of node:test) would recreate the banned debt.
test('GATE: no Stryker suite imports node:test', () => {
  for (const s of suitesDuRunner()) {
    const src = fs.readFileSync(path.join(RACINE, s), 'utf8');
    assert.ok(!/['"]node:test['"]/.test(src),
      `\`${s}\` imports node:test: BANNED (16/07/2026) — vitest only.`);
  }
});

test('NEGATIVE-CHECK: the `paths:` parser really reads the file', () => {
  const paths = pathsDuWorkflow();
  assert.ok(paths.length >= 10, `suspicious parsing: ${paths.length} paths read, expected >= 10`);
  assert.ok(paths.includes('src/lib-pure.js'), 'parsing broken: src/lib-pure.js should be filtered');
});
