// ═══════════════════════════════════════════════════════════════════════
// differential-normalise — MANDATORY NEGATIVE-CHECK
// ═══════════════════════════════════════════════════════════════════════
// 🛑 REASON FOR EXISTING: `withoutOrdinal()` DELIBERATELY WEAKENS the differentials
//    (it removes material before comparison). An untested comparison
//    function can swallow a REAL regression, and both
//    safety nets would stay GREEN on it. That is the only risk of the module, and these
//    four parts are what holds it.
// ⚠️ Same discipline as the negative-check of `unseal()` in
//    `pretool-differential.test.js` — NEVER ship one without the other.
import { test } from 'vitest';
import assert from 'node:assert';
import { withoutOrdinal, reassemble } from '../src/differential-normalize.js';
// ⚠️ THE FIXTURES ARE COMPOSED BY THE ENGINE ITSELF (`budget.js::planFrames`),
//    never hand-written: a reader tested against a hand-written envelope proves
//    that it can read WHAT I BELIEVE the engine emits. The whole class of defect
//    this repo fights is the twin that drifts.
import { planFrames } from '../src/budget.js';

const NU = 'doc body\n[source: .claude/hooks/docs/a.md]';

test('withoutOrdinal: removes the ordinal placed after the source tag, and NOTHING else', () => {
  assert.strictEqual(withoutOrdinal(NU + ' [DOC 2/5]'), NU);
  // Several documents in the same context: all cleaned.
  const deux = NU + ' [DOC 1/2]\n\n---\n\nother\n[source: docs/mcp/odoo.md] [DOC 2/2]';
  assert.strictEqual(withoutOrdinal(deux).includes('[DOC '), false);
  assert.strictEqual(withoutOrdinal(deux).includes('[source: docs/mcp/odoo.md]'), true,
    'the source tag MUST survive — it is the path the agent follows to fix the doc');
});

test('withoutOrdinal: a context WITHOUT an ordinal comes back out byte for byte', () => {
  assert.strictEqual(withoutOrdinal(NU), NU);
  assert.strictEqual(withoutOrdinal(''), '');
});

// 🛑 THE PART THAT COUNTS — without it, a BLIND erasure would pass the three
//    others while making the differentials one-eyed on real content.
test('withoutOrdinal: a [DOC x/y] from the BODY of a doc SURVIVES (never a blind erasure)', () => {
  const bodyThatMentionsIt = 'the frame carries [DOC 1/3]\n[source: .claude/hooks/docs/b.md]';
  assert.strictEqual(withoutOrdinal(bodyThatMentionsIt), bodyThatMentionsIt);
  // And the mixed case: the body keeps its own, the tag loses its own.
  const mixed = 'example [DOC 9/9] in the text\n[source: .claude/hooks/docs/c.md] [DOC 1/2]';
  assert.strictEqual(withoutOrdinal(mixed),
    'example [DOC 9/9] in the text\n[source: .claude/hooks/docs/c.md]');
});

test('withoutOrdinal: a CONTENT divergence stays VISIBLE after normalization', () => {
  const a = withoutOrdinal(NU + ' [DOC 2/5]');
  const b = withoutOrdinal(NU.replace('doc body', 'DOC BODY') + ' [DOC 2/5]');
  assert.notStrictEqual(a, b, 'the normalization must NEVER mask a content difference');
  // A different source path = a REAL divergence, it must survive.
  const c = withoutOrdinal(NU.replace('a.md', 'z.md') + ' [DOC 2/5]');
  assert.notStrictEqual(a, c);
});

// TOTAL — called on an absent value (`undefined` context on the MCP side when
// the hook injects nothing), it must NOT throw: a differential that crashes
// reads like an engine failure.
test('withoutOrdinal: TOTAL — a non-string input is returned as is, never a throw', () => {
  for (const x of [undefined, null, 42, {}]) assert.strictEqual(withoutOrdinal(x), x);
});

