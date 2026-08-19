// ═══════════════════════════════════════════════════════════════════════
// OPERATOR CONSUMPTION GATE — an operator must NARROW on EVERY dimension
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 WHY IT EXISTS (2026-08-19). The SAME defect has now shipped TWICE, and
//    nothing in the repo could see it:
//      ㊴ (12/08) — `scope`/`exclude` IGNORED on the skills' `servers` dimension:
//         a client folder injected while writing into ANY other one. Cost: a
//         client email written without its folder, ~10 versions.
//      `keys` (19/08) — SHIPPED, mirrored into the schema, 959 tests and a 100 %
//         mutation score GREEN… and **INERT on 8 skill entries out of 8**, because
//         `skillRules` REBUILDS a rule field by field and nobody added the new
//         operator to that list. It was inert on the ONE form the whole fleet
//         uses, and on the exact defect it was written to fix.
//
// 🛑 THE COMMON CAUSE IS NOT A FORGOTTEN LINE, IT IS A MISSING JUDGE.
//    `triggers-gate` proves a TRIGGER is consumed. NOTHING proved that a
//    NARROWING operator is consumed, and above all nothing proved it
//    **dimension by dimension** — an operator can be perfectly alive on three
//    dimensions and dead on the fourth, which is precisely what happened both
//    times. An operator is declared ONCE and consumed in N places; only the
//    places are counted here.
//
// ⚠️ THE DECLARED CLASS: "accepted by the validator/schema, ignored by the
//    engine". It is WORSE than a typo — a typo produces a red, this produces a
//    happy validator over a dead rule, and it points the author at the wrong
//    cause (on 31/07 the engine got accused of not reading commands).
//
// ⚠️ PROBED BY BEHAVIOUR, never by reading a list: a cell passes if adding the
//    operator CHANGES the engine's decision. A gate that read `skillRules`
//    would have been written from the same wrong list as the code.
// ⚠️ ANTI-VACUITY: every base case must ACTUALLY inject. Without it a broken
//    probe (a wrong tool name, an atom nowhere) would turn the whole table green
//    while proving strictly nothing — the failure mode of any negative test.
// ⚠️ THE LIST OF OPERATORS IS DERIVED FROM THE CODE (`RULE_KEYS`), never copied:
//    a future operator joins the table BY ITSELF and lands red until someone
//    proves it is consumed. That is the whole point — the next `keys` must not
//    depend on anyone remembering this file exists.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { RULE_KEYS, validateMcp } from '../src/frontmatter.js';
import * as fileSrc from '../src/sources/file.js';
import * as toolSrc from '../src/sources/tool.js';
import * as skillSrc from '../src/sources/skill.js';
import { rulesFromCorpus } from '../src/loader.js';

// ── WHAT COUNTS AS A NARROWING OPERATOR ─────────────────────────────────
// Derived from `RULE_KEYS`, the per-rule vocabulary of the engine. The two
// non-narrowing keys are named with their reason; anything else must be
// classified, so a new key CANNOT slip in unnoticed (check ⓪).
const NON_RESSERRANTS = {
  pattern: 'the TRIGGER itself — it CREATES the injection, it does not narrow it (covered by triggers-gate)',
  rank: 'a z-index: it orders the emission, it decides no injection',
};
const RESSERRANTS = RULE_KEYS.filter((k) => !(k in NON_RESSERRANTS));

const ATOME = 'demo-projet';
const JAMAIS = 'atome-absent-de-tout-geste';

// The atom lives ONLY in `command`. That is what makes the three narrowings
// comparable: each one must be able, on its own, to make the decision flip.
const GESTE_SHELL = { toolName: 'Bash', toolInput: { command: `echo ${ATOME} >> memo.md` } };
const GESTE_MCP = { toolName: 'mcp__ssh__ssh_exec', toolInput: { command: `echo ${ATOME}` } };

// Per operator: the entry BEFORE narrowing (which must inject) and AFTER
// (which must not). ⚠️ `keys` needs a filter to bite on — it narrows the
// UNIVERSE the others read, it is not a filter itself. Giving it an empty base
// would test nothing and would pass forever.
const FRAGMENTS = () => ({
  scope: { base: {}, resserre: { scope: [JAMAIS] } },
  exclude: { base: {}, resserre: { exclude: [ATOME] } },
  keys: { base: { scope: [ATOME] }, resserre: { scope: [ATOME], keys: ['-command'] } },
});

const skill = (entry, geste) =>
  skillSrc.matchingSkills({ skills: { demo: entry } }, geste).length > 0;

// 🔴 THE ROAD FROM A WRITTEN FRONTMATTER TO A DECISION — the one that actually ships.
//    A hand-built rule object bypasses `loader.rulesOfDecl`, and THAT is where `keys` was
//    dropped on 19/08: the operator was alive in every test and INERT in every real doc of
//    the corpus. **An operator proven on a literal rule is not proven at all.** Any cell
//    below that skips this road measures an engine nobody runs.
const yaml = (frag) => Object.entries(frag)
  .map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n');
const parDoc = (entete, geste) => {
  const texte = `---\n${entete}\nmode: dumb\n---\nBody.\n`;
  return fileSrc.matchingDocs(rulesFromCorpus([{ doc: 'd.md', text: texte }]), geste).length > 0;
};

