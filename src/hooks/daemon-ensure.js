#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// daemon-ensure.js — A SESSION ASKS THE OS SUPERVISOR TO HAVE THE DAEMON UP.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 WHY IT EXISTS (2026-09-29): with `http.lifecycle` on `on-demand` the
//    daemon leaves once nobody asks for a while, and on Windows nothing holds
//    its socket in between. Something must bring it back when a harness starts
//    working again — this hook, wired on SessionStart AND UserPromptSubmit, so
//    a session opened, resumed after a pause, or simply prompted again always
//    finds a daemon before its first tool call.
// 🔴 AND IT CLOSES A MEASURED OUTAGE IN `login` MODE TOO: on 2026-09-29 a
//    security suite's "do not disturb" mode had paused every scheduled task at
//    logon, the logon trigger met a disabled task, and the daemon never came up
//    for a whole session while every diagnostic stayed green. Asking at every
//    prompt turns "never came up" into "came up at the next prompt".
//
// 🛑 IT NEVER STARTS THE DAEMON ITSELF. It ASKS THE SUPERVISOR (Windows: Task
//    Scheduler runs the task — a no-op when it already runs, since the task is
//    `MultipleInstancesPolicy IgnoreNew`). A hook that spawned `node` would be
//    how orphans are born: the harness may kill its hook's process tree, and
//    nothing would supervise the exit-90 restart (`http-lane.md`).
// 🛑 NO "IS IT ALREADY RUNNING?" PROBE: the supervisor decides, the kernel
//    refuses a duplicate. On Linux and macOS there is nothing to ask at all —
//    the unit holds the socket and the first connection starts the daemon —
//    so `lifecycle-pure.ensureCommand` answers `null` and this hook does nothing.
//
// ⚠️ NEVER PLAIN STDOUT: on SessionStart and UserPromptSubmit, plain stdout
//    BECOMES CONTEXT. The child's output is captured and dropped. The ONE thing
//    this hook may print is a `{systemMessage}` JSON line (official Claude Code
//    contract: stdout starting with `{` is parsed as JSON, `systemMessage` is
//    shown to the USER and injects nothing) — and only when the request FAILED,
//    the scheduler's own XML says the task is DISABLED, AND the kernel REFUSES a
//    connection to the daemon (`ensureNotice`). A task disabled under a daemon
//    that still answers is not an outage, and saying otherwise is a lie told
//    several times a day (measured 2026-09-30). A notice never changes a
//    decision: no `decision`, no `hookSpecificOutput`.
// ⚠️ FAIL-OPEN, exit 0 ALWAYS: a helper may never cost the user their prompt.
// ⚠️ STDIN IS NOT READ, ON PURPOSE: the payload carries nothing this hook
//    needs, and waiting for an end-of-file the harness does not always send
//    (anthropics/claude-code#68626) would put the deadline — a 30 s bound — in
//    front of the user's prompt. A healthy prompt costs ONE synchronous request
//    (~60 ms measured 2026-09-29); only the failure path asks more.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const { spawnSync } = require('node:child_process');
const net = require('node:net');
const lifecycle = require('../lifecycle-pure');

/**
 * Ask, once; on a failed request, ask the scheduler and the kernel WHY — never guess.
 * @param {string} platform
 * @param {(file: string, args: string[], options: any) => {status?: number|null, stdout?: unknown}} run
 *   the spawner — injected so a cell can prove WHAT is asked and what is said.
 * @param {() => Promise<boolean|null>} refused asks the KERNEL whether a
 *   connection to the daemon is refused — injected for the same reason.
 * @returns {Promise<{asked: {file: string, args: string[]}|null, notice: string|null}>}
 */
async function ensure(platform, run, refused) {
  const ask = lifecycle.ensureCommand(platform);
  if (ask === null) return { asked: null, notice: null };
  let status = null;
  try {
    // ⚠️ `timeout` is a BOUND, not a wait: it never slows a healthy call, it
    //    only refuses to let a wedged scheduler hold the user's prompt.
    status = run(ask.file, ask.args, { stdio: 'ignore', windowsHide: true, timeout: 5000 }).status;
  } catch { /* status stays null: a request that could not even run is a failed request */ }
  if (status === 0) return { asked: ask, notice: null };
  // 🔑 THE FAILURE PATH ONLY: a healthy prompt pays one request, never three.
  let taskXml = null;
  const query = lifecycle.supervisorQuery(platform);
  try {
    const answer = query ? run(query.file, query.args, { encoding: 'utf8', windowsHide: true, timeout: 5000 }) : null;
    taskXml = answer && answer.status === 0 && typeof answer.stdout === 'string' ? answer.stdout : null;
  } catch { /* stays null ⇒ `unmeasured` ⇒ silence */ }
  const supervisor = lifecycle.supervisorVerdict(platform, taskXml);
  if (supervisor.verdict !== 'disarmed') return { asked: ask, notice: null };
  let daemonRefused = null;
  try { daemonRefused = await refused(); } catch { /* stays null ⇒ silence */ }
  return { asked: ask, notice: lifecycle.ensureNotice(status, supervisor, daemonRefused) };
}

/** The bound on the kernel probe — see `kernelRefuses` for why it is 5 s. */
const PROBE_BOUND_MS = 5000;

/**
 * THE KERNEL'S ANSWER, never an inference: a refused connection is `true`, an
 * accepted one `false`, anything else `null` (silence). One declared address is
 * enough — the daemon binds all of them or none (`lane=port` dies whole).
 * ⚠️ `timeout` bounds a wedged connect so the prompt is never held; it decides
 *    nothing — a timeout answers `null`, never "dead".
 * 🔴 IT IS 5 s, AND 2 s WAS A MEASURED BUG (2026-09-30): on the Windows
 *    dedicated adapter the kernel RETRANSMITS the SYN before refusing (that is
 *    why the adapter exists — `adapter-windows.md`), so a refusal arrived after
 *    2,042 ms and a 2,000 ms bound turned every real outage into silence. A live
 *    daemon answers at once, so the bound is only ever paid on the failure path.
 *    🛑 SI you lower it, you MUST re-measure a refused connect on the declared
 *    address first — a bound shorter than the kernel's refusal hides the outage.
 * @param {{host: string, port: number}} endpoint
 * @returns {Promise<boolean|null>}
 */
function kernelRefuses(endpoint) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: endpoint.host, port: endpoint.port, timeout: PROBE_BOUND_MS });
    socket.once('connect', () => { socket.destroy(); resolve(false); });
    socket.once('timeout', () => { socket.destroy(); resolve(null); });
    socket.once('error', (err) => {
      resolve(/** @type {NodeJS.ErrnoException} */ (err).code === 'ECONNREFUSED' ? true : null);
    });
  });
}

module.exports = { ensure, kernelRefuses, PROBE_BOUND_MS };

if (require.main === module) {
  // 🛑 ARMED HERE, NEVER AT THE TOP: this module is also `require`d by its
  //    suite, and a deadline armed on load would kill the test runner.
  require('../deadline').arm();
  const { printThenExit, exitUnlessPrinting } = require('../stdout-exit');
  const endpoint = () => require('../paths').httpEndpoint();
  ensure(process.platform, spawnSync, () => kernelRefuses(endpoint()))
    // 🛑 Through `stdout-exit`, like every hook that speaks: a write followed by
    //    a bare `process.exit` is cut on a POSIX pipe (2026-10-01).
    .then(({ notice }) => {
      if (notice) printThenExit(JSON.stringify({ systemMessage: notice }));
    })
    .catch(() => { /* fail-open */ })
    .finally(() => exitUnlessPrinting());
}
