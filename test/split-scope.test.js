// split-scope-pure — an action is SPLIT once, never once per frame.
//
// 🛑 WHAT MUST BE PROVEN HERE, AND IT IS NOT "the memo works". A memo that
//    answers for the WRONG input serves one action's frames to another, and the
//    agent receives chunks of a document it never asked for — silently. So the
//    cells below spend most of their effort on the cases where the memo must
//    REFUSE to answer, and the last one drives the REAL splitter to prove the
//    memoised value is the one the engine would have computed anyway.
// 🔴 AND THAT LAST CELL IS THERE BECAUSE OF A DEFECT THIS REPOSITORY ALREADY
//    PAID: `invocation-snapshot-pure` shipped INERT with five green cells built
//    on a FABRICATED fixture, and only the cell driving the real module saw it.
//    A memo tested against hand-made segments proves what its author believed.
// ⚠️ DIRECT, STATIC import of the mutated module — never `createRequire`, never
//    a re-export: the perTest coverage mapping misses tests reached that way and
//    yields phantom survivors, and `mutation-workflow-gate` refuses it outright
//    (it caught this suite's first version).
import { test } from 'vitest';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as splitScope from '../src/split-scope-pure.js';
import { createRequire } from 'node:module';

// `budget` is NOT the module under mutation here — it is the REAL splitter cell
// ⑩ drives, so it comes through `require` like any other production consumer.
const require = createRequire(import.meta.url);
const budget = require('../src/budget');

/** The hasher the daemon injects, rebuilt here rather than imported: the shell
 *  owns `node:crypto`, and this is the shape the module is contracted against. */
const newHash = () => {
  const h = crypto.createHash('sha1');
  return { update: (s) => h.update(s), digest: () => h.digest('hex') };
};

/** Fixtures are THUNKS, never module-level consts: under `perTest` a literal
 *  evaluated at import is a STATIC mutant, i.e. a false survivor. */
const sampleSegments = () => [
  { id: 'alpha.md', text: 'a'.repeat(400) },
  { id: 'beta.md', text: 'b'.repeat(700) },
];

test('① the same input answers from the table, and it is the SAME object', () => {
  const state = splitScope.createState();
  const key = splitScope.signature(sampleSegments(), 200, 4, newHash);
  assert.notEqual(key, '', 'anti-vacuity: an empty key would make every assertion below free');

  assert.equal(splitScope.lookup(state, key), null, 'an empty table must answer "split"');
  const frames = [{ segments: [], deferred: [] }];
  assert.equal(splitScope.remember(state, key, frames), true);
  assert.equal(splitScope.lookup(state, key), frames,
    'the memo must hand back what it was given, not a copy: the caller compares nothing, it USES it');
});

test('② the key is a function of the INPUTS — every one of the three moves it', () => {
  const base = splitScope.signature(sampleSegments(), 200, 4, newHash);

  assert.notEqual(splitScope.signature(sampleSegments(), 201, 4, newHash), base,
    'a different budget splits differently: it MUST key differently');
  assert.notEqual(splitScope.signature(sampleSegments(), 200, 5, newHash), base,
    'a different frame count splits differently: it MUST key differently');

  // Same ids, same LENGTHS, different CONTENT — the case a shape-only key would
  // conflate, and the reason the texts go through the hasher at all.
  const sneaky = sampleSegments();
  sneaky[0] = { ...sneaky[0], text: 'z'.repeat(400) };
  assert.notEqual(splitScope.signature(sneaky, 200, 4, newHash), base,
    'identical ids and identical lengths with different text MUST NOT share a key: '
    + 'that is the collision that would serve one action the other one\'s frames');

  // Same content, different ids — the mirror case.
  const renamed = sampleSegments();
  renamed[0] = { ...renamed[0], id: 'other.md' };
  assert.notEqual(splitScope.signature(renamed, 200, 4, newHash), base,
    'a renamed document is a different emission');

  assert.equal(splitScope.signature(sampleSegments(), 200, 4, newHash), base,
    'and the SAME input must give the SAME key, or the memo never hits');
});

