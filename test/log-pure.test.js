// ═══════════════════════════════════════════════════════════════════════
// log-pure — the DECISION half of every journal: setting, level, format, rotation.
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ IMPORTED DIRECTLY, never through a re-export (a re-export hides the module
//    from vitest's graph and Stryker then runs no test against it).
// ⚠️ perTest coverage: every fixture is built INSIDE its `test()` callback.
// ⚠️ Expected values are written out LITERALLY, copied from the source — never
//    `toBe(MODULE.CONSTANT)`, which proves `x === x`.
// ⚠️ The ceiling, rotation and `oneLine` cells came from `lifecycle-log-pure.test.js`
//    on 2026-10-04, unchanged, with the code they assert.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert/strict';

import {
  resolveLogging, admits, formatRecord, oneLine, shouldRotate, rotationPlan,
  SEVERITIES, LEVELS, DEFAULTS, BOUNDS,
} from '../src/log-pure.js';

// ═══════════════════════════════════════════════════════════════════════
// THE DECLARED NUMBERS — literally.
// ═══════════════════════════════════════════════════════════════════════

test('the defaults are the old daemon journal to the byte: level error, 256 KB per file, 2 files', () => {
  assert.deepEqual({ ...DEFAULTS }, { level: 'error', maxBytes: 262144, keptFiles: 2 });
  assert.ok(Object.isFrozen(DEFAULTS));
});

test('the bounds: 16 KB to 8 MB per file, 1 to 10 files — frozen at every level', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(BOUNDS)), {
    maxBytes: { min: 16384, max: 8388608 },
    keptFiles: { min: 1, max: 10 },
  });
  assert.ok(Object.isFrozen(BOUNDS));
  assert.ok(Object.isFrozen(BOUNDS.maxBytes));
  assert.ok(Object.isFrozen(BOUNDS.keptFiles));
});

test('two levels an adopter may write, three severities a record may carry', () => {
  assert.deepEqual([...LEVELS], ['error', 'debug']);
  assert.deepEqual([...SEVERITIES], ['event', 'error', 'debug']);
  assert.ok(Object.isFrozen(LEVELS));
  assert.ok(Object.isFrozen(SEVERITIES));
});

// ═══════════════════════════════════════════════════════════════════════
// resolveLogging — absent = defaults, present and wrong = NAMED REFUSAL.
// ═══════════════════════════════════════════════════════════════════════

test('an absent `logging` key is the defaults, accepted', () => {
  assert.deepEqual(resolveLogging({}), { ok: true, settings: { level: 'error', maxBytes: 262144, keptFiles: 2 } });
  assert.deepEqual(resolveLogging({ frames: 32 }).settings, { level: 'error', maxBytes: 262144, keptFiles: 2 });
});

test('no config at all (null, a string, nothing) is the defaults too', () => {
  for (const c of [null, undefined, 'x', 42]) {
    assert.deepEqual(resolveLogging(c), { ok: true, settings: { level: 'error', maxBytes: 262144, keptFiles: 2 } });
  }
});

test('the returned settings are a COPY: mutating them never moves the defaults', () => {
  const r = resolveLogging({});
  r.settings.maxBytes = 1;
  assert.equal(resolveLogging({}).settings.maxBytes, 262144);
});

test('every key is read: level, maxBytes, keptFiles', () => {
  assert.deepEqual(resolveLogging({ logging: { level: 'debug', maxBytes: 1048576, keptFiles: 5 } }),
    { ok: true, settings: { level: 'debug', maxBytes: 1048576, keptFiles: 5 } });
});

test('a partial setting keeps the defaults for what it does not say', () => {
  assert.deepEqual(resolveLogging({ logging: { level: 'debug' } }).settings,
    { level: 'debug', maxBytes: 262144, keptFiles: 2 });
  assert.deepEqual(resolveLogging({ logging: { keptFiles: 4 } }).settings,
    { level: 'error', maxBytes: 262144, keptFiles: 4 });
  assert.deepEqual(resolveLogging({ logging: { maxBytes: 65536 } }).settings,
    { level: 'error', maxBytes: 65536, keptFiles: 2 });
  assert.deepEqual(resolveLogging({ logging: { level: 'error' } }),
    { ok: true, settings: { level: 'error', maxBytes: 262144, keptFiles: 2 } });
});

