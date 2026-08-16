// ═══════════════════════════════════════════════════════════════════════
// A GLOBAL THRESHOLD IS BLIND TO ONE FILE COLLAPSING (㉞, 08/08/2026)
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 THE REAL DEFECT, AND IT IS NOT THE ONE THE BACKLOG ANNOUNCED.
//    The backlog (㉞) said: "INCREMENTAL mutation hides survivors ⇒ we would
//    need a periodic full pass". **Two mistakes**, both corrected by the
//    measurement of 08/08/2026:
//      ① the full pass ALREADY EXISTS — `mutation.yml` does `npm ci` on a
//         fresh clone and restores NO incremental cache (0 occurrence of
//         `incremental` in the workflow), so the CI mutates EVERYTHING on
//         every push touching a mutated module. The false green was LOCAL,
//         not in CI;
//      ② and despite that, `canary.js` stayed at **89.23 % with 7 survivors**
//         without the CI flinching — because Stryker's `thresholds.break` is
//         **GLOBAL**: a 99.64 % average drowned the collapse.
//    ⇒ What was missing was not the frequency of the passes, it is the
//      GRANULARITY of the verdict. That is exactly class ㉟: *what a gate
//      draws its list from (here: ONE aggregated number) defines its blind
//      spot.*
//
// ⚠️ MEASURED BEFORE BEING WRITTEN (repo rule). Real distribution of the 16
//    mutated modules on 08/08/2026: **15 at 100.00 %**, `canary.js` alone
//    below — and its last 4 survivors were the 4 mutants of a DEAD function
//    (`occurrences`, no caller, not exported), deleted in the same gesture
//    rather than covered. ⇒ a floor at 100 held by all, **zero exemption**.
//    A floor that needs exceptions from day one is a floor that will be
//    lowered on day two.
//
// 🛑 THE FLOOR DOES NOT REPLACE `break`, IT COMPLETES IT: `break` protects the
//    AVERAGE (a general collapse), this gate protects EACH file (a local
//    collapse). Removing one and keeping the other leaves a blind spot.
//
// ⚠️ MUTE IF THE REPORT DOES NOT EXIST — and that is INTENDED: `npm test` does
//    not run Stryker (doctrine: a gate is never blocking, mutation runs
//    separately). Requiring the report would make every suite launched
//    without a prior mutation run go red, hence a permanent red, hence a gate
//    people stop reading. The report EXISTS in the mutation CI (the job
//    writes `reports/mutation.json`) and locally after
//    `npm run test:mutation`: that is where it bites.

'use strict';

import { test } from 'vitest';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ⚠️ RATCHET: 100, never less. Measured as reachable by the 16 modules.
//    NEVER lower it to make a red pass — a survivor is KILLED (targeted test)
//    or ELIMINATED (dead code deleted, cf `occurrences`), it is not tolerated.
//    Repo doctrine: the ratchet never goes back down.
const PLANCHER = 100;

// ⚠️ `Timeout` counts as KILLED (Stryker contract: a mutant going into an
//    infinite loop is detected). `Ignored` leaves the denominator — it is a
//    DELIBERATE `// Stryker disable` justified in the code.
const TUE = new Set(['Killed', 'Timeout', 'CompileError']);

/**
 * Returns the files below the floor, or `null` if the question does not arise
 * (report absent/unreadable). ⚠️ `null` = OUT OF SCOPE, never "healthy".
 */
function sousPlancher(rapport, plancher) {
  if (!rapport || typeof rapport !== 'object' || !rapport.files) return null;
  const fautifs = [];
  for (const [file, donnees] of Object.entries(rapport.files)) {
    const mutants = (donnees && donnees.mutants) || [];
    let tues = 0;
    let total = 0;
    for (const m of mutants) {
      if (!m || m.status === 'Ignored') continue;
      total++;
      if (TUE.has(m.status)) tues++;
    }
    if (total === 0) continue; // file without mutants: nothing to judge
    const score = (tues / total) * 100;
    if (score < plancher) {
      fautifs.push(`${file}: ${score.toFixed(2)} % (${total - tues} survivor(s) out of ${total})`);
    }
  }
  return fautifs;
}

test('㉞ — no mutated module falls below the per-file floor', () => {
  let rapport = null;
  try {
    rapport = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'reports', 'mutation.json'), 'utf8'));
  } catch {
    return; // report absent = out of scope (cf the header comment)
  }
  const fautifs = sousPlancher(rapport, PLANCHER);
  if (fautifs === null) return;
  assert.deepStrictEqual(fautifs, [],
    'PER-FILE collapse, invisible to Stryker\'s global threshold:\n  '
    + fautifs.join('\n  ')
    + '\n  ⇒ KILL the survivor (targeted test) or ELIMINATE the dead code. NEVER lower the floor.');
});

test('㉞ NEGATIVE — the floor really bites, and really stays silent', () => {
  // ⚠️ IN MEMORY: we never sabotage the real report, other suites and the CI
  //    read it. FABRICATED reports, no file touched.
  const rap = (statuts) => ({ files: { 'x.js': { mutants: statuts.map((s) => ({ status: s })) } } });

  // ① THE REAL CASE: canary.js at 89.23 % while the global held 99.64 %.
  const effondre = sousPlancher(rap(['Killed', 'Survived']), 100);
  assert.strictEqual(effondre.length, 1, 'the gate does not see a survivor: it is INERT');
  assert.ok(/50\.00 %/.test(effondre[0]), 'the message must give the real score, not just "failure"');

  // ② Counter-check: everything killed ⇒ silence.
  assert.deepStrictEqual(sousPlancher(rap(['Killed', 'Killed']), 100), []);

  // ③ `Timeout` = KILLED (Stryker contract), otherwise we would go red on healthy code.
  assert.deepStrictEqual(sousPlancher(rap(['Killed', 'Timeout']), 100), []);

  // ④ `Ignored` leaves the denominator: a justified `Stryker disable` must
  //    NEVER drag the score down, otherwise we punish a deliberate exemption.
  assert.deepStrictEqual(sousPlancher(rap(['Killed', 'Ignored']), 100), []);

  // ⑤ A file WITHOUT mutants = nothing to judge (0/0 is not 0 %).
  assert.deepStrictEqual(sousPlancher({ files: { 'v.js': { mutants: [] } } }, 100), []);

  // ⑥ TOTALITY: report absent/malformed ⇒ out of scope, never a crash nor a
  //    silent false green mistaken for a real one.
  for (const x of [null, undefined, 42, {}, { files: null }]) {
    assert.strictEqual(sousPlancher(x, 100), null, `sousPlancher(${JSON.stringify(x)})`);
  }
});
