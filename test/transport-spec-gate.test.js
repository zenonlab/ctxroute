// ═══════════════════════════════════════════════════════════════════════
// THE SHIELD OF THE TLA+ TRANSPORT SPEC — what keeps `specs/tla/` HONEST.
// ═══════════════════════════════════════════════════════════════════════
//
// 🛑 A FORMAL SPEC HAS ONE FAILURE MODE WORSE THAN BEING WRONG: DRIFTING AWAY
//    FROM THE CODE IT CLAIMS TO PROVE. It then certifies a system that no
//    longer exists, and it certifies it in a language nobody re-reads. That is
//    the same class as this repo's worst defect — a GREEN gate that sees
//    nothing — with the added authority of the word "proven".
//
// ⚠️ THIS FILE DOES NOT RUN TLC (no Java in the fast lane, and TLC is not what
//    can drift). It seals the two things that CAN drift, and both are
//    unreachable from inside the `.tla` file:
//      ① the ORDER OF THE THREE WRITES in `pretool-core.js`, which is the
//         abstraction the whole proof rests on (queue -> state -> plan);
//      ② the COHERENCE of the run matrix: every name checked by TLC must be
//         DEFINED in the module, every sabotage constant must be exercised,
//         and the negative-check / anti-vacuity runs must still be there.
//    Running TLC itself is `npm run spec:tlc`, exercised by
//    `test/transport-spec-tlc.test.js` in the heavy lane.
//
// ⚠️ ANTI-INERTNESS: every detector here is confronted, IN MEMORY, with a
//    sabotaged copy of what it reads, and must go red on it. A detector never
//    seen refusing is a detector ASSUMED to work.
// 🛑 The sabotage NEVER touches a real file — a previous version of that idea,
//    elsewhere in this repo, brought down 38 tests of other suites running in
//    parallel.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..');
const TLA = path.join(ROOT, 'specs', 'tla', 'Transport.tla');
const RUNS = path.join(ROOT, 'specs', 'tla', 'runs.json');
const CORE = path.join(ROOT, 'src', 'pretool-core.js');

const lire = (p) => fs.readFileSync(p, 'utf8');

