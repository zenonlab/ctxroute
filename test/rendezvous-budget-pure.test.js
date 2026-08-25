// ═══════════════════════════════════════════════════════════════════════
// `src/rendezvous-budget-pure.js` — DETERMINISTIC suite (Stryker target).
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ SEPARATE FROM `rendezvous-address-gate.test.js` ON PURPOSE: the gate proves
//    the WIRING (real `git ls-files` perimeters, real ast-grep scan, real
//    manifest), this suite proves the DECISION. Mixing them would make the proof
//    of the reasoning depend on the state of the repository on the day it runs —
//    and a contract that changes verdict at every commit is no longer a contract.
//
// ⚠️ THE MODULE IS IMPORTED DIRECTLY, never through a re-export: `perTest`
//    coverage loses the mapping across a re-export and reports PHANTOM
//    survivors (measured on this fleet).
//
// ⚠️ FIXTURES ARE THUNKS, evaluated INSIDE each `test()`. A `const` built at
//    module load belongs to NO test, so its mutants are "static" and survive
//    with no test able to kill them (42 false survivors measured on this fleet).
//
// ⚠️ EXPECTED MESSAGES ARE WRITTEN OUT IN FULL, never derived from the module:
//    an assertion that READS the module under test proves `x === x` and is
//    mutated along with it — 43 survivors in one go, measured here on
//    2026-08-21. The message IS the contract: it is what a person reads at
//    3 a.m. when a push goes red, and it is what tells them WHICH address of
//    WHICH file diverged from WHICH other place.
//
// ⚠️ BOUNDS ARE PROVEN **ON** THE BOUND, never near it: a `<` turned into a
//    `<=` is only distinguishable by the exact value, so every length case
//    below sits at MIN_WHY and at MIN_WHY − 1, never at 5 and 500.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import { verdict, MIN_WHY, COLLISION_ORIGIN } from '../src/rendezvous-budget-pure.js';

/** The CLOSED origin list, as the manifest really spells it (thunk, never a module const). */
const origins = () => ['resolved', 'kernel', 'protocol', 'supervisor', 'environment', 'not-an-address'];

/** The named meeting points, each with the ONE value every site of it must write. */
const rendezvous = () => ({
  'daemon-http-port': { value: '8787', why: 'the port the daemon binds and the harness POSTs to' },
  'daemon-http-host': { value: '127.0.0.1', why: 'the loopback interface the listener binds' },
});

/** A justification of EXACTLY `n` characters — the bound is proven on the bound. */
const why = (n) => 'w'.repeat(n);

/** A site declaration, coherent unless a field is overridden. */
const site = (over) => Object.assign({
  count: 1,
  rendezvous: 'daemon-http-port',
  value: '8787',
  origin: 'resolved',
  why: why(MIN_WHY),
}, over || {});

/** `n` identical occurrences of one (file, text) pair. */
const occ = (file, text, n) => {
  const out = [];
  for (let i = 0; i < n; i += 1) out.push({ file, text });
  return out;
};

// ═══════════════════════════════════════════════════════════════════════
// THE EXPORTED CONSTANTS — written out, never derived.
// ═══════════════════════════════════════════════════════════════════════

test('the bound and the collision word are exactly the expected values', () => {
  // ⚠️ Deriving these from the module would demonstrate x === x. `40` is the
  //    length below which nobody learns WHY an address may be written at a site;
  //    `not-an-address` is the ONE origin that names no rendezvous.
  assert.strictEqual(MIN_WHY, 40);
  assert.strictEqual(COLLISION_ORIGIN, 'not-an-address');
});

// ═══════════════════════════════════════════════════════════════════════
// ① FAIL-CLOSED — an occurrence nobody declared.
// ═══════════════════════════════════════════════════════════════════════

test('nothing measured against nothing declared is SILENT', () => {
  assert.deepStrictEqual(verdict([], {}, rendezvous(), origins()), []);
});

