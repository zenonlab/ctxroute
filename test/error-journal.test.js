// ═══════════════════════════════════════════════════════════════════════
// A FAILURE THE RUNTIME SURVIVES LEAVES ITS LINE — by real processes and real
// modules, never by a fabricated caller (2026-10-04).
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 WHAT THIS PROVES, cell by cell: the spawned hooks journal an unreadable
//    payload and still leave exit 0 with nothing on stdout; the shared state
//    store journals a write it LOST; the memory store journals a corrupt
//    snapshot (and stays silent on an absent one, the normal first start); the
//    daemon's request handler journals an unparseable payload and still answers
//    "nothing to inject"; one failure repeated is written ONCE per process.
// ⚠️ HONEST SCOPE: the outer `catch` of `pretool-core`, `guard-core` and the
//    three source adapters is reached by no input today (every layer under them
//    is fail-open on its own); those sites are held by `silent-catch-gate`
//    (the call must be there) and `log.hookError` itself is proven below.
// ⚠️ Every path is a tmpdir reached through the test-reserved `CTXROUTE_*`
//    variables; nothing of the operator's real state is read or written.
// ═══════════════════════════════════════════════════════════════════════

import { test, afterAll, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require_ = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOOKS = path.join(ROOT, 'src', 'hooks');

const SANDBOXES = [];
const sandbox = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-errjournal-'));
  SANDBOXES.push(dir);
  return dir;
};
afterAll(() => {
  for (const dir of SANDBOXES) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* a leftover tmpdir is not a failure */ }
  }
});

