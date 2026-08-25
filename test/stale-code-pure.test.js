// ═══════════════════════════════════════════════════════════════════════
// THE STALE-CODE VERDICT — the decision, hermetic and MUTATED.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 WHAT IT PROTECTS, AND IT IS NOT HYPOTHETICAL. Until 2026-08-24 the daemon
//    exited 90 on ANY `fs.watch` notification, concluding "my code changed".
//    MEASURED that day on the FROZEN copy — which nothing had written to since
//    it was built — 258 deaths, `mtime` and `ctime` UNCHANGED, only `atime`
//    moving. The conclusion was an INFERENCE and it was false. This module is
//    what replaced it with an OBSERVATION, so its rule has to be mutable, hence
//    pure, hence here.
//
// ⚠️ HERMETIC: zero fs, zero spawn, zero clock. The disk is read by the shell;
//    what is judged here is the verdict on what was read. The behaviour on the
//    real kernel is `stale-code-guard.test.js`.
// ⚠️ IMPORTED DIRECTLY from the mutated file, never through a re-export:
//    `perTest` coverage misses tests reached through one, which produces PHANTOM
//    survivors.
// ⚠️ FIXTURES ARE THUNKS, never module-level `const`: an expression evaluated at
//    module load belongs to NO test, so its mutants sit uncovered and SURVIVE.
// ⚠️ EXPECTED MESSAGES ARE WRITTEN OUT IN FULL, copied from the source. They ARE
//    the contract a human reads on the daemon's most frequent death, and a test
//    deriving its expectation from the code it checks proves `x === x`.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import { verdict, inScope, dirOf, watchedDirs, NOTHING_RECORDED } from '../src/stale-code-pure.js';

// ── THUNKS (see the header) ──────────────────────────────────────────────
const same = (file) => ({ file, recorded: 'const a = 1;\n', current: 'const a = 1;\n', error: null });
const moved = (file) => ({ file, recorded: 'const a = 1;\n', current: 'const a = 2;\n', error: null });
const gone = (file) => ({ file, recorded: 'const a = 1;\n', current: null, error: null });
const unreadable = (file) => ({ file, recorded: 'const a = 1;\n', current: null, error: 'EACCES' });

// ═══════════════════════════════════════════════════════════════════════
// THE VERDICT
// ═══════════════════════════════════════════════════════════════════════

test('code identical to the disk is SERVED — a guard screaming at healthy code gets unplugged', () => {
  assert.deepStrictEqual(verdict([same('/r/src/gate.js'), same('/r/src/lib.js')]),
    { stale: false, checked: 2, reasons: [] });
});

test('ONE byte different anywhere is STALE — this is the whole guarantee', () => {
  assert.deepStrictEqual(verdict([same('/r/src/gate.js'), moved('/r/src/lib.js')]), {
    stale: true,
    checked: 2,
    reasons: ['/r/src/lib.js: content DIFFERS from the bytes this process compiled'],
  });
});

test('a recorded file that VANISHED is stale, and says so by its own name', () => {
  // A `git checkout` of another branch removes files. Reporting that as
  // "differs" would send the next reader looking for an edit that never was.
  assert.deepStrictEqual(verdict([gone('/r/src/lib.js')]), {
    stale: true, checked: 1, reasons: ['/r/src/lib.js: GONE from disk'],
  });
});

test('a file we can no longer READ is stale — an unknown is never a green', () => {
  assert.deepStrictEqual(verdict([unreadable('/r/src/lib.js')]), {
    stale: true, checked: 1, reasons: ['/r/src/lib.js: UNREADABLE now (EACCES)'],
  });
});

test('the ERROR wins over the absence — the message must name the right cause', () => {
  // Both fields are set here (a read that threw leaves no content). Reporting
  // "GONE" for a permission error would be a lie about the kernel.
  assert.deepStrictEqual(verdict([{ file: '/r/a.js', recorded: 'x', current: null, error: 'EBUSY' }]).reasons,
    ['/r/a.js: UNREADABLE now (EBUSY)']);
});

test('`undefined` counts exactly like `null`, on BOTH fields', () => {
  // A caller that omits a field must not be read as "nothing to report": an
  // absent observation is an unknown, and an unknown is stale.
  assert.deepStrictEqual(verdict([{ file: '/r/a.js', recorded: 'x', current: undefined, error: undefined }]).reasons,
    ['/r/a.js: GONE from disk']);
  assert.deepStrictEqual(verdict([{ file: '/r/b.js', recorded: 'x', current: null, error: 'EIO' }]).reasons,
    ['/r/b.js: UNREADABLE now (EIO)']);
});

