// ═══════════════════════════════════════════════════════════════════════
// budget.js — DETERMINISTIC suite (the one Stryker mutates).
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ WHY THIS SUITE EXISTS IN ADDITION TO THE PROPERTY-BASED ONE: `vitest.stryker.
//    config.mjs` only includes deterministic suites — a property test
//    replayed per mutant would make the score flaky, hence a LIAR. The repo rule
//    is explicit: "their invariant MUST have its deterministic case here".
//    The two are complementary: property = proof on generated inputs,
//    here = reproducible anchoring + material for mutation.
//
// ⚠️ perTest: EVERY evaluation of the mutated code lives INSIDE a `test()` — never a
//    fixture const at module level ("static" mutant covered by no
//    test ⇒ phantom survivor, measured 16/07/2026: score 76.67 % instead of
//    99.33 %). The fixtures below are therefore FUNCTIONS.
//
// ⚠️ DIRECT IMPORT of the mutated module (never through a re-export): the
//    perTest coverage mapping misses tests that go through a re-export.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import { plan, planFrames, frameCapacity, fragment, baseId, chunkPart, chunkSuffix, orderSegments, DEFAULT_BUDGET, MARKER_SIZE, fingerprint, envelopeSize } from '../src/budget.js';

// Fixtures = THUNKS (cf. perTest above).
const seg = (id, n, label) => ({ id, text: 'x'.repeat(n), label: label || id + '.md' });
const segs = (n, taille) => Array.from({ length: n }, (_, k) => seg('d' + k, taille));

test('empty list → empty rendering, no emission, no deferral', () => {
  const r = plan([], 5000);
  assert.strictEqual(r.texte, '');
  assert.deepStrictEqual(r.emis, []);
  assert.deepStrictEqual(r.deferred, []);
  assert.strictEqual(r.marker, '');
});

test('non-array input → treated as empty (fail-soft, never a throw)', () => {
  // The gate is fail-open: a budget that threw would silence the injection.
  for (const mauvais of [undefined, null, 'texte', 42, {}]) {
    const r = plan(mauvais, 5000);
    assert.strictEqual(r.texte, '');
    assert.deepStrictEqual(r.emis, []);
  }
});

test('NOMINAL PATH: under 50 % of the budget → HISTORICAL format, zero envelope', () => {
  // ⚠️ It is THIS case that guarantees the safe switch: the rendering must be
  //    EXACTLY the concatenation from before, to the byte.
  const list = [seg('a', 100), seg('b', 100)];
  const r = plan(list, 5000);
  assert.strictEqual(r.texte, list[0].text + '\n\n---\n\n' + list[1].text);
  assert.deepStrictEqual(r.emis, ['a', 'b']);
  assert.deepStrictEqual(r.deferred, []);
  assert.strictEqual(r.marker, '');
  assert.ok(!r.texte.includes('###END:'));
  assert.ok(!r.texte.includes('SEALED INJECTION'));
});

test('a single segment under the threshold → rendering = its BARE text (no stray separator)', () => {
  const r = plan([seg('solo', 50)], 5000);
  assert.strictEqual(r.texte, 'x'.repeat(50));
});

test('BEYOND 50 % of the budget → SEALED (header + matching end marker)', () => {
  const r = plan([seg('a', 600)], 1000);
  assert.ok(r.texte.startsWith('⚠️ SEALED INJECTION'));
  assert.strictEqual(r.marker.length, MARKER_SIZE);
  assert.ok(r.texte.includes('###END:' + r.marker + '###'));
  assert.ok(r.texte.endsWith('###END:' + r.marker + '###'));
  assert.deepStrictEqual(r.emis, ['a']);
});

test('the header ANNOUNCES the marker BEFORE the content (survives a truncation)', () => {
  // ⚠️ A truncation keeps the BEGINNING: if the warning were at the foot, it
  //    would be cut precisely in the case it is supposed to cover.
  const r = plan([seg('a', 600)], 1000);
  const posAnnonce = r.texte.indexOf('###END:' + r.marker + '###');
  const posContenu = r.texte.indexOf('xxx');
  assert.ok(posAnnonce < posContenu, 'the marker must be announced before the content');
});

test('MIXED: what does not fit is DEFERRED, counted and NAMED', () => {
  const list = segs(6, 300);
  const r = plan(list, 1200);
  assert.ok(r.emis.length > 0, 'at least one emitted');
  assert.ok(r.deferred.length > 0, 'at least one deferred');
  assert.strictEqual(r.emis.length + r.deferred.length, 6); // CONSERVATION
  assert.ok(r.texte.includes(r.deferred.length + ' doc(s) DEFERRED'));
  for (const d of r.deferred) assert.ok(r.texte.includes(d.label), 'label cited: ' + d.label);
});

test('the emitted ones are a PREFIX of the input (`rank` priority honoured)', () => {
  const list = segs(6, 300);
  const r = plan(list, 1200);
  assert.deepStrictEqual(r.emis, list.slice(0, r.emis.length).map((s) => s.id));
});

test('NOTHING fits → BARE announcement, content never truncated, nothing lost', () => {
  // ⚠️ We NEVER emit the cut segment: that would be handing the harness back the
  //    block it truncates silently, that is to say the original defect.
  const r = plan([seg('enorme', 50000)], 400);
  assert.deepStrictEqual(r.emis, []);
  assert.deepStrictEqual(r.deferred.map((d) => d.id), ['enorme']);
  assert.ok(r.texte.includes('enorme.md'));
  assert.ok(!r.texte.includes('x'.repeat(1000)), 'the content must NOT be emitted');
});

test('the rendering fits in the budget as soon as it carries content', () => {
  for (const b of [900, 1500, 3000, 7000]) {
    const r = plan(segs(8, 400), b);
    if (r.emis.length > 0) assert.ok(r.texte.length <= b, 'budget ' + b + ' exceeded: ' + r.texte.length);
  }
});

test('invalid budget → FRAMEWORK default (cascade authority ①, never a blockage)', () => {
  for (const mauvais of [undefined, null, 0, -1, NaN, Infinity, 'x']) {
    const r = plan([seg('a', 100)], mauvais);
    assert.deepStrictEqual(r.emis, ['a'], 'budget ' + String(mauvais));
  }
  assert.ok(DEFAULT_BUDGET > 0);
  assert.ok(Number.isInteger(DEFAULT_BUDGET));
});

test('DEFAULT_BUDGET stays below the lowest measured harness threshold (10 000)', () => {
  // ⚠️ RATCHET: Claude Code 2.1.220 cuts at 10 000 characters per hook.
  //    The default MUST keep a margin — a remotely driven threshold can
  //    drop without an update. Raising this value = leaving ourselves exposed again.
  assert.ok(DEFAULT_BUDGET < 10000, 'default above the measured harness threshold');
});

test('fingerprint: deterministic, fixed length, sensitive to the content', () => {
  assert.strictEqual(fingerprint('abc'), fingerprint('abc'));
  assert.strictEqual(fingerprint('abc').length, MARKER_SIZE);
  assert.notStrictEqual(fingerprint('abc'), fingerprint('abd'));
  assert.strictEqual(fingerprint('').length, MARKER_SIZE);
});

test('fingerprint: two DIFFERENT plans do not share the marker', () => {
  // Otherwise a truncated block could "validate" the marker of another block.
  const a = plan([seg('a', 600)], 1000);
  const b = plan([seg('b', 700)], 1000);
  assert.notStrictEqual(a.marker, b.marker);
});

