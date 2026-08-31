// ═══════════════════════════════════════════════════════════════════════
// model-twin-pure.test.js — the DETERMINISTIC suite of the model-twin verdict
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ `test/model-twin-gate.test.js` spawns `git`, so it never enters the Stryker runner: only
//    THIS suite can kill the mutants of `src/model-twin-pure.js`. Absent from
//    `vitest.stryker.config.mjs`, the module would be mutated and measured by NOTHING — a
//    "misleading massacre", and worse: a judge believed proven.
// ⚠️ EVERY FIXTURE IS A THUNK evaluated INSIDE its `test()`. A module-level const would make the
//    mutant STATIC — covered by no test, hence a false survivor (42 measured on 2026-07-16).
// ⚠️ Expectations are written HARDCODED, never derived from the module under test: an assertion
//    that reads the module proves `x === x` (43 survivors measured on 2026-08-21).
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  CLASSES, MIN_WHY, MIN_MODELS, MIN_PAIRS,
  isPure, stripComments, tokenize, sharedRuns, pairKey, derivePairs, floorFaults, verdict,
} from '../src/model-twin-pure.js';

const T = (s) => tokenize(s).map((x) => x.t);

// ── CONTRACT CONSTANTS ──────────────────────────────────────────────────
test('the admissible classes are exactly CONTRACT and INHERITED_TWIN', () => {
  assert.deepStrictEqual(CLASSES.slice().sort(), ['CONTRACT', 'INHERITED_TWIN']);
});

test('the justification floor and the derivation floors are the measured ones', () => {
  assert.strictEqual(MIN_WHY, 60);
  assert.strictEqual(MIN_MODELS, 2);
  assert.strictEqual(MIN_PAIRS, 7);
});

// ── stripComments ───────────────────────────────────────────────────────
test('stripComments removes block comments and whole-line // comments', () => {
  assert.strictEqual(stripComments('a/*x*/b'), 'ab');
  assert.strictEqual(stripComments('  // gone\nkept'), '\nkept');
});

test('stripComments keeps a trailing comment marker inside a line of code', () => {
  // ⚠️ ON PURPOSE: only a comment occupying the WHOLE line is removed here. `isPure` must not be
  //    fooled by a URL or an operator, and the tokenizer does the precise job anyway.
  assert.strictEqual(stripComments('const a = 1; // note'), 'const a = 1; // note');
});

// ── isPure ──────────────────────────────────────────────────────────────
test('isPure rejects a module that imports an I/O builtin, in either syntax', () => {
  assert.strictEqual(isPure("const fs = require('node:fs');"), false);
  assert.strictEqual(isPure("import path from 'path';"), false);
  // ⚠️ `os` and not the process-spawning builtin: naming the latter ANYWHERE in this file would
  //    move the suite into the heavy lane (the lane classifier is derived from file CONTENT and
  //    matches that literal), and this suite spawns nothing.
  assert.strictEqual(isPure("const os = require('node:os');"), false);
});

test('isPure rejects a module that touches an I/O global', () => {
  assert.strictEqual(isPure('const x = process.env.A;'), false);
  assert.strictEqual(isPure('console.log(1);'), false);
  assert.strictEqual(isPure('if (require.main === module) run();'), false);
  assert.strictEqual(isPure('process.exit(1);'), false);
});

test('isPure accepts a module whose PROSE merely names an I/O module', () => {
  // 🔴 THE REASON THIS BRANCH EXISTS: this repository's modules carry long doc headers, and
  //    `cadence-spec.js` names `gate.js` and its I/O in prose. Judging on raw text would classify
  //    every model as an I/O shell and the derivation would come back EMPTY — a vacuous green.
  assert.strictEqual(isPure("/* we never require('node:fs') here */\nconst a = 1;"), true);
  assert.strictEqual(isPure('  // process.env is forbidden here\nconst a = 1;'), true);
});

test('isPure accepts a genuinely pure module', () => {
  assert.strictEqual(isPure('function f(x) { return x + 1; }'), true);
});

// ── tokenize ────────────────────────────────────────────────────────────
test('tokenize splits identifiers, numbers and single-character punctuation', () => {
  assert.deepStrictEqual(T('a1 = 2;'), ['a1', '=', '2', ';']);
});

