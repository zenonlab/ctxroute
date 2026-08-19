// ═══════════════════════════════════════════════════════════════════════
// language-atoms.test.js — THE TABLE OF ATOMS (㊻④, 15/08/2026)
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 WHY: ㊴ and ㊵ were EMPTY CELLS of this table — a dimension
//    that had not received what its sibling had (scope/exclude ignored on
//    `servers`), a projection an operator did not see (nested params).
//    Each found AFTER THE FACT, one session each. This file enumerates the
//    cells (source × gesture projection × operator) and PROBES the REAL engine:
//    each cell is either VISIBLE, or BLIND **with its written justification**.
//    A blind cell without a justification = a NAMED hole = RED.
//
// 📐 PROBED BY BEHAVIOUR, never by reading: a cell is "visible" if the
//    engine's DECISION changes between a gesture that carries the atom and the same gesture
//    without the atom. We do not read the code, we measure it — that is what makes the
//    table unable to lie (a hand-declared table would be a doc,
//    and a doc drifts).
//
// 🛑 IF THIS TEST TURNS RED: either the engine has GAINED a view (set the cell to
//    visible: true — and check that it is intended, a trigger that widens
//    is the most expensive class of noise); or it has LOST one (a semantics
//    regression — that is exactly ㊵). In both cases, DECIDE and write it down.
// 🛑 NEVER "justify" a cell to silence a red: a
//    justification describes a DECISION taken (with its date/number), never
//    an observed state. "The engine does not do it" is not a justification.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import * as fileSrc from '../src/sources/file.js';
import * as toolSrc from '../src/sources/tool.js';
import * as mcpSrc from '../src/sources/mcp.js';
import * as skillSrc from '../src/sources/skill.js';

const decideFile = (rule, geste) => fileSrc.matchingDocs([{ ...rule, doc: 'd.md' }], geste).length > 0;
const decideTool = (fm, geste) => toolSrc.matchingDocs([{ doc: 'd.md', fm }], geste).length > 0;
const docsMcp = (config, geste) => mcpSrc.matchingDocs(config, geste).map((c) => c.doc);
const decideSkill = (entry, payload, config) =>
  skillSrc.matchingSkills({ ...(config || {}), skills: { s: entry } }, payload).length > 0;

