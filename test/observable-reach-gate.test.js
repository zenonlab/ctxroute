// ═══════════════════════════════════════════════════════════════════════
// OBSERVABLE REACH — CAN THE LANGUAGE SEE EVERY FACT THE HARNESS HANDS IT?
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 WHY THIS FILE EXISTS (2026-08-19), and it is the most important line here:
//    **THE EIGHT DEFECTS THIS PROJECT HAS EVER HAD ARE THE SAME DEFECT.**
//      ㊵    `scope` read one level      → nested params INVISIBLE
//      51    same on the trigger          → a path in `args{}` INVISIBLE
//      ㊴    `servers` dimension          → whole dimension UNOBSERVABLE by the filters
//      ㊽    shell recognised by NAME     → 809 commands INVISIBLE (18 %)
//      ㊿    payload keys                 → universe narrowed GLOBALLY, not per entry
//      53bis universe was a concatenation → a text visible that exists in NO param
//      keys  key universe was a constant  → not declarable per entry
//      cwd   pushed as a special case     → outside EVERY key universe
//    Eight out of eight are holes in **WHAT THE LANGUAGE CAN SEE**. Not one is a
//    hole in how it COMBINES what it sees.
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

const ATOME = 'atome-temoin';
const decideFile = (rule, geste) => fileSrc.matchingDocs([{ ...rule, doc: 'd.md' }], geste).length > 0;
const decideTool = (fm, geste) => toolSrc.matchingDocs([{ doc: 'd.md', fm }], geste).length > 0;
const decideSkill = (entry, payload) => skillSrc.matchingSkills({ skills: { s: entry } }, payload).length > 0;

// ── THE CONTRACT, AS DATA (derived, never copied) ────────────────────────
// An empty payload makes `conformance` list EVERY capability it knows: the
// required ones (all absent) and the optional ones (all degraded).
function capacitesDuContrat() {
  const c = conformance({});
  return [...c.requis.map((r) => r.capability), ...c.degradations.map((d) => d.capability)];
}

