// ═══════════════════════════════════════════════════════════════════════
// service/ — the Windows dedicated adapter: its reconciler, its boot task.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 WHAT THIS GUARDS, AND WHY IT CANNOT BE GUARDED ANYWHERE ELSE. The Windows
//    profile leaves `127.0.0.0/8` because libuv disables SYN retransmission on
//    any address whose first byte is 127. That fix is a MACHINE state — an
//    adapter and an address — reconciled by a script and a scheduled task that
//    no other suite reads. A drift here is silent: the daemon simply cannot
//    bind, and the whole fleet loses its injection.
// ⚠️ This suite reads FILES, never a machine: it must pass on Linux CI, on a
//    clean clone, and on a Windows box that never installed anything. What it
//    proves is that the DECLARATIONS agree with each other — the live machine is
//    `doctor.js --settings`'s job.

import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// ⚠️ Through `resolveDeclaredHttp`, the REAL road a declared address travels —
//    never an internal helper. A gate that probes a private function proves the
//    helper works, not that the configuration would be accepted.
import { resolveDeclaredHttp } from '../src/declared-paths-pure.js';

const SERVICE = path.join(import.meta.dirname, '..', 'service');
const read = (f) => fs.readFileSync(path.join(SERVICE, f), 'utf8');

const INSTALLER = 'install-windows.ps1';
const RECONCILER = 'reconcile-adapter-windows.ps1';
const TASK_XML = 'ctxroute-adapter.task.xml';
const DECLARER = 'declare-http-address.js';

test('the three adapter files EXIST — a referenced file that is absent fails at boot, silently', () => {
  for (const f of [INSTALLER, RECONCILER, TASK_XML, DECLARER]) {
    assert.ok(fs.existsSync(path.join(SERVICE, f)), `service/${f} is missing`);
  }
});

test('the installer REFERENCES every adapter file — no orphan, no second procedure', () => {
  // 🛑 The class this closes is "a truth held in two places": a registration or
  //    an address written anywhere but in these files would be a second
  //    procedure, and it is always the copy that rots.
  const installer = read(INSTALLER);
  for (const f of [RECONCILER, TASK_XML, DECLARER]) {
    assert.ok(installer.includes(f), `${INSTALLER} never mentions ${f} — it would be an orphan`);
  }
});

test('the boot task runs as SYSTEM, at BOOT, elevated, and BOUNDED', () => {
  const xml = read(TASK_XML);
  assert.match(xml, /<BootTrigger>/,
    'BOOT, not logon: the address must exist BEFORE the daemon task starts at logon.');
  assert.match(xml, /<UserId>S-1-5-18<\/UserId>/,
    'SYSTEM is always available, needs no stored password and never raises a UAC prompt — '
    + 'that is what makes elevation a ONE-TIME cost, paid at registration.');
  assert.match(xml, /<RunLevel>HighestAvailable<\/RunLevel>/,
    'Creating a network adapter requires elevation.');
  assert.match(xml, /<ExecutionTimeLimit>PT\d+M<\/ExecutionTimeLimit>/,
    'A short convergence is BOUNDED. PT0S ("run indefinitely") belongs to the daemon, not here: '
    + 'a reconciler that hangs must be stopped, never held open.');
});

test('the task XML carries the placeholders the installer substitutes, by SHAPE', () => {
  // ⚠️ `Set-XmlValues` replaces the text of every <Tag>…</Tag>. A tag the
  //    installer substitutes but the XML does not carry makes the installer
  //    throw; a tag the XML carries and nobody substitutes ships a task
  //    pointing at CHANGE_ME, which fails in a way nobody reads.
  const xml = read(TASK_XML);
  for (const tag of ['Command', 'Arguments']) {
    assert.match(xml, new RegExp(`<${tag}>[^<]+</${tag}>`), `<${tag}> is absent from ${TASK_XML}`);
    assert.ok(read(INSTALLER).includes(`Set-XmlValues $adapterXml '${tag}'`),
      `${INSTALLER} never substitutes <${tag}> — the task would ship its placeholder`);
  }
});

test('the reconciler READS the address, it never spells one — single source', () => {
  // 🔴 The class: one truth in two places. The address the daemon BINDS, the one
  //    the wiring POSTs to and the one the adapter CARRIES must be the same
  //    fact, resolved once by `paths.httpEndpoint()`.
  const rec = read(RECONCILER);
  assert.match(rec, /httpEndpoint\(\)/,
    'The reconciler must read the declared address, never carry a constant of its own.');
});

