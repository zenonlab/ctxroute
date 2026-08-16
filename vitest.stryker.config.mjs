// ═══════════════════════════════════════════════════════════════════════
// vitest — config DEDICATED TO STRYKER (stryker.conf.json → vitest.configFile).
// ⚠️ Includes ONLY the DETERMINISTIC suites covering the mutated modules.
//    - NEVER the property tests (slow, non-deterministic: one flaky run
//      per mutant = a score that lies) — their invariant MUST have its
//      deterministic case in one of the suites below (cf lib-pure.md).
//    - NEVER the spawning suites (doctor/integration/lint-corpus/lock):
//      they do not cover the pure in-process modules; they would only
//      inflate the initial dry run.
// ⚠️ New mutated pure module ⇒ its deterministic suite is added HERE (and the
//    mutation-workflow-gate.test.js gate checks the mirror with mutation.yml).
// ═══════════════════════════════════════════════════════════════════════

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'test/harness-conformance.test.js',
      'test/deps-criticality-pure.test.js',
      'test/lib-pure.test.js',
      'test/canary.test.js',
      'test/leak-pure.test.js',
      'test/sources-file.test.js',
      // ⚠️ The judge of `language-spec.js` is the EXHAUSTIVE differential: a mutant
      //    of the spec must be killed by the confrontation with the engine. It is
      //    deterministic (total enumeration, zero randomness) — it belongs here.
      'test/spec-differential.test.js',
      'test/sources-tool.test.js',
      'test/sources-mcp.test.js',
      'test/sources-session.test.js',
      'test/sources-skill.test.js',
      'test/frontmatter.test.js',
      'test/loader.test.js',
      'test/lint.test.js',
      'test/collisions.test.js',
      'test/gate.test.js',
      'test/budget.test.js',
      'test/docfacts.test.js',
    ],
    exclude: ['**/node_modules/**'],
    // ⚠️ A BOUND, not a wait (the repo's testTimeout doctrine): the exhaustive
    //    differential (~409k cases, ~2 s cold) runs here UNDER Stryker
    //    INSTRUMENTATION with 3 concurrent runners — measured 16/08/2026:
    //    dry run > 5,000 ms ⇒ vitest's default wall hit, ENTIRE run aborted,
    //    intermittently (it had passed an hour earlier). No test is slowed
    //    down: only whatever exceeds the bound is tolerated up to it.
    testTimeout: 30000,
    reporters: ['default'],
  },
});
