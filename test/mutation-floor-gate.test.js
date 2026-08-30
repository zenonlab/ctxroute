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
const FLOOR = 100;

// ⚠️ `Timeout` counts as KILLED (Stryker contract: a mutant going into an
//    infinite loop is detected). `Ignored` leaves the denominator — it is a
//    DELIBERATE `// Stryker disable` justified in the code.
const TUE = new Set(['Killed', 'Timeout', 'CompileError']);

/**
 * 🔴 THE HOLLOW GREEN THIS CLOSES, MEASURED 2026-08-30 — AND IT LASTED WEEKS.
 *    `belowFloor` judges the files it FINDS in the report. A local run is always
 *    `--mutate <one file>`, so the report only ever holds what the incremental
 *    cache already knew: **28 files against the 42 `mutate` declares**. The 14
 *    missing ones were not green, they were ABSENT — and the gate said nothing.
 *    The CI, which mutates everything, reported 177 survivors across five of
 *    them the same day, while this gate was GREEN locally on the same commit.
 * 🛑 A REPORT THAT DOES NOT COVER EVERY DECLARED MODULE PROVES NOTHING, and that
 *    is decidable: `stryker.conf.json` holds the list. Missing file ⇒ RED, named.
 *    Never "skip the ones we did not run" — that is the hollow green rebuilt.
 * ⚠️ DERIVED from the config, never a hand list: a module added to `mutate`
 *    tomorrow enters this check by itself.
 * @param {{files?: Record<string, unknown>}|null} rapport
 * @param {string[]} declares the `mutate` entries of stryker.conf.json
 * @returns {string[]|null} the declared files absent from the report, or null
 *   when the question does not arise (no report, no declaration)
 */
function missingFromReport(rapport, declares) {
  if (!rapport || typeof rapport !== 'object' || !rapport.files) return null;
  if (!Array.isArray(declares) || declares.length === 0) return null;
  const present = new Set(Object.keys(rapport.files));
  return declares.filter((f) => !present.has(f));
}
/**
 * Returns the files below the floor, or `null` if the question does not arise
 * (report absent/unreadable). ⚠️ `null` = OUT OF SCOPE, never "healthy".
 */
function belowFloor(rapport, floor) {
  if (!rapport || typeof rapport !== 'object' || !rapport.files) return null;
  const offending = [];
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
    if (score < floor) {
      offending.push(`${file}: ${score.toFixed(2)} % (${total - tues} survivor(s) out of ${total})`);
    }
  }
  return offending;
}

// 🛑 WHERE A PARTIAL REPORT IS A DEFECT, AND WHERE IT IS SIMPLY THE NORMAL DAY.
//    In CI the run mutates EVERYTHING, so a missing module means the run did not
//    finish or the config drifted — a real defect, RED. Locally every run is
//    `--mutate <one file>` BY DOCTRINE (an exhaustive run does not fit an agent
//    session), so a partial report is the NORMAL state and reddening on it would
//    give a cell that shouts on every developer run — and a cell that shouts
//    always is a cell that gets disarmed. **TRI-STATE, never a quiet green:**
//    complete ⇒ judged · partial in CI ⇒ RED · partial locally ⇒ a NAMED skip,
//    the same idiom `resolutionFloorHolds` uses in the scale bench.
// ⚠️ `process.env.CI` is set by GitHub Actions (and by every CI provider); its
//    ABSENCE is what marks a developer machine. This is not a harness dialect
//    leaking into the engine — it is a TEST asking which authority it is running
//    under, and the CI is the only one whose report can be complete.
const EN_CI = process.env.CI === 'true' || process.env.CI === '1';

