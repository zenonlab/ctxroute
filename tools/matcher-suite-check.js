#!/usr/bin/env node
'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// matcher-suite-check.js — PRETEST: run the LINKED matcher's own suite
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ THE DEFECT THIS CLOSES: `@zenon-lab/personal-data-guard` (28 tests) is
//    the matcher `test/leak-gate.test.js` DEPENDS ON, consumed via a `file:`
//    devDependency — hence EDITABLE LOCALLY. Nothing in `npm test` ever ran
//    those 28 tests, so the matcher could be broken with zero red on the
//    consumer side. See the skill `personal-data-guard`, "KNOWN GAPS":
//    "Closing it = a `pretest` that runs the linked package's suite."
//
// ⚠️ WIRED AS `pretest` (npm lifecycle: fires automatically before `npm
//    test`, zero code elsewhere) — NOT inside `test/leak-gate.test.js`
//    itself, because vitest workers do not run ANOTHER package's suite
//    inside their own process, and shelling out from inside a test would
//    make that one test file responsible for a whole second runtime.
//
// 🛑 THREE-WAY CONTRACT, and only ONE of them may fail loudly:
//    ① sibling unresolvable (absent, renamed, clean clone/CI) ⇒ NAMED
//       degraded message on stderr, exit 0 — `npm test` MUST still run on a
//       fresh clone that never had the sibling folder.
//    ② sibling resolved but not `npm ci`'d (no vitest binary) ⇒ same
//       degrade, named — never a crash from a missing dependency.
//    ③ sibling resolved AND runnable ⇒ ITS exit code becomes OURS: a broken
//       matcher turns `npm test` red on THIS repo, with no manual step.
//
// ⚠️ NEVER print an absolute path here: this repo is PUBLIC and treats
//    itself as already public (see `docs/framework/leak.md`) — the resolved
//    sibling directory lives under the maintainer's real home. The named
//    messages below stay in the PACKAGE SPEC / relative vocabulary, never
//    the resolved absolute path.
//
// Override for tests only (mirrors `paths.js`'s convention: an env var
// reserved for the test suite, never read as an ambient production setting):
// CTXROUTE_MATCHER_PACKAGE_DIR replaces real node-resolution with a fixed
// directory, so the three branches above are provable without touching the
// real sibling package.

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const PACKAGE_SPEC = '@zenon-lab/personal-data-guard';

// Walking-up bound: PACKAGE_SPEC resolves to a nested file (its declared
// `exports` entry, e.g. `src/leak-pure.js`) — 1 or 2 directory levels above
// it holds `package.json`. 8 is a generous ceiling against a runaway loop,
// never a distance actually expected to be used.
const MAX_WALK_UP = 8;

/**
 * Resolves the sibling package's directory, or null if it cannot be found.
 * PURE with respect to its explicit inputs (env + injected fs/resolve
 * primitives), so the degrade/run decision below is testable without real
 * node resolution or a real disk.
 * 🛑 NEVER `require.resolve(spec + '/package.json')`: a package that
 *    declares `exports` (this sibling does) does not expose that subpath —
 *    `ERR_PACKAGE_PATH_NOT_EXPORTED`, measured. Resolve the package's real
 *    ENTRY (its declared `.` export) instead, then walk up to the nearest
 *    `package.json` whose own `name` matches — never assumed one level up.
 * @param {{ env: NodeJS.ProcessEnv, resolve: (spec: string) => string, dirname: (p: string) => string, join: (...p: string[]) => string, exists: (p: string) => boolean, readFile: (p: string) => string }} io
 * @returns {string|null}
 */
function resolvePackageDir(io) {
  const override = io.env.CTXROUTE_MATCHER_PACKAGE_DIR;
  if (override) return override;
  let entry;
  try {
    entry = io.resolve(PACKAGE_SPEC);
  } catch {
    return null;
  }
  let dir = io.dirname(entry);
  for (let i = 0; i < MAX_WALK_UP; i++) {
    const candidate = io.join(dir, 'package.json');
    if (io.exists(candidate)) {
      try {
        if (JSON.parse(io.readFile(candidate)).name === PACKAGE_SPEC) return dir;
      } catch {
        // A package.json that fails to parse is not OUR package.json —
        // keep walking, never treat a parse failure as a match.
      }
    }
    const parent = io.dirname(dir);
    if (parent === dir) break; // reached the filesystem root
    dir = parent;
  }
  return null;
}

/**
 * Decides what to do given a resolved (or absent) sibling directory.
 * PURE (takes an `exists` probe as an argument): the only judge of the
 * three-way contract above, and what the negative-check sabotages.
 * @param {string|null} dir
 * @param {(p: string) => boolean} exists
 * @returns {{ action: 'degrade', reason: string } | { action: 'run', dir: string, vitestEntry: string }}
 */
function decide(dir, exists) {
  if (!dir || !exists(dir)) {
    return { action: 'degrade', reason: `sibling package "${PACKAGE_SPEC}" is not resolvable (absent, or the linked folder was renamed/removed)` };
  }
  const vitestEntry = path.join(dir, 'node_modules', 'vitest', 'vitest.mjs');
  if (!exists(vitestEntry)) {
    return { action: 'degrade', reason: `sibling package "${PACKAGE_SPEC}" was found but has no installed vitest (run "npm ci" inside it)` };
  }
  return { action: 'run', dir, vitestEntry };
}

function degrade(reason) {
  process.stderr.write(`[matcher-suite-check] SKIPPED — ${reason}. The matcher's own tests did NOT run this pass.\n`);
  process.exit(0);
}

/* c8 ignore start -- process entry point, exercised by the .test.js via spawn, never by import */
if (require.main === module) {
  const io = {
    env: process.env,
    resolve: require.resolve,
    dirname: path.dirname,
    join: path.join,
    exists: fs.existsSync,
    readFile: (p) => fs.readFileSync(p, 'utf8'),
  };
  const outcome = decide(resolvePackageDir(io), fs.existsSync);
  if (outcome.action === 'degrade') {
    degrade(outcome.reason);
  } else {
    const result = spawnSync(process.execPath, [outcome.vitestEntry, 'run'], {
      cwd: outcome.dir,
      stdio: 'inherit',
    });
    if (result.error) {
      const code = /** @type {NodeJS.ErrnoException} */ (result.error).code;
      degrade(`could not spawn the sibling suite (${code || result.error.message})`);
    }
    process.exit(typeof result.status === 'number' ? result.status : 1);
  }
}
/* c8 ignore stop */

module.exports = { resolvePackageDir, decide, PACKAGE_SPEC };
