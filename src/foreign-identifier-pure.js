// foreign-identifier-pure.js — THE DECISIONS of the foreign-identifier gate, separated from its I/O.
//
// ⚠️⚠️ WHY THIS FILE EXISTS. **Stryker does not mutate test code.** A verdict written inside
//    `test/foreign-identifier-gate.test.js` would therefore be UNVERIFIABLE: a `>` turned into
//    `>=`, an inverted bound, a `filter` that no longer filters would stay GREEN for ever. A false
//    gate is worse than no gate, because it REASSURES and people stop looking. Exactly the
//    `quadratic-budget-pure.js` / `temporal-budget-pure.js` / `state-entry-rebuild-pure.js`
//    precedent, and the same remedy — the rule becomes PURE, hence mutable, hence proven.
//
// ⚠️ CONTRACT: ZERO I/O — no `fs`, no `path`, no `child_process`, no `process.env`, no
//    `process.argv`, no `console`, no `process.exit`. It RECEIVES what was measured (the ast-grep
//    scan, the cspell verdict, the dictionaries cspell says it actually loaded) and RETURNS a
//    verdict. The gate keeps every measurement.
//
// 🛑 THE CLASS IT ENCODES, AND THE REASON THE DESIGN IS WHAT IT IS. This repository is PUBLIC and
//    its language decision says the WHOLE project is English. The PROSE half already had a machine
//    (`english-only-gate.test.js`). The IDENTIFIERS had NONE, and French ones shipped in the
//    published repository. The obvious remedy — a list of FORBIDDEN French words — is REFUSED
//    here, and refusing it is the whole design: a list of forbidden things is STALE THE DAY IT IS
//    WRITTEN, it catches only what somebody thought to put in it, and the next word walks through
//    in silence. That defect class has already been paid for in this repository more than once.
//
// ✅ WHAT REPLACES IT: `cspell` against an ENGLISH-ONLY dictionary set. It INVERTS THE BURDEN OF
//    PROOF — nothing is forbidden, what is KNOWN is declared, so every word that is neither
//    ordinary English nor a term declared in `cspell.json` is RED. A German `dateipfad`, a
//    Portuguese `caminho` and a French `verrou` are refused for exactly the SAME reason: they are
//    not English. That covers the languages nobody anticipated, which no list can do. Fail-closed,
//    never fail-open. The contributors of this repository are international: the next offending
//    identifier will not necessarily be French.
//
// 🛑 AND THAT GUARANTEE RESTS ENTIRELY ON ONE FACT: ENGLISH IS THE ONLY NATURAL-LANGUAGE
//    REFERENCE. Enabling a single additional natural-language dictionary opens THAT WHOLE
//    LANGUAGE, in silence, and the gate stops protecting without one test going red. That is why
//    `dictionaryFaults` below exists and why it is as strict as the ratchet itself.
//
// ⚠️ NO NESTED TRAVERSAL HERE, DELIBERATELY — the judge must not be the first defendant of the
//    neighbouring quadratic gate. Membership goes through a `Set`/`Map`, never an `includes`
//    inside a loop.

'use strict';

// ⚠️ CLOSED LIST, AND THAT IS THE WHOLE POINT. A fourth class would be a way of saying "I did not
//    want to rename this". `ok`, `legacy`, `fine` are exactly the words this gate exists to refuse.
//      · `PROTOCOL_NAME`  — the identifier REPRODUCES a name we do not own (an environment
//        variable of a third party, a wire-format field, a vendor API key). Renaming it would
//        break a contract with something outside this repository. An ACT OF INSTRUCTION: it owes a
//        written `why`.
//      · `DEBT`           — a foreign identifier knowingly kept. It owes a `why` AND a NUMERIC
//        `impact`, because a budget measures QUANTITY and never GRAVITY: one unreadable name in a
//        test fixture and one in the public engine are not the same defect.
//      · `INHERITED_DEBT` — the measurement of the day. EXEMPT from justification ON PURPOSE.
const CLASSES = ['PROTOCOL_NAME', 'DEBT', 'INHERITED_DEBT'];

