// ═══════════════════════════════════════════════════════════════════════
// "skill" SOURCE — PURE. payload -> which skills to trigger by perimeter?
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ ZERO I/O (fs/path/process forbidden) — like sources/file.js: the condition
//    for Stryker to mutate without equivalent mutants. Sealed by .dependency-cruiser.
//
// ⚠️ ZERO MATCHING DUPLICATION: a skill's perimeter is matched EXACTLY
//    like a file doc (path, Bash command with `cd &&`, scope over all
//    the params). We REUSE `matchingDocs` from sources/file.js — never a
//    2nd implementation of the match. SAME VOCABULARY as the docs: `match` /
//    `scope` / `exclude` (the word `perimeter` = synonym removed on 18/07/2026 —
//    two names for the same primitive = vocabulary duplication, forbidden).
//
// ⚠️ THIS MODULE KNOWS NO HARNESS (gate sources-must-not-know-the-harness):
//    it answers "which skills?", it decides NOTHING and reads NOTHING. It is
//    the ADAPTER (source-adapters) that reads the skill's BODY and injects it
//    (maintainer decision 18/07/2026); `pointerBody` here = FALLBACK if the file is unreadable.
//
// ⚠️ Renaming the skill = the registry points into the void → sealed by
//    skill-registry-gate (a named skill = an existing file).
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const { matchingDocs, shouldSkip, inheritFilters } = require('./file');
// ⚠️ `targets` COMES FROM THE `tool` SOURCE — never rewritten here. It is THE function that
//    knows the `*` wildcard and its "non-empty tool name" guard; a 2nd copy
//    would diverge at the first special value added (anti-duplication law).
const { targets } = require('./tool');
const lib = require('../lib-pure');
// ⚠️ MODES/DRIFT_UNITS imported from frontmatter.js — SINGLE SOURCE of the cadence
//    vocabulary (a 2nd local list = a duplicate that drifts silently).
//    `toolList` = READING of the `tool:` declaration (string OR list), same parser
//    as the docs: that is what makes the parity EXACT and not "similar".
const { MODES, toolList, poseSettings } = require('../frontmatter');

// docId prefix RESERVED to this source (inter-source uniqueness, registry contract).
const DOC_PREFIX = 'skill/';

// Registry `config.skills` -> flat rules {pattern, doc, exclude?} for the
// shared matcher. One rule per perimeter pattern (doc = 'skill/{name}',
// natural dedup by matchingDocs = 1 pointer even if 2 patterns match).
function skillRules(config) {
  const skills = (config && config.skills) || {};
  // ⚠️ PER-SOURCE DEFAULT of the filters (20/08/2026) — resolved by `lib.heriterFiltres`,
  //    the SINGLE source shared with `loader.rulesOfDecl`. Read the WHY there: refusing this
  //    tier on 19/08 is what forced a 300-entry enumeration the next day.
  // 🛑 THIS FUNCTION REBUILDS A RULE FIELD BY FIELD, which is exactly how `keys` was born
  //    INERT on 8 skills out of 8. Any operator resolved elsewhere and not carried HERE is
  //    accepted by the schema and ignored by the engine (class ㊴).
  const sourceDefaults = (config && config.defaults && config.defaults.skill) || undefined;
  const rules = [];
  for (const name of Object.keys(skills)) {
    const entry = skills[name] || {};
    // ⚠️ `rules` = PER-ENTRY FORM (19/07/2026, PARITY with docs — real case: a
    //    multi-project skill with heterogeneous patterns, one scope per pattern). Mutually
    //    exclusive with match/scope/exclude (schema `not` = contradiction RED); at runtime
    //    it has PRECEDENCE (deterministic, never both).
    if (Array.isArray(entry.rules)) {
      // ⚠️ ZERO guard here: matchingDocs is the SOLE validation authority
      //    (non-string pattern → rule skipped, non-array scope/exclude →
      //    ignored). Re-checking here = duplicated guards = equivalent mutants.
      //    `{...null}` = {}: a null entry becomes a rule without a pattern,
      //    skipped downstream — totality without a conditional.
      for (const r of entry.rules) rules.push({ ...r, doc: DOC_PREFIX + name, ...inheritFilters(r, sourceDefaults) });
      continue;
    }
    const match = Array.isArray(entry.match) ? entry.match : [];
    for (const pattern of match) {
      if (typeof pattern !== 'string') continue;
      // 🔴 THIS USED TO REBUILD THE RULE FIELD BY FIELD — and `keys`, missing from that
      //    list, shipped INERT on 8 skills out of 8 (19/08/2026): any operator absent from
      //    a hand list is accepted by the schema and ignored by the engine (class ㊴).
      // ✅ 23/09/2026: the rule now carries WHATEVER `inheritFilters` resolves — the one
      //    place that knows each filter's inheritance (scope/exclude chosen, keys composed).
      //    Same shape as before, byte for byte: `keys` always present, `scope`/`exclude`
      //    only when set. A filter added there reaches this dimension with no edit here;
      //    `operator-consumption-gate.test.js` still PROBES every operator on every dimension.
      rules.push({ pattern, doc: DOC_PREFIX + name, ...inheritFilters(entry, sourceDefaults) });
    }
  }
  return rules;
}

