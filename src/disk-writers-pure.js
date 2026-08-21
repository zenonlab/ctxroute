// disk-writers-pure.js — THE DECISIONS of the disk-writer gate, separated from its I/O.
//
// ⚠️⚠️ WHY THIS FILE EXISTS, AND IT IS NOT TIDINESS. **Stryker does not mutate test code.**
//    A rule written inside `test/disk-writers-gate.test.js` would therefore be UNVERIFIABLE:
//    an inverted comparison, a `some` turned into `every`, a `filter` that no longer filters
//    would stay GREEN for ever. A false gate is worse than no gate — it REASSURES, and people
//    stop looking. Same precedent, same remedy as `temporal-budget-pure.js` and
//    `deps-criticality-pure.js`.
// ⚠️ CONTRACT: ZERO I/O — no `fs`, no `path`, no `child_process`, no `process.env`, no
//    `process.argv`, no `console`, no `process.exit`. It RECEIVES what was measured (the write
//    call sites, found by ast-grep) plus the manifest, and RETURNS a verdict. The gate keeps the
//    scan and the reading of `disk-writers.json`, and only OBSERVES then calls.
//    🛑 NEVER put disk access back here "to simplify": that would lose the mutability which is
//    the entire justification of the file. Sealed by `disk-writers-pure-must-stay-pure`
//    (dependency-cruiser) and by `layers-gate`.
//
// ⚠️ THE RULE IT ENCODES — SPACE DECLARES ITSELF. Disk and RAM are FINITE and this machine runs
//    24/7 for YEARS with no operator. So anything that WRITES declares its CEILING and its
//    EVICTION POLICY **in the same gesture as its creation**. Without a ceiling the component
//    DOES NOT EXIST: that is an ARCHITECTURE bug, never an operations one. The question is never
//    "is it big?" but "at 10 years, how much is this worth?" — monotonic growth is a DATED
//    outage, and "we will purge later" puts a human back in a loop this project exists to remove.
// 🛑 AN HONEST GAP MUST BE LOUD, NEVER ABSENT. `policy: "none"` is ADMISSIBLE — it is the only
//    way a writer with no eviction can be named, counted and re-found. What is refused is
//    SILENCE: a `none` costs a written `reason` and a `workItem`, so nobody can ship a gap by
//    saying nothing.

'use strict';

// ⚠️ CLOSED LIST. A writer's CLASS is what tells the next reader which ceiling to expect. An
//    eighth word would almost certainly be a synonym of one of these, and a vocabulary that
//    grows per author is a vocabulary nobody can audit.
//      · `state`      — one file per live scope, under the framework's state directory.
//      · `snapshot`   — a single file of fixed name, replaced in full.
//      · `log`        — append-only; the class that grows monotonically by construction.
//      · `lock`       — a filesystem entry used as a mutual-exclusion token.
//      · `evictor`    — REMOVES only; it creates nothing (its budget may legitimately be 0).
//      · `rendezvous` — a kernel meeting point that happens to leave a filesystem entry.
//      · `vendor`     — writes OUTSIDE this repository (into an operator's environment).
const CLASSES = ['state', 'snapshot', 'log', 'lock', 'evictor', 'rendezvous', 'vendor'];

// ⚠️ CLOSED LIST, AND `none` IS DELIBERATELY IN IT. Removing `none` would not remove the gaps,
//    it would remove their DECLARATION — every undeclared writer would then be pushed into a
//    comfortable lie ("bounded-count, surely"). A gap that is named is a gap that gets closed.
//      · `bounded-count`  — the number of entries is bounded BY CONSTRUCTION (a fixed name, or
//                           a mirror of an in-memory ceiling). Not a probe: a construction.
//      · `lifetime`       — created and removed inside the owning operation, or removed by the
//                           OS when the owner dies. Nothing survives the writer.
//      · `event`          — removed on an EVENT received from outside (a compaction order),
//                           never on a guess about a session being over.
//      · `age`            — removed by age/TTL.
//      · `none`           — NO eviction at all. Requires `reason` + `workItem`.
const POLICIES = ['bounded-count', 'lifetime', 'event', 'age', 'none'];

// A justification below this length teaches nobody WHAT is bounded and BY WHAT. It is not a
// style rule: it is the length under which a reader cannot re-derive the decision.
const MIN_WHY = 40;

