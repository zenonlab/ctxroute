// ═══════════════════════════════════════════════════════════════════════
// THE SHIELD OF THE TLA+ **STATE** SPEC — what keeps `specs/tla/State.tla`
// from certifying a protocol that no longer exists.
// ═══════════════════════════════════════════════════════════════════════
//
// 🛑 A FORMAL SPEC HAS ONE FAILURE MODE WORSE THAN BEING WRONG: DRIFTING AWAY
//    FROM THE CODE IT CLAIMS TO PROVE — and then saying "proven" about it.
//    `transport-spec-gate.test.js` guards the DELIVERY frontier; this file
//    guards the DURABILITY one, and the abstraction it rests on is different:
//    that every writer of a DURABLE key performs its read-modify-write under
//    the lock whose address `store-resolve` owns.
//
// ⚠️ THIS FILE DOES NOT RUN TLC (no Java in the fast lane, and TLC is not what
//    drifts). It seals the two things that CAN:
//      ① the CODE anchor — the durable classification and the single owner of
//         the lock address, both of which the model assumes;
//      ② the COHERENCE of the run matrix — every name checked by TLC defined
//         in the module, every knob exercised, and the negative-check and
//         anti-vacuity runs still present and still RED.
//    Running TLC is `npm run spec:tlc`.
//
// ⚠️ ANTI-INERTNESS: every detector is confronted IN MEMORY with a sabotaged
//    copy of what it reads and must go red on it. A detector never seen
//    refusing is a detector ASSUMED to work.
// 🛑 The sabotage NEVER touches a real file.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'specs', 'tla');
const TLA = path.join(DIR, 'State.tla');
const RUNS = path.join(DIR, 'state-runs.json');
const TRANSPORT_RUNS = path.join(DIR, 'runs.json');

const lire = (p) => fs.readFileSync(p, 'utf8');
const tla = lire(TLA);
const matrix = JSON.parse(lire(RUNS));

/** Every `Name ==` definition of a TLA+ module. */
function defined(src) {
  return new Set([...src.matchAll(/^([A-Za-z][A-Za-z0-9_]*)\s*==/gm)].map((m) => m[1]));
}

/**
 * CONSTANTS declared by the module. Bounded by the `VARIABLES` block that
 * follows it — anchoring on a specific identifier would break the day one is
 * renamed, which is the drift this file exists to catch, not to suffer.
 */
function constants(src) {
  const debut = src.indexOf('\nCONSTANTS');
  const fin = src.indexOf('\nVARIABLES');
  assert.ok(debut >= 0 && fin > debut, 'State.tla must declare CONSTANTS then VARIABLES');
  return [...src.slice(debut, fin).matchAll(/^\s{4}([A-Za-z][A-Za-z0-9_]*),?\s*(?:\\\*|$)/gm)].map((m) => m[1]);
}

test('MATRIX: the module is declared, and the matrix is not empty', () => {
  assert.equal(matrix.module, 'State', 'state-runs.json must name the module it drives');
  assert.ok(matrix.runs.length >= 8, `an empty or thin matrix is a green that sees nothing (${matrix.runs.length} runs)`);
});

test('MATRIX: every invariant checked by TLC is DEFINED in State.tla', () => {
  const itemNames = defined(tla);
  assert.ok(itemNames.size > 10, 'anti-mute probe: the parser must really see the module definitions');
  const cites = new Set();
  for (const r of matrix.runs) {
    for (const i of r.invariants || []) (i === '#shipped' ? matrix.shippedInvariants : [i]).forEach((n) => cites.add(n));
    for (const p of r.properties || []) cites.add(p);
    if (r.expect.violated) cites.add(r.expect.violated);
  }
  assert.ok(cites.size >= 6, `anti-vacuity: the matrix must cite several names, it cites ${cites.size}`);
  for (const n of cites) assert.ok(itemNames.has(n), `state-runs.json checks "${n}", which is NOT defined in State.tla`);
  // ANTI-INERTNESS: an invented name must be refused.
  assert.ok(!itemNames.has('NoSuchInvariant'), 'the detector would accept anything');
});

test('MATRIX: every CONSTANT of the module has a declared default, and no default is stale', () => {
  const cs = constants(tla);
  assert.ok(cs.length >= 6, `anti-mute probe: the CONSTANTS block must be read, ${cs.length} found`);
  for (const c of cs) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(matrix.constantsDefault, c),
      `CONSTANT "${c}" is declared by State.tla but absent from state-runs.json.constantsDefault — ` +
        'TLC would refuse the model, and a constant nobody sets is a knob nobody exercises.'
    );
  }
  for (const k of Object.keys(matrix.constantsDefault)) {
    assert.ok(cs.includes(k), `state-runs.json sets "${k}", which State.tla no longer declares`);
  }
  // ANTI-INERTNESS: the same reading on a module missing one constant must fail.
  const clipped = tla.replace('    STALE_FORCING,', '');
  assert.ok(!constants(clipped).includes('STALE_FORCING'), 'the CONSTANTS parser is not reading the block');
});

