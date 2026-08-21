// ═══════════════════════════════════════════════════════════════════════
// http-server.js — ONE HANDLER, TWO TRANSPORTS (2026-08-21)
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 THE DEFECT THIS SUITE EXISTS FOR WAS REAL, AND IT WAS INVISIBLE.
//    The daemon listened ONLY on a TCP port while `state-client.js` connects on
//    the kernel rendezvous (a named pipe on Windows, an abstract socket on
//    Linux, a socket file on macOS). **Nobody was listening where the client
//    knocks.** Switching the shells over would have sent every frame to `ENOENT`
//    — hence to the local state-less path, hence `once` withheld on EVERY action,
//    for every agent, with nothing to see.
// 🛑 AND THE EXISTING THREE-OS PROOF COULD NOT SEE IT: `state-daemon.test.js`
//    forks its OWN test daemon (address in `argv[2]`), never this file. It
//    proves the MECHANISM. **A green on a twin is not a green on the thing** —
//    that is the whole lesson, and it is why this suite drives the REAL server.
// ⚠️ Both addresses are legitimate: the PORT serves Claude Code's native `http`
//    handler (which takes a URL, and a pipe is not a URL), the RENDEZVOUS serves
//    the client lane (spawned hooks, and Codex, which has no `http` handler).
// ⚠️ NO TIMER anywhere: a listener is READY when the kernel says so (its
//    callback), and an absent one answers `ENOENT`/`ECONNREFUSED` at once.
//
// 🛑 THE SECOND HALF OF THIS FILE SPAWNS THE REAL SHELL, and that is the whole
//    point of it. The cells above drive `createServer` in this process — enough
//    for the HANDLER, blind to the STARTUP POLICY, which lives in the
//    `require.main` block of `http-server.js` and nowhere else. A hand-built
//    copy of that block would be one more twin, i.e. exactly the mistake this
//    suite was opened to record. So the production entry point is FORKED, and
//    what is asserted is what it really does.
// ⚠️ Adding those cells moves this file into the HEAVY lane, automatically:
//    `vitest-projects.mjs` classifies by CONTENT (a suite that spawns is
//    `integration`). That is the intended mechanism, not an accident.
// ═══════════════════════════════════════════════════════════════════════

import { test, afterAll, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fork } from 'node:child_process';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const { createServer } = require_('../src/hooks/http-server.js');
const { bind } = require_('../src/kernel-bind.js');
const { endpoint, kernelAddress } = require_('../src/kernel-endpoint.js');

const PAYLOAD = JSON.stringify({
  tool_name: 'Read', tool_input: { file_path: 'C:/p/server.js' }, session_id: 'dual-' + process.pid,
});

/** One POST, on either transport. Resolves with the raw body. */
function poster(cible, corps = PAYLOAD) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      ...cible,
      method: 'POST',
      path: '/pretool?frame=1&frames=1',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(corps) },
    }, (res) => {
      let t = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { t += d; });
      res.on('end', () => resolve(t));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end(corps);
  });
}

test('THE SAME DAEMON answers on the port AND on the kernel rendezvous, identically', async () => {
  // ⚠️ A store that knows nothing and writes nothing: what is under test is the
  //    TRANSPORT, and a disk store would drag the state question in with it.
  const etat = { loadState: () => ({}), saveState: () => {} };
  const adresse = endpoint({ stateDir: os.tmpdir(), root: path.join(os.tmpdir(), 'dual-' + process.pid) });

  const surPort = createServer({ store: etat, onAddressInUse: (e) => { throw e; } });
  const surPipe = createServer({ store: etat, onAddressInUse: (e) => { throw e; } });

  const port = await new Promise((r) => surPort.listen(0, '127.0.0.1', () => r(surPort.address().port)));
  await new Promise((r, j) => bind(surPipe, adresse, r, j));

  try {
    const parPort = await poster({ host: '127.0.0.1', port });
    const parPipe = await poster({ socketPath: kernelAddress(adresse) });

    // 🛑 BYTE FOR BYTE. Two transports that answer "about the same thing" are two
    //    dialects, and a second dialect drifts from the first — silently, since
    //    both keep producing valid JSON.
    assert.equal(parPipe, parPort,
      'the two transports diverged: the client lane and the http lane would then deliver different '
      + 'knowledge for one and the same action');
    // ⚠️ ANTI-VACUITY: two EMPTY answers are also equal. The daemon must really
    //    have answered something for the equality above to mean anything.
    assert.ok(parPort.length > 0, 'the daemon answered nothing at all — the comparison above proves nothing');
  } finally {
    surPort.close();
    surPipe.close();
  }
});

