// ═══════════════════════════════════════════════════════════════════════
// EMISSION BUDGET — EVERYTHING GOES OUT. What does not fit in a frame is
// CHUNKED and spread out; nothing is ever refused because of its size.
// ═══════════════════════════════════════════════════════════════════════
//
// REASON FOR BEING (31/07/2026, defect EXPERIENCED): every harness bounds the
// size of an injection. Beyond that, it FILES the content away in a file and
// shows only a preview — without warning the producer. The agent receives an
// intro believing it holds the contract. That is the "green that lies" this
// framework exists to eliminate. MEASURED on 31/07/2026 on Claude Code 2.1.220:
// threshold of 10 000 characters per hook and per field (`BYe(..., n = TCu)`,
// TCu = 1e4), beyond which the output goes into
// `tool-results/hook-<id>-<n>-additionalContext.txt`.
//
// ⚠️ THIS MODULE KNOWS NO HARNESS THRESHOLD, AND MUST NEVER KNOW ONE.
//    It receives a BUDGET (number of characters) and sticks to it. The real
//    threshold of Claude Code / Codex / the next harness is a datum of the
//    SHELL: hardcoding `10000` here would let a dialect into the core and would
//    break the port — exactly what `sources-must-not-know-the-harness` already
//    forbids for the sources. A remotely driven threshold (feature-gate
//    `tengu_velvet_ibis`, indexed by tool) can CHANGE WITHOUT AN UPDATE:
//    reading it would be building on sand.
//
// ⚠️ UNIT = THE CHARACTER, never the token. That is what the harness itself
//    counts (`e.length <= n`); the token is an ESTIMATE (chars/4 at Claude
//    Code) and varies from one harness to another. Counting in tokens would
//    introduce imprecision where the wall is exact.
//
// ⚠️ THE FRAMEWORK DELIVERS — IT NEVER JUDGES SIZE (maintainer's decision,
//    03/08/2026). A doc heavier than a frame is CHUNKED and delivered;
//    undeliverability is IMPOSSIBLE BY CONSTRUCTION. Refusing to deliver, or
//    requiring the author to shorten, would make them carry a defect of the
//    TRANSPORT.
//    ⚠️ HISTORICAL, not to be restored: the rule was "a segment is INDIVISIBLE,
//    it passes whole or it is announced", justified by "an amputated doc looks
//    complete, therefore it lies". That justification DIED with the frames:
//    each chunk carries `CHUNK j/m` and travels in a numbered frame `k/N` with
//    the common marker — it announces itself as a fragment and the reassembly
//    is verifiable. What remains forbidden is cutting WITHOUT saying so.
//
// ⚠️ THE SEAL IS THE LAST-RESORT GUARANTEE, and it assumes NO threshold.
//    The header announces an end marker; the marker closes the block. Marker
//    absent when reading ⇒ the harness truncated, the agent KNOWS it and will
//    go read the cited files. Whether the wall is at 10 000, 2 000 or 400 000,
//    the mechanism is identical: that is what makes SILENT loss structurally
//    impossible, even if the budget turned out to be badly calibrated one day.
//    ⚠️ The header is at the TOP by NECESSITY: a truncation keeps the BEGINNING
//    (`slice(0, n)` in every measured harness). Moving it to the foot would
//    make it inoperative precisely in the case it covers.
//
// ⚠️ PURE: zero I/O, zero state, zero clock, zero randomness. That is the
//    CONDITION for Stryker mutation without equivalent mutants AND for
//    property-based testing (fast-check) which proves CONSERVATION on generated
//    inputs.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

// FRAMEWORK default (authority ① of the cascade — exists even without JSON config).
// ⚠️ This is a MARGIN, not a copy of a threshold: deliberately below the lowest
//    measured threshold of the harness fleet (10 000 on Claude Code 2.1.220), so
//    as to survive a remote lowering without changing anything on our side.
//    Raising it to the threshold level would remove the margin and put us back
//    at the mercy of a feature-gate.
const DEFAULT_BUDGET = 8000;

const SEPARATOR = '\n\n---\n\n';

// Fraction of the budget beyond which we SEAL (header + end marker).
// ⚠️ Below it, the rendering is the one from BEFORE this work, to the byte —
//    that is what makes the switch safe for agents already running. Above it, we
//    approach the harness wall and the seal becomes the only guarantee against a
//    silent truncation. Do NOT raise it to 1: the seal would arrive just at the
//    moment when it is already too late to fit in the frame.
const SEAL_THRESHOLD_RATIO = 0.5;

// Length of the marker (hex). Fixed: the overhead must be computable BEFORE
// choosing the segments, otherwise the budget would not be a safe bound.
const MARKER_SIZE = 8;

// ⚠️ HOMEMADE hash (djb2 xor) and not `crypto`: this module must remain
//    importable by any harness without a dependency, and PURE. It is NOT used
//    for security — only to give a stable and deterministic marker, hence
//    testable and reproducible in property-based testing.
function fingerprint(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  // ⚠️ `>>> 0` bounds h to 32 bits ⇒ AT MOST 8 hexadecimal digits. `padStart` is
  //    therefore enough to guarantee the length, and a safety `slice` would be
  //    DEAD code (equivalent mutant: unkillable by construction). We delete
  //    rather than endure an eternal survivor.
  return h.toString(16).padStart(MARKER_SIZE, '0');
}

function header(marker) {
  return (
    '⚠️ SEALED INJECTION — this block ends with ###END:' + marker + '###\n' +
    '   Marker missing at the end of the block = content TRUNCATED by the harness:\n' +
    '   then read the files cited below yourself. Do not guess.\n\n'
  );
}

