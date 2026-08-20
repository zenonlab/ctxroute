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
 * @param {string} adresse already in kernel form
 * @param {(r: boolean) => void} done
 */
function occupied(adresse, done) {
  const sonde = net.connect({ path: adresse });
  let fini = false;
  const finir = (r) => { if (!fini) { fini = true; sonde.destroy(); done(r); } };
  sonde.on('connect', () => finir(true));
  sonde.on('error', () => finir(false));
}

/**
 * Binds `server` to the rendezvous, clearing a DEAD entry if this kernel leaves
 * one behind.
 *
 * @param {import('net').Server} server
 * @param {string} adresse transportable form (`@name` on Linux)
 * @param {() => void} onListening
 * @param {(err: Error) => void} onError
 * @param {{platform?: string}} [options]
 */
function bind(server, adresse, onListening, onError, options) {
  const plateforme = (options && options.platform) || process.platform;
  const chemin = kernelAddress(adresse);

  const essayer = () => {
    server.once('error', (err) => {
      // ⚠️ ONLY `EADDRINUSE` is worth a second look. Any other failure is a real
      //    problem and is reported as-is: retrying it would hide it.
      if (err && /** @type {any} */ (err).code === 'EADDRINUSE' && leavesFilesystemEntry(plateforme)) {
        occupied(chemin, (vivant) => {
          if (vivant) { onError(err); return; }   // someone IS there: the address is legitimately taken
          try { fs.unlinkSync(chemin); } catch { /* already gone: another instance won the race */ }
          server.once('error', onError);
          server.listen(chemin, onListening);
        });
        return;
      }
      onError(err);
    });
    server.listen(chemin, onListening);
  };

  essayer();
}

module.exports = { bind, occupied };
