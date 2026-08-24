// ═══════════════════════════════════════════════════════════════════════
// DETERMINISTIC tests of sources/tool.js (PURE module, Stryker-mutated).
// Trigger `tool:` = EXACT name of a native tool — the
// WebFetch/WebSearch blind spot filled on 19/07/2026 (proven mute by spawn before).
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import { matchingDocs, toolList } from '../src/sources/tool.js';

const doc = (name, fm) => ({ doc: `docs/${name}.md`, fm });
const payload = (toolName, toolInput = {}) => ({ toolName, toolInput });

test('toolList: string → 1-element list, list → as is, absent/mistyped → []', () => {
  assert.deepStrictEqual(toolList({ tool: 'WebFetch' }), ['WebFetch']);
  assert.deepStrictEqual(toolList({ tool: ['WebFetch', 'WebSearch'] }), ['WebFetch', 'WebSearch']);
  assert.deepStrictEqual(toolList({}), []);
  assert.deepStrictEqual(toolList({ tool: 42 }), []);
});

test('EXACT match on the tool name — never a substring, case-sensitive', () => {
  const docs = [doc('web', { tool: ['WebFetch', 'WebSearch'] })];
  assert.strictEqual(matchingDocs(docs, payload('WebFetch')).length, 1);
  assert.strictEqual(matchingDocs(docs, payload('WebSearch')).length, 1);
  // substring/case = ZERO match (the disjunction of the semantics, not a detail)
  assert.strictEqual(matchingDocs(docs, payload('WebFetchPlus')).length, 0);
  assert.strictEqual(matchingDocs(docs, payload('webfetch')).length, 0);
  assert.strictEqual(matchingDocs(docs, payload('Read')).length, 0);
});

test('empty/absent toolName → total silence (never match "nothing")', () => {
  const docs = [doc('web', { tool: 'WebFetch' })];
  assert.strictEqual(matchingDocs(docs, payload('')).length, 0);
  assert.strictEqual(matchingDocs(docs, {}).length, 0);
  assert.strictEqual(matchingDocs(docs, undefined).length, 0);
});

test('doc without fm or without a tool key → ignored without a throw (totality)', () => {
  const docs = [{ doc: 'docs/x.md', fm: null }, doc('y', { match: 'a.js' })];
  assert.strictEqual(matchingDocs(docs, payload('WebFetch')).length, 0);
});

test('scope = AND over the concatenated params (same semantics as the file source)', () => {
  const docs = [doc('web', { tool: 'WebFetch', scope: ['docs.x.ai'] })];
  assert.strictEqual(matchingDocs(docs, payload('WebFetch', { url: 'https://docs.x.ai/api' })).length, 1);
  assert.strictEqual(matchingDocs(docs, payload('WebFetch', { url: 'https://other.com' })).length, 0);
});

test('exclude = NOT over the context (here the tool name)', () => {
  const docs = [doc('web', { tool: ['WebFetch', 'WebSearch'], exclude: ['WebSearch'] })];
  assert.strictEqual(matchingDocs(docs, payload('WebFetch')).length, 1);
  assert.strictEqual(matchingDocs(docs, payload('WebSearch')).length, 0);
});

test('corpus order preserved + {doc} refs', () => {
  const docs = [doc('a', { tool: 'X' }), doc('b', { tool: 'X' })];
  assert.deepStrictEqual(matchingDocs(docs, payload('X')), [{ doc: 'docs/a.md' }, { doc: 'docs/b.md' }]);
});

// ═══════════════════════════════════════════════════════════════════════
// WILDCARD `*` (31/07/2026, REFACTOR-PLAN §B/§B0)
// ⚠️ BEFORE: `tool: ["*"]` was accepted by validate() AND matched NOTHING —
//    the syntax everyone tries spontaneously was silently
//    dead AND certified valid. An ACTIVE TRAP, not an absent feature.
// ⚠️ These tests also seal §B0: NEGATION becomes usable on the tool
//    axis (`*` + exclude = "all EXCEPT X"), which was INEXPRESSIBLE.
// ═══════════════════════════════════════════════════════════════════════

test('WILDCARD: `*` matches ANY tool (the gesture, not the place)', () => {
  const docs = [doc('geste', { tool: ['*'], scope: ['docker run'] })];
  // 4 distinct channels: POSIX shell, Windows shell, MCP tool, native tool.
  for (const tool of ['Bash', 'PowerShell', 'mcp__ssh__ssh_exec', 'OutilInventeDemain']) {
    assert.strictEqual(matchingDocs(docs, payload(tool, { command: 'docker run -d nginx' })).length, 1,
      `the wildcard must match ${tool} — that is its whole point: do NOT enumerate`);
  }
});

test('WILDCARD: NEGATIVE case — an empty/absent tool name NEVER matches', () => {
  // ⚠️ "any tool" presupposes that there IS a tool. Without this guard,
  //    a degraded payload would trigger all the wildcard docs of the corpus.
  const docs = [doc('geste', { tool: ['*'], scope: ['docker'] })];
  assert.strictEqual(matchingDocs(docs, payload('', { command: 'docker run' })).length, 0);
  assert.strictEqual(matchingDocs(docs, payload(undefined, { command: 'docker run' })).length, 0);
  assert.strictEqual(matchingDocs(docs, { toolInput: { command: 'docker run' } }).length, 0);
});

test('WILDCARD: `scope` still FILTERS — the wildcard is not a free pass', () => {
  const docs = [doc('geste', { tool: ['*'], scope: ['docker run'] })];
  assert.strictEqual(matchingDocs(docs, payload('Bash', { command: 'ls -la' })).length, 0,
    'without the targeted gesture, the wildcard must inject NOTHING');
});

test('§B0: `*` + `exclude` = "ALL THE TOOLS EXCEPT X" (inexpressible before)', () => {
  const docs = [doc('partout', { tool: ['*'], exclude: ['Read'] })];
  assert.strictEqual(matchingDocs(docs, payload('Bash')).length, 1);
  assert.strictEqual(matchingDocs(docs, payload('Write')).length, 1);
  assert.strictEqual(matchingDocs(docs, payload('Read')).length, 0, 'the excluded tool must NOT match');
});

test('WILDCARD: `*` mixed with explicit names stays a wildcard (absorbs)', () => {
  const docs = [doc('mix', { tool: ['Bash', '*'], exclude: ['Read'] })];
  assert.strictEqual(matchingDocs(docs, payload('Bash')).length, 1);
  assert.strictEqual(matchingDocs(docs, payload('WebFetch')).length, 1);
  assert.strictEqual(matchingDocs(docs, payload('Read')).length, 0);
});

test('NON-REGRESSION: without `*`, the matching stays EXACT (never a substring)', () => {
  const docs = [doc('exact', { tool: ['Web'] })];
  assert.strictEqual(matchingDocs(docs, payload('WebFetch')).length, 0,
    'a partial name must never match: the === semantics is the contract of this axis');
  assert.strictEqual(matchingDocs(docs, payload('Web')).length, 1);
});