function footer(marker) {
  return '\n\n###END:' + marker + '###';
}

// Announcement of the segments that do not fit in THIS emission.
//
// ⚠️ SEMANTICS CHANGED ON 05/08/2026 — this is no longer a LOSS, it is a DELAY.
//    The text used to say "NOT injected for lack of room": that was true as long
//    as the caller THREW AWAY the remainder. It now QUEUES it and re-emits it on
//    the following calls (`pretool-core.js`, prefix `remainder-`) — exactly what a
//    TCP sender does when the window is full: it DEFERS, it does not throw away.
//    Announcing a loss where there is only a wait would make the agent chase
//    docs that arrive on their own at the next action.
// ⚠️ ONE SINGLE ANNOUNCEMENT FOR BOTH PATHS (single frame AND last frame):
//    there used to be two (`announcement` / `annonceConfig`) because they said
//    DIFFERENT things ("no room" vs "`--frames N` too small").
//    Both causes merged into one — the window is full — so both texts had to
//    merge too (anti-synonym law: one concept, one word). 🛑 DO NOT reintroduce
//    a message that blames the CONFIGURATION: `--frames N` is no longer a
//    delivery ceiling, only a throughput.
// ⚠️ NEVER a silence for all that: a withheld doc must be NAMED, otherwise the
//    agent cannot know that something is missing if it acts right away. That is
//    the line that keeps the deferral HONEST.
// Maximum number of documents CITED. ⚠️ This is NOT a delivery ceiling:
//    everything is delivered no matter what, only the LIST is bounded.
const MAX_CITES = 5;

function announcement(deferred) {
  if (deferred.length === 0) return '';
  // ⚠️ WE COUNT DOCUMENTS, NOT CHUNKS (bug MEASURED on 05/08/2026).
  //    A deferred item is a chunk (`doc#1`, `doc#2`…): a 5 000-char doc on a
  //    budget of 600 produces 56 of them. The list was therefore 56 lines long
  //    and EXCEEDED the frame all by itself ⇒ no room left for content ⇒ zero
  //    emission ⇒ with the queue, an INFINITE LOOP (the same remainder
  //    re-presented at every action, forever). Deduplicating by label brings
  //    that back to 1 line per document, which is ALSO the only thing the reader
  //    cares about: "I am missing such-and-such doc", never "I am missing chunk
  //    37".
  const labels = [...new Set(deferred.map((s) => s.label))];
  // ⚠️ BOUNDED LIST: even deduplicated, 300 docs would make 300 lines and the
  //    same suffocation. The announcement is INFORMATIVE (the queue is the
  //    guarantee) — it must never be able to eat the frame it describes.
  const lines = labels.slice(0, MAX_CITES).map((l) => '   - ' + l);
  if (labels.length > MAX_CITES) lines.push('   - … and ' + (labels.length - MAX_CITES) + ' other(s)');
  return (
    '\n\n⚠️ ' + labels.length + ' doc(s) DEFERRED — the frame is full, they follow on the next tool call(s).\n' +
    '   Nothing is lost: they are queued, in order. If your action touches them NOW, read them:\n' +
    lines.join('\n')
  );
}

// Composes the rendering for a number `k` of retained segments (the first k,
// hence the best ranked — the input order CARRIES the `rank` priority, never
// recomputed here).
function compose(segments, k) {
  const kept = segments.slice(0, k);
  const deferred = segments.slice(k);
  const body = kept.map((s) => s.text).join(SEPARATOR);
  // Marker = INTRA-block integrity token (header ⟷ foot). Two distinct blocks
  // may share a marker without consequence: nothing ever compares two blocks
  // with each other. No decorative separator ⇒ no code that no test can
  // distinguish.
  const marker = fingerprint(body + deferred.length);
  const text = header(marker) + body + announcement(deferred) + footer(marker);
  return { text, marker, kept, deferred };
}

// Budget normalization — SINGLE SOURCE (authority ① of the cascade).
// ⚠️ NEVER copy it into a caller: since `plan` re-applies it internally, a 2nd
//    copy becomes a REDUNDANT guard — hence an EQUIVALENT mutant, hence an
//    eternal survivor (measured 03/08/2026: 4 survivors due to exactly that).
//    One single place decides, one single place is tested.
// ⚠️ `Infinity` = "NO LIMIT", a LEGITIMATE value since 05/08/2026 — not an
//    accident to be filtered out. A harness may DECLARE that it bounds nothing:
//    measured in the Codex 0.146.0 binary, `additionalContextLimit = 0` literally
//    means "disables spilling", hence full delivery. Without this path,
//    `Number.isFinite` rejected infinity and fell back to the FLOOR of 8 000: we
//    chunked a skill into 7 frames while the pipe accepted the whole thing at
//    once — SILENT degradation, everything stayed green. NEVER go back to a
//    plain `Number.isFinite` here.
// ⚠️ Infinite budget ⇒ everything fits in one frame ⇒ neither seal nor chunking
//    ⇒ HISTORICAL rendering to the byte. That is parity, not a special case.
function effectiveBudget(budget) {
  if (budget === Infinity) return Infinity;
  return Number.isFinite(budget) && budget > 0 ? budget : DEFAULT_BUDGET;
}

