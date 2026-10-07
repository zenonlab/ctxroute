// ═══════════════════════════════════════════════════════════════════════
// category-pure.js — WHAT a `category` declaration MEANS, and WHO is acting.
// ═══════════════════════════════════════════════════════════════════════
//
// `category` is the language's ONE word for WHO is acting. `match`/`scope`/
// `exclude` say WHAT the gesture contains and never see the agent's identity
// (observable-reach keeps `agent_id` blind to them, on purpose). This module
// holds the two halves of the WHO question:
//   ① the FACTS: the categories a context carries — the ones a policy DECLARED
//      plus the ones ctxroute DERIVES from the harness payload (identity);
//   ② the DECLARATION: what a doc's `category` value requires of those facts.
//
// ⚠️ PURE (zero fs/path/process): callers load the declared categories and hand
//    the payload; this module only decides.
//
// ── ① DERIVED IDENTITY (2026-10-07) ─────────────────────────────────────
// Read MECHANICALLY from fields the harness documents, never guessed:
//   `role:subagent`      the payload carries a non-empty `agent_id`;
//   `role:main`          it carries none AND the harness is known to send one
//                        for every sub-agent gesture (`sendsAgentId`) — without
//                        that knowledge an absence proves nothing, so NO role
//                        is emitted (tri-state: main / subagent / unknown);
//   `type:<agent_type>`  a sub-agent payload names its type.
// MEASURED 2026-10-07 on Claude Code (real `claude -p` capture): every
// PreToolUse of a sub-agent carries `agent_id` + `agent_type`, the main
// agent's carry neither; SubagentStart carries both. No harness names the
// PARENT of a sub-agent ⇒ there is NO `depth:` fact, and declaring one is
// refused (it would restrict a doc to a fact that never exists: mute forever).
// 🛑 Derived categories are computed PER GESTURE and never stored, so a
//    sub-agent never inherits its parent's identity (the declared ones keep
//    their inheritance, owned by the caller).
// 🛑 RESERVED NAMESPACES: `role:`, `type:`, `depth:` and a leading `-` belong to
//    the language. A DECLARED category spelled that way is dropped here (a
//    policy must never forge an identity) and refused by `validDeclaration`.
//
// ── ② THE DECLARATION ───────────────────────────────────────────────────
//   flat    `["a", "b"]`          one group: a OR b      (unchanged, 22/09)
//   grouped `[["a","b"], ["c"]]`  AND of groups          (same forms as `scope`)
//   negative `"-x"`               SUBTRACTS: the group fails when x is present
//   A group passes  ⇔  (no positive  OR  one positive is carried)
//                      AND  every negative is MEASURED and NOT carried.
//   The doc passes  ⇔  every group passes.
// 🛑 A NEGATIVE SUBTRACTS, IT NEVER JOINS THE OR. `["role:subagent", "-type:Explore"]`
//    means "sub-agents except Explore". Read as an OR it would mean "sub-agent OR
//    not Explore" and let the MAIN agent through — the inverse of the intent
//    (caught by review before a line was written). Same shape as `exclude` (∀¬).
// 🛑 FAIL-CLOSED, ONE RULE: an unmet positive excludes; a negative on a fact the
//    harness did not deliver excludes too — otherwise `-type:Explore` would leak
//    to an Explore agent whose type nobody could see.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const ROLES = ['main', 'subagent'];

/** The reserved namespace a category name lives in, or null for a declared name. */
function namespaceOf(name) {
  const m = /^(role|type|depth):/.exec(name);
  return m ? m[1] : null;
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim() !== '';
}

/**
 * The groups a declaration stands for — READ TOLERANTLY, exactly as the 22/09
 * flat form always was: blanks and non-strings are dropped, never an error here
 * (`["  ", "ops"]` still means `["ops"]`; FORM errors are `declarationError`'s job).
 * A lone string is a flat list of one. Null when nothing usable is left, or when
 * the form is AMBIGUOUS (lists mixed with strings — the ambiguity `scope` refuses).
 * @param {unknown} raw
 * @returns {string[][]|null}
 */
function groupsOf(raw) {
  const clean = (list) => list.filter(isNonEmptyString);
  if (typeof raw === 'string') return isNonEmptyString(raw) ? [[raw]] : null;
  if (!Array.isArray(raw)) return null;
  const lists = raw.filter(Array.isArray);
  if (lists.length === 0) {
    const flat = clean(raw);
    return flat.length > 0 ? [flat] : null;
  }
  if (lists.length !== raw.length) return null;
  const groups = lists.map(clean);
  return groups.every((g) => g.length > 0) ? groups : null;
}

/** Splits a literal into its polarity and its category name. */
function literal(lit) {
  return lit.startsWith('-') ? { negative: true, name: lit.slice(1) } : { negative: false, name: lit };
}

/** Why one literal can never be satisfied, or null. */
function literalError(lit) {
  const { name } = literal(lit);
  if (!isNonEmptyString(name)) return `"${lit}": a negative needs a category after "-"`;
  if (name.startsWith('-')) return `"${lit}": a negative is written with ONE leading "-"`;
  const ns = namespaceOf(name);
  if (ns === 'depth') return `"${lit}": no harness names a sub-agent's parent, so no depth fact ever exists`;
  if (ns === 'role' && !ROLES.includes(name.slice('role:'.length))) return `"${lit}": a role is role:main or role:subagent`;
  if (ns === 'type' && !isNonEmptyString(name.slice('type:'.length))) return `"${lit}": a type needs a name after "type:"`;
  return null;
}

