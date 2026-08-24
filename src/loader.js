// ═══════════════════════════════════════════════════════════════════════
// LOADER — PURE. Corpus of docs (frontmatters) -> ordered rules for the file source.
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ ZERO I/O (gate `loader-must-stay-pure`). The caller reads the files and passes
//    [{ doc, text }]; this module decides. Same doctrine as lib-pure/sources/frontmatter.
//
// ⚠️ THIS IS THE PIECE THAT REPLACES protected-paths.json AFTER THE SWITCHOVER: from the
//    frontmatters written by the 16/07/2026 migration it rebuilds the flat list of
//    rules that `sources/file.js` consumes. Any divergence of ORDER or of CONTENT with
//    the JSON = silent regression → sealed by `loader-differential.test.js`
//    (in-process, corpus derived from the real rules) THEN by the shadow (real traffic).
//
// ⚠️ ORDER: sorted by ascending `rank` (the parent→child order inherited from the JSON
//    index, measured then kept — cf REFACTOR-PLAN). Docs WITHOUT a rank (created after
//    the migration): AFTER all the ranked ones, in alphabetical order (deterministic,
//    decision carved into the plan on 16/07/2026). On equal rank, alphabetical too
//    (stable cross-fs).
//
// ⚠️ FAIL-OPEN doc by doc: a doc without frontmatter, invalid, or triggered
//    otherwise (`mcp:`, `inject: never`) is simply IGNORED here — never a throw
//    (one malformed .md must never kill the injection of the 301 others). The LOUD
//    detection of invalid docs = the role of the lint (SessionStart), not of the hot path.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const { parse, validate } = require('./frontmatter');
// ⚠️ The filter cascade is resolved WHERE its ADJUST/REPLACE decision lives (`sources/file.js`).
//    A second reading of the same rule elsewhere is how ㊱ and ㊳ were born.
const { inheritFilters } = require('./sources/file.js');

// One declaration -> its flat rules { pattern, doc, scope?, exclude?, keys? }.
// ⚠️ Reproduces EXACTLY the inverse semantics of migrate.declaration():
//    `match` + doc-level scope/exclude (homogeneous) OR per-entry `rules` (divergent).
// 🔴 **THIS FUNCTION IS THE ONLY ROAD FROM A WRITTEN FRONTMATTER TO A DECISION, AND ANY
//    OPERATOR MISSING HERE IS INERT IN THE WHOLE CORPUS.** Measured 19/08/2026: `keys`
//    shipped with a schema, a validator, a dedicated suite, 959 green tests and 100 %
//    mutation, and was dropped HERE — so it worked only on rules built by hand, i.e. only
//    in tests. **An operator proven on a hand-built rule is not proven at all**: the gate
//    that guards this class (`operator-consumption-gate`) therefore goes THROUGH the real
//    corpus path, never through a literal rule object.
// ⚠️ `keys` is propagated WITHOUT a shape check, unlike its neighbours: `keyDecision` is
//    TOTAL (a string, a null, an absent key all mean "no narrowing"), so a guard here would
//    decide nothing and survive as an equivalent mutant — the same arbitration as in
//    `sources/skill.js::skillRules`.
// ⚠️ THE FILTER CASCADE IS **NOT** RESOLVED HERE — `lib.heriterFiltres` is its SINGLE
//    SOURCE, shared with `sources/skill.js`. Two copies of one cascade diverge, and this
//    project has already paid that exact bill twice (㊱, ㊳). Read the WHY there.
/**
 * One declaration -> its rules. THE ONLY ROAD from a written frontmatter to a decision.
 *
 * @param {any} data - the parsed frontmatter (a THIRD-PARTY shape: total parsing, never a schema here).
 * @param {string} doc - the document id.
 * @param {{scope?: Array, exclude?: Array, keys?: any}} [sourceDefaults] - PER-SOURCE default of the
 *   filters (`config.defaults.{source}`). Absent = no default; the resolution itself belongs
 *   to `lib.heriterFiltres`, never to this function.
 * @returns {Array<{pattern: any, doc: string, keys?: any, scope?: Array, exclude?: Array, rank?: number}>}
 */
