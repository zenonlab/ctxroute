// thread-listener — CAN A THREAD OWN A LISTENING SOCKET? The question that
// decides whether a real multi-core daemon is reachable here.
//
// 🔴 WRITTEN 2026-09-19 BECAUSE THE RECORDED ARCHITECTURE WAS NOT ONE. The plan
//    said "the main thread ACCEPTS, DECIDES and RESPONDS; a pool of workers
//    BUILDS" — which keeps accept, parsing and the response on ONE thread. That
//    is compute parallelism, not a network daemon: nginx and HAProxy have N
//    workers that each ACCEPT. The operator is the one who broke it, by asking
//    the only question that decides — "is it REAL multi-core, like a real HTTP
//    daemon?" — and the answer was no.
//
// 🔑 SO THIS IS A MEASUREMENT, NOT A UNIT TEST, and it is kept for two reasons
//    that a loose probe in a scratch directory could not serve:
//    ① it RUNS ON THE THREE KERNELS through the same CI matrix as everything
//       else, and Linux and macOS are exactly where this repository has measured
//       NOTHING about threads — the blocker the backlog names by name;
//    ② it is a DRIFT-TEST ON A THIRD PARTY, the same shape
//       `http-daemon-lifecycle.md` uses for the port-holding parent: the day a
//       platform gains a capability it does not have today, a cell here changes
//       its answer instead of the knowledge quietly going stale.
//
// 🛑 IT ASSERTS WHAT IS UNIVERSAL AND REPORTS WHAT IS PER-PLATFORM. A thread
//    owning its own listener is load-bearing everywhere, so it is an ASSERTION.
//    Whether two threads may share ONE port is a KERNEL property — available
//    where `SO_REUSEPORT` is, refused on Windows — so it is RECORDED per
//    platform and only asserted where the answer is already measured. A cell
//    that demanded one kernel's behaviour of another would be red on correct
//    systems, hence disarmed within the week.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { Worker } from 'node:worker_threads';

// ⚠️ THE WORKER'S SOURCE IS WRITTEN TO THE OS TMPDIR, never into `src/` or
//    `test/`: a stray file in the tree makes PARALLEL gates red at random, a
//    lesson this repository already paid for with its ast-grep decoys.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-thread-listen-'));
const WORKER = path.join(TMP, 'listener-worker.cjs');
fs.writeFileSync(WORKER, `
'use strict';
const http = require('node:http');
const { workerData, parentPort } = require('node:worker_threads');
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('thread ' + workerData.id);
});
server.on('error', (err) => parentPort.postMessage({ id: workerData.id, error: err.code || String(err) }));
server.listen(workerData.port, '127.0.0.1', () => {
  parentPort.postMessage({ id: workerData.id, listening: server.address().port });
});
`);

/**
 * Starts a worker that tries to listen, and resolves on its FIRST word —
 * success or failure. 🛑 No timer anywhere: a worker that can neither bind nor
 * fail would hang, and the suite's own bound is what must end that, never a
 * duration guessed here.
 */
function listener(id, port) {
  return new Promise((resolve) => {
    const worker = new Worker(WORKER, { workerData: { id, port } });
    worker.once('message', (m) => resolve({ worker, ...m }));
    worker.once('error', (e) => resolve({ worker, id, error: `threw ${e.message}` }));
  });
}

function ask(port) {
  return new Promise((resolve) => {
    // ⚠️ `agent: false` IS MANDATORY: Node's global agent pools a socket across
    //    calls to the same host:port, so without it a second thread could be
    //    answered by the first one's connection and the cell would measure a
    //    pool it believes is four servers.
    const req = http.request({ host: '127.0.0.1', port, path: '/', agent: false }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve(body));
    });
    req.on('error', (e) => resolve(`ERROR ${e.code}`));
    req.end();
  });
}

const stop = async (...workers) => {
  for (const w of workers) if (w && w.worker) await w.worker.terminate();
};

test('① a WORKER THREAD owns its own listening socket, and serves HTTP on it', async () => {
  const w = await listener('A', 0);
  try {
    assert.ok(w.listening,
      `a thread could not bind a listener (${w.error}) — without this, "one thread per socket" is `
      + 'unreachable and the only parallelism available here is compute, which must then be said '
      + 'plainly instead of being sold as a multi-core daemon');
    // 🛑 BINDING IS NOT SERVING. A socket that listens and answers nothing would
    //    satisfy the assertion above while proving none of what it is for.
    assert.equal(await ask(w.listening), 'thread A',
      'the thread bound a port and did not answer on it');
  } finally { await stop(w); }
}, 30000);

test('② FOUR THREADS, FOUR PORTS — every one listening, every one answering', async () => {
  const four = await Promise.all(['P0', 'P1', 'P2', 'P3'].map((id) => listener(id, 0)));
  try {
    const bound = four.filter((w) => w.listening);
    assert.equal(bound.length, 4,
      `only ${bound.length}/4 threads bound a listener: ${four.map((w) => w.error || 'ok').join(', ')}`);
    // 🔑 DISTINCT PORTS, ASSERTED: four threads that somehow shared one port
    //    would answer this cell perfectly while being one server, not four.
    const ports = new Set(bound.map((w) => w.listening));
    assert.equal(ports.size, 4, 'the four threads did not take four DIFFERENT ports');
    // And each answers for ITSELF — the proof that four servers really exist.
    const answers = await Promise.all(bound.map((w) => ask(w.listening)));
    assert.deepEqual(answers.slice().sort(), ['thread P0', 'thread P1', 'thread P2', 'thread P3'],
      `the four ports did not answer as four distinct threads: ${JSON.stringify(answers)}`);
  } finally { await stop(...four); }
}, 30000);

test('③ TWO THREADS ON ONE PORT — a KERNEL property, recorded per platform', async () => {
  const first = await listener('S1', 0);
  let second = null;
  try {
    assert.ok(first.listening, 'anti-vacuity: nothing to share, the first thread never bound');
    second = await listener('S2', first.listening);
    const shared = Boolean(second.listening);
    console.log(`[thread-listener] ${process.platform}: a second thread on the same port -> `
      + (shared ? 'ACCEPTED (SO_REUSEPORT shape available)' : `REFUSED (${second.error})`));

    if (process.platform === 'win32') {
      // 🛑 ASSERTED ONLY HERE, because only here is the answer already MEASURED
      //    (`SO_REUSEPORT` = ENOTSUP, backlog 2026-09-18). This is the drift
      //    side of the cell: the day Windows gains the capability, it goes RED
      //    and somebody re-reads the architecture instead of inheriting a
      //    constraint that stopped being true.
      assert.equal(shared, false,
        'a second thread bound the SAME port on Windows — the platform gained a capability this '
        + 'architecture is built around NOT having. Re-read the N-ports decision before doing '
        + 'anything else: one URL may now be reachable where four were needed.');
    } else {
      // 🛑 NOT ASSERTED on Linux/macOS, and the reason is written rather than
      //    implied: the answer there has never been measured by this project,
      //    and a cell that guessed it would either certify a belief or redden on
      //    a correct system. What it does instead is SAY what it saw, so the
      //    first CI run on those kernels answers a question the backlog has been
      //    carrying as "NON MESURÉ" — a recorded fact, never a silent green.
      assert.ok(typeof shared === 'boolean', 'the platform answered neither yes nor no');
    }
  } finally { await stop(first, second); }
}, 30000);
