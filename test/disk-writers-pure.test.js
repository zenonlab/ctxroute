// ═══════════════════════════════════════════════════════════════════════
// disk-writers-pure.js — the DETERMINISTIC suite (Stryker's target).
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ THE MODULE IS IMPORTED DIRECTLY, never through a re-export: `perTest`
//    coverage loses the mapping across a re-export, and the mutants then look
//    covered by other tests only — phantom survivors (measured 16/07/2026).
// ⚠️ EVERY FIXTURE IS A THUNK evaluated INSIDE the test. A `const` built at
//    module load belongs to NO test, so its mutants are "static" and survive
//    by construction (42 false survivors measured on this repository).
// ⚠️ THE EXPECTED MESSAGES ARE HARDCODED IN FULL. A test that derives its
//    expectation from the value it checks is mutated WITH the code and sees
//    nothing. These strings ARE the contract the reader of a red gate meets.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import { verdict, declarationFaults, isBudgetNumber, CLASSES, POLICIES, MIN_WHY, MIN_REASON }
  from '../src/disk-writers-pure.js';

const CLASS_LIST = 'state | snapshot | log | lock | evictor | rendezvous | vendor';
const POLICY_LIST = 'bounded-count | lifetime | event | age | none';
const SRC_LIST = 'paths. | kernelEndpoint.';

const sources = () => ['paths.', 'kernelEndpoint.'];
/** A declaration with nothing wrong with it. `why` sits EXACTLY on the bound. */
const okDecl = () => ({
  path: 'paths.stateDir()',
  class: 'state',
  budget: { maxFiles: 1 },
  policy: 'event',
  why: 'w'.repeat(40),
});
const longReason = () => 'r'.repeat(80);

// ── the CLOSED vocabularies ────────────────────────────────────────────

test('the vocabularies are CLOSED and say exactly what the messages say', () => {
  assert.deepStrictEqual(CLASSES, ['state', 'snapshot', 'log', 'lock', 'evictor', 'rendezvous', 'vendor']);
  assert.deepStrictEqual(POLICIES, ['bounded-count', 'lifetime', 'event', 'age', 'none']);
  assert.strictEqual(MIN_WHY, 40);
  assert.strictEqual(MIN_REASON, 80);
});

// ── isBudgetNumber ─────────────────────────────────────────────────────

test('a budget number is an integer >= 0 — ZERO included (an evictor creates nothing)', () => {
  assert.strictEqual(isBudgetNumber(0), true);
  assert.strictEqual(isBudgetNumber(1), true);
  assert.strictEqual(isBudgetNumber(4096), true);
});

test('a budget number refuses the negative, the fractional and the non-number', () => {
  assert.strictEqual(isBudgetNumber(-1), false);
  assert.strictEqual(isBudgetNumber(1.5), false);
  assert.strictEqual(isBudgetNumber('1'), false);
  assert.strictEqual(isBudgetNumber(null), false);
  assert.strictEqual(isBudgetNumber(undefined), false);
  assert.strictEqual(isBudgetNumber(NaN), false);
});

// ── declarationFaults: the SHAPE of one declaration ────────────────────

test('a complete declaration produces NO fault', () => {
  assert.deepStrictEqual(declarationFaults('src/a.js', okDecl(), sources()), []);
});

test('an unknown CLASS is refused, and the message names the closed list', () => {
  const d = okDecl();
  d.class = 'cache';
  assert.deepStrictEqual(declarationFaults('src/a.js', d, sources()),
    ['src/a.js: class "cache" REFUSED — only ' + CLASS_LIST]);
});

test('a MISSING class falls in the same fault (an absent word is not a word)', () => {
  const d = okDecl();
  delete d.class;
  assert.deepStrictEqual(declarationFaults('src/a.js', d, sources()),
    ['src/a.js: class "undefined" REFUSED — only ' + CLASS_LIST]);
});

test('an unknown POLICY is refused, and the message names the closed list', () => {
  const d = okDecl();
  d.policy = 'later';
  assert.deepStrictEqual(declarationFaults('src/a.js', d, sources()),
    ['src/a.js: policy "later" REFUSED — only ' + POLICY_LIST]);
});

