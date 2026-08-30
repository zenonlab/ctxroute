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
// DELIVERY NOTICE — DECLARED, PERMANENT DIVERGENCE (2026-08-30)
// ═══════════════════════════════════════════════════════════════════════
//
// 🛑 THIS ONE IS NOT A TRANSPORT ARTEFACT LIKE THE ORDINAL ABOVE — IT IS A
//    STRUCTURAL IMPOSSIBILITY OF BYTE-FOR-BYTE PARITY, AND IT NEVER CLOSES.
//    `delivery-notice-pure.js` tells the human whether every declared frame
//    of an invocation reached the daemon. Only the HTTP daemon can observe
//    that: it is the single process that sees every connecting request of
//    one invocation (`frame-sequencer-pure.js`). The `command` (spawn) lane
//    has NO equivalent observer -- its N processes are independent OS
//    processes with no shared memory, so none of them can ever say "all of
//    us arrived". The message is only TRUE where an observer exists, so it
//    can only ever be emitted on ONE of the two lanes. That is a declared
//    divergence, not a bug to fix -- closing it would mean fabricating the
//    same claim on a lane that cannot back it.
//
// 🛑 ANCHORED AT THE END OF THE STRING, ONE OF THE TWO EXACT WORDINGS ONLY --
//    never a blind strip of everything after `ctxroute: `. A badge suffix
//    that merely starts with our own prefix but is NOT one of the two known
//    forms (a typo, a future third notice not yet taught to this filter, an
//    injected decoy) must stay VISIBLE: this filter's whole job is to hide
//    the ONE thing we know is harmless, never to widen into "anything with
//    our name on it". Part (2) of the negative-check enforces exactly this.
// 🛑 THE PRECEDING BADGE (' . ') IS PART OF THE MATCH, NEVER THE CONTENT
//    BEFORE IT: `pretool-core.js` joins every suffix with ' . ', so removing
//    our own tail must also remove the separator that introduced it --
//    otherwise a real badge would come back with a dangling ' . ' and LOOK
//    unequal for a reason that has nothing to do with a real regression.
const DELIVERY_NOTICE_TAIL = / ?· ?ctxroute: (?:all \d+ chunk\(s\) delivered — \d+ of \d+ declared frames reached the daemon|\d+ chunk\(s\) deferred to the next action)$|^ctxroute: (?:all \d+ chunk\(s\) delivered — \d+ of \d+ declared frames reached the daemon|\d+ chunk\(s\) deferred to the next action)$/;

/**
 * Removes the delivery-completion/deferral notice `delivery-notice-pure.js`
 * appends to a `systemMessage` on the HTTP lane -- the ONE declared,
 * permanent gap between the two lanes (see the header above). TOTAL: a
 * non-string input is returned as is.
 */
function withoutDeliveryNotice(systemMessage) {
  if (typeof systemMessage !== 'string') return systemMessage;
  return systemMessage.replace(DELIVERY_NOTICE_TAIL, '');
}

// ═══════════════════════════════════════════════════════════════════════
// FRAMES + CHUNKING — REASSEMBLE BY THE PROTOCOL'S OWN NUMBERS
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
// 🛑 AND THE FIRST ANSWER — A PREFIX COMPARISON — WAS A SECOND WEAKENING.
//    It held the differential to ONE frame, so chunks `2..m` were simply not
//    there and a content divergence BEYOND the first chunk was INVISIBLE.
//    "Declared" is not "closed": the heaviest parity net in this repo cannot
//    be a net over the head of a document only.
//    ✅ WHAT REPLACES IT: the caller drives the frames the action actually
//    declares, and this module glues them back together BY THE FIELDS THE
//    PROTOCOL ITSELF CARRIES (RFC 2046 `message/partial` + RFC 6455 — id, a
//    number starting at 1, the total, cuts on line boundaries, never
//    interleaved). Equality over the WHOLE document is restored.
//
// 🛑 NEVER BY ARRIVAL ORDER. No harness guarantees it (official doc: hooks run
//    in parallel, aggregation unspecified) and the caller spawns real
//    processes. We read `FRAME k/N` and `CHUNK j/m`, we verify the count and
//    the shared end marker, and a missing or duplicated number is a LOUD
//    refusal — a silent hole would make the whole net hollow.
//
// 🛑 FAIL-CLOSED, WITHOUT A SINGLE FALLBACK. Anything this reader cannot place
//    with certainty — an unparsable envelope, a frame from another emission, a
//    continuation sitting mid-frame, a delivery that still DEFERS documents —
//    returns `{ok: false, reason}`. The caller must stay RED on it. There is no
//    "compare the head instead": the one thing worse than a weaker net is a net
//    that looks strong and is not.
//
// ⚠️ THE ONE REGIME LEFT OUT, AND IT IS DECLARED: `fragment` cuts on LINE
//    boundaries except on a line longer than a frame, which it chops mid-line.
//    Those two cuts are indistinguishable to a receiver (one loses a `\n`, the
//    other loses nothing), so a doc holding such a monster line reassembles
//    one `\n` too long and stays RED. A loud, rare false red — preferred over a
//    reader that guesses which of the two happened.

