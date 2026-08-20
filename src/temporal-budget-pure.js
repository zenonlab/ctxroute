// temporal-budget-pure.js — THE DECISIONS of the temporal budget gate, separated from its I/O.
//
// ⚠️⚠️ WHY THIS FILE EXISTS: this verdict was born INSIDE
//    `test/temporal-budget-gate.test.js`. But **Stryker does not mutate test code** — the rule was
//    therefore UNVERIFIABLE: a `!==` turned into `===`, an inverted bound, a `filter` that no longer
//    filters would have stayed GREEN for ever. A false gate is worse than no gate: it REASSURES.
//    Exactly the `deps-criticality-pure.js` precedent, and the same remedy — the rule becomes PURE,
//    hence mutable, hence proven.
// ⚠️ CONTRACT: ZERO I/O — no `fs`, no `path`, no `child_process`, no `process.env`, no `process.argv`,
//    no `console`, no `process.exit`. It RECEIVES what was measured and RETURNS a verdict. The gate
//    keeps the scan (ast-grep) and the reading of the manifest, and only OBSERVES then calls.
//    🛑 NEVER put disk access back here "to simplify": that would lose the mutability which is the
//    entire justification of the file. Sealed by `lib-pure-must-stay-pure` and `layers-gate`.
//
// ⚠️ THE RULE IT ENCODES. Before any delay: WHO KNOWS? LOCAL, the kernel KNOWS — a process exit, a
//    closed socket, an `EADDRINUSE` are FACTS the OS delivers. Waiting a fixed number of milliseconds
//    instead of asking the authority that knows is not caution, it is a BUG that fires on a loaded
//    machine.

'use strict';

// ⚠️ CLOSED LIST, AND THAT IS THE WHOLE POINT. A third motive would be a way of saying "I did not look
//    for the authority that knows". `local`, `simplicity`, `flaky` are exactly the words this gate
//    exists to refuse. 🛑 Widening it is almost always the wrong answer: what must change is the CODE
//    that waits, not the vocabulary that excuses it.
//      · `distant`     — no authority is reachable at all (another machine, which may never answer).
//      · `undecidable` — alive-versus-frozen: nothing local can decide whether the awaited event will
//                        ever occur (the halting problem).
const ADMISSIBLE = ['distant', 'undecidable'];

// A motive without a real justification is a motive nobody can audit — the ratchet would then be a
// formality. 40 characters is not a style rule: it is the length below which no reader learns WHAT
// authority was looked for and why it could not answer.
const MIN_WHY = 40;

// Occurrences counted per file.
// ⚠️ A `Map`, NEVER a plain object: an object inherits `constructor`/`toString` from `Object.prototype`,
//    so a key colliding with one of them would read as "already counted". Unreachable here (every
//    scanned path carries a `.js`/`.mjs`/`.cjs` extension), and avoiding the class BY CONSTRUCTION is
//    still cheaper than a guard nobody can test — a guard for an unreachable case is an equivalent
//    mutant by construction.
function counts(occurrences) {
  const m = new Map();
  for (const o of occurrences) m.set(o.file, (m.get(o.file) || 0) + 1);
  return m;
}

/**
 * THE VERDICT — pure, total, deterministic.
 * @param {{file: string}[]} occurrences what ast-grep really found
 * @param {Record<string, {count: number, motive: string, why: string}>} budget the manifest's declarations
 * @returns {string[]} faults, sorted; EMPTY when the budget tells the truth
 *
 * ⚠️ Returns the LIST, never a boolean: a gate must say WHAT to fix, not just "no".
 * ⚠️ SORTED: the message must not depend on the order in which the scanner walked the disk, otherwise
 *    the same defect reads differently from one run to the next and people stop trusting the output.
 */
function verdict(occurrences, budget) {
  const faults = [];
  const measured = counts(occurrences);

  for (const [file, n] of measured) {
    const decl = budget[file];
    // ⚠️ A file ABSENT from the budget is held at ZERO — that is the ratchet's default, and it is what
    //    makes "forgetting to declare" impossible rather than merely discouraged.
    if (!decl) {
      faults.push(file + ': ' + n + ' temporal call(s), NOT DECLARED (a file absent from the budget is held at ZERO)');
      continue;
    }
    // ⚠️ AN EQUALITY, NOT A CEILING. Measured above the declaration = a new wait appeared. Measured
    //    BELOW = a stale declaration, which widens the budget for free and in silence — the same
    //    doctrine as a stale layer justification, which must DIE rather than linger.
    // ⚠️ TWO INDEPENDENT COMPARISONS, and that shape is DELIBERATE — not a style choice. Written as
    //    `if (count !== n) { … n > count ? … : … }`, the strict `>` is only ever evaluated when the two
    //    numbers DIFFER, so turning it into `>=` changes nothing: an EQUIVALENT mutant by construction,
    //    hence an eternal survivor. Split like this, `>=` (or `<=`) fires on the truthful case and dies
    //    there. Avoiding an equivalent mutant BY CONSTRUCTION beats disabling it.
    const head = file + ': ' + n + ' temporal call(s) measured, ' + decl.count + ' declared';
    if (n > decl.count) faults.push(head + ' — RATCHET CROSSED: prove the motive, or remove the wait');
    if (n < decl.count) faults.push(head + ' — stale ratchet, LOWER IT');
    if (!ADMISSIBLE.includes(decl.motive)) {
      faults.push(file + ': motive "' + decl.motive + '" REFUSED — only ' + ADMISSIBLE.join(' | ')
        + '. In LOCAL the kernel KNOWS: a delay is a BUG, not a setting.');
    }
    if (typeof decl.why !== 'string' || decl.why.length < MIN_WHY) {
      faults.push(file + ': the motive carries no usable justification (`why`)');
    }
  }

  // ⚠️ THE INVERSE PART, and it is not symmetry for its own sake: without it a declaration survives the
  //    disappearance of the calls it covered, and the budget only ever grows.
  for (const file of Object.keys(budget)) {
    if (!measured.has(file)) {
      faults.push(file + ': DECLARED but no temporal call left — remove the entry (stale ratchet)');
    }
  }

  return faults.sort();
}

module.exports = { verdict, ADMISSIBLE };
