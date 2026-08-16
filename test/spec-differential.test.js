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
//    200 lines of engine. That is the whole gap between « we hope » and « we verify ».
// ⚠️ SMALL SCOPE HYPOTHESIS (Alloy, *small scope hypothesis*): a semantics
//    defect shows up on small cases. Assumed and written down, not hidden.
//
// 🛑 A DIVERGENCE IS NOT NECESSARILY AN ENGINE BUG: it says that the two
//    do not agree. You must DECIDE which one is right, and write down why.
//    NEVER « align the spec on the engine » to silence a red: that
//    would turn the judge into a twin, and lose the only net that watches
//    the semantics.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import { matchingDocs } from '../src/sources/file.js';
import { matchingDocs as moteurTool } from '../src/sources/tool.js';
import { matchingDocs as moteurMcp } from '../src/sources/mcp.js';
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
      out.push({ toolName: 'Read', toolInput: { file_path: `/x/${a}/f.js`, autre: b } });
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
      out.push({ toolName: 'mcp__srv__outil', toolInput: { args: { chemin: `/x/${a}`, mode: b } } });
      // ⚠️ BOUNDARY BETWEEN TWO PARAMS (53bis, 15/08/2026): a pattern WITH A SPACE must
      //    only match INSIDE a value, never straddling two adjacent
      //    values. Without these two forms (one straddling, the other contained),
      //    the class is UNREACHABLE and the differential blind — that is the
      //    hole the engine's `join(' ')` concatenation carried until now.
      out.push({ toolName: 'X', toolInput: { file_path: `/x/${a}`, u: `x ${a}`, v: `${b} y` } });
      out.push({ toolName: 'X', toolInput: { file_path: `/x/${a}`, u: `x ${a} ${b} y` } });
    }
  }
  return out;
}

// ── THE DOMAIN OF THE RULES — everything that can be written on these atoms.
function regles() {
  const out = [];
  const groupesPossibles = sousEnsembles(A).filter((g) => g.length > 0);
  // 53bis — patterns WITH A SPACE: that is the only writing that can straddle a
  // value boundary. Without them, the « inside ONE value » semantics is
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
      }
      // ㊺① — the GROUPED form is part of the language: omitting it here would measure
      // a semantics that is not ours.
      for (const combi of sousEnsembles(groupesPossibles)) {
        if (!combi.length) continue;
        const r = { pattern, doc: 'd.md', scope: combi };
        if (exclude.length) r.exclude = exclude;
        out.push(r);
      }
    }
  }
  return out;
}

test('SPEC ⟷ ENGINE: EXHAUSTIVE conformance over the whole domain', () => {
  const G = gestes();
  const R = regles();
  const divergences = [];
  for (const regle of R) {
    for (const geste of G) {
      const moteur = matchingDocs([regle], geste).length > 0;
      const spec = injects(regle, geste, { profondeurMax: 20 });
      if (moteur !== spec) {
        divergences.push(`rule=${JSON.stringify(regle)} gesture=${JSON.stringify(geste)} engine=${moteur} spec=${spec}`);
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
const NOMS_OUTIL = ['aaa', 'bbb', 'mcp__srv__outil', ''];
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

test('SPEC ⟷ ENGINE (source `tool`): EXHAUSTIVE conformance', () => {
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
    for (const toolName of NOMS_OUTIL) {
      for (const toolInput of corpsDeGeste()) {
        cas++;
        const moteur = moteurTool([{ doc: 'd.md', fm }], { toolName, toolInput }).length > 0;
        const spec = toolInjects(fm, { toolName, toolInput }, { profondeurMax: 20 });
        if (moteur !== spec) divergences.push(`fm=${JSON.stringify(fm)} tool=${toolName} input=${JSON.stringify(toolInput)} engine=${moteur} spec=${spec}`);
      }
    }
  }
  assert.ok(fms.length >= 200 && cas >= 10000, `suspicious domain: ${fms.length} rules, ${cas} cases`);
  console.log(`  → source tool: ${cas} cases`);
  assert.deepStrictEqual(divergences.slice(0, 5), [], `${divergences.length} divergence(s) on the tool source`);
});

test('SPEC ⟷ ENGINE (source `mcp`): EXHAUSTIVE conformance, order included', () => {
  // ⚠️ The order IS PART of the semantics (global → specific = the hierarchy
  //    lives in the path): we compare LISTS, never sets.
  const noms = ['mcp__srv__outil', 'mcp__srv__', 'mcp__srv', 'mcp__a_b__c', 'mcp__a.b__c', 'Read', '', 'mcp____x'];
  const sousOutils = ['sub', 'outil', '../evil', 'a/b', '.', 7, { obj: 1 }, null, undefined];
  const configs = [];
  for (const filterMode of [undefined, 'whitelist', 'blacklist', 'autre']) {
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
    for (const toolName of noms) {
      for (const sub of sousOutils) {
        for (const toolInput of [{ args: { tool: sub } }, { args: { deep: { tool: sub } } }, {}]) {
          cas++;
          const moteur = moteurMcp(config, { toolName, toolInput }).map((c) => c.doc);
          const spec = mcpCandidates(config, { toolName, toolInput });
          if (JSON.stringify(moteur) !== JSON.stringify(spec)) {
            divergences.push(`cfg=${JSON.stringify(config)} tool=${toolName} input=${JSON.stringify(toolInput)} engine=${JSON.stringify(moteur)} spec=${JSON.stringify(spec)}`);
          }
        }
      }
    }
  }
  assert.ok(configs.length >= 50 && cas >= 10000, `suspicious domain: ${configs.length} configs, ${cas} cases`);
  console.log(`  → source mcp: ${cas} cases`);
  assert.deepStrictEqual(divergences.slice(0, 5), [], `${divergences.length} divergence(s) on the mcp source`);
});

test('SPEC ⟷ ENGINE (source `skill`): EXHAUSTIVE conformance over the 3 dimensions', () => {
  const entrees = [];
  const filtresCombis = [];
  for (const exclude of sousEnsembles(A)) for (const scope of sousEnsembles(A)) filtresCombis.push({ scope, exclude });
  for (const { scope, exclude } of filtresCombis) {
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
          const moteur = matchingSkills(cfg, { toolName, toolInput, cwd }).length > 0;
          const spec = skillInjects(entry, { toolName, toolInput, cwd }, cfg, { profondeurMax: 20 });
          if (moteur !== spec) divergences.push(`entry=${JSON.stringify(entry)} tool=${toolName} input=${JSON.stringify(toolInput)} cwd=${cwd} engine=${moteur} spec=${spec}`);
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
  const ancienExclu = (regle, candidat) =>
    Array.isArray(regle.exclude) && regle.exclude.some((x) => norm(candidat).includes(norm(x)));

  const regle = { pattern: 'aaa', doc: 'd.md', exclude: ['bbb'] };
  const geste = { toolName: 'Bash', toolInput: { command: 'cd ~/w/aaa && node bbb' } };
  // The fabricated fragment `~/w/aaa/node` does NOT contain `bbb`: the old
  // semantics therefore allowed through IT, even though the gesture contains `bbb`.
  assert.strictEqual(ancienExclu(regle, '~/w/aaa/node'), false, 'the invented fragment did allow it through');
  assert.strictEqual(injects(regle, geste, { profondeurMax: 20 }), false, 'the spec, for its part, refuses the whole gesture');
});
