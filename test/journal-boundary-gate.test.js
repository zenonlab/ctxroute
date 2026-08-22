// ═══════════════════════════════════════════════════════════════════════
// THE BOUNDED JOURNAL AT ITS TWO BOUNDARIES — the manifest, and the sweeper
// ═══════════════════════════════════════════════════════════════════════
//
// 🛑 WHAT IS ALREADY PROVEN ELSEWHERE, AND IS NOT REDONE HERE:
//    `lifecycle-log-pure.test.js` proves the ceiling and the closed vocabulary,
//    `lifecycle-log.test.js` proves by OVERFLOW that two files and 512 KB are
//    all the disk ever holds. Both look INSIDE the component. This suite is the
//    pair of contracts that live at its FRONTIERS, where nothing was looking:
//
//    ① `disk-writers.json` DECLARES a budget for this writer, and the code
//       ENFORCES one. Two places for one number — the exact class this
//       repository was built around. Nothing tied them: raising `MAX_BYTES` to
//       1 MB left the manifest saying 512 KB, the disk-writer gate green (it
//       checks that a budget EXISTS, never that it is the true one) and the
//       declared space of the machine wrong, in silence. A declaration that can
//       drift from what it declares is a DORMANT PERMIT.
//
//    ② `state-eviction.js` sweeps `state/` — the very directory this journal
//       lives in — and it must NOT touch it. Two ceilings, one per class: the
//       stores are bounded by COUNT (right for a store, wrong for an
//       append-only file), the journal bounds ITSELF by SIZE through its own
//       rotation. That split was written in prose in three files and guarded by
//       nothing. Teach the sweeper `.log`, or rename the journal to `.json`,
//       and the file would be deleted by a mechanism that knows nothing of its
//       ceiling — the component would lose the trace of a death for a reason
//       nobody would look for.
//
// 🛑 THIS SUITE SAYS NOTHING ABOUT WHERE THE STATE LIVES, ON PURPOSE. Work item
//    M turns the daemon from OWNER of the state into a WRITE-THROUGH CACHE over
//    the disk; sealing the storage layout would freeze the architecture that is
//    about to move. What is sealed here is the journal's BUDGET and the
//    sweeper's REFUSAL to touch a `.log` — both true on either side of M.
//
// ⚠️ perTest: every fixture is built INSIDE its `test()` callback.
// ⚠️ Expectations are written out LITERALLY, copied from the source — never
//    `toBe(MODULE.CONSTANT)`, which mutates with the code and proves `x === x`.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

import { test } from 'vitest';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { MAX_BYTES, KEPT_FILES, TOTAL_MAX_BYTES } from '../src/lifecycle-log-pure.js';
import { FILE_NAME } from '../src/lifecycle-log.js';
import { planEviction } from '../src/state-eviction-pure.js';

const ROOT = path.join(import.meta.dirname, '..');

// The writer as `disk-writers.json` keys it. A rename that missed the manifest
// would leave the declaration pointing at nothing, which is why the lookup is a
// NAMED REFUSAL below and never an empty pass.
const DECLARED_AS = 'src/lifecycle-log.js';

// ═══════════════════════════════════════════════════════════════════════
// ① THE DECLARED CEILING IS THE ENFORCED CEILING
// ═══════════════════════════════════════════════════════════════════════
test('① THE MANIFEST DECLARES EXACTLY WHAT THE CODE ENFORCES — 2 files, 524 288 bytes', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'disk-writers.json'), 'utf8'));
  const writers = manifest.writers || manifest;
  const decl = writers[DECLARED_AS];
  // 🛑 NAMED REFUSAL, never a skip: a declaration that cannot be found is
  //    indistinguishable from a declaration that agrees.
  assert.ok(decl, `\`${DECLARED_AS}\` has no entry in disk-writers.json — the journal writes undeclared space`);
  assert.ok(decl.budget, `\`${DECLARED_AS}\` is declared without a budget — an unbounded writer does not exist`);

  // The CODE's side, literally. 256 KB per file × exactly 2 files, and the "2"
  // is not a policy but a CONSEQUENCE: the rotation renames onto `.1`, and a
  // rename overwrites.
  assert.strictEqual(MAX_BYTES, 262144, 'the per-file ceiling moved');
  assert.strictEqual(KEPT_FILES, 2, 'the journal no longer keeps exactly one predecessor');
  assert.strictEqual(TOTAL_MAX_BYTES, 524288, 'the whole-component ceiling moved');

  // The MANIFEST's side, literally.
  assert.strictEqual(decl.budget.maxFiles, 2, 'the manifest declares a file count the rotation cannot produce');
  assert.strictEqual(decl.budget.maxBytes, 524288, 'the manifest declares a size the rotation does not enforce');

  // 🛑 AND THE TWO TIED TOGETHER — this is the cell's reason to exist. Both
  //    sides above could be edited in one gesture; this one reddens whichever
  //    side moves alone, which is the only way a drift can start.
  assert.strictEqual(decl.budget.maxBytes, MAX_BYTES * KEPT_FILES,
    'the DECLARED budget and the ENFORCED ceiling have drifted: the manifest is now a dormant permit,'
    + ' and the machine\'s declared space is wrong by the difference');
  assert.strictEqual(decl.budget.maxFiles, KEPT_FILES,
    'the manifest and the rotation disagree on how many files can ever exist');
});

