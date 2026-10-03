// thread-pool-differential — ONE THREAD AND N THREADS ANSWER THE SAME BYTES.
//
// 🔑 THIS IS THE OPERATOR'S ACCEPTANCE CRITERION, AND IT IS NOT SPEED: *"the
//    facade identical to the BYTE for the agents; the inside is free"*. A pool
//    that answered a little differently would be a rewrite wearing the daemon's
//    name, and the agents would be the ones to find out.
//
// 🛑 IT IS THE THIRD DIFFERENTIAL OF THIS REPOSITORY AND IT COPIES THE OTHER
//    TWO ON PURPOSE (`pretool-differential`, `http-lane-differential`). The
//    second one is exactly what made the move to HTTP safe; this is the same
//    question asked of the move to threads. 🛑 The SINGLE-THREAD daemon is the
//    ORACLE — it is what production has run — and the pool is the suspect until
//    a measurement says otherwise.
//
// ⚠️ TWO REAL PROCESSES, REAL SOCKETS, REAL WORKERS. Driving `createServer` in
//    memory would prove the handler and nothing about the wiring, and the
//    wiring is what this step added: which thread binds which socket, who owns
//    the tables, who answers a store read. A green on a twin is not a green on
//    the thing.
//
// 🔴 THE DEFECT THIS CLASS ALREADY PAID FOR, on the socket side, 2026-09-18:
//    each socket built its OWN sequencer table, so one document of 17 chunks
//    over 32 frames had chunks 1..8 delivered FOUR TIMES and chunks 9..17
//    delivered NEVER. The duplication was visible; the loss was not. Cell ③ is
//    the shape that would see it again: every chunk exactly once.

import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { fork } from 'node:child_process';

const SHELL = path.join(import.meta.dirname, '..', 'src', 'hooks', 'http-daemon.js');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-pool-diff-'));
const DOCS = path.join(TMP, 'docs');
fs.mkdirSync(DOCS, { recursive: true });

// A document big enough to be SPLIT over several frames — the only shape where
// the invocation tables decide anything at all.
fs.writeFileSync(path.join(DOCS, 'server.md'), `---
match: server.js
mode: dumb
---
${Array.from({ length: 60 }, (_, i) => `- invariant ${i}: ${'x'.repeat(200)}`).join('\n')}
`);

const alive = new Set();
afterAll(() => {
  for (const child of alive) { try { child.kill(); } catch { /* already gone */ } }
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* best effort */ }
});

// ⚠️ The port comes from the ONE shared allocator (below the ephemeral range) — see test/support/free-port.js.
import { freePort } from './support/free-port.js';

/** Does anyone answer there? The kernel decides, with no delay as a verdict. */
function answers(port) {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host: '127.0.0.1' });
    const done = (verdict) => { sock.destroy(); resolve(verdict); };
    sock.once('connect', () => done(true));
    sock.once('error', () => done(false));
  });
}

/**
 * Forks the REAL production shell. `workers: 0` is the oracle — today's daemon,
 * byte for byte — and a positive number is the pool.
 */
function launch(name, port, listeners, workers) {
  const dir = path.join(TMP, name);
  fs.mkdirSync(dir, { recursive: true });
  const config = path.join(dir, 'config.json');
  fs.writeFileSync(config, JSON.stringify({
    enabled: true,
    showNotification: false,
    http: { listeners, workers },
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
  let complaints = '';
  child.stderr.on('data', (c) => { complaints += c; });
  alive.add(child);
  return { child, said: () => complaints };
}

/**
 * How long a daemon is given to begin serving before the cell reports failure.
 *
 * 🛑 IT ONLY HAS TO BE LARGE, NEVER RIGHT. A POOLED daemon starts an owner and
 *    N server threads, each its own V8 isolate compiling its own copy of the
 *    module graph, so it needs several times the startup work of the single
 *    one — and this lane runs CONCURRENTLY beside suites that deliberately
 *    block their event loops. 🔴 MEASURED 2026-09-20: at ten seconds these two
 *    cells went RED beside `scale-bench`, on a daemon that was perfectly
 *    correct. Widening a bound that decides NOTHING is free; what would not be
 *    free is turning its exhaustion into a quiet pass, and it stays a reported
 *    FAILURE carrying the child's stderr.
 */
const READY_ATTEMPTS = 2400;

/** Waits until every declared port answers — the kernel's fact, never a guess. */
async function ready(base, listeners) {
  for (let attempt = 0; attempt < READY_ATTEMPTS; attempt += 1) {
    const seen = [];
    for (let i = 0; i < listeners; i += 1) seen.push(await answers(base + i));
    if (seen.every(Boolean)) return true;
    await new Promise((r) => { setTimeout(r, 25); });
  }
  return false;
}

/**
 * How many times a POST that never reached the daemon is re-attempted.
 *
 * 🔴 MEASURED 2026-09-20 ON THE FULL LANE: cell ① fell on `read ECONNRESET` — a
 *    CLIENT error, never an assertion. The integration lane is CONCURRENT and
 *    these cells drive REAL daemons on REAL addresses beside suites that
 *    deliberately block their event loops; Windows loopback then refuses or
 *    resets connections that never reached anybody.
 * 🛑 IT RETRIES THE HARNESS'S OWN CONNECTION NOISE AND NOTHING THE DAEMON DOES.
 *    Only the three KERNEL codes, immediately, with no sleep: each one is the
 *    FACT *"this attempt did not reach the daemon"*, never a guessed delay. An
 *    answer that ARRIVES is compared as it is — a retry can never repair a
 *    wrong byte, which is the only thing this differential judges.
 * 📐 Same remedy, same number and same reason as `scale-bench`'s own
 *    `PRETOOL_REQUEST_RETRIES`, measured there on a host already running ~62
 *    node processes.
 */
const POST_RETRIES = 25;

/** The kernel codes that mean the attempt never reached anybody. */
const UNREACHED = ['ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET'];

/** One frame of one action, POSTed exactly as the harness POSTs it. */
function postOnce(port, payload, frame, frames) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = http.request({
      host: '127.0.0.1',
      port,
      method: 'POST',
      agent: false,
      path: `/pretool?frame=${frame}&frames=${frames}`,
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
    }, (res) => {
      let text = '';
      res.on('data', (c) => { text += c; });
      res.on('end', () => resolve(text));
    });
    req.on('error', reject);
    req.end(body);
  });
}