test('a declaration that TELLS THE TRUTH is silent', () => {
  const sites = { 'src/a.js': { "HOST = '127.0.0.1'": site({ rendezvous: 'daemon-http-host', value: '127.0.0.1' }) } };
  assert.deepStrictEqual(
    verdict(occ('src/a.js', "HOST = '127.0.0.1'", 1), sites, rendezvous(), origins()), []);
});

test('an address in a file NOBODY declared is RED', () => {
  assert.deepStrictEqual(
    verdict(occ('src/hooks/new-shell.js', "const METRICS_HOST = '127.0.0.1'", 1), {}, rendezvous(), origins()),
    ['src/hooks/new-shell.js: UNDECLARED RENDEZVOUS LITERAL `const METRICS_HOST = \'127.0.0.1\'`'
      + ' — every address by which one component reaches another must be declared in'
      + ' `rendezvous-budget.json` with its rendezvous, its value and its origin.']);
});

test('a NEW address in an ALREADY declared file is RED too', () => {
  // 🔑 The real shape of the 2026-08-25 defects: the file was known, the LINE was new.
  const sites = { 'src/a.js': { "HOST = '127.0.0.1'": site({ rendezvous: 'daemon-http-host', value: '127.0.0.1' }) } };
  const measured = occ('src/a.js', "HOST = '127.0.0.1'", 1).concat(occ('src/a.js', 'PORT = 9001', 1));
  assert.deepStrictEqual(verdict(measured, sites, rendezvous(), origins()),
    ['src/a.js: UNDECLARED RENDEZVOUS LITERAL `PORT = 9001`'
      + ' — every address by which one component reaches another must be declared in'
      + ' `rendezvous-budget.json` with its rendezvous, its value and its origin.']);
});

test('the count is an EQUALITY: measured ABOVE the declaration is RED', () => {
  const sites = { 'src/a.js': { "'/purge'": site({ count: 1 }) } };
  assert.deepStrictEqual(verdict(occ('src/a.js', "'/purge'", 3), sites, rendezvous(), origins()),
    ["src/a.js: COUNT DRIFT on `'/purge'` — 3 measured, 1 declared."]);
});

test('the count is an EQUALITY: measured BELOW the declaration is RED', () => {
  // A declaration wider than reality is a permit granted for free, in silence.
  const sites = { 'src/a.js': { "'/purge'": site({ count: 4 }) } };
  assert.deepStrictEqual(verdict(occ('src/a.js', "'/purge'", 2), sites, rendezvous(), origins()),
    ["src/a.js: COUNT DRIFT on `'/purge'` — 2 measured, 4 declared."]);
});

test('several occurrences of ONE site are really ACCUMULATED', () => {
  // ⚠️ Without accumulation the second occurrence would silently overwrite the
  //    first and every multi-site declaration would read as a drift.
  const sites = { 'src/a.js': { "'/purge'": site({ count: 3 }) } };
  assert.deepStrictEqual(verdict(occ('src/a.js', "'/purge'", 3), sites, rendezvous(), origins()), []);
});

test('two DIFFERENT sites of one file are counted apart, never merged', () => {
  const sites = {
    'src/a.js': {
      "'/purge'": site({ count: 1 }),
      "'/turn'": site({ count: 2 }),
    },
  };
  const measured = occ('src/a.js', "'/purge'", 1).concat(occ('src/a.js', "'/turn'", 2));
  assert.deepStrictEqual(verdict(measured, sites, rendezvous(), origins()), []);
});

// ═══════════════════════════════════════════════════════════════════════
// ② THE OTHER DIRECTION — a dormant permit.
// ═══════════════════════════════════════════════════════════════════════

test('a declaration matching NOTHING AT ALL is RED (dormant permit)', () => {
  const sites = { 'src/gone.js': { "'/purge'": site() } };
  assert.deepStrictEqual(verdict([], sites, rendezvous(), origins()),
    ["src/gone.js: DORMANT DECLARATION `'/purge'` — declared, measured NOWHERE."
      + ' An address that MOVED is red on both ends, and that is the point: the class is'
      + ' one truth quietly acquiring a second home.']);
});