/**
 * Decides what goes out in this frame.
 *
 * ⚠️ THIS BLOCK LIVES GLUED TO `plan` — it spent weeks above `effectiveBudget`
 *    (separated from its function by a comment block): tsc then attributed its
 *    return tag to the WRONG function and manufactured 8 false cascading type
 *    errors (measured 16/08/2026, work item ㉑).
 *
 * @param {{id:string,text:string,label:string}[]} segments — ordered by decreasing priority.
 * @param {number} budget — characters. Provided by the SHELL (never guessed here).
 * @returns {{text:string, emitted:string[], deferred:{id:string,label:string}[], marker:string}}
 *
 * ⚠️ CONSERVATION INVARIANT (proven with property-based testing): every segment
 *    that comes in goes out EITHER in `emitted` OR in `deferred`. Never lost, never
 *    duplicated. That is THE promise of the framework — a segment that would
 *    disappear here would be the silent regression everything else fights.
 */
function plan(segments, budget) {
  const list = Array.isArray(segments) ? segments : [];
  const max = effectiveBudget(budget);

  // ⚠️ No "empty list" short-circuit: the nominal path below already returns
  //    exactly `{text:'', emitted:[], deferred:[], marker:''}` for an empty list
  //    (empty body ⇒ always under the sealing threshold). An early-return would
  //    be DEAD code — unkillable, hence an eternal survivor.

  // ── NOMINAL PATH: HISTORICAL format, to the byte ──
  // ⚠️ Sealing triggers ONLY near the wall. Underlying reason (extension
  //    contract, point 6): "default behaviour = the behaviour from BEFORE". A
  //    short injection has NEVER been truncated — sticking an envelope on it
  //    would cost ~250 characters on EVERY action of EVERY agent, and would make
  //    the differential diverge on 347 docs to cover a nil risk.
  // ⚠️ The margin (half of the budget, itself already under the harness
  //    threshold) absorbs a collapse of the remote threshold without leaving us
  //    exposed.
  const bareBody = list.map((s) => s.text).join(SEPARATOR);
  if (bareBody.length <= max * SEAL_THRESHOLD_RATIO) {
    return { text: bareBody, emitted: list.map((s) => s.id), deferred: [], marker: '' };
  }

  // We start from EVERYTHING and remove the least prioritary until it fits.
  // ⚠️ Decreasing and not increasing: the announcement GROWS as we remove, so
  //    the final size is not monotonic in k — a simple stacking could overflow by
  //    adding the announcement line. This direction always converges.
  for (let k = list.length; k >= 1; k--) {
    const r = compose(list, k);
    if (r.text.length <= max) {
      return { text: r.text, emitted: r.kept.map((s) => s.id), deferred: r.deferred, marker: r.marker };
    }
  }

  // Nothing fits (a single segment already exceeds on its own). We emit the BARE
  // ANNOUNCEMENT: it is tiny and says what follows.
  // ⚠️ JUSTIFICATION REWRITTEN ON 05/08/2026 — the old one was FALSE. It said:
  //    "NEVER emit the truncated segment, that would be handing the harness back
  //    the block it cuts SILENTLY". But the official Claude Code documentation
  //    (read that day) establishes that overflow is NOT silent: the harness files
  //    the surplus away and gives its path. The premise fell; the CONCLUSION
  //    remains correct, for an entirely different reason which does not depend on
  //    ANY harness:
  //    **what does not go out here is not lost — the caller queues it and
  //    re-emits it at the next action** (`pretool-core.js`). Emitting a truncated
  //    block would make the same beginning arrive TWICE (once cut, once via the
  //    queue) and would break the reassembly. Respecting the bound IS what makes
  //    the queue coherent.
  // 🛑 Do not "optimize" by inflating this frame because the harness has a net:
  //    depending on its net means building on what it can remove tomorrow
  //    without deprecation (cf CONTRACT, budget.md).
  const r = compose(list, 0);
  return { text: r.text, emitted: [], deferred: r.deferred, marker: r.marker };
}

// ═══════════════════════════════════════════════════════════════════════
// FRAMES — when one frame is not enough, we use SEVERAL.
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ THIS IS NOT IP FRAGMENTATION, IT IS TCP/MSS SEGMENTATION.
//    RFC 8900 advises against building on IP fragmentation, but its 9 causes of
//    fragility are ALL intermediate equipment (NAT, stateless firewalls, ECMP,
//    reassembly-ID collisions) — there is NONE here: hook → harness → context.
//    Its underlying recommendation ("push fragmentation responsibilities upward
//    to layers that understand application semantics") is precisely what we do:
//    we spread WHOLE SEGMENTS (a doc), we NEVER cut in the middle.
//
// ⚠️ NO CEILING DISCOVERY, EVER (RFC 8899 / PLPMTUD). Classic PMTUD breaks
//    because it depends on a return signal that gets filtered ⇒ black hole. The
//    harness spill file would be OUR ICMP, only worse: no return channel, the
//    only receiver is the agent. The RFC's answer is a conservative FLOOR
//    (`DEFAULT_BUDGET`) + NEGOTIATION where it exists (Codex:
//    `additionalContextLimit: 0`) — never blind probing.
//
// ⚠️ SELF-DESCRIBING FRAME, MANDATORY. The N hooks run IN PARALLEL: the order of
//    arrival in the context is NOT guaranteed (RFC 8899 requires robustness to
//    reordering). Without `k/N` + a COMMON marker, a missing frame is
//    undetectable — that is to say the SILENT loss that this whole module exists
//    to make impossible. NEVER remove the number.
//
// ⚠️ DETERMINISM = THE LIFE CONDITION OF THE MECHANISM. The N processes cannot
//    talk to each other; each one recomputes the WHOLE split and emits only its
//    own index. Any source of non-determinism here (clock, randomness, unstable
//    iteration order, state reading) would make the frames diverge between
//    processes. That is why this function is PURE and will remain so.
//    ⚠️ Corollary on the caller side: the N processes MUST receive the SAME
//    segments. Since `gate.decide` writes state, `porte-core` MEMOIZES the plan
//    per invocation — without which the 1st consumes the `once` and the following
//    ones no longer decide anything. See REFACTOR-PLAN §FRAMES.
// ═══════════════════════════════════════════════════════════════════════

