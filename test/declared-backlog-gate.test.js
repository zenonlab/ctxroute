// declared-backlog-gate — the backlog is DECLARED, and removing that declaration
// must go red instead of silently reverting to a platform default.
//
// 🔑 WHAT THIS SEALS, AND WHAT IT DELIBERATELY DOES NOT. It does NOT assert a
//    VALUE: that cell would be hollow (a constant asserting it is a constant) and
//    it would FREEZE a number this project has measured to be inert on Windows.
//    It asserts the DECLARATION — that somebody explicitly said what the queue
//    should be — because that is the thing whose removal is invisible.
// 🛑 THE FAILURE MODE IT CATCHES: drop the third argument of `listen()` and the
//    runtime silently substitutes its own default (Node 511, other stacks 128 or
//    5, and it varies by version). Nothing breaks, nothing reddens, and an
//    implicit dependency on a third party's default is back — the exact class this
//    repository removes everywhere else. Same for `Backlog=` in the socket unit:
//    delete the line and systemd falls back to SOMAXCONN, which older kernels put
//    at 128.
// ⚠️ IT IS ALSO WHY THE CONSTANT SURVIVED THE NIGHT ITS THEORY DIED. The
//    accept-queue explanation for `ECONNREFUSED` was measured dead
//    (`accept-queue-ceiling.md`) and the INSTALLER WALL built on it was removed —
//    but declaring a value you chose, instead of inheriting one you did not, is
//    good practice independently of why it was first written. **A wrong reason for
//    a right line does not make the line wrong.**
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');

test('① the daemon passes an EXPLICIT backlog to listen(), whatever its value', () => {
  const src = fs.readFileSync(path.join(root, 'src', 'hooks', 'http-server.js'), 'utf8');

  // The constant must exist and be a number — its VALUE is nobody's business here.
  const declared = /const\s+LISTEN_BACKLOG\s*=\s*(\d+)\s*;/.exec(src);
  assert.ok(declared,
    'LISTEN_BACKLOG is gone. The daemon now inherits whatever backlog its runtime '
    + 'picks, which varies by version and platform — an implicit dependency on a third '
    + 'party default, silently. Declare the value; the FIGURE is free to change.');

  // And it must actually REACH the listen call. A constant nobody passes is
  // decoration, and this repository has paid for gates that certify instead of
  // protecting more than once.
  assert.match(src, /server\.listen\(\s*port\s*,\s*host\s*,\s*LISTEN_BACKLOG\s*\)/,
    'the port lane no longer passes LISTEN_BACKLOG to listen(). The constant is then '
    + 'decoration and the real queue is the runtime default — the declaration exists on '
    + 'paper and not in the kernel.');
});

test('② the systemd socket unit DECLARES a backlog', () => {
  const unit = fs.readFileSync(path.join(root, 'service', 'ctxroute-http.socket'), 'utf8');
  const active = unit.split('\n').filter((l) => !l.trim().startsWith('#'));
  assert.ok(active.some((l) => /^\s*Backlog\s*=\s*\d+/.test(l)),
    'service/ctxroute-http.socket no longer declares Backlog=. systemd then falls back '
    + 'to SOMAXCONN, which pre-5.4 kernels put at 128 — the queue size becomes whatever '
    + 'the host happens to be, decided by nobody and written nowhere.');
});

test('③ ANTI-VACUITY: both files were really read', () => {
  // A gate that passes because a path stopped resolving looks EXACTLY like a gate
  // that found everything in order. Measured three times in this repository.
  for (const rel of ['src/hooks/http-server.js', 'service/ctxroute-http.socket']) {
    const full = path.join(root, rel);
    assert.ok(fs.existsSync(full), `${rel} not found — the cells above judged nothing`);
    assert.ok(fs.readFileSync(full, 'utf8').length > 200, `${rel} is suspiciously small`);
  }
});
