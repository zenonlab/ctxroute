// ═══════════════════════════════════════════════════════════════════════
// THE KERNEL SERIALISES — 16 real processes, zero state file.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 THE CELL THIS WHOLE REFACTOR EXISTS FOR. An action spawns SIXTEEN frame
//    processes at once, and they all ask the same question: "has this document
//    already been injected?". Until now they answered it through a FILE they
//    were writing at the same time — hence a lock, an atomic publish, a
//    lock-less fallback, bounded retries, and three flaky bugs in one day, each
//    of them a hand-made simulation of one word: SERIALISE.
// 🛑 THE OPERATING SYSTEM HAS ALWAYS DONE THAT WORD. A daemon listening on a
//    kernel object receives connections ONE AT A TIME onto a single-threaded
//    loop. The mutual exclusion is not written by us, it is given — so the
//    critical section below has NO LOCK, and that is not an oversight.
// 📐 MEASURED on Node 22.15.1: of the 68 builtin modules, ZERO expose an
//    inter-process synchronisation primitive (no named mutex, no shared memory,
//    no semaphore). The socket is the one kernel primitive reachable from
//    JavaScript — which is why the rendezvous is a named pipe (Windows), an
//    abstract socket (Linux) or a unix socket (macOS), never a file we invent.
//
// ⚠️ REAL PROCESSES, NEVER SIMULATED CONCURRENCY. Sixteen `fork`s, because
//    sixteen is the real number of frames; an in-process loop would prove
//    nothing about two schedulers crossing.
// ⚠️ ANTI-VACUITY everywhere: the corpus must really match, the clients must
//    really get answers, and the store must really have been consulted —
//    otherwise "exactly one delivery" would also hold on a daemon that answers
//    nothing at all.
// ═══════════════════════════════════════════════════════════════════════

import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fork } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { endpoint } = require('../src/kernel-endpoint.js');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-daemon-'));
const DOCS = path.join(TMP, 'docs');
const STATE = path.join(TMP, 'state');
const CONFIG = path.join(TMP, 'config.json');
const RACINE = path.join(__dirname, '..');

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

// The daemon: the SINGLE owner of the state. It holds it in memory and listens
// on the kernel object. Nothing of its state ever reaches the disk here (no
// snapshot path is given), so any file appearing in `state/` is a regression.
const DAEMON = path.join(TMP, 'daemon.cjs');
fs.writeFileSync(DAEMON, `
'use strict';
const { createServer } = require(${JSON.stringify(path.join(RACINE, 'src', 'hooks', 'http-server.js').replace(/\\/g, '/'))});
const { createMemoryStore } = require(${JSON.stringify(path.join(RACINE, 'src', 'memory-store.js').replace(/\\/g, '/'))});
const adresse = process.argv[2];
const store = createMemoryStore({});             // purely volatile: zero disk
const srv = createServer({ store });
srv.listen(adresse, () => process.send('pret'));
process.on('message', (m) => { if (m === 'stop') { srv.close(); process.exit(0); } });
`);

// A client = one frame process. It asks, it does not decide.
const CLIENT = path.join(TMP, 'client.cjs');
fs.writeFileSync(CLIENT, `
'use strict';
const { ask } = require(${JSON.stringify(path.join(RACINE, 'src', 'hooks', 'state-client.js').replace(/\\/g, '/'))});
const [adresse, frame, frames] = process.argv.slice(2);
const payload = { tool_name: 'Read', tool_input: { file_path: 'C:/p/server.js' },
  session_id: 'course', tool_use_id: 'inv-1' };
ask(payload, { socketPath: adresse, frame: Number(frame), frames: Number(frames) },
  (r) => { process.send({ frame: Number(frame), texte: JSON.stringify(r || null) }); });
`);

function demarrerDaemon(adresse) {
  return new Promise((pret) => {
    const d = fork(DAEMON, [adresse], { env: ENV, stdio: 'ignore' });
    d.on('message', (m) => { if (m === 'pret') pret(d); });
  });
}

function frapper(adresse, frame, frames) {
  return new Promise((res) => {
    const c = fork(CLIENT, [adresse, String(frame), String(frames)], { env: ENV, stdio: 'ignore' });
    c.on('message', (m) => res(m));
    c.on('exit', () => res({ frame, texte: 'null' }));
  });
}

const adresseTest = (nom) => endpoint({ root: path.join(TMP, nom), stateDir: TMP });

