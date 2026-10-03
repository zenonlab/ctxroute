#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// DEPLOY — reconciles the deployed copy FROM the working tree
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 RAISON D'ÊTRE: `tools/doctor.js --deployed <dir>` already SAYS whether the copy serving
//    production diverges from this repository (`deployedDriftVerdict`). It never RECONCILES —
//    that gap is manual toil (read the drift, copy the files by hand), and manual toil is
//    exactly what this project exists to eliminate.
//
// 🛑 THIS TOOL DECIDES NOTHING. Every branch (refuse / do nothing / copy) is decided by
//    `src/deploy-pure.js`, a PURE module — this shell only MEASURES three facts (`git status
//    --porcelain`, the fast test suite's exit code, the deployed-drift verdict), calls the
//    decision, and EXECUTES it (copy bytes, exit code, re-run the judge). A decision written
//    here would sit outside Stryker's reach — the exact defect `doctor-wiring-pure.js` already
//    explains at length.
//
// ⚠️ SCOPE = `src/` ONLY, same as `doctor.js --deployed` (the scan is the SAME module,
//    `src/deployed-scan.js`, shared by both tools — one reading, one truth). Deploying anything
//    outside `src/`, remote deployment, rollback, and `settings.json` wiring are OUT OF SCOPE.
//
// ⚠️ REFUSES on a dirty working tree (what would be copied is not what was tested) or a RED test
//    suite — a deploy never ships bytes the suite itself refuses to vouch for. An UNMEASURED
//    drift verdict refuses too: "I could not measure" is never "it is healthy".
//
// ⚠️ ENDS BY RE-RUNNING THE JUDGE: after a successful reconciliation (or when nothing needed
//    copying), it re-invokes `doctor.js --deployed <dir>` and requires it to exit 0. A copy that
//    leaves the judge red is a copy that did not actually reconcile anything.
//
// Usage:
//   node tools/deploy.js --deployed C:/absolute/path/to/ctxroute-release
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const wiringPure = require('../src/doctor-wiring-pure');
const deployedScan = require('../src/deployed-scan');
const deployPure = require('../src/deploy-pure');

function fail(message) {
  process.stderr.write(`ctxroute deploy REFUSED: ${message}\n`);
  process.exitCode = 1;
}

// ⚠️ `spawnSync('npm', …)` CANNOT run without `shell: true` on Windows (MEASURED 2026-09-03: ENOENT
//    on the bare name, EINVAL on the resolved `.cmd` shim — a known Node limitation on `.cmd`/`.bat`
//    files). `shell: true` is FORBIDDEN FOR ALL LAYERS here (`layers.json`), so this resolves the
//    package.json `scripts.test` command's FIRST word to the real JS entry point declared by that
//    package's OWN `bin` field (e.g. `vitest` → `node_modules/vitest/vitest.mjs`) and runs it with
//    `node` DIRECTLY — the same "call the tool by its path, never by its name" rule the mutation
//    doctrine already applies to Stryker. Never re-introduce `shell: true` to "fix" this.
function resolveNodeBin(repoDir, name) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoDir, 'node_modules', name, 'package.json'), 'utf8'));
    let bin = pkg.bin;
    if (bin && typeof bin === 'object') bin = bin[name] || Object.values(bin)[0];
    if (typeof bin !== 'string') return null;
    return path.join(repoDir, 'node_modules', name, bin);
  } catch { return null; }
}

/**
 * Runs the SAME command `npm test` would run, read from `package.json`'s `scripts.test` — never
 * hardcoded here, so it stays in sync with the repo's own definition of "the fast test suite" by
 * construction. Returns `{ran: false}` if no `test` script exists at all (never a crash).
 * @param {string} repoDir
 * @returns {{ran: boolean, ok: boolean}}
 */
function runFastSuite(repoDir) {
  let scriptsTest;
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoDir, 'package.json'), 'utf8'));
    scriptsTest = pkg && pkg.scripts && pkg.scripts.test;
  } catch { /* stays undefined */ }
  if (typeof scriptsTest !== 'string' || scriptsTest.trim() === '') return { ran: false, ok: false };
  const parts = scriptsTest.trim().split(/\s+/).filter(Boolean);
  const [name, ...rest] = parts;
  const bin = resolveNodeBin(repoDir, name);
  const res = bin
    ? spawnSync(process.execPath, [bin, ...rest], { cwd: repoDir, stdio: 'inherit' })
    // Not a locally installed package binary (e.g. `node` itself, or a plain script) — spawnable
    // directly, no shell needed: only `.cmd`/`.bat` shims require one, and those are always
    // resolved through the branch above.
    : spawnSync(name, rest, { cwd: repoDir, stdio: 'inherit' });
  return { ran: true, ok: res.status === 0 };
}

