// ═══════════════════════════════════════════════════════════════════════
// THE GATE THAT CHECKS THAT THE PURITY GATES CAN GO RED.
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ REAL BUG, FOUND ON 03/08/2026: `lib-pure-must-stay-pure` — the oldest
//    architecture gate of the repo, documented everywhere as THE purity
//    guarantee — was INERT. A `require('fs')` added at the top of
//    `lib-pure.js` went GREEN. Same for every other `*-must-stay-pure` rule.
//
// ⚠️ ROOT CAUSE (OFFICIAL dependency-cruiser 18.1.0 doc, options-reference:
//    "includeOnly … will discard all files not matching the pattern"):
//    `includeOnly` ALSO FILTERS THE DEPENDENCIES. Our pattern only listed
//    local `*.js` files ⇒ `fs`, `path`, `child_process` NEVER entered the
//    graph ⇒ no rule could see them. The gate protected nothing, and
//    displayed itself green. Measurement: 41 modules / 99 dependencies before
//    the fix, 47 / 143 after.
//
// ⚠️ THIS FILE EXISTS SO THAT IT DOES NOT COME BACK. A gate that cannot fail
//    CERTIFIES instead of protecting — and that is worse than no gate,
//    because people stop looking. NEVER delete it nor loosen it.
// ═══════════════════════════════════════════════════════════════════════
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONFIG = path.join(HERE, '..', '.dependency-cruiser.json');

const lireConfig = () => JSON.parse(fs.readFileSync(CONFIG, 'utf8'));

// Extracts the core modules forbidden by the rules, FROM THE RULES.
// ⚠️ Never a copied list: that would be the same bug class (a duplicated
//    truth that diverges). Adding a rule that forbids `os` must be ENOUGH to
//    make `os` required in includeOnly.
function coeursInterdits(config) {
  const foundOnes = new Set();
  for (const r of config.forbidden) {
    const to = (r.to && r.to.path) || '';
    if (!(r.to && Array.isArray(r.to.dependencyTypes) && r.to.dependencyTypes.includes('core'))) continue;
    for (const m of to.matchAll(/[a-z_]+/g)) foundOnes.add(m[0]);
  }
  return [...foundOnes];
}

test('DERIVED: every core module forbidden by a rule ENTERS the graph', () => {
  // ⚠️ THIS is THE condition for a purity rule to be able to fire. Without it
  //    the rule exists, reads well, and serves NO purpose.
  const config = lireConfig();
  const coeurs = coeursInterdits(config);
  assert.ok(coeurs.length > 0, 'premise: at least one rule forbids a core module');
  for (const c of coeurs) {
    assert.ok(
      new RegExp(config.options.includeOnly).test(c),
      `"${c}" is forbidden by a rule but EXCLUDED from the graph by includeOnly ⇒ the rule is INERT. `
      + 'Add it to includeOnly (dependency-cruiser doc: includeOnly also filters the dependencies).',
    );
  }
});

test('REAL SABOTAGE: each "pure" module makes its gate GO RED when impurified', () => {
  // ⚠️ The static test above proves the CONDITION; this one proves the EFFECT.
  //    Both are needed: it is by believing the condition sufficient that a
  //    gate was left inert for weeks.
  const config = lireConfig();
  const targets = config.forbidden
    .filter((r) => r.name.endsWith('-must-stay-pure'))
    .map((r) => (r.from.path || '').replace(/[\^$]/g, '').replace(/\\\./g, '.'))
    .filter((f) => f.endsWith('.js') && fs.existsSync(path.join(HERE, '..', f)));

  assert.ok(targets.length >= 2, 'premise: several modules are declared pure');

  for (const target of targets) {
    // ⚠️ SABOTAGE ON A COPY, NEVER ON THE REAL FILE — a pattern imposed by the
    //    repo (cf doctor.test.js). Mistake made while writing this test:
    //    sabotaging `lib-pure.js` in place brought down **38 tests** of other
    //    suites importing it IN PARALLEL. A test that breaks its neighbours is
    //    a test that ends up disabled. The targeted modules are PURE (zero
    //    local import, which is precisely what we check): copying the single
    //    file is enough.
    const bac = fs.mkdtempSync(path.join(os.tmpdir(), 'purete-'));
    fs.mkdirSync(path.dirname(path.join(bac, target)), { recursive: true });
    fs.writeFileSync(
      path.join(bac, target),
      "const fs = require('fs');\n" + fs.readFileSync(path.join(HERE, '..', target), 'utf8'),
    );
    // ⚠️ LOCAL BINARY, NEVER `npx`: launched from a temporary folder, `npx`
    //    does not find the repo's `node_modules` and GOES FETCHING THE PACKAGE
    //    OVER THE NETWORK — it brought back an anti-dependency-confusion
    //    placeholder (measured 03/08/2026). A test depending on the network is
    //    a test that lies on an outage day, and a vector for unwanted code
    //    execution.
    const BIN = path.join(HERE, '..', 'node_modules', 'dependency-cruiser', 'bin', 'dependency-cruise.mjs');
    let output = '';
    try {
      execFileSync(process.execPath, [BIN, '--config', CONFIG, '.'], { cwd: bac, encoding: 'utf8' });
    } catch (e) {
      output = String(e.stdout || '') + String(e.stderr || '');
    }
    assert.match(
      output, new RegExp(target.replace('.', '\\.') + '.*fs|must-stay-pure'),
      `${target} was impurified and NO gate went red — the rule protecting it is INERT.`,
    );
  }
}, 120000);
