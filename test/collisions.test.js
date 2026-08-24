// DETERMINISTIC tests of collisions.js — Stryker target (DIRECT import,
// every evaluation INSIDE the callbacks — perTest contract).
import { test, expect } from 'vitest';
import { findCollisions } from '../src/collisions.js';

const rule = (pattern, doc, extra = {}) => ({ pattern, doc, ...extra });

test('folder containment → probable_parent_child, p1 = the short pattern', () => {
  const out = findCollisions([
    rule('deploy-site/', 'docs/parent.md'),
    rule('deploy-site/08-generate.md', 'docs/child.md'),
  ]);
  expect(out.length).toBe(1);
  expect(out[0].classification).toBe('probable_parent_child');
  expect(out[0].pattern_a).toBe('deploy-site/');
  expect(out[0].pattern_b).toBe('deploy-site/08-generate.md');
});

test('file containment (not a folder) → ambiguous, whatever the input order', () => {
  const a = rule('handlers.ts', 'docs/a.md');
  const b = rule('api-site/src/handlers.ts', 'docs/b.md');
  for (const rules of [[a, b], [b, a]]) {
    const out = findCollisions(rules);
    expect(out.length).toBe(1);
    expect(out[0].classification).toBe('ambiguous');
    expect(out[0].pattern_a).toBe('handlers.ts'); // always the short one in A
  }
});

test('identical pattern (norm: case + backslash) → potential_duplicate', () => {
  const out = findCollisions([
    rule('Stryker.conf.json', 'docs/a.md'),
    rule('stryker.conf.json', 'docs/b.md'),
  ]);
  expect(out.length).toBe(1);
  expect(out[0].classification).toBe('potential_duplicate');
});

test('the same doc = multi-pattern design, NEVER a collision', () => {
  expect(findCollisions([
    rule('a.js', 'docs/same.md'),
    rule('sub/a.js', 'docs/same.md'),
  ])).toEqual([]);
});

test('disjoint scopes = no real collision; overlapping or absent = a collision', () => {
  const mk = (sa, sb) => findCollisions([
    rule('x.js', 'docs/a.md', sa ? { scope: sa } : {}),
    rule('x.js', 'docs/b.md', sb ? { scope: sb } : {}),
  ]).length;
  expect(mk(['api-site'], ['api-calendar'])).toBe(0);
  expect(mk(['api-site'], ['api-site'])).toBe(1);
  expect(mk(null, ['api-site'])).toBe(1); // without a scope = global = overlaps everything
});

test('the parent\'s exclude covering the child = collision NEUTRALISED (containment only)', () => {
  expect(findCollisions([
    rule('conf', 'docs/parent.md', { exclude: ['stryker'] }),
    rule('stryker.conf.json', 'docs/child.md'),
  ])).toEqual([]);
  // an unrelated exclude = the collision is kept
  expect(findCollisions([
    rule('conf', 'docs/parent.md', { exclude: ['node_modules'] }),
    rule('stryker.conf.json', 'docs/child.md'),
  ]).length).toBe(1);
});

test('unrelated patterns = no collision; an empty list = []', () => {
  expect(findCollisions([rule('a.js', 'docs/a.md'), rule('b.js', 'docs/b.md')])).toEqual([]);
  expect(findCollisions([])).toEqual([]);
});

// ── Internal bricks tested DIRECTLY (their mutants are invisible through
//    findCollisions: norm is applied to BOTH sides of the comparisons) ──
import { norm, isContained, scopesOverlap, excludeNeutralizes, isFolderPattern } from '../src/collisions.js';

test('norm: backslash → slash, lowercase, null/undefined → empty string', () => {
  expect(norm('A\\B\\File.MD')).toBe('a/b/file.md');
  expect(norm(null)).toBe('');
  expect(norm(undefined)).toBe('');
});

test('isContained: strict (equal = no), case/backslash insensitive', () => {
  expect(isContained('a.js', 'path/a.js')).toBe(true);
  expect(isContained('a.js', 'a.js')).toBe(false);
  expect(isContained('A.JS', 'path\\a.js')).toBe(true);
  expect(isContained('x.js', 'path/a.js')).toBe(false);
});

test('scopesOverlap: an EMPTY scope [] = global (overlaps everything), ON BOTH SIDES', () => {
  expect(scopesOverlap({ scope: [] }, { scope: ['api-site'] })).toBe(true);
  expect(scopesOverlap({ scope: ['api-site'] }, { scope: [] })).toBe(true);
  expect(scopesOverlap({}, {})).toBe(true);
  expect(scopesOverlap({ scope: ['a'] }, { scope: ['a', 'b'] })).toBe(true);
  // ONE common scope is enough (some, never every):
  expect(scopesOverlap({ scope: ['a', 'x'] }, { scope: ['a'] })).toBe(true);
  expect(scopesOverlap({ scope: ['a'] }, { scope: ['b'] })).toBe(false);
});

test('excludeNeutralizes: an empty/absent exclude = false; ONE matching exclude is enough (some)', () => {
  expect(excludeNeutralizes({}, { pattern: 'x.js' })).toBe(false);
  expect(excludeNeutralizes({ exclude: [] }, { pattern: 'x.js' })).toBe(false);
  expect(excludeNeutralizes({ exclude: ['X.JS'] }, { pattern: 'path/x.js' })).toBe(true);
  expect(excludeNeutralizes({ exclude: ['unrelated', 'x.js'] }, { pattern: 'path/x.js' })).toBe(true);
});

test('output: scope_a/scope_b = the real scope if present, null otherwise', () => {
  const out = findCollisions([
    rule('x.js', 'docs/a.md', { scope: ['api-site'] }),
    rule('x.js', 'docs/b.md'),
  ]);
  expect(out.length).toBe(1);
  expect(out[0].scope_a).toEqual(['api-site']);
  expect(out[0].scope_b).toBe(null);
});

test('isFolderPattern: trailing slash (normalised backslash included)', () => {
  expect(isFolderPattern('deploy-site/')).toBe(true);
  expect(isFolderPattern('deploy-site\\')).toBe(true);
  expect(isFolderPattern('deploy-site')).toBe(false);
});

// ── Boundary case of kind: `same-pattern` NEVER reads the containment branches ──
test('same-pattern with an exclude on side A = STILL a collision (exclude only counts for containment)', () => {
  const out = findCollisions([
    rule('x.js', 'docs/a.md', { exclude: ['x.js'] }),
    rule('x.js', 'docs/b.md'),
  ]);
  expect(out.length).toBe(1);
  expect(out[0].classification).toBe('potential_duplicate');
});

test('same-pattern on a FOLDER pattern = potential_duplicate, never parent/child', () => {
  const out = findCollisions([
    rule('deploy-site/', 'docs/a.md'),
    rule('deploy-site/', 'docs/b.md'),
  ]);
  expect(out.length).toBe(1);
  expect(out[0].classification).toBe('potential_duplicate');
});
