// ═══════════════════════════════════════════════════════════════════════
// COMMIT-MSG-LEAK — decides whether a COMMIT MESSAGE carries PERSONAL data.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 WHY THIS FILE EXISTS. `.githooks/pre-commit` scans TRACKED FILES only
//    (`test/leak-gate.test.js`); `.githooks/commit-msg` only judged the
//    LANGUAGE (`src/commit-msg-lang.js`). A message is as IRREVERSIBLE as a
//    file once pushed (`git log -p` keeps it for ever) and nothing stood
//    between a client name typed in a commit subject and the published
//    history.
//
// 🛑 THE DECISION LIVES HERE, NEVER IN THE SUITE (same reason as
//    `commit-msg-lang.js`: Stryker does not mutate test code). The hook
//    (`.githooks/commit-msg` → `tools/commit-msg-check.js`) and the suite
//    (`test/commit-msg-leak.test.js`) consume THIS module.
//
// 🛑 NO SECOND DEFINITION OF "WHICH TERMS TO PROTECT". This module does not
//    build the forbidden patterns itself — it only SCANS a text against
//    whatever patterns its caller hands it. The caller (the shell) builds
//    them with `leak-pure.forbiddenPatterns()` fed by `leak-list.privateTerms()`
//    — the SAME single source the file gate already uses. A second builder
//    here would drift from the file gate's list the day one of them changes.
//
// ⚠️ PURE: zero I/O (no `fs`, no `os`, no `process.env`). Reading the message
//    file and building the patterns from the environment live in the shell.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const { scan } = require('@zenon-lab/personal-data-guard');
// 🛑 THE TRAILER BLOCK IS EXCLUDED, AND THAT IS NOT A CONVENIENCE.
//    `Co-Authored-By:` carries an email BY DEFINITION (git's own convention), so scanning the
//    whole message refuses the repository's most ordinary commit. Measured the day this shipped:
//    it blocked its OWN delivery commit. The language gate already draws that line — we REUSE its
//    reader rather than redraw it, or the two definitions of "trailer" diverge in silence.
const { bodyLines, trailerBlockStart } = require('./commit-msg-lang.js');

/** The message MINUS its trailing trailer block — what a human actually wrote. */
function scannable(message) {
  const lines = bodyLines(message);
  const stop = trailerBlockStart(lines);
  return (stop === -1 ? lines : lines.slice(0, stop)).join(String.fromCharCode(10));
}

/**
 * THE DECISION for a commit MESSAGE. Reuses `leak-pure.scan()` — the SAME
 * matcher the file gate runs — over patterns built by the CALLER.
 * @param {string} message
 * @param {{name:string, re:RegExp}[]} motifs
 * @returns {{violations: {name:string, excerpt:string}[]}}
 */
function verdict(message, motifs) {
  return { violations: scan(scannable(message), motifs) };
}

/** The refusal text. Kept here so the hook and the suite say the SAME thing. */
function refusal(v) {
  const lines = v.violations.map((o) => `  ${o.name} (${o.excerpt})`);
  return [
    'COMMIT REFUSED — the message carries personal data.',
    'This repository is PUBLIC: a pushed message survives in history for ever (git log -p).',
    'Remove the data below from the message, then commit again.',
    ...lines,
  ].join('\n');
}

module.exports = { scannable, verdict, refusal };
