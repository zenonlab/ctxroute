// 🛑 A BIND ERROR IS NEVER SWALLOWED — the guard for a class this repository
//    OPENED ITSELF on 2026-09-03 by leaving `127.0.0.1`.
//
// 🔑 WHY THE CLASS DID NOT EXIST BEFORE. The loopback is present on every
//    machine that boots, so a bind to it could only ever fail as a DUPLICATE —
//    `EADDRINUSE`, the one code the handler knew. A declared address that lives
//    on a real interface can be ABSENT, and then the handler was the only thing
//    between the fleet and total silence. It swallowed: MEASURED on Node
//    22.15.1 — `SWALLOWED: EADDRNOTAVAIL / process STILL ALIVE after bind
//    failure; listening = false`. Alive, deaf, no exception, no log line.
//
// 🛑 WHY IT IS WORSE THAN SILENT, and this is what makes the port lane's policy
//    differ from the rendezvous lane's: a port-less daemon GOES ON to take the
//    rendezvous, so it squats the address its own replacement needs and every
//    supervised restart dies on `EADDRINUSE`. A deaf daemon that stays alive
//    blocks its own relief, for ever.
//
// ⚠️ ZERO OS KNOWLEDGE IN THIS FILE. `EADDRNOTAVAIL` is a POSIX errno Node
//    normalises on all three platforms, and the address used below is in
//    `TEST-NET-3` (RFC 5737, reserved for documentation) — it belongs to no
//    interface anywhere, so the kernel refuses it identically everywhere. There
//    is no `if (win32)` here and none is ever needed.
//
// 🛑 NOT ONE DELAY IN THIS FILE, AND THAT IS THE POINT. `listen` reports its
//    failure ASYNCHRONOUSLY but the kernel is LOCAL and it SAYS SO — every wait
//    below is on the EVENT, never on a clock. A `setTimeout` here would be a
//    guess about something an authority already announces.

import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const httpServer = createRequire(import.meta.url)('../src/hooks/http-server');

// ⚠️ RFC 5737 reserves 203.0.113.0/24 for documentation. It is on no interface,
//    so `listen` fails with a REAL kernel error — never a simulated one.
const ADDRESS_ON_NO_INTERFACE = '203.0.113.1';

/** The minimum a built server needs; nothing here ever serves a request. */
const INERT = () => ({ inject: [], injectLockless: [], decision: 'none' });

/** @param {object} deps @returns {import('http').Server} */
function build(deps) {
  return httpServer.createServer(Object.assign({ store: new Map(), runFn: INERT }, deps));
}

test('ANTI-VACUITY: the probe really produces a kernel bind error', async () => {
  /** @type {string[]} */
  const seen = [];
  const server = build({ onLaneLost: (/** @type {NodeJS.ErrnoException} */ e) => seen.push(e.code || '?') });
  await new Promise((resolve) => {
    server.on('error', resolve); // fires AFTER the builder's own listener
    server.listen(0, ADDRESS_ON_NO_INTERFACE);
  });
  assert.deepStrictEqual(seen.length, 1,
    'the probe did not produce a bind failure at all — every cell below would '
    + 'then pass while measuring NOTHING, this repository\'s worst defect.');
  assert.ok(seen[0] === 'EADDRNOTAVAIL' || seen[0] === 'EINVAL',
    `expected the kernel to refuse an address held by no interface, got ${seen[0]}`);
  assert.deepStrictEqual(server.listening, false, 'the probe server bound after all');
});

test('an UNCLAIMED bind error reaches the lane-lost claimant, never silence', async () => {
  /** @type {string[]} */
  const seen = [];
  const server = build({ onLaneLost: (/** @type {NodeJS.ErrnoException} */ e) => seen.push(e.code || '?') });
  await new Promise((resolve) => {
    server.on('error', resolve);
    server.listen(0, ADDRESS_ON_NO_INTERFACE);
  });
  assert.deepStrictEqual(seen.length, 1,
    'the handler swallowed a bind error instead of handing it to its claimant — '
    + 'that is the 2026-09-03 defect, restored.');
});

test('with NO claimant the error is RETHROWN, never absorbed', async () => {
  // ⚠️ The rethrow leaves the builder's listener as an UNCAUGHT exception,
  //    which IS the guarantee: absent a claimant, the error resumes the natural
  //    course it would have taken had no listener existed at all.
  const server = build({});
  const thrown = await new Promise((resolve) => {
    const onUncaught = (/** @type {Error} */ err) => resolve(err);
    process.once('uncaughtException', onUncaught);
    server.listen(0, ADDRESS_ON_NO_INTERFACE);
  });
  const code = /** @type {NodeJS.ErrnoException} */ (thrown).code;
  assert.ok(code === 'EADDRNOTAVAIL' || code === 'EINVAL',
    'a bind error nobody claimed was absorbed, or lost its identity on the way '
    + `out (code: ${code}). The default must be the LOUD, natural course — a `
    + 'default that absorbs re-creates the defect one layer up.');
});

