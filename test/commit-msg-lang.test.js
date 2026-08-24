// ═══════════════════════════════════════════════════════════════════════
// COMMIT-MSG-LANG — the published HISTORY cannot slip out of English.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 WHY THIS SUITE EXISTS. `english-only-gate.test.js` seals the published
//    DOCS. The commit history is published too, and it was guarded by nothing
//    while every message in it was French.
//
// 🛑 THE RULE IS NOT IN THIS FILE, ON PURPOSE. Stryker does not mutate test
//    code: a rule written in a suite is verified by nothing. It lives in
//    `src/commit-msg-lang.js`, which the hook (`.githooks/commit-msg`) runs
//    too — one decision, two consumers, zero copies.
//
// ⚠️ THE CELLS THAT MATTER USE THE REAL DETECTOR. A stub detector proves the
//    plumbing, never the decision. `eld` was chosen BY MEASUREMENT (`franc`:
//    97 false positives on this corpus, `eld`: 0) — never swap it back on
//    reputation.
//
// ⚠️ ANTI-VACUITY IN THREE PARTS, because the worst defect here is a GREEN
//    gate that measures nothing: ① the detector must still recognise a foreign
//    message AND cover >= 50 languages · ② the stripping must not annihilate
//    real prose (`judged` must be true on a real message) · ③ what the gate
//    deliberately lets through must be let through for the RIGHT reason
//    (undecidable / generated), never because everything is let through.
//
// ⚠️ Fixtures are THUNKS, never module-level constants: under Stryker
//    `perTest`, a constant evaluated at load time makes a STATIC mutant that
//    no test covers, hence a false survivor (measured on this repo: 42 of them).
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { eld } from 'eld/large';
import {
  MIN_CHARS, prose, decidableLines, trailerBlockStart, bodyLines, isGenerated, verdict, refusal,
} from '../src/commit-msg-lang.js';

const detect = (t) => eld.detect(t);

// A REAL message of this repository's history, translated to nothing: it is
// French, it carries a scope prefix, digits and an em dash, exactly as typed.
const messageFR = () => [
  'skill: mes propres lignes du jour faisaient deux fois la norme mesuree',
  '',
  'La reduction encaissee, et onze fichiers qui ne recevaient rien du tout:',
  'le filet d exhaustivite ne servait a rien tant que la doc restait muette.',
  '',
  'Co-Authored-By: Someone <someone@example.com>',
].join('\n');

const messageEN = () => [
  'gate: the published history could not slip out of English any more',
  '',
  'The rule already guarded docs/framework/ and said nothing about the commit',
  'messages, which every fork reads first. The decision now lives in a pure',
  'module so the hook and the suite consume exactly the same rule.',
  '',
  'Co-Authored-By: Someone <someone@example.com>',
].join('\n');

test('ANTI-VACUITY ① — the detector flags a foreign message and stays silent on English', () => {
  // 🛑 Without this, a dead import or a collapsed detector makes the whole gate green.
  assert.ok(verdict(messageFR(), detect).offenders.length > 0,
    'the detector does not see a French commit message — the gate would certify instead of protect');
  assert.deepStrictEqual(verdict(messageEN(), detect).offenders, [],
    'false positive on a plain English message — a noisy gate gets disarmed, then bypassed');
  assert.ok(Object.keys(eld.info().Languages).length >= 50,
    'the language set collapsed — an international contributor would slip through');
});

test('ANTI-VACUITY ② — the stripping does not annihilate the prose it must judge', () => {
  // A message whose prose is emptied is UNDECIDABLE, hence always accepted:
  // the gate would be green while measuring nothing.
  assert.strictEqual(verdict(messageEN(), detect).judged, true,
    'a real message is not judged at all — the strippers ate the prose');
  assert.strictEqual(verdict(messageFR(), detect).judged, true,
    'a real message is not judged at all — the strippers ate the prose');
  assert.ok(prose('The rule already guarded the published docs and said nothing at all about the messages every fork reads first').length >= MIN_CHARS,
    'plain prose falls under the floor once stripped — nothing would ever be judged');
});

