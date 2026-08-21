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
const { occupied } = require('../src/kernel-bind.js');

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
const { bind } = require(${JSON.stringify(path.join(RACINE, 'src', 'kernel-bind.js').replace(/\\/g, '/'))});
const adresse = process.argv[2];
// A snapshot path may be given as argv[3]: with it the daemon survives its own
// death, without it the state is purely volatile (zero disk).
const store = createMemoryStore({ snapshotPath: process.argv[3] || null });
store.restore();                                 // BEFORE listen — see below
const srv = createServer({ store });
// bind() does the two things only this layer may do: convert the address to the
// form the kernel reads (an argv could not carry the NUL), and clear a DEAD
// entry on the one kernel that leaves one — after ASKING the kernel whether
// anybody is still listening. Never a guess.
// (No backticks in this comment: it lives inside a template literal.)
bind(srv, adresse, () => process.send('pret'), (e) => { process.send('erreur:' + e.code); });
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

// 🛑 A DAEMON THAT FAILS TO BIND MUST SAY SO, NOT TIME OUT. Measured on macOS
//    CI 2026-08-20: this cell died at the 30 s wall and the log said only "it
//    timed out" — the ONE thing that could not be acted on. The daemon already
//    reported its error code; nobody was listening. An unobservable failure
//    costs a full CI round trip per hypothesis, so the observation comes FIRST.
function demarrerDaemon(adresse, snapshot) {
  return new Promise((pret, echec) => {
    const args = snapshot ? [adresse, snapshot] : [adresse];
    // 🛑 `stderr` IS CAPTURED, NOT DISCARDED. With `stdio: 'ignore'` a daemon that
    //    throws at startup reports "exited (code 1)" and NOTHING else — the stack
    //    that names the cause is thrown away by the very test meant to diagnose
    //    it. Measured on macOS CI: two round trips lost to a message we already
    //    had and were destroying.
    const d = fork(DAEMON, args, { env: ENV, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    let plainte = '';
    if (d.stderr) d.stderr.on('data', (b) => { plainte += b; });
    d.on('message', (m) => {
      if (m === 'pret') { pret(d); return; }
      if (typeof m === 'string' && m.startsWith('erreur:')) {
        echec(new Error(`the daemon could not take its address (${m.slice(7)}) at ${JSON.stringify(adresse)}`));
      }
    });
    // The death of a child is an OS EVENT: if it dies without ever answering,
    // that is a FACT worth reporting, never a wait to sit through.
    d.on('exit', (code) => echec(new Error(
      `the daemon exited (code ${code}) without ever listening.
--- its stderr ---
${plainte.trim() || '(nothing)'}`)));
  });
}

/** The daemon's death is an OS EVENT, awaited as such — never a delay. */
function tuer(d) {
  return new Promise((mort) => { d.once('exit', mort); d.kill(); });
}

/**
 * A CLEAN STOP, and since 2026-08-21 the distinction is LOAD-BEARING, not a
 * nicety. The snapshot is no longer written on every mutation (it was O(total
 * state) of disk per tool call); it is written every N mutations AND on the
 * daemon's own clean exit. So the property is now **"the state survives a CLEAN
 * restart entirely, and a `kill -9` loses at most the last N mutations"**.
 * 🛑 `tuer()` sends a SIGNAL: with no handler installed, Node terminates on the
 *    default action and `'exit'` never fires — nothing flushes, by design. It is
 *    the right tool for proving what a HARD death costs; it is the wrong tool for
 *    proving a restart keeps its state.
 * ⚠️ The `stop` message makes the daemon call `process.exit(0)` itself, which is
 *    the CLEAN path, i.e. the one a supervisor's shell must reproduce.
 */
function arreter(d) {
  return new Promise((mort) => { d.once('exit', mort); d.send('stop'); });
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

// ── ⑤ A RESTART MUST NOT RE-DELIVER — the state survives the process ────
//
// 🔴 THE DEFECT THIS CLOSES BEFORE IT EXISTS. The kernel serialises what is
//    ALIVE, but it persists NOTHING through the death of a process: a purely
//    volatile daemon forgets every `once` the moment it exits. And it exits
//    OFTEN — `watchOwnCode` kills it on any edit of this repository, so a
//    single working session restarts it repeatedly. Without a snapshot, that is
//    the duplicate delivery closed this morning, reopened through a new door.
// 🛑 RESTORE HAPPENS BEFORE `listen`, and the ORDER is the guarantee: at that
//    instant the daemon is the only thing that exists, so the read has no
//    concurrency to fear. That is why the disk can be a SAVE here without ever
//    becoming a CHANNEL again.
// ⚠️ ANTI-VACUITY: the first daemon must really deliver, and the second must
//    really be a different process — otherwise "silence" would prove nothing.
test('A RESTART DOES NOT RE-DELIVER: the state survives the death of the daemon',
  { timeout: 30000 }, async () => {
    const adresse = adresseTest('reprise');
    const snapshot = path.join(TMP, 'reprise-snapshot.json');

    const un = await demarrerDaemon(adresse, snapshot);
    const premier = await frapper(adresse, 1, 1);
    // 🛑 A CLEAN STOP, AND IT IS THE PROPERTY UNDER TEST SINCE 2026-08-21. The
    //    snapshot is written every N mutations AND on the daemon's own clean
    //    exit; one delivery is far below N, so what is proven here is exactly
    //    "a CLEAN restart loses NOTHING". A signal (`tuer`) fires no `'exit'`
    //    handler at all and would be measuring the `kill -9` case instead —
    //    which costs at most N re-delivered documents, by design.
    await arreter(un);

    const deux = await demarrerDaemon(adresse, snapshot);
    const apres = await frapper(adresse, 1, 1);
    const pid1 = un.pid;
    await arreter(deux);

    assert.ok(premier.texte.includes('CORPS-UNIQUE'), 'the first daemon must deliver — otherwise this cell proves nothing');
    assert.notEqual(deux.pid, pid1, 'the two daemons must really be different processes');
    assert.ok(!apres.texte.includes('CORPS-UNIQUE'),
      'the document was delivered AGAIN after a restart: the daemon did not restore its state, '
      + 'so every edit of this repository would re-inject every `once` — the duplicate delivery, back.');
  });

// ── ⑥ "IS ANYONE THERE?" IS ASKED TO THE KERNEL, NEVER TO THE FILESYSTEM ──
//
// 🔴 THE DEFECT THIS GUARDS, FOUND BY CI ON macOS AND ONLY THERE (2026-08-20).
//    Windows removes its pipe when the owner exits; a Linux ABSTRACT socket
//    disappears with its last reference. macOS leaves a real FILE, and Node only
//    unlinks it on a clean `close()`. A daemon that is KILLED — the normal case,
//    since any code edit makes it exit — leaves a dead socket file, and the NEXT
//    daemon cannot bind: `EADDRINUSE` for ever, with nothing listening. Four
//    cells passed; the restart one timed out.
// 🛑 AND THE ENTRY IS NEVER REMOVED ON A GUESS. "The file exists, so it is
//    probably stale" is the inference this whole design removes, and here it
//    would be catastrophic: deleting the socket of a LIVING daemon leaves it
//    running while every client knocks on an address nobody owns — silence, no
//    error, nothing to notice. So the KERNEL answers, instantly: a connect that
//    succeeds means someone is alive; `ECONNREFUSED` means the entry is dead.
// ⚠️ This cell is platform-agnostic BECAUSE the question is: `occupied()` asks
//    the kernel about an address, and every kernel answers it the same way.
test('THE KERNEL SAYS WHO IS ALIVE — an address answers, or it is dead', { timeout: 30000 }, async () => {
  const adresse = adresseTest('vivant');

  const mort = await new Promise((r) => occupied(endpoint({ root: path.join(TMP, 'jamais-ne') }), r));
  assert.equal(mort, false, 'an address nobody ever listened on must read as DEAD — otherwise a stale entry is never cleared');

  const daemon = await demarrerDaemon(adresse);
  try {
    const vivant = await new Promise((r) => occupied(require('../src/kernel-endpoint.js').kernelAddress(adresse), r));
    assert.equal(vivant, true,
      'a LIVING daemon must read as alive: without this, its address would be deleted under it and every '
      + 'client would knock on a door nobody owns — silently.');
  } finally {
    daemon.send('stop');
  }
});