// 🛑 A GAP COSTS MORE WORDS THAN A POLICY, ON PURPOSE. Declaring "there is no eviction" must be
//    more expensive to write than declaring a real one, or `none` becomes the lazy default.
const MIN_REASON = 80;

/** @param {unknown} n @returns {boolean} */
function isBudgetNumber(n) {
  // ⚠️ `>= 0` AND NOT `> 0`: an EVICTOR creates nothing, and its honest budget is ZERO. Writing
  //    `> 0` would force a fake "1" onto every evictor — a number that means nothing, in a file
  //    whose only value is that its numbers mean something.
  // ⚠️ NO `typeof n === 'number'` GUARD, and its absence is DELIBERATE: `Number.isInteger`
  //    already answers `false` for every non-number, so the guard would be an EQUIVALENT mutant
  //    by construction — an eternal survivor. Avoiding one beats disabling one.
  return Number.isInteger(n) && /** @type {number} */ (n) >= 0;
}

/** @param {unknown} s @param {number} min @returns {boolean} */
function isText(s, min) {
  return typeof s === 'string' && s.length >= min;
}

/**
 * The faults of ONE declaration. Pure, total.
 * @param {string} file
 * @param {any} d the declared entry
 * @param {string[]} sources the admitted path-source prefixes
 * @returns {string[]}
 */
function declarationFaults(file, d, sources) {
  const faults = [];

  if (!CLASSES.includes(d.class)) {
    faults.push(file + ': class "' + d.class + '" REFUSED — only ' + CLASSES.join(' | '));
  }

  // ⚠️ AN ABSENT `policy` FALLS IN HERE, and that is the commonest form of this fault: a
  //    declaration written in a hurry carries a path and a budget and forgets the only field
  //    that says what happens at year ten.
  if (!POLICIES.includes(d.policy)) {
    faults.push(file + ': policy "' + d.policy + '" REFUSED — only ' + POLICIES.join(' | '));
  }

  const budget = d.budget;
  // ⚠️ THE TWO KEYS ARE NAMED EXPLICITLY, never walked in a loop: a loop reads better and makes
  //    "no key at all" indistinguishable from "one key present but not a number" for the mutant
  //    that empties the loop body — an equivalent mutant, hence an eternal survivor.
  // ⚠️ EITHER key satisfies the budget: a count and a size answer the same question ("what does
  //    this cost at 10 years?") from two angles, and demanding both would make the file lie in
  //    the half nobody could measure.
  // 🛑 NO `typeof budget !== 'object'` GUARD, AND ITS ABSENCE IS DELIBERATE (measured 2026-08-21).
  //    It was there and it SURVIVED mutation, because it is equivalent for every value this
  //    manifest can hold: the source is `JSON.parse`, so a budget is an object, an array, a string,
  //    a number, a boolean or null — and on ALL of them the clause below already faults. The only
  //    value that would tell the two apart is a FUNCTION carrying a `maxFiles` property, which no
  //    JSON document can produce. Writing a test for it would FREEZE dead code for ever; the rule
  //    here is that an equivalent mutant is removed at the source, never killed.
  if (!budget || (!isBudgetNumber(budget.maxFiles) && !isBudgetNumber(budget.maxBytes))) {
    faults.push(file + ': no usable budget — declare an integer maxFiles and/or maxBytes (>= 0)');
  }

  if (!isText(d.why, MIN_WHY)) {
    faults.push(file + ': the declaration carries no usable justification (why)');
  }

  // ⚠️ THE PATH IS AN EXPRESSION, NEVER A LITERAL — and the check is a PREFIX against a declared
  //    set, not a shape. `os.homedir()` has the shape of a module accessor and is precisely the
  //    hardcoding this forbids: only a SOURCE named in the manifest counts.
  // ⚠️ `some`, not `every`: a path comes from ONE source. `every` would demand that a path start
  //    with all of them at once, i.e. reject everything — a gate red on the truth gets disarmed.
  // ⚠️ `String(...)` AND NOT A `typeof` TERNARY: a missing path must be TOTAL here, and the
  //    obvious `typeof d.path === 'string' ? d.path : ''` hides an equivalent mutant — that `''`
  //    can be rewritten to any other non-matching literal with no observable change.
  const declaredPath = String(d.path);
  const known = sources.some((p) => declaredPath.startsWith(p));
  if (!known && !(d.pathSourceGap
      && isText(d.pathSourceGap.reason, MIN_REASON) && isText(d.pathSourceGap.workItem, 1))) {
    faults.push(file + ': path "' + declaredPath + '" comes from no declared source ('
      + sources.join(' | ') + ') and no pathSourceGap explains it');
  }

  // 🛑 THE HALF THAT KEEPS `none` HONEST. Without it, `none` would be the cheapest word in the
  //    file and every writer would end up wearing it.
  if (d.policy === 'none' && !(isText(d.reason, MIN_REASON) && isText(d.workItem, 1))) {
    faults.push(file + ': policy "none" without a written reason and a workItem'
      + ' — an honest gap must be LOUD, never absent');
  }

  return faults;
}