test('a French message is REFUSED, and the refusal names the offending line', () => {
  const v = verdict(messageFR(), detect);
  assert.ok(v.offenders.length > 0, 'French message accepted');
  const o = v.offenders[0];
  assert.ok(o.line >= 1, 'no line number in the offence — a refusal one cannot act on gets bypassed');
  assert.notStrictEqual(o.language, 'en', 'offence reported as English');
  const text = refusal(v);
  assert.ok(text.includes('COMMIT REFUSED'), 'the refusal does not say it refuses');
  assert.ok(text.includes(`line ${o.line}`), 'the refusal does not name the faulty line');
});

test('an English message full of code, paths, hashes and flags PASSES', () => {
  const msg = [
    'fix(gate): stop reading state through the lock-less path',
    '',
    'The fallback in src/pretool-core.js passed `{}` as the state, which asserts',
    'that nothing was ever injected, so a once document went out a second time.',
    'Reverting 9f2c1ab8 was not enough; run `npm test -- --project=unit` to see it.',
    '',
    'Signed-off-by: Someone <someone@example.com>',
    'Claude-Session: https://claude.ai/code/session_01AXeJ7MwCd5VLSvR3vzCJBX',
  ].join('\n');
  assert.deepStrictEqual(verdict(msg, detect).offenders, [], 'false positive on a technical English message');
});

test('a SHORT message is INDECIDABLE, therefore accepted (never guessed)', () => {
  for (const m of ['fix typo', 'wip', 'corrige le typo']) {
    const v = verdict(m, detect);
    assert.strictEqual(v.judged, false, `"${m}" was judged although it is under the ${MIN_CHARS}-character floor`);
    assert.deepStrictEqual(v.offenders, [], `"${m}" refused on a guess`);
  }
});

test('what GIT writes itself is never refused (merge, revert, fixup, comments, -v diff)', () => {
  const merge = [
    "Merge branch 'chantier/etat-espace-verrou' into master",
    '',
    '# Conflicts:',
    '#\tsrc/gate.js',
  ].join('\n');
  const revert = [
    'Revert "skill: mes propres lignes du jour faisaient deux fois la norme"',
    '',
    'This reverts commit 5fed7bd0c0ffee1234567890abcdef1234567890.',
  ].join('\n');
  const fixup = 'fixup! skill: mes propres lignes du jour faisaient deux fois la norme mesuree';
  for (const m of [merge, revert, fixup]) {
    assert.deepStrictEqual(verdict(m, detect).offenders, [], 'a message generated by git was refused');
  }
  // The `-v` diff is CODE in any language: it is cut, never judged.
  assert.strictEqual(
    bodyLines('subject\n# ------------------------ >8 ------------------------\ndiff --git a/x b/x\n+les lignes').length,
    1, 'the -v diff is not cut off — the gate would judge a patch');
  assert.strictEqual(isGenerated('# Please enter the commit message for your changes.'), true,
    "git's own comments are judged — they are localised, so the gate would refuse healthy commits");
});

test('trailers are excluded, but a conventional-commit SUBJECT is never taken for one', () => {
  const lines = ['fix: quelque chose', '', 'Un corps.', '', 'Co-Authored-By: A <a@example.com>', 'Signed-off-by: B <b@example.com>'];
  assert.strictEqual(trailerBlockStart(lines), 4, 'the trailer block is not the last paragraph');
  const judged = decidableLines(lines.join('\n')).map((c) => c.line);
  assert.ok(judged.includes(1), 'the SUBJECT was dropped as a trailer — the gate would judge almost nothing');
  assert.ok(!judged.includes(5) && !judged.includes(6), 'a trailer is judged as prose');
  // 🛑 A one-paragraph message is a SUBJECT, never a trailer block.
  assert.strictEqual(trailerBlockStart(['fix: quelque chose']), -1, 'a lone subject was read as a trailer block');
});