function frameHeader(marker, k, n) {
  return (
    '⚠️ SEALED INJECTION — FRAME ' + k + '/' + n + ', end marked ###END:' + marker + '###\n' +
    '   The ' + n + ' frames carry the SAME marker and arrive OUT OF ORDER: reassemble them by their number.\n' +
    '   A missing number, or a missing marker = content truncated by the harness:\n' +
    '   then read the files cited below yourself. Do not guess.\n\n'
  );
}

// ⚠️ `annonceConfig()` DELETED on 05/08/2026 — it said "the number of declared
//    frames is TOO SMALL · increase `--frames N`". That message was FALSE in its
//    cause AND in its remedy:
//    · its CAUSE assumed that `--frames N` was a DELIVERY ceiling. It is now
//      only a THROUGHPUT: what does not fit in this emission goes into the queue
//      and arrives at the next action (`pretool-core.js`). Nothing is "not
//      emitted".
//    · its REMEDY asked the OPERATOR to reconfigure for a normal transport
//      phenomenon — the window is full, that is all. A system that demands human
//      intervention on every slightly large flow is exactly the toil this
//      framework exists to eliminate.
//    Both paths (single frame / last frame) therefore share `announcement()`.
// Rendering of ONE frame. `remainder` is never non-empty except on the LAST one.
//
// ⚠️ `sealed=false` ⇒ ENVELOPE OMITTED. IT IS THE ENVELOPE THAT GIVES WAY, NEVER
//    THE CONTENT (REAL bug of 03/08/2026: with a budget smaller than the envelope
//    itself, NO doc went out and the message blamed `--frames N` — an invented
//    "too small", and a message that LIES about its cause). Sealing is a
//    detection COMFORT; delivering is the CONTRACT. When both do not fit
//    together, we deliver. EXPLICIT degradation, never a silence.
// ⚠️ `n === 1` ⇒ SIMPLE HEADER, never the frame header (05/08/2026).
//    Since the single frame also chunks (cf `planFrames`), this path ALSO serves
//    harnesses without multi-frames. But `frameHeader` would say "the 1 frames
//    arrive OUT OF ORDER, reassemble them by their number": an absurd and FALSE
//    instruction for a lone frame. A receiver that follows a false instruction is
//    worse than an uninformed receiver.
function composeFrame(kept, remainder, k, n, marker, sealed) {
  const body = kept.map((s) => s.text).join(SEPARATOR);
  if (!sealed) return body + announcement(remainder);
  const head = n >= 2 ? frameHeader(marker, k, n) : header(marker);
  return head + body + announcement(remainder) + footer(marker);
}

// Header of a CHUNK of a doc (only when a doc is spread over several frames).
// ⚠️ Without it, an agent would receive a fragment that looks like the whole doc
// — the exact lie that this whole module prevents.
// ⚠️ THE 3 FIELDS OF THE STANDARD PATTERN (RFC 2046 `message/partial`: `id`,
//    `number` which starts at 1, `total`; RFC 6455: end marker). These are
//    EXACTLY the pieces of information a receiver needs in order to reassemble
//    without ambiguity: who it belongs to, where it goes, when it is complete.
//    Remove NONE of them — each one removes a reassembly guarantee.
function chunkHeader(label, j, m) {
  return '⟦ ' + label + ' — CHUNK ' + j + '/' + m + ' : reassemble the ' + m + ' chunks in order before reading ⟧\n';
}

/**
 * Cuts segments that are too heavy into deliverable CHUNKS.
 *
 * ⚠️ REASON FOR BEING (03/08/2026, maintainer's decision): **the framework
 *    DELIVERS, period.** It is not up to it to decree that a content is too big
 *    — that would make the author carry a defect of the transport. Before, a
 *    segment was INDIVISIBLE and a doc heavier than a frame NEVER arrived. That
 *    is no longer the case: undeliverability is now IMPOSSIBLE BY CONSTRUCTION.
 *
 * ⚠️ WHAT MADE INDIVISIBILITY NECESSARY HAS DISAPPEARED. The rule said:
 *    "an amputated doc looks complete, therefore it lies". That was true BEFORE
 *    the frames. Now each chunk carries `CHUNK j/m` and travels in a numbered
 *    frame `k/N` with the common marker: the fragment ANNOUNCES itself as a
 *    fragment and the reassembly is verifiable. No lie possible any more.
 *    ⚠️ NEVER remove the chunk header — it is IT that makes the difference
 *    between "split" and "amputated".
 *
 * ⚠️ Cuts by CHARACTERS (the unit the harness counts), not by lines: a single
 *    line can by itself exceed a frame.
 */
