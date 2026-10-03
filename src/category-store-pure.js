// ═══════════════════════════════════════════════════════════════════════
// category-store-pure.js — PURE state for "which categories does THIS
// session carry?" (`category`'s own state, session-store shape).
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ SAME SHAPE AS EVERY OTHER PER-SCOPE STATE HERE (`doc-seen-`, `turn-count-`):
//    ONE state object PER SCOPE (`lib.scopeId(session_id, agent_id)`), loaded
//    and saved by the caller through `session-store.js`'s `loadState(prefix,
//    scopeId)`/`saveState(prefix, scopeId, state)` — never a multi-session map
//    held in one file. This module never touches disk: it only decides what a
//    valid state LOOKS LIKE, given one already loaded.
// 🛑 AN EARLIER DRAFT OF THIS FILE HELD A SINGLE OBJECT KEYED BY EVERY SESSION,
//    with its OWN eviction ceiling — a DIFFERENT storage model from the rest of
//    the engine, invented before this module had a real caller. Corrected
//    2026-09-22, before wiring: bounding lives ONE place
//    (`state-eviction-pure.js`'s `DURABLE_PREFIXES`, which already sweeps every
//    per-scope file across the fleet), never reinvented per store.
//
// ⚠️ WHO SETS A SESSION'S CATEGORIES is DELIBERATELY OUT OF SCOPE HERE: this
//    repo (`ctxroute`) ships the NEUTRAL primitive only. A mandatory-reason
//    self-tag, a human command, or a launcher flag are OPINIONS about HOW a
//    category gets attributed — that belongs in a policies layer (same split
//    as `ctxroute` vs `ctxroute-policies` for the `cd` wall), never in this
//    engine. `withCategories` below is therefore a bare, unopinionated
//    transform: no reason, no audit trail, no validation beyond shape.
//
// ⚠️ PURE (zero fs/path/process): the caller reads/writes the file, this
//    module only shapes the plain object in and out.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

/**
 * Categories declared for the scope THIS state belongs to. Never `undefined`,
 * never a shared reference into the state (a caller mutating the result must
 * not corrupt what would be persisted).
 * @param {{categories?: string[]}} state - one scope's state, as `loadState` returns it
 * @returns {string[]}
 */
function categoriesOf(state) {
  const s = state || {};
  return Array.isArray(s.categories)
    ? s.categories.filter((c) => typeof c === 'string' && c.trim() !== '')
    : [];
}

/**
 * The state to PERSIST for a new declaration of categories. TOTAL: never
 * throws on a malformed input (a caller passing garbage gets back "no
 * categories", never a crash).
 * ⚠️ `categories` is FILTERED to non-empty strings and DEDUPED — the state
 *    this returns must always round-trip through `categoriesOf` unchanged.
 * ⚠️ An EMPTY result is the EMPTY state `{}`, never `{categories: []}` — same
 *    convention as every other per-scope state here (`doc-seen-`'s `{}` means
 *    "nothing recorded"), so a scope that never declared a category and one
 *    that explicitly cleared it are indistinguishable, which is correct: both
 *    mean "no restriction from this session's side".
 * @param {string[]} categories
 * @returns {{categories: string[]}|{}}
 */
function withCategories(categories) {
  const clean = Array.isArray(categories)
    ? Array.from(new Set(categories.filter((c) => typeof c === 'string' && c.trim() !== '')))
    : [];
  return clean.length > 0 ? { categories: clean } : {};
}

module.exports = { categoriesOf, withCategories };
