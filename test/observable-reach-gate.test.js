// ═══════════════════════════════════════════════════════════════════════
// OBSERVABLE REACH — CAN THE LANGUAGE SEE EVERY FACT THE HARNESS HANDS IT?
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 WHY THIS FILE EXISTS (2026-08-19), and it is the most important line here:
//    **EVERY DEFECT THIS PROJECT HAS EVER HAD IS THE SAME DEFECT.**
//      ㊵    `scope` read one level      → nested params INVISIBLE
//      51    same on the trigger          → a path in `args{}` INVISIBLE
//      ㊴    `servers` dimension          → whole dimension UNOBSERVABLE by the filters
//      ㊽    shell recognised by NAME     → 809 commands INVISIBLE (18 %)
//      ㊿    payload keys                 → universe narrowed GLOBALLY, not per entry
//      53bis universe was a concatenation → a text visible that exists in NO param
//      keys  key universe was a constant  → not declarable per entry
//      cwd   pushed as a special case     → outside EVERY key universe
//      cmdCwd a shell command carried TWO facts under ONE key → "I quote this"
//            and "I work here" were the SAME observable, hence inseparable
//    ALL of them are holes in **WHAT THE LANGUAGE CAN SEE**. Not one is a
//    hole in how it COMBINES what it sees. The list only ever grows on this axis —
//    that is the prediction this file makes, and it has held nine times.
//
// 🛑 SO COMPLETENESS WAS MEASURED ON THE WRONG AXIS. `language-completeness`
//    proves that over a FIXED universe every boolean function is expressible —
//    the axis that has NEVER bitten. Expressiveness is a PRODUCT:
//        expressiveness = combinators × observables
//    We proved the first factor and concluded on the product. That is not a false
//    theorem, it is a **dropped hypothesis**: "complete FOR A FIXED UNIVERSE" was
//    quoted as "complete". This file measures the second factor.
//
// 📐 A UNIVERSE IS COMPLETE when the language can DISCRIMINATE on every fact the
//    harness delivers — POSITIVELY (a declaration fires because of it) and
//    NEGATIVELY (a declaration is silenced because of it) — or when the cell is
//    declared blind WITH ITS REASON.
//    The test is mechanical: ∃ a declaration D such that
//        decide(D, gesture WITH o) ≠ decide(D, gesture WITHOUT o)
//
// ⚠️ THE OBSERVABLE LIST IS **DERIVED FROM THE CONTRACT**, never written here:
//    `conformance({})` returns the harness contract as data (required + optional).
//    A capability added there tomorrow lands in this table BY ITSELF and stays RED
//    until someone proves it reachable or declares it blind. 🛑 That derivation is
//    the whole point — `language-atoms.test.js` guards the same class with a
//    HAND-WRITTEN list, i.e. the very "never a copied list" anti-pattern this repo
//    forbids everywhere else. This file is what that one should have been.
//
// ⚠️ HONEST SCOPE: this measures reach RELATIVE TO THE DECLARED CONTRACT. There is
//    no absolute completeness — a harness's universe is an EMPIRICAL fact about a
//    third party, it is never derived. What is derived is everything AFTER the
//    declaration. Drift between the declaration and reality is a separate,
//    CONTINUOUS measurement (`doctor --harness` on a real payload).
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { conformance } from '../src/harness-conformance.js';
import * as fileSrc from '../src/sources/file.js';
import * as toolSrc from '../src/sources/tool.js';
import * as skillSrc from '../src/sources/skill.js';
import { DEFAULT_PROFILE } from '../src/harness-profile.js';
import { DERIVED_OBSERVABLES, DERIVED_NAMES } from '../src/derived-observables.js';

const ATOM = 'atome-temoin';
const decideFile = (rule, geste) => fileSrc.matchingDocs([{ ...rule, doc: 'd.md' }], geste).length > 0;
const decideTool = (fm, geste) => toolSrc.matchingDocs([{ doc: 'd.md', fm }], geste).length > 0;
const decideSkill = (entry, payload) => skillSrc.matchingSkills({ skills: { s: entry } }, payload).length > 0;