test('an author note is allowed and changes nothing', () => {
  assert.deepEqual(resolveLogging({ logging: { note: 'why', level: 'debug' } }),
    { ok: true, settings: { level: 'debug', maxBytes: 262144, keptFiles: 2 } });
});

test('the bounds are INCLUSIVE on both ends', () => {
  assert.equal(resolveLogging({ logging: { maxBytes: 16384 } }).ok, true);
  assert.equal(resolveLogging({ logging: { maxBytes: 8388608 } }).ok, true);
  assert.equal(resolveLogging({ logging: { keptFiles: 1 } }).ok, true);
  assert.equal(resolveLogging({ logging: { keptFiles: 10 } }).ok, true);
});

test('🛑 out of bounds is a NAMED refusal that says the key, the value and the range — never a guess', () => {
  const cases = [
    [{ maxBytes: 16383 }, '`logging.maxBytes` is 16383, expected an integer from 16384 to 8388608'],
    [{ maxBytes: 8388609 }, '`logging.maxBytes` is 8388609, expected an integer from 16384 to 8388608'],
    [{ keptFiles: 0 }, '`logging.keptFiles` is 0, expected an integer from 1 to 10'],
    [{ keptFiles: 11 }, '`logging.keptFiles` is 11, expected an integer from 1 to 10'],
    [{ keptFiles: 2.5 }, '`logging.keptFiles` is 2.5, expected an integer from 1 to 10'],
    [{ maxBytes: '65536' }, '`logging.maxBytes` is "65536", expected an integer from 16384 to 8388608'],
    [{ keptFiles: null }, '`logging.keptFiles` is null, expected an integer from 1 to 10'],
  ];
  for (const [logging, refusal] of cases) {
    assert.deepEqual(resolveLogging({ logging }),
      { ok: false, refusal, settings: { level: 'error', maxBytes: 262144, keptFiles: 2 } }, JSON.stringify(logging));
  }
});

test('an unknown level is refused by name, with the levels it accepts', () => {
  assert.deepEqual(resolveLogging({ logging: { level: 'verbose' } }), {
    ok: false,
    refusal: '`logging.level` is "verbose", expected one of error, debug',
    settings: { level: 'error', maxBytes: 262144, keptFiles: 2 },
  });
  assert.equal(resolveLogging({ logging: { level: null } }).ok, false);
});

test('an unknown key is refused by name (a typo never reads as a default)', () => {
  assert.deepEqual(resolveLogging({ logging: { verbosity: 'debug' } }), {
    ok: false, refusal: '`logging.verbosity` is not a known key', settings: { level: 'error', maxBytes: 262144, keptFiles: 2 },
  });
  // 🛑 An inherited name is NOT a known key: `in` would have let it through.
  assert.equal(resolveLogging({ logging: { toString: 1 } }).ok, false);
});

test('a refusal at any key discards the WHOLE setting — never half of what was written', () => {
  const r = resolveLogging({ logging: { level: 'debug', keptFiles: 99 } });
  assert.equal(r.ok, false);
  assert.deepEqual(r.settings, { level: 'error', maxBytes: 262144, keptFiles: 2 });
  const r2 = resolveLogging({ logging: { maxBytes: 65536, keptFiles: 99 } });
  assert.deepEqual(r2.settings, { level: 'error', maxBytes: 262144, keptFiles: 2 });
});

test('`logging` must be an object: null, an array, a string, a number are refused', () => {
  for (const logging of [null, [], 'debug', 3, true]) {
    assert.deepEqual(resolveLogging({ logging }), {
      ok: false, refusal: '`logging` must be an object', settings: { level: 'error', maxBytes: 262144, keptFiles: 2 },
    }, JSON.stringify(logging));
  }
});

