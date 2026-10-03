// daemon-idle-exit — the REAL daemon leaves when nobody asks, and only then.
//
// 🛑 WHAT MUST BE PROVEN, ON THE REAL PROCESS (a unit cell proves the verdict,
//    only a fork proves the wiring — the timer, the shared counter, the exit):
//    ① `on-demand` LEAVES once a whole window passes with no request — exit 0,
//      so no supervisor restarts it, and the journal says `idle-exit`;
//    ② while requests keep coming it STAYS, across several windows;
//    ③ `login` NEVER arms the window;
//    ④ a refused declaration STOPS the start, loudly, never runs under a mode
//      nobody declared.
// ⚠️ Each cell runs on a COPY of `src/` in a tmpdir, never the live tree: an
//    agent editing the repository mid-run would make the daemon exit 90 on its
//    own stale-code check and the cell would read that as an idle exit.
// ⚠️ ONE temporal call site (`pause`), declared `undecidable` in
//    `temporal-budget.json`: it yields between two observations of a process
//    this suite does not own. Nothing is concluded from the time that passed —
//    the verdicts are the child's exit CODE and its journal.
import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { freePort } from './support/free-port.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-idle-'));
afterAll(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* best effort */ } });

const pause = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

const post = (port) => new Promise((resolve, reject) => {
  const body = JSON.stringify({ session_id: 'idle-cell' });
  const req = http.request({
    host: '127.0.0.1', port, path: '/turn?frame=1&frames=2', method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
  }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
  req.on('error', reject);
  req.end(body);
});

/**
 * A daemon on a private copy, with a private state, config and port.
 * @param {string} name
 * @param {Record<string, unknown>} httpExtra merged into the `http` key
 */
async function start(name, httpExtra) {
  const root = path.join(TMP, name);
  const state = path.join(root, 'state');
  const docs = path.join(root, 'docs');
  const config = path.join(root, 'cfg.json');
  fs.cpSync(path.join(REPO, 'src'), path.join(root, 'tree', 'src'), { recursive: true });
  fs.mkdirSync(state, { recursive: true });
  fs.mkdirSync(docs, { recursive: true });
  const port = await freePort();
  fs.writeFileSync(config, JSON.stringify({
    enabled: true, frames: 2, http: { host: '127.0.0.1', port, listeners: 1, ...httpExtra },
  }));
  const child = fork(path.join(root, 'tree', 'src', 'hooks', 'http-daemon.js'), [], {
    env: {
      ...process.env, CTXROUTE_STATE_DIR: state, CTXROUTE_FILEDOCS_DIR: docs, CTXROUTE_CONFIG_PATH: config,
    },
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  let stderr = '';
  child.stderr.on('data', (b) => { stderr = (stderr + b).slice(-4000); });
  const exited = new Promise((resolve) => child.once('exit', (code) => resolve({ code, at: Date.now() })));
  const alive = () => child.exitCode === null && child.signalCode === null;
  const journal = () => { try { return fs.readFileSync(path.join(state, 'ctxroute-daemon.log'), 'utf8'); } catch { return ''; } };
  // Serving yet? Asked of the KERNEL — a refused connection is an answer.
  let up = false;
  for (let i = 0; i < 800 && alive() && !up; i += 1) {
    up = await post(port).then(() => true, () => false);
    if (!up) await pause(25);
  }
  return { child, port, exited, alive, journal, up, stderr: () => stderr };
}

test('① + ② on-demand STAYS while asked, then LEAVES with exit 0 once a whole window is quiet', async () => {
  const d = await start('on-demand', { lifecycle: 'on-demand', idleSeconds: 2 });
  assert.ok(d.up, `the daemon never served: ${d.stderr()}`);
  // ② Five seconds of traffic — two and a half windows — and it must still be here.
  for (let i = 0; i < 12; i += 1) {
    await post(d.port);
    await pause(400);
  }
  assert.ok(d.alive(), 'a daemon that leaves while requests keep coming drops a working session');
  await post(d.port);
  const lastRequestAt = Date.now();
  const { code, at } = await d.exited;
  assert.equal(code, 0, 'exit 0 is what keeps every supervisor from restarting an idle daemon');
  assert.ok(at - lastRequestAt >= 1500,
    `it left ${at - lastRequestAt} ms after the last request, inside the 2 s window`);
  const log = d.journal();
  assert.match(log, /event=start[^\n]*lifecycle=on-demand[^\n]*idleSeconds=2/,
    'the start line must say which mode runs — a default nobody can see is an outage nobody can explain');
  assert.match(log, /event=idle-exit[^\n]*idleSeconds=2/);
}, 60000);

test('③ login NEVER arms the window: three idle windows later it is still serving', async () => {
  const d = await start('login', { lifecycle: 'login', idleSeconds: 1 });
  assert.ok(d.up, `the daemon never served: ${d.stderr()}`);
  await pause(3500);
  try {
    assert.ok(d.alive(), 'a login daemon left on idle: nothing would ever start it again on Windows');
    assert.equal(await post(d.port), 200);
    assert.match(d.journal(), /event=start[^\n]*lifecycle=login/);
    assert.doesNotMatch(d.journal(), /event=idle-exit/);
    assert.doesNotMatch(d.journal(), /event=start[^\n]*idleSeconds=/,
      '`idleSeconds` is null — hence omitted — when no window is armed');
  } finally {
    d.child.kill();
    await d.exited;
  }
}, 60000);

test('④ a refused declaration STOPS the start and says why', async () => {
  const d = await start('refused', { lifecycle: 'sometimes' });
  const { code } = await d.exited;
  assert.equal(d.up, false, 'a daemon serving under a mode nobody declared is the silent default this refuses');
  assert.notEqual(code, 0);
  assert.match(d.stderr(), /`http\.lifecycle` = "sometimes" is refused\. It must be one of auto, on-demand, login\./);
}, 60000);
