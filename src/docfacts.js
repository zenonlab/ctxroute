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
// ⚠️ `txt(nom)` AND NOT `${nom}` — TOTALITY. Found by property-based testing on
//    14/08/2026: `nom = { toString: false }` makes interpolation throw (JS calls
//    `toString()`, which is not a function) ⇒ the CORE throws ⇒ the injection
//    gate dies. No real caller passes that, and that is exactly why no
//    hand-written test would have found it.
const OUVRE = (nom) => `<!-- AUTO:${txt(nom)} -->`;
const FERME = '<!-- /AUTO -->';

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
const asListe = (x) => (Array.isArray(x) ? x : []);

/**
 * Extracts the content of an AUTO block. PURE.
 * @returns {{trouve: boolean, contenu: string}} — `trouve:false` = block
 *   missing, which is a CALLER FAILURE (a fact that is no longer displayed
 *   anywhere is indistinguishable from a correct fact), never a silence.
 * ⚠️ No regex over the whole text: we bound with indexOf so that a marker
 *    QUOTED in the prose of another section does not capture up to it.
 */
function extract(texte, nom) {
  const t = txt(texte);
  const debut = t.indexOf(OUVRE(nom));
  if (debut === -1) return { trouve: false, contenu: '' };
  const apres = debut + OUVRE(nom).length;
  const fin = t.indexOf(FERME, apres);
  if (fin === -1) return { trouve: false, contenu: '' };
  return { trouve: true, contenu: t.slice(apres, fin).trim() };
}

/**
 * Rewrites an AUTO block with its expected content. PURE — returns the NEW text.
 * ⚠️ Block missing ⇒ text returned UNCHANGED (we do not invent where to insert
 *    it: the author decides where a fact belongs in their narrative). The gate,
 *    for its part, will refuse — so the oversight is loud, never silent.
 */
function rewrite(texte, nom, contenu) {
  const t = txt(texte);
  const debut = t.indexOf(OUVRE(nom));
  if (debut === -1) return t;
  const apres = debut + OUVRE(nom).length;
  const fin = t.indexOf(FERME, apres);
  if (fin === -1) return t;
  // ⚠️ `txt` AND NOT `String` — MANDATORY SYMMETRY with `verify`, which
  //    normalises the same way. With `String`, non-textual content was written
  //    as "42" while `verify` expected `''`: the --write mode produced a file
  //    the check mode REFUSED. An unsatisfiable gate ends up disarmed.
  return t.slice(0, apres) + '\n' + txt(contenu).trim() + '\n' + t.slice(fin);
}

/**
 * THE core. Confronts the EXPECTED facts (derived from the code by the caller)
 * with the REAL text of the doc. PURE.
 *
 * @param {string} texte - the doc content.
 * @param {Array<{nom: string, contenu: string}>} facts - one block per fact.
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
function verify(texte, facts) {
  const list = asListe(facts);
  if (list.length === 0) {
    return {
      ok: false,
      discrepancies: ['ANTI-DORMANCY: no fact to verify. A gate that analyzes nothing is GREEN forever — derive the facts from the code, or delete this gate.'],
    };
  }
  const discrepancies = [];
  for (const f of list) {
    // ⚠️ `txt` here TOO: the name goes back into the discrepancy MESSAGES,
    //    which interpolate it. `OUVRE` alone was not enough — the core still
    //    threw on a broken `toString`, but from the "block missing" branch. A
    //    total core must be total on ALL its paths, including the error ones.
    const nom = txt(f && f.nom);
    const attendu = txt(f && f.contenu).trim();
    const { trouve, contenu } = extract(texte, nom);
    if (!trouve) {
      discrepancies.push(`block « ${nom} » ABSENT from the doc: add ${OUVRE(nom)} … ${FERME} where this fact must be read.`);
      continue;
    }
    if (contenu !== attendu) {
      discrepancies.push(
        `block « ${nom} » STALE — the code says otherwise.\n  doc  : ${contenu}\n  code : ${attendu}\n  ⇒ regenerate (the CODE is authoritative, never the doc).`,
      );
    }
  }
  return { ok: discrepancies.length === 0, discrepancies };
}

/**
 * Applies ALL the facts to a text. PURE — returns the regenerated text.
 * Used by the "write" mode of the shell (the equivalent of `go generate`).
 */
function regenerate(texte, facts) {
  const list = asListe(facts);
  let out = txt(texte);
  for (const f of list) out = rewrite(out, f && f.nom, f && f.contenu);
  return out;
}

/**
 * FORMATTING helper for a list of keywords — the most common kind of fact.
 * ⚠️ SORTING DELIBERATELY ABSENT: the code's order is a fact too (a reordered
 *    `TRIGGERS` changes precedence). Sorting here would mask that change. The
 *    caller sorts if it wants to, knowingly.
 */
function wordList(mots) {
  return asListe(mots).map((m) => `\`${m}\``).join(' · ');
}

module.exports = { OUVRE, FERME, extract, rewrite, verify, regenerate, wordList };