// ═══════════════════════════════════════════════════════════════════════
// reassemble — the EQUALITY given back, and its MANDATORY negative-check
// ═══════════════════════════════════════════════════════════════════════
// 🛑 WHAT THESE CELLS EXIST FOR. Until 21/08/2026 the file differential drove
//    ONE frame and compared the first chunk as a PREFIX: a divergence past
//    chunk 1 was INVISIBLE. Cell ② is that exact blind spot, and it is the
//    reason the whole change was made — without it we would have swapped one
//    weak net for another and nobody would have known.
// ⚠️ Fixtures are THUNKS evaluated inside the cells (perTest: a module-level
//    const calling mutated code is a static mutant, hence a false survivor).
const FIX_BUDGET = 2000;
const FIX_FRAMES = 8;
// A document that REALLY outgrows a frame, in lines short enough to stay in the
// protocol's line-boundary regime (a monster line is cut mid-line and is a
// DECLARED false red, cf. the module header).
const bigDoc = () => {
  const lines = [];
  for (let i = 1; i <= 120; i++) lines.push('line ' + i + ' — ' + 'x'.repeat(40));
  return lines.join('\n') + '\n[source: docs/x.md]';
};
const seg = (id, text, label) => ({ id, text, label });
// The frames the ENGINE composes, emptied ones dropped — exactly what a caller
// collects by driving frame 1, 2, … until one carries nothing.
const driven = (segments, budgetMax, n) => {
  const texts = [];
  for (const f of planFrames(segments, budgetMax, n)) if (f.text !== '') texts.push(f.text);
  return texts;
};
const chunked = () => driven([seg('x', bigDoc(), 'docs/x.md')], FIX_BUDGET, FIX_FRAMES);
// A SEALED lone frame: body over half the budget (⇒ sealed) yet fitting whole
// (⇒ no chunk). Budget chosen between those two walls.
const soloDoc = () => 'a small sealed doc\n' + 'y'.repeat(300) + '\n[source: docs/s.md]';
const solo = () => driven([seg('s', soloDoc(), 'docs/s.md')], 640, 1)[0];

// ① THE FIX: a doc that outgrew one frame is compared WHOLE again.
test('reassemble: a CHUNKED multi-frame delivery comes back EQUAL to the whole document', () => {
  const doc = bigDoc();
  const texts = chunked();
  // ANTI-VACUITY: this cell proves nothing if the engine did not really chunk.
  assert.ok(texts.length >= 3, `the fixture must span several frames (got ${texts.length})`);
  assert.ok(texts[1].includes(' — CHUNK 2/'), 'frame 2 must carry a CONTINUATION chunk');
  const r = reassemble(texts);
  assert.ok(r.ok, r.reason);
  assert.strictEqual(r.text, doc, 'the WHOLE document, byte for byte — no longer a prefix');

  // A LONE sealed frame: envelope removed, body returned EXACTLY (this is what
  // the differential's local `unseal()` used to do, before it became a twin).
  assert.strictEqual(reassemble([solo()]).text, soloDoc());
  // No envelope at all (under the sealing threshold) ⇒ bodies glued by the
  // document SEPARATOR, the historical rendering to the byte.
  assert.strictEqual(reassemble(['doc A', 'doc B']).text, 'doc A\n\n---\n\ndoc B');
});

// ② 🛑 THE CELL THAT JUSTIFIES THE WHOLE CHANGE: the LATE-chunk blind spot.
test('reassemble: a divergence in the LAST chunk turns it RED (the prefix could not see it)', () => {
  const doc = bigDoc();
  const texts = chunked();
  const last = texts.length - 1;
  const sabotagedText = texts.slice();
  sabotagedText[last] = texts[last].replace('line 120', 'LINE 120');
  // ANTI-VACUITY: the sabotage must land in the LAST frame, nowhere else.
  assert.notStrictEqual(sabotagedText[last], texts[last], 'the sabotage did not touch the last frame');
  const r = reassemble(sabotagedText);
  assert.ok(r.ok, r.reason);
  assert.notStrictEqual(r.text, doc, 'a divergence past chunk 1 MUST be seen — that is the point');
});

