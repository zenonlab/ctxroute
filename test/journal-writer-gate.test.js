// ═══════════════════════════════════════════════════════════════════════
// EVERY JOURNAL GOES THROUGH `src/log.js` — POLICY + RATCHET.
// The DETECTION lives in `rules/no-journal-writer.yml`.
//
// 🔴 WHY (work item K, 2026-10-04): a journal written with a bare
//    `appendFileSync` has no closed vocabulary, no level, no rotation and no
//    ceiling — and the project's only journal used to be exactly that, its
//    rotation hard-coded beside the append. With one writer and this gate,
//    "add a journal" can only mean "add an entry to `log-journals-pure.js`",
//    which brings the level, the rotation and the declared ceiling with it.
//
// 🛑 ZERO TOLERANCE OUTSIDE ONE FILE, NO BUDGET, AND THAT IS DELIBERATE: an
//    append elsewhere is never legitimate debt, it is an unregistered journal.
//    The ratchet is an EQUALITY on the one site: `src/log.js`, exactly one
//    append — a second one there would be a second write path to review.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RULE = path.join(ROOT, 'rules', 'no-journal-writer.yml');
// The runtime perimeter: what runs unattended. `test/` writes into tmpdirs.
const PERIMETER = ['src', 'tools', 'service'];

// 🛑 THE NATIVE BINARY, NEVER THE `.bin` SHIM (a `.cmd` on Windows, which
//    `execFileSync` refuses without `shell: true`, forbidden by `layers.json`).
// 🛑 A MISSING BINARY IS A NAMED REFUSAL, never a skip.
function astGrepBinary() {
  const name = process.platform === 'win32' ? 'ast-grep.exe' : 'ast-grep';
  const bin = path.join(ROOT, 'node_modules', '@ast-grep', 'cli', name);
  if (!fs.existsSync(bin)) {
    throw new Error('ast-grep NOT FOUND (' + bin + ') — this gate cannot judge. Run `npm ci`.');
  }
  return bin;
}

// 🛑 `ast-grep` answers EMPTY JSON with EXIT 0 on a path it cannot resolve —
//    every floor below exists for that.
function scan(targets) {
  let out = '';
  try {
    out = execFileSync(astGrepBinary(), ['scan', '--rule', RULE, ...targets, '--json=compact'], {
      cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    // ⚠️ exit ≠ 0 on an `error` match is a RESULT; the findings are on stdout.
    out = (e && e.stdout) || '';
  }
  try { return JSON.parse(out || '[]'); } catch { return []; }
}

const rel = (f) => path.relative(ROOT, path.resolve(ROOT, f)).split(path.sep).join('/');

test('GATE: no append outside `src/log.js`, and exactly ONE inside it', () => {
  const hits = scan(PERIMETER);
  const where = hits.map((h) => `${rel(h.file)}:${h.range.start.line + 1}  ${h.lines.trim().slice(0, 90)}`);
  const outside = where.filter((w) => !w.startsWith('src/log.js:'));
  assert.deepStrictEqual(outside, [],
    'A JOURNAL WRITTEN OUTSIDE THE ONE WRITER:\n  ' + outside.join('\n  ') +
    '\n\n🛑 Every journal goes through `src/log.js`. Add your journal or event to\n' +
    '   `src/log-journals-pure.js` (closed vocabulary, severity), and call\n' +
    '   `log.write(journal, event, fields)` — the level, the rotation and the\n' +
    '   ceiling declared in `disk-writers.json` come with it.\n' +
    '🛑 There is no budget file and none may be added.');
  // ⚠️ THE RATCHET, AND THE ANTI-VACUITY IN ONE: the writer itself must be
  //    SEEN by the scan. Zero here means the perimeter did not resolve.
  assert.strictEqual(where.length, 1, 'expected exactly the one append of `src/log.js`, got:\n  ' + where.join('\n  '));
});

test('ANTI-VACUITY: the perimeter is populated and really parsed', () => {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('GIT_')) delete env[k];
  const files = execFileSync('git', ['ls-files', 'src', 'tools', 'service'], { cwd: ROOT, env: env, encoding: 'utf8' })
    .split(/\r?\n/).filter((f) => f.endsWith('.js'));
  assert.ok(files.length >= 100, `perimeter too small (${files.length} files): the scan is measuring nothing`);
  const anyCall = execFileSync(astGrepBinary(), ['run', '--pattern', '$X.writeFileSync($$$)', ...PERIMETER, '--json=compact'], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  });
  const calls = anyCall.trim() === '' ? [] : JSON.parse(anyCall);
  assert.ok(calls.length >= 5, `expected the scanner to SEE real writeFileSync calls, found ${calls.length}`);
});

// 🛑 NEGATIVE CHECK — seen red on fabricated offenders in a TMPDIR, never on a
//    real file.
test('NEGATIVE: every append form IS detected, and what is not an append is NOT', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'journal-writer-'));
  const file = path.join(tmp, 'offender.js');
  fs.writeFileSync(file, [
    "fs.appendFileSync('a.log', 'x');",                       // 1 — the classic
    "require(\"fs\").appendFileSync('a.log', 'x');",          // 2 — no receiver name
    "const k = require('fs'); k.appendFileSync('a', 'x');",   // 3 — an alias
    "appendFileSync('a.log', 'x');",                          // 4 — destructured
    "fs.promises.appendFile('a.log', 'x');",                  // 5 — the promise API
    "fs.appendFile('a.log', 'x', () => {});",                 // 6 — the callback API
    "fs.createWriteStream('a.log', { flags: 'a' });",         // 7 — a stream
    "fs.openSync('a.log', 'a');",                             // 8 — append flag
    "fs.openSync('a.log', 'a+');",                            // 9
    "fs.openSync('a.log', 'as');",                            // 10
    "fs.writeFileSync('a.json', 'x');",                       // a replace — MUST pass
    "fs.openSync('a.log', 'r');",                             // a read — MUST pass
    "fs.openSync('a.log', 'w');",                             // a truncate — MUST pass (disk-writers' job)
    "// fs.appendFileSync('in a comment')",                   // a comment — MUST pass
    "const s = \"fs.appendFileSync('in a string')\";",        // a string — MUST pass
  ].join('\n'), 'utf8');
  try {
    // One traversal per statement: a chained `.map().sort()` reads as a nested traversal.
    const lines = scan([file]).map((h) => h.range.start.line + 1);
    lines.sort((a, b) => a - b);
    assert.deepStrictEqual(lines, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