test('the WHOLE message is judged, not only single lines (real subjects are under the floor)', () => {
  // Measured on this repository: real subjects run ~80 characters, i.e. UNDER
  // MIN_CHARS. A per-line-only gate would have accepted every French commit
  // ever written here — this cell is what makes the gate useful at all.
  const msg = [
    'docs: la doc injectable ne disait rien du tout',
    'et le gate anglais ne couvrait que le miroir publie.',
  ].join('\n');
  assert.ok(msg.split('\n').every((l) => prose(l).length < MIN_CHARS),
    'fixture invalid: a line is above the floor, the cell would not prove the aggregate judgement');
  assert.ok(verdict(msg, detect).offenders.length > 0, 'a French message spread over short lines slipped through');
});

test('NEGATIVE-CHECK — an unreliable detection never refuses', () => {
  // `isReliable()` is LOAD-BEARING, not a refinement: it is what `franc` lacks
  // and why it drowned this corpus in false positives. A detector that answers
  // "not English" WITHOUT being sure must change nothing.
  const long = 'x'.repeat(MIN_CHARS + 10) + ' words here to keep it prose like enough';
  const unsure = () => ({ language: 'sv', isReliable: () => false });
  const sure = () => ({ language: 'sv', isReliable: () => true });
  assert.deepStrictEqual(verdict(long, unsure).offenders, [], 'an UNRELIABLE detection refused a commit');
  assert.ok(verdict(long, sure).offenders.length > 0, 'a RELIABLE foreign detection let the commit through');
});

// ═══════════════════════════════════════════════════════════════════════
// UNIT CELLS — one per DECISION of the module, so a mutant of any of them
// dies. The cells above prove the BEHAVIOUR with the real detector; these
// prove the pieces, with STUB detectors where the language must not vary.
// ⚠️ A stub is used ONLY where the question is structural (which lines are
//    judged, in which order, what the refusal says). The language decision
//    itself is never proven on a stub — that would prove the plumbing.
// ═══════════════════════════════════════════════════════════════════════

const foreign = () => ({ language: 'xx', isReliable: () => true });
const english = () => ({ language: 'en', isReliable: () => true });
/** A prose string of EXACTLY n characters (n >= 4, n % 5 === 4 gives whole words). */
const words = (n) => {
  const s = 'word '.repeat(Math.ceil((n + 1) / 5)).trim();
  return s.slice(0, n - 1) + 'x';
};

test('bodyLines: CRLF is stripped and everything from the -v diff on is cut', () => {
  assert.deepStrictEqual(bodyLines('a\r\nb'), ['a', 'b'], 'the carriage return survives — every judged line would end with \r');
  // 🛑 `startsWith`, never `endsWith`: a diff header is followed by its paths.
  assert.deepStrictEqual(bodyLines('a\ndiff --git x y\nb'), ['a'], 'the diff is judged as prose');
  assert.deepStrictEqual(bodyLines('a\n# ---- >8 ----\nles lignes du patch'), ['a'], 'the scissors line does not cut');
});

test('trailerBlockStart: the block is the LAST paragraph, and only if every line is a trailer', () => {
  assert.strictEqual(
    trailerBlockStart(['fix: x', '', 'Body.', '', 'Co-Authored-By: A <a@example.com>', '  ']), 4,
    'trailing blank lines are not ignored — a real message ends with one');
  assert.strictEqual(trailerBlockStart(['', '   ']), -1, 'an all-blank message is not refused as unparsable');
  assert.strictEqual(trailerBlockStart(['fix: x', '   ', 'Co-Authored-By: A <a@example.com>']), 2,
    'a whitespace-only separator is not seen as blank — the whole message would be swallowed');
  assert.strictEqual(trailerBlockStart(['fix: x', '', 'Body line that is not a trailer.']), -1,
    'a last paragraph containing prose is taken for a trailer block — that prose would never be judged');
});