const FORM = 'empty or badly typed (a non-empty string, a list of them, or a list of non-empty lists of them — never both forms mixed)';

/**
 * Why an AUTHOR's declaration is refused, or null when it is valid. STRICT where
 * `groupsOf` is tolerant (a blank element is a typo the author must see), and
 * every literal must be satisfiable: anything else would restrict a doc to a fact
 * that never exists — muted forever, in silence.
 * @param {unknown} raw
 * @returns {string|null}
 */
function declarationError(raw) {
  const groups = groupsOf(raw);
  // `groupsOf` already refuses a blank string, a non-list, a mixed form and an empty group;
  // what it READS PAST — a blank or non-string element of a list — is refused here.
  if (!groups || (Array.isArray(raw) && !raw.flat().every(isNonEmptyString))) return FORM;
  for (const group of groups) {
    for (const lit of group) {
      const e = literalError(lit);
      if (e) return e;
    }
  }
  return null;
}

/**
 * The normalised groups a declaration resolves to, or undefined (absent, or no
 * satisfiable literal form) — the shape a cascade stage offers. TOLERANT like
 * `groupsOf` on blanks (22/09 parity), never on meaning: an unsatisfiable literal
 * offers nothing, so the stage goes down instead of muting the doc.
 * @param {unknown} raw
 * @returns {string[][]|undefined}
 */
function takeDeclaration(raw) {
  const groups = groupsOf(raw);
  if (!groups) return undefined;
  return groups.every((g) => g.every((lit) => literalError(lit) === null)) ? groups : undefined;
}

/**
 * Why a declaration cannot hold in a SESSION doc, or null. A session doc is delivered when a
 * context STARTS, before any policy declared anything, so only IDENTITY can be known then: a
 * declared name would mute the doc (positive) or restrict nothing (negative).
 * Form errors are `declarationError`'s job; this says nothing about them.
 * @param {unknown} raw
 * @returns {string|null}
 */
function startError(raw) {
  const named = (groupsOf(raw) || []).flat().find((lit) => namespaceOf(literal(lit).name) === null);
  return named === undefined ? null : `"${named}": nothing is declared yet when a context starts — a session doc can only restrict by identity (role:, type:)`;
}

/**
 * The categories a context carries, and which namespaces are MEASURED.
 * @param {string[]} declared - what a policy declared (inheritance already applied)
 * @param {Object<string, unknown>} payload - the harness payload, as received
 * @param {{idField: string, typeField: string, sendsAgentId: boolean}} [identity] -
 *        `harness-profile.IDENTITY.<harness>`: WHERE this harness writes an agent's
 *        identity. Absent = an unknown harness: no identity is derived at all.
 * @returns {{categories: string[], measured: string[]}}
 */
function contextFacts(declared, payload, identity) {
  const p = payload || {};
  const id = /** @type {{idField?: string, typeField?: string, sendsAgentId?: boolean}} */ (identity || {});
  const own = (Array.isArray(declared) ? declared : [])
    .filter((c) => isNonEmptyString(c) && !c.startsWith('-') && namespaceOf(c) === null);
  const derived = [];
  const measured = [];
  if (isNonEmptyString(id.idField) && isNonEmptyString(p[id.idField])) {
    derived.push('role:subagent');
    measured.push('role');
    if (isNonEmptyString(id.typeField) && isNonEmptyString(p[id.typeField])) {
      derived.push('type:' + p[id.typeField]);
      measured.push('type');
    }
  } else if (isNonEmptyString(id.idField) && id.sendsAgentId === true) {
    // The main agent: its role is known, and so is the ABSENCE of a type.
    derived.push('role:main');
    measured.push('role', 'type');
  }
  return { categories: Array.from(new Set(own.concat(derived))), measured };
}

/**
 * Does a context satisfy a declaration's groups?
 * @param {string[][]} groups - from `takeDeclaration`
 * @param {{categories?: string[], measured?: string[]}} [facts] - from `contextFacts`
 * @returns {boolean}
 */
function admits(groups, facts) {
  // ⚠️ TOTAL: an absent context, or one built elsewhere than `contextFacts`, carries nothing
  //    (`new Set(undefined)` is empty) — fail-closed for every restriction, never a throw.
  const f = /** @type {{categories?: string[], measured?: string[]}} */ (facts || {});
  const carried = new Set(f.categories);
  const measured = new Set(f.measured);
  const known = (name) => {
    const ns = namespaceOf(name);
    return ns === null || measured.has(ns);
  };
  return groups.every((group) => {
    const lits = group.map(literal);
    const positives = lits.filter((l) => !l.negative);
    const positiveMet = positives.length === 0 || positives.some((l) => carried.has(l.name));
    return positiveMet && lits.filter((l) => l.negative).every((l) => known(l.name) && !carried.has(l.name));
  });
}

/**
 * Does a declaration name an IDENTITY fact? Its exclusions are the expected
 * shape of the fleet (a main-only doc leaves every sub-agent), never news worth a badge.
 * @param {string[][]} groups
 */
function namesIdentity(groups) {
  return groups.some((g) => g.some((lit) => namespaceOf(literal(lit).name) !== null));
}

module.exports = { namespaceOf, groupsOf, declarationError, takeDeclaration, startError, contextFacts, admits, namesIdentity };
