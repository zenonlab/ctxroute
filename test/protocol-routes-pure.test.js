// ═══════════════════════════════════════════════════════════════════════
// protocol-routes-pure.test.js — the four route names, asserted LITERALLY
// ═══════════════════════════════════════════════════════════════════════
//
// 🛑 EVERY EXPECTATION HERE IS WRITTEN BY HAND, NEVER READ BACK FROM THE
//    MODULE. An assertion shaped `toBe(MODULE.CONSTANT)` demonstrates `x === x`
//    and is mutated together with the thing it claims to judge — measured in
//    this repository on 2026-08-21, 43 survivors at once. These four strings are
//    a WIRE PROTOCOL: what they must equal is a fact about the daemon and its
//    clients, not about this file.
// ⚠️ THE MODULE IS CALLED INSIDE EACH `test()`, never at module level: under the
//    perTest runner a literal evaluated at load is a STATIC mutant that survives
//    every test that could kill it.
// 🔴 AND THE REASON THIS SUITE EXISTS AT ALL: a misspelt route does NOT 404. The
//    daemon serves the GATE route for any path it does not recognise, so a
//    divergence is ANSWERED rather than refused — a purge that purges nothing, a
//    turn that goes uncounted, in silence. That is the whole failure mode.

import { test } from 'vitest';
import assert from 'node:assert';

import { routes } from '../src/protocol-routes-pure.js';

test('the four route names are exactly what the daemon dispatches on', () => {
  assert.deepStrictEqual(routes(), {
    gate: '/pretool',
    purge: '/purge',
    turn: '/turn',
    emit: '/emit',
  }, 'A route name changed. The daemon serves the GATE route for anything it does not recognise, so every client of the moved route is answered by the wrong handler, with no error and no log.');
});

test('every route is a rooted path, with no query and no fragment', () => {
  // The query is OURS: `?frame=k&frames=N` is appended to the gate route by
  // `state-client.js` and written into the URL by the wiring generator. A route
  // carrying its own would put two `?` in one URL — coordinates nobody reads.
  const all = Object.values(routes());
  assert.strictEqual(all.length, 4, 'The protocol lost or gained a route without this suite being told: every consumer of the missing name would fall through to the gate.');
  for (const r of all) {
    assert.strictEqual(typeof r, 'string', `route ${JSON.stringify(r)} is not a string`);
    assert.strictEqual(r.startsWith('/'), true, `route ${JSON.stringify(r)} does not start with a slash — an unrooted path is not a route the daemon can match`);
    assert.strictEqual(/[?#]/.test(r), false, `route ${JSON.stringify(r)} carries a query or a fragment — the query is where the frame coordinates travel`);
  }
});

test('the four routes are DISTINCT, and the table is fresh on every call', () => {
  // 🛑 TWO ROUTES SHARING A NAME IS THE DEFECT WITH THE ORDER OF THE DISPATCHER
  //    DECIDING WHICH ONE WINS: the loser's clients would be answered by the
  //    other handler, which is the same silence one door over.
  const r = routes();
  assert.strictEqual(new Set(Object.values(r)).size, 4,
    'Two routes of one protocol carry the same name: the dispatcher answers whichever it compares first, and the other route silently stops existing.');

  // ⚠️ A FRESH OBJECT PER CALL is what lets the literals be evaluated INSIDE a
  //    test, and what makes `Object.freeze` unnecessary: no caller holds a table
  //    long enough to share it, so nobody can mutate one everyone else reads.
  const again = routes();
  assert.notStrictEqual(again, r, 'The table is a shared object: a caller mutating it would move the protocol for every other consumer in the process.');
  assert.deepStrictEqual(again, r, 'Two calls disagreed on the protocol.');
  again.gate = '/moved';
  assert.strictEqual(routes().gate, '/pretool', 'Mutating a returned table moved the route for the next caller.');
});