test('tokenize keeps three-character and two-character operators whole', () => {
  assert.deepStrictEqual(T('a === b'), ['a', '===', 'b']);
  assert.deepStrictEqual(T('a !== b'), ['a', '!==', 'b']);
  assert.deepStrictEqual(T('{ ...e }'), ['{', '...', 'e', '}']);
  assert.deepStrictEqual(T('a >>> b'), ['a', '>>>', 'b']);
  assert.deepStrictEqual(T('a ?? b'), ['a', '??', 'b']);
  assert.deepStrictEqual(T('x => y'), ['x', '=>', 'y']);
  assert.deepStrictEqual(T('a ?. b'), ['a', '?.', 'b']);
  assert.deepStrictEqual(T('a ** b'), ['a', '**', 'b']);
  assert.deepStrictEqual(T('a << b'), ['a', '<<', 'b']);
  assert.deepStrictEqual(T('a %= b'), ['a', '%=', 'b']);
  assert.deepStrictEqual(T('a &&= b'), ['a', '&&=', 'b']);
});

test('tokenize keeps every remaining compound-assignment operator whole', () => {
  // ⚠️ Kills the StringLiteral mutants that blank ONE element of OP3/OP2: each operator below is
  //    absent from every other assertion in this suite, so a blanked entry can only be caught here.
  assert.deepStrictEqual(T('a **= b'), ['a', '**=', 'b']);
  assert.deepStrictEqual(T('a ||= b'), ['a', '||=', 'b']);
  assert.deepStrictEqual(T('a ??= b'), ['a', '??=', 'b']);
});

test('tokenize keeps every remaining two-character operator whole', () => {
  assert.deepStrictEqual(T('a == b'), ['a', '==', 'b']);
  assert.deepStrictEqual(T('a != b'), ['a', '!=', 'b']);
  assert.deepStrictEqual(T('a <= b'), ['a', '<=', 'b']);
  assert.deepStrictEqual(T('a >= b'), ['a', '>=', 'b']);
  assert.deepStrictEqual(T('a && b'), ['a', '&&', 'b']);
  assert.deepStrictEqual(T('a || b'), ['a', '||', 'b']);
  assert.deepStrictEqual(T('a++'), ['a', '++']);
  assert.deepStrictEqual(T('a--'), ['a', '--']);
  assert.deepStrictEqual(T('a += b'), ['a', '+=', 'b']);
  assert.deepStrictEqual(T('a -= b'), ['a', '-=', 'b']);
  assert.deepStrictEqual(T('a *= b'), ['a', '*=', 'b']);
  assert.deepStrictEqual(T('a /= b'), ['a', '/=', 'b']);
  assert.deepStrictEqual(T('a >> b'), ['a', '>>', 'b']);
});

test('tokenize keeps a string literal whole, quotes included, escapes included', () => {
  assert.deepStrictEqual(T("x = 'a b'"), ['x', '=', "'a b'"]);
  assert.deepStrictEqual(T('x = "a\\"b"'), ['x', '=', '"a\\"b"']);
  assert.deepStrictEqual(T('x = `t`'), ['x', '=', '`t`']);
});

test('tokenize drops comments entirely — prose is not shared code', () => {
  assert.deepStrictEqual(T('a; // b c d\ne;'), ['a', ';', 'e', ';']);
  assert.deepStrictEqual(T('a; /* b\nc */ e;'), ['a', ';', 'e', ';']);
});

test('tokenize reports the line of each token, counting newlines in every scanner', () => {
  assert.deepStrictEqual(tokenize('a\nb').map((x) => x.line), [1, 2]);
  assert.deepStrictEqual(tokenize('// x\nb').map((x) => x.line), [2]);
  assert.deepStrictEqual(tokenize('/* x\ny */\nb').map((x) => x.line), [3]);
  // A multi-line template must be reported at its START and must not lose the lines it spans.
  assert.deepStrictEqual(tokenize('`a\nb`\nc').map((x) => x.line), [1, 3]);
});

test('tokenize does not open a line comment on a non-slash char followed by a slash', () => {
  // ⚠️ Kills the ConditionalExpression mutant that drops the FIRST conjunct of the `if`
  //    (`c === '/'`): with it gone, ANY char followed by `/` would wrongly start a comment scan.
  assert.deepStrictEqual(T('a// hi'), ['a']);
});

