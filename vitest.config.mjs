// ═══════════════════════════════════════════════════════════════════════
// vitest — config. ⚠️ `.mjs` ON PURPOSE.
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ THE REPO STAYS CommonJS (`package.json` without `"type": "module"`), and
//    that WILL NOT CHANGE. Hooks are spawned on EVERY tool call of every
//    agent; Node's ESM loader is slower than `require`, and the plan already
//    measures "95% of latency = Node startup". Switching the SOURCES to ESM
//    would make every production action pay to speed up tests.
//    ⚠️ NEVER add `"type": "module"` to package.json.
//    Hence `.mjs` here: this file is ESM (Vite requires it), the rest is not.
//
// ⚠️ WHY VITEST AND NO LONGER node:test (15/07/2026):
//    node:test has no perTest plugin (tap-runner = coverage per FILE +
//    1 process/file/mutant) → we endured `commandRunner` →
//    `coverageAnalysis: off` forced → ONE NODE PROCESS RESTARTED PER MUTANT
//    (609 × ~440 ms = 4.5 min of pure startup; measured: 12 min locally,
//    4 min in CI). Official Stryker doc: "the command test runner comes
//    with a performance penalty… If possible, use one of the test runner
//    plugins". That was the DEGRADED mode, endured, never chosen.
//    The vitest runner ignores `coverageAnalysis`, forces `perTest`, and keeps
//    its workers alive = no more spawn per mutant.
//    ⚠️ Mutation runs on 100% of projects here ⇒ "node:test is enough without
//    mutation" NEVER applies: the runner MUST have a Stryker plugin.
// ═══════════════════════════════════════════════════════════════════════

import { defineConfig } from 'vitest/config';
import { classifySuites } from './vitest-projects.mjs';

// ⚠️ HISTORICAL EXCLUSIONS (75-min differential + fleet suites): they have
//    their own npm entry and must NEVER enter discovery.
const EXCLUDED = [ // basenames, compared by classifySuites before prefixing
  'file-differential.test.js',
  'hooks-fleet-gate.test.js',
  'deadline-vendor.test.js',
  'vendor-deadline.test.js',
  'deadline-load.test.js',
];
// 🛑 Classification **DERIVED FROM FILE CONTENT**, never a hand-written list:
//    a new suite that spawns lands in `integration` by itself, so the fast
//    loop CANNOT silently get heavier. Details and measurements:
//    `vitest-projects.mjs`.
const { unit, integration } = classifySuites(import.meta.dirname, EXCLUDED);

export default defineConfig({
  test: {
    // ⚠️ EXPLICIT target: only the deterministic + property suites. The
    //    standalone scripts (doctor/lock/config-gate/integration) keep their
    //    own npm entry — they spawn processes and are NOT mutated.
    // 🛑 TWO PROJECTS (NATIVE Vitest feature, official doc read 15/08/2026):
    //    `vitest run --project unit` = the edit loop (seconds) ·
    //    `vitest run` = EVERYTHING (CI, before any switchover). No proof
    //    removed, only staging in TIME. NEVER replace this with a 2nd config
    //    file sitting next to it: two truths that diverge.
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: unit,
          // ⚠️ SAFE **BECAUSE** the classification proved it: none of these
          //    suites spawns or mutates the environment. The condition set by
          //    the Vitest doc is therefore checked MECHANICALLY, not hoped for.
          isolate: false,
          pool: 'threads',
          // ⚠️ 5 s HERE, AND IT IS INTENDED (15/08/2026). The global 30 s exists
          //    for suites that SPAWN real processes (measured 27/07: a test
          //    launching 4 processes took 6,082 ms). This lane spawns NONE — the
          //    classification PROVES it. And "a timeout is a BOUND, not a wait":
          //    keeping 30 s here would make a stuck test that should fail in 5
          //    wait for 30. We take the SMALLEST still-correct bound, exactly
          //    where it is justified.
          testTimeout: 5000,
          hookTimeout: 5000,
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: integration,
          // ⚠️ 54 (15/08/2026) — CONCURRENCY **WITHIN** A FILE. These suites are
          //    not slow because they compute: they wait on PROCESS STARTUPS
          //    (~330 ms each, measured). `doc-inject.test.js` chains 34 of them
          //    SEQUENTIALLY ⇒ 50 s on its own while the cores sleep. Vitest
          //    already parallelizes FILES; here we parallelize the tests OF one
          //    file, which is SAFE because each has its own tmpdir and its own
          //    `CTXROUTE_STATE_DIR` (verified: no shared state).
          // 🛑 If one day an integration suite shares state between its tests,
          //    it will become FLAKY here — and a randomly-red test stops being
          //    read. The cure is then to ISOLATE ITS STATE, never to bring back
          //    sequential execution: the slowness would return for everyone.
          sequence: { concurrent: true },
        },
      },
    ],
    // 🛑 NO root-level `include` when `projects` exists: the root would create
    //    an IMPLICIT project that re-runs EVERYTHING (measured 15/08/2026 —
    //    `--project=unit` still launched all 68 files, and `doc-inject` then
    //    ran with `isolate: false`, which turned 3 tests RED).
    //    Discovery now lives ONLY inside the projects.
    // ⚠️ EXCLUDED from discovery: the differential (75 min, switchover gate
    //    only) and the fleet tests (they spawn the real hook fleet).
    //    Including them here would run them on every `vitest run` — and worse,
    //    Stryker would launch them PER MUTANT.
    exclude: [
      '**/node_modules/**',
      'test/file-differential.test.js',
      'test/hooks-fleet-gate.test.js',
      'test/deadline-vendor.test.js',
      'test/vendor-deadline.test.js',
      'test/deadline-load.test.js',
    ],
    // ⚠️ 30 s DELAY — NEVER LOWER IT (set 27/07/2026, MEASURED).
    //    The vitest default (5 s) produced repeated FALSE REDS on suites that
    //    SPAWN real processes (doc-inject, turn-count, fleet-hooks-path,
    //    pretool-differential): measured 6,082 ms for a test launching
    //    4 processes, and 4,992 ms for a GREEN one — we were deciding within
    //    8 ms of the wall. The test wasn't broken, the stopwatch was.
    //    ⚠️ WHY IT MATTERS: a randomly-red suite stops being read, and the day
    //    it reddens for a REAL reason, nobody believes it. This is the EXACT
    //    lesson already paid on `deadline.js` (threshold 2 s → 30 s):
    //    "a tight threshold silently kills legitimate work = worse than the
    //    zombie". Take the LARGEST value that still usefully bounds a real
    //    hang, never the smallest that "seems enough".
    testTimeout: 30000,
    hookTimeout: 30000,
    // ⚠️ Stryker manages ITS own parallel workers: the vitest runner forces
    //    single-thread on its side. Don't try to tune concurrency here to
    //    "speed things up" — Stryker overrides it.
    reporters: ['default'],
  },
});
