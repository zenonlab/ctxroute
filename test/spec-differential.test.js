// ═══════════════════════════════════════════════════════════════════════
// spec-differential.test.js — DOES THE ENGINE DO WHAT THE SPEC SAYS?
// ═══════════════════════════════════════════════════════════════════════
//
// 🛑 THIS IS THE ONLY TEST IN THE REPO THAT DOES NOT PROVE AN INTERNAL CONSISTENCY.
//    All the others call the engine: they prove what it DOES. This one
//    confronts the engine with an INDEPENDENT MODEL (`language-spec.js`), written
//    from the intention. It is the only place where a FALSE semantics can
//    turn red — the three defects ㊵/㊴/㊼ were green everywhere else.
//
// 📐 EXHAUSTIVE, HENCE IT IS A PROOF — not a sample. The domain is
//    deliberately FINITE and small: 3 atoms, N gesture forms, all the
//    rules that can be written on them. AWS (Cedar/Zelkova) has to go through Lean and
//    SMT solvers because their domain is infinite; on a domain one can
//    EXHAUST, a `for` loop is strictly stronger than a solver.
//
// ⚠️ WHAT IT PROVES: the engine is COMPLIANT with the spec over the whole domain.
// ⚠️ WHAT IT WILL NEVER PROVE: that the SPEC is what we want. That remains a
//    human judgement — but it bears on 40 lines of quantifiers instead of
//    200 lines of engine. That is the whole gap between "we hope" and "we verify".
// ⚠️ SMALL SCOPE HYPOTHESIS (Alloy, *small scope hypothesis*): a semantics
//    defect shows up on small cases. Assumed and written down, not hidden.
//
// 🛑 A DIVERGENCE IS NOT NECESSARILY AN ENGINE BUG: it says that the two
//    do not agree. You must DECIDE which one is right, and write down why.
//    NEVER "align the spec on the engine" to silence a red: that
//    would turn the judge into a twin, and lose the only net that watches
//    the semantics.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import { matchingDocs } from '../src/sources/file.js';
import { RULE_KEYS } from '../src/frontmatter.js';
import { matchingDocs as engineTool } from '../src/sources/tool.js';
import { matchingDocs as engineMcp } from '../src/sources/mcp.js';
import { matchingSkills } from '../src/sources/skill.js';
import { injects, toolInjects, skillInjects, mcpCandidates } from '../src/language-spec.js';

const A = ['aaa', 'bbb', 'ccc'];
const sousEnsembles = (xs) => {
  const out = [];
  for (let k = 0; k < 1 << xs.length; k++) out.push(xs.filter((_, i) => k & (1 << i)));
  return out;
};

// ── THE DOMAIN OF THE GESTURES — every FORM a tool call can take.
// ⚠️ Each form exists for a reason: they cover the projections the
//    language can see. Removing one makes the differential blind to a whole
//    class (the lesson of the property-based laws: without the `cd X && …` form, bug
//    ㊼ was UNREACHABLE and the laws passed vacuously).
function gestes() {
  const out = [];
  for (const a of A) {
    for (const b of A) {
      out.push({ toolName: 'Read', toolInput: { file_path: `/x/${a}/f.js` } });
      out.push({ toolName: 'Read', toolInput: { file_path: `/x/${a}/f.js`, other: b } });
      out.push({ toolName: 'Read', toolInput: { args: { nested: { deep: `${a}/${b}` } } } });
      // ⚠️ REAL DEPTH — a hole REVEALED by mutating the model on 14/08/2026:
      //    the domain only went down 3 levels, so the recursive flattening
      //    (㊵, the defect that made `scope` blind to the 16 MCP servers) was
      //    NOT confronted. A differential that does not reach a capability does not judge it.
      out.push({ toolName: 'mcp__srv__outil', toolInput: { args: { a: { b: { c: { d: { e: `${a}` } } } } }, top: b } });
      // ⚠️ MIXED CASE: `norm()` is what makes the matching portable between OSes.
      out.push({ toolName: 'Read', toolInput: { file_path: `C:\\X\\${a.toUpperCase()}\\${b}.JS` } });
      out.push({ toolName: 'Bash', toolInput: { command: `${a} ${b}` } });
      out.push({ toolName: 'Bash', toolInput: { command: `cd ~/w/${a} && ${b}` } });
      out.push({ toolName: 'Bash', toolInput: { command: `cd ~/w/${a} && node ${b}` } });
      out.push({ toolName: 'Bash', toolInput: { command: `${a} --exclude ${b}`, cwd: `/w/${b}` } });
      out.push({ toolName: 'apply_patch', toolInput: { input: `*** Update File: ${a}/${b}.js` } });
      out.push({ toolName: 'Read', toolInput: { remotePath: `/srv/${a}`, path: `/opt/${b}` } });
      out.push({ toolName: 'mcp__srv__outil', toolInput: { args: { filePath: `/x/${a}`, mode: b } } });
      // ⚠️ BOUNDARY BETWEEN TWO PARAMS (53bis, 15/08/2026): a pattern WITH A SPACE must
      //    only match INSIDE a value, never straddling two adjacent
      //    values. Without these two forms (one straddling, the other contained),
      //    the class is UNREACHABLE and the differential blind — that is the
      //    hole the engine's `join(' ')` concatenation carried until now.
      out.push({ toolName: 'X', toolInput: { file_path: `/x/${a}`, u: `x ${a}`, v: `${b} y` } });
      out.push({ toolName: 'X', toolInput: { file_path: `/x/${a}`, u: `x ${a} ${b} y` } });
      // ⚠️ PAYLOAD CARRIERS (`keys`, 19/08/2026): without a gesture holding a `content`,
      //    the WIDENING of a whitelist towards a payload key is UNREACHABLE and the
      //    differential judges it not at all. A domain that does not reach a capability
      //    does not measure it — the lesson of the depth hole of 14/08.
      out.push({ toolName: 'Write', toolInput: { file_path: `/x/${a}`, content: `${b}` } });
      out.push({ toolName: 'Write', toolInput: { content: `${a}/${b}` } });
    }
  }
  return out;
}

