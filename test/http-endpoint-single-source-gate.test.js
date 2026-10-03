// ═══════════════════════════════════════════════════════════════════════
// THE DAEMON'S ADDRESS HAS TWO CONSUMERS AND THEY MAY NOT DISAGREE (2026-08-25)
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 THE DEFECT THIS CLOSES. One address was held in FOUR places, TWO PER FIELD:
//    a `HOST` constant and a `DEFAULT_PORT` constant in `src/hooks/http-server.js`
//    (what the daemon BINDS) facing `transport.host` and `transport.port` in
//    `wiring.json` (where the harness POSTs). Each pair agreed by luck; NOTHING
//    compared them. Same class as the 2026-08-22 split brain, where one truth in
//    nineteen hand-edited copies failed in silence.
// 🛑 AND HERE THE FAILURE WOULD BE TOTAL: the http lane has NO fallback, so a
//    wiring one number — or one NAME — away from the listener loses EVERY frame
//    of EVERY action; the tool simply runs, no error, no badge, and the agent
//    never learns it acted without the knowledge it was owed.
//
// 🛑 WHAT THIS GATE MEASURES, AND WHY IT IS NOT A READING. Both consumers are
//    driven FOR REAL against ONE declared address: the production entry point is
//    FORKED and BOTH halves of what it actually LISTENS with are read back — the
//    host from the arguments `listen` really received, the port from the kernel's
//    own event — and the generator is EXECUTED and the host and port it wrote
//    into the URL are parsed back out. A constant left behind on either side, on
//    either FIELD, makes them differ.
// ⚠️ ANTI-VACUITY, and it is the whole reason neither declared value is the
//    historical one: the port is a FREE port MEASURED by binding it and the host
//    is `localhost` (bindable on the three CI kernels, and NOT the string
//    `127.0.0.1`), so a consumer that ignored the configuration and kept a
//    historical constant FAILS this cell instead of passing it by coincidence.
//    The gate also asserts that what it compares was really OBSERVED (an unread
//    listener and an empty wiring would otherwise compare equal as `undefined`).
// ⚠️ SEEN RED by making the two DISAGREE (cell ②): the same daemon, a wiring
//    generated from a configuration declaring another address. That is the
//    defect itself, reproduced, and the comparison must reject it.
//
// ⚠️ NO TIMER ANYWHERE: readiness is the kernel's `listening` event, forwarded
//    over IPC by a preload that production knows nothing about. A daemon that
//    dies instead is a FACT, reported with its own stderr.
// ⚠️ Forking moves this suite into the HEAVY lane automatically
//    (`vitest-projects.mjs` classifies by CONTENT) — the intended mechanism.
// ═══════════════════════════════════════════════════════════════════════

import { test, afterAll, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fork, execFileSync } from 'node:child_process';
// 🛑 THE DEFAULTED SOCKET COUNT COMES FROM ITS OWNER. A literal here would be the
//    two-places-for-one-number divergence this gate was written to forbid.
import { DEFAULT_LISTENERS } from '../src/declared-paths-pure.js';

// 🛑 THE PRODUCTION ENTRY POINT, WHICH IS THE BOOTSTRAP — never `http-server.js`
//    (it refuses to run as a main module by name, because nothing would have
//    recorded the bytes it was compiled from).
const DAEMON = path.join(import.meta.dirname, '..', 'src', 'hooks', 'http-daemon.js');
const GENERATOR = path.join(import.meta.dirname, '..', 'tools', 'wiring-generate.js');

// 🛑 NEITHER OF THESE MAY BE A HISTORICAL DEFAULT — that is what makes the
//    comparison capable of seeing a surviving constant.
//    `localhost` is bindable on ubuntu, windows and macos (the CI matrix), while
//    an exotic loopback such as 127.0.0.2 is NOT assigned to `lo0` on macOS: the
//    daemon would die at `listen` and this gate would be reporting a platform,
//    not a mechanism.
const DECLARED_HOST = 'localhost';
const HISTORICAL_HOST = '127.0.0.1';
const HISTORICAL_PORT = 8787;

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-endpoint-source-'));
const DOCS = path.join(TMP, 'docs');
const OBSERVER = path.join(TMP, 'observer.cjs');
fs.mkdirSync(DOCS, { recursive: true });
afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

