// ═══════════════════════════════════════════════════════════════════════
// COLLISIONS — PURE CORE: crossings of the fleet's rules (analysis, not a gate).
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ INTEGRATED INTO THE ENGINE on 17/07/2026 (replaces ~/.claude/hooks/check-collisions.js
//    which read protected-paths.json — the transitional one). Source = the flat
//    rules of the loader (frontmatters), the ONLY lasting truth.
//
// ⚠️ INFORMATIVE ANALYSIS, NEVER A GATE: a crossing is NOT machine-decidable
//    (legitimate parent/child vs duplicate = semantics of the docs).
//    This module SORTS (3 levels) to reduce cognitive load — the final verdict
//    belongs to an AGENT (0-human: the machine sorts, an LLM decides, never the maintainer). NEVER wire it fail-closed.
//
// ⚠️ PURE (gate `collisions-must-stay-pure`): the shell check-collisions.js
//    reads the disk. A condition for mutating with Stryker without equivalent mutants.
//
// ⚠️ `excludeNeutralizes` MUST stay aligned with the path-only `.includes()`
//    semantics of sources/file.js (exclude matched against the path alone).
// ═══════════════════════════════════════════════════════════════════════

'use strict';

// Same normalisation as the match engine (backslash + case).
const norm = (s) => (s == null ? '' : String(s)).replace(/\\/g, '/').toLowerCase();

const isFolderPattern = (p) => norm(p).endsWith('/');

// Short P strictly contained in long P → every file matching the long one
// also matches the short one (2 docs injected together).
function isContained(short, long) {
  const s = norm(short);
  const l = norm(long);
  return s !== l && l.includes(s);
}

// Disjoint scopes = never injected together. Absence of scope = global.
function scopesOverlap(a, b) {
  const sa = Array.isArray(a.scope) && a.scope.length > 0 ? a.scope.map(norm) : null;
  const sb = Array.isArray(b.scope) && b.scope.length > 0 ? b.scope.map(norm) : null;
  if (sa === null || sb === null) return true;
  return sa.some((s) => sb.includes(s));
}

// The parent's exclude (short pattern) covers the child pattern → the parent is
// ALWAYS skipped on the child's files → collision neutralised.
function excludeNeutralizes(parent, child) {
  // ⚠️ NO `length === 0` guard: some([]) is already false — a redundant
  //    guard = equivalent mutant (avoid by construction).
  if (!Array.isArray(parent.exclude)) return false;
  const cp = norm(child.pattern);
  return parent.exclude.some((ex) => cp.includes(norm(ex)));
}

// Stryker disable StringLiteral: the `hint`s are COMMUNICATION (the sorting
// lives in `classification`) — mutating them = equivalent mutants, cf frontmatter.js.
/**
 * @param {Array<{pattern, doc, scope?, exclude?}>} rules - flat rules (loader).
 * @returns {Array<{classification, pattern_a, doc_a, scope_a, pattern_b, doc_b, scope_b, hint}>}
 *   classification: 'probable_parent_child' | 'ambiguous' | 'potential_duplicate'.
 */
function findCollisions(rules) {
  const collisions = [];
  // forEach (not an indexed for): a mutated `<=` bound would be EQUIVALENT
  // (phantom iteration with no body) — a class of mutant removed by construction.
  rules.forEach((a, i) => {
    for (let j = i + 1; j < rules.length; j++) {
      const b = rules[j];
      // Two patterns of the SAME doc = multi-pattern design, never a crossing.
      if (a.doc === b.doc) continue;

      let kind = null;
      let p1 = a;
      let p2 = b;
      if (isContained(a.pattern, b.pattern)) {
        kind = 'containment';
      } else if (isContained(b.pattern, a.pattern)) {
        kind = 'containment';
        p1 = b;
        p2 = a;
      } else if (norm(a.pattern) === norm(b.pattern)) {
        kind = 'same-pattern';
      }
      if (!kind) continue;
      if (!scopesOverlap(p1, p2)) continue;
      if (kind === 'containment' && excludeNeutralizes(p1, p2)) continue;

      let classification;
      let hint;
      if (kind === 'containment' && isFolderPattern(p1.pattern)) {
        classification = 'probable_parent_child';
        hint = `The folder pattern "${p1.pattern}" encompasses "${p2.pattern}". Often legitimate (parent context + child detail injected together).`;
      } else if (kind === 'containment') {
        classification = 'ambiguous';
        hint = `Pattern "${p1.pattern}" strictly contained in "${p2.pattern}". Duplicate or intentional parent/child?`;
      } else {
        classification = 'potential_duplicate';
        hint = `Two docs with the identical pattern "${p1.pattern}" and overlapping scopes. To be decided by an agent (0-human).`;
      }
      collisions.push({
        classification,
        pattern_a: p1.pattern,
        doc_a: p1.doc,
        scope_a: p1.scope || null,
        pattern_b: p2.pattern,
        doc_b: p2.doc,
        scope_b: p2.scope || null,
        hint,
      });
    }
  });
  return collisions;
}
// Stryker restore StringLiteral

// Bricks exported for DIRECT testing (perTest: mutating norm/overlap without going
// through findCollisions — applied to BOTH sides of the comparisons, their mutants
// would be invisible there). Not a public API: the gate only imports findCollisions.
module.exports = { findCollisions, norm, isContained, scopesOverlap, excludeNeutralizes, isFolderPattern };