// The `keys` forms confronted. ⚠️ `content` is DELIBERATELY there: it is the key
// that ㊿ removes from the filters' DEFAULT universe, so it is the only one able to
// reveal an axis where "a whitelist REPLACES" would have stopped being true.
const VARIANT_KEYS = [
  ['-command'],
  ['-file_path'],
  ['file_path'],
  ['command'],
  ['content'],
  { match: ['-command'] },
  { scope: ['-command'] },
  { exclude: ['-command'] },
  { match: ['file_path'], scope: ['content'] },
  { scope: ['content'], exclude: ['content'] },
];

// ── THE DOMAIN OF THE RULES — everything that can be written on these atoms.
function rules() {
  const out = [];
  const possibleGroups = sousEnsembles(A).filter((g) => g.length > 0);
  // 53bis — patterns WITH A SPACE: that is the only writing that can straddle a
  // value boundary. Without them, the "inside ONE value" semantics is
  // confronted nowhere.
  for (const pattern of A) {
    out.push({ pattern, doc: 'd.md', scope: ['aaa bbb'] });
    out.push({ pattern, doc: 'd.md', exclude: ['aaa bbb'] });
  }
  for (const pattern of A) {
    for (const exclude of sousEnsembles(A)) {
      for (const scope of sousEnsembles(A)) {
        const r = { pattern, doc: 'd.md' };
        if (scope.length) r.scope = scope;
        if (exclude.length) r.exclude = exclude;
        out.push(r);
        // ⚠️ `keys` (19/08/2026) — the axis "WHERE to look". Both forms, and the THREE
        //    axes: a flat list applies to all of them, an object gives each its own.
        //    A whitelist REPLACES the universe (hence it may WIDEN, `content` included),
        //    a list of `-name` REMOVES from it. Omitting these forms would measure a
        //    language that is no longer ours — exactly what the completeness file forbids.
        for (const keys of VARIANT_KEYS) {
          out.push({ ...r, keys });
        }
      }
      // ㊺① — the GROUPED form is part of the language: omitting it here would measure
      // a semantics that is not ours.
      for (const combi of sousEnsembles(possibleGroups)) {
        if (!combi.length) continue;
        const r = { pattern, doc: 'd.md', scope: combi };
        if (exclude.length) r.exclude = exclude;
        out.push(r);
      }
    }
  }
  return out;
}