/**
 * THE VERDICT — pure, total, deterministic.
 *
 * @param {{file: string, method: string}[]} occurrences the fs call sites really found by ast-grep
 * @param {any} manifest the parsed `disk-writers.json`
 * @returns {string[]} faults, sorted; EMPTY when the manifest tells the truth
 *
 * ⚠️ Returns the LIST, never a boolean: a gate must say WHAT to fix, not just "no".
 * ⚠️ SORTED: the message must not depend on the order in which the scanner walked the disk,
 *    otherwise the same defect reads differently from one run to the next and people stop
 *    trusting the output.
 */
function verdict(occurrences, manifest) {
  const faults = [];
  const primitives = manifest.primitives || {};
  const declared = manifest.writers || {};
  const sources = manifest.pathSources || [];

  // 🛑 ANTI-VACUITY, AT THE LEVEL OF THE POLICY ITSELF. With no declared source every path is
  //    accepted, so the path half of this gate would certify instead of protecting — the exact
  //    failure mode this repository fears most (a GREEN gate that sees nothing).
  if (sources.length === 0) {
    faults.push('pathSources is empty — every path would then be accepted,'
      + ' and the gate would certify instead of protecting');
  }

  // ① EVERY OBSERVED PRIMITIVE MUST BE CLASSIFIED. This is what makes the WRITE SET derived
  //    instead of copied: a primitive nobody has classified is RED, so an `fs` method used for
  //    the first time tomorrow enters the table the day it is written, and cannot slip in as a
  //    silent reader.
  const unclassified = new Set();
  /** @type {Map<string, Set<string>>} */
  const measured = new Map();
  for (const o of occurrences) {
    const kind = primitives[o.method];
    if (kind !== 'write' && kind !== 'read') { unclassified.add(o.method); continue; }
    if (kind === 'read') continue;
    if (!measured.has(o.file)) measured.set(o.file, new Set());
    /** @type {Set<string>} */ (measured.get(o.file)).add(o.method);
  }
  for (const m of unclassified) {
    faults.push('primitive ' + m + ' is used but NOT CLASSIFIED'
      + ' — add it to primitives as "write" or "read"');
  }

  // ② A WRITER ABSENT FROM THE MANIFEST IS HELD AT ZERO. That default is what makes "forgetting
  //    to declare" impossible rather than merely discouraged.
  for (const [file, methods] of measured) {
    const d = declared[file];
    if (!d) {
      faults.push(file + ': WRITES to disk (' + Array.from(methods).sort().join(', ')
        + ') and is NOT DECLARED — a writer absent from the manifest is held at ZERO');
      continue;
    }
    for (const f of declarationFaults(file, d, sources)) faults.push(f);
  }

  // ③ THE INVERSE PART, and it is not symmetry for its own sake: a declaration that survives the
  //    disappearance of its writes is a DORMANT PERMIT. It gets re-inherited by the next file
  //    that takes that name, budget included, without anyone deciding anything.
  for (const file of Object.keys(declared)) {
    if (!measured.has(file)) {
      faults.push(file + ': DECLARED but no write primitive left'
        + ' — remove the entry (a stale declaration is a dormant permit)');
    }
  }

  return faults.sort();
}

module.exports = { verdict, declarationFaults, isBudgetNumber, CLASSES, POLICIES, MIN_WHY, MIN_REASON };
