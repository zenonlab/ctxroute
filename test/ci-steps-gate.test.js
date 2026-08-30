// ═══════════════════════════════════════════════════════════════════════
// GATE — "THE CI IS ONE LOCAL COMMAND, THE WORKFLOW CARRIES NO LOGIC"
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 CLAUDE.md §Tests&CI (2026-08-29). `src/ci-steps-pure.js` (CI_STEPS) is
//    the SINGLE source of what each group (unit/coupling/mutation/spec)
//    actually runs. This gate checks TWO directions:
//      ① the workflows call NOTHING but `npm ci` / `npm run ci` /
//         `npm run ci:<KNOWN group>` (a plain `npm test`, a third-party
//         command, an invented group = a NAMED divergence)
//      ② every group of `CI_STEPS` is really invoked by AT LEAST one job
//         (a job silently removed must not leave a group orphaned)
//
// ⚠️ SCOPE = exactly 3 workflows, DERIVED FROM THE DISK (`readdirSync` on
//    `.github/workflows/`), never a hand-written list: `service-units.yml`
//    is EXCLUDED BY NAME, with its reason (real systemd/launchd units on
//    Linux/macOS runners — a Windows station cannot prove them, and routing
//    them through the local command would fabricate a false green). A 4th
//    workflow added tomorrow enters this net BY ITSELF.
//
// ⚠️ ANTI-MUTE-PROBE: reading ZERO workflow must be RED, never green by
//    vacuity — a mis-resolved folder looks EXACTLY like a perfect wiring.
//
// ⚠️ DELIBERATELY NOT a pure test (like config-gate.test.js/
//    mutation-workflow-gate.test.js): it validates SHIPPED artefacts, reads
//    the real files hardcoded, blind to any environment override.
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CI_STEPS,
  knownGroups,
  runStepsOf,
  auditDivergence,
  unCalledGroups,
  missingCiAliases,
  ciPreconditions,
  divergenceMessage,
  unCalledGroupMessage,
  missingAliasMessage,
} from '../src/ci-steps-pure.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOWS_DIR = path.join(ROOT, '.github', 'workflows');

// ⚠️ NAMED EXCLUSION, WITH ITS REASON — never silent, never "the rest of the
//    list": service-units.yml installs REAL systemd/launchd services on
//    Linux AND macOS runners with real supervisors. A Windows station has no
//    way to prove that job, and folding it into `tools/ci.mjs` would either
//    fabricate a false green here (nothing actually runs) or require this
//    repo to depend on a Linux/macOS box just to run `npm run ci`. Left
//    entirely to GitHub Actions, on its own contract.
const OUT_OF_SCOPE = new Set(['service-units.yml']);

function scopedWorkflowFiles() {
  if (!existsSync(WORKFLOWS_DIR)) return [];
  // ⚠️ ONE TRAVERSAL PER STATEMENT (2026-08-30, quadratic-budget gate): a
  //    chained `.filter().filter().sort()` matches the nested-traversal rule
  //    (the receiver of each call is a descendant carrying the previous
  //    one) even though nothing here is quadratic — splitting removes the
  //    syntactic nesting without changing the result.
  const entries = readdirSync(WORKFLOWS_DIR);
  const ymlFiles = entries.filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
  const scoped = ymlFiles.filter((f) => !OUT_OF_SCOPE.has(f));
  return scoped.sort();
}

function readWorkflow(file) {
  return readFileSync(path.join(WORKFLOWS_DIR, file), 'utf8');
}

