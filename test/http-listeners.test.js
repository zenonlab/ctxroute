// http-listeners.test.js — the daemon really OPENS the sockets it was declared.
//
// 🔑 WHAT THIS EXISTS FOR. The accept queue is capped PER SOCKET (measured on this
//    platform: `min(backlog, 200) + 32` = 232, whatever the backlog argument says —
//    both it and `SOMAXCONN_HINT` are INERT from this runtime). N sockets give
//    N × 232, strictly linear. On 2026-09-18 the daemon's journal read
//    `peakConn = 254` against that 232 twelve seconds before a burst of refusals,
//    and Microsoft documents the signal exactly: a full queue answers
//    `WSAECONNREFUSED`. `http.listeners` is the remedy that follows.
// 🛑 AND THE CLASS THIS CELL CLOSES IS "ACCEPTED AND INERT" — this repository's
//    oldest defect: a key the schema takes, the resolver returns, and the daemon
//    never acts on. The operator would read a healthy start line and believe in a
//    capacity that does not exist, on a lane whose failure is a refused connection
//    carrying no error of ours anywhere. A unit test on the resolver cannot see
//    that; only driving the REAL shell can.
// ⚠️ THE ADDRESSES ARE NOT GUESSED. Every port is MEASURED free by binding it, and
//    the readiness of each socket is the KERNEL's own event — never a delay.
import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { fork } from 'node:child_process';
// 🛑 THE DEFAULTED COUNT COMES FROM ITS OWNER, never a literal here: a cell that
//    retypes the number it is supposed to guard agrees with itself, not with the code.
import { DEFAULT_LISTENERS } from '../src/declared-paths-pure.js';

const SHELL = path.join(import.meta.dirname, '..', 'src', 'hooks', 'http-daemon.js');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-listeners-'));
const DOCS = path.join(TMP, 'docs');
fs.mkdirSync(DOCS, { recursive: true });

const alive = new Set();
afterAll(() => {
  for (const child of alive) { try { child.kill(); } catch { /* already gone */ } }
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* best effort */ }
});

// ⚠️ The port comes from the ONE shared allocator (below the ephemeral range) — see test/support/free-port.js.
import { freePort } from './support/free-port.js';

/** ONE attempt. The kernel decides, with no delay used as a verdict. */
function attempt(port) {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host: '127.0.0.1' });
    const done = (verdict) => { sock.destroy(); resolve(verdict); };
    // ⚠️ ITS OWN CONNECT BOUND. On Windows a SYN to a loopback address is never
    //    retransmitted (`SIO_TCP_INITIAL_RTO`, `uv__is_loopback`), so an attempt
    //    that loses one can hang for the OS default instead of answering. The
    //    bound only turns a hang into an ANSWER — it decides nothing by itself.
    sock.setTimeout(1000, () => done(false));
    sock.once('connect', () => done(true));
    sock.once('error', () => done(false));
  });
}

/**
 * Does anyone answer there?
 *
 * 🔴 ONE REFUSED CONNECTION DOES NOT PROVE NOBODY IS LISTENING — MEASURED IN THIS
 *    SUITE ON 2026-09-20, AND THAT IS WHY THIS FUNCTION EXISTS INSTEAD OF A BARE
 *    `net.connect`. The accept queue is capped PER SOCKET at 232 on this platform
 *    (the header of this file measures it), and Microsoft documents that a FULL
 *    queue answers `WSAECONNREFUSED` — the exact code a closed port answers. So on
 *    a saturated machine the two facts are INDISTINGUISHABLE from one attempt, and
 *    the cell below read "the daemon never opened this socket" where the truth was
 *    "the machine had no millisecond to spare". A full suite run produced exactly
 *    that: `[true, false, true, true]` on four sockets a healthy daemon had opened.
 * 🛑 RETRYING STRENGTHENS BOTH DIRECTIONS, IT WEAKENS NEITHER. A port that MUST
 *    answer now gets until the bound to do so — load costs time, never a verdict.
 *    A port that MUST be silent must refuse EVERY attempt for the whole bound: a
 *    daemon squatting it would answer one of them. The bound is a NON-DECISION.
 * ⚠️ NOT a delay used as a verdict, and `temporal-budget.json` carries it with the
 *    motive `undecidable`: nothing here can settle when a saturated kernel will
 *    next have room in a queue, so the loop re-asks and the kernel answers.
 *
 * @param {number} port
 * @returns {Promise<boolean>} true as soon as ONE attempt connects
 */
