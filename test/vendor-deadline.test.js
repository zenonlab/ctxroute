// ═══════════════════════════════════════════════════════════════════════
// PROOF BEFORE TOUCHING PROD — vendor-deadline.js on a tmpdir COPY
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ THESE HOOKS ARE IN PRODUCTION: other agents (Claude Code, Codex)
//    execute them on EVERY tool call, in parallel. A typo in
//    `protect-files.js` breaks their work live and burns real tokens.
//    Therefore: all the risk is absorbed HERE, on disposable COPIES. The patch
//    is applied for real ONLY if these tests are green. Same pattern as
//    `doctor.test.js` (sabotage on a copy, never on the shipped files).
//
// ⚠️ THE PROOF IS A REAL SPAWN, NEVER A CODE READ. "The require is
//    there" does not prove "the process dies". The only fact that counts:
//    this hook, with stdin never closed (= the real bug #68626), is it DEAD?
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PARC = path.join(os.homedir(), '.claude', 'hooks');
const present = fs.existsSync(PARC);
const skip = !present && 'no ~/.claude/hooks/ (fresh clone / other machine)';

// Copies the fleet into a disposable tmpdir. ⚠️ .js + .json files only:
// we test the patch, not the personal content (docs, secrets, state).
function clonerParc(avecDocs) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parc-test-'));
  for (const f of fs.readdirSync(PARC)) {
    const abs = path.join(PARC, f);
    if (!fs.statSync(abs).isFile()) continue;
    if (!/\.(js|json)$/.test(f)) continue;
    fs.copyFileSync(abs, path.join(dir, f));
  }
  // The hook suites sometimes read docs/ — copied only if requested.
  if (avecDocs && fs.existsSync(path.join(PARC, 'docs'))) {
    fs.cpSync(path.join(PARC, 'docs'), path.join(dir, 'docs'), { recursive: true });
  }
  return dir;
}

function patcher(dir, write) {
  return spawnSync(process.execPath, [path.join(__dirname, '..', 'src', 'vendor-deadline.js'), ...(write ? ['--write'] : [])], {
    env: { ...process.env, VENDOR_TARGET_DIR: dir },
    encoding: 'utf8',
  });
}

// Launches a hook WITHOUT ever closing its stdin = exact reproduction of the real bug.
function hookSurvit(fichier, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [fichier], { stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdout.on('data', () => {});
    child.stderr.on('data', () => {});
    const t = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({ mort: false });
    }, timeoutMs);
    child.on('exit', (code) => {
      clearTimeout(t);
      resolve({ mort: true, code });
    });
    // ⚠️ We write a plausible payload but we NEVER call end().
    try {
      child.stdin.write(JSON.stringify({ session_id: 'test', tool_name: 'Read', tool_input: {} }));
    } catch (e) {}
  });
}

