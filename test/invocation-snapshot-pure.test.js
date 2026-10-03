// ═══════════════════════════════════════════════════════════════════════
// invocation-snapshot-pure — the arrival order must cross a restart
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 THE DEFECT THIS MODULE CLOSES WAS MEASURED IN PRODUCTION 2026-09-19, on the
//    operator's own conversations, while this repository redeployed its frozen
//    copy six times. `doc-seen-` survived a restart and was PHOTOGRAPHED
//    surviving — so an agent declared "zero document re-delivered" and closed the
//    question. True, and beside it: the documents stayed marked delivered while
//    the ARRIVAL COUNTERS died with the process, so the frames landing after the
//    restart were counted as the FIRST and re-served chunk 1.
// 🛑 SO CELL ⑦ IS THE ONE THAT MATTERS: it reproduces that exact sequence on the
//    REAL sequencer, and it is required to FAIL without the snapshot. A cell that
//    only exercises encode/decode would prove the plumbing and miss the defect,
//    which is precisely the mistake being corrected here.
// ⚠️ STATIC ESM IMPORT, never `createRequire`: Stryker's module graph cannot see
//    a dynamic require, so the module would be mutated while NO suite covers it.

import { test } from 'vitest';
import assert from 'node:assert/strict';
import snapshot from '../src/invocation-snapshot-pure.js';
import frameSequencer from '../src/frame-sequencer-pure.js';

// 🔴 THE SHAPES ARE COPIED FROM THE THREE MODULES, NEVER INVENTED — and the
//    first version of this fixture DID invent them. It gave the sequencer an
//    object, five cells passed on it, and the module shipped refusing every REAL
//    snapshot because the sequencer stores a plain NUMBER. Only cell ⑦, which
//    drives the real sequencer, saw it. **A test that fabricates its inputs
//    proves what its author already believed.**
const tables = () => ({
  sequencer: new Map([['tool-a', 3], ['tool-b', 1]]),
  notice: new Map([['tool-a', { nbFrames: 32, served: 3 }]]),
  carryover: new Map([['tool-a', { scopeId: 's', served: 3, nbFrames: 32, harvested: false }]]),
});

const through = (live) => snapshot.decode(JSON.parse(JSON.stringify(snapshot.encode(live))));

test('① the three tables cross a serialisation unchanged', () => {
  const restored = through(tables());
  for (const name of snapshot.TABLES) {
    assert.deepStrictEqual([...restored[name].entries()], [...tables()[name].entries()],
      `\`${name}\` did not survive the round trip: a table that comes back empty reproduces the very `
      + 'defect this module closes, and it comes back empty in SILENCE.');
  }
});

test('② a Map handed straight to JSON.stringify serialises to NOTHING', () => {
  // 🛑 THE FAILURE MODE THIS CELL GUARDS IS NOT A CRASH, IT IS AN EMPTY FILE THAT
  //    LOOKS VALID. Whoever "simplifies" `encode` into `JSON.stringify(tables)`
  //    gets `{}` for every table, a snapshot that restores nothing, and the
  //    re-injection back — with every other cell here still green.
  assert.strictEqual(JSON.stringify(new Map([['k', 1]])), '{}',
    'a Map no longer serialises to {} — then the reason `encode` spreads entries has changed and this module must be re-read');
  const encoded = snapshot.encode(tables());
  assert.ok(Array.isArray(encoded.sequencer) && encoded.sequencer.length === 2,
    '`encode` no longer produces entry ARRAYS: the snapshot would be written empty');
});

test('③ an unknown version is REFUSED, never adopted on a guess', () => {
  // 🛑 These entries decide which chunk a real agent receives. Adopting a shape
  //    this code does not understand would not "lose a little" — it would serve
  //    the wrong content. Refusing costs exactly what a fresh table costs.
  const forged = { ...snapshot.encode(tables()), v: snapshot.VERSION + 1 };
  const out = snapshot.decode(forged);
  for (const name of snapshot.TABLES) {
    assert.strictEqual(out[name].size, 0, `\`${name}\` was adopted from an unknown version`);
  }
});

