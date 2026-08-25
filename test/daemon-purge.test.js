// ═══════════════════════════════════════════════════════════════════════
// AFTER A COMPACTION, A `once` MUST COME BACK — the four consumers, one state.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 THE EXACT DEFECT THIS CELL EXISTS FOR, MEASURED IN PRODUCTION 2026-08-21.
//    The PreToolUse gate was wired to the daemon — which owns its state IN
//    MEMORY — and the three other consumers of that same state were left on the
//    disk. Sequence measured: inject → `once` consumed → run the REAL PreCompact
//    hook → ask again ⇒ the daemon answers **2 bytes**. After a compaction,
//    skills and `once` documents never come back. No error, no badge, no red.
//    It was rolled back.
// 🛑 THE LESSON, AND IT IS THE DOCTRINE OF THIS HOUSE: **a shared state is
//    migrated for ALL its consumers or for none** (expand/contract). A partial
//    migration is a SPLIT BRAIN, and it is silent.
//
// 🛑 THE REAL SHELL IS SPAWNED, NOT A TWIN. `state-daemon.test.js` forks its own
//    test daemon and proves the MECHANISM; it never proved that the shells the
//    harness actually launches reach the authority. **A green on a twin is not a
//    green on the thing** — that is how the daemon ended up listening nowhere
//    near where its client knocks, one day earlier.
// ⚠️ ANTI-VACUITY IS BUILT INTO THE SEQUENCE, not bolted on: the first ask MUST
//    deliver and the second MUST be silent. Without the silence in the middle,
//    "it came back" would also hold for a daemon that re-delivers everything
//    always, i.e. for a daemon holding no state at all.
// ⚠️ NO TIMER ANYWHERE. The daemon announces itself over IPC, the shell's death
//    is an OS EVENT, and an absent daemon answers `ENOENT`/`ECONNREFUSED` at
//    once. If this cell ever needs a delay to pass, something started guessing.
// ═══════════════════════════════════════════════════════════════════════

import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fork, spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { endpoint } = require('../src/kernel-endpoint.js');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-purge-'));
const DOCS = path.join(TMP, 'docs');
const STATE = path.join(TMP, 'state');
const CONFIG = path.join(TMP, 'config.json');
const RACINE = path.join(__dirname, '..');
const RESET = path.join(RACINE, 'src', 'hooks', 'ctxroute-reset.js');

fs.mkdirSync(DOCS, { recursive: true });
fs.mkdirSync(STATE, { recursive: true });
fs.writeFileSync(CONFIG, JSON.stringify({ enabled: true, showNotification: false }));
fs.writeFileSync(path.join(DOCS, 'unique.md'),
  '---\nmatch: server.js\nmode: once\n---\n# UNIQUE\nCORPS-UNIQUE\n');

afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

const ENV = {
  ...process.env,
  CTXROUTE_FILEDOCS_DIR: DOCS,
  CTXROUTE_STATE_DIR: STATE,
  CTXROUTE_CONFIG_PATH: CONFIG,
};

// The daemon: the SINGLE owner of the state, in memory, no snapshot — so
// anything that survives here survived IN RAM, which is the whole question.
const DAEMON = path.join(TMP, 'daemon.cjs');
const abs = (...p) => JSON.stringify(path.join(RACINE, ...p).replace(/\\/g, '/'));
fs.writeFileSync(DAEMON, `
'use strict';
const { createServer } = require(${abs('src', 'hooks', 'http-server.js')});
const { createMemoryStore } = require(${abs('src', 'memory-store.js')});
const { bind } = require(${abs('src', 'kernel-bind.js')});
const store = createMemoryStore({ snapshotPath: null });
const srv = createServer({ store });
bind(srv, process.argv[2], () => process.send('pret'), (e) => process.send('erreur:' + e.code));
process.on('message', (m) => { if (m === 'stop') { srv.close(); process.exit(0); } });
`);

// A client = one frame process. It asks, it does not decide.
const CLIENT = path.join(TMP, 'client.cjs');
fs.writeFileSync(CLIENT, `
'use strict';
const { ask } = require(${abs('src', 'hooks', 'state-client.js')});
const [adresse, inv] = process.argv.slice(2);
ask({ tool_name: 'Read', tool_input: { file_path: 'C:/p/server.js' },
      session_id: 'purge-cell', tool_use_id: inv },
    { socketPath: adresse, frame: 1, frames: 1 },
    (r) => process.send(JSON.stringify(r || null)));
`);

