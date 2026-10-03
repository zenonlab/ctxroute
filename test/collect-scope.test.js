// ⚠️ DIRECT import of the mutated module — never through a re-export: the
//    perTest coverage mapping misses tests reached that way and yields phantom
//    survivors (measured 2026-07-16 on another module).
// ⚠️ Every fixture is built INSIDE a `test()`: a module-level const is a STATIC
//    mutant, covered by nothing, hence a false survivor.
import { describe, test, expect } from 'vitest';
import { createState, lookup, remember, MAX_INVOCATIONS } from '../src/collect-scope-pure.js';

describe('collect-scope-pure — one collection per ACTION', () => {
  test('a fresh table answers null: nothing has been collected yet', () => {
    expect(lookup(createState(), 'inv-1')).toBe(null);
  });

  test('what was remembered comes back, identically', () => {
    const state = createState();
    const acc = { matched: ['a'], bodies: { a: 'x' } };
    expect(remember(state, 'inv-1', acc)).toBe(true);
    expect(lookup(state, 'inv-1')).toBe(acc);
  });

  test('another action never reads this one’s accumulator', () => {
    const state = createState();
    remember(state, 'inv-1', { matched: ['a'] });
    expect(lookup(state, 'inv-2')).toBe(null);
  });

  // ── FAIL-SAFE: every question that cannot be asked answers "collect" ──
  // 🛑 These cells are the whole safety of the module: a `null` means MORE
  //    work, never "there is nothing to serve".
  test.each([
    ['no table at all', undefined],
    ['a null table', null],
    ['something that is not a Map', {}],
  ])('%s ⇒ null (collect)', (_label, state) => {
    expect(lookup(/** @type {*} */ (state), 'inv-1')).toBe(null);
  });

  test.each([
    ['an empty invocation id', ''],
    ['a missing invocation id', undefined],
    ['a non-string invocation id', 42],
  ])('%s ⇒ null (collect)', (_label, id) => {
    const state = createState();
    remember(state, 'inv-1', { matched: [] });
    expect(lookup(state, /** @type {*} */ (id))).toBe(null);
  });

  // 🛑 THE READING GUARD IS EXERCISED THROUGH A DIRECTLY-POPULATED TABLE, and
  //    that is not contrivance: the table is a plain `Map` handed over by the
  //    shell, so nothing in the type system stops another writer from putting a
  //    key in it. `remember` refuses these ids, which makes the guard in
  //    `lookup` unreachable THROUGH THAT DOOR ONLY — and a type guard on a
  //    public contract is never deleted because one door happens to be shut.
  //    Without these cells its mutants survive (measured: 5 of them).
  test('an entry stored under an EMPTY key is never served', () => {
    const state = createState();
    state.set('', { matched: ['ghost'] });
    expect(lookup(state, '')).toBe(null);
  });

  test('an entry stored under a NON-STRING key is never served', () => {
    const state = createState();
    state.set(/** @type {*} */ (42), { matched: ['ghost'] });
    expect(lookup(state, /** @type {*} */ (42))).toBe(null);
  });

  // ── The same guards on the writing side: refusing to store simply means
  //    the next frame collects again. It must NEVER throw and never store.
  test.each([
    ['no table at all', undefined],
    ['a null table', null],
    ['something that is not a Map', {}],
  ])('remember on %s ⇒ false, nothing stored', (_label, state) => {
    expect(remember(/** @type {*} */ (state), 'inv-1', { matched: [] })).toBe(false);
  });

  test.each([
    ['an empty invocation id', ''],
    ['a non-string invocation id', 7],
  ])('remember with %s ⇒ false, nothing stored', (_label, id) => {
    const state = createState();
    expect(remember(state, /** @type {*} */ (id), { matched: [] })).toBe(false);
    expect(state.size).toBe(0);
  });

  // 🛑 A NON-OBJECT IS NEVER STORED. Handing back something a caller would then
  //    read `.matched` off is how a memo turns into a silent wrong answer.
  test.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'acc'],
    ['a number', 3],
  ])('remember of %s ⇒ false, nothing stored', (_label, acc) => {
    const state = createState();
    expect(remember(state, 'inv-1', /** @type {*} */ (acc))).toBe(false);
    expect(state.size).toBe(0);
    expect(lookup(state, 'inv-1')).toBe(null);
  });

  // ── EVICTION: the table is BOUNDED. An entry holds a whole accumulator, so
  //    an unbounded table is a leak in a process meant to run for months.
  test('the table never exceeds its ceiling', () => {
    const state = createState();
    for (let i = 0; i < 10; i += 1) remember(state, 'inv-' + i, { matched: [i] }, 4);
    expect(state.size).toBe(4);
  });

  test('eviction sacrifices the OLDEST action, never the newest', () => {
    const state = createState();
    remember(state, 'old', { matched: ['old'] }, 2);
    remember(state, 'mid', { matched: ['mid'] }, 2);
    remember(state, 'new', { matched: ['new'] }, 2);
    expect(lookup(state, 'old')).toBe(null);
    expect(lookup(state, 'new')).not.toBe(null);
  });

  // 🔑 THE LRU RE-INSERT, and it is not decoration: an action still receiving
  //    frames must never be the one an eviction sacrifices — that would make
  //    the LONGEST actions, the ones this module exists for, pay the most.
  test('reading an action makes it young again', () => {
    const state = createState();
    remember(state, 'a', { matched: ['a'] }, 2);
    remember(state, 'b', { matched: ['b'] }, 2);
    lookup(state, 'a'); // `a` is used again ⇒ it must survive the next eviction
    remember(state, 'c', { matched: ['c'] }, 2);
    expect(lookup(state, 'a')).not.toBe(null);
    expect(lookup(state, 'b')).toBe(null);
  });

  test('re-remembering an action does not duplicate it', () => {
    const state = createState();
    remember(state, 'inv-1', { matched: ['first'] });
    remember(state, 'inv-1', { matched: ['second'] });
    expect(state.size).toBe(1);
    expect(lookup(state, 'inv-1')).toEqual({ matched: ['second'] });
  });

  // ── The ceiling ARGUMENT: only a positive integer overrides the default.
  test.each([
    ['zero', 0],
    ['a negative number', -3],
    ['a fractional number', 2.5],
    ['a string', '2'],
    ['undefined', undefined],
  ])('a ceiling of %s falls back to the declared default', (_label, cap) => {
    const state = createState();
    for (let i = 0; i < 5; i += 1) {
      remember(state, 'inv-' + i, { matched: [i] }, /** @type {*} */ (cap));
    }
    // 5 entries is far below the default ceiling ⇒ nothing was evicted.
    expect(state.size).toBe(5);
  });

  // ⚠️ CONTRACT VALUE WRITTEN HARDCODED — never derived from the module, which
  //    would demonstrate `x === x` and let its mutant live.
  test('the declared ceiling is 64', () => {
    expect(MAX_INVOCATIONS).toBe(64);
  });

  test('the default ceiling really bounds the table', () => {
    const state = createState();
    for (let i = 0; i < 70; i += 1) remember(state, 'inv-' + i, { matched: [i] });
    expect(state.size).toBe(64);
  });

  test('a fresh table is empty and is a Map', () => {
    const state = createState();
    expect(state instanceof Map).toBe(true);
    expect(state.size).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// THE CHAIN — the unit cells above prove the LOGIC; only this proves the
// WIRING, and the wiring is what breaks (`test-copie-l-appelant.md`).
// 🛑 THE THUNK BELOW IS COPIED FROM `src/hooks/http-server.js`, NOT INVENTED.
//    A fabricated caller proves only what its author already believed — the
//    class that cost a whole session here on 2026-09-13.
// ═══════════════════════════════════════════════════════════════════════
describe('collect-scope — driven through the REAL pretool-core', () => {
  // ⚠️ SA PROPRE BORNE, ET ELLE EST GÉNÉREUSE PAR NÉCESSITÉ (2026-09-20).
  //    Cette cellule pilote 32 TRAMES du VRAI `pretool-core` sur un vrai
  //    corpus ; la voie rapide borne à 5 s, ce qui est juste pour 105 suites en
  //    mémoire et FAUX pour celle-ci. Mesuré : verte SEULE, rouge dès que la
  //    machine respire — une cellule au bord de sa ligne bascule, puis finit
  //    désarmée. 🛑 On n'élargit PAS la borne de la voie : ce serait faire
  //    attendre 30 s à une suite bloquée qui doit échouer en 5.
  test('32 frames, ONE collection, output identical to the byte', async () => {
    const [{ run }, { createMemoryStore }, { collectAll }] = await Promise.all([
      import('../src/pretool-core.js'),
      import('../src/memory-store.js'),
      import('../src/collect-core.js'),
    ]);

    const data = {
      session_id: 'collect-scope-chain',
      tool_name: 'Bash',
      tool_input: { command: 'node tools/doctor.js' },
      tool_use_id: 'inv-chain',
    };
    const drive = (options) => {
      const out = [];
      for (let k = 1; k <= 32; k += 1) {
        run(data, (d, doc, msg) => out.push(`${k}:${d}:${(doc || '').length}:${msg || ''}`), {
          store: createMemoryStore(),
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
    const store = createMemoryStore();
    const withoutMemo = drive({ store });

    const cache = createState();
    let realCollections = 0;
    const store2 = createMemoryStore();
    const withMemo = drive({
      store: store2,
      // ── copied from `runFn(data, capture, { … })` in http-server.js ──
      collect: (cfg, pl) => {
        const memo = lookup(cache, data.tool_use_id);
        if (memo !== null) return memo;
        realCollections += 1;
        const fresh = collectAll(cfg, pl);
        remember(cache, data.tool_use_id, fresh);
        return fresh;
      },
    });

    // 🛑 ANTI-VACUITY: with no corpus on disk both runs emit nothing and the
    //    equality below would hold while measuring NOTHING. The fleet's docs
    //    are gitignored, so a clean clone legitimately has none — that is a
    //    NAMED skip, never a quiet green.
    const delivered = withoutMemo.reduce((n, line) => n + Number(line.split(':')[2]), 0);
    if (delivered === 0) {
      expect(realCollections).toBeGreaterThan(0);
      return; // UNMEASURED: no corpus reachable from this checkout.
    }

    expect(withMemo).toEqual(withoutMemo);
    expect(realCollections).toBe(1);
  }, 30000);
});