test('a declaration dormant in a file that IS still measured elsewhere is RED', () => {
  // ⚠️ The file is alive, only the LINE moved: the permit stays behind and the
  //    next line of that shape inherits it, reason included.
  const sites = {
    'src/a.js': {
      "'/purge'": site({ count: 1 }),
      "'/moved'": site(),
    },
  };
  assert.deepStrictEqual(verdict(occ('src/a.js', "'/purge'", 1), sites, rendezvous(), origins()),
    ["src/a.js: DORMANT DECLARATION `'/moved'` — declared, measured NOWHERE."
      + ' An address that MOVED is red on both ends, and that is the point: the class is'
      + ' one truth quietly acquiring a second home.']);
});

// ═══════════════════════════════════════════════════════════════════════
// ③ THE DECLARATION ITSELF MUST MEAN SOMETHING.
// ═══════════════════════════════════════════════════════════════════════

test('an origin OUTSIDE the closed list is RED, and the message NAMES the list', () => {
  const sites = { 'src/a.js': { "'/purge'": site({ origin: 'because' }) } };
  assert.deepStrictEqual(verdict(occ('src/a.js', "'/purge'", 1), sites, rendezvous(), origins()),
    ["src/a.js: `'/purge'` declares origin `because`, which is not one of "
      + 'resolved / kernel / protocol / supervisor / environment / not-an-address.']);
});

test('a NON-STRING `why` is RED', () => {
  const sites = { 'src/a.js': { "'/purge'": site({ why: null }) } };
  assert.deepStrictEqual(verdict(occ('src/a.js', "'/purge'", 1), sites, rendezvous(), origins()),
    ["src/a.js: `'/purge'` carries no usable `why`."]);
});

test('a `why` of EXACTLY the bound passes; one character less is RED', () => {
  const ok = { 'src/a.js': { "'/purge'": site({ why: why(MIN_WHY) }) } };
  assert.deepStrictEqual(verdict(occ('src/a.js', "'/purge'", 1), ok, rendezvous(), origins()), []);

  const short = { 'src/a.js': { "'/purge'": site({ why: why(MIN_WHY - 1) }) } };
  assert.deepStrictEqual(verdict(occ('src/a.js', "'/purge'", 1), short, rendezvous(), origins()),
    ["src/a.js: `'/purge'` carries no usable `why`."]);
});

test('a `why` PADDED with whitespace on BOTH ends is measured on its CONTENT', () => {
  // ⚠️ Padding on both ends, and long enough that removing EITHER trim would
  //    take the length back over the bound: that is the only shape that tells
  //    `trim` apart from `trimStart`, from `trimEnd`, and from no trim at all.
  const padded = ' '.repeat(10) + why(MIN_WHY - 10) + ' '.repeat(10);
  const sites = { 'src/a.js': { "'/purge'": site({ why: padded }) } };
  assert.deepStrictEqual(verdict(occ('src/a.js', "'/purge'", 1), sites, rendezvous(), origins()),
    ["src/a.js: `'/purge'` carries no usable `why`."]);
});

test('a shape collision declared `not-an-address` and naming NOTHING is silent', () => {
  const sites = { 'tools/x.js': { "'/rule'": site({ origin: 'not-an-address', rendezvous: null, value: null }) } };
  assert.deepStrictEqual(verdict(occ('tools/x.js', "'/rule'", 1), sites, rendezvous(), origins()), []);
});

test('a `not-an-address` that NAMES a rendezvous is RED', () => {
  const sites = { 'tools/x.js': { "'/rule'": site({ origin: 'not-an-address', rendezvous: 'daemon-http-port', value: null }) } };
  assert.deepStrictEqual(verdict(occ('tools/x.js', "'/rule'", 1), sites, rendezvous(), origins()),
    ["tools/x.js: `'/rule'` is declared `not-an-address` yet names a rendezvous."]);
});