// ── THE CONTRACT, AS DATA (derived, never copied) ────────────────────────
// An empty payload makes `conformance` list EVERY capability it knows: the
// required ones (all absent) and the optional ones (all degraded).
function contractCapabilities() {
  const c = conformance({});
  return [...c.required.map((r) => r.capability), ...c.degradations.map((d) => d.capability)];
}

// ── THE CELLS ────────────────────────────────────────────────────────────
// `avec` carries the fact, `sans` is the SAME gesture without it. Reachable ⟺ the
// two verdicts differ. Every cell names the capability of the contract it covers,
// so the derivation below can check that none is left uncovered.
const CELLS = () => [
  // ── tool_name ──────────────────────────────────────────────────────────
  {
    id: 'tool_name/positive/exact', capacity: 'tool_name', reached: true,
    with: () => decideTool({ tool: ['mcp__ssh__ssh_exec'] }, { toolName: 'mcp__ssh__ssh_exec', toolInput: {} }),
    sans: () => decideTool({ tool: ['mcp__ssh__ssh_exec'] }, { toolName: 'autre', toolInput: {} }),
  },
  {
    // 🔴 THE CELL THIS FILE WAS BUILT TO FIND — and it was found BEFORE anyone
    //    needed it, by taking the frame seriously. The tool NAME is reachable
    //    NEGATIVELY but NOT POSITIVELY BY SUBSTRING. You can say "everything
    //    EXCEPT what contains ssh"; you cannot say "everything that contains ssh".
    // ⚠️ The exact-only trigger is a DOCUMENTED decision with a real reason (a
    //    substring would match `WebFetch` inside a file path). What was NEVER
    //    decided is that no OTHER operator recovers the positive reach.
    //    ⇒ open work item: either a capability, or this justification stands.
    id: 'tool_name/positive/substring', reached: false, capacity: 'tool_name',
    justification: 'the `tool` trigger is EXACT by decision (a substring would match `WebFetch` inside a path); `scope` reads the PARAMS, never the tool name — so a FAMILY of tools ("everything containing `delete`") can only be enumerated, and an enumeration is born stale (㊽). Blind cell KEPT — DECIDED 2026-08-20 BY MEASUREMENT, not left open: giving `scope` the universe of `exclude` was implemented in the MODEL and measured. 0 divergence on the `file` source (743,904 exhaustive cases), 544 on `tool`, 1,050 on `skill`, ALL one-directional (a widened `scope` can only ADD). On the REAL corpus — 919 entries, 717 carrying a `scope`, crossed with the tool names MEASURED from 358 transcripts (686 MB, 78 distinct names, `npm run scope-reach`) — exactly ONE pattern lives inside a real tool name, and it is PARASITIC: `seo-notify.md` scopes on `"seo"` to disambiguate WHICH `notify.ts`, a PATH, and would start being satisfied by the mere name of an SEO tool. The threshold, written BEFORE looking, was "one parasitic addition and the cell stays blind". A family of tools is therefore still ENUMERATED, and that is the accepted price: no use case demands the positive reach, while the widening would touch 717 scopes forever on a fleet whose tool vocabulary keeps growing. Detail: REFACTOR-PLAN 59.',
    with: () => decideTool({ tool: ['*'], scope: ['ssh'] }, { toolName: 'mcp__ssh__ssh_exec', toolInput: {} }),
    sans: () => decideTool({ tool: ['*'], scope: ['ssh'] }, { toolName: 'mcp__autre__x', toolInput: {} }),
  },
  {
    id: 'tool_name/negative', capacity: 'tool_name', reached: true,
    with: () => !decideTool({ tool: ['*'], exclude: ['ssh'] }, { toolName: 'mcp__ssh__ssh_exec', toolInput: { p: ATOM } }),
    sans: () => !decideTool({ tool: ['*'], exclude: ['ssh'] }, { toolName: 'mcp__autre__x', toolInput: { p: ATOM } }),
  },

  // ── tool_input — the STRUCTURAL positions, where ㊵/51/㊿/53bis all lived ──
  {
    id: 'tool_input/positive/first-level', capacity: 'tool_input', reached: true,
    with: () => decideFile({ pattern: 'base', scope: [ATOM] }, { toolName: 'X', toolInput: { file_path: '/base', autre: ATOM } }),
    sans: () => decideFile({ pattern: 'base', scope: [ATOM] }, { toolName: 'X', toolInput: { file_path: '/base', autre: 'rien' } }),
  },
  {
    id: 'tool_input/positive/nested', capacity: 'tool_input', reached: true, // ㊵
    with: () => decideFile({ pattern: 'base', scope: [ATOM] }, { toolName: 'X', toolInput: { file_path: '/base', args: { n: { d: ATOM } } } }),
    sans: () => decideFile({ pattern: 'base', scope: [ATOM] }, { toolName: 'X', toolInput: { file_path: '/base', args: { n: { d: 'rien' } } } }),
  },
  {
    id: 'tool_input/positive/array-element', capacity: 'tool_input', reached: true, // 51
    with: () => decideFile({ pattern: ATOM }, { toolName: 'X', toolInput: { path: ['/x/' + ATOM] } }),
    sans: () => decideFile({ pattern: ATOM }, { toolName: 'X', toolInput: { path: ['/x/rien'] } }),
  },
  {
    id: 'tool_input/positive/shell-command', capacity: 'tool_input', reached: true, // ㊽
    with: () => decideFile({ pattern: ATOM }, { toolName: 'PowerShell', toolInput: { command: 'echo ' + ATOM } }),
    sans: () => decideFile({ pattern: ATOM }, { toolName: 'PowerShell', toolInput: { command: 'echo rien' } }),
  },
  {
    id: 'tool_input/negative', capacity: 'tool_input', reached: true,
    with: () => !decideFile({ pattern: 'base', exclude: [ATOM] }, { toolName: 'X', toolInput: { file_path: '/base', autre: ATOM } }),
    sans: () => !decideFile({ pattern: 'base', exclude: [ATOM] }, { toolName: 'X', toolInput: { file_path: '/base', autre: 'rien' } }),
  },

  // ── tool_input — THE KEY FAMILIES, DERIVED FROM THE PROFILE ────────────
  // 🔴 THESE CELLS WERE HAND-WRITTEN IN THE FIRST VERSION OF THIS FILE — the exact
  //    fault it reproaches `language-atoms` with, one level smaller, committed the
  //    same day by the same agent. The families now come from `harness-profile.js`:
  //    a key added to the dialect lands here BY ITSELF.
  // ⚠️ `contentKeys` is the load-bearing pair: blind BY DEFAULT (㊿) and REACHABLE
  //    the moment an entry names it (`keys`). Deriving BOTH is what proves the
  //    default universe is not a floor.
  ...DEFAULT_PROFILE.pathKeys.filter((k) => k !== 'cwd').map((cle) => ({
    id: `tool_input/positive/path-key:${cle}`, capacity: 'tool_input', reached: true,
    with: () => decideFile({ pattern: ATOM }, { toolName: 'X', toolInput: { [cle]: '/x/' + ATOM } }),
    sans: () => decideFile({ pattern: ATOM }, { toolName: 'X', toolInput: { [cle]: '/x/rien' } }),
  })),
  ...DEFAULT_PROFILE.commandKeys.map((cle) => ({
    id: `tool_input/positive/command-key:${cle}`, capacity: 'tool_input', reached: true,
    with: () => decideFile({ pattern: ATOM }, { toolName: 'X', toolInput: { [cle]: 'echo ' + ATOM } }),
    sans: () => decideFile({ pattern: ATOM }, { toolName: 'X', toolInput: { [cle]: 'echo rien' } }),
  })),
  // ── THE FACTS WE DERIVE — CELLS BUILT FROM THE REGISTRY (2026-08-20) ───
  // 🔴 THE 9th AND 10th DEFECTS OF THE SAME FAMILY LIVED HERE. A shell command carried what
  //    the gesture SAYS, where it WORKS, and the paths it RECONSTRUCTS — three facts, one
  //    key. While they shared a name, no combination of operators could tell "I quote this
  //    project" from "I work in it": the boolean base was complete and the distinction still
  //    inexpressible. MEASURED: merged, the only available move cost 47.7 % of real work;
  //    and the reconstruction alone fabricated 402,734 pseudo-paths over 13,910 real actions,
  //    one of which delivered a FOREIGN project's 90 KB skill into an unrelated session.
  // 🛑 THESE CELLS ARE **DERIVED FROM `derived-observables.js`**, never written one by one.
  //    The first version of this block hand-wrote three cells for two facts — the exact
  //    "copied list" anti-pattern this file reproaches `language-atoms` with, committed in
  //    the file that names the fault. A fact added to the registry tomorrow lands here BY
  //    ITSELF and stays RED until it is proven reachable AND droppable.
  // ⚠️ THE ISOLATING DECLARATION IS DERIVED TOO: to prove a fact is reachable ALONE we drop
  //    the raw command AND every OTHER derived fact — listing them by hand would go stale at
  //    the next entry, which is the very class (㊽) this table exists to catch.
  // ⚠️ EACH ENTRY SUPPLIES ITS OWN WITNESS (`temoin`), and it must be a form the
  //    reconstruction really produces: the bare directory is a SUBSTRING of every glued
  //    path, so a witness taken on the directory would be satisfied by the OTHER fact and
  //    the cell would measure nothing — green, and blind.
  ...DERIVED_OBSERVABLES.flatMap((obs) => {
    const others = DERIVED_OBSERVABLES.filter((o) => o.name !== obs.name).map((o) => '-' + o.name);
    const isolating = ['-' + DEFAULT_PROFILE.commandKeys[0]].concat(others);
    const geste = { toolName: 'X', toolInput: { command: obs.witness().command.split('@@').join(ATOM) } };
    const motif = obs.witness().pattern.split('@@').join(ATOM);
    return [
      {
        id: `tool_input/derived:${obs.name}/reachable-alone`, capacity: 'tool_input', reached: true,
        with: () => decideFile({ pattern: motif, keys: { match: isolating } }, geste),
        sans: () => decideFile({ pattern: motif, keys: { match: isolating } },
          { toolName: 'X', toolInput: { command: 'echo rien' } }),
      },
      {
        // 🛑 THE CELL THAT MAKES THE OTHER ONE MEAN SOMETHING: without it, an engine that
        //    IGNORED this name entirely would satisfy "reachable" and nobody would notice —
        //    which is precisely how `keys` shipped accepted-and-inert on 19/08.
        id: `tool_input/derived:${obs.name}/really-droppable`, capacity: 'tool_input', reached: true,
        with: () => decideFile({ pattern: motif, keys: { match: isolating } }, geste),
        sans: () => decideFile({ pattern: motif, keys: { match: isolating.concat('-' + obs.name) } }, geste),
      },
    ];
  }),
  // ⚠️ THE RAW TEXT STAYS REACHABLE WITHOUT ANY DERIVED FACT — the symmetric half. Its `sans`
  //    case puts the atom in a segment the reconstruction never reaches: after a `;`, the
  //    gluing starts from the NEXT segment, so an atom placed before it cannot leak in.
  {
    id: 'tool_input/command-raw/reachable-without-the-derived-facts', capacity: 'tool_input', reached: true,
    with: () => decideFile({ pattern: ATOM, keys: { match: DERIVED_NAMES.map((n) => '-' + n) } },
      { toolName: 'X', toolInput: { command: 'grep ' + ATOM + ' f.txt' } }),
    sans: () => decideFile({ pattern: ATOM, keys: { match: DERIVED_NAMES.map((n) => '-' + n) } },
      { toolName: 'X', toolInput: { command: 'grep rien f.txt' } }),
  },

  ...DEFAULT_PROFILE.contentKeys.map((cle) => ({
    id: `tool_input/payload-key-by-default:${cle}`, capacity: 'tool_input', reached: false,
    justification: '㊿ — a PAYLOAD key TRANSPORTS content, it DESIGNATES nothing. Reading it made the filters decide on the text one TYPES: 55 exclusions measured came from there. It is out of the DEFAULT universe, never out of REACH — the paired cell below proves an entry re-opens it with `keys`.',
    with: () => decideFile({ pattern: 'base', scope: [ATOM] }, { toolName: 'X', toolInput: { file_path: '/base', [cle]: ATOM } }),
    sans: () => decideFile({ pattern: 'base', scope: [ATOM] }, { toolName: 'X', toolInput: { file_path: '/base', [cle]: 'rien' } }),
  })),
  ...DEFAULT_PROFILE.contentKeys.map((cle) => ({
    id: `tool_input/payload-key-via-keys:${cle}`, capacity: 'tool_input', reached: true,
    with: () => decideFile({ pattern: 'base', scope: [ATOM], keys: { scope: [cle] } }, { toolName: 'X', toolInput: { file_path: '/base', [cle]: ATOM } }),
    sans: () => decideFile({ pattern: 'base', scope: [ATOM], keys: { scope: [cle] } }, { toolName: 'X', toolInput: { file_path: '/base', [cle]: 'rien' } }),
  })),

  // ── cwd ────────────────────────────────────────────────────────────────
  {
    id: 'cwd/positive', capacity: 'cwd', reached: true,
    with: () => decideSkill({ match: [ATOM] }, { toolName: 'Bash', cwd: '/w/' + ATOM, toolInput: { command: 'npm test' } }),
    sans: () => decideSkill({ match: [ATOM] }, { toolName: 'Bash', cwd: '/w/rien', toolInput: { command: 'npm test' } }),
  },
  {
    id: 'cwd/negative', capacity: 'cwd', reached: true,
    with: () => !decideSkill({ match: ['npm'], exclude: [ATOM] }, { toolName: 'Bash', cwd: '/w/' + ATOM, toolInput: { command: 'npm test' } }),
    sans: () => !decideSkill({ match: ['npm'], exclude: [ATOM] }, { toolName: 'Bash', cwd: '/w/rien', toolInput: { command: 'npm test' } }),
  },

  // ── THE IDENTITY FIELDS — blind BY DECISION, and the reason is load-bearing ──
  {
    id: 'session_id/unreachable', capacity: 'session_id', reached: false,
    justification: 'NOT a fact about the GESTURE: it identifies the conversation. Injecting on it would be injecting on IDENTITY, not on an act — the load-bearing wall says we only inject on FACTS. It is consumed as the state SCOPE (`lib.scopeId`), which is a different job.',
    with: () => decideFile({ pattern: ATOM }, { toolName: 'X', toolInput: {}, session_id: ATOM }),
    sans: () => decideFile({ pattern: ATOM }, { toolName: 'X', toolInput: {}, session_id: 'rien' }),
  },
  {
    id: 'agent_id/unreachable', capacity: 'agent_id', reached: false,
    justification: 'same as session_id: it discriminates master vs sub-agent for the injection STATE, never for the decision. A doc conditioned on "which agent" would be a rule about WHO, not about WHAT is being done.',
    with: () => decideFile({ pattern: ATOM }, { toolName: 'X', toolInput: {}, agent_id: ATOM }),
    sans: () => decideFile({ pattern: ATOM }, { toolName: 'X', toolInput: {}, agent_id: 'rien' }),
  },
  {
    id: 'transcript_path/unreachable', capacity: 'transcript_path', reached: false,
    justification: 'consumed ONLY by the canary (is the channel alive?). It says nothing about the gesture in progress; matching on it would make an injection depend on where a log file happens to live.',
    with: () => decideFile({ pattern: ATOM }, { toolName: 'X', toolInput: {}, transcript_path: '/t/' + ATOM }),
    sans: () => decideFile({ pattern: ATOM }, { toolName: 'X', toolInput: {}, transcript_path: '/t/rien' }),
  },
];