// Each cell: `withIt` carries the atom, `withoutIt` is the SAME gesture without it.
// visible ⟺ withIt() !== withoutIt(). The blind cells carry their WHY.
const CASES = [
  // ── SOURCE file × TRIGGER (match) ─────────────────────────────────────
  { id: 'file/match/first-level-path', visible: true,
    withIt: () => decideFile({ pattern: 'aaa' }, { toolName: 'Read', toolInput: { file_path: '/x/aaa' } }),
    withoutIt: () => decideFile({ pattern: 'aaa' }, { toolName: 'Read', toolInput: { file_path: '/x/zzz' } }) },
  { id: 'file/match/nested-path', visible: true, // 51 — a profile key at any depth
    withIt: () => decideFile({ pattern: 'aaa' }, { toolName: 'X', toolInput: { op: { file_path: '/x/aaa' } } }),
    withoutIt: () => decideFile({ pattern: 'aaa' }, { toolName: 'X', toolInput: { op: { file_path: '/x/zzz' } } }) },
  { id: 'file/match/array-path', visible: true, // 51 — an element inherits the name of its key
    withIt: () => decideFile({ pattern: 'aaa' }, { toolName: 'X', toolInput: { path: ['/x/aaa'] } }),
    withoutIt: () => decideFile({ pattern: 'aaa' }, { toolName: 'X', toolInput: { path: ['/x/zzz'] } }) },
  { id: 'file/match/command', visible: true, // ㊽ — the shell is recognised by its FORM
    withIt: () => decideFile({ pattern: 'aaa' }, { toolName: 'PowerShell', toolInput: { command: 'aaa --go' } }),
    withoutIt: () => decideFile({ pattern: 'aaa' }, { toolName: 'PowerShell', toolInput: { command: 'zzz --go' } }) },
  { id: 'file/match/cd-pseudo-path', visible: true, // an INTENDED capability (matching without an absolute path)
    withIt: () => decideFile({ pattern: 'aaa/node' }, { toolName: 'Bash', toolInput: { command: 'cd aaa && node x.js' } }),
    withoutIt: () => decideFile({ pattern: 'aaa/node' }, { toolName: 'Bash', toolInput: { command: 'cd bbb && node x.js' } }) },
  { id: 'file/match/cwd-param', visible: true, // `cwd` is a path key of the profile (a tool param, e.g. ssh_exec)
    withIt: () => decideFile({ pattern: 'aaa' }, { toolName: 'X', toolInput: { cwd: '/w/aaa' } }),
    withoutIt: () => decideFile({ pattern: 'aaa' }, { toolName: 'X', toolInput: { cwd: '/w/zzz' } }) },
  { id: 'file/match/any-param', visible: false,
    justification: 'a trigger designates a PLACE — widened to the params, the word "test" in a message would bring in the tests doc (refusal sealed, 51: "do NOT widen match to every param")',
    withIt: () => decideFile({ pattern: 'aaa' }, { toolName: 'X', toolInput: { other: 'aaa' } }),
    withoutIt: () => decideFile({ pattern: 'aaa' }, { toolName: 'X', toolInput: { other: 'zzz' } }) },
  { id: 'file/match/payload', visible: false,
    justification: '㊿ — a PAYLOAD param transports content, it designates nothing; matching on it would inject the doc of a file quoted in a comment',
    withIt: () => decideFile({ pattern: 'aaa' }, { toolName: 'X', toolInput: { content: 'aaa' } }),
    withoutIt: () => decideFile({ pattern: 'aaa' }, { toolName: 'X', toolInput: { content: 'zzz' } }) },
  { id: 'file/match/tool-name', visible: false,
    justification: 'DISJOINT semantics: the tool name is the `tool` axis (EXACT name) — a substring would match WebFetch inside a path',
    withIt: () => decideFile({ pattern: 'aaa' }, { toolName: 'aaa', toolInput: {} }),
    withoutIt: () => decideFile({ pattern: 'aaa' }, { toolName: 'zzz', toolInput: {} }) },

  // ── SOURCE file × SCOPE ───────────────────────────────────────────────
  { id: 'file/scope/first-level-param', visible: true,
    withIt: () => decideFile({ pattern: 'base', scope: ['aaa'] }, { toolName: 'X', toolInput: { file_path: '/x/base', other: 'aaa' } }),
    withoutIt: () => decideFile({ pattern: 'base', scope: ['aaa'] }, { toolName: 'X', toolInput: { file_path: '/x/base', other: 'zzz' } }) },
  { id: 'file/scope/nested-param', visible: true, // ㊵
    withIt: () => decideFile({ pattern: 'base', scope: ['aaa'] }, { toolName: 'X', toolInput: { file_path: '/x/base', args: { n: { d: 'aaa' } } } }),
    withoutIt: () => decideFile({ pattern: 'base', scope: ['aaa'] }, { toolName: 'X', toolInput: { file_path: '/x/base', args: { n: { d: 'zzz' } } } }) },
  { id: 'file/scope/array-param', visible: true,
    withIt: () => decideFile({ pattern: 'base', scope: ['aaa'] }, { toolName: 'X', toolInput: { file_path: '/x/base', list: ['aaa'] } }),
    withoutIt: () => decideFile({ pattern: 'base', scope: ['aaa'] }, { toolName: 'X', toolInput: { file_path: '/x/base', list: ['zzz'] } }) },
  { id: 'file/scope/command', visible: true,
    withIt: () => decideFile({ pattern: 'base', scope: ['aaa'] }, { toolName: 'Bash', toolInput: { command: 'base aaa' } }),
    withoutIt: () => decideFile({ pattern: 'base', scope: ['aaa'] }, { toolName: 'Bash', toolInput: { command: 'base zzz' } }) },
  { id: 'file/scope/payload', visible: false,
    justification: '㊿ — removed from BOTH filters (the ㊼ duality): deciding on the text one TYPES made 55 docs disappear silently',
    withIt: () => decideFile({ pattern: 'base', scope: ['aaa'] }, { toolName: 'X', toolInput: { file_path: '/x/base', old_string: 'aaa' } }),
    withoutIt: () => decideFile({ pattern: 'base', scope: ['aaa'] }, { toolName: 'X', toolInput: { file_path: '/x/base', old_string: 'zzz' } }) },
  { id: 'file/scope/tool-name', visible: false,
    justification: 'scope reads the PARAMS; targeting a tool = the `tool` axis (the "gesture, not place" recipe: tool + scope)',
    withIt: () => decideFile({ pattern: 'base', scope: ['aaa'] }, { toolName: 'aaa', toolInput: { file_path: '/x/base' } }),
    withoutIt: () => decideFile({ pattern: 'base', scope: ['aaa'] }, { toolName: 'zzz', toolInput: { file_path: '/x/base' } }) },

  // ── SOURCE file × EXCLUDE ─────────────────────────────────────────────
  { id: 'file/exclude/first-level-param', visible: true,
    withIt: () => !decideFile({ pattern: 'base', exclude: ['aaa'] }, { toolName: 'X', toolInput: { file_path: '/x/base', other: 'aaa' } }),
    withoutIt: () => !decideFile({ pattern: 'base', exclude: ['aaa'] }, { toolName: 'X', toolInput: { file_path: '/x/base', other: 'zzz' } }) },
  { id: 'file/exclude/nested-param', visible: true,
    withIt: () => !decideFile({ pattern: 'base', exclude: ['aaa'] }, { toolName: 'X', toolInput: { file_path: '/x/base', args: { n: 'aaa' } } }),
    withoutIt: () => !decideFile({ pattern: 'base', exclude: ['aaa'] }, { toolName: 'X', toolInput: { file_path: '/x/base', args: { n: 'zzz' } } }) },
  { id: 'file/exclude/command', visible: true, // ㊼ — the whole universe, never candidate by candidate
    withIt: () => !decideFile({ pattern: 'base', exclude: ['aaa'] }, { toolName: 'Bash', toolInput: { command: 'cd base && node aaa' } }),
    withoutIt: () => !decideFile({ pattern: 'base', exclude: ['aaa'] }, { toolName: 'Bash', toolInput: { command: 'cd base && node zzz' } }) },
  { id: 'file/exclude/candidate-context', visible: true, // the path that bit is part of the universe
    withIt: () => !decideFile({ pattern: 'base', exclude: ['x/base'] }, { toolName: 'X', toolInput: { file_path: '/x/base' } }),
    withoutIt: () => !decideFile({ pattern: 'base', exclude: ['x/base'] }, { toolName: 'X', toolInput: { file_path: '/y/base' } }) },
  { id: 'file/exclude/payload', visible: false,
    justification: '㊿ — the dual of file/scope/payload, removed from both filters together (never from just one)',
    withIt: () => !decideFile({ pattern: 'base', exclude: ['aaa'] }, { toolName: 'X', toolInput: { file_path: '/x/base', new_string: 'aaa' } }),
    withoutIt: () => !decideFile({ pattern: 'base', exclude: ['aaa'] }, { toolName: 'X', toolInput: { file_path: '/x/base', new_string: 'zzz' } }) },
  { id: 'file/exclude/tool-name', visible: false,
    justification: 'on the file axis the context = the PATHS that bit; excluding by tool = the `tool` axis (`*` + exclude)',
    withIt: () => !decideFile({ pattern: 'base', exclude: ['aaa'] }, { toolName: 'aaa', toolInput: { file_path: '/x/base' } }),
    withoutIt: () => !decideFile({ pattern: 'base', exclude: ['aaa'] }, { toolName: 'zzz', toolInput: { file_path: '/x/base' } }) },

  // ── SOURCE tool ───────────────────────────────────────────────────────
  { id: 'tool/trigger/tool-name', visible: true,
    withIt: () => decideTool({ tool: ['aaa'] }, { toolName: 'aaa', toolInput: {} }),
    withoutIt: () => decideTool({ tool: ['aaa'] }, { toolName: 'zzz', toolInput: {} }) },
  { id: 'tool/trigger/param', visible: false,
    justification: 'tool = the EXACT name (===), never a content — a substring/param would match a path that quotes the tool',
    withIt: () => decideTool({ tool: ['aaa'] }, { toolName: 'zzz', toolInput: { p: 'aaa' } }),
    withoutIt: () => decideTool({ tool: ['aaa'] }, { toolName: 'zzz', toolInput: { p: 'bbb' } }) },
  { id: 'tool/scope/nested-param', visible: true,
    withIt: () => decideTool({ tool: ['aaa'], scope: ['bbb'] }, { toolName: 'aaa', toolInput: { args: { d: 'bbb' } } }),
    withoutIt: () => decideTool({ tool: ['aaa'], scope: ['bbb'] }, { toolName: 'aaa', toolInput: { args: { d: 'zzz' } } }) },
  { id: 'tool/exclude/tool-name', visible: true, // context = the name — this is "all EXCEPT X"
    withIt: () => !decideTool({ tool: ['*'], scope: ['ok'], exclude: ['aaa'] }, { toolName: 'aaa', toolInput: { p: 'ok' } }),
    withoutIt: () => !decideTool({ tool: ['*'], scope: ['ok'], exclude: ['aaa'] }, { toolName: 'zzz', toolInput: { p: 'ok' } }) },
  { id: 'tool/exclude/param', visible: true,
    withIt: () => !decideTool({ tool: ['aaa'], exclude: ['bbb'] }, { toolName: 'aaa', toolInput: { p: 'bbb' } }),
    withoutIt: () => !decideTool({ tool: ['aaa'], exclude: ['bbb'] }, { toolName: 'aaa', toolInput: { p: 'zzz' } }) },

  // ── SOURCE mcp (the PATH is the trigger) ──────────────────────────────
  { id: 'mcp/trigger/server', visible: true,
    withIt: () => docsMcp({}, { toolName: 'mcp__srv__x', toolInput: {} }).includes('mcp/srv.md'),
    withoutIt: () => docsMcp({}, { toolName: 'mcp__autre__x', toolInput: {} }).includes('mcp/srv.md') },
  { id: 'mcp/trigger/tool-suffix', visible: true,
    withIt: () => docsMcp({}, { toolName: 'mcp__srv__x', toolInput: {} }).includes('mcp/srv/x.md'),
    withoutIt: () => docsMcp({}, { toolName: 'mcp__srv__y', toolInput: {} }).includes('mcp/srv/x.md') },
  { id: 'mcp/trigger/declared-sub-tool', visible: true,
    withIt: () => docsMcp({ servers: { srv: { subToolParam: 'args.tool' } } }, { toolName: 'mcp__srv__x', toolInput: { args: { tool: 'sub' } } }).includes('mcp/srv/sub.md'),
    withoutIt: () => docsMcp({ servers: { srv: { subToolParam: 'args.tool' } } }, { toolName: 'mcp__srv__x', toolInput: { args: { tool: 'other' } } }).includes('mcp/srv/sub.md') },
  { id: 'mcp/trigger/undeclared-sub-tool', visible: false,
    justification: 'without `subToolParam`, no granularity 3 — zero false positive by construction (decision 17/07/2026)',
    withIt: () => docsMcp({}, { toolName: 'mcp__srv__x', toolInput: { args: { tool: 'sub' } } }).includes('mcp/srv/sub.md'),
    withoutIt: () => docsMcp({}, { toolName: 'mcp__srv__x', toolInput: { args: { tool: 'other' } } }).includes('mcp/srv/sub.md') },
  { id: 'mcp/scope-exclude/absent', visible: false,
    justification: 'an MCP doc has NO operators (the path is the trigger) — the capability is expressible WITHOUT a hole through the `tool` axis: `tool: ["mcp__srv__x"]` + scope/exclude on the params (sub-tool included, the sub-tool IS a param). Convenience vs completeness: the two channels coexist, completeness lives in `tool`.',
    withIt: () => docsMcp({}, { toolName: 'mcp__srv__x', toolInput: { p: 'aaa' } }).includes('mcp/srv.md'),
    withoutIt: () => docsMcp({}, { toolName: 'mcp__srv__x', toolInput: { p: 'zzz' } }).includes('mcp/srv.md') },

  // ── SOURCE skill (union of 3 dimensions) ──────────────────────────────
  { id: 'skill/match/path', visible: true,
    withIt: () => decideSkill({ match: ['aaa'] }, { toolName: 'Read', toolInput: { file_path: '/x/aaa' } }),
    withoutIt: () => decideSkill({ match: ['aaa'] }, { toolName: 'Read', toolInput: { file_path: '/x/zzz' } }) },
  { id: 'skill/match/harness-cwd', visible: true, // specific to skills — "npm test launched INSIDE the project"
    withIt: () => decideSkill({ match: ['aaa'] }, { toolName: 'Bash', toolInput: { command: 'npm test' }, cwd: '/w/aaa' }),
    withoutIt: () => decideSkill({ match: ['aaa'] }, { toolName: 'Bash', toolInput: { command: 'npm test' }, cwd: '/w/zzz' }) },
  { id: 'skill/servers/server', visible: true,
    withIt: () => decideSkill({ servers: ['srv'] }, { toolName: 'mcp__srv__x', toolInput: {} }),
    withoutIt: () => decideSkill({ servers: ['srv'] }, { toolName: 'mcp__autre__x', toolInput: {} }) },
  { id: 'skill/servers/sub-tool', visible: true,
    withIt: () => decideSkill({ servers: ['srv/sub'] }, { toolName: 'mcp__srv__x', toolInput: { args: { tool: 'sub' } } }, { servers: { srv: { subToolParam: 'args.tool' } } }),
    withoutIt: () => decideSkill({ servers: ['srv/sub'] }, { toolName: 'mcp__srv__x', toolInput: { args: { tool: 'other' } } }, { servers: { srv: { subToolParam: 'args.tool' } } }) },
  { id: 'skill/tool/tool-name', visible: true,
    withIt: () => decideSkill({ tool: ['aaa'], scope: ['ok'] }, { toolName: 'aaa', toolInput: { p: 'ok' } }),
    withoutIt: () => decideSkill({ tool: ['aaa'], scope: ['ok'] }, { toolName: 'zzz', toolInput: { p: 'ok' } }) },
  { id: 'skill/exclude/on-servers-dimension', visible: true, // ㊴ — THE cell that was empty
    withIt: () => !decideSkill({ servers: ['srv'], exclude: ['aaa'] }, { toolName: 'mcp__srv__x', toolInput: { p: 'aaa' } }),
    withoutIt: () => !decideSkill({ servers: ['srv'], exclude: ['aaa'] }, { toolName: 'mcp__srv__x', toolInput: { p: 'zzz' } }) },
  { id: 'skill/scope/on-tool-dimension', visible: true,
    withIt: () => decideSkill({ tool: ['aaa'], scope: ['bbb'] }, { toolName: 'aaa', toolInput: { args: { d: 'bbb' } } }),
    withoutIt: () => decideSkill({ tool: ['aaa'], scope: ['bbb'] }, { toolName: 'aaa', toolInput: { args: { d: 'zzz' } } }) },
  { id: 'skill/scope/payload', visible: false,
    justification: '㊿ — the same filter universe as the docs (a single filter function, never two)',
    withIt: () => decideSkill({ match: ['base'], scope: ['aaa'] }, { toolName: 'X', toolInput: { file_path: '/x/base', content: 'aaa' } }),
    withoutIt: () => decideSkill({ match: ['base'], scope: ['aaa'] }, { toolName: 'X', toolInput: { file_path: '/x/base', content: 'zzz' } }) },
  // ── OPERATOR keys × THE THREE AXES (19/08/2026) ───────────────────────
  // 🔴 This whole block was MISSING the day `keys` shipped: the operator lived in the
  //    engine, in the validator and in the schema, and in NO judge. The table is what
  //    says an operator EXISTS on an axis — without these rows, an axis could have been
  //    inert forever (and one was: `skill/match`, 8 fleet entries out of 8).
  // ⚠️ The atom lives ONLY in the key being narrowed: that is what makes the flip
  //    attributable to `keys` and to nothing else.
  { id: 'keys/match/blacklist-removes-a-key', visible: true,
    withIt: () => decideFile({ pattern: 'aaa' }, { toolName: 'Bash', toolInput: { command: 'echo aaa' } }),
    withoutIt: () => decideFile({ pattern: 'aaa', keys: ['-command'] }, { toolName: 'Bash', toolInput: { command: 'echo aaa' } }) },
  { id: 'keys/match/whitelist-replaces-the-universe', visible: true,
    withIt: () => decideFile({ pattern: 'aaa', keys: ['file_path'] }, { toolName: 'X', toolInput: { file_path: '/x/aaa' } }),
    withoutIt: () => decideFile({ pattern: 'aaa', keys: ['file_path'] }, { toolName: 'Bash', toolInput: { command: 'echo aaa' } }) },
  { id: 'keys/scope/own-axis', visible: true,
    withIt: () => decideFile({ pattern: 'base', scope: ['aaa'] }, { toolName: 'Bash', toolInput: { command: 'base aaa' } }),
    withoutIt: () => decideFile({ pattern: 'base', scope: ['aaa'], keys: { scope: ['-command'] } }, { toolName: 'Bash', toolInput: { command: 'base aaa' } }) },
  { id: 'keys/exclude/own-axis', visible: true,
    withIt: () => !decideFile({ pattern: 'base', exclude: ['aaa'] }, { toolName: 'X', toolInput: { file_path: '/x/base', other: 'aaa' } }),
    withoutIt: () => !decideFile({ pattern: 'base', exclude: ['aaa'], keys: { exclude: ['-other'] } }, { toolName: 'X', toolInput: { file_path: '/x/base', other: 'aaa' } }) },
  { id: 'keys/axes-are-independent', visible: true,
    // narrowing `scope` must leave `exclude` intact — the object form exists for that
    withIt: () => !decideFile({ pattern: 'base', exclude: ['aaa'], keys: { scope: ['-other'] } }, { toolName: 'X', toolInput: { file_path: '/x/base', other: 'aaa' } }),
    withoutIt: () => !decideFile({ pattern: 'base', exclude: ['aaa'], keys: { exclude: ['-other'] } }, { toolName: 'X', toolInput: { file_path: '/x/base', other: 'aaa' } }) },
  { id: 'keys/scope/whitelist-reaches-a-payload-key', visible: true,
    // 🔴 FALSE UNTIL 19/08/2026: the whitelist widened the TRIGGER and left the FILTERS
    //    blind, so ONE declaration meant two things depending on the axis reading it —
    //    780 divergences measured. ㊿ is the DEFAULT universe of the filters, never a
    //    floor: `keys` exists so an entry can overrule a global default FOR ITSELF.
    withIt: () => decideFile({ pattern: 'base', scope: ['aaa'], keys: { scope: ['content'] } }, { toolName: 'X', toolInput: { file_path: '/x/base', content: 'aaa' } }),
    withoutIt: () => decideFile({ pattern: 'base', scope: ['aaa'] }, { toolName: 'X', toolInput: { file_path: '/x/base', content: 'aaa' } }) },
  { id: 'keys/match/cwd-is-addressable', visible: true,
    // 🔴 FALSE UNTIL 19/08/2026: `cwd` was pushed as a special case, hence OUTSIDE every
    //    key universe — the one parameter that says "I am WORKING here" was the one the
    //    operator could not reach.
    withIt: () => decideFile({ pattern: 'aaa' }, { toolName: 'X', toolInput: { cwd: '/w/aaa' } }),
    withoutIt: () => decideFile({ pattern: 'aaa', keys: ['-cwd'] }, { toolName: 'X', toolInput: { cwd: '/w/aaa' } }) },
  { id: 'keys/skill/match-dimension', visible: true,
    // 🔴 THE DEFECT OF 19/08: alive on `rules`/`servers`/`tool`, INERT on `match` — the
    //    only form the fleet uses. `skillRules` rebuilds its rule field by field.
    withIt: () => decideSkill({ match: ['aaa'] }, { toolName: 'Bash', toolInput: { command: 'echo aaa' } }),
    withoutIt: () => decideSkill({ match: ['aaa'], keys: ['-command'] }, { toolName: 'Bash', toolInput: { command: 'echo aaa' } }) },
  { id: 'keys/declared-alone-narrows-nothing', visible: false,
    justification: '`keys` chooses WHERE the others look; alone it filters nothing — the validator refuses it, and the engine stays inert (same status as a lone `scope`)',
    withIt: () => decideFile({ pattern: 'aaa', keys: ['file_path'] }, { toolName: 'X', toolInput: { file_path: '/x/aaa' } }),
    withoutIt: () => decideFile({ pattern: 'aaa' }, { toolName: 'X', toolInput: { file_path: '/x/aaa' } }) },
];

