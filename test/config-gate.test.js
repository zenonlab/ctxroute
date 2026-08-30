// ═══════════════════════════════════════════════════════════════════════
// GATE — the COMMITTED config must be a config that WORKS (fail-closed)
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ NEVER DELETE NOR LOOSEN. REAL bug (found on 15/07/2026, present since
// the 1st commit): `ctxroute-config.json` was committed with FIXTURE values
// left behind by the integration tests (`filterMode: "whitelist"`,
// `filterList: ["testserver999"]`). Result: the framework ran, exited with
// exit(0) on every MCP call, injected NOTHING for stripe/odoo — so the Stripe
// incident that motivated this whole repo was NOT covered, for days, IN
// SILENCE. No test saw it: every test wrote its own config before running.
//
// LESSON: a hook that never injects is indistinguishable from an absent hook.
// This is the "job that dies in silence" — an ARCHITECTURE bug, not a detail.
// This gate is the dead-man switch: it asserts that the SHIPPED config really
// covers something, independently of what the tests fabricate.
//
// Run: `npx vitest run config-gate.test.js` (included in `npm test`).
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import lib from '../src/lib-pure.js';
// ⚠️ The operator list comes FROM THE ENGINE, never a copy: that is what makes the
//    shape-symmetry check cover an operator nobody has written yet.
import { RULE_KEYS } from '../src/frontmatter.js';

// Each ok(name, cond) = EXACTLY ONE vitest test (same name, same cond).
function ok(name, cond) {
  test(name, () => { assert.ok(cond, name); });
}

// ⚠️ HARDCODED PATHS, DELIBERATELY — NEVER go through paths.js here.
// paths.js honours CTXROUTE_CONFIG_PATH/CTXROUTE_DOCS_DIR (test overrides):
// this gate checks the file REALLY SHIPPED in the repo, so it must be BLIND
// to any environment override. Otherwise an env var lingering in the shell/CI
// would validate a different config from the one that goes to production —
// the gate would sabotage itself, exactly the bug it exists to catch.
// ⚠️ PUBLICATION (19/07/2026): ctxroute-config.json = USER config, gitignored
// (skill/project names = personal data). The repo ships
// ctxroute-config.json.example. This gate validates the REAL config if
// present (maintainer/installed machine), otherwise the .example (fresh
// clone/CI) — BOTH must always pass the same invariants.
const REAL_CONFIG = path.join(import.meta.dirname, '..', 'ctxroute-config.json');
const CONFIG_PATH = fs.existsSync(REAL_CONFIG)
  ? REAL_CONFIG
  : path.join(import.meta.dirname, '..', 'ctxroute-config.json.example');
const DOCS_DIR = path.join(import.meta.dirname, '..', 'docs', 'mcp');

// ── The config (real or shipped .example) must be readable and valid ──
let config = null;
try {
  config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
} catch { /* config stays null → the tests below fail cleanly */ }

ok('the config (ctxroute-config.json or the shipped .example) exists and is valid JSON', config !== null && typeof config === 'object');

if (config) {
  // ── The framework must be SWITCHED ON in the shipped config ──
  ok('shipped config: enabled !== false (framework active)', lib.isFrameworkEnabled(config));

  // ── GLOBAL "dumb" = test fixture, never a shipped default ──
  // (a doc in "dumb" stays legitimate — through ITS frontmatter, e.g. stripe.md.)
  ok('shipped config: global mode !== "dumb" (maximum noise = a debug value)', config.mode !== 'dumb');

  // ── ⚠️ THE HEART OF THE GATE: every server having a doc MUST be covered. ──
  // That is exactly what failed: whitelist ["testserver999"] excluded
  // stripe/odoo although their docs existed. A doc written but never injected
  // = worse than no doc (false sense of security).
  let documented = [];
  try {
    documented = fs.readdirSync(DOCS_DIR)
      .filter((f) => f.endsWith('.md') && !f.endsWith('.md.example'))
      .map((f) => f.slice(0, -3));
  } catch { /* no docs/mcp/ → empty list, nothing to guarantee */ }

  // ⚠️ NO "at least one documented server" check HERE — mistake made on
  // 15/07/2026, red on all 3 OSes in CI: `docs/mcp/*.md` is GITIGNORED
  // (personal docs), so a fresh checkout (CI, or anyone cloning) has NONE.
  // "Having docs" is an INSTALLATION invariant (→ doctor.js --settings), not a
  // REPO invariant. Do not confuse the two: a repo gate must hold on a fresh
  // clone, otherwise it is wrong for everybody except its author. Here, zero
  // docs ⇒ the loop below is empty and the gate passes: that is CORRECT
  // (nothing to cover).
  for (const server of documented) {
    ok(`documented server "${server}" is COVERED by the shipped config (filter)`, lib.isServerActive(config, server));
  }

  // ── No test-fixture residue may reach the repo ──
  const list = Array.isArray(config.filterList) ? config.filterList : [];
  ok('shipped config: no test-fixture residue in filterList',
    !list.some((s) => /^testserver|^concserver|^server[ab]$/i.test(s)));

}

// ── $schema DRIFT-TEST: the shipped config stays within the schema vocabulary ──
// ⚠️ A key outside the schema = the exact class of the testserver999 bug
//    (silent residue/typo, the hook ignores it without a word). No ajv (zero
//    dependency): we check the ENVELOPE (known keys, enum types) — the IDE
//    does the rest.
{
  const schema = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'ctxroute-config.schema.json'), 'utf8'));
  const knownKeys = Object.keys(schema.properties);
  for (const k of Object.keys(config)) {
    ok(`shipped config: key "${k}" known to the schema`, knownKeys.includes(k));
  }
  ok('shipped config: $schema points at the repo file', config.$schema === './ctxroute-config.schema.json');
  ok('schema: mode and filterMode stay closed enums',
    Array.isArray(schema.properties.mode.enum) && Array.isArray(schema.properties.filterMode.enum));
  const srvSchema = schema.properties.servers.additionalProperties;
  const srvKeys = Object.keys(srvSchema.properties);
  for (const [name, srv] of Object.entries(config.servers || {})) {
    for (const k of Object.keys(srv)) {
      ok(`shipped config: servers.${name}.${k} known to the schema`, srvKeys.includes(k));
    }
  }
  // ── ⚠️ ZERO DUPLICATION (maintainer decision 17/07/2026): the JSON NEVER
  //    carries a cadence — per-doc mode/threshold = the doc's frontmatter,
  //    ONLY. Two places for the same truth = the drift this repo fights.
  ok('schema: servers carries NO cadence (mode/threshold = the docs frontmatter)',
    !srvKeys.includes('mode') && !srvKeys.includes('threshold'));
}

