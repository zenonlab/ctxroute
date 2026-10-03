// ═══════════════════════════════════════════════════════════════════════
// server-thread.js — ONE THREAD, ITS OWN LISTENING SOCKETS, THE SAME GATE.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 WHAT MAKES THIS A REAL MULTI-CORE DAEMON AND NOT A COMPUTE POOL, and the
//    operator is who drew the line: *"is it REAL multi-core, like a real HTTP
//    daemon?"*. A pool that only BUILDS answers leaves accept, parsing and the
//    response on one thread — that thread is still the whole daemon. Here each
//    thread **binds its own listening sockets and does all the expensive work
//    of its own requests**, which is the shape nginx and HAProxy have.
//
// 📐 MEASURED BEFORE BEING BUILT (`test/thread-listener.test.js`, Windows,
//    Node 22.15.1): a worker thread BINDS its own listening socket and serves
//    HTTP on it; four threads take four ports, 4/4 answering; two threads on
//    the SAME port is `EADDRINUSE`. So one socket per thread is not a taste —
//    sharing one is closed to us twice over (`SO_REUSEPORT` is `ENOTSUP` here),
//    and explicit assignment is HAProxy's pattern, the more deterministic of
//    the industry's two.
//
// 🛑 ZERO NEW DIALECT, AND THAT IS THE ACCEPTANCE CRITERION. This file calls
//    the SAME `createServer` the main thread calls, with the SAME options. It
//    composes no response, decides no cadence, knows no route. A second
//    response builder would drift from the first, and the agents would be the
//    ones to find out.
//
// 🛑 IT OWNS NO STATE. The store and the three invocation tables are reached
//    through the owner thread, synchronously. A thread that kept its own copy
//    of either would be the defect measured on the socket side on 2026-09-18 —
//    half a document delivered four times and the other half never.
//
// 🔴 A THREAD CANNOT KILL THE PROCESS, AND FORGETTING THAT WOULD BE SILENT.
//    `process.exit()` inside a worker ends the WORKER, not the daemon: a stale
//    code verdict handled that way would leave the process alive, serving from
//    its other threads, with one socket dead and nothing said. So the verdict
//    is POSTED to the main thread, which owns the exit exactly as it always
//    has. The request itself is still refused here, immediately.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const { parentPort, workerData } = require('node:worker_threads');
const { createClient } = require('./owner-client');
const httpServer = require('./http-server');
const staleCode = require('../stale-code');

/**
 * Build this thread's sockets and start serving.
 *
 * @param {{
 *   control: SharedArrayBuffer,
 *   payload: SharedArrayBuffer,
 *   clients: number,
 *   index: number,
 *   slotBytes?: number,
 *   endpoints: {host: string, port: number}[],
 *   fds: number[],
 *   backlog: number,
 *   activity?: SharedArrayBuffer
 * }} wiring
 * @param {{postMessage: (value: unknown) => void}} channelToMain
 * @returns {import('http').Server[]}
 */
function serve(wiring, channelToMain) {
  const client = createClient({
    control: new Int32Array(wiring.control),
    payload: new Uint8Array(wiring.payload),
    clients: wiring.clients,
    index: wiring.index,
    slotBytes: wiring.slotBytes,
  });
  // 🔑 THE CORPUS IS RESIDENT PER THREAD, AND THE COST IS DECLARED. Each worker
  //    is its own V8 isolate, so each holds its own copy — that is the MEMORY a
  //    pool costs, and it is why the worker ceiling is 8 and the default is 0.
  //    Invalidation stays a KERNEL event on the corpus directories, exactly as
  //    on the main thread: never a TTL, never an mtime.
  require('../corpus').enableCache((dir, cb) => require('node:fs').watch(dir, { persistent: false }, cb));
  /**
   * 🛑 REPORT, THEN LET THE OWNER OF THE EXIT DECIDE. The request is refused
   *    here whatever happens — `createServer` does that on its own — and the
   *    PROCESS-level consequence belongs to the main thread.
   * @param {{stale: boolean, checked: number, reasons: string[]}} verdict
   */
  const onStaleCode = (verdict) => {
    channelToMain.postMessage({ kind: 'stale-code', verdict, index: wiring.index });
  };
  /**
   * @param {Error} err
   * @param {string} where
   */
  const onLaneLost = (err, where) => {
    channelToMain.postMessage({
      kind: 'lane-lost',
      index: wiring.index,
      where,
      code: /** @type {NodeJS.ErrnoException} */ (err).code,
      message: err && err.message,
    });
    throw err;
  };
  const made = [];
  /**
   * @param {string} where
   * @returns {import('http').Server}
   */
  const build = (where) => httpServer.createServer({
    // 🛑 THE STORE AND THE TABLES ARE THE OWNER'S, REACHED SYNCHRONOUSLY. Same
    //    shapes the main thread passes, so nothing below this line knows.
    store: client.store,
    tables: client.tables,
    freshness: () => staleCode.check(),
    onStaleCode,
    onAddressInUse: (err) => { onLaneLost(err, where); },
    onLaneLost: (err) => { onLaneLost(err, where); },
    // 🔑 THE MAIN THREAD'S ACTIVITY COUNTER, over the SAME shared buffer: an
    //    on-demand daemon must see this thread's requests or it would leave
    //    while this thread serves. Absent ⇒ nothing counted (a test boot).
    activity: wiring.activity ? new Int32Array(wiring.activity) : null,
  });
  for (const fd of wiring.fds || []) {
    const server = build(`fd:${fd}`);
    server.listen({ fd });
    made.push(server);
  }
  for (const endpoint of wiring.endpoints || []) {
    const server = build(`${endpoint.host}:${endpoint.port}`);
    server.listen(endpoint.port, endpoint.host, wiring.backlog);
    made.push(server);
  }
  // ⚠️ ANTI-VACUITY, AND IT IS NOT DECORATION: a thread that bound NOTHING would
  //    be indistinguishable from one serving happily, while a share of every
  //    action POSTed to an address nobody holds — the exact silent hole
  //    `http.listeners` shipped with on every activated OS.
  channelToMain.postMessage({ kind: 'serving', index: wiring.index, sockets: made.length });
  return made;
}

// 🛑 RUN ONLY AS A WORKER, never on `require` — the suites import this file to
//    drive `serve()` with their own channel, and a module that started listening
//    on import would bind production ports inside a test run.
if (parentPort && workerData && workerData.role === 'server') {
  serve(workerData, parentPort);
}

module.exports = { serve };