test('a real address naming an UNKNOWN rendezvous is RED', () => {
  const sites = { 'src/a.js': { "'/purge'": site({ rendezvous: 'daemon-http-ghost' }) } };
  assert.deepStrictEqual(verdict(occ('src/a.js', "'/purge'", 1), sites, rendezvous(), origins()),
    ["src/a.js: `'/purge'` names the unknown rendezvous `daemon-http-ghost`."]);
});

test('a real address naming NO rendezvous at all is RED, and the message says so', () => {
  const sites = { 'src/a.js': { "'/purge'": site({ rendezvous: null }) } };
  assert.deepStrictEqual(verdict(occ('src/a.js', "'/purge'", 1), sites, rendezvous(), origins()),
    ["src/a.js: `'/purge'` names the unknown rendezvous `null`."]);
});

// ═══════════════════════════════════════════════════════════════════════
// ④ AGREEMENT — the check an INSTANCE judge cannot do.
// ═══════════════════════════════════════════════════════════════════════

test('two sites of ONE rendezvous holding the SAME value are silent', () => {
  // 🔑 Two places is not the defect — under socket activation the OS INSISTS on
  //    holding its own copy. Two DIFFERENT values is the defect.
  const sites = {
    'src/declared-paths-pure.js': { 'DEFAULT_HTTP_PORT = 8787': site({ origin: 'resolved' }) },
    'service/ctxroute-http.socket': { 'ListenStream=127.0.0.1:8787': site({ origin: 'supervisor' }) },
  };
  const measured = occ('src/declared-paths-pure.js', 'DEFAULT_HTTP_PORT = 8787', 1)
    .concat(occ('service/ctxroute-http.socket', 'ListenStream=127.0.0.1:8787', 1));
  assert.deepStrictEqual(verdict(measured, sites, rendezvous(), origins()), []);
});

test('two sites of ONE rendezvous holding DIFFERENT values are RED', () => {
  const sites = {
    'service/ctxroute-http.socket': { 'ListenStream=127.0.0.1:9001': site({ origin: 'supervisor', value: '9001' }) },
  };
  assert.deepStrictEqual(
    verdict(occ('service/ctxroute-http.socket', 'ListenStream=127.0.0.1:9001', 1), sites, rendezvous(), origins()),
    ['SPLIT ADDRESS on `daemon-http-port`: service/ctxroute-http.socket writes `9001`'
      + ' while the rendezvous declares `8787`.'
      + ' Two places, one truth — and on this lane a divergence is TOTALLY SILENT.']);
});

test('the agreement check STEPS OVER a shape collision, it never compares its null', () => {
  // ⚠️ Without the skip, a `not-an-address` would be dragged into the comparison
  //    and accused of writing `null` against a real value: a SECOND fault for one
  //    defect, which is exactly how a red stops being actionable.
  const sites = { 'tools/x.js': { "'/rule'": site({ origin: 'not-an-address', rendezvous: 'daemon-http-port', value: null }) } };
  assert.deepStrictEqual(verdict(occ('tools/x.js', "'/rule'", 1), sites, rendezvous(), origins()),
    ["tools/x.js: `'/rule'` is declared `not-an-address` yet names a rendezvous."]);
});

test('an UNKNOWN rendezvous is accused ONCE, never a second time by the agreement check', () => {
  const sites = { 'src/a.js': { "'/purge'": site({ rendezvous: 'daemon-http-ghost', value: '9001' }) } };
  assert.deepStrictEqual(verdict(occ('src/a.js', "'/purge'", 1), sites, rendezvous(), origins()),
    ["src/a.js: `'/purge'` names the unknown rendezvous `daemon-http-ghost`."]);
});

// ═══════════════════════════════════════════════════════════════════════
// SHAPE OF THE VERDICT
// ═══════════════════════════════════════════════════════════════════════