// ── DRIFT-TEST on the frontmatter of the SHIPPED MCP docs (local install) ──
// ⚠️ Same bug class as `mach:` — a `mod: dumb` in docs/mcp/stripe.md would be
//    ignored IN SILENCE (global fallback): the cadence the author wanted
//    would not exist, without a word. Keys allowed here: mode/threshold ONLY
//    (an MCP doc is triggered by its PATH, never by match/mcp).
// ⚠️ docs/mcp/*.md is GITIGNORED → fresh clone = empty loop = gate passes
//    (installation invariant, same rule as the filter coverage above).
{
  // ⚠️ Judgement DELEGATED to frontmatter.validateMcp (the only authority,
  //    shared with doc-write-guard.js — 2 codes for 1 judgement = guaranteed
  //    divergence).
  const { parse, validateMcp } = await import('../src/frontmatter.js');
  const mdFiles = [];
  const walk = (dir) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { /* no docs/mcp */ }
    for (const e of entries) {
      if (e.isDirectory()) walk(path.join(dir, e.name));
      else if (e.name.endsWith('.md') && !e.name.endsWith('.md.example')) mdFiles.push(path.join(dir, e.name));
    }
  };
  walk(DOCS_DIR);
  for (const f of mdFiles) {
    const { data } = parse(fs.readFileSync(f, 'utf8'));
    const rel = path.relative(DOCS_DIR, f);
    const errs = validateMcp(data);
    ok(`MCP doc ${rel}: healthy frontmatter (${errs.join(' · ') || 'ok'})`, errs.length === 0);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// GATE — `defaults.{source}`: the allowed keys are DERIVED from the registry
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ BORN OF A REAL MISTAKE (04/08/2026, caught by the maintainer and not by
//    a machine — hence to be sealed): a `defaults.session` key had been
//    written into the schema. It would have been ACCEPTED and totally INERT:
//    `docs/session/` is not an engine source, it is delivered by
//    session-inject.js (SessionStart/PostCompact) which consults NEITHER
//    gate.decide NOR any cadence. Setting a `mode` on it would have done
//    nothing — that is the FALSE GREEN this repo killed on 31/07 on `mcp:`,
//    reappearing elsewhere. Cause: the skill listed `session` among the
//    sources (fixed).
//
// ⚠️ DERIVED, NEVER COPIED: the list comes from the ADAPTERS `id`s. Adding a
//    source to the registry opens its key automatically; removing one closes
//    its own. A hand-written list here would be a phantom in the making.
{
  const { createRequire } = await import('node:module');
  const req = createRequire(import.meta.url);
  const { ADAPTERS } = req('../src/source-adapters.js');
  const schema = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'ctxroute-config.schema.json'), 'utf8'));

  const sources = ADAPTERS.map((a) => a.id).sort();
  const declaredKeys = Object.keys(schema.properties.defaults.properties).sort();
  ok(`defaults gate: registry not empty (${sources.join(',')})`, sources.length >= 1);
  ok(`defaults gate: keys = exactly the registry sources (${declaredKeys.join(',')})`,
    JSON.stringify(declaredKeys) === JSON.stringify(sources));

  // The schema refuses any key outside the registry (otherwise the derivation
  // above would be cosmetic: an unknown key would still get through).
  ok('defaults gate: additionalProperties false', schema.properties.defaults.additionalProperties === false);

  // ⚠️ `skillDefaults` REMOVED (generalised into defaults.skill): two words
  //    for the SAME stage = anti-synonym law violated, and two truths that drift.
  ok('defaults gate: skillDefaults removed (replaced by defaults.skill)',
    !('skillDefaults' in schema.properties));

  // Each source points at the SAME cadence vocabulary (one concept, one word).
  for (const s of sources) {
    ok(`defaults gate: ${s} -> definitions/cadence`,
      schema.properties.defaults.properties[s].$ref === '#/definitions/cadence');
  }

  // ⚠️ MANDATORY NEGATIVE-CHECK — a gate never seen going red is false
  //    confidence. We replay the SAME comparison on an IN-MEMORY copy of the
  //    schema, enriched with the exact key that caused the 04/08 mistake.
  //    ⚠️ NEVER on the real file: other suites read it IN PARALLEL (38 tests
  //    fell on 04/08 for a sabotage on a live file).
  const verdict = (declaredKeysAgain) => JSON.stringify([...declaredKeysAgain].sort()) === JSON.stringify(sources);
  ok('defaults gate: NEGATIVE-CHECK — a key outside the registry (session) makes it GO RED',
    verdict([...declaredKeys, 'session']) === false);
  ok('defaults gate: NEGATIVE-CHECK — a source REMOVED from the schema makes it GO RED',
    verdict(declaredKeys.slice(1)) === false);
  ok('defaults gate: the same verdict is GREEN on the real keys (otherwise the check proves nothing)',
    verdict(declaredKeys) === true);
}

