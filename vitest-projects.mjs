// ═══════════════════════════════════════════════════════════════════════
// vitest-projects.mjs — THE SUITE CLASSIFICATION, **DERIVED FROM THE CODE**
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 WHY THIS FILE EXISTS (measured 15/08/2026, and it is a RELAPSE).
//    The full suite took **212 s** and the friction came back exactly where
//    it had been "fixed" in July — by an INSTRUCTION ("target the relevant
//    suite"). An instruction depends on vigilance, so it gives way; that is
//    the law of this repository and it just proved itself on the agent
//    itself. ⚠️ **Nothing bounded the growth**: the suite grows with every
//    work session (73 files), nobody watches — *monotonic growth = a dated
//    outage*, the disk doctrine applied to TIME.
//
// 📐 THE DECIDING MEASUREMENT: `import 274 s` for `tests 188 s`. **The cost
//    is environment startup, not assertions.** Official Vitest doc (read
//    15/08/2026, `vitest.dev/guide/improving-performance`):
//    `isolate: false` "disables the separate per-file environment" and
//    speeds things up significantly — **on the condition** that the project
//    "does not rely on side effects and cleans up its state".
//
// 🛑 THAT CONDITION IS WHAT DICTATES THE CLASSIFICATION, and it is DERIVED,
//    never hand-listed (a list is born stale at the next suite):
//      • a suite that **SPAWNS a process** (`spawnSync`, `execFile`, …) ⇒ it
//        writes real state, it is HEAVY and NON-ISOLABLE → `integration`;
//      • a suite that **MUTATES `process.env`/`chdir`** ⇒ without isolation,
//        its pollution would leak into other files → `integration`;
//      • everything else = PURE decision, no side effect (invariant already
//        guarded by dependency-cruiser) → `unit`, isolation disabled.
//
// ⚠️ INDUSTRY EQUIVALENT: Google's "test sizes" (small/medium/large), where
//    the size is DECLARED and **enforced by the machine** — a "small" test
//    that touches the network fails. Here the file's content decides, so
//    nobody can pick the wrong box.
//
// 🛑 NO PROOF IS REMOVED: `vitest run` without a filter launches EVERYTHING
//    (CI, before any switchover). Only the edit loop narrows — staging in
//    TIME (presubmit/postsubmit), never a deletion.
//
// ⚠️ Do NOT enable `experimental.fsModuleCache` (suggested by the same doc):
//    it persists the module graph ON DISK, it is `experimental`, and **its
//    growth is neither documented nor bounded**. Doctrine: everything that
//    writes declares a cap + eviction in the same move. Without a
//    measurement, no.
// ═══════════════════════════════════════════════════════════════════════

import fs from 'node:fs';
import path from 'node:path';

// ⚠️ Markers = WHAT MAKES A SUITE NON-ISOLABLE, not "what is slow".
//    The criterion is the CAUSE (side effect), never the symptom (duration):
//    a duration is measured after the fact, a cause is decided before.
const SPAWN = /spawnSync|execFileSync|execSync|child_process|spawn\(/;
const GLOBAL_STATE = /process\.env\.[A-Z_]+\s*=|delete process\.env|process\.chdir/;

/**
 * Classifies the folder's suites into `unit` / `integration`. PURE (read-only).
 * @returns {{ unit: string[], integration: string[] }}
 */
export function classifySuites(root, exclus) {
  const excludedSet = new Set(exclus || []);
  const unit = [];
  const integration = [];
  for (const f of fs.readdirSync(path.join(root, 'test'))) {
    if (!f.endsWith('.test.js') || excludedSet.has(f)) continue;
    const src = fs.readFileSync(path.join(root, 'test', f), 'utf8');
    (SPAWN.test(src) || GLOBAL_STATE.test(src) ? integration : unit).push('test/' + f);
  }
  return { unit, integration };
}

export const MARKERS = { SPAWN, GLOBAL_STATE };

// ⚠️ INSPECTION CLI (`npm run test:lanes`) — the classification is DERIVED,
//    hence invisible when reading an `include`. A third party must be able to
//    see, in ONE command, what runs in which lane, without launching a test
//    or reading this code.
//    🛑 It writes NOTHING and decides NOTHING: read-only, like any diagnostic.
// ⚠️ Comparison by RESOLVED path: on Windows, `import.meta.filename` and
//    `process.argv[1]` do not match byte-for-byte (separators/case) — the
//    guard stayed SILENT, and the command printed nothing. Measured 15/08.
if (path.resolve(process.argv[1] || '') === path.resolve(import.meta.filename)) {
  const { unit, integration } = classifySuites(import.meta.dirname, []);
  console.log(`\nFAST LANE   (npm test)          ${unit.length} suites — none spawns, none mutates the env`);
  console.log(`HEAVY LANE  (npm run test:int)   ${integration.length} suites — process spawn or global state\n`);
  for (const f of integration.sort()) console.log('  heavy: ' + f);
}
