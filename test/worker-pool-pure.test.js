// worker-pool-pure — HOW MANY THREADS, AND WHICH WORK MAY LEAVE THE LOOP.
//
// 🛑 WHAT MUST BE PROVEN HERE IS NOT "the arithmetic is right". Every branch of
//    this module decides something an operator will never see happen: a pool
//    that silently fails to start, a declaration quietly ignored, a piece of
//    work dispatched when it should have stayed on the loop. So the cells below
//    spend most of their effort on the REFUSALS and on the fail-safe direction.
// ⚠️ DIRECT, STATIC import of the mutated module — never `createRequire`, never
//    a re-export: the perTest coverage mapping misses tests reached that way and
//    yields phantom survivors, and `mutation-workflow-gate` refuses it outright.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import * as pool from '../src/worker-pool-pure.js';

test('① an ABSENT declaration starts no pool, and that is not an error', () => {
  for (const nothing of [undefined, null]) {
    const out = pool.poolSize(nothing, 12);
    assert.deepEqual(out, { size: pool.NONE, refusal: null },
      'an operator who declared nothing must get today\'s behaviour, silently: a capability that '
      + 'arrives switched on changes production for people who never asked for it');
  }
  // The contract value is written HARDCODED: deriving it from the module would
  // prove `x === x` and the mutant would be invisible.
  assert.equal(pool.NONE, 0);
  assert.equal(pool.MAX_WORKERS, 8);
});

test('② `auto` is HALF the cores, bounded at both ends', () => {
  assert.equal(pool.resolveAuto(12), 6, 'twelve cores must leave half the machine to the agents');
  assert.equal(pool.resolveAuto(4), 2);
  assert.equal(pool.resolveAuto(2), 1);
  // 🛑 NEVER ZERO: `auto` means "decide for me", and answering "no pool" would
  //    silently ignore a declaration the operator did write.
  assert.equal(pool.resolveAuto(1), 1, 'a single-core machine still gets ONE worker, never none');
  assert.equal(pool.resolveAuto(64), pool.MAX_WORKERS, 'a big machine is capped, not obeyed');
  for (const nonsense of [0, -4, 1.5, '12', null, undefined, NaN]) {
    assert.equal(pool.resolveAuto(nonsense), 1,
      `cores=${String(nonsense)}: an unreadable machine still gets one worker`);
  }
});

test('③ a declared NUMBER is obeyed, including the explicit zero', () => {
  assert.deepEqual(pool.poolSize(4, 12), { size: 4, refusal: null });
  assert.deepEqual(pool.poolSize(pool.MAX_WORKERS, 12), { size: pool.MAX_WORKERS, refusal: null });
  // 🔑 ZERO IS A DECLARATION, NOT AN ABSENCE: "I have read this key and I want
  //    no pool" must be expressible, and it must not be refused as nonsense.
  assert.deepEqual(pool.poolSize(0, 12), { size: 0, refusal: null });
  assert.deepEqual(pool.poolSize('auto', 12), { size: 6, refusal: null });
});

test('④ anything else is a NAMED REFUSAL and starts NO pool — never a quiet default', () => {
  const refused = [pool.MAX_WORKERS + 1, 99, -1, 1.5, '4', 'AUTO', true, {}, [], NaN];
  for (const bad of refused) {
    const out = pool.poolSize(bad, 12);
    assert.equal(out.size, pool.NONE,
      `${JSON.stringify(bad)}: a refused declaration must start NOTHING`);
    assert.ok(typeof out.refusal === 'string' && out.refusal.length > 0,
      `${JSON.stringify(bad)}: refusing in silence would leave the operator believing a pool `
      + 'exists where none does — the silent class this project refuses');
  }
  // 🛑 THE REFUSAL SAYS WHAT IT RECEIVED AND WHAT IS ADMISSIBLE. A message that
  //    only says "invalid" sends the reader to guess, which is how a named
  //    refusal degrades into a quiet failure with extra words.
  const over = pool.poolSize(99, 12).refusal;
  assert.ok(over.includes('99') && over.includes(String(pool.MAX_WORKERS)),
    `the ceiling refusal names neither the value nor the ceiling: ${over}`);
  const shape = pool.poolSize('lots', 12).refusal;
  assert.ok(shape.includes('"lots"') && shape.includes('auto'),
    `the shape refusal names neither what arrived nor what is accepted: ${shape}`);
});