test('a MISSING policy is the commonest form of the fault, and it is RED', () => {
  const d = okDecl();
  delete d.policy;
  assert.deepStrictEqual(declarationFaults('src/a.js', d, sources()),
    ['src/a.js: policy "undefined" REFUSED — only ' + POLICY_LIST]);
});

test('every legitimate class and every legitimate policy really passes', () => {
  for (const c of ['state', 'snapshot', 'log', 'lock', 'evictor', 'rendezvous', 'vendor']) {
    const d = okDecl();
    d.class = c;
    assert.deepStrictEqual(declarationFaults('src/a.js', d, sources()), [], 'class ' + c);
  }
  for (const p of ['bounded-count', 'lifetime', 'event', 'age']) {
    const d = okDecl();
    d.policy = p;
    assert.deepStrictEqual(declarationFaults('src/a.js', d, sources()), [], 'policy ' + p);
  }
});

test('a missing budget, a non-object budget and an empty budget are all refused', () => {
  const expected = ['src/a.js: no usable budget — declare an integer maxFiles and/or maxBytes (>= 0)'];
  for (const b of [undefined, null, 'plenty', {}, { maxFiles: 1.5 }, { maxBytes: -1 }]) {
    const d = okDecl();
    d.budget = b;
    assert.deepStrictEqual(declarationFaults('src/a.js', d, sources()), expected, JSON.stringify(b));
  }
});

test('EITHER key satisfies the budget, and ZERO is a legitimate value', () => {
  for (const b of [{ maxFiles: 0 }, { maxBytes: 0 }, { maxFiles: 0, maxBytes: 0 }, { maxBytes: 5 }]) {
    const d = okDecl();
    d.budget = b;
    assert.deepStrictEqual(declarationFaults('src/a.js', d, sources()), [], JSON.stringify(b));
  }
});

test('a justification shorter than the bound is refused, the bound itself passes', () => {
  const short = okDecl();
  short.why = 'w'.repeat(39);
  assert.deepStrictEqual(declarationFaults('src/a.js', short, sources()),
    ['src/a.js: the declaration carries no usable justification (why)']);

  const exact = okDecl();
  exact.why = 'w'.repeat(40);
  assert.deepStrictEqual(declarationFaults('src/a.js', exact, sources()), []);
});

test('a non-string justification is refused too (a number has no length)', () => {
  const d = okDecl();
  d.why = 42;
  assert.deepStrictEqual(declarationFaults('src/a.js', d, sources()),
    ['src/a.js: the declaration carries no usable justification (why)']);
});

test('a path from ANY declared source passes — the second one included', () => {
  const d = okDecl();
  d.path = 'kernelEndpoint.endpoint()';
  assert.deepStrictEqual(declarationFaults('src/a.js', d, sources()), []);
});

test('a path from NO declared source is refused — a module-shaped call is not a source', () => {
  const d = okDecl();
  d.path = 'os.homedir()';
  assert.deepStrictEqual(declarationFaults('src/a.js', d, sources()),
    ['src/a.js: path "os.homedir()" comes from no declared source (' + SRC_LIST
      + ') and no pathSourceGap explains it']);
});

test('a MISSING path is refused, and the message says so rather than throwing', () => {
  const d = okDecl();
  delete d.path;
  assert.deepStrictEqual(declarationFaults('src/a.js', d, sources()),
    ['src/a.js: path "undefined" comes from no declared source (' + SRC_LIST
      + ') and no pathSourceGap explains it']);
});

test('a WRITTEN pathSourceGap admits a foreign path — that is what makes the gap loud, not hidden', () => {
  const d = okDecl();
  d.path = 'os.homedir()';
  d.pathSourceGap = { reason: longReason(), workItem: 'WI-X' };
  assert.deepStrictEqual(declarationFaults('src/a.js', d, sources()), []);
});

