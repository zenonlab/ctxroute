// ═══════════════════════════════════════════════════════════════════════
// GATE — every npm `overrides` entry is STILL NEEDED, or it goes red
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 WHY (2026-10-01): `@stryker-mutator/core` (9.x AND 10.x) pins
//    `typed-rest-client ~2.3.0`, which pins `qs` to EXACTLY 6.15.1 — inside the
//    range of three published `qs` advisories. No upgrade of ours could move it,
//    so `package.json` carries the npm-documented `overrides`, scoped to that ONE
//    parent. Dev tooling only: the shipped code has zero dependencies.
// 🛑 AN OVERRIDE IS A PATCH ON SOMEONE ELSE'S DECISION, and the day the upstream
//    fixes its pin, ours silently becomes a second, stale truth that can only
//    drift. This gate makes that day RED instead of invisible:
//    ① the overridden parent must still be in the lockfile (else: remove the entry);
//    ② the parent must still REQUEST an exact version the override replaces —
//       once it declares a range or the patched version itself, the override
//       is dead weight (remove it, re-run `npm audit`).
// ⚠️ Reads the LOCKFILE, the authority on what is installed — never node_modules.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));

/** Flattens `{parent: {child: spec}}` into `[{parent, child, spec}]`. */
function scopedOverrides(overrides) {
  const out = [];
  for (const [parent, value] of Object.entries(overrides || {})) {
    if (value && typeof value === 'object') {
      for (const [child, spec] of Object.entries(value)) out.push({ parent, child, spec });
    } else {
      out.push({ parent: null, child: parent, spec: value });
    }
  }
  return out;
}

const EXACT = /^\d+\.\d+\.\d+$/;

/** The verdict for one override against the lockfile; `null` = still needed. */
function staleReason(lock, o) {
  if (o.parent === null) {
    return `override "${o.child}" is GLOBAL — scope it to the one parent that needs it`;
  }
  const parent = lock.packages[`node_modules/${o.parent}`];
  if (!parent) return `"${o.parent}" is no longer installed — remove its override`;
  const requested = parent.dependencies && parent.dependencies[o.child];
  if (requested === undefined) return `"${o.parent}" no longer depends on "${o.child}" — remove the override`;
  if (!EXACT.test(requested)) {
    return `"${o.parent}" now requests "${o.child}@${requested}" (a range, no longer an exact pin) — `
      + 'remove the override and re-run `npm audit`';
  }
  const installed = lock.packages[`node_modules/${o.parent}/node_modules/${o.child}`]
    || lock.packages[`node_modules/${o.child}`];
  if (installed && installed.version === requested) {
    return `"${o.child}" is installed at the very version "${o.parent}" pins (${requested}) — the override does nothing`;
  }
  return null;
}

test('GATE: every npm override is still needed', () => {
  const pkg = readJson('package.json');
  const lock = readJson('package-lock.json');
  // One traversal per statement (the quadratic gate reads a chain as a nesting).
  const verdicts = scopedOverrides(pkg.overrides).map((o) => staleReason(lock, o));
  const reasons = verdicts.filter(Boolean);
  assert.deepStrictEqual(reasons, [], 'STALE OVERRIDE(S):\n  ' + reasons.join('\n  '));
});

test('ANTI-VACUITY: the declared override is seen, and the verdict CAN go red', () => {
  const pkg = readJson('package.json');
  const lock = readJson('package-lock.json');
  assert.ok(scopedOverrides(pkg.overrides).length >= 1, 'no override parsed — the gate measures nothing');
  // Fabricated lockfiles, one per stale shape: each MUST be named.
  const o = { parent: 'p', child: 'c', spec: '^2.0.0' };
  assert.match(staleReason({ packages: {} }, o), /no longer installed/);
  assert.match(staleReason({ packages: { 'node_modules/p': { dependencies: {} } } }, o), /no longer depends/);
  assert.match(staleReason({ packages: { 'node_modules/p': { dependencies: { c: '^1.2.0' } } } }, o), /a range/);
  assert.match(staleReason({ packages: { 'node_modules/p': { dependencies: { c: '1.0.0' } }, 'node_modules/c': { version: '1.0.0' } } }, o), /does nothing/);
  assert.match(staleReason({ packages: {} }, { parent: null, child: 'c', spec: '1' }), /GLOBAL/);
  // Control: the live shape (exact pin, replaced version) is NOT stale.
  assert.strictEqual(staleReason({ packages: { 'node_modules/p': { dependencies: { c: '1.0.0' } }, 'node_modules/c': { version: '2.0.0' } } }, o), null);
});
