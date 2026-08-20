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
    const parts = [];
    let over = false;
    req.on('data', (c) => {
      if (over) return;
      size += c.length;
      if (size > MAX_BODY_BYTES) { over = true; return; }
      parts.push(c);
    });
    req.on('end', () => resolve(over ? null : Buffer.concat(parts).toString('utf8')));
    // ⚠️ FAIL-OPEN like every path of this framework: a broken socket yields
    //    "no payload", never a thrown error that would take the daemon down.
    req.on('error', () => resolve(null));
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
 * @param {object} deps injected for testing — the real ones are the defaults
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
 * @param {object} [deps]
 * @returns {import('http').Server}
 */
function createServer(deps = {}) {
  const wired = {
    runFn: deps.runFn || run,
    outputFn: deps.outputFn || output,
    parseFrames: deps.parseFrames || require('../lib-pure').parseFrameArgs,
  };
  return http.createServer((req, res) => {
    readBody(req).then((body) => {
      const answer = body === null ? NO_OUTPUT : handle(body, req.url, wired);
      const payload = JSON.stringify(answer);
      res.writeHead(200, {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
      });
      res.end(payload);
    });
  });
}

module.exports = { createServer, handle, frameFromUrl, HOST, DEFAULT_PORT, NO_OUTPUT, MAX_BODY_BYTES };

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
}
