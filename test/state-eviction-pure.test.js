// state-eviction-pure.test.js — WHAT the disk state loses (PURE module, MUTATED).
//
// ⚠️ WHAT THIS SUITE PROTECTS: `state/` had NO eviction at all (615 files / 5.1 MB measured on the
//    live install, 88 % of them ephemeral `plan-` keys). The rule that decides what disappears lives
//    in a PURE module precisely so Stryker can mutate it: written next to the `unlink`, an inverted
//    comparison or a matcher that selects nothing would stay green for ever — and a cleaner that
//    matches NOTHING is indistinguishable from a cleaner that works (the `*.tar.gz` vs `*.sql.gz`
//    incident: 0 bytes removed since forever, disk at 87 %).
// ⚠️ EVERY CELL ASSERTS ON THE FILES THEMSELVES, never on "the function ran".
// ⚠️ IMPORTED DIRECTLY from the mutated file, never through a re-export (`perTest` coverage loses the
//    mapping ⇒ phantom survivors). FIXTURES ARE THUNKS: a `const` evaluated at module load belongs to
//    no test, so its mutants sit uncovered and survive (42 false survivors measured here in July).
// ⚠️ HERMETIC: zero fs. The real directory is exercised by `state-eviction.test.js`.

import { test, expect } from 'vitest';
import { planEviction, classify, ageBound, MAX_EPHEMERAL, MAX_DURABLE } from '../src/state-eviction-pure.js';

// ── THUNKS ───────────────────────────────────────────────────────────────────
const NOW = () => 1_000_000_000;
const BOUND = () => 300_000; // 30 s deadline × 10, written out: never derived from the module.
const at = (name, ageMs) => ({ name, mtimeMs: NOW() - ageMs });
const run = (entries, over) => planEviction(entries, { now: NOW(), maxAgeMs: BOUND(), ...over });

test('the age bound is DERIVED from the process deadline (30 s ⇒ 5 min), not a second number', () => {
  expect(ageBound(30_000)).toBe(300_000);
});

test('a missing or absurd bound is a NAMED REFUSAL, never a silent no-op (trap ②)', () => {
  expect(() => planEviction([], { now: NOW() })).toThrow(/maxAgeMs must be > 0/);
  expect(() => planEviction([], { now: NOW(), maxAgeMs: 0 })).toThrow(/ageBound/);
});

test('each name is put in its class — and anything unrecognised is UNTOUCHABLE', () => {
  expect(classify('plan-sess--inv-42.json')).toBe('ephemeral');
  expect(classify('doc-seen-sess.json')).toBe('durable');
  expect(classify('ctxroute-seen-sess.json')).toBe('durable');
  expect(classify('turn-count-sess.json')).toBe('durable');
  expect(classify('remainder-sess.json')).toBe('durable');
  expect(classify('doc-seen-sess.json.913.xy.tmp')).toBe('scratch');
  expect(classify('canary.json')).toBe(null);
  expect(classify('notes.txt')).toBe(null);
});

test('AN EPHEMERAL KEY DIES BY AGE, and the bound itself already qualifies', () => {
  const r = run([at('plan-a.json', 300_000), at('plan-b.json', 299_999)]);
  expect(r.remove).toEqual(['plan-a.json']);
  expect(r.expired).toEqual(['plan-a.json']);
});

test('A DURABLE KEY IS NEVER AGED OUT — an agent\'s death is not decidable from here', () => {
  const r = run([at('doc-seen-s.json', 10 * 365 * 24 * 3600 * 1000)]);
  expect(r.remove).toEqual([]);
});

test('an unknown .json is NEVER deleted, it is REPORTED (an undeclared writer must be visible)', () => {
  const r = run([at('canary.json', 9_000_000), at('zz.json', 0), at('notes.txt', 9_000_000)]);
  expect(r.remove).toEqual([]);
  expect(r.unclassified).toEqual(['canary.json', 'zz.json']);
});

test('a FRESH .tmp survives even a zero ceiling (its writer may still be filling it)', () => {
  const r = run([at('doc-seen-s.json.1.a.tmp', 0)], { maxEphemeral: 0, maxDurable: 0 });
  expect(r.remove).toEqual([]);
});

test('a STALE .tmp is swept: no writer of ours outlives its deadline', () => {
  const r = run([at('doc-seen-s.json.1.a.tmp', 300_000)]);
  expect(r.remove).toEqual(['doc-seen-s.json.1.a.tmp']);
});

test('over the ceiling, the COLDEST go first — and a tie is broken by name, never by disk order', () => {
  const r = run(
    [at('plan-c.json', 30), at('plan-a.json', 90), at('plan-b.json', 90), at('plan-d.json', 10)],
    { maxEphemeral: 2 },
  );
  expect(r.overflow).toEqual(['plan-a.json', 'plan-b.json']);
  expect(r.remove).toEqual(['plan-a.json', 'plan-b.json']);
});

test('the two classes have SEPARATE ceilings: an ephemeral flood can never evict a durable key', () => {
  const r = run(
    [at('plan-1.json', 5), at('plan-2.json', 4), at('plan-3.json', 3), at('doc-seen-s.json', 900)],
    { maxEphemeral: 1, maxDurable: 1 },
  );
  expect(r.remove).toEqual(['plan-1.json', 'plan-2.json']);
});

test('age and count are UNIONED and the output is sorted (a verdict must not depend on input order)', () => {
  const r = run(
    [at('plan-z.json', 300_000), at('plan-m.json', 50), at('plan-a.json', 40)],
    { maxEphemeral: 1 },
  );
  expect(r.remove).toEqual(['plan-m.json', 'plan-z.json']);
  expect(r.expired).toEqual(['plan-z.json']);
  expect(r.overflow).toEqual(['plan-m.json']);
});

test('the DEFAULT ceilings are the RAM store\'s, one per class (4096 durable / 2048 ephemeral)', () => {
  const plans = [];
  for (let i = 0; i <= MAX_EPHEMERAL; i += 1) plans.push(at(`plan-${1000 + i}.json`, MAX_EPHEMERAL - i));
  expect(run(plans).remove).toEqual(['plan-1000.json']);

  const scopes = [];
  for (let i = 0; i <= MAX_DURABLE; i += 1) scopes.push(at(`doc-seen-${1000 + i}.json`, MAX_DURABLE - i));
  expect(run(scopes).remove).toEqual(['doc-seen-1000.json']);
});
