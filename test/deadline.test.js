// ═══════════════════════════════════════════════════════════════════════
// deadline.js — PROOF, not declaration.
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ These tests spawn REAL processes: the deadline is a property of the LIFE
//    CYCLE of a process. Testing it by calling a function in memory proves
//    NOTHING (it is exactly the kind of test that reassures without protecting).
//    The only fact that counts: "is this process dead, yes or no?"
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEADLINE = path.join(__dirname, '..', 'src', 'deadline.js').replace(/\\/g, '/');

// Launches a node process with inline code, WITHOUT ever closing its stdin.
// ⚠️ REPRODUCES THE REAL BUG (Claude Code #68626): stdin open forever.
//    Without a deadline, this process would live indefinitely — it is the measured zombie.
function spawnStuck(code, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['-e', code], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    const t0 = Date.now();
    const killer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({ mort: false, ms: Date.now() - t0, out });
    }, timeoutMs);
    child.on('exit', (code_) => {
      clearTimeout(killer);
      resolve({ mort: true, ms: Date.now() - t0, code: code_, out });
    });
    // ⚠️ We NEVER call child.stdin.end(): that is the whole point.
  });
}

test('WITHOUT a deadline, a process whose stdin is never closed DOES NOT DIE (the bug)', async () => {
  // ⚠️ NEGATIVE-CHECK: proves the danger is REAL before proving the remedy.
  //    Without this test, the next one could turn green for another reason.
  const r = await spawnStuck(`process.stdin.on('data', () => {}); process.stdin.on('end', () => process.exit(0));`, 3000);
  assert.strictEqual(r.mort, false, 'the process died on its own → the bug no longer reproduces, this test no longer proves anything');
});

test('WITH a deadline, the same process dies on its own', async () => {
  const r = await spawnStuck(
    `require('${DEADLINE}').arm({ ms: 400 });
     process.stdin.on('data', () => {});
     process.stdin.on('end', () => process.exit(0));`,
    5000
  );
  assert.strictEqual(r.mort, true, 'ZOMBIE: the process survived its deadline');
  assert.strictEqual(r.code, 0, 'must exit with 0 (fail-open — never block a tool)');
  assert.ok(r.ms < 3000, `died in ${r.ms}ms — too late`);
});

test('onExpire writes a best-effort output BEFORE exiting', async () => {
  const r = await spawnStuck(
    `require('${DEADLINE}').arm({ ms: 300, onExpire: () => process.stdout.write('PARTIEL') });
     process.stdin.on('data', () => {});`,
    5000
  );
  assert.strictEqual(r.mort, true);
  assert.match(r.out, /PARTIEL/, 'onExpire not called — the best-effort output is lost');
});

test('an onExpire that THROWS does NOT resurrect the zombie', async () => {
  // ⚠️ The output ALWAYS takes precedence over the rendering. An emergency output that can
  //    fail is not an emergency output.
  const r = await spawnStuck(
    `require('${DEADLINE}').arm({ ms: 300, onExpire: () => { throw new Error('boom'); } });
     process.stdin.on('data', () => {});`,
    5000
  );
  assert.strictEqual(r.mort, true, 'an onExpire that throws prevented the death → zombie');
  assert.strictEqual(r.code, 0);
});

test('ZERO added LATENCY when everything is fine (unref)', async () => {
  // ⚠️ THE test that protects against the remedy being worse than the disease: without .unref(), this process
  //    would wait the full 5000ms instead of exiting immediately.
  const r = await new Promise((resolve) => {
    const child = spawn(process.execPath, ['-e', `require('${DEADLINE}').arm({ ms: 5000 }); process.stdout.write('OK');`]);
    const t0 = Date.now();
    child.on('exit', () => resolve({ ms: Date.now() - t0 }));
  });
  assert.ok(r.ms < 2000, `the process waited ${r.ms}ms → unref() broken, latency on EVERY tool call`);
});
