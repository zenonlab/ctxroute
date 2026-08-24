// ═══════════════════════════════════════════════════════════════════════
// STATE-CLIENT — a spawned hook ASKS the daemon instead of writing a file.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 WHAT THIS REPLACES, AND WHY IT IS NOT A TRANSPORT DETAIL. Until now every
//    frame process answered "has this document already been injected?" by
//    reading a FILE that its fifteen siblings were writing at the same time.
//    That required a lock, an atomic publish, a lock-less fallback, bounded
//    retries — a hand-made simulation of SERIALISATION, and it produced three
//    flaky bugs in a single day. Here the question is asked to the ONE process
//    that holds the answer, over a kernel object, and the kernel does the
//    serialising it has always done.
//
// ⚠️ SAME PROTOCOL AS THE HTTP LANE, DELIBERATELY: an `http.Server` listens on a
//    named pipe or a unix socket exactly as it listens on a port, and
//    `http.request({ socketPath })` reaches it. So there is ONE server, ONE
//    request shape, and TWO transports — never a second dialect to keep in sync
//    with the first.
// 🛑 THE FRAME COORDINATES TRAVEL IN THE URL, like the spawn lane's argv. Two
//    ways of saying the same thing would drift; the daemon parses one.
//
// 🛑 FAIL-OPEN, AND ITS MEANING IS EXACT. No daemon ⇒ the kernel answers
//    IMMEDIATELY (`ENOENT` on a missing pipe, `ECONNREFUSED` on a dead socket):
//    that is a FACT from the kernel, not a timeout, not a guess about liveness.
//    We then return null and the caller stays silent — the tool runs, nothing
//    breaks. ⚠️ **AND THE REFUSAL IS NOW REPORTED TO THE CALLER (2026-08-22)**:
//    the kernel's error travels as the callback's SECOND argument, so a shell
//    that wants to SAY it was refused states an OBSERVATION instead of guessing
//    one. This is not a health probe and must never become one — we report what
//    the kernel answered US, never a verdict on another component's liveness.
// ⚠️ NO TIMER HERE. A local socket either connects or fails at once; adding a
//    delay would put back an inference where the kernel gives a verdict.
//
// 🔑 FOUR CONSUMERS, ONE TRANSPORT (2026-08-21). The PreToolUse gate is not the
//    only shell that touches the injection state: the SESSION gate shares the
//    `remainder-` queue with it, `turn-count` writes the turn counter that
//    `driftUnit: "turn"` reads, and `ctxroute-reset` erases everything on a
//    compaction. **A shared state is migrated for ALL its consumers or for
//    none.** So the request shape is generic (`request`) and `ask` is simply the
//    gate's route — a second client module would be a second dialect, and two
//    dialects of one protocol drift.
// 🛑 THE ROUTE IS THE ONLY THING THAT VARIES. Same method, same headers, same
//    single settlement, same fail-open. Whoever adds a route adds a STRING here
//    and a branch in the daemon's ONE handler — never another client.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const http = require('http');
const { endpoint, kernelAddress } = require('../kernel-endpoint');

/**
 * ONE request to the authority, whatever the route.
 *
 * @param {string} route  path + query string, e.g. `/purge`
 * @param {object} payload  the body, serialised as JSON
 * @param {{socketPath?: string}|null} options
 * @param {(answer: object|null, err: NodeJS.ErrnoException|null) => void} done
 *   called EXACTLY once. `answer === null` means "no authority reachable, or
 *   nothing intelligible came back" — never a thrown error.
 *
 * 🔑 THE SECOND ARGUMENT IS THE KERNEL'S VERDICT, VERBATIM (2026-08-22), AND IT
 *    EXISTS FOR ONE REASON: a caller could not tell "nobody is listening" from
 *    "something answered nonsense". Both arrived as `null`, so a shell that
 *    wanted to SAY it had been refused would have had to GUESS which of the two
 *    had happened — i.e. invent a cause. The error object is passed on untouched
 *    and nothing here interprets it: `ECONNREFUSED`/`ENOENT` are FACTS the
 *    kernel produced, not a liveness probe of ours.
 * ⚠️ EVERY EXISTING CALLER IGNORES IT, hence behaves byte for byte as before.
 *    Adding a parameter can only be silent; branching on it here could not.
 */
function request(route, payload, options, done) {
  const o = options || {};
  // ⚠️ Converted HERE, at the moment the kernel reads it — never earlier: on
  //    Linux the abstract form carries a NUL byte, which cannot travel in an
  //    argv, an env var or a log line.
  const socketPath = kernelAddress(o.socketPath || endpoint());
  const corps = JSON.stringify(payload);
  // ⚠️ ONE settlement, whatever happens. A callback called twice would make a
  //    shell emit twice — the duplicate delivery this whole refactor removes.
  let finished = false;
  const finish = (r, err) => { if (!finished) { finished = true; done(r, err || null); } };

  const req = http.request({
    socketPath,
    method: 'POST',
    path: route,
    headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(corps) },
  }, (res) => {
    let text = '';
    res.setEncoding('utf8');
    res.on('data', (d) => { text += d; });
    res.on('end', () => {
      try { finish(text ? JSON.parse(text) : null); } catch { finish(null); }
    });
    // ⚠️ A response cut mid-flight is NOT an empty answer: settling with null
    //    keeps the caller silent, which is the fail-open, but it must settle.
    res.on('error', (err) => finish(null, err));
  });

  req.on('error', (err) => finish(null, err));
  req.end(corps);
}

/**
 * THE GATE'S ROUTE — the PreToolUse question, unchanged.
 * 🛑 THE FRAME COORDINATES TRAVEL IN THE URL, like the spawn lane's argv. Two
 *    ways of saying the same thing would drift; the daemon parses one.
 * @param {object} payload  the harness payload, verbatim
 * @param {{frame?: number, frames?: number, socketPath?: string}|null} options
 * @param {(answer: object|null) => void} done
 */
function ask(payload, options, done) {
  const o = options || {};
  request(`/pretool?frame=${o.frame || 1}&frames=${o.frames || 1}`, payload, o, done);
}

module.exports = { ask, request };
