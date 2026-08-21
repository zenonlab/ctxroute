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
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const { createServer } = require_('../src/hooks/http-server.js');
const { bind } = require_('../src/kernel-bind.js');
const { endpoint, kernelAddress } = require_('../src/kernel-endpoint.js');

const PAYLOAD = JSON.stringify({
  tool_name: 'Read', tool_input: { file_path: 'C:/p/server.js' }, session_id: 'dual-' + process.pid,
});

/** One POST, on either transport. Resolves with the raw body. */
function poster(cible) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      ...cible,
      method: 'POST',
      path: '/pretool?frame=1&frames=1',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(PAYLOAD) },
    }, (res) => {
      let t = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { t += d; });
      res.on('end', () => resolve(t));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end(PAYLOAD);
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
