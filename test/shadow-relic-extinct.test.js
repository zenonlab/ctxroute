// ═══════════════════════════════════════════════════════════════════════
// WI-SHADOW-LOG — the shadow is EXTINCT, and nothing designates it any more
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 THE QUESTION WAS NOT "WHICH RETENTION", IT WAS "SHOULD THIS EXIST".
//    `shadow-inject.js` appended a daily JSONL that nothing ever removed. The
//    reflex answer is a ceiling + an eviction. The right answer, measured:
//    ① it has been UNWIRED since 2026-07-17 (settings.json), so it writes
//       nothing today — the growth was DORMANT, not absent;
//    ② its ONLY reader was `shadow-reconcile.js`, whose entire job is the
//       SWITCH-OVER VERDICT ("N days of real traffic, zero divergence");
//    ③ that switch-over HAPPENED on 2026-07-17 and `doc-inject.js` is live.
//    ⇒ a producer nobody runs, feeding a reader whose question is answered.
//    Writing a retention for it would have been a cure with no disease, and a
//    cleaner that matches nothing is indistinguishable from one that works.
//
// ⚠️ WHAT SURVIVES, DELIBERATELY: `oracle.js` (still the single reader of the
//    historical engine's output, consumed by `file-differential.test.js`) and
//    `loader.js` (the pure corpus→rules road, mutated 100 %). Deleting the
//    shadow must not take a live module with it — that is why this gate names
//    the two relics EXACTLY and not a `shadow*` prefix.
//
// ⚠️ ANTI-VACUITY: a reference scan that reads zero files passes every time.
//    The floor below makes that impossible — it is the one failure mode this
//    repo has paid for three times (a green gate that analysed nothing).
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// The three files the extinction removes, named one by one.
const DISPARUS = [
  'src/hooks/shadow-inject.js',
  'src/hooks/shadow-reconcile.js',
  'test/shadow-inject.test.js',
];

// Where a surviving reference would hide. `state/` is runtime (gitignored) and
// `node_modules/` is not ours — both stay out.
const DOSSIERS = ['src', 'test', 'tools', 'docs/framework', '.github'];
const FICHIERS_RACINE = [
  'FILE-MAP.md',
  'REFACTOR-PLAN.md',
  'package.json',
  'vitest.config.mjs',
  'vitest.heavy.config.mjs',
  'stryker.conf.json',
  '.dependency-cruiser.json',
  'jsconfig.json',
  'quadratic-budget.json',
  'disk-writers.json',
  'temporal-budget.json',
];

const CITATION = /shadow-(inject|reconcile)/;

function lister(dir, acc) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) lister(abs, acc);
    else if (/\.(js|mjs|json|md|ya?ml)$/.test(e.name)) acc.push(abs);
  }
  return acc;
}

test('THE RELIC IS GONE — the three files no longer exist', () => {
  for (const rel of DISPARUS) {
    assert.ok(
      !fs.existsSync(path.join(ROOT, rel)),
      `${rel} still exists: the shadow was judged extinct but never removed. ` +
        'Half a deletion leaves a writer with no ceiling AND a reader with no producer.'
    );
  }
});

test('NOTHING DESIGNATES IT ANY MORE — zero surviving citation in a tracked file', () => {
  const fichiers = DOSSIERS.reduce((acc, d) => lister(path.join(ROOT, d), acc), []);
  for (const f of FICHIERS_RACINE) {
    const abs = path.join(ROOT, f);
    if (fs.existsSync(abs)) fichiers.push(abs);
  }
  // ⚠️ FLOOR — a scan of an empty set proves nothing at all.
  assert.ok(fichiers.length > 50, `hollow scan: only ${fichiers.length} files read, the gate is measuring nothing`);

  const coupables = [];
  for (const abs of fichiers) {
    if (abs.endsWith('shadow-relic-extinct.test.js')) continue; // this file names them ON PURPOSE
    if (CITATION.test(fs.readFileSync(abs, 'utf8'))) coupables.push(path.relative(ROOT, abs));
  }
  assert.deepStrictEqual(
    coupables,
    [],
    'a deleted file is still designated here — `doc-drift-gate` turns red on a doc citing a vanished file, ' +
      'and a config entry pointing at nothing is a gate that silently stops covering anything'
  );
});
