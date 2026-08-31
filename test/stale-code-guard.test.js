// ═══════════════════════════════════════════════════════════════════════
// THE STALE-CODE GUARD, ON THE REAL KERNEL — the four proofs.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 THE OUTAGE THIS REPRODUCES, MEASURED 2026-08-24. The daemon exited 90 on
//    ANY `fs.watch` notification, concluding "my code changed". An independent
//    witness caught the event at the exact millisecond of a death (18:47:19.717Z)
//    on the FROZEN copy: `mtime` 13:46:20 unchanged, `ctime` 13:53:22 unchanged,
//    **only `atime` had moved**. Nothing had written to that copy since it was
//    built, and the daemon had killed itself **258 times**. Cell ② is that exact
//    event, on purpose, for ever.
//
// 📐 WHY IT HAPPENS — vendor documentation, not reasoning: libuv
//    `src/win/fs-event.c` subscribes ReadDirectoryChangesW to eight filters
//    INCLUDING `FILE_NOTIFY_CHANGE_LAST_ACCESS`, and every one of them arrives
//    as a bare `'change'`; Microsoft `fsutil behavior` (page updated 2026-02-16):
//    *"One hour is the maximum amount of time that NTFS can defer updating Last
//    Access Time on disk"* — which is why a plain READ killed the service an hour
//    later. `fs.utimesSync` is used here because it is portable to all three
//    kernels and touches NO content: inotify raises `IN_ATTRIB` on it and
//    FSEvents raises `kFSEventStreamEventFlagItemInodeMetaMod`.
//
// 🛑 THE DAEMON UNDER TEST IS THE REAL ONE, RUN FROM AN ISOLATED COPY OF `src/`.
//    Not a twin: the same bootstrap, the same server, the same comparison. The
//    copy is what lets a LOADED MODULE really be edited without touching the
//    working repository — and, just as importantly, `paths.ROOT` differs, so
//    `kernel-endpoint` derives a DIFFERENT rendezvous and this suite can never
//    collide with a daemon serving the operator's fleet.
// ⚠️ Every wait below is an OBSERVATION of a fact (a process exit, a line in the
//    journal, a socket that answers), never a fixed delay used as a verdict. The
//    one genuinely undecidable question — "will the kernel ever deliver this
//    notification?" — is bounded by the suite's own timeout and nothing else.
// ═══════════════════════════════════════════════════════════════════════

import { test, beforeAll, afterAll, expect } from 'vitest';
import assert from 'node:assert';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);

