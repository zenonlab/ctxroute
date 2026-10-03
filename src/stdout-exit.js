#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// stdout-exit.js — A HOOK THAT SPEAKS LEAVES ONLY ONCE IT HAS BEEN HEARD
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 REASON FOR EXISTING — MEASURED 2026-10-01 on Linux (node 22.15.1, Ubuntu):
//    `console.log(500 KB); process.exit(0)` piped into a reader delivered
//    EXACTLY 65,536 bytes, 3 runs out of 3 — the pipe buffer, then the cut.
//    The harness got a JSON document cut in half, unparseable, and the whole
//    injection was lost IN SILENCE: no error, no red, the hook exited 0.
//    The same line on Windows delivered every byte (8 out of 8) — which is
//    why it lived unseen on the maintainer's machine while it hit macOS and
//    Linux, where a Codex injection (no output cap) routinely exceeds 64 KB.
//    Official doc (nodejs.org/api/process.html, v26.10.0, read 2026-10-01):
//    `process.exit()` "will force the process to exit as quickly as possible
//    even if there are still asynchronous operations pending … including I/O
//    operations to process.stdout", and pipe writes are asynchronous there.
//
// 🛑 THE CURE IS THE WRITE'S OWN CALLBACK, NEVER A DELAY: the kernel KNOWS
//    when the bytes have been handed over and libuv tells us — a `setTimeout`
//    sized to "long enough" would be guessing at a fact we can observe.
// ⚠️ THE DEADLINE STILL BOUNDS A HOOK: a reader that never drains the pipe
//    leaves the callback pending, and `deadline.js` kills the process exactly
//    as it kills a hook whose stdin never closes. A CLI of `tools/` has no
//    deadline and waits like any CLI writing into a pipe nobody reads.
// ⚠️ FAIL-OPEN: a write error (EPIPE: the reader went away) still exits with
//    the requested code — through the callback AND the stream's `error` event.
//
// 🔴 STDERR TOO, AND EVERY EXIT CODE — measured the same day, same Linux:
//    `console.log(500 KB); console.error(500 KB); process.exit(3)` delivered
//    219-292 KB on EACH stream, 3 runs out of 3; through `exitAfterFlush(3)`,
//    500 KB on both and exit code 3, 3 out of 3. The doc names stdout and
//    stderr together ("Pipes (and sockets): synchronous on Windows, asynchronous
//    on POSIX", nodejs/node v22.x doc/api/process.md, re-read verbatim
//    2026-10-01) — so the class is EVERY entry point that writes a stream, the
//    CLIs of `tools/`, `service/` and the daemon's refusals included (systemd
//    reads them through a socket).
// 🔑 HOW THE FLUSH IS OBSERVED: a zero-length write is queued BEHIND every
//    earlier write of its stream, so its callback fires once they left.
//
// 🛑 STANDALONE, like `stdin-json.js` and `deadline.js`: depends on NOTHING in
//    this repository, so it stays copyable into any hook of any project.
// 🛑 A FILE THAT WRITES A STREAM NEVER CALLS `process.exit` ITSELF — sealed by
//    `test/stdout-exit-gate.test.js` (AST, never regex, perimeter derived).
// 🛑 `exitAfterFlush` RETURNS — unlike `process.exit`, the code after it RUNS.
//    IF you replace a `process.exit(n)` with it, you MUST end the path yourself
//    (`return exitAfterFlush(n)`, or nothing after it), otherwise the work the
//    exit used to cut short goes on, and may print or decide twice.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

let leaving = false;

/**
 * Exits with `code` once stdout AND stderr have handed every queued byte over.
 * At most one exit per process: later calls are ignored, as they were
 * unreachable when `process.exit` ended the process on the spot.
 * @param {number} [code]
 */
function exitAfterFlush(code) {
  if (leaving) return;
  leaving = true;
  const status = code === undefined ? 0 : code;
  let pending = 2;
  for (const stream of [process.stdout, process.stderr]) {
    let settled = false;
    // ⚠️ ONE settlement per stream: on a write error (EPIPE: the reader went
    //    away) both the callback and the `error` event fire, and an unhandled
    //    `error` event would crash with a stack trace instead of leaving.
    const settle = () => {
      if (settled) return;
      settled = true;
      pending -= 1;
      if (pending === 0) process.exit(status);
    };
    stream.once('error', settle);
    stream.write('', settle);
  }
}

/**
 * Prints ONE line (a trailing newline is added, like `console.log`) and exits
 * with 0 once every byte has left. At most one print per process: a second call
 * is ignored, exactly as it was unreachable when the first one exited on the spot.
 * @param {string} text
 */
function printThenExit(text) {
  if (leaving) return;
  process.stdout.write(text + '\n');
  exitAfterFlush(0);
}

/**
 * The fail-open exit of a path that may or may not have printed: exits NOW
 * when nothing is in flight, otherwise lets the pending flush exit when done.
 * 🛑 NEVER replace it with a bare `process.exit(0)` behind a print — that is
 *    the truncation this module exists to remove.
 */
function exitUnlessPrinting() {
  if (!leaving) process.exit(0);
}

module.exports = { printThenExit, exitUnlessPrinting, exitAfterFlush };