// ③ FAIL-CLOSED ON THE ENVELOPE. Each reason is asserted WHOLE: a message
//    nobody reads is a message a mutant can empty without anyone noticing.
test('reassemble: an envelope it cannot place is REFUSED, never compared anyway', () => {
  const texts = chunked();
  assert.strictEqual(reassemble([]).ok, false);
  assert.strictEqual(reassemble('not an array').reason, 'no frame was delivered');
  assert.strictEqual(reassemble([texts[0], 42]).reason, 'frame 2 is not a string');
  // A frame out of place — this is also what catches a DUPLICATED frame number.
  assert.strictEqual(reassemble([texts[1]]).reason,
    `frame 1 announces itself as FRAME 2/${FIX_FRAMES}`);
  assert.strictEqual(reassemble([texts[0], texts[1].replace(`/${FIX_FRAMES},`, '/9,')]).reason,
    'frame 2 belongs to ANOTHER emission: total or end marker differ');
  // 🛑 THE OTHER HALF OF THAT SAME GUARD, and it must be asserted APART: the same
  //    TOTAL with ANOTHER end marker is a frame of another emission too. Sabotaging
  //    only the total leaves the marker clause deciding NOTHING, and a clause no
  //    input can make decide is a clause that guards nothing.
  const mkTwo = /###END:([0-9a-f]+)###/.exec(texts[1])[1];
  const foreignEmission = texts[1].split(`###END:${mkTwo}###`).join('###END:00000000###');
  assert.notStrictEqual(foreignEmission, texts[1],
    'the sabotage must really change the marker, at the HEAD and at the FOOT');
  assert.strictEqual(reassemble([texts[0], foreignEmission]).reason,
    'frame 2 belongs to ANOTHER emission: total or end marker differ');
  // A LONE-frame seal can only ever be alone.
  assert.strictEqual(reassemble([solo(), texts[1]]).reason,
    'a LONE-frame seal arrived inside a delivery of 2 frames');
  // 🛑 THE OLD `unseal()` CHECK, KEPT: head and foot markers that disagree are a
  //    TRANSPORT defect — unsealing anyway would swallow it.
  const s = solo();
  const mk = /###END:([0-9a-f]+)###/.exec(s)[1];
  const lopsided = s.replace(`###END:${mk}###`, '###END:00000000###');
  assert.notStrictEqual(lopsided, s, 'the sabotage must really change the HEAD marker');
  assert.strictEqual(reassemble([lopsided]).reason, 'frame 1 carries a seal this reader cannot parse');
  // A delivery that still DEFERS is not a whole document: nothing to compare.
  const partial = driven([seg('s', 'small doc\n[source: docs/s.md]', 'docs/s.md'),
    seg('x', bigDoc(), 'docs/x.md')], FIX_BUDGET, 1);
  assert.ok(partial[0].includes('doc(s) DEFERRED'), 'the fixture must really defer');
  assert.strictEqual(reassemble(partial).reason,
    'frame 1 still DEFERS documents: this action delivered less than the corpus');
});

