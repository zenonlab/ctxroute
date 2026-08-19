// ═══════════════════════════════════════════════════════════════════════
// harness-profile-gate.test.js — THE CORE KNOWS NO HARNESS, MECHANICALLY
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 BORN OF AN INVARIANT ASSERTED BUT NEVER GUARDED (audit of 14/08/2026).
//    The porting contract declares "ABSOLUTELY FORBIDDEN to modify `sources/` for
//    a port", and the dependency-cruiser rule `sources-must-not-know-the-harness`
//    was supposed to hold it. **It only looks at the IMPORTS** — it cannot
//    see a LITERAL. Measured: `sources/file.js` carried `'Bash'`, `apply_patch`,
//    `file_path`, `remotePath` hard-coded. And `apply_patch` is a **CODEX** name:
//    the leak had therefore ALREADY happened, without a single test flinching.
//    ⇒ **An invariant no machine verifies is not an invariant.**
//
// 📐 THIS GATE IS **DERIVED FROM THE PROFILE**, never a copied list: any dialect
//    ADDED to the profile tomorrow is covered the day it is written. A hard-coded list
//    here would reproduce exactly the defect we are closing.
//
// 🛑 WHAT IT DOES NOT DO: it does not prove that a port WILL WORK. It proves
//    that no harness name reintroduces itself into the pure core — the
//    decidable part. Never sell it beyond that.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_PROFILE } from '../src/harness-profile.js';

const RACINE = path.join(import.meta.dirname, '..');
// The CORE: pure modules that answer "which docs?" without knowing anything about the harness.
const NOYAU = ['src/sources/file.js', 'src/sources/tool.js', 'src/sources/mcp.js', 'src/sources/skill.js', 'src/sources/session.js', 'src/gate.js', 'src/budget.js', 'src/loader.js', 'src/collisions.js', 'src/lint.js'];

// The DIALECT VOCABULARY = every value of the profile, flattened.
const dialecte = Object.values(DEFAULT_PROFILE).flat();

const read = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
// ⚠️ We strip the COMMENTS: a code doc has the RIGHT (and the duty) to
//    name the dialect in order to explain why it is no longer there. It is the CODE
//    that must no longer carry it.
function codeSeul(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => {
      const i = l.indexOf('//');
      if (i < 0) return l;
      const avant = l.slice(0, i);
      const guillemets = (avant.match(/['"`]/g) || []).length;
      return guillemets % 2 === 0 ? avant : l;
    })
    .join('\n');
}

test('㊽ ANTI-DORMANCY — the profile really declares a vocabulary, and the scan really reads', () => {
  // 🛑 Without this part, an EMPTY profile or a broken scan would make the gate GREEN by
  //    analysing NOTHING. A defect already paid for 3 times in this repo.
  assert.ok(dialecte.length >= 4, `suspicious dialect vocabulary: ${dialecte.length}`);
  assert.ok(dialecte.every((d) => typeof d === 'string' && d.length > 0));
  for (const f of NOYAU) assert.ok(read(f).length > 200, `empty or unreadable core file: ${f}`);
});

test('㊽ NO hard-coded harness name in the CORE (derived from the profile)', () => {
  const faults = [];
  for (const f of NOYAU) {
    const code = codeSeul(read(f));
    for (const word of dialecte) {
      // The `require` of the profile is the ONLY legitimate mention: it cites no value.
      if (code.includes(`'${word}'`) || code.includes(`"${word}"`)) faults.push(`${f} → ${word}`);
    }
  }
  assert.deepStrictEqual(faults, [],
    'Harness dialect REINTRODUCED into the core. Porting a harness = editing `harness-profile.js`, NEVER these files.');
});

test('㊽ NEGATIVE-CHECK — the gate BITES on a reintroduction (IN-MEMORY sabotage)', () => {
  // ⚠️ IN-MEMORY sabotage, never on a real file: a sabotage on disk
  //    brought down 38 tests of other suites on 03/08/2026.
  const sabotaged = codeSeul(`const x = '${dialecte[0]}';`);
  assert.ok(dialecte.some((m) => sabotaged.includes(`'${m}'`)), 'the gate would NOT detect a reintroduction');
  // And it does NOT bite on a mention in a COMMENT (otherwise every code doc would turn red).
  const commentaire = codeSeul(`// we no longer test '${dialecte[0]}' here\nconst y = 1;`);
  assert.ok(!dialecte.some((m) => commentaire.includes(`'${m}'`)), 'a comment must NEVER turn red');
});

test('㊿ THE PAYLOAD IS DECLARED, and it leaves BOTH filters', () => {
  // 🛑 `contentKeys` removes from the filters' universe the params that TRANSPORT
  //    content. **Measured: 55 exclusions decided solely by content.**
  // ⚠️ Removing it from ONE filter only would break the `scope`/`exclude` duality — the
  //    theorem ㊼. It is `textValues` that serves both: a single
  //    point of truth, so the asymmetry is impossible BY CONSTRUCTION.
  const f = require('../src/sources/file.js');
  assert.ok(DEFAULT_PROFILE.contentKeys.length >= 3);
  const payload = { file_path: '/a/x.js', old_string: 'node_modules', new_string: 'dist' };
  assert.deepStrictEqual(f.textValues(payload).chunks, ['/a/x.js'], 'the payload is still read by the filters');
  // ⚠️ `description` is NOT one: it is a statement ABOUT the gesture, not a payload
  //    (arbitrated on measurement: putting it in cost 6 more docs, without gaining anything).
  assert.ok(!DEFAULT_PROFILE.contentKeys.includes('description'));
});

test('㊽ THE SHELL IS NOT DECLARED — it is DETECTED (no list of shell tools)', () => {
  // 📐 MEASURED on 7,553 real calls: 4 tools carry a `command` (`Bash`,
  //    `PowerShell`, `mcp__ssh__ssh_exec`, `mcp__infra__infra_call`) and all 4 are
  //    shells. A LIST would therefore be born obsolete at the next shell/remote MCP,
  //    and its failure would be SILENT (18 % of the commands were already invisible).
  // 🛑 If one day someone adds `shellTools` to the profile, this test turns red: that is
  //    the signal that we have gone back to a list, hence back to the defect.
  // ⚠️ KEYS IN ENGLISH, AND THAT IS A RULE: this profile is EDITED BY THE ADOPTER
  //    (public interface), so everything the adopter READS or WRITES is in English.
  //    ⚠️ Decision ㉒ ("internal code stays in French") was REVERSED on
  //    16/08/2026 by the maintainer: the WHOLE project goes English
  //    (identifiers, engine messages, tests, repo docs). This note used to
  //    contrast the public interface with a French internal code — that
  //    contrast no longer exists.
  assert.ok(!('shellTools' in DEFAULT_PROFILE),
    'A `shellTools` has appeared: the shell is recognised by the PRESENCE of a `command`, never by a list of names.');
  assert.ok(Object.keys(DEFAULT_PROFILE).every((k) => /^[a-z][A-Za-z]*$/.test(k)),
    'Profile key outside the English camelCase convention — this file is PUBLIC INTERFACE.');
  assert.deepStrictEqual(Object.keys(DEFAULT_PROFILE).sort(), ['commandCwdKey', 'commandKeys', 'contentKeys', 'patchTools', 'pathKeys'],
    'The profile has changed shape: update this gate AND the doc, in the same move.');
});
