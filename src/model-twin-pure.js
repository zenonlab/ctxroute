// model-twin-pure.js — THE DECISIONS of the model-twin gate, separated from its I/O.
//
// ⚠️⚠️ WHY THIS FILE EXISTS. **Stryker does not mutate test code.** A verdict written inside
//    `test/model-twin-gate.test.js` would therefore be UNVERIFIABLE: a `>` turned into `>=`, an
//    inverted comparison, a `filter` that no longer filters would stay GREEN for ever. A false
//    gate is worse than none, because it REASSURES and people stop looking. Same precedent, same
//    remedy as `quadratic-budget-pure.js` and `state-entry-rebuild-pure.js`.
//
// ⚠️ CONTRACT: ZERO I/O — no `fs`, no `path`, no `child_process`, no `process.env`, no
//    `process.argv`, no `console`, no `process.exit`. It RECEIVES facts already measured (file
//    texts, the mutate list, the import graph) and RETURNS a verdict. The gate keeps the disk.
//
// ⚠️ THE RULE IT ENCODES — **A MODEL MAY NOT SHARE CODE WITH WHAT IT JUDGES.**
//    This repository owns independent models whose only reason to exist is to CONTRADICT the
//    engine (`cadence-spec.js` against `gate.js`, `language-spec.js` against `sources/*`). On
//    2026-08-23 `cadence-spec.js` was found to have copied the SHAPE of `gate.js`: both wrote
//    `next[doc] = { seen: true, sinceLastCall: entry.sinceLastCall + 1 }`, the engine dropped a
//    flag and the model dropped the same flag. **The 11,346 exhaustive cases were GREEN on that
//    defect from the day they were written.** A model that copies its defendant cannot contradict
//    it — it only proves a copy agrees with itself.
//
// 🛑 SEPARATION OF POWERS: `tokenize` + `sharedRuns` DETECT and know NOTHING about exemptions;
//    `model-twin-budget.json` carries the policy and the ratchet; `verdict` confronts the two.
//    Never give the detector a list of things to ignore — an exemption inside a detector is a
//    permanent hole nobody ever reads again.

'use strict';

// ⚠️ CLOSED LIST, and that is the point. A third class would be a way of writing "I did not look".
//      · `CONTRACT`       — the run is a shared SIGNATURE or a shared vocabulary the differential
//                           REQUIRES (same arity, same order). An act of instruction: it owes a
//                           written `why`.
//      · `INHERITED_TWIN` — the measurement of the day. EXEMPT from justification ON PURPOSE:
//                           nobody has instructed those runs one by one, and demanding a sentence
//                           per run would produce INVENTED ones — a false justification makes a
//                           case look settled, which is strictly worse than an honest blank.
const CLASSES = ['CONTRACT', 'INHERITED_TWIN'];

// ⚠️ A `Set`, never `CLASSES.includes(...)` inside the loop below: that would be a traversal
//    nested in a traversal, and the neighbouring quadratic rule would — rightly — flag this file.
const CLASS_SET = new Set(CLASSES);

const EXEMPT_FROM_JUSTIFICATION = 'INHERITED_TWIN';

// Not a style rule: below this length no reader learns WHY the two files are allowed to agree
// word for word.
const MIN_WHY = 60;

// ⚠️ THE FLOOR IS PART OF THE VERDICT, not of the caller. A derivation that returns nothing looks
//    EXACTLY like a repository with no models at all, and this gate would then certify instead of
//    protecting — the very defect it exists to close, reproduced in its own guardian. Measured on
//    2026-08-23: 2 models, 7 pairs. 🛑 Never lower these to make a run pass.
const MIN_MODELS = 2;
const MIN_PAIRS = 7;