const HERE = import.meta.dirname;
const REPO = path.join(HERE, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-stale-'));

/**
 * ONE COPY PER DAEMON, and it is not extravagance: `kernel-endpoint` derives the
 * rendezvous from a HASH OF THE ROOT, so two daemons sharing a root fight over
 * one named pipe and the second dies of `EADDRINUSE` — measured on the first run
 * of this suite. A root per cell also means a cell may edit a loaded module
 * without disturbing its neighbours.
 * @param {string} name
 * @returns {string} the copy's root
 */
function makeCopy(name) {
  const root = path.join(TMP, 'copy-' + name);
  fs.cpSync(path.join(REPO, 'src'), path.join(root, 'src'), { recursive: true });
  return root;
}

/** The module every edit below targets — one the daemon really loads. */
const victimOf = (root) => path.join(root, 'src', 'lib-pure.js');
/** Puts it back byte for byte, from the working repository. */
const restore = (root) => fs.writeFileSync(victimOf(root), fs.readFileSync(path.join(REPO, 'src', 'lib-pure.js')));

beforeAll(() => {
  fs.mkdirSync(path.join(TMP, 'docs'), { recursive: true });
  fs.mkdirSync(path.join(TMP, 'session'), { recursive: true });
  fs.mkdirSync(path.join(TMP, 'skills'), { recursive: true });
  fs.writeFileSync(path.join(TMP, 'config.json'), JSON.stringify({ enabled: true }));
});
afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

/** A port nobody holds — asked of the kernel, never guessed. */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function stateDirFor(name) {
  const dir = path.join(TMP, 'state-' + name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Starts a REAL daemon from the isolated copy.
 * ⚠️ Every address is overridden so nothing here can reach the operator's own
 *    configuration, state or corpus — the config lives at an OS-conventional
 *    address since 2026-08-24, so leaving it unset would read the real one.
 */
async function startDaemon(name, entry, root, options) {
  const port = await freePort();
  const stateDir = stateDirFor(name);
  const child = spawn(process.execPath, [path.join(root, 'src', 'hooks', entry)], {
    env: {
      ...process.env,
      CTXROUTE_HTTP_PORT: String(port),
      CTXROUTE_STATE_DIR: stateDir,
      CTXROUTE_FILEDOCS_DIR: path.join(TMP, 'docs'),
      CTXROUTE_SESSIONDOCS_DIR: path.join(TMP, 'session'),
      CTXROUTE_SKILLS_DIR: path.join(TMP, 'skills'),
      CTXROUTE_CONFIG_PATH: path.join(TMP, 'config.json'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (c) => { stderr += c; });
  child.stdout.resume();
  const ended = new Promise((resolve) => child.on('exit', (code, signal) => resolve({ code, signal })));
  let dead = null;
  ended.then((e) => { dead = e; });

  // Readiness is ASKED, never waited for: we retry the connection until the
  // kernel stops refusing it, and give up the moment the process is gone.
  // ⚠️ `serve: false` skips it for the ONE cell whose daemon is sabotaged into
  //    refusing every request — probing it would kill it through the wrong path.
  if (!options || options.serve !== false) {
    for (;;) {
      if (dead) throw new Error(`the daemon died before serving: ${JSON.stringify(dead)}\n${stderr}`);
      try { await ask(port, '{}'); break; } catch { /* not listening yet */ }
      await settle();
    }
  }
  return { port, stateDir, child, ended, stderr: () => stderr };
}

/**
 * Hands the loop back to the kernel between two observations.
 * ⚠️ NOT a delay used as a verdict: nothing below concludes anything from time
 *    passing. It exists so a polling loop does not saturate a core while the
 *    kernel is doing the work we are waiting on.
 */
const settle = () => new Promise((r) => setTimeout(r, 20));

/** One real POST, exactly as the harness issues it. */
function ask(port, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1', port, method: 'POST', path: '/pretool?frame=1&frames=1',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
    }, (res) => { let t = ''; res.on('data', (c) => { t += c; }); res.on('end', () => resolve(t)); });
    req.on('error', reject);
    req.end(body);
  });
}

const PAYLOAD = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'ls' }, session_id: 'stale', tool_use_id: 'inv' });

/**
 * The daemon's own journal — the only place it says what happened to it.
 * ⚠️ The NAME is asked of the module that owns it: a hand-written copy of it is
 *    how this suite spent five minutes waiting for a line nobody was writing.
 */
const JOURNAL = require_('../src/lifecycle-log.js').FILE_NAME;
function journal(stateDir) {
  try { return fs.readFileSync(path.join(stateDir, JOURNAL), 'utf8'); } catch { return ''; }
}

/** Polls the journal until it carries `event=<name>`, or the suite times out. */
async function waitForEvent(stateDir, name) {
  for (;;) {
    const text = journal(stateDir);
    const line = text.split('\n').find((l) => l.includes('event=' + name));
    if (line) return line;
    await settle();
  }
}

// ═══════════════════════════════════════════════════════════════════════
// ① DERIVED, AND NOT EMPTY — the anti-vacuity floor
// ═══════════════════════════════════════════════════════════════════════
test('① the verified set is DERIVED from the load hook, and it is NOT empty', async () => {
  const root = makeCopy('derived');
  const d = await startDaemon('derived', 'http-daemon.js', root);
  const start = await waitForEvent(d.stateDir, 'start');
  const count = Number(/verifiedModules=(\d+)/.exec(start)?.[1]);
  // 🛑 ANTI-VACUITY. A guard that verifies ZERO modules is indistinguishable
  //    from one that verifies them all and finds them clean — this repository's
  //    worst defect. The count is printed so a human can see it move.
  assert.ok(Number.isInteger(count) && count > 10,
    `the daemon vouches for ${count} module(s) — a set this small means the hook never armed. Line: ${start}`);
  console.log(`[stale-code] verified modules recorded by the real daemon: ${count}`);
  // A CONTROL: without proving it SERVES, every "it did not die" below would be
  // satisfied by a daemon that never worked at all.
  assert.strictEqual(typeof await ask(d.port, PAYLOAD), 'string');
  d.child.kill();
  await d.ended;
}, 60000);

