// ═══════════════════════════════════════════════════════════════════════
// STATE-EVICTION — the SHELL: it lists, it deletes, it decides NOTHING.
// ═══════════════════════════════════════════════════════════════════════
//
// 🛑 EVERY RULE LIVES IN `state-eviction-pure.js`. This file may only read the
//    directory, hand the listing over, and unlink what it is told to unlink.
//    Putting a condition here would put it out of Stryker's reach, and an
//    unmutated rule about disk growth is the false gate that reassures while the
//    disk fills.
// ⚠️ FAIL-OPEN, TOTAL, AND THE ASYMMETRY IS THE REASON: a failed eviction costs
//    disk (recoverable, and the next sweep retries); an eviction that throws
//    costs the agent its turn. Every error is swallowed, per file and globally.
// ⚠️ NO CLOCK OF ITS OWN BEYOND `Date.now()`, no timer, no background process.
//    The sweep runs INSIDE a hook that was already going to run (see
//    `turn-count.js`); it never schedules anything.
// ⚠️ `stateDir()` is resolved LAZILY at call time (paths.js doctrine): freezing
//    it in a const would ignore the env override a test or the doctor sets.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const fs = require('fs');
const path = require('path');
const paths = require('./paths');
const pure = require('./state-eviction-pure');
// ⚠️ THE AGE BOUND IS DERIVED FROM THE DEADLINE, HERE AND NOWHERE ELSE. The
//    pure module may not import `deadline.js` (it arms a timer and exits the
//    process); the shell may, and it is the only place the two numbers meet —
//    so lowering the deadline tightens the bound automatically, and no second
//    figure exists to drift.
const deadline = require('./deadline');

/**
 * SWEEP `state/` ONCE. Returns what was ACTUALLY removed — never "it ran".
 * @param {{dir?: string, now?: number, maxAgeMs?: number}} [options]
 * @returns {{removed: string[], unclassified: string[], failed: string[]}}
 */
function sweep(options) {
  const o = options || {};
  const dir = o.dir || paths.stateDir();
  const result = { removed: [], unclassified: [], failed: [] };
  let noms;
  try {
    noms = fs.readdirSync(dir);
  } catch {
    // No state directory yet (a fresh install, a test tmpdir) — nothing to do.
    return result;
  }

  const entries = [];
  for (const nom of noms) {
    let st;
    try {
      st = fs.statSync(path.join(dir, nom));
    } catch {
      // Vanished between the listing and the stat: someone else removed it, or
      // a rename crossed us. Absence is the outcome we wanted anyway.
      continue;
    }
    // ⚠️ FILES ONLY. `.lock-*` entries are DIRECTORIES (`lock.js` uses
    //    `mkdirSync` as the cross-process primitive): deleting one would break
    //    the mutual exclusion of a live writer.
    if (!st.isFile()) continue;
    entries.push({ name: nom, mtimeMs: st.mtimeMs });
  }

  let plan;
  try {
    plan = pure.planEviction(entries, {
      now: o.now === undefined ? Date.now() : o.now,
      maxAgeMs: o.maxAgeMs === undefined ? pure.ageBound(deadline.DEFAULT_MS) : o.maxAgeMs,
    });
  } catch {
    // A refusal from the decision (a missing bound) must not break the hook.
    return result;
  }

  for (const nom of plan.remove) {
    try {
      fs.unlinkSync(path.join(dir, nom));
      result.removed.push(nom);
    } catch {
      // Held by another process (Windows), or already gone. The next sweep
      // retries; a cleaner that throws is worse than a cleaner that waits.
      result.failed.push(nom);
    }
  }
  result.unclassified = plan.unclassified;
  return result;
}

module.exports = { sweep };