test('envelopeSize: EXACT value (sum of header + foot, marker included)', () => {
  // ⚠️ Anchored to the character: that is what makes the budget a safe BOUND. Without
  //    an exact value, a mutant that subtracts instead of adding (or that
  //    empties the marker padding) survives — and the budget becomes false
  //    silently, so the truncation comes back (measured 31/07/2026).
  assert.strictEqual(envelopeSize(), 220);
});

test('envelopeSize: it really is the OVERHEAD of a sealed rendering', () => {
  // Link between the constant and the observable: a sealed block of a single segment
  // without any deferral weighs exactly content + envelope.
  const r = plan([seg('a', 600)], 1000);
  assert.deepStrictEqual(r.deferred, []);
  assert.strictEqual(r.texte.length, 600 + envelopeSize());
});

test('INCLUSIVE BOUND: a rendering that weighs EXACTLY the budget is accepted', () => {
  // ⚠️ Kills the mutant `<=` → `<`. An exclusive budget would evict a doc while
  //    it fits down to the character — a gratuitous loss, and an invisible one.
  // ⚠️ The reference case MUST be in the SEALED regime: under 50 % of the budget we
  //    go through the nominal path, and re-planning with the obtained size
  //    would change regime — we would no longer be testing the bound.
  const list = segs(4, 300);
  const large = plan(list, 2000);
  assert.notStrictEqual(large.marker, '', 'unsealed reference case: the test would prove nothing');
  assert.deepStrictEqual(large.deferred, []);
  const exact = plan(list, large.texte.length);
  assert.deepStrictEqual(exact.emis, large.emis);
  assert.strictEqual(exact.texte.length, large.texte.length);
});

test('DETERMINISM: two identical calls return the same byte', () => {
  const list = segs(5, 350);
  assert.deepStrictEqual(plan(list, 1400), plan(list, 1400));
});

test('segment with empty text: kept, never silently discarded', () => {
  const r = plan([seg('vide', 0), seg('plein', 100)], 5000);
  assert.deepStrictEqual(r.emis, ['vide', 'plein']);
});

test('fingerprint: REFERENCE values (anchors the loop and the padding)', () => {
  // ⚠️ Values deliberately frozen: they anchor the BOUNDS of the loop
  //    (an `i <= texte.length` would read a charCodeAt outside the string = NaN) and the
  //    zero-padding. Without them, these mutants survive (measured 31/07/2026).
  assert.strictEqual(fingerprint('abc'), '0b873285');
  assert.strictEqual(fingerprint(''), '00001505'); // left padding visible
});

test('HEADER: EXACT text — it is the contract read by the agent, not an ornament', () => {
  // ⚠️ Anchored to the character: these sentences ARE the mechanism (they tell
  //    the agent what to do if it does not see the marker). A rewording must
  //    be a conscious choice, not a silent drift.
  const r = plan([seg('a', 600)], 1000);
  assert.ok(r.texte.includes('⚠️ SEALED INJECTION — this block ends with ###END:' + r.marker + '###\n'));
  assert.ok(r.texte.includes('   Marker missing at the end of the block = content TRUNCATED by the harness:\n'));
  assert.ok(r.texte.includes('   then read the files cited below yourself. Do not guess.\n\n'));
});

test('ANNOUNCEMENT: EXACT text, list prefix and line separator', () => {
  const r = plan(segs(6, 300), 1200);
  assert.ok(r.deferred.length >= 2, 'we need ≥ 2 deferrals to observe the joint');
  assert.ok(r.texte.includes('\n\n⚠️ ' + r.deferred.length + ' doc(s) DEFERRED — the frame is full, they follow on the next tool call(s).\n'));
  assert.ok(r.texte.includes('   Nothing is lost: they are queued, in order. If your action touches them NOW, read them:\n'));
  assert.ok(r.texte.includes('   - ' + r.deferred[0].label));
  // The joint between two deferrals MUST be a line break (otherwise unreadable list).
  assert.ok(r.texte.includes('   - ' + r.deferred[0].label + '\n   - ' + r.deferred[1].label));
});

test('SEALED WITHOUT deferral: no stray announcement', () => {
  // ⚠️ Kills the mutant that would remove the `deferred.length === 0` short-circuit:
  //    we would announce "0 doc(s) DEFERRED" on a complete block.
  const r = plan([seg('a', 600)], 1000);
  assert.deepStrictEqual(r.deferred, []);
  assert.ok(!r.texte.includes('DEFERRED'));
  assert.ok(!r.texte.includes('Stryker'));
});

// ═══════════════════════════════════════════════════════════════════════
// FRAMES — deterministic cases (cf. property-based for generated conservation)
// ═══════════════════════════════════════════════════════════════════════

test('PARITY: nbFrames absent/1 → strictly identical to plan()', () => {
  const s = () => [seg('a', 300), seg('b', 300)];
  assert.deepStrictEqual(planFrames(s(), 1000, 1), [plan(s(), 1000)]);
  assert.deepStrictEqual(planFrames(s(), 1000), [plan(s(), 1000)]);
});

test('PARITY: everything fits in one frame → frame 1 identical to plan, the others EMPTY', () => {
  // ⚠️ THE switch guarantee: multi-frame mode only engages on an
  //    eviction. A mutant that always went through the frames path breaks here.
  const s = () => [seg('a', 300)];
  const p = planFrames(s(), 1000, 4);
  assert.strictEqual(p.length, 4);
  assert.deepStrictEqual(p[0], plan(s(), 1000));
  for (let i = 1; i < 4; i++) assert.deepStrictEqual(p[i], { texte: '', emis: [], deferred: [], marker: '' });
});

test('CONSERVATION: each segment is in EXACTLY one frame, or announced', () => {
  const list = segs(8, 400);
  const p = planFrames(list, 1200, 4);
  const emis = p.flatMap((x) => x.emis);
  const deferred = p.flatMap((x) => x.deferred.map((d) => d.id));
  assert.strictEqual(new Set(emis).size, emis.length, 'no DUPLICATE between frames');
  assert.deepStrictEqual([...emis, ...deferred].sort(), list.map((s) => s.id).sort());
});

test('SEQUENCE: each non-empty frame carries its number k/N and the COMMON marker', () => {
  // ⚠️ Without a number, a missing frame is undetectable (parallel hooks,
  //    order not guaranteed) — that is the silent loss we make impossible.
  const p = planFrames(segs(8, 400), 1200, 4).filter((x) => x.texte !== '');
  assert.ok(p.length >= 2, 'the case must indeed engage several frames');
  const markers = new Set(p.map((x) => x.marker));
  assert.strictEqual(markers.size, 1, 'ONE single marker for the whole emission');
  p.forEach((x, i) => {
    assert.ok(x.texte.includes('FRAME ' + (i + 1) + '/4'), 'sequence number present');
    assert.ok(x.texte.includes('###END:' + x.marker + '###'), 'seal closed');
  });
});

test('BOUND: no frame exceeds the budget', () => {
  for (const p of planFrames(segs(10, 500), 1500, 5)) {
    assert.ok(p.texte.length <= 1500, 'frame of ' + p.texte.length + ' > 1500');
  }
});

