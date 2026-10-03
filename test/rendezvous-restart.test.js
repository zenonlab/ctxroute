// rendezvous-restart — a daemon whose predecessor left its rendezvous behind still comes up.
//
// 🔴 WHY THIS EXISTS (2026-09-23): on the macOS runner the SECOND daemon of
//    `invocation-snapshot-restart` died with exit 1 on every run, and its stderr said why:
//    `EADDRINUSE` on the rendezvous socket file, THROWN by the builder's `onAddressInUse`. macOS is
//    the one kernel of the three that leaves that file behind a dead daemon, and the stale-code
//    exit makes a restart the NORMAL regime — so on the operator's associate's OS the daemon did
//    not come back after a code delivery. The builder's `'error'` listener runs FIRST, so its throw
//    killed the process before `kernel-bind` could ask the kernel whether the entry was dead.
//
// 🛑 THE CELLS DRIVE THE REAL HOOKS (`rendezvousLaneHooks`, what `main` passes) AND THE REAL
//    `kernel-bind`, on this machine's real rendezvous form. Only the two facts that are macOS-only
//    are injected — "this kernel leaves an entry" (`platform`) and "the entry is dead" (`probe`) —
//    exactly as `kernel-bind` was designed to be driven, so all three OS run the decision.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { bind } = require('../src/kernel-bind.js');
const { endpoint, kernelAddress } = require('../src/kernel-endpoint.js');
const { createServer, rendezvousLaneHooks } = require('../src/hooks/http-server.js');

/** A fresh rendezvous in its own state directory (created: on macOS the address is a file in it). */
function freshAddress() {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-rdv-'));
  return endpoint({ stateDir });
}

/** Something already holding the address: the living predecessor, or its leftover. */
function occupy(address) {
  const holder = net.createServer();
  return new Promise((resolve, reject) => {
    holder.once('error', reject);
    holder.listen(kernelAddress(address), () => resolve(holder));
  });
}

/**
 * Binds the daemon's rendezvous server the way `main` does, and settles with what happened.
 * An exception thrown by a hook inside the `'error'` emission is caught by the process-level
 * listener below and reported as such: that throw IS the defect.
 */
function bindLikeMain(address, probe) {
  const server = createServer({ store: new Map(), ...rendezvousLaneHooks() });
  return new Promise((resolve) => {
    const crash = (err) => resolve({ outcome: 'CRASHED', err });
    process.once('uncaughtException', crash);
    const settle = (value) => { process.removeListener('uncaughtException', crash); resolve(value); };
    bind(server, address,
      () => settle({ outcome: 'listening', server }),
      (err) => settle({ outcome: 'refused', err, server }),
      { platform: 'darwin', probe, unlink: () => {} });
  });
}

test('a DEAD rendezvous left behind is cleared and the daemon comes up (the macOS restart)', async () => {
  const address = freshAddress();
  const leftover = await occupy(address);
  // The kernel's answer for a dead entry: nobody accepts. Releasing the holder first is what
  // makes the address genuinely free, as an unlink of a dead file does on macOS.
  const r = await bindLikeMain(address, (_p, done) => { leftover.close(() => done(false)); });
  try {
    assert.equal(r.outcome, 'listening',
      `the daemon did not come up over a dead rendezvous: ${r.outcome} ${r.err ? r.err.message : ''}`);
  } finally { if (r.server) r.server.close(); }
});

test('a LIVING owner is still refused, BY kernel-bind, never by a throw from the builder', async () => {
  const address = freshAddress();
  const owner = await occupy(address);
  try {
    const r = await bindLikeMain(address, (_p, done) => done(true));
    assert.equal(r.outcome, 'refused', `a second instance was not refused: ${r.outcome}`);
    assert.equal(r.err && r.err.code, 'EADDRINUSE', 'the refusal must carry the kernel\'s own EADDRINUSE to main');
  } finally { owner.close(); }
});