function main() {
  // ⚠️ TEST-ONLY OVERRIDE, SAME env var as `tools/doctor.js` (mirrors paths.js's convention):
  //    reserved for the behavioural test suite, never read as an ambient production setting.
  //    Both this scan and the re-run of `doctor.js` below inherit it, so a test can point the
  //    WHOLE reconciliation at a throwaway fake repo instead of this real checkout.
  const repoDir = process.env.CTXROUTE_REPO_DIR || path.join(__dirname, '..');

  // ── 1. the `--deployed` argument — REQUIRED here (unlike the doctor's opt-in flag). ──
  let deployedDir;
  try {
    deployedDir = wiringPure.deployedArgument({ argv: process.argv, isAbsolute: path.isAbsolute });
  } catch (e) {
    fail(e.message);
    return;
  }
  if (deployedDir === undefined) {
    fail(`the launch argument "${wiringPure.DEPLOYED_FLAG}" is REQUIRED here (unlike the doctor's `
      + 'opt-in flag, a deploy with nothing to deploy TO is meaningless). '
      + `Usage: node tools/deploy.js ${wiringPure.DEPLOYED_FLAG} C:/absolute/path/to/ctxroute-release`);
    return;
  }
  let deployedIsDir = false;
  try { deployedIsDir = fs.statSync(deployedDir).isDirectory(); } catch { /* stays false */ }
  if (!deployedIsDir) {
    fail(`${wiringPure.DEPLOYED_FLAG} points at a directory that does not exist (or is not a `
      + `directory): ${deployedDir} — nothing was compared, nothing was copied.`);
    return;
  }

  // ── 2. git status --porcelain — the WORKING TREE cleanliness, measured, never inferred. ──
  // 🛑 SCRUB THE WHOLE `GIT_*` FAMILY — an inherited `GIT_DIR`/`GIT_INDEX_FILE`
  //    BEATS `cwd`, so this cleanliness check would describe ANOTHER repository
  //    and answer "clean" about a tree nobody is deploying. That answer is what
  //    authorises the copy, which makes it the worst place in this tool to be
  //    wrong. Nobody can enumerate what a future git version exports.
  // ⚠️ `env: env`, never the `{ env }` shorthand: the judge reads the explicit property.
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('GIT_')) delete env[k];
  const status = spawnSync('git', ['status', '--porcelain'], { cwd: repoDir, env: env, encoding: 'utf8' });
  if (status.status !== 0 || typeof status.stdout !== 'string') {
    fail(`git status failed in ${repoDir}: `
      + `${(status.stderr || '').trim() || (status.error && status.error.message) || 'unknown error'}.`);
    return;
  }
  // ⚠️ Written as TWO separate statements, never chained: a `.split().filter()` chain reads as a
  //    NESTED traversal in the AST even though the real cost is linear (one bounded pass).
  const statusLines = status.stdout.split('\n');
  const dirtyPaths = statusLines.filter((line) => line.trim().length > 0);

  // ── 3. the fast test suite — the SAME command `npm test` runs, read from package.json. ──
  process.stdout.write('ctxroute deploy: running the fast test suite (npm test)...\n');
  const suite = runFastSuite(repoDir);
  if (!suite.ran) {
    fail(`${repoDir} has no "test" script in package.json — nothing to vouch for a deploy with.`);
    return;
  }
  const suiteOk = suite.ok;

  // ── 4. the deployed-drift scan — the SAME reading `doctor.js --deployed` uses. ──
  const scanned = deployedScan.scan(repoDir, deployedDir);
  // ⚠️ `scanned.ok === false`, NEVER `!scanned.ok` — see the SAME comment in `tools/doctor.js`.
  if (scanned.ok === false) {
    fail(`git ls-files (the AUTHORITY for the src/ scope) failed in ${repoDir}: ${scanned.error}.`);
    return;
  }
  const verdict = wiringPure.deployedDriftVerdict(scanned.entries);

  // ── 5. the DECISION — entirely inside the pure module. ──
  const plan = deployPure.planDeploy({ dirtyPaths, suiteOk, verdict });

  if (plan.action === 'refuse') {
    fail(`${plan.reason} — ${plan.detail}`);
    return;
  }

  if (plan.action === 'nothing') {
    process.stdout.write('ctxroute deploy: the deployed copy already matches the working tree — nothing to copy.\n');
  } else {
    // plan.action === 'copy'
    for (const relPath of plan.paths) {
      const from = path.join(repoDir, relPath);
      const to = path.join(deployedDir, relPath);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
      process.stdout.write(`ctxroute deploy: copied ${relPath}\n`);
    }
    process.stdout.write(`ctxroute deploy: reconciled ${plan.paths.length} file(s).\n`);
  }

  // ── 6. RE-RUN THE JUDGE — a deploy that leaves the judge red did not reconcile anything. ──
  process.stdout.write('ctxroute deploy: re-running the judge (doctor.js --deployed)...\n');
  const doctorPath = path.join(__dirname, 'doctor.js');
  const recheck = spawnSync(process.execPath, [doctorPath, '--deployed', deployedDir], {
    cwd: repoDir, encoding: 'utf8',
  });
  process.stdout.write(recheck.stdout || '');
  process.stderr.write(recheck.stderr || '');
  if (recheck.status !== 0) {
    fail('the judge is NOT green after reconciliation — see its output above. '
      + 'Deployment did not converge.');
    return;
  }
  process.stdout.write('ctxroute deploy: done — the judge confirms 0 problem(s).\n');
}

main();
