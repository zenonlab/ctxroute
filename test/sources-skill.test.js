// DETERMINISTIC tests of sources/skill.js — Stryker target (DIRECT import,
// all evaluation INSIDE the callbacks — perTest contract).
import { test, expect } from 'vitest';
import {
  skillRules,
  matchingSkills,
  serverMatches,
  toolMatches,
  declFor,
  skillNameFromDoc,
  pointerBody,
  DOC_PREFIX,
  MODES,
} from '../src/sources/skill.js';

// HARDCODED contract (never derived from the code): the valid modes. Kills the
// MODES[i]->"" mutant that declFor cannot catch on its own (the 'once' fallback coincides).
test('MODES = exact contract of the valid cadences', () => {
  expect(MODES).toEqual(['dumb', 'once', 'smart']);
});

// ── skillRules: config registry -> flat rules ──
test('skillRules: 1 rule per perimeter pattern, prefixed doc', () => {
  const rules = skillRules({ skills: { 'acme-infra': { match: ['infra-mcp', 'acme-infra'] } } });
  expect(rules).toEqual([
    { pattern: 'infra-mcp', doc: 'skill/acme-infra' },
    { pattern: 'acme-infra', doc: 'skill/acme-infra' },
  ]);
});

test('skillRules: EXACT prefix (skill/), not another one', () => {
  const rules = skillRules({ skills: { foo: { match: ['x'] } } });
  expect(rules[0].doc).toBe('skill/foo');
  expect(DOC_PREFIX).toBe('skill/');
});

test('skillRules: exclude propagated IF an array, otherwise absent (stable shape)', () => {
  const withArr = skillRules({ skills: { a: { match: ['x'], exclude: ['node_modules'] } } });
  expect(withArr[0].exclude).toEqual(['node_modules']);
  const strExclude = skillRules({ skills: { a: { match: ['x'], exclude: 'node_modules' } } });
  expect('exclude' in strExclude[0]).toBe(false);
  const noExclude = skillRules({ skills: { a: { match: ['x'] } } });
  expect('exclude' in noExclude[0]).toBe(false);
});

test('skillRules: scope propagated IF an array, otherwise absent (file docs parity)', () => {
  const withScope = skillRules({ skills: { a: { match: ['x'], scope: ['api-site'] } } });
  expect(withScope[0].scope).toEqual(['api-site']);
  const noScope = skillRules({ skills: { a: { match: ['x'] } } });
  expect('scope' in noScope[0]).toBe(false);
});

test('matchingSkills: scope NARROWS — match matches but scope absent from the params => nothing', () => {
  const config = { skills: { a: { match: ['x.js'], scope: ['api-site'] } } };
  // match matches the path, but no param contains 'api-site' => filtered
  expect(matchingSkills(config, { toolName: 'Read', toolInput: { file_path: 'C:/x.js' } })).toEqual([]);
  // a param contains 'api-site' => passes
  expect(matchingSkills(config, { toolName: 'Read', toolInput: { file_path: 'C:/api-site/x.js' } })).toEqual([{ doc: 'skill/a' }]);
});

test('skillRules: non-string pattern ignored, strings kept', () => {
  const rules = skillRules({ skills: { a: { match: ['ok', 42, 'ok2'] } } });
  expect(rules.map((r) => r.pattern)).toEqual(['ok', 'ok2']);
});

test('skillRules: match absent/non-array = 0 rules; skills absent = []', () => {
  expect(skillRules({ skills: { a: {} } })).toEqual([]);
  expect(skillRules({ skills: { a: { match: 'infra-mcp' } } })).toEqual([]);
  expect(skillRules({})).toEqual([]);
  expect(skillRules(null)).toEqual([]);
});

// ── matchingSkills: reuses the file matcher ──
test('matchingSkills: perimeter touched -> skill triggered', () => {
  const config = { skills: { 'acme-infra': { match: ['infra-mcp'] } } };
  const hit = matchingSkills(config, { toolName: 'Read', toolInput: { file_path: 'C:/Users/x/Desktop/infra-mcp/server.js' } });
  expect(hit).toEqual([{ doc: 'skill/acme-infra' }]);
});