test('③ the encoding is self-delimiting — WITHIN a segment and BETWEEN segments', () => {
  // Concatenating id and text with no length makes these two hash alike.
  assert.notEqual(
    splitScope.signature([{ id: 'a', text: 'bc' }], 100, 2, newHash),
    splitScope.signature([{ id: 'ab', text: 'c' }], 100, 2, newHash),
    'id and text run together: two different emissions would share a key');

  // And the boundary BETWEEN segments matters just as much: these two carry the
  // same characters in the same order, split differently across two segments.
  assert.notEqual(
    splitScope.signature([{ id: 'a', text: 'bc' }, { id: '', text: 'd' }], 100, 2, newHash),
    splitScope.signature([{ id: 'a', text: 'b' }, { id: 'c', text: 'd' }], 100, 2, newHash),
    'two segments run together: the split boundary is part of the emission');
});

test('③bis the segment COUNT is in the key, so an empty emission is its own thing', () => {
  const empty = splitScope.signature([], 100, 2, newHash);
  assert.notEqual(empty, '', 'an empty emission is a legitimate input, not a malformed one');
  assert.notEqual(empty, splitScope.signature([{ id: '', text: '' }], 100, 2, newHash),
    'an empty list and a list holding an empty segment are different emissions');
});

/** A hasher that swallows ANYTHING and always answers: it makes the guards
 *  visible that a real hasher would hide by throwing first. */
const lenientHash = () => ({ update: () => {}, digest: () => 'deadbeef' });

test('④ anything it cannot key becomes `\'\'`, and `\'\'` matches NOTHING', () => {
  const refusals = {
    'segments not an array': () => splitScope.signature('nope', 200, 4, newHash),
    // 🔑 A `Set` of VALID segments iterates, so only the array check refuses it.
    //    Without that check it would key on an `undefined` length — the one case
    //    that earns the guard its place.
    'segments are a Set, not an array': () => splitScope.signature(new Set(sampleSegments()), 200, 4, lenientHash),
    'budget not an integer': () => splitScope.signature(sampleSegments(), 1.5, 4, newHash),
    'frames not an integer': () => splitScope.signature(sampleSegments(), 200, null, newHash),
    'no hasher': () => splitScope.signature(sampleSegments(), 200, 4, undefined),
    'hasher throws': () => splitScope.signature(sampleSegments(), 200, 4, () => { throw new Error('x'); }),
    'hasher is not an object': () => splitScope.signature(sampleSegments(), 200, 4, () => 42),
    'hasher is null': () => splitScope.signature(sampleSegments(), 200, 4, () => null),
    'hasher lacks update': () => splitScope.signature(sampleSegments(), 200, 4, () => ({ digest: () => 'x' })),
    'hasher lacks digest': () => splitScope.signature(sampleSegments(), 200, 4, () => ({ update: () => {} })),
    'digest throws': () => splitScope.signature(sampleSegments(), 200, 4, () => ({ update: () => {}, digest: () => { throw new Error('x'); } })),
    'digest is not a string': () => splitScope.signature(sampleSegments(), 200, 4, () => ({ update: () => {}, digest: () => 7 })),
    // 🔑 A LENIENT hasher is what makes this one observable: with a real hasher
    //    the missing text would throw and the catch would answer for the guard.
    'a segment has no text': () => splitScope.signature([{ id: 'a' }], 200, 4, lenientHash),
    'a segment text is not a string': () => splitScope.signature([{ id: 'a', text: 12 }], 200, 4, lenientHash),
    'a segment is null': () => splitScope.signature([null], 200, 4, newHash),
    'a segment is not an object': () => splitScope.signature([42], 200, 4, newHash),
  };
  for (const [why, call] of Object.entries(refusals)) {
    assert.equal(call(), '', `${why}: the key must be empty, so the caller SPLITS`);
  }

  // And an empty key can never reach a stored value, whatever is in the table.
  const state = splitScope.createState();
  splitScope.remember(state, splitScope.signature(sampleSegments(), 200, 4, newHash), [{ x: 1 }]);
  assert.equal(splitScope.lookup(state, ''), null, 'an empty key must never hit');
  assert.equal(splitScope.remember(state, '', [{ x: 1 }]), false, 'nor may it store');
});

