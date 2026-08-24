// ═══════════════════════════════════════════════════════════════════════
// EXECUTES THE SPEC GATE — `node specs/tla/run-tlc.mjs`, for real.
// ═══════════════════════════════════════════════════════════════════════
//
// 🛑 EXECUTE THE JUDGE, NEVER DESCRIBE ITS RULES. A twin of the verdict logic
//    written here would diverge from `run-tlc.mjs` at the first change, and
//    the twin is the one that would stay green. So this file launches the
//    REAL gate and reads its REAL output.
//
// ⚠️ HEAVY LANE BY CONSTRUCTION (it spawns, and it spawns a JVM ~11 times).
//    Kept out of the fast edit loop on purpose; `npm run spec:tlc` is the
//    command a human runs, this cell is what makes CI unable to forget it.
//
// ⚠️ JAVA IS AN EXTERNAL DEPENDENCY WE DO NOT SHIP. Absent ⇒ the cell SKIPS
//    **BY NAME**, and the skip itself is GUARDED (a second cell proves the
//    spec artifacts exist regardless, so a machine without Java never turns
//    this whole file into a silent green).
// 🛑 NEVER make the skip cover more than the JVM: a missing `.tla`, a missing
//    `runs.json` or an empty matrix must stay RED everywhere.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'specs', 'tla');
const GATE = path.join(DIR, 'run-tlc.mjs');
const matrix = JSON.parse(fs.readFileSync(path.join(DIR, 'runs.json'), 'utf8'));

const javaPresent = spawnSync('java', ['-version'], { encoding: 'utf8' }).status === 0;

// This cell NEVER skips: it is what keeps the file from going silently green
// on a machine without Java.
test('the spec artifacts exist and the matrix is not empty (runs with or without Java)', () => {
  assert.ok(fs.existsSync(path.join(DIR, 'Transport.tla')), 'specs/tla/Transport.tla is missing');
  assert.ok(fs.existsSync(GATE), 'specs/tla/run-tlc.mjs is missing');
  assert.ok(matrix.runs.length >= 8, `the matrix declares ${matrix.runs.length} run(s) — an empty gate is a green that sees nothing`);
});

test.skipIf(!javaPresent)('TLC delivers EVERY declared verdict (npm run spec:tlc)', () => {
  const r = spawnSync(process.execPath, [GATE], { cwd: ROOT, encoding: 'utf8', timeout: 900_000 });
  const out = (r.stdout || '') + (r.stderr || '');
  assert.equal(r.status, 0, `the spec gate is RED:\n${out.slice(-4000)}`);
  // ⚠️ ANTI-MUTE PROBE: exit 0 alone would also be the verdict of a gate that
  //    checked nothing. We demand the LINE of every declared run.
  for (const run of matrix.runs) {
    const expected = run.expect.green ? `OK  ${run.cfg} green` : `OK  ${run.cfg} red on ${run.expect.violated}`;
    assert.ok(out.includes(expected), `the gate did not report "${expected}":\n${out.slice(-4000)}`);
  }
  assert.ok(out.includes(`${matrix.runs.length}/${matrix.runs.length} TLC verdicts`), 'the gate must state how many verdicts it checked');
}, 900_000);
