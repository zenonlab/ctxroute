// ═══════════════════════════════════════════════════════════════════════
// deploy — BEHAVIOURAL suite: the REAL `tools/deploy.js`, against a fake repo
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ RAISON D'ÊTRE: `src/deploy-pure.js` proves the DECISION in isolation (test/deploy-pure.test.js);
//    this suite proves the SHELL actually reads the right facts and executes that decision for
//    real — `git status --porcelain`, a real test suite exit code, real bytes copied to disk, and
//    a real re-run of `doctor.js --deployed`.
//
// ⚠️ NEVER against THIS real checkout: it spawns a throwaway `git init` repo in a tmpdir, with its
//    own controllable `test` script, so the negative cases (dirty tree, red suite) are DETERMINISTIC
//    regardless of this session's own working-tree state. `tools/deploy.js` and `tools/doctor.js`
//    both read `CTXROUTE_REPO_DIR` as a TEST-ONLY override (never an ambient production setting,
//    same convention as `paths.js`'s `CTXROUTE_CONFIG_PATH`) — that is what makes this possible: the
//    scan AND the final re-run of the judge both point at the fake repo, never the real one.
//
// ⚠️ SABOTAGE IS PRINTED BEFORE IT IS TRUSTED (same discipline as `test/doctor.test.js`'s case 13c):
//    a sabotage that silently fails to apply would leave the suite green and prove nothing.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const DEPLOY = path.join(import.meta.dirname, '..', 'tools', 'deploy.js');

function ok(name, cond) {
  test(name, () => { assert.ok(cond, name); });
}

function git(repoDir, args) {
  // 🛑 SCRUB THE WHOLE `GIT_*` FAMILY: this suite BUILDS a throwaway repository and
  //    commits into it, and an inherited `GIT_DIR`/`GIT_INDEX_FILE` BEATS `cwd` —
  //    a real trap file was once staged into the REAL repository this way, immune
  //    to three `--amend`. Nobody can enumerate what a future git version exports.
  // ⚠️ `env: env`, never the `{ env }` shorthand: the judge reads the explicit property.
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('GIT_')) delete env[k];
  return spawnSync('git', args, { cwd: repoDir, env: env, encoding: 'utf8' });
}

/**
 * A throwaway `git init` repo with ONE tracked file under `src/` and a controllable `test`
 * script — never `npm test` (that would run vitest recursively AND depend on this real repo's
 * own devDependencies being reachable from a tmpdir with no `node_modules`). `node -e
 * process.exit(N)` needs neither.
 */