test('⑤ a segment with no id is keyed as one with an EMPTY id, never refused', () => {
  const missing = splitScope.signature([{ text: 'body' }], 100, 2, newHash);
  assert.notEqual(missing, '', 'a segment carrying no id is a valid emission, not a malformed one');
  // 🛑 EQUALITY, not merely "not refused": an absent id must be treated as the
  //    empty string and nothing else. A fallback to any other value would key
  //    two identical emissions apart, and the memo would simply never hit.
  assert.equal(splitScope.signature([{ id: '', text: 'body' }], 100, 2, newHash), missing,
    'an absent id and an empty id are the same emission');
  assert.notEqual(splitScope.signature([{ id: 'x', text: 'body' }], 100, 2, newHash), missing,
    'and both must stay distinguishable from the same body WITH an id');
});

test('⑥ a broken table or a broken value is refused, never trusted', () => {
  const key = splitScope.signature(sampleSegments(), 200, 4, newHash);
  for (const notATable of [null, undefined, {}, [], 'map']) {
    assert.equal(splitScope.lookup(notATable, key), null, 'no table ⇒ split');
    assert.equal(splitScope.remember(notATable, key, [{}]), false, 'no table ⇒ nothing stored');
  }
  const state = splitScope.createState();
  for (const notFrames of [null, undefined, 'frames', 42, {}]) {
    assert.equal(splitScope.remember(state, key, notFrames), false,
      'a non-array would be indexed into by the caller: refusing to store costs one split');
  }
  assert.equal(state.size, 0, 'and nothing must have been stored along the way');
});

// 🛑 THE KEY GUARD IS ONLY OBSERVABLE IF THE FORBIDDEN KEY IS ALREADY IN THE
//    TABLE. Asking for a key nobody stored answers `null` whether the guard
//    runs or not — which is how every mutant on that line survived the first
//    version of this suite.
test('⑥bis a forbidden key is refused even when the table HOLDS it', () => {
  const frames = [{ segments: [], deferred: [] }];
  for (const forbidden of ['', null, undefined, 42]) {
    const state = splitScope.createState();
    state.set(forbidden, frames);                    // planted behind the guard's back
    assert.equal(state.size, 1, 'anti-vacuity: the entry must really be in the table');
    assert.equal(splitScope.lookup(state, forbidden), null,
      `key ${String(forbidden)}: a key the module refuses to WRITE it must also refuse to READ, `
      + 'or an unkeyable input would be served another emission\'s frames');
    assert.equal(splitScope.remember(state, forbidden, frames), false,
      'and it must still refuse to store under it');
  }
});

test('⑦ the ceiling evicts the OLDEST, and reading counts as using', () => {
  const state = splitScope.createState();
  const cap = 3;
  for (const n of ['k1', 'k2', 'k3']) splitScope.remember(state, n, [n], cap);

  // Touch the oldest: it must stop being the eviction candidate.
  assert.deepEqual(splitScope.lookup(state, 'k1'), ['k1']);
  splitScope.remember(state, 'k4', ['k4'], cap);

  assert.equal(state.size, cap, 'the ceiling is a ceiling, not a suggestion');
  assert.deepEqual(splitScope.lookup(state, 'k1'), ['k1'],
    'the entry just read must have survived: an action still receiving frames is exactly '
    + 'the one an eviction must not sacrifice');
  assert.equal(splitScope.lookup(state, 'k2'), null, 'the genuinely coldest entry is the one that goes');
});