// The FRAME envelope, exactly as `budget.js` composes it (`frameHeader` +
// `footer`). The back-reference `\3` demands the SAME end marker at the head
// and at the foot: a frame that disagrees with itself is a transport defect,
// and swallowing it would be exactly the "green that sees nothing".
const FRAME_SEAL = /^⚠️ SEALED INJECTION — FRAME (\d+)\/(\d+), end marked ###END:([0-9a-f]+)###\n[^\n]*\n[^\n]*\n[^\n]*\n\n([\s\S]*)\n\n###END:\3###$/;

// The LONE-frame envelope (`budget.js::header` + `footer`). A single frame
// never says "FRAME 1/1" — that would be an absurd reassembly instruction.
const SOLO_SEAL = /^⚠️ SEALED INJECTION — this block ends with ###END:([0-9a-f]+)###\n[^\n]*\n[^\n]*\n\n([\s\S]*)\n\n###END:\1###$/;

// Opening words shared by both envelopes: a frame that starts with them and
// matches NEITHER shape is a seal we cannot read ⇒ refusal, never a body.
const SEAL_OPEN = '⚠️ SEALED INJECTION';

// The chunk header, exactly as `budget.js::chunkHeader` composes it. The
// back-reference `\3` demands the SAME total in both places.
const CHUNK_HEADER_ALL = /⟦ (.+?) — CHUNK (\d+)\/(\d+) : reassemble the \3 chunks in order before reading ⟧\n/g;

// The deferral announcement, as `budget.js::announcement` opens it. Its
// presence means the action delivered LESS than the whole corpus ⇒ there is
// nothing complete to compare, so we refuse instead of comparing a fragment.
const DEFERRED_TAIL = /\n\n⚠️ \d+ doc\(s\) DEFERRED — the frame is full, they follow on the next tool call\(s\)\./;

// Segment separator, `budget.js::SEPARATOR`. Two segments of DIFFERENT
// documents are glued with it; two chunks of the SAME document are glued with
// the single `\n` that the cut consumed.
const SEPARATOR = '\n\n---\n\n';

// ⚠️ A refusal carries NO `text`, and a success carries no `reason`: a field
//    nobody reads is a field no test can kill.
function no(reason) {
  return { ok: false, reason };
}

// Every chunk header of a body, with WHERE it sits: the position is what tells
// a continuation that OPENS a frame (gluable) from one sitting in the middle of
// it (not gluable without guessing).
// ⚠️ `matchAll`, NEVER AN `exec` LOOP AGAIN. The spec makes `matchAll` REFUSE a
//    non-global regex (TypeError), whereas `exec` on the same regex never advances
//    `lastIndex` and spins for ever on the first header. That difference is not
//    style: a mutant that HANGS is a mutant nobody can kill — it comes back as a
//    RuntimeError, which is NOT a kill, and the guard it protects stays unproven.
// ⚠️ The regex is COPIED, never the shared literal: `lastIndex` is state, and two
//    call sites sharing it would read from the middle of a body.
function chunkHeaders(body) {
  const re = new RegExp(CHUNK_HEADER_ALL.source, 'g');
  return [...body.matchAll(re)].map(
    (hit) => ({ at: hit.index, label: hit[1], j: Number(hit[2]), m: Number(hit[3]) }));
}

