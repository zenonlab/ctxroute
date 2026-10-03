#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// tools/mutation-scope.js — WRITES the mutation workflow's `paths:` and the purity rule
// from the two lists a human decides (`stryker.conf.json` `mutate`, the Stryker vitest
// `include`). The decisions live in `src/mutation-scope-pure.js`; this shell only reads
// and writes files.
//
//   node tools/mutation-scope.js           → CHECK: exit 1 and say what drifted
//   node tools/mutation-scope.js --write   → regenerate both files in place
//
// ⚠️ Adding a mutated module is therefore: its line in `mutate`, its suite in `include`,
//    then `--write`. `test/mutation-scope-gate.test.js` reddens if the last step is forgotten.
// ═══════════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const scope = require('../src/mutation-scope-pure');

const ROOT = path.resolve(__dirname, '..');
const FILES = {
  stryker: path.join(ROOT, 'stryker.conf.json'),
  vitest: path.join(ROOT, 'vitest.stryker.config.mjs'),
  workflow: path.join(ROOT, '.github', 'workflows', 'mutation.yml'),
  cruiser: path.join(ROOT, '.dependency-cruiser.json'),
};

/** Read the two decided lists and compute what the two derived files must contain. */
async function expected() {
  const mutate = JSON.parse(fs.readFileSync(FILES.stryker, 'utf8')).mutate;
  const include = (await import(pathToFileURL(FILES.vitest).href)).default.test.include;
  const exempt = scope.purityExemptions();
  const dormant = scope.dormantExemptions(mutate, exempt);
  if (dormant.length > 0) {
    throw new Error(`mutation-scope: purity exemption(s) for module(s) no longer mutated: ${dormant.join(', ')} — remove them from purityExemptions()`);
  }
  const workflowText = fs.readFileSync(FILES.workflow, 'utf8');
  const cruiserText = fs.readFileSync(FILES.cruiser, 'utf8');
  const workflow = scope.spliceWorkflow(workflowText, scope.workflowBlock(mutate, include));
  const cruiser = JSON.stringify(scope.spliceRule(JSON.parse(cruiserText), scope.purityRule(mutate, exempt)), null, 2) + '\n';
  return { workflow, cruiser, workflowText, cruiserText };
}

async function main() {
  const write = process.argv.includes('--write');
  const e = await expected();
  const drift = [];
  if (e.workflow !== e.workflowText) drift.push('.github/workflows/mutation.yml');
  if (e.cruiser !== e.cruiserText) drift.push('.dependency-cruiser.json');
  if (write) {
    fs.writeFileSync(FILES.workflow, e.workflow);
    fs.writeFileSync(FILES.cruiser, e.cruiser);
    console.log(drift.length ? `✅ regenerated: ${drift.join(', ')}` : '✅ already up to date');
    return;
  }
  if (drift.length) {
    console.error(`❌ out of date: ${drift.join(', ')} — run: node tools/mutation-scope.js --write`);
    process.exitCode = 1;
  } else {
    console.log('✅ mutation scope up to date');
  }
}

module.exports = { expected };
if (require.main === module) {
  main().catch((err) => {
    console.error(`❌ TOOL FAILURE: ${err.message}`);
    process.exitCode = 2;
  });
}
