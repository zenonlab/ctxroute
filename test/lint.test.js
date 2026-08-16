// ═══════════════════════════════════════════════════════════════════════
// lint.test.js — DETERMINISTIC tests of the pure core (Stryker target)
// ═══════════════════════════════════════════════════════════════════════
// ⚠️ DIRECT calls, zero spawn. Each case replays a REAL measurement of
//    15/07/2026 — never an invented hypothesis.
// ⚠️ CONTRACT values written HARD-CODED: NEVER derive them from LEVELS nor from
//    a module constant, otherwise the test mutates WITH the code and the mutant
//    becomes invisible (a mistake already made on `for (const m of MODES)`).
// ═══════════════════════════════════════════════════════════════════════

// ⚠️ STACK = vitest · SCOPE = ctxroute ONLY.
//    node:test debt SETTLED on 16/07/2026 (all-or-nothing port of the 21
//    suites, mutation 12 min → ~30 s). Falling back to the degraded mode is made
//    impossible by the anti-commandRunner gate of mutation-workflow-gate.test.js.

'use strict';

import { test } from 'vitest';
import assert from 'node:assert';
import { analyze, applyFilter, shouldScream, list, LEVELS, DEFAULT_LEVEL } from '../src/lint.js';

// ── list(): the totality guard, tested DIRECTLY ──────────────────────
// ⚠️ It is exported FOR that. Inline (`Array.isArray(x) ? x : []`), the `[]`
//    fallback is an EQUIVALENT mutant (Stryker replaces it with
//    `["Stryker was here"]`, invisible). Extracted, it becomes observable.
//    CI 15/07/2026: 5 surviving mutants killed by this single test.
test('list: single source of the "array or nothing" guard', () => {
  const t = ['a'];
  assert.strictEqual(list(t), t); // array -> ITSELF, not a copy
  assert.deepStrictEqual(list([]), []);
  for (const x of [null, undefined, 'x', 42, {}, { length: 2 }]) {
    assert.deepStrictEqual(list(x), [], `list(${JSON.stringify(x)})`);
  }
});

const doc = (filePath, declaration) => ({ filePath, declaration });
const codes = (c) => c.map((x) => x.code);

// ── Contract ─────────────────────────────────────────────────────────
test('contract: levels and default', () => {
  assert.deepStrictEqual(LEVELS, ['error', 'warn', 'info']);
  assert.strictEqual(DEFAULT_LEVEL, 'warn');
});

// ── Totality: a lint that throws = a broken SessionStart ──────────────
test('totality: NEVER throws, whatever the state', () => {
  for (const e of [undefined, null, {}, { docs: null }, { docs: 'x' }, { docs: [null, 42, {}] },
    { docsFantomes: 'x' }, { mcpServers: 3 }, { serveursDocumentes: null }]) {
    assert.doesNotThrow(() => analyze(e));
    assert.ok(Array.isArray(analyze(e)));
  }
});

// ── ERROR: doc dead in silence (THE bug the refactor kills) ───────────
test('doc without a trigger = ERROR (14 measured out of 306 on 15/07)', () => {
  const c = analyze({ docs: [doc('docs/orpheline.md', {})] });
  assert.strictEqual(c.length, 1);
  assert.strictEqual(c[0].niveau, 'error');
  assert.strictEqual(c[0].code, 'invalid-declaration');
  assert.strictEqual(c[0].target, 'docs/orpheline.md');
});

test('doc with `inject: never` = SILENT AND VALID (declared silence)', () => {
  assert.deepStrictEqual(analyze({ docs: [doc('docs/pw-mcp-proxy-reference.md', { inject: 'never' })] }), []);
});

test('doc with a FILE corpus trigger = valid (match / rules / tool)', () => {
  // ⚠️ REWRITTEN on 31/07/2026 (§A): the `mcp:` cases certified a MUTE doc as
  //    "valid" — the false green carved into the suite. The lint DELEGATES to
  //    validate() (sole authority): it goes red with it, by construction.
  assert.deepStrictEqual(analyze({ docs: [doc('a.md', { match: 'lock.js' })] }), []);
  assert.deepStrictEqual(analyze({ docs: [doc('b.md', { tool: ['WebFetch'] })] }), []);
  assert.deepStrictEqual(analyze({ docs: [doc('c.md', { match: 'ssh.js', tool: ['WebSearch'] })] }), []);
});

