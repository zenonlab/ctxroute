// ═══════════════════════════════════════════════════════════════════════
// `socket-cut` ON THE REAL SERVER — WHO HUNG UP (2026-09-24)
// ═══════════════════════════════════════════════════════════════════════
// 🔴 From 2026-09-23 10:42Z the harness read `read ECONNRESET` on 1.44 % of its POSTs (≤ 0.07 % on
//    every earlier day). A reset says only that somebody slammed the connection. The daemon now
//    writes a `socket-cut` line for every abnormal close it causes, so its SILENCE while resets
//    continue points elsewhere. These cells drive the REAL `createServer` over REAL sockets — the
//    pure predicate is pinned in `lifecycle-log-pure.test.js`; here the WIRING is what is proven.
import { test, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import net from 'node:net';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const lifecycle = require('../src/lifecycle-log');
const { createServer } = require('../src/hooks/http-server');

const originalRecord = lifecycle.record;
afterEach(() => { lifecycle.record = originalRecord; });

/** Captures the records the REAL emitter would have written, without touching disk. */
function spyOnJournal() {
  const seen = [];
  lifecycle.record = (event, fields) => { seen.push({ event, fields }); };
  return seen;
}

/** A real server; `runFn` is the gate the daemon would run, injected like every other suite does. */
function listen(runFn, extra = {}) {
  const server = createServer({ store: new Map(), ...(runFn ? { runFn } : {}), ...extra });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

/** Resolves once the SERVER has seen the socket close — the moment the line is decided. */
function serverSideClose(server) {
  return new Promise((resolve) => { server.once('connection', (s) => s.once('close', () => setImmediate(resolve))); });
}

const POST = (body) => `POST /pretool?frame=1&frames=1 HTTP/1.1\r\nHost: t\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`;

test('an ordinary request, answered, then closed, writes NO socket-cut line', async () => {
  const { server, port } = await listen();
  const seen = spyOnJournal();
  try {
    const closed = serverSideClose(server);
    const answer = await new Promise((resolve, reject) => {
      const c = net.connect(port, '127.0.0.1', () => c.write(POST('{}')));
      let got = '';
      c.on('data', (d) => { got += d; });
      c.on('end', () => resolve(got));
      c.on('error', reject);
    });
    await closed;
    assert.match(answer, /^HTTP\/1\.1 /, 'anti-vacuity: the server must really have answered');
    assert.deepEqual(seen.filter((r) => r.event === 'socket-cut'), []);
  } finally { server.close(); }
});

// ⚠️ NOT a throwing `runFn`: `handle` catches the gate's own exceptions and answers 200 (measured
//    2026-09-24, the first version of this cell waited 30 s for a reset that never comes). What
//    reaches the destroy is an exception OUTSIDE the gate — the frame parser runs before it.
test('a request that crashes the handler: the daemon still resets, and now says WHY', async () => {
  const { server, port } = await listen(null, { parseFrames: () => { throw new Error('gate exploded'); } });
  const seen = spyOnJournal();
  try {
    const closed = serverSideClose(server);
    await new Promise((resolve) => {
      const c = net.connect(port, '127.0.0.1', () => c.write(POST('{}')));
      c.on('close', resolve);
      c.on('error', () => {});
    });
    await closed;
    const cuts = seen.filter((r) => r.event === 'socket-cut');
    assert.equal(cuts.length, 1, `exactly one socket-cut line — got ${JSON.stringify(seen)}`);
    assert.equal(cuts[0].fields.inFlight, true);
    assert.match(String(cuts[0].fields.threw), /gate exploded/);
    assert.equal(cuts[0].fields.route, '/pretool');
    assert.equal(cuts[0].fields.port, port);
  } finally { server.close(); }
});

test('bytes received and never parsed into a request: the line counts them', async () => {
  const { server, port } = await listen();
  const seen = spyOnJournal();
  try {
    const closed = serverSideClose(server);
    await new Promise((resolve) => {
      const c = net.connect(port, '127.0.0.1', () => { c.write('POST /pretool HTTP/1.1\r\nHost: t\r\n'); c.destroy(); resolve(); });
    });
    await closed;
    const cuts = seen.filter((r) => r.event === 'socket-cut');
    assert.equal(cuts.length, 1, `exactly one socket-cut line — got ${JSON.stringify(seen)}`);
    assert.equal(cuts[0].fields.inFlight, false);
    assert.ok(cuts[0].fields.unreadBytes > 0 || cuts[0].fields.errorCode, `the cut must carry its evidence — got ${JSON.stringify(cuts[0].fields)}`);
  } finally { server.close(); }
});
