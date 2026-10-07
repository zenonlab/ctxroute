// ═══════════════════════════════════════════════════════════════════════
// The suite never runs on the operator's state directory (2026-10-04).
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 Born of 5 fake failures written into the LIVE journals by a full run,
//    plus a stray `undefined/` directory carrying a home path. The cure is
//    `test/isolate-state.setup.mjs`; these cells hold it in place: every
//    vitest config declares it, and a suite that sets nothing really runs on
//    a tmpdir, never on `<repo>/state`.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const ROOT = path.join(import.meta.dirname, '..');
const SETUP_DECLARED = /\.\/test\/isolate-state\.setup\.mjs/;

test('every vitest config declares the state isolation setup', () => {
  const configs = fs.readdirSync(ROOT).filter((f) => /^vitest(\..+)?\.config\.mjs$/.test(f));
  assert.ok(configs.length >= 3, `only ${configs.length} vitest config(s) found — the scan is measuring nothing`);
  // One traversal per statement: an `.includes` inside a `.filter` reads as a nested one.
  const missing = [];
  for (const f of configs) {
    const text = fs.readFileSync(path.join(ROOT, f), 'utf8');
    if (!SETUP_DECLARED.test(text)) missing.push(f);
  }
  assert.deepEqual(missing, [], 'a vitest config runs its suites on the REAL state directory');
});

test('a suite that sets nothing runs on a tmpdir, never on the repository state directory', () => {
  const dir = process.env.CTXROUTE_STATE_DIR;
  assert.ok(dir, 'the setup did not run: CTXROUTE_STATE_DIR is unset');
  assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())), `state directory outside the OS tmpdir: ${dir}`);
  const paths = require_('../src/paths.js');
  assert.equal(paths.stateDir(), dir);
  assert.notEqual(path.resolve(paths.stateDir()), path.resolve(ROOT, 'state'));
});