// ── ⓪ THE DOMAIN EXERCISES EVERY MATCHING OPERATOR ──────────────────────
// 🔴 THE CLASS THIS CLOSES, AND IT COST A WHOLE DAY (19/08/2026): `keys` shipped with a
//    schema, a validator, a dedicated suite, 959 green tests and 100 % mutation — and it
//    was in NO judge. This model did not know it, so the exhaustive enumeration below
//    measured a language the operator was not part of. Teaching it the operator then found
//    TWO real defects immediately (780 + 192 divergences).
// 🛑 UNTIL TODAY ONLY PROSE FORBADE THAT (the skill: "shipping an operator includes its
//    judges"). This session is the proof that prose does not hold: the rule existed and the
//    operator shipped outside anyway. A machine now refuses it.
// ⚠️ DERIVED FROM `RULE_KEYS` and PROBED ON THE REAL GENERATOR — never a copied list and
//    never a grep of this file's text (a name in a comment would satisfy a grep). We look
//    at the rules the domain ACTUALLY produces.
const NOT_EXERCISED = {
  pattern: 'it IS the trigger — every generated rule carries one, and `triggers-gate` proves its consumption',
  rank: 'an emission ORDER, not a matching semantics: it decides no injection (covered by loader.test.js)',
};
// 🛑 BOUND DECLARED HERE, NOT RAISED GLOBALLY (2026-08-20). These tests ENUMERATE a domain, so
//    their cost follows the domain, not the machine. CI measured 6,232 ms against ~3,600 ms
//    locally and the 5 s wall of the fast lane BROKE — after having already been grazed at
//    4,992 ms. Raising the lane to 30 s would make 1,000 tests that should fail in 5 s wait for
//    30. A timeout is a BOUND, never a wait: it lengthens nothing, it only refuses what runs long.
//    ⚠️ Growing the domain is what moves this number — re-measure, never bump it to silence a red.

test('⓪ the DOMAIN exercises every matching operator of the vocabulary', () => {
  const produced = new Set();
  for (const r of rules()) for (const k of Object.keys(r)) produced.add(k);
  // ANTI-VACUITY: a broken generator would yield an empty set and the check would pass
  // while proving nothing — the failure mode of every derived gate.
  assert.ok(produced.size >= 3, `suspicious domain: it produces only ${produced.size} distinct keys`);
  const missing = RULE_KEYS.filter((k) => !(k in NOT_EXERCISED) && !produced.has(k));
  assert.deepStrictEqual(
    missing, [],
    `operator(s) the exhaustive domain NEVER exercises: ${missing.join(', ')} — this differential therefore measures a language that is not ours. Extend the domain, or declare the operator in NON_EXERCES WITH ITS REASON. Shipping an operator INCLUDES its judges.`,
  );
});

test('SPEC ⟷ ENGINE: EXHAUSTIVE conformance over the whole domain', { timeout: 30000 }, () => {
  const G = gestes();
  const R = rules();
  const divergences = [];
  for (const rule of R) {
    for (const geste of G) {
      const engine = matchingDocs([rule], geste).length > 0;
      const spec = injects(rule, geste, { maxDepth: 20 });
      if (engine !== spec) {
        divergences.push(`rule=${JSON.stringify(rule)} gesture=${JSON.stringify(geste)} engine=${engine} spec=${spec}`);
      }
    }
  }
  // ⚠️ ANTI-DORMANCY: an empty domain would go green while proving NOTHING —
  //    a defect already paid for 3 times in this repo (deps-purete, deadline-gate,
  //    couches-gate). The count is DISPLAYED so that it can be quoted, never guessed.
  assert.ok(R.length >= 500 && G.length >= 50, `suspicious domain: ${R.length} rules × ${G.length} gestures`);
  console.log(`  → conformance verified on ${R.length} rules × ${G.length} gestures = ${R.length * G.length} cases`);
  assert.deepStrictEqual(divergences.slice(0, 5), [],
    `${divergences.length} spec ⟷ engine divergence(s). DECIDE which one is right, never align the spec on the engine.`);
});

// ═══════════════════════════════════════════════════════════════════════
// ㊻③ (15/08/2026) — THE 3 OTHER SOURCES. The judge only covered `file`
// (1 out of 4); ㊴ lived exactly in an uncovered source (skill/servers).
// ═══════════════════════════════════════════════════════════════════════

// The payload FORMS, without an imposed tool name — the tool/skill sources
// decide first on the NAME, so it must vary independently of the body.
const TOOL_NAMES = ['aaa', 'bbb', 'mcp__srv__outil', ''];
function corpsDeGeste() {
  const out = [];
  for (const a of A) {
    out.push({ file_path: `/x/${a}/f.js` });
    out.push({ args: { nested: { deep: a } } });
    out.push({ command: `cd ~/w/${a} && node run.js` });
    out.push({ command: `${a} --exclude bbb` });
    out.push({});
  }
  return out;
}