// ── THE CELLS ────────────────────────────────────────────────────────────
// `avec` carries the fact, `sans` is the SAME gesture without it. Reachable ⟺ the
// two verdicts differ. Every cell names the capability of the contract it covers,
// so the derivation below can check that none is left uncovered.
const CELLULES = () => [
  // ── tool_name ──────────────────────────────────────────────────────────
  {
    id: 'tool_name/positive/exact', capacite: 'tool_name', atteint: true,
    avec: () => decideTool({ tool: ['mcp__ssh__ssh_exec'] }, { toolName: 'mcp__ssh__ssh_exec', toolInput: {} }),
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
    id: 'tool_name/positive/substring', atteint: false, capacite: 'tool_name',
    justification: 'the `tool` trigger is EXACT by decision (a substring would match `WebFetch` inside a path); `scope` reads the PARAMS, never the tool name — so a FAMILY of tools ("everything containing `delete`") can only be enumerated, and an enumeration is born stale (㊽). Blind cell OPEN, tracked in REFACTOR-PLAN 59.',
    avec: () => decideTool({ tool: ['*'], scope: ['ssh'] }, { toolName: 'mcp__ssh__ssh_exec', toolInput: {} }),
    sans: () => decideTool({ tool: ['*'], scope: ['ssh'] }, { toolName: 'mcp__autre__x', toolInput: {} }),
  },
  {
    id: 'tool_name/negative', capacite: 'tool_name', atteint: true,
    avec: () => !decideTool({ tool: ['*'], exclude: ['ssh'] }, { toolName: 'mcp__ssh__ssh_exec', toolInput: { p: ATOME } }),
    sans: () => !decideTool({ tool: ['*'], exclude: ['ssh'] }, { toolName: 'mcp__autre__x', toolInput: { p: ATOME } }),
  },

  // ── tool_input — the STRUCTURAL positions, where ㊵/51/㊿/53bis all lived ──
  {
    id: 'tool_input/positive/first-level', capacite: 'tool_input', atteint: true,
    avec: () => decideFile({ pattern: 'base', scope: [ATOME] }, { toolName: 'X', toolInput: { file_path: '/base', autre: ATOME } }),
    sans: () => decideFile({ pattern: 'base', scope: [ATOME] }, { toolName: 'X', toolInput: { file_path: '/base', autre: 'rien' } }),
  },
  {
    id: 'tool_input/positive/nested', capacite: 'tool_input', atteint: true, // ㊵
    avec: () => decideFile({ pattern: 'base', scope: [ATOME] }, { toolName: 'X', toolInput: { file_path: '/base', args: { n: { d: ATOME } } } }),
    sans: () => decideFile({ pattern: 'base', scope: [ATOME] }, { toolName: 'X', toolInput: { file_path: '/base', args: { n: { d: 'rien' } } } }),
  },
  {
    id: 'tool_input/positive/array-element', capacite: 'tool_input', atteint: true, // 51
    avec: () => decideFile({ pattern: ATOME }, { toolName: 'X', toolInput: { path: ['/x/' + ATOME] } }),
    sans: () => decideFile({ pattern: ATOME }, { toolName: 'X', toolInput: { path: ['/x/rien'] } }),
  },
  {
    id: 'tool_input/positive/shell-command', capacite: 'tool_input', atteint: true, // ㊽
    avec: () => decideFile({ pattern: ATOME }, { toolName: 'PowerShell', toolInput: { command: 'echo ' + ATOME } }),
    sans: () => decideFile({ pattern: ATOME }, { toolName: 'PowerShell', toolInput: { command: 'echo rien' } }),
  },
  {
    id: 'tool_input/positive/payload-key-via-keys', capacite: 'tool_input', atteint: true, // ㊿ + keys
    // Out of the DEFAULT universe, but reachable by an entry that NAMES it — that
    // is exactly what `keys` bought, and why the default is not a floor.
    avec: () => decideFile({ pattern: 'base', scope: [ATOME], keys: { scope: ['content'] } }, { toolName: 'X', toolInput: { file_path: '/base', content: ATOME } }),
    sans: () => decideFile({ pattern: 'base', scope: [ATOME], keys: { scope: ['content'] } }, { toolName: 'X', toolInput: { file_path: '/base', content: 'rien' } }),
  },
  {
    id: 'tool_input/negative', capacite: 'tool_input', atteint: true,
    avec: () => !decideFile({ pattern: 'base', exclude: [ATOME] }, { toolName: 'X', toolInput: { file_path: '/base', autre: ATOME } }),
    sans: () => !decideFile({ pattern: 'base', exclude: [ATOME] }, { toolName: 'X', toolInput: { file_path: '/base', autre: 'rien' } }),
  },

  // ── cwd ────────────────────────────────────────────────────────────────
  {
    id: 'cwd/positive', capacite: 'cwd', atteint: true,
    avec: () => decideSkill({ match: [ATOME] }, { toolName: 'Bash', cwd: '/w/' + ATOME, toolInput: { command: 'npm test' } }),
    sans: () => decideSkill({ match: [ATOME] }, { toolName: 'Bash', cwd: '/w/rien', toolInput: { command: 'npm test' } }),
  },
  {
    id: 'cwd/negative', capacite: 'cwd', atteint: true,
    avec: () => !decideSkill({ match: ['npm'], exclude: [ATOME] }, { toolName: 'Bash', cwd: '/w/' + ATOME, toolInput: { command: 'npm test' } }),
    sans: () => !decideSkill({ match: ['npm'], exclude: [ATOME] }, { toolName: 'Bash', cwd: '/w/rien', toolInput: { command: 'npm test' } }),
  },

  // ── THE IDENTITY FIELDS — blind BY DECISION, and the reason is load-bearing ──
  {
    id: 'session_id/unreachable', capacite: 'session_id', atteint: false,
    justification: 'NOT a fact about the GESTURE: it identifies the conversation. Injecting on it would be injecting on IDENTITY, not on an act — the load-bearing wall says we only inject on FACTS. It is consumed as the state SCOPE (`lib.scopeId`), which is a different job.',
    avec: () => decideFile({ pattern: ATOME }, { toolName: 'X', toolInput: {}, session_id: ATOME }),
    sans: () => decideFile({ pattern: ATOME }, { toolName: 'X', toolInput: {}, session_id: 'rien' }),
  },
  {
    id: 'agent_id/unreachable', capacite: 'agent_id', atteint: false,
    justification: 'same as session_id: it discriminates master vs sub-agent for the injection STATE, never for the decision. A doc conditioned on "which agent" would be a rule about WHO, not about WHAT is being done.',
    avec: () => decideFile({ pattern: ATOME }, { toolName: 'X', toolInput: {}, agent_id: ATOME }),
    sans: () => decideFile({ pattern: ATOME }, { toolName: 'X', toolInput: {}, agent_id: 'rien' }),
  },
  {
    id: 'transcript_path/unreachable', capacite: 'transcript_path', atteint: false,
    justification: 'consumed ONLY by the canary (is the channel alive?). It says nothing about the gesture in progress; matching on it would make an injection depend on where a log file happens to live.',
    avec: () => decideFile({ pattern: ATOME }, { toolName: 'X', toolInput: {}, transcript_path: '/t/' + ATOME }),
    sans: () => decideFile({ pattern: ATOME }, { toolName: 'X', toolInput: {}, transcript_path: '/t/rien' }),
  },
];