test('prose: each stripper removes exactly what it must, and nothing else', () => {
  assert.strictEqual(prose('a`x`b'), 'a b', 'a code span glues its neighbours together');
  assert.strictEqual(prose('see https://example.com/x now'), 'see now');
  assert.strictEqual(prose('a (9f2c1ab8) b'), 'a ( ) b', 'a hash glues its neighbours together');
  assert.strictEqual(prose('the file src/gate.js moved'), 'the file moved');
  assert.strictEqual(prose('the file gate.js moved'), 'the file moved');
  assert.strictEqual(prose('fix --force and @someone and #42 ok'), 'fix and and ok');
  assert.strictEqual(prose('**bold** _x_ ~y~ | z'), 'bold x y z');
  assert.strictEqual(prose('a*b'), 'a b', 'a markdown character BETWEEN two letters glues them into one word');
  assert.strictEqual(prose('  a   b  '), 'a b', 'the collapse or the trim is gone');
});

test('judgeableLines: a line whose prose is empty is dropped, the others keep their number', () => {
  assert.deepStrictEqual(decidableLines('the subject line\n---\nbody line'),
    [{ line: 1, text: 'the subject line' }, { line: 3, text: 'body line' }],
    'a line with no prose left is judged, or a real line is lost');
});

test('the floor is read on the WHOLE message, joined by a SPACE', () => {
  const w90 = `${words(45)}\n${words(44)}`; //           45 + 1 + 44 = 90 = MIN_CHARS
  const w89 = `${words(44)}\n${words(44)}`; //           44 + 1 + 44 = 89
  assert.strictEqual(decidableLines(w90).map((c) => c.text).join(' ').length, MIN_CHARS, 'fixture invalid');
  assert.strictEqual(verdict(w90, foreign).judged, true, 'a message exactly at the floor is not judged');
  assert.strictEqual(verdict(w89, foreign).judged, false, 'a message one character under the floor is judged');
  assert.strictEqual(verdict(w90, foreign).offenders.length, 1, 'the aggregate refusal names no line');
});

test('the per-line loop reports EVERY offending line, and only those above the floor', () => {
  const two = `${words(100)}\n${words(100)}`;
  const v = two.split('\n');
  assert.deepStrictEqual(verdict(two, foreign).offenders,
    [{ line: 1, text: v[0], language: 'xx' }, { line: 2, text: v[1], language: 'xx' }],
    'the offending lines are not all reported with their content');
  // A line UNDER the floor is never judged on its own…
  assert.deepStrictEqual(verdict(`short line\n${words(100)}`, foreign).offenders.map((o) => o.line), [2],
    'a line under the floor was judged, or a line above it was skipped');
  // …and a line EXACTLY at the floor is.
  assert.deepStrictEqual(verdict(`${words(MIN_CHARS)}\n${words(100)}`, foreign).offenders.map((o) => o.line), [1, 2],
    'a line exactly at the floor is skipped');
});

test('a RELIABLE English detection never produces an offence', () => {
  assert.deepStrictEqual(verdict(`${words(100)}\n${words(100)}`, english).offenders, [],
    'English lines were refused — the gate would refuse everything, hence be uninstalled');
});

test('refusal: it says WHAT is refused, WHY, and truncates a very long line', () => {
  const long = words(130);
  const v = verdict(long, foreign);
  const expected = [
    'COMMIT REFUSED — the message is not in English.',
    'This repository is published: its history is read by every fork (decision ㉒).',
    'Rewrite the line(s) below in English, then commit again.',
    `  line 1 [xx] ${long.slice(0, 120)}`,
  ].join('\n');
  assert.strictEqual(refusal(v), expected, 'the refusal text changed — it is a CONTRACT, not decoration');
  assert.ok(!refusal(v).includes(long), 'a 130-character line is printed whole — the refusal stops being readable');
});

test('when no single line is foreign, the refusal points at the line that IS', () => {
  // The aggregate decides, but the human needs a LINE. Here line 1 is English
  // and under the floor, line 2 is French: the offence must name line 2 — the
  // fallback on the first line would send the author to a healthy sentence.
  const msg = [
    'gate: update the reference of the published documents',
    'et le juge anglais ne couvrait que le miroir publie du depot',
  ].join('\n');
  const v = verdict(msg, detect);
  assert.strictEqual(v.judged, true, 'fixture invalid: nothing was judged');
  assert.deepStrictEqual(v.offenders.map((o) => o.line), [2],
    'the refusal names the wrong line — every line above the floor is English here');
});