function makeFakeRepo(testExitCode) {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-deploy-repo-'));
  fs.mkdirSync(path.join(repoDir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(repoDir, 'src', 'app.js'), 'module.exports = 1;\n');
  fs.writeFileSync(path.join(repoDir, 'package.json'), JSON.stringify({
    name: 'fake-repo', private: true,
    scripts: { test: `node -e process.exit(${testExitCode})` },
  }, null, 2));
  git(repoDir, ['init', '--quiet']);
  git(repoDir, ['config', 'user.email', 'test@example.com']);
  git(repoDir, ['config', 'user.name', 'test']);
  git(repoDir, ['add', '-A']);
  git(repoDir, ['commit', '--quiet', '-m', 'init']);
  return repoDir;
}

function runDeploy(repoDir, deployedDir) {
  const r = spawnSync(process.execPath, [DEPLOY, '--deployed', deployedDir], {
    cwd: repoDir,
    encoding: 'utf8',
    env: Object.assign({}, process.env, { CTXROUTE_REPO_DIR: repoDir }),
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

// ── Case 1 — a DIRTY working tree REFUSES, even before the suite result matters ──
{
  const repoDir = makeFakeRepo(0);
  const deployedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-deploy-target-'));
  try {
    console.log(`SABOTAGE: appended an UNCOMMITTED line to ${path.join(repoDir, 'src', 'app.js')}`);
    fs.appendFileSync(path.join(repoDir, 'src', 'app.js'), '// uncommitted\n');
    const r = runDeploy(repoDir, deployedDir);
    ok('dirty tree → deploy exits non-zero', r.status !== 0);
    ok('dirty tree → the refusal names the reason', r.stderr.includes('dirty-tree'));
    ok('dirty tree → the modified path is NAMED', r.stderr.includes('src/app.js') || r.stderr.includes('src\\app.js'));
    ok('dirty tree → NOTHING was copied (the target dir stays empty)',
      fs.readdirSync(deployedDir).length === 0);
  } finally {
    fs.rmSync(repoDir, { recursive: true, force: true });
    fs.rmSync(deployedDir, { recursive: true, force: true });
  }
}

// ── Case 2 — a RED suite REFUSES on an otherwise clean, matching tree ──
{
  const repoDir = makeFakeRepo(1); // `test` script exits 1
  const deployedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-deploy-target-'));
  try {
    const r = runDeploy(repoDir, deployedDir);
    ok('red suite → deploy exits non-zero', r.status !== 0);
    ok('red suite → the refusal names the reason', r.stderr.includes('red-suite'));
    ok('red suite → NOTHING was copied (the target dir stays empty)',
      fs.readdirSync(deployedDir).length === 0);
  } finally {
    fs.rmSync(repoDir, { recursive: true, force: true });
    fs.rmSync(deployedDir, { recursive: true, force: true });
  }
}

// ── Case 3 — a MATCHING deployed copy, clean tree, green suite ⇒ NOTHING is written ──
{
  const repoDir = makeFakeRepo(0);
  const deployedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-deploy-target-'));
  try {
    fs.mkdirSync(path.join(deployedDir, 'src'), { recursive: true });
    fs.copyFileSync(path.join(repoDir, 'src', 'app.js'), path.join(deployedDir, 'src', 'app.js'));
    const before = fs.statSync(path.join(deployedDir, 'src', 'app.js')).mtimeMs;
    const r = runDeploy(repoDir, deployedDir);
    ok('matching copy → deploy exits 0', r.status === 0);
    ok('matching copy → says nothing to copy', r.stdout.includes('nothing to copy'));
    ok('matching copy → the judge confirms 0 problem(s) at the end', r.stdout.includes('0 problem(s)'));
    ok('matching copy → the file was NOT rewritten (same mtime)',
      fs.statSync(path.join(deployedDir, 'src', 'app.js')).mtimeMs === before);
  } finally {
    fs.rmSync(repoDir, { recursive: true, force: true });
    fs.rmSync(deployedDir, { recursive: true, force: true });
  }
}

// ── Case 4 — a REAL drift, clean tree, green suite ⇒ the drifted file is COPIED ──
{
  const repoDir = makeFakeRepo(0);
  const deployedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-deploy-target-'));
  try {
    console.log(`SABOTAGE: deployed copy of src/app.js starts EMPTY (a real drift) in ${deployedDir}`);
    // deployedDir deliberately has no src/app.js at all — a missing file is drift, never silence.
    const r = runDeploy(repoDir, deployedDir);
    ok('real drift → deploy exits 0 (reconciled)', r.status === 0);
    ok('real drift → the copied path is announced', r.stdout.includes('copied src/app.js') || r.stdout.includes('copied src\\app.js'));
    ok('real drift → the judge confirms 0 problem(s) at the end', r.stdout.includes('0 problem(s)'));
    const copied = fs.readFileSync(path.join(deployedDir, 'src', 'app.js'), 'utf8');
    const original = fs.readFileSync(path.join(repoDir, 'src', 'app.js'), 'utf8');
    ok('real drift → the copied bytes are IDENTICAL to the working tree', copied === original);
  } finally {
    fs.rmSync(repoDir, { recursive: true, force: true });
    fs.rmSync(deployedDir, { recursive: true, force: true });
  }
}

// ── Case 5 — anti-vacuity floor: the scanned `src/` scope is never empty on a real fake repo ──
{
  const repoDir = makeFakeRepo(0);
  try {
    const ls = git(repoDir, ['ls-files', 'src']);
    ok('setup: git ls-files src reports a non-empty scope on the fake repo (anti-vacuity precondition)',
      ls.status === 0 && ls.stdout.trim().length > 0);
  } finally {
    fs.rmSync(repoDir, { recursive: true, force: true });
  }
}

// ── Case 6 — REQUIRED argument: no --deployed at all is a named refusal, never a silent no-op ──
{
  const repoDir = makeFakeRepo(0);
  try {
    const r = spawnSync(process.execPath, [DEPLOY], {
      cwd: repoDir, encoding: 'utf8',
      env: Object.assign({}, process.env, { CTXROUTE_REPO_DIR: repoDir }),
    });
    ok('no --deployed → deploy exits non-zero', r.status !== 0);
    ok('no --deployed → the refusal says REQUIRED', (r.stdout + r.stderr).includes('REQUIRED'));
  } finally {
    fs.rmSync(repoDir, { recursive: true, force: true });
  }
}
