// ═══════════════════════════════════════════════════════════════════════
// NO SILENT `catch` IN `src/` WITHOUT A WRITTEN REASON — POLICY + RATCHET.
// The DETECTION lives in `rules/no-silent-catch.yml`; the declared silences
// live in `silent-catch-budget.json`.
//
// 🔴 WHY (2026-10-04): a hook or a daemon that swallows an error leaves
//    NOTHING — exit 0, no line, a failure invisible for as long as nobody
//    suspects it. The day the journal writer existed, 9 of 12 hooks still
//    swallowed in silence, and the shared state store lost writes the same way.
//    Every `catch` of the runtime now either reports (`log.hookError`,
//    `log.daemonError`, `log.write`), throws, or is DECLARED with why its
//    silence is the right answer.
// 🛑 EQUALITY RATCHET, BOTH DIRECTIONS: a file absent from the budget is held
//    at ZERO; more catches than declared is a new silence nobody judged; fewer
//    is a dormant permit the next silence would inherit.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RULE = path.join(ROOT, 'rules', 'no-silent-catch.yml');
const BUDGET = path.join(ROOT, 'silent-catch-budget.json');

// 🛑 THE NATIVE BINARY, NEVER THE `.bin` SHIM; a missing binary is a NAMED REFUSAL.
function astGrepBinary() {
  const name = process.platform === 'win32' ? 'ast-grep.exe' : 'ast-grep';
  const bin = path.join(ROOT, 'node_modules', '@ast-grep', 'cli', name);
  if (!fs.existsSync(bin)) {
    throw new Error('ast-grep NOT FOUND (' + bin + ') — this gate cannot judge. Run `npm ci`.');
  }
  return bin;
}

// 🛑 `ast-grep` answers EMPTY JSON with EXIT 0 on a path it cannot resolve.
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

function measured() {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const h of scan(['src'])) {
    const f = rel(h.file);
    counts[f] = (counts[f] || 0) + 1;
  }
  return counts;
}

test('GATE: every silent catch of src/ is DECLARED, with its exact count and a reason', () => {
  const budget = JSON.parse(fs.readFileSync(BUDGET, 'utf8')).files;
  const counts = measured();
  const faults = [];
  for (const [file, n] of Object.entries(counts)) {
    const decl = budget[file];
    if (!decl) faults.push(`${file}: ${n} silent catch(es), NOT DECLARED (a file absent from the budget is held at ZERO)`);
    else if (decl.max !== n) faults.push(`${file}: ${n} silent catch(es) measured, ${decl.max} declared — the ratchet is an EQUALITY`);
  }
  for (const [file, decl] of Object.entries(budget)) {
    if (!(file in counts)) faults.push(`${file}: DECLARED but no silent catch left — remove the entry (dormant permit)`);
    if (typeof decl.why !== 'string' || decl.why.length < 60) faults.push(`${file}: the reason is missing or under 60 characters`);
    if (!Number.isInteger(decl.max) || decl.max < 1) faults.push(`${file}: \`max\` must be a positive integer`);
  }
  assert.deepStrictEqual(faults, [],
    'SILENT CATCH VIOLATION(S):\n  ' + faults.join('\n  ') +
    '\n\n🛑 A swallowed error leaves NOTHING: exit 0, no line. Either report it\n' +
    '   (`log.hookError(\'<hook>\', err)` in a hook, `log.daemonError(\'<site>\', err)` in\n' +
    '   the daemon, `log.write` otherwise), or declare it in `silent-catch-budget.json`\n' +
    '   with WHY its silence is the right answer (an absent config, a file already gone).\n' +
    '🛑 Never raise a `max` to make a push go through without writing that reason.');
});

test('ANTI-VACUITY: the scan really sees src/, and the budget is the size of a real codebase', () => {
  const counts = measured();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  assert.ok(total >= 50, `only ${total} silent catches seen — the perimeter did not resolve`);
  assert.ok(Object.keys(counts).length >= 20, 'fewer than 20 files seen — the scan is measuring almost nothing');
  // The REPORTING catches must be invisible to the rule: if they were seen, the
  // rule would be blind to the difference this gate exists for.
  const anyReporting = execFileSync(astGrepBinary(), ['run', '--pattern', 'log.hookError($$$)', 'src', '--json=compact'], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  });
  const reports = anyReporting.trim() === '' ? [] : JSON.parse(anyReporting);
  assert.ok(reports.length >= 15, `expected the hooks to REPORT through log.hookError, found ${reports.length}`);
});

// 🛑 NEGATIVE CHECK — fabricated offenders in a TMPDIR, never a real file.
test('NEGATIVE: a swallowing catch IS detected; reporting, rethrowing and comments are NOT', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silent-catch-'));
  const file = path.join(tmp, 'offender.js');
  fs.writeFileSync(file, [
    'try { a(); } catch { /* swallowed */ }',                              // 1 — the defect
    'try { a(); } catch (e) { return null; }',                            // 2 — swallowed with a value
    'try { a(); } catch (e) { process.stdout.write(String(e)); }',        // 3 — a write that reports to NO journal
    'try { a(); } catch (e) { other.hookError("x", e); }',                // 4 — not the journal writer
    "try { a(); } catch (e) { log.hookError('h', e); }",                  // reports — MUST pass
    "try { a(); } catch (e) { log.daemonError('s', e); }",                // reports — MUST pass
    "try { a(); } catch (e) { log.write('hooks', 'hook-error', {}); }",   // reports — MUST pass
    'try { a(); } catch (e) { throw new Error("named refusal"); }',        // rethrows — MUST pass
    '// try { a(); } catch { }',                                          // a comment — MUST pass
    'const s = "try { a(); } catch { }";',                                // a string — MUST pass
  ].join('\n'), 'utf8');
  try {
    const lines = scan([file]).map((h) => h.range.start.line + 1);
    lines.sort((a, b) => a - b);
    assert.deepStrictEqual(lines, [1, 2, 3, 4]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