test('the rendezvous is REACHABLE only once someone listens there', async () => {
  // 🛑 THE CELL THAT WOULD HAVE CAUGHT THE ORIGINAL DEFECT. Before today the
  //    daemon bound the port and nothing else, so this is exactly what a client
  //    met: an immediate kernel refusal, never a timeout.
  const orphelin = endpoint({ stateDir: os.tmpdir(), root: path.join(os.tmpdir(), 'personne-' + process.pid) });
  await assert.rejects(
    () => poster({ socketPath: kernelAddress(orphelin) }),
    (err) => ['ENOENT', 'ECONNREFUSED'].includes(err.code),
    'an address nobody owns must fail IMMEDIATELY, with a kernel code — anything else means we '
    + 'started waiting instead of asking');
});

// ═══════════════════════════════════════════════════════════════════════
// THE PRODUCTION SHELL ITSELF — forked, not imitated.
// ═══════════════════════════════════════════════════════════════════════
//
// 🛑 WHY THE COST OF A REAL SPAWN IS THE RIGHT ONE. What follows is not about
//    the handler (proven above, in process) but about the STARTUP POLICY: which
//    failure degrades ONE lane and which one kills the daemon. That policy lives
//    in the `require.main` block of `http-server.js`, is exported by nothing,
//    and is reachable by no `require`. Rebuilding it in a test file would prove
//    a TWIN — the exact reason the missing second listener survived a green
//    three-OS CI. **A green on a twin is not a green on the thing.**
//
// ⚠️ TWO TEST-SIDE SEAMS, AND NOT ONE LINE OF PRODUCTION CODE EXISTS FOR THEM.
//    Both live in a `--require` preload that only these cells load:
//      ① the RENDEZVOUS ADDRESS — `kernel-endpoint`'s exports are replaced in
//         the module cache BEFORE the shell requires them, so `main` computes
//         its address exactly as it always does and the KERNEL still answers for
//         real. Nothing is stubbed downstream: `kernel-bind`, the bind, the
//         error and its code all come from the operating system.
//      ② READINESS, TOLD BY THE KERNEL — `net.Server.prototype.listen` is
//         wrapped so every `listening` event is forwarded over the IPC channel.
//         🛑 That is what removes the poll: the alternative ("try a request,
//         retry if refused") would be a delay used as a verdict, which this
//         whole path exists to abolish. The shell says NOTHING when it is ready,
//         so we listen to the one authority that knows: the socket itself.
// ⚠️ THE ADDRESS IS NEVER HAND-WRITTEN: it comes from `kernel-endpoint`, so a
//    pipe stays a pipe, an abstract socket keeps its `@` form, and no `/tmp`
//    path is baked in. The NUL byte is added only by `kernelAddress`, at the two
//    places the kernel reads it.
// ⚠️ `stderr` IS CAPTURED, NEVER `stdio: 'ignore'` — two CI round trips were
//    lost to a daemon whose complaint was thrown away by the test meant to
//    diagnose it. Here the complaint IS the assertion.
// ⚠️ Every child is torn down by its OWN handle, in `afterEach`, on every path:
//    a wide kill on `node` would take this machine's MCP servers and other
//    agents' sessions with it.
// ═══════════════════════════════════════════════════════════════════════

