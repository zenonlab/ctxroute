// ═══════════════════════════════════════════════════════════════════════
// A REAL DAEMON, A REAL CLEAN DEATH, A REAL RESTORATION
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 THE DEFECT, MEASURED IN PRODUCTION 2026-09-19 ON THE OPERATOR'S OTHER
//    CONVERSATIONS: a restart mid-action re-served the opening chunks, because
//    `doc-seen-` survives on disk while the three invocation tables die with the
//    process. The frames landing after the restart were counted as the FIRST.
// 🛑 AND WHY A THIRD SUITE FOR ONE FIX. The pure suite proves ENCODE/DECODE and
//    the sequencer continuing; the wiring gate proves the SHELL calls them in the
//    right order. Neither proves the two halves meet ACROSS A REAL DEATH — and
//    that is the whole claim. This repository has shipped an inert fix and
//    designed an architecture on a misread number in ONE evening, both times by
//    proving a half and concluding on the whole.
//
// 🔑 THE DEATH IS THE REAL ONE, NOT A SIMULATION. `child.kill()` is useless here
//    and that is a MEASURED platform fact, not an opinion: on Windows it goes
//    through `TerminateProcess`, so `'exit'` never fires and no handler runs. The
//    only clean exit this daemon has is its own stale-code verdict — bytes on
//    disk differing from bytes compiled ⇒ `process.exit(90)` — so the cell
//    TOUCHES A SOURCE FILE and lets the daemon decide to die, exactly as a
//    deployment does.
// 🛑 ON A COPY OF THE TREE, NEVER THE REAL `src/`. A sabotage on a real file has
//    already brought down 38 tests of suites running in parallel here, and this
//    one would additionally kill the operator's production daemon, which watches
//    those same bytes.
// ⚠️ ONE LISTENER DECLARED, deliberately: the default is four contiguous ports
//    and this cell is not about capacity — asking for four free neighbours would
//    make it flaky for a reason unrelated to what it proves.

import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-restart-'));
afterAll(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* best effort */ } });

const TREE = path.join(TMP, 'tree');
const STATE = path.join(TMP, 'state');
const DOCS = path.join(TMP, 'docs');
const CONFIG = path.join(TMP, 'cfg.json');
const ENTRY = path.join(TREE, 'src', 'hooks', 'http-daemon.js');
const FRAMES = 32;
const INVOCATION = 'tool-use-across-a-death';

// ⚠️ The port comes from the ONE shared allocator (below the ephemeral range) — see test/support/free-port.js.
import { freePort } from './support/free-port.js';

