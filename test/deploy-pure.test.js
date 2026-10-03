// ═══════════════════════════════════════════════════════════════════════
// deploy-pure — the DECISION half of `tools/deploy.js`.
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ IMPORTED DIRECTLY, never through a re-export: a CJS edge behind a re-export is invisible to
//    vitest's module graph, and Stryker then runs NO test at all against this file while the
//    score reads perfectly (measured on the `keys` operator: 62 phantom survivors).
// ⚠️ perTest coverage: EVERY fixture is built INSIDE its `test()` callback — no module-level const
//    calling the mutated code (a STATIC mutant covered by no test; 42 false survivors were
//    measured on that exact mistake in this repository).
// ⚠️ Expected values are written out LITERALLY. Never `toBe(MODULE.CONSTANT)`: that proves
//    `x === x` and leaves the contract unasserted (43 survivors, measured 2026-08-21).
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert/strict';

import { REASONS, planDeploy } from '../src/deploy-pure.js';

test('REASONS is the closed, exact vocabulary of refusal reasons', () => {
  assert.deepEqual(REASONS, ['dirty-tree', 'red-suite', 'unmeasured']);
});

test('a dirty tree refuses, even with a green suite and a matching verdict', () => {
  const plan = planDeploy({
    dirtyPaths: ['M src/gate.js'],
    suiteOk: true,
    verdict: { state: 'match', count: 3 },
  });
  assert.equal(plan.action, 'refuse');
  assert.equal(plan.reason, 'dirty-tree');
  assert.match(plan.detail, /1 path\(s\): M src\/gate\.js/);
});

test('a dirty tree refuses BEFORE the suite result is even consulted', () => {
  // ⚠️ ORDER: dirty tree wins over a red suite too — this is the cheaper, faster fact and it is
  //    checked first BY DESIGN (a dirty tree makes the suite result untrustworthy anyway).
  const plan = planDeploy({
    dirtyPaths: ['?? untracked.js'],
    suiteOk: false,
    verdict: { state: 'unmeasured' },
  });
  assert.equal(plan.action, 'refuse');
  assert.equal(plan.reason, 'dirty-tree');
});

test('several dirty paths are ALL named, never just a count', () => {
  const plan = planDeploy({
    dirtyPaths: ['M a.js', 'M b.js', '?? c.js'],
    suiteOk: true,
    verdict: { state: 'match', count: 1 },
  });
  assert.equal(plan.reason, 'dirty-tree');
  assert.match(plan.detail, /3 path\(s\): M a\.js, M b\.js, \?\? c\.js/);
});

test('a red suite refuses on a clean tree', () => {
  const plan = planDeploy({
    dirtyPaths: [],
    suiteOk: false,
    verdict: { state: 'match', count: 5 },
  });
  assert.equal(plan.action, 'refuse');
  assert.equal(plan.reason, 'red-suite');
  assert.match(plan.detail, /RED/);
});

test('an UNMEASURED verdict refuses — "could not measure" is never "it matches"', () => {
  const plan = planDeploy({
    dirtyPaths: [],
    suiteOk: true,
    verdict: { state: 'unmeasured' },
  });
  assert.equal(plan.action, 'refuse');
  assert.equal(plan.reason, 'unmeasured');
});

test('every refusal carries its WHOLE reason — the detail is contract, not decoration', () => {
  // Copied from the source, never rebuilt from memory: an operator reads this text to know
  // WHY a delivery did not happen, and a half-erased sentence is a refusal nobody can act on.
  const dirty = planDeploy({ dirtyPaths: ['M a.js'], suiteOk: true, verdict: { state: 'match' } });
  assert.equal(dirty.detail, 'the working tree is not clean (1 path(s): M a.js) '
    + '— a deploy copies the WORKING TREE, so an uncommitted change would ship silently unreviewed.');
  const red = planDeploy({ dirtyPaths: [], suiteOk: false, verdict: { state: 'match' } });
  assert.equal(red.detail,
    'the test suite is RED — a deploy never ships bytes the suite itself refuses to vouch for.');
  const unmeasured = planDeploy({ dirtyPaths: [], suiteOk: true, verdict: { state: 'unmeasured' } });
  assert.equal(unmeasured.detail,
    'the deployed-drift verdict is UNMEASURED — "I could not measure" is never "it matches", '
    + 'so a deploy never proceeds on an unmeasured comparison.');
});

test('a missing verdict (undefined/null) is treated as unmeasured, never a crash', () => {
  const plan = planDeploy({ dirtyPaths: [], suiteOk: true, verdict: undefined });
  assert.equal(plan.action, 'refuse');
  assert.equal(plan.reason, 'unmeasured');
});

test('a MATCH verdict, clean tree, green suite ⇒ nothing to do', () => {
  const plan = planDeploy({
    dirtyPaths: [],
    suiteOk: true,
    verdict: { state: 'match', count: 12 },
  });
  assert.deepEqual(plan, { action: 'nothing' });
});

test('a DRIFT verdict, clean tree, green suite ⇒ copy EXACTLY the drifted paths', () => {
  const plan = planDeploy({
    dirtyPaths: [],
    suiteOk: true,
    verdict: { state: 'drift', count: 4, paths: ['src/gate.js', 'src/lock.js'] },
  });
  assert.deepEqual(plan, { action: 'copy', paths: ['src/gate.js', 'src/lock.js'] });
});

test('dirtyPaths defaults to empty when the field is missing, never a crash', () => {
  const plan = planDeploy({ suiteOk: true, verdict: { state: 'match', count: 1 } });
  assert.deepEqual(plan, { action: 'nothing' });
});

test('a non-array dirtyPaths does not crash and is treated as clean', () => {
  const plan = planDeploy({
    dirtyPaths: null,
    suiteOk: true,
    verdict: { state: 'drift', count: 1, paths: ['src/x.js'] },
  });
  assert.deepEqual(plan, { action: 'copy', paths: ['src/x.js'] });
});