// ⚠️ A `Set` and NOT `CLASSES.includes(...)`: the membership test lives INSIDE a loop over the
//    budget, so an `Array.includes` there would be a traversal inside a traversal — the quadratic
//    gate would flag this very judge. Avoiding the shape BY CONSTRUCTION beats declaring an
//    exemption.
const CLASS_SET = new Set(CLASSES);

// ⚠️ EXEMPT ON PURPOSE, AND THIS IS NOT LENIENCY. `INHERITED_DEBT` is the measurement of the day:
//    nobody has instructed those occurrences one by one. Demanding a sentence for each would
//    produce INVENTED justifications, and an invented justification makes the case look SETTLED —
//    strictly worse than an honest blank. 🛑 Never extend this exemption to another class.
const EXEMPT_FROM_JUSTIFICATION = 'INHERITED_DEBT';

// ⚠️ The only class that owes a NUMERIC impact. A budget counts occurrences; it cannot tell a
//    fixture variable apart from an exported name a fork has to read.
const NUMERIC_IMPACT_CLASS = 'DEBT';

// Not style rules: these are the lengths below which no reader learns WHY a name that is not
// English is allowed to stay, nor what its presence costs.
const MIN_WHY = 60;
const MIN_IMPACT = 40;

// ⚠️ ENGLISH, AND NOTHING ELSE. The locale cspell is configured with must be exactly this.
//    `en,fr` is the one-word edit that would disarm the whole gate, so it is refused by NAME
//    rather than left to a reviewer's eye.
const ENGLISH_LOCALE = 'en';

// ⚠️ A NATURAL-LANGUAGE DICTIONARY IS RECOGNISED BY THE SHAPE OF ITS NAME, never by a list of
//    forbidden languages — the same reasoning as the gate itself: a list of forbidden locales
//    would miss the one nobody anticipated. cspell names its language dictionaries after their
//    locale (`fr`, `fr-fr`, `de-de`, `pt-br`, `es`, `en_us`, `en-gb`), so anything shaped like a
//    locale and not starting with `en` is a natural language that is not English.
const LOCALE_SHAPE = /^[a-z]{2}([-_][a-z]{2,3})?$/i;
const ENGLISH_PREFIX = /^en([-_]|$)/i;

/**
 * Is this dictionary name a natural language other than English?
 * @param {string} name a dictionary name as cspell reports it
 * @returns {boolean}
 *
 * ⚠️ Written as a named predicate rather than inline: it is the ONE decision that keeps the
 *    inverted burden of proof intact, and it must be reachable by its own test cells.
 */
function isForeignLanguageDictionary(name) {
  if (!LOCALE_SHAPE.test(name)) return false;
  return !ENGLISH_PREFIX.test(name);
}

// Occurrences counted per file.
// ⚠️ A `Map`, NEVER a plain object: an object inherits `constructor`/`toString` from
//    `Object.prototype`, so a key colliding with one of them would read as "already counted".
//    Avoiding the class BY CONSTRUCTION is cheaper than a guard nobody can test — a guard for an
//    unreachable case is an equivalent mutant by construction.
function counts(occurrences) {
  const m = new Map();
  for (const o of occurrences) m.set(o.file, (m.get(o.file) || 0) + 1);
  return m;
}

/**
 * THE RATCHET — pure, total, deterministic.
 * @param {{file: string}[]} occurrences the declared identifiers cspell refused, as measured
 * @param {Record<string, {max: number, class: string, why?: string, impact?: string}>} files the manifest's declarations, keyed by RELATIVE path
 * @returns {string[]} faults, sorted; EMPTY when the budget tells the truth
 *
 * ⚠️ Returns the LIST, never a boolean: a gate must say WHAT to fix, not just "no".
 * ⚠️ SORTED: the message must not depend on the order in which the scanner walked the disk,
 *    otherwise the same defect reads differently from one run to the next and people stop trusting
 *    the output.
 */