test('the faults come back SORTED, never in the order the disk was walked', () => {
  // ⚠️ The same defect must read the same way from one run to the next, or
  //    people stop trusting the output. Here the scan order is z-then-a and the
  //    verdict must be a-then-z, with the SPLIT (capital S) ahead of both.
  const sites = {
    'src/a.js': { "'/moved'": site() },
    'src/m.js': { "'/purge'": site({ value: '9001' }) },
  };
  const measured = occ('src/z.js', 'PORT = 1', 1).concat(occ('src/m.js', "'/purge'", 1));
  assert.deepStrictEqual(verdict(measured, sites, rendezvous(), origins()), [
    'SPLIT ADDRESS on `daemon-http-port`: src/m.js writes `9001` while the rendezvous declares `8787`.'
      + ' Two places, one truth — and on this lane a divergence is TOTALLY SILENT.',
    "src/a.js: DORMANT DECLARATION `'/moved'` — declared, measured NOWHERE."
      + ' An address that MOVED is red on both ends, and that is the point: the class is'
      + ' one truth quietly acquiring a second home.',
    'src/z.js: UNDECLARED RENDEZVOUS LITERAL `PORT = 1`'
      + ' — every address by which one component reaches another must be declared in'
      + ' `rendezvous-budget.json` with its rendezvous, its value and its origin.',
  ]);
});

test('a file or a site NAMED LIKE AN `Object.prototype` MEMBER is judged, never inherited', () => {
  // 🛑 `JSON.parse` returns a plain object, so `sites['constructor']` yields
  //    `Object.prototype.constructor`: TRUTHY. Read through a plain object, an
  //    UNDECLARED site would read as DECLARED, its `count` would be `undefined`,
  //    and the gate would go SILENT on it. A guard that fails OPEN is worse than
  //    no guard at all.
  const measured = occ('constructor', 'toString', 1);
  assert.deepStrictEqual(verdict(measured, {}, rendezvous(), origins()),
    ['constructor: UNDECLARED RENDEZVOUS LITERAL `toString`'
      + ' — every address by which one component reaches another must be declared in'
      + ' `rendezvous-budget.json` with its rendezvous, its value and its origin.']);

  // ...and the CONTROL: declared under those very names, it is judged normally.
  const sites = { constructor: { toString: site() } };
  assert.deepStrictEqual(verdict(measured, sites, rendezvous(), origins()), []);
});

test('a rendezvous NAMED LIKE an `Object.prototype` member is not inherited either', () => {
  // The rendezvous table is read with `hasOwnProperty.call`, so `toString` names
  // an UNKNOWN rendezvous rather than a function inherited from the prototype.
  const sites = { 'src/a.js': { "'/purge'": site({ rendezvous: 'toString' }) } };
  assert.deepStrictEqual(verdict(occ('src/a.js', "'/purge'", 1), sites, rendezvous(), origins()),
    ["src/a.js: `'/purge'` names the unknown rendezvous `toString`."]);
});

test('several INDEPENDENT defects on one declaration are all reported', () => {
  // ⚠️ One defect must never hide the next: a badly-formed origin does not
  //    excuse an absent `why`, and neither excuses a divergent value.
  const sites = { 'src/a.js': { "'/purge'": site({ origin: 'because', why: why(1), value: '9001' }) } };
  assert.deepStrictEqual(verdict(occ('src/a.js', "'/purge'", 1), sites, rendezvous(), origins()), [
    'SPLIT ADDRESS on `daemon-http-port`: src/a.js writes `9001` while the rendezvous declares `8787`.'
      + ' Two places, one truth — and on this lane a divergence is TOTALLY SILENT.',
    "src/a.js: `'/purge'` carries no usable `why`.",
    "src/a.js: `'/purge'` declares origin `because`, which is not one of "
      + 'resolved / kernel / protocol / supervisor / environment / not-an-address.',
  ]);
});
