// ═══════════════════════════════════════════════════════════════════════
// THE DAEMON'S LIFECYCLE — the three fears of a process that never dies:
// stale code · silent leak · a watcher that has gone deaf.
// ═══════════════════════════════════════════════════════════════════════
//
// 🛑 A SPAWNED HOOK CANNOT HAVE THESE DEFECTS. It re-reads the code every call
//    and dies before it can leak. Everything below exists ONLY because the HTTP
//    lane trades that guarantee for speed — so the guarantee has to be rebuilt,
//    mechanically, or the trade is a bad one.
//
// ⚠️ NOTHING HERE INFERS LIVENESS. There is no "is it still alive?" probe, no
//    timeout used as a verdict, no heartbeat. Every fact below comes from the
//    kernel (a filesystem event, a process exit code, a measured heap).
// ═══════════════════════════════════════════════════════════════════════

import { test, afterAll, expect } from 'vitest';
import assert from 'node:assert';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { execFile, fork } from 'node:child_process';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-daemon-'));
afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

const { watchOwnCode, EXIT_STALE_CODE } = require_('../src/hooks/http-server.js');

// ── ① THE SET OF WATCHED DIRECTORIES IS DERIVED, NEVER LISTED ──
test('the watched set is DERIVED from the modules actually loaded', () => {
  const seen = [];
  const cache = {
    'C:/repo/src/gate.js': 1,
    'C:/repo/src/sources/file.js': 1,
    'C:/repo/src/hooks/http-server.js': 1,
    'C:/repo/node_modules/vitest/index.js': 1,
    '/unix/style/repo/src/lib.js': 1,
  };
  watchOwnCode((dir) => { seen.push(dir); return { close() {} }; }, cache, () => {});

  // ⚠️ ANTI-VACUITY: a derivation that watched NOTHING would pass every
  //    assertion below by absence. It must really have produced directories.
  assert.ok(seen.length >= 3, `must derive several directories, got ${seen.length}`);
  expect(new Set(seen)).toEqual(new Set(['C:/repo/src', 'C:/repo/src/sources', 'C:/repo/src/hooks', '/unix/style/repo/src']));
  // 🛑 A dependency cannot change without an install, which is a deliberate act
  //    that restarts the service anyway. Watching it would be pure noise.
  assert.ok(!seen.some((d) => d.includes('node_modules')), 'node_modules must never be watched');
  // Both path separators, because the same code runs on all three OSes.
  assert.ok(seen.includes('/unix/style/repo/src'), 'POSIX paths must be derived too');
});

test('one directory refusing to be watched must not cost the others (fail-open, per directory)', () => {
  const ok = [];
  const watch = (dir) => {
    if (dir.endsWith('sources')) throw new Error('platform refuses this watch');
    ok.push(dir);
    return { close() {} };
  };
  const live = watchOwnCode(watch, { 'C:/r/src/a.js': 1, 'C:/r/src/sources/b.js': 1 }, () => {});
  assert.strictEqual(ok.length, 1, 'the healthy directory must still be watched');
  assert.strictEqual(live.length, 1, 'only the successful watchers are returned');
});

test('the stale-code exit code is NON-ZERO — a supervisor only restarts on failure', () => {
  // 🛑 Not style: an exit 0 reads as "the job is done" and Windows Task
  //    Scheduler would simply never bring the service back. Refusing to serve
  //    stale code IS an abnormal termination.
  assert.ok(Number.isInteger(EXIT_STALE_CODE) && EXIT_STALE_CODE > 0,
    'a zero exit code would leave the daemon down on at least one OS');
});

