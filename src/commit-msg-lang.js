// ═══════════════════════════════════════════════════════════════════════
// COMMIT-MSG-LANG — decides whether a COMMIT MESSAGE is written in English.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 WHY THIS FILE EXISTS. This repository goes open source, and decision ㉒
//    ("the WHOLE project is in English") was already sealed for the PUBLISHED
//    DOCS by `english-only-gate.test.js`. The commit HISTORY is published too —
//    `git log` is the first thing a fork reads — and it was guarded by nothing.
//    A message pushed in another language cannot be taken back any more than a
//    leaked address can: rewriting history after publication is not an option.
//
// 🛑 THE DECISION LIVES HERE, NOT IN THE SUITE. Stryker does not mutate test
//    code: a rule written inside a test file is verified by nothing. The hook
//    (`.githooks/commit-msg` → `tools/commit-msg-check.js`) and the suite
//    (`test/commit-msg-lang.test.js`) MUST both consume THIS module — two
//    copies of one rule diverge, and the copy that rots is always the one
//    nobody runs.
//
// ⚠️ SAME DETECTOR, SAME FLOOR, SAME STRIPPING PHILOSOPHY AS THE DOC GATE, ON
//    PURPOSE. `eld` was chosen BY MEASUREMENT against the market leader
//    (`franc`: 97 false positives on this corpus, `eld`: 0) and `isReliable()`
//    is load-bearing — the detector says ITSELF when a sample is too short to
//    decide. 🛑 NEVER swap the detector on reputation, here or there: replay
//    the measurement first.
//
// ⚠️ IT IS NOT A FRENCH DETECTOR — it is a NOT-ENGLISH detector. Contributors
//    are international; the next slip may be German, Portuguese or Japanese.
//
// ⚠️ PURE: zero I/O, and the DETECTOR IS INJECTED (`detect`). Reading the
//    message file, loading `eld` and printing the refusal live in the shell.
//    That is also what lets the suite drive the decision with a stub detector
//    WITHOUT ever replacing the real one in the cells that matter.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

// ⚠️ MEASURED FLOOR, INHERITED FROM `english-only-gate` (90): below it, `eld`
//    reliably calls a bare list of filenames Swedish. A short message
//    ("fix typo") is INDECIDABLE and therefore PASSES — a gate that guesses on
//    short text becomes noise, and a noisy gate gets disarmed, then bypassed.
const MIN_CHARS = 90;

// ⚠️ LINES GIT WRITES ITSELF. Refusing them would make `git merge`,
//    `git revert` and `git commit --fixup` impossible while the human typed
//    NOTHING — the fastest way to get a hook uninstalled.
//    🛑 They are dropped, never rewritten: dropping only ever REMOVES prose
//    from the judgement (worst case: an undecidable message, hence a pass).
const GENERATED = [
  /^Merge\b/, //                 "Merge branch 'x' into y", "Merge pull request #4 from …"
  /^Revert "/, //                git revert's generated subject, quoting the ORIGINAL one
  /^This reverts commit\b/, //   git revert's generated body
  /^Conflicts:/, //              conflict list appended by git
  /^(fixup|squash|amend)! /, //  rebase --autosquash: the subject is the ORIGINAL commit's
  /^Change-Id:/, //              Gerrit, added by a hook
];

// A trailer key: one word, no space, followed by a colon.
// ⚠️ SHAPE ALONE IS NOT ENOUGH and that trap is real: a conventional-commit
//    subject ("fix: …", "skill: …") matches it exactly. A trailer is therefore
//    only recognised in the LAST paragraph of a message that has more than
//    one — git's own definition (`git interpret-trailers`). The subject line is
//    ALWAYS judged.
const TRAILER = /^[A-Za-z][A-Za-z0-9-]*:(\s|$)/;

/** The message as git hands it over, cut before everything that is not a message. */
function bodyLines(message) {
  const out = [];
  for (const raw of String(message).split('\n')) {
    const line = raw.replace(/\r$/, '');
    // ⚠️ `git commit -v` appends the whole DIFF after a scissors line. It is
    //    CODE, in any language, and judging it would refuse healthy commits.
    if (line.includes('>8') || line.startsWith('diff --git ')) break;
    out.push(line);
  }
  return out;
}

/** Index of the first line of the trailing trailer block, or -1 if there is none. */
function trailerBlockStart(lines) {
  let end = lines.length;
  while (end > 0 && lines[end - 1].trim() === '') end--;
  // ⚠️ NO `end === 0` GUARD HERE: it was DEAD CODE (an empty message leaves
  //    `start === 0`, which the guard below already refuses), and a mutant
  //    proved it unkillable. An EQUIVALENT mutant is eliminated at the source,
  //    never frozen for ever by a test written to cover useless code.
  let start = end;
  while (start > 0 && lines[start - 1].trim() !== '') start--;
  // 🛑 A SINGLE PARAGRAPH IS THE SUBJECT, NEVER A TRAILER BLOCK. Without this,
  //    a one-line message "fix: …" would be dropped whole and the gate would
  //    judge NOTHING on the most common commit shape of all.
  if (start === 0) return -1;
  for (let i = start; i < end; i++) if (!TRAILER.test(lines[i])) return -1;
  return start;
}

