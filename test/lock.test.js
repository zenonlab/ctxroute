// ═══════════════════════════════════════════════════════════════════════
// lock.js tests — covers in particular the real bug of 15/07/2026: lock
// never acquired on a FRESH checkout where the parent directory does not exist
// yet (found in CI, invisible locally because state/ already existed).
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import lock from '../src/lock.js';

const { withLock } = lock;

// Each ok(name, cond) = EXACTLY ONE vitest test (same name, same cond).
// The state is built sequentially at module level (order preserved).
function ok(name, cond) {
  test(name, () => { assert.ok(cond, name); });
}

const TMP_ROOT = path.join(import.meta.dirname, '.lock-test-tmp');
function freshLockDir(...segments) {
  return path.join(TMP_ROOT, ...segments, '.lock-test');
}

// ⚠️ REGRESSION — fresh checkout: the PARENT of lockDir does NOT exist at all
// (neither state/, nor even .lock-test-tmp/) before the call. This is EXACTLY the
// scenario that broke the CI: without the fix, mkdirSync(lockDir) throws ENOENT
// (not EEXIST) → wrongly interpreted as a fatal error → lock never acquired.
{
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
  ok('TMP_ROOT really does not exist before the test (precondition)', !fs.existsSync(TMP_ROOT));
  const lockDir = freshLockDir('never-created-before', 'nested', 'deeply');
  const result = withLock(lockDir, () => 'executed', { fallback: 'FALLBACK' });
  ok('withLock succeeds on a path where NO parent exists (CI regression 15/07)', result === 'executed');
  ok('the lock directory is properly cleaned up after use', !fs.existsSync(lockDir));
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
}

// ── Normal execution: fn() is called, its return value propagated ──
{
  const lockDir = freshLockDir('normal');
  const result = withLock(lockDir, () => 42);
  ok('withLock returns the value of fn()', result === 42);
  ok('the lock is released after normal use', !fs.existsSync(lockDir));
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
}

// ── fn() that throws: the lock is ALWAYS released (finally), the exception propagates ──
{
  const lockDir = freshLockDir('throws');
  let threw = false;
  try {
    withLock(lockDir, () => { throw new Error('boom'); });
  } catch (e) {
    threw = e.message === 'boom';
  }
  ok('withLock propagates the exception of fn()', threw);
  ok('the lock is released EVEN if fn() throws (finally)', !fs.existsSync(lockDir));
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
}

// ── Contention: lock already taken (existing directory, recent mtime) → timeout → fallback ──
{
  const lockDir = freshLockDir('contended');
  fs.mkdirSync(lockDir, { recursive: true }); // simulates ANOTHER process already holding the lock
  const result = withLock(lockDir, () => 'never', { timeoutMs: 100, fallback: 'FALLBACK' });
  ok('lock already held (recent) → timeout → fallback returned, fn() never executed', result === 'FALLBACK');
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
}

// ── STALE lock (old mtime = dead process) → forced and released, normal execution ──
{
  const lockDir = freshLockDir('stale');
  fs.mkdirSync(lockDir, { recursive: true });
  const oldTime = (Date.now() - 60 * 1000) / 1000; // 60s in the past, well above STALE_MS (5s)
  fs.utimesSync(lockDir, oldTime, oldTime);
  const result = withLock(lockDir, () => 'recovered', { timeoutMs: 2000 });
  ok('STALE lock (old mtime) → forced, fn() executed normally', result === 'recovered');
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
}
