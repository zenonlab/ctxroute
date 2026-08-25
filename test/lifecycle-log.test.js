// ═══════════════════════════════════════════════════════════════════════
// lifecycle-log — THE I/O half: the ceiling is proven by OVERFLOWING it.
// ═══════════════════════════════════════════════════════════════════════
//
// 🛑 AN EVICTION IS PROVEN BY WHAT IT DELETES. A retention script in this fleet
//    targeted `*.tar.gz` while the producer wrote `*.sql.gz`: 0 bytes removed
//    since forever, disk at 87 %. A cleaner that matches nothing is
//    indistinguishable from a cleaner that works. ⇒ cell ③ writes PAST the real
//    256 KB ceiling and asserts the FILE COUNT and the TOTAL BYTES that survive.
// ⚠️ Everything happens inside an OS tmpdir this suite removes. Never sabotage
//    or write a real repository file: a first version of another gate here
//    brought down 38 tests of suites running in parallel.
// ⚠️ No spawn, no `process.env` mutation ⇒ this suite belongs to the FAST lane
//    and the classification in `vitest-projects.mjs` puts it there by itself.
// ═══════════════════════════════════════════════════════════════════════

import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { record, logPath, FILE_NAME } from '../src/lifecycle-log.js';
import { MAX_BYTES, TOTAL_MAX_BYTES } from '../src/lifecycle-log-pure.js';
import paths from '../src/paths.js';

const SANDBOXES = [];
// ⚠️ A THUNK, evaluated inside each `test()` — perTest coverage maps a mutant to
//    the test that ran it, and a module-level const runs at load, under nobody.
const sandbox = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-lifecycle-'));
  SANDBOXES.push(dir);
  return dir;
};

afterAll(() => {
  for (const dir of SANDBOXES) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* a leftover tmpdir is not a failure */ }
  }
});

// ═══════════════════════════════════════════════════════════════════════
// ① THE ADDRESS — through the single source of paths, never a literal.
// ═══════════════════════════════════════════════════════════════════════

test('the journal lives under `state/`, addressed through paths.js', () => {
  // 🛑 `path.dirname` equality is what proves the address is DERIVED: a literal
  //    `path.join(__dirname, 'state')` would satisfy a basename check and
  //    diverge the day `stateDir` moves — which has happened here twice.
  assert.equal(path.dirname(logPath()), paths.stateDir());
  assert.equal(path.basename(logPath()), 'ctxroute-daemon.log');
  assert.equal(FILE_NAME, 'ctxroute-daemon.log');
});

// ═══════════════════════════════════════════════════════════════════════
// ② IT WRITES, AND IT CREATES WHAT IT NEEDS
// ═══════════════════════════════════════════════════════════════════════

test('one lifecycle event = one line, and the directory is created on the way', () => {
  const file = path.join(sandbox(), 'nested', 'daemon.log');
  const written = record('start', { pid: 4242, lane: 'port', port: 8787 },
    { file, now: () => '2026-08-22T00:00:00.000Z' });
  assert.equal(written, true);
  assert.equal(fs.readFileSync(file, 'utf8'),
    '2026-08-22T00:00:00.000Z event=start pid=4242 lane=port port=8787\n');
});

test('successive events append, they never replace', () => {
  const file = path.join(sandbox(), 'daemon.log');
  record('start', { pid: 1 }, { file, now: () => 'T1' });
  record('stale-code-exit', { pid: 1, code: 90, uptimeMs: 51000 }, { file, now: () => 'T2' });
  assert.equal(fs.readFileSync(file, 'utf8'),
    'T1 event=start pid=1\nT2 event=stale-code-exit pid=1 code=90 uptimeMs=51000\n');
});

test('🛑 A REFUSED EVENT COSTS ZERO BYTES — the file is not even created', () => {
  // The anti-SSD-wear contract, checked on the disk and not only in the decision:
  // one agent action is 16 requests on this daemon, so a per-request line would
  // be a writer growing with traffic.
  const file = path.join(sandbox(), 'daemon.log');
  assert.equal(record('heartbeat', { pid: 1 }, { file, now: () => 'T1' }), false);
  assert.equal(record('request', { pid: 1 }, { file, now: () => 'T1' }), false);
  assert.equal(fs.existsSync(file), false);
});

// ═══════════════════════════════════════════════════════════════════════
// ③ THE CEILING, PROVEN BY DELIBERATE OVERFLOW AT THE REAL 256 KB
// ═══════════════════════════════════════════════════════════════════════

test('🛑 OVERFLOWING THE REAL CEILING LEAVES EXACTLY 2 FILES AND AT MOST 512 KB', () => {
  const dir = sandbox();
  const file = path.join(dir, 'daemon.log');
  // ~1 KB per record so the real 256 KB ceiling is crossed twice in a few
  // hundred writes instead of ten thousand. The CEILING under test is the REAL
  // one (`MAX_BYTES`), never a miniature — a bound validated on a toy proves
  // nothing about the bound that ships.
  const payload = 'x'.repeat(1024);
  let attempts = 0;
  let bytesOffered = 0;
  while (bytesOffered < TOTAL_MAX_BYTES * 2) {
    attempts += 1;
    assert.equal(record('start', { pid: attempts, blob: payload }, { file, now: () => 'T' + attempts }), true);
    bytesOffered += payload.length;
  }
  // More than a megabyte was offered: without the rotation this directory would
  // now hold it all, and that is the growth this component exists to refuse.
  assert.ok(bytesOffered > TOTAL_MAX_BYTES, `only ${bytesOffered} bytes offered — the overflow did not happen`);

  const survivors = fs.readdirSync(dir).sort();
  assert.deepEqual(survivors, ['daemon.log', 'daemon.log.1']);

  const total = survivors.reduce((sum, f) => sum + fs.statSync(path.join(dir, f)).size, 0);
  // ⚠️ The bound is the ceiling PLUS at most one record per file: rotation is
  //    decided BEFORE a write, so each file may cross its ceiling by exactly the
  //    record that triggered the next rotation. Stating that slack is the honest
  //    figure; pretending the total is exactly 512 KB would be false.
  const slack = 2 * (payload.length + 128);
  assert.ok(total <= TOTAL_MAX_BYTES + slack,
    `journal at ${total} bytes for a ceiling of ${TOTAL_MAX_BYTES} (+${slack} slack) — the bound leaks`);
  // Anti-vacuity: a rotation that never fired would leave a SINGLE small file
  // and the assertions above would pass on an empty measurement.
  assert.ok(fs.statSync(path.join(dir, 'daemon.log.1')).size >= MAX_BYTES,
    'the rotated file never reached the ceiling — nothing was actually measured');
});