test('tokenize terminates a line comment that runs to the absolute end of the source', () => {
  // ⚠️ Without the inner while's `i < n` bound, a comment with no trailing newline scans past the
  //    string end forever (`undefined !== '\n'` is always true) — this must complete, not hang.
  assert.deepStrictEqual(T('// c'), []);
});

test('tokenize skips a block comment opener by exactly two characters', () => {
  // ⚠️ Kills the AssignmentOperator mutant `i += 2` -> `i -= 2` on the block-comment opener: going
  //    backward re-scans already-consumed text and finds a phantom `*/` inside it.
  assert.deepStrictEqual(T('/*/**/z'), ['z']);
});

test('tokenize terminates an unclosed block comment that runs to the absolute end', () => {
  // ⚠️ Without the `i < n` bound on the block-comment scanner, an unterminated comment scans past
  //    the string end forever (`undefined === '*'` never true, so the loop never finds a closer).
  assert.deepStrictEqual(T('/* unterminated'), []);
});

test('tokenize does not close a block comment on a bare "/" without a preceding "*"', () => {
  // ⚠️ Kills the ConditionalExpression mutant that turns the LEFT clause of the closer test
  //    (`src[i] === '*'`) into `true`: it would then close on the first `/` it meets.
  assert.deepStrictEqual(T('/*a/b*/c'), ['c']);
});

test('tokenize does not close a block comment on a bare "*" without a following "/"', () => {
  // ⚠️ Kills the ConditionalExpression mutant that turns the RIGHT clause of the closer test
  //    (`src[i + 1] === '/'`) into `true`: it would then close on the first `*` it meets.
  assert.deepStrictEqual(T('/* a*b */c'), ['c']);
});

test('tokenize requires BOTH the star and the slash to close a block comment', () => {
  // ⚠️ Kills the LogicalOperator mutant `&&` -> `||` on the closer test: either half alone would
  //    end the comment early.
  assert.deepStrictEqual(T('/* a*b */c'), ['c']);
  assert.deepStrictEqual(T('/* a/b */c'), ['c']);
});

test('tokenize terminates a string literal that runs to the absolute end of the source', () => {
  // ⚠️ Kills the EqualityOperator mutant `i < n` -> `i <= n` on the string scanner: one extra
  //    iteration reads past the end and appends the literal word "undefined" to the token text.
  assert.deepStrictEqual(T("'abc"), ["'abc'"]);
});

test('tokenize handles a lone slash and whitespace without producing empty tokens', () => {
  assert.deepStrictEqual(T('a / b'), ['a', '/', 'b']);
  assert.deepStrictEqual(T('\t a \r\n'), ['a']);
});

test('tokenize reads a number with an exponent or a hexadecimal body as one token', () => {
  assert.deepStrictEqual(T('1e3'), ['1e3']);
  assert.deepStrictEqual(T('0xFF'), ['0xFF']);
});

// ── sharedRuns ──────────────────────────────────────────────────────────
test('sharedRuns returns nothing when the window is not a positive length', () => {
  assert.deepStrictEqual(sharedRuns(tokenize('a b c'), tokenize('a b c'), 0), []);
  assert.deepStrictEqual(sharedRuns(tokenize('a b c'), tokenize('a b c'), -1), []);
});

test('sharedRuns accepts a window of exactly 1, the admissible floor', () => {
  // ⚠️ Kills the EqualityOperator mutant `minTokens >= 1` -> `minTokens > 1`: at exactly 1 the
  //    mutant would refuse a window the contract admits.
  assert.deepStrictEqual(sharedRuns(tokenize('a b'), tokenize('a b'), 1),
    [{ tokens: 2, aLine: 1, bLine: 1, text: 'a b' }]);
});

test('sharedRuns finds nothing below the window, and the run at exactly the window', () => {
  const a = () => tokenize('x = a + b ;');
  const b = () => tokenize('y = a + b ;');
  assert.deepStrictEqual(sharedRuns(a(), b(), 6), []);
  const hit = sharedRuns(a(), b(), 5);
  assert.strictEqual(hit.length, 1);
  assert.strictEqual(hit[0].text, '= a + b ;');
});