test('matchingSkills: outside the perimeter -> nothing', () => {
  const config = { skills: { 'acme-infra': { match: ['infra-mcp'] } } };
  expect(matchingSkills(config, { toolName: 'Read', toolInput: { file_path: 'C:/other/projet/index.js' } })).toEqual([]);
});

test('matchingSkills: 2 patterns of the SAME skill match -> only 1 pointer (dedup)', () => {
  const config = { skills: { a: { match: ['infra', 'infra-mcp'] } } };
  const hit = matchingSkills(config, { toolName: 'Read', toolInput: { file_path: 'x/infra-mcp/y.js' } });
  expect(hit).toEqual([{ doc: 'skill/a' }]);
});

test('matchingSkills: also matches a Bash command (cd &&)', () => {
  const config = { skills: { a: { match: ['acme-infra'] } } };
  const hit = matchingSkills(config, { toolName: 'Bash', toolInput: { command: 'cd /root/acme-infra && ls scripts' } });
  expect(hit).toEqual([{ doc: 'skill/a' }]);
});

// ── serverMatches: MCP dimension, reuses lib.serverName ──
test('serverMatches: MCP call of a listed server -> skill triggered', () => {
  const config = { skills: { 'acme-infra': { match: ['x'], servers: ['infra', 'blog'] } } };
  expect(serverMatches(config, { toolName: 'mcp__infra__infra_call', toolInput: {} })).toEqual([{ doc: 'skill/acme-infra' }]);
  expect(serverMatches(config, { toolName: 'mcp__blog__blog_call', toolInput: {} })).toEqual([{ doc: 'skill/acme-infra' }]);
});

test('serverMatches: server NOT listed -> nothing', () => {
  const config = { skills: { a: { match: ['x'], servers: ['infra'] } } };
  expect(serverMatches(config, { toolName: 'mcp__stripe__authenticate', toolInput: {} })).toEqual([]);
});

test('serverMatches: NON-MCP tool (no server) -> nothing', () => {
  const config = { skills: { a: { match: ['x'], servers: ['infra'] } } };
  expect(serverMatches(config, { toolName: 'Read', toolInput: { file_path: 'y.js' } })).toEqual([]);
  expect(serverMatches(config, {})).toEqual([]);
});

test('serverMatches: servers absent/non-array -> nothing', () => {
  expect(serverMatches({ skills: { a: { match: ['x'] } } }, { toolName: 'mcp__infra__x', toolInput: {} })).toEqual([]);
  expect(serverMatches({ skills: { a: { match: ['x'], servers: 'infra' } } }, { toolName: 'mcp__infra__x', toolInput: {} })).toEqual([]);
});

// ── matchingSkills: UNION of file + server, deduplicated ──
test('matchingSkills: triggered by the SERVER even without touching a file', () => {
  const config = { skills: { 'acme-infra': { match: ['infra-mcp'], servers: ['infra'] } } };
  expect(matchingSkills(config, { toolName: 'mcp__infra__infra_call', toolInput: {} })).toEqual([{ doc: 'skill/acme-infra' }]);
});

test('matchingSkills: file AND server match the same skill -> ONLY 1 pointer (dedup)', () => {
  const config = { skills: { a: { match: ['infra-mcp'], servers: ['infra'] } } };
  // an mcp__infra__ call one of whose params also contains "infra-mcp": the 2 dimensions match
  const hit = matchingSkills(config, { toolName: 'mcp__infra__infra_call', toolInput: { path: 'x/infra-mcp/y' } });
  expect(hit).toEqual([{ doc: 'skill/a' }]);
});

test('matchingSkills: 2 distinct skills, one by file one by server -> both', () => {
  const config = {
    skills: {
      f: { match: ['projet-f'] },
      s: { match: ['zzz'], servers: ['infra'] },
    },
  };
  const hit = matchingSkills(config, { toolName: 'mcp__infra__x', toolInput: { file_path: 'projet-f/main.js' } });
  expect(hit).toEqual([{ doc: 'skill/f' }, { doc: 'skill/s' }]);
});

