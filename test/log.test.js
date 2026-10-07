// ═══════════════════════════════════════════════════════════════════════
// log — THE I/O half of every journal: rotation by overflow, eviction by what
// it deletes, the level read from the REAL config, several writers at once.
// ═══════════════════════════════════════════════════════════════════════
//
// 🛑 AN EVICTION IS PROVEN BY WHAT IT DELETES. Every rotation cell writes PAST
//    the ceiling and asserts the FILE COUNT and the BYTES that survive — a
//    cleaner that matches nothing is indistinguishable from one that works.
// ⚠️ Everything happens inside OS tmpdirs this suite removes; the config is a
//    tmpdir file reached through `CTXROUTE_CONFIG_PATH` (reserved for tests), so
//    the operator's real config is never read nor written. That env mutation and
//    the spawn cell put this suite in the HEAVY lane, by classification.
// ═══════════════════════════════════════════════════════════════════════

import { test, afterAll, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const log = require_('../src/log.js');

const SANDBOXES = [];
const sandbox = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-log-'));
  SANDBOXES.push(dir);
  return dir;
};
afterAll(() => {
  for (const dir of SANDBOXES) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* a leftover tmpdir is not a failure */ }
  }
});

let savedConfig;
let savedState;
beforeEach(() => {
  savedConfig = process.env.CTXROUTE_CONFIG_PATH;
  savedState = process.env.CTXROUTE_STATE_DIR;
});
afterEach(() => {
  if (savedConfig === undefined) delete process.env.CTXROUTE_CONFIG_PATH;
  else process.env.CTXROUTE_CONFIG_PATH = savedConfig;
  if (savedState === undefined) delete process.env.CTXROUTE_STATE_DIR;
  else process.env.CTXROUTE_STATE_DIR = savedState;
});

// Writes a config and gives it an mtime of its own, so two configs of the same
// size written within one clock tick can never be mistaken for one another by
// the (size, mtime) cache — a property of the test's speed, not of the cache.
let mtimeTick = 1_700_000_000;
const writeConfig = (dir, config) => {
  const file = path.join(dir, 'ctxroute-config.json');
  fs.writeFileSync(file, JSON.stringify(config));
  mtimeTick += 10;
  fs.utimesSync(file, mtimeTick, mtimeTick);
  process.env.CTXROUTE_CONFIG_PATH = file;
  return file;
};

// One traversal per statement: a chained `.filter().map()` reads as a nested traversal.
const sizes = (dir, prefix) => {
  const names = fs.readdirSync(dir).filter((f) => f.startsWith(prefix));
  names.sort();
  return names.map((f) => [f, fs.statSync(path.join(dir, f)).size]);
};

// ═══════════════════════════════════════════════════════════════════════
// ① REFUSALS — nothing outside the registry reaches the disk
// ═══════════════════════════════════════════════════════════════════════

test('an unknown journal or event writes NOTHING, not even the file', () => {
  const dir = sandbox();
  const file = path.join(dir, 'x.log');
  assert.equal(log.write('nope', 'hook-error', {}, { file }), false);
  assert.equal(log.write('hooks', 'start', {}, { file }), false);
  assert.equal(log.write('daemon', 'hook-error', {}, { file }), false);
  assert.equal(fs.existsSync(file), false);
});

test('the journal paths come from paths.stateDir(), lazily', () => {
  const dir = sandbox();
  process.env.CTXROUTE_STATE_DIR = dir;
  assert.equal(log.journalPath('hooks'), path.join(dir, 'ctxroute-hooks.log'));
  assert.equal(log.journalPath('daemon'), path.join(dir, 'ctxroute-daemon.log'));
  assert.equal(log.journalPath('nope'), null);
});

test('FAIL-OPEN: an impossible destination or a broken clock returns false and throws nothing', () => {
  const dir = sandbox();
  const blocker = path.join(dir, 'blocker');
  fs.writeFileSync(blocker, 'not a directory');
  assert.equal(log.write('hooks', 'hook-error', { error: 'x' }, { file: path.join(blocker, 'h.log') }), false);
  assert.equal(log.write('hooks', 'hook-error', {}, { file: path.join(dir, 'h.log'), now: () => { throw new Error('x'); } }), false);
  assert.equal(log.enabled('nope', 'x'), false);
});

// ═══════════════════════════════════════════════════════════════════════
// ② THE LEVEL — read from the real config, re-read when it changes
// ═══════════════════════════════════════════════════════════════════════