test('MATRIX: every knob of the module is really exercised by a run', () => {
  // DERIVED from the module, never a hand-written list: a knob added tomorrow
  // lands in this table by itself and stays RED until a run exercises it.
  const knobs = constants(tla).filter((c) => matrix.constantsDefault[c] === 'TRUE' || matrix.constantsDefault[c] === 'FALSE');
  assert.ok(knobs.length >= 3, `anti-vacuity: ${knobs.length} boolean knobs found, expected the three designs`);
  for (const k of knobs) {
    const flipped = matrix.runs.some((r) => r.constants && Object.prototype.hasOwnProperty.call(r.constants, k) && r.constants[k] !== matrix.constantsDefault[k]);
    assert.ok(flipped, `knob "${k}" is never flipped by any run — a knob nobody moves proves nothing`);
  }
});

test('MATRIX: the negative-checks and the anti-vacuity runs are still there, and still RED', () => {
  const rouge = (itemName) => matrix.runs.some((r) => r.expect.violated === itemName);
  // The race REPRODUCED in production on 2026-08-23 must stay findable.
  assert.ok(rouge('NoLostRecord'), 'no run requires a LOST RECORD — the spec would be describing a fiction');
  // Two writers must really overlap somewhere, or every green is vacuous.
  assert.ok(rouge('AtMostOneInCrit'), 'no run proves two writers overlap — the lock-free green would be vacuous');
  assert.ok(rouge('NeverCommits'), 'no run proves the model records anything at all');
  assert.ok(rouge('NeverPurges'), 'no run proves a compaction is reachable');
  assert.ok(rouge('NeverStuckLock'), 'no run exhibits the lock surviving its dead holder');
  assert.ok(rouge('NoResurrection'), 'no run exhibits the purge window');
  // 🛑 ANTI-VACUITY OF THE KERNEL-FORCING GREEN. Without a run REQUIRING that
  //    forcing actually fires, `StateKernelForcing` could be green because
  //    nobody ever took a held lock — which is equally true of a design that
  //    deadlocks for ever. The green would then prove the opposite of its claim.
  assert.ok(rouge('NeverForced'), 'no run proves a held lock is ever really forced — the kernel-forcing green would be vacuous');
  // And at least one run must be GREEN, or the gate proves only that things break.
  assert.ok(matrix.runs.some((r) => r.expect.green), 'no run is required GREEN');
});

test('MATRIX: cfg names are UNIQUE across both matrices', () => {
  // 🛑 `run-tlc.mjs` derives both the `.cfg` file name and `-metadir` from
  //    `run.cfg`. Two matrices sharing one name would have one run silently
  //    overwrite the other's generated configuration — a green obtained by
  //    checking somebody else's model.
  const autre = JSON.parse(lire(TRANSPORT_RUNS));
  const itemNames = [...matrix.runs, ...autre.runs].map((r) => r.cfg);
  assert.equal(new Set(itemNames).size, itemNames.length, `duplicate cfg name across the two matrices: ${itemNames.join(', ')}`);
  assert.ok(itemNames.length >= 18, `anti-mute probe: both matrices must be read, ${itemNames.length} runs seen`);
});

