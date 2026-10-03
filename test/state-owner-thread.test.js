// state-owner-thread — ONE MEMORY, ASKED FROM ANOTHER THREAD, ANSWERING
// EXACTLY WHAT THE SAME CALL WOULD ANSWER IN LINE.
//
// 🔑 THE ONE QUESTION THIS SUITE EXISTS TO ANSWER, and it is the acceptance
//    criterion of step ② of the multi-core direction: *a table operation
//    emitted by another thread returns exactly what the same call returns in
//    line* — same pure module on both sides, never a second dialect.
//
// 🛑 THE CONTROL ARM IS WHAT MAKES IT A PROOF. A green obtained by comparing
//    a routed sequence against a routed sequence would prove nothing at all, so
//    cell ⑥ runs the SAME sequence against tables that are NOT shared — the
//    world before this work — and REQUIRES the answers to differ. Without that
//    arm, an owner that quietly held one table per client would be green.
//
// 🔴 THE TRAP THE PROBE OF 2026-09-19 PAID TEN MINUTES FOR: a bare
//    `Atomics.wait` blocks for ever on one missed wake-up. Every wait in the
//    code under test is BOUNDED and RE-CHECKS, and cell ⑤ proves the ceiling
//    actually refuses instead of hanging — a suite that could hang here would
//    be the same defect, moved into the judge.

import { test, describe } from 'vitest';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';

import channel from '../src/thread-channel-pure.js';
import ownerOps from '../src/owner-ops.js';
import memoryPure from '../src/memory-store-pure.js';
import { createOwner } from '../src/hooks/state-owner-thread.js';
import { createClient } from '../src/hooks/owner-client.js';
import frameSequencer from '../src/frame-sequencer-pure.js';
import deliveryNotice from '../src/delivery-notice-pure.js';
import carryover from '../src/carryover-pure.js';
import pool from '../src/worker-pool-pure.js';
import { createMemoryStore } from '../src/memory-store.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BOOT = path.join(ROOT, 'src', 'hooks', 'thread-boot.js');

// A throwaway state directory PER WORKER. There is no test mode in the owner
// shell, deliberately: a cell points the declared address at a fresh directory
// and drives the REAL construction path, snapshot and lock included.
function freshStateDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-owner-state-'));
}

/**
 * A fresh set of live tables plus a pure-memory store — exactly what the owner
 * thread owns in production, minus the disk.
 */
function freshOps() {
  return ownerOps.createOps({
    sequencer: frameSequencer.createState(),
    notice: deliveryNotice.createState(),
    carryover: carryover.createState(),
    store: createMemoryStore({}),
  });
}

/** Allocate a channel of `clients` slots, with a small payload region. */
function allocate(clients, slotBytes = 4096) {
  const control = new Int32Array(new SharedArrayBuffer(channel.controlLength(clients) * 4));
  const payload = new Uint8Array(new SharedArrayBuffer(channel.payloadLength(clients, slotBytes)));
  return { control, payload, clients, slotBytes };
}

/**
 * THE SCRIPT both arms replay. It exercises every wire operation, in an order
 * where ARRIVAL matters — which is the whole point: the sequencer and the
 * carryover answer a different thing on the second ask than on the first, so a
 * routed sequence that kept its own table would diverge immediately.
 */
const SCRIPT = [
  ['tables.nextIndex', ['inv-a', 1, 4]],
  ['tables.nextIndex', ['inv-a', 7, 4]],
  ['tables.notice', ['inv-a', 2, 4]],
  ['tables.observe', ['scope-1', 'inv-a', 2, 4]],
  ['tables.isHarvested', ['inv-a']],
  ['tables.pendingFor', ['scope-1', 'inv-b']],
  ['tables.markHarvested', ['inv-a']],
  ['tables.isHarvested', ['inv-a']],
  ['tables.pendingFor', ['scope-1', 'inv-b']],
  ['store.saveState', ['plan-', 'k1', { segments: [{ id: 'd#1/2', text: 'hello' }] }]],
  ['store.loadState', ['plan-', 'k1']],
  ['store.loadState', ['plan-', 'k1']],
  ['tables.nextIndex', ['inv-a', 1, 4]],
  ['store.purge', ['plan-']],
  ['store.loadState', ['plan-', 'k1']],
];

