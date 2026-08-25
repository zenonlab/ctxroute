// ═══════════════════════════════════════════════════════════════════════
// SOCKET ACTIVATION — the OS hands us the listening socket, or it does not.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 WHAT IS ACTUALLY BEING PROTECTED. `watchOwnCode` makes the daemon exit as
//    soon as its own code changes — ten times in two minutes while somebody
//    refactors this repository. Every one of those windows costs EVERY OTHER
//    agent its injection, in TOTAL SILENCE (no daemon ⇒ the tool simply runs).
//    When the OS owns the socket the window cannot exist: connections queue in
//    the kernel backlog and the next instance answers them.
//
// ⚠️ THE CONTRACT IS A THIRD PARTY'S, so it is quoted rather than invented —
//    sd_listen_fds(3), systemd 261~rc1, page dated 2026-05-24:
//    "#define SD_LISTEN_FDS_START 3", and sd_listen_fds() "checks whether the
//    $LISTEN_PID environment variable equals the daemon PID. If not, it returns
//    immediately".
//
// 🛑 THE PID CHECK IS THE ONE THING A NAIVE IMPLEMENTATION GETS WRONG, and it
//    fails SILENTLY: these variables are INHERITED, so a process whose parent
//    was socket-activated sees them and would listen on a descriptor nobody
//    gave it. That case is proven twice below — on the decision, and end to end.
//
// ⚠️ NOTHING HERE INFERS ANYTHING. No probe, no "does fd 3 look like a socket",
//    no liveness verdict, no timeout used as an answer. Either the OS said it,
//    or it did not.
// 🛑 SEEN RED BY IN-MEMORY SABOTAGE ONLY — never by writing a broken file. A
//    sabotage on disk has already taken down 38 tests of other suites here.
// ═══════════════════════════════════════════════════════════════════════

import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const SERVER = path.join(import.meta.dirname, '..', 'src', 'hooks', 'http-server.js');
const { inheritedFd, listenOn, SD_LISTEN_FDS_START } = require_(SERVER);
// ⚠️ AN ADDRESS THIS SUITE CHOOSES, never one read back from the module under
//    test. `listenOn` takes BOTH halves as ARGUMENTS, so what is proven here is
//    the wiring of the descriptor, not which address the daemon resolved; and
//    since 2026-08-25 that address has ONE resolution point
//    (`paths.httpEndpoint()`), read by the daemon and by the wiring generator
//    alike, never a constant on either side.
const HOST = '127.0.0.1';
const PORT = 8787;

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-sockact-'));
afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

// ⚠️ THE REAL-DESCRIPTOR CASES CANNOT RUN ON WINDOWS, and the reason is
//    OFFICIAL, not a workaround: Node's net documentation (v22) states
//    "Listening on a file descriptor is not supported on Windows", and Windows
//    has no socket-activation protocol to inherit from in the first place. The
//    CI matrix is ubuntu · windows · macos, so these cases DO run for real on
//    two of the three — the skip is a platform fact, never a way to dodge them.
// 🛑 The decision itself (everything above ④) runs EVERYWHERE, including here,
//    so no assertion of this file is Windows-blind by accident.
const POSIX = process.platform !== 'win32';

// ═══════════════════════════════════════════════════════════════════════
// THE CRITERION — written ONCE, applied to the real function AND to the
// sabotages. Sharing it literally is what makes the SEEN RED a proof: weaken
// it to silence a failure and the negative-check goes red in the same gesture.
// ═══════════════════════════════════════════════════════════════════════
/**
 * @param {(env: Record<string, string|undefined>, pid: number) => number|null} decide
 */
function criterion(decide) {
  const moi = 4242;
  // ⚠️ ANTI-VACUITY, and it is the first line for a reason: an implementation
  //    that always answers "nothing" would satisfy every other case below and
  //    disable socket activation for the whole fleet, silently.
  assert.strictEqual(decide({ LISTEN_PID: String(moi), LISTEN_FDS: '1' }, moi), SD_LISTEN_FDS_START,
    'the OS passed us a socket and the protocol was not read');
  // 🛑 THE INHERITED-VARIABLES CASE.
  assert.strictEqual(decide({ LISTEN_PID: String(moi + 1), LISTEN_FDS: '1' }, moi), null,
    'a descriptor belonging to ANOTHER process was accepted');
  // The ordinary case: nobody supervises us, we bind the port as before.
  assert.strictEqual(decide({}, moi), null, 'an empty environment must change nothing');
  assert.strictEqual(decide({ LISTEN_PID: String(moi), LISTEN_FDS: '0' }, moi), null,
    'LISTEN_FDS=0 means "no descriptor passed"');
}