// ── declFor: SUPPLIES the entry, resolves NO cascade (04/08/2026) ──
// ⚠️ CONTRACT CHANGED, coverage KEPT. Before, declFor resolved
//    `config.skillDefaults` AND forced `mode: 'once'`: that was a SECOND cascade
//    point, in addition to gate.js. The day a stage moved in gate, this one
//    stayed behind and skills followed a different rule than the docs,
//    SILENTLY. The 6 cases that certified this behavior are REPLACED here; the
//    complete cascade (defaults.skill > global > framework 'once') is proven
//    in gate.test.js, at its unique resolution point.
test('declFor: nothing declared -> EMPTY object (no default supplied here)', () => {
  expect(declFor(undefined)).toEqual({});
  expect(declFor({})).toEqual({});
});

test('declFor: a valid value of the entry is SUPPLIED as is', () => {
  expect(declFor({ mode: 'dumb' })).toEqual({ mode: 'dumb' });
  expect(declFor({ mode: 'smart' })).toEqual({ mode: 'smart' });
  expect(declFor({ mode: 'once' })).toEqual({ mode: 'once' });
});

test('declFor: an INVALID value is OMITTED (never supplied) -> the cascade will decide', () => {
  expect(declFor({ mode: 'bogus' })).toEqual({});
  expect(declFor({ threshold: 0 })).toEqual({});
  expect(declFor({ threshold: -1 })).toEqual({});
  expect(declFor({ threshold: 2.5 })).toEqual({});
  expect(declFor({ driftUnit: 'bogus' })).toEqual({});
});

test('declFor: threshold — bound 1 INCLUDED, integers >= 1 supplied', () => {
  expect(declFor({ mode: 'smart', threshold: 1 })).toEqual({ mode: 'smart', threshold: 1 });
  expect(declFor({ mode: 'smart', threshold: 5 })).toEqual({ mode: 'smart', threshold: 5 });
});

// ⚠️ This case is the anti-return SAFEGUARD: if declFor started reading
//    a 2nd argument again one day, the double cascade would be reborn silently. Here, it TURNS RED.
test('declFor: IGNORES any second argument (no more defaults resolution here)', () => {
  expect(declFor({}, { mode: 'smart' })).toEqual({});
  expect(declFor({ mode: 'dumb' }, { mode: 'smart', threshold: 9 })).toEqual({ mode: 'dumb' });
});

// ── skillNameFromDoc: exact inverse of skillRules ──
test('skillNameFromDoc: removes the skill/ prefix', () => {
  expect(skillNameFromDoc('skill/acme-infra')).toBe('acme-infra');
  expect(skillNameFromDoc('skill/a')).toBe('a');
});

// ── pointerBody: a pointer, never the body of the skill ──
test('pointerBody: names the skill + orders the loading', () => {
  const body = pointerBody('acme-infra');
  expect(body).toContain('acme-infra');
  expect(body).toContain('load');
  expect(body).toContain('Skill');
});

// ── driftUnit: valid SUPPLIED, absent OMITTED — the cascade (defaults.skill >
//    defaultDriftUnit > 'tool') lives in gate.driftUnitForDoc, a single point ──
test('declFor: driftUnit — valid supplied, invalid and absent OMITTED', () => {
  expect(declFor({ driftUnit: 'turn' }).driftUnit).toBe('turn');
  expect(declFor({ driftUnit: 'tool' }).driftUnit).toBe('tool');
  expect('driftUnit' in declFor({ driftUnit: 'bogus' })).toBe(false);
  expect('driftUnit' in declFor({})).toBe(false);
  expect('driftUnit' in declFor(undefined)).toBe(false);
});