describe('the wire layout is decidable, and a nonsense shape is refused by name', () => {
  test('① slots, offsets and lengths are addressable exactly when the pair is', () => {
    assert.equal(channel.controlLength(2), channel.HEADER + 4);
    assert.equal(channel.controlLength(0), 0, 'zero clients is not a channel');
    assert.equal(channel.controlLength(channel.MAX_CLIENTS + 1), 0, 'above the ceiling is refused');
    assert.equal(channel.controlLength('2'), 0, 'a string is not a count');
    assert.equal(channel.stateIndex(2, 0), channel.HEADER);
    assert.equal(channel.stateIndex(2, 1), channel.HEADER + 1);
    assert.equal(channel.stateIndex(2, 2), -1, 'a slot past the last client is not addressable');
    assert.equal(channel.stateIndex(2, -1), -1);
    assert.equal(channel.lengthIndex(2, 1), channel.HEADER + 3);
    assert.equal(channel.lengthIndex(2, 9), -1);
    assert.equal(channel.payloadOffset(2, 1, 16), 16);
    assert.equal(channel.payloadOffset(2, 1, 0), -1, 'a zero slot size addresses nothing');
    assert.equal(channel.payloadLength(2, 16), 32);
    assert.equal(channel.payloadLength(0, 16), 0);
    assert.equal(channel.payloadLength(2, -3), 0);
    // ⚠️ A NONSENSE OVERRIDE IS 0, NEVER THE PRODUCTION DEFAULT: falling back
    //    would hand a cell that asked for a tiny channel the real one, and its
    //    overflow arm would then be measuring nothing.
    assert.equal(channel.slotSize(undefined), channel.SLOT_BYTES);
    assert.equal(channel.slotSize(null), channel.SLOT_BYTES, 'an absent override is absent either way');
    assert.equal(channel.slotSize(1.5), 0);
    // 🛑 THE BOUNDARIES THEMSELVES, because a comparator is decided at its edge
    //    and nowhere else: one byte is a usable slot, the ceiling is a usable
    //    count, and one past the ceiling is not.
    assert.equal(channel.slotSize(1), 1, 'a one-byte slot is a slot');
    assert.equal(channel.slotSize(0), 0);
    assert.equal(channel.controlLength(1), channel.HEADER + 2, 'one client is a channel');
    assert.equal(channel.controlLength(channel.MAX_CLIENTS), channel.HEADER + channel.MAX_CLIENTS * 2,
      'the ceiling is REACHABLE — refusing AT it would deny the pool its last slot');
    assert.equal(channel.payloadLength(channel.MAX_CLIENTS + 1, 16), 0,
      'an unaddressable count buys no payload region either');
    assert.equal(channel.payloadOffset(2, 0, 16), 0, 'the first client starts at the beginning');
    assert.equal(channel.stateIndex(2, 1.5), -1, 'a fractional slot is not a slot');
    assert.equal(channel.lengthIndex(1, 0), channel.HEADER + 1,
      'the length word sits one CLIENT COUNT further, not one word further');
    assert.equal(channel.lengthIndex(3, 0), channel.HEADER + 3);
    // 🛑 THE BRANCH THAT REFUSES ON THE **CLIENT COUNT**, which every earlier
    //    line reached with a valid one: without it, the whole guard could be
    //    deleted and nothing here would notice.
    assert.equal(channel.stateIndex(0, 0), -1, 'no channel, no slot');
    assert.equal(channel.stateIndex(channel.MAX_CLIENTS + 1, 0), -1);
    assert.equal(channel.payloadOffset(2, 9, 16), -1, 'an unaddressable slot has no region');
    assert.equal(channel.payloadOffset(0, 0, 16), -1);
    // ⚠️ THE DEFAULT IS A VALUE WRITTEN HERE, never read back from the module —
    //    an expectation that consults the code under test proves `x === x`.
    assert.equal(channel.defaultSlotBytes(), 4194304, 'four mebibytes, and the arithmetic says so');
    assert.equal(channel.SLOT_BYTES, channel.defaultSlotBytes());
  });

  test('② an oversized payload is a NAMED refusal carrying both numbers', () => {
    assert.equal(channel.fits(10, 16).ok, true);
    assert.equal(channel.fits(16, 16).ok, true, 'exactly full still fits');
    const over = channel.fits(17, 16);
    assert.equal(over.ok, false);
    assert.match(over.refusal, /17 byte/);
    assert.match(over.refusal, /16/);
    assert.equal(channel.fits(-1, 16).ok, false);
    assert.equal(channel.fits(3.5, 16).ok, false);
    assert.equal(channel.fits(1, 0).ok, false);
    assert.equal(channel.fits(0, 16).ok, true, 'an empty payload is a payload');
    assert.equal(channel.fits(15, 16).ok, true, 'one short of full still fits');
    assert.equal(channel.fits('10', 16).ok, false, 'a string length is not a length');
    // 🛑 THE DETAIL OF A REFUSAL IS CONTRACT, NOT DECORATION. Asserting only
    //    `ok === false` lets an EMPTY message through — and worse, it cannot
    //    tell "the slot is unusable" from "the payload is too big", which are
    //    two different repairs for whoever reads the line.
    assert.match(channel.fits(1, 0).refusal, /slot size is not a positive integer/);
    assert.match(channel.fits(3.5, 16).refusal, /non-negative integer/);
    assert.match(channel.fits(3.5, 16).refusal, /3\.5/, 'the refusal shows what arrived');
    assert.match(over.refusal, /Nothing is truncated/);
    assert.match(over.refusal, /half a plan reads exactly like a whole one/);
    assert.match(over.refusal, /the class this repository refuses/);
    assert.match(over.refusal, /SLOT_BYTES/, 'it names what to raise');
    assert.equal(channel.fits(10, 16).refusal, null, 'an accepted payload carries no refusal');
  });

  test('③ the bounded wait stops, and it stops on the ceiling it was given', () => {
    assert.equal(channel.keepWaiting(0, 10), true);
    assert.equal(channel.keepWaiting(9, 10), true);
    assert.equal(channel.keepWaiting(10, 10), false, 'the ceiling is not a suggestion');
    assert.equal(channel.keepWaiting(11, 10), false);
    assert.equal(channel.keepWaiting(Number.NaN, 10), false, 'an unmeasurable elapsed never waits on');
    assert.equal(channel.keepWaiting(1, undefined), true, 'the default ceiling is the module constant');
    assert.equal(channel.keepWaiting(channel.WAIT_CEILING_MS, undefined), false);
    // ⚠️ A NONSENSE CEILING FALLS BACK TO THE MODULE'S, and the fallback must be
    //    the CEILING and not "wait for ever": each of these would otherwise be a
    //    silent freeze wearing the shape of a bound.
    assert.equal(channel.keepWaiting(1, 0), true, 'a zero ceiling is not a ceiling');
    assert.equal(channel.keepWaiting(channel.WAIT_CEILING_MS, 0), false);
    assert.equal(channel.keepWaiting(1, -5), true, 'a negative ceiling is not a ceiling');
    assert.equal(channel.keepWaiting(1, 2.5), true, 'a fractional ceiling is not a ceiling');
    assert.equal(channel.keepWaiting(1, '10'), true, 'a string ceiling is not a ceiling');
    assert.equal(channel.keepWaiting(Number.POSITIVE_INFINITY, 10), false,
      'an infinite elapsed is not a measurement — it never waits on');
    assert.equal(channel.keepWaiting('1', 10), false, 'a string elapsed is not a measurement');
  });
});

