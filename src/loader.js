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

// One declaration -> its flat rules { pattern, doc, scope?, exclude? }.
// ⚠️ Reproduces EXACTLY the inverse semantics of migrate.declaration():
//    `match` + doc-level scope/exclude (homogeneous) OR per-entry `rules` (divergent).
function rulesOfDecl(data, doc) {
  if (Array.isArray(data.rules)) {
    return data.rules.map((r) => {
      const out = { pattern: r.pattern, doc };
      if (Array.isArray(r.scope) && r.scope.length) out.scope = r.scope;
      if (Array.isArray(r.exclude) && r.exclude.length) out.exclude = r.exclude;
      // PER-ENTRY rank (interleaved docs): the rule carries its exact JSON index.
      if (typeof r.rank === 'number') out.rank = r.rank;
      return out;
    });
  }
  if (data.match === undefined) return [];
  const patterns = Array.isArray(data.match) ? data.match : [data.match];
  return patterns.map((p) => {
    const out = { pattern: String(p), doc };
    if (Array.isArray(data.scope) && data.scope.length) out.scope = data.scope;
    if (Array.isArray(data.exclude) && data.exclude.length) out.exclude = data.exclude;
    return out;
  });
}

/**
 * Corpus -> ordered flat rules, ready for matchingDocs().
 * @param {Array<{doc: string, text: string}>} docs - raw content of each .md
 * @returns {Array<{pattern, doc, scope?, exclude?}>}
 */
function rulesFromCorpus(docs) {
  if (!Array.isArray(docs)) return [];
  const groupes = [];
  for (const d of docs) {
    // ⚠️ NO check on d.text: parse() is TOTAL (non-string → data {} → validate
    //    red → skip). Nor a `hasFrontmatter` guard: same reason. Redundant guards
    //    = equivalent mutants — we avoid them by construction, we never tolerate them.
    if (!d || typeof d.doc !== 'string') continue;
    const { data } = parse(d.text);
    if (validate(data).length > 0) continue; // invalid = inert HERE, RED at the lint.
    const rules = rulesOfDecl(data, d.doc);
    // ⚠️ NO `rules.length === 0` guard: an empty group emits nothing at the flatten —
    //    same output, one guard less (a `mcp:`-only doc / `inject: never` are harmless).
    groupes.push({ rank: typeof data.rank === 'number' ? data.rank : Infinity, doc: d.doc, rules });
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
  groupes.forEach((g) => {
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