// ═══════════════════════════════════════════════════════════════════════
// GATE — the JSON examples of the README MUST be VALID configs
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ REAL bug (found on 04/08/2026 by /stack-audit, present since
//    17/07/2026 — 18 days): the README taught
//    `servers: { stripe: { threshold: 1, mode: "dumb" } }` while the
//    per-server cadence had been REMOVED from the schema. A user copying the
//    welcome example got a REJECTED config. On a PUBLIC repository, that is
//    the first thing a newcomer reads.
//
// ⚠️ The error class = "the doc drifts from the code". A review does not
//    close it (it survived 18 days): this gate makes it IMPOSSIBLE. Every
//    config example of the README is confronted with the schema, key by key.
{
  const readme = fs.readFileSync(path.join(import.meta.dirname, '..', 'README.md'), 'utf8');
  const schema = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'ctxroute-config.schema.json'), 'utf8'));

  // ```json blocks of the README that look like a config (known top-level key).
  const blocs = [...readme.matchAll(/```json\s*\n([\s\S]*?)```/g)].map((m) => m[1]);
  const known = Object.keys(schema.properties);
  const configs = [];
  for (const b of blocs) {
    let o = null;
    try { o = JSON.parse(b); } catch { continue; }   // non-JSON doc excerpt: ignored
    if (o && typeof o === 'object' && !Array.isArray(o)
      && Object.keys(o).some((k) => known.includes(k))) configs.push(o);
  }
  ok(`README: at least one config example detected (${configs.length})`, configs.length >= 1);

  for (const [i, cfg] of configs.entries()) {
    for (const k of Object.keys(cfg)) {
      ok(`README ex.${i}: key \`${k}\` exists in the schema`, known.includes(k));
    }
    // `servers.{name}`: STRUCTURAL settings only — that is where the bug was.
    for (const [name, v] of Object.entries(cfg.servers || {})) {
      const admitted = Object.keys(schema.properties.servers.additionalProperties.properties);
      for (const k of Object.keys(v || {})) {
        ok(`README ex.${i}: servers.${name}.${k} allowed (${admitted.join(',')})`, admitted.includes(k));
      }
    }
    // `defaults.{source}`: only the registry sources.
    const srcOk = Object.keys(schema.properties.defaults.properties);
    for (const k of Object.keys(cfg.defaults || {})) {
      ok(`README ex.${i}: defaults.${k} is a real source`, srcOk.includes(k));
    }
  }

  // ⚠️ NEGATIVE-CHECK: the gate MUST go red on the exact example that lied for 18 days.
  const admittedSrv = Object.keys(schema.properties.servers.additionalProperties.properties);
  ok('README: NEGATIVE-CHECK — the old example (servers.stripe.mode) would be REJECTED',
    !admittedSrv.includes('mode') && !admittedSrv.includes('threshold'));
  ok('README: NEGATIVE-CHECK — an invented top-level key would be REJECTED',
    !known.includes('cadenceGlobale'));
}