describe('the owner serves what is posted, and refuses what it cannot do', () => {
  /** Post a request into slot `i` by hand, exactly as the client would. */
  function post(wire, i, op, args) {
    const bytes = new TextEncoder().encode(JSON.stringify({ op, args }));
    wire.payload.set(bytes, channel.payloadOffset(wire.clients, i, wire.slotBytes));
    Atomics.store(wire.control, channel.lengthIndex(wire.clients, i), bytes.length);
    Atomics.store(wire.control, channel.stateIndex(wire.clients, i), channel.REQUEST);
  }
  /** Read back whatever the owner left in slot `i`. */
  function read(wire, i) {
    const offset = channel.payloadOffset(wire.clients, i, wire.slotBytes);
    const length = Atomics.load(wire.control, channel.lengthIndex(wire.clients, i));
    return {
      state: Atomics.load(wire.control, channel.stateIndex(wire.clients, i)),
      text: new TextDecoder().decode(wire.payload.subarray(offset, offset + length)),
    };
  }

  test('④ every posted slot is answered in one pump, and a write moves the generation', () => {
    const wire = allocate(3);
    const owner = createOwner({ ...wire, ops: freshOps() });
    post(wire, 0, 'tables.nextIndex', ['inv', 1, 4]);
    post(wire, 2, 'store.saveState', ['plan-', 'k', { a: 1 }]);
    const before = Atomics.load(wire.control, channel.GENERATION);
    assert.equal(owner.pump(), 2, 'both posted slots served, the idle one untouched');
    assert.equal(read(wire, 0).state, channel.RESPONSE);
    assert.equal(JSON.parse(read(wire, 0).text).value, 1);
    assert.equal(read(wire, 1).state, channel.IDLE, 'an idle slot is never written');
    assert.equal(
      Atomics.load(wire.control, channel.GENERATION), before + 1,
      'a WRITE moves the generation — that is the only thing that lets a client memoise a read',
    );
    assert.equal(owner.pump(), 0, 'an answered slot is not answered twice');
  });

  test('⑤ an unknown operation is answered as a FAILURE, never left pending', () => {
    const wire = allocate(1);
    const owner = createOwner({ ...wire, ops: freshOps() });
    post(wire, 0, 'tables.deleteEverything', []);
    assert.equal(owner.pump(), 1);
    const answer = read(wire, 0);
    // 🛑 A SLOT LEFT IN `REQUEST` WOULD BLOCK ITS CLIENT UNTIL THE CEILING —
    //    thirty seconds to learn nothing. It is answered, and the answer names
    //    the closed vocabulary.
    assert.equal(answer.state, channel.FAILURE);
    assert.match(answer.text, /unknown operation/);
    assert.match(answer.text, /tables\.nextIndex/, 'the refusal names what IS available');
  });

  test('⑥ an answer too big for the slot is a refusal, never a truncation', () => {
    const wire = allocate(1, 200);
    const ops = freshOps();
    ops.store.saveState('plan-', 'big', { text: 'x'.repeat(500) });
    const owner = createOwner({ ...wire, ops });
    post(wire, 0, 'store.loadState', ['plan-', 'big']);
    owner.pump();
    const answer = read(wire, 0);
    assert.equal(answer.state, channel.FAILURE);
    assert.match(answer.text, /does not fit/);
  });

  test('⑦ a store operation routed to an owner holding no store is refused by NAME', () => {
    const ops = ownerOps.createOps({
      sequencer: frameSequencer.createState(),
      notice: deliveryNotice.createState(),
      carryover: carryover.createState(),
      store: null,
    });
    // 🛑 NOT AN EMPTY ANSWER: `{}` is indistinguishable from a session that has
    //    delivered nothing, which re-delivers every `once` without a word.
    assert.throws(() => ops.store.loadState('doc-seen-', 's'), /holds no store/);
    // ⚠️ THE TABLE HALF STILL WORKS — that is the shape `handle` builds when a
    //    caller drives it with a bare `deps`, and it must stay today's behaviour.
    assert.equal(ops.tables.nextIndex('inv', 3, 4), 1);
  });
});