/** True for a line git wrote, or for a comment git will strip on its own. */
function isGenerated(line) {
  if (line.startsWith('#')) return true;
  return GENERATED.some((re) => re.test(line));
}

/**
 * PROSE only. A commit message is full of things that are not a language:
 * code spans, paths, file names, flags, hashes, issue refs, markdown.
 * ⚠️ We judge PROSE, never syntax — stripping too much only makes a message
 *    UNDECIDABLE (it passes); stripping too little REFUSES healthy commits.
 */
function prose(line) {
  // ⚠️ THE REPLACEMENT IS `''` WHERE IT IS PROVABLY EQUIVALENT TO `' '`, AND
  //    `' '` WHERE IT IS NOT. A pattern anchored on token boundaries (greedy
  //    `\S+`, or a match that swallows its own leading blank) can only ever be
  //    surrounded by whitespace, so the final collapse erases the difference —
  //    and a difference nothing can observe is an EQUIVALENT mutant, i.e. a
  //    survivor no test may kill. The three keeping `' '` are NOT in that case:
  //    a code span, a hash or a markdown character can sit BETWEEN two letters,
  //    where dropping the blank would GLUE two words into one.
  return String(line)
    .replace(/`[^`]*`/g, ' ')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\b[0-9a-f]{7,40}\b/g, ' ') //          commit hashes
    .replace(/\S*[\\/]\S*/g, '') //                  paths, on both separators
    .replace(/\S+\.[A-Za-z][A-Za-z0-9]{0,5}\b/g, '') // file names, dotted identifiers
    .replace(/(^|\s)[-@#]\S+/g, '') //               flags, mentions, issue refs (the blank is IN the match)
    .replace(/[*#>|_~\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The lines of a message that carry human prose, with their 1-based number. */
function decidableLines(message) {
  const lines = bodyLines(message);
  const stop = trailerBlockStart(lines);
  const limit = stop === -1 ? lines.length : stop;
  const out = [];
  for (let i = 0; i < limit; i++) {
    if (isGenerated(lines[i])) continue;
    const text = prose(lines[i]);
    if (text === '') continue;
    out.push({ line: i + 1, text });
  }
  return out;
}

/**
 * THE DECISION. `detect` = `eld.detect` (injected).
 * @returns {{judged: boolean, offenders: Array<{line:number,text:string,language:string}>}}
 *
 * ⚠️ `judged` IS THE ANTI-VACUITY OBSERVABLE, not a detail: without it, a
 *    stripping bug that empties every message would make this gate pass on
 *    EVERYTHING while measuring nothing — the failure this repo fears most (a
 *    green gate that sees nothing). The suite asserts it on a real message.
 * ⚠️ THE WHOLE MESSAGE IS JUDGED, NOT ONLY EACH LINE. Measured on this repo's
 *    own history: real subjects run ~80 characters, i.e. UNDER the floor —
 *    a per-line gate would have let every one of them through. Lines are
 *    judged too, because that is what names the OFFENDING LINE in the refusal.
 */
function verdict(message, detect) {
  const candidates = decidableLines(message);
  const whole = candidates.map((c) => c.text).join(' ');
  if (whole.length < MIN_CHARS) return { judged: false, offenders: [] };

  const offenders = [];
  for (const c of candidates) {
    if (c.text.length < MIN_CHARS) continue;
    const d = detect(c.text);
    if (d.language !== 'en' && d.isReliable()) offenders.push({ line: c.line, text: c.text, language: d.language });
  }
  if (offenders.length === 0) {
    const d = detect(whole);
    if (d.language !== 'en' && d.isReliable()) {
      // Name a LINE, never "the message": a refusal one cannot act on is a
      // refusal one bypasses. Falls back to the first prose line when no single
      // line is foreign on its own.
      const first = candidates.find((c) => detect(c.text).language !== 'en') || candidates[0];
      offenders.push({ line: first.line, text: first.text, language: d.language });
    }
  }
  return { judged: true, offenders };
}

/** The refusal text. Kept here so the hook and the suite say the SAME thing. */
function refusal(v) {
  const lines = v.offenders.map((o) => `  line ${o.line} [${o.language}] ${o.text.slice(0, 120)}`);
  return [
    'COMMIT REFUSED — the message is not in English.',
    'This repository is published: its history is read by every fork (decision ㉒).',
    'Rewrite the line(s) below in English, then commit again.',
    ...lines,
  ].join('\n');
}

module.exports = {
  MIN_CHARS, GENERATED, TRAILER,
  bodyLines, trailerBlockStart, isGenerated, prose, decidableLines, verdict, refusal,
};