// ── ② THE CLAIM THAT DECIDED THE DESIGN, MEASURED ON THE REAL KERNEL ──
// 🛑 The source file states: "git does not write in place, it renames over the
//    target; a watch on the FILE follows the old inode and goes silently deaf,
//    a watch on the DIRECTORY sees it". That is a claim about the OS, not about
//    us — so it is MEASURED here. If this test ever fails on some platform, the
//    design decision is what has to change, not the assertion.
test('REAL EVENT: a directory watch survives the rename a git checkout performs', async () => {
  const dir = path.join(TMP, 'watched');
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, 'module.js');
  fs.writeFileSync(target, 'v1');

  let fired = 0;
  const watcher = fs.watch(dir, { persistent: false }, () => { fired += 1; });
  await new Promise((r) => setTimeout(r, 120)); // let the kernel arm the watch

  // Exactly what a checkout does: write beside, then rename over.
  const staged = path.join(dir, 'module.js.tmp');
  fs.writeFileSync(staged, 'v2');
  fs.renameSync(staged, target);

  await new Promise((r) => setTimeout(r, 400));
  watcher.close();
  assert.ok(fired > 0, 'the directory watch MUST see a rename-over — the whole stale-code guard rests on it');
});

// ── ②bis A CLIENT THAT HANGS UP MUST NOT TAKE THE SERVICE DOWN ──
// 🔴 READ THIS BEFORE CITING IT: this does NOT reproduce an observed crash.
//    The claim it was written for — "writing to a socket the client already
//    closed throws, so an abort kills the daemon" — was a DEDUCTION, and
//    measurement on Node 22.15.1/Windows REFUTED it: without any guard, the
//    server survived and both requests were answered.
// ✅ WHAT IT IS WORTH ANYWAY, and why it stays: the property "one client
//    hanging up must never cost the OTHER agents their injection" is real and
//    permanent, while the runtime behavior that currently satisfies it is
//    undocumented and free to change at the next upgrade. This pins the
//    property, not the implementation — and the spawn lane cannot even have
//    this class of defect, since a crash there costs one short-lived process.
// ⚠️ The shape is ordinary, not exotic: an agent stopped mid-action, a harness
//    giving up on a timeout.
test('an aborted request must not kill the daemon — it keeps serving the next one', async () => {
  const { createServer } = require_('../src/hooks/http-server.js');
  const srv = createServer();
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;

  const ask = (body) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/pretool',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } },
    (res) => { let t = ''; res.on('data', (c) => { t += c; }); res.on('end', () => resolve(t)); });
    req.on('error', reject);
    req.end(body);
  });

  // A healthy exchange first: without it, a server that was already broken
  // would make the rest of this test pass by accident.
  const before = await ask(JSON.stringify({ tool_name: 'Bash', tool_input: {} }));
  assert.strictEqual(typeof before, 'string', 'the server must answer BEFORE the abort, or this test proves nothing');

  // Now the abort: announce a body, send half of it, hang up.
  await new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/pretool',
      headers: { 'content-type': 'application/json', 'content-length': 500 } });
    req.on('error', () => {});      // the abort surfaces here; it is expected
    req.write('{"tool_name":"Bash"');
    setTimeout(() => { req.destroy(); resolve(); }, 50);
  });
  await new Promise((r) => setTimeout(r, 150));   // let the server observe it

  // The verdict: is it still there? Not "does it look alive" — we ASK it.
  const after = await ask(JSON.stringify({ tool_name: 'Bash', tool_input: {} }));
  assert.strictEqual(typeof after, 'string', 'the daemon died on an aborted request — it would take every agent with it');
  srv.close();
});

