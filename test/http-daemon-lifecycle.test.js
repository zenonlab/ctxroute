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
import { execFile } from 'node:child_process';
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