test('sharedRuns extends a match MAXIMALLY on both sides, and reports the true length', () => {
  const a = () => tokenize('p q r s t u v w');
  const b = () => tokenize('z q r s t u v z');
  const hit = sharedRuns(a(), b(), 3);
  assert.strictEqual(hit.length, 1);
  assert.strictEqual(hit[0].tokens, 6);
  assert.strictEqual(hit[0].text, 'q r s t u v');
});

test('sharedRuns reports ONE finding per copy, not one per window it contains', () => {
  // 🛑 Without the maximal-start key a 78-token copy is reported 67 times and the budget becomes
  //    unreadable — an unreadable gate is a gate people unplug.
  const a = () => tokenize('a b c d e f g h');
  const b = () => tokenize('a b c d e f g h');
  assert.strictEqual(sharedRuns(a(), b(), 3).length, 1);
});

test('sharedRuns reports the line where each side of the run STARTS', () => {
  const a = () => tokenize('zz\nq r s t;');
  const b = () => tokenize('yy\nww\nq r s t;');
  const hit = sharedRuns(a(), b(), 4);
  assert.strictEqual(hit[0].aLine, 2);
  assert.strictEqual(hit[0].bLine, 3);
});

test('sharedRuns sorts longest first, then by model line, then by judged line', () => {
  const a = () => tokenize('m n o p q;\nu v w x;');
  const b = () => tokenize('u v w x;\nm n o p q;');
  const hit = sharedRuns(a(), b(), 4);
  assert.deepStrictEqual(hit.map((h) => h.tokens), [6, 5]);
  assert.strictEqual(hit[0].text, 'm n o p q ;');
});

test('sharedRuns breaks a tokens tie by model line, ascending — a real AND, not an OR', () => {
  // ⚠️ Kills the LogicalOperator mutant `||` -> `&&` AND the ArithmeticOperator mutant
  //    `x.aLine - y.aLine` -> `x.aLine + y.aLine` on the sort comparator: both findings below tie
  //    on `tokens` (2 each), so only the SECOND comparator term can order them.
  const a = () => tokenize('alpha beta\ngamma delta');
  const b = () => tokenize('gamma delta\nalpha beta');
  const hit = sharedRuns(a(), b(), 2);
  assert.deepStrictEqual(hit.map((h) => h.text), ['alpha beta', 'gamma delta']);
});

test('sharedRuns keeps the maximal-start dedup key separator — two starts must not collide', () => {
  // ⚠️ Kills the StringLiteral mutant `':'` -> `''` on `key2`: without a separator,
  //    `(i - before) + (j - before)` glues two DIFFERENT start pairs into the same digit string
  //    (1, 23) and (12, 3) both read "123" — one real finding would be dropped as a duplicate.
  const mk = (n, overrides) => {
    const arr = [];
    for (let k = 0; k < n; k++) arr.push({ t: 'u' + k, line: 1 });
    for (const [idx, val] of Object.entries(overrides)) arr[idx] = { t: val, line: 1 };
    return arr;
  };
  const A = mk(30, { 1: 'SHARED1', 12: 'SHARED2' });
  const B = mk(30, { 23: 'SHARED1', 3: 'SHARED2' });
  const texts = sharedRuns(A, B, 1).map((h) => h.text);
  assert.ok(texts.includes('SHARED1'));
  assert.ok(texts.includes('SHARED2'));
});

test('sharedRuns requires BOTH sides in range to extend a match forward', () => {
  // ⚠️ Real behavioral contract test (A is longer than B past the shared run, so only B's own
  //    bound may stop the extension there) — NOT a mutant kill for the first `&&` of that
  //    `while`'s guard: that LogicalOperator mutant is EQUIVALENT (see the `Stryker disable`
  //    comment on the loop itself, corrected 31/08/2026). Kept for the contract it documents.
  const a = () => tokenize('a b c d e');
  const b = () => tokenize('a b c');
  assert.deepStrictEqual(sharedRuns(a(), b(), 2),
    [{ tokens: 3, aLine: 1, bLine: 1, text: 'a b c' }]);
});