function fragment(segments, capability) {
  const chunks = [];
  for (const s of segments) {
    // ── PATH 1: it fits ⇒ we do not touch it. No header, no loop.
    if (s.text.length <= capability) { chunks.push(s); continue; }

    // ── PATH 2: it does not fit ⇒ we cut. There is no path 3.
    // ⚠️ The room for the header is subtracted from the capacity (width in the
    //    WORST case, 3 digits): otherwise the composed chunk would exceed the
    //    frame and the bound would be false. `Math.max(1, …)` guarantees strict
    //    progress whatever the frame — without it, a tiny capacity would cause an
    //    infinite loop or would make the content DISAPPEAR (real bug,
    //    03/08/2026).
    // ⚠️ THE CHUNK HEADER GIVES WAY WHEN IT DOES NOT FIT — same doctrine as the
    //    seal: **delivering comes before describing.** PRE-EXISTING defect
    //    revealed on 05/08/2026: `Math.max(1, capability - header)` guaranteed 1
    //    useful character, but the RENDERED chunk was then worth `header + 1` —
    //    hence BIGGER than the capacity it is supposed to respect. Nobody saw it
    //    because nothing forced that chunk to be emitted; the progress guarantee
    //    did.
    //    Measured result: a frame of 419 chars for a budget of 340.
    // ⚠️ Without a header, the chunk loses its `j/m` — that is a LOSS OF
    //    DESCRIPTION, never of content, and it only happens under a frame smaller
    //    than the header itself (absurd regime, outside production).
    //    The alternative would be an undeliverable chunk: the choice is made.
    // 🛑 Do NOT "restore the header everywhere on principle": that would
    //    reintroduce a chunk exceeding its own bound, hence a frame emitted above
    //    the budget — exactly what this whole module prevents.
    const headerWidth = chunkHeader(s.label, 999, 999).length;
    const withHeader = capability > headerWidth;
    const usable = withHeader ? capability - headerWidth : Math.max(1, capability);

    // Cut on LINE BOUNDARIES (RFC 2046 § message/partial): cutting in the middle
    // of a line breaks readability for nothing. A line longer than a frame is cut
    // clean — that is the only case where we cut inside a word.
    const tranches = [];
    let courante = '';
    for (const line of s.text.split('\n')) {
      let l = line;
      // ⚠️ PROVEN EQUIVALENT, do not try to kill it: `>=` gives EXACTLY the same
      //    split. Reason: a line exactly `usable` long cannot merge with anything
      //    (any addition would make it overflow), so pushing it right away or
      //    keeping it in the buffer produces the same sequence. Verified by
      //    exhaustive differential on 03/08/2026: 200 000 random inputs (line
      //    lengths 0-8, `usable` 1-6), ZERO divergence.
      //    We keep `>`: it is the form that says "does not fit", the real meaning.
      // Stryker disable next-line EqualityOperator
      while (l.length > usable) { // monster line: we chop it up
        if (courante) { tranches.push(courante); courante = ''; }
        tranches.push(l.slice(0, usable));
        l = l.slice(usable);
      }
      const candidate = courante ? courante + '\n' + l : l;
      if (candidate.length > usable) { tranches.push(courante); courante = l; }
      else courante = candidate;
    }
    if (courante) tranches.push(courante);

    const m = tranches.length;
    tranches.forEach((t, j) => {
      chunks.push({
        // ⚠️ The id CARRIES the `j/m`, it does not settle for the number
        //    (06/08/2026). The TOTAL existed NOWHERE else than in the text of the
        //    header: the badge could therefore not say "chunk 3/7", and the agent
        //    saw 7 identical lines "🧩 skill: ctxroute" without knowing it was ONE
        //    document. This is description, never delivery — but a transport one
        //    cannot READ gets taken for a breakdown (reported by the maintainer:
        //    "it's scary").
        // ⚠️ `baseId` cuts at the FIRST `#`: `doc#3/7` → `doc`, unchanged. A
        //    re-chunked chunk (capacity lowered between two actions) gives
        //    `doc#3/7#2/4` — the base remains `doc`, hence reading the LAST `#`
        //    in `chunkPart`. NEVER read the first one.
        id: s.id + '#' + (j + 1) + '/' + m,
        label: s.label,
        text: (withHeader ? chunkHeader(s.label, j + 1, m) : '') + t,
      });
    });
  }
  return chunks;
}

function emptyFrame() {
  return { text: '', emitted: [], deferred: [], marker: '' };
}

/**
 * Splits into `nbFrames` frames. Each caller (process) takes ITS index.
 *
 * @returns {{text:string, emitted:string[], deferred:{id,label}[], marker:string}[]}
 *          Array of length `nbFrames` (index 0 = frame 1/N).
 *
 * ⚠️ CONSERVATION INVARIANT, REINFORCED: every segment that comes in is in
 *    EXACTLY ONE frame, or in the announcement of the last one. Never lost, never
 *    DUPLICATED between two frames (a duplicate would cost twice the tokens and
 *    would make the agent doubt the integrity of the reassembly).
 *
 * ⚠️ PARITY (extension contract §6): multi-frame mode engages ONLY if an eviction
 *    would have taken place in a single frame. Everything that passes today goes
 *    out EXACTLY as today, to the byte — the switch can therefore only modify
 *    cases that were ALREADY broken. Do NOT "simplify" by systematically going
 *    through the frames path.
 */
