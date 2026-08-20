#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// HTTP SHELL — the SAME PreToolUse gate, served over a local socket.
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ NOT WIRED. Written 2026-08-20, deliberately inert: no `settings.json`
//    entry points at it, nothing spawns it. The switch-over is an EXPLICIT
//    decision of the maintainer, at a moment when no agent is running.
//    Its only job today is to be PROVEN byte-identical to the spawn lane.
//
// WHY IT EXISTS — measured, not assumed. The `command` lane spawns one node
// per frame on EVERY tool call: ~330 ms each, of which 96 % is node's own
// startup. At 16 frames that is ~5.3 s of pure overhead per action. Claude
// Code documents a second handler type — verified IN the installed binary
// 2.1.237, literal `type:"http"` / `url` "URL to POST the hook input JSON to"
// — which POSTs to an ALREADY RUNNING service. The startup cost disappears.
// 🛑 The 10,000-character cap per hook output does NOT: it is per OUTPUT, not
//    per process. N declarations are therefore STILL required for bandwidth —
//    what changes is their price, not their number. Never "simplify" this to a
//    single declaration: an action's capacity would collapse to one frame and
//    the agent would act on partial knowledge (cf the skill, MULTI-FRAME).
//
// ⚠️ CODEX HAS NO SUCH HANDLER — official doc read 2026-08-20: *"Only
//    type: "command" handlers run today"*. It stays on the spawn lane, and that
//    asymmetry is the NORMAL case of this architecture (thin shell per harness,
//    frozen engine), never a degradation to fix.
//
// ⚠️ THIS FILE IS A SHELL AND NOTHING ELSE. It owns the TRANSPORT (a socket
//    instead of stdin/stdout) and nothing more. Every decision — which docs,
//    cadence, chunking, state — comes from `pretool-core`, unchanged and
//    unaware that any of this exists. If you find yourself deciding something
//    here, you are in the wrong layer: STOP.
//
// 🛑 THE DIALECT IS NOT REIMPLEMENTED HERE. The response JSON is produced by
//    `doc-inject.output()`, the very function the spawn lane uses. A second
//    copy of that shape would be a CLONE (jscpd sees it) and, worse, a TWIN
//    that drifts — the defect class this repository exists to fight. Requiring
//    that module is safe: its `require.main` guard means importing it reads no
//    stdin and kills nothing.
//
// 🛑 NO DEADLINE IS ARMED HERE, and that is a DELIBERATE INVERSION of the rule
//    every other shell follows. `deadline.arm()` exists to stop a hook PROCESS
//    from becoming a zombie (875 of them on 15/07/2026); a daemon is a process
//    that is SUPPOSED to outlive its request. Arming it would shoot the service
//    at the first timeout. The bound that matters here belongs to the harness
//    (`timeout` on the http handler), not to us.
//
// 🛑 LOOPBACK ONLY. Binding anywhere but 127.0.0.1 would expose an endpoint
//    that returns this fleet's private knowledge to the local network. There is
//    no authentication and there must never need to be one: the socket is the
//    boundary.
// ═══════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════
// STRUCTURAL AUDIT OF ACCUMULATION — done by READING, 2026-08-20.
// ═══════════════════════════════════════════════════════════════════════
// 🛑 A LEAK IS NOT PROVEN ABSENT BY A TEST. The suite exercises thousands of
//    requests in seconds and can only catch the coarse ones — the kind that
//    retain hundreds of bytes on the HAPPY path. The vicious ones retain a few
//    bytes on a RARE event (an abort, an error, a restart) and surface after
//    WEEKS of uptime, which no test run will ever reach. The only real
//    assurance is that the code cannot accumulate BY CONSTRUCTION. Hence this
//    list: the known classes, each checked against this file, so the next agent
//    inherits the audit instead of redoing it.
//    ① UNBOUNDED COLLECTION keyed by something that grows (session, request):
//       none here, and none in the engine either — zero module-level mutable
//       state across the 19 modules this process loads.
//    ② LISTENERS PILING UP ON A LONG-LIVED EMITTER: every `on()` below is bound
//       to a PER-REQUEST object that dies with the request. The two exceptions
//       are registered ONCE at startup (`server.on('error')`, the watchers).
//    ③ TIMERS NEVER CLEARED: none. `deadline.arm()` is deliberately not called.
//    ④ A PROMISE THAT MAY NEVER SETTLE and ⑤ AN UNHANDLED REJECTION KILLING THE
//       PROCESS: guarded in `readBody` and in the request handler.
//       🔴 **AND THE GUARDS ARE NOT THERE BECAUSE EITHER WAS OBSERVED — THE
//       MEASUREMENT REFUTED BOTH.** Reproduced on Node **22.15.1/Windows**
//       WITHOUT the guards: an aborted request still settles, writing to the
//       destroyed socket does NOT throw, and the server survives. Whoever reads
//       this must not repeat "an abort used to kill the daemon": it did not.
//       What the guards buy is INDEPENDENCE from that behavior, which is an
//       undocumented implementation detail of one runtime version, on a process
//       meant to run for months across upgrades. Settling on `close` (which
//       always fires, and fires last) makes "every request settles exactly
//       once" true BY CONSTRUCTION rather than by Node's current tolerance.
//       ⚠️ That is the honest reason, and it is the only one that may be cited.
//    ⑥ BUFFERS HELD PAST THEIR USE: released at settle time, not at `end`.
//    ⑦ SOCKETS HELD FOREVER: bounded by Node's own `keepAliveTimeout` (5 s),
//       `headersTimeout` and `requestTimeout`. We do NOT restate those numbers:
//       they are the runtime's, a second copy would be a second truth. They are
//       also the ONLY legitimate delays here — they bound "connected but
//       silent", which is the undecidable case, never a liveness verdict.
// ⚠️ WHAT THIS AUDIT DOES NOT CLOSE, stated rather than hidden: growth on DISK.
//    The state store gains a file per session scope and nothing evicts old ones.
//    That is an engine-wide question, not one the HTTP lane creates — the spawn
//    lane has it too — but a service running for months is what makes it VISIBLE.
//    Do not treat it as covered by anything in this file.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const http = require('http');
const { run } = require('../pretool-core');
const { output } = require('./doc-inject');