test('⚙️ TABLE OF ATOMS: each cell tells the truth, each blind cell is JUSTIFIED', () => {
  const faults = [];
  for (const c of CASES) {
    const mesure = c.withIt() !== c.withoutIt();
    if (mesure !== c.visible) faults.push(`${c.id}: declared ${c.visible ? 'VISIBLE' : 'BLIND'}, measured ${mesure ? 'VISIBLE' : 'BLIND'}`);
    if (!c.visible && !(typeof c.justification === 'string' && c.justification.length > 20)) {
      faults.push(`${c.id}: a blind cell WITHOUT a justification — that is a named hole (the ㊴/㊵ class)`);
    }
  }
  assert.deepStrictEqual(faults, [], faults.join('\n'));
});

test('⚙️ ANTI-DORMANCY: the table really discriminates', () => {
  // 🛑 A table where every probe returned the same thing (broken engine,
  //    dead imports) would be GREEN while proving nothing. We require BOTH classes,
  //    in plausible numbers, and that each "withIt" probe of a visible cell
  //    really DIFFERS from its "withoutIt" (already verified cell by cell above —
  //    here we freeze the counts so that a silent erosion becomes visible).
  const visibles = CASES.filter((c) => c.visible).length;
  const blind = CASES.length - visibles;
  assert.ok(visibles >= 20, `suspicious visible cells: ${visibles}`);
  assert.ok(blind >= 8, `suspicious blind cells: ${blind}`);
  const ids = CASES.map((c) => c.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'duplicated cell ids');
});

test('⚙️ NEGATIVE-CHECK: an amputated semantics would turn the table red', () => {
  // IN-MEMORY sabotage (never a real file): we replay cell ㊴ with an
  // engine that would ignore the filters on the servers dimension — the measurement
  // would return BLIND where the table declares VISIBLE, hence RED.
  const sansFiltres = (entry, payload) => {
    // the old semantics: membership of the server, filters IGNORED
    return String(payload.toolName).startsWith('mcp__srv__') && Array.isArray(entry.servers) && entry.servers.includes('srv');
  };
  const withIt = !sansFiltres({ servers: ['srv'], exclude: ['aaa'] }, { toolName: 'mcp__srv__x', toolInput: { p: 'aaa' } });
  const withoutIt = !sansFiltres({ servers: ['srv'], exclude: ['aaa'] }, { toolName: 'mcp__srv__x', toolInput: { p: 'zzz' } });
  assert.strictEqual(withIt !== withoutIt, false, 'the sabotaged engine is indeed BLIND — the table would have caught it');
});
