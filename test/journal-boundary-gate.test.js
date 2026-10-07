// ═══════════════════════════════════════════════════════════════════════
// THE BOUNDED JOURNALS AT THEIR THREE BOUNDARIES — the manifest, the schema,
// and the sweeper
// ═══════════════════════════════════════════════════════════════════════
//
// 🛑 WHAT IS ALREADY PROVEN ELSEWHERE, AND IS NOT REDONE HERE:
//    `log-pure.test.js` proves the setting, the bounds and the rotation plan,
//    `log.test.js` and `lifecycle-log.test.js` prove by OVERFLOW what the disk
//    keeps. They look INSIDE the component. This suite holds the contracts that
//    live at its FRONTIERS, where nothing else looks:
//
//    ① `disk-writers.json` DECLARES a budget for the one journal writer, and the
//       code ENFORCES one. Since 2026-10-04 the ceiling is an adopter SETTING, so
//       the honest declaration is the WORST CASE the bounds allow — every
//       journal × `keptFiles.max` × `maxBytes.max` — which no config can exceed.
//       Two places for one number: tied here, or the manifest becomes a
//       DORMANT PERMIT the day a bound moves.
//
//    ② `ctxroute-config.schema.json` declares the `logging` bounds an adopter
//       reads, and `log-pure.BOUNDS` the ones the runtime enforces. A schema
//       wider than the runtime makes a valid config refused at run time; a
//       narrower one forbids what works. Tied here, both directions.
//
//    ③ `state-eviction.js` sweeps `state/` — the very directory the journals
//       live in — and it must NOT touch them. Two ceilings, one per class: the
//       stores are bounded by COUNT, a journal bounds ITSELF by SIZE.
//
// ⚠️ perTest: every fixture is built INSIDE its `test()` callback.
// ⚠️ Expectations are written out LITERALLY, copied from the source.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

import { test } from 'vitest';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { BOUNDS, LEVELS, DEFAULTS } from '../src/log-pure.js';
import { journals, worstCase } from '../src/log-journals-pure.js';
import { planEviction } from '../src/state-eviction-pure.js';

const ROOT = path.join(import.meta.dirname, '..');

// The writer as `disk-writers.json` keys it. A rename that missed the manifest
// would leave the declaration pointing at nothing — a NAMED REFUSAL below.
const DECLARED_AS = 'src/log.js';

// ═══════════════════════════════════════════════════════════════════════
// ① THE DECLARED CEILING IS THE WORST CASE THE CODE ALLOWS
// ═══════════════════════════════════════════════════════════════════════
test('① THE MANIFEST DECLARES EXACTLY THE WORST CASE — 2 journals × 10 files × 8 MB', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'disk-writers.json'), 'utf8'));
  const writers = manifest.writers || manifest;
  const decl = writers[DECLARED_AS];
  assert.ok(decl, `\`${DECLARED_AS}\` has no entry in disk-writers.json — the journals write undeclared space`);
  assert.ok(decl.budget, `\`${DECLARED_AS}\` is declared without a budget — an unbounded writer does not exist`);
  assert.strictEqual(decl.class, 'log');

  // The CODE's side, literally.
  assert.deepStrictEqual(worstCase(), { files: 20, bytes: 167772160 }, 'the worst case moved');
  // The MANIFEST's side, literally.
  assert.strictEqual(decl.budget.maxFiles, 20, 'the manifest declares a file count the rotation cannot reach');
  assert.strictEqual(decl.budget.maxBytes, 167772160, 'the manifest declares a size the bounds do not allow');
  // 🛑 AND THE TWO TIED TOGETHER — whichever side moves alone reddens this.
  assert.strictEqual(decl.budget.maxBytes, Object.keys(journals()).length * BOUNDS.keptFiles.max * BOUNDS.maxBytes.max,
    'the DECLARED budget and the ENFORCED bounds have drifted: the manifest is now a dormant permit');
  assert.strictEqual(decl.budget.maxFiles, Object.keys(journals()).length * BOUNDS.keptFiles.max);
});

test('① THE OLD WRITER IS NO LONGER DECLARED — `lifecycle-log.js` writes through `log.js` now', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'disk-writers.json'), 'utf8'));
  assert.strictEqual((manifest.writers || manifest)['src/lifecycle-log.js'], undefined,
    'a declaration for a file that no longer writes is a dormant permit');
  // And exactly ONE writer carries the `log` class: a second journal writer
  // would be a journal outside the registry.
  const logWriters = [];
  for (const [f, d] of Object.entries(manifest.writers)) if (d.class === 'log') logWriters.push(f);
  assert.deepStrictEqual(logWriters, ['src/log.js']);
});