// ── ③ NO LEAK — MEASURED IN A CHILD PROCESS WITH REAL GARBAGE COLLECTION ──
// 🛑 Measuring the heap inside the test runner proves nothing: vitest itself
//    allocates around us. The measurement therefore runs in a DEDICATED process
//    with `--expose-gc`, so the collector runs before each reading and what is
//    left is genuinely retained, not merely uncollected.
test('MEMORY: retention DECELERATES — the slope says leak or warm-up, an absolute never does', async () => {
  // ⚠️ A REAL corpus, not an empty directory. With nothing to read the engine
  //    barely allocates, the four readings collapse into allocator noise and
  //    the comparison becomes a coin toss — a flaky gate, i.e. a gate people
  //    stop reading. Twelve documents of which several MATCH: the request must
  //    do real work, including producing output.
  const docs = path.join(TMP, 'docs');
  fs.mkdirSync(docs, { recursive: true });
  for (let i = 0; i < 12; i += 1) {
    const matches = i % 3 === 0 ? 'server.js' : `nothing-${i}.js`;
    fs.writeFileSync(path.join(docs, `doc-${i}.md`),
      `---\nmatch: ${matches}\nmode: dumb\n---\n# Doc ${i}\n${'invariant line to carry\n'.repeat(40)}`);
  }

  const driver = path.join(TMP, 'leak-driver.js');
  fs.writeFileSync(driver, `
    const http = require('http');
    const { createServer } = require(${JSON.stringify(path.join(__dirname, '..', 'src', 'hooks', 'http-server.js').replace(/\\/g, '/'))});
    const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'cat /proj/server.js' }, session_id: 'leak', tool_use_id: 'inv' });
    const srv = createServer();
    srv.listen(0, '127.0.0.1', async () => {
      const port = srv.address().port;
      const once = () => new Promise((res, rej) => {
        const req = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/pretool?frame=1&frames=1',
          headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } },
          (r) => { r.resume(); r.on('end', res); });
        req.on('error', rej); req.end(payload);
      });
      for (let i = 0; i < 200; i++) await once();      // warm-up: lazy loads, pools
      const marks = [];
      global.gc(); global.gc();
      let previous = process.memoryUsage().heapUsed;
      // SIX EQUAL batches. Equal, because only equal batches make the retained
      // amounts comparable. SIX, because FOUR is not enough to reach the
      // plateau — measured 2026-08-20: the marginal is still 150 bytes/request
      // at batch 4 and only settles around zero from batch 5 onward. A gate
      // that reads the curve before it flattens judges the warm-up, not the
      // property, and reddens at random. It did exactly that on CI.
      for (let batch = 0; batch < 6; batch += 1) {
        for (let i = 0; i < 1000; i++) await once();
        global.gc(); global.gc();
        const now = process.memoryUsage().heapUsed;
        marks.push(now - previous);
        previous = now;
      }
      console.log(JSON.stringify({ marks }));
      srv.close(); process.exit(0);
    });
  `);

  const out = await new Promise((resolve, reject) => {
    execFile(process.execPath, ['--expose-gc', driver], {
      encoding: 'utf8',
      env: { ...process.env, CTXROUTE_STATE_DIR: path.join(TMP, 'state'), CTXROUTE_FILEDOCS_DIR: path.join(TMP, 'docs'), CTXROUTE_CONFIG_PATH: path.join(TMP, 'cfg.json') },
    }, (err, stdout) => (err ? reject(new Error(err.message + stdout)) : resolve(JSON.parse(stdout.trim().split('\n').pop()))));
  });

  // ⚠️ ANTI-VACUITY: four readings must really exist, or the assertions below
  //    would be comparing nothing.
  assert.strictEqual(out.marks.length, 6, 'the driver must have produced six readings');

  // 🛑 WHY A SLOPE AND NOT A CEILING — this is the whole point of the test.
  //    An absolute bound ("under 8 MB") answers "is it big TODAY, on THIS
  //    machine?" A daemon runs for MONTHS: the only question that matters is
  //    "does it keep growing?". A real leak retains the SAME amount per request
  //    forever, so equal batches retain equal amounts. Warm-up — JIT, inline
  //    caches, interned strings — retains a lot at first and then almost
  //    nothing. Measuring the slope tells the two apart; measuring a total
  //    cannot, and it drifts from machine to machine.
  //    MEASURED 2026-08-20 over TEN batches: 370 → 281 → 181 → 150 → 134 → -1
  //    → 18 → 65 → 50 → -12 bytes per request. It converges to zero, and the
  //    state on disk stays at 0 KB — warm-up, not retention.
  //
  // 🛑 AVERAGES, NOT SINGLE READINGS — and this cost a red CI on 2026-08-20.
  //    The first version compared batch 4 against batch 1 with a `< half`
  //    cliff. On a loaded Windows runner the readings were 361 → 229 → 180 →
  //    184 KB: converging exactly as expected, and rejected by four kilobytes.
  //    A gate that reddens on scheduling noise is a gate people stop reading.
  //    The property is CONVERGENCE, so the tail is compared to the head, and
  //    each side is an average — one noisy batch can no longer decide alone.
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const head = mean(out.marks.slice(0, 2));
  const tail = mean(out.marks.slice(-2));
  const shown = out.marks.map((m) => Math.round(m / 1024) + 'Ko').join(' → ');
  // ⚠️ ANTI-VACUITY: warm-up must really have cost something, otherwise the
  //    ratio below is measuring two zeroes and passes by emptiness.
  assert.ok(head > 20 * 1024, `warm-up retained almost nothing (${shown}) — the driver is probably not doing real work`);
  assert.ok(tail < head / 2,
    `retention is NOT converging (batches: ${shown}) — equal batches retaining equal amounts `
    + 'is the signature of a leak, and this daemon runs for months');
}, 240000);

