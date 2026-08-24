// ═══════════════════════════════════════════════════════════════════════
// scope-reach-pure.js — the DECISION, deterministic cases + scanner LAWS
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 THIS FILE EXISTS BECAUSE `/stack-audit` CAUGHT THE VIOLATION (2026-08-20): the
//    logic shipped INSIDE an I/O tool, so it was not mutated, and a SCANNER — code
//    that interprets a third party's FORMAT — had deterministic cases only. The
//    doctrine is explicit: a parser/scanner gets property-based testing AUTOMATICALLY.
// ⚠️ PROPERTIES ARE EXCLUDED FROM THE STRYKER RUNNER (slow, non-deterministic) ⇒
//    every guard proven by a law below ALSO has its deterministic case here,
//    otherwise its mutant survives and the score lies.
// 🔴 BOTH WRONG VERSIONS OF THE DERIVATION ARE REPLAYED AS CASES: the hand-written
//    list (right answer BY LUCK — worse than wrong) and the match on every `"name":`
//    (343 false collisions). A founding case is never deleted; if behaviour changes,
//    INVERT the expectation and keep the case.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { norm, patterns, toolNamesFrom, collides } from '../src/scope-reach-pure.js';

const entree = (itemName) => `{"type":"tool_use","id":"x","name":"${itemName}","input":{}}\n`;

// ── DETERMINISTIC: `patterns` ────────────────────────────────────────────
test('patterns — flat = OR, grouped = AND of ORs, both flattened to literals', () => {
  assert.deepStrictEqual(patterns(['a', 'b']), ['a', 'b']);
  assert.deepStrictEqual(patterns([['a', 'b'], ['c']]), ['a', 'b', 'c']);
  assert.deepStrictEqual(patterns(undefined), []);
  assert.deepStrictEqual(patterns('a'), []);
});

test('patterns — an EMPTY string never becomes a pattern', () => {
  // 🛑 `includes('')` is always true: one empty pattern would make EVERY tool name
  //    collide and the instrument would answer "everything is parasitic".
  assert.deepStrictEqual(patterns(['', 'a', null, 3]), ['a']);
  assert.deepStrictEqual(patterns([['', ''], ['b']]), ['b']);
});

// ── DETERMINISTIC: the anchor ────────────────────────────────────────────
test('ANCHOR — a tool call is counted, a skill or an agent name is NOT', () => {
  const text = entree('Bash') + entree('mcp__ssh__ssh_exec')
    + '{"type":"skill","name":"ctxroute"}\n'
    + '{"type":"agent","name":"design-engine"}\n';
  assert.deepStrictEqual(toolNamesFrom(text).sort(), ['Bash', 'mcp__ssh__ssh_exec']);
});

test('ANCHOR — a `name` FAR from its entry is not attributed to it', () => {
  // The window is bounded on purpose: a whole-file JSON parse is impossible on a
  // 686 MB corpus. Beyond the window we prefer MISSING a name to INVENTING one.
  assert.deepStrictEqual(toolNamesFrom('{"type":"tool_use"}' + ' '.repeat(500) + '"name":"Bash"'), []);
});

test('TOTAL — a non-string, or malformed JSON, yields [] and never throws', () => {
  for (const x of [undefined, null, 42, {}, [], '{"type":"tool_use","name":']) {
    assert.deepStrictEqual(toolNamesFrom(x), []);
  }
});

test('norm — lowercases AND turns backslashes into slashes (the engine contract)', () => {
  // 🛑 BOTH halves are load-bearing and were UNTESTED: dropping the separator would
  //    turn `a\b` into `ab`, so a pattern like `docs/x` would stop matching a
  //    Windows path — silently, on the only OS this fleet runs on.
  assert.strictEqual(norm('AB'), 'ab');
  assert.strictEqual(norm('a' + String.fromCharCode(92) + 'b'), 'a/b');
  assert.strictEqual(norm('C:' + String.fromCharCode(92) + 'Users' + String.fromCharCode(92) + 'X'), 'c:/users/x');
});

test('collides — substring after norm, and an empty pattern collides with NOTHING', () => {
  assert.ok(collides('ssh', 'mcp__ssh__ssh_exec'));
  assert.ok(collides('SSH', 'mcp__ssh__ssh_exec'), 'the comparison is case-insensitive, like the engine');
  assert.ok(!collides('', 'Bash'));
  assert.ok(!collides('zzz', 'Bash'));
});

// ── LAWS (a scanner is judged by laws, not by examples) ──────────────────
const toolNameOf = fc.stringMatching(/^[A-Za-z][A-Za-z0-9_-]{0,30}$/);

test('LAW total — never throws, whatever the text', () => {
  fc.assert(fc.property(fc.string(), (s) => { toolNamesFrom(s); return true; }));
});

test('LAW round-trip — a transcript built from N names yields exactly those names', () => {
  fc.assert(fc.property(fc.uniqueArray(toolNameOf, { maxLength: 12 }), (itemNames) => {
    assert.deepStrictEqual(toolNamesFrom(itemNames.map(entree).join('')).sort(), [...itemNames].sort());
  }));
});

test('LAW anchoring — a `name` OUTSIDE a tool-use entry never adds anything', () => {
  // 🛑 THE law of this file: it is exactly the defect that produced 343 false
  //    collisions. Anything may be written around the entries; the result must not move.
  fc.assert(fc.property(fc.uniqueArray(toolNameOf, { maxLength: 6 }), toolNameOf, (realOnes, intruder) => {
    fc.pre(!realOnes.includes(intruder));
    const bruit = `{"type":"skill","name":"${intruder}"}\n{"type":"agent","name":"${intruder}"}\n`;
    assert.deepStrictEqual(toolNamesFrom(bruit + realOnes.map(entree).join('') + bruit).sort(),
      [...realOnes].sort());
  }));
});

test('LAW dedup — the same tool called N times appears ONCE', () => {
  fc.assert(fc.property(toolNameOf, fc.integer({ min: 1, max: 20 }), (n, k) => {
    assert.deepStrictEqual(toolNamesFrom(entree(n).repeat(k)), [n]);
  }));
});

test('LAW growth — appending text never REMOVES a name already found', () => {
  // A scanner that loses a name on a longer input would under-count, and an
  // under-count reads as good news ("nothing collides"). The forbidden direction.
  fc.assert(fc.property(fc.uniqueArray(toolNameOf, { maxLength: 5 }), fc.string(), (itemNames, suite) => {
    const before = toolNamesFrom(itemNames.map(entree).join(''));
    const apres = toolNamesFrom(itemNames.map(entree).join('') + suite);
    for (const n of before) assert.ok(apres.includes(n), n);
  }));
});

test('LAW patterns is a SUB-SEQUENCE of its input literals', () => {
  fc.assert(fc.property(fc.array(fc.oneof(fc.string(), fc.array(fc.string()))), (sc) => {
    const plats = [];
    for (const g of sc) { if (Array.isArray(g)) plats.push(...g); else plats.push(g); }
    for (const m of patterns(sc)) assert.ok(plats.includes(m));
  }));
});

test('LAW norm is idempotent', () => {
  fc.assert(fc.property(fc.string(), (s) => assert.strictEqual(norm(norm(s)), norm(s))));
});