test('SPEC ⟷ ENGINE (source `tool`): EXHAUSTIVE conformance', { timeout: 30000 }, () => {
  const fms = [];
  for (const tool of [['aaa'], ['aaa', 'bbb'], ['*'], 'aaa']) {
    for (const exclude of sousEnsembles(A)) {
      for (const scope of sousEnsembles(A)) {
        const fm = { tool };
        if (scope.length) fm.scope = scope;
        // ㊺① — the grouped form also holds on this axis.
        if (scope.length > 1) fms.push({ tool, scope: scope.map((s) => [s]), ...(exclude.length ? { exclude } : {}) });
        if (exclude.length) fm.exclude = exclude;
        fms.push(fm);
      }
    }
  }
  const divergences = [];
  let cas = 0;
  for (const fm of fms) {
    for (const toolName of TOOL_NAMES) {
      for (const toolInput of corpsDeGeste()) {
        cas++;
        const engine = engineTool([{ doc: 'd.md', fm }], { toolName, toolInput }).length > 0;
        const spec = toolInjects(fm, { toolName, toolInput }, { maxDepth: 20 });
        if (engine !== spec) divergences.push(`fm=${JSON.stringify(fm)} tool=${toolName} input=${JSON.stringify(toolInput)} engine=${engine} spec=${spec}`);
      }
    }
  }
  assert.ok(fms.length >= 200 && cas >= 10000, `suspicious domain: ${fms.length} rules, ${cas} cases`);
  console.log(`  → source tool: ${cas} cases`);
  assert.deepStrictEqual(divergences.slice(0, 5), [], `${divergences.length} divergence(s) on the tool source`);
});

test('SPEC ⟷ ENGINE (source `mcp`): EXHAUSTIVE conformance, order included', { timeout: 30000 }, () => {
  // ⚠️ The order IS PART of the semantics (global → specific = the hierarchy
  //    lives in the path): we compare LISTS, never sets.
  const names = ['mcp__srv__outil', 'mcp__srv__', 'mcp__srv', 'mcp__a_b__c', 'mcp__a.b__c', 'Read', '', 'mcp____x'];
  const subTools = ['sub', 'outil', '../evil', 'a/b', '.', 7, { obj: 1 }, null, undefined];
  const configs = [];
  for (const filterMode of [undefined, 'whitelist', 'blacklist', 'other']) {
    for (const filterList of [undefined, [], ['srv'], ['srv', 'a_b'], ['x']]) {
      for (const servers of [undefined, { srv: { subToolParam: 'args.tool' } }, { srv: { subToolParam: 'args.deep.tool' } }, { 'a_b': { subToolParam: 'args.tool' } }]) {
        const c = {};
        if (filterMode !== undefined) c.filterMode = filterMode;
        if (filterList !== undefined) c.filterList = filterList;
        if (servers !== undefined) c.servers = servers;
        configs.push(c);
      }
    }
  }
  const divergences = [];
  let cas = 0;
  for (const config of configs) {
    for (const toolName of names) {
      for (const sub of subTools) {
        for (const toolInput of [{ args: { tool: sub } }, { args: { deep: { tool: sub } } }, {}]) {
          cas++;
          const engine = engineMcp(config, { toolName, toolInput }).map((c) => c.doc);
          const spec = mcpCandidates(config, { toolName, toolInput });
          if (JSON.stringify(engine) !== JSON.stringify(spec)) {
            divergences.push(`cfg=${JSON.stringify(config)} tool=${toolName} input=${JSON.stringify(toolInput)} engine=${JSON.stringify(engine)} spec=${JSON.stringify(spec)}`);
          }
        }
      }
    }
  }
  assert.ok(configs.length >= 50 && cas >= 10000, `suspicious domain: ${configs.length} configs, ${cas} cases`);
  console.log(`  → source mcp: ${cas} cases`);
  assert.deepStrictEqual(divergences.slice(0, 5), [], `${divergences.length} divergence(s) on the mcp source`);
});

