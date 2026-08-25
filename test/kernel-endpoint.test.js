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
//    address is a pure function of (platform, stateDir). What each kernel really
//    does with it is a third-party fact, read in the official `net` doc of the
//    INSTALLED version and cited in `kernel-state.md`.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert/strict';
// 🛑 STATIC, DIRECT IMPORT OF THE MUTATED MODULE — never `createRequire`, never a
//    re-export. Stryker's `perTest` coverage maps a mutant to the tests that
//    covered it; a dynamic `require` breaks that mapping and EVERY mutant is
//    reported as surviving. MEASURED 2026-08-20: this file scored **0.00 %,
//    51 survivors out of 51** — not one missing test, the whole suite invisible.
//    The rule was already written in `quality-configs.md`; it was broken here.
import { endpoint, kernelAddress, fingerprint, leavesFilesystemEntry, FINGERPRINT } from '../src/kernel-endpoint.js';

// 🛑 THE PREFIX IS IMPOSED BY THE KERNEL, never chosen by us: on Windows a
//    server listening anywhere else is REFUSED (EACCES) — measured while
//    writing the module, on a path whose backslashes had been mangled.
test('WINDOWS: a named pipe, under the namespace the kernel requires', () => {
  assert.match(endpoint({ platform: 'win32', stateDir: '/r' }),
    /^\\\\\.\\pipe\\ctxroute-[0-9a-f]{12}$/,
    'Windows requires an entry under \\\\.\\pipe\\ — anywhere else the bind is refused');
});

// 🔴 THE LAW THAT WOULD HAVE CAUGHT IT, AND IT WAS PAID IN CI ON 2026-08-20.
//    The kernel wants a leading NUL byte to make the socket ABSTRACT; an argv
//    string may NOT contain one. Returning the NUL form made
//    `fork(daemon, [address])` throw at once and the whole daemon suite died on
//    Linux while staying green on Windows — no local run could have shown it.
// ⚠️ A FIRST VERSION OF THIS CELL WAS HOLLOW: it compared the converted form to
//    itself and passed BY COINCIDENCE on the broken code. What discriminates is
//    below — the TRANSPORTABLE form must carry no null byte AT ALL.
test('LINUX: the address is ARGV-SAFE, and only the kernel ever sees the NUL', () => {
  const a = endpoint({ platform: 'linux', stateDir: '/r' });

  assert.equal(a.indexOf(String.fromCharCode(0)), -1,
    'the transportable address carries a NUL byte: it cannot travel in an argv, an env var or a log line');
  assert.match(a, /^@ctxroute-[0-9a-f]{12}$/, '`@name` is the form Linux itself displays (ss, netstat)');

  const kernel = kernelAddress(a);
  assert.equal(kernel.charCodeAt(0), 0,
    'without the leading NUL the socket stops being abstract and becomes a real file, with stale entries');
  assert.equal(kernel.slice(1), a.slice(1), 'the conversion changes the prefix, never the name');
});

// ⚠️ IDEMPOTENT ELSEWHERE, so no caller ever branches on the platform: a pipe
//    name and a socket path must pass through untouched.
test('THE CONVERSION TOUCHES ONLY LINUX', () => {
  const pipe = endpoint({ platform: 'win32', stateDir: '/r' });
  assert.equal(kernelAddress(pipe), pipe);
  const sock = endpoint({ platform: 'darwin', stateDir: '/tmp/etat' });
  assert.equal(kernelAddress(sock), sock);
});


test('macOS: a real socket file, and the difference is DECLARED', () => {
  const a = endpoint({ platform: 'darwin', stateDir: '/tmp/etat' });
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

// ⚠️ TWO INSTALLATIONS MUST NEVER MEET ON ONE DAEMON: they have different
//    corpora, so one would answer for the other's documents. An installation is
//    identified by the DATA it serves — a second state directory is a second
//    corpus, and that is the case this separates.
test('THE ADDRESS SEPARATES TWO INSTALLATIONS', () => {
  assert.notEqual(endpoint({ platform: 'linux', stateDir: '/repos/ctxroute/state' }),
    endpoint({ platform: 'linux', stateDir: '/repos/ctxroute-old/state' }),
    'two installations sharing one address would answer for each other');
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
  // 🛑 THE SEPARATOR IS REPLACED, NEVER DROPPED. Collapsing it folds `C:\a\bc`
  //    and `C:\ab\c` onto ONE address — two installations meeting on one daemon,
  //    which is the exact accident this fingerprint exists to prevent. Written
  //    with backslashes so the cell discriminates on the three kernels: only
  //    Windows' `path.resolve` produces them on its own.
  assert.notEqual(fingerprint('C:\\a\\bc'), fingerprint('C:\\ab\\c'),
    'two different directories collapsed onto one address: one would answer for the other corpus');
});

// ⚠️ HASHED, never the raw path: a pipe name is length-bounded, and a real path
//    carries a user name — THIS REPOSITORY IS PUBLIC, a home directory must
//    never end up in an address.
test('THE ADDRESS LEAKS NO PATH — this repository is public', () => {
  const a = endpoint({ platform: 'win32', stateDir: 'C:/Users/dev/ctxroute/state' });
  assert.ok(!a.includes('dev'), 'a user name must never travel in an address');
  assert.ok(!a.includes('Users'), 'no fragment of the real path may survive');
  assert.equal(fingerprint('/r').length, FINGERPRINT, 'the fingerprint keeps its declared length');
});

// 🔴 THE IDENTITY IS THE DATA SERVED, NEVER THE FOLDER THE CODE LIVES IN.
//    MEASURED IN PRODUCTION 2026-08-24: the daemon runs from a FROZEN copy
//    (`ctxroute-release`) while the spawned client hooks run from the working
//    repository. Both resolve the SAME config, the SAME `stateDir`, the SAME
//    corpus — one single installation — yet an address hashed from the CODE
//    folder gave them two different pipes. The daemon listened on one, the
//    clients knocked on the other, nobody errored, and the client lane fell
//    back to disk in total silence. Two code folders are NOT two installations;
//    two state directories ARE.
test('THE ADDRESS IS A FUNCTION OF THE DATA SERVED, NOT OF THE CODE FOLDER', () => {
  const served = '/var/ctxroute/state';
  // ⚠️ `root` IS NOT PART OF THE CONTRACT ANY MORE, and it is written here on
  //    purpose: this cell asserts that naming a code folder changes NOTHING.
  //    Passed through a named object rather than a literal so the type checker
  //    reads it as the extra fact it is, not as a signature we still honour.
  const fromTheWorkingRepo = { platform: 'win32', root: '/repos/ctxroute', stateDir: served };
  const fromTheFrozenCopy = { platform: 'win32', root: '/repos/ctxroute-release', stateDir: served };

  assert.equal(endpoint(fromTheWorkingRepo), endpoint(fromTheFrozenCopy),
    'one installation served from two code folders must meet on ONE address');

  assert.notEqual(
    endpoint({ platform: 'win32', stateDir: '/var/ctxroute/state' }),
    endpoint({ platform: 'win32', stateDir: '/var/other/state' }),
    'two corpora must NEVER meet: one would answer for the other documents');
});
