// DETERMINISTIC tests of harness-conformance.js (Stryker target).
// ⚠️ CONTRACT values hard-coded — never derived from the code under test.
import { test } from 'vitest';
import assert from 'node:assert';
import { conformance, candidateKeys, looksLikePath } from '../src/harness-conformance.js';

const COMPLET = {
  tool_name: 'Read', tool_input: { file_path: '/a/b.js' },
  session_id: 's1', cwd: '/w', transcript_path: '/t.jsonl', agent_id: 'a1',
};

test('㊾ COMPLETE payload → supported, zero degradation', () => {
  const r = conformance(COMPLET);
  assert.strictEqual(r.verdict, 'supported');
  assert.deepStrictEqual(r.degradations, []);
});

test('㊾ each optional absent → degrade, and the degradation is NAMED', () => {
  for (const key of ['session_id', 'cwd', 'transcript_path', 'agent_id']) {
    const p = { ...COMPLET };
    delete p[key];
    const r = conformance(p);
    assert.strictEqual(r.verdict, 'degraded', key);
    assert.strictEqual(r.degradations.length, 1, key);
    assert.strictEqual(r.degradations[0].capability, key);
    assert.ok(r.degradations[0].degradation.length > 20, 'a degradation without a written consequence is a binary yes-no');
  }
});

test('㊾ a REQUIRED item absent/invalid → incompatible, whatever the rest', () => {
  assert.strictEqual(conformance({ ...COMPLET, tool_name: '' }).verdict, 'incompatible');
  assert.strictEqual(conformance({ ...COMPLET, tool_name: undefined }).verdict, 'incompatible');
  assert.strictEqual(conformance({ ...COMPLET, tool_input: 'not-an-object' }).verdict, 'incompatible');
  assert.strictEqual(conformance({ ...COMPLET, tool_input: null }).verdict, 'incompatible');
  // TOTAL: payload absent ⇒ a verdict, never a throw (a diagnosis that crashes = a false engine verdict).
  assert.strictEqual(conformance(undefined).verdict, 'incompatible');
});

test('㊾/51 diagnosis: an UNKNOWN key with a path shape is a CANDIDATE, at any depth', () => {
  const r = conformance({ tool_name: 'X', tool_input: { op: { target: { ref: '/srv/x' } }, files: ['/a/b'] } });
  assert.deepStrictEqual(r.candidateKeys, ['files', 'ref']);
});

test('㊾/51 diagnosis: the profile\'s KNOWN keys are NEVER candidates', () => {
  // file_path/path/command/content/cwd = already decided (pathKeys/commandKeys/contentKeys/cwd).
  const r = conformance({ tool_name: 'X', tool_input: { file_path: '/a/b', path: '/c', command: 'ls /x', content: '/z/z', cwd: '/w' } });
  assert.deepStrictEqual(r.candidateKeys, []);
});

test('㊾/51 diagnosis: never a DECISION — the path shape is strict', () => {
  // a sentence with a slash is not a path; nor is a short string.
  assert.strictEqual(looksLikePath('read a/b then c'), false);
  assert.strictEqual(looksLikePath('a/'), false);
  assert.strictEqual(looksLikePath('C:\\x\\y'), true);
  assert.strictEqual(looksLikePath(42), false);
  // an array element inherits the name of its parent key (same rule as the engine).
  assert.deepStrictEqual(candidateKeys({ list: ['/a/b'] }), ['list']);
  // dedup + sort: two occurrences of a key = ONE candidate.
  assert.deepStrictEqual(candidateKeys({ x: { ref: '/a/b' }, y: { ref: '/c/d' } }), ['ref']);
});

// ═══ KILLER CASES FOR THE 21 SURVIVORS OF THE 1st PASS (boundaries + coercion) ═══
// Lesson: 2-character fixtures made half the guards
// indistinguishable from their mutants. Each case below names its target.
test('㊾ boundaries of looksLikePath — 3 characters is a path, an array never', () => {
  assert.strictEqual(looksLikePath('a/b'), true, 'length 3 = the exact boundary of the guard');
  // an ARRAY coerces into "a/b,c,d,e" (length > 3, slash present): only the
  // typeof guard rejects it — that is what we prove here.
  assert.strictEqual(looksLikePath(['/a/b', 'c', 'd', 'e']), false);
});
test('㊾/51 diagnosis: depth BOUNDED at 20 — beyond that, the key is no longer seen', () => {
  const enfouir = (n, leaf) => (n === 0 ? leaf : { w: enfouir(n - 1, leaf) });
  assert.deepStrictEqual(candidateKeys({ ref: enfouir(5, { target: '/a/b' }) }), ['target']);
  assert.deepStrictEqual(candidateKeys({ ref: enfouir(25, { target: '/a/b' }) }), [], 'same bound as the engine: 20 levels');
  // the exact BOUNDARY (kills the mutant prof <= 20): last visible level vs first invisible.
  assert.deepStrictEqual(candidateKeys({ ref: enfouir(18, { target: '/a/b' }) }), ['target']);
  assert.deepStrictEqual(candidateKeys({ ref: enfouir(19, { target: '/a/b' }) }), []);
});
test('㊾/51 diagnosis: a null/non-object value NEVER crashes the traversal', () => {
  assert.deepStrictEqual(candidateKeys({ x: null, y: 42, z: true, w: undefined }), []);
});
test('㊾/51 diagnosis: `cwd` is a KNOWN key even with a path-shaped value', () => {
  assert.deepStrictEqual(candidateKeys({ cwd: '/w/x/y' }), [], 'cwd is decided by the profile, never a candidate');
});
test('㊾ the report CARRIES the names and the roles — an anonymous report is a binary yes-no', () => {
  const r = conformance(COMPLET);
  assert.deepStrictEqual(r.requis.map((x) => x.capability), ['tool_name', 'tool_input']);
  for (const x of r.requis) assert.ok(x.role.length > 20, x.capability + ': a required item without a written role explains nothing');
});
test('㊾ an optional capability as an EMPTY STRING = absent (not "present but empty")', () => {
  for (const key of ['session_id', 'cwd', 'transcript_path', 'agent_id']) {
    const r = conformance({ ...COMPLET, [key]: '' });
    assert.strictEqual(r.verdict, 'degraded', key);
    assert.strictEqual(r.degradations[0].capability, key);
  }
});
