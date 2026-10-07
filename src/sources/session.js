
// ═══════════════════════════════════════════════════════════════════════
// "SESSION" SOURCE — docs/session/ corpus → docs to inject when a context STARTS.
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ PURE (gate `sources-must-stay-pure`): zero fs/path/process — the caller
//    (session-inject.js) reads the disk and provides the corpus. The condition for
//    mutating with Stryker without equivalent mutants.
//
// ⚠️ NO HARNESS DIALECT (gate `sources-must-not-know-the-harness`):
//    this source answers "which docs, in which order?" — the output format of
//    the start event belongs to the GATEWAY (trivial Codex port).
//
// ⚠️ A CONTEXT STARTS IN TWO WAYS (2026-10-07): the main agent's session
//    (SessionStart, startup/resume/clear/compact) and every SUB-AGENT
//    (SubagentStart). Every .md of docs/session/ is delivered to EACH, without
//    state or cadence — the "like CLAUDE.md" contract — UNLESS its own
//    `category` restricts WHO receives it.
// 🔄 THIS FILE SAID "No filtering by matcher here as long as no real need requires
//    it (speculative feature)" — and that was the defect: `category` shipped on
//    22/09 for every other corpus and skipped this one, so a doc meant for the main
//    agent could not say so. A word of the language missing from one corpus is not
//    YAGNI, it is a hole in the language. The FILTER is the caller's (`admits`,
//    resolved by gate.js through the same cascade as every corpus, with its own
//    `defaults.session` stage); this source only POSES each doc's declaration.
//
// ⚠️ The frontmatter is PARSED via frontmatter.parse (single source, never a
//    copied regex) and stripped from the body. Doc empty after stripping = ignored
//    (zero noise).
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const { parse } = require('../frontmatter');

/**
 * @param {Array<{doc: string, text: string}>} corpus - output of readCorpus.
 * @param {(decl: object) => boolean} [admits] - does THIS context receive a doc with this
 *   declaration? Absent = every doc (the behaviour before `category` reached this corpus).
 * @returns {Array<{doc: string, body: string}>} docs to inject, alphabetical order
 *   by id (deterministic — the filesystem order is not).
 */
function sessionDocs(corpus, admits) {
  const receives = admits || (() => true);
  const kept = [];
  for (const e of corpus) {
    const parsed = parse(e.text);
    const body = parsed.body.trim();
    if (body.length > 0 && receives(parsed.data)) kept.push({ doc: e.doc, body });
  }
  // localeCompare (and not a `<` ternary): the ids are UNIQUE, so the
  // equality case of a ternary would be a guaranteed equivalent mutant (`<` vs `<=`).
  return kept.sort((a, b) => a.doc.localeCompare(b.doc));
}

// The corpus's name in the cascade (`defaults.session`) and in the write guard — ONE spelling,
// owned by the corpus it names.
const SOURCE_ID = 'session';

module.exports = { sessionDocs, SOURCE_ID };
