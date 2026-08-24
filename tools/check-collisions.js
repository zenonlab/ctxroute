#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// CHECK-COLLISIONS — I/O shell of the fleet cross-over analysis.
// ═══════════════════════════════════════════════════════════════════════
//
// Usage: node check-collisions.js [--json]
//
// ⚠️ SOURCE = the fleet FRONTMATTERS through the loader (the lasting truth) —
//    never protected-paths.json again (transitional, reserved for the Codex engine).
// ⚠️ INFORMATIVE: ALWAYS exit 0 (the verdict belongs to an agent, cf collisions.js).
//    NEVER wire it as a hook/gate — on-demand fleet housekeeping tool.
// ⚠️ ZERO logic here: read corpus → loader → findCollisions → display.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const { readCorpus } = require('../src/corpus');
const { rulesFromCorpus } = require('../src/loader');
const { findCollisions } = require('../src/collisions');
const paths = require('../src/paths');

const JSON_OUTPUT = process.argv.includes('--json');

const rules = rulesFromCorpus(readCorpus(paths.fileDocsDir(), 'docs/'));
const collisions = findCollisions(rules);

if (JSON_OUTPUT) {
  console.log(JSON.stringify({ total_rules: rules.length, collisions }, null, 2));
  process.exit(0);
}

const C = { reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m' };
console.log(`${C.bold}Documentation cross-over detection${C.reset}`);
console.log(`${C.dim}Source: frontmatters from ${paths.fileDocsDir()} (${rules.length} rules)${C.reset}\n`);

if (collisions.length === 0) {
  console.log(`${C.green}No cross-over detected.${C.reset}`);
  process.exit(0);
}

const labels = {
  probable_parent_child: `${C.green}✓ Probable parent/child${C.reset} (often legitimate)`,
  ambiguous: `${C.yellow}❓ Ambiguous${C.reset} (to inspect)`,
  potential_duplicate: `${C.red}⚠ Potential duplicate${C.reset} (to investigate)`,
};
for (const cat of ['probable_parent_child', 'ambiguous', 'potential_duplicate']) {
  const group = collisions.filter((c) => c.classification === cat);
  if (group.length === 0) continue;
  console.log(`${C.bold}${labels[cat]}${C.reset}  —  ${group.length} case(s)\n`);
  group.forEach((c, i) => {
    console.log(`  [${i + 1}] ${C.bold}${c.pattern_a}${C.reset}  ↔  ${C.bold}${c.pattern_b}${C.reset}`);
    console.log(`      ${C.dim}A : ${c.doc_a}${c.scope_a ? ` (scope: ${JSON.stringify(c.scope_a)})` : ''}${C.reset}`);
    console.log(`      ${C.dim}B : ${c.doc_b}${c.scope_b ? ` (scope: ${JSON.stringify(c.scope_b)})` : ''}${C.reset}`);
    console.log(`      ${C.dim}${c.hint}${C.reset}\n`);
  });
}
console.log(`${C.dim}Total: ${collisions.length} cross-overs. Final verdict = AGENT (0-human) — the script sorts, an LLM decides, never a human.${C.reset}`);
