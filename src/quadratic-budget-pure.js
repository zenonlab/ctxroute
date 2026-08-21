// quadratic-budget-pure.js — THE DECISIONS of the quadratic gate, separated from its I/O.
//
// ⚠️⚠️ WHY THIS FILE EXISTS. **Stryker does not mutate test code.** A verdict written inside
//    `test/quadratic-gate.test.js` would therefore be UNVERIFIABLE: a `>` turned into `>=`, an
//    inverted bound, a `filter` that no longer filters would stay GREEN for ever. A false gate is
//    worse than no gate, because it REASSURES and people stop looking. Exactly the
//    `temporal-budget-pure.js` / `deps-criticality-pure.js` precedent, and the same remedy — the
//    rule becomes PURE, hence mutable, hence proven.
//
// ⚠️ CONTRACT: ZERO I/O — no `fs`, no `path`, no `child_process`, no `process.env`, no `process.argv`,
//    no `console`, no `process.exit`. It RECEIVES what was measured and RETURNS a verdict. The gate
//    keeps the scan (ast-grep) and the reading of the manifest, and only OBSERVES then calls.
//    🛑 NEVER put disk access back here "to simplify": that would lose the mutability which is the
//    entire justification of the file. Sealed by `layers-gate` and by dependency-cruiser.
//
// ⚠️ THE RULE IT ENCODES — COMPLEXITY DECLARES ITSELF, third twin of TIME and SPACE. The target is a
//    fleet of HUNDREDS of sites with THOUSANDS of pages: a scale defect does not slow anything down,
//    it CLOSES A CONTRACT, and its retrofit is prohibitive, so it belongs to the SPEC. Before every
//    loop: AND AT 10,000? — 5,000 elements compared pairwise is 12.5 million pairs.
//
// ⚠️ THIS MODULE CONTAINS NO NESTED TRAVERSAL, AND THAT IS DELIBERATE: the judge must not be the
//    first defendant. Membership goes through a `Set` (`has`, a constant-time lookup) and never
//    through an `Array.includes` inside a loop, which the rule would — rightly — count as a nesting.

'use strict';

// ⚠️ CLOSED LIST, AND THAT IS THE WHOLE POINT. A fifth class would be a way of saying "I did not look
//    at what the inner traversal runs over". `small`, `fine`, `probably-ok` are exactly the words this
//    gate exists to refuse.
//      · `O(N)` / `O(N log N)` — the inner traversal runs over a BOUNDED collection (a constant table,
//        a fixed key set). An ACT OF INSTRUCTION: it owes a written `why`.
//      · `DEBT`               — genuinely quadratic and knowingly kept. It owes a `why` AND a NUMERIC
//        `impact`, because a budget measures QUANTITY and never GRAVITY.
//      · `INHERITED_DEBT`     — the measurement of the day. EXEMPT from justification ON PURPOSE.
const CLASSES = ['O(N)', 'O(N log N)', 'DEBT', 'INHERITED_DEBT'];

// ⚠️ A `Set` and NOT `CLASSES.includes(...)`: the membership test lives INSIDE a loop over the budget,
//    so an `Array.includes` there would be a traversal inside a traversal — this module's own rule
//    would flag its own judge. Avoiding the shape BY CONSTRUCTION beats declaring an exemption.
const CLASS_SET = new Set(CLASSES);

// ⚠️ EXEMPT ON PURPOSE, AND THIS IS NOT LENIENCY. `INHERITED_DEBT` is the measurement of the day:
//    nobody has instructed those files one by one. Demanding a sentence for each would produce
//    INVENTED justifications, and an invented justification makes the case look SETTLED — strictly
//    worse than an honest blank. Every OTHER class is an act of instruction and defends itself in the
//    diff. 🛑 Never extend this exemption to another class.
const EXEMPT_FROM_JUSTIFICATION = 'INHERITED_DEBT';

// ⚠️ The only class that owes a NUMERIC impact. A budget counts occurrences; it cannot tell a benign
//    nesting apart from one that closes a contract at 5,000 pages. The number is what makes the two
//    distinguishable to a reader.
const NUMERIC_IMPACT_CLASS = 'DEBT';

// Not style rules: these are the lengths below which no reader learns WHAT the inner traversal runs
// over, nor WHAT the nesting costs at scale.
const MIN_WHY = 60;
const MIN_IMPACT = 40;

