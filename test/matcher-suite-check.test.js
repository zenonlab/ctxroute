// ═══════════════════════════════════════════════════════════════════════════
// matcher-suite-check — DEFECT 2 CLOSED: the linked matcher's suite runs for
// somebody. See tools/matcher-suite-check.js for the full contract.
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ `decide()`/`resolvePackageDir()` are PURE with respect to their explicit
//    inputs — this suite proves the THREE-WAY contract with FABRICATED
//    inputs, never a real spawn of the sibling package (that would make the
//    suite depend on the maintainer's real disk layout, and would be slow).
//    The REAL end-to-end proof (sibling broken ⇒ `npm test` red; sibling
//    renamed ⇒ `npm test` still green with a named notice) is a manual
//    acceptance step, not something an in-process unit test can fabricate
//    without editing a second real repository.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { resolvePackageDir, decide, PACKAGE_SPEC } from '../tools/matcher-suite-check.js';

// Minimal io double: real node `path` semantics (POSIX-style here, the
// production code uses the real `path` module) over a FAKE in-memory tree.
const posixIo = (overrides) => ({
  env: {},
  dirname: (p) => p.split('/').slice(0, -1).join('/') || '/',
  join: (...parts) => parts.join('/'),
  exists: () => {
    throw new Error('exists must not be called by resolvePackageDir');
  },
  readFile: () => {
    throw new Error('readFile must not be called by resolvePackageDir');
  },
  resolve: () => {
    throw new Error('resolve must be provided by the test');
  },
  ...overrides,
});

test('resolvePackageDir ①: the env override WINS over node resolution', () => {
  const dir = resolvePackageDir(
    posixIo({
      env: { CTXROUTE_MATCHER_PACKAGE_DIR: '/fake/override' },
      resolve: () => {
        throw new Error('resolve must not be called when the override is set');
      },
    })
  );
  assert.equal(dir, '/fake/override');
});

test('resolvePackageDir ②: resolves the ENTRY (never a "/package.json" subpath — a package that declares `exports` refuses it) then walks up to the matching package.json', () => {
  const files = {
    '/resolved/pkg/package.json': JSON.stringify({ name: PACKAGE_SPEC }),
  };
  const dir = resolvePackageDir(
    posixIo({
      resolve: (spec) => {
        assert.equal(spec, PACKAGE_SPEC); // NEVER `${spec}/package.json`
        return '/resolved/pkg/src/leak-pure.js';
      },
      exists: (p) => Object.prototype.hasOwnProperty.call(files, p),
      readFile: (p) => files[p],
    })
  );
  assert.equal(dir, '/resolved/pkg');
});

test('resolvePackageDir ③: walks up MULTIPLE levels until the package.json NAME actually matches', () => {
  const files = {
    // a decoy package.json one level up, belonging to someone else
    '/root/scope/pkg/deep/package.json': JSON.stringify({ name: 'not-the-matcher' }),
    '/root/scope/pkg/package.json': JSON.stringify({ name: PACKAGE_SPEC }),
  };
  const dir = resolvePackageDir(
    posixIo({
      resolve: () => '/root/scope/pkg/deep/entry.js',
      exists: (p) => Object.prototype.hasOwnProperty.call(files, p),
      readFile: (p) => files[p],
    })
  );
  assert.equal(dir, '/root/scope/pkg');
});

test('resolvePackageDir ④: an unresolvable spec (MODULE_NOT_FOUND) yields null, never a throw', () => {
  const dir = resolvePackageDir(
    posixIo({
      resolve: () => {
        const err = new Error('Cannot find module');
        err.code = 'MODULE_NOT_FOUND';
        throw err;
      },
    })
  );
  assert.equal(dir, null);
});

test('resolvePackageDir ⑤: reaching the filesystem root with no matching package.json yields null, never an infinite loop', () => {
  const dir = resolvePackageDir(
    posixIo({
      resolve: () => '/entry.js',
      exists: () => false,
    })
  );
  assert.equal(dir, null);
});

test('decide ①: sibling unresolvable (dir === null) ⇒ DEGRADE, named, never a throw', () => {
  const outcome = decide(null, () => {
    throw new Error('exists() must not be called on a null dir');
  });
  assert.equal(outcome.action, 'degrade');
  assert.match(outcome.reason, /not resolvable/);
  // The message names the PACKAGE SPEC, never an absolute path.
  assert.ok(outcome.reason.includes(PACKAGE_SPEC));
});

test('decide ②: sibling resolved but the directory is GONE (renamed folder) ⇒ DEGRADE, named', () => {
  const outcome = decide('/some/resolved/dir', () => false);
  assert.equal(outcome.action, 'degrade');
  assert.match(outcome.reason, /not resolvable/);
});

test('decide ③: sibling resolved, directory present, but vitest missing (never npm ci) ⇒ DEGRADE, named', () => {
  let calls = 0;
  const outcome = decide('/some/resolved/dir', (p) => {
    calls += 1;
    if (calls === 1) {
      assert.equal(p, '/some/resolved/dir');
      return true; // the directory itself exists
    }
    assert.ok(p.endsWith('vitest.mjs'));
    return false; // no installed vitest
  });
  assert.equal(outcome.action, 'degrade');
  assert.match(outcome.reason, /no installed vitest/);
});

test('decide ④: sibling resolved AND runnable ⇒ RUN, carrying the real vitest entry', () => {
  const outcome = decide('/some/resolved/dir', () => true);
  assert.equal(outcome.action, 'run');
  assert.equal(outcome.dir, '/some/resolved/dir');
  assert.ok(outcome.vitestEntry.includes('node_modules') && outcome.vitestEntry.includes('vitest.mjs'));
});

// ⚠️ NEGATIVE-CHECK — anti-vacuity: `decide` must really DISTINGUISH the two
//    "everything is fine" cases from the two "something is missing" cases,
//    never answer the same action regardless of the exists() probe.
test('NEGATIVE-CHECK: decide is NOT constant — degrade and run are reachable AND distinct', () => {
  const degraded = decide(null, () => true);
  const ran = decide('/x', () => true);
  assert.notEqual(degraded.action, ran.action);
});