test('the protocol is read exactly as sd_listen_fds(3) documents it', () => {
  criterion(inheritedFd);

  const moi = 777;
  // ⚠️ Only the FIRST descriptor is used, and the unit declares exactly one
  //    ListenStream=. Stated here rather than left to be discovered.
  assert.strictEqual(inheritedFd({ LISTEN_PID: '777', LISTEN_FDS: '2' }, moi), SD_LISTEN_FDS_START);
  // ⚠️ Anything that is not exactly an integer is a NO — on BOTH variables. A
  //    malformed environment means "I do not know what I was handed", and the
  //    only safe answer is the port. `Number()` alone would accept all four.
  for (const wrong of ['3.5', ' 1 ', '0x1', '', 'yes', '-1']) {
    assert.strictEqual(inheritedFd({ LISTEN_PID: String(moi), LISTEN_FDS: wrong }, moi), null,
      `LISTEN_FDS=${JSON.stringify(wrong)} must not be read as a count`);
    assert.strictEqual(inheritedFd({ LISTEN_PID: wrong, LISTEN_FDS: '1' }, moi), null,
      `LISTEN_PID=${JSON.stringify(wrong)} must not be read as a pid`);
  }
  // Half a protocol is not a protocol.
  assert.strictEqual(inheritedFd({ LISTEN_FDS: '1' }, moi), null, 'LISTEN_FDS alone proves nothing');
  assert.strictEqual(inheritedFd({ LISTEN_PID: String(moi) }, moi), null, 'LISTEN_PID alone passes no descriptor');
});

test('SEEN RED: the criterion rejects the two ways this is got wrong', () => {
  // 🛑 SABOTAGE ①, the realistic one — trusting the environment without
  //    comparing the pid. It is what every "just read LISTEN_FDS" snippet does,
  //    and its failure mode is a daemon answering on somebody else's socket.
  const naive = (/** @type {Record<string, string|undefined>} */ env) =>
    (Number(env.LISTEN_FDS) > 0 ? SD_LISTEN_FDS_START : null);
  assert.throws(() => criterion(naive), /ANOTHER process/,
    'the criterion does NOT see an implementation that ignores LISTEN_PID — it proves nothing');

  // 🛑 SABOTAGE ②, the silent one — socket activation never used. Every "safe"
  //    case passes; only the anti-vacuity line catches it. A gate that misses
  //    this certifies a capability that was never wired.
  const mute = () => null;
  assert.throws(() => criterion(mute), /not read/,
    'the criterion accepts an implementation that never activates — it would certify a dead feature');
});

test('the server LISTENS on the inherited descriptor, and on the port otherwise', () => {
  // ⚠️ BEHAVIOURAL, not a reading: a fake server records what `listen` really
  //    received. The wiring is what a defect would break — the decision can be
  //    perfect and be called with the wrong arguments.
  const appels = [];
  const faux = /** @type {any} */ ({ listen: (...args) => appels.push(args) });

  const fd = listenOn(faux, { LISTEN_PID: '99', LISTEN_FDS: '1' }, 99, PORT, HOST);
  assert.strictEqual(fd, SD_LISTEN_FDS_START);
  assert.deepStrictEqual(appels, [[{ fd: SD_LISTEN_FDS_START }]],
    'the inherited descriptor was not the thing listened on');

  // ⚠️ PARITY: with nothing passed, the call must be the one that was there
  //    before this feature existed — same two arguments, same order.
  appels.length = 0;
  assert.strictEqual(listenOn(faux, {}, 99, PORT, HOST), null);
  assert.deepStrictEqual(appels, [[PORT, HOST]], 'the default path changed shape');

  // A foreign pid must take the SAME path as "no protocol at all".
  appels.length = 0;
  assert.strictEqual(listenOn(faux, { LISTEN_PID: '98', LISTEN_FDS: '1' }, 99, PORT, HOST), null);
  assert.deepStrictEqual(appels, [[PORT, HOST]], 'a foreign descriptor was not ignored');
});

// ═══════════════════════════════════════════════════════════════════════
// ④ THE REAL THING — a real listening socket, really inherited by a real child
// ═══════════════════════════════════════════════════════════════════════
// ⚠️ No systemd involved, and none needed: what systemd does is create a
//    listening socket, hand it to the process as descriptor 3, and set the two
//    variables. All three are reproducible with `stdio`, so the CONTRACT gets
//    tested rather than the supervisor.
// 🛑 THE PARENT CLOSES ITS OWN COPY IMMEDIATELY. `stdio` DUPS the descriptor
//    into the child, so the socket stays alive through the child's copy — while
//    two processes accepting from one queue would make this test a coin toss.

/** Writes the child once; it is the daemon's real entry point, minus the watch. */
function driver() {
  const file = path.join(TMP, 'child.js');
  fs.writeFileSync(file, `
    const { createServer, listenOn } = require(${JSON.stringify(SERVER)});
    // ⚠️ systemd stamps LISTEN_PID from OUTSIDE, AFTER the fork. A test cannot
    //    know the child's pid before spawning it, so the child writes the value
    //    systemd would have written — and ONLY when asked. Without this flag the
    //    variable keeps the FOREIGN pid the parent put there, which is the
    //    negative case.
    if (process.env.CTXROUTE_TEST_SELF_PID === '1') process.env.LISTEN_PID = String(process.pid);
    const srv = createServer();
    const fd = listenOn(srv, process.env, process.pid, Number(process.env.CTXROUTE_HTTP_PORT), process.env.CTXROUTE_TEST_HOST);
    srv.on('listening', () => console.log(JSON.stringify({ fd, port: srv.address().port })));
  `);
  return file;
}