// ⚠️ LOOPBACK, hardcoded — read the header. This is NOT a setting: an adopter
//    who needs to move it has a problem this framework must not solve.
const HOST = '127.0.0.1';

// ⚠️ The port IS a setting (a machine may already use any given number), read
//    from the environment because that is what the WIRING can express — a hook
//    URL and a service unit both carry it. Default chosen in the IANA dynamic
//    range, and it stays fixed: it is written in the wiring on the other side.
const DEFAULT_PORT = 8787;

// ⚠️ Refuse a body that could not possibly be a hook payload BEFORE buffering it
//    all. A daemon lives for months: an unbounded read is a memory leak waiting
//    for its trigger. The real payloads measured on this fleet stay far under
//    this — the bound is a wall, never a working limit.
const MAX_BODY_BYTES = 4 * 1024 * 1024;

// ⚠️ WHAT "NOTHING TO SAY" LOOKS LIKE OVER HTTP — and it is DECLARED UNMEASURED.
//    On the spawn lane, silence is an exit 0 with no stdout. The official doc
//    says the endpoint answers "using the same JSON output format as command
//    hooks" but does NOT say what an EMPTY body means. We send `{}` because it
//    is unambiguously valid JSON carrying no decision, where an empty body might
//    not parse at all. 🛑 This is the ONE guess in this file: it must be
//    CONFIRMED on a throwaway wiring before anything is switched over.
const NO_OUTPUT = {};

/**
 * Reads the request body, bounded.
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<string|null>} the body, or null if it exceeded the bound
 */
