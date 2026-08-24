// ═══════════════════════════════════════════════════════════════════════════
// declFor — A FILTERED DECISION KEY IS A DEAD KEY (06/08/2026)
// ═══════════════════════════════════════════════════════════════════════════
//
// 🔴 A REAL DEFECT, AND THE MOST COSTLY ONE POSSIBLE: `enforce` (shipped on 05/08/2026,
//    the word that REFUSES a gesture) was NOT copied over by `sources/mcp.js`.
//    It was therefore accepted by `validateMcp`, documented in the skill, present
//    in the 4 corpora of the symmetry gate… and **INERT on the MCP channel** —
//    that is to say exactly where the framework's FOUNDING incident lives (the
//    Stripe payment click). Discovered on 06/08 by arming it FOR REAL:
//    `create_refund` returned `allow`. Without a REAL spawn verification,
//    I would have announced "it is armed" and shipped a safety catch that never
//    catches — worse than no safety catch, because you trust it.
//
// ⚠️ WHY THE VOCABULARY SYMMETRY GATE DID NOT SEE IT: it checks that
//    the key is ADMITTED in the 4 corpora (validation), not that it is
//    TRANSPORTED to `gate.decide` (propagation). Two distinct invariants.
//    Admitting a key and honouring it are two things — this one covers the second.
//
// 🛑 THE `declFor` FORM IS A STRUCTURAL TRAP: it COPIES key by key, so
//    anything not named is lost IN SILENCE. The file source, for its part,
//    passes the WHOLE frontmatter and does not have this risk. As long as that asymmetry
//    exists, this gate is the only safety net.

import { test } from 'vitest';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as gate from '../src/gate.js';
import { declFor as declForMcp } from '../src/sources/mcp.js';
import { declFor as declForSkill } from '../src/sources/skill.js';

// ⚠️ A VALID and NON-DEFAULT value per key — otherwise the test would pass even if
//    `declFor` invented the value instead of propagating it.
const SAMPLE = {
  mode: 'dumb',
  threshold: 7,
  driftUnit: 'turn',
  enforce: true,
};

// The DECISION keys are DERIVED from gate.js: each `xForDoc` resolver
// names the key it reads. Copying a list here would make it diverge — the very
// bug we are hunting.
function decisionKeys() {
  return Object.keys(gate)
    .filter((k) => k.endsWith('ForDoc'))
    .map((k) => k.slice(0, -'ForDoc'.length))
    // `bloque` is not a frontmatter key: it is the VERDICT derived
    // from `enforce` + the state. It has nothing to propagate.
    .filter((k) => k !== 'bloque');
}

test('DECLFOR ①: every DECISION key is propagated by the MCP source', () => {
  const missingOnes = decisionKeys().filter((key) => {
    const decl = declForMcp({ [key]: SAMPLE[key] });
    return decl[key] !== SAMPLE[key];
  });
  assert.deepStrictEqual(missingOnes, [],
    'FILTERED IN SILENCE by sources/mcp.js#declFor: ' + missingOnes.join(', ')
    + '\nThe key will be accepted by validateMcp and will have NO effect.'
    + '\nAdd its copy in declFor — validation is not enough.');
});

test('DECLFOR ②: every DECISION key is propagated by the SKILL source', () => {
  const missingOnes = decisionKeys().filter((key) => {
    const decl = declForSkill({ [key]: SAMPLE[key] });
    return decl[key] !== SAMPLE[key];
  });
  assert.deepStrictEqual(missingOnes, [],
    'FILTERED IN SILENCE by sources/skill.js#declFor: ' + missingOnes.join(', '));
});

test('DECLFOR ③: the SAMPLE covers every key (anti-blind-spot)', () => {
  // ⚠️ Without this part, adding a decision key WITHOUT adding it to ECHANTILLON
  //    would make it `undefined === undefined` ⇒ GREEN although it is filtered.
  //    The gate would certify itself — the very defect it exists to prevent.
  const uncovered = decisionKeys().filter((c) => !(c in SAMPLE));
  assert.deepStrictEqual(uncovered, [],
    'decision key(s) without a sample: ' + uncovered.join(', ')
    + '\nAdd a VALID and NON-DEFAULT value to ECHANTILLON.');
  assert.ok(decisionKeys().length >= 4, 'DORMANT gate: fewer than 4 derived keys');
});