// ── serverMatches: 3 GRAINS (18/07/2026) — server / tool / sub-tool ──
test('serverMatches TOOL grain: "srv/tool" only matches THAT tool of the server', () => {
  const config = { skills: { a: { match: ['x'], servers: ['gworkspace/send_mail'] } } };
  expect(serverMatches(config, { toolName: 'mcp__gworkspace__send_mail', toolInput: {} })).toEqual([{ doc: 'skill/a' }]);
  expect(serverMatches(config, { toolName: 'mcp__gworkspace__list_events', toolInput: {} })).toEqual([]);
  expect(serverMatches(config, { toolName: 'mcp__autre__send_mail', toolInput: {} })).toEqual([]);
});

test('serverMatches SUB-TOOL grain: "srv/sub" via servers.{srv}.subToolParam', () => {
  const config = {
    servers: { odoo: { subToolParam: 'args.tool' } },
    skills: { a: { match: ['x'], servers: ['odoo/create_invoice'] } },
  };
  expect(serverMatches(config, { toolName: 'mcp__odoo__odoo_call', toolInput: { args: { tool: 'create_invoice' } } })).toEqual([{ doc: 'skill/a' }]);
  expect(serverMatches(config, { toolName: 'mcp__odoo__odoo_call', toolInput: { args: { tool: 'read_lead' } } })).toEqual([]);
});

test('serverMatches: the WHOLE-server grain keeps matching all its tools', () => {
  const config = { skills: { a: { match: ['x'], servers: ['gworkspace'] } } };
  expect(serverMatches(config, { toolName: 'mcp__gworkspace__send_mail', toolInput: {} })).toEqual([{ doc: 'skill/a' }]);
  expect(serverMatches(config, { toolName: 'mcp__gworkspace__nimporte', toolInput: {} })).toEqual([{ doc: 'skill/a' }]);
});

test('serverMatches: server==null guard — a pathological "null/null" entry NEVER matches a non-MCP tool', () => {
  const config = { skills: { a: { match: ['x'], servers: ['null/null'] } } };
  expect(serverMatches(config, { toolName: 'Read', toolInput: { file_path: 'y.js' } })).toEqual([]);
  expect(serverMatches(config, {})).toEqual([]);
});

test('serverMatches: without a resolved sub-tool, a pathological "srv/null" entry NEVER matches', () => {
  // subToolParam absent => subTool null => the sub-tool candidate DOES NOT EXIST
  // (never the string 'gworkspace/null').
  const config = { skills: { a: { match: ['x'], servers: ['gworkspace/null'] } } };
  expect(serverMatches(config, { toolName: 'mcp__gworkspace__send_mail', toolInput: {} })).toEqual([]);
});

// ── cwd (18/07/2026, added AFTER a doc-first measurement: field common to the hook
//    contracts of Claude Code AND Codex): the current directory IS a matchable param ──
test('matchingSkills/cwd: `npm test` run INSIDE the project (no path in the command) → skill triggered by the cwd', () => {
  const config = { skills: { a: { match: ['mon-projet'] } } };
  const payload = { toolName: 'Bash', toolInput: { command: 'npm test' }, cwd: 'C:/Users/dev/Desktop/mon-projet' };
  expect(matchingSkills(config, payload)).toEqual([{ doc: 'skill/a' }]);
  // outside the project: nothing.
  expect(matchingSkills(config, { toolName: 'Bash', toolInput: { command: 'npm test' }, cwd: 'C:/ailleurs' })).toEqual([]);
  // FAIL-SOFT: harness without cwd → previous behavior, no crash.
  expect(matchingSkills(config, { toolName: 'Bash', toolInput: { command: 'npm test' } })).toEqual([]);
});

test('matchingSkills/cwd: scope satisfied by the cwd too (all the params, cwd included)', () => {
  const config = { skills: { a: { match: ['x.js'], scope: ['mon-projet'] } } };
  const payload = { toolName: 'Read', toolInput: { file_path: 'x.js' }, cwd: 'C:/dev/mon-projet' };
  expect(matchingSkills(config, payload)).toEqual([{ doc: 'skill/a' }]);
});