// Occurrences counted per file.
// ⚠️ A `Map`, NEVER a plain object: an object inherits `constructor`/`toString` from
//    `Object.prototype`, so a key colliding with one of them would read as "already counted".
//    Unreachable here (every scanned path carries a `.js`/`.mjs`/`.cjs` extension), and avoiding the
//    class BY CONSTRUCTION is still cheaper than a guard nobody can test — a guard for an unreachable
//    case is an equivalent mutant by construction.
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
 * ⚠️ SORTED: the message must not depend on the order in which the scanner walked the disk, otherwise
 *    the same defect reads differently from one run to the next and people stop trusting the output.
 * ⚠️ THE KEY IS A RELATIVE PATH, NEVER A BASENAME — this repository holds homonyms across `src/`,
 *    `src/sources/`, `src/hooks/`, `tools/` and `test/`. Two of them melted into one key would make
 *    the red NON-ACTIONABLE: one nesting too many, in an unknown one of two files.
 */
function verdict(occurrences, files) {
  const faults = [];
  const measured = counts(occurrences);
  // ⚠️ THE MANIFEST IS READ THROUGH A `Map`, NEVER BY INDEXING THE OBJECT — and this is the SAME
  //    class as `counts` above, on the other side of the comparison. `JSON.parse` returns a plain
  //    object, so `files['constructor']` yields `Object.prototype.constructor`: TRUTHY. An undeclared
  //    file would then be read as DECLARED, `decl.max` would be `undefined`, and BOTH ratchet
  //    comparisons would be false ⇒ the gate goes SILENT on it. A guard that fails OPEN is worse than
  //    no guard. `Object.entries` walks OWN keys only, which removes the class by construction.
  const declared = new Map(Object.entries(files));

  for (const [file, n] of measured) {
    const decl = declared.get(file);
    // ⚠️ A file ABSENT from the budget is held at ZERO. That is the ratchet's default, and it is what
    //    gives 100 % of the rule on all NEW code without first demanding that the existing code be
    //    repaired — forgetting to declare becomes impossible rather than merely discouraged.
    if (!decl) {
      faults.push(file + ': ' + n + ' nested traversal(s), NOT DECLARED (a file absent from the budget is held at ZERO)');
      continue;
    }
    // ⚠️ AN EQUALITY, NOT A CEILING. Measured above the declaration = a new nesting appeared.
    //    Measured BELOW = a stale declaration, which widens the budget for free and in silence: the
    //    ground gained is taken back by the next writer, who inherits the old ceiling.
    // ⚠️ TWO INDEPENDENT COMPARISONS, and that shape is DELIBERATE — not a style choice. Written as
    //    `if (max !== n) { … n > max ? … : … }`, the strict `>` is only ever evaluated when the two
    //    numbers DIFFER, so turning it into `>=` changes nothing: an EQUIVALENT mutant by
    //    construction, hence an eternal survivor. Split like this, `>=` (or `<=`) fires on the
    //    truthful case and dies there. Avoiding an equivalent mutant BY CONSTRUCTION beats disabling
    //    it.
    const head = file + ': ' + n + ' nested traversal(s) measured, ' + decl.max + ' declared';
    if (n > decl.max) faults.push(head + ' — RATCHET CROSSED: prove the class, or remove the nesting');
    if (n < decl.max) faults.push(head + ' — stale ratchet, LOWER IT');
  }

  // ⚠️ THE DECLARATION SIDE, walked SEPARATELY and not inside the loop above: a declaration must be
  //    judged even when nothing matches it any more, otherwise a badly-formed entry could hide behind
  //    the disappearance of its own occurrences.
  for (const [file, decl] of declared) {
    // ⚠️ ZERO PHANTOM ENTRY, and it is not symmetry for its own sake: a declaration that survives the
    //    disappearance of the nestings it covered is a DORMANT PERMIT — a file recreated at that path
    //    would silently inherit the right.
    if (!measured.has(file)) {
      faults.push(file + ': DECLARED but no nested traversal left — remove the entry (dormant permit)');
    }
    if (!CLASS_SET.has(decl.class)) {
      faults.push(file + ': class "' + decl.class + '" REFUSED — only ' + CLASSES.join(' | ')
        + '. The class says what the inner traversal runs over; it is not a label.');
    }
    if (decl.class !== EXEMPT_FROM_JUSTIFICATION
      && (typeof decl.why !== 'string' || decl.why.length <= MIN_WHY)) {
      faults.push(file + ': instructed entry WITHOUT a justification (`why`, more than ' + MIN_WHY
        + ' characters) — write WHAT the inner traversal runs over and why it is bounded.');
    }
    if (decl.class === NUMERIC_IMPACT_CLASS
      && (typeof decl.impact !== 'string' || decl.impact.length < MIN_IMPACT)) {
      faults.push(file + ': DEBT without a NUMERIC `impact` (at least ' + MIN_IMPACT
        + ' characters) — write what it costs at 10,000. A budget measures quantity, never gravity.');
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