test('GIANT SEGMENT: CHUNKED and DELIVERED — undeliverability is impossible', () => {
  // ⚠️ CONTRACT REVERSED on 03/08/2026 (maintainer's decision): BEFORE, a segment heavier
  //    than a frame was only ANNOUNCED — hence never delivered. The
  //    framework DELIVERS: it splits. NEVER go back to "announcing instead of
  //    delivering", that is making the author carry a defect of the transport.
  // ⚠️ DISTINCT contents ('x' vs 'y'): without that, counting the reassembled
  //    characters would mix the two docs and the test would certify falsely.
  const p = planFrames([seg('enorme', 5000), { id: 'petit', text: 'y'.repeat(100), label: 'petit.md' }], 1200, 9);
  const emis = p.flatMap((x) => x.emis);
  assert.deepStrictEqual(emis.filter((id) => id.startsWith('enorme')),
    // ⚠️ `#j/m` and not `#j` (06/08/2026): the id carries the TOTAL, the only place where
    //    it exists outside the text of the header. That is what allows the badge to
    //    say "chunk 3/7" instead of 7 identical lines.
    ['enorme#1/7', 'enorme#2/7', 'enorme#3/7', 'enorme#4/7', 'enorme#5/7', 'enorme#6/7', 'enorme#7/7'],
    'the giant is split into 7 chunks, ALL delivered');
  assert.ok(emis.includes('petit'), 'and it sterilizes no frame');
  assert.deepStrictEqual(p.flatMap((x) => x.deferred.map((d) => d.id)), [], 'NOTHING deferred: everything went through');
  // CONTENT CONSERVATION: reassembling the chunks gives back the original text.
  const recolle = p.flatMap((x) => x.texte.split('⟦').slice(1))
    .map((m) => m.slice(m.indexOf('⟧\n') + 2))
    .join('')
    .replace(/\n\n---\n\n|\n\n###END:[0-9a-f]{8}###/g, '');
  assert.strictEqual(recolle.replace(/[^x]/g, '').length, 5000, 'all 5000 characters arrived');
});

test('CHUNKS: each one ANNOUNCES itself as a fragment (never an excerpt that looks complete)', () => {
  // ⚠️ It is THIS header that authorizes the split: without it we would deliver a
  //    fragment disguised as a whole doc — the lie the module fights.
  const p = planFrames([seg('gros', 5000)], 1200, 8);
  const chunks = p.filter((x) => x.texte).map((x) => /CHUNK (\d+)\/(\d+)/.exec(x.texte));
  assert.ok(chunks.length >= 2 && chunks.every(Boolean), 'each frame carries its chunk number');
  const total = Number(chunks[0][2]);
  assert.deepStrictEqual(chunks.map((m) => Number(m[1])), Array.from({ length: total }, (_, i) => i + 1),
    'the chunks are numbered 1..m, in order, with no gap');
});

test('DETERMINISM: two independent computations return the SAME split', () => {
  // ⚠️ IT IS THE LIFE CONDITION OF THE MECHANISM: the N parallel processes
  //    cannot talk to each other, they only agree through pure determinism.
  const a = planFrames(segs(9, 450), 1300, 4);
  const b = planFrames(segs(9, 450), 1300, 4);
  assert.deepStrictEqual(a, b);
});

test('PRIORITY ORDER preserved: the best ranked is in the first frame', () => {
  const p = planFrames(segs(8, 400), 1200, 4);
  assert.strictEqual(p[0].emis[0], 'd0');
});

// ── FRAME fixtures, calibrated to the character (measured 03/08/2026) ──
// Envelope of a frame (k/n header with 1 digit + foot) = 316 · SEPARATEUR = 7.
// ⚠️ These numbers are WRITTEN HARDCODED, never derived from the module at runtime:
//    an expected value computed by the mutated code mutates WITH it and proves nothing.
const trois400 = () => [seg('a', 400), seg('b', 400), seg('c', 400)];
const quatre400 = () => [seg('a', 400), seg('b', 400), seg('c', 400), seg('d', 400)];

test('FRAME HEADER: EXACT text, anchored to the character', () => {
  // ⚠️ Anchors the wordings: without that, a mutant that empties one line of the header
  //    survives — and the agent would lose the reassembly instruction without anything
  //    turning red. The sequence number is the guarantee against silent loss.
  const p = planFrames(trois400(), 716, 3);
  const m = p[0].marker;
  const attendu =
    '⚠️ SEALED INJECTION — FRAME 1/3, end marked ###END:' + m + '###\n' +
    '   The 3 frames carry the SAME marker and arrive OUT OF ORDER: reassemble them by their number.\n' +
    '   A missing number, or a missing marker = content truncated by the harness:\n' +
    '   then read the files cited below yourself. Do not guess.\n\n';
  assert.strictEqual(p[0].texte, attendu + 'x'.repeat(400) + '\n\n###END:' + m + '###');
  assert.strictEqual(p[0].texte.length, 716);
});

test('EXACT DISTRIBUTION: a given budget produces ONE precise split', () => {
  // Three measured cases — they anchor the bounds of BOTH filling loops.
  assert.deepStrictEqual(planFrames(trois400(), 716, 3).map((p) => p.emis), [['a'], ['b'], ['c']]);
  assert.deepStrictEqual(planFrames(trois400(), 1200, 3).map((p) => p.emis), [['a', 'b'], ['c'], []]);
  assert.deepStrictEqual(planFrames(quatre400(), 1123, 2).map((p) => p.emis), [['a', 'b'], ['c', 'd']]);
});

test('CHUNKING BOUNDARY: at the EXACT size the doc stays WHOLE, beyond it it is split', () => {
  // 316 (envelope) + 400 (segment) = 716. At 716 each doc fits as it is…
  assert.deepStrictEqual(planFrames(trois400(), 716, 3).map((p) => p.emis), [['a'], ['b'], ['c']]);
  // …at 715 it no longer fits: it is CHUNKED, never abandoned.
  // ⚠️ A chunk carries an id suffixed with `#j` — that is the trace of the split.
  const serre = planFrames(trois400(), 715, 6);
  const emis = serre.flatMap((p) => p.emis);
  assert.ok(emis.every((id) => id.includes('#')), 'all the docs are split');
  assert.ok(['a', 'b', 'c'].every((d) => emis.some((id) => id.startsWith(d + '#'))), 'the 3 docs are delivered');
});

test('FILLING BOUNDARY: a frame FILLED TO THE BRIM is valid', () => {
  // 316 + 400 + 7 (separator) + 400 = 1123. At 1123 both fit.
  const pile = planFrames(quatre400(), 1123, 2);
  assert.deepStrictEqual(pile.map((p) => p.emis), [['a', 'b'], ['c', 'd']]);
  assert.deepStrictEqual(pile.map((p) => p.texte.length), [1123, 1123]);
  // One character less: the 2nd segment no longer fits, the rest is announced.
  const serre = planFrames(quatre400(), 1122, 2);
  assert.deepStrictEqual(serre.map((p) => p.emis), [['a'], ['b']]);
  assert.deepStrictEqual(serre[1].deferred.map((d) => d.id), ['c', 'd']);
});

test('REMAINDER = a DELAY, never "too big" NOR a CONFIG error', () => {
  // ⚠️ NEW semantics (05/08/2026), and this is the 2nd revision of this test — the
  //    1st (03/08) said "it is `--frames N` that is too small, fix your
  //    config". That was still a judgement passed on the OPERATOR. Since the
  //    emission queue (`pretool-core.js`), the remainder is only a full
  //    window: it leaves at the next action, as in any transport
  //    protocol. `--frames N` is a THROUGHPUT, no longer a ceiling.
  // 🛑 NEVER make this message say "increase N" again: that would put
  //    a human back in the loop for a normal phenomenon — the toil this
  //    framework exists to eliminate.
  const p = planFrames(quatre400(), 1122, 2);
  const dernier = p[p.length - 1];
  assert.ok(dernier.deferred.length > 0, 'with 2 frames for 4 docs, chunks necessarily remain');
  assert.ok(dernier.texte.includes('DEFERRED'), 'deferred, not lost');
  assert.ok(!dernier.texte.includes('TOO SMALL'), 'no accusation made against the configuration');
  assert.ok(!dernier.texte.includes('not emitted'), 'never announce a loss where there is a wait');
  for (const d of dernier.deferred) {
    assert.ok(dernier.texte.includes(d.label), 'every deferral stays NAMED: ' + d.label);
  }
  // …and with enough frames, the remainder disappears: nothing was too big.
  const assez = planFrames(quatre400(), 1122, 8);
  assert.deepStrictEqual(assez.flatMap((x) => x.deferred), [], 'enough frames ⇒ everything goes through');
});

test('TINY FRAME: we split more finely, we NEVER give up', () => {
  // ⚠️ There is NO budget at which the framework refuses to deliver: the smaller
  //    the frame, the smaller the chunks. It is the replacement
  //    of the old "nothing fits, we announce" — which no longer has a reason to exist.
  const p = planFrames(trois400(), 500, 24); // tiny frame ⇒ many chunks ⇒ many frames
  const emis = p.flatMap((x) => x.emis);
  assert.ok(emis.length > 3, 'the frame is small ⇒ many chunks');
  for (const d of ['a', 'b', 'c']) {
    assert.ok(emis.some((id) => id === d || id.startsWith(d + '#')), 'doc ' + d + ' delivered');
  }
});

// ── `fragment` SCANNER — sealed DIRECTLY ────────────────────────────────
// ⚠️ WHY DIRECTLY: `fragment` interprets a format (lines) in order to
//    produce slices — it is a SCANNER, and the fleet doctrine requires sealing
//    it as such. Tested only through `planFrames`, its
//    boundaries remained untestable: 6 mutants survived there on 03/08/2026
//    while ALL the rest of the module was at 100 %.
// ⚠️ The expected values below are MEASURED on the real code, never guessed.
const H_MORCEAU = '⟦ A — CHUNK 999/999 : reassemble the 999 chunks in order before reading ⟧\n'.length;
const CAP5 = H_MORCEAU + 5; // ⇒ `utile` = 5 characters of content per slice
const tranchesDe = (texte, capacite = CAP5) =>
  fragment([{ id: 'a', label: 'A', text: texte }], capacite).map((m) => m.text.replace(/^⟦[^⟧]*⟧\n/, ''));

test('SCANNER: short lines are GROUPED as long as they fit, separator PRESERVED', () => {
  const src = 'ab\ncd\nef\ngh\nij\nkl\nmn\nop\nqr\nst\nuv\nwx\nyz\nAB\nCD\nEF\nGH\nIJ\nKL\nMN\nOP\nQR\nST\nUV\nWX\nYZ\n01\n23\n45';
  assert.ok(src.length > CAP5, 'premise: the text exceeds the frame, so it gets split');
  assert.deepStrictEqual(tranchesDe(src), [
    'ab\ncd', 'ef\ngh', 'ij\nkl', 'mn\nop', 'qr\nst', 'uv\nwx', 'yz\nAB', 'CD\nEF',
    'GH\nIJ', 'KL\nMN', 'OP\nQR', 'ST\nUV', 'WX\nYZ', '01\n23', '45',
  ]);
});

test('SCANNER: a MONSTER LINE is chopped up, and the current buffer is flushed BEFORE', () => {
  // ⚠️ Flushing the buffer first is what preserves the READING ORDER: without that,
  //    the beginning of the text would come out AFTER the middle.
  assert.deepStrictEqual(tranchesDe('ab\n' + 'x'.repeat(12) + '\ncd\n' + 'y'.repeat(90)).slice(0, 4), [
    'ab', 'xxxxx', 'xxxxx', 'xx\ncd',
  ]);
});

test('SCANNER: EMPTY buffer at the end of the text ⇒ NO empty slice added', () => {
  // ⚠️ PRECISE case, measured: a monster line of an EXACT multiple of `utile`
  //    FOLLOWED by an empty line (text ending with a line break) really leaves the
  //    buffer empty. Pushing anyway would produce an empty slice — a chunk
  //    that announces NOTHING, and a falsified `j/m` total for ALL the others.
  //    ⚠️ Without the final line break, the buffer is NOT empty (it carries the last
  //    slice): the variant below would prove nothing.
  const vide = tranchesDe('x'.repeat(100) + '\n');
  assert.strictEqual(vide.length, 20, '100 / 5 = 20 slices, not 21');
  assert.ok(vide.every((x) => x.length > 0), 'no empty slice');
  // Variant without a final line break: same count, but via the "full buffer" path.
  assert.strictEqual(tranchesDe('x'.repeat(100)).length, 20);
});

test('SCANNER: a text ending with a new line KEEPS it', () => {
  const src = 'ab\ncd\nef\ngh\nij\nkl\nmn\nop\nqr\nst\nuv\nwx\nyz\nAB\nCD\nEF\nGH\nIJ\nKL\nMN\nOP\nQR\nST\nUV\nWX\nYZ\n01\n23\n45\n';
  const t = tranchesDe(src);
  assert.strictEqual(t[t.length - 1], '45\n', 'the final line break is part of the content, it is not lost');
});

test('SCANNER: NEGATIVE capacity ⇒ progress of one character, never a blockage', () => {
  // ⚠️ Without the `Math.max(1, …)` floor, this case produced an infinite loop
  //    or made the content DISAPPEAR (real bug, 03/08/2026).
  assert.deepStrictEqual(tranchesDe('abc', -99), ['a', 'b', 'c']);
});

test('SCANNER: what FITS is never touched (path 1 — neither header nor split)', () => {
  const m = fragment([{ id: 'a', label: 'A', text: 'court' }], CAP5);
  assert.deepStrictEqual(m, [{ id: 'a', label: 'A', text: 'court' }], 'segment returned as is, id unchanged');
});

test('BUDGET UNDER THE ENVELOPE: it is the ENVELOPE that gives way, never the content', () => {
  // ⚠️ REAL bug of 03/08/2026, sealed here: when the budget is smaller than
  //    the sealing envelope, `frameCapacity` becomes NEGATIVE. Before this
  //    fix, NO doc went out (0 emitted) and the message blamed
  //    `--frames N` — an undeliverability by construction, DOUBLED with a
  //    message that lies about its cause. The seal is a detection comfort;
  //    DELIVERING is the contract. When both do not fit, we deliver.
  assert.ok(frameCapacity(300, 12) < 0, 'premise: at this budget the envelope does not fit');
  const p = planFrames([{ id: 'a', label: 'A', text: 'x'.repeat(400) }], 300, 12);
  const emis = p.flatMap((x) => x.emis);
  assert.ok(emis.length > 0, 'UNDELIVERABILITY FORBIDDEN: at least one chunk goes out');
  // ⚠️ Remove the chunk headers BEFORE counting: they contain the word
  //    "chunks", hence an "x"… — counting naively inflates the total and
  //    gives a false RED (measured while writing this test).
  const livre = p.map((x) => x.texte).join('').replace(/⟦[^⟧]*⟧\n/g, '').replace(/[^x]/g, '').length;
  assert.strictEqual(livre, 400, 'all the content is delivered, down to the letter');
  // Unsealed ⇒ we do not ANNOUNCE a seal that does not exist ("green that lies").
  for (const x of p) {
    assert.strictEqual(x.marker, '', 'no marker announced when nothing is sealed');
    assert.ok(!x.texte.includes('###END:'), 'no seal in the text');
  }
  // …and the BOUND still holds on every frame carrying content.
  for (const x of p) {
    if (x.emis.length > 0) assert.ok(x.texte.length <= 300, 'content frame bounded');
  }
});

test('UNSEALING BOUNDARY: capacity EXACTLY zero ⇒ unsealed (there is no room left)', () => {
  // ⚠️ `capacite > 0` and not `>= 0`: at zero, the envelope occupies the WHOLE
  //    frame — sealing it would not leave ONE character of content. Delivering
  //    comes before sealing, so we unseal. MEASURED budget, not guessed.
  assert.strictEqual(frameCapacity(319, 12), 0, 'premise: this budget gives a capacity of zero');
  const p = planFrames([{ id: 'a', label: 'A', text: 'x'.repeat(400) }], 319, 12);
  assert.ok(p.flatMap((x) => x.emis).length > 0, 'content goes out anyway');
  assert.ok(!p.some((x) => x.texte.includes('###END:')), 'no seal: there was no room');
  // One more character of budget and the seal becomes possible again.
  const q = planFrames([{ id: 'a', label: 'A', text: 'x'.repeat(400) }], 320, 12);
  assert.ok(q.some((x) => x.texte.includes('###END:')), 'at capacity 1, we seal');
});

test('DEFERRALS: only the LAST frame carries them (the others have an empty list)', () => {
  // ⚠️ It is the last one that carries the announcement: removing it from it, or giving it to
  //    all of them, would repeat the same list N times — or lose it.
  const p = planFrames(quatre400(), 1122, 3);
  assert.ok(p[p.length - 1].deferred.length > 0, 'premise: chunks remain');
  for (let i = 0; i < p.length - 1; i++) {
    assert.deepStrictEqual(p[i].deferred, [], 'frame ' + (i + 1) + ' carries no deferral');
  }
});

test('EMPTY FRAME: neither content nor announcement ⇒ EMPTY rendering (never a hollow envelope)', () => {
  // Emitting an envelope to announce nothingness would cost tokens on every action.
  const p = planFrames(trois400(), 1200, 3);
  assert.deepStrictEqual(p[2], { texte: '', emis: [], deferred: [], marker: '' });
  assert.notStrictEqual(p[1].texte, '', 'the frame that carries content, itself, is indeed rendered');
});

test('MARKER: sensitive to the CONTENT and to the NUMBER of frames', () => {
  // ⚠️ Two distinct emissions must not share a marker, otherwise a
  //    cross reassembly would pass as valid.
  const m3 = planFrames(trois400(), 716, 3)[0].marker;
  const m4 = planFrames(trois400(), 716, 4)[0].marker;
  assert.notStrictEqual(m3, m4, 'the number of frames enters into the marker');
  const autreTexte = [{ id: 'a', text: 'y'.repeat(400), label: 'a.md' }, seg('b', 400), seg('c', 400)];
  assert.notStrictEqual(planFrames(autreTexte, 716, 3)[0].marker, m3, 'the content too');
});

test('FRAMES — invalid nbFrames ⇒ SINGLE frame (cascade, never a lopsided split)', () => {
  // ⚠️ REVISED ON 05/08/2026: "single frame" still means ONE frame —
  //    but no longer "we give up the surplus". An invalid number of frames must
  //    never lose content, only reduce the THROUGHPUT.
  const l = () => segs(6, 300);
  for (const mauvais of [undefined, null, 0, 1, -3, 2.5, NaN, 'x']) {
    const p = planFrames(l(), 1200, mauvais);
    assert.strictEqual(p.length, 1, 'nbFrames=' + String(mauvais));
    assert.deepStrictEqual(p, planFrames(l(), 1200, 1), 'all the invalid values are EQUIVALENT to 1');
  }
  assert.strictEqual(planFrames(l(), 1200, 2).length, 2, 'the first VALID number is 2');
});

test('FRAMES — n=1: PERFECT parity if everything fits, CHUNKING as soon as there is surplus', () => {
  // ⚠️ THIS TEST WAS INVERTED ON 05/08/2026, and it is the heart of the work item.
  //    It required "n=1 with eviction ⇒ STRICTLY the rendering of plan()".
  //    That was a HOLE disguised as parity: `plan` does not chunk, so a
  //    doc heavier than the frame NEVER arrived on a single-frame harness
  //    (Codex). With the queue, it was no longer a loss but a LOOP.
  //    The parity that matters is that of the case THAT FITS — here it is, to the byte.
  const tient = () => segs(2, 300);
  assert.deepStrictEqual(planFrames(tient(), 8000, 1), [plan(tient(), 8000)]);

  // As soon as there is surplus, we chunk and we emit — instead of giving up.
  const deborde = () => segs(6, 300);
  const p = planFrames(deborde(), 1200, 1);
  assert.strictEqual(p.length, 1, 'still ONE single frame');
  assert.ok(p[0].emis.length > 0, 'content GOES OUT, unlike the behaviour from before');
  assert.ok(p[0].deferred.length > 0, 'the rest is returned to the caller, who queues it');
  // ⚠️ A lone frame must NEVER carry the "FRAME k/N" header: it
  //    would say "reassemble the 1 frames", a false instruction.
  assert.ok(!p[0].texte.includes('FRAME '), 'simple header, never a frame header');
});

test('FRAMES — absurd budget ⇒ FRAMEWORK default (cascade authority ①)', () => {
  for (const mauvais of [undefined, null, 0, -1, NaN, Infinity, 'x']) {
    const p = planFrames(trois400(), mauvais, 3);
    assert.deepStrictEqual(p[0].emis, ['a', 'b', 'c'], 'budget ' + String(mauvais));
    assert.deepStrictEqual(p[1], { texte: '', emis: [], deferred: [], marker: '' });
  }
});

test('FRAMES — non-array input ⇒ treated as empty (fail-soft, never a throw)', () => {
  // The gate is fail-open: a budget that threw would SILENCE the injection.
  for (const mauvais of [undefined, null, 'texte', 42, {}]) {
    const p = planFrames(mauvais, 1000, 3);
    assert.strictEqual(p.length, 3);
    for (const x of p) assert.deepStrictEqual(x, { texte: '', emis: [], deferred: [], marker: '' });
  }
});

test('SEAL BOUNDARY: at exactly 50 % → nominal; just above → sealed', () => {
  // Anchors the constant SEUIL_SCEAU_RATIO: a mutant that moves it is killed.
  const nu = plan([seg('a', 500)], 1000);   // 500 = 50 % of 1000 → nominal
  assert.strictEqual(nu.marker, '');
  const scelle = plan([seg('a', 501)], 1000); // 501 > 50 % → sealed
  assert.notStrictEqual(scelle.marker, '');
});

test('frameCapacity: PHYSICAL bound derived from the real header, never a constant', () => {
  // ⚠️ EXACT value anchored (budget 8000, header with 1 digit + foot = 316):
  //    without it, a mutant that adds instead of subtracting survives and the
  //    size gate would let through docs that are never deliverable.
  assert.strictEqual(frameCapacity(8000, 3), 7684);
  assert.strictEqual(frameCapacity(), DEFAULT_BUDGET - 316, 'budget absent ⇒ framework default');
  assert.ok(frameCapacity(8000, 3) < 8000, 'the capacity is ALWAYS under the budget (the envelope costs)');
  // ⚠️ The number of frames WIDENS the header ("FRAME 10/10" > "FRAME 3/3")
  //    hence REDUCES the capacity. Without this two-digit case, all the mutants
  //    on `nbFrames` are equivalent (2 to 9 give the same width) and
  //    survive — measured 03/08/2026.
  assert.ok(frameCapacity(8000, 10) < frameCapacity(8000, 3), 'more frames ⇒ wider header ⇒ less room');
  for (const mauvais of [undefined, null, 1, 0, -4, 2.5, 'x']) {
    assert.strictEqual(frameCapacity(8000, mauvais), 7684, 'absurd nbFrames ⇒ minimal width (2), never a throw');
  }
});

test('frameCapacity: at the EXACT capacity the doc stays whole, one character more ⇒ 2 chunks', () => {
  // The link between the announced bound and the real behaviour — without it, the
  // constant could drift from the engine without anything turning red.
  const cap = frameCapacity(8000, 3);
  const pile = planFrames([seg('a', cap), seg('b', 5000)], 8000, 3);
  assert.ok(pile.some((p) => p.emis.includes('a')), 'at the exact capacity: delivered WHOLE, without a split');
  const trop = planFrames([seg('a', cap + 1), seg('b', 5000)], 8000, 3);
  const emisA = trop.flatMap((p) => p.emis).filter((id) => id.startsWith('a'));
  assert.deepStrictEqual(emisA, ['a#1/2', 'a#2/2'], 'one character more ⇒ split into 2, and DELIVERED');
});

test('MONSTER LINE: a single line longer than a frame is chopped up', () => {
  // ⚠️ Path NEVER exercised before 03/08/2026 (mutation: 4 mutants without
  //    coverage). It is the ONLY place where we cut in the middle of a word —
  //    a 20 000-character line has no boundary at which to cut cleanly.
  const uneLigne = { id: 'mono', text: 'z'.repeat(9000), label: 'mono.md' };
  const p = planFrames([uneLigne], 1200, 24);
  const emis = p.flatMap((x) => x.emis);
  assert.ok(emis.length > 5, 'the monster line is chopped into chunks');
  assert.ok(emis.every((id) => id.startsWith('mono#')));
  const z = p.map((x) => x.texte).join('').split('').filter((c) => c === 'z').length;
  assert.strictEqual(z, 9000, 'ALL 9000 characters arrived');
});

test('MONSTER LINE mixed with normal lines: the current buffer is flushed first', () => {
  // Guarantees the ORDER: what precedes the monster line goes out BEFORE it.
  const mixte = { id: 'mix', text: 'debut\n' + 'z'.repeat(3000) + '\nfin', label: 'mix.md' };
  const p = planFrames([mixte], 1200, 24);
  const textes = p.map((x) => x.texte).join('');
  assert.ok(textes.indexOf('debut') < textes.indexOf('zzz'), 'the beginning goes out before the monster line');
  assert.ok(textes.includes('fin'), 'and the rest still arrives');
});

test('CHUNK HEADER: EXACT text (the 3 fields of the RFC 2046 pattern)', () => {
  // ⚠️ `id` (common marker), `number` starting at 1, `total` — removing one
  //    removes a reassembly guarantee. Anchored to the character.
  const p = planFrames([seg('doc', 3000)], 1200, 24);
  const premier = p.find((x) => x.texte.includes('CHUNK 1/'));
  const m = /⟦ (.+?) — CHUNK (\d+)\/(\d+) : reassemble the (\d+) chunks in order before reading ⟧\n/.exec(premier.texte);
  assert.ok(m, 'header in the exact format');
  assert.strictEqual(m[1], 'doc.md', 'the LABEL identifies the doc');
  assert.strictEqual(m[2], '1', 'the numbering starts at 1 (RFC 2046)');
  assert.strictEqual(m[3], m[4], 'the TOTAL is consistent within the sentence');
});

test('REMAINDER: EXACT message — ONE single announcement for BOTH paths', () => {
  // ⚠️ This test seals the MERGE of 05/08/2026: `announcement()` (single frame) and
  //    `annonceConfig()` (last frame) said two different things for
  //    ONE single situation — the window is full. Two texts = two truths
  //    that diverge at the first change. Here we verify that the last
  //    frame returns EXACTLY the same sentence as the single frame.
  const p = planFrames(quatre400(), 1122, 2);
  const t = p[1].texte;
  const n = p[1].deferred.length;
  assert.ok(t.includes('\n\n⚠️ ' + n + ' doc(s) DEFERRED — the frame is full, they follow on the next tool call(s).\n'));
  assert.ok(t.includes('   Nothing is lost: they are queued, in order. If your action touches them NOW, read them:\n'));
  // SAME sentence as the single-frame path — otherwise the merge would be cosmetic.
  const solo = plan(segs(6, 300), 1200);
  const ligne = (x) => x.split('\n').find((l) => l.includes('DEFERRED')).replace(/\d+/, 'N');
  assert.strictEqual(ligne(t), ligne(solo.texte), 'one single wording, shared');
});

// ⚠️ THIS TEST LIVES HERE, NOT IN THE PROPERTY FILE — AND IT IS A RULE, NOT
//    TIDINESS. Stryker does NOT execute the property tests (slow, non
//    deterministic): a guard proven ONLY by property lets its
//    mutants SURVIVE, and the score lies. Measured on 05/08/2026: the bounded
//    announcement written in property made the mutation fall from 100 % to 98.85 %
//    (5 survivors on `MAX_CITES`), whereas the behaviour WAS tested.
// 🛑 Any new deterministic guard: its case goes into `budget.test.js`.
// ⚠️ FOUNDING CASE OF THE QUEUE — the REAL blockage found on 05/08/2026 by
//    simulating the loop of `pretool-core.js`, BEFORE any deployment.
//    SINGLE frame (the Codex regime), budget 600, doc of 5 000 chars ⇒ 56
//    chunks ⇒ the announcement cited all 56 and filled the frame all by itself
//    ⇒ ZERO content emitted, at every action, FOREVER.
// ⚠️ IT LIVES HERE AND NOT IN PROPERTY, for the SAME reason as the bounded announcement:
//    Stryker does not execute the property tests. Written over there, it left 5
//    mutants surviving on the progress guarantee — the most critical net of the
//    module was therefore proven by NO test the mutation could see.
// 🛑 NEVER delete it: if the behaviour changes, we INVERT the expected value.
test('FOUNDING CASE (queue): single frame + giant doc => STRICT progress, never a loop', () => {
  const doc = () => ({ id: 'geante', text: 'x'.repeat(5000), label: 'geante.md' });
  let file = [doc()];
  let tours = 0;
  const livres = new Set();
  while (file.length > 0) {
    assert.ok(tours++ < 200, 'strict progress required: beyond that, there is a loop');
    const frames = planFrames(file, 600, 1);
    const emis = frames.flatMap((p) => p.emis);
    assert.ok(emis.length > 0, 'each action advances by at least one chunk');
    for (const id of emis) livres.add(id);
    file = frames[frames.length - 1].deferred;
  }
  assert.ok(tours > 1, 'the doc was indeed delivered over SEVERAL actions');
  assert.ok(livres.size > 1, 'several distinct chunks delivered');
});

test('FORCED PROGRESS: the frame SACRIFICES the announcement, but ALWAYS returns the remainder', () => {
  // ⚠️ This is the most subtle point of the module: what we COMPOSE (without an
  //    announcement, for lack of room) differs from what we REPORT (the full remainder, which
  //    the caller re-queues). The two MUST diverge here — realigning them
  //    "for symmetry" would either suffocate the frame, or LOSE the remainder.
  const p = planFrames([{ id: 'g', text: 'x'.repeat(5000), label: 'geante.md' }], 600, 1);
  const seule = p[0];
  assert.ok(seule.emis.length > 0, 'content GOES OUT anyway (progress guarantee)');
  assert.ok(seule.deferred.length > 0, 'and the remainder is RETURNED to the caller');
  // The text, itself, carries NO announcement: there was no room.
  assert.ok(!seule.texte.includes('DEFERRED'), 'announcement sacrificed: delivering comes before describing');
  assert.ok(!seule.texte.includes('Stryker'), 'no stray label in the frame');
});

test('ANNOUNCEMENT: ONLY the last frame carries it — never the previous ones', () => {
  // ⚠️ Without this case, `i === n - 1` is indistinguishable from `true`: each frame
  //    would repeat the list of deferrals, multiplying the noise by N and
  //    risking overflowing frames that fitted.
  const docs = Array.from({ length: 30 }, (_, k) => ({
    id: 'e' + k, text: 'w'.repeat(900), label: 'e' + k + '.md',
  }));
  const p = planFrames(docs, 3000, 3);
  assert.ok(p[p.length - 1].texte.includes('DEFERRED'), 'the LAST one announces');
  for (let i = 0; i < p.length - 1; i++) {
    assert.ok(!p[i].texte.includes('DEFERRED'), 'frame ' + (i + 1) + ' keeps silent');
    assert.deepStrictEqual(p[i].deferred, [], 'and reports no remainder');
  }
});

test('CHUNKING: the chunk NEVER exceeds its capacity, over the WHOLE range', () => {
  // ⚠️ A SWEEP, not a single point: the critical boundary is where the chunk
  //    header is worth EXACTLY the capacity. A `>` turned into `>=` would give a
  //    NULL useful part there — hence an infinite loop and a chunk out of bounds.
  //    Testing a single capacity leaves this tipping point invisible.
  const doc = () => [{ id: 'd', text: Array.from({ length: 40 }, (_, i) => 'ligne' + i).join('\n'), label: 'd.md' }];
  for (let cap = 20; cap <= 120; cap++) {
    const m = fragment(doc(), cap);
    assert.ok(m.length > 0, 'capacity ' + cap + ': at least one chunk');
    for (const x of m) {
      assert.ok(x.text.length > 0, 'capacity ' + cap + ': never an EMPTY chunk');
      assert.ok(x.text.length <= cap, 'capacity ' + cap + ' exceeded: ' + x.text.length);
    }
  }
});

test('EMPTY FRAME: neither content nor remainder ⇒ STRICTLY empty rendering (silence)', () => {
  // ⚠️ Emitting an envelope to announce nothingness would cost tokens on
  //    EVERY action of EVERY agent. The shell exits silently on empty text.
  const p = planFrames(segs(6, 300), 1200, 4);
  const vides = p.filter((x) => x.emis.length === 0 && x.deferred.length === 0);
  assert.ok(vides.length > 0, 'with 4 frames for a small corpus, empty ones remain');
  for (const v of vides) {
    assert.deepStrictEqual(v, { texte: '', emis: [], deferred: [], marker: '' });
  }
});

test('BOUNDED ANNOUNCEMENT: it counts DOCUMENTS and cannot eat the frame', () => {
  const docs = Array.from({ length: 30 }, (_, k) => ({
    id: 'd' + k, text: 'y'.repeat(900), label: 'doc' + k + '.md',
  }));
  const p = planFrames(docs, 3000, 2);
  const dernier = p[p.length - 1];
  const t = dernier.texte;
  assert.ok(dernier.deferred.length > 5, 'the case is indeed reached');

  // ① DEDUP: the announced count is that of the distinct DOCUMENTS.
  const attendus = new Set(dernier.deferred.map((d) => d.label)).size;
  assert.ok(t.includes(attendus + ' doc(s) DEFERRED'), 'counts in DOCUMENTS');

  // ② CEILING: the list is truncated, with the remainder in FIGURES.
  assert.ok(t.includes('… and ' + (attendus - 5) + ' other(s)'), 'list truncated and quantified');
  const lignes = t.split('\n').filter((l) => l.startsWith('   - '));
  assert.strictEqual(lignes.length, 6, '5 citations + the remainder line, never more');

  // ③ EXACT BOUNDARY of the ceiling: at 5 docs we cite EVERYTHING, at 6 we truncate.
  //    ⚠️ Without these two cases, `>` and `>=` are indistinguishable (surviving mutant).
  const nDocs = (n) => Array.from({ length: n }, (_, k) => ({ id: 'x' + k, text: 'z'.repeat(700), label: 'x' + k + '.md' }));
  const cinq = planFrames(nDocs(6), 1500, 1);
  assert.ok(!cinq[0].texte.includes('other(s)'), '5 deferrals ⇒ all cited, no truncation');
  const six = planFrames(nDocs(7), 1500, 1);
  assert.ok(six[0].texte.includes('… and 1 other(s)'), '6 deferrals ⇒ we truncate at 5 + 1 remaining');
});

test('frameCapacity: non-integer nbFrames falls back on the minimal width', () => {
  // ⚠️ Without this case, the `Number.isInteger` guard is unkillable: 10.5 and 2 give
  //    different header widths, hence different capacities.
  assert.strictEqual(frameCapacity(8000, 10.5), frameCapacity(8000, 2));
  assert.notStrictEqual(frameCapacity(8000, 11), frameCapacity(8000, 2));
});

// ═══════════════════════════════════════════════════════════════════════
// DOCUMENT IDENTITY AND EMISSION ORDER (moved up from pretool-core.js on
// 05/08/2026 with the emission layer: these are rules of the TRANSPORT).
// ⚠️ These cases live HERE and not in the property file: Stryker does NOT EXECUTE
//    the property tests. A guard proven only by property leaves
//    surviving mutants and the score LIES (paid for twice on 05/08/2026).
// ═══════════════════════════════════════════════════════════════════════

test('BASE_ID: a chunk finds its document again, a document stays itself', () => {
  assert.strictEqual(baseId('docs/foo.md'), 'docs/foo.md');
  assert.strictEqual(baseId('docs/foo.md#3'), 'docs/foo.md');
  // First '#' only: an id that contains two must not be cut at the last one.
  assert.strictEqual(baseId('a#1#2'), 'a');
});

test('ORDER: the queue goes AHEAD of the fresh content (RFC 6455, never interleaved)', () => {
  const file = [{ id: 'a#1', text: 'A1' }];
  const frais = [{ id: 'b', text: 'B' }];
  assert.deepStrictEqual(orderSegments(file, frais).map((s) => s.id), ['a#1', 'b']);
});

test('ORDER: a doc ALREADY in the queue is not re-stacked (dedup by DOCUMENT)', () => {
  // ⚠️ THE FOUNDING CASE: a `dumb` doc is re-decided at EVERY action. Without the
  //    dedup, it would be re-stacked WHOLE behind its own chunks —
  //    a token duplicate AND an impossible reassembly.
  const file = [{ id: 'a#2', text: 'A2' }, { id: 'a#3', text: 'A3' }];
  const frais = [{ id: 'a', text: 'A ENTIER' }, { id: 'b', text: 'B' }];
  assert.deepStrictEqual(orderSegments(file, frais).map((s) => s.id), ['a#2', 'a#3', 'b']);
});

test('ORDER: the dedup compares DOCUMENTS on BOTH sides, not raw ids', () => {
  // Without baseId on the fresh side, a fresh chunk `a#1` would pass while `a` is
  // already in the queue — two versions of the same document in flight.
  const file = [{ id: 'a', text: 'A' }];
  const frais = [{ id: 'a#1', text: 'A1' }];
  assert.deepStrictEqual(orderSegments(file, frais).map((s) => s.id), ['a']);
});

test('ORDER: absent/invalid inputs = degradation, never a crash', () => {
  assert.deepStrictEqual(orderSegments(undefined, [{ id: 'x', text: 'X' }]).map((s) => s.id), ['x']);
  assert.deepStrictEqual(orderSegments([{ id: 'y', text: 'Y' }], undefined).map((s) => s.id), ['y']);
  assert.deepStrictEqual(orderSegments(null, null), []);
});

// ═══════════════════════════════════════════════════════════════════════
// INFINITE BUDGET = "THIS HARNESS BOUNDS NOTHING" (05/08/2026)
// ⚠️ DETERMINISTIC cases mandatory here: Stryker does NOT execute the
//    property tests. A guard proven only by property leaves
//    surviving mutants and the score LIES (paid for twice on 05/08).
// ⚠️ REAL DEFECT that they seal: `Number.isFinite(Infinity)` is FALSE, so
//    infinity fell back on the FLOOR of 8 000 — we chunked a skill into
//    11 actions while Codex accepted the whole thing at once, SILENTLY.
// ═══════════════════════════════════════════════════════════════════════

test('INFINITE BUDGET: everything leaves in ONE frame, zero deferral, content INTACT', () => {
  const gros = 'X'.repeat(76000);
  const p = planFrames([{ id: 'gros', text: gros, label: 'skill' }], Infinity, 1);
  assert.strictEqual(p.length, 1);
  assert.strictEqual(p[0].deferred.length, 0, 'an infinite budget defers NOTHING');
  assert.ok(p[0].texte.includes(gros), 'full content, never truncated');
});

test('INFINITE BUDGET: neither seal nor header (HISTORICAL rendering, hence parity)', () => {
  // The seal only serves to make a TRUNCATION noisy. Without a bound, there is
  // nothing to report: announcing an end marker would be pure noise.
  const p = planFrames([{ id: 'a', text: 'A'.repeat(50000), label: 'a' }], Infinity, 1);
  assert.ok(!/###END:/.test(p[0].texte), 'no seal when nothing can be truncated');
  assert.ok(!/CHUNK/.test(p[0].texte), 'no chunking');
});

test('INFINITE BUDGET vs FLOOR: the same corpus defers at 8000 and NOT at infinity', () => {
  // ⚠️ THE WITNESS OF THE BUG. Without it, a mutant that removes the `Infinity` path
  //    survives: both branches would return "1 frame", and only the number
  //    of DEFERRALS distinguishes the floor from the absence of a bound.
  const segs = () => [{ id: 'g', text: 'Y'.repeat(76000), label: 'g' }];
  assert.ok(planFrames(segs(), 8000, 1)[0].deferred.length > 0, 'witness: at 8000 it overflows');
  assert.strictEqual(planFrames(segs(), Infinity, 1)[0].deferred.length, 0);
});

test('BUDGET: -Infinity and NaN fall back on the FLOOR (never a guessed infinity)', () => {
  // Only POSITIVE `Infinity` means "no limit". Everything else is an
  // unreadable value: floor, never an invented bound.
  const seg = () => [{ id: 'a', text: 'A'.repeat(20000), label: 'a' }];
  assert.ok(planFrames(seg(), -Infinity, 1)[0].deferred.length > 0);
  assert.ok(planFrames(seg(), NaN, 1)[0].deferred.length > 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// READABILITY OF THE TRANSPORT — `chunkPart` / `chunkSuffix` (06/08/2026)
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ WHY THESE TESTS EXIST: a skill delivered in 7 chunks displayed SEVEN
//    rigorously identical badges. The maintainer read it as the
//    framework running wild — "it's scary" — when the delivery was
//    normal and unique. A correct but UNREADABLE transport gets taken
//    for a breakdown, and a system believed to be broken ends up unplugged.
//    The transparency of the badge is therefore not cosmetic: it is what prevents
//    "repairing" an engine that has nothing wrong with it.

test('chunkPart: `doc#3/7` returns the position AND the total', () => {
  assert.deepStrictEqual(chunkPart('doc#3/7'), { j: 3, m: 7 });
});

test('chunkPart: WHOLE document (no `#`) → null, never a false chunk', () => {
  assert.strictEqual(chunkPart('doc'), null);
});

test('chunkPart: reads the LAST `#` — a RE-CHUNKED chunk keeps its real position', () => {
  // REAL case: capacity lowered between two actions ⇒ a chunk of the queue is
  // re-split and carries `doc#3/7#2/4`. Reading the FIRST `#` would give `3/7#2/4`,
  // hence a silent NaN in the badge. The base, itself, stays `doc`.
  assert.deepStrictEqual(chunkPart('doc#3/7#2/4'), { j: 2, m: 4 });
  assert.strictEqual(baseId('doc#3/7#2/4'), 'doc');
});

test('chunkPart: OLD format `doc#3` (queue written before 06/08/2026) → null', () => {
  // The queue SURVIVES a redeployment: an id in the old format will be read back by
  // the new code. A silent badge = correct; `3/NaN` would cast doubt on a
  // delivery that is nonetheless intact.
  assert.strictEqual(chunkPart('doc#3'), null);
});

test('chunkPart: an id WITHOUT `#` that LOOKS LIKE a position → null', () => {
  // ⚠️ IT IS THIS CASE THAT MAKES THE `i === -1` GUARD NECESSARY, and Stryker
  //    proved it: without it, `slice(0)` returns the WHOLE id and the regex would accept
  //    `1/2` — a document named that way would be announced "chunk 1/2" while
  //    it is delivered IN FULL. A badge that invents a fragmentation
  //    is worse than no badge: it would make one look for non-existent chunks.
  assert.strictEqual(chunkPart('1/2'), null);
});

test('chunkPart: TOTAL — throws on no input (fail-open path)', () => {
  for (const x of [undefined, null, 42, {}, [], 'doc#', 'doc#a/b', 'doc#1/', 'doc#/2']) {
    assert.strictEqual(chunkPart(x), null, 'input ' + JSON.stringify(x));
  }
});

test('chunkSuffix: nothing chunked → EMPTY string (badge unchanged to the byte)', () => {
  // It is the NORMAL case and it is what keeps the parity of the differentials.
  assert.strictEqual(chunkSuffix(['a', 'b']), '');
});

test('chunkSuffix: one chunked document → ` (chunk 3/7)`', () => {
  assert.strictEqual(chunkSuffix(['skill/ctxroute#3/7']), ' (chunk 3/7)');
});

test('chunkSuffix: TWO chunks of the SAME document → cited ONCE', () => {
  // A frame may carry `doc#2/7` AND `doc#3/7`: without dedup by base, the
  // badge would display the same document twice.
  assert.strictEqual(chunkSuffix(['d#2/7', 'd#3/7']), ' (chunk 2/7)');
});

test('chunkSuffix: two DIFFERENT chunked documents → joined by ` · `', () => {
  assert.strictEqual(chunkSuffix(['a#1/2', 'b#4/9']), ' (chunk 1/2 · 4/9)');
});

test('chunkSuffix: mix of whole + chunked → only the chunked one is announced', () => {
  assert.strictEqual(chunkSuffix(['entier', 'a#1/3']), ' (chunk 1/3)');
});

test('chunkSuffix: TOTAL — non-array input → empty string, never a throw', () => {
  for (const x of [undefined, null, 'a#1/2', 42]) assert.strictEqual(chunkSuffix(x), '');
});
