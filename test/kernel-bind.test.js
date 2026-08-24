// ═══════════════════════════════════════════════════════════════════════
// kernel-bind.js — taking the address, and the ONE decision only macOS reaches
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 WHY THIS SUITE EXISTS, AND IT IS AN ANTI-REGRESSION HOLE THAT WAS REAL.
//    The decision below — *dead entry ⇒ clear it · living entry ⇒ never touch
//    it* — is only ever TAKEN on macOS: Windows removes its named pipe when the
//    owner exits, a Linux abstract socket disappears with its last reference, so
//    neither ever reaches this branch. Until this file existed, `bind()` was
//    exercised only INDIRECTLY, through a spawned daemon, on one platform out of
//    three. **Someone could have broken it and neither Windows nor Linux would
//    have noticed** — the defect would have shipped and surfaced on somebody
//    else's machine.
// ✅ The probe and the unlink are INJECTED, so the decision is driven directly,
//    deterministically, on all three kernels, with no race and no daemon.
// 🛑 THE BRANCH THAT MATTERS MOST IS THE ONE THAT DOES NOTHING: deleting the
//    socket of a LIVING daemon would leave it running while every client knocks
//    on an address nobody owns any more — silence, no error, nothing to notice.
//    That is why "the file exists, so it is probably stale" is forbidden here,
//    and why the kernel is asked instead.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { bind } = require('../src/kernel-bind.js');

/**
 * A minimal stand-in for `net.Server`: it records what was asked of it and lets
 * the test decide when `listen` fails. A real server would drag a real kernel
 * into a decision test — and the kernel is exactly what we are NOT testing here.
 */
function fakeServer(failures) {
  const journal = { listens: [], errors: [] };
  let remaining = failures.slice();
  return {
    journal,
    once(evt, cb) { if (evt === 'error') journal.errors.push(cb); },
    listen(filePath, onListening) {
      journal.listens.push(filePath);
      const err = remaining.shift();
      // 🛑 DELIVERED SYNCHRONOUSLY, AND THAT IS THE POINT: nothing here is
      //    waiting on a kernel, so there is NOTHING TO WAIT FOR. A first version
      //    used `queueMicrotask` + a `setTimeout(0)` in the cells — and the
      //    temporal gate refused it, rightly: a delay whose outcome I control
      //    myself is not a wait, it is a bug waiting for a loaded machine.
      //    The error goes to the LAST registered `once('error')` handler, which
      //    is exactly how Node dispatches it.
      if (err) journal.errors[journal.errors.length - 1](err);
      else onListening();
    },
  };
}

const EADDRINUSE = Object.assign(new Error('listen EADDRINUSE'), { code: 'EADDRINUSE' });

// ── ① THE NORMAL CASE: nothing in the way, nothing to clean ─────────────
test('a free address is taken directly — no probe, no unlink', () => {
  const srv = fakeServer([]);
  let sonde = 0;
  let efface = 0;
  let listening = false;

  bind(srv, '/tmp/x.sock', () => { listening = true; }, () => {}, {
    platform: 'darwin',
    probe: () => { sonde += 1; },
    unlink: () => { efface += 1; },
  });

  assert.equal(listening, true, 'the server must be listening');
  assert.equal(sonde, 0, 'nothing was in the way: asking the kernel would be a pointless round trip');
  assert.equal(efface, 0, 'and NOTHING may be deleted on a path that bound fine');
});

// ── ② THE BRANCH THAT MUST DO NOTHING — a LIVING daemon owns the address ─
// 🛑 THIS IS THE DANGEROUS ONE. Deleting a living daemon's socket leaves it
//    running while every client knocks on an address nobody owns: silence, no
//    error, nothing to notice. The address is legitimately taken, and
//    `EADDRINUSE` must reach the caller UNCHANGED.
test('a LIVING address is never cleared — the error reaches the caller as is', () => {
  const srv = fakeServer([EADDRINUSE]);
  let efface = 0;
  let received = null;

  bind(srv, '/tmp/x.sock', () => {}, (err) => { received = err; }, {
    platform: 'darwin',
    probe: (_c, done) => done(true),          // the kernel answers: someone IS there
    unlink: () => { efface += 1; },
  });

  assert.equal(efface, 0,
    'the socket of a LIVING daemon was deleted: it keeps running while every client knocks on an '
    + 'address nobody owns any more — silent, and undetectable from the outside');
  assert.equal(received, EADDRINUSE, 'the refusal must reach the caller unchanged, never be swallowed');
  assert.equal(srv.journal.listens.length, 1, 'and no second attempt may be made behind a living owner');
});

// ── ③ THE BRANCH THAT REPAIRS — a DEAD entry, cleared then re-bound ──────
test('a DEAD entry is cleared, and the address is taken on the second attempt', () => {
  const srv = fakeServer([EADDRINUSE]);       // fails once, then succeeds
  const efface = [];
  let listening = false;

  bind(srv, '/tmp/x.sock', () => { listening = true; }, () => {}, {
    platform: 'darwin',
    probe: (_c, done) => done(false),         // the kernel answers: nobody there
    unlink: (c) => efface.push(c),
  });

  assert.deepEqual(efface, ['/tmp/x.sock'], 'the dead entry must be removed — and exactly it');
  assert.equal(listening, true, 'then the address is taken: otherwise a killed daemon blocks its successor for ever');
  assert.equal(srv.journal.listens.length, 2, 'exactly two attempts: one refused, one after the cleanup');
});

// ── ④ WHERE THE KERNEL LEAVES NOTHING, WE TOUCH NOTHING ─────────────────
// ⚠️ On Windows and Linux an `EADDRINUSE` can only mean a LIVING owner, so
//    probing or unlinking there would be pure risk for zero benefit.
test('on Windows and Linux the branch is never entered', () => {
  for (const platform of ['win32', 'linux']) {
    const srv = fakeServer([EADDRINUSE]);
    let sonde = 0;
    let received = null;

    bind(srv, '/tmp/x.sock', () => {}, (err) => { received = err; }, {
      platform,
      probe: () => { sonde += 1; },
      unlink: () => { throw new Error(`unlink attempted on ${platform}`); },
    });
  
    assert.equal(sonde, 0, `${platform}: an EADDRINUSE there can only be a living owner — nothing to ask`);
    assert.equal(received, EADDRINUSE, `${platform}: the error must reach the caller`);
  }
});

// ── ⑤ ANY OTHER FAILURE IS A REAL PROBLEM, REPORTED AS IS ────────────────
// 🛑 Retrying or cleaning on `EACCES` would HIDE a permission defect, and a
//    hidden problem is how a silent bug is born.
test('a failure that is NOT EADDRINUSE is reported, never cleaned up', () => {
  const eacces = Object.assign(new Error('listen EACCES'), { code: 'EACCES' });
  const srv = fakeServer([eacces]);
  let received = null;

  bind(srv, '/tmp/x.sock', () => {}, (err) => { received = err; }, {
    platform: 'darwin',
    probe: () => { throw new Error('probed on a non-EADDRINUSE failure'); },
    unlink: () => { throw new Error('cleaned up on a non-EADDRINUSE failure'); },
  });

  assert.equal(received, eacces, 'a permission error must surface untouched — cleaning it would hide the real defect');
});