// ═══════════════════════════════════════════════════════════════════════
// ② THE OUTAGE ITSELF — only the ACCESS TIME moved
// ═══════════════════════════════════════════════════════════════════════
test('② ONLY THE ACCESS TIME CHANGED ⇒ the daemon does NOT die, and says so', async () => {
  const root = makeCopy('atime');
  const d = await startDaemon('atime', 'http-daemon.js', root);
  const before = fs.statSync(victimOf(root));
  const content = fs.readFileSync(victimOf(root));

  // The 2026-08-24 event, reproduced: metadata moves, CONTENT does not.
  // ⚠️ The CONTENT is what the assertion checks, never `mtimeMs`: writing a
  //    `Date` back loses sub-millisecond precision, so the clock moves by a
  //    fraction while not a byte of the file has changed — and that fraction is
  //    exactly the kind of noise this whole work item exists to stop trusting.
  fs.utimesSync(victimOf(root), new Date(), before.mtime);
  assert.ok(fs.readFileSync(victimOf(root)).equals(content),
    'the fixture must not change a single byte, or it proves nothing');

  const line = await waitForEvent(d.stateDir, 'code-unchanged');
  // ⚠️ THE NOISE MUST STAY OBSERVABLE. A guard nobody can see deciding is a
  //    guard nobody can trust — and this is the case that used to be 258 deaths.
  assert.match(line, /event=code-unchanged/);
  assert.match(line, /checked=\d+/);
  assert.strictEqual(d.child.exitCode, null, 'the daemon died on a metadata-only event — that IS the outage');
  assert.strictEqual(typeof await ask(d.port, PAYLOAD), 'string', 'it must still be SERVING, not merely alive');
  console.log(`[stale-code] notification ignored: ${line.trim()}`);
  d.child.kill();
  await d.ended;
}, 60000);

// ═══════════════════════════════════════════════════════════════════════
// ③ ONE BYTE OF A LOADED MODULE ⇒ IT REFUSES TO SERVE
// ═══════════════════════════════════════════════════════════════════════
test('③ one byte changed in a loaded module ⇒ the daemon exits 90', async () => {
  const root = makeCopy('changed');
  const d = await startDaemon('changed', 'http-daemon.js', root);
  fs.appendFileSync(victimOf(root), '\n// one byte too many\n');
  const end = await d.ended;
  assert.strictEqual(end.code, 90,
    `the daemon must refuse to serve code that differs from the disk, got ${JSON.stringify(end)}\n${d.stderr()}`);
  const line = await waitForEvent(d.stateDir, 'stale-code-exit');
  // The CAUSE must be named: 169 such exits in one day said WHICH file only
  // after somebody went looking for it.
  assert.match(line, /reason=.*lib-pure\.js: content DIFFERS/);
  console.log(`[stale-code] death: ${line.trim()}`);
  // ⚠️ The copy is this cell's alone; putting the victim back would only hide
  //    what the run did. Every other cell owns a fresh one.
  restore(root);
}, 60000);

// ═══════════════════════════════════════════════════════════════════════
// ④ A REQUEST ARRIVING WHILE A MODULE DIFFERS IS NEVER ANSWERED
// ═══════════════════════════════════════════════════════════════════════
// 🛑 WHY A DRIVER AND NOT THE SPAWNED DAEMON: on the real daemon the watcher
//    would race the request, so a refusal could be the watcher's exit rather
//    than the point-of-use check — the two are indistinguishable from outside.
//    Here the recorded baseline is fed by hand and NOTHING else is simulated:
//    the real `createServer`, the real comparison, the real disk read.
test('④ the POINT-OF-USE check refuses to answer, and names the file', async () => {
  const root = makeCopy('point-of-use');
  const driver = path.join(TMP, 'point-of-use.js');
  fs.writeFileSync(driver, `
    const http = require('http');
    const fs = require('fs');
    const staleCode = require(${JSON.stringify(path.join(root, 'src', 'stale-code.js').replace(/\\\\/g, '/'))});
    const { createServer } = require(${JSON.stringify(path.join(root, 'src', 'hooks', 'http-server.js').replace(/\\\\/g, '/'))});
    const victim = ${JSON.stringify(victimOf(root).replace(/\\\\/g, '/'))};
    // The baseline says one thing, the disk says another: exactly the state of a
    // daemon whose repository moved under it.
    staleCode.adopt(new Map([[victim, 'what this process compiled\\n']]));
    let refused = null;
    let answered = null;
    const done = () => { console.log(JSON.stringify({ answered, refused })); process.exit(0); };
    const srv = createServer({
      freshness: () => staleCode.check(),
      // ⚠️ THE REFUSAL IS THE OBSERVABLE. An unanswered request never errors and
      //    never closes: waiting for the CLIENT to notice would be waiting for
      //    nothing. The shell being TOLD is the fact, and it is decidable.
      onStaleCode: (v) => { refused = v; setImmediate(done); },
    });
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      const body = '{"tool_name":"Bash","tool_input":{}}';
      const req = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/pretool',
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } },
        (res) => { let t = ''; res.on('data', (c) => { t += c; }); res.on('end', () => { answered = t; done(); }); });
      req.on('error', () => done());
      req.end(body);
    });
  `);
  const out = await new Promise((resolve, reject) => {
    execFile(process.execPath, [driver], { encoding: 'utf8' },
      (err, stdout) => (err ? reject(new Error(err.message + stdout)) : resolve(JSON.parse(stdout.trim().split('\n').pop()))));
  });
  assert.strictEqual(out.answered, null, 'the request was ANSWERED by a daemon whose code no longer matches the disk');
  assert.ok(out.refused && out.refused.stale === true, 'the shell was never told the code was stale');
  assert.strictEqual(out.refused.checked, 1, 'anti-vacuity: the refusal must come from a real comparison');
  expect(out.refused.reasons.join('')).toContain('content DIFFERS from the bytes this process compiled');
}, 60000);