// ── ④ SEEN RED — the slope criterion must REJECT an actual leak ──
test('SEEN RED: the same criterion rejects a server that retains one object per request', async () => {
  // 🛑 A gate never seen failing is a gate ASSUMED to work, and this repo's
  //    worst defect has never been a red gate — it is a GREEN gate that sees
  //    nothing. So the leak is REPRODUCED here, permanently: a listener that is
  //    never removed, the most ordinary way a daemon dies after three weeks.
  //    If this test ever goes green, the criterion above has stopped
  //    discriminating and both are worthless.
  const driver = path.join(TMP, 'leaky-driver.js');
  fs.writeFileSync(driver, `
    const http = require('http');
    const retained = [];   // ⚠️ THE DELIBERATE DEFECT — one object kept per request
    const srv = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => { retained.push({ at: Date.now(), body }); res.end('{}'); });
    });
    srv.listen(0, '127.0.0.1', async () => {
      const port = srv.address().port;
      const payload = JSON.stringify({ tool_name: 'Bash', pad: 'x'.repeat(400) });
      const once = () => new Promise((res, rej) => {
        const req = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/',
          headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } },
          (r) => { r.resume(); r.on('end', res); });
        req.on('error', rej); req.end(payload);
      });
      for (let i = 0; i < 200; i++) await once();
      const marks = [];
      global.gc(); global.gc();
      let previous = process.memoryUsage().heapUsed;
      for (let b = 0; b < 6; b++) {
        for (let i = 0; i < 1000; i++) await once();
        global.gc(); global.gc();
        const now = process.memoryUsage().heapUsed;
        marks.push(now - previous); previous = now;
      }
      console.log(JSON.stringify({ marks }));
      srv.close(); process.exit(0);
    });
  `);

  const out = await new Promise((resolve, reject) => {
    execFile(process.execPath, ['--expose-gc', driver], { encoding: 'utf8' },
      (err, stdout) => (err ? reject(new Error(err.message + stdout)) : resolve(JSON.parse(stdout.trim().split('\n').pop()))));
  });

  assert.strictEqual(out.marks.length, 6, 'the leaky driver must have produced six readings too');
  // ⚠️ EXACTLY the assertion of the test above, inverted. Sharing the criterion
  //    literally is what makes this a proof: if someone weakens it up there to
  //    silence a red, THIS test goes red in the same move.
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const head = mean(out.marks.slice(0, 2));
  const tail = mean(out.marks.slice(-2));
  assert.ok(!(tail < head / 2),
    `the criterion FAILED TO SEE a deliberate leak (batches: ${out.marks.map((m) => Math.round(m / 1024) + 'Ko').join(' → ')}) — `
    + 'it is therefore proving nothing about the real daemon');
}, 240000);

