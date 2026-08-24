// ═══════════════════════════════════════════════════════════════════════
// FLEET LINT — the framework audits ITSELF. PURE.
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ ZERO I/O (gate `lint-must-stay-pure`). The caller reads the disk and
//    supplies a STATE; this module DECIDES. Like lib-pure.js / sources/file.js:
//    that is the CONDITION for mutating without equivalent mutants, not a
//    convenience.
//
// ⚠️ REASON FOR EXISTING — the hole found on 15/07/2026:
//    `doctor.js` watches the ENGINE ("am I still injecting?").
//    NOBODY was watching the FLEET (~400 docs, ~780 rules, 16 MCP servers
//    — measured on 09/08/2026; an ORDER OF MAGNITUDE, never an exact count: a
//    number carved here drifts with every doc added and nobody fixes it).
//    That day, SIX holes were found with THROWAWAY scripts hand-written in a
//    temporary folder. THAT WAS THE BUG: a measurement that does not survive
//    the session protects nothing. This file makes them permanent.
//
// ⚠️ THE COMMON DISEASE this lint treats: the framework exists to make the
//    implicit EXPLICIT, and did not apply that to itself. A deliberately silent
//    doc and a doc with a FORGOTTEN pattern are indistinguishable — two silent
//    files. An MCP server without a doc: chosen, or not done yet? Silence stops
//    being an answer: it gets DECLARED.
//
// ⚠️ ONE DECLARATION, ONE TRUTH — the central maintainability point:
//    this module does NOT know where a trigger comes from. The caller
//    NORMALISES each doc into a uniform `declaration`; the core only judges the
//    shape.
//    ⚠️ THIS BLOCK ANNOUNCED A MIGRATION "tomorrow" — it happened on
//    27/07/2026 (fixed on 09/08/2026, the same expired sentence
//    `lint-corpus.js` was carrying): the ONLY source of triggers is the doc's
//    FRONTMATTER. `protected-paths.json` is an INERT artefact, with no reader.
//      - `validate()` remains the ONLY authority on "is this declaration
//        sound?" — this lint NEVER re-judges (2 pieces of code for 1 judgement =
//        guaranteed divergence the day one of them evolves);
//      - indifference to the SOURCE remains true and must stay so: it is what
//        allowed the migration to kill no line here.
//    ⚠️ NEVER add a "is this doc targeted by a rule?" check here: that would
//    bring back into the core a notion that belongs to the shell.
//
// ⚠️ NO HARNESS DIALECT (gate): it returns findings, prints nothing, does not
//    exit(), does not format. The gate handles that — same rule as
//    sources/*.js, which is what makes the Codex port trivial.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const { validate } = require('./frontmatter');

// ⚠️ MEANINGFUL ORDER (most severe to least severe): `indexOf()` is used as a
//    comparison. Reordering SILENTLY changes what `level: warn` lets through.
//    Contract values, to be hard-coded in the tests.
const LEVELS = ['error', 'warn', 'info'];

// ⚠️ DEFAULT `warn` — NOT a soft compromise. Pain MEASURED on 15/07/2026: rush
//    mode (`.rush`) was ACTIVE, all asks cut off. When you cannot tune the
//    noise, you switch EVERYTHING off — and a gate that is off is not a gate.
//    One notch of adjustment avoids the nuclear button.
const DEFAULT_LEVEL = 'warn';

// ⚠️ `code` is STABLE (never translated nor reworded: a test or a filter hangs
//    onto it). `message` = for humans, free to evolve.
function finding(level, code, target, message) {
  return { level, code, target, message };
}

