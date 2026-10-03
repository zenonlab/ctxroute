// ═══════════════════════════════════════════════════════════════════════
// badge-label-pure.js — WHICH NAME THE "📄 doc: …" BADGE ANNOUNCES. Pure
// decision, ZERO I/O.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 WHY IT LEFT `source-adapters.js` (2026-09-13). It was ~70 lines of PURE
//    decision sitting inside an I/O module, hence OUTSIDE Stryker's `mutate`
//    list: an inverted condition or a `<=` turned into a `<` would have stayed
//    green for ever. The same split was made on `doctor-wiring-pure.js` for the
//    same reason, and the criterion is identical — MUTABILITY, never size.
// 🛑 NEVER move a decision back into `source-adapters.js`: that un-mutates it
//    in silence, which is worse than never having mutated it — the file LOOKS
//    covered.
//
// 🛑 DISPLAY IS PART OF THE CONTRACT, NOT DECORATION. Both defects this module
//    carries the scars of cost a HUMAN MORNING each, and neither lost a single
//    byte of content: a correct but UNREADABLE transport gets mistaken for an
//    outage, and a system believed broken ends up unplugged.
//
// ⚠️ PURE: no `fs`, no `path`, no `process`. Its two dependencies (`budget`,
//    `gate`) are themselves pure and mutated at 100 %.

const budget = require('./budget');
const gate = require('./gate');

// ⚠️ MAX NUMBER OF NAMES CITED. Beyond that, "+N": a badge is a STATUS
//    LINE, not a table of contents — 12 names would make it unreadable, hence ignored.
const MAX_NAMES = 3;

/**
 * The label an adapter registered for a document, reduced to a basename.
 *
 * @param {string} id document id (already a BASE, never a piece)
 * @param {{acc: {labels: Object<string,string>}}} ctx
 * @returns {string} '' when the accumulator holds no label for that document
 */
function shortName(id, ctx) {
  const raw = ctx.acc.labels[id];
  return raw ? String(raw).split(/[\\/]/).pop().replace(/\.md$/, '') : '';
}

/**
 * Is THIS document delivered as PIECES in this frame?
 *
 * 🔴 THE QUESTION MUST BE ASKED OF `ctx.emitted`, NEVER OF `injected` — and a
 *    first fix asked the wrong one, shipped DEAD, with a green suite
 *    (2026-09-13). `pretool-core` maps `baseId` over `plan.emitted` before
 *    calling an adapter, so `injected` holds BASES and the `#j/m` is already
 *    gone. Asking `chunkPart(injected[0])` therefore answered `null` for EVERY
 *    real delivery; the suite passed only because it fabricated ids carrying
 *    `#`, i.e. it exercised a caller that does not exist.
 * 🛑 ANY CELL THAT BUILDS `injected` BY HAND MUST BUILD IT AS THE CALLER DOES —
 *    bases, never segments — or it proves nothing about production.
 * ⚠️ Asked PER DOCUMENT, not per frame: a frame can carry a whole document
 *    beside the pieces of another, and each must be named by its own rule.
 * ⚠️ `ctx.emitted` absent ⇒ `false` ⇒ the historical path. That fallback is what
 *    lets any consumer ignore the key without breaking.
 *
 * @param {string} base document id, already reduced to its base
 * @param {{emitted?: string[]}} ctx
 * @returns {boolean}
 */
function deliveredInPieces(base, ctx) {
  const ids = ctx.emitted;
  if (!Array.isArray(ids)) return false;
  // ⚠️ `chunkPart`, never `includes('#')`: a document whose own name carries a
  //    `#` would be mistaken for a piece. It reads the LAST `#`, so a re-chunked
  //    piece (`doc#1/2#2/4`) is recognised too.
  return ids.some((id) => budget.baseId(id) === base && budget.chunkPart(id) !== null);
}

/**
 * Short name of the document(s) announced by the "📄 doc: …" badge.
 *
 * ⚠️ TWO SOURCES, IN THIS ORDER, and it is not a detail (06/08/2026):
 *    ① the `[source: …]` tag of the emitted text — that is protect-files PARITY,
 *       byte-wise, and it must remain the nominal path;
 *    ② failing that, the label the adapter has ALREADY supplied in `acc.labels`.
 * 🛑 NEVER invert that order for a WHOLE document: reading `acc.labels` first
 *    would change the badge of the nominal case and break the parity
 *    differentials.
 *
 * @param {string[]} injected document ids ALREADY reduced to their base by the
 *   caller (`pretool-core` maps `baseId` over `plan.emitted`) — never segments
 * @param {{fullDoc: string, acc: {labels: Object<string,string>}, emitted?: string[]}} ctx
 *   `emitted` carries the RAW ids of this frame, the only place the `#j/m` still
 *   exists; absent ⇒ the historical path
 * @returns {string} '' when nothing can be named (the caller then drops the badge)
 */