// ── ⑤ EXACT COUNTS — the accumulations a slope can only SUSPECT ──────────
//
// 🛑 A SLOPE IS AN INFERENCE, AND AN INFERENCE CAN BE JOSTLED. Part ③ compares
//    retained BYTES, a quantity nobody controls: the collector decides when it
//    runs, the allocator decides how it packs, and a neighbour process decides
//    how much CPU we get. It answers "does it look like it converges?" — a
//    reading, not a fact. It stays (it is the only net for the leaks nothing
//    counts), but it may not be the ONLY net: a suite that can be jostled is a
//    suite people stop reading, and the day it is right nobody believes it.
// ✅ WHAT THIS CELL ADDS ARE INTEGERS. The three things that actually pile up
//    in a long-lived Node service are COUNTED, not weighed:
//      · listeners on the server object   — the classic `on()` in a handler
//      · active handles (sockets, timers) — a descriptor never closed
//      · entries in the module cache      — a `require` under a request path
//    After N requests each must equal what it was after the FIRST. Not "close
//    to", not "converging": EQUAL. Zero inference, zero threshold, no tuning.
// ⚠️ THE FIRST REQUEST IS THE BASELINE, NEVER ZERO: a service that has served
//    once has legitimately opened its lazy modules and its pools. What is
//    forbidden is what the SECOND to Nth requests add on top.
// ⚠️ ANTI-VACUITY: the baseline must be non-trivial (a real server holds
//    listeners and handles), otherwise "0 === 0" would pass on a driver that
//    served nothing at all — the mute-probe trap this repo has paid five times.
// ⚠️ Handles are read via `process.getActiveResourcesInfo()` (public API since
//    Node 17). Sockets in flight make it fluctuate, so the reading is taken
//    after a full round trip has ENDED, when nothing is in flight by construction.
test('EXACT COUNTS: listeners, handles and module cache do not grow by a single unit', async () => {
  const docs = path.join(TMP, 'docs-counts');
  fs.mkdirSync(docs, { recursive: true });
  for (let i = 0; i < 6; i += 1) {
    fs.writeFileSync(path.join(docs, `d-${i}.md`),
      `---\nmatch: ${i % 2 === 0 ? 'server.js' : `none-${i}.js`}\nmode: dumb\n---\n# D${i}\n${'line\n'.repeat(20)}`);
  }

  const driver = path.join(TMP, 'counts-driver.js');
  fs.writeFileSync(driver, `
    const http = require('http');
    const { createServer } = require(${JSON.stringify(path.join(__dirname, '..', 'src', 'hooks', 'http-server.js').replace(/\\/g, '/'))});
    const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'cat /proj/server.js' }, session_id: 'counts', tool_use_id: 'inv' });
    const srv = createServer();
    srv.listen(0, '127.0.0.1', async () => {
      const port = srv.address().port;
      // ONE SOCKET, DECLARED — otherwise the handle count is not a fact but a guess
      // about the global agent pooling. Node 19+ enables keep-alive by default, so a
      // connection lingers and its number depends on timing; an agent capped at ONE
      // socket makes the count deterministic and the assertion true for the RIGHT
      // reason. Measured while sabotaging this cell: handles read 2 then 3 on a run
      // where nothing had leaked — an exact count must not rest on a default.
      const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
      const once = () => new Promise((res, rej) => {
        const req = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/pretool?frame=1&frames=1', agent,
          headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } },
          (r) => { r.resume(); r.on('end', res); });
        req.on('error', rej); req.end(payload);
      });
      // The census: only integers, every one of them exact.
      const recensement = () => ({
        listeners: srv.eventNames().reduce((n, e) => n + srv.listenerCount(e), 0),
        handles: process.getActiveResourcesInfo().length,
        modules: Object.keys(require.cache).length,
      });
      await once();
      const base = recensement();
      for (let i = 0; i < 500; i++) await once();
      const apres = recensement();
      console.log(JSON.stringify({ base, apres }));
      srv.close(); process.exit(0);
    });
  `);

  const out = await new Promise((resolve, reject) => {
    execFile(process.execPath, [driver], {
      encoding: 'utf8',
      env: { ...process.env, CTXROUTE_STATE_DIR: path.join(TMP, 'state-counts'), CTXROUTE_FILEDOCS_DIR: docs, CTXROUTE_CONFIG_PATH: path.join(TMP, 'cfg-counts.json') },
    }, (err, stdout) => (err ? reject(new Error(err.message + stdout)) : resolve(JSON.parse(stdout.trim().split('\n').pop()))));
  });

  assert.ok(out.base.listeners > 0 && out.base.handles > 0 && out.base.modules > 10,
    `mute probe: the baseline is trivial (${JSON.stringify(out.base)}) — the driver probably served nothing`);

  for (const clef of ['listeners', 'handles', 'modules']) {
    assert.strictEqual(out.apres[clef], out.base[clef],
      `${clef}: ${out.base[clef]} after the 1st request, ${out.apres[clef]} after 501 — `
      + `${out.apres[clef] - out.base[clef]} accumulated over 500 requests. `
      + 'This is an EXACT count, not an estimate: any difference is a real accumulation, '
      + `and at ${((out.apres[clef] - out.base[clef]) / 500).toFixed(3)} per request the service `
      + 'is on a clock. Full census: ' + JSON.stringify(out));
  }
});