test('sharedRuns requires BOTH sides in range to extend a match backward', () => {
  // ⚠️ Real behavioral contract test (reading one out-of-range side alone must not extend the
  //    match) — NOT a mutant kill for the first `&&` of that `while`'s guard: that LogicalOperator
  //    mutant is EQUIVALENT (see the `Stryker disable` comment on the loop itself, corrected
  //    31/08/2026). Kept for the contract it documents.
  const a = () => tokenize('a a a a');
  const b = () => tokenize('a');
  assert.doesNotThrow(() => sharedRuns(a(), b(), 1));
});

test('sharedRuns finds every distinct copy when one side repeats a run', () => {
  const a = () => tokenize('k l m n; zz; k l m n;');
  const b = () => tokenize('k l m n;');
  assert.strictEqual(sharedRuns(a(), b(), 4).length, 2);
});

test('sharedRuns ignores identical COMMENTS — this repository is mostly prose', () => {
  const a = () => tokenize('// alpha beta gamma delta epsilon zeta\nconst q = 1;');
  const b = () => tokenize('// alpha beta gamma delta epsilon zeta\nconst z = 2;');
  assert.deepStrictEqual(sharedRuns(a(), b(), 4), []);
});

// ── pairKey ─────────────────────────────────────────────────────────────
test('pairKey composes the one spelling a finding and a budget entry must share', () => {
  assert.strictEqual(pairKey('src/m.js', 'src/e.js'), 'src/m.js <-> src/e.js');
});

// ── derivePairs ─────────────────────────────────────────────────────────
const FACTS = () => ({
  pure: ['src/m.js', 'src/shell.js', 'src/core.js'],
  mutated: ['src/e.js', 'src/e2.js'],
  importedByProduction: ['src/core.js'],
  testImports: [
    { file: 'test/diff.test.js', imports: ['src/m.js', 'src/e.js', 'src/e2.js'] },
    { file: 'test/other.test.js', imports: ['src/e.js'] },
  ],
});

test('derivePairs pairs a model with every mutated module its suite confronts it with', () => {
  assert.deepStrictEqual(derivePairs(FACTS()), [
    { model: 'src/m.js', judged: 'src/e.js', via: 'test/diff.test.js' },
    { model: 'src/m.js', judged: 'src/e2.js', via: 'test/diff.test.js' },
  ]);
});

test('derivePairs refuses a module that production imports — that is a core, not a model', () => {
  const f = FACTS();
  f.importedByProduction = ['src/core.js', 'src/m.js'];
  assert.deepStrictEqual(derivePairs(f), []);
});

test('derivePairs refuses a module that is itself mutated — a defendant is not a judge', () => {
  const f = FACTS();
  f.mutated = ['src/e.js', 'src/e2.js', 'src/m.js'];
  assert.deepStrictEqual(derivePairs(f).map((p) => p.model), []);
});

test('derivePairs refuses an impure module — an I/O shell is never a model', () => {
  const f = FACTS();
  f.pure = ['src/shell.js'];
  assert.deepStrictEqual(derivePairs(f), []);
});

test('derivePairs ignores a suite that confronts a model with nothing mutated', () => {
  const f = FACTS();
  f.testImports = [{ file: 'test/alone.test.js', imports: ['src/m.js', 'src/shell.js'] }];
  assert.deepStrictEqual(derivePairs(f), []);
});

test('derivePairs keeps the FIRST suite that declares a pair, and never duplicates it', () => {
  const f = FACTS();
  f.testImports.push({ file: 'test/again.test.js', imports: ['src/m.js', 'src/e.js'] });
  const pairs = derivePairs(f);
  assert.strictEqual(pairs.length, 2);
  assert.strictEqual(pairs[0].via, 'test/diff.test.js');
});

test('derivePairs returns the pairs sorted, so the same repository reads the same way twice', () => {
  const f = FACTS();
  f.pure.push('src/a.js');
  f.testImports.push({ file: 'test/z.test.js', imports: ['src/a.js', 'src/e.js'] });
  assert.deepStrictEqual(derivePairs(f).map((p) => p.model + '|' + p.judged),
    ['src/a.js|src/e.js', 'src/m.js|src/e.js', 'src/m.js|src/e2.js']);
});