// Modules whose presence makes a file an I/O shell rather than a model.
// ⚠️ DELIBERATELY a property of the TEXT, not of a name: `mesurer la capacité, pas le nom`.
const IO_MODULES = /(?:require\(\s*|from\s+)['"](?:node:)?(?:fs|path|child_process|os|net|http|https|worker_threads|readline|url|crypto|tty|dns|zlib)['"]/;
const IO_GLOBALS = /\bprocess\.(?:env|argv|exit|stdout|stderr|stdin|cwd)\b|\bconsole\.\w+\s*\(|\brequire\.main\b/;

/**
 * Is this module PURE — i.e. can it be a model at all?
 * @param {string} source the module's text
 * @returns {boolean}
 * ⚠️ Comments are stripped FIRST: a doc paragraph that merely NAMES `fs` must not disqualify a
 *    model. This repository's docs are long and full of such prose.
 */
function isPure(source) {
  const code = stripComments(source);
  if (IO_MODULES.test(code)) return false;
  return !IO_GLOBALS.test(code);
}

/** Comment-free view of a source, used by `isPure` and by the tokenizer's callers. */
function stripComments(source) {
  const noBlocks = String(source).replace(/\/\*[\s\S]*?\*\//g, '');
  return noBlocks.replace(/^[ \t]*\/\/.*$/gm, '');
}

// ⚠️ BUILT INSIDE `tokenize`, NEVER at module scope: a top-level literal executes ONCE at import
//    time, outside every test's execution window — Stryker's perTest coverage analysis then has
//    NO test to attribute it to (`static: true, coveredBy: []`), and mutation testing skips
//    straight to "Survived" without ever really trying. MEASURED (2026-08-31): moving these two
//    literals from module scope into the function body is what turned 16 unkillable "static"
//    survivors into ordinary, killable mutants — direct sabotage had already proven each one
//    breaks a real assertion; only the module-level PLACEMENT was hiding that from the tool.
function operatorSets() {
  const OP3 = ['===', '!==', '...', '**=', '&&=', '||=', '??=', '>>>'];
  const OP2 = ['==', '!=', '<=', '>=', '&&', '||', '??', '=>', '++', '--', '+=', '-=', '*=', '/=', '%=', '?.', '**', '<<', '>>'];
  return { OP3_SET: new Set(OP3), OP2_SET: new Set(OP2) };
}

/**
 * THE DETECTOR, half one — a JavaScript token stream, comments removed, line numbers kept.
 *
 * ⚠️ WHY A TOKENIZER AND NOT `jscpd`, WHICH THE REPOSITORY ALREADY OWNS. MEASURED 2026-08-23:
 *    `jscpd` 5.0.12 has **ZERO sensitivity** to the defect of that day — identical clone counts
 *    with and without it restored, at every setting from 5 lines/50 tokens down to 1 line/10
 *    tokens. Its window is a LINE window, and the defect is a 13-token EXPRESSION sitting on one
 *    line. It also emits NO file name in any reporter, so it cannot even say WHICH pair agreed.
 * ⚠️ Strings are kept WHOLE and literal: a copied string literal is exactly the kind of agreement
 *    this gate must see. Regex-versus-division is never disambiguated, on purpose — both sides are
 *    tokenized by the SAME rule, so a shared run stays a shared run either way.
 *
 * @param {string} source
 * @returns {{t: string, line: number}[]}
 */
function tokenize(source) {
  const { OP3_SET, OP2_SET } = operatorSets();
  const src = String(source);
  const out = [];
  let i = 0;
  let line = 1;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    // Stryker disable next-line EqualityOperator: EQUIVALENT mutant PROVEN (sabotage script, 0
    // divergence across many corpora) — the outer loop's own `i < n` bound (unmutated, above)
    // already stops the scan the instant i reaches n, so widening THIS inner check to `<=` only
    // adds one harmless out-of-range read (no token is pushed inside a comment) before that outer
    // bound catches it anyway.
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      // Stryker disable next-line EqualityOperator: same proof as the line-comment scanner above —
      // the outer `i < n` bound already stops the scan; the inner `<=` variant is unobservable.
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++; }
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      const start = line;
      let s = c;
      i++;
      while (i < n && src[i] !== quote) {
        if (src[i] === '\\') { s += src[i]; i++; }
        if (src[i] === '\n') line++;
        s += src[i];
        i++;
      }
      s += quote;
      i++;
      out.push({ t: s, line: start });
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let s = '';
      while (i < n && /[A-Za-z0-9_$]/.test(src[i])) { s += src[i]; i++; }
      out.push({ t: s, line });
      continue;
    }
    if (/[0-9]/.test(c)) {
      let s = '';
      while (i < n && /[0-9.eExXa-fA-F_]/.test(src[i])) { s += src[i]; i++; }
      out.push({ t: s, line });
      continue;
    }
    const three = src.slice(i, i + 3);
    if (OP3_SET.has(three)) { out.push({ t: three, line }); i += 3; continue; }
    const two = src.slice(i, i + 2);
    if (OP2_SET.has(two)) { out.push({ t: two, line }); i += 2; continue; }
    out.push({ t: c, line });
    i++;
  }
  return out;
}

/**
 * THE DETECTOR, half two — every MAXIMAL run of identical tokens shared by two token streams.
 *
 * ⚠️ IT TAKES NO EXEMPTION AND NEVER WILL. Whoever wants a run tolerated declares it in the
 *    budget, in writing, where a reader will find it.
 * 📐 THRESHOLD CHOSEN BY MEASUREMENT (2026-08-23), never by taste — see the budget's `_doc_min`.
 *
 * @param {{t: string, line: number}[]} a
 * @param {{t: string, line: number}[]} b
 * @param {number} minTokens
 * @returns {{tokens: number, aLine: number, bLine: number, text: string}[]} sorted longest first
 */
function sharedRuns(a, b, minTokens) {
  if (!(minTokens >= 1)) return [];
  const A = a.map((x) => x.t);
  const B = b.map((x) => x.t);
  const index = new Map();
  // ⚠️ The inner `slice/join` runs over a CONSTANT window (`minTokens`), so this is O(N) and not a
  //    nesting over the data — declared as such in `quadratic-budget.json`.
  // Stryker disable next-line ArithmeticOperator: EQUIVALENT mutant PROVEN (sabotage script, 0
  // divergence over 768+ probes incl. repetitive/edge corpora). `i - minTokens <= A.length` only
  // widens the loop to extra out-of-range starts whose slice is SHORTER than `minTokens` tokens —
  // its joined key therefore has too few space separators to ever equal a real `minTokens`-token
  // key from the (correctly bounded) B-side scan below, since no token ever contains a space.
  for (let i = 0; i + minTokens <= A.length; i++) {
    const key = A.slice(i, i + minTokens).join(' ');
    const bucket = index.get(key);
    if (bucket) bucket.push(i); else index.set(key, [i]);
  }
  const seen = new Set();
  const found = [];
  // Stryker disable next-line ArithmeticOperator: same proof as the A-side loop above, mirrored.
  for (let j = 0; j + minTokens <= B.length; j++) {
    const key = B.slice(j, j + minTokens).join(' ');
    const hits = index.get(key);
    if (!hits) continue;
    for (const i of hits) {
      let after = minTokens;
      // Stryker disable next-line ConditionalExpression,EqualityOperator,ArithmeticOperator,LogicalOperator:
      // ALL FOUR (incl. LogicalOperator `&&`->`||` on the FIRST `&&`) are EQUIVALENT mutants
      // PROVEN (sabotage script, 0 divergence over 5,000 randomized probes incl. small-vocabulary
      // corpora built to force out-of-range coincidences). ⚠️ CORRECTED 31/08/2026 — an earlier
      // note here called the LogicalOperator mutant "real" based on a NAIVE TEXT substitution
      // (`a && b && c` -> `a || b && c`, then re-parsed by JS, which regroups via precedence as
      // `a || (b && c)`). Stryker mutates the AST NODE, preserving left-associative grouping:
      // the real mutant is `(a && b) && c` -> `(a || b) && c`, i.e. only the FIRST `&&` node is
      // swapped, the second stays untouched. Under that grouping the two clauses `a`
      // (`i + after < A.length`) and `b` (`j + after < B.length`) can only ever disagree by one
      // being out of range while the other is in range — and whichever side is OUT of range reads
      // `undefined` (an out-of-bounds array read), compared against a REAL in-range token on the
      // other side in clause `c`. A real token is never `=== undefined`, so `c` is false in every
      // case where `a` and `b` disagree, making the extra `||` inert: `(a||b)&&c` collapses to
      // exactly `a&&b&&c` on every input. Only when BOTH `a` and `b` are false could `c` read
      // `undefined === undefined`, but then `(false||false)&&c` is false either way — no
      // divergence there either. Re-tested with the FIX (correctly parenthesized mutant) — the
      // dedicated tests below ("requires BOTH sides in range to extend a match forward/backward")
      // do NOT distinguish it, confirming equivalence rather than a coverage gap.
      while (i + after < A.length && j + after < B.length && A[i + after] === B[j + after]) after++;
      let before = 0;
      // Stryker disable next-line ConditionalExpression,ArithmeticOperator,LogicalOperator:
      // BOTH (incl. LogicalOperator `&&`->`||` on the FIRST `&&`) are EQUIVALENT mutants PROVEN
      // (sabotage script, 0 divergence over 5,000 randomized probes, including deliberately
      // repetitive corpora designed to trigger a coincidental out-of-range match). ⚠️ CORRECTED
      // 31/08/2026 — same fix as the forward loop above: Stryker mutates the AST node and keeps
      // left-associative grouping, `(a && b) && c` -> `(a || b) && c`, NOT the naive text
      // substitution's `a || (b && c)`. As soon as one side's index goes negative, that side reads
      // `undefined` (out-of-bounds), compared in clause `c` against a REAL token on the OTHER,
      // in-range side — that comparison is always false, so the extra `||` never changes the
      // outcome: `(a||b)&&c` collapses to `a&&b&&c` on every input, including the case where BOTH
      // sides are simultaneously out of range (`(false||false)&&c` is false regardless of `c`).
      while (i - before - 1 >= 0 && j - before - 1 >= 0 && A[i - before - 1] === B[j - before - 1]) before++;
      // ⚠️ KEYED ON THE MAXIMAL START, which is what makes every sub-run of one copy collapse into
      //    a SINGLE finding. Without it a 78-token copy would be reported 67 times and the budget
      //    would become unreadable — an unreadable gate is a gate people unplug.
      const key2 = (i - before) + ':' + (j - before);
      if (seen.has(key2)) continue;
      seen.add(key2);
      found.push({
        tokens: before + after,
        // Stryker disable next-line ArithmeticOperator: EQUIVALENT mutant PROVEN (sabotage script,
        // 0 divergence over 1,400+ probes) — the maximal-start dedup above (`key2`/`seen`) always
        // keeps the FIRST-discovered candidate for a given true start, and that candidate is always
        // the one scanned at the smallest `(i, j)`, which by construction has `before === 0` (an
        // earlier candidate would already have claimed the key otherwise). So `i - before` and
        // `i + before` are the same value, `i`, in every record this function actually returns.
        aLine: a[i - before].line,
        // Stryker disable next-line ArithmeticOperator: same proof as `aLine` above, mirrored on `j`.
        bLine: b[j - before].line,
        // Stryker disable next-line ArithmeticOperator: same proof as `aLine` above — `before` is
        // always 0 in a retained record, so the slice's start is unaffected.
        text: A.slice(i - before, i + after).join(' '),
      });
    }
  }
  // Stryker disable next-line ArithmeticOperator: EQUIVALENT mutant PROVEN (sabotage script, 0
  // divergence over 300+ probes) — `x.bLine + y.bLine` is SYMMETRIC in (x, y), so it can never
  // signal a swap in either comparator call direction, and `found` is already non-decreasing in
  // `bLine` by construction (entries are discovered while scanning B left to right). The
  // LogicalOperator and the `aLine` ArithmeticOperator stay active and are killed by a dedicated
  // tie-break test.
  found.sort((x, y) => (y.tokens - x.tokens) || (x.aLine - y.aLine) || (x.bLine - y.bLine));
  return found;
}

/** The canonical key of a pair — one spelling, so a budget entry and a finding cannot drift. */
function pairKey(model, judged) {
  return model + ' <-> ' + judged;
}

/**
 * THE DERIVATION — which module is a MODEL, and what does it judge.
 *
 * 🛑 A HAND-WRITTEN LIST WOULD ONLY KNOW THE PAST. A model added tomorrow must land in this table
 *    BY ITSELF. The four facts below are all measurable, and together they say exactly what a
 *    model is in this repository:
 *      ① it is PURE — an I/O shell is never a model;
 *      ② it is deliberately OUTSIDE Stryker's `mutate` — mutating a model measures its
 *         differential's domain coverage, never the model's quality, and the repository already
 *         says so in writing next to both exclusions;
 *      ③ NO production module imports it — it exists only to be confronted. This is the condition
 *         that separates a MODEL from a shared core (`pretool-core`) or a data table
 *         (`harness-profile`), both of which are pure and unmutated too. Measured: without it the
 *         derivation returned 19 pairs, 12 of them meaningless;
 *      ④ a suite confronts it with modules that ARE mutated — the JUDGED set is exactly those.
 *
 * @param {object} facts
 * @param {string[]} facts.pure src modules measured pure
 * @param {string[]} facts.mutated the `mutate` list of stryker.conf.json
 * @param {string[]} facts.importedByProduction every src/tools module reachable from production code
 * @param {{file: string, imports: string[]}[]} facts.testImports what each suite imports from src/
 * @returns {{model: string, judged: string, via: string}[]} sorted, deduplicated
 */
function derivePairs(facts) {
  const mutated = new Set(facts.mutated);
  const prod = new Set(facts.importedByProduction);
  const models = new Set();
  for (const f of facts.pure) {
    if (mutated.has(f)) continue;
    if (prod.has(f)) continue;
    models.add(f);
  }
  const out = new Map();
  for (const suite of facts.testImports) {
    const asModel = suite.imports.filter((f) => models.has(f));
    // ⚠️ NO early-return guard on an empty `asModel` here — PROVEN redundant: the double loop
    //    below is a no-op on an empty array either way, so a guard would be dead code kept alive
    //    only to freeze an equivalent mutant (`=== 0` -> `false`) forever.
    const asJudged = suite.imports.filter((f) => mutated.has(f));
    for (const model of asModel) {
      for (const judged of asJudged) {
        const k = pairKey(model, judged);
        if (!out.has(k)) out.set(k, { model, judged, via: suite.file });
      }
    }
  }
  const pairs = [...out.values()];
  pairs.sort((x, y) => pairKey(x.model, x.judged).localeCompare(pairKey(y.model, y.judged)));
  return pairs;
}

/**
 * THE FLOOR — anti-vacuity, and it belongs to the verdict because a caller could forget it.
 * @param {{model: string, judged: string}[]} pairs
 * @returns {string[]} faults, EMPTY when the derivation really measured something
 */
function floorFaults(pairs) {
  const faults = [];
  const models = new Set(pairs.map((p) => p.model));
  // ⚠️ TWO INDEPENDENT `if`s, never nested: nested, `<` → `<=` would be an EQUIVALENT mutant and
  //    an eternal survivor.
  if (models.size < MIN_MODELS) {
    faults.push('VACUOUS DERIVATION: ' + models.size + ' model(s) derived, floor is ' + MIN_MODELS
      + ' — a derivation that finds nothing is indistinguishable from a repository with no models');
  }
  if (pairs.length < MIN_PAIRS) {
    faults.push('VACUOUS DERIVATION: ' + pairs.length + ' pair(s) derived, floor is ' + MIN_PAIRS
      + ' — the gate would certify instead of protecting');
  }
  return faults;
}

/**
 * THE VERDICT — pure, total, deterministic.
 *
 * @param {{pair: string, tokens: number, text: string, aLine: number, bLine: number}[]} findings
 *        every shared run really measured, across every derived pair
 * @param {Record<string, {shared: {text: string, class: string, why?: string}[]}>} declared
 *        the budget's `pairs`, keyed by `pairKey`
 * @returns {string[]} faults, sorted; EMPTY when the budget tells the truth
 *
 * ⚠️ Returns the LIST, never a boolean: a gate must say WHAT to fix.
 * ⚠️ SORTED: the message must not depend on the order the scanner walked the disk, or the same
 *    defect reads differently from one run to the next and people stop trusting the output.
 * ⚠️ IT IS AN EQUALITY, IN BOTH DIRECTIONS. An observed run that is not declared is a NEW twin; a
 *    declared run that is no longer observed is a DORMANT PERMIT — an exemption that stopped being
 *    necessary must REDDEN rather than rot, otherwise permits accumulate and the gate hollows out
 *    on its own, silently.
 */
function verdict(findings, declared) {
  const faults = [];
  const budget = declared || {};
  // ⚠️ A `Set` of permits BEFORE the loop, never a `find` INSIDE it: a lookup nested in a traversal
  //    is the O(N²) the neighbouring quadratic rule exists to refuse, and a judge must not be its
  //    own first defendant. It also answers "and at 10,000 twins?" by construction.
  const permitted = new Set();
  for (const pair of Object.keys(budget)) {
    const entry = budget[pair];
    const permits = (entry && entry.shared) || [];
    for (const p of permits) permitted.add(pair + ' :: ' + p.text);
  }
  const observed = new Set();
  for (const f of findings) {
    const key = f.pair + ' :: ' + f.text;
    observed.add(key);
    if (permitted.has(key)) continue;
    faults.push('UNDECLARED SHARED CODE — ' + f.pair + ' (' + f.tokens + ' tokens, model line '
      + f.aLine + ', judged line ' + f.bLine + '): ' + f.text);
  }
  for (const pair of Object.keys(budget)) {
    const entry = budget[pair];
    const permits = (entry && entry.shared) || [];
    for (const p of permits) {
      if (!observed.has(pair + ' :: ' + p.text)) {
        faults.push('DORMANT PERMIT — ' + pair + ' no longer shares this run, remove the declaration: ' + p.text);
        continue;
      }
      if (!CLASS_SET.has(p.class)) {
        faults.push('UNKNOWN CLASS "' + p.class + '" — ' + pair + ': ' + p.text);
        continue;
      }
      if (p.class === EXEMPT_FROM_JUSTIFICATION) continue;
      // Stryker disable next-line StringLiteral: EQUIVALENT mutant PROVEN — the fallback value is
      // used only through `why.length < MIN_WHY` below, never printed. Any fixed replacement text
      // shorter than MIN_WHY (Stryker's own mutant included) triggers the exact same fault.
      const why = typeof p.why === 'string' ? p.why : '';
      if (why.length < MIN_WHY) {
        faults.push('CLASS ' + p.class + ' OWES A `why` OF AT LEAST ' + MIN_WHY + ' CHARACTERS — '
          + pair + ': ' + p.text);
      }
    }
  }
  faults.sort();
  return faults;
}

module.exports = {
  CLASSES,
  MIN_WHY,
  MIN_MODELS,
  MIN_PAIRS,
  isPure,
  stripComments,
  tokenize,
  sharedRuns,
  pairKey,
  derivePairs,
  floorFaults,
  verdict,
};