// ═══ ① DRIFT SHIELD — the order of the three writes ═════════════════════
//
// The spec proves that a dead leader is harmless to the OTHER processes
// BECAUSE the plan is published LAST: an unpublished plan makes every
// survivor recompute the same thing by pure determinism, instead of half of
// them replaying a plan whose author never finished. Reorder those writes and
// the proof is void while the spec keeps looking green.
//
// ⚠️ We look for the CALL SITES, in source order, inside the module. Anchors
//    are the literal store prefixes and the emission entry point — the three
//    things that would have to be renamed for this shield to lie.
const ORDER = [
  { itemName: 'queue', motif: /emission\.emit\(/ },
  { itemName: 'state', motif: /saveState\(STORE_PREFIX/ },
  { itemName: 'plan', motif: /saveState\(PLAN_PREFIX/ },
];

/** @returns {string[]} the three writes, in the order they appear in `src`. */
function writeOrder(src) {
  return ORDER.map((e) => ({ itemName: e.itemName, at: src.search(e.motif) }))
    .filter((e) => e.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((e) => e.itemName);
}

test('DRIFT SHIELD: the critical section writes queue -> state -> plan, in that order', () => {
  const src = lire(CORE);
  const order = writeOrder(src);
  assert.deepEqual(
    order,
    ['queue', 'state', 'plan'],
    'the TLA+ proof of Transport.tla rests on this order (plan published LAST). ' +
      'Reordering it makes the spec prove a system that no longer exists — ' +
      'update specs/tla/Transport.tla and re-run `npm run spec:tlc` before changing it.'
  );
});

test('DRIFT SHIELD, anti-inertness: a reordering IS seen (in-memory sabotage)', () => {
  // Positive control first: the detector really found the three writes above.
  assert.equal(writeOrder(lire(CORE)).length, 3, 'the detector must see THREE writes, not fewer');
  // Sabotage: publish the plan before the state.
  const sabotage = 'x = saveState(PLAN_PREFIX, a);\ny = emission.emit({});\nz = saveState(STORE_PREFIX, b);';
  assert.deepEqual(writeOrder(sabotage), ['plan', 'queue', 'state'], 'a reordering must be visible');
  assert.notDeepEqual(writeOrder(sabotage), ['queue', 'state', 'plan']);
});

// ═══ ② THE LOCK-LESS FALLBACK READS, AND WRITES NOTHING ═════════════════
//
// Invariant `NoWriteWithoutLock` of the spec. It is ALSO covered, from another
// angle, by `state-write-under-lock-gate.test.js` (ast-grep, derived from the
// SHAPE of a write). Here we seal the ONE branch the spec models explicitly,
// so the two nets fail for different reasons rather than sharing a blind spot.
test('the lock-less fallback branch READS the state and performs NO write', () => {
  const src = lire(CORE);
  const debut = src.indexOf('if (!res) {');
  assert.ok(debut > 0, 'the lock-less fallback branch must still be recognisable');
  const branch = src.slice(debut, src.indexOf('\n    }', debut));
  assert.match(branch, /loadState\(STORE_PREFIX/, 'it MUST read the state — never decide with {} (2026-08-07 bug)');
  assert.doesNotMatch(branch, /saveState\(/, 'it MUST NOT write: the lock serializes the WRITES');
  assert.doesNotMatch(branch, /emission\.emit\(/, 'it MUST NOT touch the queue without the lock');
});

// ═══ ③ COHERENCE OF THE RUN MATRIX ══════════════════════════════════════

const matrix = JSON.parse(lire(RUNS));
const tla = lire(TLA);

/** Names DEFINED in the module (`Name ==` at column 0). */
function defined(src) {
  return new Set([...src.matchAll(/^([A-Za-z][A-Za-z0-9_]*)\s*==/gm)].map((m) => m[1]));
}

/** CONSTANTS declared by the module, read from the `CONSTANTS` block. */
function constants(src) {
  const bloc = src.slice(src.indexOf('\nCONSTANTS'), src.indexOf('\nDocs '));
  return [...bloc.matchAll(/^\s{4}([A-Z][A-Za-z0-9_]*),?\s*(?:\\\*|$)/gm)].map((m) => m[1]);
}

test('MATRIX: every invariant and property checked by TLC is DEFINED in Transport.tla', () => {
  const itemNames = defined(tla);
  assert.ok(itemNames.size > 10, 'anti-mute probe: the parser must really see the module definitions');
  const cites = new Set();
  for (const r of matrix.runs) {
    for (const i of r.invariants || []) (i === '#shipped' ? matrix.shippedInvariants : [i]).forEach((n) => cites.add(n));
    for (const p of r.properties || []) cites.add(p);
    if (r.expect.violated) cites.add(r.expect.violated);
  }
  assert.ok(cites.size >= 8, `anti-vacuity: the matrix must cite several names, it cites ${cites.size}`);
  for (const n of cites) assert.ok(itemNames.has(n), `runs.json checks "${n}", which is NOT defined in Transport.tla`);
});

test('MATRIX: every CONSTANT of the module has a declared default value', () => {
  const cs = constants(tla);
  assert.ok(cs.length >= 8, `anti-mute probe: the CONSTANTS block must be read, ${cs.length} found`);
  for (const c of cs) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(matrix.constantsDefault, c),
      `CONSTANT "${c}" is declared by Transport.tla but absent from runs.json.constantsDefault — ` +
        'TLC would refuse the model, and a constant nobody sets is a knob nobody exercises.'
    );
  }
  // Inverse part: a default that names nothing is a stale leftover.
  for (const k of Object.keys(matrix.constantsDefault)) {
    assert.ok(cs.includes(k), `runs.json sets "${k}", which Transport.tla no longer declares`);
  }
});

test('MATRIX: every SABOTAGE knob of the module is really exercised by a run', () => {
  // DERIVED from the module, never a hand-written list: a sabotage knob added
  // tomorrow lands in this table by itself and stays red until a run uses it.
  const knobs = constants(tla).filter((c) => /^(LOCKLESS_|ATOMIC_|FALLBACK_|SLOW_)/.test(c));
  assert.ok(knobs.length >= 4, `anti-vacuity: ${knobs.length} knob(s) found, expected at least 4`);
  for (const k of knobs) {
    const used = matrix.runs.some((r) => r.constants && Object.prototype.hasOwnProperty.call(r.constants, k));
    assert.ok(used, `the knob "${k}" is never flipped by any run — it is an untested sabotage, i.e. none at all`);
  }
});

test('MATRIX: the negative-checks and the anti-vacuity runs are still there', () => {
  const rouges = matrix.runs.filter((r) => !r.expect.green);
  const green = matrix.runs.filter((r) => r.expect.green);
  assert.ok(green.length >= 1, 'at least one run must prove the design as shipped');
  // 🛑 NEVER lower these floors to make a change pass. They are what stops the
  //    spec from becoming a hollow green.
  const vacuity = rouges.filter((r) => /^Never(Delivers|Fallback|Queued)$/.test(r.expect.violated));
  assert.ok(vacuity.length >= 3, `anti-vacuity: ${vacuity.length} witness run(s), 3 required (delivery, fallback, queue)`);
  const sabotages = rouges.filter((r) => r.constants && Object.keys(r.constants).length > 0);
  assert.ok(sabotages.length >= 3, `negative-check: ${sabotages.length} sabotage run(s), 3 required`);
  const rotation = matrix.runs.find((r) => r.expect.violated === 'QueueEventuallyEmpty');
  assert.ok(rotation, 'the ROTATION run must stay: it is what distinguishes indefinite rotation of a `dumb` corpus (CORRECT) from starvation (forbidden)');
});

test('MATRIX: every run declares a WELL-FORMED verdict and a written reason', () => {
  for (const r of matrix.runs) {
    assert.ok(typeof r.cfg === 'string' && r.cfg.length > 0, 'a run must name its cfg');
    assert.ok(typeof r.why === 'string' && r.why.length > 40, `run ${r.cfg}: the reason must be written, not implied`);
    const g = r.expect.green === true;
    const v = typeof r.expect.violated === 'string';
    assert.ok(g !== v, `run ${r.cfg}: expect must be EITHER green EITHER violated, never both nor neither`);
  }
});

// ═══ ④ THE FOUND DEFECT IS DECLARED, NOT BURIED ═════════════════════════
test('the duplicate window found by the spec is carried by a DEDICATED run', () => {
  const debt = matrix.runs.find((r) => r.expect.violated === 'AtMostOnceDelivery' && !r.constants.ATOMIC_WRITE);
  assert.ok(debt, 'the known defect (a `once` delivered by the lock-less path is never recorded) must keep its own run');
  const fix = matrix.runs.find((r) => r.expect.green && (r.invariants || []).includes('AtMostOnceDelivery'));
  assert.ok(fix, 'the candidate fix must keep its own GREEN run — a defect stated without a reachable exit is a note, not a debt');
});

// ═══════════════════════════════════════════════════════════════════════
// THE SCRATCH DIRECTORY IS NAMED BY US, NOT BY THE CLOCK (2026-08-20)
//
// 🔴 THE FLAKY THIS CLOSES, MEASURED IN CI THE DAY IT WAS WRITTEN. Left to
//    itself TLC names its metadata directory from the CURRENT TIME **to the
//    second** (`states/26-08-20-17-04-50`). Eleven checks run back to back; on a
//    fast enough machine two of them START IN THE SAME SECOND, and the second
//    dies with `TLCRuntimeException: that directory already exists` — WITHOUT
//    naming any invariant. The spec gate then read "red on null" and reported a
//    MODEL DRIFT: a false accusation against the specification, produced by a
//    clock. The worst shape of failure, since it blames the wrong thing.
// 🛑 TLC's own message is the confession — *"Trying to run TLC again will
//    probably fix this problem."* We do not retry: we remove the ambiguity, by
//    naming the directory after the thing that is ALREADY unique, the run's
//    configuration. `-metadir` is documented in the INSTALLED version's `-help`.
// ⚠️ SECOND EFFECT, and it is the space doctrine: the directory is now STABLE, so
//    a run OVERWRITES its predecessor instead of stacking one folder per
//    execution. The old behaviour had quietly produced 464 files / 3.9 MB of
//    scratch — an UNBOUNDED writer. The bound is now structural (one directory
//    per declared run), not a purge somebody has to remember.
// 🛑 This is a STATIC check on purpose: it holds with or without Java, on a clean
//    clone, and it fails the moment someone removes the flag. Checking the folder
//    instead would pass by vacuity on any machine that has never run TLC.
// ═══════════════════════════════════════════════════════════════════════
test('the TLC launcher names its scratch directory ITSELF (no clock, no unbounded stacking)', () => {
  const launcher = lire(path.join(ROOT, 'specs', 'tla', 'run-tlc.mjs'));
  const appel = launcher.slice(launcher.indexOf('function runTlc'));

  assert.ok(/["']-metadir["']/.test(appel),
    '`-metadir` has disappeared from the TLC invocation. Without it TLC names its scratch '
    + 'directory from the clock TO THE SECOND: two runs starting in the same second collide, '
    + 'the second dies naming NO invariant, and this gate reports a model drift that does not '
    + 'exist. It also stacks one directory per execution, for ever.');

  // DERIVED, never a literal: the path must be built from the run's cfg, which is
  // what makes it unique per run AND stable across runs. A hard-coded directory
  // would make the eleven runs share one scratch space — a different bug.
  const afterFlag = appel.slice(appel.indexOf('-metadir'));
  assert.ok(/\bcfg\b/.test(afterFlag.slice(0, 120)),
    'the `-metadir` path does not derive from `cfg`. It must be named after the RUN, otherwise '
    + 'either the eleven runs share one directory, or the clock is back in the loop.');
});
