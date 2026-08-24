// ═══════════════════════════════════════════════════════════════════════
// lock.js tests — covers in particular the real bug of 15/07/2026: lock
// never acquired on a FRESH checkout where the parent directory does not exist
// yet (found in CI, invisible locally because state/ already existed).
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
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

// ── UNIDENTIFIED lock, old mtime (residual ②: died in the two-syscall window)
//    → forced. This is the ONE case a clock still judges, because no pid was
//    ever recorded and there is therefore nobody to ask. ──
{
  const lockDir = freshLockDir('stale');
  fs.mkdirSync(lockDir, { recursive: true });
  const oldTime = (Date.now() - 60 * 1000) / 1000; // 60s in the past, above UNIDENTIFIED_HOLDER_MS (5s)
  fs.utimesSync(lockDir, oldTime, oldTime);
  const result = withLock(lockDir, () => 'recovered', { timeoutMs: 2000 });
  ok('UNIDENTIFIED lock (no holder record, old mtime) → forced, fn() executed normally', result === 'recovered');
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
}

// ═══════════════════════════════════════════════════════════════════════
// THE KERNEL IS THE AUTHORITY ON THE HOLDER'S LIFE (2026-08-23)
// ═══════════════════════════════════════════════════════════════════════
// 🛑 THE FOUR CELLS BELOW ARE A PAIR OF PAIRS, AND NEITHER HALF MAY BE
//    DELETED WITHOUT THE OTHER. Forcing too EAGERLY loses an update (a second
//    writer enters while the first is alive); forcing too TIMIDLY strands the
//    lock for ever (a dead holder is never evicted). A cell that only proves
//    one direction cannot tell a fix from a regression in the other.
// ⚠️ NO SLEEP ANYWHERE HERE, ON PURPOSE: a test that waits to observe a
//    liveness decision is measuring time again — the very defect under test.
//    Liveness is FORGED (a pid known alive / known dead) and the decision is
//    read immediately.
// ═══════════════════════════════════════════════════════════════════════

// 🔴 HOW THESE CELLS WERE SEEN RED, AND THE TRAP THAT ALMOST HID IT.
//    Run against the pre-2026-08-23 `lock.js`, cell ① passed — for a reason
//    that had NOTHING to do with liveness: the holder record makes the old
//    forcing path call `fs.rmdirSync` on a NON-EMPTY directory, which throws
//    ENOTEMPTY, so that code never reached its decision at all. A green
//    obtained from an unrelated cleanup detail is exactly the "green that sees
//    nothing" this repository fears most.
//    ⇒ The red is only attributable once that detail is neutralised (old
//    algorithm + recursive removal): cells ①, ② and ⑤ then fail, ③ and ④ stay
//    green. Redo it that way if you ever need to re-prove these cells, and
//    NEVER accept the naive red — it measures the wrong thing.

/** Writes a lock directory held by `pid`, with the given age in ms. */
function forgeLock(lockDir, pid, ageMs) {
  fs.mkdirSync(lockDir, { recursive: true });
  if (pid !== null) fs.writeFileSync(path.join(lockDir, 'holder'), String(pid));
  const t = (Date.now() - ageMs) / 1000;
  fs.utimesSync(lockDir, t, t);
}

// ── ① THE DEFECT ITSELF — a LIVING holder must never be evicted, however old
//    its lock looks. The holder here is THIS process: `process.pid` is alive by
//    construction, so no forgery and no race can make this ambiguous.
//    🔴 ON THE PRE-2026-08-23 CODE THIS CELL IS RED: the mtime is 60 s old, so
//    `Date.now() - mtime > STALE_MS` fires, the lock is forced, and fn() runs
//    while a live holder believes it owns the section — the lost update, and
//    the `StateStaleForcing` counter-example made executable. ──
{
  const lockDir = freshLockDir('alive-holder');
  forgeLock(lockDir, process.pid, 60 * 1000);
  const result = withLock(lockDir, () => 'ENTERED', { timeoutMs: 100, fallback: 'FALLBACK' });
  ok(
    'a lock held by a LIVING pid is NEVER forced, however old it looks (kernel > clock)',
    result === 'FALLBACK'
  );
  ok('the living holder still owns its lock afterwards', fs.existsSync(lockDir));
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
}

// ── ② THE MANDATORY CONTROL — a REALLY DEAD holder is ALWAYS released, and
//    the mtime is FRESH so the clock cannot be what does the work. Without
//    this cell, cell ① could be satisfied by a lock that is simply never
//    forced any more: a silent lost update traded for a permanent deadlock.
//    ⚠️ The child's death is observed by the KERNEL (`spawnSync` returns once
//    it is reaped), never by a delay. ──
{
  const enfant = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' });
  const pidMort = Number(enfant.stdout);
  ok('the control child really ran and reported its pid (anti-mute probe)', Number.isInteger(pidMort) && pidMort > 0);

  const lockDir = freshLockDir('dead-holder');
  forgeLock(lockDir, pidMort, 0); // FRESH: the clock would refuse to force this
  const result = withLock(lockDir, () => 'RECOVERED', { timeoutMs: 100, fallback: 'FALLBACK' });
  ok(
    'a lock held by a DEAD pid is released at once, even with a FRESH mtime (no delay involved)',
    result === 'RECOVERED'
  );
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
}

// ── ③ An UNIDENTIFIED lock that is still young is NOT forced: an absent
//    record is not a proof of anything, and residual ② only licenses the
//    clock once the lock is older than UNIDENTIFIED_HOLDER_MS. ──
{
  const lockDir = freshLockDir('unidentified-young');
  forgeLock(lockDir, null, 0);
  const result = withLock(lockDir, () => 'ENTERED', { timeoutMs: 100, fallback: 'FALLBACK' });
  ok('an unidentified lock that is still young is NOT forced', result === 'FALLBACK');
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
}

// ── ④ A GARBAGE holder record is treated as unidentified, never as a death.
//    Parsing failure must never become a licence to evict. ──
{
  const lockDir = freshLockDir('garbage-holder');
  fs.mkdirSync(lockDir, { recursive: true });
  fs.writeFileSync(path.join(lockDir, 'holder'), 'not-a-pid');
  const result = withLock(lockDir, () => 'ENTERED', { timeoutMs: 100, fallback: 'FALLBACK' });
  ok('a garbage holder record is NOT a proof of death (young lock stays held)', result === 'FALLBACK');
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
}

// ── ⑤ The holder RECORDS ITSELF, and the record is cleaned up on release.
//    Without the record nothing above can work, so this is the anti-mute
//    probe of the whole mechanism. ──
{
  const lockDir = freshLockDir('records-itself');
  let vu = null;
  // ⚠️ NEVER let this read THROW: these cells are built at module level, so an
  //    exception here aborts the WHOLE file and every other cell reports
  //    "no tests" — a red nobody can attribute to a cause. Measured while
  //    seeing this suite red on the pre-2026-08-23 code.
  const result = withLock(lockDir, () => {
    try { vu = fs.readFileSync(path.join(lockDir, 'holder'), 'utf8'); } catch { vu = 'ABSENT'; }
    return 'done';
  });
  ok('the holder writes its own pid into the lock while holding it', vu === String(process.pid));
  ok('withLock still returns normally with the holder record in place', result === 'done');
  ok('the lock AND its holder record are gone after release (recursive removal)', !fs.existsSync(lockDir));
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
}