function badgeLabel(injected, ctx) {
  // ⚠️ DEDUP BY DOCUMENT (07/08/2026): `injected` carries SEGMENTS, hence
  //    `doc#2/7` and `doc#3/7` of the SAME doc. Without `baseId` we would cite the
  //    same name twice — the trap already paid on `budget.announcement` on 05/08.
  const bases = [...new Set(injected.map((i) => budget.baseId(i)))];

  // ⚠️ NOMINAL CASE UNTOUCHED — A SINGLE DOC: historical path, BYTE-wise
  //    (`[source:]` tag first, `acc.labels` as fallback). That is the
  //    protect-files parity, sealed by `pretool-differential`. Touching this path
  //    would turn the differential red without any engine having changed.
  if (bases.length <= 1) {
    // ⚠️ `bases[0]`, PLAIN — the old `bases[0] !== undefined ? bases[0] :
    //    injected[0]` was an EQUIVALENT mutant and mutation proved it (2026-09-13).
    //    `bases` is built from `injected`, so the fallback is reachable ONLY when
    //    `injected` is empty — and then `injected[0]` is `undefined` too. The two
    //    branches CANNOT differ on any input. Writing a test for it would freeze
    //    unreachable code for ever; the rule here is to remove it at the source.
    const only = bases[0];

    // 🔴 A PIECE IS NOT A DOCUMENT — DEFECT OBSERVED IN PRODUCTION 2026-09-13,
    //    and it is the HALF of the 06/08 class that stayed open.
    //    The `[source:]` tag lives at the END of a document, so no piece but the
    //    last carries it. On a piece, the tag's ABSENCE therefore says nothing
    //    about the document: it is an artefact of the split. Asking
    //    `docLabel` first then made the FIRST piece fall back on the markdown
    //    TITLE — so one document went out under two names
    //    ("🔗 SI TU TOUCHES CE FICHIER… (chunk 1/2)" then
    //    "panneau-contenu (chunk 2/2)"), which reads as two documents, one of
    //    them interrupted. An hour was spent on a transport failure that had
    //    not happened: all 32 frames had reached the daemon.
    // 🔑 WHY AUGUST'S FIX DID NOT CLOSE IT: making the ATX regex
    //    CommonMark-compliant stopped the seal footer from passing as a title,
    //    so `docLabel` answers '' and `acc.labels` fires — but ONLY for a
    //    document with NO heading. A document WITH one short-circuits the
    //    fallback, i.e. most of the corpus.
    // 🛑 THE WHOLE-DOCUMENT PATH IS UNTOUCHED, BYTE FOR BYTE. That path is the
    //    protect-files parity sealed by `pretool-differential`, and
    //    protect-files never chunks: this branch is unreachable for the oracle,
    //    which is precisely why the fix belongs HERE and not in `gate.docLabel`.
    //    NEVER "simplify" this by reading `acc.labels` first for every case —
    //    that would change the nominal badge and redden the differentials.
    // ⚠️ `chunkPart` reads the LAST `#`, so a re-chunked piece (`doc#1/2#2/4`)
    //    is recognised too. Never test `id.includes('#')` instead: a document
    //    whose own name carries a `#` would be mistaken for a piece.
    if (deliveredInPieces(only, ctx)) {
      const byLabel = shortName(only, ctx);
      if (byLabel) return byLabel;
      // ⚠️ No label for this document (an adapter that never registered one):
      //    the text is all we have left, and a nameless badge worries more than
      //    an imperfect name. Cf. the anti-vacuity cell of `badge-label.test.js`.
      return gate.docLabel(ctx.fullDoc);
    }

    const parTag = gate.docLabel(ctx.fullDoc);
    if (parTag) return parTag;
    return shortName(only, ctx);
  }

  // 🔴 SEVERAL DOCS IN THE SAME FRAME — THE DEFECT FIXED HERE (07/08/2026).
  //    The code read `injected[0]`: four documents delivered, ONLY ONE named.
  //    REAL consequence, not cosmetic: the maintainer saw "chunk 1/8",
  //    "chunk 2/8", then another name — and concluded that the delivery
  //    had STOPPED at 2/8. It was complete. A morning spent
  //    diagnosing a nonexistent failure, on the strength of a false counter.
  // ⚠️ LESSON TO KEEP: a correct but UNREADABLE transport gets mistaken
  //    for a failure. Display is part of the contract, not decoration.
  // ⚠️ NO `if (names.length === 0) return ''` GUARD — it was an EQUIVALENT
  //    mutant and mutation proved it (2026-09-13): on an empty array `slice`
  //    yields `[]`, `join` yields `''`, and `0 > MAX_NAMES` is false, so the
  //    expression below ALREADY returns `''`. The guard could be turned into
  //    `if (false)` with every test still green. Removed rather than tested —
  //    a test for absorbed code freezes it for ever.
  // 🛑 The EMPTY result is still load-bearing: the caller drops the badge on it,
  //    because an orphan "(chunk 3/7)" that never says OF WHAT worries more than
  //    silence. It is asserted by the anti-vacuity cell of `badge-label.test.js`.
  const names = bases.map((b) => shortName(b, ctx)).filter(Boolean);
  const citedNames = names.slice(0, MAX_NAMES).join(' · ');
  return names.length > MAX_NAMES ? citedNames + ' +' + (names.length - MAX_NAMES) : citedNames;
}

module.exports = { badgeLabel, shortName, MAX_NAMES };
