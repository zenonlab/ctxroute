// ═══════════════════════════════════════════════════════════════════════
// differential-normalize.js — STRIP THE ENVELOPE BEFORE COMPARING
// ═══════════════════════════════════════════════════════════════════════
// ⚠️ SHARED BY BOTH DIFFERENTIALS (`pretool-differential`,
//    `mcp-differential`). SINGLE SOURCE, never a copy: two normalizations
//    would diverge at the first format change, and two safety nets that no
//    longer filter the same thing no longer prove anything together.
//
// 🛑 WHY THIS MODULE EXISTS. The oracle (`protect-files.js`) has been FROZEN since
//    July: its own doc forbids it to evolve. Everything born AFTER
//    it (the seal, then the ordinal) makes it diverge on the ENVELOPE while
//    no engine has changed. So we compare the CONTENT, not the wrapping.
//
// 🛑 THIS MODULE IS A DELIBERATE WEAKENING OF A SAFEGUARD. It MUST therefore
//    carry its negative-check (`differential-normalize.test.js`): an untested
//    comparison filter can swallow a REAL regression, and the
//    differential would stay green on it. That is the only risk of this file.
// ⚠️ NEVER broaden a pattern to "make a red pass". A differential
//    tuned until it is green no longer guards anything.

/**
 * Removes the `[DOC i/T]` ordinal placed by the gateway next to the source tag.
 *
 * 🛑 ANCHORED ON THE SOURCE TAG, NEVER A BLIND ERASURE. Removing every
 *    `[DOC x/y]` wherever it is would swallow a doc whose BODY legitimately
 *    contains that text — the differential would become one-eyed exactly where
 *    one would believe it had been strengthened. Part ③ of the negative-check requires it.
 * ⚠️ TOTAL: an input without an ordinal comes back out byte for byte.
 */
function withoutOrdinal(ctx) {
  if (typeof ctx !== 'string') return ctx;
  return ctx.replace(/(\[source: [^\]]+\]) \[DOC \d+\/\d+\]/g, '$1');
}

// ═══════════════════════════════════════════════════════════════════════
// CHUNKING — the third thing born AFTER the frozen oracle
// ═══════════════════════════════════════════════════════════════════════
//
// 🛑 THE DEFECT THIS CLOSES, AND WHY THE OBVIOUS FIX WAS THE WRONG ONE.
//    A doc that grows past ONE frame's capacity (~7,661 c) is CHUNKED by the
//    engine (`budget.js::fragment`) while the oracle, which knows nothing of
//    chunking, returns the WHOLE document. The differential went red THREE
//    times in one afternoon on that, and each time the "fix" was to SHORTEN a
//    doc. That is degrading a deliverable to fit OUR plumbing — forbidden
//    here in writing. Docs grow; a parity gate that reddens on growth is a
//    gate people silence by trimming prose, until they trim something that
//    mattered.
//
// 🛑 WHAT THE COMPARISON BECOMES, SAID PLAINLY — AND WHAT IT STOPS PROVING.
//    The differential drives ONE frame, so only chunk `1/m` is in that output:
//    chunks `2..m` are NOT there and cannot be reassembled from it. So the
//    comparison can NOT be "reassemble then compare whole". It becomes:
//      the delivered chunk, envelope removed, must be an EXACT PREFIX of the
//      oracle's document, cut on a LINE boundary.
//    COST, stated rather than hidden: a prefix is WEAKER than an equality. A
//    content divergence located BEYOND the first chunk is INVISIBLE to this
//    comparison. On a chunked doc we therefore prove parity on the delivered
//    head only — never on the tail. Nothing stronger is reachable from one
//    frame without re-implementing the split (i.e. comparing the engine to
//    itself, which proves nothing at all).
//
// 🛑 ANCHORED ON THE PROTOCOL'S OWN MARKERS, NEVER A LOOSE `startsWith`.
//    The envelope is recognized by the FULL chunk header sentence (RFC 2046
//    `message/partial`: id, number starting at 1, total — `budget.js`) and by
//    the FULL deferral sentence. Any other shape is returned UNCHANGED, hence
//    stays RED. Fail-closed, on purpose: we normalize the one delivery whose
//    relation to the oracle we can NAME, and refuse to guess about the rest.

