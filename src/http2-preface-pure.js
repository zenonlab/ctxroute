'use strict';

// ═══════════════════════════════════════════════════════════════════════
// THE HTTP/2 CONNECTION PREFACE — a DIAGNOSIS, never a protocol switch
// ═══════════════════════════════════════════════════════════════════════
// 🔑 WHY THIS EXISTS (2026-09-18). A cleartext port serves HTTP/1.1 OR HTTP/2,
//    never both: without TLS there is no ALPN, so there is nothing to negotiate
//    and the server must know its protocol in advance (MEASURED — an HTTP/1.1
//    client against `http2.createServer({allowHTTP1:true})` fails outright).
//    The protocol is therefore DECLARED, exactly as nginx declares it on its
//    `listen` directive. A declaration can be WRONG, and a wrong one used to
//    surface as `HPE_INVALID_CONSTANT` — a parser's complaint that says nothing
//    about what to do.
// 🔑 WHAT THIS BUYS: the failure stops being cryptic. A client speaking HTTP/2
//    to an HTTP/1 server announces itself with 24 FIXED octets, so the daemon
//    can say "this client speaks HTTP/2, declare `http.protocol`" instead of
//    quoting a parse error. Same class as every other named refusal here: a
//    failure that names its remedy costs one reading, a cryptic one costs a
//    session.
// 🛑 IT DIAGNOSES, IT NEVER SWITCHES. Reading the preface and quietly serving
//    HTTP/2 would make the served protocol depend on who knocked first — two
//    clients, two answers, from one declaration. The declaration stays the
//    authority; this only explains why it is wrong.
// 📐 THE AUTHORITY IS THE RFC, NEVER THE RUNTIME'S ERROR NAME. RFC 9113 §3.4
//    fixes the client connection preface as the 24 octets below, and RFC 7540
//    carried the same sequence before it — it cannot move without breaking every
//    HTTP/2 implementation on earth. Node ALSO offers `HPE_PAUSED_H2_UPGRADE`
//    on the error (measured 2026-09-18, same probe), and that name is a THIRD
//    PARTY'S INTERNAL: it may be renamed in any release, with nothing going red
//    here. Match the bytes; the error code is a corroboration, never the test.
// ⚠️ PURE: no I/O, no clock, no global. It receives bytes and returns a verdict,
//    so it is mutated like every other decision in this repository.

/**
 * The 24 octets every HTTP/2 client sends first, on cleartext and on TLS alike.
 * 🛑 NEVER "normalise" this string: it is a byte sequence from a specification,
 *    not prose. The trailing blank lines are part of it.
 */
const HTTP2_CLIENT_PREFACE = 'PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n';

/**
 * Does this opening look like an HTTP/2 client announcing itself?
 *
 * ⚠️ A SHORT READ IS NOT A NO, AND THAT IS THE ONE SUBTLETY HERE. TCP may hand
 *    the server fewer than 24 octets in the first packet, so a buffer that is a
 *    PREFIX of the preface is still an HTTP/2 client — answering "no" there
 *    would make the diagnosis depend on packet boundaries, i.e. on luck. It is
 *    also harmless: no HTTP/1 request can begin with those bytes, because
 *    `PRI` is not a method any HTTP/1 client sends.
 * ⚠️ AN EMPTY BUFFER IS A NO. It carries no evidence, and a diagnosis drawn from
 *    nothing is the vacuity this repository refuses everywhere else.
 *
 * @param {Buffer|Uint8Array|string|null|undefined} opening the first bytes read
 * @returns {boolean} true when those bytes are the preface, or a prefix of it
 */
function looksLikeHttp2(opening) {
  if (opening === null || opening === undefined) return false;
  // Stryker disable ArrayDeclaration: EQUIVALENT mutant, and the fallback STAYS.
  //    Replacing `[]` by `["Stryker was here"]` yields ONE octet (a string is not a byte,
  //    it becomes 0), and `\x00` is not a prefix of the preface, which starts with `P` —
  //    so both forms answer false on every input that reaches them (cell ⑥ drives that
  //    branch). 🛑 KEPT rather than deleted: it is what makes a non-buffer, non-string
  //    argument a plain "no" instead of a `TypeError` thrown inside a server callback.
  const text = typeof opening === 'string'
    ? opening
    : Buffer.from(opening.buffer ? opening : []).toString('latin1');
  // Stryker restore ArrayDeclaration
  if (text.length === 0) return false;
  const compared = Math.min(text.length, HTTP2_CLIENT_PREFACE.length);
  return text.slice(0, compared) === HTTP2_CLIENT_PREFACE.slice(0, compared);
}

/**
 * The operator-facing sentence, or `null` when there is nothing to say.
 *
 * 🛑 IT NAMES THE KEY AND THE VALUE, never just the symptom. Whoever reads this
 *    line is looking at a daemon that refuses every request from one harness;
 *    what they need is the edit, not the diagnosis.
 *
 * @param {Buffer|Uint8Array|string|null|undefined} opening the first bytes read
 * @param {string} declared the protocol this daemon was told to serve
 * @returns {string|null}
 */
function mismatchNotice(opening, declared) {
  if (!looksLikeHttp2(opening)) return null;
  return 'ctxroute: a client opened this connection with the HTTP/2 preface '
    + `(RFC 9113) while this daemon serves ${declared}. A cleartext port speaks `
    + 'one protocol or the other — without TLS there is no ALPN, so nothing is '
    + 'negotiated and every request from this client will fail the same way. '
    + 'THIS BUILD SERVES HTTP/1 ONLY: there is no setting to change yet. Point '
    + 'that harness at the `command` lane, or open the HTTP/2 lane (it is one '
    + 'factory call — the request handler is already compatible, measured).';
}

module.exports = { looksLikeHttp2, mismatchNotice, HTTP2_CLIENT_PREFACE };
