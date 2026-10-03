import { test } from 'vitest';
import assert from 'node:assert/strict';
import http2 from 'node:http2';
import { createRequire } from 'node:module';
// 🛑 IMPORT ESM STATIQUE OBLIGATOIRE, JAMAIS `createRequire` : le graphe de modules de
//    Stryker ne voit PAS un require dynamique, donc le module serait MUTE sans qu'aucune
//    suite ne le couvre — ses mutants seraient mesures par RIEN (`mutation-workflow-gate`).
import preface from '../src/http2-preface-pure.js';

const require = createRequire(import.meta.url);
const server = require('../src/hooks/http-server.js');

// ═══════════════════════════════════════════════════════════════════════
// A DECLARED PROTOCOL CAN BE WRONG — AND THE FAILURE MUST NAME ITS REMEDY
// ═══════════════════════════════════════════════════════════════════════
// A cleartext port serves HTTP/1.1 OR HTTP/2, never both (MEASURED 2026-09-18:
// without TLS there is no ALPN, so nothing is negotiated). The protocol is
// therefore declared, and a wrong declaration used to surface as a parser's
// `HPE_INVALID_CONSTANT` — a complaint that says nothing about what to change,
// on a daemon refusing every request from one harness.

test('① the exact RFC 9113 preface is recognised', () => {
  assert.equal(preface.looksLikeHttp2(preface.HTTP2_CLIENT_PREFACE), true);
  assert.equal(preface.looksLikeHttp2(Buffer.from(preface.HTTP2_CLIENT_PREFACE)), true);
});

test('② a SHORT READ is still an HTTP/2 client — packet boundaries are not evidence', () => {
  // TCP may hand the server fewer than 24 octets first. Answering "no" there
  // would make the diagnosis depend on luck.
  for (const cut of [1, 4, 14, 23]) {
    assert.equal(preface.looksLikeHttp2(preface.HTTP2_CLIENT_PREFACE.slice(0, cut)), true,
      `a ${cut}-octet prefix of the preface must still read as HTTP/2`);
  }
});

test('③ ordinary HTTP/1 traffic is NOT accused', () => {
  for (const ok of [
    'POST /pretool?frame=1&frames=32 HTTP/1.1\r\nHost: x\r\n\r\n',
    'GET / HTTP/1.1\r\n\r\n',
    'PRI', // a real 3-octet read that happens to match is covered by ② on purpose
  ].slice(0, 2)) {
    assert.equal(preface.looksLikeHttp2(ok), false, `must not accuse: ${JSON.stringify(ok)}`);
  }
  assert.equal(preface.looksLikeHttp2(''), false, 'an empty buffer carries no evidence');
  assert.equal(preface.looksLikeHttp2(null), false);
  assert.equal(preface.looksLikeHttp2(undefined), false);
});

test('④ the notice names an action that EXISTS, never one that does not', () => {
  // 🔴 THE FIRST VERSION OF THIS NOTICE TOLD THE OPERATOR TO SET `http.protocol`.
  //    That key DOES NOT EXIST, and the config schema is a CLOSED vocabulary
  //    that would have REFUSED it — so the remedy was unreachable and the
  //    message was a doc contradicting the code, the one thing this repository
  //    hunts everywhere else. A notice that names an impossible fix is worse
  //    than a cryptic error: it sends someone to edit a file that will reject
  //    them. It now states what this build serves and what can be done TODAY.
  const said = preface.mismatchNotice(preface.HTTP2_CLIENT_PREFACE, 'http1');
  assert.doesNotMatch(said, /http\.protocol/,
    'the notice names a configuration key that does not exist and that the '
    + 'schema would refuse. Name a remedy that is reachable, or say there is none.');
  assert.match(said, /HTTP\/1 ONLY/, 'it must say what this build actually serves');
  assert.match(said, /command. lane/, 'it must name an action available today');
  assert.match(said, /http1/, 'it must say what is being served here');
  assert.equal(preface.mismatchNotice('GET / HTTP/1.1\r\n\r\n', 'http1'), null,
    'nothing to say about healthy traffic');
});

test('⑥ the WHOLE notice is the contract — copied from the source, every clause', () => {
  // ④ checks that the remedy is reachable; this checks that no clause of the explanation
  // can vanish. The middle sentences (why nothing is negotiated, why every request fails)
  // are what turn a symptom into an understanding, and a half-erased notice reads as
  // healthy text. Copied from the source, never rebuilt from memory.
  assert.equal(preface.mismatchNotice(preface.HTTP2_CLIENT_PREFACE, 'http1'),
    'ctxroute: a client opened this connection with the HTTP/2 preface '
    + '(RFC 9113) while this daemon serves http1. A cleartext port speaks '
    + 'one protocol or the other — without TLS there is no ALPN, so nothing is '
    + 'negotiated and every request from this client will fail the same way. '
    + 'THIS BUILD SERVES HTTP/1 ONLY: there is no setting to change yet. Point '
    + 'that harness at the `command` lane, or open the HTTP/2 lane (it is one '
    + 'factory call — the request handler is already compatible, measured).');
  // An argument that is neither a string nor a byte view is a plain "no", never a throw:
  // this runs inside a server's `clientError` callback.
  assert.equal(preface.looksLikeHttp2(42), false);
  assert.equal(preface.looksLikeHttp2({}), false);
});

test('⑤ THE REAL SERVER SAYS IT — driven by a REAL HTTP/2 client', async () => {
  // 🛑 The unit cells above prove the DECISION. Only this one proves the WIRING,
  //    and the wiring is what breaks: a pure function nobody calls is inert.
  const written = [];
  const realWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk, ...rest) => { written.push(String(chunk)); return realWrite(chunk, ...rest); };

  const srv = server.createServer({ store: null });
  try {
    await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
    const { port } = srv.address();
    // 🛑 NO DELAY ANYWHERE HERE, AND THAT IS DELIBERATE: the SERVER knows when it
    //    has seen the bad opening — it emits `clientError` — so we ask the
    //    authority instead of waiting a number of milliseconds for it. Listeners
    //    fire in registration order and `createServer` registered its own first,
    //    so the notice is already on stderr when ours runs.
    await new Promise((resolve) => {
      srv.once('clientError', () => resolve());
      const session = http2.connect(`http://127.0.0.1:${port}`);
      session.on('error', () => { /* expected: the server speaks HTTP/1 */ });
      const s = session.request({ ':method': 'POST', ':path': '/pretool' });
      s.on('error', () => { /* same connection, same expected end */ });
      s.end('x');
    });
  } finally {
    process.stderr.write = realWrite;
    await new Promise((r) => srv.close(r));
  }

  const said = written.join('');
  assert.match(said, /HTTP\/2 preface/,
    'the daemon stayed cryptic: a real HTTP/2 client hit a real HTTP/1 listener '
    + 'and nothing named the mismatch. That is the defect this gate exists for.');
  assert.match(said, /HTTP\/1 ONLY/, 'the notice reached stderr without its remedy');
});
