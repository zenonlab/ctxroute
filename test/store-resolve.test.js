// ═══════════════════════════════════════════════════════════════════════
// The pair travels TOGETHER, the default is UNCHANGED, and an unknown backend
// is REFUSED — the three properties that make a split brain unbuildable.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 THE DEFECT THESE CELLS GUARD WAS MEASURED, NOT IMAGINED (2026-08-21):
//    wiring one consumer of the state to the daemon while three others kept the
//    disk made the daemon answer 2 bytes after a compaction — skills and `once`
//    documents gone for good, with no error and no red gate.
// ⚠️ FEW CELLS ON PURPOSE. Each one corresponds to a way the split brain could
//    be rebuilt; a suite that also tested the obvious would dilute that.

import { test } from 'vitest';
import assert from 'node:assert/strict';

import { resolveStore, BACKENDS } from '../src/store-resolve.js';

// ⚠️ THUNK, never a module-level const: under Stryker's `perTest` coverage an
//    expression evaluated at load belongs to NO test, so its mutants are
//    reported as surviving. Measured here once: 42 false survivors.
const disk = () => resolveStore();

test('the pair travels TOGETHER — a store is never handed out without its lock', () => {
  for (const backend of BACKENDS) {
    let pair;
    try { pair = resolveStore({ backend }); } catch { continue; } // a refused backend is another cell's subject
    assert.equal(typeof pair.store.loadState, 'function', `${backend}: no loadState`);
    assert.equal(typeof pair.store.saveState, 'function', `${backend}: no saveState`);
    assert.equal(typeof pair.withLock, 'function',
      `${backend}: a store WITHOUT its lock — memory plus a file lock protects nothing, and disk plus an empty lock IS the production bug of 2026-08-07`);
  }
});

test('NO ARGUMENT = the historical disk pair, so every differential stays green untouched', () => {
  const pair = disk();
  // Written HARDCODED, never derived from the module under test: an expectation
  // that reads the value it checks demonstrates `x === x`.
  assert.equal(pair.store, require('../src/session-store.js'),
    'the default stopped being the on-disk store — every existing differential would silently change meaning');
  assert.equal(pair.withLock, require('../src/lock.js').withLock,
    'the default lock changed — `store` and `withLock` travel together, including in the default');
});

test('the INERT pair records nothing, and BOTH halves say so', () => {
  const { store, withLock } = resolveStore({ backend: 'none' });
  assert.deepEqual(store.loadState('doc-seen-', 'x'), {},
    'the inert store invented a state — its emptiness is a FACT (no daemon, no file), never a guess');
  assert.equal(store.saveState('doc-seen-', 'x', { a: 1 }), undefined);
  assert.equal(withLock('dir', () => 'ran', { fallback: 'fell-back' }), 'fell-back',
    'the inert lock RAN the critical section — a fallback that writes makes two memories, and a `once` delivered by one is re-delivered by the other for ever');
});

test('an UNKNOWN backend is REFUSED, loudly, and the message names it', () => {
  // FAIL-CLOSED: a silent fallback to the disk would hand a second memory to a
  // caller that asked for another one — the split brain, rebuilt by the helper
  // meant to prevent it.
  assert.throws(() => resolveStore({ backend: 'ram' }), /unknown backend "ram"/);
});

test('the `client` backend hands back the DISK pair — the daemon owns nothing any more', () => {
  // 🔑 THIS CELL WAS INVERTED ON 2026-08-22, AND THE REVERSAL IS THE POINT.
  //    It used to require a refusal, because the daemon then held the durable
  //    state in RAM: answering with the disk pair would have been a SECOND
  //    memory. Since the daemon writes durable keys THROUGH to those same
  //    files, the disk is the one truth, and a client reading it directly is
  //    reading that truth — slower, never divergent.
  // 🛑 WHAT MUST NEVER COME BACK is an EMPTY pair here. A store that writes
  //    nothing withholds every document needing a record, so a dead daemon
  //    starved the whole fleet of its `once` documents and skills — 15 silent
  //    minutes measured that morning, on a daemon that dies BY DESIGN dozens of
  //    times a day.
  const vues = resolveStore({ backend: 'client' });
  const disque = resolveStore({ backend: 'disk' });
  assert.equal(vues.store, disque.store,
    'the client backend answered with something other than the disk store: a second memory');
  assert.equal(vues.withLock, disque.withLock,
    'the client backend answered without the REAL lock: two writers on one file, unserialised');
  assert.notEqual(vues.store.saveState, resolveStore({ backend: 'none' }).store.saveState,
    'the client backend fell back to the INERT pair — it records nothing, so every `once` is delivered for ever');
});