// ── ⑥ WHY THERE IS NO "PORT-HOLDING PARENT" ON WINDOWS — MEASURED, NOT ASSUMED ──
//
// 🔴 THREE AGENTS BURNED THEMSELVES ON THIS, so the fact is sealed here rather
//    than written in prose. The idea was sound: a tiny parent holds the listening
//    socket, a child does the work; the child exits (stale code, recycling) and
//    the parent keeps the port, so nothing is refused meanwhile. That is exactly
//    what systemd socket activation gives us on Linux — for free, from the kernel.
// 📐 WHAT WAS MEASURED ON WINDOWS (Node 22.15.1, 2026-08-20), in order:
//    ① passing an ACCEPTED SOCKET to the child — `subprocess.send('sock', socket)`
//       throws **EMFILE** on the very first call. The capability is absent, not slow.
//    ② `cluster` — the platform's own answer — does NOT cover it: default policy on
//       Windows is SCHED_NONE, so the LISTENING socket lives in the worker and dies
//       with it (`ECONNREFUSED`). Forcing `SCHED_RR` moves the listen to the primary
//       but the primary dispatches immediately instead of queuing (`ECONNRESET`).
//    ③ passing the LISTENING SERVER works, twice over, and the parent does keep the
//       port — but a connection issued while no child accepts is **NEVER RESOLVED**:
//       not refused, not reset, it hangs. Measured at the 5,000 ms observation bound.
// 🛑 SO THE PARENT IS REFUSED, AND FOR THE REASON THAT MATTERS: it does not remove
//    the window, it makes it WORSE. Today the caller gets an instant, loud
//    `ECONNREFUSED`; with the parent it would wait on a socket nobody will ever
//    answer — up to the harness timeout, per frame. **A fast, noisy failure beats a
//    silent hang**, and turning one into the other is a regression however clever
//    the plumbing. On Linux the question does not arise: the kernel owns the socket
//    and its backlog, which is precisely why socket activation was the right answer.
// ⚠️ THIS CELL IS A DRIFT-TEST ON A THIRD PARTY, and it is meant to be. If it ever
//    turns RED, Windows/Node gained the missing capability and the parent becomes
//    buildable — that is news worth a red, never a test to delete.
// 🛑 AND IT CONTAINS NO DELAY, WHICH IS THE WHOLE DIFFICULTY OF WRITING IT. The
//    obvious version waits ~1.5 s and concludes "still nothing, therefore hung" —
//    an INFERENCE, and the temporal gate rejected exactly that (rightly: the
//    manifest says four waits are "a ceiling, not a licence"). The observable does
//    exist and it is the ORDER: a request issued LATER is served by the replacement
//    while the earlier one is still pending. A LATER cause producing an EARLIER
//    effect is decidable, needs no clock, and is a STRONGER statement than any
//    timeout — the connection is not slow, it has been overtaken and abandoned.
test.skipIf(process.platform !== 'win32')('SEALED FACT (win32): a connection issued while no child accepts is OVERTAKEN and left unanswered', async () => {
  const enfant = path.join(TMP, 'accepteur.js');
  fs.writeFileSync(enfant, `
    const http = require('http');
    process.on('message', (msg, handle) => {
      if (msg !== 'server' || !handle) return;
      http.createServer((req, res) => res.end('child:' + process.pid)).listen(handle, () => process.send('up'));
    });
  `);

  const server = net.createServer();               // the parent NEVER accepts
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  const spawnChild = () => new Promise((ready) => {
    const c = fork(enfant);
    c.on('message', (m) => { if (m === 'up') ready(c); });
    c.send('server', server);
  });
  // Every call carries its own SETTLED flag: the question "has this one come back
  // yet?" is then answered by reading a boolean, never by waiting on a clock.
  const call = () => {
    const tracked = { settled: false, result: null };
    tracked.done = new Promise((res) => {
      const done = (r) => { tracked.settled = true; tracked.result = r; res(r); };
      const req = http.request({ host: '127.0.0.1', port, method: 'GET', path: '/' },
        (r) => { let b = ''; r.on('data', (d) => { b += d; }); r.on('end', () => done({ issue: 'served', by: b })); });
      req.on('error', (e) => done({ issue: 'error', code: e.code }));
      req.end();
    });
    return tracked;
  };

  try {
    const first = await spawnChild();
    const before = await call().done;
    // ANTI-VACUITY: the assembly must genuinely work before we assert that it fails
    // in one precise spot. Without this the cell would also pass on a parent that
    // never listened at all — the mute-probe trap.
    assert.strictEqual(before.issue, 'served', `the handed-over server must serve normally first (got ${JSON.stringify(before)})`);

    const dead = new Promise((r) => first.once('exit', r));
    first.kill();
    await dead;                                     // an OS EVENT, never a delay
    const inFlight = call();                        // issued while NOBODY accepts
    const second = await spawnChild();              // the replacement takes over
    const after = await call().done;                // issued AFTER it — and awaited

    assert.strictEqual(after.issue, 'served', `the replacement must serve the NEXT calls (got ${JSON.stringify(after)})`);
    assert.notStrictEqual(second.pid, first.pid, 'the two children must really be distinct processes');
    assert.strictEqual(inFlight.settled, false,
      `Windows answered a connection issued during the window (${JSON.stringify(inFlight.result)}). `
      + 'That is NEWS: the capability this cell records as ABSENT now exists, so a port-holding '
      + 'parent becomes buildable and backlog item 4 can be reopened. Re-measure before believing it.');
    second.kill();
  } finally {
    server.close();
  }
});

