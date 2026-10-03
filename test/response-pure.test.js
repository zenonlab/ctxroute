// ═══════════════════════════════════════════════════════════════════════
// response-pure.test.js — what a tool ANSWERED, as the `response` setting reads it
// ═══════════════════════════════════════════════════════════════════════
// ⚠️ THE ANSWERS BELOW ARE COPIED FROM REAL HOOK PAYLOADS, never invented (measured
//    2026-09-23 on Claude Code 2.1.280, one isolated session, PostToolUse on every tool):
//    · MCP tool with structured content ⇒ `tool_response` is the STRING '{"state":"posted"}'
//    · Read ⇒ { type: 'text', file: { filePath, content, numLines, startLine, totalLines } }
//    · Bash ⇒ { stdout, stderr, interrupted, isImage, noOutputExpected }
//    A test that fabricates its answers proves only what its author believed.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { responseValues, responseRefuses } from '../src/response-pure.js';

const MCP_STRUCTURED = () => '{"state":"posted"}';
const READ = () => ({ type: 'text', file: { filePath: 'C:\\Work\\Invoice.TXT', content: 'Total: 42\nStatus: POSTED\n', numLines: 3, startLine: 1, totalLines: 3 } });
const BASH = () => ({ stdout: 'listening', stderr: 'Error: EADDRINUSE', interrupted: false, isImage: false, noOutputExpected: false });

test('a serialised MCP answer is read as the structure it encodes — its KEYS never match', () => {
  assert.deepStrictEqual(responseValues(MCP_STRUCTURED()).values, ['posted']);
  assert.strictEqual(responseRefuses({ scope: ['posted'] }, MCP_STRUCTURED()), false);
  assert.strictEqual(responseRefuses({ scope: ['state'] }, MCP_STRUCTURED()), true, 'a key name is not something the answer SAID');
  assert.strictEqual(responseRefuses({ scope: ['state'] }, '{"posted":1}'), true);
});

test('the answer\'s CONTENT is read — the ㊿ exclusion of content keys protects the gesture, never the answer', () => {
  // A Read answers its file under `content`: dropping that key would blind the setting to the answer itself.
  assert.strictEqual(responseRefuses({ scope: ['status: posted'] }, READ()), false);
  assert.ok(responseValues(READ()).values.includes('c:/work/invoice.txt'), 'normalised like the parameters: lower case, slashes');
  assert.strictEqual(responseRefuses({ scope: ['c:\\work\\invoice'] }, READ()), false, 'a backslash pattern reads the same');
});

test('scope = OR within a group, AND between groups; exclude = none may appear', () => {
  assert.strictEqual(responseRefuses({ scope: ['nothing', 'eaddrinuse'] }, BASH()), false);
  assert.strictEqual(responseRefuses({ scope: [['listening'], ['eaddrinuse']] }, BASH()), false);
  assert.strictEqual(responseRefuses({ scope: [['listening'], ['absent']] }, BASH()), true);
  assert.strictEqual(responseRefuses({ exclude: ['error'] }, BASH()), true);
  assert.strictEqual(responseRefuses({ exclude: ['absent'] }, BASH()), false);
  assert.strictEqual(responseRefuses({ scope: ['listening'], exclude: ['error'] }, BASH()), true, 'exclude wins');
});

test('a JSON text that is not a structure stays TEXT — "42" still says 42', () => {
  assert.deepStrictEqual(responseValues('42').values, ['42']);
  assert.deepStrictEqual(responseValues('"posted"').values, ['"posted"']);
  assert.strictEqual(responseRefuses({ scope: ['42'] }, '42'), false);
  assert.deepStrictEqual(responseValues('not json {').values, ['not json {']);
});

test('non-text answers say nothing, and nothing never satisfies a scope', () => {
  for (const answer of [null, undefined, 42, true, [], {}]) {
    assert.deepStrictEqual(responseValues(answer).values, [], `answer ${JSON.stringify(answer)}`);
    assert.strictEqual(responseRefuses({ scope: ['x'] }, answer), true);
    assert.strictEqual(responseRefuses({ exclude: ['x'] }, answer), false);
  }
});

test('JSON nested inside JSON is unfolded, arrays included', () => {
  const nested = JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ result: ['Invoice POSTED'] }) }] });
  assert.deepStrictEqual(responseValues(nested).values, ['text', 'invoice posted']);
});

test('the bounds are the parameters\' bounds, and crossing one is SAID', () => {
  // Depth: a chain deeper than the bound is cut, and `truncated` names it. Past the bound the
  // value is kept AS IS — here an object, which says nothing more at a depth nobody reads.
  let deep = 'bottom';
  for (let i = 0; i < 40; i++) deep = { k: deep };
  assert.strictEqual(responseValues(deep).truncated, 'depth');
  assert.deepStrictEqual(responseValues(deep).values, []);
  // Exactly AT the bound nothing is cut: a plain TEXT sitting at depth 20 (inside 20 objects) is
  // read, and no bound is reported — nothing was lost (the defect mutation found on 2026-09-23).
  let atBound = 'bottom';
  for (let i = 0; i < 20; i++) atBound = { k: atBound };
  assert.deepStrictEqual(responseValues(atBound), { values: ['bottom'], truncated: null });
  // But a JSON text AT the bound is NOT unfolded: it is kept raw (never dropped) and the cut is SAID.
  let jsonAtBound = '{"inner":"deep"}';
  for (let i = 0; i < 20; i++) jsonAtBound = { k: jsonAtBound };
  assert.deepStrictEqual(responseValues(jsonAtBound), { values: ['{"inner":"deep"}'], truncated: 'depth' });
  // One level above it IS unfolded, and nothing is cut: the unfolded object takes the SLOT of its
  // text (depth 19), so its own text sits at depth 20 — read like any text.
  let jsonBelow = '{"inner":"deep"}';
  for (let i = 0; i < 19; i++) jsonBelow = { k: jsonBelow };
  assert.deepStrictEqual(responseValues(jsonBelow), { values: ['deep'], truncated: null });
  // JSON inside JSON adds ONE level per wrap, never two: 12 wraps are read whole, nothing cut.
  let wraps = { a: 'core' };
  for (let i = 0; i < 12; i++) wraps = JSON.stringify({ w: wraps });
  assert.deepStrictEqual(responseValues(wraps), { values: ['core'], truncated: null });
  // Size: a text beyond the bound is not read, and `truncated` names it.
  assert.strictEqual(responseValues('x'.repeat(262145)).truncated, 'size');
  assert.strictEqual(responseValues('small').truncated, null);
  // The unfolding is bounded too: JSON encoded 21 times over (one past the bound — each level
  // doubles the escaping, so the text grows as 2^n and 21 is already ~2 M characters) is read
  // no deeper than the bound and never throws.
  let wrapped = { a: 'deepest' };
  for (let i = 0; i < 21; i++) wrapped = JSON.stringify({ w: wrapped });
  assert.doesNotThrow(() => responseValues(wrapped));
  // Past the bound the innermost JSON text is kept as TEXT (never dropped), and the cut is SAID.
  const past = responseValues(wrapped);
  assert.strictEqual(past.truncated, 'depth');
  assert.strictEqual(past.values.length, 1);
  assert.ok(past.values[0].includes('deepest'));
});