// DIMENSION 1 — FILE perimeter: via the SAME matcher as the file source.
// ⚠️ `cwd` ADDED to the matchable params (18/07/2026, maintainer decision AFTER
//    a doc-first measurement: field COMMON to the hook contracts of Claude Code AND Codex —
//    a universal signal). Covers the real hole "`npm test` run INSIDE the project
//    carries no path". FAIL-SOFT: harness without cwd → previous behavior.
//    Specific to SKILLS (file docs do not see it — protect-files parity).
//    match/scope/exclude apply to cwd as to any param — same algebra.
function fileMatches(config, payload) {
  // ⚠️ NO typeof here: the validation "is cwd a string?" lives ONLY
  //    in extractFilePaths (sources/file.js) — re-checking it here = duplicated
  //    guard = equivalent mutant (avoid by CONSTRUCTION). We expose, it judges.
  const p = payload || {};
  return matchingDocs(skillRules(config), { ...p, toolInput: { ...(p.toolInput || {}), cwd: p.cwd } });
}

// DIMENSION 2 — MCP perimeter: a skill can list `servers`, at 3 GRAINS
// (same levels as the MCP docs, lib primitives REUSED — zero new match):
//   'mailer'            → any tool of the server (lib.serverName)
//   'mailer/send_mail'  → THAT precise tool (lib.toolSuffix)
//   'odoo/create_invoice'   → THAT sub-tool (lib.getByPath + servers.{s}.subToolParam)
function serverMatches(config, payload) {
  const server = lib.serverName(payload && payload.toolName);
  // ⚠️ Guard NECESSARY since the tool grain (18/07/2026): without it, the
  //    concatenation `server + '/' + suffix` would be the string 'null/null' —
  //    a pathological registry entry 'null/null' would then match any
  //    NON-MCP tool. Tested (no longer an equivalent mutant, unlike before).
  if (server == null) return [];
  const suffix = lib.toolSuffix(payload && payload.toolName, server);
  const subToolParam = config && config.servers && config.servers[server] && config.servers[server].subToolParam;
  // ⚠️ ONE SINGLE read of the payload, reused by `getByPath` AND by `shouldSkip`:
  //    two `(payload && payload.toolInput) || {}` side by side = two truths that
  //    would diverge at the first shape change. Single source, even here.
  const toolInput = (payload && payload.toolInput) || {};
  const subTool = lib.getByPath(toolInput, subToolParam);
  const subCandidate = subTool == null ? null : server + '/' + subTool;
  const skills = (config && config.skills) || {};
  const out = [];
  for (const name of Object.keys(skills)) {
    const entry = skills[name] || {};
    const servers = entry.servers;
    if (!Array.isArray(servers)) continue;
    // includes(null) = false: an absent subCand never matches (by construction).
    if (servers.includes(server) || servers.includes(server + '/' + suffix) || servers.includes(subCandidate)) {
      // ⚠️ ㊴ (12/08/2026) — `scope`/`exclude` NOW APPLY HERE TOO. They were
      //    IGNORED on this dimension: `servers: ["mailer"]` was ALL OR
      //    NOTHING, so a client's folder was injected while writing to ANY
      //    other client — measured as unusable, hence MCP perimeters never
      //    set. SAME context as the `tool` source (the TOOL NAME), SAME
      //    function (`file.shouldSkip`): the parity is EXACT, not similar.
      if (shouldSkip(entry, payload && payload.toolName, toolInput)) continue;
      out.push({ doc: DOC_PREFIX + name });
    }
  }
  return out;
}