// ── floorFaults ─────────────────────────────────────────────────────────
test('floorFaults accepts a derivation at the measured floor', () => {
  const pairs = [
    { model: 'a', judged: 'j1' }, { model: 'a', judged: 'j2' }, { model: 'a', judged: 'j3' },
    { model: 'a', judged: 'j4' }, { model: 'a', judged: 'j5' }, { model: 'b', judged: 'j6' },
    { model: 'b', judged: 'j7' },
  ];
  assert.deepStrictEqual(floorFaults(pairs), []);
});

test('floorFaults reddens when too few MODELS were derived', () => {
  const pairs = [];
  for (let i = 0; i < 7; i++) pairs.push({ model: 'a', judged: 'j' + i });
  const faults = floorFaults(pairs);
  assert.strictEqual(faults.length, 1);
  assert.ok(faults[0].startsWith('VACUOUS DERIVATION: 1 model(s) derived, floor is 2'));
  assert.ok(faults[0].includes('a derivation that finds nothing is indistinguishable from a repository with no models'));
});

test('floorFaults reddens when too few PAIRS were derived', () => {
  const pairs = [{ model: 'a', judged: 'j1' }, { model: 'b', judged: 'j2' }];
  const faults = floorFaults(pairs);
  assert.strictEqual(faults.length, 1);
  assert.ok(faults[0].startsWith('VACUOUS DERIVATION: 2 pair(s) derived, floor is 7'));
  assert.ok(faults[0].includes('the gate would certify instead of protecting'));
});

test('floorFaults reddens TWICE on a derivation that measured nothing at all', () => {
  assert.strictEqual(floorFaults([]).length, 2);
});

// ── verdict ─────────────────────────────────────────────────────────────
const RUN = () => ({ pair: 'src/m.js <-> src/e.js', tokens: 20, text: 'a b c', aLine: 7, bLine: 9 });
const WHY = 'the differential requires the two signatures to agree exactly, arity and order included';

test('verdict is silent when every observed run is declared with an admissible class', () => {
  assert.deepStrictEqual(
    verdict([RUN()], { 'src/m.js <-> src/e.js': { shared: [{ text: 'a b c', class: 'INHERITED_TWIN' }] } }),
    []);
});

test('verdict reddens on a run whose PAIR is not declared at all', () => {
  const f = verdict([RUN()], {});
  assert.strictEqual(f.length, 1);
  assert.ok(f[0].startsWith('UNDECLARED SHARED CODE'));
  assert.ok(f[0].includes('20 tokens'));
  assert.ok(f[0].includes('model line 7'));
  assert.ok(f[0].includes('judged line 9'));
  // ⚠️ Kills the StringLiteral mutants that blank the ' (' and '): ' separators: an EXACT match
  //    is the only assertion a blanked separator cannot slip through.
  assert.strictEqual(f[0],
    'UNDECLARED SHARED CODE — src/m.js <-> src/e.js (20 tokens, model line 7, judged line 9): a b c');
});

test('verdict reddens on a run whose pair is declared but whose TEXT is not', () => {
  const f = verdict([RUN()], { 'src/m.js <-> src/e.js': { shared: [{ text: 'x y z', class: 'INHERITED_TWIN' }] } });
  // The undeclared run AND the permit that no longer matches anything.
  assert.strictEqual(f.length, 2);
});

test('verdict reddens on a DORMANT PERMIT — an exemption that stopped being necessary', () => {
  const f = verdict([], { 'src/m.js <-> src/e.js': { shared: [{ text: 'a b c', class: 'INHERITED_TWIN' }] } });
  assert.strictEqual(f.length, 1);
  assert.ok(f[0].startsWith('DORMANT PERMIT'));
  // ⚠️ Kills the StringLiteral mutant that blanks the whole explanatory phrase.
  assert.strictEqual(f[0],
    'DORMANT PERMIT — src/m.js <-> src/e.js no longer shares this run, remove the declaration: a b c');
});

test('verdict reddens on an invented class', () => {
  const f = verdict([RUN()], { 'src/m.js <-> src/e.js': { shared: [{ text: 'a b c', class: 'SMALL' }] } });
  assert.strictEqual(f.length, 1);
  assert.ok(f[0].startsWith('UNKNOWN CLASS "SMALL"'));
  // ⚠️ Kills the StringLiteral mutant that blanks the ': ' separator before the shared text.
  assert.strictEqual(f[0], 'UNKNOWN CLASS "SMALL" — src/m.js <-> src/e.js: a b c');
});

