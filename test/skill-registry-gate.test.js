// ═══════════════════════════════════════════════════════════════════════
// GATE — every skill of the config.skills registry EXISTS in the harness.
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ The `config.skills` registry names skills BY NAME (key). Renaming or
//    deleting a skill without updating the registry = a pointer firing "load
//    skill X" while X no longer exists = a phantom pointer, discovered in
//    production. This gate makes it RED at pre-push (the sealed "sync word").
//
// ⚠️ Skill location = HARNESS-SPECIFIC (Claude Code:
//    ~/.claude/commands/{name}.md). This is the only line that "knows the
//    harness" — the rest of the engine stays agnostic. A Codex port = a
//    variant of THIS gate pointing at Codex's skill store.
//
// 🔴 IT WAS RED ON A CLEAN CLONE, MEASURED 2026-08-23 — TWO CELLS, ON A
//    MACHINE WHERE NOBODY HAD DONE ANYTHING WRONG. The gate crosses two
//    worlds: the registry, which lives IN the repository, and the skill store,
//    which lives OUTSIDE it (`~/.claude/commands`). It guarded only the second
//    and fell back to `ctxroute-config.json.example` for the first. On the
//    maintainer's machine both are real and the crossing is meaningful. On an
//    adopter's clone the store EXISTS and holds THEIR skills while the config
//    read is the shipped MODEL, which declares a fictional `my-project`:
//    two worlds that do not speak of each other, so the first `npm test` of
//    anyone adopting this framework reported a missing skill and 46 undeclared
//    ones. **A gate that accuses a healthy machine is a gate people delete.**
//
// 🛑 THE PRECONDITION IS THE EXISTENCE OF A REAL `ctxroute-config.json`, and
//    the `.example` is NOT one — it is a MODEL, and a model declares names
//    that describe nobody's machine. Same law as `wiring-drift-gate`:
//    **the skip is on the FILE'S EXISTENCE, NEVER on the content of a key.**
//    A config that EXISTS but declares an empty/absent registry is judged as
//    it stands; skipping there would disarm the gate on the very case it
//    exists for.
//
// ⚠️ A SKIP IS NOT A PASS. The absence is ANNOUNCED, named, on stderr — "we
//    could not measure" is never "it is healthy", and a silent green is
//    exactly what this repository refuses.
//
// ⚠️ ANTI-VACUITY: it must be IMPOSSIBLE to pass green while crossing nothing.
//    A machine that DECLARES skills must cross a non-empty domain on both
//    sides; a machine that declares none says so out loud instead of being
//    counted as agreement.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

// ⚠️ UNIQUE SOURCE of BOTH addresses = `src/paths.js` — the config path is
//    shared with the engine that reads it, the skills path with the adapter
//    that READS the skill bodies. Two definitions would diverge in silence.
//    Going through `configPath()` also honours `CTXROUTE_CONFIG_PATH`, the
//    variable RESERVED for tests, so an adopter's machine can be simulated
//    without touching a shipped file.
const { configPath, skillsDir } = await import('../src/paths.js').then((m) => m.default || m);
const CONFIG_PATH = configPath();
const SKILLS_DIR = skillsDir();

// ── THE TWO PRECONDITIONS, EACH ON A FILE ────────────────────────────
const hasConfig = fs.existsSync(CONFIG_PATH);
const hasSkills = fs.existsSync(SKILLS_DIR);
const decidable = hasConfig && hasSkills;
/** WHY the gate cannot judge — empty exactly when it can. */
const why = hasConfig
  ? (hasSkills ? '' : `no harness skills directory at ${SKILLS_DIR}`)
  : `no ctxroute-config.json at ${CONFIG_PATH} (the shipped .example is a MODEL, not a config)`;

/** Reads the config. An unreadable or invalid one is RED, never a quiet skip. */
const readConfig = () => JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