test('⑧ the ceiling drains, even from far above it', () => {
  const state = splitScope.createState();
  for (let i = 0; i < 50; i++) state.set(`pre-${i}`, [i]);
  splitScope.remember(state, 'fresh', ['fresh'], 4);
  assert.equal(state.size, 4, 'it drains DOWN to the cap, it does not assume a single overflow');
  assert.deepEqual(splitScope.lookup(state, 'fresh'), ['fresh'], 'and the newest entry survives');
});

test('⑨ a nonsense ceiling falls back to the declared one, never to "no ceiling"', () => {
  for (const bad of [0, -1, 1.5, 'lots', null]) {
    const state = splitScope.createState();
    for (let i = 0; i <= splitScope.MAX_ENTRIES + 3; i++) {
      splitScope.remember(state, `k${i}`, [i], bad);
    }
    assert.equal(state.size, splitScope.MAX_ENTRIES,
      `ceiling ${String(bad)}: an unbounded table in a daemon that runs for weeks is a DATED outage`);
  }
  // The contract value is written HARDCODED: deriving it from the module would
  // prove `x === x` and the mutant would be invisible.
  assert.equal(splitScope.MAX_ENTRIES, 16);
});

// ═══════════════════════════════════════════════════════════════════════
// ⑩ THE REAL SPLITTER — the only cell that can catch an inert memo
// ═══════════════════════════════════════════════════════════════════════
// 🛑 Everything above proves the TABLE. This proves that what the table hands
//    back is what `budget.planFrames` would have computed — on segments the real
//    engine's shape, through the real function, with a real overflow so that the
//    chunking, the marker and the deferral are all exercised.
test('⑩ the memoised frames are the ones the REAL splitter computes', () => {
  const state = splitScope.createState();
  const input = [
    { id: 'big.md', text: 'x'.repeat(5000) },
    { id: 'small.md', text: 'y'.repeat(300) },
  ];
  const budgetMax = 900;
  const nbFrames = 4;

  const computed = budget.planFrames(input, budgetMax, nbFrames);
  assert.equal(computed.length, nbFrames, 'anti-vacuity: the real splitter must have produced frames');
  assert.ok(computed.some((f) => (f.text || '').length > 0),
    'anti-vacuity: an all-empty split would make the comparison below free');

  const key = splitScope.signature(input, budgetMax, nbFrames, newHash);
  splitScope.remember(state, key, computed);

  // A caller arriving later with the SAME input must be handed the SAME split —
  // and the engine recomputing it must agree, which is what makes the memo
  // semantically invisible rather than merely fast.
  const again = budget.planFrames(input, budgetMax, nbFrames);
  assert.deepEqual(splitScope.lookup(state, key), again,
    'the memoised split and a fresh one must be indistinguishable: a memo that answers '
    + 'anything else changes what a real agent receives');

  // And a genuinely different emission must MISS, never be served this one.
  const other = [{ id: 'big.md', text: 'z'.repeat(5000) }, { id: 'small.md', text: 'y'.repeat(300) }];
  assert.equal(splitScope.lookup(state, splitScope.signature(other, budgetMax, nbFrames, newHash)), null,
    'different content must miss: being served another action\'s frames is the failure this exists to prevent');
});

