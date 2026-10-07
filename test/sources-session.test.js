// DETERMINISTIC tests of sources/session.js — Stryker target (DIRECT import
// of the mutated module, all evaluation INSIDE the callbacks — perTest contract).
import { test, expect } from 'vitest';
import { sessionDocs, SOURCE_ID } from '../src/sources/session.js';

test('doc without frontmatter: body trimmed, id kept', () => {
  const out = sessionDocs([{ doc: 'session/a.md', text: '  content A\n' }]);
  expect(out).toEqual([{ doc: 'session/a.md', body: 'content A' }]);
});

test('frontmatter stripped: only the body is injected', () => {
  const text = '---\nrank: 1\n---\nbody usable\n';
  const out = sessionDocs([{ doc: 'session/b.md', text }]);
  expect(out).toEqual([{ doc: 'session/b.md', body: 'body usable' }]);
});

test('ALPHA order by id, independent of the corpus order', () => {
  const out = sessionDocs([
    { doc: 'session/z.md', text: 'Z' },
    { doc: 'session/a.md', text: 'A' },
    { doc: 'session/m.md', text: 'M' },
  ]);
  expect(out.map((d) => d.doc)).toEqual(['session/a.md', 'session/m.md', 'session/z.md']);
});

test('empty doc (or empty after stripping the frontmatter) = ignored', () => {
  const out = sessionDocs([
    { doc: 'session/empty.md', text: '   \n' },
    { doc: 'session/fm-seul.md', text: '---\nrank: 2\n---\n\n' },
    { doc: 'session/ok.md', text: 'ok' },
  ]);
  expect(out).toEqual([{ doc: 'session/ok.md', body: 'ok' }]);
});

test('empty corpus = empty list', () => {
  expect(sessionDocs([])).toEqual([]);
});

// ── `admits` (2026-10-07): WHO receives a doc — the caller's verdict, per declaration ──
test('admits receives each doc DECLARATION and keeps only what it accepts', () => {
  const seen = [];
  const out = sessionDocs([
    { doc: 'session/main.md', text: '---\ncategory: role:main\n---\nfor the main agent' },
    { doc: 'session/all.md', text: 'for everyone' },
  ], (decl) => { seen.push(decl); return decl.category === undefined; });
  expect(out).toEqual([{ doc: 'session/all.md', body: 'for everyone' }]);
  expect(seen).toContainEqual({ category: 'role:main' });
  expect(seen).toContainEqual({});
});

test('admits absent = every doc (the behaviour before `category` reached this corpus)', () => {
  const out = sessionDocs([{ doc: 'session/main.md', text: '---\ncategory: role:main\n---\nX' }]);
  expect(out).toEqual([{ doc: 'session/main.md', body: 'X' }]);
});

test('an EMPTY doc is dropped before admits is even asked', () => {
  let asked = 0;
  sessionDocs([{ doc: 'session/e.md', text: '---\ncategory: role:main\n---\n  ' }], () => { asked++; return true; });
  expect(asked).toBe(0);
});

test('SOURCE_ID is the CONTRACT name of the corpus in `defaults` and in the write guard', () => {
  // Written by hand, never read back from the module: an expectation derived from the value
  // under test mutates with it.
  expect(SOURCE_ID).toBe('session');
});