test('⑤ the next worker is the LEAST LOADED, and ties are DETERMINISTIC', () => {
  assert.equal(pool.nextWorker([2, 0, 1]), 1);
  assert.equal(pool.nextWorker([0, 0, 0]), 0, 'a tie must always pick the same index, or a pool '
    + 'that dispatches differently on two identical states cannot be reasoned about');
  assert.equal(pool.nextWorker([5]), 0);
  // 🛑 A ROTATION WOULD PASS THE FIRST LINE AND FAIL THIS ONE: worker 0 is the
  //    busiest, and the only fact actually known here is the depth of each queue.
  assert.equal(pool.nextWorker([9, 3, 4, 3]), 1, 'the least loaded wins, first index on a tie');
  // Nobody to dispatch to, and unreadable entries are skipped rather than chosen.
  for (const empty of [[], null, undefined, 'pool', {}]) {
    assert.equal(pool.nextWorker(empty), -1, `${JSON.stringify(empty)}: there is nobody to pick`);
  }
  assert.equal(pool.nextWorker([-1, 'x', 2]), 2, 'an unreadable load is skipped, never selected');
  assert.equal(pool.nextWorker([-1, 'x', null]), -1, 'all unreadable ⇒ nobody, never index 0');
});

test('⑥ FAILS TOWARDS THE LOOP: anything unanswerable stays on the main thread', () => {
  assert.equal(pool.mayOffload(4, 'inv-1', false), true, 'anti-vacuity: the healthy case must pass');

  const stays = [
    ['no pool', () => pool.mayOffload(0, 'inv-1', false)],
    ['pool size absent', () => pool.mayOffload(undefined, 'inv-1', false)],
    ['pool size not an integer', () => pool.mayOffload(2.5, 'inv-1', false)],
    ['no invocation id', () => pool.mayOffload(4, '', false)],
    ['invocation id not a string', () => pool.mayOffload(4, null, false)],
    // 🔑 Only the FIRST frame of an action is eligible: the other thirty-one
    //    answer from the memo, so dispatching them would pay a thread hand-off
    //    to skip work that no longer exists.
    ['already collected', () => pool.mayOffload(4, 'inv-1', true)],
  ];
  for (const [why, call] of stays) {
    assert.equal(call(), false, `${why}: a dispatch decided on a doubt is how one action's corpus `
      + 'reaches another — the doubt must keep the work on the loop');
  }
  // ⚠️ STRICTLY `true` MEANS COLLECTED. Anything else is "I do not know", and
  //    not knowing must not cancel a legitimate dispatch either.
  assert.equal(pool.mayOffload(4, 'inv-1', undefined), true);
  assert.equal(pool.mayOffload(4, 'inv-1', 'yes'), true);
});

// ═══════════════════════
// ⑦ SOCKETS AND THREADS ARE TWO NUMBERS — the operator's correction
// ═══════════════════════
// 🔴 MY FIRST DESIGN SAID "one thread per socket" AND THE OPERATOR BROKE IT:
//    *"there are configurations where there can be more sockets than threads"*.
//    He is right, and TODAY'S PRODUCTION IS ONE — four sockets, one thread
//    (measured: a single `OwningProcess` on ports 8787-8790). A socket buys
//    ACCEPT QUEUE (232 each on Windows, linear); a thread buys PARALLELISM.
//    Forcing them equal would take a capacity away from both.
test('⑦ M sockets spread over N threads, deterministic and balanced', () => {
  // Today's production shape: every socket on the one thread.
  assert.deepEqual(pool.assignSockets(4, 1).assignment, [[0, 1, 2, 3]]);
  // One each.
  assert.deepEqual(pool.assignSockets(4, 4).assignment, [[0], [1], [2], [3]]);
  // 🔑 MORE SOCKETS THAN THREADS — the case that earns this function its
  //    place. The leftovers land on the FIRST threads, so no thread is ever two
  //    sockets behind another.
  assert.deepEqual(pool.assignSockets(8, 3).assignment, [[0, 3, 6], [1, 4, 7], [2, 5]]);
  assert.deepEqual(pool.assignSockets(1, 1).assignment, [[0]]);

  // 🛑 EVERY SOCKET IS ASSIGNED EXACTLY ONCE — a socket owned by two threads is
  //    two accept loops on one handle, and a socket owned by nobody is a port
  //    the wiring POSTs to that answers nothing. Both are silent.
  for (const [listeners, workers] of [[4, 1], [4, 4], [8, 3], [7, 2], [12, 5]]) {
    const flat = pool.assignSockets(listeners, workers).assignment.flat();
    assert.deepEqual(flat.slice().sort((a, b) => a - b), [...Array(listeners).keys()],
      `${listeners}/${workers}: every socket must be held exactly once`);
    assert.equal(new Set(flat).size, listeners, 'a socket was assigned twice');
  }
});

