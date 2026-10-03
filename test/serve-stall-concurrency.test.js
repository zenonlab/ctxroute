// serve-stall-concurrency — the daemon reports how many connections it held AT ONCE.
//
// 🔴 WHY THIS EXISTS, AND IT IS A MEASUREMENT HOLE THREE NIGHTS WIDE (2026-09-17).
//    The `ECONNREFUSED` class on this fleet turns on ONE number — simultaneous
//    connections against the accept queue, measured at 232 deep on Windows
//    (`accept-queue-ceiling.md`) — and that number had never been taken AT THE
//    SOURCE. Every attempt used an external sampler; `Get-NetTCPConnection` costs
//    tens of milliseconds while a frame connection lives ~11 ms, so the sampler is
//    SLOWER THAN WHAT IT OBSERVES and structurally misses the peaks. The server
//    knows it exactly, for free, and was not saying it.
//
// 🛑 EVERY CELL DRIVES THE REAL CHAIN: `createServer` as production builds it, real
//    kernel sockets, and the record captured where `lifecycle.record` actually
//    lands. A hand-built `deps` object would prove only what its author believed —
//    the exact fault this repo paid for on 2026-09-13.
import { test, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import net from 'node:net';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const lifecycle = require('../src/lifecycle-log');
const { createServer } = require('../src/hooks/http-server');
const { STALL_MS } = require('../src/lifecycle-log-pure');

const originalRecord = lifecycle.record;
afterEach(() => { lifecycle.record = originalRecord; });

/** Captures the records the REAL emitter would have written, without touching disk. */
function spyOnJournal() {
  const seen = [];
  lifecycle.record = (event, fields) => { seen.push({ event, fields }); };
  return seen;
}

/**
 * Opens `n` raw sockets and resolves once every one of them is connected.
 *
 * 🛑 THE CALLER ASSERTS AGAINST `sockets.length`, NEVER AGAINST `n` — the first
 *    version of this suite hard-coded the expected peak and went FLAKY: one run
 *    red, the next green, because under full-suite load a socket can still be
 *    connecting. A suite that reddens at random is a suite people stop reading,
 *    and then it is disarmed. Derive the expectation from WHAT HAPPENED.
 */
function openIdle(port, n) {
  return Promise.all(Array.from({ length: n }, () => new Promise((resolve, reject) => {
    const s = net.connect({ port, host: '127.0.0.1' });
    s.once('connect', () => resolve(s));
    s.once('error', reject);
  })));
}

/**
 * Opens `n` raw sockets and resolves only once the SERVER has accepted every one that connected.
 *
 * 🔴 A CLIENT `connect` IS NOT A SERVER `connection` — RED 5/5 ON LINUX, 2026-09-23. The kernel
 *    completes the handshake from its backlog, so the client's `connect` fires BEFORE the server
 *    accepts. Closing the burst right after it (what ① and ③ do) let Linux hand the server
 *    already-dead sockets one at a time: `peakConn` read 2 for a "burst" of 12 the server never held
 *    at once. Windows happened to accept first, so the cell was green there and proved nothing
 *    portable. The authority on "held" is the server's own `connection` event — never a timer.
 * ⚠️ The listener is armed BEFORE the sockets open: armed after, an early accept is missed and
 *    the wait never resolves.
 */
async function openHeld(server, port, n) {
  let accepted = 0;
  let wanted = Infinity;
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  const onConnection = () => { accepted += 1; if (accepted >= wanted) release(); };
  server.on('connection', onConnection);
  try {
    const sockets = await openIdle(port, n);
    wanted = sockets.length;
    if (accepted >= wanted) release();
    await held;
    return sockets;
  } finally { server.off('connection', onConnection); }
}

/** Waits for every socket to be fully closed, so a count cannot race the kernel. */
function closeAll(sockets) {
  return Promise.all(sockets.map((s) => new Promise((resolve) => {
    if (s.destroyed) { resolve(); return; }
    s.once('close', resolve);
    s.destroy();
  })));
}

/**
 * Sends a request whose BODY arrives late, so the whole request crosses `STALL_MS`
 * and the `serve-stall` branch fires. This is the shape a stalled client really has
 * (measured in production: `bodyMs` is 99.6 % of a stall), never a fabricated delay.
 */
function slowRequest(port, delayMs) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ tool_name: 'Bash', tool_input: {} });
    const s = net.connect({ port, host: '127.0.0.1' }, () => {
      s.write('POST /pretool HTTP/1.1\r\nHost: x\r\n'
        + `Content-Length: ${Buffer.byteLength(body)}\r\n`
        + 'Content-Type: application/json\r\n\r\n');
      setTimeout(() => s.write(body), delayMs);
    });
    s.on('data', () => { s.destroy(); resolve(); });
    s.once('error', reject);
  });
}