function readBody(req) {
  return new Promise((resolve) => {
    let size = 0;
    let parts = [];
    let over = false;
    // 🛑 SETTLE EXACTLY ONCE, AND SETTLE ALWAYS — by construction, not by luck.
    //    A promise able to stay pending forever is the archetype of the leak no
    //    test finds: no test client aborts, each occurrence costs a few
    //    kilobytes, and it only shows after weeks of uptime.
    // 🔴 HONEST STATUS: on Node 22.15.1 an aborted request DOES settle without
    //    this — measured, the claim that it did not was wrong. `close` is here
    //    because it ALWAYS fires and fires LAST, which makes the invariant hold
    //    on any runtime and any version, instead of resting on behavior nobody
    //    documented. Do not describe it as a fix for an observed hang.
    const settle = (value) => {
      if (parts === null) return;   // already settled — later events are noise
      const body = value === undefined ? Buffer.concat(parts).toString('utf8') : value;
      parts = null;                 // drop the buffers BEFORE handing control back
      resolve(body);
    };
    req.on('data', (c) => {
      if (over || parts === null) return;
      size += c.length;
      // ⚠️ Past the bound we stop KEEPING, we do not stop listening: draining
      //    the stream is what lets the socket close normally. And the buffers
      //    already held are released at once, instead of waiting for `end`.
      if (size > MAX_BODY_BYTES) { over = true; parts = []; return; }
      parts.push(c);
    });
    req.on('end', () => settle(over ? null : undefined));
    // ⚠️ FAIL-OPEN like every path of this framework: a broken socket yields
    //    "no payload", never a thrown error that would take the daemon down.
    req.on('error', () => settle(null));
    // ⚠️ `close` ALWAYS fires, on every outcome, and it fires LAST. It is the
    //    guarantee that no request can leave a pending promise behind — the
    //    other two handlers are the normal paths, this one is the floor.
    req.on('close', () => settle(null));
  });
}

/**
 * The frame coordinates travel in the URL here, where the spawn lane reads
 * `--frame k --frames N` from argv. SAME two numbers, SAME meaning, and the
 * SAME pure parser decides — `parseFrameArgs` is fed a synthetic argv rather
 * than reimplemented, because its rules (absent flag ⇒ 1, out-of-bounds index
 * ⇒ single frame, non-integer ⇒ 1) were each written against a real bug found
 * by mutation. A second parser would have to rediscover all of them.
 * @param {string} url
 * @param {(argv: string[]) => {frame: number, nbFrames: number}} parse
 * @returns {{frame: number, nbFrames: number}}
 */
function frameFromUrl(url, parse) {
  const q = String(url || '').split('?')[1] || '';
  const params = new URLSearchParams(q);
  const argv = [];
  if (params.has('frame')) argv.push('--frame', String(params.get('frame')));
  if (params.has('frames')) argv.push('--frames', String(params.get('frames')));
  return parse(argv);
}

/**
 * ⚠️ The injected collaborators, TYPED — not a loose bag. `tsc` refuses property
 *    access on a bare `object`, and it is right to: in this repo a JSDoc block is
 *    a VERIFIED CONTRACT, so an untyped seam is a seam nobody checks. Naming the
 *    three also states what this shell is allowed to reach for — the engine, the
 *    dialect, the frame parser, and nothing else.
 * @typedef {object} HttpDeps
 * @property {typeof run} runFn the shared orchestration core
 * @property {typeof output} outputFn the harness dialect, borrowed from the spawn lane
 * @property {(argv: string[]) => {frame: number, nbFrames: number}} parseFrames
 */

/**
 * Handles ONE hook invocation. Everything after the body read is SYNCHRONOUS,
 * and that is load-bearing, not incidental.
 *
 * 🛑 WHY IT MUST STAY SYNCHRONOUS. `lock.js` is a BLOCKING cross-process lock
 *    (busy-wait on mkdirSync). Its own header states there is no deadlock
 *    "between DIFFERENT processes … never nested" — an assumption that held
 *    because every caller was a short-lived process. Here N frames land in ONE
 *    process: if the core ever became async, request A could hold the lock
 *    while the event loop hands control to request B, which would spin on that
 *    same lock for the full timeout WITHOUT ever letting A release it. That is
 *    a self-deadlock, and it would look like a slow daemon, not like a bug.
 *    ⇒ As long as the core is synchronous, requests are served strictly one at
 *    a time and the daemon IS the serialization point — which is exactly the
 *    single arbiter the architecture wants. NEVER make this path async.
 *
 * ⚠️ The cross-process lock STAYS REQUIRED even so: Codex keeps spawning real
 *    processes against the same state files. "One daemon, therefore no lock" is
 *    the trap here.
 *
 * @param {string} body raw request body
 * @param {string} url request URL, carrying the frame coordinates
 * @param {HttpDeps} deps injected for testing — the real ones are the defaults
 * @returns {object} the JSON to send back
 */