test('§A: the lint SCREAMS at a file doc carrying `mcp:` (delegation to validate)', () => {
  const c = analyze({ docs: [doc('b.md', { mcp: ['stripe'] })] });
  assert.equal(c.length, 1);
  assert.equal(c[0].niveau, 'error');
  assert.ok(/PATH/.test(c[0].message), 'the lint must relay the message that repairs');
});

test('misspelled key (`mach:`) = ERROR, never silently ignored', () => {
  const c = analyze({ docs: [doc('a.md', { mach: 'lock.js' })] });
  assert.ok(c.length >= 1);
  assert.ok(c.every((x) => x.niveau === 'error'));
});

// ⚠️ The lint DELEGATES to validate() — it never re-judges. This test seals the
//    delegation: if someone reimplements a judgement here, it will diverge.
test('delegation: `inject: never` + a trigger = contradiction reported', () => {
  const c = analyze({ docs: [doc('a.md', { inject: 'never', match: 'x.js' })] });
  assert.ok(c.some((x) => x.niveau === 'error'));
});

test('doc without a usable path = ignored, never a crash', () => {
  assert.deepStrictEqual(analyze({ docs: [{ declaration: {} }, null, { filePath: 42 }] }), []);
  // ⚠️ SAME GUARD, ON THE `hardcoded-source-tag` CHECK (surviving mutant killed on
  //    08/08/2026). Each loop carries ITS OWN totality guard: a non-string
  //    `filePath` with the flag raised must neither crash nor produce a finding
  //    whose TARGET would be unusable.
  assert.deepStrictEqual(
    analyze({ docs: [null, { filePath: 42, tagSourceEnDur: true }, { tagSourceEnDur: true }] }), []);
});

// ── ERROR: phantom rule (exact mirror) ───────────────────────────────
test('phantom rule = ERROR (0 measured on 15/07 — this check maintains the 0)', () => {
  const c = analyze({ docsFantomes: ['docs/disparue.md'] });
  assert.deepStrictEqual(codes(c), ['ghost-rule']);
  assert.strictEqual(c[0].niveau, 'error');
});

// ── ERROR: [source: …] tag hard-pasted (㉘ bis, 08/08/2026) ───────────
// ⚠️ The REAL defect: 4 fleet docs carried the tag the engine adds itself. An
//    agent READING one of those docs dropped a valid-looking label into the
//    transcript ⇒ the CANARY counted it as an injection that ARRIVED and stayed
//    GREEN even with a dead channel. It is the exact gesture of someone
//    INVESTIGATING a dead injection that made the witness lie.
test('hard-pasted [source:] tag = ERROR (the canary would count it as an injection that arrived)', () => {
  const c = analyze({ docs: [{ filePath: 'docs/a.md', declaration: { match: 'x.js' }, tagSourceEnDur: true }] });
  assert.deepStrictEqual(codes(c), ['hardcoded-source-tag']);
  assert.strictEqual(c[0].niveau, 'error');
  assert.strictEqual(c[0].target, 'docs/a.md');
});

test('doc WITHOUT a hard-pasted tag = silence (the case of 389 docs out of 393)', () => {
  const c = analyze({ docs: [{ filePath: 'docs/a.md', declaration: { match: 'x.js' } }] });
  assert.deepStrictEqual(codes(c), []);
});

// ⚠️ ERROR and not warn: unlike `mcp-without-doc` ("not done yet"), the tag is
//    NEVER written by hand — no legitimate case, hence no exemption. This test
//    seals the SEVERITY, not just the detection: downgrading it to warn would
//    drown it in the noise.
test('severity: the hard-pasted tag comes BEFORE any warn in the output', () => {
  const c = analyze({
    docs: [{ filePath: 'docs/a.md', declaration: { match: 'x.js' }, tagSourceEnDur: true }],
    mcpServers: ['ssh'],
  });
  assert.deepStrictEqual(codes(c), ['hardcoded-source-tag', 'mcp-without-doc']);
});