function verdict(occurrences, files) {
  const faults = [];
  const measured = counts(occurrences);
  // ⚠️ THE MANIFEST IS READ THROUGH A `Map`, NEVER BY INDEXING THE OBJECT. `JSON.parse` returns a
  //    plain object, so `files['constructor']` yields `Object.prototype.constructor`: TRUTHY. An
  //    undeclared file would then be read as DECLARED, `decl.max` would be `undefined`, and BOTH
  //    ratchet comparisons would be false ⇒ the gate goes SILENT on it. A guard that fails OPEN is
  //    worse than no guard. `Object.entries` walks OWN keys only.
  const declared = new Map(Object.entries(files));

  for (const [file, n] of measured) {
    const decl = declared.get(file);
    // ⚠️ A file ABSENT from the budget is held at ZERO. That is the ratchet's default, and it is
    //    what gives 100 % of the rule on all NEW code without first demanding that the existing
    //    code be repaired — forgetting to declare becomes impossible rather than merely discouraged.
    if (!decl) {
      faults.push(file + ': ' + n + ' foreign identifier(s), NOT DECLARED (a file absent from the budget is held at ZERO)');
      continue;
    }
    // ⚠️ AN EQUALITY, NOT A CEILING. Measured above the declaration = a new foreign identifier
    //    appeared. Measured BELOW = a stale declaration, which widens the budget for free and in
    //    silence: the ground gained is taken back by the next writer, who inherits the old ceiling.
    // ⚠️ TWO INDEPENDENT COMPARISONS, and that shape is DELIBERATE — not a style choice. Written as
    //    `if (max !== n) { … n > max ? … : … }`, the strict `>` is only ever evaluated when the two
    //    numbers DIFFER, so turning it into `>=` changes nothing: an EQUIVALENT mutant by
    //    construction, hence an eternal survivor. Split like this, `>=` fires on the truthful case
    //    and dies there.
    const head = file + ': ' + n + ' foreign identifier(s) measured, ' + decl.max + ' declared';
    if (n > decl.max) faults.push(head + ' — RATCHET CROSSED: rename the identifier in English, or prove the class');
    if (n < decl.max) faults.push(head + ' — stale ratchet, LOWER IT');
  }

  // ⚠️ THE DECLARATION SIDE, walked SEPARATELY and not inside the loop above: a declaration must be
  //    judged even when nothing matches it any more, otherwise a badly-formed entry could hide
  //    behind the disappearance of its own occurrences.
  for (const [file, decl] of declared) {
    // ⚠️ ZERO PHANTOM ENTRY, and it is not symmetry for its own sake: AN EXEMPTION THAT HAS STOPPED
    //    BEING NECESSARY MUST GO RED. A declaration that survives the rename it covered is a
    //    DORMANT PERMIT — a file recreated at that path would silently inherit the right, and
    //    nobody re-reads a permission that never complains.
    if (!measured.has(file)) {
      faults.push(file + ': DECLARED but no foreign identifier left — remove the entry (dormant permit)');
    }
    if (!CLASS_SET.has(decl.class)) {
      faults.push(file + ': class "' + decl.class + '" REFUSED — only ' + CLASSES.join(' | ')
        + '. The class says WHY a name that is not English may stay; it is not a label.');
    }
    if (decl.class !== EXEMPT_FROM_JUSTIFICATION
      && (typeof decl.why !== 'string' || decl.why.length <= MIN_WHY)) {
      faults.push(file + ': instructed entry WITHOUT a justification (`why`, more than ' + MIN_WHY
        + ' characters) — name the contract that forbids the rename.');
    }
    if (decl.class === NUMERIC_IMPACT_CLASS
      && (typeof decl.impact !== 'string' || decl.impact.length < MIN_IMPACT)) {
      faults.push(file + ': DEBT without a NUMERIC `impact` (at least ' + MIN_IMPACT
        + ' characters) — say who reads that name and what its opacity costs. A budget measures quantity, never gravity.');
    }
  }

  return faults.sort();
}