let saved;
beforeEach(() => {
  saved = { config: process.env.CTXROUTE_CONFIG_PATH, state: process.env.CTXROUTE_STATE_DIR };
});
afterEach(() => {
  for (const [k, v] of [['CTXROUTE_CONFIG_PATH', saved.config], ['CTXROUTE_STATE_DIR', saved.state]]) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const isolate = () => {
  const dir = sandbox();
  const state = path.join(dir, 'state');
  fs.mkdirSync(state);
  const config = path.join(dir, 'ctxroute-config.json');
  fs.writeFileSync(config, JSON.stringify({ enabled: true, stateDir: state, docsDir: path.join(dir, 'docs'), sessionDocsDir: path.join(dir, 'session') }));
  process.env.CTXROUTE_CONFIG_PATH = config;
  process.env.CTXROUTE_STATE_DIR = state;
  return { dir, state, config };
};
const read = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');

// ═══════════════════════════════════════════════════════════════════════
// ① THE SPAWNED HOOKS, BY REAL PROCESS
// ═══════════════════════════════════════════════════════════════════════

for (const hook of ['ctxroute-reset', 'turn-count', 'canary-check', 'session-inject']) {
  test(`${hook}: an unreadable payload ⇒ exit 0, nothing on stdout, ONE hook-error line`, () => {
    const { state, config } = isolate();
    const r = spawnSync(process.execPath, [path.join(HOOKS, `${hook}.js`)], {
      input: '{"session_id":',
      env: { ...process.env, CTXROUTE_CONFIG_PATH: config, CTXROUTE_STATE_DIR: state },
      encoding: 'utf8',
    });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, '');
    const lines = read(path.join(state, 'ctxroute-hooks.log')).trimEnd().split('\n');
    assert.equal(lines.length, 1, lines.join('\n'));
    assert.match(lines[0], new RegExp(`^\\S+ event=hook-error hook=${hook} error=.*JSON.* pid=\\d+$`));
  });
}

// ═══════════════════════════════════════════════════════════════════════
// ② THE SHARED STATE STORE — a LOST write is said
// ═══════════════════════════════════════════════════════════════════════

test('session-store: a write that can never land (the target is a directory) is journalled as LOST', () => {
  const { state } = isolate();
  const store = require_('../src/session-store.js');
  fs.mkdirSync(path.join(state, 'doc-seen-s1.json'));
  assert.doesNotThrow(() => store.saveState('doc-seen-', 's1', { a: 1 }));
  const text = read(path.join(state, 'ctxroute-hooks.log'));
  assert.match(text, /event=hook-error hook=session-store error=state write lost: rename failed \d+ times \(doc-seen-\)/);
  // No temporary left behind by the failed write.
  assert.deepEqual(fs.readdirSync(state).filter((f) => f.endsWith('.tmp')), []);
});

test('session-store: a write that lands writes NOTHING to the journal', () => {
  const { state } = isolate();
  const store = require_('../src/session-store.js');
  store.saveState('doc-seen-', 's2', { a: 1 });
  assert.deepEqual(store.loadState('doc-seen-', 's2'), { a: 1 });
  assert.equal(read(path.join(state, 'ctxroute-hooks.log')), '');
});

// ═══════════════════════════════════════════════════════════════════════
// ③ THE MEMORY STORE — a corrupt snapshot is said, an absent one is not
// ═══════════════════════════════════════════════════════════════════════

test('memory-store: a CORRUPT snapshot ⇒ empty memory AND a daemon-error line; an ABSENT one ⇒ silence', () => {
  const { state } = isolate();
  const { createMemoryStore } = require_('../src/memory-store.js');
  const absent = createMemoryStore({ snapshotPath: path.join(state, 'absent.json'), onExit: () => () => {} });
  assert.equal(absent.restore(), 0);
  assert.equal(read(path.join(state, 'ctxroute-daemon.log')), '', 'the normal first start must write nothing');
  const corrupt = path.join(state, 'corrupt.json');
  fs.writeFileSync(corrupt, '{ not json');
  const store = createMemoryStore({ snapshotPath: corrupt, onExit: () => () => {} });
  assert.equal(store.restore(), 0);
  assert.match(read(path.join(state, 'ctxroute-daemon.log')),
    /event=daemon-error site=memory-snapshot-load error=.+ pid=\d+\n$/);
});

// ═══════════════════════════════════════════════════════════════════════
// ④ THE DAEMON'S REQUEST HANDLER — the REAL `handle`
// ═══════════════════════════════════════════════════════════════════════

test('http-server handle: an unparseable payload still answers "nothing", and the daemon journal says why', () => {
  const { state } = isolate();
  const server = require_('../src/hooks/http-server.js');
  const answer = server.handle('{"tool_name":', '/pretool?frame=1&frames=1', {});
  assert.equal(answer, server.NO_OUTPUT);
  assert.match(read(path.join(state, 'ctxroute-daemon.log')),
    /event=daemon-error site=payload error=.*JSON.* pid=\d+\n$/);
});

// ═══════════════════════════════════════════════════════════════════════
// ⑤ ONE FAILURE, ONE LINE PER PROCESS
// ═══════════════════════════════════════════════════════════════════════

test('a failure repeated is written ONCE per process; a different one gets its own line', () => {
  const { state } = isolate();
  const log = require_('../src/log.js');
  const err = () => Object.assign(new Error('docs folder unreadable'), { code: 'EACCES' });
  assert.equal(log.hookError('dedup-probe', err()), true);
  assert.equal(log.hookError('dedup-probe', err()), false, 'the same failure twice must not flood');
  assert.equal(log.hookError('dedup-probe', new Error('another failure')), true);
  assert.equal(log.daemonError('dedup-probe', err()), true, 'the daemon journal keeps its own line');
  const hooks = read(path.join(state, 'ctxroute-hooks.log')).trimEnd().split('\n');
  assert.equal(hooks.length, 2);
  assert.match(hooks[0], /event=hook-error hook=dedup-probe error=docs folder unreadable code=EACCES at=\S.* pid=\d+$/);
  assert.match(read(path.join(state, 'ctxroute-daemon.log')), /event=daemon-error site=dedup-probe error=docs folder unreadable code=EACCES/);
});

test('a non-Error value is journalled by its text, with no code and no frame', () => {
  const { state } = isolate();
  const log = require_('../src/log.js');
  assert.equal(log.hookError('plain-value-probe', 'just a string'), true);
  assert.match(read(path.join(state, 'ctxroute-hooks.log')), /event=hook-error hook=plain-value-probe error=just a string pid=\d+\n$/);
});