describe('gate: local CI — the workflows call NOTHING but `npm run ci`/`ci:<group>`', () => {
  const files = scopedWorkflowFiles();
  const texts = files.map(readWorkflow);
  const allSteps = texts.flatMap((t) => runStepsOf(t));

  it('scope is resolved: service-units.yml is excluded BY NAME, the rest is DERIVED from disk', () => {
    expect(existsSync(WORKFLOWS_DIR)).toBe(true);
    expect(files.length).toBeGreaterThan(0);
    expect(files).not.toContain('service-units.yml');
    // The 3 workflows this mission targets must all be present in scope.
    for (const f of ['test.yml', 'mutation.yml', 'spec-tlc.yml']) {
      expect(files).toContain(f);
    }
  });

  it('ANTI-MUTE-PROBE precondition: steps AND the canonical table are really read', () => {
    const issues = ciPreconditions({ workflowSteps: allSteps, canon: CI_STEPS });
    expect(issues, `⛔ ${issues.join('\n')}`).toEqual([]);
    expect(allSteps.length).toBeGreaterThan(1);
  });

  // ⚠️ NAMED FUNCTION, NOT AN INLINE CALLBACK (2026-08-30, quadratic-budget
  //    gate): `perFile.flatMap((...) => unknown.map(...))` was a nested
  //    traversal syntactically, even though both sides are bounded by this
  //    repo's OWN file (3 workflows, a handful of divergences each — never
  //    client volume). Extracting the inner `.map()` into its own function
  //    keeps the exact same messages without an inline traversal nested
  //    inside another.
  function messagesFor(f, unknown) {
    return unknown.map((u) => `${f}: ${divergenceMessage(u)}`);
  }

  it('⛔ DIRECTION ① — no workflow step escapes `npm ci`/`npm run ci[:group]`', () => {
    const perFile = files.map((f, i) => ({ f, unknown: auditDivergence(texts[i]) }));
    const refusal = perFile.flatMap(({ f, unknown }) => messagesFor(f, unknown)).join('\n');
    expect(refusal, `\n${refusal}\n`).toBe('');
  });

  it('⛔ DIRECTION ② — EVERY group of CI_STEPS is called by at least one job', () => {
    const missing = unCalledGroups(texts);
    const refusal = missing.map(unCalledGroupMessage).join('\n');
    expect(refusal, `\n${refusal}\n`).toBe('');
  });

  it('⛔ `npm run ci` and every `npm run ci:<group>` exist in the root package.json', () => {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const missing = missingCiAliases(pkg.scripts);
    const refusal = missing.map(missingAliasMessage).join('\n');
    expect(refusal, `\n${refusal}\n`).toBe('');
    expect(pkg.scripts.ci).toContain('tools/ci.mjs');
    expect(existsSync(path.join(ROOT, 'tools', 'ci.mjs'))).toBe(true);
  });

  it('knownGroups() is never empty (otherwise DIRECTION ② would be green by vacuity)', () => {
    expect(knownGroups().length).toBeGreaterThan(0);
  });

  // ═══════════════ SABOTAGE — in-memory only, real files restored ═════════════
  it('SABOTAGE ①: an unknown `run:` step added to a workflow ⇒ NAMED red divergence', () => {
    const sabotaged = texts[0] + '\n      - run: echo hello\n';
    const unknown = auditDivergence(sabotaged);
    expect(unknown.length, 'the sabotage did not TAKE: the gate does not see the parasite step').toBeGreaterThan(0);
    expect(unknown.some((u) => u.command === 'echo hello')).toBe(true);
    expect(divergenceMessage(unknown[0])).toContain('outside the local command');
  });

  it('SABOTAGE ②: a job stops calling `ci:coupling` ⇒ the group is reported ORPHANED', () => {
    const withoutCoupling = texts.map((t) => t.replace(/^\s*-\s*run:\s*npm run ci:coupling\s*$/m, ''));
    expect(withoutCoupling.join('\n')).not.toBe(texts.join('\n'));
    expect(unCalledGroups(withoutCoupling)).toContain('coupling');
  });

  it('SABOTAGE ③ ANTI-MUTE-PROBE: an EMPTY world is red, never green', () => {
    const issues = ciPreconditions({ workflowSteps: [], canon: [] });
    expect(issues.length).toBe(2);
    expect(issues.join(' ')).toContain('PRECONDITION');
  });
});
