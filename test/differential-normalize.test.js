// ═══════════════════════════════════════════════════════════════════════
// differential-normalise — MANDATORY NEGATIVE-CHECK
// ═══════════════════════════════════════════════════════════════════════
// 🛑 REASON FOR EXISTING: `withoutOrdinal()` DELIBERATELY WEAKENS the differentials
//    (it removes material before comparison). An untested comparison
//    function can swallow a REAL regression, and both
//    safety nets would stay GREEN on it. That is the only risk of the module, and these
//    four parts are what holds it.
// ⚠️ Same discipline as the negative-check of `desceller()` in
//    `pretool-differential.test.js` — NEVER ship one without the other.
import { test } from 'vitest';
import assert from 'node:assert';
import { withoutOrdinal } from '../src/differential-normalize.js';

const NU = 'doc body\n[source: .claude/hooks/docs/a.md]';

test('withoutOrdinal: removes the ordinal placed after the source tag, and NOTHING else', () => {
  assert.strictEqual(withoutOrdinal(NU + ' [DOC 2/5]'), NU);
  // Several documents in the same context: all cleaned.
  const deux = NU + ' [DOC 1/2]\n\n---\n\nautre\n[source: docs/mcp/odoo.md] [DOC 2/2]';
  assert.strictEqual(withoutOrdinal(deux).includes('[DOC '), false);
  assert.strictEqual(withoutOrdinal(deux).includes('[source: docs/mcp/odoo.md]'), true,
    'the source tag MUST survive — it is the path the agent follows to fix the doc');
});

test('withoutOrdinal: a context WITHOUT an ordinal comes back out byte for byte', () => {
  assert.strictEqual(withoutOrdinal(NU), NU);
  assert.strictEqual(withoutOrdinal(''), '');
});

// 🛑 THE PART THAT COUNTS — without it, a BLIND erasure would pass the three
//    others while making the differentials one-eyed on real content.
test('withoutOrdinal: a [DOC x/y] from the BODY of a doc SURVIVES (never a blind erasure)', () => {
  const corpsQuiEnParle = 'the frame carries [DOC 1/3]\n[source: .claude/hooks/docs/b.md]';
  assert.strictEqual(withoutOrdinal(corpsQuiEnParle), corpsQuiEnParle);
  // And the mixed case: the body keeps its own, the tag loses its own.
  const mixte = 'example [DOC 9/9] in the text\n[source: .claude/hooks/docs/c.md] [DOC 1/2]';
  assert.strictEqual(withoutOrdinal(mixte),
    'example [DOC 9/9] in the text\n[source: .claude/hooks/docs/c.md]');
});

test('withoutOrdinal: a CONTENT divergence stays VISIBLE after normalization', () => {
  const a = withoutOrdinal(NU + ' [DOC 2/5]');
  const b = withoutOrdinal(NU.replace('doc body', 'DOC BODY') + ' [DOC 2/5]');
  assert.notStrictEqual(a, b, 'the normalization must NEVER mask a content difference');
  // A different source path = a REAL divergence, it must survive.
  const c = withoutOrdinal(NU.replace('a.md', 'z.md') + ' [DOC 2/5]');
  assert.notStrictEqual(a, c);
});

// TOTAL — called on an absent value (`undefined` context on the MCP side when
// the hook injects nothing), it must NOT throw: a differential that crashes
// reads like an engine failure.
test('withoutOrdinal: TOTAL — a non-string input is returned as is, never a throw', () => {
  for (const x of [undefined, null, 42, {}]) assert.strictEqual(withoutOrdinal(x), x);
});
