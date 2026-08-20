// ═══════════════════════════════════════════════════════════════════════
// kernel-endpoint.js — WHERE the daemon and its clients meet, per kernel.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 ONE STRING, AND EVERYTHING DEPENDS ON IT. The server and its clients must
//    name the SAME rendezvous. Two places computing one address is how a system
//    goes silently deaf: the daemon listens, the client knocks elsewhere,
//    nobody errors, injection simply stops. So this suite checks the SHAPE the
//    kernel imposes, and the property that separates two clones.
// ⚠️ DETERMINISTIC AND SPAWN-FREE on purpose: it belongs to the fast lane and to
//    the mutation runner. The behaviour under real processes is proven in
//    `state-daemon.test.js`, which spawns and therefore stays out of both.
// ⚠️ The three platforms are checked BY ARGUMENT, not by running on them: the
//    address is a pure function of (platform, root). What each kernel really
//    does with it is a third-party fact, read in the official `net` doc of the
//    INSTALLED version and cited in `kernel-state.md`.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { endpoint, fingerprint, leavesFilesystemEntry, EMPREINTE } = require('../src/kernel-endpoint.js');

// 🛑 THE PREFIX IS IMPOSED BY THE KERNEL, never chosen by us: on Windows a
//    server listening anywhere else is REFUSED (EACCES) — measured while
//    writing the module, on a path whose backslashes had been mangled.
test('WINDOWS: a named pipe, under the namespace the kernel requires', () => {
  assert.match(endpoint({ platform: 'win32', root: '/r' }),
    /^\\\\\.\\pipe\\ctxroute-[0-9a-f]{12}$/,
    'Windows requires an entry under \\\\.\\pipe\\ — anywhere else the bind is refused');
});

// ⚠️ The leading \0 is what makes the socket ABSTRACT, and it is Linux-only. It
//    buys the property that matters most here: NOTHING on disk, and the address
//    disappears with the last reference — a killed daemon leaves no stale entry
//    for the next one to trip over.
test('LINUX: an ABSTRACT socket — nothing on disk, nothing to clean up', () => {
  const a = endpoint({ platform: 'linux', root: '/r' });
  assert.equal(a[0], '\0', 'without the leading NUL the socket becomes a real file, and stale entries come back');
  assert.match(a, /^\0ctxroute-[0-9a-f]{12}$/);
});

// ⚠️ macOS has NO abstract namespace. That is a property of that kernel, STATED
//    rather than worked around — emulating it with a lock file would put back
//    by hand exactly what this whole design removes.
test('macOS: a real socket file, and the difference is DECLARED', () => {
  const a = endpoint({ platform: 'darwin', root: '/r', stateDir: '/tmp/etat' });
  assert.ok(a.endsWith('.sock'));
  // ⚠️ Compared on a NORMALISED form: this suite runs on the three systems and
  //    `path.join` uses the local separator — asserting on a literal would make
  //    the cell red on Windows for a reason that has nothing to do with macOS.
  assert.ok(a.split(String.fromCharCode(92)).join('/').startsWith('/tmp/etat'),
    'it lives in the state directory, the place already reserved for what we write');

  assert.equal(leavesFilesystemEntry('win32'), false);
  assert.equal(leavesFilesystemEntry('linux'), false);
  assert.equal(leavesFilesystemEntry('darwin'), true,
    'the one kernel of the three that leaves an entry behind — whoever restarts a daemon must know it');
});

// ⚠️ TWO CLONES MUST NEVER MEET ON ONE DAEMON: they have different corpora, so
//    one would answer for the other's documents. A fork, or an old copy kept
//    for rollback, is exactly that case.
test('THE ADDRESS SEPARATES TWO CLONES', () => {
  assert.notEqual(endpoint({ platform: 'linux', root: '/repos/ctxroute' }),
    endpoint({ platform: 'linux', root: '/repos/ctxroute-old' }),
    'two clones sharing one address would answer for each other');
});

// 🛑 ONE DIRECTORY, ONE ADDRESS — whatever the spelling. On Windows the same
//    place can be written with either separator and in either case; two
//    spellings hashing differently means the client knocks on a door the
//    daemon never opened, in silence.
test('ONE DIRECTORY = ONE ADDRESS, whatever the spelling', () => {
  const a = fingerprint('C:/Users/dev/ctxroute');
  assert.equal(fingerprint('C:\\Users\\dev\\ctxroute'), a, 'separators must not change the address');
  assert.equal(fingerprint('C:/USERS/DEV/CTXROUTE'), a, 'case must not change the address');
  assert.notEqual(fingerprint('C:/Users/dev/ctxroute-old'), a, 'a different directory MUST change it');
});

// ⚠️ HASHED, never the raw path: a pipe name is length-bounded, and a real path
//    carries a user name — THIS REPOSITORY IS PUBLIC, a home directory must
//    never end up in an address.
test('THE ADDRESS LEAKS NO PATH — this repository is public', () => {
  const a = endpoint({ platform: 'win32', root: 'C:/Users/quelquun-de-reel/ctxroute' });
  assert.ok(!a.includes('quelquun-de-reel'), 'a user name must never travel in an address');
  assert.ok(!a.includes('Users'), 'no fragment of the real path may survive');
  assert.equal(fingerprint('/r').length, EMPREINTE, 'the fingerprint keeps its declared length');
});