describe('STAMPS — a reader can ask "still the same?" for a few bytes', () => {
  // 🔴 WHY THESE CELLS ARE IN PROCESS AND THE ROUTED ONES ARE NOT ENOUGH:
  //    Stryker cannot see coverage produced inside a WORKER THREAD, so a rule
  //    exercised only through the routed path ships MEASURED BY NOTHING —
  //    `owner-ops` read **68.83 %, 16 mutants with no coverage** the first time
  //    the stamps were mutated. The routed cells prove the WIRING; these prove
  //    the LOGIC, where a mutant can be watched dying.

  test('⑫ an unknown key stamps 0 — an absence REFUSES to match, it never agrees', () => {
    const ops = freshOps();
    assert.equal(ops.store.stampOf('plan-', 'never-written'), 0);
  });

  test('⑬ a write stamps the key, and REWRITING it stamps it differently', () => {
    const ops = freshOps();
    ops.store.saveState('plan-', 'inv', { v: 1 });
    const first = ops.store.stampOf('plan-', 'inv');
    assert.ok(first > 0, 'a written key still stamps 0: a reader would keep a stale memo for ever');
    ops.store.saveState('plan-', 'inv', { v: 2 });
    const second = ops.store.stampOf('plan-', 'inv');
    assert.notEqual(second, first, 'the stamp did not move on a rewrite — that IS the second memory');
    assert.ok(second > first, 'the stamp must be MONOTONE: a value that can come back is the ABA problem');
  });

  test('⑭ two keys have two stamps — the key is part of the identity', () => {
    const ops = freshOps();
    ops.store.saveState('plan-', 'a', { v: 1 });
    ops.store.saveState('plan-', 'b', { v: 1 });
    assert.notEqual(ops.store.stampOf('plan-', 'a'), ops.store.stampOf('plan-', 'b'),
      'two keys share one stamp: a write to one would silence the memo of the other, or worse');
    // ⚠️ AND THE PREFIX TOO — `plan-x` and `doc-seen-x` are two keys.
    ops.store.saveState('doc-seen-', 'a', { v: 1 });
    assert.notEqual(ops.store.stampOf('plan-', 'a'), ops.store.stampOf('doc-seen-', 'a'),
      'the prefix is not part of the identity: two classes would collide on one stamp');
  });

  test('⑮ a purge FORGETS the stamps it removed, and the next write is stamped ANEW', () => {
    const ops = freshOps();
    ops.store.saveState('plan-', 'inv', { v: 1 });
    ops.store.saveState('doc-seen-', 'sess', { d: true });
    const held = ops.store.stampOf('plan-', 'inv');
    const foreign = ops.store.stampOf('doc-seen-', 'sess');

    ops.store.purge('plan-');
    assert.equal(ops.store.stampOf('plan-', 'inv'), 0,
      'a purged key kept its stamp: a reader holding it would answer a value that no longer exists');
    assert.equal(ops.store.stampOf('doc-seen-', 'sess'), foreign,
      'the purge took a stamp it was not asked for: the prefix is the scope, exactly as for the store');

    // 🛑 THE ABA CASE, AND IT IS THE REASON THE TICK IS MONOTONE: after a purge a
    //    fresh write must NOT hand back a stamp somebody is still holding.
    ops.store.saveState('plan-', 'inv', { v: 9 });
    assert.ok(ops.store.stampOf('plan-', 'inv') > Math.max(held, foreign),
      'the stamp after a purge is not GREATER than the one a reader may still hold: a tick that '
      + 'can go backwards hands the same number twice, which is the ABA problem this design refuses');
  });

  test('⑯ the stamp map is BOUNDED by what the store can hold, and the eviction is watched happening', () => {
    // ⚠️ ANTI-VACUITY OF THE CEILING: a bound nobody crosses is a bound nobody
    //    has seen work. The REAL bound is crossed here — it is derived from the
    //    store's own ceilings, so there is no test-only seam to get wrong.
    // 🔑 THE COUNT IS EXACT ON PURPOSE, AND THAT IS WHAT MAKES THE CELL SHARP.
    //    At ceiling+1 writes, a bound of 6,144 and a bound of 2,048 BOTH evict
    //    the first key — the cell could not tell them apart, and a mutant that
    //    changes the bound survived. Filling to EXACTLY the ceiling must keep
    //    everything; the very next write must drop the oldest and nothing else.
    const ops = freshOps();
    const ceiling = memoryPure.MAX_SCOPES + memoryPure.MAX_EPHEMERAL;
    ops.store.saveState('plan-', 'first', { v: 1 });
    for (let i = 0; i < ceiling - 1; i += 1) ops.store.saveState('plan-', `k${i}`, { v: 1 });
    assert.ok(ops.store.stampOf('plan-', 'first') > 0,
      'the oldest stamp was evicted AT the ceiling: the map holds less than the store it mirrors, '
      + 'so a reader re-fetches values that were never in danger');

    ops.store.saveState('plan-', 'one-too-many', { v: 1 });
    assert.equal(ops.store.stampOf('plan-', 'first'), 0,
      'the oldest stamp survived PAST the ceiling: the map grows for the life of the daemon');
    assert.ok(ops.store.stampOf('plan-', 'one-too-many') > 0,
      'the NEWEST stamp was evicted instead of the oldest: the eviction is upside down');
    // 🔑 AND THE DEGRADATION IS SAFE: a forgotten stamp reads 0, which matches
    //    nothing, so the reader pays a full round trip — bytes, never a wrong answer.
  });

  test('⑰ the operation is reachable through the CLOSED vocabulary, by its exact name', () => {
    // 🛑 IT WAS EXERCISED ONLY THROUGH A WORKER, WHERE STRYKER SEES NOTHING, so
    //    the name in `OP_NAMES` was a literal no mutant could kill. The wire
    //    dispatch is fail-closed on that list: a wrong name must REFUSE.
    const ops = freshOps();
    ops.store.saveState('plan-', 'inv', { v: 1 });
    assert.ok(ownerOps.apply(ops, 'store.stampOf', ['plan-', 'inv']) > 0,
      'the wire cannot reach the stamp: a routed reader would never revalidate, only re-send');
    assert.throws(() => ownerOps.apply(ops, 'store.stampOff', ['plan-', 'inv']), /unknown operation/,
      'a near-miss name went through: the vocabulary is not closed');
  });
});