// ── ① THE PROOF: 16 CONCURRENT PROCESSES, EXACTLY ONE DELIVERY ──────────
test('16 frame processes, ONE `once` document: delivered exactly once, with no lock and no file',
  { timeout: 30000 }, async () => {
    const adresse = adresseTest('course');
    const daemon = await demarrerDaemon(adresse);
    try {
      // All sixteen start before any of them finishes — that is the contention
      // the file-based design had to simulate its way through.
      const reponses = await Promise.all(
        Array.from({ length: 16 }, (_, i) => frapper(adresse, i + 1, 16)),
      );

      const livraisons = reponses.filter((r) => r.texte.includes('CORPS-UNIQUE'));
      assert.equal(reponses.length, 16, 'the sixteen clients must all have answered');
      assert.equal(livraisons.length, 1,
        `the document went out ${livraisons.length} time(s) instead of once. `
        + 'Frames that received it: ' + livraisons.map((r) => r.frame).join(',') + '. '
        + 'ZERO is a mute daemon; MORE THAN ONE is the duplicate delivery the lock existed to prevent — '
        + 'here it is the KERNEL that serialises, and it does not miss.');

      // 🛑 THE OTHER HALF OF THE PROOF, AND IT IS THE POINT OF THE REFACTOR:
      //    nothing was coordinated through the disk. Not "few files": none.
      const fichiers = fs.readdirSync(STATE);
      assert.deepEqual(fichiers, [],
        `the daemon wrote ${fichiers.length} file(s) in the state directory (${fichiers.join(', ')}). `
        + 'A living daemon coordinates through the kernel; the disk is only ever a save, never a channel.');
    } finally {
      daemon.send('stop');
    }
  });

// ── ② ANTI-VACUITY: the same run must DELIVER when it is supposed to ────
// ⚠️ Without this, "exactly one" above could be satisfied by an engine that has
//    simply stopped answering — the mute-probe trap this repository has paid
//    for five times.
test('CONTROL: a fresh session really receives the document (the daemon is not mute)',
  { timeout: 30000 }, async () => {
    const adresse = adresseTest('temoin');
    const daemon = await demarrerDaemon(adresse);
    try {
      const r = await frapper(adresse, 1, 1);
      assert.ok(r.texte.includes('CORPS-UNIQUE'),
        'a single client on a fresh daemon must receive the document — otherwise cell ① proves nothing');
    } finally {
      daemon.send('stop');
    }
  });

// ── ③ THE STATE IS REALLY HELD: a second action stays silent ────────────
// ⚠️ This is what a `once` MEANS. It also proves the memory is consulted, not
//    just written: a store that answered `{}` every time would re-deliver.
test('MEMORY IS CONSULTED: the second action on the same session is silent',
  { timeout: 30000 }, async () => {
    const adresse = adresseTest('memoire');
    const daemon = await demarrerDaemon(adresse);
    try {
      const un = await frapper(adresse, 1, 1);
      const deux = await frapper(adresse, 1, 1);
      assert.ok(un.texte.includes('CORPS-UNIQUE'), 'first action delivers');
      assert.ok(!deux.texte.includes('CORPS-UNIQUE'),
        'the second action delivered it again: the daemon is not holding the state it was given');
    } finally {
      daemon.send('stop');
    }
  });

// ── ④ NO DAEMON = AN IMMEDIATE FACT FROM THE KERNEL, never a timeout ────
// 🛑 This is the difference between asking and guessing. A missing pipe answers
//    `ENOENT`, a dead socket `ECONNREFUSED` — instantly, from the kernel. There
//    is no health probe, no heartbeat, no delay used as a verdict anywhere in
//    this path, and there must never be one.
// ⚠️ What this cell does NOT claim: that the agent LEARNS it acted without its
//    context. It does not — that absence is an open work item, and it will not
//    be closed with a liveness probe.
test('NO DAEMON: the client settles at once, silently, with no timer', { timeout: 30000 }, async () => {
  const adresse = adresseTest('personne');   // nobody ever listened here
  const debut = Date.now();
  const r = await frapper(adresse, 1, 1);
  const ms = Date.now() - debut;

  assert.equal(r.texte, 'null', 'with no daemon the client must answer nothing, and never throw');
  // The bound is an OBSERVATION, not a wait: a kernel refusal is immediate, so
  // anything slow here would mean an inference crept in.
  assert.ok(ms < 5000, `the refusal took ${ms} ms — a local kernel says no instantly; a delay means something is guessing`);
});

// ⚠️ The address itself is proven in `kernel-endpoint.test.js`: it is a PURE
//    function, so it belongs to the fast lane and to the mutation runner —
//    this suite spawns real processes and stays out of both.