const COQUILLE = path.join(import.meta.dirname, '..', 'src', 'hooks', 'http-server.js');
const MODULE_RENDEZVOUS = path.join(import.meta.dirname, '..', 'src', 'kernel-endpoint.js');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-coquille-'));
const DOCS = path.join(TMP, 'docs');
const CONFIG = path.join(TMP, 'config.json');
const OBSERVATEUR = path.join(TMP, 'observateur', 'seam.cjs');

fs.mkdirSync(DOCS, { recursive: true });
fs.mkdirSync(path.dirname(OBSERVATEUR), { recursive: true });
// 🛑 NEVER the real fleet: these children run the REAL engine, so they are given
//    a corpus and a config of their own. A document that MATCHES is what makes
//    the anti-vacuity assertions mean something — an empty corpus would answer
//    `{}` forever and every cell below would pass on a mute daemon.
fs.writeFileSync(CONFIG, JSON.stringify({ enabled: true, showNotification: false }));
fs.writeFileSync(path.join(DOCS, 'coquille.md'),
  '---\nmatch: server.js\nmode: dumb\n---\n# COQUILLE\nCORPS-COQUILLE\n');

// The preload. It is a TEST artifact: production has no idea it can exist.
fs.writeFileSync(OBSERVATEUR, `
'use strict';
const net = require('net');
// ① The rendezvous address, replaced in the module cache before the shell asks
//    for it. Everything else of that module stays REAL (kernelAddress included,
//    which is what converts the Linux '@' form for the kernel).
const cible = require.resolve(${JSON.stringify(MODULE_RENDEZVOUS.replace(/\\/g, '/'))});
const reel = require(cible);
require.cache[cible].exports = Object.assign({}, reel, {
  endpoint: (options) => (process.env.CTXROUTE_TEST_ENDPOINT
    || reel.endpoint(Object.assign({}, options, { root: process.env.CTXROUTE_TEST_ROOT }))),
});
// ② Readiness comes from the kernel's own event, forwarded to the test.
const listenReel = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args) {
  this.once('listening', () => {
    let ou = null;
    try { ou = this.address(); } catch { ou = null; }
    try { if (process.send) process.send({ listening: ou }); } catch { /* no channel: say nothing */ }
  });
  return listenReel.apply(this, args);
};
`);

afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

// The payload a harness really posts, on a path the corpus above matches.
const CORPS_COQUILLE = JSON.stringify({
  hook_event_name: 'PreToolUse',
  tool_name: 'Read',
  tool_input: { file_path: 'C:/p/server.js' },
  session_id: 'coquille-' + process.pid,
  tool_use_id: 'inv-coquille',
});

/** A TCP listener answers with an object carrying a port; the rendezvous, a string. */
const VOIE_PORT = (a) => Boolean(a) && typeof a === 'object' && typeof a.port === 'number';
const VOIE_RENDEZVOUS = (a) => typeof a === 'string' && a.length > 0;

const vivants = new Set();

/** A port nobody is using — MEASURED by binding it, never guessed. */
function portLibre() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = /** @type {any} */ (s.address()).port;
      s.close(() => resolve(p));
    });
  });
}

/** Forks the REAL shell. Nothing is awaited here — every fact below is an event. */
function lancer(nom, port, extra) {
  const suivi = { nom, stderr: '', ecoutes: [], code: null };
  const enfant = fork(COQUILLE, [], {
    execArgv: ['--require', OBSERVATEUR],
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    env: {
      ...process.env,
      CTXROUTE_HTTP_PORT: String(port),
      CTXROUTE_FILEDOCS_DIR: DOCS,
      CTXROUTE_CONFIG_PATH: CONFIG,
      CTXROUTE_STATE_DIR: path.join(TMP, nom, 'state'),
      CTXROUTE_TEST_ROOT: path.join(TMP, nom, 'clone'),
      ...(extra || {}),
    },
  });
  suivi.enfant = enfant;
  if (enfant.stderr) enfant.stderr.on('data', (b) => { suivi.stderr += b; });
  enfant.on('message', (m) => { if (m && typeof m === 'object' && 'listening' in m) suivi.ecoutes.push(m.listening); });
  suivi.fin = new Promise((r) => enfant.once('exit', (c) => { suivi.code = c; r(c); }));
  vivants.add(suivi);
  return suivi;
}