// ═══════════════════════════════════════════════════════════════════════
// ② THE SWEEPER OF `state/` LEAVES THE JOURNAL ALONE
// ═══════════════════════════════════════════════════════════════════════
test('② THE STATE EVICTION NEITHER REMOVES NOR REPORTS THE JOURNAL — two ceilings, one per class', () => {
  // The REAL names, taken from the writer itself: a copy typed here would keep
  // agreeing with itself after the file was renamed.
  const journal = FILE_NAME;
  const rotated = FILE_NAME + '.1';
  const now = 1_000_000_000;
  const maxAgeMs = 300_000;
  // Both journal files are ANCIENT — far past the age bound that condemns an
  // ephemeral key — and the ceilings are set to zero, so every count-based
  // pressure is at its maximum. Nothing may still reach them.
  const entries = [
    { name: journal, mtimeMs: now - 30 * 24 * 3600 * 1000 },
    { name: rotated, mtimeMs: now - 60 * 24 * 3600 * 1000 },
    { name: 'plan-sess--inv-1.json', mtimeMs: now - maxAgeMs },
    { name: 'doc-seen-sess.json', mtimeMs: now - 30 * 24 * 3600 * 1000 },
  ];
  const verdict = planEviction(entries, { now, maxAgeMs, maxEphemeral: 0, maxDurable: 0 });

  // 🛑 ANTI-VACUITY, AND IT IS THE HALF THAT MAKES THE CELL MEAN ANYTHING: a
  //    sweeper that removed NOTHING would satisfy every assertion below and
  //    prove no restraint at all. The same call must be seen DELETING.
  assert.ok(verdict.remove.includes('plan-sess--inv-1.json'),
    'the sweep removed nothing at all — this cell would then prove no restraint, only inaction');
  assert.ok(verdict.remove.includes('doc-seen-sess.json'),
    'the count ceiling did not bite — the pressure this cell puts the journal under is not real');

  for (const name of [journal, rotated]) {
    assert.ok(!verdict.remove.includes(name),
      `${name} was swept by the STATE eviction: an append-only journal deleted by a COUNT ceiling,`
      + ' i.e. by a mechanism that knows nothing of the 512 KB bound it already respects');
    // Nor reported as an undeclared writer: it IS declared, in disk-writers.json,
    // and a permanent line of noise is how an alarm stops being read.
    assert.ok(!verdict.unclassified.includes(name),
      `${name} is reported as unclassified — the sweeper is accusing a declared, self-bounded writer`);
  }

  // The journal is a `.log`, and that is what keeps it out of a `.json` sweep.
  // Written here because a rename to `.json` would make it evictable overnight.
  assert.ok(journal.endsWith('.log'), 'the journal stopped being a `.log` — the state sweeper now owns it');
});

// ═══════════════════════════════════════════════════════════════════════
// ③ ANTI-INERTNESS — the comparison must accuse a fabricated drift
// ═══════════════════════════════════════════════════════════════════════
test('③ ANTI-INERT: a declaration that disagrees with the code is really accused', () => {
  // 🛑 A FABRICATED OFFENDER, IN MEMORY — never `disk-writers.json` on disk. A
  //    sabotage of a real file brought down 38 tests of parallel suites here on
  //    2026-07-31, and a green obtained from a file that was never modified
  //    proves nothing at all.
  const agrees = (budget) => budget.maxBytes === MAX_BYTES * KEPT_FILES && budget.maxFiles === KEPT_FILES;
  assert.ok(agrees({ maxFiles: 2, maxBytes: 524288 }), 'the comparison rejects the TRUE declaration — it is inverted');
  assert.ok(!agrees({ maxFiles: 2, maxBytes: 1048576 }), 'a doubled budget passes: the ceiling could be raised in silence');
  assert.ok(!agrees({ maxFiles: 4, maxBytes: 524288 }), 'a `.1 .2 .3` scheme passes: the bound stopped being structural');
  assert.ok(!agrees({ maxFiles: 2 }), 'a declaration with NO size passes — the budget would be optional');
});