test('a pathSourceGap without a real reason or without a work item does NOT admit it', () => {
  const expected = ['src/a.js: path "os.homedir()" comes from no declared source (' + SRC_LIST
    + ') and no pathSourceGap explains it'];
  for (const gap of [
    { reason: 'r'.repeat(79), workItem: 'WI-X' },
    { reason: longReason(), workItem: '' },
    { reason: longReason() },
    { workItem: 'WI-X' },
    {},
  ]) {
    const d = okDecl();
    d.path = 'os.homedir()';
    d.pathSourceGap = gap;
    assert.deepStrictEqual(declarationFaults('src/a.js', d, sources()), expected, JSON.stringify(gap));
  }
});

test('policy "none" is ADMISSIBLE — with a written reason and a work item', () => {
  const d = okDecl();
  d.policy = 'none';
  d.reason = longReason();
  d.workItem = 'WI-STATE-EVICTION';
  assert.deepStrictEqual(declarationFaults('src/a.js', d, sources()), []);
});

test('policy "none" without its reason or without its work item is RED', () => {
  const expected = ['src/a.js: policy "none" without a written reason and a workItem'
    + ' — an honest gap must be LOUD, never absent'];
  for (const extra of [
    {},
    { reason: longReason() },
    { workItem: 'WI-X' },
    { reason: 'r'.repeat(79), workItem: 'WI-X' },
    { reason: longReason(), workItem: '' },
  ]) {
    const d = Object.assign(okDecl(), { policy: 'none' }, extra);
    assert.deepStrictEqual(declarationFaults('src/a.js', d, sources()), expected, JSON.stringify(extra));
  }
});

test('a reason is demanded ONLY of "none" — another policy owes nothing', () => {
  const d = okDecl();
  d.policy = 'age';
  assert.deepStrictEqual(declarationFaults('src/a.js', d, sources()), []);
});

test('several defects on one declaration are ALL reported — none masks another', () => {
  // ⚠️ The order here is the ORDER OF THE CHECKS, hardcoded on purpose: only
  //    `verdict` sorts, and asserting the raw sequence is what proves no check
  //    short-circuits the ones after it.
  const d = { path: 'os.homedir()', class: 'cache', budget: {}, policy: 'later', why: 'short' };
  assert.deepStrictEqual(declarationFaults('src/a.js', d, sources()), [
    'src/a.js: class "cache" REFUSED — only ' + CLASS_LIST,
    'src/a.js: policy "later" REFUSED — only ' + POLICY_LIST,
    'src/a.js: no usable budget — declare an integer maxFiles and/or maxBytes (>= 0)',
    'src/a.js: the declaration carries no usable justification (why)',
    'src/a.js: path "os.homedir()" comes from no declared source (' + SRC_LIST
      + ') and no pathSourceGap explains it',
  ]);
});

// ── verdict: the whole manifest against the whole scan ─────────────────

const manifest = (over) => Object.assign({
  pathSources: ['paths.', 'kernelEndpoint.'],
  primitives: { writeFileSync: 'write', mkdirSync: 'write', readFileSync: 'read' },
  writers: {},
}, over);

test('nothing measured and nothing declared: GREEN', () => {
  assert.deepStrictEqual(verdict([], manifest()), []);
});

test('an EMPTY pathSources is refused — it would accept every path', () => {
  assert.deepStrictEqual(verdict([], manifest({ pathSources: [] })),
    ['pathSources is empty — every path would then be accepted,'
      + ' and the gate would certify instead of protecting']);
});

test('an ABSENT pathSources behaves like an empty one (never a silent pass)', () => {
  const m = manifest();
  delete m.pathSources;
  assert.deepStrictEqual(verdict([], m),
    ['pathSources is empty — every path would then be accepted,'
      + ' and the gate would certify instead of protecting']);
});

test('an UNCLASSIFIED primitive is RED — that is what keeps the write set DERIVED', () => {
  assert.deepStrictEqual(
    verdict([{ file: 'src/a.js', method: 'copyFileSync' }], manifest()),
    ['primitive copyFileSync is used but NOT CLASSIFIED — add it to primitives as "write" or "read"']);
});

test('an unclassified primitive is reported ONCE, however many call sites it has', () => {
  assert.deepStrictEqual(
    verdict([
      { file: 'src/a.js', method: 'copyFileSync' },
      { file: 'src/b.js', method: 'copyFileSync' },
    ], manifest()),
    ['primitive copyFileSync is used but NOT CLASSIFIED — add it to primitives as "write" or "read"']);
});