// ═══════════════════════════════════════════════════════════════════════
// ② THE SCHEMA SAYS WHAT THE RUNTIME ENFORCES
// ═══════════════════════════════════════════════════════════════════════
test('② the `logging` schema carries the runtime bounds, levels and keys — no more, no less', () => {
  const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'ctxroute-config.schema.json'), 'utf8'));
  const logging = schema.properties.logging;
  assert.ok(logging, 'the schema has no `logging` key — adopters cannot see the setting');
  assert.strictEqual(logging.additionalProperties, false, 'an unknown logging key must be refused by the schema too');
  assert.deepStrictEqual(Object.keys(logging.properties).sort(), ['keptFiles', 'level', 'maxBytes', 'note']);
  assert.deepStrictEqual(logging.properties.level.enum, [...LEVELS]);
  for (const key of ['maxBytes', 'keptFiles']) {
    const p = logging.properties[key];
    assert.strictEqual(p.type, 'integer', key);
    assert.strictEqual(p.minimum, BOUNDS[key].min, `${key}: the schema minimum drifted from the runtime`);
    assert.strictEqual(p.maximum, BOUNDS[key].max, `${key}: the schema maximum drifted from the runtime`);
  }
  // The defaults the description promises are the defaults the code applies.
  assert.ok(logging.description.includes(`level \`${DEFAULTS.level}\`, ${DEFAULTS.maxBytes} bytes, ${DEFAULTS.keptFiles} files`),
    'the schema description no longer states the real defaults');
});

// ═══════════════════════════════════════════════════════════════════════
// ③ THE SWEEPER OF `state/` LEAVES EVERY JOURNAL ALONE
// ═══════════════════════════════════════════════════════════════════════
test('③ THE STATE EVICTION NEITHER REMOVES NOR REPORTS ANY JOURNAL FILE — two ceilings, one per class', () => {
  const now = 1_000_000_000;
  const maxAgeMs = 300_000;
  const journalFiles = [];
  for (const j of Object.values(journals())) {
    journalFiles.push(j.file, j.file + '.1', j.file + '.9');
  }
  const ancient = now - 60 * 24 * 3600 * 1000;
  const entries = [
    ...journalFiles.map((name) => ({ name, mtimeMs: ancient })),
    { name: 'plan-sess--inv-1.json', mtimeMs: now - maxAgeMs },
    { name: 'doc-seen-sess.json', mtimeMs: ancient },
  ];
  const verdict = planEviction(entries, { now, maxAgeMs, maxEphemeral: 0, maxDurable: 0 });

  // 🛑 ANTI-VACUITY: the same call must be seen DELETING, or this proves inaction.
  assert.ok(verdict.remove.includes('plan-sess--inv-1.json'), 'the sweep removed nothing at all');
  assert.ok(verdict.remove.includes('doc-seen-sess.json'), 'the count ceiling did not bite');
  assert.strictEqual(journalFiles.length, 6);
  // Sets, so each check is ONE traversal (a `.includes` inside a `.filter` is a nested one).
  const removed = new Set(verdict.remove);
  const unclassified = new Set(verdict.unclassified);
  assert.deepStrictEqual(journalFiles.filter((n) => removed.has(n)), [],
    'a journal file was swept by the STATE eviction, a mechanism that knows nothing of its ceiling');
  assert.deepStrictEqual(journalFiles.filter((n) => unclassified.has(n)), [],
    'a journal file is reported as unclassified — the sweeper accuses a declared, self-bounded writer');
  const notLog = [];
  for (const j of Object.values(journals())) if (!j.file.endsWith('.log')) notLog.push(j.file);
  assert.deepStrictEqual(notLog, [],
    'a journal stopped being a `.log` — the state sweeper now owns it');
});

// ═══════════════════════════════════════════════════════════════════════
// ④ ANTI-INERTNESS — the comparison must accuse a fabricated drift
// ═══════════════════════════════════════════════════════════════════════
test('④ ANTI-INERT: a declaration that disagrees with the bounds is really accused', () => {
  // 🛑 A FABRICATED OFFENDER, IN MEMORY — never `disk-writers.json` on disk.
  const worst = worstCase();
  const agrees = (budget) => budget.maxBytes === worst.bytes && budget.maxFiles === worst.files;
  assert.ok(agrees({ maxFiles: 20, maxBytes: 167772160 }), 'the comparison rejects the TRUE declaration — it is inverted');
  assert.ok(!agrees({ maxFiles: 20, maxBytes: 524288 }), 'the old 512 KB budget passes: the setting could outgrow it in silence');
  assert.ok(!agrees({ maxFiles: 2, maxBytes: 167772160 }), 'a file count the rotation exceeds passes');
  assert.ok(!agrees({ maxFiles: 20 }), 'a declaration with NO size passes — the budget would be optional');
});