// DIMENSION 3 — TOOL perimeter (㊴, 12/08/2026): `tool` = EXACT name of a native
// tool (+ `*` wildcard), SEMANTICS IDENTICAL to the docs — this is the recipe
// "trigger on a GESTURE, not on a PLACE", finally available to skills.
// 🛑 REASON FOR EXISTING, measured: a skill could NOT react to the CONTENT of a
//    parameter. `match` only sees PATHS, `scope` never triggers on its own
//    ⇒ a client's folder NEVER arrived on a gesture concerning it.
//    Real cost: a client email drafted without their folder, ~10 versions (11/08/2026).
// ⚠️ NO vocabulary word is created: `tool` already existed for the docs. We
//    extend its USAGE to a source that did not have it — the OR/AND/NOT base stays CLOSED.
function toolMatches(config, payload) {
  const skills = (config && config.skills) || {};
  const toolName = payload && payload.toolName;
  const toolInput = (payload && payload.toolInput) || {};
  const out = [];
  for (const name of Object.keys(skills)) {
    const entry = skills[name] || {};
    // ⚠️ ZERO shape guard here: `toolList` is TOTAL (string → [string], otherwise
    //    []) and `targets([], x)` = false. Re-checking = duplicated guard = equivalent
    //    mutant — we avoid by CONSTRUCTION, we never tolerate.
    if (!targets(toolList(entry), toolName)) continue;
    if (shouldSkip(entry, toolName, toolInput)) continue;
    out.push({ doc: DOC_PREFIX + name });
  }
  return out;
}

// payload -> triggered skills (refs {doc:'skill/{name}'}), UNION of the 3 dimensions
// (file THEN server THEN tool), deduplicated by doc. A skill matched by several
// dimensions = a single pointer.
function matchingSkills(config, payload) {
  const seen = new Set();
  const out = [];
  const foundOnes = fileMatches(config, payload)
    .concat(serverMatches(config, payload))
    .concat(toolMatches(config, payload));
  for (const m of foundOnes) {
    if (seen.has(m.doc)) continue;
    seen.add(m.doc);
    out.push(m);
  }
  return out;
}

// Cadence of a skill — ⚠️ THIS FUNCTION NO LONGER RESOLVES ANY CASCADE (04/08/2026).
// It SUPPLIES the registry entry, nothing else: a declared and valid key passes,
// everything else is OMITTED. The following stages — `defaults.skill`, the global, then the
// FRAMEWORK default ('once' for this source) — all live in gate.js, the UNIQUE
// cascade point.
//
// ⚠️ BEFORE, it resolved `config.skillDefaults` AND forced `mode: 'once'`. That was
//    a SECOND cascade point: the day a stage changes in gate.js, this one
//    stayed behind and skills obeyed a different rule than the docs,
//    silently. The rule "a source SUPPLIES, it resolves NOTHING" only existed
//    for driftUnit — it now holds for all three settings.
//
// ⚠️ `defaults` is no longer a parameter: removing it is INTENTIONAL, not an oversight.
//    Keeping it "just in case" would reopen exactly the double resolution above.
// ✅ THE KEY-BY-KEY COPY IS GONE (23/09/2026) — `frontmatter.poseSettings`, driven by the
//    setting registry, is the ONE body shared with `sources/mcp.js`. Same contract as before:
//    a valid key is POSED raw, an absent or invalid one is OMITTED, `false` passes (it is how
//    a skill OPTS OUT of a `defaults.skill.enforce`).
function declFor(entry) {
  return poseSettings(entry);
}

// docId 'skill/{name}' -> name of the skill. EXACT inverse of skillRules (same prefix).
function skillNameFromDoc(doc) {
  return String(doc).slice(DOC_PREFIX.length);
}

// FALLBACK only (skill file unreadable): a pointer that names the
// skill and orders its loading — the perimeter still signals even when reading fails.
// The nominal path = the skill's BODY, read and injected by the ADAPTER.
// Stryker disable StringLiteral: the pointer's TEXT is COMMUNICATION
//   (like the `hint`s of collisions.js). The semantics — the interpolated `name` and
//   the order to load via Skill — is tested (pointerBody test); the wording
//   around it is flavor: mutating it = EQUIVALENT mutants. NEVER extend this
//   disable to the LOGIC (skillRules/declFor), only to this text.
function pointerBody(name) {
  return (
    '# Project perimeter → load the skill `' + name + '`\n\n' +
    'You have entered the perimeter of the skill `' + name + '`. BEFORE acting: load it via the Skill tool — ' +
    'it carries the complete mental model of the project (SINGLE SOURCE). Never copy its content elsewhere.'
  );
}
// Stryker restore StringLiteral

module.exports = { skillRules, matchingSkills, serverMatches, toolMatches, declFor, skillNameFromDoc, pointerBody, DOC_PREFIX, MODES };