/**
 * Waits for a LANE to be listening — the kernel's event, never a delay.
 * A child that dies instead is a FACT, reported with its complaint.
 */
function voiePrete(suivi, predicat, quoi) {
  const deja = suivi.ecoutes.find(predicat);
  if (deja !== undefined) return Promise.resolve(deja);
  return new Promise((resolve, reject) => {
    const finir = () => { suivi.enfant.off('message', vu); suivi.enfant.off('exit', mort); };
    const vu = (m) => {
      if (!m || typeof m !== 'object' || !('listening' in m) || !predicat(m.listening)) return;
      finir();
      resolve(m.listening);
    };
    const mort = (code) => {
      finir();
      reject(new Error(`the shell exited (code ${code}) before ${quoi}.\n--- its stderr ---\n${suivi.stderr.trim() || '(nothing)'}`));
    };
    suivi.enfant.on('message', vu);
    suivi.enfant.on('exit', mort);
  });
}

/** Waits for the daemon to SAY something — its own stderr, not a symptom. */
function plainte(suivi, motif) {
  if (motif.test(suivi.stderr)) return Promise.resolve(suivi.stderr);
  return new Promise((resolve, reject) => {
    const finir = () => { suivi.enfant.stderr.off('data', lu); suivi.enfant.off('exit', mort); };
    const lu = () => { if (motif.test(suivi.stderr)) { finir(); resolve(suivi.stderr); } };
    const mort = (code) => {
      finir();
      reject(new Error(`the shell exited (code ${code}) without ever saying ${motif}.\n--- its stderr ---\n${suivi.stderr.trim() || '(nothing)'}`));
    };
    suivi.enfant.stderr.on('data', lu);
    suivi.enfant.on('exit', mort);
  });
}

// 🛑 EVERY PATH, INCLUDING FAILURE. A daemon left behind holds a port, a pipe
//    and, on macOS, a socket file — and the next cell would then measure the
//    previous one's process. Only OUR children, by their own handle.
afterEach(async () => {
  const partants = [...vivants];
  vivants.clear();
  for (const s of partants) if (s.code === null) s.enfant.kill();
  await Promise.all(partants.map((s) => s.fin));
});

