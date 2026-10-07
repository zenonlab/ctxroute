// ═══════════════════════════════════════════════════════════════════════
// judge-runner.js — RUNS the adopter's judges. I/O ONLY, decides nothing.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 A JUDGE IS ANYTHING THE ADOPTER CAN LAUNCH, GIVEN AS AN ARGUMENT VECTOR
//    (`[program, ...args]`, NO shell — the system shell differs per OS): a script, a suite of judges, a
//    call to a model. ctxroute knows its CONTRACT (JSON on stdin, an exit code,
//    a text on stdout) and nothing of what it does. What a run means is decided
//    by `wrap-up-pure.verdictOf`; this file only starts, feeds, bounds and reads.
//
// 🛑 THE BOUND KILLS THE WHOLE TREE, NEVER THE JUDGE ALONE. A judge may start
//    processes of its own (a suite of judges, a model call); killing the root
//    alone leaves them running, unwatched, after the hook has returned. ⇒ POSIX: the judge leads its own process GROUP (`detached`) and
//    the group is signalled · Windows: `taskkill /T` walks the tree while its
//    root is still alive. Proven on the three systems by `judge-runner.test.js`.
//
// ⚠️ THE TIMER IS DECLARED (`temporal-budget.json`, motive `undecidable`): a
//    judge that has not answered may be slow or may never answer, and nothing
//    local can tell which — the halting problem. Every other end of a run is a
//    FACT the kernel delivers (`exit`, `error`), never a delay.
//
// ⚠️ OUTPUT IS CAPPED PER STREAM (`MAX_STREAM_BYTES`), the surplus counted and
//    said: a judge printing without end must not exhaust the hook's memory, and
//    a cut that is not announced reads as a complete report.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const { spawn, spawnSync } = require('child_process');

/** Per-stream ceiling of what is kept from a judge, in bytes. */
const MAX_STREAM_BYTES = 1024 * 1024;

/**
 * Stops a running judge and every process it started.
 * @param {import('child_process').ChildProcess} child
 */
function killTree(child) {
  if (child.pid === undefined) return;
  try {
    if (process.platform === 'win32') {
      // Dash switches: `taskkill` accepts them (measured 2026-10-04), and a `/x`
      // literal reads as a route to the rendezvous gate.
      spawnSync('taskkill', ['-pid', String(child.pid), '-t', '-f'], { windowsHide: true, stdio: 'ignore' });
    } else {
      process.kill(-child.pid, 'SIGKILL');
    }
  } catch {
    /* already gone: the kernel answered for us */
  }
}

/** Collects a stream up to the ceiling, counting what was dropped. */
function collector() {
  const chunks = [];
  let kept = 0;
  let dropped = 0;
  return {
    push(buf) {
      const room = MAX_STREAM_BYTES - kept;
      if (room <= 0) { dropped += buf.length; return; }
      const part = buf.length > room ? buf.subarray(0, room) : buf;
      chunks.push(part);
      kept += part.length;
      dropped += buf.length - part.length;
    },
    text() {
      const t = Buffer.concat(chunks).toString('utf8');
      return dropped > 0 ? `${t}\n[… ${dropped} more bytes not kept]` : t;
    },
  };
}

/**
 * Runs ONE judge. Never rejects.
 *
 * @param {{name: string, command: string[]}} judge
 * @param {object} input       the versioned JSON handed on stdin
 * @param {{cwd: string, timeoutMs: number}} opts
 * @returns {Promise<{name: string, exitCode: (number|null), stdout: string, stderr: string, timedOut: boolean, spawnError: (string|null)}>}
 */
function runJudge(judge, input, opts) {
  return new Promise((resolve) => {
    const out = collector();
    const err = collector();
    let timedOut = false;
    let settled = false;
    let child;
    const finish = (exitCode, spawnError) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ name: judge.name, exitCode, stdout: out.text(), stderr: err.text(), timedOut, spawnError });
    };
    try {
      child = spawn(judge.command[0], judge.command.slice(1), {
        cwd: opts.cwd,
        windowsHide: true,
        detached: process.platform !== 'win32',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (e) {
      finish(null, String((e && e.message) || e));
      return;
    }
    // ⚠️ The ONE temporal call of this file, declared `undecidable` (see header).
    // 🛑 THE BOUND ANSWERS AT ONCE, IT NEVER WAITS FOR `close`: a process the judge
    //    left behind (detached, or orphaned when its parent already exited) can keep
    //    the pipes open for ever, and `close` would then never come — the hook would
    //    hang until its own deadline. The tree is killed, and the verdict is given.
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
      finish(null, null);
    }, opts.timeoutMs);
    child.stdout.on('data', (b) => out.push(b));
    child.stderr.on('data', (b) => err.push(b));
    child.on('error', (e) => finish(null, String((e && e.message) || e)));
    child.on('close', (code) => finish(timedOut ? null : code, null));
    // A judge that does not read its stdin closes the pipe: that is its right.
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify(input));
  });
}

/**
 * Runs every judge IN PARALLEL: the end-of-turn waits for the slowest one,
 * never for their sum.
 *
 * @param {{name: string, command: string[]}[]} judges
 * @param {object} input
 * @param {{cwd: string, timeoutMs: number}} opts
 */
function runJudges(judges, input, opts) {
  return Promise.all(judges.map((j) => runJudge(j, input, opts)));
}

module.exports = { runJudge, runJudges, MAX_STREAM_BYTES };
