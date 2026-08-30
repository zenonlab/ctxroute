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
import { CI_STEPS } from '../src/ci-steps-pure.js';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const WF = path.join(RACINE, '.github', 'workflows', 'mutation.yml');
const STRYKER = path.join(RACINE, 'stryker.conf.json');
const VITEST_STRYKER = path.join(RACINE, 'vitest.stryker.config.mjs');

const yml = fs.readFileSync(WF, 'utf8');
const conf = JSON.parse(fs.readFileSync(STRYKER, 'utf8'));
const vitestStryker = fs.readFileSync(VITEST_STRYKER, 'utf8');

// Extracts the `- 'x'` entries of the `paths:` block (up to the next key).
function workflowPaths() {
  const block = /\n\s*paths:\s*\n([\s\S]*?)\n\s{2}\w+:/.exec(yml);
  assert.ok(block, '`paths:` block not found in mutation.yml — has the filter disappeared?');
  return [...block[1].matchAll(/^\s*-\s*'([^']+)'/gm)].map((m) => m[1]);
}

// The suites really launched by Stryker = the `include` of the DEDICATED
// vitest config (vitest.stryker.config.mjs). Same dumb parsing doctrine:
// regex over the `'x.test.js'` literals, no dynamic ESM import to read 5 lines.
function runnerSuites() {
  return [...vitestStryker.matchAll(/'([^']+\.test\.js)'/g)].map((m) => m[1]);
}

test('GATE: every mutated module triggers the mutation workflow', () => {
  const paths = workflowPaths();
  assert.ok(Array.isArray(conf.mutate) && conf.mutate.length > 0, 'stryker `mutate` empty — the harness proves nothing');
  for (const f of conf.mutate) {
    assert.ok(paths.includes(f),
      `\`${f}\` is MUTATED by Stryker but absent from the \`paths:\` of mutation.yml:\n` +
      '      the job will NEVER fire when this file changes = coverage lost IN SILENCE.');
  }
});

test('GATE: every suite launched by Stryker triggers the workflow', () => {
  const paths = workflowPaths();
  const suites = runnerSuites();
  assert.ok(suites.length > 0, 'no suite found in `vitest.stryker.config.mjs` — the harness proves nothing');
  for (const s of suites) {
    assert.ok(paths.includes(s),
      `\`${s}\` is launched by Stryker but absent from the \`paths:\`: a change to this test\n` +
      '      could break the score without anybody seeing it.');
  }
});

// ═══════════════════════════════════════════════════════════════════════
// 🔴 A MUTATED MODULE NO SUITE *STATICALLY IMPORTS* IS MEASURED BY NOTHING
//    (2026-08-25) — and the two mirrors above could not see it.
//
//    They compare `stryker.conf.json` and `mutation.yml` TO EACH OTHER. Both
//    can agree perfectly while the module is reachable by NO suite the runner
//    actually launches. Two REAL instances, measured the same day:
//      ① `test/declared-paths-pure.test.js` pulled its module through
//         `createRequire(...)`. That edge does not exist in the ESM module
//         graph — the ONLY graph `vitest --related` walks — and the Stryker
//         vitest runner narrows every run to the suites RELATED to the mutated
//         files. Result: `stryker run --mutate src/declared-paths-pure.js` died
//         on `DryRunExecutor No tests were found` / `ConfigError: No tests were
//         executed`, 243 mutants instrumented, ZERO tests run, while the very
//         same config under plain vitest listed 1,280 green tests.
//      ② `src/foreign-identifier-pure.js` sat in `mutate` AND in `mutation.yml`
//         with its suite absent from `vitest.stryker.config.mjs` altogether —
//         mutated, and judged by suites that never touch it.
//    Both shipped SILENTLY: the per-file floor cannot redden on a module whose
//    mutants were never run, so the green measured nothing.
//
// ⚠️ DERIVED from `mutate`, never a hand list: a module added tomorrow enters
//    this net by itself and stays RED until a suite really imports it.
// ⚠️ The required edge is a STATIC `import ... from '<the module>'` inside a
//    suite the runner LAUNCHES. That is not a stylistic preference: it is the
//    only form vitest's related-graph and Stryker's perTest coverage mapping
//    both see. `createRequire`, dynamic `import()` and re-exports are all
//    invisible to one or the other.
// ═══════════════════════════════════════════════════════════════════════