// The chunk header, exactly as `budget.js::chunkHeader` composes it. The
// back-reference `\2` demands the SAME total in both places — a header that
// disagrees with itself is a transport defect, and swallowing it would be
// exactly the "green that sees nothing" this repo fears most.
const CHUNK_HEADER = /^⟦ .+ — CHUNK (\d+)\/(\d+) : reassemble the \2 chunks in order before reading ⟧\n/m;
const CHUNK_HEADER_ALL = new RegExp(CHUNK_HEADER.source, 'gm');

// The deferral announcement, exactly as `budget.js::announcement` composes it.
// ⚠️ It is ALWAYS present when a doc is chunked (the surplus chunks are the
//    deferred ones), and it is ENVELOPE, not content — the oracle has no queue.
//    Anchored on the two complete sentences + the `   - ` citation lines, and
//    only at the very END of the block.
const DEFERRED_TAIL = /\n\n⚠️ \d+ doc\(s\) DEFERRED — the frame is full, they follow on the next tool call\(s\)\.\n {3}Nothing is lost: they are queued, in order\. If your action touches them NOW, read them:\n(?: {3}- [^\n]*\n)* {3}- [^\n]*$/;

/**
 * Aligns a possibly CHUNKED delivery with the frozen oracle's whole document.
 *
 * @param {*} delivered the engine's injected context (already unsealed / ordinal-stripped)
 * @param {*} oracle    the frozen oracle's context
 * @returns {{actual: *, expected: *}} the pair the caller compares with a STRICT equality
 *
 * ⚠️ TOTAL and IDENTITY BY DEFAULT: anything that is not a well-formed single
 *    `CHUNK 1/m` delivery comes back as `{actual: delivered, expected: oracle}`
 *    — byte for byte, so the nominal path stays a STRICT equality and a
 *    non-string input never throws (a differential that crashes reads like an
 *    engine outage).
 */
function alignChunked(delivered, oracle) {
  const unchanged = { actual: delivered, expected: oracle };
  if (typeof delivered !== 'string' || typeof oracle !== 'string') return unchanged;

  // ⚠️ EXACTLY ONE header. Zero ⇒ nothing was chunked, strict equality kept.
  //    Several ⇒ a shape we cannot name (two chunked docs in one frame does not
  //    happen: the doc that overflows is the LAST one in the frame). We refuse
  //    to normalize what we cannot explain rather than invent a rule for it.
  const headers = delivered.match(CHUNK_HEADER_ALL);
  if (headers === null || headers.length !== 1) return unchanged;

  const parts = CHUNK_HEADER.exec(delivered);
  // 🛑 ONLY CHUNK 1 IS A PREFIX. On chunk `3/5` a prefix comparison would be
  //    plainly FALSE — it must stay red, never be quietly accepted.
  if (Number(parts[1]) !== 1) return unchanged;
  if (Number(parts[2]) < 2) return unchanged;

  const withoutTail = delivered.replace(DEFERRED_TAIL, '');
  const actual = withoutTail.replace(CHUNK_HEADER, '');
  // A chunk LONGER than the whole document is not a prefix of anything: red.
  if (actual.length > oracle.length) return unchanged;
  // ⚠️ CUT ON A LINE BOUNDARY (RFC 2046 § message/partial, `budget.js`). Without
  //    this the comparison degenerates into a bare `startsWith`, which ANY
  //    truncation regression would satisfy. Known and ACCEPTED consequence: a
  //    doc holding a single line longer than a frame is cut mid-line by the
  //    protocol and stays RED here — a loud, rare false red, preferred over a
  //    filter that accepts every truncation.
  if (actual.length < oracle.length && oracle[actual.length] !== '\n') return unchanged;

  return { actual, expected: oracle.slice(0, actual.length) };
}

module.exports = { withoutOrdinal, alignChunked };