async function answers(port) {
  const deadline = Date.now() + 3000;
  for (;;) {
    if (await attempt(port)) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((r) => { setTimeout(r, 25); });
  }
}

/** Forks the REAL production shell with a REAL declared config. */
function launch(name, port, listeners) {
  const dir = path.join(TMP, name);
  fs.mkdirSync(dir, { recursive: true });
  const config = path.join(dir, 'config.json');
  // ⚠️ The COUNT travels in the config, never in a variable: `CTXROUTE_HTTP_PORT`
  //    moves the port alone, which is exactly the asymmetry the resolver declares.
  fs.writeFileSync(config, JSON.stringify({
    enabled: true,
    showNotification: false,
    ...(listeners === null ? {} : { http: { listeners } }),
  }));
  const child = fork(SHELL, [], {
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    env: {
      ...process.env,
      CTXROUTE_HTTP_PORT: String(port),
      CTXROUTE_FILEDOCS_DIR: DOCS,
      CTXROUTE_CONFIG_PATH: config,
      CTXROUTE_STATE_DIR: path.join(dir, 'state'),
    },
  });
  alive.add(child);
  return child;
}

/** Waits until the FIRST port answers — the kernel's fact, then read the rest. */
async function ready(port) {
  for (let i = 0; i < 200; i += 1) {
    if (await answers(port)) return true;
    await new Promise((r) => { setTimeout(r, 25); });
  }
  return false;
}

test('① a declared count opens THAT MANY sockets, counting up from the port', async () => {
  const base = await freePort({ span: 3 });
  launch('three', base, 3);
  assert.ok(await ready(base), 'the daemon never began serving on its declared port');

  const seen = [];
  for (const p of [base, base + 1, base + 2]) seen.push(await answers(p));
  assert.deepEqual(seen, [true, true, true],
    `declared 3 listeners from ${base}: every port must answer, or the key is accepted and inert`);
});

test('② SEEN RED: with NOTHING declared, the DEFAULT count opens and the one after is SILENT', async () => {
  // 🛑 THE ANTI-VACUITY OF CELL ①. Without this, ① would pass just as well on a
  //    machine where something else happened to hold the neighbouring ports — and
  //    it would pass on a daemon that ignores the key entirely, which is the whole
  //    defect.
  // 🔴 IT READ "the neighbour port is SILENT" AND JUSTIFIED IT BY "zero default
  //    change is the acceptance criterion", WHICH WAS SUPERSEDED ON 2026-09-19:
  //    the operator set the default to 4 deliberately, so a daemon opening ONE
  //    socket with nothing declared would now be the defect. 🛑 The cell's INTENT
  //    is kept whole — nothing is squatted beyond what is asked, and the count is
  //    really acted upon — it is only the number that moved, and it moved to its
  //    OWNER rather than to another literal. Rewriting it around the constant is
  //    what keeps it honest the day that number changes again.
  const base = await freePort({ span: DEFAULT_LISTENERS + 1 });
  launch('default', base, null);
  assert.ok(await ready(base), 'the daemon never began serving on its declared port');

  const opened = [];
  for (let i = 0; i < DEFAULT_LISTENERS; i += 1) opened.push(await answers(base + i));
  assert.deepEqual(opened, opened.map(() => true),
    `nothing was declared, so the daemon must open the DEFAULT ${DEFAULT_LISTENERS} sockets from ${base}: `
    + 'a default that is accepted and inert gives the operator a capacity that does not exist.');

  assert.equal(await answers(base + DEFAULT_LISTENERS), false,
    `nothing was declared, so ${base + DEFAULT_LISTENERS} must be SILENT: a daemon binding a port nobody `
    + 'asked for would be squatting an address the operator never declared');
}, 30000);

test('③ a REFUSED count never starts a daemon at all — named, never clamped', async () => {
  // ⚠️ A silent clamp to 1 would be the cruellest outcome: the operator declared a
  //    capacity, the daemon runs, and the margin simply is not there.
  const base = await freePort();
  const child = launch('refused', base, 0);
  let stderr = '';
  if (child.stderr) child.stderr.on('data', (b) => { stderr += b; });
  const code = await new Promise((resolve) => child.once('exit', resolve));

  assert.notEqual(code, 0, 'an invalid declared count must refuse to start');
  assert.match(stderr, /http\.listeners/,
    `the refusal must NAME the key; it said: ${JSON.stringify(stderr.slice(0, 300))}`);
}, 30000);