function planFrames(segments, budget, nbFrames) {
  const list = Array.isArray(segments) ? segments : [];
  const max = effectiveBudget(budget); // cf. SINGLE SOURCE — never copy the cascade here
  // ⚠️ `>= 2` and NOT `> 1`: both are semantically identical, but `> 1` makes the
  //    mutant `>= 1` EQUIVALENT (at `nbFrames = 1` both branches return 1) hence
  //    UNKILLABLE. With `>= 2`, the mutant `> 2` changes the result as soon as
  //    there are 2 frames and dies. Write the TESTABLE form, always.
  const n = Number.isInteger(nbFrames) && nbFrames >= 2 ? nbFrames : 1;

  // ── PARITY PATH ── fits in one frame ⇒ behaviour from before, to the byte.
  // ⚠️ THE CONDITION `n === 1 ||` WAS REMOVED ON 05/08/2026 — it was a HOLE, and
  //    the only one that made a doc REALLY undeliverable.
  //    Before: `n === 1` returned the result of `plan`, which does NOT chunk. A
  //    doc heavier than the frame therefore went out with ZERO content, merely
  //    announced — forever. Without a queue that was a loss; WITH the queue it is
  //    worse, a LOOP: the same remainder would be re-presented at every action
  //    without ever progressing by a single byte.
  //    Now: as soon as there is surplus, we go through chunking, even with a
  //    single frame. The loop over frames 1..N-1 then runs zero times and only
  //    the last one (= the only one) is composed — the code is the SAME, it just
  //    delivers over several ACTIONS instead of several frames.
  // ⚠️ THIS IS WHAT MAKES CODEX AS COMPLETE AS CLAUDE CODE. Codex has no
  //    multi-frames; it now has the same full-delivery guarantee, with a lower
  //    THROUGHPUT. NEVER restore the `n === 1` short-circuit "for parity": the
  //    parity aimed at is that of THE CASE THAT FITS (line below), never that of
  //    the case that overflows.
  const solo = plan(list, max);
  if (solo.deferred.length === 0) {
    const out = [solo];
    for (let i = 1; i < n; i++) out.push(emptyFrame());
    return out;
  }

  // Marker COMMON to the N frames: it identifies the EMISSION, not the block.
  // Derived from the whole content ⇒ identical in the N processes (determinism).
  const marker = fingerprint(list.map((s) => s.text).join(SEPARATOR) + n);

  // Everything that exceeds the capacity of a frame is CHUNKED, never discarded.
  // Overhead computed in the WORST case (`n/n`, the widest in digits): a safe
  // bound, never an optimistic one.
  // ⚠️ THERE ARE NO MORE "IMPOSSIBLES" (03/08/2026). Before, a segment heavier
  //    than a frame was set aside and only ANNOUNCED: it NEVER arrived. From now
  //    on it is CHUNKED and delivered. The framework DELIVERS — it does not judge
  //    the size of what is entrusted to it.
  // ⚠️ NEGATIVE CAPACITY = THE BUDGET DOES NOT EVEN CARRY THE ENVELOPE. We do NOT
  //    give up delivering for all that: we UNSEAL and fill the whole frame with
  //    content. Without this path, a badly set budget made ZERO doc go out while
  //    blaming `--frames N` — undeliverability + false message, the two defects
  //    this module exists to make impossible.
  const capability = frameCapacity(max, n);
  const sealed = capability > 0;
  const rest = fragment(list, sealed ? capability : max);

  const groups = [];
  // Frames 1..N-1: greedy filling, priority order PRESERVED (the input order
  // CARRIES the rank — never re-sort here).
  for (let i = 0; i < n - 1; i++) {
    const kept = [];
    while (rest.length > 0 && composeFrame(kept.concat([rest[0]]), [], i + 1, n, marker, sealed).length <= max) {
      kept.push(rest.shift());
    }
    groups.push(kept);
  }

  // LAST frame: it carries the announcement of everything that found no room.
  // ⚠️ Decreasing, same reason as `plan`: the announcement GROWS as we remove, so
  //    the final size is not monotonic.
  // ⚠️ The initialization IS the "k = 0" case (nothing retained, everything
  //    announced): that is why the loop stops at 1. Making it go down to 0 would
  //    recompute these two values identically ⇒ EQUIVALENT mutant.
  //    ⚠️ It is ALSO the safety net when the budget is so small that the bare
  //    announcement exceeds it: we emit the announcement anyway (saying "this is
  //    missing" is better than silence — same arbitration as `plan`).
  let last = [];
  // ⚠️ NO defensive `.slice()`: nothing mutates `rest` downstream any more, so
  //    the copy would be UNOBSERVABLE — that is to say an EQUIVALENT mutant, hence
  //    an eternal survivor (measured 03/08/2026). Fleet doctrine: we ELIMINATE
  //    equivalence by construction, we NEVER disable it.
  let finalDeferred = rest;
  // What we CITE in the announcement — normally identical to what we defer.
  // It departs from it only in the case of the progress guarantee below.
  let cites = rest;
  // ⚠️ NO "OPTIMIZED" STARTING BOUND HERE — ATTEMPTED THEN REMOVED on
  //    05/08/2026, and it must NOT be reintroduced without a NEW measurement.
  //    The idea was to jump to the first `k` that stood a chance (raw sum of the
  //    texts ≤ max), to avoid the loop recomposing the whole string on each
  //    attempt. It was CORRECT and strictly without effect on the result — and
  //    that is precisely the problem: **2 EQUIVALENT mutants, hence 2 eternal
  //    survivors** (score fell to 98.85 %, below the threshold of 99).
  //    Fleet doctrine, written higher up in this file: we ELIMINATE equivalence
  //    by construction, we never DISABLE it.
  //    ⚠️ And the need was not real: the measured slowness came from a budget of
  //    400 characters — SMALLER than the envelope itself (~330), an absurd regime
  //    that does not exist in production. At the real budget (8 000), a remainder
  //    of 500 KB makes ~65 chunks: the loop is instantaneous.
  // 🛑 If one day a REAL corpus makes this slow, the answer is not to put back an
  //    unobservable bound: it is to make the cost observable (measurement) then to
  //    change the ALGORITHM, not to add a shortcut that no test can distinguish.
  for (let k = rest.length; k >= 1; k--) {
    const attempt = rest.slice(0, k);
    const leftBehind = rest.slice(k);
    if (composeFrame(attempt, leftBehind, n, n, marker, sealed).length <= max) {
      last = attempt;
      finalDeferred = leftBehind;
      cites = leftBehind;
      break;
    }
  }

  // ⚠️ PROGRESS GUARANTEE — WITHOUT IT, THE QUEUE IS AN INFINITE LOOP.
  //    (Defect MEASURED on 05/08/2026 by simulating the real loop: budget 600, a
  //    doc of 5 000 chars ⇒ 56 chunks ⇒ ZERO emitted, indefinitely.)
  //    The loop above may retain nothing: the announcement, even bounded, can by
  //    itself fill a tiny frame. As long as we THREW AWAY the remainder, that was
  //    a one-off loss; now that we RE-PRESENT it at the next action, a turn
  //    without progress repeats FOREVER and nothing ever moves forward again.
  //    So we force ONE chunk — `fragment` guarantees that it fits in the frame —
  //    and we SACRIFICE THE ANNOUNCEMENT to make room for it. That is the doctrine
  //    already applied to the seal: **delivering comes before describing.** A
  //    frame that does not describe its remainder remains honest (the queue will
  //    deliver it); a frame that delivers nothing is not.
  // 🛑 NEVER remove this path taking it for a textbook case: it is the ONLY thing
  //    that makes termination certain. Property ⑧.
  if (last.length === 0 && rest.length > 0) {
    last = [rest[0]];
    finalDeferred = rest.slice(1);
    cites = [];
  }
  groups.push(last);

  return groups.map((kept, i) => {
    const deferred = i === n - 1 ? finalDeferred : [];
    // ⚠️ WHAT WE COMPOSE ≠ WHAT WE REPORT, in the single case of forced progress:
    //    the frame does not display the announcement (no room) but the REAL
    //    remainder is indeed returned to the caller, who re-queues it. NEVER
    //    realign the two "for symmetry" — that would be either re-displaying the
    //    announcement that suffocates the frame, or LOSING the remainder by
    //    keeping it from the caller, that is to say resurrecting the original
    //    defect.
    const aCiter = i === n - 1 ? cites : [];
    // ⚠️ A frame WITHOUT content is NOT emitted (empty text ⇒ the shell exits
    //    silently). Emitting an envelope to announce nothingness would cost tokens
    //    on EVERY action of EVERY agent.
    // ⚠️ THE CONDITION `&& deferred.length === 0` WAS REMOVED on 05/08/2026:
    //    the PROGRESS GUARANTEE makes it REDUNDANT by construction — as soon as
    //    something is left, a chunk is forced into the last frame, so "nothing
    //    retained" now implies "nothing deferred". A redundant guard is an
    //    EQUIVALENT mutant (eternal survivor): fleet doctrine, we eliminate it, we
    //    do not disable it.
    // 🛑 If the progress guarantee ever disappeared, THIS line would have to come
    //    back — they are not independent.
    if (kept.length === 0) return emptyFrame();
    return {
      text: composeFrame(kept, aCiter, i + 1, n, marker, sealed),
      emitted: kept.map((s) => s.id),
      deferred,
      // ⚠️ Unsealed ⇒ EMPTY marker: announcing a seal that is absent from the text
      //    would be exactly the "green that lies". What the gate reports must
      //    always describe what ACTUALLY went out.
      marker: sealed ? marker : '',
    };
  });
}