// The preload. A TEST artifact: production has no idea it can exist. It reports
// what `listen` really RECEIVED and what the kernel then answered, so readiness
// is the KERNEL's event and the address is the one the daemon truly asked for —
// never one we assumed.
// ⚠️ The ARGUMENTS are what carry the HOST: `address()` answers with a RESOLVED
//    address (`localhost` comes back as `::1` or `127.0.0.1` depending on the
//    kernel), so reading the host from there would compare a name to a number
//    and would be measuring the resolver, not this framework.
fs.writeFileSync(OBSERVER, `
'use strict';
const net = require('net');
const listenReal = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args) {
  const asked = args.map((a) => (typeof a === 'function' ? '[fn]' : a));
  this.once('listening', () => {
    let where = null;
    try { where = this.address(); } catch { where = null; }
    try { if (process.send) process.send({ listening: where, asked }); } catch { /* no channel: say nothing */ }
  });
  return listenReal.apply(this, args);
};
`);

/**
 * A port nobody is using — MEASURED by binding it, never guessed, and measured
 * ON THE HOST THAT WILL BE DECLARED: a port free on one loopback family proves
 * nothing about the other. From the ONE shared allocator (test/support/free-port.js).
 */
import * as sharedPort from './support/free-port.js';
// ⚠️ No `listeners` is declared here, so the daemon binds the DEFAULT count from its port.
const freePort = () => sharedPort.freePort({ host: DECLARED_HOST, span: DEFAULT_LISTENERS });

/**
 * Writes a configuration DECLARING one address, in its own directory.
 * ⚠️ NEVER the real fleet configuration: this suite must be blind to whatever
 *    the machine running it declares, or it would measure that machine instead
 *    of the mechanism.
 * 🛑 ONE grouped key, because a listening address is ONE fact: a `host` beside a
 *    `port` under two sibling keys would be the very disease this gate guards.
 */
function configDeclaring(name, host, port) {
  const file = path.join(TMP, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify({
    enabled: true, showNotification: false, frames: 2, afterFrames: 1, http: { host, port },
  }));
  return file;
}

/**
 * The environment BOTH consumers are given. `CTXROUTE_HTTP_PORT` is REMOVED on
 * purpose: it wins over the config key, so inheriting it from the operator's
 * shell would silence the very key under measurement.
 */
function environment(configPath, name) {
  const env = {
    ...process.env,
    CTXROUTE_CONFIG_PATH: configPath,
    CTXROUTE_FILEDOCS_DIR: DOCS,
    CTXROUTE_STATE_DIR: path.join(TMP, name, 'state'),
  };
  delete env.CTXROUTE_HTTP_PORT;
  return env;
}

const alive = new Set();

// 🛑 EVERY PATH, INCLUDING FAILURE. A daemon left behind holds a port and a
//    rendezvous, and the next cell would then measure the previous one's
//    process. Only OUR children, by their own handle — never a wide kill on
//    `node`, which would take this machine's other agents with it.
afterEach(async () => {
  const started = [...alive];
  alive.clear();
  for (const c of started) if (c.code === null) c.child.kill();
  await Promise.all(started.map((c) => c.done));
});

/** Forks the REAL daemon. Nothing is awaited here — every fact below is an event. */
function startDaemon(name, configPath) {
  const tracked = { stderr: '', listeners: [], code: null };
  const child = fork(DAEMON, [], {
    execArgv: ['--require', OBSERVER],
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    env: environment(configPath, name),
  });
  tracked.child = child;
  if (child.stderr) child.stderr.on('data', (b) => { tracked.stderr += b; });
  child.on('message', (m) => { if (m && typeof m === 'object' && 'listening' in m) tracked.listeners.push(m); });
  tracked.done = new Promise((r) => child.once('exit', (c) => { tracked.code = c; r(c); }));
  alive.add(tracked);
  return tracked;
}

/** A TCP listener answers with an object carrying a port; the rendezvous, a string. */
const TCP = (m) => Boolean(m) && Boolean(m.listening) && typeof m.listening === 'object'
  && typeof m.listening.port === 'number';

/**
 * The address the daemon REALLY listens with — the kernel's event for the port,
 * the arguments `listen` received for the host. Never a delay.
 */