// ── ⓪ THE GATE SAYS WHETHER IT MEASURES ──────────────────────────────
// A skipped cell is visible in the runner's report; the REASON is not, and a
// reader who cannot name the reason concludes "green". So it is written out.
test('the gate SAYS whether it can judge, and NAMES why not (a skip is not a pass)', () => {
  if (decidable) {
    assert.strictEqual(why, '',
      'The gate declares itself able to judge and still carries a refusal reason: the two preconditions contradict each other, so one of the cells below is measuring something nobody described.');
    return;
  }
  assert.notStrictEqual(why, '',
    'The gate cannot judge and names NO reason. "I could not measure" would then be indistinguishable from "it is healthy" — the one confusion this repository refuses.');
  process.stderr.write(
    `\n[skill-registry-gate] NOT MEASURING — ${why}.\n`
    + '  The registry lives in this repository, the skill store lives outside it; with only one of the two\n'
    + '  present there is no crossing to judge. This is a SKIP, not a pass: nothing here was verified.\n\n',
  );
});

// PURE: which names have no file? (injectable existsFn = negative-check).
const findMissing = (names, existsFn) => names.filter((n) => !existsFn(n));

test('findMissing detects the missing ones (self-validation: the gate BITES)', () => {
  assert.deepStrictEqual(findMissing(['a', 'b', 'c'], (n) => n === 'a' || n === 'c'), ['b']);
  assert.deepStrictEqual(findMissing(['x'], () => true), []);
  assert.deepStrictEqual(findMissing([], () => false), []);
});

// ── ANTI-VACUITY ─────────────────────────────────────────────────────
// 🛑 A judge that finds nothing to judge is indistinguishable from a judge
//    that approves. The two directions below both collapse to the empty set
//    when the registry declares nothing and the store holds nothing, and the
//    empty set satisfies every one of their assertions.
// ⚠️ IT SEPARATES TWO ABSENCES THAT LOOK ALIKE. A machine that USES the skills
//    feature (a registry entry, or the `skillsWithoutPerimeter` adoption
//    switch) and still crosses an empty domain is RED — that is the vacuous
//    green. A machine that uses no skill at all is a LEGITIMATE adopter of the
//    document half of this framework: it is ANNOUNCED, never accused, and
//    never counted as agreement either.
test.skipIf(!decidable)('ANTI-VACUITY: the crossing measured something, or this machine declares no skill at all', () => {
  const config = readConfig();
  const names = Object.keys(config.skills || {});
  const withoutPerimeter = config.skillsWithoutPerimeter || [];
  const all = fs.readdirSync(SKILLS_DIR).filter((f) => f.endsWith('.md'));

  if (names.length === 0 && !('skillsWithoutPerimeter' in config)) {
    process.stderr.write(
      `\n[skill-registry-gate] NOTHING TO CROSS — ${CONFIG_PATH} declares no skill and no adoption switch.\n`
      + '  The two directions below are true of the empty set. Declared, not assumed.\n\n',
    );
    return;
  }

  assert.ok(all.length >= 1,
    `${SKILLS_DIR} exists and holds ZERO skill files while the config declares ${names.length} registered and ${withoutPerimeter.length} without a perimeter. Both directions below are then true of the empty set: the gate would report green having compared nothing.`);
  assert.ok(names.length + withoutPerimeter.length >= 1,
    `${CONFIG_PATH} declares the skills feature but names ZERO skill, in either key. "Every registry skill exists" is true of the empty registry, and a green that crossed nothing is this repository's worst defect.`);
});

test.skipIf(!decidable)('every skill of config.skills exists in the harness', () => {
  const config = readConfig();
  const names = Object.keys(config.skills || {});
  const missing = findMissing(names, (n) => fs.existsSync(path.join(SKILLS_DIR, n + '.md')));
  assert.deepStrictEqual(
    missing,
    [],
    `Registry skills WITHOUT a .md file in ${SKILLS_DIR}: [${missing.join(', ')}] (out of ${names.length} registered). ` +
      'Renamed/deleted? Fix config.skills OR restore the skill — a phantom pointer is forbidden.'
  );
});

// PURE: which harness skills are declared NOWHERE? (negative-checkable)
const findUndeclared = (allSkills, registered, withoutPerimeter) =>
  allSkills.filter((n) => !registered.includes(n) && !withoutPerimeter.includes(n));

test('findUndeclared detects the undeclared ones (self-validation: the REVERSE gate bites)', () => {
  assert.deepStrictEqual(findUndeclared(['a', 'b', 'c'], ['a'], ['c']), ['b']);
  assert.deepStrictEqual(findUndeclared(['a'], [], ['a']), []);
  assert.deepStrictEqual(findUndeclared([], ['x'], []), []);
});

