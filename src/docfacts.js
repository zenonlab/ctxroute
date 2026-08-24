// ═══════════════════════════════════════════════════════════════════════
// docfacts.js — A DOC CAN NO LONGER ASSERT A FACT THE CODE CONTRADICTS
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 FOUNDING DEFECT (13-14/08/2026). `CLAUDE.md` asserted "`exclude` is
//    matched against the current PATH". The code says "the current context
//    (path/command)" — the word COMMAND had disappeared during the COPY. An
//    agent recited the prose, asserted it three times to the maintainer, and
//    concluded that an EXISTING capability was impossible. ⚠️ A capability one
//    believes absent is as dead as an absent one — but it makes NO TEST GO RED.
//
// ⚠️ WHAT IT DOES, AND NOTHING MORE: it closes the DECIDABLE part — an
//    ENUMERABLE fact (a list of keywords, a bound, a threshold) copied into a
//    doc and gone false. It NEVER proves that a sentence tells the truth: that
//    is not decidable, and claiming it would be the false sense of security it
//    fights. ⇒ WRITING RULE: put in prose ONLY what cannot be mechanised; every
//    enumerable fact goes through an AUTO block.
//
// ⚠️ AN INDUSTRY PATTERN, NOT AN INVENTION: "generate, then fail if the file
//    moved" (`go generate` + diff, terraform-docs, helm-docs, rustdoc running
//    its examples). What is borrowed is the PATTERN.
// 🛑 NO DEPENDENCY, AND IT IS MEASURED: `embedme` (the serious candidate, the
//    only one offering a `--verify`) was published 1.22.1 on 2022-09-07 — four
//    years without maintenance. Fleet doctrine: "an unmaintained dependency is
//    not given the power to REFUSE a deployment", and a gate IS that power. It
//    solves ANOTHER problem anyway (embedding a file VERBATIM, anchored on line
//    numbers that drift) — here the facts are DERIVED.
//
// ⚠️ REUSABLE BY CONSTRUCTION: this module knows NEITHER ctxroute, NOR a path,
//    NOR a project. It receives TEXT and FACTS, it returns a verdict. The
//    binding "which constant ↔ which block" is CALLER DATA — the only part that
//    cannot be generic.
// ⚠️ LAYERS (layers.json): this file is a CORE — it never kills the process and
//    never writes the output. It RETURNS a verdict; the shell (a test, a CLI)
//    emits and exits.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

// Markers of a generated block. ⚠️ HTML form: invisible in markdown rendering,
//    so the doc stays readable by a human AND by the agent it is injected into.
// ⚠️ `txt(name)` AND NOT `${name}` — TOTALITY. Found by property-based testing on
//    14/08/2026: `name = { toString: false }` makes interpolation throw (JS calls
//    `toString()`, which is not a function) ⇒ the CORE throws ⇒ the injection
//    gate dies. No real caller passes that, and that is exactly why no
//    hand-written test would have found it.
const OPENER = (name) => `<!-- AUTO:${txt(name)} -->`;
const CLOSER = '<!-- /AUTO -->';

// ⚠️ TWO NORMALISERS, EACH DEFINED ONCE — and that is a MUTATION decision, not
//    a style one. The original form (`String(v == null ? '' : v)`, repeated 3×)
//    was a REDUNDANT GUARD: `String(null)` already returns `'null'`, which
//    matches no marker ⇒ the mutant survived, UNKILLABLE, because the behaviour
//    really was identical. Fleet doctrine: a redundant guard is ELIMINATED by
//    construction, it is not tested.
// ⚠️ `txt` REJECTS non-text (instead of stringifying it): `rewrite(null)`
//    returned `''`, but `String(null)` would have returned the string `'null'` —
//    a document whose content is the word "null". Here the intent is explicit,
//    hence observable, hence testable.
const txt = (v) => (typeof v === 'string' ? v : '');
const asList = (x) => (Array.isArray(x) ? x : []);

/**
 * Extracts the content of an AUTO block. PURE.
 * @returns {{found: boolean, content: string}} — `found:false` = block
 *   missing, which is a CALLER FAILURE (a fact that is no longer displayed
 *   anywhere is indistinguishable from a correct fact), never a silence.
 * ⚠️ No regex over the whole text: we bound with indexOf so that a marker
 *    QUOTED in the prose of another section does not capture up to it.
 */