// ⚠️ SINGLE SOURCE of "it's a list, or nothing" — EXPORTED ON PURPOSE.
//    Writing `Array.isArray(x) ? x : []` inline (5× in this module in the first
//    draft) produces 5 EQUIVALENT mutants: Stryker replaces `[]` with
//    `["Stryker was here"]`, invisible unless one writes a test coupled to that
//    internal string — FORBIDDEN (it breaks on tool upgrade).
//    Extracted and exported, the guard becomes OBSERVABLE: `list(null)` must
//    return `[]`, and a direct test kills the mutant. Doctrine applied: the
//    redundant guard is avoided by CONSTRUCTION, it is not tested in place.
//    Bonus: one single truth instead of 5 copies (maintainability).
function list(x) {
  return Array.isArray(x) ? x : [];
}

/**
 * ⚠️ THE core of the lint. PURE: same state ⇒ same findings, zero side effects.
 *
 * @param {{ docs?: any[], ghostDocs?: any[], mcpServers?: any[], documentedServers?: any[], declaredServers?: any[] }} state
 *   `docs` = [{ filePath, declaration }] — `declaration` is NORMALISED by the
 *   caller (frontmatter OR rules), never raw · `ghostDocs` = .md files
 *   targeted by a rule but MISSING · `mcpServers` = wired servers ·
 *   `documentedServers` = those having a docs/mcp/{X}.md · `declaredServers` =
 *   declared "no doc, on purpose".
 * @returns {Array} findings, sorted from most to least severe.
 */