const post = (port, urlPath, body) => new Promise((resolve, reject) => {
  const req = http.request({
    host: '127.0.0.1', port, path: urlPath, method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
  }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
  req.on('error', reject);
  req.end(body);
});

/**
 * Serving yet? Asked of the KERNEL (a refused connection is an answer), never of a clock.
 *
 * 🔴 IT GAVE UP AFTER ~5 s AND SAID NOTHING ELSE — red 2/2 on the macOS runner (2026-09-23) as
 *    "the second daemon never began serving", which cannot tell a daemon that DIED from one still
 *    starting on a slow machine. The OS knows the first: while the child has not exited, it is
 *    still a candidate, so the wait follows the CHILD (`exitCode`/`signalCode`, read, never a
 *    listener armed late) and the bound only stops a live child that never binds (undecidable,
 *    declared in `temporal-budget.json`). The caller reports WHICH of the two happened.
 * @param {number} port
 * @param {import('node:child_process').ChildProcess} [child] the daemon being waited for.
 */
async function serving(port, child) {
  const alive = () => !child || (child.exitCode === null && child.signalCode === null);
  for (let i = 0; i < 1600 && alive(); i += 1) {
    try { await post(port, '/turn?frame=1&frames=2', JSON.stringify({ session_id: 'ready' })); return true; }
    catch { await new Promise((r) => { setTimeout(r, 25); }); }
  }
  return false;
}

/**
 * Forks a daemon with its stderr KEPT, so a red cell says why the process died instead of only
 * that it did not answer. `stdio: 'ignore'` threw that evidence away on every run.
 * @returns {{child: import('node:child_process').ChildProcess, stderr: () => string}}
 */
function launch(entry, env) {
  const child = fork(entry, [], { env, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  let err = '';
  child.stderr.on('data', (b) => { err = (err + b).slice(-4000); });
  return { child, stderr: () => err };
}

/** What a red start carries: how the child ended (or that it is ALIVE), its stderr, the journal tail. */
const whyNotServing = (child, stderr, log) => `exit=${child.exitCode} signal=${child.signalCode} `
  + `(${child.exitCode === null && child.signalCode === null ? 'STILL ALIVE, never bound' : 'DIED'}) · stderr: `
  + `${stderr().slice(-1500) || '(empty)'} · journal tail: ${log.slice(-1500) || '(empty)'}`;

const journal = () => {
  try { return fs.readFileSync(path.join(STATE, 'ctxroute-daemon.log'), 'utf8'); } catch { return ''; }
};

/**
 * One full life-death-life cycle against a REAL daemon, in an isolated tree.
 * @param {string} name subdirectory, so two runs never share a state directory
 * @param {(treeSrc: string) => void} [sabotage] applied to the COPY before launch
 */
async function cycle(name, sabotage) {
  const tree = path.join(TMP, name, 'tree');
  const state = path.join(TMP, name, 'state');
  const docs = path.join(TMP, name, 'docs');
  const config = path.join(TMP, name, 'cfg.json');
  const entry = path.join(tree, 'src', 'hooks', 'http-daemon.js');
  fs.cpSync(path.join(REPO, 'src'), path.join(tree, 'src'), { recursive: true });
  if (sabotage) sabotage(path.join(tree, 'src'));
  fs.mkdirSync(docs, { recursive: true });
  fs.mkdirSync(state, { recursive: true });
  const port = await freePort();
  fs.writeFileSync(config, JSON.stringify({
    enabled: true, frames: FRAMES, http: { host: '127.0.0.1', port, listeners: 1 },
  }));
  const env = {
    ...process.env, CTXROUTE_STATE_DIR: state, CTXROUTE_FILEDOCS_DIR: docs, CTXROUTE_CONFIG_PATH: config,
  };

  const { child: first } = launch(entry, env);
  // 🛑 THE EXIT LISTENER IS ARMED BEFORE ANY WAIT, AND THE FIRST VERSION WAS NOT.
  //    A sabotaged tree crashes in milliseconds, so registering after a readiness
  //    poll MISSES the death and the cell hangs until its own timeout — which is
  //    exactly what happened, and it read as "the control does not bite" when the
  //    truth was "the instrument never saw the answer". A listener attached after
  //    the event it waits for is a promise nobody will ever settle.
  const died = new Promise((resolve) => first.once('exit', (c) => resolve(c)));
  const served = await serving(port, first);
  if (served) {
    for (let k = 1; k <= 3; k += 1) {
      await post(port, `/pretool?frame=${k}&frames=${FRAMES}`, JSON.stringify({
        session_id: 'restart-cell', tool_use_id: INVOCATION, tool_name: 'Read', tool_input: {},
      })).catch(() => {});
    }
  }
  fs.appendFileSync(path.join(tree, 'src', 'lib-pure.js'), '\n// touched by the restart cell\n');
  const code = await died;

  const { child: second } = launch(entry, env);
  const up = await serving(port, second);
  second.kill();
  const log = (() => {
    try { return fs.readFileSync(path.join(state, 'ctxroute-daemon.log'), 'utf8'); } catch { return ''; }
  })();
  const counts = [...log.matchAll(/event=start[^\n]*invocationsRestored=(\d+)/g)].map((m) => Number(m[1]));
  const snapshotPath = path.join(state, 'daemon-invocations.json');
  const snapshot = fs.existsSync(snapshotPath)
    ? JSON.parse(fs.readFileSync(snapshotPath, 'utf8')) : null;
  return { served, code, up, counts, snapshot, snapshotPath };
}

test('CONTROL: strip the exit handler from the COPY and the order does NOT survive', async () => {
  // 🛑 A JUDGE NEVER SEEN FAILING IS A JUDGE ASSUMED TO WORK, and this
  //    repository's worst defect has never been a red gate — it is a GREEN one
  //    that sees nothing. The sabotage is the REAL defect: the daemon without
  //    its `'exit'` handler, i.e. exactly what shipping this fix half-way looks
  //    like. ⚠️ It runs on the COPIED tree, which is what makes a sabotage of
  //    live production code unnecessary here.
  const out = await cycle('control', (treeSrc) => {
    const shell = path.join(treeSrc, 'hooks', 'http-server.js');
    const before = fs.readFileSync(shell, 'utf8');
    // ⚠️ THE SABOTAGE MUST STAY SYNTACTICALLY VALID, and the first one was not:
    //    it left an unmatched parenthesis, so the daemon never started and the
    //    cell measured a crash instead of a missing handler. `off` keeps the call
    //    shape and arms nothing — the defect, not a broken file.
    const after = before.replace(/process\.on\('exit',/, "process.off('exit',");
    assert.notStrictEqual(after, before, 'the sabotage matched nothing: a control that changes nothing proves nothing');
    fs.writeFileSync(shell, after);
  });
  assert.strictEqual(out.code, 90, `the sabotaged daemon exited ${out.code}: the control must still die the CLEAN way`);
  assert.strictEqual(out.snapshot, null,
    'a snapshot was written WITHOUT the exit handler: then the cell below would pass for a reason that has nothing to do with the fix');
  assert.ok(out.counts.every((n) => n === 0),
    `the sabotaged run restored ${out.counts.join('/')} entries with no snapshot to restore from: the count is fiction`);
}, 60000);

test('a CLEAN death carries the arrival order to the next daemon', async () => {
  // ── the copied tree: the daemon must be free to die of its own verdict ──
  fs.cpSync(path.join(REPO, 'src'), path.join(TREE, 'src'), { recursive: true });
  fs.mkdirSync(DOCS, { recursive: true });
  fs.mkdirSync(STATE, { recursive: true });
  const port = await freePort();
  fs.writeFileSync(CONFIG, JSON.stringify({
    enabled: true, frames: FRAMES, http: { host: '127.0.0.1', port, listeners: 1 },
  }));
  const env = {
    ...process.env,
    CTXROUTE_STATE_DIR: STATE,
    CTXROUTE_FILEDOCS_DIR: DOCS,
    CTXROUTE_CONFIG_PATH: CONFIG,
  };

  // ── ① a first daemon takes three frames of ONE invocation ──────────────
  const { child: first, stderr: firstErr } = launch(ENTRY, env);
  assert.ok(await serving(port, first),
    `the first daemon never began serving: nothing below can be measured. ${whyNotServing(first, firstErr, journal())}`);
  for (let k = 1; k <= 3; k += 1) {
    await post(port, `/pretool?frame=${k}&frames=${FRAMES}`, JSON.stringify({
      session_id: 'restart-cell', tool_use_id: INVOCATION, tool_name: 'Read', tool_input: {},
    }));
  }

  // ── ② IT DIES OF ITS OWN VERDICT — the only clean exit it has ──────────
  const died = new Promise((resolve) => first.once('exit', (code) => resolve(code)));
  fs.appendFileSync(path.join(TREE, 'src', 'lib-pure.js'), '\n// touched by the restart cell\n');
  const code = await died;
  assert.strictEqual(code, 90,
    `the daemon exited ${code} instead of 90: this cell proves nothing unless the death is the CLEAN one, `
    + "because `'exit'` — and therefore the snapshot — only fires on that path");

  // ── ③ THE SNAPSHOT EXISTS, and it is not an empty shell ────────────────
  const snapshotPath = path.join(STATE, 'daemon-invocations.json');
  assert.ok(fs.existsSync(snapshotPath),
    'no snapshot was written on the clean exit: the next daemon would start with empty tables and re-serve chunk 1');
  const written = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  assert.ok(Array.isArray(written.sequencer) && written.sequencer.length > 0,
    `the snapshot carries no sequencer entry (${JSON.stringify(written).slice(0, 120)}): a file that exists and holds nothing `
    + 'restores nothing, which is the failure this cell exists to catch');

  // ── ④ THE NEXT DAEMON ADOPTS IT, AND SAYS SO ───────────────────────────
  const { child: second, stderr: secondErr } = launch(ENTRY, env);
  const up = await serving(port, second);
  const line = /event=start[^\n]*invocationsRestored=(\d+)/g;
  const counts = [...journal().matchAll(line)].map((m) => Number(m[1]));
  const why = up ? '' : whyNotServing(second, secondErr, journal());
  second.kill();
  assert.ok(up, `the second daemon never began serving: ${why}`);
  assert.ok(counts.length >= 2, `only ${counts.length} start line(s) carry the field: the two lives were not observed`);
  assert.strictEqual(counts[0], 0, 'the FIRST daemon claimed to restore something: there was no snapshot before it, so that count is fiction');
  assert.ok(counts[counts.length - 1] > 0,
    `the second daemon restored ${counts[counts.length - 1]} entries: the arrival order did NOT cross the death, and an invocation `
    + 'in flight would have its opening chunks served at it a second time');
}, 60000);