// ── WARN: MCP coverage (measured 2/16) ───────────────────────────────
test('MCP server without a doc = WARN (arbitrated: not forgotten, not done yet)', () => {
  const c = analyze({ mcpServers: ['ssh', 'infra', 'stripe'], serveursDocumentes: ['stripe'] });
  assert.deepStrictEqual(codes(c), ['mcp-without-doc', 'mcp-without-doc']);
  assert.deepStrictEqual(c.map((x) => x.target), ['ssh', 'infra']);
  assert.ok(c.every((x) => x.niveau === 'warn'));
});

test('server deliberately declared without a doc = silent (filterList)', () => {
  assert.deepStrictEqual(analyze({ mcpServers: ['umami'], serveursDeclares: ['umami'] }), []);
});

test('server documented AND declared = silent, never a duplicate', () => {
  assert.deepStrictEqual(analyze({ mcpServers: ['stripe'], serveursDocumentes: ['stripe'], serveursDeclares: ['stripe'] }), []);
});

// ── Severity order — guaranteed by CONSTRUCTION, not by a sort ────────
// ⚠️ A `.sort()` used to live here: UNREACHABLE (the list already came out
//    sorted), hence dead code + equivalent mutant, and this test passed BY
//    ACCIDENT — it proved nothing. Removed on 15/07/2026. This test keeps its
//    meaning: it will see a future `warn` check pushed before an `error` one.
test('output sorted by severity (errors before warns) — by order of the checks', () => {
  const c = analyze({
    mcpServers: ['ssh'],
    docs: [doc('mort.md', {})],
    docsFantomes: ['ghost.md'],
  });
  assert.deepStrictEqual(c.map((x) => x.niveau), ['error', 'error', 'warn']);
  // ⚠️ Expectation HARD-CODED: never derive it from LEVELS (it would mutate with the code).
  const rang = { error: 0, warn: 1, info: 2 };
  for (let i = 1; i < c.length; i++) {
    assert.ok(rang[c[i - 1].niveau] <= rang[c[i].niveau], 'an error must NEVER come after a warn');
  }
});

// ── applyFilter ──────────────────────────────────────────────────────────
const ECHANTILLON = [
  { niveau: 'error', code: 'e' },
  { niveau: 'warn', code: 'w' },
  { niveau: 'info', code: 'i' },
];

test('applyFilter: error shows ONLY the errors', () => {
  assert.deepStrictEqual(codes(applyFilter(ECHANTILLON, 'error')), ['e']);
});
test('applyFilter: warn shows errors + warns (the default)', () => {
  assert.deepStrictEqual(codes(applyFilter(ECHANTILLON, 'warn')), ['e', 'w']);
});
test('applyFilter: info shows everything', () => {
  assert.deepStrictEqual(codes(applyFilter(ECHANTILLON, 'info')), ['e', 'w', 'i']);
});
test('applyFilter: off switches EVERYTHING off, errors included (a declared choice)', () => {
  assert.deepStrictEqual(applyFilter(ECHANTILLON, 'off'), []);
});
// ⚠️ An unknown level MUST NOT switch off the diagnosis: a typo in the config
//    would silently make the lint mute — the very bug it fights.
test('applyFilter: unknown level ⇒ default (warn), NEVER off', () => {
  for (const n of ['ERROR', 'verbose', '', null, undefined, 42]) {
    assert.deepStrictEqual(codes(applyFilter(ECHANTILLON, n)), ['e', 'w'], `niveau: ${n}`);
  }
});
test('applyFilter: non-array input ⇒ [], never a throw', () => {
  assert.deepStrictEqual(applyFilter(null, 'warn'), []);
  assert.deepStrictEqual(applyFilter('x', 'warn'), []);
});

// ── shouldScream ───────────────────────────────────────────────────────
test('shouldScream: ONLY errors scream (a blocking warn = a banned gate)', () => {
  assert.strictEqual(shouldScream([{ niveau: 'error' }]), true);
  assert.strictEqual(shouldScream([{ niveau: 'warn' }, { niveau: 'info' }]), false);
  assert.strictEqual(shouldScream([]), false);
  assert.strictEqual(shouldScream([{ niveau: 'warn' }, { niveau: 'error' }]), true);
});
test('shouldScream: totality', () => {
  assert.strictEqual(shouldScream(null), false);
  assert.strictEqual(shouldScream([null, undefined]), false);
});