function analyze(state) {
  const e = state || {};
  const findings = [];

  // ── ERROR: unsound declaration ───────────────────────────────────────
  // ⚠️ `validate()` is the ONLY authority. It covers in one go: no trigger
  //    (a doc dead in silence — THE bug the refactor kills), a misspelled key
  //    (`mach:`), a contradictory `inject`, an unknown mode.
  //    NEVER duplicate any of those judgements here.
  for (const d of list(e.docs)) {
    if (!d || typeof d.filePath !== 'string') continue;
    for (const err of validate(d.declaration || {})) {
      findings.push(finding('error', 'invalid-declaration', d.filePath, err));
    }
  }

  // ── ERROR: phantom rule ──────────────────────────────────────────────
  // ⚠️ The exact mirror: a rule targeting a non-existent .md is dead and says
  //    nothing. 0 measured on 15/07.
  // 🛑 SINCE 27/07/2026 THIS CHECK CAN NO LONGER FIND ANYTHING IN PRODUCTION,
  //    and that is INTENDED: rules are born from FRONTMATTERS, so every rule
  //    comes from a doc that exists by construction (`lint-corpus.js` computes
  //    `ghostDocs` by difference — the set is structurally empty).
  //    It stays here as a NET for the extinguished class: the day someone
  //    rewires an EXTERNAL rule source, the class is reborn and this check is
  //    the only one that sees it. ⚠️ DO NOT remove it on the grounds that it
  //    never fires — a net silent on healthy state is doing exactly its job.
  for (const filePath of list(e.ghostDocs)) {
    // ⚠️ The WORDING is communication, not behaviour (the `code`
    //    `ghost-rule` and the `niveau`, by contrast, stay mutated AND
    //    tested). Mutating it produces an equivalent mutant that only a test
    //    coupled to the exact text would kill — fragile to any rewording.
    // ⚠️ `next-line` covers ONLY the next line: the string MUST be on that very
    //    line. Mistake made on 15/07 (disable placed on the `push` line, string
    //    on the following line → surviving mutant in CI).
    findings.push(finding('error', 'ghost-rule', filePath,
      // Stryker disable next-line StringLiteral
      'a rule targets this .md, it does not exist: rule dead in silence.'));
  }

  // ── ERROR: `[source: …]` tag HARD-PASTED into a doc ───────────────────
  // ⚠️ The engine ADDS this tag itself on emission. Finding it INSIDE the body
  //    of a doc means an injection copy-paste — and it breaks TWO things at
  //    once:
  //      ① the doc arrives with its tag TWICE;
  //      ② an agent READING this file drops a valid-looking label into the
  //         transcript ⇒ the CANARY counts it as an injection that ARRIVED and
  //         turns GREEN while the channel may be DEAD.
  //    ② is the real danger: it is the exact gesture of someone INVESTIGATING a
  //    dead injection that made the dead-man switch lie. (= ㉘ bis)
  // ⚠️ ERROR and not warn: unlike `mcp-without-doc` ("not done yet"), here there is
  //    NO legitimate case — the tag is never written by hand. MEASURED before
  //    writing this rule: 4 occurrences in the whole fleet, all faulty, **zero
  //    exemption needed**.
  // 🛑 Detection lives in the SHELL (it alone reads the files); this core only
  //    judges a boolean — see `lint-must-stay-pure`.
  for (const d of list(e.docs)) {
    if (!d || typeof d.filePath !== 'string' || !d.tagSourceEnDur) continue;
    findings.push(finding('error', 'hardcoded-source-tag', d.filePath,
      // Stryker disable next-line StringLiteral
      'a [source: …] tag is written INSIDE this doc: the engine already adds it, and the canary counts it as an injection that arrived.'));
  }

  // ── WARN: MCP server wired without a doc ─────────────────────────────
  // ⚠️ MEASURED: 2 documented out of 16 wired. `ssh` (production VPS) and
  //    `infra` (client sites) without any doc. `config-gate.test.js` is
  //    DIRECTIONAL ("every doc has a config") hence structurally BLIND to this
  //    case.
  // ⚠️ WARN and not ERROR — arbitrated by the maintainer on 15/07: this is not
  //    an oversight, it is "no time for it yet". A server without a doc BREAKS
  //    nothing, it just does not protect yet. As `error`, the lint would be red
  //    permanently, hence ignored, hence useless: the exact lesson of rush mode.
  const coveredFiles = new Set([...list(e.documentedServers), ...list(e.declaredServers)]);
  for (const s of list(e.mcpServers)) {
    if (coveredFiles.has(s)) continue;
    findings.push(finding('warn', 'mcp-without-doc', s,
      // Stryker disable next-line StringLiteral
      `MCP server wired without a doc. Write docs/mcp/${s}.md, or put it in filterList if it is deliberate.`));
  }

  // ⚠️ SEVERITY ORDER GUARANTEED BY CONSTRUCTION: all the `error` checks push
  //    BEFORE the single `warn` check. The gate can therefore truncate without
  //    ever cutting an error in favour of a warning.
  //    ⚠️ A `.sort()` by severity used to live here and was REMOVED
  //    (15/07/2026): it was UNREACHABLE — the list already came out sorted, so
  //    it never reordered anything = dead code = equivalent mutant, and the
  //    "sorting" test covering it passed by accident (it proved nothing).
  //    ⚠️ DO NOT put it back. If one day a `warn`/`info` check must be pushed
  //    BEFORE an `error` check, it is the ORDER OF THE CHECKS that must be
  //    fixed — the test "output sorted by severity" will see it go red.
  return findings;
}

/**
 * Filters by the configured level. PURE.
 * ⚠️ `off` = zero findings, including `error` ones. DELIBERATE: it is a
 *    declared user choice (same logic as `enabled: false`). NEVER "force the
 *    errors through anyway" — a switch that does not switch everything off is a
 *    broken switch.
 * ⚠️ Unknown level ⇒ the default, NEVER `off`: a typo in the config must not
 *    silently turn off the diagnosis (fail-open on the noise, never on the
 *    detection).
 */
function applyFilter(findings, level) {
  if (level === 'off') return [];
  const threshold = LEVELS.indexOf(LEVELS.includes(level) ? level : DEFAULT_LEVEL);
  return list(findings).filter((c) => c && LEVELS.indexOf(c.level) <= threshold);
}

/**
 * Must the lint SCREAM (exit ≠ 0)? PURE.
 * ⚠️ Only ERRORS scream. A `warn` breaking session startup would be a blocking
 *    gate — banned by the doctrine ("husky full-suite").
 */
function shouldScream(findings) {
  return list(findings).some((c) => c && c.level === 'error');
}

module.exports = { analyze, applyFilter, shouldScream, list, LEVELS, DEFAULT_LEVEL };