test('㉞bis — the report COVERS every module `mutate` declares, or it proves nothing', (ctx) => {
  let rapport = null;
  let conf = null;
  try {
    rapport = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'reports', 'mutation.json'), 'utf8'));
    conf = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'stryker.conf.json'), 'utf8'));
  } catch {
    return; // no report or no config = out of scope, same rule as the cell below
  }
  const missing = missingFromReport(rapport, conf.mutate);
  if (missing === null) return;
  if (missing.length > 0 && !EN_CI) {
    ctx.skip('UNJUDGED: this report covers ' + Object.keys(rapport.files).length
      + ' of the ' + conf.mutate.length + ' declared modules, so the per-file floor below judges only part of the project. Normal for a targeted local run — the COMPLETE verdict is the CI\'s. Never read the next cell\'s green as "everything is at 100 %".');
    return;
  }
  assert.deepStrictEqual(missing, [],
    'HOLLOW GREEN: the per-file floor judged only '
    + Object.keys(rapport.files).length + ' of the ' + conf.mutate.length
    + ' modules `mutate` declares. These were never judged:\n  '
    + missing.join('\n  ')
    + '\n  ⇒ the report comes from a TARGETED run (`--mutate <one file>`), whose'
    + ' incremental cache holds only part of the project. Regenerate a COMPLETE'
    + ' report (CI, or `--force` with no `--mutate`) before trusting any score.'
    + ' NEVER narrow this check to the files that happen to be present.');
});

test('㉞bis NEGATIVE — the completeness check really bites, and really stays silent', () => {
  // ⚠️ IN MEMORY, never the real report: other suites and the CI read it.
  const rap = { files: { 'a.js': { mutants: [] }, 'b.js': { mutants: [] } } };
  assert.deepStrictEqual(missingFromReport(rap, ['a.js', 'b.js']), [],
    'a complete report must be silent');
  assert.deepStrictEqual(missingFromReport(rap, ['a.js', 'b.js', 'c.js']), ['c.js'],
    'the check does not see an absent module: it is INERT');
  // out of scope, never "healthy"
  for (const x of [null, undefined, 42, {}, { files: null }]) {
    assert.strictEqual(missingFromReport(x, ['a.js']), null);
  }
  assert.strictEqual(missingFromReport(rap, []), null, 'no declaration = no question');
  assert.strictEqual(missingFromReport(rap, null), null);
});
test('㉞ — no mutated module falls below the per-file floor', () => {
  let rapport = null;
  try {
    rapport = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'reports', 'mutation.json'), 'utf8'));
  } catch {
    return; // report absent = out of scope (cf the header comment)
  }
  const offending = belowFloor(rapport, FLOOR);
  if (offending === null) return;
  assert.deepStrictEqual(offending, [],
    'PER-FILE collapse, invisible to Stryker\'s global threshold:\n  '
    + offending.join('\n  ')
    + '\n  ⇒ KILL the survivor (targeted test) or ELIMINATE the dead code. NEVER lower the floor.');
});

test('㉞ NEGATIVE — the floor really bites, and really stays silent', () => {
  // ⚠️ IN MEMORY: we never sabotage the real report, other suites and the CI
  //    read it. FABRICATED reports, no file touched.
  const rap = (statuses) => ({ files: { 'x.js': { mutants: statuses.map((s) => ({ status: s })) } } });

  // ① THE REAL CASE: canary.js at 89.23 % while the global held 99.64 %.
  const collapsed = belowFloor(rap(['Killed', 'Survived']), 100);
  assert.strictEqual(collapsed.length, 1, 'the gate does not see a survivor: it is INERT');
  assert.ok(/50\.00 %/.test(collapsed[0]), 'the message must give the real score, not just "failure"');

  // ② Counter-check: everything killed ⇒ silence.
  assert.deepStrictEqual(belowFloor(rap(['Killed', 'Killed']), 100), []);

  // ③ `Timeout` = KILLED (Stryker contract), otherwise we would go red on healthy code.
  assert.deepStrictEqual(belowFloor(rap(['Killed', 'Timeout']), 100), []);

  // ④ `Ignored` leaves the denominator: a justified `Stryker disable` must
  //    NEVER drag the score down, otherwise we punish a deliberate exemption.
  assert.deepStrictEqual(belowFloor(rap(['Killed', 'Ignored']), 100), []);

  // ⑤ A file WITHOUT mutants = nothing to judge (0/0 is not 0 %).
  assert.deepStrictEqual(belowFloor({ files: { 'v.js': { mutants: [] } } }, 100), []);

  // ⑥ TOTALITY: report absent/malformed ⇒ out of scope, never a crash nor a
  //    silent false green mistaken for a real one.
  for (const x of [null, undefined, 42, {}, { files: null }]) {
    assert.strictEqual(belowFloor(x, 100), null, `sousPlancher(${JSON.stringify(x)})`);
  }
});