/**
 * CONTENT capacity of a sealed frame — how many characters a frame can carry
 * once the envelope is deducted.
 *
 * ⚠️ THIS IS NOT A DOC SIZE LIMIT, and it must NEVER become one again. It is a
 *    splitting step: beyond it, the doc is CHUNKED, never refused. ⚠️ NEVER build
 *    a size gate on this — the old comment demanded it ("a size gate MUST rely on
 *    this"), it dated from the DEAD doctrine where a segment was indivisible. The
 *    framework DELIVERS; the size of a doc is none of its business.
 * ⚠️ May be NEGATIVE (budget smaller than the envelope): the caller then UNSEALS
 *    instead of giving up — cf. `composeFrame(…, sealed)`.
 * ⚠️ DERIVED from the REAL header (never a copied constant): rewording the header
 *    changes the capacity, and the splitting follows automatically.
 */
function frameCapacity(budget, nbFrames) {
  // ⚠️ `Math.max(2, …)` and not `… >= 2 ? … : 2`: at nbFrames = 2 both branches
  //    of the ternary return the same thing ⇒ UNKILLABLE comparator.
  //    Same lesson as `parseFrameArgs` — write the testable form, always.
  const n = Number.isInteger(nbFrames) ? Math.max(2, nbFrames) : 2;
  const m = '0'.repeat(MARKER_SIZE);
  return effectiveBudget(budget) - (frameHeader(m, n, n).length + footer(m).length);
}

// FIXED cost of sealing (header + foot), excluding content and excluding the
// announcement.
// ⚠️ DERIVED, never a copied constant: the header is text that may be reworded,
//    and a hardcoded value would diverge silently — the budget would become false
//    without anything turning red. Used for calibrating the tests and by any
//    shell that wants to size its frame.
function envelopeSize() {
  const m = '0'.repeat(MARKER_SIZE);
  return header(m).length + footer(m).length;
}

