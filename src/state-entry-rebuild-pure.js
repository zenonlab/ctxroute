// state-entry-rebuild-pure.js — THE DECISIONS of the state-entry-rebuild gate, separated from its I/O.
//
// ⚠️⚠️ WHY THIS FILE EXISTS. **Stryker does not mutate test code.** A verdict written inside
//    `test/state-entry-rebuild-gate.test.js` would therefore be UNVERIFIABLE: a `>` turned into
//    `>=`, an inverted bound, a `filter` that no longer filters would stay GREEN for ever. A false
//    gate is worse than no gate, because it REASSURES and people stop looking. Exactly the
//    `quadratic-budget-pure.js` / `temporal-budget-pure.js` precedent, and the same remedy — the
//    rule becomes PURE, hence mutable, hence proven.
//
// ⚠️ CONTRACT: ZERO I/O — no `fs`, no `path`, no `child_process`, no `process.env`, no
//    `process.argv`, no `console`, no `process.exit`. It RECEIVES what was measured and RETURNS a
//    verdict. The gate keeps the scan (ast-grep) and the reading of the manifest.
//
// ⚠️ THE CLASS IT ENCODES — REBUILDING A RECORD FIELD BY FIELD SILENTLY DROPS EVERY FIELD ABSENT
//    FROM THE LIST. Paid twice here, both times under a complete green: `keys` born INERT on 8
//    fleet skills out of 8 (`sources/skill.js`), and `denied` erased by any foreign action
//    (`gate.js`), which turned "a block is NEVER followed by a block" into a lie for as long as the
//    document was not matched. The cure is the SPREAD, because it keeps the record's shape OPEN:
//    a field added tomorrow survives by CONSTRUCTION rather than by someone remembering it.
//
// ⚠️ NO NESTED TRAVERSAL HERE, DELIBERATELY — the judge must not be the first defendant of the
//    neighbouring quadratic gate. Membership goes through a `Set`/`Map`, never an `includes` inside
//    a loop.

'use strict';

// ⚠️ CLOSED LIST, AND THAT IS THE WHOLE POINT. A fourth class would be a way of saying "I did not
//    look at what the record carries". `fine`, `small`, `probably-ok` are exactly the words this
//    gate exists to refuse.
//      · `DERIVES_NOTHING` — the record being replaced genuinely holds nothing else to carry,
//        PROVED and not assumed. An ACT OF INSTRUCTION: it owes a written `why`.
//      · `DEBT`            — a real rebuild knowingly kept. It owes a `why` AND a NUMERIC `impact`
//        naming the fields at risk, because a budget measures QUANTITY and never GRAVITY.
//      · `INHERITED_DEBT`  — the measurement of the day. EXEMPT from justification ON PURPOSE.
const CLASSES = ['DERIVES_NOTHING', 'DEBT', 'INHERITED_DEBT'];

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
//    harmless rebuild apart from one that erases an anti-loop flag. The number is what makes the
//    two distinguishable to a reader.
const NUMERIC_IMPACT_CLASS = 'DEBT';

// Not style rules: these are the lengths below which no reader learns WHICH fields the record
// carries, nor WHAT their loss costs.
const MIN_WHY = 60;
const MIN_IMPACT = 40;

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
 * THE VERDICT — pure, total, deterministic.
 * @param {{file: string}[]} occurrences what ast-grep really found
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
      faults.push(file + ': ' + n + ' record(s) rebuilt by literal, NOT DECLARED (a file absent from the budget is held at ZERO)');
      continue;
    }
    // ⚠️ AN EQUALITY, NOT A CEILING. Measured above the declaration = a new rebuild appeared.
    //    Measured BELOW = a stale declaration, which widens the budget for free and in silence: the
    //    ground gained is taken back by the next writer, who inherits the old ceiling.
    // ⚠️ TWO INDEPENDENT COMPARISONS, and that shape is DELIBERATE — not a style choice. Written as
    //    `if (max !== n) { … n > max ? … : … }`, the strict `>` is only ever evaluated when the two
    //    numbers DIFFER, so turning it into `>=` changes nothing: an EQUIVALENT mutant by
    //    construction, hence an eternal survivor. Split like this, `>=` fires on the truthful case
    //    and dies there.
    const head = file + ': ' + n + ' rebuild(s) measured, ' + decl.max + ' declared';
    if (n > decl.max) faults.push(head + ' — RATCHET CROSSED: propagate the record (`{ ...entry, … }`), or prove the class');
    if (n < decl.max) faults.push(head + ' — stale ratchet, LOWER IT');
  }

  // ⚠️ THE DECLARATION SIDE, walked SEPARATELY and not inside the loop above: a declaration must be
  //    judged even when nothing matches it any more, otherwise a badly-formed entry could hide
  //    behind the disappearance of its own occurrences.
  for (const [file, decl] of declared) {
    // ⚠️ ZERO PHANTOM ENTRY, and it is not symmetry for its own sake: AN EXEMPTION THAT HAS STOPPED
    //    BEING NECESSARY MUST GO RED. A declaration that survives the disappearance of the rebuilds
    //    it covered is a DORMANT PERMIT — a file recreated at that path would silently inherit the
    //    right, and nobody re-reads a permission that never complains.
    if (!measured.has(file)) {
      faults.push(file + ': DECLARED but no rebuild left — remove the entry (dormant permit)');
    }
    if (!CLASS_SET.has(decl.class)) {
      faults.push(file + ': class "' + decl.class + '" REFUSED — only ' + CLASSES.join(' | ')
        + '. The class says what the replaced record still carries; it is not a label.');
    }
    if (decl.class !== EXEMPT_FROM_JUSTIFICATION
      && (typeof decl.why !== 'string' || decl.why.length <= MIN_WHY)) {
      faults.push(file + ': instructed entry WITHOUT a justification (`why`, more than ' + MIN_WHY
        + ' characters) — write WHICH fields the replaced record carries and why none is lost.');
    }
    if (decl.class === NUMERIC_IMPACT_CLASS
      && (typeof decl.impact !== 'string' || decl.impact.length < MIN_IMPACT)) {
      faults.push(file + ': DEBT without a NUMERIC `impact` (at least ' + MIN_IMPACT
        + ' characters) — name the fields at risk and what their loss costs. A budget measures quantity, never gravity.');
    }
  }

  return faults.sort();
}

module.exports = {
  verdict,
  CLASSES,
  EXEMPT_FROM_JUSTIFICATION,
  NUMERIC_IMPACT_CLASS,
  MIN_WHY,
  MIN_IMPACT,
};