// ── rules (19/07/2026, docs parity): PER-ENTRY conditions for a skill ──
test('skillRules/rules: one scope PER pattern — heterogeneous without duplicating the skill', () => {
  const config = { skills: { a: { rules: [
    { pattern: 'deploy.sh', scope: ['projet-a'] },
    { pattern: 'clients-seo' },
  ] } } };
  // deploy.sh OUTSIDE projet-a: filtered by ITS scope.
  expect(matchingSkills(config, { toolName: 'Read', toolInput: { file_path: 'C:/other/deploy.sh' } })).toEqual([]);
  // deploy.sh INSIDE projet-a: passes.
  expect(matchingSkills(config, { toolName: 'Read', toolInput: { file_path: 'C:/projet-a/deploy.sh' } })).toEqual([{ doc: 'skill/a' }]);
  // clients-seo: NO scope, passes everywhere.
  expect(matchingSkills(config, { toolName: 'Read', toolInput: { file_path: 'C:/x/clients-seo/y.md' } })).toEqual([{ doc: 'skill/a' }]);
});

test('skillRules/rules: PER-entry exclude + invalid entry ignored (total, never a throw)', () => {
  const config = { skills: { a: { rules: [
    { pattern: 'lock.js', exclude: ['node_modules'] },
    { bogus: true }, null, { pattern: 42 },
  ] } } };
  expect(matchingSkills(config, { toolName: 'Read', toolInput: { file_path: 'C:/p/lock.js' } })).toEqual([{ doc: 'skill/a' }]);
  expect(matchingSkills(config, { toolName: 'Read', toolInput: { file_path: 'C:/p/node_modules/lock.js' } })).toEqual([]);
});

test('skillRules/rules: PRECEDENCE over match/scope/exclude (deterministic, never both)', () => {
  const config = { skills: { a: { rules: [{ pattern: 'via-rules' }], match: ['via-match'] } } };
  expect(matchingSkills(config, { toolName: 'Read', toolInput: { file_path: 'C:/via-rules/x.js' } })).toEqual([{ doc: 'skill/a' }]);
  expect(matchingSkills(config, { toolName: 'Read', toolInput: { file_path: 'C:/via-match/x.js' } })).toEqual([]);
});

// ── `enforce` (05/08/2026): SUPPLIED as is, `false` INCLUDED ──
test('declFor: boolean enforce supplied as is, `false` kept (opting out)', () => {
  // ⚠️ `false` MUST NOT be filtered as an "empty" value: it is what
  //    allows a skill to opt out of a `defaults.skill.enforce: true`.
  //    Without this case, opting out would be impossible and nobody would see it.
  expect(declFor({ match: ['x'], enforce: true })).toEqual({ enforce: true });
  expect(declFor({ match: ['x'], enforce: false })).toEqual({ enforce: false });
});
test('declFor: NON-boolean enforce => key OMITTED (never a guessed block)', () => {
  for (const v of ['oui', 1, 0, null, [], {}]) {
    expect(declFor({ match: ['x'], enforce: v })).toEqual({});
  }
});

// ═══════════════════════════════════════════════════════════════════════
// ㊴ COMPLETE VOCABULARY PARITY DOCS ↔ SKILLS (12/08/2026)
// ═══════════════════════════════════════════════════════════════════════
// 🛑 THE DEFECT REPAIRED: a skill could only react to a PLACE (path, server),
//    never to the CONTENT of a parameter. MEASURED cost: a client email drafted without
//    the client's folder, ~10 versions (11/08/2026). The TWO parts ship
//    TOGETHER — shipping only one would replay the "ALL the grains, right away" mistake.