test('DECLFOR ④: an EXPLICIT `false` survives — opting out must remain possible', () => {
  // ⚠️ An "empty value" filter on the booleans would make `enforce: false`
  //    indistinguishable from absent, so a category moved to
  //    `defaults.{source}.enforce` would become UN-OPT-OUT-ABLE: the dead end
  //    of any cascade. The case holds for BOTH sources.
  assert.strictEqual(declForMcp({ enforce: false }).enforce, false);
  assert.strictEqual(declForSkill({ enforce: false }).enforce, false);
});

test('DECLFOR ⑤: an INVALID value is never propagated (it falls back down the cascade)', () => {
  // The author PROPOSES, the cascade DISPOSES: a value outside the vocabulary must
  // not impose itself on `gate.decide`, otherwise a typo would become a decision.
  assert.notStrictEqual(declForMcp({ mode: 'turbo' }).mode, 'turbo');
  assert.strictEqual(declForMcp({ driftUnit: 'moon' }).driftUnit, undefined);
  assert.strictEqual(declForMcp({ enforce: 'yes' }).enforce, undefined);
  assert.strictEqual(declForSkill({ enforce: 'yes' }).enforce, undefined);
});

// ═══════════════════════════════════════════════════════════════════════
// ⑤ THE OTHER DIRECTION: a FILLED key kills the next level (㊳, 09/08/2026)
// ═══════════════════════════════════════════════════════════════════════
// 🔴 2nd REAL DEFECT OF THE SAME FILE, and the exact MIRROR of the first.
//    `sources/mcp.js#declFor` called `lib.modeFor`/`lib.thresholdFor`: it
//    therefore always POSED a value, even without a frontmatter. Since the cascade of
//    `gate.js` stops at the FIRST value found, level ②
//    (`defaults.mcp`) was NEVER consulted — inert, silently, while
//    `defaults.skill` worked. Measured: `{mode:"dumb", threshold:9}`
//    returned `smart/4`.
// 🛑 PARTS ①-④ COULD NOT SEE IT: they check that a DECLARED key
//    reaches the end. Here the key was not declared at all —
//    and the source invented one. **Filtering and FILLING both kill a
//    level, in opposite directions.** A gate that covers only one direction
//    leaves the other free.
// ⚠️ DERIVED FROM THE `sources/` FOLDER, never a list: any FUTURE source
//    exposing a `declFor` is covered the day it is written. A hard-coded list
//    here would depend on vigilance — precisely what we are replacing.
// ⚠️ THE EXACT INVARIANT, not to be weakened: *empty input ⇒ EMPTY decl*. It is the
//    only form that lets the cascade exist. A source has no right to
//    know a default: the defaults live in `gate.js`, a SINGLE POINT.
function sourcesWithDeclFor() {
  const require_ = createRequire(import.meta.url);
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'sources');
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.js'))
    .map((f) => ({ name: 'sources/' + f, mod: require_(path.join(dir, f)) }))
    .filter((s) => typeof s.mod.declFor === 'function');
}

test('DECLFOR ⑤: a source POSES, it never RESOLVES — empty input ⇒ EMPTY decl', () => {
  const offendingLines = sourcesWithDeclFor()
    .filter(({ mod }) => Object.keys(mod.declFor({})).length > 0
      || Object.keys(mod.declFor(undefined)).length > 0)
    .map(({ name }) => name);

  assert.deepStrictEqual(offendingLines, [],
    'THESE SOURCES RESOLVE INSTEAD OF POSING: ' + offendingLines.join(', ')
    + '\nAn always-full decl SHORT-CIRCUITS `defaults.{source}`: the cascade'
    + '\nstops at the first value found, so the level becomes INERT in silence.'
    + '\nRemove the resolution — the defaults live in gate.js, a single point.');
});

// ⚠️ ANTI-INERT, MANDATORY: without it, part ⑤ would go green even
//    if it tested nothing (for instance if `sourcesAvecDeclFor()` returned an
//    EMPTY list after a folder rename). A gate that cannot turn red
//    CERTIFIES instead of protecting.
// 🛑 IN-MEMORY sabotage only — never a real file: the 1st version
//    of such a check in this repo brought down 38 neighbouring tests.
test('DECLFOR ⑤ NEGATIVE: the part really sees, and it would really turn red', () => {
  // ① it inspects at least one real source (otherwise it certifies emptiness)
  const foundOnes = sourcesWithDeclFor();
  assert.ok(foundOnes.length >= 2,
    'part ⑤ no longer inspects anything: ' + foundOnes.length + ' source(s) found');

  // ② a source that RESOLVES is indeed detected as at fault
  const resolving = { declFor: () => ({ mode: 'smart', threshold: 4 }) };
  assert.ok(Object.keys(resolving.declFor({})).length > 0,
    'the criterion of part ⑤ does not detect a source that fills');
});