// ── ⑦ THE DEATH NAMES ITS CAUSE — REAL KERNEL EVENT, END TO END ──
// 🔴 THE DEFECT MEASURED 2026-08-23: 169 `stale-code-exit` lines in ONE DAY,
//    median lifetime 224 s, and NOT ONE of them said WHICH FILE or WHICH KIND
//    of event killed the daemon. No file under `src/` had been modified for
//    hours, so the journal disagreed with the disk and there was nothing to
//    read: every hypothesis cost a full round trip. `fs.watch` hands its
//    callback `(eventType, filename)` and `watchOwnCode` used to throw both
//    away.
// 🛑 THE EVENT IS THE REAL ONE, NEVER AN INJECTED CALLBACK. An injected watcher
//    would prove only that our own closure passes its own arguments along — a
//    twin, green whatever the kernel actually delivers. What is at stake is the
//    end-to-end path kernel ⇒ `watchOwnCode` ⇒ `staleCodeFields` ⇒ the journal
//    line, so the write below is a genuine filesystem mutation.
// ⚠️ NO DELAY, AND THAT IS DELIBERATE (`temporal-budget.json` holds this suite
//    at FOUR): the watch is armed synchronously when `watchOwnCode` returns, and
//    what is awaited is the kernel's own notification. `testTimeout` is the
//    bound; a sleep here would be a guess where an event exists.
test('REAL EVENT: the stale-code line NAMES the file and the kind of event', async () => {
  const { staleCodeFields } = require_('../src/hooks/http-server.js');
  const { formatEvent } = require_('../src/lifecycle-log-pure.js');

  const dir = fs.mkdtempSync(path.join(TMP, 'cause-'));
  const target = path.join(dir, 'module.js');
  fs.writeFileSync(target, 'v1');

  let told;
  const first = new Promise((resolve) => { told = resolve; });
  // The watched set is DERIVED from a module cache, exactly as in production:
  // one loaded module inside `dir` is what puts `dir` under watch.
  const watchers = watchOwnCode(
    (d, cb) => fs.watch(d, { persistent: false }, cb),
    { [path.join(dir, 'module.js')]: 1 },
    (change) => told(change),
  );
  assert.strictEqual(watchers.length, 1, 'anti-vacuity: the directory must really be watched');

  fs.writeFileSync(target, 'v2');            // a REAL mutation, seen by the OS
  const change = await first;                // a KERNEL EVENT, never a delay
  for (const w of watchers) w.close();

  // The journal line, rendered by the very function the daemon uses.
  const line = formatEvent({
    at: '2026-08-23T20:00:00.000Z',
    event: 'stale-code-exit',
    fields: staleCodeFields(change, 4242, 224000),
  });

  assert.ok(line.includes(' file=module.js'),
    `the line must NAME the file the kernel reported — got: ${line}`);
  assert.ok(/ kernelEvent=(rename|change)\b/.test(line),
    `the line must carry the KIND of event the kernel reported — got: ${line}`);
  assert.ok(line.includes(' dir=' + dir),
    `the line must say WHICH watched directory fired — got: ${line}`);
  // 🛑 The key is `kernelEvent`, never `event`: the renderer already prints
  //    `event=stale-code-exit`, and a second `event=` on one line would make
  //    every reader — human or `grep` — take the wrong one.
  assert.strictEqual(line.match(/(^| )event=/g).length, 1,
    `exactly one \`event=\` key per line — got: ${line}`);
  // The facts that were already there must not have been traded away.
  assert.ok(line.includes(' code=' + EXIT_STALE_CODE) && line.includes(' uptimeMs=224000'),
    `the pre-existing fields must survive — got: ${line}`);
});

