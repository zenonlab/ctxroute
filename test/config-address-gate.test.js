// ═══════════════════════════════════════════════════════════════════════
// GATE — the configuration's address has ONE owner: `paths.configPath()`
// ═══════════════════════════════════════════════════════════════════════
// 🔴 BORN 2026-10-01: two CLIs rebuilt `<repo>/ctxroute-config.json`, a file
//    removed on 2026-08-24, and ran on an EMPTY configuration for five weeks.
//    A missing config is not an error for a reader (fail-open), so nothing
//    ever turned red — the class can only be caught where it is WRITTEN.
// ⚠️ Perimeter = the executable code (`src/`, `tools/`, `service/`) from
//    `git ls-files`. Tests are out ON PURPOSE: they build throwaway configs in
//    tmpdirs, and `config-gate` must read the SHIPPED file by its literal path.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RULE = path.join(ROOT, 'rules', 'config-address-by-hand.yml');
// The ONE owner: its last-resort fallback IS the repo-root file, by design.
const OWNER = 'src/paths.js';

function astGrepBinary() {
  const name = process.platform === 'win32' ? 'ast-grep.exe' : 'ast-grep';
  const bin = path.join(ROOT, 'node_modules', '@ast-grep', 'cli', name);
  if (!fs.existsSync(bin)) {
    throw new Error('ast-grep NOT FOUND (' + bin + ') — this gate cannot judge. Run `npm ci`.');
  }
  return bin;
}

function scan(targets) {
  let out = '';
  try {
    out = execFileSync(astGrepBinary(), ['scan', '--rule', RULE, ...targets, '--json=compact'], {
      cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    out = (e && e.stdout) || ''; // an `error` match exits ≠ 0: a RESULT, findings on stdout
  }
  try { return JSON.parse(out || '[]'); } catch { return []; }
}

function tracked() {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('GIT_')) delete env[k];
  return execFileSync('git', ['ls-files', 'src/*.js', 'src/**/*.js', 'tools/*.js', 'tools/*.mjs', 'service/*.js'],
    { cwd: ROOT, env: env, encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
}

const rel = (f) => path.relative(ROOT, path.resolve(ROOT, f)).split(path.sep).join('/');

test('GATE: only paths.js builds the configuration address', () => {
  const files = tracked();
  assert.ok(files.length >= 100, `perimeter too small (${files.length} files): the scan measures nothing`);
  const hits = scan(files);
  // ANTI-VACUITY: the owner's own fallback MUST be seen, or the scanner is blind.
  assert.ok(hits.some((h) => rel(h.file) === OWNER), 'the scan did not even see the owner — it reads nothing');
  // One traversal per statement (the quadratic gate reads a chain as a nesting).
  const foreign = hits.filter((h) => rel(h.file) !== OWNER);
  const offenders = foreign.map((h) => `${rel(h.file)}:${h.range.start.line + 1}  ${h.lines.trim().slice(0, 90)}`);
  assert.deepStrictEqual(offenders, [],
    'THE CONFIGURATION ADDRESS IS REBUILT BY HAND:\n  ' + offenders.join('\n  ')
    + '\n→ WAY OUT: `require(\'../src/paths\').configPath()` — it carries the whole precedence.');
});

test('NEGATIVE: the rebuilt shapes ARE detected, a quotation and the cure are NOT', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'config-address-gate-'));
  const file = path.join(tmp, 'offender.js');
  fs.writeFileSync(file, [
    "const a = path.join(__dirname, '..', 'ctxroute-config.json');", // 1 — the defect verbatim
    'const b = path.resolve(ROOT, "ctxroute-config.json");',          // 2 — other quote, other call
    "const c = paths.configPath();",                                  // the cure — MUST pass
    "// path.join(__dirname, 'ctxroute-config.json') quoted",          // a comment — MUST pass
    "const d = 'ctxroute-config.json';",                              // a bare string — MUST pass
  ].join('\n'), 'utf8');
  try {
    assert.strictEqual(scan([file]).length, 2);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
