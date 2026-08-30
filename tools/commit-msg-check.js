#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// COMMIT-MSG-CHECK — the SHELL of the English-only commit gate.
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ IT DECIDES NOTHING. The rule lives in `src/commit-msg-lang.js` (pure,
//    mutated by Stryker); this file only does the I/O the rule may not do:
//    read the message file git hands over, load the detector, print, exit.
//    🛑 NEVER inline a piece of the rule here — a rule in two places is a rule
//    in one place plus a copy that rots.
//
// ⚠️ `eld` IS ESM-ONLY (its package.json exports only an `import` condition),
//    hence the dynamic `import()`. Do NOT "fix" it into a `require`: it throws
//    ERR_REQUIRE_ESM, and a gate that always crashes is a gate uninstalled.
//
// ⚠️ FAIL-CLOSED AND LOUD. An unexpected error REFUSES the commit and prints
//    the cause: a gate that lets things through when it breaks is
//    indistinguishable from an absent gate. The conscious escape hatch stays
//    `git commit --no-verify`, and it must stay conscious — never automate it.
//
// ⚠️ THIS SHELL ALSO RUNS THE LEAK CHECK ON THE MESSAGE (2026-08-27) — a
//    commit message is as IRREVERSIBLE as a tracked file once pushed, and
//    `.githooks/pre-commit` only scans FILES. The patterns are built the SAME
//    way the file gate builds them (`leak-pure.forbiddenPatterns()` fed by
//    `leak-list.privateTerms()`, the SINGLE source of "which terms to
//    protect") — never a second list. Checked FIRST: it needs no ESM import
//    and refusing personal data must never wait behind the language check.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const fs = require('fs');
const os = require('os');
const { verdict, refusal } = require('../src/commit-msg-lang.js');
const { verdict: leakVerdict, refusal: leakRefusal } = require('../src/commit-msg-leak.js');
const { forbiddenPatterns } = require('@zenon-lab/personal-data-guard');
const { privateTerms } = require('../src/leak-list.js');

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.log('commit-msg-check: no message file given (expected: commit-msg-check <file>)');
    process.exit(1);
  }
  const message = fs.readFileSync(file, 'utf8');

  // ⚠️ SAME BUILDER AS THE FILE GATE (test/leak-gate.test.js `motifs()`):
  //    OS account + home folder + the private list's derived/declared terms.
  //    Absent private list ⇒ generic mode (email/IP only), never a failure —
  //    same degradation contract as the file gate.
  const motifs = forbiddenPatterns(os.userInfo().username, os.homedir(), privateTerms());
  const lv = leakVerdict(message, motifs);
  if (lv.violations.length > 0) {
    console.log(leakRefusal(lv));
    process.exit(1);
  }

  // ⚠️ SAME ENTRY POINT AS `english-only-gate.test.js` (`eld/large`): one
  //    detector for the whole repository, or two gates that disagree.
  const { eld } = await import('eld/large');
  const v = verdict(message, (t) => eld.detect(t));
  if (v.offenders.length > 0) {
    console.log(refusal(v));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.log(`commit-msg-check: FAILED to judge the message — ${e && e.message}`);
  console.log('The commit is refused because the gate could not decide (fail-closed).');
  process.exit(1);
});