/** A port nobody is using — measured by binding it, never guessed. */
function portLibre() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, HOST, () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
}

/**
 * Spawns the child with a REAL listening socket on descriptor 3.
 * @param {{selfPid: boolean, port: number}} opts
 */
function withInheritedSocket(opts) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.listen(0, HOST, () => {
      const port = probe.address().port;
      const fd = /** @type {any} */ (probe)._handle.fd;
      // ⚠️ ANTI-VACUITY: without a real descriptor the child would fall back to
      //    the port and this whole case would pass by measuring the fallback.
      if (!Number.isInteger(fd) || fd < 3) { reject(new Error(`no usable descriptor (${fd})`)); return; }

      const child = spawn(process.execPath, [driver()], {
        stdio: ['ignore', 'pipe', 'pipe', fd],
        env: {
          ...process.env,
          LISTEN_FDS: '1',
          // A FOREIGN pid on purpose — ours. The child overwrites it only when
          // `selfPid` is set, exactly where systemd would have.
          LISTEN_PID: String(process.pid),
          CTXROUTE_TEST_SELF_PID: opts.selfPid ? '1' : '0',
          CTXROUTE_HTTP_PORT: String(opts.port),
          // ⚠️ The host is an ARGUMENT of `listenOn` since 2026-08-25, so the
          //    child is TOLD it — there is no constant left to read.
          CTXROUTE_TEST_HOST: HOST,
          // 🛑 NEVER the real fleet: this child runs the REAL engine.
          CTXROUTE_STATE_DIR: path.join(TMP, 'state'),
          CTXROUTE_FILEDOCS_DIR: path.join(TMP, 'docs'),
          CTXROUTE_CONFIG_PATH: path.join(TMP, 'config.json'),
        },
      });
      // The parent must stop accepting the moment the child holds its dup.
      child.on('spawn', () => probe.close());
      let out = '';
      child.stdout.on('data', (c) => {
        out += c;
        if (!out.includes('\n')) return;
        // ⚠️ A child that printed something we cannot read must REJECT, never
        //    throw inside an event handler where the failure would surface as an
        //    unrelated unhandled rejection.
        try {
          resolve({ child, announcement: JSON.parse(out.trim().split('\n')[0]), portSocket: port });
        } catch {
          reject(new Error(`unreadable announcement from the child: ${out}`));
        }
      });
      child.on('error', reject);
      child.on('exit', (code) => reject(new Error(`child died before listening (code ${code})`)));
    });
  });
}

test.skipIf(!POSIX)('REAL: the daemon serves on the descriptor the OS passed it, never on the port', async () => {
  const libre = await portLibre();
  const { child, announcement, portSocket } = await withInheritedSocket({ selfPid: true, port: libre });
  try {
    assert.strictEqual(announcement.fd, SD_LISTEN_FDS_START, 'the child did not take the inherited descriptor');
    assert.strictEqual(announcement.port, portSocket,
      'the child bound something of its own — the inherited socket was not used');
    assert.notStrictEqual(portSocket, libre, 'the two ports must differ or the case proves nothing');

    // 🛑 THE ACTUAL PROOF: a real request, on a port the child was NEVER told
    //    about, answered by the engine through the inherited socket.
    const answer = await new Promise((resolve, reject) => {
      const corps = JSON.stringify({ tool_name: 'Bash', tool_input: {} });
      const req = http.request({ host: HOST, port: portSocket, method: 'POST', path: '/pretool',
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(corps) } },
      (res) => { let t = ''; res.on('data', (c) => { t += c; }); res.on('end', () => resolve(t)); });
      req.on('error', reject);
      req.end(corps);
    });
    assert.deepStrictEqual(JSON.parse(answer), {},
      'the inherited socket answered something other than the engine did');
  } finally {
    child.removeAllListeners('exit');
    child.kill();
  }
});

test.skipIf(!POSIX)('REAL: a LISTEN_PID belonging to another process is ignored, descriptor and all', async () => {
  // 🛑 The child inherits a perfectly valid listening socket on descriptor 3 AND
  //    a LISTEN_FDS that says so — only the pid is somebody else's. Using it
  //    would be undetectable in production: the daemon would answer on a socket
  //    nobody gave it, on a machine where that happens to work.
  const libre = await portLibre();
  const { child, announcement, portSocket } = await withInheritedSocket({ selfPid: false, port: libre });
  try {
    assert.strictEqual(announcement.fd, null, 'a descriptor owned by another pid was accepted');
    assert.strictEqual(announcement.port, libre, 'the fallback did not bind the configured port');
    assert.notStrictEqual(announcement.port, portSocket, 'the child served the inherited socket anyway');
  } finally {
    child.removeAllListeners('exit');
    child.kill();
  }
});