function handle(body, url, deps) {
  const { runFn, outputFn, parseFrames } = deps;
  let data;
  try {
    data = JSON.parse(body);
  } catch {
    // ⚠️ Unparseable payload = the harness said something we do not understand.
    //    FAIL-OPEN: say nothing, never refuse the agent's action.
    return NO_OUTPUT;
  }
  if (!data || typeof data !== 'object') return NO_OUTPUT;

  let answer = NO_OUTPUT;
  // ⚠️ `run` EMITS through a callback and RETURNS when it has nothing to say —
  //    the spawn lane's callback prints and exits, ours just captures. That is
  //    the whole of the port: the lifecycle belongs to the shell, and this
  //    shell's lifecycle is "answer the request and stay alive".
  const capture = (decision, fullDoc, systemMessage) => {
    answer = outputFn(decision, fullDoc, systemMessage);
  };
  const frames = frameFromUrl(url, parseFrames);
  try {
    runFn(data, capture, {
      frame: frames.frame,
      nbFrames: frames.nbFrames,
      invocationId: typeof data.tool_use_id === 'string' ? data.tool_use_id : '',
    });
  } catch {
    // ⚠️ FAIL-OPEN, and it matters MORE here than on the spawn lane: there, a
    //    crash killed one short-lived process and the next call started clean.
    //    Here it would take down the service for every agent at once.
    return NO_OUTPUT;
  }
  return answer;
}

/**
 * Builds the server WITHOUT listening — so a test can drive it on an ephemeral
 * port and the process lifecycle stays in `main`.
 * @param {Partial<HttpDeps>} [deps]
 * @returns {import('http').Server}
 */
function createServer(deps = {}) {
  const wired = {
    runFn: deps.runFn || run,
    outputFn: deps.outputFn || output,
    parseFrames: deps.parseFrames || require('../lib-pure').parseFrameArgs,
  };
  const server = http.createServer((req, res) => {
    readBody(req).then((body) => {
      const answer = body === null ? NO_OUTPUT : handle(body, req.url, wired);
      const payload = JSON.stringify(answer);
      // ⚠️ Answering a socket the client already closed is pointless work, and
      //    on some runtimes an error. 🔴 MEASURED on Node 22.15.1: it does NOT
      //    throw there — the earlier claim that an abort could kill the daemon
      //    was a deduction, and the measurement refuted it. Kept because the
      //    cheap check makes the outcome the same on every version, never
      //    because a crash was observed.
      if (res.writableEnded || res.destroyed) return;
      res.writeHead(200, {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
      });
      res.end(payload);
    }).catch(() => {
      // ⚠️ THE FLOOR, and it must stay empty. Whatever went wrong on ONE
      //    request, the service keeps serving the others. A daemon that dies on
      //    an edge case is strictly worse than the spawn lane it replaces,
      //    where a crash cost exactly one short-lived process.
      try { res.destroy(); } catch { /* already gone, which is the desired end state */ }
    });
  });
  // ⚠️ A `server` without an `error` listener turns EVERY socket-level error
  //    into an uncaught exception. 🛑 EADDRINUSE is the ONE case we let kill us,
  //    deliberately: it means a second instance is starting, the kernel has
  //    already refused the port, and the OS is the authority that must prevent
  //    duplicates — not a PID file, not a liveness probe, not us. Every OTHER
  //    error is survivable and must not take the service down.
  server.on('error', (err) => {
    // ⚠️ `code` lives on `ErrnoException`, not on `Error` — `tsc` is right to
    //    ask, and a JSDoc that hid it would be a lying contract.
    if (/** @type {NodeJS.ErrnoException} */ (err).code === 'EADDRINUSE') throw err;
  });
  return server;
}

// ⚠️ EXIT CODE OF A STALE-CODE RESTART — non-zero ON PURPOSE, and the reason is
//    portability, not style. A supervisor only restarts on a FAILURE by default
//    (`Restart=on-failure`, launchd `KeepAlive`, Task Scheduler
//    `RestartOnFailure`); an exit 0 reads as "the job is done" and Windows would
//    simply never bring it back. Refusing to serve stale code IS an abnormal
//    termination, so we say so in the only vocabulary all three OSes share.
// 🔴 **90, AND NOT 75 — THE FIRST CHOICE WAS A TRAP, MEASURED 2026-08-20.**
//    75 is `EX_TEMPFAIL`, and systemd gives that number a NAMED ALIAS. Worse,
//    systemd's OWN manual carries, as Example 1: *"Exit status 75 (TEMPFAIL),
//    250, and the termination signal SIGKILL are considered clean service
//    terminations."* Anyone copying that example into the unit — which is
//    exactly what copying a manual's example means — would silently turn our
//    stale-code restart into "job done": daemon dead, unit GREEN.
// 🛑 The fix is NOT a warning telling people never to write `SuccessExitStatus`.
//    Prose is not a rule. 90 sits OUTSIDE every alias range systemd defines and
//    outside that example, so the copy-paste cannot reach it. The error is
//    impossible by construction instead of discouraged.
// ⚠️ Stay under 125: from there the shells assign their own meanings.
const EXIT_STALE_CODE = 90;