describe('ROUTED THROUGH A REAL THREAD, THE ANSWERS ARE THE IN-LINE ANSWERS', () => {
  /** The oracle: the same script, run in line, on one set of tables. */
  function inLine(script) {
    const ops = freshOps();
    return script.map(([op, args]) => ownerOps.apply(ops, op, args));
  }

  test('⑧ a real owner THREAD answers the whole script exactly as the in-line call does', async () => {
    const wire = allocate(2, 64 * 1024);
    const worker = new Worker(BOOT, {
      workerData: {
        role: 'owner',
        control: wire.control.buffer,
        payload: wire.payload.buffer,
        clients: wire.clients,
        slotBytes: wire.slotBytes,
      },
      env: { ...process.env, CTXROUTE_STATE_DIR: freshStateDir() },
    });
    // 🛑 NO TIMER ANYWHERE IN THIS CELL. The client's own bounded wait is what
    //    ends a dead owner, and the suite's timeout is what ends a dead worker.
    //    A delay here would be a second, weaker verdict on the same question.
    try {
      const client = createClient({
        control: wire.control,
        payload: wire.payload,
        clients: wire.clients,
        index: 0,
        slotBytes: wire.slotBytes,
      });
      const routed = SCRIPT.map(([op, args]) => {
        const dot = op.indexOf('.');
        const group = op.slice(0, dot) === 'tables' ? client.tables : client.store;
        return group[op.slice(dot + 1)](...args);
      });
      assert.deepEqual(routed, inLine(SCRIPT), 'routing must not change a single answer');
      // ⚠️ ANTI-VACUITY: a script that never crossed the wire would pass this
      //    comparison trivially. It crossed once per operation, minus the reads
      //    the generation allowed to be memoised.
      const stats = client.stats();
      assert.ok(stats.roundTrips >= SCRIPT.length - 1, `the wire carried ${stats.roundTrips} round trips`);
      assert.equal(stats.memoHits, 1, 'the second read of an unwritten key is served from the memo');
    } finally {
      Atomics.store(wire.control, channel.SHUTDOWN, 1);
      Atomics.notify(wire.control, channel.DOORBELL);
      await worker.terminate();
    }
  }, 30000);

  test('⑨ CONTROL — tables that are NOT shared answer differently, so cell ⑧ discriminates', () => {
    // 🔴 THIS IS THE WORLD BEFORE THIS WORK: one set of tables per participant.
    //    If the comparison in ⑧ could not tell the two apart, it would be green
    //    on the very defect it exists to forbid.
    const perClient = [freshOps(), freshOps()];
    const split = SCRIPT.map(([op, args], i) => ownerOps.apply(perClient[i % 2], op, args));
    assert.notDeepEqual(split, inLine(SCRIPT),
      'a sequence spread over two private tables MUST diverge from the shared one');
  });

  test('⑩ a WRITE drops the memo — a repeated read after it crosses the wire again', async () => {
    const wire = allocate(1, 64 * 1024);
    const worker = new Worker(BOOT, {
      workerData: {
        role: 'owner',
        control: wire.control.buffer,
        payload: wire.payload.buffer,
        clients: wire.clients,
        slotBytes: wire.slotBytes,
      },
      env: { ...process.env, CTXROUTE_STATE_DIR: freshStateDir() },
    });
    try {
      const client = createClient({
        control: wire.control,
        payload: wire.payload,
        clients: wire.clients,
        index: 0,
        slotBytes: wire.slotBytes,
      });
      client.store.saveState('plan-', 'k', { v: 1 });
      assert.deepEqual(client.store.loadState('plan-', 'k'), { v: 1 });
      const afterFirstRead = client.stats().roundTrips;
      assert.deepEqual(client.store.loadState('plan-', 'k'), { v: 1 });
      assert.equal(client.stats().roundTrips, afterFirstRead, 'an unchanged read is memoised');
      // 🔑 THE WRITE IS WHAT MUST BREAK IT. A memo that survived a write would
      //    be a SECOND MEMORY — it would answer where the owner would have
      //    answered differently, which is the whole defect this design removes.
      client.store.saveState('plan-', 'k', { v: 2 });
      assert.deepEqual(client.store.loadState('plan-', 'k'), { v: 2 },
        'the value after a write is the WRITTEN one, never the memoised one');
      assert.ok(client.stats().roundTrips > afterFirstRead + 1, 'the read crossed the wire again');
    } finally {
      Atomics.store(wire.control, channel.SHUTDOWN, 1);
      Atomics.notify(wire.control, channel.DOORBELL);
      await worker.terminate();
    }
  }, 30000);

  // ═══════════════════════════════════════════════════════════════════════
  // ⑪ A FOREIGN WRITE NO LONGER RE-SENDS A VALUE THAT DID NOT CHANGE
  // ═══════════════════════════════════════════════════════════════════════
  // 🔴 THE DEFECT THIS CELL GUARDS WAS MEASURED, NOT IMAGINED (2026-09-20). The
  //    client memo was dropped WHOLE on every generation bump, and in production
  //    every frame writes: driven through a REAL owner thread with the live
  //    interleaving — 32 frames, each READING the plan then WRITING its
  //    `doc-seen-` — the reading was **0 memo hits out of 32**, the plan
  //    crossing **32 times, 9.78 MB per action**. The memo never once answered.
  //    After the stamp: **28 hits of 32, 4 crossings, 1.22 MB**, wall time for
  //    the action 82.8 ms → 41.9 ms.
  // 🛑 IT IS THE EXACT COMPLEMENT OF ⑩ AND BOTH MUST HOLD AT ONCE: ⑩ says a
  //    write to THIS key is seen, ⑪ says a write to ANOTHER key is not paid for.
  //    Keeping only ⑩ is what made the memo inert; keeping only ⑪ would be the
  //    second memory the whole design removes.
  test('⑪ a write to ANOTHER key does not make an unchanged value cross again', async () => {
    const wire = allocate(2, 64 * 1024);
    const worker = new Worker(BOOT, {
      workerData: {
        role: 'owner',
        control: wire.control.buffer,
        payload: wire.payload.buffer,
        clients: wire.clients,
        slotBytes: wire.slotBytes,
      },
      env: { ...process.env, CTXROUTE_STATE_DIR: freshStateDir() },
    });
    try {
      const client = createClient({
        control: wire.control,
        payload: wire.payload,
        clients: wire.clients,
        index: 0,
        slotBytes: wire.slotBytes,
      });
      client.store.saveState('plan-', 'inv', { v: 1 });
      client.store.loadState('plan-', 'inv');          // fills the memo
      const before_ = client.stats().memoHits;

      // A write to a DIFFERENT key: the generation moves, this key does not.
      client.store.saveState('doc-seen-', 'sess', { d: true });
      const again = client.store.loadState('plan-', 'inv');

      assert.deepEqual(again, { v: 1 }, 'the answer must still be the stored one');
      assert.equal(client.stats().memoHits, before_ + 1,
        'the value crossed again although nothing had written THAT key: the memo is inert, '
        + 'which is the 9.78 MB per action measured on 2026-09-20');

      // ⚠️ ANTI-VACUITY — without this, the cell would pass on a client that
      //    memoises everything for ever, i.e. on the unsafe version the suite
      //    already refused once.
      client.store.saveState('plan-', 'inv', { v: 2 });
      assert.deepEqual(client.store.loadState('plan-', 'inv'), { v: 2 },
        'a write to THIS key was answered from the memo: that is a second memory');
    } finally {
      await worker.terminate();
    }
  });
});