// ═══════════════════════════════════════════════════════════════════════
// admits — failures always, the trace only in debug.
// ═══════════════════════════════════════════════════════════════════════

test('🛑 errors and life events are written at EVERY level — debug off never hides a failure', () => {
  for (const level of ['error', 'debug', 'nonsense', undefined, null]) {
    assert.equal(admits(level, 'error'), true, String(level));
    assert.equal(admits(level, 'event'), true, String(level));
  }
});

test('🛑 the trace is written ONLY at level debug — never switched on by accident', () => {
  assert.equal(admits('debug', 'debug'), true);
  for (const level of ['error', 'DEBUG', 'nonsense', undefined, null, true]) {
    assert.equal(admits(level, 'debug'), false, String(level));
  }
});

test('an unknown severity is never written', () => {
  assert.equal(admits('debug', 'trace'), false);
  assert.equal(admits('debug', undefined), false);
  assert.equal(admits('error', 'info'), false);
});

// ═══════════════════════════════════════════════════════════════════════
// formatRecord — one line, a closed vocabulary.
// ═══════════════════════════════════════════════════════════════════════

test('a record renders as `<at> event=<name> k=v…`, fields in order', () => {
  assert.equal(formatRecord({ at: 'T', event: 'a', vocabulary: ['a'], fields: { x: 1, y: 'z' } }), 'T event=a x=1 y=z');
  assert.equal(formatRecord({ at: 'T', event: 'a', vocabulary: ['a'] }), 'T event=a');
});

test('an event outside the vocabulary writes NOTHING — and no vocabulary means nothing is known', () => {
  assert.equal(formatRecord({ at: 'T', event: 'b', vocabulary: ['a'] }), null);
  assert.equal(formatRecord({ at: 'T', event: 'a' }), null);
  assert.equal(formatRecord({ at: 'T', event: 'a', vocabulary: 'a' }), null);
  assert.equal(formatRecord(), null);
  assert.equal(formatRecord(null), null);
});

test('an absent, empty or non-string instant writes nothing', () => {
  for (const at of [undefined, '', 42, null]) {
    assert.equal(formatRecord({ at, event: 'a', vocabulary: ['a'] }), null, String(at));
  }
});

test('null and undefined fields are OMITTED; 0, false and empty string are kept', () => {
  assert.equal(formatRecord({ at: 'T', event: 'a', vocabulary: ['a'], fields: { n: null, u: undefined, z: 0, f: false, e: '' } }),
    'T event=a z=0 f=false e=');
});

test('a non-object `fields` contributes nothing (a string is truthy and has keys)', () => {
  assert.equal(formatRecord({ at: 'T', event: 'a', vocabulary: ['a'], fields: 'ab' }), 'T event=a');
});

test('🛑 ONE RECORD IS ONE LINE — through a value and through the instant', () => {
  assert.equal(formatRecord({ at: 'T\r\n', event: 'a', vocabulary: ['a'], fields: { m: 'x\ny' } }), 'T  event=a m=x y');
});

test('oneLine collapses every run of CR/LF into a single space and leaves the rest alone', () => {
  assert.equal(oneLine('a\nb'), 'a b');
  assert.equal(oneLine('a\r\n\r\nb'), 'a b');
  assert.equal(oneLine('a b'), 'a b');
  assert.equal(oneLine(90), '90');
  assert.equal(oneLine(false), 'false');
});

// ═══════════════════════════════════════════════════════════════════════
// shouldRotate — the ceiling, decided here, applied by the shell.
// ═══════════════════════════════════════════════════════════════════════