/**
 * 🛑 THE DEFECT A DAEMON HAS AND A SPAWNED HOOK CANNOT HAVE — read this before
 *    touching anything here. The `command` lane re-reads the code on EVERY call,
 *    so it is ALWAYS fresh. A long-lived process holds its modules in memory:
 *    after a `git pull`, an edited doc engine or a fixed gate keeps serving the
 *    OLD logic, while looking perfectly healthy. That is precisely the failure
 *    this project fears most — not a crash, a GREEN THAT LIES.
 *
 * ✅ ZERO INFERENCE, and no polling: the kernel already knows when a file
 *    changes (inotify · ReadDirectoryChangesW · FSEvents) and `fs.watch` is the
 *    interface to it. We do not compare timestamps, we do not hash, we do not
 *    ask "is my code still current?" — we are TOLD. On the first event we exit
 *    and the OS starts a fresh process. Nothing is killed, nothing is guessed.
 *
 * ⚠️ THE WATCHED SET IS DERIVED, NEVER A LIST. `require.cache` holds exactly the
 *    modules this process actually loaded — a file added tomorrow is watched by
 *    itself, and a hand-written glob would rot. `node_modules` is excluded: a
 *    dependency cannot change without an install, which is a deliberate act that
 *    restarts the service anyway.
 *
 * ⚠️ WE WATCH DIRECTORIES, NOT FILES, AND THAT IS LOAD-BEARING. Git does not
 *    write files in place: it writes a temporary file and RENAMES it over the
 *    target. A watch on the file follows the old inode into the void and goes
 *    silently deaf — the worst possible outcome, since a deaf watcher is
 *    indistinguishable from a quiet one. A directory watch sees the rename.
 *
 * @param {(dir: string, cb: () => void) => {close: () => void}} watch injected in tests
 * @param {Record<string, unknown>} cache module cache to derive the set from
 * @param {() => void} onChange what to do when the code moved
 * @returns {{close: () => void}[]} the live watchers
 */
function watchOwnCode(watch, cache, onChange) {
  const dirs = new Set();
  for (const file of Object.keys(cache)) {
    if (file.includes('node_modules')) continue;
    const cut = Math.max(file.lastIndexOf('/'), file.lastIndexOf('\\'));
    if (cut > 0) dirs.add(file.slice(0, cut));
  }
  const watchers = [];
  for (const dir of dirs) {
    // ⚠️ FAIL-OPEN, per directory: a platform that refuses one watch must not
    //    cost us the others. Losing this guard degrades us to the stale-code
    //    risk — bad — but crashing the daemon would be worse.
    try { watchers.push(watch(dir, onChange)); } catch { /* one blind directory, not a dead daemon */ }
  }
  return watchers;
}

module.exports = {
  createServer, handle, frameFromUrl, watchOwnCode,
  HOST, DEFAULT_PORT, NO_OUTPUT, MAX_BODY_BYTES, EXIT_STALE_CODE,
};

// ⚠️ The service's LIFECYCLE belongs to the OS — a systemd user unit, a Windows
//    Service, a launchd job. This block is the entry point those units call; it
//    is NOT a supervisor. It does not restart itself, it does not check whether
//    another instance is alive, it does not write a PID file. If the port is
//    taken, the kernel says so with EADDRINUSE, immediately and exactly — we
//    let that error surface and die, because a second instance would be the
//    real defect and the OS is the authority that prevents it.
if (require.main === module) {
  const port = Number(process.env.CTXROUTE_HTTP_PORT) || DEFAULT_PORT;
  createServer().listen(port, HOST);
  // ⚠️ Armed AFTER `listen`, so the watched set covers everything the server
  //    itself pulled in. Watching before would miss the modules loaded lazily
  //    on the first require — the exact half most likely to be edited.
  const fs = require('fs');
  watchOwnCode(
    (dir, cb) => fs.watch(dir, { persistent: false }, cb),
    require.cache,
    () => process.exit(EXIT_STALE_CODE)
  );
}
