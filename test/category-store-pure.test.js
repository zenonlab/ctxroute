// ═══════════════════════════════════════════════════════════════════════
// category-store-pure — one SCOPE's category state (same shape as `doc-seen-`)
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { categoriesOf, withCategories } from '../src/category-store-pure.js';

test('categoriesOf answers [] on an absent, null or malformed state', () => {
  assert.deepStrictEqual(categoriesOf({}), []);
  assert.deepStrictEqual(categoriesOf(undefined), []);
  assert.deepStrictEqual(categoriesOf(null), []);
  assert.deepStrictEqual(categoriesOf({ categories: 'not-an-array' }), []);
});

test('categoriesOf FILTERS a dirty array (a state read straight off disk is never trusted blindly)', () => {
  assert.deepStrictEqual(categoriesOf({ categories: ['x', 42, '', '   ', null, 'y'] }), ['x', 'y']);
});

test('withCategories then categoriesOf round-trips exactly what was declared', () => {
  const state = withCategories(['infra', 'seo']);
  assert.deepStrictEqual(categoriesOf(state), ['infra', 'seo']);
});

test('categoriesOf NEVER returns a live reference into the state', () => {
  const state = withCategories(['infra']);
  const read = categoriesOf(state);
  read.push('mutated-by-caller');
  assert.deepStrictEqual(categoriesOf(state), ['infra']);
});

test('withCategories dedupes and drops empty/non-string entries', () => {
  const state = withCategories(['infra', 'infra', '', '   ', 42, null, 'seo']);
  assert.deepStrictEqual(categoriesOf(state), ['infra', 'seo']);
});

test('withCategories on an empty/invalid result returns the EMPTY state {} — never {categories: []}', () => {
  assert.deepStrictEqual(withCategories([]), {});
  assert.deepStrictEqual(withCategories(undefined), {});
  assert.deepStrictEqual(withCategories('not-an-array'), {});
  assert.deepStrictEqual(withCategories(['', '   ']), {});
});

test('withCategories REPLACES, it never merges with anything (it takes no previous state)', () => {
  const state = withCategories(['seo']);
  assert.deepStrictEqual(categoriesOf(state), ['seo']);
});