function listen() {
  const server = createServer({ store: new Map() });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

test('① the stall record carries the PEAK simultaneous connections, not just the current one', async () => {
  const { server, port } = await listen();
  const seen = spyOnJournal();
  try {
    // A burst that is OVER by the time the stall is recorded: only a cumulative
    // high-water mark can still see it, which is the whole point of the field.
    const idle = await openHeld(server, port, 12);
    const burst = idle.length;            // what the SERVER actually held, never the 12 asked for
    await closeAll(idle);

    await slowRequest(port, STALL_MS + 150);

    const stalls = seen.filter((r) => r.event === 'serve-stall');
    assert.equal(stalls.length, 1, 'the slow request must have produced exactly one stall record');
    // 🛑 THE NUMBER THAT MATTERS IS 12, NOT 13, AND THE FIRST VERSION OF THIS CELL
    //    ASSERTED 13 AND WAS WRONG — recorded because the mistake is instructive.
    //    The burst is CLOSED before the stall begins, so the stalling request is
    //    alone on the socket: an instantaneous gauge would report 1 here. Only a
    //    cumulative high-water mark still remembers the 12, which is precisely the
    //    property production needs — the refusals happen in bursts that are over
    //    before anything gets a chance to look.
    assert.ok(stalls[0].fields.peakConn >= burst,
      `peakConn must remember the ${burst} that ended: got ${stalls[0].fields.peakConn}`);
    assert.ok(burst >= 2, 'anti-vacuity: a burst of 0 or 1 would make the assertion above free');
    assert.ok(stalls[0].fields.openConn < burst,
      'and it must NOT be reporting the instant, or it would read 1 here');
  } finally { server.close(); }
});

test('② `openConn` is the INSTANT, so a burst still in flight is distinguishable', async () => {
  const { server, port } = await listen();
  const seen = spyOnJournal();
  let idle = [];
  try {
    idle = await openIdle(port, 8);          // held OPEN across the stall
    assert.ok(idle.length >= 2, 'anti-vacuity: too few sockets connected to prove anything');
    await slowRequest(port, STALL_MS + 150);

    const fields = seen.find((r) => r.event === 'serve-stall').fields;
    assert.ok(fields.openConn >= idle.length,
      `openConn must count the ${idle.length} sockets still held: got ${fields.openConn}`);
    assert.ok(fields.peakConn >= fields.openConn,
      'a peak below the current value is arithmetically impossible');
  } finally {
    for (const s of idle) s.destroy();
    server.close();
  }
});

test('③ SEEN RED: the counter comes back DOWN — a monotonic one would manufacture its own peak', async () => {
  const { server, port } = await listen();
  const seen = spyOnJournal();
  try {
    const first = await openHeld(server, port, 10);   // the decrement is only proven on sockets the server COUNTED
    assert.ok(first.length >= 2, 'anti-vacuity: too few sockets connected to prove anything');
    await closeAll(first);

    await slowRequest(port, STALL_MS + 150);
    const fields = seen.find((r) => r.event === 'serve-stall').fields;
    // Everything closed + 1 in flight: a counter that never decremented would read
    // `first.length + 1` here and would keep climbing for the life of the process,
    // turning every busy night into a fake "we reached the accept queue" verdict.
    assert.ok(fields.openConn < first.length,
      `closed sockets must have been subtracted: openConn=${fields.openConn}`);
  } finally { server.close(); }
});

test('④ ANTI-VACUITY: a HEALTHY request writes no stall record at all', async () => {
  const { server, port } = await listen();
  const seen = spyOnJournal();
  try {
    await slowRequest(port, 0);
    assert.deepEqual(seen.filter((r) => r.event === 'serve-stall'), [],
      'a fast request must stay silent, or the journal becomes a per-request writer');
  } finally { server.close(); }
});

// ═══════════════════════════════════════════════════════════════════════
// ⑤ THE LINE SAYS WHERE ITS TIME WENT — the whole point of the split
// ═══════════════════════════════════════════════════════════════════════
// 🔴 WRITTEN 2026-09-19 BECAUSE THE FIELDS HAD NO JUDGE AND THEIR ABSENCE COST A
//    WHOLE EVENING. `loop-block` carried `elapsedMs` alone — body-read PLUS
//    freshness PLUS work PLUS serialisation, in one number. An agent read
//    `loopMaxMs=604 elapsedMs=21`, concluded the handler was burning CPU,
//    calibrated a bench at 17 ms per frame and designed a worker pool on it,
//    while this repository's own measurement says the opposite: **on 200
//    consecutive stalls, 100 % of the elapsed time is the daemon WAITING FOR THE
//    CLIENT, and the work is 1-3 ms.** The operator had to say it three times.
// 🛑 SO THE SPLIT IS A CONTRACT, NOT A CONVENIENCE, and until this cell existed
//    anybody could drop a field tomorrow and put the ambiguity straight back —
//    silently, with every other cell here green. **A line that cannot say where
//    its time went will be read as blaming whoever is nearest.**
// ⚠️ THE ATTRIBUTION IS ASSERTED, NEVER JUST THE PRESENCE: four names that all
//    read zero would satisfy a `typeof` check and measure nothing. What makes
//    this cell bite is that the client is deliberately slow, so `bodyMs` MUST
//    dominate — which is exactly the production fact the fields exist to show.
test('⑤ the stall record ATTRIBUTES its time, and the wait dominates', async () => {
  const { server, port } = await listen();
  const seen = spyOnJournal();
  try {
    await slowRequest(port, STALL_MS + 150);
    const stall = seen.find((r) => r.event === 'serve-stall');
    assert.ok(stall, 'no stall was recorded: nothing below can be measured');

    const { elapsedMs, bodyMs, freshMs, handleMs, payloadMs } = stall.fields;
    for (const [name, value] of Object.entries({ elapsedMs, bodyMs, freshMs, handleMs, payloadMs })) {
      assert.ok(Number.isFinite(value) && value >= 0,
        `\`${name}\` is ${String(value)}: a timing field that is absent or not a number leaves the line `
        + 'unable to say where its time went, which is the ambiguity this split exists to remove');
    }

    // 🛑 THE FOUR ARE DISJOINT SLICES OF THE WHOLE — if their sum could exceed it,
    //    they would be four unrelated numbers wearing the same line.
    assert.ok(bodyMs + freshMs + handleMs + payloadMs <= elapsedMs + 2,
      `the parts (${bodyMs}+${freshMs}+${handleMs}+${payloadMs}) exceed the whole (${elapsedMs}): they do not attribute it`);

    // 🔑 THE CELL THAT ACTUALLY BITES: a deliberately slow client means the WAIT
    //    must dominate. Fields that all read zero, or a split wired to the wrong
    //    marks, fail here and nowhere else.
    assert.ok(bodyMs > handleMs + payloadMs,
      `the client was made slow on purpose, yet the record blames the work (body ${bodyMs} ms against `
      + `handle ${handleMs} + payload ${payloadMs}): the split is wired to the wrong marks, and that is `
      + 'exactly the misreading that cost an evening');
  } finally { server.close(); }
});
