// ═══════════════════════════════════════════════════════════════════════
// "SESSION" SOURCE — docs/session/ corpus → docs to inject at SessionStart.
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ PURE (gate `sources-must-stay-pure`): zero fs/path/process — the caller
//    (session-inject.js) reads the disk and provides the corpus. The condition for
//    mutating with Stryker without equivalent mutants.
//
// ⚠️ NO HARNESS DIALECT (gate `sources-must-not-know-the-harness`):
//    this source answers "which docs, in which order?" — the SessionStart
//    output format belongs to the GATEWAY (trivial Codex port).
//
// ⚠️ DELIBERATELY TOTAL SEMANTICS: every .md of docs/session/ is injected
//    at EVERY SessionStart (startup/resume/clear/compact), without state or mode.
//    That is the "like CLAUDE.md" contract — a reference doc that is not injectable
//    has NOTHING to do in docs/session/, it lives elsewhere. No filtering by
//    matcher here as long as no real need requires it (speculative feature).
//
// ⚠️ Any frontmatter is STRIPPED via frontmatter.parse (single source,
//    never a copied regex). Doc empty after stripping = ignored (zero noise).
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const { parse } = require('../frontmatter');

/**
 * @param {Array<{doc: string, text: string}>} corpus - output of readCorpus.
 * @returns {Array<{doc: string, body: string}>} docs to inject, alphabetical order
 *   by id (deterministic — the filesystem order is not).
 */
function sessionDocs(corpus) {
  return corpus
    .map((e) => ({ doc: e.doc, body: parse(e.text).body.trim() }))
    .filter((e) => e.body.length > 0)
    // localeCompare (and not a `<` ternary): the ids are UNIQUE, so the
    // equality case of a ternary would be a guaranteed equivalent mutant (`<` vs `<=`).
    .sort((a, b) => a.doc.localeCompare(b.doc));
}

module.exports = { sessionDocs };