test('CODE ANCHOR: the durable class and the lock address are where the model assumes', () => {
  // ① The write-through classification the model calls "durable" — if `plan-`
  //    stopped being the ephemeral prefix, the daemon would write plans through
  //    to disk and hold the real records in RAM, and every verdict would be
  //    about the wrong class.
  const pur = lire(path.join(ROOT, 'src', 'memory-store-pure.js'));
  assert.match(pur, /EPHEMERAL_PREFIX\s*=\s*'plan-'/, 'the ephemeral prefix moved — State.tla models the wrong class');
  assert.match(pur, /function isWriteThrough\(k\)\s*\{\s*return !isEphemeral\(k\);/, 'the write-through rule is no longer "everything but the ephemeral class"');

  // ② ONE OWNER FOR THE LOCK ADDRESS. The model's mutual exclusion is only real
  //    if every writer of a durable key takes the SAME name: two spellings are
  //    two locks, and two locks are no lock. Measured 2026-08-23: 209 lost
  //    read-modify-writes out of 800 when one side did not take it at all.
  const resolve = lire(path.join(ROOT, 'src', 'store-resolve.js'));
  assert.match(resolve, /function docLockDir\(/, 'store-resolve no longer owns the injection lock address');
  assert.match(resolve, /function turnLockDir\(/, 'store-resolve no longer owns the turn lock address');

  // ③ AND THE DAEMON ROUTES REALLY TAKE IT — the exact defect closed that day.
  const http = lire(path.join(ROOT, 'src', 'hooks', 'http-server.js'));
  for (const itemName of ['docLockDir', 'turnLockDir']) {
    assert.ok(
      new RegExp(`withLock\\(\\s*\\n?\\s*storeResolve\\.${itemName}\\(`).test(http),
      `the daemon route no longer wraps its read-modify-write in withLock(storeResolve.${itemName}(…)) — ` +
        'that is the 2026-08-23 race, and StateLockless is its counter-example.'
    );
  }
  // ANTI-INERTNESS: the same detector on a sabotaged copy must refuse.
  const sabotage = http.replace(/withLock\(\s*\n?\s*storeResolve\.docLockDir\(/, 'noLock(storeResolve.docLockDir(');
  assert.ok(!new RegExp('withLock\\(\\s*\\n?\\s*storeResolve\\.docLockDir\\(').test(sabotage), 'the detector would accept an unlocked route');
});

test('CODE ANCHOR: forcing a held lock is decided by the KERNEL, never by a clock', () => {
  // 🛑 `KERNEL_FORCING` abstracts the holder's death as `~alive[lockOwner]`, and
  //    that abstraction is only FAITHFUL while the code really asks an authority
  //    that KNOWS. If `lock.js` went back to deducing death from an mtime, TLC
  //    would keep certifying `StateKernelForcing` green about a protocol the
  //    code no longer implements — a spec drifting away from its subject while
  //    still saying "proven", which is the failure mode this file exists for.
  const lock = lire(path.join(ROOT, 'src', 'lock.js'));

  // ① The kernel is ASKED: signal 0 sends nothing and tests existence
  //    (official Node v22 doc, read 2026-08-23).
  assert.match(
    lock,
    /process\.kill\(\s*pid\s*,\s*0\s*\)/,
    'lock.js no longer asks the kernel whether the holder exists — State.tla models a protocol that is gone'
  );
  // ② And only `ESRCH` counts as a proof of death. Any looser test (a bare
  //    `catch` treated as death) would force on a LIVING holder whose signal
  //    merely failed — EPERM, typically — which is the lost update again.
  assert.match(
    lock,
    /ESRCH/,
    'lock.js no longer distinguishes ESRCH — without it, any failure would read as a death'
  );
  // ③ The clock is CONFINED. Exactly one clock comparison may remain, and it
  //    is residual ②: a holder that was never recorded, i.e. nobody to ask.
  // ⚠️ COMMENTS ARE STRIPPED FIRST, and that is not tidiness. `lock.js` QUOTES
  //    the defect it removed (`Date.now() - mtime > 5000`) in its header, and a
  //    raw text count reads that quotation as a second clock — the exact
  //    false positive `rules/temporal-call.yml` documents when it insists on
  //    AST over regex. A gate that punishes a file for EXPLAINING itself would
  //    teach the next author to delete the explanation.
  const code = lock.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  const clocks = [...code.matchAll(/Date\.now\(\)\s*-\s*[^;)]+?[<>]/g)];
  assert.equal(
    clocks.length,
    1,
    `lock.js must carry exactly ONE clock comparison (the unidentified-holder residual), found ${clocks.length}`
  );
  assert.match(
    lock,
    /UNIDENTIFIED_HOLDER_MS/,
    'the surviving clock must be NAMED for the one case it judges — a general "stale" name is how its scope creeps back'
  );

  // ANTI-INERTNESS: the same three detectors, on a copy put back to the
  // pre-2026-08-23 shape, must refuse it.
  // ⚠️ `/g` IS LOAD-BEARING ON ALL THREE: the header QUOTES each of these
  //    literals, so a first-occurrence replace only sabotages the COMMENT and
  //    leaves the real call standing — the detector then "passes" its own
  //    negative-check while having proved nothing. Measured here, 2026-08-23.
  const ancien = lock
    .replace(/process\.kill\(\s*pid\s*,\s*0\s*\)/g, 'false')
    .replace(/ESRCH/g, 'EOTHER')
    .replace(/UNIDENTIFIED_HOLDER_MS/g, 'STALE_MS');
  assert.ok(!/process\.kill\(\s*pid\s*,\s*0\s*\)/.test(ancien), 'the kernel-question detector would accept anything');
  assert.ok(!/ESRCH/.test(ancien), 'the proof-of-death detector would accept anything');
  assert.ok(!/UNIDENTIFIED_HOLDER_MS/.test(ancien), 'the naming detector would accept a general staleness bound');
});