// ── ⓪ EVERY CAPABILITY OF THE CONTRACT HAS AT LEAST ONE CELL ─────────────
test('⓪ every capability of the harness CONTRACT is covered by a cell (derived)', () => {
  const capabilities = contractCapabilities();
  // ANTI-DORMANCY: an empty contract would make the check pass while proving nothing.
  assert.ok(capabilities.length >= 5, `suspicious contract: only ${capabilities.length} capabilities`);
  const covered = new Set(CELLS().map((c) => c.capacity));
  const orphans = capabilities.filter((c) => !covered.has(c));
  assert.deepStrictEqual(
    orphans, [],
    `capability(ies) of the contract that NO cell probes: ${orphans.join(', ')} — the language may be blind to a fact the harness hands it, and nobody would know. Add a cell, reachable or declared blind WITH ITS REASON.`,
  );
  // INVERSE: a cell naming a capability the contract no longer has = a stale table.
  const stale = [...covered].filter((c) => !capabilities.includes(c));
  assert.deepStrictEqual(stale, [], `cell(s) probing a capability absent from the contract: ${stale.join(', ')}`);
});

// ── ① EACH CELL SAYS THE TRUTH, MEASURED ─────────────────────────────────
test('① each cell is REACHABLE as declared — or blind WITH a written reason', () => {
  const lying = [];
  for (const c of CELLS()) {
    const reallyReached = c.with() !== c.sans();
    if (reallyReached !== c.reached) {
      lying.push(`${c.id}: declared ${c.reached ? 'reachable' : 'blind'}, measured ${reallyReached ? 'reachable' : 'blind'}`);
    }
    if (!c.reached) {
      assert.ok(
        typeof c.justification === 'string' && c.justification.length > 60,
        `${c.id}: a BLIND cell without a written reason is a NAMED hole. "The engine does not do it" is not a reason — say why it MUST NOT.`,
      );
    }
  }
  assert.deepStrictEqual(
    lying, [],
    `the table says the opposite of the engine: ${lying.join(' | ')} — if a reach was GAINED, promote the cell (and check it is intended: a trigger that widens is the costliest class of noise); if one was LOST, that is a regression.`,
  );
});