test('the installer UNREGISTERS the boot task on uninstall — no privileged orphan', () => {
  const installer = read(INSTALLER);
  assert.match(installer, /Unregister-ScheduledTask -TaskName \$AdapterTask/,
    'A privileged boot task left behind, reconciling an adapter for a daemon nobody runs, is the '
    + 'orphan class.');
});

test('the installer NEVER deletes the adapter on uninstall — that gesture is explicit', () => {
  // 🛑 An uninstall must not silently remove a network interface an operator may
  //    have pointed something else at. Removal has its own named action.
  const rec = read(RECONCILER);
  assert.match(rec, /ValidateSet\('reconcile', 'remove'\)/,
    'Removal must exist as an EXPLICIT action of the reconciler.');
});

test('🔑 THE INSTALLER DEFAULT ADDRESS IS ONE THE ENGINE ACCEPTS', () => {
  // 🔴 THIS IS THE CROSS-CHECK THAT MATTERS, and neither side could make it
  //    alone: `hostOf` REFUSES any address that publishes the daemon (it has no
  //    authentication), while the installer SHIPS a default. A default the
  //    engine refuses would make a fresh install fail at the first bind, on a
  //    machine whose operator changed nothing.
  const installer = read(INSTALLER);
  const m = /\[string\]\$Address = '([^']+)'/.exec(installer);
  assert.ok(m, 'the installer must declare its default address as a parameter');
  const address = m[1];
  const resolve = () => resolveDeclaredHttp({ readConfiguredHttp: () => ({ host: address }) });
  assert.doesNotThrow(resolve,
    `the installer default ${address} is REFUSED by the engine — a fresh install would not bind`);
  assert.equal(resolve().host, address, 'and it must resolve to exactly what the installer ships');
  assert.ok(!address.startsWith('127.'),
    `${address} is inside 127.0.0.0/8, which is the very defect the adapter exists to leave`);
});

test('the reconciler REFUSES an address that belongs to another interface', () => {
  // ⚠️ Taking over an address this framework does not own could break whatever
  //    holds it. Fail-closed, and NAMED.
  const rec = read(RECONCILER);
  assert.match(rec, /CONFLICT:/,
    'A conflicting address must produce a named refusal, never a silent takeover.');
});

test('🔑 the adapter is pinned BELOW every real interface — the documented failure lever', () => {
  // 🔴 MEASURED 2026-09-02 on the maintainer's machine: Windows gave this adapter
  //    an automatic metric of 25 while the Wi-Fi carrying all the traffic had 35.
  //    A LOWER metric is a HIGHER priority, so a virtual adapter leading nowhere
  //    outranked the real one. Harmless with a /32 — it covers exactly its own
  //    address, so there is nothing for it to win — but it is the exact lever
  //    behind the two failures documented on Microsoft Q&A (a broken phone
  //    hotspot; pings answering "General failure"), and it costs NOTHING to
  //    remove: binding a local address consults no metric at all.
  const rec = read(RECONCILER);
  assert.match(rec, /-InterfaceMetric 9999/,
    'The adapter must be pinned to the lowest priority, or it can outrank a real interface.');
  assert.match(rec, /AutomaticMetric/,
    'The reason must be written down: without disabling the automatic metric, Windows recomputes '
    + 'it and the class returns at the next boot.');
});

test('🔑 the installer NEVER reads a value by requiring a module that STARTS something', () => {
  // 🔴 MEASURED 2026-09-03, the first time this installer was ever exercised with
  //    a daemon already running: it read the port with `require(http-daemon.js)`,
  //    and that module starts a daemon when it is loaded. The read therefore
  //    tried to bind a SECOND instance, failed with EADDRINUSE on the rendezvous
  //    pipe, and the installer exited 1 -- after doing all of its real work. It
  //    worked on a fresh machine and broke on every RE-install, which is the
  //    idempotent path this file exists to support.
  // 🛑 The class is bigger than the port: asking a SHELL for a value runs the
  //    shell. Values come from the resolution point.
  const installer = read(INSTALLER);
  assert.ok(!/require\('[^']*hooks\/http-daemon\.js'\)/.test(installer),
    'requiring the daemon shell to read a constant starts a daemon');
  assert.ok(installer.includes("/src/paths.js"),
    'the port must be read from paths.js, the single resolution point');
  assert.ok(installer.includes('.httpEndpoint().port'),
    'and through httpEndpoint(), which resolves an address and starts nothing');
});

test('the reconciler PROVES its result instead of trusting that nothing threw', () => {
  const rec = read(RECONCILER);
  assert.match(rec, /still absent after being set/,
    'It must re-read the address it just set.');
  assert.match(rec, /not Manual/,
    'An auto-assigned address moves at the next boot: only a Manual origin is the desired state.');
});