test('CONTROL: a reachable address claims nothing — the guard is not always-on', async () => {
  /** @type {string[]} */
  const seen = [];
  const server = build({ onLaneLost: (/** @type {NodeJS.ErrnoException} */ e) => seen.push(e.code || '?') });
  await new Promise((resolve) => { server.listen(0, '127.0.0.1', resolve); });
  assert.deepStrictEqual(seen, [],
    'a healthy bind fired the failure path — a guard that always fires is a '
    + 'guard that says nothing.');
  assert.deepStrictEqual(server.listening, true, 'the control server is not listening');
  await new Promise((resolve) => server.close(resolve));
});

test('EADDRINUSE still goes to ITS OWN claimant, and not to the new one', async () => {
  const first = build({});
  await new Promise((resolve) => { first.listen(0, '127.0.0.1', resolve); });
  const port = /** @type {import('net').AddressInfo} */ (first.address()).port;

  /** @type {string[]} */
  const inUse = [];
  /** @type {string[]} */
  const laneLost = [];
  const second = build({
    onAddressInUse: (/** @type {NodeJS.ErrnoException} */ e) => inUse.push(e.code || '?'),
    onLaneLost: (/** @type {NodeJS.ErrnoException} */ e) => laneLost.push(e.code || '?'),
  });
  await new Promise((resolve) => {
    second.on('error', resolve);
    second.listen(port, '127.0.0.1');
  });

  assert.deepStrictEqual(inUse, ['EADDRINUSE'],
    'the duplicate-instance claimant stopped receiving its own error — the '
    + 'kernel is the authority on duplicates and this is how we hear it.');
  assert.deepStrictEqual(laneLost, [],
    'a CLAIMED code leaked into the lane-lost path: the two claims must not '
    + 'overlap, or the shell would take two decisions for one fact.');

  await new Promise((resolve) => first.close(resolve));
});

test('the RENDEZVOUS lane claims lane-lost explicitly — removing it kills the daemon', () => {
  // 🛑 DERIVED FROM THE SOURCE, and it guards a defect that already shipped
  //    once: `kernel-bind` attaches its OWN `once('error')` to inspect a
  //    possibly dead socket file, and the builder's listener is registered
  //    FIRST. Without an explicit claim on the rendezvous server, the default
  //    rethrow fires before that inspection ever runs — which is exactly the
  //    "a builder decides whether its caller lives" defect of 2026-08-20.
  const source = fs.readFileSync(
    path.join(import.meta.dirname, '..', 'src', 'hooks', 'http-server.js'), 'utf8');
  const at = source.indexOf('THE SECOND LISTENER');
  assert.ok(at > 0, 'the rendezvous section was not found — this cell is measuring nothing');
  const rendezvous = source.slice(at);
  // ⚠️ SINCE 2026-09-23 THE HOOKS LIVE IN `rendezvousLaneHooks()`, so the claim is proven by
  //    BEHAVIOUR on the real function, and the source is only asked whether `main` passes it.
  //    The text match on `onLaneLost: () => {}` it replaces could not see the SECOND hook,
  //    `onAddressInUse`, whose throw is what kept the daemon from coming back on macOS.
  assert.ok(/\.\.\.rendezvousLaneHooks\(\)/.test(rendezvous),
    'the rendezvous server no longer receives `rendezvousLaneHooks()`: whatever it gets instead is '
    + 'judged by nothing here.');
  // ⚠️ And its refusal is journalled through the pure `rendezvousRefusal` (branch + unlinkCode), the
  //    fields that told a correct refusal from the macOS defect: an inline record could drop them unseen.
  assert.ok(/lifecycle\.record\('bind-refused', lifecyclePure\.rendezvousRefusal\(/.test(rendezvous),
    'the rendezvous refusal is no longer journalled through `rendezvousRefusal`: its branch fields are judged by nothing');
  const hooks = httpServer.rendezvousLaneHooks();
  for (const [name, code] of [['onLaneLost', 'EACCES'], ['onAddressInUse', 'EADDRINUSE']]) {
    assert.equal(typeof hooks[name], 'function', `the rendezvous lane no longer claims \`${name}\`: the builder would rethrow`);
    const err = Object.assign(new Error(code), { code });
    assert.doesNotThrow(() => hooks[name](err),
      `the rendezvous lane's \`${name}\` THROWS: the builder's listener runs before \`kernel-bind\`, so a dead `
      + 'socket file (macOS) kills a daemon whose PORT lane is healthy, and it never comes back.');
  }
});
