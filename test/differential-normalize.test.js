// ═══════════════════════════════════════════════════════════════════════
// differential-normalise — MANDATORY NEGATIVE-CHECK
// ═══════════════════════════════════════════════════════════════════════
// 🛑 REASON FOR EXISTING: `withoutOrdinal()` DELIBERATELY WEAKENS the differentials
//    (it removes material before comparison). An untested comparison
//    function can swallow a REAL regression, and both
//    safety nets would stay GREEN on it. That is the only risk of the module, and these
//    four parts are what holds it.
// ⚠️ Same discipline as the negative-check of `unseal()` in
//    `pretool-differential.test.js` — NEVER ship one without the other.
import { test } from 'vitest';
import assert from 'node:assert';
import { withoutOrdinal, alignChunked } from '../src/differential-normalize.js';

const NU = 'doc body\n[source: .claude/hooks/docs/a.md]';

test('withoutOrdinal: removes the ordinal placed after the source tag, and NOTHING else', () => {
  assert.strictEqual(withoutOrdinal(NU + ' [DOC 2/5]'), NU);
  // Several documents in the same context: all cleaned.
  const deux = NU + ' [DOC 1/2]\n\n---\n\nother\n[source: docs/mcp/odoo.md] [DOC 2/2]';
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

// ═══════════════════════════════════════════════════════════════════════
// alignChunked — the CHUNKING gap, and its MANDATORY negative-check
// ═══════════════════════════════════════════════════════════════════════
// ⚠️ Fixtures are THUNKS evaluated inside the cells (perTest: a module-level
//    const calling mutated code is a static mutant, hence a false survivor).
const ORACLE = () => 'line one\nline two\nline three\n[source: docs/x.md]';
// The engine's frame, envelope EXACTLY as `budget.js` composes it: chunk header
// + the first tranche + the deferral announcement for the surplus chunks.
const chunkHeader = (j, m) => '⟦ docs/x.md — CHUNK ' + j + '/' + m + ' : reassemble the ' + m + ' chunks in order before reading ⟧\n';
const deferred = () => '\n\n⚠️ 1 doc(s) DEFERRED — the frame is full, they follow on the next tool call(s).\n'
  + '   Nothing is lost: they are queued, in order. If your action touches them NOW, read them:\n'
  + '   - docs/x.md';
const frame = (body, j = 1, m = 2) => chunkHeader(j, m) + body + deferred();

// ① THE FIX: a doc that outgrew one frame no longer breaks parity.
test('alignChunked: a CHUNKED delivery compares equal to the oracle whole doc (prefix, line boundary)', () => {
  const r = alignChunked(frame('line one\nline two'), ORACLE());
  assert.strictEqual(r.actual, r.expected, 'chunk 1/m, envelope removed, IS a prefix of the oracle doc');
  assert.strictEqual(r.actual, 'line one\nline two', 'the envelope is removed, the CONTENT is not touched');
  // Nothing chunked ⇒ IDENTITY: the nominal path stays a STRICT equality.
  const nu = alignChunked(ORACLE(), ORACLE());
  assert.strictEqual(nu.actual, ORACLE());
  assert.strictEqual(nu.expected, ORACLE());
  // TOTAL: a differential that crashes reads like an engine outage.
  for (const x of [undefined, null, 42, {}]) {
    assert.strictEqual(alignChunked(x, ORACLE()).actual, x);
    assert.strictEqual(alignChunked(ORACLE(), x).expected, x);
  }
});

// ② 🛑 WITHOUT THIS CELL THE FILTER IS A WAY TO MAKE EVERY FUTURE REGRESSION
//    INVISIBLE. Four sabotages, each a REAL defect the filter must not swallow.
test('alignChunked: a CONTENT divergence still FAILS, chunked or not', () => {
  const O = ORACLE();
  // ⓐ the content of the delivered chunk changed ⇒ visible.
  const a = alignChunked(frame('line one\nLINE TWO'), O);
  assert.notStrictEqual(a.actual, a.expected, 'a divergence INSIDE the delivered chunk must stay red');
  // ⓑ not chunked at all, content changed ⇒ visible (identity path untouched).
  const b = alignChunked(O.replace('line two', 'LINE TWO'), O);
  assert.notStrictEqual(b.actual, b.expected);
  // ⓒ a cut that is NOT on a line boundary is not the protocol's cut ⇒ refused,
  //    hence red. This is what keeps the comparison from degenerating into a
  //    bare `startsWith` that any truncation would satisfy.
  const c = alignChunked(frame('line one\nline t'), O);
  assert.notStrictEqual(c.actual, c.expected);
  // ⓓ chunk 3/5 is NOT a prefix of anything: never normalized.
  const d = alignChunked(frame('line three', 3, 5), O);
  assert.notStrictEqual(d.actual, d.expected);
});