function endpointListenedOn(tracked) {
  // 🔴 IT RESOLVED ON THE FIRST TCP `listen` IT SAW, and that stopped being an
  //    ANSWER the day the daemon opened more than one socket: the four binds race,
  //    so this returned `base + 1` against a configuration declaring `base` and
  //    accused the daemon of carrying a constant it does not carry (measured
  //    2026-09-19). ⇒ it now waits for the whole DECLARED block and returns its
  //    LOWEST port — the one the configuration names and the one every other
  //    address is derived from. ⚠️ Waiting for a COUNT, never for a delay: the
  //    count is a fact the configuration states, a delay would be a guess.
  const seen = (m) => ({ host: Array.isArray(m.asked) ? m.asked[1] : undefined, port: m.listening.port });
  const lowest = (ms) => ms.map(seen).sort((a, b) => a.port - b.port)[0];
  const already = tracked.listeners.filter(TCP);
  if (already.length >= DEFAULT_LISTENERS) return Promise.resolve(lowest(already));
  return new Promise((resolve, reject) => {
    const bound = [...already];
    const finish = () => { tracked.child.off('message', onMessage); tracked.child.off('exit', died); };
    const onMessage = (m) => {
      if (!TCP(m)) return;
      bound.push(m);
      if (bound.length < DEFAULT_LISTENERS) return;
      finish();
      resolve(lowest(bound));
    };
    const died = (code) => {
      finish();
      reject(new Error(`the daemon exited (code ${code}) before it ever listened on a port.\n--- its stderr ---\n${tracked.stderr.trim() || '(nothing)'}`));
    };
    tracked.child.on('message', onMessage);
    tracked.child.on('exit', died);
  });
}

/**
 * The address the GENERATOR wrote into the wiring — parsed back out of the URLs
 * it really produced. Fragment mode only: this suite never touches a settings.json.
 */
function endpointWiredBy(name, configPath) {
  const out = path.join(TMP, `${name}-fragment.json`);
  execFileSync(process.execPath, [
    GENERATOR, '--out', out, '--settings', 'C:/nowhere/settings.json', '--quiet',
  ], { env: environment(configPath, name), encoding: 'utf8' });
  const fragment = JSON.parse(fs.readFileSync(out, 'utf8'));
  const declarations = Array.isArray(fragment.declarations) ? fragment.declarations : [];
  const endpoints = new Set();
  for (const d of declarations) {
    if (typeof d.url !== 'string') continue;
    const u = new URL(d.url);
    endpoints.add(`${u.hostname}|${u.port}`);
  }
  // ⚠️ ANTI-VACUITY: no URL at all would return `undefined`, which compares equal
  //    to an unread listener. A wiring with nothing to point anywhere is not a
  //    wiring that agrees.
  assert.ok(endpoints.size >= 1,
    'the generated wiring names NO endpoint at all: there is nothing to compare, so this cell would certify whatever it found.');

  // 🔴 IT DEMANDED EXACTLY ONE ENDPOINT UNTIL 2026-09-19, and that reading became
  //    FALSE BY DESIGN the day `http.listeners` shipped. Its message read "above
  //    one the frames of a single action knock at different doors" — they now DO,
  //    deliberately: the accept queue is capped PER SOCKET, so the frames are
  //    spread round-robin over the sockets the configuration declares, and every
  //    door belongs to the SAME daemon. 🛑 The INTENT is kept whole and made
  //    STRICTER rather than relaxed: it forbade disagreement, so it now requires
  //    that EVERY endpoint be one the configuration declares — one host, and the
  //    exact contiguous block of ports — instead of forbidding the spread itself.
  //    Loosening it to "any endpoint will do" would have been an amputation.
  // ⚠️ THE EXPECTED COUNT IS IMPORTED FROM ITS OWNER, never retyped: a `4` written
  //    here would be a second place holding one number, which is the divergence
  //    this very gate exists to make impossible.
  const hosts = new Set([...endpoints].map((e) => e.split('|')[0]));
  assert.strictEqual(hosts.size, 1,
    `the generated wiring names ${hosts.size} distinct HOSTS (${[...hosts].join(', ')}): the frames of one action would knock at different machines, which no configuration can declare.`);
  // ⚠️ THE SPREAD REACHES `min(frames, listeners)` DOORS, NEVER ALWAYS ALL OF THEM
  //    — round-robin over N sockets with F frames touches the first `min(F, N)`.
  //    Demanding the whole block was measured WRONG on the first run (2 ports
  //    wired against 4 declared) and it is written here so nobody re-derives it.
  //    What is INVARIANT, and what actually loses frames when it breaks: no port
  //    outside the declared block, and the block anchored on the declared port.
  const ports = [...endpoints].map((e) => Number(e.split('|')[1])).sort((a, b) => a - b);
  const block = Array.from({ length: DEFAULT_LISTENERS }, (_, i) => ports[0] + i);
  const outside = ports.filter((p) => !block.includes(p));
  assert.deepStrictEqual(outside, [],
    `the generated wiring points at ${JSON.stringify(outside)}, outside the ${DEFAULT_LISTENERS} contiguous ports ${JSON.stringify(block)} the configuration declares. A frame pointed outside that block knocks where nothing listens, and the loss is silent.`);
  return { host: [...hosts][0], port: ports[0] };
}