test('⑧ more THREADS than sockets is a NAMED REFUSAL, never clamped', () => {
  const out = pool.assignSockets(4, 6);
  assert.equal(out.assignment, null, 'a thread with no socket has nothing to accept');
  assert.ok(out.refusal.includes('6') && out.refusal.includes('4'),
    `the refusal names neither figure: ${out.refusal}`);
  // 🛑 CLAMPING WOULD START A POOL OF A SIZE NOBODY DECLARED, which is the
  //    quiet-default class this project refuses everywhere else.
  assert.ok(/clamp/i.test(out.refusal), 'the refusal must say that nothing was clamped');

  for (const [listeners, workers] of [[0, 1], [-1, 1], [1.5, 1], ['4', 1], [null, 1],
    [4, 0], [4, -1], [4, 1.5], [4, '2'], [4, null]]) {
    const bad = pool.assignSockets(listeners, workers);
    assert.equal(bad.assignment, null,
      `${JSON.stringify(listeners)}/${JSON.stringify(workers)}: must refuse, never distribute`);
    assert.ok(typeof bad.refusal === 'string' && bad.refusal.length > 0,
      'refusing in silence leaves the operator believing a distribution happened');
  }
});

test('9 `auto` never asks for more threads than there are sockets', () => {
  const { resolveAuto, poolSize, MAX_WORKERS } = pool;
  assert.equal(resolveAuto(12, 4), 4, 'half of twelve is six, but only four sockets exist');
  assert.equal(resolveAuto(4, 12), 2, 'plenty of sockets does not buy cores');
  assert.equal(resolveAuto(2, 1), 1);
  assert.equal(resolveAuto(12, undefined), Math.min(MAX_WORKERS, 6),
    'an absent socket count clamps nothing');
  assert.equal(resolveAuto(12, 0), Math.min(MAX_WORKERS, 6),
    'a nonsense socket count clamps nothing either');
  assert.equal(poolSize('auto', 12, 4).size, 4);
  assert.equal(poolSize('auto', 12, 4).refusal, null);
  assert.equal(poolSize(6, 12, 4).size, 6,
    'an EXPLICIT number is a declaration: it is honoured here and refused by the distribution');
});

test('⑩ the boundaries are EXACT: one socket, one thread, one core', () => {
  // `1` is the smallest legal value of every count here, so it is where `< 1` and `<= 1`
  // part ways (measured 2026-10-02: survivors on each of these lines).
  assert.equal(pool.resolveAuto(16, 1), 1, 'ONE declared socket bounds `auto` to ONE thread');
  assert.equal(pool.mayOffload(1, 'tool-a', false), true, 'a pool of ONE is a pool');
  assert.equal(pool.mayOffload(0, 'tool-a', false), false);
  assert.deepEqual(pool.assignSockets(1, 1), { assignment: [[0]], refusal: null });
});

test('⑪ a FRACTION is not a count — every integer test is its own wall', () => {
  // A fraction is a number by `typeof` and passes every sign test, so only
  // `Number.isInteger` stands between it and a pool of 2.5 threads.
  assert.equal(pool.resolveAuto(16, 2.5), 8, 'a fractional socket count bounds nothing');
  assert.equal(pool.resolveAuto(7.5), 1, 'a fractional core count is not a measurement');
  assert.equal(pool.nextWorker([1.5, 3]), 1, 'a fractional load is not a queue depth');
  assert.equal(pool.mayOffload(1.5, 'tool-a', false), false);
  assert.equal(pool.poolSize(2.5, 16).size, pool.NONE);
});

test('⑫ every refusal says its WHOLE sentence — copied from the source, never rebuilt', () => {
  // The operator reads these to know what to change; a half-erased sentence is a refusal
  // nobody can act on, and it reads as healthy text.
  assert.equal(pool.poolSize(9, 16).refusal,
    '`workers` is 9, above the ceiling of 8. '
    + 'Every worker is a V8 isolate holding its own copy of the corpus, and this daemon '
    + 'shares its machine with the agents it serves. Declare a number in 0..8, or `auto`.');
  assert.equal(pool.poolSize('four', 16).refusal,
    '`workers` must be an integer in 0..8 or the word "auto" '
    + '(nginx\'s convention), received "four". '
    + 'Nothing is assumed: a pool the operator did not declare would change production in silence.');
  assert.equal(pool.assignSockets(0, 1).refusal,
    '`http.listeners` must be a positive integer, received 0.');
  assert.equal(pool.assignSockets(4, 0).refusal,
    'the pool size must be a positive integer here, received 0. '
    + 'A pool of zero is decided by `poolSize`, never by this distribution.');
  assert.equal(pool.assignSockets(2, 3).refusal,
    '`workers` is 3 but only 2 socket(s) are declared. '
    + 'A thread with no socket has nothing to accept — it would cost a V8 isolate and its heap '
    + 'for nothing. Declare `http.listeners` >= 3, or lower `workers`. '
    + 'Nothing is clamped: a pool of a size you did not declare is a pool you cannot reason about.');
});
