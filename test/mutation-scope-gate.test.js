// mutation-scope-gate.test.js — the mutation workflow's `paths:` and the purity rule are
// GENERATED from `stryker.conf.json` `mutate` + the Stryker vitest `include`
// (`tools/mutation-scope.js`). This gate reddens when the written files drift from what
// the generator computes — i.e. when someone edited the two lists and forgot `--write`,
// or hand-edited a generated block.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { expected } = require('../tools/mutation-scope.js');

test('GATE: the mutation workflow paths and the purity rule are exactly what the two lists generate', async () => {
  const e = await expected();
  assert.ok(e.workflowText.includes('AUTO:mutation-scope'), 'the workflow lost its generated block — this cell would judge nothing');
  assert.equal(e.workflow, e.workflowText,
    '.github/workflows/mutation.yml drifted from stryker.conf.json `mutate` + vitest.stryker.config.mjs `include` — run: node tools/mutation-scope.js --write');
  assert.equal(e.cruiser, e.cruiserText,
    '.dependency-cruiser.json purity rule drifted from stryker.conf.json `mutate` — run: node tools/mutation-scope.js --write');
});

test('GATE: the generated purity rule covers at least the mutated modules it claims (anti-vacuity)', async () => {
  const e = await expected();
  const rule = JSON.parse(e.cruiser).forbidden.find((r) => r.name === 'mutated-modules-must-stay-pure');
  assert.ok(rule, 'the generated purity rule is absent');
  const covered = rule.from.path.split('|').length;
  assert.ok(covered >= 50, `only ${covered} modules under the purity rule — the derivation lost its input`);
});