// ── ② ANTI-VACUITY: the table really observes something ──────────────────
test('② the table observes BOTH classes, in plausible numbers', () => {
  const cells = CELLS();
  const reachedAtoms = cells.filter((c) => c.reached).length;
  const blind = cells.length - reachedAtoms;
  // A table where everything came out the same way (broken probes, dead imports)
  // would be GREEN while measuring nothing — the defect already paid 3 times here.
  assert.ok(reachedAtoms >= 12, `suspicious: only ${reachedAtoms} reachable cells`);
  assert.ok(blind >= 4, `suspicious: only ${blind} blind cells`);
  const ids = cells.map((c) => c.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'duplicated cell ids');
});

// ── ③ NEGATIVE-CHECK: the table can really turn red ──────────────────────
test('③ NEGATIVE-CHECK: a lost reach would be DETECTED', () => {
  // IN-MEMORY sabotage, never a real file. We replay the `cwd` cell against an
  // engine that ignores it — the exact state of the world before 2026-08-19 —
  // and require the measurement to come out BLIND where the table says reachable.
  const sansCwd = (entry, payload) => skillSrc.matchingSkills(
    { skills: { s: entry } }, { ...payload, cwd: undefined },
  ).length > 0;
  const withCwd = sansCwd({ match: [ATOM] }, { toolName: 'Bash', cwd: '/w/' + ATOM, toolInput: { command: 'npm test' } });
  const sans = sansCwd({ match: [ATOM] }, { toolName: 'Bash', cwd: '/w/rien', toolInput: { command: 'npm test' } });
  assert.strictEqual(withCwd, sans, 'the sabotaged engine is indeed BLIND to cwd — so the table WOULD have caught the loss');
});