// ④ FAIL-CLOSED ON THE CHUNK NUMBERS — a missing number must never be glued
//    over in silence: that would make the whole net hollow.
test('reassemble: a chunk that is missing, out of order or unplaceable is REFUSED', () => {
  const texts = chunked();
  const m = Number(/ — CHUNK 1\/(\d+) /.exec(texts[0])[1]);
  // A HOLE in the sequence: chunk 2 never arrives. The frame NUMBER is put back
  // in place on purpose — otherwise the envelope check above would fire first
  // and this cell would prove nothing about the chunk numbers.
  const shifted = texts[2].replace(`FRAME 3/${FIX_FRAMES}`, `FRAME 2/${FIX_FRAMES}`);
  assert.notStrictEqual(shifted, texts[2], 'frame 3 must really be renumbered');
  assert.strictEqual(reassemble([texts[0], shifted]).reason,
    `frame 2 does not open on CHUNK 2/${m} of docs/x.md: a chunk is missing, duplicated or out of order`);
  // 🛑 THE THREE OTHER WAYS A CONTINUATION CAN BE WRONG — each isolated so that ONE
  //    clause of the guard decides ALONE. The hole above (a wrong NUMBER) was the
  //    only one exercised, so the three others were ABSORBED by it: a clause that
  //    no input can make decide by itself is a clause that guards nothing, and it
  //    would be deleted tomorrow by someone who saw no test go red.
  // (a) NO chunk header at all while a document is open. A REAL frame shape:
  //     `fragment` drops the header when the capacity cannot carry it.
  //     ANTI-VACUITY: with two headers, removing the first would leave the second
  //     at a non-zero offset and (a) would silently degenerate into (b).
  assert.strictEqual(texts[1].match(/ — CHUNK \d+\/\d+ : /g).length, 1,
    'frame 2 must carry exactly ONE chunk header');
  const headless = texts[1].replace(
    /⟦ .+? — CHUNK \d+\/\d+ : reassemble the \d+ chunks in order before reading ⟧\n/, '');
  assert.notStrictEqual(headless, texts[1], 'frame 2 must really lose its chunk header');
  assert.strictEqual(reassemble([texts[0], headless]).reason,
    `frame 2 does not open on CHUNK 2/${m} of docs/x.md: a chunk is missing, duplicated or out of order`);
  // (b) The RIGHT chunk of the RIGHT document, but NOT on the first byte: a
  //     fragmented document is never interleaved (RFC 6455), so material sitting
  //     before the continuation cannot be placed.
  const shoved = texts[1].replace('⟦ docs/x.md', 'preamble⟦ docs/x.md');
  assert.notStrictEqual(shoved, texts[1], 'frame 2 must really carry material before its chunk');
  assert.strictEqual(reassemble([texts[0], shoved]).reason,
    `frame 2 does not open on CHUNK 2/${m} of docs/x.md: a chunk is missing, duplicated or out of order`);
  // (c) The right place, the right number — ANOTHER document. Gluing it would
  //     silently splice two docs into one and the differential would compare a
  //     chimera.
  const foreignDoc = texts[1].replace('⟦ docs/x.md', '⟦ docs/w.md');
  assert.notStrictEqual(foreignDoc, texts[1], 'frame 2 must really carry another label');
  assert.strictEqual(reassemble([texts[0], foreignDoc]).reason,
    `frame 2 does not open on CHUNK 2/${m} of docs/x.md: a chunk is missing, duplicated or out of order`);
  // A delivery that stops inside a document is INCOMPLETE, never a document.
  assert.strictEqual(reassemble([texts[0]]).reason,
    `the delivery ends inside docs/x.md: CHUNK 1/${m} was the last one seen`);
  // A continuation sitting MID-frame: gluing it with a line break or with the
  // document separator would be a GUESS, and this reader never guesses.
  const mid = 'doc A\n\n---\n\n⟦ docs/y.md — CHUNK 2/3 : reassemble the 3 chunks in order before reading ⟧\ntail';
  assert.strictEqual(reassemble([mid]).reason,
    'CHUNK 2/3 of docs/y.md sits inside frame 1: this reader will not guess how to glue it');
  // 🛑 AND THE OTHER HALF OF THAT SAME GUARD: a header that DOES open a document
  //    (`j = 1`) while another is STILL open. Only the `open !== null` clause can
  //    refuse it — asserting the wrong-number case alone leaves that clause
  //    absorbed, and this reader would then hold two open documents at once and
  //    glue the second onto the first as if it were a continuation.
  const twoOpen = '⟦ docs/y.md — CHUNK 1/2 : reassemble the 2 chunks in order before reading ⟧\nhead'
    + '\n\n---\n\n'
    + '⟦ docs/z.md — CHUNK 1/2 : reassemble the 2 chunks in order before reading ⟧\ntail';
  assert.strictEqual(reassemble([twoOpen]).reason,
    'CHUNK 1/2 of docs/z.md sits inside frame 1: this reader will not guess how to glue it');
});