test('④ ONE malformed entry condemns ALL THREE tables, never just its own', () => {
  // 🛑 A partially adopted snapshot is worse than none: the sequencer and the
  //    carryover would then disagree about the SAME invocation, and nothing
  //    anywhere would say so.
  const broken = snapshot.encode(tables());
  broken.notice = [['tool-a', 'not-an-object']];
  const out = snapshot.decode(broken);
  for (const name of snapshot.TABLES) {
    assert.strictEqual(out[name].size, 0,
      `\`${name}\` survived a snapshot whose \`notice\` was malformed — the three tables must fall together`);
  }
  for (const wrong of [null, 42, 'text', { v: snapshot.VERSION }, { v: snapshot.VERSION, sequencer: 'x' }]) {
    const o = snapshot.decode(wrong);
    assert.strictEqual(o.sequencer.size + o.notice.size + o.carryover.size, 0,
      `\`${JSON.stringify(wrong)}\` was not refused: the decode must fail open to EMPTY on anything it did not write`);
  }
});

test('⑤ the ceiling keeps the MOST RECENT entries, never the first', () => {
  // ⚠️ The tables are LRU-ordered by insertion, so the TAIL is what is still in
  //    flight — exactly what a restart must not lose. Truncating the head would
  //    faithfully preserve the invocations that no longer matter.
  const big = { sequencer: new Map(), notice: new Map(), carryover: new Map() };
  for (let i = 0; i < snapshot.MAX + 10; i += 1) big.sequencer.set(`inv-${i}`, { served: i });
  const encoded = snapshot.encode(big);
  assert.strictEqual(encoded.sequencer.length, snapshot.MAX, 'the snapshot is not bounded by the table ceiling');
  assert.strictEqual(encoded.sequencer[encoded.sequencer.length - 1][0], `inv-${snapshot.MAX + 9}`,
    'the newest invocation was dropped: the truncation kept the head instead of the tail');
});

test('⑥ adopt fills the LIVE maps in place, never replaces them', () => {
  // 🛑 `main` hands these exact Map objects to EVERY socket of the port lane —
  //    that sharing is what closed the duplication defect where one table per
  //    socket re-served chunks 1..8 four times each. Replacing a table here would
  //    hand the servers a map nobody writes to and rebuild that defect.
  const live = { sequencer: new Map(), notice: new Map(), carryover: new Map() };
  const before = live.sequencer;
  const n = snapshot.adopt(live, through(tables()));
  assert.strictEqual(live.sequencer, before, 'the live Map was REPLACED: every socket still holds the old one');
  assert.strictEqual(live.sequencer.get('tool-a'), 3, 'the restored entry never reached the live table');
  assert.strictEqual(n, 4, `adopt reported ${n} entries instead of the 4 it copied`);
});

test('⑦ SEEN RED: without the snapshot a restart re-serves chunk 1, with it the count continues', () => {
  const FRAMES = 32;
  const ID = 'tool-use-real';

  // Three frames arrive, then the process dies.
  const first = frameSequencer.createState();
  for (let k = 1; k <= 3; k += 1) frameSequencer.nextIndex(first, ID, k, FRAMES);

  // ── THE DEFECT, REPRODUCED: a fresh table after the restart ──────────────
  const naked = frameSequencer.createState();
  assert.strictEqual(frameSequencer.nextIndex(naked, ID, 4, FRAMES), 1,
    'the control half did not hold: a fresh table must re-serve chunk 1, which IS the production defect');

  // ── THE REMEDY: the same table, restored from a snapshot ─────────────────
  const revived = frameSequencer.createState();
  snapshot.adopt(
    { sequencer: revived, notice: new Map(), carryover: new Map() },
    snapshot.decode(JSON.parse(JSON.stringify(snapshot.encode({
      sequencer: first, notice: new Map(), carryover: new Map(),
    })))),
  );
  assert.strictEqual(frameSequencer.nextIndex(revived, ID, 4, FRAMES), 4,
    'the restored table re-served an already delivered chunk: the snapshot does not carry what it exists to carry');
});

