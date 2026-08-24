// ═══════════════════════════════════════════════════════════════════════
// KERNEL-BIND — taking the rendezvous address, on a kernel that leaves traces.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 WHY THIS FILE EXISTS — FOUND BY CI ON macOS, 2026-08-20, AND ONLY THERE.
//    Windows removes its named pipe when the owning process exits; a Linux
//    ABSTRACT socket disappears with its last reference. macOS is the one of the
//    three that leaves a real FILE behind — and Node only unlinks it on a clean
//    `server.close()`. A daemon that is KILLED (which is the normal case: a code
//    edit makes it exit, a crash happens) therefore leaves a dead socket file,
//    and the NEXT daemon cannot bind: `EADDRINUSE`, for ever, on a machine where
//    nothing is listening. The restart test timed out for exactly that reason
//    while the other four passed.
// ⚠️ `kernel-endpoint.js` already NAMED this difference (`leavesFilesystemEntry`)
//    and nothing acted on it. **A fact that is documented but not wired is a fact
//    that protects nobody** — that is what this module fixes.
//
// 🛑 AND THE DEAD ENTRY IS NEVER REMOVED ON A GUESS. "The file exists, so it is
//    probably stale" is exactly the inference this whole design removes — and it
//    would be catastrophic here: deleting the socket of a LIVING daemon leaves it
//    running while every client knocks on an address nobody owns any more.
//    Silence, no error, no way to notice.
// ✅ THE KERNEL ANSWERS THE QUESTION ITSELF, and instantly:
//      · a connect that SUCCEEDS  → someone is alive → `EADDRINUSE` stands.
//      · `ECONNREFUSED`           → the entry is dead → unlink and bind.
//    No probe, no heartbeat, no delay used as a verdict. Same rule as the rest
//    of this path: ask what KNOWS.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const fs = require('fs');
const net = require('net');
const { kernelAddress, leavesFilesystemEntry } = require('./kernel-endpoint');

/**
 * Is anything actually listening on this address?
 * ⚠️ Answered by the KERNEL, never by looking at the filesystem: a file that
 *    exists says nothing about a process that lives.
 * @param {string} address already in kernel form
 * @param {(r: boolean) => void} done
 */
function occupied(address, done) {
  const probe = net.connect({ path: address });
  let finished = false;
  const finish = (r) => { if (!finished) { finished = true; probe.destroy(); done(r); } };
  probe.on('connect', () => finish(true));
  probe.on('error', () => finish(false));
}

/**
 * Binds `server` to the rendezvous, clearing a DEAD entry if this kernel leaves
 * one behind.
 *
 * @param {import('net').Server} server
 * @param {string} address transportable form (`@name` on Linux)
 * @param {() => void} onListening
 * @param {(err: Error) => void} onError
 * @param {{platform?: string, probe?: Function, unlink?: Function}} [options]
 */
function bind(server, address, onListening, onError, options) {
  const o = options || {};
  const platform = o.platform || process.platform;
  // ⚠️ THE PROBE AND THE UNLINK ARE INJECTABLE, and that is not a testing
  //    convenience: this decision is only ever TAKEN on macOS (the one kernel of
  //    the three that leaves an entry behind), so without injection it could be
  //    broken and **neither Windows nor Linux would notice** — the defect would
  //    ship and surface on someone else's machine. Injecting them makes the
  //    DECISION testable on all three, deterministically, with no race.
  const probe = o.probe || occupied;
  const effacer = o.unlink || ((c) => fs.unlinkSync(c));
  const filePath = kernelAddress(address);

  const essayer = () => {
    server.once('error', (err) => {
      // ⚠️ ONLY `EADDRINUSE` is worth a second look. Any other failure is a real
      //    problem and is reported as-is: retrying it would hide it.
      if (err && /** @type {any} */ (err).code === 'EADDRINUSE' && leavesFilesystemEntry(platform)) {
        probe(filePath, (vivant) => {
          if (vivant) { onError(err); return; }   // someone IS there: the address is legitimately taken
          try { effacer(filePath); } catch { /* already gone: another instance won the race */ }
          server.once('error', onError);
          server.listen(filePath, onListening);
        });
        return;
      }
      onError(err);
    });
    server.listen(filePath, onListening);
  };

  essayer();
}

module.exports = { bind, occupied };