test('verdict demands a real justification from a CONTRACT run, and accepts a real one', () => {
  const short = verdict([RUN()], { 'src/m.js <-> src/e.js': { shared: [{ text: 'a b c', class: 'CONTRACT', why: 'short' }] } });
  assert.strictEqual(short.length, 1);
  assert.ok(short[0].startsWith('CLASS CONTRACT OWES A `why` OF AT LEAST 60 CHARACTERS'));
  // ⚠️ Kills the StringLiteral mutant that blanks the ': ' separator before the shared text.
  assert.strictEqual(short[0],
    'CLASS CONTRACT OWES A `why` OF AT LEAST 60 CHARACTERS — src/m.js <-> src/e.js: a b c');
  const missing = verdict([RUN()], { 'src/m.js <-> src/e.js': { shared: [{ text: 'a b c', class: 'CONTRACT' }] } });
  assert.strictEqual(missing.length, 1);
  const nonString = verdict([RUN()], { 'src/m.js <-> src/e.js': { shared: [{ text: 'a b c', class: 'CONTRACT', why: 12345 }] } });
  assert.strictEqual(nonString.length, 1);
  // ⚠️ Kills the StringLiteral mutant that replaces the non-string fallback `''` by a fixed
  //    18-character placeholder: both are shorter than MIN_WHY, so only a boundary probe can tell
  //    them apart from a genuine short `why` — the fault still fires with a real class/pair/text.
  assert.deepStrictEqual(nonString,
    ['CLASS CONTRACT OWES A `why` OF AT LEAST 60 CHARACTERS — src/m.js <-> src/e.js: a b c']);
  assert.deepStrictEqual(
    verdict([RUN()], { 'src/m.js <-> src/e.js': { shared: [{ text: 'a b c', class: 'CONTRACT', why: WHY }] } }),
    []);
});

test('verdict treats a `why` of EXACTLY MIN_WHY characters as sufficient, not short', () => {
  // ⚠️ Kills the EqualityOperator mutant `why.length < MIN_WHY` -> `why.length <= MIN_WHY`: at the
  //    exact boundary the mutant would wrongly demand a longer justification.
  const why60 = 'x'.repeat(MIN_WHY);
  assert.deepStrictEqual(
    verdict([RUN()], { 'src/m.js <-> src/e.js': { shared: [{ text: 'a b c', class: 'CONTRACT', why: why60 }] } }),
    []);
});

test('verdict never lets a non-array `shared` fallback silently pollute the permitted set', () => {
  // ⚠️ Kills the ArrayDeclaration mutant that replaces the empty fallback `[]` (when `entry.shared`
  //    is absent) by a non-empty placeholder array: a bogus permit entry would otherwise slip in
  //    and, for a run whose text happens to read "undefined", wrongly suppress a real fault.
  const findings = [{ pair: 'X', tokens: 1, text: 'undefined', aLine: 1, bLine: 1 }];
  assert.deepStrictEqual(verdict(findings, { X: {} }),
    ['UNDECLARED SHARED CODE — X (1 tokens, model line 1, judged line 1): undefined']);
});

test('verdict never demands a justification from INHERITED_TWIN — a false one is worse than none', () => {
  assert.deepStrictEqual(
    verdict([RUN()], { 'src/m.js <-> src/e.js': { shared: [{ text: 'a b c', class: 'INHERITED_TWIN' }] } }),
    []);
});

test('verdict survives a budget that is absent, or an entry with no `shared` list', () => {
  assert.strictEqual(verdict([RUN()], undefined).length, 1);
  assert.deepStrictEqual(verdict([], { 'src/m.js <-> src/e.js': {} }), []);
  assert.deepStrictEqual(verdict([], { 'src/m.js <-> src/e.js': null }), []);
});

test('verdict returns its faults SORTED, so one defect always reads the same way', () => {
  const runs = [
    { pair: 'z <-> z', tokens: 12, text: 'zz', aLine: 1, bLine: 1 },
    { pair: 'a <-> a', tokens: 12, text: 'aa', aLine: 1, bLine: 1 },
  ];
  const f = verdict(runs, {});
  assert.ok(f[0].includes('a <-> a'));
  assert.ok(f[1].includes('z <-> z'));
});
