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
import fs from 'node:fs';
import path from 'node:path';

import {
  resolveStore, BACKENDS, docLockDir, turnLockDir, lockDirForKey, TURN_KEYS, DOC_KEYS,
} from '../src/store-resolve.js';

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
  const seen = resolveStore({ backend: 'client' });
  const disk = resolveStore({ backend: 'disk' });
  assert.equal(seen.store, disk.store,
    'the client backend answered with something other than the disk store: a second memory');
  assert.equal(seen.withLock, disk.withLock,
    'the client backend answered without the REAL lock: two writers on one file, unserialised');
  assert.notEqual(seen.store.saveState, resolveStore({ backend: 'none' }).store.saveState,
    'the client backend fell back to the INERT pair — it records nothing, so every `once` is delivered for ever');
});

// ═══════════════════════════════════════════════════════════════════════
// THE LOCK CLASSES — DERIVED FROM BOTH SIDES, never a copied list
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 WHY (2026-08-23). The PreCompact purge sweeps FIVE prefixes that straddle
//    the TWO lock addresses, so it is the first caller that has to ask "which
//    lock guards this key?". A table answering that question is an ENUMERATION,
//    and an enumeration is born stale: the sixth store would be declared in the
//    purge loop, swept, and guarded by NOTHING — silently, with every suite
//    green, which is exactly the class this repository keeps paying for.
// ⚠️ SO IT IS CONFRONTED, exactly as `store-purge-gate` confronts that same loop
//    with the declared store prefixes. The loop is read the SAME way there: the
//    `for (const prefix of [...])` block, never the file's comments, which cite
//    the prefixes too and would make this cell green on a loop that forgot one.

test('every purged store prefix has a DECLARED lock class — and no class is dormant', () => {
  const source = fs.readFileSync(
    path.join(import.meta.dirname, '..', 'src', 'hooks', 'ctxroute-reset.js'), 'utf8');
  const bloc = /for\s*\(\s*const\s+prefix\s+of\s*\[([^\]]*)\]/.exec(source);
  assert.ok(bloc, 'the purge loop was not found — this cell measured NOTHING, it did not agree');
  const swept = [...bloc[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.ok(swept.length >= 5,
    `only ${swept.length} prefixes read out of the purge loop — the parse is broken`);

  const declares = [...TURN_KEYS, ...DOC_KEYS];
  assert.deepStrictEqual([...swept].sort(), [...declares].sort(),
    'THE PURGE LOOP AND THE LOCK CLASSES DISAGREE.\n'
    + `swept: ${swept.join(', ')}\ndeclared: ${declares.join(', ')}\n`
    + 'A prefix swept but unclassified is deleted under NO lock (lockDirForKey refuses it and the '
    + 'shell fails open, so that store simply survives compactions). A prefix classified but never '
    + 'swept is a dormant permit. Declare it in TURN_KEYS/DOC_KEYS, or drop it.');
});

test('lockDirForKey — the address is DERIVED from the key, and an unknown prefix is REFUSED', () => {
  // The scope is what remains once the prefix is removed: the SAME address the
  // shells compute directly, or the lock serialises nobody.
  assert.equal(lockDirForKey('doc-seen-sess-1'), docLockDir('sess-1'));
  assert.equal(lockDirForKey('remainder-sess-1'), docLockDir('sess-1'));
  assert.equal(lockDirForKey('plan-sess-1--inv-9'), docLockDir('sess-1--inv-9'));
  assert.equal(lockDirForKey('turn-count-sess-1'), turnLockDir('sess-1'));
  assert.notEqual(lockDirForKey('doc-seen-s'), lockDirForKey('turn-count-s'),
    'the two classes collapsed onto ONE address — every frame would queue behind the turn counter');
  assert.throws(() => lockDirForKey('unknown-store-sess-1'), /no lock class declared/,
    'an undeclared prefix was silently given an address: guessing one is how a SECOND lock is born');
});