// ═══════════════════════════════════════════════════════════════════════
// ⑤ A WATCHER THAT LOST EVENTS VERIFIES, THEN RE-ARMS
// ═══════════════════════════════════════════════════════════════════════
// 🔴 That `'error'` event had NO handler at all until 2026-08-24, and it is the
//    one all three kernels raise when notifications were LOST
//    (`ERROR_NOTIFY_ENUM_DIR` · `IN_Q_OVERFLOW` · `MustScanSubDirs`). Unhandled
//    on an EventEmitter it is thrown, so the daemon could die of the very
//    mechanism meant to protect it.
test('⑤ a watcher `error` runs the verification and re-arms', async () => {
  const { watcherFactory } = await import('../src/hooks/http-server.js').then((m) => m.default || m);
  const { EventEmitter } = await import('node:events');
  const armed = [];
  let verified = 0;
  const fake = (dir) => { const w = new EventEmitter(); armed.push({ dir, w }); return w; };
  const arm = watcherFactory(fake, () => { verified += 1; }, () => { throw new Error('must not be reached'); });

  const first = arm('C:/repo/src', () => {});
  assert.strictEqual(armed.length, 1, 'anti-vacuity: nothing was armed, so nothing is being proven');
  first.emit('error', new Error('events lost'));
  assert.strictEqual(verified, 1, 'a lost-events error must trigger the verification — the loss may hide a real change');
  assert.strictEqual(armed.length, 2, 'the watch must be RE-ARMED, or the daemon goes deaf in silence');
});

test('⑤bis a watch that cannot be re-armed is reported to the SHELL, never swallowed', async () => {
  const { watcherFactory } = await import('../src/hooks/http-server.js').then((m) => m.default || m);
  const { EventEmitter } = await import('node:events');
  let calls = 0;
  const fatal = [];
  const fake = () => {
    calls += 1;
    if (calls > 1) throw new Error('ENOSPC: no watch descriptors left');
    return new EventEmitter();
  };
  const arm = watcherFactory(fake, () => {}, (dir, err) => fatal.push({ dir, message: err.message }));
  arm('C:/repo/src', () => {}).emit('error', new Error('events lost'));
  assert.deepStrictEqual(fatal.map((f) => f.dir), ['C:/repo/src']);
  expect(fatal[0].message).toContain('no watch descriptors left');
});

// ═══════════════════════════════════════════════════════════════════════
// ⑥ SEEN RED — the comparison sabotaged, in memory, both ways
// ═══════════════════════════════════════════════════════════════════════
// 🛑 A GUARD NEVER SEEN FAILING IS A GUARD ASSUMED TO WORK, and this
//    repository's worst defect has never been a red gate: it is a GREEN gate
//    that sees nothing. The sabotage replaces `staleCode.check` in memory — the
//    reason `http-server.js` reaches it through its namespace and never
//    destructures it — and the daemon it starts is otherwise the real one.
function writeSabotage(root, name, verdictLiteral) {
  const file = path.join(root, 'src', 'hooks', name);
  fs.writeFileSync(file, `#!/usr/bin/env node
'use strict';
const Module = require('module');
const recorded = new Map();
const compile = Module.prototype._compile;
Module.prototype._compile = function (content, filename) {
  if (typeof content === 'string' && typeof filename === 'string' && !filename.includes('node_modules')) recorded.set(filename, content);
  return compile.call(this, content, filename);
};
const staleCode = require('../stale-code');
staleCode.adopt(recorded);
staleCode.check = () => (${verdictLiteral});
require('./http-server').main();
`);
  return name;
}

