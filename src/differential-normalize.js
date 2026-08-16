// ═══════════════════════════════════════════════════════════════════════
// differential-normalize.js — STRIP THE ENVELOPE BEFORE COMPARING
// ═══════════════════════════════════════════════════════════════════════
// ⚠️ SHARED BY BOTH DIFFERENTIALS (`porte-differential`,
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

module.exports = { withoutOrdinal };
