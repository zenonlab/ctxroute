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
function demarrerDaemon(adresse) {
  return new Promise((pret, echec) => {
    const d = fork(DAEMON, [adresse], { env: ENV, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    let plainte = '';
    if (d.stderr) d.stderr.on('data', (b) => { plainte += b; });
    d.on('message', (m) => {
      if (m === 'pret') { pret(d); return; }
      echec(new Error(`the daemon could not take ${JSON.stringify(adresse)}: ${m}`));
    });
    d.on('exit', (code) => echec(new Error(
      `the daemon exited (code ${code}) without ever listening.\n--- its stderr ---\n${plainte.trim() || '(nothing)'}`)));
  });
}

function frapper(adresse, inv) {
  return new Promise((res) => {
    const c = fork(CLIENT, [adresse, inv], { env: ENV, stdio: 'ignore' });
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
function compacter(adresse) {
  return new Promise((fini) => {
    const p = spawn(process.execPath, [RESET, '--client', adresse],
      { env: ENV, stdio: ['pipe', 'ignore', 'pipe'] });
    let plainte = '';
    p.stderr.on('data', (b) => { plainte += b; });
    p.on('exit', (code) => fini({ code, plainte: plainte.trim() }));
    p.stdin.end(JSON.stringify({ session_id: 'purge-cell', hook_event_name: 'PreCompact' }));
  });
}

test('a compaction makes a `once` COME BACK — the REAL reset shell reaches the daemon',
  { timeout: 30000 }, async () => {
    const adresse = endpoint({ root: path.join(TMP, 'purge'), stateDir: TMP });
    const daemon = await demarrerDaemon(adresse);
    try {
      const premier = await frapper(adresse, 'inv-1');
      assert.ok(premier.includes('CORPS-UNIQUE'),
        'the first action must deliver the document — without that, nothing below proves anything');

      const second = await frapper(adresse, 'inv-2');
      assert.ok(!second.includes('CORPS-UNIQUE'),
        'the second action delivered it again: the daemon is not holding the state, so "it came back" '
        + 'after the purge would be true of a daemon with no memory at all — the cell would be VACUOUS');

      const reset = await compacter(adresse);
      assert.equal(reset.code, 0,
        `the PreCompact shell exited ${reset.code} — it must NEVER fail a compaction.\n${reset.plainte}`);

      const apres = await frapper(adresse, 'inv-3');
      assert.ok(apres.includes('CORPS-UNIQUE'),
        'THE DEFECT IS BACK: after a real PreCompact the daemon still answers "already seen". '
        + 'Deleting state FILES forgets nothing in a memory the daemon holds in RAM — so skills and '
        + '`once` documents never return after a compaction, with no error, no badge and no red. '
        + 'A shared state is migrated for ALL its consumers or for none.');
    } finally {
      daemon.send('stop');
    }
  });
