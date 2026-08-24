// ═══════════════════════════════════════════════════════════════════════
// scope-reach-pure.js — THE DECISION of the instrument, isolated from the I/O
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 WHY THIS FILE EXISTS AS A SEPARATE MODULE (2026-08-20, found by `/stack-audit`).
//    The first version put this logic INSIDE `tools/scope-reach.js`, an I/O shell —
//    so it was NOT mutated, and a SCANNER (code that interprets a format) shipped
//    with deterministic cases only. The repo does the opposite everywhere: `explain`
//    and `doctor` are shells, their decision lives in `src/` and IS mutated.
//    **Isolate the decision from the I/O BEFORE mutating** is the doctrine, and the
//    audit caught the violation in the very tool built to catch violations.
//
// 🛑 PURE: zero `fs`, zero `path`, zero clock. That is the CONDITION for mutating
//    without equivalent mutants, never a testing comfort.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const BACKSLASH = String.fromCharCode(92);

/** Same normalisation as the engine: lowercase + backslashes to slashes. */
function norm(s) {
  return String(s).toLowerCase().split(BACKSLASH).join('/');
}

/**
 * Flattens a `scope` into its literal patterns.
 * Flat form = OR, grouped form = AND of ORs — both are just literals here.
 * ⚠️ EMPTY STRINGS ARE DROPPED: `includes('')` is always true, so one would make
 *    EVERY tool name collide. Same rampart as the reaper's PATTERNS.
 */
function patterns(scope) {
  const out = [];
  const push = (v) => { if (typeof v === 'string' && v.length) out.push(v); };
  if (!Array.isArray(scope)) return out;
  for (const g of scope) { if (Array.isArray(g)) g.forEach(push); else push(g); }
  return out;
}

// The shape of a REAL tool call in the harness transcripts, MEASURED 2026-08-20.
const ANCHOR = '"type":"tool_use"';
// ⚠️ ONE regex instead of two "was it found?" guards: the guards were REAL (not
//    redundant) but their not-found branches are unobservable from the outside, so
//    they produced unkillable mutants. Doctrine: ELIMINATE by construction rather
//    than test dead ends. Regex mutants are excluded in this repo's Stryker config.
// 🛑 The NAME SHAPE is part of the pattern: an entry whose name is not an identifier
//    is simply not a tool call we can address.
const NAME = /"name":"([A-Za-z][A-Za-z0-9_-]*)"/;
// Bounded window: the `name` of an entry sits within a few dozen characters of its
// type. A whole-file JSON parse is out of the question — the corpus is 686 MB.
const WINDOW = 400;

/**
 * Tool names contained in one transcript text.
 *
 * 🛑 ANCHORED ON THE TOOL-USE ENTRY, never on a bare `"name"` field. MEASURED the
 *    day it was written: matching every `"name":` yielded 121 "tool names" and 343
 *    collisions, because SKILL and AGENT names live under the same key. A probe that
 *    looks right and counts the wrong population is worse than no probe — it would
 *    have condemned 343 innocent rules.
 * ⚠️ TOTAL: never throws, whatever the input. A transcript is a third party's format;
 *    a scanner that can throw takes the whole tool down on one malformed byte.
 *
 * @param {string} text
 * @returns {string[]} names, deduplicated, in order of first appearance
 */
function toolNamesFrom(text) {
  if (typeof text !== 'string') return [];
  const vus = new Set();
  let i = text.indexOf(ANCHOR);
  while (i !== -1) {
    const found = NAME.exec(text.slice(i, i + WINDOW));
    if (found) vus.add(found[1]);
    i = text.indexOf(ANCHOR, i + ANCHOR.length);
  }
  return [...vus];
}

/**
 * Does this `scope` pattern live INSIDE a real tool name?
 * That is the whole question work item 59 was decided on.
 */
function collides(motif, toolName) {
  const m = norm(motif);
  return m.length > 0 && norm(toolName).includes(m);
}

module.exports = { norm, patterns, toolNamesFrom, collides, ANCHOR };