test('🛑 with NO config at all, errors are written and the trace is not', () => {
  const dir = sandbox();
  process.env.CTXROUTE_CONFIG_PATH = path.join(dir, 'absent.json');
  const file = path.join(dir, 'h.log');
  assert.equal(log.write('hooks', 'hook-error', { hook: 'x', error: 'boom' }, { file, now: () => 'T1' }), true);
  assert.equal(log.write('hooks', 'hook-trace', { hook: 'x' }, { file, now: () => 'T2' }), false);
  assert.equal(fs.readFileSync(file, 'utf8'), 'T1 event=hook-error hook=x error=boom\n');
  assert.equal(log.enabled('hooks', 'hook-error'), true);
  assert.equal(log.enabled('hooks', 'hook-trace'), false);
});

test('🛑 debug switches ON and OFF by editing the config — no restart, the next record obeys', () => {
  const dir = sandbox();
  const file = path.join(dir, 'h.log');
  writeConfig(dir, { logging: { level: 'debug' } });
  assert.equal(log.enabled('hooks', 'hook-trace'), true);
  assert.equal(log.write('hooks', 'hook-trace', { n: 1 }, { file, now: () => 'T1' }), true);
  writeConfig(dir, { logging: { level: 'error' } });
  assert.equal(log.enabled('hooks', 'hook-trace'), false);
  assert.equal(log.write('hooks', 'hook-trace', { n: 2 }, { file, now: () => 'T2' }), false);
  // Errors are written at BOTH levels.
  assert.equal(log.write('hooks', 'hook-error', { n: 3 }, { file, now: () => 'T3' }), true);
  writeConfig(dir, { logging: { level: 'debug' } });
  assert.equal(log.write('hooks', 'hook-trace', { n: 4 }, { file, now: () => 'T4' }), true);
  assert.equal(fs.readFileSync(file, 'utf8'),
    'T1 event=hook-trace n=1\nT3 event=hook-error n=3\nT4 event=hook-trace n=4\n');
});

test('the daemon journal\'s per-request trace obeys the same level', () => {
  const dir = sandbox();
  const file = path.join(dir, 'd.log');
  writeConfig(dir, { logging: {} });
  assert.equal(log.write('daemon', 'request', { route: '/pretool' }, { file, now: () => 'T1' }), false);
  writeConfig(dir, { logging: { level: 'debug' } });
  assert.equal(log.write('daemon', 'request', { route: '/pretool' }, { file, now: () => 'T2' }), true);
  assert.equal(fs.readFileSync(file, 'utf8'), 'T2 event=request route=/pretool\n');
});

test('🛑 a REFUSED setting is said in the journal once per process and reason, and errors still land', () => {
  const dir = sandbox();
  const file = path.join(dir, 'h.log');
  writeConfig(dir, { logging: { level: 'debug', keptFiles: 99 } });
  assert.equal(log.write('hooks', 'hook-error', { n: 1 }, { file, now: () => 'T1' }), true);
  assert.equal(log.write('hooks', 'hook-error', { n: 2 }, { file, now: () => 'T2' }), true);
  // Defaults in force: the refused `debug` did NOT apply.
  assert.equal(log.write('hooks', 'hook-trace', { n: 3 }, { file, now: () => 'T3' }), false);
  const lines = fs.readFileSync(file, 'utf8').trimEnd().split('\n');
  assert.deepEqual(lines, [
    `T1 event=logging-refused reason=\`logging.keptFiles\` is 99, expected an integer from 1 to 10 pid=${process.pid}`,
    'T1 event=hook-error n=1',
    'T2 event=hook-error n=2',
  ]);
});

test('an unreadable config is an ABSENT config: defaults, never a crash', () => {
  const dir = sandbox();
  const cfg = path.join(dir, 'ctxroute-config.json');
  fs.writeFileSync(cfg, '{ not json');
  process.env.CTXROUTE_CONFIG_PATH = cfg;
  assert.deepEqual(log.settings().settings, { level: 'error', maxBytes: 262144, keptFiles: 2 });
  assert.equal(log.write('hooks', 'hook-error', {}, { file: path.join(dir, 'h.log'), now: () => 'T' }), true);
});

// ═══════════════════════════════════════════════════════════════════════
// ③ ROTATION — N files, proven by overflow and by what it deletes
// ═══════════════════════════════════════════════════════════════════════

const flood = (file, n, settings) => {
  for (let i = 1; i <= n; i += 1) {
    assert.equal(log.write('hooks', 'hook-error', { i, blob: 'y'.repeat(100) }, { file, settings, now: () => 'T' }), true);
  }
};