// ── THE CELLS: every (source × dimension) that carries matching operators ──
const CELLULES = () => [
  {
    // THE REAL ROAD: frontmatter text -> loader -> rules -> decision.
    id: 'corpus/frontmatter-match',
    decide: (f) => parDoc(`match: ${ATOME}\n${yaml(f)}`, GESTE_SHELL),
  },
  {
    // Same road, per-entry `rules` form (its operators live INSIDE the entry).
    id: 'corpus/frontmatter-rules',
    decide: (f) => parDoc(`rules: ${JSON.stringify([{ pattern: ATOME, ...f }])}`, GESTE_SHELL),
  },
  {
    id: 'file/pattern',
    decide: (f) => fileSrc.matchingDocs([{ pattern: ATOME, doc: 'd.md', ...f }], GESTE_SHELL).length > 0,
  },
  {
    id: 'tool/frontmatter',
    decide: (f) => toolSrc.matchingDocs([{ doc: 'd.md', fm: { tool: ['Bash'], ...f } }], GESTE_SHELL).length > 0,
  },
  {
    // 🔴 THE CELL THAT WAS RED ON 19/08 — the form used by 8 of the fleet's 8 skills.
    id: 'skill/match',
    decide: (f) => skill({ match: [ATOME], ...f }, GESTE_SHELL),
  },
  {
    // Narrowing goes INSIDE the rule here: a per-entry form has its own operators.
    id: 'skill/rules',
    decide: (f) => skill({ rules: [{ pattern: ATOME, ...f }] }, GESTE_SHELL),
  },
  {
    // 🔴 THE CELL THAT WAS RED ON 12/08 (㊴) — `servers` was ALL OR NOTHING.
    id: 'skill/servers',
    decide: (f) => skill({ servers: ['ssh'], ...f }, GESTE_MCP),
  },
  {
    id: 'skill/tool',
    decide: (f) => skill({ tool: ['Bash'], ...f }, GESTE_SHELL),
  },
];

// ── ⓪ THE DERIVATION IS EXHAUSTIVE ──────────────────────────────────────
test('⓪ every per-rule key is CLASSIFIED (narrowing, or excluded with a reason)', () => {
  for (const k of RULE_KEYS) {
    assert.ok(
      RESSERRANTS.includes(k) || k in NON_RESSERRANTS,
      `\`${k}\` is neither declared narrowing nor excluded with a reason — classify it`,
    );
  }
  assert.ok(RESSERRANTS.length >= 3, `suspicious derivation: ${RESSERRANTS.length} narrowing operators`);
});

// ── ① THE TABLE: every operator NARROWS on every dimension ───────────────
test('① every narrowing operator is CONSUMED on EVERY dimension (probed, not read)', () => {
  const frags = FRAGMENTS();
  const morts = [];
  for (const cell of CELLULES()) {
    for (const op of RESSERRANTS) {
      const frag = frags[op];
      assert.ok(frag, `operator \`${op}\` has no probe fragment — add one, never skip it`);
      // ANTI-VACUITY: without this, a broken probe makes the whole table green.
      assert.equal(
        cell.decide(frag.base), true,
        `${cell.id}/${op}: the BASE case does not inject — the probe is broken, the table proves nothing`,
      );
      if (cell.decide(frag.resserre) !== false) morts.push(`${cell.id} ignores \`${op}\``);
    }
  }
  assert.deepEqual(
    morts, [],
    `operator(s) ACCEPTED but INERT — the class of ㊴ and of the 19/08 keys:\n  ${morts.join('\n  ')}`,
  );
});

// ── ② THE MCP CORPUS CANNOT HAVE THE DEFECT ─────────────────────────────
// It carries NO matching operator (it is triggered by its PATH). The honest
// check is not "it ignores them" but "it REFUSES them, loudly" — which is what
// makes "accepted and inert" impossible there by construction. Same reasoning
// as `mcp:` removed from the file corpus on 31/07: a validator that approves
// something dead points at the wrong cause.
test('② the MCP corpus REFUSES every narrowing operator (never accepted-and-inert)', () => {
  for (const op of RESSERRANTS) {
    const erreurs = validateMcp({ [op]: ['x'] });
    assert.ok(
      erreurs.length > 0 && erreurs[0].includes(op),
      `an MCP doc ACCEPTS \`${op}\` — it consumes none, so it would be dead in silence`,
    );
  }
});

// ── ③ NEGATIVE-CHECK: the gate must be able to turn red ─────────────────
// A gate never seen failing is a gate assumed to work. We simulate the EXACT
// defect of 19/08 — a dimension that drops the operator while rebuilding its
// rule — and require the table to catch it.
test('③ NEGATIVE-CHECK: a dimension that DROPS an operator is detected', () => {
  const frags = FRAGMENTS();
  // Sabotaged cell: it strips `keys`, exactly like `skillRules` did before the fix.
  const sabotee = {
    id: 'saboted',
    decide: (f) => {
      const { keys, ...sansKeys } = f;
      return skill({ match: [ATOME], ...sansKeys }, GESTE_SHELL);
    },
  };
  assert.equal(sabotee.decide(frags.keys.base), true, 'the sabotaged base must still inject');
  assert.equal(
    sabotee.decide(frags.keys.resserre), true,
    'the sabotage is inoperative: this probe would not have caught the real defect',
  );
});