// ── ③ A LANE THAT CANNOT TAKE ITS ADDRESS MUST NOT KILL THE OTHER ────────
//
// 🔴 THE DEFECT, REAL AND FIXED ON 2026-08-21 WITH NO CELL UNTIL NOW. The first
//    version rethrew EVERY bind error, so a rendezvous that could not be taken
//    KILLED THE WHOLE DAEMON — including the PORT lane, which was listening and
//    perfectly healthy. Claude Code's `http` handler would have lost its service
//    because the CLIENT lane's address was unavailable: two transports, one
//    shared fate, for no reason.
// ⚠️ THE FAILURE IS REAL, NOT SIMULATED: the address handed to the shell is one
//    the kernel itself refuses — a socket whose parent directory does not exist
//    (`ENOENT` on Linux, the misleading `EACCES` on macOS) and, on Windows, a
//    path that is not under the pipe namespace, which that kernel refuses too
//    (measured while writing `kernel-endpoint.js`). What is asserted is our
//    POLICY on the error, never a specific code.
test('A REFUSED RENDEZVOUS DEGRADES ONE LANE: the port still ANSWERS, and the loss is said LOUDLY',
  async () => {
    const port = await portLibre();
    const impossible = path.join(TMP, 'aucun-dossier', 'rendezvous.sock');
    const suivi = lancer('voie-degradee', port, { CTXROUTE_TEST_ENDPOINT: impossible });

    // 🛑 THE TWO OUTCOMES ARE RACED, so a sabotage that stops reproducing FAILS
    //    LOUDLY instead of hanging until the suite's bound. A cell that dies at
    //    the timeout says only "it timed out" — the one thing nobody can act on.
    const degrade = plainte(suivi, /client lane is UNAVAILABLE/).then((t) => ({ dit: t }));
    const pris = voiePrete(suivi, VOIE_RENDEZVOUS, 'the rendezvous lane started listening').then((a) => ({ pris: a }));
    const issue = await Promise.race([degrade, pris]);
    // Whichever lost must not surface later as an unhandled rejection.
    degrade.catch(() => {});
    pris.catch(() => {});
    assert.ok(!issue.pris,
      `this kernel ACCEPTED ${JSON.stringify(impossible)} as a rendezvous: the sabotage no longer `
      + 'reproduces a bind failure, so nothing here is measuring the degradation policy any more');
    const dit = issue.dit;
    const ou = await voiePrete(suivi, VOIE_PORT, 'the port lane started listening');
    // 🛑 THE VERDICT IS A REAL REQUEST, never "the process is still in the list".
    //    A daemon whose socket is dead looks perfect in a process listing.
    const texte = await poster({ host: '127.0.0.1', port: ou.port }, CORPS_COQUILLE);

    assert.equal(suivi.code, null,
      `the daemon DIED because the CLIENT lane could not take its address (stderr: ${suivi.stderr.trim()}). `
      + 'Only EADDRINUSE justifies dying — the kernel refusing a SECOND instance. Everything else '
      + 'degrades ONE lane, or Claude Code loses its http service for a reason that is not its own.');
    // ⚠️ ANTI-VACUITY: a daemon answering `{}` would satisfy "it is alive" while
    //    serving nothing. The corpus really matched, so the engine really ran.
    assert.ok(texte.includes('CORPS-COQUILLE'),
      `the port lane answered ${JSON.stringify(texte)} instead of delivering the document — it is alive `
      + 'and mute, which is what this cell must never certify as healthy');
    assert.ok(!/EADDRINUSE/.test(dit),
      'the kernel answered EADDRINUSE where this cell needs another failure: the sabotage no longer '
      + 'reproduces the case, so nothing is being proven about the degradation policy');
  });

// ── ④ …AND `EADDRINUSE` DOES KILL, WHICH IS THE OTHER HALF ───────────────
//
// 🛑 WITHOUT THIS MIRROR, THE EXCEPTION ABOVE COULD BE WIDENED TO "never die"
//    and nothing would turn red. An address already taken means a SECOND
//    instance, the kernel is the authority that refuses it, and a second daemon
//    holding a second memory of the same state is the "two memories" defect.
// ⚠️ ANTI-VACUITY: the occupant must really be listening before the shell is
//    forked, otherwise the cell would measure an ordinary bind.
test('EADDRINUSE ON THE RENDEZVOUS KILLS: the kernel refuses a SECOND instance and the shell obeys',
  async () => {
    const port = await portLibre();
    const adresse = endpoint({ root: path.join(TMP, 'occupee', 'clone'), stateDir: TMP });
    const occupant = net.createServer(() => {});
    await new Promise((r) => occupant.listen(kernelAddress(adresse), r));
    try {
      assert.ok(occupant.listening, 'the occupant never took the address — the cell would prove nothing');
      const suivi = lancer('occupee', port, { CTXROUTE_TEST_ENDPOINT: adresse });
      const code = await suivi.fin;

      assert.notEqual(code, 0,
        'the daemon survived an address the kernel had already given to somebody else. Duplicate '
        + 'prevention is the kernel\'s, and the shell must act on its refusal — never a PID file, '
        + 'never a liveness probe.');
      assert.match(suivi.stderr, /EADDRINUSE/,
        `the shell died for some OTHER reason than the duplicate (stderr: ${suivi.stderr.trim() || '(nothing)'}) `
        + '— the exit code alone would have made this cell pass on an unrelated crash');
      assert.ok(!/client lane is UNAVAILABLE/.test(suivi.stderr),
        'the shell took the DEGRADATION path on an EADDRINUSE: it announced a survivable loss and then '
        + 'died, i.e. the one error that must be fatal has been folded into the ones that must not be');
    } finally {
      occupant.close();
    }
  });

