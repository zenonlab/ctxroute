// DETERMINISTIC tests of sources/session.js — Stryker target (DIRECT import
// of the mutated module, all evaluation INSIDE the callbacks — perTest contract).
import { test, expect } from 'vitest';
import { sessionDocs } from '../src/sources/session.js';

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