test('🛑 keptFiles = 4: an overflow of ~10 ceilings leaves EXACTLY 4 files, and the bytes are bounded', () => {
  const dir = sandbox();
  const file = path.join(dir, 'h.log');
  const settings = { maxBytes: 1000, keptFiles: 4 };
  flood(file, 100, settings); // ~12 KB offered for a 4 KB ceiling
  const kept = sizes(dir, 'h.log');
  assert.deepEqual(kept.map(([f]) => f), ['h.log', 'h.log.1', 'h.log.2', 'h.log.3']);
  const total = kept.reduce((sum, [, n]) => sum + n, 0);
  // Rotation is decided BEFORE a write, so each file may pass its ceiling by
  // the one record that triggered the next rotation.
  assert.ok(total <= 4 * (1000 + 130), `journal at ${total} bytes for a ceiling of 4 × 1000`);
  // Anti-vacuity: the rotated generations really reached the ceiling.
  assert.ok(kept.slice(1).every(([, n]) => n >= 1000), JSON.stringify(kept));
});

test('the newest generation is .1 and the oldest the highest suffix — no generation is skipped', () => {
  const dir = sandbox();
  const file = path.join(dir, 'h.log');
  const settings = { maxBytes: 1000, keptFiles: 3 };
  flood(file, 40, settings);
  const firstI = (f) => Number(/ i=(\d+) /.exec(fs.readFileSync(path.join(dir, f), 'utf8'))[1]);
  assert.ok(firstI('h.log.2') < firstI('h.log.1') && firstI('h.log.1') < firstI('h.log'));
});

test('🛑 LOWERING keptFiles 5 → 2 DELETES the stranded generations at the next rotation (measured)', () => {
  const dir = sandbox();
  const file = path.join(dir, 'h.log');
  flood(file, 60, { maxBytes: 1000, keptFiles: 5 });
  assert.deepEqual(sizes(dir, 'h.log').map(([f]) => f), ['h.log', 'h.log.1', 'h.log.2', 'h.log.3', 'h.log.4']);
  const before = sizes(dir, 'h.log').reduce((s, [, n]) => s + n, 0);
  // Write until ONE rotation happens under the lowered setting.
  flood(file, 12, { maxBytes: 1000, keptFiles: 2 });
  const after = sizes(dir, 'h.log');
  assert.deepEqual(after.map(([f]) => f), ['h.log', 'h.log.1'], 'the stranded .2 .3 .4 survived');
  const freed = before - after.reduce((s, [, n]) => s + n, 0);
  assert.ok(freed >= 2000, `only ${freed} bytes freed by evicting three generations`);
});

test('keptFiles = 1: the journal starts over, a single file remains', () => {
  const dir = sandbox();
  const file = path.join(dir, 'h.log');
  flood(file, 30, { maxBytes: 1000, keptFiles: 1 });
  const kept = sizes(dir, 'h.log');
  assert.deepEqual(kept.map(([f]) => f), ['h.log']);
  assert.ok(kept[0][1] <= 1000 + 130);
});

test('the rotation lock is released: no `.lock-log-*` directory survives', () => {
  const dir = sandbox();
  flood(path.join(dir, 'h.log'), 30, { maxBytes: 1000, keptFiles: 2 });
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.startsWith('.lock')), []);
});

// ═══════════════════════════════════════════════════════════════════════
// ④ SEVERAL PROCESSES AT ONCE — the hooks journal is shared
// ═══════════════════════════════════════════════════════════════════════

test('🛑 4 processes rotating the SAME journal: never more than keptFiles files, every line whole', async () => {
  const dir = sandbox();
  const file = path.join(dir, 'h.log');
  const script = [
    "const log = require(process.argv[1]);",
    "const file = process.argv[2];",
    "for (let i = 0; i < 150; i += 1) {",
    "  log.write('hooks', 'hook-error', { w: process.pid, i, blob: 'z'.repeat(80) },",
    "    { file, settings: { maxBytes: 2000, keptFiles: 3 } });",
    "}",
  ].join('\n');
  const one = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', script, require_.resolve('../src/log.js'), file], { stdio: 'ignore' });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('writer exited ' + code))));
  });
  await Promise.all([one(), one(), one(), one()]);
  const kept = fs.readdirSync(dir).filter((f) => f.startsWith('h.log'));
  kept.sort();
  assert.ok(kept.length <= 3 && kept.length >= 2, JSON.stringify(kept));
  let text = '';
  for (const f of kept) text += fs.readFileSync(path.join(dir, f), 'utf8');
  const lines = text.split('\n').filter(Boolean);
  assert.ok(lines.length > 20, 'anti-vacuity: almost nothing was kept');
  const malformed = lines.filter((l) => !/^\S+ event=hook-error w=\d+ i=\d+ blob=z{80}$/.test(l));
  assert.deepEqual(malformed, []);
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.startsWith('.lock')), []);
});
