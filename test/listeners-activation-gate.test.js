import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const server = require('../src/hooks/http-server.js');
const { inheritedFdCount, SD_LISTEN_FDS_START } = server;

// ═══════════════════════════════════════════════════════════════════════
// WHY THIS GATE EXISTS — `http.listeners` WAS BROKEN IN SILENCE (2026-09-18)
// ═══════════════════════════════════════════════════════════════════════
// The wiring generator spreads the frames over EVERY declared endpoint and has
// no idea which platform runs them. On a socket-activated OS the daemon read
// `LISTEN_FDS`, checked it was at least one, and then served descriptor 3 ALONE
// — the count was validated and thrown away. ⇒ a Linux or macOS adopter who
// declared `listeners: 4` got a wiring POSTing to four ports and a daemon
// holding one: 24 frames of every 32 landing on nothing, on every action, with
// nothing going red. Nobody had seen it because nobody had ever raised the key.
//
// 🛑 WHAT IS PROVABLE HERE AND WHAT IS NOT, stated rather than blurred: the
//    COUNTER is pure and is exercised below on real behaviour. The REFUSAL it
//    feeds lives in `main()` behind a real inherited descriptor, and Node says
//    "Listening on a file descriptor is not supported on Windows" — so that half
//    CANNOT be exercised on this machine and must be proven by the Linux job of
//    `.github/workflows/service-units.yml`. A skip is not a pass.

test('① the supervisor COUNT is read, not just its existence', () => {
  // The exact shape sd_listen_fds(3) describes: descriptors 3 .. 3+LISTEN_FDS-1.
  assert.equal(inheritedFdCount({ LISTEN_PID: '42', LISTEN_FDS: '4' }, 42), 4);
  assert.equal(inheritedFdCount({ LISTEN_PID: '42', LISTEN_FDS: '1' }, 42), 1);
  assert.equal(inheritedFdCount({ LISTEN_PID: '42', LISTEN_FDS: '8' }, 42), 8);
});

test('② a descriptor handed to SOMEBODY ELSE is not ours', () => {
  // These variables are INHERITED: without the pid comparison a child of an
  // activated process would serve a socket nobody gave it, silently.
  assert.equal(inheritedFdCount({ LISTEN_PID: '99', LISTEN_FDS: '4' }, 42), 0);
});

test('③ a malformed environment is a NO, never a guess', () => {
  for (const bad of ['3.5', ' 3 ', '0x3', '', 'four', '-1']) {
    assert.equal(inheritedFdCount({ LISTEN_PID: '42', LISTEN_FDS: bad }, 42), 0,
      `LISTEN_FDS=${JSON.stringify(bad)} must read as "I do not know what I was handed"`);
  }
  assert.equal(inheritedFdCount({ LISTEN_FDS: '4' }, 42), 0, 'no LISTEN_PID at all');
  assert.equal(inheritedFdCount({ LISTEN_PID: '42' }, 42), 0, 'no LISTEN_FDS at all');
});

test('④ zero descriptors is zero, never a floor of one', () => {
  // A supervisor that activated us with nothing is NOT the same thing as an
  // unsupervised run, and neither may be rounded up to "at least one".
  assert.equal(inheritedFdCount({ LISTEN_PID: '42', LISTEN_FDS: '0' }, 42), 0);
});

test('⑤ ANTI-VACUITY: the counter is really the one the daemon exports', () => {
  // A gate that passes because an import silently resolved to undefined looks
  // EXACTLY like a gate that found everything in order. Measured three times in
  // this repository.
  assert.equal(typeof inheritedFdCount, 'function',
    'inheritedFdCount is not exported — this whole file then measures nothing');
  assert.equal(SD_LISTEN_FDS_START, 3,
    'sd_listen_fds(3) defines the first descriptor as 3; the extra sockets are '
    + 'derived from it, so a drift here silently moves every one of them');
  // And the counter must DISAGREE with the single-descriptor reader it repairs:
  // if both answered the same thing, the defect would still be here.
  assert.notEqual(inheritedFdCount({ LISTEN_PID: '42', LISTEN_FDS: '4' }, 42),
    server.inheritedFd({ LISTEN_PID: '42', LISTEN_FDS: '4' }, 42),
    'the counter returns the COUNT (4) and inheritedFd the first DESCRIPTOR (3). '
    + 'Equal answers mean the count is being thrown away again.');
});