test('11 DRIFT-TEST: the two bootstraps carry the SAME interception, byte for byte', () => {
  // 🔑 THIS DUPLICATION IS STRUCTURALLY REQUIRED, WHICH IS WHY IT GETS A JUDGE
  //    INSTEAD OF AN EXTRACTION. `http-daemon.js` and `thread-boot.js` both arm
  //    the module-source recorder, and neither may `require` a shared helper to
  //    do it: that helper would be COMPILED BEFORE the hook exists, hence
  //    unrecorded, hence a module nobody vouches for — which is the exact hole
  //    this bootstrap exists to close. An ASSUMED duplication is guarded by a
  //    drift-test, never by a comment.
  // 🔴 AND THE STAKE IS NOT STYLE: a worker is its own V8 isolate and compiles
  //    its own copy of every module, so a thread whose recorder drifted would
  //    vouch for bytes it never ran, or report zero verified modules and refuse
  //    every request while its sockets look perfectly bound.
  const read = (rel) => fs.readFileSync(path.join(ROOT, 'src', 'hooks', rel), 'utf8');
  const interception = (text) => {
    const start = text.indexOf('const recorded = new Map();');
    const end = text.indexOf("require('../stale-code').adopt(recorded);");
    assert.notStrictEqual(start, -1, 'the recorder map is gone from a bootstrap');
    assert.notStrictEqual(end, -1, 'the adoption is gone from a bootstrap');
    assert.ok(end > start, 'the map must be armed BEFORE the recorder adopts it');
    return text.slice(start, end).replace(/\/\/[^\n]*/g, '').replace(/\s+/g, ' ').trim();
  };
  const daemon = interception(read('http-daemon.js'));
  const thread = interception(read('thread-boot.js'));
  // ⚠️ ANTI-VACUITY: an empty extraction would compare two empty strings.
  assert.ok(daemon.includes('_compile') && daemon.length > 120,
    `the extracted interception looks empty: ${JSON.stringify(daemon)}`);
  assert.equal(thread, daemon,
    'the two bootstraps must arm the SAME interception — comments and spacing aside');
});