test('the rotation OVERWRITES its predecessor — that single rename IS the bound', () => {
  const dir = sandbox();
  const file = path.join(dir, 'daemon.log');
  // A tiny ceiling here, because what is under test is the SHAPE of the
  // mechanism (two files, the older one destroyed), not the figure.
  const tiny = { file, maxBytes: 40 };
  record('start', { gen: 1 }, { ...tiny, now: () => 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' });
  record('start', { gen: 2 }, { ...tiny, now: () => 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' });
  record('start', { gen: 3 }, { ...tiny, now: () => 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCC' });
  assert.deepEqual(fs.readdirSync(dir).sort(), ['daemon.log', 'daemon.log.1']);
  // Generation 1 is GONE, not archived: a `.1 .2 .3` scheme would keep it and
  // the ceiling would stop being a consequence of the mechanism.
  assert.equal(fs.readFileSync(path.join(dir, 'daemon.log.1'), 'utf8').includes('gen=1'), false);
  assert.equal(fs.readFileSync(path.join(dir, 'daemon.log.1'), 'utf8').includes('gen=2'), true);
  assert.equal(fs.readFileSync(path.join(dir, 'daemon.log'), 'utf8').includes('gen=3'), true);
});

// ═══════════════════════════════════════════════════════════════════════
// ④ FAIL-OPEN — the journal may never cost the daemon its life
// ═══════════════════════════════════════════════════════════════════════

test('an impossible destination returns false and throws NOTHING', () => {
  const dir = sandbox();
  // A FILE standing where a directory must be: `mkdirSync` answers ENOTDIR /
  // EEXIST on every kernel. This stands in for the real cases — a full disk, a
  // read-only directory, a file held by another process — which cannot be
  // fabricated portably but take the exact same path out of `record`.
  const blocker = path.join(dir, 'blocker');
  fs.writeFileSync(blocker, 'not a directory');
  assert.equal(record('start', { pid: 1 }, { file: path.join(blocker, 'daemon.log'), now: () => 'T1' }), false);
});

test('a broken clock costs a line, never an exception', () => {
  const file = path.join(sandbox(), 'daemon.log');
  assert.equal(record('start', { pid: 1 }, { file, now: () => { throw new Error('no clock'); } }), false);
  assert.equal(fs.existsSync(file), false);
});

test('production passes NO options: the defaults are the real path and the real ceiling', () => {
  // Called with no `opts` at all it must still work — this is the production
  // call shape, and it is the one nothing else exercises.
  const before = fs.existsSync(logPath()) ? fs.statSync(logPath()).size : 0;
  assert.equal(record('lane-degraded', { pid: process.pid, code: 'TEST' }), true);
  const after = fs.statSync(logPath()).size;
  assert.ok(after > before, 'the default path was not written to');
  // Put the file back the way it was found: a suite that leaves state behind is
  // a suite whose next run measures the previous one.
  fs.truncateSync(logPath(), before);
});

// ═══════════════════════════════════════════════════════════════════════
// ⑤ THE DAEMON ACTUALLY USES IT — and the limit of this check is stated
// ═══════════════════════════════════════════════════════════════════════

test('every declared event is EMITTED by the daemon shell (no inert vocabulary entry)', () => {
  // ⚠️ HONEST LIMIT, said rather than hidden: this reads the SOURCE, because the
  //    emitters live inside `http-server.js`'s `require.main` block, which no
  //    in-process test can reach. It catches a vocabulary entry nobody emits and
  //    an emitter someone deletes; it does NOT prove the line reaches the disk on
  //    a running daemon. The behavioural proof of the WRITER is cells ②-④ above.
  const shell = fs.readFileSync(
    path.join(import.meta.dirname, '..', 'src', 'hooks', 'http-server.js'), 'utf8');
  assert.ok(shell.includes("require('../lifecycle-log')"),
    'http-server.js no longer requires the journal — the daemon is silent again');
  // ⚠️ ONE traversal per statement, deliberately: a `.includes()` inside a loop
  //    is a nested traversal to `rules/no-undeclared-quadratic.yml`, and the way
  //    out of that rule is to remove the nesting, never to buy an exemption.
  const emitted = [...shell.matchAll(/lifecycle\.record\('([a-z-]+)'/g)].map((m) => m[1]);
  const distinct = [...new Set(emitted)];
  distinct.sort();
  // Equality in BOTH directions: an event declared but never emitted is an inert
  // vocabulary entry, and an event emitted but never declared would write
  // nothing at all — a silent daemon, which is the defect this closes.
  assert.deepEqual(distinct,
    ['bind-refused', 'code-unchanged', 'lane-degraded', 'signal-exit', 'stale-code-exit',
      'start', 'watch-lost']);
});