// 🛑 A DAEMON THAT FAILS TO BIND MUST SAY SO, NOT TIME OUT — an unobservable
//    failure costs one CI round trip per hypothesis.
function startDaemon(address) {
  return new Promise((pret, failure) => {
    const d = fork(DAEMON, [address], { env: ENV, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    let complaint = '';
    if (d.stderr) d.stderr.on('data', (b) => { complaint += b; });
    d.on('message', (m) => {
      if (m === 'pret') { pret(d); return; }
      failure(new Error(`the daemon could not take ${JSON.stringify(address)}: ${m}`));
    });
    d.on('exit', (code) => failure(new Error(
      `the daemon exited (code ${code}) without ever listening.\n--- its stderr ---\n${complaint.trim() || '(nothing)'}`)));
  });
}

function knock(address, inv) {
  return new Promise((res) => {
    const c = fork(CLIENT, [address, inv], { env: ENV, stdio: 'ignore' });
    c.on('message', (m) => res(String(m)));
    c.on('exit', () => res('null'));
  });
}

/**
 * THE REAL PreCompact SHELL, launched the way the harness launches it: a node
 * process, the payload on stdin, the wiring in argv.
 * ⚠️ `spawn(process.execPath, …)` — never a shell, never `npx`: `cmd` and
 *    `/bin/sh` do not behave alike, and this repository has paid for that.
 */
function compacter(address) {
  return new Promise((done) => {
    const p = spawn(process.execPath, [RESET, '--client', address],
      { env: ENV, stdio: ['pipe', 'ignore', 'pipe'] });
    let complaint = '';
    p.stderr.on('data', (b) => { complaint += b; });
    p.on('exit', (code) => done({ code, complaint: complaint.trim() }));
    p.stdin.end(JSON.stringify({ session_id: 'purge-cell', hook_event_name: 'PreCompact' }));
  });
}

test('a compaction makes a `once` COME BACK — the REAL reset shell reaches the daemon',
  { timeout: 30000 }, async () => {
    const address = endpoint({ stateDir: TMP });
    const daemon = await startDaemon(address);
    try {
      const premier = await knock(address, 'inv-1');
      assert.ok(premier.includes('CORPS-UNIQUE'),
        'the first action must deliver the document — without that, nothing below proves anything');

      const second = await knock(address, 'inv-2');
      assert.ok(!second.includes('CORPS-UNIQUE'),
        'the second action delivered it again: the daemon is not holding the state, so "it came back" '
        + 'after the purge would be true of a daemon with no memory at all — the cell would be VACUOUS');

      const reset = await compacter(address);
      assert.equal(reset.code, 0,
        `the PreCompact shell exited ${reset.code} — it must NEVER fail a compaction.\n${reset.complaint}`);

      const apres = await knock(address, 'inv-3');
      assert.ok(apres.includes('CORPS-UNIQUE'),
        'THE DEFECT IS BACK: after a real PreCompact the daemon still answers "already seen". '
        + 'Deleting state FILES forgets nothing in a memory the daemon holds in RAM — so skills and '
        + '`once` documents never return after a compaction, with no error, no badge and no red. '
        + 'A shared state is migrated for ALL its consumers or for none.');
    } finally {
      daemon.send('stop');
    }
  });

// ═══════════════════════════════════════════════════════════════════════
// THE PURGE WINDOW — a compaction may not cross a peer's critical section
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 THE DEFECT, EXHIBITED BY TLC BEFORE IT WAS CLOSED (2026-08-23).
//    `specs/tla/State.tla`, run `StatePurgeWindow`: the purge took NO lock at
//    all, on either lane, so a writer whose SNAPSHOT PREDATES it republishes
//    that snapshot afterwards — a `doc-seen-` record is RESURRECTED and the
//    document it names is WITHHELD for the whole rest of the session. No error,
//    no badge, nothing red: the one failure mode this repository refuses.
// 🛑 WHAT THIS CELL PROVES, EXACTLY, AND IT IS NOT SOLD BEYOND THAT: the real
//    PreCompact shell no longer DELETES a durable key while a peer holds that
//    class's lock. The RESURRECTION itself stays TLC's proof — racing two real
//    processes to catch it would buy a flaky suite, the trade this repository
//    already refused once (`session-store.readThrough`, unreproducible locally).
// ⚠️ DETERMINISTIC, WITH NO TIMER OF ITS OWN: the LOCK is the synchroniser and
//    `spawnSync` keeps the child inside the section. `lock.js` only forces a lock
//    older than STALE_MS (5 s) and the shell gives up after its own 2 s, so
//    nothing here rests on scheduling.
// ⚠️ ANTI-VACUITY IS THE OTHER HALF, and it is what gives the first one meaning:
//    the TURN class — guarded by the OTHER address, which is FREE — must be
//    purged in that SAME run, and the doc class must go once the lock is
//    released. Without both, "it did not delete" would also hold for a reset
//    that does nothing at all, or for one that crashed on startup.
// ═══════════════════════════════════════════════════════════════════════

// 🛑 THE CELL MUST RESOLVE THE SAME `state/` AS THE CHILD, OR IT TAKES A LOCK
//    THE SHELL NEVER LOOKS AT — two spellings are two locks, and two locks are
//    no lock. Seen exactly that way while writing this cell: the section was
//    held in the REPOSITORY's `state/` while the shell worked in the tmpdir, the
//    child never contended, and the assertion below fired for the wrong reason.
//    The floor a few lines down is what makes that mistake impossible to repeat.
process.env.CTXROUTE_STATE_DIR = STATE;
const { docLockDir } = require('../src/store-resolve.js');
const { withLock } = require('../src/lock.js');
const { spawnSync } = require('node:child_process');

const FILE = (n) => path.join(STATE, n);

/** The real PreCompact shell, run SYNCHRONOUSLY so the caller's lock is held. */
function compacterSync(scope) {
  return spawnSync(process.execPath, [RESET], {
    env: ENV,
    encoding: 'utf8',
    input: JSON.stringify({ session_id: scope, hook_event_name: 'PreCompact' }),
  });
}

test('the PURGE WINDOW is closed — a compaction never deletes a key a peer is holding',
  { timeout: 30000 }, () => {
    const scope = 'purge-window';
    // 🛑 THE FLOOR: the address this cell holds must be the address the shell
    //    looks at. Without it the whole cell is green while measuring nothing.
    assert.ok(docLockDir(scope).startsWith(STATE),
      `the cell locks ${docLockDir(scope)} while the shell works in ${STATE} — it measures NOTHING`);
    // Written by hand: the cell must depend on the FILE NAMES the fleet really
    // uses, never on the helper whose behaviour it is judging.
    fs.writeFileSync(FILE(`doc-seen-${scope}.json`), JSON.stringify({ 'doc/a': 1 }));
    fs.writeFileSync(FILE(`turn-count-${scope}.json`), JSON.stringify({ turns: 7 }));

    // The peer: it holds the INJECTION class's lock, exactly as `pretool-core`
    // does around its read-modify-write, and the compaction happens inside.
    const r = withLock(docLockDir(scope), () => compacterSync(scope), { fallback: null });
    assert.ok(r, 'the cell could not take the lock it is testing — it measured NOTHING');
    assert.equal(r.status, 0,
      `the PreCompact shell exited ${r.status} — it must NEVER fail a compaction.\n${r.stderr}`);

    assert.ok(fs.existsSync(FILE(`doc-seen-${scope}.json`)),
      'THE PURGE CROSSED A CRITICAL SECTION. A peer holds `docLockDir` and the compaction '
      + 'deleted its state anyway, so a writer holding a pre-purge snapshot republishes it '
      + 'afterwards: the `doc-seen-` record comes back from the dead and the document it names '
      + 'is withheld for the rest of the session, in total silence (TLC: StatePurgeWindow).');

    assert.ok(!fs.existsSync(FILE(`turn-count-${scope}.json`)),
      'ANTI-VACUITY: the TURN class is guarded by the OTHER address, which nobody holds — it '
      + 'must have been purged in this same run. If it survived, the shell purged nothing at '
      + 'all and the assertion above proves nothing.');

    // Lock free now: the purge is a DELAY under contention, never a loss.
    const encore = compacterSync(scope);
    assert.equal(encore.status, 0, `second compaction exited ${encore.status}\n${encore.stderr}`);
    assert.ok(!fs.existsSync(FILE(`doc-seen-${scope}.json`)),
      'ANTI-VACUITY: with no contention the compaction MUST erase the injection state. A purge '
      + 'that never deletes anything is indistinguishable from an absent one.');
  });