// ── ⑤ A FRESH CLONE HAS NO `state/`, AND THE RENDEZVOUS STILL ANSWERS ────
//
// 🔴 MEASURED IN CI ON 2026-08-21, on a clone where `state/` did not exist yet:
//    the bind failed, and **macOS answers `EACCES` where Linux answers `ENOENT`**
//    for a socket whose parent directory is missing — a misleading error that
//    sent the first reading towards a permissions problem that did not exist.
//    The fix is one `mkdirSync(..., {recursive:true})` BEFORE the bind.
// 🛑 THE ORDER IS THE ASSERTION, and that is what makes this cell discriminating
//    on all three kernels. The directory is checked at the instant the rendezvous
//    STARTS LISTENING — before any request. Later would prove nothing: the
//    memory store creates that directory itself when it writes its first
//    snapshot, so a check after one POST would be green with the `mkdirSync`
//    removed.
// ⚠️ ON POSIX THE ADDRESS IS ASKED FOR IN ITS SOCKET-FILE SHAPE (the macOS one),
//    so the bind really depends on that directory on Linux too — one kernel more
//    where the removal turns red. On Windows the kernel names a pipe OUTSIDE the
//    filesystem: no address can depend on a directory there, so the order check
//    above is the whole proof, and it is stated rather than simulated.
test('A TREE WITH NO `state/`: the directory is created BEFORE the bind, and the client lane answers',
  async () => {
    const port = await portLibre();
    const nom = 'arbre-neuf';
    const etat = path.join(TMP, nom, 'state');
    const racine = path.join(TMP, nom, 'clone');
    assert.equal(fs.existsSync(etat), false,
      'the state directory already exists — this cell can only prove anything on a tree without one');

    const extra = process.platform === 'win32'
      ? {}
      : { CTXROUTE_TEST_ENDPOINT: endpoint({ platform: 'darwin', root: racine, stateDir: etat }) };
    const suivi = lancer(nom, port, extra);
    // 🛑 RACED AGAINST THE DAEMON'S OWN COMPLAINT. Without the `mkdirSync` the
    //    rendezvous simply never opens and the daemon keeps serving the port —
    //    a cell waiting only for the listener would die at the suite's bound
    //    saying "it timed out". Here the DEGRADATION MESSAGE is what turns it
    //    red, and it names the kernel's code.
    const ecoute = voiePrete(suivi, VOIE_RENDEZVOUS, 'the rendezvous lane started listening').then((a) => ({ ou: a }));
    const perdue = plainte(suivi, /client lane is UNAVAILABLE/).then((t) => ({ perdue: t }));
    const issue = await Promise.race([ecoute, perdue]);
    ecoute.catch(() => {});
    perdue.catch(() => {});
    assert.ok(!issue.perdue,
      'the daemon could NOT take the rendezvous on a tree without `state/` — which is defect B itself, '
      + `and the kernel's own words are: ${String(issue.perdue).trim()}`);
    const adresse = issue.ou;

    assert.ok(fs.existsSync(etat),
      `the rendezvous was taken while ${JSON.stringify(etat)} did not exist. On a kernel that puts the `
      + 'socket in that directory the bind fails there and then — with EACCES on macOS, which reads as '
      + 'a permissions problem and is not one.');
    const texte = await poster({ socketPath: kernelAddress(adresse) }, CORPS_COQUILLE);
    // ⚠️ ANTI-VACUITY, same rule as everywhere here: listening proves a socket,
    //    only an answer carrying the document proves the lane.
    assert.ok(texte.includes('CORPS-COQUILLE'),
      `the rendezvous answered ${JSON.stringify(texte)}: a spawned hook asking there would decide `
      + 'locally and record nothing, and every `once` would be withheld on every action');
  });