// A STATIC ESM import of `moduleRelPath` inside `suiteBody` (any relative
// prefix — what matters is the module the specifier ends on).
function importsStatically(suiteBody, moduleRelPath) {
  const tail = moduleRelPath.replace(/^src\//, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp("from\\s+['\"][^'\"]*" + tail + "['\"]").test(suiteBody);
}

// 🛑 ONE STRING, NOT A LIST — and the reason is a nesting, not a taste. The
//    question every cell below asks is "does AT LEAST ONE suite import it?",
//    never "which one". Joining the bodies answers it with ONE traversal per
//    module instead of a scan of every suite inside a loop over every module.
//    EQUIVALENCE IS EXACT: `importsStatically` matches `from '<...>tail'` and
//    its `[^'"]*` cannot cross a quote, so a newline join can fabricate no
//    specifier that spans two files.
function suiteCorpus() {
  return runnerSuites().map((s) => fs.readFileSync(path.join(RACINE, s), 'utf8')).join('\n');
}

test('GATE: every mutated module is STATICALLY imported by a suite the runner launches', () => {
  const corpus = suiteCorpus();
  assert.ok(corpus.length > 0, 'no suite found in `vitest.stryker.config.mjs` — the harness proves nothing');
  assert.ok(conf.mutate.length > 0, 'stryker `mutate` empty — the harness proves nothing');
  for (const m of conf.mutate) {
    assert.ok(importsStatically(corpus, m),
      `\`${m}\` is MUTATED but NO suite of vitest.stryker.config.mjs STATICALLY imports it.\n` +
      '      Its mutants are measured by NOTHING and the per-file floor cannot redden.\n' +
      "      Fix at the cause: `import x from '../" + m + "'` in its deterministic suite\n" +
      '      (never `createRequire`, never a re-export), and list that suite in the runner config.');
  }
});

test('NEGATIVE-CHECK: the static-import gate really DETECTS a module no suite imports', () => {
  const corpus = suiteCorpus();
  // A module that exists nowhere: no suite can import it.
  const orphan = 'src/module-nobody-imports.js';
  assert.equal(importsStatically(corpus, orphan), false,
    'the detector claims a nonexistent module is imported — it is not reading the suites');
  // ...and the CONTROL: a module that IS imported must be seen, otherwise the
  // check above would pass by being blind rather than by being satisfied.
  assert.ok(importsStatically(corpus, 'src/lib-pure.js'),
    'the detector misses src/lib-pure.js — it is blind, so the gate certifies instead of protecting');
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
//
// ⚠️ MOVED 2026-08-29 (CLAUDE.md §Tests&CI, "the CI is ONE local command"):
//    `mutation.yml` no longer spells out `npx vitest run mutation-floor-gate
//    .test.js` — it calls `npm run ci:mutation`, and THAT single source is
//    `src/ci-steps-pure.js`. Reading the workflow TEXT for this literal would
//    now always fail, not because the floor stopped running, but because the
//    command moved to its single source (`test/ci-steps-gate.test.js` proves
//    the workflow calls nothing else). So this cell reads CI_STEPS instead —
//    it still fails the moment the floor step disappears from the `mutation`
//    group, wherever that group is executed.
test('GATE: the PER-FILE floor is run in the mutation job (where the report exists)', () => {
  const mutationSteps = CI_STEPS.filter((s) => s.group === 'mutation');
  const mutationCommands = mutationSteps.map((s) => s.command);
  assert.ok(mutationCommands.length > 0, 'CI_STEPS has no `mutation` group — the harness proves nothing');
  assert.ok(mutationCommands.some((c) => /mutation-floor-gate\.test\.js/.test(c)),
    'The `mutation` group of CI_STEPS does NOT run `mutation-floor-gate.test.js`.\n' +
    '      Without it, the PER-FILE floor is INERT: it is mute without a report,\n' +
    '      and the report only exists in this job. A module can then collapse\n' +
    '      under the AVERAGE of `thresholds.break` without anything going red (measured:\n' +
    '      docfacts.js at 81.19 % with 15 survivors, CI green).');
  // ⚠️ The old `if: always()` guaranteed the floor step still ran after a red
  //    on the GLOBAL threshold. `tools/ci.mjs` now plays that role STRUCTURALLY
  //    (it runs every step of a group to the end, never stopping at the first
  //    red — see `tools/ci.mjs`) — so the guarantee is re-checked on the
  //    RUNNER's source, not on a YAML flag that no longer exists.
  const runner = fs.readFileSync(path.join(RACINE, 'tools', 'ci.mjs'), 'utf8');
  assert.ok(/for \(const step of steps\)/.test(runner) && !/\bbreak\b/.test(runner),
    'tools/ci.mjs must run every step of a group to the end (no early stop):\n' +
    '      without that, a red on test:mutation would hide the PER-FILE verdict,\n' +
    '      the only one naming the culprit.');
});

// ⚠️ Without this, a `paths:` could cite a file DELETED long ago: the filter
//    would look complete while protecting a phantom.
test('GATE: no `paths:` targets a non-existent file', () => {
  for (const p of workflowPaths()) {
    assert.ok(fs.existsSync(path.join(RACINE, p)), `\`${p}\` is filtered in mutation.yml but does not exist.`);
  }
});

// ⚠️ The mutation config AND the deps MUST re-trigger: changing a threshold or
//    a Stryker version without re-running = a stale score that is treated as
//    authoritative.
test('GATE: the mutation config and the deps re-trigger the job', () => {
  const paths = workflowPaths();
  for (const f of ['stryker.conf.json', 'vitest.stryker.config.mjs', 'package.json', 'package-lock.json', '.github/workflows/mutation.yml']) {
    assert.ok(paths.includes(f), `\`${f}\` must re-trigger the mutation (otherwise a stale score becomes authoritative).`);
  }
});

// ⚠️ NEGATIVE-CHECK: a gate that cannot fail is worse than an absent one
//    (lesson of 15/07: a GREEN test exercising NOTHING, 7 occurrences). We
//    prove that the detection BITES, without ever touching the real files.
test('NEGATIVE-CHECK: the gate really DETECTS a module missing from the paths', () => {
  const paths = workflowPaths();
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
  for (const s of runnerSuites()) {
    const src = fs.readFileSync(path.join(RACINE, s), 'utf8');
    assert.ok(!/['"]node:test['"]/.test(src),
      `\`${s}\` imports node:test: BANNED (16/07/2026) — vitest only.`);
  }
});

test('NEGATIVE-CHECK: the `paths:` parser really reads the file', () => {
  const paths = workflowPaths();
  assert.ok(paths.length >= 10, `suspicious parsing: ${paths.length} paths read, expected >= 10`);
  assert.ok(paths.includes('src/lib-pure.js'), 'parsing broken: src/lib-pure.js should be filtered');
});