test('🛑 AN EMPTY SET IS STALE — the anti-vacuity floor lives in the DECISION', () => {
  // An empty set does not mean "nothing to check": it means the load hook was
  // never armed, i.e. this process cannot vouch for a single one of its
  // modules. A guard that verifies nothing looks EXACTLY like a guard that
  // verifies everything and finds it clean — this repository's worst defect.
  assert.deepStrictEqual(verdict([]), {
    stale: true,
    checked: 0,
    reasons: ['no module was recorded: the load hook was never installed, '
      + 'so this process cannot vouch for a single byte of its own code'],
  });
  assert.strictEqual(NOTHING_RECORDED, 'no module was recorded: the load hook was never installed, '
    + 'so this process cannot vouch for a single byte of its own code');
});

test('anything that is not a list is treated as an empty one — fail-closed, never a throw', () => {
  // This runs on the request path of a service that must not die of its own
  // guard; a malformed input is a refusal to serve, never an exception.
  for (const junk of [null, undefined, 'observations', 42, {}]) {
    assert.strictEqual(verdict(/** @type {never} */ (junk)).stale, true, `junk input ${String(junk)} must be stale`);
    assert.strictEqual(verdict(/** @type {never} */ (junk)).checked, 0);
  }
});

test('EVERY faulty file is reported, and the report is SORTED', () => {
  // Sorted, because the order the loader happened to walk the modules must not
  // change how the same death reads from one restart to the next.
  const r = verdict([moved('/r/z.js'), same('/r/m.js'), gone('/r/a.js'), moved('/r/b.js')]);
  assert.strictEqual(r.checked, 4);
  assert.deepStrictEqual(r.reasons, [
    '/r/a.js: GONE from disk',
    '/r/b.js: content DIFFERS from the bytes this process compiled',
    '/r/z.js: content DIFFERS from the bytes this process compiled',
  ]);
});

test('`checked` counts what was LOOKED AT, not what was faulty', () => {
  // It is the anti-vacuity witness printed in the journal: a death reporting
  // `checked=0` is a daemon that verified nothing, and that must read
  // differently from one that verified all of its modules.
  assert.strictEqual(verdict([same('/r/a.js'), same('/r/b.js'), same('/r/c.js')]).checked, 3);
  assert.strictEqual(verdict([moved('/r/a.js')]).checked, 1);
});

// ═══════════════════════════════════════════════════════════════════════
// THE SCOPE AND THE DERIVED DIRECTORIES — shared with the watcher
// ═══════════════════════════════════════════════════════════════════════

test('`node_modules` is OUT of scope — an install is a deliberate act that restarts us', () => {
  assert.strictEqual(inScope('C:/repo/src/gate.js'), true);
  assert.strictEqual(inScope('/repo/src/gate.js'), true);
  assert.strictEqual(inScope('C:/repo/node_modules/vitest/index.js'), false);
});

test('anything that is not a non-empty string is out of scope', () => {
  assert.strictEqual(inScope(''), false);
  assert.strictEqual(inScope(undefined), false);
  assert.strictEqual(inScope(42), false);
  assert.strictEqual(inScope(null), false);
});

test('the DIRECTORY is derived on both separators — the same code runs on three kernels', () => {
  assert.strictEqual(dirOf('C:/repo/src/gate.js'), 'C:/repo/src');
  assert.strictEqual(dirOf('C:\\repo\\src\\gate.js'), 'C:\\repo\\src');
  assert.strictEqual(dirOf('C:/repo/src\\mixed.js'), 'C:/repo/src');
});

test('a ONE-CHARACTER parent is still a parent — the boundary, not an approximation', () => {
  // ⚠️ THE EXACT CASE A MUTANT SURVIVED ON (measured 2026-08-24): `cut < 1`
  //    turned into `cut <= 1` differs on this input ALONE, and on nothing else.
  //    Without it the derivation would silently stop watching the directory of
  //    any module one character deep.
  assert.strictEqual(dirOf('a/gate.js'), 'a');
  assert.strictEqual(dirOf('a\\gate.js'), 'a');
  assert.deepStrictEqual(watchedDirs(['a/gate.js']), ['a']);
});

test('a path with no usable parent yields null, NEVER an empty string', () => {
  // An empty string handed to `fs.watch` resolves to the current working
  // directory — a watch armed on the wrong place, which is worse than none.
  assert.strictEqual(dirOf('gate.js'), null);
  assert.strictEqual(dirOf('/gate.js'), null);
  assert.strictEqual(dirOf(''), null);
});

test('the watched set is DERIVED, deduplicated and sorted', () => {
  assert.deepStrictEqual(watchedDirs([
    'C:/repo/src/gate.js',
    'C:/repo/src/loader.js',
    'C:/repo/src/sources/file.js',
    'C:/repo/node_modules/vitest/index.js',
    '/unix/repo/src/lib.js',
    'bare.js',
  ]), ['/unix/repo/src', 'C:/repo/src', 'C:/repo/src/sources']);
});

test('an empty input derives NO directory — and that must stay visible, not fabricated', () => {
  assert.deepStrictEqual(watchedDirs([]), []);
  assert.deepStrictEqual(watchedDirs(['C:/repo/node_modules/a/b.js']), []);
});