// PURE: which names claim BOTH answers at once? (negative-checkable)
const findContradictory = (registered, withoutPerimeter) =>
  registered.filter((n) => withoutPerimeter.includes(n)).sort();

test('findContradictory detects the double declarations (self-validation: the gate BITES)', () => {
  assert.deepStrictEqual(findContradictory(['a', 'b'], ['b', 'c']), ['b']);
  assert.deepStrictEqual(findContradictory(['a'], ['b']), []);
  assert.deepStrictEqual(findContradictory([], []), []);
});

// ── THIRD DIRECTION (21/08/2026): a name answers ONCE, never twice ──
// 🔴 FOUND BY MEASUREMENT, not by review: `dispatcher` sat in BOTH
//    `skills` and `skillsWithoutPerimeter` and NOTHING turned red — the two
//    checks above are both satisfied by a contradiction (registered ⇒ not
//    undeclared; present in either list ⇒ not missing). The blind spot is
//    STRUCTURAL: each direction asks "is this name somewhere?", never "does
//    it say ONE thing?".
// ⚠️ THE TWO KEYS ARE MUTUALLY EXCLUSIVE BY THEIR OWN DEFINITION —
//    `skills` = "auto-inject when the perimeter is crossed", and
//    `skillsWithoutPerimeter` = "deliberately on-demand, no perimeter". A
//    name in both declares an intention AND its negation: whichever the
//    engine happens to honour, the other half of the config is a LIE that
//    the next reader will trust. Fail-closed: we refuse, we never pick.
// ⚠️ Same opt-in switch as the reverse direction — a config that never
//    declares `skillsWithoutPerimeter` has no contradiction to have. That is
//    the LANGUAGE's adoption switch, read from a config that EXISTS; it is not
//    a precondition, and it never stands in for one.
test.skipIf(!hasConfig)('no skill declares BOTH a perimeter and no-perimeter (a name answers ONCE)', () => {
  const config = readConfig();
  if (!('skillsWithoutPerimeter' in config)) return;
  const both = findContradictory(Object.keys(config.skills || {}), config.skillsWithoutPerimeter || []);
  assert.deepStrictEqual(
    both,
    [],
    `Skills declared TWICE, with contradictory intentions: [${both.join(', ')}]. ` +
      'A name lives in config.skills (auto-injected on its perimeter) OR in ' +
      'skillsWithoutPerimeter (deliberately on-demand) — never both. Keep the ' +
      'perimeter and remove the name from skillsWithoutPerimeter, or drop the perimeter.'
  );
});

// ── REVERSE DIRECTION (19/07/2026): every HARNESS skill must be declared ──
// ⚠️ The gate above is DIRECTIONAL (registry → file): it is structurally
//    BLIND to a skill created and never registered — the same hole as "MCP
//    server without a doc" and "doc without a rule" (classes already sealed).
//    A FORGOTTEN perimeter and a skill deliberately without a perimeter are
//    INDISTINGUISHABLE without an explicit declaration:
//    `skillsWithoutPerimeter` makes silence impossible. The "new project"
//    reflex MECHANISED: creating a skill without declaring it = RED at the
//    next test/push.
test.skipIf(!decidable)('every harness skill is EITHER registered (perimeter) OR declared without a perimeter', () => {
  const config = readConfig();
  // ⚠️ EXPLICIT OPT-IN (FREE framework — a language never imposes a POLICY):
  //    using the skills feature ≠ adopting exhaustiveness. Registering 2
  //    skills without wanting to sort out the other 40 is a LEGITIMATE use.
  //    The "zero silence" discipline only switches on if the user declares
  //    the `skillsWithoutPerimeter` key (even empty []) — THAT is the
  //    adoption switch. The engine ships the tool, not the regulation.
  if (!('skillsWithoutPerimeter' in config)) return;
  const all = fs.readdirSync(SKILLS_DIR).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3));
  const undeclared = findUndeclared(all, Object.keys(config.skills || {}), config.skillsWithoutPerimeter || []);
  assert.deepStrictEqual(
    undeclared,
    [],
    `Harness skills declared NOWHERE: [${undeclared.join(', ')}] (out of ${all.length} found in ${SKILLS_DIR}). ` +
      'For each one: add a perimeter in config.skills (auto-injection) OR list it in ' +
      'skillsWithoutPerimeter (deliberately on-demand). Silence is not an option.'
  );
});