/**
 * One frame, re-attempted while the kernel says it never arrived.
 * @returns {Promise<string>}
 */
async function postFrame(port, payload, frame, frames) {
  for (let attempt = 0; attempt <= POST_RETRIES; attempt += 1) {
    try {
      return await postOnce(port, payload, frame, frames);
    } catch (err) {
      const code = err && /** @type {NodeJS.ErrnoException} */ (err).code;
      // 🛑 ANY OTHER ERROR IS REAL AND IS RETHROWN — retrying it would HIDE it,
      //    which is the class this repository refuses everywhere else.
      if (!UNREACHED.includes(code) || attempt === POST_RETRIES) throw err;
    }
  }
  throw new Error('unreachable: the loop above either returns or rethrows');
}

/**
 * Every frame of one action, IN ORDER — the frames of an action are spread over
 * the declared sockets exactly as `wiring-generate` spreads them.
 */
async function wholeAction(base, listeners, id, frames) {
  const payload = {
    tool_name: 'Bash',
    tool_input: { command: 'cat C:/proj/server.js' },
    session_id: 'sess-diff',
    tool_use_id: id,
  };
  const answersSeen = [];
  for (let k = 1; k <= frames; k += 1) {
    answersSeen.push(await postFrame(base + ((k - 1) % listeners), payload, k, frames));
  }
  return answersSeen;
}

const LISTENERS = 2;
const FRAMES = 6;

test.sequential('① ONE THREAD and TWO THREADS answer an entire action with the SAME bytes', async () => {
  const soloPort = await freePort({ span: LISTENERS });
  const solo = launch('solo', soloPort, LISTENERS, 0);
  assert.ok(await ready(soloPort, LISTENERS), `the single-thread daemon never served: ${solo.said()}`);
  const oracle = await wholeAction(soloPort, LISTENERS, 'inv-diff', FRAMES);

  const poolPort = await freePort({ span: LISTENERS });
  const pooled = launch('pool', poolPort, LISTENERS, 2);
  assert.ok(await ready(poolPort, LISTENERS), `the pooled daemon never served: ${pooled.said()}`);
  const routed = await wholeAction(poolPort, LISTENERS, 'inv-diff', FRAMES);

  // 🛑 ANTI-VACUITY FIRST: a comparison of two silences is green and proves
  //    nothing. The oracle must actually have delivered something.
  const carried = oracle.filter((text) => text.includes('additionalContext')).length;
  assert.ok(carried > 0, `the oracle delivered nothing at all, so the comparison measures nothing: ${oracle[0]}`);

  assert.deepEqual(routed, oracle,
    'a pooled daemon must answer every frame exactly as the single-threaded one does');
}, 180000);

test.sequential('② EVERY CHUNK EXACTLY ONCE across the pool — the defect the sockets already paid for', async () => {
  // 🔴 ONE TABLE PER PARTICIPANT is what this forbids. On 2026-09-18 the same
  //    mistake made on SOCKETS delivered chunks 1..8 four times each and chunks
  //    9..17 never — and with threads the tables cannot even be shared by
  //    accident: a `Map` handed to a worker is COPIED. Only the owner makes
  //    this hold.
  const port = await freePort({ span: LISTENERS });
  const pooled = launch('once', port, LISTENERS, 2);
  assert.ok(await ready(port, LISTENERS), `the pooled daemon never served: ${pooled.said()}`);
  const seen = await wholeAction(port, LISTENERS, 'inv-once', FRAMES);
  const chunks = seen
    .map((text) => (text.match(/CHUNK (\d+)\/(\d+)/) || [])[1])
    .filter((n) => n !== undefined);
  assert.ok(chunks.length > 1, `the corpus must really fragment, saw ${chunks.length} chunk(s)`);
  assert.equal(new Set(chunks).size, chunks.length,
    `a chunk was served twice across the pool: ${chunks.join(',')}`);
}, 180000);

test.sequential('③ a pool LARGER than the socket count never starts — named, never clamped', async () => {
  const port = await freePort({ span: LISTENERS });
  const refused = launch('too-many', port, 2, 4);
  // 🛑 THE KERNEL IS THE WITNESS, NOT A DELAY: nothing must ever answer there.
  //    A daemon that clamped itself to two threads would answer, and an operator
  //    would run a pool of a size they never declared.
  const exit = await new Promise((resolve) => refused.child.once('exit', resolve));
  assert.notEqual(exit, 0, 'a refused declaration must not produce a serving daemon');
  assert.match(refused.said(), /only 2 socket/,
    'the refusal must say BOTH numbers — a reader cannot tell a wrong cap from a wrong payload otherwise');
  assert.equal(await answers(port), false, 'nothing may be listening after a refusal');
}, 180000);
