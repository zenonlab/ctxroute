'use strict';
/**
 * THE ONE place a test suite asks for a listening port for a daemon it forks.
 *
 * 🔴 WHY THIS EXISTS — MEASURED 2026-09-23. Five suites each carried their own copy
 *    of "bind port 0, read it, close it, hand it to the child". The kernel hands out
 *    port 0 from its EPHEMERAL range, and that range is ALSO where every outgoing
 *    connection of every parallel suite takes its local port. Between the probe's
 *    `close` and the child's `listen`, a neighbour's `connect` can take the very
 *    port: the daemon records `bind-refused lane=port` and exits 1. Seen in the full
 *    run on `stale-code-guard ⑥bis` (exit 1 where 90 was asserted), green alone 8/8.
 * ✅ THE CLASS IS CLOSED BY WHERE THE PORT COMES FROM, NOT BY RETRYING: ports are
 *    taken from a band BELOW every default ephemeral range (Windows and macOS
 *    49152-65535, Linux 32768-60999 — vendor defaults), so no outgoing connection
 *    can ever be assigned one. Each allocation is still PROBED by a real bind, so a
 *    port some other program holds is skipped, never guessed free.
 * ⚠️ RESIDUAL, DECLARED: two concurrent test processes starting on the same port of
 *    the band. The start is spread by pid and thread, and a process advances past
 *    every port it hands out, so this needs the same port probed in the same
 *    instant by two workers — never observed, and no longer the ephemeral pool.
 * 🛑 NEVER go back to `listen(0)` in a suite that forks a daemon — `free-port-gate`
 *    refuses a local copy.
 */
const net = require('net');
const { threadId } = require('worker_threads');

const BAND_START = 20000;
const BAND_SIZE = 12000; // 20000-31999: below 32768, the lowest default ephemeral floor

let cursor = (process.pid * 31 + threadId * 997) % BAND_SIZE;

/** Can `port` be bound on `host` right now? Asked of the kernel with a real bind. */
function bindable(port, host) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.listen(port, host, () => probe.close(() => resolve(true)));
  });
}

/** Are the `span` ports counted up from `base` ALL bindable? Stops at the first refusal. */
async function spanBindable(base, span, host) {
  for (let k = 0; k < span; k += 1) {
    if (!(await bindable(base + k, host))) return false;
  }
  return true;
}

/**
 * WHERE THE NEXT BLOCK OF `span` PORTS STARTS, and where the cursor goes after it.
 * 🔴 MEASURED ON THE LINUX RUNNER, CLOSED 2026-10-01: the base used to be
 *    `cursor % (BAND_SIZE - span)` — a modulus that CHANGES WITH THE SPAN, so two
 *    successive requests of different sizes mapped the same cursor to DIFFERENT
 *    places and could land on ports already handed out (`{base:20003,span:4}` then
 *    `{base:20006,span:3}`). It depended on the pid, hence "flaky".
 * ✅ The offset is `cursor % BAND_SIZE`, the SAME for every span; a block that
 *    would run past the end of the band wraps to its start instead of overlapping.
 *    Within one process no port is handed out twice until the whole band wrapped.
 * @param {number} cur @param {number} span
 * @returns {{ base: number, next: number }}
 */
function nextBlock(cur, span) {
  const offset = cur % BAND_SIZE;
  const start = offset + span > BAND_SIZE ? cur + (BAND_SIZE - offset) : cur;
  return { base: BAND_START + (start % BAND_SIZE), next: start + span };
}

/**
 * The first port of `span` CONSECUTIVE ports (a daemon with N listeners counts up
 * from its base) that are all bindable on `host`.
 * @param {{ host?: string, span?: number }} [options]
 * @returns {Promise<number>}
 */
async function freePort(options) {
  const host = (options && options.host) || '127.0.0.1';
  const span = (options && options.span) || 1;
  for (let tried = 0; tried < BAND_SIZE; tried += span) {
    const block = nextBlock(cursor, span);
    cursor = block.next;
    if (await spanBindable(block.base, span, host)) return block.base;
  }
  throw new Error(`no ${span} consecutive bindable port(s) in ${BAND_START}-${BAND_START + BAND_SIZE - 1} on ${host}`);
}

module.exports = { freePort, nextBlock, BAND_START, BAND_SIZE };
