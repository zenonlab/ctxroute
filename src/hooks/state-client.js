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
//    breaks. ⚠️ The agent is NOT told it acted without its context; making that
//    absence observable is a separate, open work item, and it must never be
//    "solved" with a health probe.
// ⚠️ NO TIMER HERE. A local socket either connects or fails at once; adding a
//    delay would put back an inference where the kernel gives a verdict.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const http = require('http');
const { endpoint, kernelAddress } = require('../kernel-endpoint');

/**
 * @param {object} payload  the harness payload, verbatim
 * @param {{frame?: number, frames?: number, socketPath?: string}|null} options
 * @param {(answer: object|null) => void} done
 */
function ask(payload, options, done) {
  const o = options || {};
  // ⚠️ Converted HERE, at the moment the kernel reads it — never earlier: on
  //    Linux the abstract form carries a NUL byte, which cannot travel in an
  //    argv, an env var or a log line.
  const socketPath = kernelAddress(o.socketPath || endpoint());
  const corps = JSON.stringify(payload);
  // ⚠️ ONE settlement, whatever happens. A callback called twice would make a
  //    shell emit twice — the duplicate delivery this whole refactor removes.
  let fini = false;
  const finir = (r) => { if (!fini) { fini = true; done(r); } };

  const req = http.request({
    socketPath,
    method: 'POST',
    path: `/pretool?frame=${o.frame || 1}&frames=${o.frames || 1}`,
    headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(corps) },
  }, (res) => {
    let texte = '';
    res.setEncoding('utf8');
    res.on('data', (d) => { texte += d; });
    res.on('end', () => {
      try { finir(texte ? JSON.parse(texte) : null); } catch { finir(null); }
    });
    // ⚠️ A response cut mid-flight is NOT an empty answer: settling with null
    //    keeps the caller silent, which is the fail-open, but it must settle.
    res.on('error', () => finir(null));
  });

  req.on('error', () => finir(null));
  req.end(corps);
}

module.exports = { ask };
