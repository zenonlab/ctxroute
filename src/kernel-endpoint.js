// ═══════════════════════════════════════════════════════════════════════
// KERNEL-ENDPOINT — WHERE the daemon and its clients meet, on each kernel.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 WHY A DEDICATED MODULE FOR ONE STRING. Because the server and its clients
//    must name the SAME rendezvous, and two places computing one address is how
//    a system goes silently deaf: the daemon listens, the client knocks
//    elsewhere, nobody errors, injection simply stops. Single source, or none.
//
// 🛑 THE ADDRESS IS AN OBJECT OF THE KERNEL, NOT A FILE. Measured on Node
//    22.15.1: of the 68 builtin modules, ZERO expose an inter-process
//    synchronisation primitive — no named mutex, no shared memory, no
//    semaphore. The one kernel primitive reachable from JavaScript is the
//    SOCKET, and `net`/`http` reach it identically on the three systems
//    (official net doc, v22.15.1):
//      · Windows  → NAMED PIPE. "The path must refer to an entry in \\?\pipe\
//        or \\.\pipe\". It lives in the kernel's object namespace, NOT in the
//        filesystem, and "Windows will close and remove the pipe when the
//        owning process exits" — zero cleanup of ours, zero orphan.
//      · Linux    → ABSTRACT unix socket (leading \0). "The path to the Unix
//        abstract socket is not visible in the file system and it will
//        disappear automatically when all open references to the socket are
//        closed." Nothing on disk either.
//      · macOS    → unix socket, a real filesystem entry. It is the ONE system
//        of the three that leaves a node behind, and only as a MEETING POINT:
//        never state, never a channel between peers. `server.close()` unlinks
//        it (Node abstraction owns it, so Node removes it).
// ⚠️ macOS has no abstract namespace — that is a property of the kernel, stated
//    rather than worked around. Never emulate it with a lock file: that would
//    reintroduce, by hand, exactly what this module exists to remove.
//
// ⚠️ THE NAME CARRIES THE REPOSITORY, and that is not decoration: two clones
//    (a fork, an old copy kept for rollback) must NEVER meet on one daemon —
//    they have different corpora, so one would answer for the other's
//    documents. Derived from the resolved root, never from a `cwd` the caller
//    could have moved.
// ⚠️ HASHED, not the raw path: a pipe name has a bounded length and forbids
//    separators, and a real path carries a user name (this repository is
//    public — a home directory must not end up in an address).
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const crypto = require('crypto');
const os = require('os');
const path = require('path');
const paths = require('./paths');

// 12 hex characters: 48 bits. Far beyond what is needed to separate the handful
// of clones on one machine, and short enough to stay under every path limit.
const FINGERPRINT = 12;

/** @param {string} racine @returns {string} */
function fingerprint(racine) {
  // ⚠️ NORMALISED before hashing: on Windows the same directory can be spelled
  //    with either separator and in either case. Two spellings of one clone
  //    must hash to ONE address, or the client would knock on a door the daemon
  //    never opened.
  // ⚠️ TRULY EQUIVALENT MUTANT, DECLARED — measured in CI 2026-08-20, the only
  //    survivor of this file. `toUpperCase()` satisfies the property just as
  //    well: what matters is that ONE spelling wins, not WHICH one. Killing it
  //    would mean coupling a test to a hash value chosen at random, i.e.
  //    freezing an arbitrary decision as if it were a contract. The property
  //    itself IS tested — "ONE DIRECTORY = ONE ADDRESS, whatever the spelling".
  // Stryker disable next-line MethodExpression
  const normalized = path.resolve(racine).replace(/\\/g, '/').toLowerCase();
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, FINGERPRINT);
}

/**
 * The rendezvous address for THIS repository, on THIS kernel.
 *
 * @param {{ platform?: string, root?: string, stateDir?: string }} [options]
 * @returns {string}
 */
function endpoint(options) {
  const o = options || {};
  const platform = o.platform || process.platform;
  const root = o.root || paths.ROOT;
  const print = fingerprint(root);

  // 🛑 THE PREFIX IS IMPOSED BY THE KERNEL, not chosen by us: on Windows a
  //    server that listens anywhere else is refused (EACCES) — measured while
  //    writing this module, on a path whose backslashes had been mangled.
  if (platform === 'win32') return `\\\\.\\pipe\\ctxroute-${print}`;

  // ⚠️ The leading \0 is what makes the socket ABSTRACT — Linux only. It buys
  //    the property that matters most here: nothing on disk at all, and the
  //    address disappears with the last reference, so a killed daemon leaves NO
  //    stale entry for the next one to trip over.
  if (platform === 'linux') return `@ctxroute-${print}`;

  // macOS (and any other POSIX): a real socket file. Kept in the state
  // directory — the place already reserved for what this framework writes.
  return path.join(o.stateDir || paths.stateDir() || os.tmpdir(), `ctxroute-${print}.sock`);
}

/**
 * Does this kernel leave a filesystem entry behind for the rendezvous?
 * ⚠️ ASKED, never assumed: it is the ONLY difference of substance between the
 *    three systems, and whoever starts or stops a daemon has to know it (a
 *    stale socket file must be removed before a new bind, a pipe must not).
 * @param {string} [platform]
 */
function leavesFilesystemEntry(platform) {
  const p = platform || process.platform;
  return p !== 'win32' && p !== 'linux';
}

/**
 * The form the KERNEL reads, from the form humans and processes carry around.
 * 🛑 CALLED AT EXACTLY TWO PLACES — `listen` and `connect` — and nowhere else.
 *    Converting earlier would put a NUL byte back into something that gets
 *    passed as an argument, logged or compared; converting in two places would
 *    let the two drift, which for an address means going silently deaf.
 * ⚠️ Idempotent on every other platform: a pipe name and a socket path pass
 *    through untouched, so callers never branch on the platform.
 * @param {string} address
 */
function kernelAddress(address) {
  return address.startsWith('@') ? `\0${address.slice(1)}` : address;
}

module.exports = { endpoint, kernelAddress, fingerprint, leavesFilesystemEntry, FINGERPRINT };
