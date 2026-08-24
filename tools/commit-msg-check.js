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
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const fs = require('fs');
const { verdict, refusal } = require('../src/commit-msg-lang.js');

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.log('commit-msg-check: no message file given (expected: commit-msg-check <file>)');
    process.exit(1);
  }
  const message = fs.readFileSync(file, 'utf8');
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
