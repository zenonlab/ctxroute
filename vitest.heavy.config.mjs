// ═══════════════════════════════════════════════════════════════════════
// vitest — config of the HEAVY suites, excluded from the default run.
// ⚠️ vitest ignores a file listed in `exclude` EVEN when named on the CLI —
//    hence this 2nd config: it is the ONLY way to run these suites without
//    letting them enter `vitest run` (and therefore Stryker).
// ⚠️ NEVER merge with vitest.config.mjs: Stryker launches the default
//    config; including these suites there = spawning them PER MUTANT (the
//    very bug we kill).
// ═══════════════════════════════════════════════════════════════════════

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'test/deadline-load.test.js',   // 24 simultaneous spawns, ~60 s
      'test/hooks-fleet-gate.test.js',   // reads the REAL ~/.claude/hooks fleet (read-only)
      'test/deadline-vendor.test.js',   // drift-test of the vendored copy
      'test/vendor-deadline.test.js',   // proof on a tmpdir copy (~min)
      'test/file-differential.test.js', // ~75 min — switchover gate only
    ],
    exclude: ['**/node_modules/**'],
    testTimeout: 6000000,
    // These suites spawn processes and read shared state (the real fleet):
    // cross-file parallelism would distort load and measurements.
    fileParallelism: false,
    reporters: ['default'],
  },
});
