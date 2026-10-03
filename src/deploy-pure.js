// ═══════════════════════════════════════════════════════════════════════
// deploy-pure.js — THE DECISIONS of `tools/deploy.js`, separated from its I/O.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 WHY THIS EXISTS: `tools/doctor.js --deployed <dir>` already SAYS whether the production
//    copy diverges from this repository (`deployedDriftVerdict` in `src/doctor-wiring-pure.js`).
//    It never RECONCILES — that is manual toil, and manual toil is exactly what this project
//    exists to eliminate. This module decides WHAT the shell must do about a drift: refuse, do
//    nothing, or copy. Nothing here touches a disk, a process, or `git` — a shell (`tools/deploy.js`)
//    supplies the three facts it needs and executes the verdict.
//
// ⚠️ CONTRACT: ZERO I/O — no `fs`, no `path`, no `child_process`, no `process.env`, no
//    `process.argv`, no `console`, no `process.exit`. Sealed by `deploy-pure-must-stay-pure`
//    (dependency-cruiser), modelled exactly on `doctor-wiring-pure-must-stay-pure`. Stryker does
//    not mutate test code: a verdict written inside a shell would be UNVERIFIABLE (an inverted
//    condition, a dropped branch, would stay GREEN for ever) — purity is what makes this
//    reconciliation MUTABLE, and mutability is the entire justification for the file existing.
//
// 🛑 THREE NAMED OUTCOMES, NEVER A FOURTH: `refuse` (the tree is dirty, the suite is red, or the
//    drift could not be MEASURED at all) · `nothing` (the deployed copy already matches) ·
//    `copy` (a real, MEASURED drift — carries the exact files to copy, never "copy everything").
// 🛑 AN `unmeasured` VERDICT REFUSES. "I could not measure" is never "it is healthy" — the same
//    law `deployedDriftVerdict` itself already encodes; a reconciliation gesture must not become
//    the ONE caller that treats silence as safety.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

/** @typedef {import('./doctor-wiring-pure').DriftVerdict} DriftVerdict */
/** @typedef {{action: 'refuse', reason: string, detail: string}} RefusePlan */
/** @typedef {{action: 'nothing'}} NothingPlan */
/** @typedef {{action: 'copy', paths: string[]}} CopyPlan */
/** @typedef {RefusePlan|NothingPlan|CopyPlan} DeployPlan */

// ⚠️ CLOSED LIST OF REFUSAL REASONS, machine-checkable by the shell and by tests — a plan is
//    NAMED, never a bare boolean, so `tools/deploy.js` can print WHY without re-deriving it.
const REASONS = ['dirty-tree', 'red-suite', 'unmeasured'];

/**
 * Decides what `tools/deploy.js` must do, from three MEASURED facts:
 *  - `dirtyPaths`: `git status --porcelain` output, ALREADY split into path lines (empty ⇒ clean).
 *  - `suiteOk`: whether the fast test suite exited 0.
 *  - `verdict`: the `DriftVerdict` from `doctor-wiring-pure.deployedDriftVerdict`.
 *
 * ⚠️ ORDER MATTERS AND IS DELIBERATE: a dirty tree is checked BEFORE the suite result, because a
 *    dirty tree means "what would be copied is not what was tested" — running the suite at all
 *    proves nothing about the untracked/modified bytes that would ship. Refusing on the CHEAPER,
 *    FASTER fact first also means a dirty tree never pays for a suite run it cannot trust anyway.
 *
 * @param {{dirtyPaths: string[], suiteOk: boolean, verdict: DriftVerdict}} facts
 * @returns {DeployPlan}
 */
function planDeploy(facts) {
  const dirtyPaths = Array.isArray(facts.dirtyPaths) ? facts.dirtyPaths : [];
  if (dirtyPaths.length > 0) {
    return {
      action: 'refuse',
      reason: 'dirty-tree',
      detail: `the working tree is not clean (${dirtyPaths.length} path(s): ${dirtyPaths.join(', ')}) `
        + '— a deploy copies the WORKING TREE, so an uncommitted change would ship silently unreviewed.',
    };
  }
  if (!facts.suiteOk) {
    return {
      action: 'refuse',
      reason: 'red-suite',
      detail: 'the test suite is RED — a deploy never ships bytes the suite itself refuses to vouch for.',
    };
  }
  const verdict = facts.verdict;
  if (!verdict || verdict.state === 'unmeasured') {
    return {
      action: 'refuse',
      reason: 'unmeasured',
      detail: 'the deployed-drift verdict is UNMEASURED — "I could not measure" is never "it matches", '
        + 'so a deploy never proceeds on an unmeasured comparison.',
    };
  }
  if (verdict.state === 'match') return { action: 'nothing' };
  return { action: 'copy', paths: verdict.paths };
}

module.exports = { REASONS, planDeploy };