// ⚠️ IDENTITY OF A DOCUMENT, single source (05/08/2026). `fragment` sets ids
//    `<doc>#<j>`; EVERYTHING that reasons in terms of a DOCUMENT (dedup with the
//    queue, statusline badge, attribution to a source) must go back through the
//    base. Without this fallback, a half-delivered document would be seen as a
//    DIFFERENT document from itself and re-injected twice. It used to live as a
//    local copy in pretool-core.js — moved up here with the queue: it is a rule of
//    the TRANSPORT, not of the orchestration of one particular emitter.
function baseId(id) {
  const i = id.indexOf('#');
  return i === -1 ? id : id.slice(0, i);
}

/**
 * `doc#3/7` → `{ j: 3, m: 7 }` · whole document → `null`.
 *
 * ⚠️ READS THE LAST `#`, NEVER THE FIRST — the opposite of `baseId`, and that is
 *    DELIBERATE: a chunk re-queued then re-chunked (capacity lowered between two
 *    actions) carries `doc#3/7#2/4`. The BASE is at the beginning, the POSITION at
 *    the end. Reading the first `#` would give `3/7#2/4`, hence a silent NaN.
 * ⚠️ TOTAL — returns `null` on anything that is not a chunk (id without `#`,
 *    malformed suffix, old format `doc#3` from a queue written BEFORE 06/08/2026
 *    and read back afterwards). This last case is REAL: the queue survives a
 *    redeployment. A silent badge is correct; a badge displaying `3/NaN` would
 *    cast doubt on the delivery itself, when it is intact.
 */
function chunkPart(id) {
  if (typeof id !== 'string') return null;
  const i = id.lastIndexOf('#');
  if (i === -1) return null;
  const mm = /^(\d+)\/(\d+)$/.exec(id.slice(i + 1));
  return mm ? { j: Number(mm[1]), m: Number(mm[2]) } : null;
}

/**
 * Badge suffix announcing that the frame carries CHUNKS: ` (chunk 3/7)`.
 *
 * ⚠️ WHY THIS SUFFIX EXISTS (06/08/2026): without it, a skill delivered in 7
 *    chunks displayed SEVEN identical lines "🧩 skill: ctxroute". The maintainer
 *    read it as the framework running wild — "it's scary" — when it was a normal
 *    and unique delivery. **A correct but unreadable transport gets taken for a
 *    breakdown**, and a system believed to be broken ends up unplugged.
 *    Transparency is therefore not cosmetic.
 * ⚠️ DESCRIPTION, NEVER DELIVERY: this suffix can evict NOTHING — it is computed
 *    AFTER the splitting, on what is already retained, and does not enter into the
 *    frame budget. NEVER make it enter: that would hold the content hostage to its
 *    own commentary (doctrine "delivering comes before describing", already paid
 *    for twice on the announcement and the chunk header).
 * ⚠️ ONE ONLY per document (dedup by base, FIRST chunk present): a frame may carry
 *    `doc#2/7` AND `doc#3/7`, which would display the same document twice. Several
 *    chunked documents in the same frame are joined by ` · `, the separator already
 *    used for source messages.
 * ⚠️ Returns `''` when nothing is chunked — the NORMAL case, hence badge UNCHANGED
 *    to the byte. That is what keeps the parity of the differentials.
 */
function chunkSuffix(emitted) {
  if (!Array.isArray(emitted)) return '';
  const vus = new Set();
  const parts = [];
  for (const id of emitted) {
    const p = chunkPart(id);
    if (!p) continue;
    const base = baseId(id);
    if (vus.has(base)) continue;
    vus.add(base);
    parts.push(p.j + '/' + p.m);
  }
  return parts.length === 0 ? '' : ' (chunk ' + parts.join(' · ') + ')';
}

/**
 * EMISSION ORDER — the queue first, the fresh content next.
 *
 * ⚠️ THIS IS NOT A PREFERENCE, IT IS THE CONDITION FOR REASSEMBLY (RFC 6455):
 *    a fragmented document is NEVER interleaved with another. Inserting fresh
 *    content in the middle of its `CHUNK j/m` would leave the receiver unable to
 *    know which chunk belongs to what. NEVER sort or prioritize here.
 * ⚠️ DEDUP MANDATORY BY DOCUMENT: a `dumb` doc is re-decided at EVERY action.
 *    Without this filter, a doc still being delivered would be re-stacked WHOLE
 *    behind its own chunks — a token duplicate AND an impossible reassembly. The
 *    queue is AUTHORITATIVE as long as it is not emptied.
 */
function orderSegments(pending, fresh) {
  const file = Array.isArray(pending) ? pending : [];
  const freshOnes = Array.isArray(fresh) ? fresh : [];
  const dejaEnFile = new Set(file.map((s) => baseId(s.id)));
  return file.concat(freshOnes.filter((s) => !dejaEnFile.has(baseId(s.id))));
}

// ⚠️ `fragment` is EXPORTED in order to be sealed DIRECTLY: it is a SCANNER (it
//    interprets a format — lines — to produce slices), and the fleet doctrine
//    imposes property-based testing on every scan. Testing it through
//    `planFrames` left its boundaries untestable: 6 mutants survived there on
//    03/08/2026 while all the rest of the module was at 100 %.
//    This is NOT an extension of the public API — no shell calls it.
module.exports = { plan, planFrames, frameCapacity, fragment, baseId, chunkPart, chunkSuffix, orderSegments, DEFAULT_BUDGET, MARKER_SIZE, fingerprint, envelopeSize };
