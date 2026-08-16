// deps-criticality-pure.js — THE DECISIONS of the dependency criticality gate, separated from its I/O.
//
// ⚠️⚠️ WHY THIS FILE EXISTS: these rules used to live INSIDE `tests/deps-criticality-gate.test.js`. But
//    **Stryker does not mutate test code** — the gate logic was therefore UNVERIFIABLE: a `!==` turned
//    into `===`, an inverted bound, a `filter` that no longer filters would have stayed GREEN forever.
//    A false gate is worse than no gate: it REASSURES. Here every rule is PURE ⇒ mutable ⇒ proven.
// ⚠️ CONTRACT: zero I/O (no fs, no git, no network). The gate keeps its reading of the `package.json`
//    files and now only OBSERVES and then calls. NEVER put disk access back here "to simplify" — that
//    would lose the mutability that justifies the file (repo rule: logic goes into `*-pure`).
// ⚠️ DELIBERATE cross-repo duplication (the same module exists in every repo of the fleet): a repo must
//    stand ALONE — GitHub is a bonus, never a production dependency. A shared brick would create an
//    inter-repo coupling worse than the copy. What differs from one repo to the next is the MANIFEST,
//    not the rule.

// ⚠️ EXACT PIN = one version, not a range. ALLOWED are the PRE-RELEASE suffix (`1.5.4-r.1`, the REAL
//    case of `@duckdb/node-api`) and build metadata (`1.2.3+sha`): these forms designate ONE precise
//    version. FORBIDDEN are `^ ~ x * >= <= ||` and spaces — anything that lets npm CHOOSE.
// ⚠️ Refusing a legitimate exact form would be a FALSE POSITIVE, and a gate with false positives ends up
//    disabled.
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

// ⚠️ THE `typeof` IS NOT DECORATIVE — trap proven by Stryker on 31/07/2026: `/regex/.test(x)`
//    CONVERTS its argument to a string, so `EXACT_VERSION.test(['1.2.3'])` is **true**. Without this
//    guard, a malformed `package.json` (value as an array) would pass for an exact version.
// ⚠️ SINGLE SOURCE of the defensive fallback, and this is NOT cosmetic: duplicated in each function, it
//    produced 2 EQUIVALENT mutants (replacing `[]` with a non-empty array gave the same result, since
//    `.map((d) => d.nom)` on a non-value returns `undefined`). Factored out here, the fallback is
//    exercised by the `unclassifiedDeps(null)` tests — the mutant becomes KILLABLE. Avoiding an
//    equivalent mutant BY CONSTRUCTION beats disabling it.
function list(x) {
  return Array.isArray(x) ? x : [];
}

function isExactPin(plage) {
  return typeof plage === 'string' && EXACT_VERSION.test(plage);
}

// Dependencies classified `moteur` that are NOT exactly pinned. `deps` = [{nom, plage, ou}].
// ⚠️ Returns the LIST (not a boolean): a gate must say WHAT to fix, not just "no".
// ⚠️ `hasOwnProperty` MANDATORY: without it, a dependency named `toString`/`constructor` would be seen
//    as classified "moteur" (key inherited from Object) ⇒ an incomprehensible red.
function pinningFaults(deps, moteurs) {
  if (!moteurs) return [];
  return list(deps).filter((d) => d && Object.prototype.hasOwnProperty.call(moteurs, d.nom) && !isExactPin(d.plage));
}

// Dependencies that NEITHER of the two classes mentions. Unclassified = RED: this is the ratchet that
// forces a DECISION, and prevents a rendering engine from sneaking in on a caret.
// ⚠️ DEDUPLICATED: the same dependency declared in 2 `package.json` files is reported only ONCE.
function unclassifiedDeps(deps, moteurs, ordinaires) {
  const connues = new Set([...Object.keys(moteurs || {}), ...Object.keys(ordinaires || {})]);
  const vues = new Set();
  const out = [];
  for (const d of list(deps)) {
    if (!d || connues.has(d.nom) || vues.has(d.nom)) continue;
    vues.add(d.nom);
    out.push(d);
  }
  return out;
}

// Manifest entries that NOBODY installs any more: a phantom classification suggests a coverage that does
// not exist. The manifest must reflect reality IN BOTH DIRECTIONS.
function ghostEntries(deps, moteurs, ordinaires) {
  const installed = new Set(list(deps).filter(Boolean).map((d) => d.nom));
  return [...Object.keys(moteurs || {}), ...Object.keys(ordinaires || {})].filter((n) => !installed.has(n));
}

// ⚠️ CommonJS HERE, and that is a repo CONSTRAINT, not a taste: the hooks are spawned on EVERY tool
//    call and the ESM loader is slower than `require`. NEVER add `"type":"module"`.
module.exports = { EXACT_VERSION, isExactPin, pinningFaults, unclassifiedDeps, ghostEntries };