test('12 THE FULL POOL IS ADDRESSABLE — the ceiling is the workers PLUS the main thread', () => {
  // 🔴 FOUND BY A BENCH ON 2026-09-20, NOT BY A TEST, AND IT WAS A REAL DEFECT:
  //    the channel ceiling was written as the literal 8, "the same number as the
  //    worker ceiling". It is NOT the same number — the MAIN THREAD holds slot 0
  //    for the rendezvous lane — so `workers: 8`, a value the schema accepts and
  //    `poolSize` returns without a word, made the daemon REFUSE TO START. Loud,
  //    never silent, and still a declared capability nobody actually had.
  // 🛑 THE RELATION IS ASSERTED, NEVER THE NUMBER: writing 9 here would agree
  //    with the code and with nothing else, which is how the first version was
  //    wrong while looking right.
  assert.equal(channel.MAX_CLIENTS, pool.MAX_WORKERS + 1,
    'one slot per worker, plus one for the main thread which asks like everybody else');
  assert.notEqual(channel.controlLength(pool.MAX_WORKERS + 1), 0,
    'a full pool plus the main thread MUST be addressable');
  assert.notEqual(channel.stateIndex(pool.MAX_WORKERS + 1, pool.MAX_WORKERS), -1,
    'the LAST worker of a full pool must have a slot to talk on');
  assert.equal(channel.controlLength(pool.MAX_WORKERS + 2), 0,
    'and one past that is still refused — the ceiling did not simply move up');
});