/**
 * THE SEAL ON THE REFERENCE ITSELF — pure, total, deterministic.
 *
 * 🛑 THIS IS NOT A SECOND-ORDER REFINEMENT, IT IS THE LOAD-BEARING HALF. The ratchet above only
 *    counts what cspell refused; what cspell refuses depends ENTIRELY on which dictionaries are
 *    loaded. Enable one natural-language dictionary and the ratchet keeps passing while the gate
 *    protects nothing — a green that lies, this repository's worst defect class.
 *
 * @param {string[]} active the dictionaries cspell says it ACTUALLY loaded (measured, never assumed)
 * @param {string[]} declaredActive the dictionaries the manifest declares as expected
 * @param {string} locale the `language` field of `cspell.json`
 * @param {string[]} configured the `dictionaries` field of `cspell.json`
 * @returns {string[]} faults, sorted; EMPTY when the reference is English and only English
 */
function dictionaryFaults(active, declaredActive, locale, configured) {
  const faults = [];

  // ① THE LOCALE. `en,fr` is a one-word edit and it opens the whole French language.
  if (locale !== ENGLISH_LOCALE) {
    faults.push('cspell.json `language` is "' + locale + '" — it must be exactly "' + ENGLISH_LOCALE
      + '". A second locale opens that ENTIRE language in silence and the gate stops protecting.');
  }

  // ② WHAT THE CONFIG ASKS FOR, and ③ WHAT CSPELL ACTUALLY LOADED. Both are checked, because they
  //    answer different questions: a config can be clean while an inherited or global
  //    configuration adds a dictionary nobody wrote here.
  // ⚠️ ONE TRAVERSAL PER STATEMENT, never a chain: to the neighbouring quadratic rule,
  //    `a.filter(f).map(g)` is a traversal nested in a traversal.
  const configuredForeign = configured.filter(isForeignLanguageDictionary);
  for (const d of configuredForeign) {
    faults.push('cspell.json `dictionaries` enables "' + d
      + '" — a natural language other than English. REFUSED: English is the ONLY reference, that is what makes an unanticipated language red.');
  }
  const activeForeign = active.filter(isForeignLanguageDictionary);
  for (const d of activeForeign) {
    faults.push('cspell LOADED "' + d
      + '" — a natural language other than English is ACTIVE. REFUSED, whatever asked for it (an inherited or global config counts).');
  }

  // ④ AN EQUALITY ON THE ACTIVE SET, the same doctrine as every ratchet here: a dictionary that
  //    appears tomorrow is RED until somebody declares it and says so; a declaration whose
  //    dictionary has vanished is RED too, because a stale declaration is an exemption nobody
  //    re-reads. 🛑 This is what makes the measurement above a MEASUREMENT and not a hope: the
  //    config has to SPEAK, and what it says has to match what was written down.
  const declaredSet = new Set(declaredActive);
  const activeSet = new Set(active);
  for (const d of active) {
    if (!declaredSet.has(d)) {
      faults.push('cspell LOADED an UNDECLARED dictionary "' + d
        + '" — declare it in `foreign-identifier-budget.json` after checking it carries no natural language but English.');
    }
  }
  for (const d of declaredActive) {
    if (!activeSet.has(d)) {
      faults.push('the manifest declares dictionary "' + d
        + '" which cspell does NOT load — stale declaration, remove it (a declaration nobody uses hides the set that is really in force).');
    }
  }

  return faults.sort();
}

module.exports = {
  verdict,
  dictionaryFaults,
  isForeignLanguageDictionary,
  CLASSES,
  EXEMPT_FROM_JUSTIFICATION,
  NUMERIC_IMPACT_CLASS,
  ENGLISH_LOCALE,
  MIN_WHY,
  MIN_IMPACT,
};