// ═══════════════════════════════════════════════════════════════════════
// ㊺① — **SHAPE** SYMMETRY GATE (14/08/2026), the part that was missing.
// 🛑 WHY IT EXISTS, written in the backlog BEFORE being delivered: the
//    vocabulary symmetry gates probe the PRESENCE of a key in the 4 corpora,
//    NEVER its SHAPE. `frontmatter.validate` (docs) and this schema (skills)
//    are therefore TWO declarations of the same shape, and a shape allowed on
//    one side and refused on the other would go UNNOTICED — that is exactly
//    class ㊴.
// ⚠️ HONEST SCOPE: this does not PROVE the equivalence of the two validators
//    (that would require executing the schema, hence ajv, hence a dependency
//    for a gate). It proves that BOTH shapes of the language are declared on
//    BOTH sides and that the schema does not offer a third. That is decidable,
//    hence mechanical.
{
  const schema = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'ctxroute-config.schema.json'), 'utf8'));
  const skills = schema.properties.skills.additionalProperties;
  const scopeSkill = skills.properties.scope;
  const scopeRule = skills.properties.rules.items.properties.scope;

  ok('㊺① schema: `scope` declares the SAME shape at skill level and per-entry (single source)',
    JSON.stringify(scopeSkill) === JSON.stringify(scopeRule));
  ok('㊺① schema: `scope` = EXACTLY 2 shapes (flat = OR, grouped = AND of OR) — never a 3rd',
    Array.isArray(scopeSkill.oneOf) && scopeSkill.oneOf.length === 2);
  ok('㊺① schema: the FLAT shape is a list of NON-EMPTY strings',
    scopeSkill.oneOf[0].items.type === 'string' && scopeSkill.oneOf[0].items.minLength === 1);
  ok('㊺① schema: the GROUPED shape is a list of lists of NON-EMPTY strings, NON-EMPTY groups',
    scopeSkill.oneOf[1].items.type === 'array' && scopeSkill.oneOf[1].items.minItems === 1
    && scopeSkill.oneOf[1].items.items.type === 'string' && scopeSkill.oneOf[1].items.items.minLength === 1);
  ok('㊺① schema: `oneOf` (never `anyOf`) — it is what REFUSES the MIXED shape, the real danger',
    !('anyOf' in scopeSkill) && !('type' in scopeSkill));
  ok('㊺① schema: `exclude` DOES NOT OFFER the grouped shape (∀¬ over a single universe, ㊼)',
    skills.properties.exclude.items.type === 'string' && !('oneOf' in skills.properties.exclude));

  // 🔴 DERIVED, NOT NAMED (19/08/2026) — the check above named `scope`, so `keys` slipped
  //    through: declared at SKILL level and ABSENT from `rules.items`, whose
  //    `additionalProperties:false` therefore REFUSED a capability the engine HONOURS.
  //    The mirror image of class ㊴: not "accepted and inert" but "works and forbidden" —
  //    a config the author writes correctly, rejected by config-gate for no reason.
  // ⚠️ The list comes from the SCHEMA ITSELF (whatever is declared at skill level and also
  //    lives in RULE_KEYS), so the NEXT operator is covered without anyone editing this file.
  {
    // ⚠️ We compare the SHAPE, never the prose: a `description` present on one side only is
    //    documentation, not a divergence — and a gate that reds on wording gets ignored, then
    //    bypassed. Measured on the first run: `exclude` differed by its description ALONE.
    const forme = (n) => JSON.stringify(n, (k, v) => (k === 'description' ? undefined : v));
    const operators = RULE_KEYS.filter((k) => k !== 'pattern' && k in skills.properties);
    ok('㊺① derivation is not empty (a filter that matches nothing would certify emptiness)',
      operators.length >= 3);
    for (const op of operators) {
      const auSkill = skills.properties[op];
      const parEntree = skills.properties.rules.items.properties[op];
      ok(`㊺① schema: \`${op}\` is declared per-entry too (an operator refused there is a capability lost)`,
        parEntree !== undefined);
      ok(`㊺① schema: \`${op}\` declares the IDENTICAL shape at both levels (single source)`,
        forme(auSkill) === forme(parEntree));
    }
  }

  // NEGATIVE-CHECK: the assertions above are not true "by accident".
  ok('㊺① NEGATIVE-CHECK — a 3-branch shape would be REFUSED by this gate',
    ![{}, {}, {}].length === false && scopeSkill.oneOf.length !== 3);
}