test('SPEC ⟷ ENGINE (source `skill`): EXHAUSTIVE conformance over the 3 dimensions', { timeout: 30000 }, () => {
  const entrees = [];
  const filterCombinations = [];
  for (const exclude of sousEnsembles(A)) for (const scope of sousEnsembles(A)) filterCombinations.push({ scope, exclude });
  for (const { scope, exclude } of filterCombinations) {
    const f = {};
    if (scope.length) f.scope = scope;
    if (exclude.length) f.exclude = exclude;
    // FILE dimension (flat match), SERVERS (3 granularities), TOOL (exact + wildcard)
    entrees.push({ match: ['aaa'], ...f });
    entrees.push({ servers: ['srv'], ...f });
    entrees.push({ servers: ['srv/outil'], ...f });
    entrees.push({ servers: ['srv/sub'], ...f });
    entrees.push({ tool: ['aaa', '*'], ...f });
    entrees.push({ tool: ['bbb'], ...f });
    // COMBINED dimensions: the union must stay a union.
    entrees.push({ match: ['aaa'], servers: ['srv'], tool: ['bbb'], ...f });
  }
  // per-entry `rules`: precedence over match/scope/exclude.
  entrees.push({ rules: [{ pattern: 'aaa', scope: ['bbb'] }, { pattern: 'ccc', exclude: ['bbb'] }] });
  entrees.push({ rules: [{ pattern: 'aaa', scope: [['aaa'], ['bbb']] }] });

  const config = { servers: { srv: { subToolParam: 'args.tool' } } };
  const divergences = [];
  let cas = 0;
  for (const entry of entrees) {
    for (const toolName of ['aaa', 'bbb', 'mcp__srv__outil', 'mcp__srv__autre', '']) {
      for (const toolInput of corpsDeGeste().concat([{ args: { tool: 'sub' } }])) {
        for (const cwd of [undefined, '/w/aaa', '/w/ccc']) {
          cas++;
          const cfg = { ...config, skills: { s: entry } };
          const engine = matchingSkills(cfg, { toolName, toolInput, cwd }).length > 0;
          const spec = skillInjects(entry, { toolName, toolInput, cwd }, cfg, { maxDepth: 20 });
          if (engine !== spec) divergences.push(`entry=${JSON.stringify(entry)} tool=${toolName} input=${JSON.stringify(toolInput)} cwd=${cwd} engine=${engine} spec=${spec}`);
        }
      }
    }
  }
  assert.ok(entrees.length >= 200 && cas >= 100000, `suspicious domain: ${entrees.length} entries, ${cas} cases`);
  console.log(`  → source skill: ${cas} cases`);
  assert.deepStrictEqual(divergences.slice(0, 5), [], `${divergences.length} divergence(s) on the skill source`);
});

test('NEGATIVE-CHECK (3 sources): each differential DETECTS the class of bug that motivates it', () => {
  // tool — a wildcard that would match an EMPTY name (a degraded payload ⇒ every wildcard doc).
  assert.strictEqual(toolInjects({ tool: ['*'], scope: [] }, { toolName: '', toolInput: {} }, {}), false);
  // mcp — a `../evil` sub-tool that would compose a path OUTSIDE docs/mcp/.
  const cfg = { servers: { srv: { subToolParam: 'args.tool' } } };
  assert.deepStrictEqual(
    mcpCandidates(cfg, { toolName: 'mcp__srv__outil', toolInput: { args: { tool: '../evil' } } }),
    ['mcp/srv.md', 'mcp/srv/outil.md'],
    'the unsafe segment must produce NO candidate');
  // skill — THE bug ㊴: the `servers` dimension ignoring the filters.
  const entry = { servers: ['srv'], exclude: ['aaa'] };
  assert.strictEqual(
    skillInjects(entry, { toolName: 'mcp__srv__outil', toolInput: { file_path: '/x/aaa' } }, cfg, {}),
    false,
    '`servers` as all-or-nothing (filters ignored) = ㊴, the spec must refuse');
});

test('NEGATIVE-CHECK: the differential DETECTS a false semantics', () => {
  // 🛑 A differential one has never seen turn red proves nothing. Here we inject
  //    the OLD semantics of `exclude` (existential, evaluated per candidate) and we
  //    REQUIRE it to be rejected by the spec. If this test turns green on its own,
  //    it means the domain no longer produces the case — not that the bug has disappeared.
  const norm = (s) => String(s).toLowerCase().replace(/\\/g, '/');
  const previousExclude = (rule, candidateEntry) =>
    Array.isArray(rule.exclude) && rule.exclude.some((x) => norm(candidateEntry).includes(norm(x)));

  const rule = { pattern: 'aaa', doc: 'd.md', exclude: ['bbb'] };
  const geste = { toolName: 'Bash', toolInput: { command: 'cd ~/w/aaa && node bbb' } };
  // The fabricated fragment `~/w/aaa/node` does NOT contain `bbb`: the old
  // semantics therefore allowed through IT, even though the gesture contains `bbb`.
  assert.strictEqual(previousExclude(rule, '~/w/aaa/node'), false, 'the invented fragment did allow it through');
  assert.strictEqual(injects(rule, geste, { maxDepth: 20 }), false, 'the spec, for its part, refuses the whole gesture');
});