test('an UNPARSED match keeps an empty method and surfaces as unclassified, never dropped', () => {
  assert.deepStrictEqual(
    verdict([{ file: 'src/a.js', method: '' }], manifest()),
    ['primitive  is used but NOT CLASSIFIED — add it to primitives as "write" or "read"']);
});

test('a READER is not a writer: it needs no declaration at all', () => {
  assert.deepStrictEqual(verdict([{ file: 'src/a.js', method: 'readFileSync' }], manifest()), []);
});

test('a WRITER absent from the manifest is held at ZERO', () => {
  assert.deepStrictEqual(
    verdict([{ file: 'src/a.js', method: 'writeFileSync' }], manifest()),
    ['src/a.js: WRITES to disk (writeFileSync) and is NOT DECLARED'
      + ' — a writer absent from the manifest is held at ZERO']);
});

test('the methods of one writer are listed SORTED, whatever order the scanner met them in', () => {
  assert.deepStrictEqual(
    verdict([
      { file: 'src/a.js', method: 'writeFileSync' },
      { file: 'src/a.js', method: 'mkdirSync' },
      { file: 'src/a.js', method: 'readFileSync' },
    ], manifest()),
    ['src/a.js: WRITES to disk (mkdirSync, writeFileSync) and is NOT DECLARED'
      + ' — a writer absent from the manifest is held at ZERO']);
});

test('a DECLARED writer whose declaration is complete: GREEN', () => {
  assert.deepStrictEqual(
    verdict([{ file: 'src/a.js', method: 'writeFileSync' }],
      manifest({ writers: { 'src/a.js': okDecl() } })),
    []);
});

test('a declared writer with a BROKEN declaration reports the shape faults', () => {
  const d = okDecl();
  delete d.policy;
  assert.deepStrictEqual(
    verdict([{ file: 'src/a.js', method: 'writeFileSync' }], manifest({ writers: { 'src/a.js': d } })),
    ['src/a.js: policy "undefined" REFUSED — only ' + POLICY_LIST]);
});

test('a STALE declaration is RED — a dormant permit gets re-inherited', () => {
  assert.deepStrictEqual(
    verdict([], manifest({ writers: { 'src/gone.js': okDecl() } })),
    ['src/gone.js: DECLARED but no write primitive left'
      + ' — remove the entry (a stale declaration is a dormant permit)']);
});

test('a declaration covering only READS is stale too (the writes are what it permits)', () => {
  assert.deepStrictEqual(
    verdict([{ file: 'src/gone.js', method: 'readFileSync' }],
      manifest({ writers: { 'src/gone.js': okDecl() } })),
    ['src/gone.js: DECLARED but no write primitive left'
      + ' — remove the entry (a stale declaration is a dormant permit)']);
});

test('the faults are SORTED, never in the order the scanner walked the disk', () => {
  const faults = verdict([
    { file: 'src/z.js', method: 'writeFileSync' },
    { file: 'src/a.js', method: 'writeFileSync' },
  ], manifest());
  assert.deepStrictEqual(faults, [
    'src/a.js: WRITES to disk (writeFileSync) and is NOT DECLARED'
      + ' — a writer absent from the manifest is held at ZERO',
    'src/z.js: WRITES to disk (writeFileSync) and is NOT DECLARED'
      + ' — a writer absent from the manifest is held at ZERO',
  ]);
});

test('an ABSENT primitives table classifies nothing — every method goes RED', () => {
  const m = manifest();
  delete m.primitives;
  assert.deepStrictEqual(
    verdict([{ file: 'src/a.js', method: 'writeFileSync' }], m),
    ['primitive writeFileSync is used but NOT CLASSIFIED — add it to primitives as "write" or "read"']);
});

test('an ABSENT writers table means every writer is undeclared, never every writer allowed', () => {
  const m = manifest();
  delete m.writers;
  assert.deepStrictEqual(
    verdict([{ file: 'src/a.js', method: 'mkdirSync' }], m),
    ['src/a.js: WRITES to disk (mkdirSync) and is NOT DECLARED'
      + ' — a writer absent from the manifest is held at ZERO']);
});