// ⚠️ STRIPS a copy: removes the deadline to reconstitute the state BEFORE the patch.
//    MANDATORY — these tests MUST NOT assume that the fleet is bare. Since
//    the application of 15/07/2026 it no longer is, and 2 tests became FALSE
//    (they tested the state of the world, not the code). A test that depends on an
//    external state lies as soon as the world changes: it builds its own condition.
function stripBanner(dir) {
  fs.rmSync(path.join(dir, 'deadline.js'), { force: true });
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    const abs = path.join(dir, f);
    const src = fs.readFileSync(abs, 'utf8');
    if (!/require\(['"]\.\/deadline['"]\)/.test(src)) continue;
    const nu = src
      .split(/\r?\n/)
      .filter((l) => !/require\(['"]\.\/deadline['"]\)/.test(l) && !/^deadline\.arm\(\);?$/.test(l.trim()) && !/DEADLINE — NEVER remove/.test(l))
      .join('\n');
    fs.writeFileSync(abs, nu);
  }
  return dir;
}

test('DRY-RUN modifies NO file', { skip, timeout: 300000 }, () => {
  const dir = stripBanner(clonerParc());
  const avant = fs.readdirSync(dir).map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')]);
  const r = patcher(dir, false);
  assert.strictEqual(r.status, 0, r.stderr);
  for (const [f, contenu] of avant) {
    assert.strictEqual(fs.readFileSync(path.join(dir, f), 'utf8'), contenu, `dry-run modified ${f}`);
  }
  assert.ok(!fs.existsSync(path.join(dir, 'deadline.js')), 'dry-run copied deadline.js');
});

test('IDEMPOTENT — replaying never duplicates an arm()', { skip, timeout: 300000 }, () => {
  const dir = stripBanner(clonerParc());
  patcher(dir, true);
  const apres1 = fs.readFileSync(path.join(dir, 'statusline.js'), 'utf8');
  const r2 = patcher(dir, true);
  const apres2 = fs.readFileSync(path.join(dir, 'statusline.js'), 'utf8');
  assert.strictEqual(apres2, apres1, 'the 2nd pass re-modified the file');
  assert.match(r2.stdout, /to arm\s+: 0/, 'the 2nd pass still thinks it has to arm');
  assert.strictEqual((apres2.match(/deadline\.arm\(\)/g) || []).length, 1, 'duplicated arm()');
});

test('NO hook stays "manual" — the patch covers 100% of the fleet', { skip, timeout: 300000 }, () => {
  // ⚠️ SEALED REGRESSION (15/07/2026): the 1st insertion rule looked for
  //    "after the last leading require" and missed `browser-recover.js`
  //    (no require: it reads process.stdin directly) → 6 armed out of 7.
  //    A fleet covered at 86% leaves a zombie possible: that is a failure, not a detail.
  //
  // ⚠️ stripBanner() MANDATORY: without it, we would clone an ALREADY armed fleet → "0 to
  //    arm" → "0 manual" TRIVIALLY true, including if the patcher were
  //    entirely broken. A test that passes without exercising anything CERTIFIES instead of
  //    protecting (3rd occurrence of this pattern on 15/07/2026 — always the same trap).
  const dir = stripBanner(clonerParc());
  const r = patcher(dir, false);
  assert.match(r.stdout, /to arm\s+: 7/, `the stripped fleet must expose 7 hooks to arm:\n${r.stdout}`);
  assert.match(r.stdout, /⚠️ MANUAL\s+: 0/, `non-patchable hook(s) → incomplete coverage:\n${r.stdout}`);
});

test('the patched hooks stay VALID JS', { skip, timeout: 300000 }, () => {
  const dir = stripBanner(clonerParc());
  patcher(dir, true);
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    const r = spawnSync(process.execPath, ['--check', path.join(dir, f)], { encoding: 'utf8' });
    assert.strictEqual(r.status, 0, `BROKEN SYNTAX in ${f}:\n${r.stderr}`);
  }
});

test('ANTI-REGRESSION — the 9 suites of the fleet stay GREEN after the patch', { skip, timeout: 300000 }, () => {
  // ⚠️ THE test that really counts. "The process dies" does NOT prove that it still
  //    does its job — a process that CRASHES also dies (experienced on 15/07/2026:
  //    browser-recover.js patched in the middle of a multi-line `new RegExp(` was
  //    GREEN on the death test, and broken). These 9 suites are the only proof that
  //    protect-files still blocks, that browser-recover still detects, etc.
  //
  // ⚠️ BEFORE/AFTER comparison: we do not require "all green" (a suite can be
  //    already red for a reason unrelated to the patch — that is not our subject).
  //    We require that the patch CHANGE NOTHING. That is anti-regression.
  const avant = stripBanner(clonerParc(true));
  const apres = stripBanner(clonerParc(true));
  patcher(apres, true);

  const suites = fs.readdirSync(PARC).filter((f) => f.endsWith('.test.js'));
  assert.ok(suites.length > 0, 'no suite found in the fleet — blind test');

  const regressions = [];
  for (const s of suites) {
    if (!fs.existsSync(path.join(avant, s))) continue;
    const a = spawnSync(process.execPath, ['--test', s], { cwd: avant, encoding: 'utf8', timeout: 60000 });
    const b = spawnSync(process.execPath, ['--test', s], { cwd: apres, encoding: 'utf8', timeout: 60000 });
    if (a.status !== b.status) {
      regressions.push(`${s}: before=${a.status} → after=${b.status}\n${(b.stdout || '').slice(-700)}`);
    }
  }

  assert.deepStrictEqual(regressions, [], `REGRESSION caused by the patch:\n${regressions.join('\n---\n')}`);
});

test('BEFORE the patch — a hook whose stdin is never closed DOES NOT DIE (the real bug)', { skip, timeout: 300000 }, async () => {
  // ⚠️ NEGATIVE-CHECK: proves the danger exists BEFORE proving the remedy.
  //    Without it, the next test could turn green for another reason.
  const dir = stripBanner(clonerParc());
  const r = await hookSurvit(path.join(dir, 'statusline.js'), 2500);
  assert.strictEqual(r.mort, false, 'the hook already dies on its own → the bug no longer reproduces here');
});

test('AFTER the patch — EVERY hook of the fleet dies on its own', { skip, timeout: 300000 }, async () => {
  const dir = stripBanner(clonerParc());
  patcher(dir, true);
  fs.writeFileSync(
    path.join(dir, 'deadline-conf.js'),
    '' // unused placeholder — intentionally left empty
  );

  const hooks = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.js') && f !== 'deadline.js' && f !== 'deadline-conf.js')
    .filter((f) => /require\(['"]\.\/deadline['"]\)/.test(fs.readFileSync(path.join(dir, f), 'utf8')));

  assert.ok(hooks.length >= 7, `only ${hooks.length} armed hook(s), 7 expected`);

  const survivants = [];
  for (const f of hooks) {
    // Short delay forced via env — the exact value is not the subject, DEATH is.
    const r = await new Promise((resolve) => {
      const child = spawn(process.execPath, [path.join(dir, f)], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, CTXROUTE_DEADLINE_MS: '400' },
      });
      child.stdout.on('data', () => {});
      child.stderr.on('data', () => {});
      const t = setTimeout(() => {
        child.kill('SIGKILL');
        resolve({ mort: false });
      }, 4000);
      child.on('exit', (code) => {
        clearTimeout(t);
        resolve({ mort: true, code });
      });
      try {
        child.stdin.write(JSON.stringify({ session_id: 'test', tool_name: 'Read', tool_input: {} }));
      } catch (e) {}
    });
    if (!r.mort) survivants.push(f);
  }

  assert.deepStrictEqual(survivants, [], `ZOMBIE(S) despite the patch: ${survivants.join(', ')}`);
});