// ── ⓪ EVERY CAPABILITY OF THE CONTRACT HAS AT LEAST ONE CELL ─────────────
test('⓪ every capability of the harness CONTRACT is covered by a cell (derived)', () => {
  const capacites = capacitesDuContrat();
  // ANTI-DORMANCY: an empty contract would make the check pass while proving nothing.
  assert.ok(capacites.length >= 5, `suspicious contract: only ${capacites.length} capabilities`);
  const couvertes = new Set(CELLULES().map((c) => c.capacite));
  const orphelines = capacites.filter((c) => !couvertes.has(c));
  assert.deepStrictEqual(
    orphelines, [],
    `capability(ies) of the contract that NO cell probes: ${orphelines.join(', ')} — the language may be blind to a fact the harness hands it, and nobody would know. Add a cell, reachable or declared blind WITH ITS REASON.`,
  );
  // INVERSE: a cell naming a capability the contract no longer has = a stale table.
  const perimees = [...couvertes].filter((c) => !capacites.includes(c));
  assert.deepStrictEqual(perimees, [], `cell(s) probing a capability absent from the contract: ${perimees.join(', ')}`);
});

// ── ① EACH CELL SAYS THE TRUTH, MEASURED ─────────────────────────────────
test('① each cell is REACHABLE as declared — or blind WITH a written reason', () => {
  const menteuses = [];
  for (const c of CELLULES()) {
    const atteintReellement = c.avec() !== c.sans();
    if (atteintReellement !== c.atteint) {
      menteuses.push(`${c.id}: declared ${c.atteint ? 'reachable' : 'blind'}, measured ${atteintReellement ? 'reachable' : 'blind'}`);
    }
    if (!c.atteint) {
      assert.ok(
        typeof c.justification === 'string' && c.justification.length > 60,
        `${c.id}: a BLIND cell without a written reason is a NAMED hole. "The engine does not do it" is not a reason — say why it MUST NOT.`,
      );
    }
  }
  assert.deepStrictEqual(
    menteuses, [],
    `the table says the opposite of the engine: ${menteuses.join(' | ')} — if a reach was GAINED, promote the cell (and check it is intended: a trigger that widens is the costliest class of noise); if one was LOST, that is a regression.`,
  );
});

// ── ② ANTI-VACUITY: the table really observes something ──────────────────
test('② the table observes BOTH classes, in plausible numbers', () => {
  const cells = CELLULES();
  const atteints = cells.filter((c) => c.atteint).length;
  const aveugles = cells.length - atteints;
  // A table where everything came out the same way (broken probes, dead imports)
  // would be GREEN while measuring nothing — the defect already paid 3 times here.
  assert.ok(atteints >= 8, `suspicious: only ${atteints} reachable cells`);
  assert.ok(aveugles >= 3, `suspicious: only ${aveugles} blind cells`);
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
  const avec = sansCwd({ match: [ATOME] }, { toolName: 'Bash', cwd: '/w/' + ATOME, toolInput: { command: 'npm test' } });
  const sans = sansCwd({ match: [ATOME] }, { toolName: 'Bash', cwd: '/w/rien', toolInput: { command: 'npm test' } });
  assert.strictEqual(avec, sans, 'the sabotaged engine is indeed BLIND to cwd — so the table WOULD have caught the loss');
});
