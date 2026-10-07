// ═══════════════════════════════════════════════════════════════════════
// isolate-state.setup.mjs — every test file runs on a state directory of its
// own, never on the operator's (vitest `setupFiles`, 2026-10-04).
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 WHY: since the journals record every failure the runtime survives, a
//    suite that PROVOKES failures on purpose (a crashing `runFn`, a corrupt
//    snapshot, a refused watch) wrote them into the REAL `ctxroute-daemon.log`
//    and `ctxroute-hooks.log` — fake errors in the journals the operator reads
//    to diagnose production, and once a stray `undefined/` directory carrying
//    a home path, caught by the anti-leak gate at commit time. Measured on the
//    full suite of 2026-10-04: 5 test lines in the live journals.
// 🛑 A FILE THAT SETS THE VARIABLE ITSELF KEEPS ITS OWN VALUE: this only fills
//    an ABSENT variable, so every suite that already isolates is untouched, and
//    a suite that deletes it on purpose (the historical-default cells of
//    `declared-paths.test.js`) still measures the default it asks for.
// ⚠️ Children spawned by a test INHERIT the variable, so a spawned hook writes
//    into the same tmpdir. The directory is removed when the worker exits.
// ⚠️ `CTXROUTE_STATE_DIR` is the test-reserved variable `paths.js` already
//    honours first; no production code reads anything new.
// ═══════════════════════════════════════════════════════════════════════

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

if (!process.env.CTXROUTE_STATE_DIR) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-test-state-'));
  process.env.CTXROUTE_STATE_DIR = dir;
  process.once('exit', () => {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* a leftover tmpdir is not a failure */ }
  });
}