// ── PART 1: `tool` triggers a skill, exactly as for a doc ──
test('㊴ toolMatches: `tool` triggers the skill (EXACT name)', () => {
  const config = { skills: { 'client-x': { tool: ['mcp__gworkspace__gworkspace_call'], scope: ['acme'] } } };
  const payload = { toolName: 'mcp__gworkspace__gworkspace_call', toolInput: { args: { to: 'acme@example.com' } } };
  expect(toolMatches(config, payload)).toEqual([{ doc: 'skill/client-x' }]);
});
test('㊴ toolMatches: NEGATIVE — scope not satisfied ⇒ SILENCE', () => {
  // ⚠️ The part that proves that client A's skill does NOT arrive when writing to
  //    client B: that is the WHOLE point of the work, not an edge case.
  const config = { skills: { 'client-x': { tool: ['mcp__gworkspace__gworkspace_call'], scope: ['acme'] } } };
  const payload = { toolName: 'mcp__gworkspace__gworkspace_call', toolInput: { args: { to: 'other@example.com' } } };
  expect(toolMatches(config, payload)).toEqual([]);
});
test('㊴ toolMatches: tool not targeted ⇒ SILENCE', () => {
  const config = { skills: { 'client-x': { tool: ['WebFetch'], scope: ['acme'] } } };
  expect(toolMatches(config, { toolName: 'Bash', toolInput: { command: 'acme' } })).toEqual([]);
});
test('㊴ toolMatches: `*` wildcard + exclude — SAME semantics as the docs', () => {
  const config = { skills: { g: { tool: ['*'], scope: ['docker run'], exclude: ['WebFetch'] } } };
  expect(toolMatches(config, { toolName: 'Bash', toolInput: { command: 'docker run x' } })).toEqual([{ doc: 'skill/g' }]);
  expect(toolMatches(config, { toolName: 'WebFetch', toolInput: { url: 'docker run' } })).toEqual([]);
});
test('㊴ toolMatches: an entry WITHOUT `tool` is never triggered by this dimension', () => {
  expect(toolMatches({ skills: { a: { match: ['x'] } } }, { toolName: 'Bash', toolInput: {} })).toEqual([]);
});
test('㊴ matchingSkills: the TOOL dimension enters the UNION, deduplicated', () => {
  const config = { skills: { s: { tool: ['Bash'], scope: ['acme'] } } };
  expect(matchingSkills(config, { toolName: 'Bash', toolInput: { command: 'cd acme' } })).toEqual([{ doc: 'skill/s' }]);
});

// ── PART 2: `scope`/`exclude` ALSO apply to the `servers` dimension ──
test('㊴ serverMatches: `scope` now FILTERS (before: ALL OR NOTHING)', () => {
  const config = { skills: { 'client-x': { servers: ['gworkspace'], scope: ['acme'] } } };
  const ok = { toolName: 'mcp__gworkspace__gworkspace_call', toolInput: { args: { to: 'acme@example.com' } } };
  const ko = { toolName: 'mcp__gworkspace__gworkspace_call', toolInput: { args: { to: 'other@example.com' } } };
  expect(serverMatches(config, ok)).toEqual([{ doc: 'skill/client-x' }]);
  expect(serverMatches(config, ko)).toEqual([]);
});
test('㊴ serverMatches: `exclude` bears on the TOOL NAME (parity with the tool source)', () => {
  const config = { skills: { s: { servers: ['gworkspace'], exclude: ['send_gmail'] } } };
  const bloque = { toolName: 'mcp__gworkspace__send_gmail_message', toolInput: {} };
  const passe = { toolName: 'mcp__gworkspace__list_labels', toolInput: {} };
  expect(serverMatches(config, bloque)).toEqual([]);
  expect(serverMatches(config, passe)).toEqual([{ doc: 'skill/s' }]);
});
test('㊴ serverMatches: without scope nor exclude, the PREVIOUS behavior identically', () => {
  const config = { skills: { s: { servers: ['infra'] } } };
  expect(serverMatches(config, { toolName: 'mcp__infra__infra_call', toolInput: {} })).toEqual([{ doc: 'skill/s' }]);
});

// ⚠️ MUTANT `(payload && payload.toolInput) || {}` → `payload || payload.toolInput`:
//    a payload WITHOUT toolInput would then make it scan the payload ITSELF, so the TOOL
//    NAME would satisfy a scope that should only match PARAMETERS.
test('㊴ toolMatches: payload WITHOUT toolInput — the tool name is NOT a parameter', () => {
  const config = { skills: { s: { tool: ['Bash'], scope: ['Bash'] } } };
  expect(toolMatches(config, { toolName: 'Bash' })).toEqual([]);
});
