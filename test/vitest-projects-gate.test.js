// ═══════════════════════════════════════════════════════════════════════
// vitest-projects-gate.test.js — THE FAST LANE CANNOT GET HEAVY AGAIN
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 BORN OF A RELAPSE, AND THAT IS THE POINT (15/08/2026). Test friction had
//    already been "fixed" in July — by an INSTRUCTION ("target the relevant
//    suite"). It held for a few sessions then gave way: the agent re-ran
//    **212 s** of full suite for a one-line fix, twice in a row. **An
//    instruction depends on vigilance, so it ends up giving way.** That is
//    the law of this repository, and it was verified on the agent itself.
//
// 🛑 WHAT THIS GATE PREVENTS, MECHANICALLY: that a HEAVY suite (process
//    spawn, `process.env` mutation) lands in the fast lane and makes it slow
//    **in silence**, session after session. The suite grows with every piece
//    of work (73 files) — without a bound, the friction comes back BY
//    CONSTRUCTION, exactly like a disk without eviction.
//
// 📐 INDUSTRY EQUIVALENT: Google's "test sizes" (small/medium/large), where
//    the size is DECLARED and **enforced by the machine** — a "small" test
//    touching the network FAILS. Here the classification is DERIVED from the
//    file content: nobody can pick the wrong box, nor forget.
//
// ⚠️ NO PROOF IS REMOVED: `vitest run` (without a filter) runs EVERYTHING — CI
//    and before any switchover. Only the editing loop is restricted. This is
//    staging in TIME (presubmit/postsubmit), never a removal.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { classifySuites, MARKERS } from '../vitest-projects.mjs';
import config from '../vitest.config.mjs';

const RACINE = path.join(import.meta.dirname, '..');
const projets = config.test.projects;
const parNom = Object.fromEntries(projets.map((p) => [p.test.name, p.test]));

test('⚙️ ANTI-DORMANCY — the classification really observes, and both lanes exist', () => {
  // 🛑 Without this part, a broken classifier would put EVERYTHING into `unit`
  //    and the gate would be GREEN while proving nothing — with
  //    `isolate: false` on suites with side effects, that is to say random
  //    false reds. A defect already paid for 3 times in this repository
  //    (deps-purete, deadline-gate, couches-gate).
  const { unit, integration } = classifySuites(RACINE, []);
  assert.ok(unit.length >= 20, `suspicious fast lane: ${unit.length} files`);
  assert.ok(integration.length >= 10, `suspicious heavy lane: ${integration.length} files`);
  assert.deepStrictEqual(unit.filter((f) => integration.includes(f)), [], 'a file cannot be in BOTH lanes');
});

test('⚙️ NO HEAVY suite in the fast lane (derived from the CONTENT, never from a list)', () => {
  const faults = [];
  for (const f of parNom.unit.include) {
    const src = fs.readFileSync(path.join(RACINE, f), 'utf8');
    if (MARKERS.SPAWN.test(src)) faults.push(`${f} → spawns a process`);
    if (MARKERS.GLOBAL_STATE.test(src)) faults.push(`${f} → mutates process.env/chdir`);
  }
  assert.deepStrictEqual(faults, [],
    'HEAVY suite in the fast lane: it would slow it down for every session to come, AND `isolate: false` would make it unstable.');
});

test('⚙️ `isolate: false` ONLY on the fast lane — its condition is PROVEN, not hoped for', () => {
  // ⚠️ Official Vitest doc (read on 15/08/2026): `isolate: false` is only safe
  //    for a project "that does not depend on side effects and cleans up its
  //    state". The previous test PROVES that condition on `unit`; here we check
  //    that the setting never spills over to the lane that does have side effects.
  // 🔴 MEASURED on 15/08/2026: when `doc-inject.test.js` ended up in the fast
  //    lane (because of a forgotten root `include`), 3 tests went RED.
  assert.strictEqual(parNom.unit.isolate, false, 'the fast lane loses its accelerator');
  assert.notStrictEqual(parNom.integration.isolate, false, 'ISOLATION DISABLED on suites with side effects: guaranteed false reds');
});

test('⚙️ NO ROOT `include` — otherwise an IMPLICIT project re-runs everything', () => {
  // 🔴 REAL BUG of 15/08/2026: with a root `include` AND `projects`,
  //    `--project=unit` still ran the **68** files (3 min 34 instead of 6 s) —
  //    the filter seemed "not to work". It did work: the root added its own
  //    lane. A setting that silently CANCELS a filter is worse than an absent
  //    setting.
  assert.ok(!('include' in config.test), 'a root `include` silently resurrects the slowness');
});

test('⚙️ THE HISTORICAL EXCLUSIONS stay out of BOTH lanes', () => {
  // ⚠️ Differential (75 min) and fleet suites: they have their own npm entry.
  //    Letting them into a lane would make them run on every run — and Stryker
  //    would launch them PER MUTANT.
  const lourdes = ['file-differential.test.js', 'hooks-fleet-gate.test.js', 'deadline-load.test.js', 'vendor-deadline.test.js', 'deadline-vendor.test.js'];
  const tout = [...parNom.unit.include, ...parNom.integration.include];
  assert.deepStrictEqual(lourdes.filter((f) => tout.includes(f)), []);
});