// ── ⑦bis THE KERNEL MAY NAME NOTHING, AND THE JOURNAL MUST SAY SO ──
// ⚠️ Node documents that `filename` "may be null on some platforms" — an
//    EXPECTED case, not a bug. It must READ as an answer: omitting the field
//    would be indistinguishable from a build that never carried it, i.e. the
//    exact silence this work item removes.
test('a kernel notification with NO name still produces a readable line', () => {
  const { staleCodeFields, KERNEL_NAMED_NOTHING } = require_('../src/hooks/http-server.js');
  const { formatEvent } = require_('../src/lifecycle-log-pure.js');

  const render = (change) => formatEvent({
    at: '2026-08-23T20:00:00.000Z', event: 'stale-code-exit',
    fields: staleCodeFields(change, 1, 0),
  });

  const nameless = render({ dir: '/w/src', eventType: 'rename', filename: null });
  assert.ok(nameless.includes(' file=' + KERNEL_NAMED_NOTHING),
    `an unnamed file must print the sentinel, never vanish — got: ${nameless}`);
  assert.ok(!nameless.includes('undefined') && !nameless.includes('null'),
    `no raw \`null\`/\`undefined\` may reach the journal — got: ${nameless}`);
  // 🛑 FAIL-OPEN: the daemon must be able to record its death even when it was
  //    told nothing at all. A throw here would be a logging defect blocking an
  //    exit, and the exit is what protects against serving stale logic.
  const nothing = render(undefined);
  assert.ok(nothing.includes(' file=' + KERNEL_NAMED_NOTHING)
    && nothing.includes(' kernelEvent=' + KERNEL_NAMED_NOTHING),
  `a missing notification must still render — got: ${nothing}`);
});
