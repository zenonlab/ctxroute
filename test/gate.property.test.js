// ═══════════════════════════════════════════════════════════════════════
// Property-based tests of gate.js (fast-check) — invariants on GENERATED inputs.
// ⚠️ NEVER run by Stryker (non-deterministic): every invariant found here
//    MUST have its deterministic case in gate.test.js (lib-pure.md doctrine).
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import fc from 'fast-check';
import { decide } from '../src/gate.js';

const docId = fc.constantFrom('docs/a.md', 'docs/b.md', 'docs/c.md', 'docs/d.md');
const mode = fc.constantFrom('dumb', 'once', 'smart', undefined);
const decl = fc.record({ mode });
const decls = fc.dictionary(docId, decl, { maxKeys: 4 });
const entry = fc.oneof(
  fc.constant(null),
  fc.record({ seen: fc.constant(true), sinceLastCall: fc.nat({ max: 10 }) })
);
const state = fc.dictionary(docId, entry, { maxKeys: 4 });
const matched = fc.uniqueArray(docId, { maxLength: 4 });
const toolName = fc.constantFrom('Read', 'Edit', 'Write', 'Bash', 'mcp__ssh__ssh_exec');
const config = fc.record({
  mode,
  defaultThreshold: fc.option(fc.integer({ min: 1, max: 10 }), { nil: undefined }),
});

test('TOTALITY: never a throw, decision ∈ {none, allow, deny}', () => {
  fc.assert(fc.property(config, decls, matched, toolName, state, (c, d, m, t, s) => {
    const r = decide(c, d, m, s);
    assert.ok(['none', 'allow', 'deny'].includes(r.decision));
  }));
});

test('SUBSEQUENCE: inject ⊆ matched, order preserved', () => {
  fc.assert(fc.property(config, decls, matched, toolName, state, (c, d, m, t, s) => {
    const r = decide(c, d, m, s);
    let i = 0;
    for (const doc of m) if (r.inject[i] === doc) i++;
    assert.strictEqual(i, r.inject.length, 'inject must be an ordered subsequence of matched');
  }));
});

test('PURITY: the state passed as an argument is NEVER mutated', () => {
  fc.assert(fc.property(config, decls, matched, toolName, state, (c, d, m, t, s) => {
    const before = JSON.stringify(s);
    decide(c, d, m, s);
    assert.strictEqual(JSON.stringify(s), before);
  }));
});

test('none ⟺ inject empty (never an ask/allow without a doc)', () => {
  fc.assert(fc.property(config, decls, matched, toolName, state, (c, d, m, t, s) => {
    const r = decide(c, d, m, s);
    assert.strictEqual(r.decision === 'none', r.inject.length === 0);
  }));
});

test('100% DUMB CORPUS: injects everything, changed=false, state passthrough', () => {
  const dumbDecls = fc.dictionary(docId, fc.record({ mode: fc.constant('dumb') }), { maxKeys: 4 });
  fc.assert(fc.property(dumbDecls, matched, toolName, (d, m, t) => {
    const r = decide({ mode: 'dumb' }, d, m, {});
    assert.deepStrictEqual(r.inject, m);
    assert.strictEqual(r.changed, false);
    assert.deepStrictEqual(r.state, {});
  }));
});

test('once/smart CONVERGENCE: replaying the same call immediately = silence', () => {
  const quietDecls = fc.dictionary(docId, fc.record({ mode: fc.constantFrom('once', 'smart') }), { maxKeys: 4 });
  fc.assert(fc.property(quietDecls, fc.uniqueArray(docId, { minLength: 1, maxLength: 4 }), (d, m) => {
    // full decls for every matched doc (non-dumb mode guaranteed).
    const full = { ...Object.fromEntries(m.map((x) => [x, { mode: 'once' }])), ...d };
    const r1 = decide({}, full, m, {});
    const r2 = decide({}, full, m, r1.state);
    assert.deepStrictEqual(r2.inject, [], 'the immediate replay must be silent');
    assert.strictEqual(r2.changed, false, 'the immediate replay must rewrite nothing');
  }));
});