// ═══════════════════════════════════════════════════════════════════════
// THE WIRE CONTRACT OF `owner-ops`, IN PROCESS (2026-10-01)
// ═══════════════════════════════════════════════════════════════════════
// 🔴 `owner-ops.js` stood at 91.03 % for its whole life against a floor of 100:
//    the refusals' wording, the closed vocabulary's spelling, the invalidation
//    list and the "args is not an array" branch were exercised by nobody that
//    Stryker can see (it is blind to coverage produced inside a worker thread).
//    These cells drive `apply`/`createOps` directly; every expected string is
//    COPIED from the source, never rebuilt from the module under test.
describe('WIRE CONTRACT — refusals, vocabulary, invalidation, arguments', () => {
  test('a store operation on an owner WITHOUT a store is a NAMED refusal, never an empty answer', () => {
    const ops = ownerOps.createOps({
      sequencer: frameSequencer.createState(),
      notice: deliveryNotice.createState(),
      carryover: carryover.createState(),
      store: null,
    });
    assert.throws(() => ops.store.loadState('doc-seen-', 's'), (e) => {
      assert.equal(e.message, 'owner-ops: a store operation was routed to an owner that holds no store. '
        + 'Nothing is assumed: an empty answer here is indistinguishable from a session that has '
        + 'delivered nothing, which re-delivers every `once` document without a word.');
      return true;
    });
  });

  test('a NON-STRING name is refused as such, with the vocabulary', () => {
    assert.throws(() => ownerOps.apply(freshOps(), 42, []), (e) => {
      assert.equal(e.message, 'owner-ops: an operation name must be a string, got number. '
        + 'The wire vocabulary is closed: tables.nextIndex, tables.notice, tables.isHarvested, '
        + 'tables.observe, tables.pendingFor, tables.markHarvested, store.loadState, store.saveState, '
        + 'store.purge, store.stampOf.');
      return true;
    });
  });

  test('an UNKNOWN name is refused, quoted, with the vocabulary spelled out', () => {
    assert.throws(() => ownerOps.apply(freshOps(), 'store.nope', []), (e) => {
      assert.equal(e.message, 'owner-ops: unknown operation "store.nope". '
        + 'The wire vocabulary is closed: tables.nextIndex, tables.notice, tables.isHarvested, '
        + 'tables.observe, tables.pendingFor, tables.markHarvested, store.loadState, store.saveState, '
        + 'store.purge, store.stampOf.');
      return true;
    });
  });

  test('the invalidation and cache lists are a CONTRACT (written by hand)', () => {
    assert.deepEqual([...ownerOps.INVALIDATES], ['store.saveState', 'store.purge'],
      'a write or a purge that does not invalidate leaves a client serving a STALE memo — a second memory');
    assert.deepEqual([...ownerOps.CACHEABLE], ['store.loadState']);
  });

  test('arguments that are not an array reach the operation as NO arguments, never as junk', () => {
    const seen = [];
    const ops = { tables: {}, store: { loadState: (...a) => { seen.push(a.length); return 'ok'; } } };
    assert.equal(ownerOps.apply(ops, 'store.loadState', 'not-an-array'), 'ok');
    assert.equal(ownerOps.apply(ops, 'store.loadState', undefined), 'ok');
    assert.deepEqual(seen, [0, 0], 'a malformed argument list must be dropped, never spread into the call');
  });
});