test('⑧ every refusal of the decode is its OWN cell — one bad shape each, the rest valid', () => {
  // ④ throws several defects at once, so a guard that stopped checking one of them stayed
  // green behind its neighbours (measured 2026-10-02: 13 survivors on these lines). Each
  // shape below is wrong in EXACTLY ONE way, inside an otherwise valid snapshot.
  const valid = () => ({ v: snapshot.VERSION, sequencer: [['tool-a', 3]], notice: [], carryover: [] });
  const refused = (raw, why) => {
    const o = snapshot.decode(raw);
    assert.strictEqual(o.sequencer.size + o.notice.size + o.carryover.size, 0, why);
  };
  // Control: the valid snapshot IS adopted, or every refusal below proves nothing.
  assert.strictEqual(snapshot.decode(valid()).sequencer.get('tool-a'), 3);

  // A function is truthy, carries properties, and is NOT an object: only `typeof` refuses it.
  refused(Object.assign(() => {}, valid()), 'a function is not a snapshot this code wrote');
  // An array-LIKE pair has a length and indices, and is still not a pair.
  refused({ ...valid(), sequencer: [{ 0: 'tool-a', 1: 3, length: 2 }] }, 'an array-like is not a pair');
  refused({ ...valid(), sequencer: [['tool-a', 3, 'extra']] }, 'a triple is not a pair');
  refused({ ...valid(), sequencer: [[7, 3]] }, 'a non-string key is not one of our invocation ids');
  refused({ ...valid(), notice: [['tool-a', null]] }, 'null is an object by typeof, and no table writes it');
  refused({ ...valid(), sequencer: [['tool-a', NaN]] }, 'NaN is a number by typeof, and no count is NaN');
  refused({ ...valid(), sequencer: [['tool-a', Infinity]] }, 'Infinity is not a count of arrivals');
});

test('⑨ the decode ceiling is EXACT — MAX entries are adopted, MAX + 1 are refused', () => {
  // A snapshot bigger than the table it restores into would grow the daemon past its
  // declared memory. The boundary is the ceiling itself: equal is legal, one more is not.
  const sized = (n) => {
    const sequencer = [];
    for (let i = 0; i < n; i += 1) sequencer.push([`inv-${i}`, i]);
    return { v: snapshot.VERSION, sequencer, notice: [], carryover: [] };
  };
  assert.strictEqual(snapshot.decode(sized(snapshot.MAX)).sequencer.size, snapshot.MAX,
    'a snapshot exactly at the ceiling must be adopted whole');
  assert.strictEqual(snapshot.decode(sized(snapshot.MAX + 1)).sequencer.size, 0,
    'a snapshot past the ceiling must be refused, never half-adopted');
});

test('⑩ encode and adopt tolerate a MISSING table — empty, never a throw, never garbage', () => {
  // `encode` runs while the process exits and `adopt` while it starts: a throw in either
  // would turn a restart into a crash. A table that is not a Map encodes as nothing at all.
  assert.deepEqual(snapshot.encode({}), { v: snapshot.VERSION, sequencer: [], notice: [], carryover: [] });
  assert.deepEqual(snapshot.encode(undefined), { v: snapshot.VERSION, sequencer: [], notice: [], carryover: [] });
  const restored = {
    sequencer: new Map([['tool-a', 3]]),
    notice: new Map([['tool-b', { n: 1 }]]),
    carryover: new Map([['tool-c', { s: [] }]]),
  };
  const live = { sequencer: new Map() };
  assert.strictEqual(snapshot.adopt(live, restored), 1, 'only the table that exists on BOTH sides is adopted');
  assert.strictEqual(live.sequencer.get('tool-a'), 3);
  assert.strictEqual(snapshot.adopt(live, { sequencer: undefined }), 0, 'nothing restored, nothing adopted');
});