function rulesOfDecl(data, doc, sourceDefaults) {
  if (Array.isArray(data.rules)) {
    return data.rules.map((r) => {
      /** @type {{pattern: any, doc: string, keys?: any, scope?: Array, exclude?: Array, rank?: number}} */
      const out = { pattern: r.pattern, doc, ...inheritFilters(r, sourceDefaults) };
      // PER-ENTRY rank (interleaved docs): the rule carries its exact JSON index.
      if (typeof r.rank === 'number') out.rank = r.rank;
      return out;
    });
  }
  if (data.match === undefined) return [];
  const patterns = Array.isArray(data.match) ? data.match : [data.match];
  return patterns.map((p) => {
    const out = { pattern: String(p), doc, ...inheritFilters(data, sourceDefaults) };
    return out;
  });
}

/**
 * Corpus -> ordered flat rules, ready for matchingDocs().
 * @param {Array<{doc: string, text: string}>} docs - raw content of each .md
 * @param {{scope?: Array, exclude?: Array, keys?: any}} [sourceDefaults] - PER-SOURCE default of the
 *   filters, POSED by the adapter (`config.defaults.{source}`) and resolved once, downstream.
 *   Optional by contract: every caller that has no config (lint, collisions, explain, the reach
 *   instrument) must keep working unchanged — an optional tier is one that costs nothing to
 *   whoever does not use it.
 * @returns {Array<{pattern, doc, scope?, exclude?, keys?}>}
 *   ⚠️ `keys` is ALWAYS present (possibly undefined) — see `rulesOfDecl`. Omitting it from
 *   this contract is what turned the CI red on 19/08/2026: `tsc` infers the rule's shape
 *   FROM HERE, so every consumer reading `r.keys` became a type error while the runtime
 *   was perfectly correct. A JSDoc is a VERIFIED CONTRACT, and this is the third lying one
 *   caught on this operator alone (textValues, injects, and now this).
 */
function rulesFromCorpus(docs, sourceDefaults) {
  if (!Array.isArray(docs)) return [];
  const groups = [];
  for (const d of docs) {
    // ⚠️ NO check on d.text: parse() is TOTAL (non-string → data {} → validate
    //    red → skip). Nor a `hasFrontmatter` guard: same reason. Redundant guards
    //    = equivalent mutants — we avoid them by construction, we never tolerate them.
    if (!d || typeof d.doc !== 'string') continue;
    const { data } = parse(d.text);
    if (validate(data).length > 0) continue; // invalid = inert HERE, RED at the lint.
    const rules = rulesOfDecl(data, d.doc, sourceDefaults);
    // ⚠️ NO `rules.length === 0` guard: an empty group emits nothing at the flatten —
    //    same output, one guard less (a `mcp:`-only doc / `inject: never` are harmless).
    groups.push({ rank: typeof data.rank === 'number' ? data.rank : Infinity, doc: d.doc, rules });
  }
  // ⚠️ SORT BY RULE, never by doc: 23 INTERLEAVED docs (rules scattered through
  //    the JSON among those of other docs) — a per-group sort inverted the order
  //    of evaluation (real divergence caught by the loader differential on 16/07).
  //    Effective rank of a rule = its own `rank` (interleaved), otherwise the
  //    group's. Tie-break: doc alpha (deterministic) then declared local order.
  //    The LOCAL order (entries of a same doc) is carried by the STABILITY of the sort
  //    (ES2019 spec guarantee) — an explicit `i` tie-break would be redundant (= equivalent
  //    mutants). Two docs WITHOUT a rank: Infinity-Infinity = NaN (falsy) → alpha tie.
  const flat = [];
  groups.forEach((g) => {
    g.rules.forEach((r) => {
      flat.push({ r, rank: typeof r.rank === 'number' ? r.rank : g.rank, doc: g.doc });
    });
  });
  // Stryker disable next-line ConditionalExpression,EqualityOperator: the `> ? 1 : 0` branch is
  // structurally UNOBSERVABLE (proven 16/07/2026, 2 runs + analysis): a comparison sort only
  // consumes NEGATIVITY (the `<` of the reverse direction fixes any badly ordered pair; 0 vs 1
  // fall on the same side of `< 0`). Do NOT "simplify" the branch for all that: a real 0 for
  // different docs would rely on stability instead of order — fragile to an algorithm change.
  flat.sort((a, b) => (a.rank - b.rank) || (a.doc < b.doc ? -1 : a.doc > b.doc ? 1 : 0));
  // The entry rank served the sort — the flat rule stays minimal. UNCONDITIONAL
  // destructuring: a preceding `if (rank)` would be an equivalent mutant (the copy
  // without rank is identical when there is none).
  return flat.map(({ r }) => {
    const { rank, ...rest } = r;
    return rest;
  });
}

module.exports = { rulesFromCorpus, rulesOfDecl };