test('the ceiling is a limit REACHED, not exceeded', () => {
  assert.equal(shouldRotate({ sizeBytes: 262143, maxBytes: 262144 }), false);
  assert.equal(shouldRotate({ sizeBytes: 262144, maxBytes: 262144 }), true);
  assert.equal(shouldRotate({ sizeBytes: 999999, maxBytes: 262144 }), true);
  assert.equal(shouldRotate({ sizeBytes: 0, maxBytes: 262144 }), false);
});

test('FAIL-OPEN: an absurd ceiling or an unreadable size means DO NOT rotate, hence still write', () => {
  assert.equal(shouldRotate({ sizeBytes: 10, maxBytes: 0 }), false);
  assert.equal(shouldRotate({ sizeBytes: 10, maxBytes: -1 }), false);
  assert.equal(shouldRotate({ sizeBytes: 10, maxBytes: 'x' }), false);
  assert.equal(shouldRotate({ sizeBytes: 'x', maxBytes: 10 }), false);
  assert.equal(shouldRotate({ sizeBytes: Infinity, maxBytes: 10 }), false);
  assert.equal(shouldRotate({}), false);
  assert.equal(shouldRotate(), false);
});

test('numeric strings are accepted on both sides (a size read back from text is still a size)', () => {
  assert.equal(shouldRotate({ sizeBytes: '300000', maxBytes: '262144' }), true);
  assert.equal(shouldRotate({ sizeBytes: '10', maxBytes: '262144' }), false);
});

// ═══════════════════════════════════════════════════════════════════════
// rotationPlan — N files, bounded whatever it is handed.
// ═══════════════════════════════════════════════════════════════════════

test('2 kept files = the old journal: strand-removal of .2…, then current → .1', () => {
  assert.deepEqual(rotationPlan(2), {
    remove: ['.2', '.3', '.4', '.5', '.6', '.7', '.8', '.9'],
    rename: [['', '.1']],
  });
});

test('k kept files shift oldest-first so no generation is overwritten before it moves', () => {
  assert.deepEqual(rotationPlan(4), {
    remove: ['.4', '.5', '.6', '.7', '.8', '.9'],
    rename: [['.2', '.3'], ['.1', '.2'], ['', '.1']],
  });
  assert.deepEqual(rotationPlan(3), {
    remove: ['.3', '.4', '.5', '.6', '.7', '.8', '.9'],
    rename: [['.1', '.2'], ['', '.1']],
  });
});

test('the maximum keeps every suffix up to .9 and removes nothing', () => {
  assert.deepEqual(rotationPlan(10), {
    remove: [],
    rename: [['.8', '.9'], ['.7', '.8'], ['.6', '.7'], ['.5', '.6'], ['.4', '.5'], ['.3', '.4'], ['.2', '.3'], ['.1', '.2'], ['', '.1']],
  });
});

test('1 kept file: the journal starts over — the current file itself is removed, nothing renamed', () => {
  assert.deepEqual(rotationPlan(1), {
    remove: ['.1', '.2', '.3', '.4', '.5', '.6', '.7', '.8', '.9', ''],
    rename: [],
  });
});

test('🛑 an unusable count falls back to the DEFAULT (2), never to "keep everything"', () => {
  const two = { remove: ['.2', '.3', '.4', '.5', '.6', '.7', '.8', '.9'], rename: [['', '.1']] };
  for (const k of [0, 11, -1, 2.5, 'x', undefined, null, Infinity]) {
    assert.deepEqual(rotationPlan(k), two, String(k));
  }
  assert.deepEqual(rotationPlan('3').rename, [['.1', '.2'], ['', '.1']], 'a numeric string is still a count');
});

test('no plan ever touches a suffix past .9 — the disk bound holds for any input', () => {
  const touched = [];
  for (let k = -2; k <= 13; k += 1) {
    const p = rotationPlan(k);
    touched.push(...p.remove, ...p.rename.flat());
  }
  assert.ok(touched.length > 100, 'anti-vacuity: the plans touched almost nothing');
  assert.deepEqual(touched.filter((sfx) => !(sfx === '' || /^\.[1-9]$/.test(sfx))), []);
});
