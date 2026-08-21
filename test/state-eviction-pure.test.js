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
import {
  planEviction,
  classify,
  ageBound,
  byAgeThenName,
  MAX_EPHEMERAL,
  MAX_DURABLE,
} from '../src/state-eviction-pure.js';

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

// ⚠️ THE INPUT IS FED IN REVERSE ALPHABETICAL ORDER ON PURPOSE: the shell hands over whatever order the
//    OS walked the directory in, so `unclassified` is only proven SORTED when the listing is unsorted.
//    Fed alphabetically, dropping the sort changed nothing and the mutant lived.
test('an unknown .json is NEVER deleted, it is REPORTED (an undeclared writer must be visible)', () => {
  const r = run([at('zz.json', 0), at('canary.json', 9_000_000), at('notes.txt', 9_000_000)]);
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

// 🛑 THE DURABLE CEILING MUST BE THE ONE THE CALLER NAMED — and until now nothing proved it.
//    The cell below passes `maxDurable: 1` with a SINGLE durable key, so ignoring the caller's
//    figure and falling back to the 4,096 default changed NO output and that mutant lived. It
//    takes TWO durable keys for an explicit ceiling to decide anything at all.
// ⚠️ Both keys are young on purpose: a durable key is NEVER aged out, so the only thing that
//    can remove one here is the COUNT — which is exactly what this cell measures. And the
//    survivor is asserted as well as the removal: an eviction is judged on what it deletes,
//    and a cleaner that deleted BOTH would look just as green on the removal alone.
test('an EXPLICIT durable ceiling is obeyed — the coldest goes, the figure never falls back to the default', () => {
  const r = run([at('doc-seen-cold.json', 900), at('doc-seen-warm.json', 10)], { maxDurable: 1 });
  expect(r.remove).toEqual(['doc-seen-cold.json']);
  expect(r.overflow).toEqual(['doc-seen-cold.json']);
  expect(r.expired).toEqual([]);
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

// ⚠️ NO OPTIONS AT ALL is the shape a caller reaches by forgetting an argument, not an exotic one — and it
//    must land on the SAME named refusal, never on a `TypeError` about a property of `undefined`.
test('calling with NO options object at all is the same NAMED REFUSAL, not a TypeError', () => {
  expect(() => planEviction([])).toThrow(/maxAgeMs must be > 0/);
});

// ⚠️ THE `.json` GUARD IS REACHABLE BY CONSTRUCTION: the argument is a real directory listing, whose
//    content nobody owns — a leftover, a file a human dropped, a future writer's format. A name may
//    therefore carry a DECLARED prefix and not be a state file, and that is the only case where the
//    guard decides anything: without it, `plan-a.txt` would be classified and DELETED.
test('a DECLARED prefix on something that is not a .json state file is still UNTOUCHABLE', () => {
  expect(classify('plan-a.txt')).toBe(null);
  expect(classify('doc-seen-sess.log')).toBe(null);
  expect(classify('remainder-sess')).toBe(null);
});

test('that guard also holds through the verdict: such a name is neither removed nor reported', () => {
  const r = run([at('plan-a.txt', 9_000_000), at('doc-seen-s.log', 9_000_000)], { maxEphemeral: 0 });
  expect(r.remove).toEqual([]);
  expect(r.unclassified).toEqual([]);
});

// ── THE ORDER ITSELF — the comparator is called DIRECTLY, because through `planEviction` its SIGN is
//    invisible: the verdict is re-sorted before it is returned. See the seal in the source.
test('the ORDER is by age first, coldest before warmest, whatever the names say', () => {
  expect(byAgeThenName({ name: 'zz.json', mtimeMs: 1 }, { name: 'aa.json', mtimeMs: 2 })).toBe(-1);
  expect(byAgeThenName({ name: 'aa.json', mtimeMs: 2 }, { name: 'zz.json', mtimeMs: 1 })).toBe(1);
});

test('AT EQUAL MILLISECOND the name decides — a verdict must not depend on the OS listing order', () => {
  expect(byAgeThenName({ name: 'plan-a.json', mtimeMs: 5 }, { name: 'plan-b.json', mtimeMs: 5 })).toBe(-1);
  expect(byAgeThenName({ name: 'plan-b.json', mtimeMs: 5 }, { name: 'plan-a.json', mtimeMs: 5 })).toBe(1);
});

test('two identical entries are EQUAL, and that is the only case that returns 0', () => {
  expect(byAgeThenName({ name: 'plan-a.json', mtimeMs: 5 }, { name: 'plan-a.json', mtimeMs: 5 })).toBe(0);
});

// ⚠️ THE PREVIOUS TIE CELL EVICTED BOTH TIED FILES, so the tie-break could not change its result. Here
//    the ceiling takes exactly ONE of the two: this is what proves the comparator is WIRED into the
//    eviction and not merely exported. The input is given warmest-name-first on purpose.
test('a tie that condemns ONE of the two files: the comparator decides WHICH, deterministically', () => {
  const r = run([at('plan-b.json', 90), at('plan-a.json', 90)], { maxEphemeral: 1 });
  expect(r.overflow).toEqual(['plan-a.json']);
  expect(r.remove).toEqual(['plan-a.json']);
});

// ⚠️ AGE ORDER AND NAME ORDER ARE OPPOSED HERE, so `overflow` leaves the count pass UNSORTED: it is the
//    only shape that measures its sort. Same reason as the `unclassified` cell above.
test('the OVERFLOW list is sorted too, even when the coldest files are the last alphabetically', () => {
  const r = run(
    [at('plan-z.json', 90), at('plan-a.json', 80), at('plan-m.json', 10)],
    { maxEphemeral: 1 },
  );
  expect(r.overflow).toEqual(['plan-a.json', 'plan-z.json']);
  expect(r.remove).toEqual(['plan-a.json', 'plan-z.json']);
});

// ⚠️ TWO EXPIRED FILES, fed in reverse alphabetical order: `expired` keeps the LISTING order until it is
//    sorted, and every earlier cell expired exactly one file — a single-element list is sorted by luck.
test('the EXPIRED list is sorted, not left in the order the directory happened to be walked', () => {
  const r = run([at('plan-z.json', 400_000), at('plan-a.json', 400_000)]);
  expect(r.expired).toEqual(['plan-a.json', 'plan-z.json']);
  expect(r.remove).toEqual(['plan-a.json', 'plan-z.json']);
});

test('the DEFAULT ceilings are the RAM store\'s, one per class (4096 durable / 2048 ephemeral)', () => {
  const plans = [];
  for (let i = 0; i <= MAX_EPHEMERAL; i += 1) plans.push(at(`plan-${1000 + i}.json`, MAX_EPHEMERAL - i));
  expect(run(plans).remove).toEqual(['plan-1000.json']);

  const scopes = [];
  for (let i = 0; i <= MAX_DURABLE; i += 1) scopes.push(at(`doc-seen-${1000 + i}.json`, MAX_DURABLE - i));
  expect(run(scopes).remove).toEqual(['doc-seen-1000.json']);
});