// ── ① THE TWO CONSUMERS READ ONE DECLARATION ─────────────────────────
test('the daemon BINDS and the wiring POSTS TO the one address the configuration declares', async () => {
  const port = await freePort();
  assert.notStrictEqual(port, HISTORICAL_PORT,
    'the measured free port happens to be the historical default: this cell would then pass even for a consumer that ignores the configuration entirely.');
  assert.notStrictEqual(DECLARED_HOST, HISTORICAL_HOST,
    'the declared host is the historical constant: a `HOST` left behind in the daemon would pass this cell by coincidence.');
  const config = configDeclaring('agree', DECLARED_HOST, port);

  const daemon = startDaemon('agree', config);
  const bound = await endpointListenedOn(daemon);
  const wired = endpointWiredBy('agree', config);

  assert.deepStrictEqual(bound, { host: DECLARED_HOST, port },
    `the daemon listens with ${JSON.stringify(bound)} while the configuration declares ${JSON.stringify({ host: DECLARED_HOST, port })}. A constant survives inside the daemon, and the wiring knocks where nobody answers.`);
  assert.deepStrictEqual(wired, { host: DECLARED_HOST, port },
    `the generated wiring points at ${JSON.stringify(wired)} while the configuration declares ${JSON.stringify({ host: DECLARED_HOST, port })}. A constant survives on the wiring side, and every frame of every action is lost in silence.`);
  assert.deepStrictEqual(bound, wired,
    `the daemon listens with ${JSON.stringify(bound)} and the wiring posts to ${JSON.stringify(wired)}. That is the divergence this gate exists to make impossible.`);
});

// ── ② SEEN RED: THE COMPARISON MUST REJECT A REAL DISAGREEMENT ────────
//
// 🛑 A GATE NEVER SEEN FAILING IS A GATE ASSUMED TO WORK, and this repository's
//    worst defect has never been a red gate: it is a GREEN gate that sees
//    nothing. So the defect is REPRODUCED here — one daemon, and a wiring
//    generated from a configuration declaring ANOTHER address — and the equality
//    of cell ① is required to be FALSE on it, on BOTH fields.
// ⚠️ The sabotage is on the INPUT, never on a tracked file: nothing in the
//    source may carry a switch that makes this gate lie.
test('a wiring generated for another address DIFFERS from the one the daemon took', async () => {
  const port = await freePort();
  const elsewhere = await freePort();
  assert.notStrictEqual(port, elsewhere,
    'both measurements returned the same port: this cell would prove nothing at all.');

  const daemon = startDaemon('disagree', configDeclaring('disagree', DECLARED_HOST, port));
  const bound = await endpointListenedOn(daemon);
  const wired = endpointWiredBy('disagree-wiring', configDeclaring('disagree-wiring', HISTORICAL_HOST, elsewhere));

  assert.deepStrictEqual(bound, { host: DECLARED_HOST, port },
    'the control half of this cell did not hold: the daemon did not take the address it was given.');
  assert.deepStrictEqual(wired, { host: HISTORICAL_HOST, port: elsewhere },
    'the control half of this cell did not hold: the generator did not write the address it was given.');
  assert.notStrictEqual(bound.host, wired.host,
    'the comparison of cell ① cannot tell two different HOSTS apart, so it certifies whatever it finds.');
  assert.notStrictEqual(bound.port, wired.port,
    'the comparison of cell ① cannot tell two different PORTS apart, so it certifies whatever it finds.');
});