test('⑥ SEEN RED: a comparison that always answers "identical" lets a CHANGED BYTE through', async () => {
  // Cell ③ inverted. If this ever goes green, ③ has stopped discriminating and
  // both are worthless.
  const root = makeCopy('blind');
  writeSabotage(root, 'sabotage-blind.js', '{ stale: false, checked: 0, reasons: [] }');
  const d = await startDaemon('blind', 'sabotage-blind.js', root);
  fs.appendFileSync(victimOf(root), '\n// changed under a blind guard\n');
  // The kernel notification still arrives; the sabotaged comparison answers
  // "identical", so the daemon must stay up — proving cell ③ measures the
  // COMPARISON and not merely the notification.
  await waitForEvent(d.stateDir, 'code-unchanged');
  assert.strictEqual(d.child.exitCode, null,
    'the blinded daemon died anyway — cell ③ is therefore not measuring the comparison');
  d.child.kill();
  await d.ended;
  restore(root);
}, 60000);

test('⑥bis SEEN RED: a comparison that always answers "stale" reproduces the 2026-08-24 outage', async (ctx) => {
  // Cell ② inverted, and it is the OLD behaviour exactly: a metadata-only event
  // kills the service. 258 times in one day, on a copy nothing had written to.
  const root = makeCopy('paranoid');
  writeSabotage(root, 'sabotage-paranoid.js', '{ stale: true, checked: 1, reasons: ["sabotage"] }');
  // 🛑 NO READINESS PROBE HERE, and that is not a shortcut: a daemon whose
  //    comparison always answers "stale" refuses the FIRST request, so asking it
  //    to serve would kill it through the path this cell is not testing. We wait
  //    for the fact that it began serving — its own `start` line — and then
  //    touch nothing but the metadata.
  const d = await startDaemon('paranoid', 'sabotage-paranoid.js', root, { serve: false });
  await waitForEvent(d.stateDir, 'start');
  const before = fs.statSync(victimOf(root));
  fs.utimesSync(victimOf(root), new Date(), before.mtime);

  // 🔴 THIS CELL NEEDS THE KERNEL TO NOTIFY, AND NOT EVERY MACHINE DOES — MEASURED
  //    ON CI 2026-08-31 (all three runners, 60 s timeout, red on a healthy repo).
  //    The daemon is started with `serve: false` ON PURPOSE (a paranoid comparison
  //    refuses the first request, which would kill it through the path this cell is
  //    NOT testing), so the point-of-use comparison never runs and a metadata event
  //    is the ONLY thing that can end it. A GitHub runner's container filesystem
  //    does not deliver that event, so the cell waited for something that was never
  //    going to happen — a RED reporting a regression that does not exist.
  // 🛑 THE BOUND IS A NON-DECISION, NEVER A WIDER LIMIT: waiting longer would not
  //    make an absent notification arrive, and stretching a timeout to turn a red
  //    green is how a cell stops measuring. Same idiom as `scale-bench`'s witness —
  //    a run that cannot decide says so BY NAME, and never passes quietly.
  const NOTIFICATION_WINDOW_MS = 20000;
  const end = await Promise.race([
    d.ended,
    new Promise((resolve) => { setTimeout(() => resolve(null), NOTIFICATION_WINDOW_MS).unref(); }),
  ]);
  if (end === null) {
    d.child.kill();
    await d.ended;
    restore(root);
    ctx.skip(`UNMEASURED: this kernel delivered no metadata notification within ${NOTIFICATION_WINDOW_MS} ms, `
      + 'so nothing could have ended the daemon — the comparison itself is NOT in question here '
      + '(cell ⑥ proves it on a machine that does notify).');
    return;
  }
  assert.strictEqual(end.code, 90,
    'a metadata-only event did NOT kill the paranoid daemon — cell ② is therefore not measuring the comparison either');
}, 60000);
