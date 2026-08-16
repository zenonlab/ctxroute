// ═══════════════════════════════════════════════════════════════════════
// THE DEADLINE MUST NEVER KILL LEGITIMATE WORK — MEASURED UNDER LOAD
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ REAL REGRESSION, IN PROD, ON 15/07/2026 — this test IS its proof.
//    The deadline was 2000 ms, "justified" by reasoning that was NEVER measured
//    ("the delay is never paid in the normal case"). Under 24 parallel
//    spawns: 19/24 `protect-files.js` exited BEFORE having injected.
//    Silently uninjected docs — THE class of bug this framework
//    exists to kill, reintroduced by its own safeguard.
//
// ⚠️ THE MISTAKE NOT TO REPEAT: `.unref()` prevents the timer from HOLDING the event
//    loop; it does NOT prevent it from FIRING during work in progress.
//    The "normal" case of a loaded machine is NOT the "broken" case.
//
// ⚠️ WHY UNDER LOAD AND NOT AT REST: at rest, 2000 ms passed. The bug
//    only appears under CPU contention (node boot ~1 s at rest, far more
//    at 12+ spawns). A test at rest would have certified the broken threshold.
//    NEVER replace this test with a "faster" version without load.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { DEFAULT_MS } from '../src/deadline';

const PARC = path.join(os.homedir(), '.claude', 'hooks');
const LEGACY = path.join(PARC, 'protect-files.js');
const skip = !fs.existsSync(LEGACY) && 'no protect-files.js (fresh clone)';

const N = 24; // ⚠️ ≥ 2× the cores: it is the CONTENTION that reveals the bug.

test('THRESHOLD — the deadline bounds the infinite, it optimizes nothing', { timeout: 60000 }, () => {
  // ⚠️ Gate on the VALUE itself: 2000 ms caused a real outage.
  //    A tight threshold kills legitimate work SILENTLY — worse than the zombie
  //    it claims to avoid. The zombies lived 20 h: 30 s is already 2400× better.
  assert.ok(
    DEFAULT_MS >= 15000,
    `DEFAULT_MS=${DEFAULT_MS} — threshold too tight. It will kill legitimate work under load ` +
      `(measured on 15/07/2026: 2000 ms → 19/24 hooks exited without injecting). ` +
      `NEVER lower it without re-running THIS test under load.`
  );
});

// ⚠️ The probed path is DERIVED from the real rules, never written by hand:
//    the 1st version targeted `protect-files.js`, which matches NO rule → 0 doc
//    → "24/24 empty" → a false RED accusing the deadline. A test must VALIDATE ITS
//    OWN SETUP before measuring, otherwise it does not distinguish "the remedy kills"
//    from "there was nothing to inject".
function cheminQuiMatche() {
  const { rules } = JSON.parse(fs.readFileSync(path.join(PARC, 'protected-paths.json'), 'utf8'));
  const r = rules.find((x) => typeof x.pattern === 'string' && x.pattern.endsWith('.js') && !x.scope);
  return r ? path.join(os.homedir(), 'Desktop', r.pattern) : null;
}

function lance(payload) {
  return new Promise((resolve) => {
    const c = execFile(process.execPath, [LEGACY], { cwd: PARC, encoding: 'utf8' }, (_e, out) => resolve(out || ''));
    c.stdin.end(payload);
  });
}

test.skipIf(skip)('UNDER LOAD — the armed hooks ALWAYS inject (0 empty output)', { timeout: 60000 }, async () => {
  const cible = cheminQuiMatche();
  assert.ok(cible, 'no usable rule found — the test would be blind');
  const payload = JSON.stringify({ tool_name: 'Read', tool_input: { file_path: cible } });

  // ⚠️ MANDATORY SELF-VALIDATION: at rest, this payload MUST inject. Without this
  //    check, a payload that matches nothing would make the test green-blind under
  //    load (0 injected = 0 "lost to the deadline"… and 0 proof).
  const temoin = await lance(payload);
  assert.match(temoin, /\[source:/, `invalid setup: ${cible} injects nothing AT REST — the test would prove nothing`);

  // ⚠️ ALL launched at once, NEVER in a pool: the contention IS the subject of the test.
  const sorties = await Promise.all(Array.from({ length: N }, () => lance(payload)));

  const vides = sorties.filter((o) => !o.includes('[source:')).length;
  assert.strictEqual(
    vides,
    0,
    `${vides}/${N} hooks exited WITHOUT injecting under load → the deadline kills legitimate ` +
      `work. The doc is no longer injected, SILENTLY. Raise DEFAULT_MS (current: ${DEFAULT_MS} ms).`
  );
});