// Glues the frame BODIES back into the single document the oracle returns.
function stitch(bodies) {
  let text = '';
  let open = null;
  for (let i = 0; i < bodies.length; i++) {
    const heads = chunkHeaders(bodies[i]);
    let joiner = SEPARATOR;
    let next = 0;
    // ① A document left OPEN by the previous frame MUST be continued at the
    //    VERY FIRST byte of this one (RFC 6455: a fragmented document is never
    //    interleaved). That single condition is what catches a MISSING, a
    //    DUPLICATED and an OUT-OF-ORDER chunk alike.
    if (open !== null) {
      const c = heads[0];
      if (c === undefined || c.at !== 0 || c.label !== open.label || c.j !== open.j + 1) {
        return no('frame ' + (i + 1) + ' does not open on CHUNK ' + (open.j + 1) + '/' + open.m
          + ' of ' + open.label + ': a chunk is missing, duplicated or out of order');
      }
      // The cut consumed exactly one line break, so that is what puts it back.
      joiner = '\n';
      open = c.j === c.m ? null : { label: c.label, j: c.j, m: c.m };
      next = 1;
    }
    // ② Every OTHER header of this frame must OPEN a document (`j = 1`) while
    //    none is open. A continuation anywhere else cannot be glued: whether it
    //    wants a line break or a document separator is a GUESS.
    for (let h = next; h < heads.length; h++) {
      const c = heads[h];
      if (c.j !== 1 || open !== null) {
        return no('CHUNK ' + c.j + '/' + c.m + ' of ' + c.label + ' sits inside frame ' + (i + 1)
          + ': this reader will not guess how to glue it');
      }
      open = { label: c.label, j: 1, m: c.m };
    }
    const body = bodies[i].replace(CHUNK_HEADER_ALL, '');
    text += (i === 0 ? '' : joiner) + body;
  }
  // ③ A delivery that stops inside a document is INCOMPLETE — never a document.
  if (open !== null) {
    return no('the delivery ends inside ' + open.label + ': CHUNK ' + open.j + '/' + open.m
      + ' was the last one seen');
  }
  return { ok: true, text };
}

/**
 * Reassembles the frames of ONE action into the single document the frozen
 * oracle returns.
 *
 * @param {*} frames the `additionalContext` of frame 1, 2, … N, IN THAT ORDER.
 * @returns {{ok: boolean, reason?: string, text?: string}} `ok` false ⇒ the caller
 *          MUST stay red; `reason` names what could not be placed.
 *
 * ⚠️ TOTAL: a non-array, an empty array or a non-string frame is a REFUSAL, never
 *    a throw — a differential that crashes reads like an engine outage.
 */
function reassemble(frames) {
  if (!Array.isArray(frames) || frames.length === 0) return no('no frame was delivered');
  const bodies = [];
  // ⚠️ `null` and not `''`: an initial value nobody can OBSERVE is an eternal
  //    mutation survivor. Here it is read by the guard below, hence killable.
  let total = 0;
  let marker = null;
  for (let i = 0; i < frames.length; i++) {
    const raw = frames[i];
    if (typeof raw !== 'string') return no('frame ' + (i + 1) + ' is not a string');
    // A deferral means the corpus did NOT fit in the frames this action drove:
    // there is no whole document here, so there is nothing to compare.
    if (DEFERRED_TAIL.test(raw)) {
      return no('frame ' + (i + 1) + ' still DEFERS documents: this action delivered less than the corpus');
    }
    const fr = FRAME_SEAL.exec(raw);
    if (fr !== null) {
      if (Number(fr[1]) !== i + 1) {
        return no('frame ' + (i + 1) + ' announces itself as FRAME ' + fr[1] + '/' + fr[2]);
      }
      if (marker === null) { total = Number(fr[2]); marker = fr[3]; }
      if (Number(fr[2]) !== total || fr[3] !== marker) {
        return no('frame ' + (i + 1) + ' belongs to ANOTHER emission: total or end marker differ');
      }
      bodies.push(fr[4]);
      continue;
    }
    const solo = SOLO_SEAL.exec(raw);
    if (solo !== null) {
      if (frames.length !== 1) {
        return no('a LONE-frame seal arrived inside a delivery of ' + frames.length + ' frames');
      }
      bodies.push(solo[2]);
      continue;
    }
    if (raw.startsWith(SEAL_OPEN)) return no('frame ' + (i + 1) + ' carries a seal this reader cannot parse');
    // Under the sealing threshold the engine emits the body BARE — the
    // historical rendering, to the byte. Nothing to strip.
    bodies.push(raw);
  }
  return stitch(bodies);
}

module.exports = { withoutOrdinal, withoutDeliveryNotice, reassemble };
