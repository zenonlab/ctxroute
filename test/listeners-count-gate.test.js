import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import declared from '../src/declared-paths-pure.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOCKET_UNIT = path.join(ROOT, 'service', 'ctxroute-http.socket');
const PLIST = path.join(ROOT, 'service', 'com.ctxroute.http.plist');

// ═══════════════════════════════════════════════════════════════════════
// THE SUPERVISOR'S SOCKET COUNT AND OUR DEFAULT ARE ONE FACT
// ═══════════════════════════════════════════════════════════════════════
// 🔴 THIS GATE EXISTS BECAUSE THE UNITS' GATE WAS GREEN ON THE DEFECT (2026-09-19).
//    `http.listeners` moved from 1 to 4 and `service-units-gate` stayed green while
//    the Linux unit still declared ONE socket — the class it could not see, because
//    it judges each file's SHAPE and nobody judged their AGREEMENT.
// 🛑 WHAT THE DISAGREEMENT COSTS IS A BOOT FAILURE, NOT A DEGRADATION. Under socket
//    activation the daemon compares the count it is handed to the count the config
//    declares and REFUSES to start when they differ — deliberately, because serving
//    fewer sockets would drop that share of EVERY action in silence. So a unit left
//    behind does not "run smaller": it does not run.
// 🔑 DERIVED FROM THE SOURCE ON BOTH SIDES — the constant is imported, never copied,
//    and the counts are read off the real shipped units. A gate holding its own
//    expectation of "4" would be the third copy of the fact it exists to unify.

/** `ListenStream=` lines of the systemd socket unit, comments excluded. */
function linuxSockets(text) {
  return text.split('\n')
    .map((l) => l.trim())
    .filter((l) => !l.startsWith('#') && /^ListenStream\s*=/.test(l));
}

/** `SockServiceName` entries of the launchd plist — one per listening socket. */
function macosSockets(text) {
  return text.split('\n').filter((l) => l.includes('<key>SockServiceName</key>'));
}

test('① the systemd socket unit declares EXACTLY the default number of sockets', () => {
  const wanted = declared.DEFAULT_LISTENERS;
  // ANTI-VACUITY: a constant that came back undefined would make every comparison
  // below vacuous, and a unit file we failed to read would look like an empty one.
  assert.ok(Number.isInteger(wanted) && wanted >= 1,
    `DEFAULT_LISTENERS is ${JSON.stringify(wanted)} — the gate has nothing to compare against.`);
  const text = fs.readFileSync(SOCKET_UNIT, 'utf8');
  assert.ok(text.length > 200, 'the socket unit read back as (nearly) empty.');

  const found = linuxSockets(text);
  assert.equal(found.length, wanted,
    `the configuration defaults to ${wanted} listening socket(s) and `
    + `${SOCKET_UNIT} declares ${found.length}. Under socket activation the daemon `
    + 'REFUSES to start on that mismatch, so this is a boot failure, not a smaller '
    + 'capacity. Add or remove `ListenStream=127.0.0.1:<port>` lines until the two '
    + `numbers agree.\nDeclared: ${JSON.stringify(found)}`);
});

test('② the launchd plist declares the SAME number', () => {
  const wanted = declared.DEFAULT_LISTENERS;
  const text = fs.readFileSync(PLIST, 'utf8');
  assert.ok(text.includes('<key>Sockets</key>'),
    'the plist no longer declares a `Sockets` dictionary — either socket activation '
    + 'was removed on macOS (a decision that belongs in its own doc) or this gate is '
    + 'reading the wrong file.');

  const found = macosSockets(text);
  assert.equal(found.length, wanted,
    `the configuration defaults to ${wanted} listening socket(s) and ${PLIST} `
    + `declares ${found.length}. launchd hands the daemon exactly what this file `
    + 'names, and the daemon refuses any other count. ⚠️ On macOS the descriptors '
    + 'arrive through `service/launchd-socket-shim.c`, which must publish ALL of '
    + 'them (LISTEN_FDS = the count, descriptors 3..3+N-1) — declaring N here while '
    + 'the shim forwards only the first hands the daemon 1 and it refuses to start.');
});

test('③ CONTROL: a unit left one socket behind FAILS cell ①', () => {
  // 🛑 The sabotage is the REAL defect — a unit that kept its single socket while
  //    the default moved — replayed IN MEMORY, so this control cannot go stale
  //    against the files it judges.
  const text = fs.readFileSync(SOCKET_UNIT, 'utf8');
  const kept = linuxSockets(text);
  assert.ok(kept.length > 1,
    'the unit declares one socket or none, so removing one proves nothing: this '
    + 'control is only meaningful while the default is above 1.');

  const sabotaged = kept.slice(0, 1);
  assert.notEqual(sabotaged.length, declared.DEFAULT_LISTENERS,
    'stripping the unit down to a single socket still matches the default — the '
    + 'analyser is blind to the very disagreement it exists for.');
});