// ═══════════════════════
// ⓪ THE CHAIN — the cells above prove the LOGIC; only this proves the WIRING
// ═══════════════════════
// 🛑 THE THUNK BELOW IS COPIED FROM `src/hooks/http-server.js`, NOT INVENTED.
//    A fabricated caller proves only what its author already believed — the
//    class that cost a whole session here on 2026-09-13.
// 🛑 AND IT ASSERTS THE TWO HALVES TOGETHER: the split really happens ONCE,
//    and the 32 frames come out BYTE FOR BYTE as they do without the memo.
//    Either alone is worthless — a memo that is fast and wrong, or a memo that
//    is correct and never hits.
test('⓪ 32 frames through the REAL pretool-core: ONE split, output identical to the byte', async () => {
  const [{ run }, { createMemoryStore }, emissionCore, collectScope, { collectAll }] =
    await Promise.all([
      import('../src/pretool-core.js'),
      import('../src/memory-store.js'),
      import('../src/emission-core.js'),
      import('../src/collect-scope-pure.js'),
      import('../src/collect-core.js'),
    ]);

  // 🛑 BOTH ARMS COLLECT ONCE, because production does: `collect-scope-pure` has
  //    been wired since 2026-09-18. Leaving the plain arm to re-collect 32 times
  //    would make this cell differ in TWO variables and measure neither.
  const collectOnce = (id) => {
    const cache = collectScope.createState();
    return (cfg, pl) => {
      const memo = collectScope.lookup(cache, id);
      if (memo !== null) return memo;
      const fresh = collectAll(cfg, pl);
      collectScope.remember(cache, id, fresh);
      return fresh;
    };
  };

  const data = {
    session_id: 'split-scope-chain',
    // 🔑 A GESTURE THAT REALLY INJECTS, verified with the repo's own
    //    `explain.js`: "INJECTED — 2 doc(s)" (`paths.md` + the ctxroute skill).
    //    The first version used a command that matched nothing, so the cell took
    //    its UNMEASURED exit and proved precisely zero.
    tool_name: 'Read',
    tool_input: { file_path: new URL('../src/paths.js', import.meta.url).pathname.replace(/^\//, '') },
    tool_use_id: 'inv-split-chain',
  };
  const drive = (options) => {
    const out = [];
    for (let k = 1; k <= 32; k += 1) {
      run(data, (d, doc, msg) => out.push(`${k}:${d}:${(doc || '').length}:${msg || ''}`), {
        ...options,
        frame: k,
        nbFrames: 32,
        invocationId: data.tool_use_id,
      });
    }
    return out;
  };

  // ⚠️ ONE store for the whole action, exactly like the daemon: a fresh store
  //    per frame would re-deliver every `once` and compare two fictions.
  const withoutMemo = drive({
    store: createMemoryStore(),
    collect: collectOnce(data.tool_use_id),
  });

  const cache = splitScope.createState();
  let realSplits = 0;
  const withMemo = drive({
    store: createMemoryStore(),
    collect: collectOnce(data.tool_use_id),
    // ── copied from `runFn(data, capture, { … })` in http-server.js ──
    split: (segments, budgetMax, nbFrames) => {
      const key = splitScope.signature(segments, budgetMax, nbFrames, newHash);
      const memo = splitScope.lookup(cache, key);
      if (memo !== null) return memo;
      realSplits += 1;
      const fresh = emissionCore.split(segments, budgetMax, nbFrames);
      splitScope.remember(cache, key, fresh);
      return fresh;
    },
  });

  // 🛑 ANTI-VACUITY: with no corpus on disk both runs emit nothing, the
  //    equality below holds and NOTHING is measured. The fleet's docs are
  //    gitignored, so a clean clone legitimately has none — a NAMED skip.
  const delivered = withoutMemo.reduce((n, line) => n + Number(line.split(':')[2]), 0);
  if (delivered === 0) {
    // 🛑 NOT "zero splits": an emission carrying no segment is still SPLIT once.
    //    What this exit says is that nothing was DELIVERED, so the equality above
    //    would compare two silences. A named skip, never a quiet green.
    assert.ok(realSplits <= 1, 'an empty emission must not be split more than once either');
    return; // UNMEASURED on this checkout: no corpus reachable.
  }

  assert.deepEqual(withMemo, withoutMemo,
    'the memoised run must deliver exactly what the plain run delivers — the operator\'s own '
    + 'criterion is a facade identical to the BYTE, the inside being free');
  assert.equal(realSplits, 1,
    `the 32 replays must share ONE split, got ${realSplits}: the memo is not wired, or its key moves`);
});