function extract(text, name) {
  const t = txt(text);
  const start = t.indexOf(OPENER(name));
  if (start === -1) return { found: false, content: '' };
  const after = start + OPENER(name).length;
  const fin = t.indexOf(CLOSER, after);
  if (fin === -1) return { found: false, content: '' };
  return { found: true, content: t.slice(after, fin).trim() };
}

/**
 * Rewrites an AUTO block with its expected content. PURE — returns the NEW text.
 * ⚠️ Block missing ⇒ text returned UNCHANGED (we do not invent where to insert
 *    it: the author decides where a fact belongs in their narrative). The gate,
 *    for its part, will refuse — so the oversight is loud, never silent.
 */
function rewrite(text, name, content) {
  const t = txt(text);
  const start = t.indexOf(OPENER(name));
  if (start === -1) return t;
  const after = start + OPENER(name).length;
  const fin = t.indexOf(CLOSER, after);
  if (fin === -1) return t;
  // ⚠️ `txt` AND NOT `String` — MANDATORY SYMMETRY with `verify`, which
  //    normalises the same way. With `String`, non-textual content was written
  //    as "42" while `verify` expected `''`: the --write mode produced a file
  //    the check mode REFUSED. An unsatisfiable gate ends up disarmed.
  return t.slice(0, after) + '\n' + txt(content).trim() + '\n' + t.slice(fin);
}

/**
 * THE core. Confronts the EXPECTED facts (derived from the code by the caller)
 * with the REAL text of the doc. PURE.
 *
 * @param {string} text - the doc content.
 * @param {Array<{name: string, content: string}>} facts - one block per fact.
 * @returns {{ok: boolean, discrepancies: string[]}} — `discrepancies` = ACTIONABLE messages.
 *
 * ⚠️ ANTI-DORMANCY (non-negotiable aspect): EMPTY `facts` = FAILURE. A broken
 *    extractor, or a caller that derives nothing any more, would make this gate
 *    GREEN FOREVER by analysing NOTHING — the worst form of false green,
 *    already paid for three times in this repo (deps-purity, deadline-gate,
 *    layers-gate).
 * ⚠️ Comparison on the TRIMMED text, never byte for byte: a Windows `\r\n` or
 *    one extra blank line would redden a perfectly correct fact, and a gate
 *    that reddens wrongly ends up bypassed.
 */
function verify(text, facts) {
  const list = asList(facts);
  if (list.length === 0) {
    return {
      ok: false,
      discrepancies: ['ANTI-DORMANCY: no fact to verify. A gate that analyzes nothing is GREEN forever — derive the facts from the code, or delete this gate.'],
    };
  }
  const discrepancies = [];
  for (const f of list) {
    // ⚠️ `txt` here TOO: the name goes back into the discrepancy MESSAGES,
    //    which interpolate it. `OPENER` alone was not enough — the core still
    //    threw on a broken `toString`, but from the "block missing" branch. A
    //    total core must be total on ALL its paths, including the error ones.
    const name = txt(f && f.name);
    const expected = txt(f && f.content).trim();
    const { found, content } = extract(text, name);
    if (!found) {
      discrepancies.push(`block "${name}" ABSENT from the doc: add ${OPENER(name)} … ${CLOSER} where this fact must be read.`);
      continue;
    }
    if (content !== expected) {
      discrepancies.push(
        `block "${name}" STALE — the code says otherwise.\n  doc  : ${content}\n  code : ${expected}\n  ⇒ regenerate (the CODE is authoritative, never the doc).`,
      );
    }
  }
  return { ok: discrepancies.length === 0, discrepancies };
}

/**
 * Applies ALL the facts to a text. PURE — returns the regenerated text.
 * Used by the "write" mode of the shell (the equivalent of `go generate`).
 */
function regenerate(text, facts) {
  const list = asList(facts);
  let out = txt(text);
  for (const f of list) out = rewrite(out, f && f.name, f && f.content);
  return out;
}

/**
 * FORMATTING helper for a list of keywords — the most common kind of fact.
 * ⚠️ SORTING DELIBERATELY ABSENT: the code's order is a fact too (a reordered
 *    `TRIGGERS` changes precedence). Sorting here would mask that change. The
 *    caller sorts if it wants to, knowingly.
 */
function wordList(words) {
  return asList(words).map((m) => `\`${m}\``).join(' · ');
}

module.exports = { OPENER, CLOSER, extract, rewrite, verify, regenerate, wordList };
