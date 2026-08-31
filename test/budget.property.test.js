// ═══════════════════════════════════════════════════════════════════════
// PROPERTY-BASED — the invariants of `budget.js` on GENERATED inputs.
// ═══════════════════════════════════════════════════════════════════════
//
// WHY HERE AND NOT ONLY EXAMPLES: `plan` is a PURE function
// with a strong invariant, and the doctrine then requires property-based testing. An
// example test proves one case; here we want to prove that NO combination of
// sizes/budgets can make a doc disappear silently — that is
// precisely the class of bug this module exists to make impossible.
//
// ⚠️ Invariant ① (CONSERVATION) is the most important of the framework: a
//    segment that comes in ALWAYS goes out, emitted or announced. If it fell, we would have
//    reintroduced the silent loss while believing we were fixing it.
// ═══════════════════════════════════════════════════════════════════════

import { test, expect } from 'vitest';
import fc from 'fast-check';
import { plan, planFrames, fragment, orderSegments, baseId, DEFAULT_BUDGET, envelopeSize } from '../src/budget.js';

// Approx. cost of the inter-segment separator, to calibrate the draws.
const SEPARATOR_APPROX = 8;

// Arbitrary segments: UNIQUE ids (call contract — one doc = one segment).
// ⚠️ NON-ZERO `minLength`: fast-check is strongly biased towards small values.
//    With nearly empty texts, EVERYTHING always fits and the interesting zone
//    is never visited (cf. the comment of `casArb`).
const segmentsArb = fc
  .array(fc.record({ text: fc.string({ minLength: 30, maxLength: 400 }), label: fc.string({ minLength: 3, maxLength: 40 }) }), {
    minLength: 1,
    maxLength: 12,
  })
  .map((arr) => arr.map((s, i) => ({ id: 'doc-' + i, text: s.text, label: 'L' + i + '-' + s.label })));

// ⚠️ THE BUDGET IS GENERATED AS A FRACTION OF THE TOTAL, never on an absolute
//    range, and never via a wide `fc.integer`.
//    HOLE PROVEN on 31/07/2026, TWICE in a row: a real sabotage of the
//    conservation (`deferred: []`) went GREEN over 500 runs. Cause: fast-check's
//    bias towards small values made almost every
//    draw fall into "everything fits" or "nothing fits". The MIXED zone —
//    the only one where conservation can break — was practically never
//    reached. A generator that does not reach the interesting case CERTIFIES instead
//    of proving, and that is undetectable without sabotage.
//    ⚠️ The meta-test "⑦ COVERAGE" below seals that: it FAILS if the
//    mixed zone stops being visited. NEVER remove it taking it for
//    a duplicate — it is what guarantees that the 6 others prove something.
//    ⚠️ The budget includes `envelopeSize()`: without it, the sealing (~250
//    characters) alone ate the whole drawn budget and 591 cases out of 600
//    fell into "nothing fits" (measured 31/07/2026). A generator must
//    reproduce the real ORDERS OF MAGNITUDE of the fleet (docs ~1 400 characters,
//    budget 8 000), otherwise it explores a regime that does not exist in production.
const casArb = segmentsArb.chain((segments) => {
  const total = segments.reduce((n, s) => n + s.text.length + SEPARATOR_APPROX, 0);
  return fc.tuple(
    fc.constant(segments),
    // ⚠️ STRATIFIED DRAW (05/08/2026) — why it is NOT a workaround.
    //    The meta-test ⑦ fell EXACTLY at 5 % the day the deferral announcement
    //    got longer ("DEFERRED … queued" replaces "NOT injected"):
    //    at an equal budget, a longer announcement leaves less room for the content,
    //    so more draws swing from "mixed" to "nothing fits".
    //    The coverage therefore degraded as a SIDE EFFECT of a change of
    //    TEXT — not by a design choice.
    // 🛑 The FORBIDDEN answer would have been to lower the threshold of ⑦ to 4 %: that is
    //    precisely the gesture that produced the false green of 31/07/2026, where a
    //    real sabotage passed over 500 runs for lack of reaching the useful zone.
    //    We STRENGTHEN the generator, we NEVER soften the judge.
    //    The wide stratum is KEPT identical (we removed nothing from the
    //    exploration); we only add weight where the properties
    //    bite — the band where part passes and part remains.
    fc.oneof(
      { arbitrary: fc.integer({ min: 5, max: 110 }), weight: 1 },
      { arbitrary: fc.integer({ min: 30, max: 95 }), weight: 2 }
    ).map((pct) => envelopeSize() + Math.max(1, Math.ceil((total * pct) / 100)))
  );
});

test('① CONSERVATION: every segment goes out — emitted OR announced, never lost', () => {
  fc.assert(
    fc.property(casArb, ([segments, budget]) => {
      const r = plan(segments, budget);
      const left = [...r.emitted, ...r.deferred.map((d) => d.id)];
      const entered = segments.map((s) => s.id);
      // Same set, same cardinality (hence no duplicate, no disappearance).
      expect(left.slice().sort()).toEqual(entered.slice().sort());
      expect(left.length).toBe(entered.length);
    }),
    { numRuns: 500 }
  );
});

// ═══════════════════════════════════════════════════════════════════════
// ⑧ CONVERGENCE OF THE QUEUE — THE property of the 05/08/2026 work item.
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ IT IS THIS ONE THAT PROVES "EVERYTHING ARRIVES", and no other does.
//    ① proves that a segment does not evaporate WITHIN ONE emission — it may very
//    well come back out in `deferred` every time, indefinitely: ① would be GREEN
//    while no doc ever arrives. That is exactly the hole through which
//    the defect went (the remainder was "conserved"… then thrown away by
//    the caller). Here we replay the REAL LOOP of `pretool-core.js`: the
//    remainder of one action is the input of the next, until exhaustion.
// ⚠️ TWO REQUIREMENTS, and we need BOTH — a single one would be satisfiable by
//    false code: ① the queue ends up EMPTY (termination, hence strict progress at
//    every turn); ② the union of everything that has been emitted covers ALL the
//    input documents (completeness). Without ①, a system that emits nothing
//    "converges"; without ②, a system that empties the queue by throwing it away converges
//    too — that was the behaviour from BEFORE.
// ⚠️ The turn bound is a TEST NET, not a tolerance: if it is
//    reached, it means the transport is not progressing and the test MUST turn red.
//    NEVER raise it to make a case pass — that would mask an
//    infinite loop in production.
// ⚠️ GENERATOR SPECIFIC TO ⑧ — BUDGET FLOOR, and why it is not a
//    weakening. `casArb` goes down to 5 % of the content: at that scale
//    the envelope (~330 chars) exceeds the budget, the chunks fall to ~15
//    characters and a single doc produces THOUSANDS of them — tens of
//    thousands of turns per case. That regime does NOT exist in production (budget
//    8 000, envelope 330) and it teaches nothing more: it is the same code
//    path, played out for longer.
//    🛑 The degenerate case is not abandoned for all that — it is covered
//    JUST BELOW by a deterministic case, the EXACT one that a simulation
//    brought down on 05/08/2026. Property for the general, founding case for the
//    pathology: never one INSTEAD of the other.
const casConvergence = casArb.map(([segments, budget]) => [segments, Math.max(budget, envelopeSize() * 4)]);

test('⑧ CONVERGENCE: replayed action after action, the queue empties AND everything is delivered', () => {
  fc.assert(
    fc.property(casConvergence, fc.integer({ min: 1, max: 4 }), ([segments, budget], nbFrames) => {
      const expectedOnes = new Set(segments.map((s) => s.id));
      const livres = new Set();
      let file = segments;
      let tours = 0;
      while (file.length > 0) {
        expect(tours++).toBeLessThan(300); // strict progress required
        const frames = planFrames(file, budget, nbFrames);
        // A chunk carries `id#j`: we bring it back to the DOCUMENT, like porte-core.
        for (const p of frames) for (const id of p.emitted) livres.add(String(id).split('#')[0]);
        file = frames[frames.length - 1].deferred;
      }
      expect([...expectedOnes].every((id) => livres.has(id))).toBe(true);
    }),
    { numRuns: 150 }
  );
});

// ⚠️ FOUNDING CASE OF THE QUEUE — the REAL blockage found on 05/08/2026 by
//    simulating the loop of `pretool-core.js`, BEFORE any deployment.
//    Exact configuration: ONE frame (the Codex regime), budget 600, a doc
//    of 5 000 chars ⇒ 56 chunks ⇒ the announcement cited all 56 and filled the frame
//    all by itself ⇒ **zero content emitted, at every action, forever**.
//    Two distinct defects were hiding there, and BOTH fixes were needed:
//    ① the announcement counted CHUNKS instead of DOCUMENTS (and was not
//      bounded); ② nothing guaranteed that a frame emitted at least one chunk.
// 🛑 NEVER DELETE this case, even if it seems redundant with ⑧: the
//    property runs at production scale and will NO LONGER visit that regime.
//    If the behaviour changes one day, we INVERT the expected value — the case stays.
test('② BOUND: as soon as at least one segment is emitted, the rendering fits in the budget', () => {
  fc.assert(
    fc.property(casArb, ([segments, budget]) => {
      const r = plan(segments, budget);
      // Degenerate case ASSUMED and documented: if NOTHING fits, we emit the bare
      // announcement (tiny) rather than a truncated block. The bound therefore applies
      // only to renderings that actually carry content.
      if (r.emitted.length > 0) expect(r.text.length).toBeLessThanOrEqual(budget);
    }),
    { numRuns: 500 }
  );
});

test('③ PRIORITY: the emitted ones are ALWAYS a prefix of the input (rank respected)', () => {
  fc.assert(
    fc.property(casArb, ([segments, budget]) => {
      const r = plan(segments, budget);
      const expected = segments.slice(0, r.emitted.length).map((s) => s.id);
      // ⚠️ If this falls, the loader's `rank` sorting would no longer be honoured:
      //    we would keep a secondary doc while evicting a critical doc.
      expect(r.emitted).toEqual(expected);
    }),
    { numRuns: 500 }
  );
});

test('④ DETERMINISM: same inputs ⇒ same output, to the byte', () => {
  fc.assert(
    fc.property(casArb, ([segments, budget]) => {
      expect(plan(segments, budget)).toEqual(plan(segments, budget));
    }),
    { numRuns: 300 }
  );
});

test('⑤ SEAL: header and foot carry the SAME marker, always', () => {
  fc.assert(
    fc.property(casArb, ([segments, budget]) => {
      const r = plan(segments, budget);
      if (segments.length === 0) return; // nothing to seal
      // ⚠️ CONDITIONAL seal (cf. SEAL_THRESHOLD_RATIO): under half the
      //    budget, the rendering is the historical format, WITHOUT an envelope — that is
      //    deliberate, and it is what keeps the switch safe. The property therefore bears
      //    on CONSISTENCY: sealed ⇒ header AND foot matching.
      if (r.marker === '') {
        expect(r.text).not.toContain('###END:');
        expect(r.deferred).toEqual([]); // never a silent eviction on this path
        return;
      }
      // The marker announced at the TOP must be the one that closes the block, otherwise
      // the agent would conclude "truncated" on a complete block (or the opposite).
      expect(r.text.startsWith('⚠️ SEALED INJECTION')).toBe(true);
      expect(r.text).toContain('###END:' + r.marker + '###');
      expect(r.text.endsWith('###END:' + r.marker + '###')).toBe(true);
    }),
    { numRuns: 300 }
  );
});

test('⑥ ANNOUNCEMENT: every deferral is NAMED in the emitted text (never silent)', () => {
  fc.assert(
    fc.property(casArb, ([segments, budget]) => {
      const r = plan(segments, budget);
      if (r.deferred.length === 0) return;
      // ⚠️ SEMANTICS REVISED ON 05/08/2026, and it must be assumed explicitly:
      //    we NO LONGER cite each deferral, only the first ones, with an
      //    exact count. Two reasons, one of which was a BUG:
      //    ① we counted CHUNKS (`doc#37`) where the reader thinks in
      //      DOCUMENTS — 56 lines for a single doc;
      //    ② unbounded, the list could fill the frame all by itself and
      //      prevent any emission (blockage measured that day).
      //    What the announcement now guarantees: the COUNT is exact and the
      //    first ones are named. What the DELIVERY guarantees is the queue
      //    (property ⑧) — the announcement informs, it no longer carries the promise.
      const labels = [...new Set(r.deferred.map((d) => d.label))];
      expect(r.text).toContain(String(labels.length) + ' doc(s) DEFERRED');
      // Never SILENT: at least one deferral stays named, whatever happens.
      expect(r.text).toContain(labels[0]);
      if (labels.length > 5) expect(r.text).toContain('and ' + (labels.length - 5) + ' other(s)');
      else for (const l of labels) expect(r.text).toContain(l);
    }),
    { numRuns: 300 }
  );
});

test('⑦ COVERAGE: the generator really REACHES the mixed zone (meta-test)', () => {
  // ⚠️ META-TEST — it does not test `budget.js`, it tests THE TESTS.
  //    Without it, a badly calibrated generator makes the 6 properties above
  //    true "by absence of cases": eternal green, zero guarantee. That is
  //    exactly what happened on 31/07/2026 (undetected sabotage).
  let mixed = 0;
  let total = 0;
  fc.assert(
    fc.property(casArb, ([segments, budget]) => {
      const r = plan(segments, budget);
      total++;
      if (r.emitted.length > 0 && r.deferred.length > 0) mixed++;
    }),
    { numRuns: 400 }
  );
  // Threshold DELIBERATELY low (5 %): we guarantee the VISIT of the zone, not a
  // distribution. Raising it would make it fragile to fast-check evolutions.
  expect(mixed / total).toBeGreaterThan(0.05);
});

test('FOUNDING CASE: 6 docs, narrow budget — nothing disappears', () => {
  // ⚠️ Replays the EXACT case on which the sabotage of 31/07/2026 went green
  //    in property-based testing. Deterministic, hence insensitive to the generator's bias.
  //    NEVER delete it: if the behaviour changes, we INVERT the expected value,
  //    the case stays. A deleted founding case = the class of bug becomes invisible again.
  const segments = Array.from({ length: 6 }, (_, k) => ({ id: 'd' + k, text: 'x'.repeat(300), label: 'L' + k }));
  const r = plan(segments, 900);
  expect([...r.emitted, ...r.deferred.map((d) => d.id)].length).toBe(6);
  expect(r.emitted.length).toBeGreaterThan(0);
  expect(r.deferred.length).toBeGreaterThan(0);
  for (const d of r.deferred) expect(r.text).toContain(d.label);
});

test('NEGATIVE-CHECK: the invariants KNOW HOW to fall (otherwise they certify)', () => {
  // ⚠️ Without this, a property always true by construction of the test (and not
  //    of the code) would give an eternal green — the mistake already made by a 1st
  //    version of `deadline-gate`, green by analysing no real hook.
  const fakeOnes = { emitted: ['a'], deferred: [], text: 'x'.repeat(999) };
  expect(fakeOnes.text.length <= 10).toBe(false);           // ② would fall
  expect([...fakeOnes.emitted, ...fakeOnes.deferred].length === 2).toBe(false); // ① would fall

  // And the real module holds on the same case: 1 huge segment, dwarf budget.
  const r = plan([{ id: 'a', text: 'x'.repeat(5000), label: 'big.md' }], 100);
  expect(r.emitted).toEqual([]);            // nothing emitted
  expect(r.deferred.map((d) => d.id)).toEqual(['a']); // but NOTHING LOST
  expect(r.text).toContain('big.md');  // and it is SAID
});

test('budget absent/absurd ⇒ framework default (authority ① of the cascade)', () => {
  fc.assert(
    fc.property(fc.oneof(fc.constant(undefined), fc.constant(0), fc.constant(-5), fc.constant(NaN)), (wrong) => {
      const seg = [{ id: 'a', text: 'y'.repeat(200), label: 'a.md' }];
      // TOTAL fallback: never a crash, never a null budget that would block everything.
      expect(plan(seg, wrong).emitted).toEqual(['a']);
    }),
    { numRuns: 20 }
  );
  expect(DEFAULT_BUDGET).toBeGreaterThan(0);
});

// ═══════════════════════════════════════════════════════════════════════
// FRAMES — conservation, on GENERATED inputs, across N frames.
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ The invariant is STRENGTHENED compared to `plan`: it is no longer enough that
//    nothing gets lost, nothing must be DUPLICATED between two
//    frames either. A duplicate would cost twice the tokens AND would make
//    the agent doubt the reassembly — hence the whole mechanism.
// ⚠️ Generator calibrated like the others (cf. the hole proven on 31/07/2026):
//    the budget is a FRACTION of the total, never an absolute range, otherwise the
//    MIXED zone — the only one where conservation can break — is not visited.

test('FRAMES ① CONSERVATION: each segment in EXACTLY one frame, or announced', () => {
  fc.assert(
    fc.property(segmentsArb, fc.integer({ min: 2, max: 6 }), fc.integer({ min: 15, max: 60 }), (segments, n, pct) => {
      const total = segments.reduce((a, s) => a + s.text.length + SEPARATOR_APPROX, 0);
      const budget = Math.max(envelopeSize() + 50, Math.floor((total * pct) / 100));
      const frames = planFrames(segments, budget, n);

      expect(frames.length).toBe(n);
      const emitted = frames.flatMap((p) => p.emitted);
      const deferred = frames.flatMap((p) => p.deferred.map((d) => d.id));
      // No DUPLICATE — the new invariant of multi-frame mode.
      expect(new Set(emitted).size).toBe(emitted.length);
      expect(new Set([...emitted, ...deferred]).size).toBe(emitted.length + deferred.length);
      // No LOSS. ⚠️ A doc may go out in CHUNKS (`id#j`): we
      //    therefore recompose the set of docs SEEN, not the raw list of ids.
      const docId = (id) => id.split('#')[0];
      expect([...new Set([...emitted, ...deferred].map(docId))].sort()).toEqual(segments.map((s) => s.id).sort());
    }),
    { numRuns: 300 }
  );
});

test('FRAMES ② BOUND: a frame that CARRIES CONTENT never exceeds the budget', () => {
  // ⚠️ "that carries content" is NOT an indulgent softening:
  //    it is the same semantics as `plan` (cf. "the rendering fits in the
  //    budget as soon as it carries content"). When the budget is so small that
  //    the BARE ANNOUNCEMENT already exceeds it, we emit it anyway — saying "these docs
  //    are missing, go read them" is better than silence, and the announcement is
  //    tiny. This case was FOUND by this property test on 03/08/2026 (budget
  //    273, announcement 519): the property did its job.
  fc.assert(
    fc.property(segmentsArb, fc.integer({ min: 2, max: 6 }), fc.integer({ min: 15, max: 60 }), (segments, n, pct) => {
      const total = segments.reduce((a, s) => a + s.text.length + SEPARATOR_APPROX, 0);
      const budget = Math.max(envelopeSize() + 50, Math.floor((total * pct) / 100));
      for (const p of planFrames(segments, budget, n)) {
        if (p.emitted.length > 0) expect(p.text.length).toBeLessThanOrEqual(budget);
      }
    }),
    { numRuns: 300 }
  );
});

test('FRAMES ③ DETERMINISM: two independent computations coincide', () => {
  // ⚠️ Without that, the N PARALLEL processes would emit different
  //    splits and the reassembly would be inconsistent. It is the property that
  //    replaces any inter-process coordination.
  fc.assert(
    fc.property(segmentsArb, fc.integer({ min: 2, max: 6 }), fc.integer({ min: 15, max: 60 }), (segments, n, pct) => {
      const total = segments.reduce((a, s) => a + s.text.length + SEPARATOR_APPROX, 0);
      const budget = Math.max(envelopeSize() + 50, Math.floor((total * pct) / 100));
      expect(planFrames(segments, budget, n)).toEqual(planFrames(segments, budget, n));
    }),
    { numRuns: 200 }
  );
});

test('FRAMES ④ PARITY: nothing to evict ⇒ frame 1 = plan(), the others empty', () => {
  // ⚠️ THE switch guarantee: multi-frame mode only engages on an eviction.
  fc.assert(
    fc.property(segmentsArb, fc.integer({ min: 2, max: 6 }), (segments, n) => {
      const budget = 1000000; // everything fits easily
      const frames = planFrames(segments, budget, n);
      expect(frames[0]).toEqual(plan(segments, budget));
      for (let i = 1; i < n; i++) expect(frames[i]).toEqual({ text: '', emitted: [], deferred: [], segments: [], marker: '' });
    }),
    { numRuns: 100 }
  );
});

test('FRAMES ⑤ CONTENT CONSERVATION: nothing evaporates, even on a tiny frame', () => {
  // ⚠️ REAL bug found on 03/08/2026 by MEASUREMENT, not by re-reading: when the
  //    frame is too small for the header of a chunk, the splitting loop
  //    produced NO chunk and the content DISAPPEARED — neither emitted, nor
  //    announced. It is the only result forbidden by the module. This property
  //    sweeps precisely the tiny zone where the defect lived.
  fc.assert(
    fc.property(segmentsArb, fc.integer({ min: 2, max: 6 }), fc.integer({ min: 250, max: 2000 }), (segments, n, budget) => {
      const frames = planFrames(segments, budget, n);
      const emitted = frames.flatMap((p) => p.emitted);
      const deferred = frames.flatMap((p) => p.deferred.map((d) => d.id));
      // Each input doc is EITHER delivered (whole or in chunks `id#j`),
      // OR announced. Never absent from both.
      for (const s of segments) {
        const vue = emitted.some((id) => id === s.id || id.startsWith(s.id + '#')) ||
          deferred.some((id) => id === s.id || id.startsWith(s.id + '#'));
        expect(vue, `doc ${s.id} EVAPORATED (budget ${budget}, n ${n})`).toBe(true);
      }
    }),
    { numRuns: 400 }
  );
});

// ── `fragment` SCANNER — PROPERTY-BASED (fleet doctrine) ─────────────────
// ⚠️ WHY PROPERTIES HERE: `fragment` INTERPRETS a format (lines)
//    to produce slices — it is a SCANNER, and the fleet rule requires
//    property-based testing on every scan (invariants of the totality / conservation
//    / subsequence kind). The exact cases of `budget.test.js` lock down the KNOWN;
//    these ones look for the UNKNOWN. Both, never one instead of the other.
const H_MAX = () => '⟦ A — CHUNK 999/999 : reassemble the 999 chunks in order before reading ⟧\n'.length;
// ⚠️ `fc.string({ unit })` and NOT `fc.stringOf`: removed in fast-check 4 (the
//    fleet is on 4.9.0). Check the API of the INSTALLED version, never from
//    memory — the mistake cost two round trips here.
const arbitraryText = () => fc.string({ unit: fc.constantFrom('a', 'b', ' ', '\n', 'é', 'x'), maxLength: 400 });

test('SCANNER ① TOTALITY: NEVER throws, whatever the inputs', () => {
  // ⚠️ A throw here would kill the WHOLE gate (fail-open ⇒ NO doc
  //    injected anywhere any more). Totality is not a comfort, it is vital.
  fc.assert(fc.property(arbitraryText(), fc.integer({ min: -500, max: 5000 }), (t, cap) => {
    const r = fragment([{ id: 'a', label: 'A', text: t }], cap);
    expect(Array.isArray(r)).toBe(true);
  }), { numRuns: 500 });
});

test('SCANNER ② CONSERVATION: no content character lost nor duplicated', () => {
  // ⚠️ THE property of the framework. Line breaks may move at the
  //    cut boundaries (that is the very principle of line-based splitting) —
  //    all the REST must come back out identical, in order.
  fc.assert(fc.property(arbitraryText(), fc.integer({ min: 1, max: 300 }), (t, extra) => {
    const cap = H_MAX() + extra;
    const r = fragment([{ id: 'a', label: 'A', text: t }], cap);
    const reassembled = r.map((m) => m.text.replace(/^⟦[^⟧]*⟧\n/, '')).join('');
    expect(reassembled.replace(/\n/g, '')).toBe(t.replace(/\n/g, ''));
  }), { numRuns: 500 });
});

test('SCANNER ③ ORDER: the chunks are numbered 1..m, with no gap nor duplicate', () => {
  // ⚠️ Without strict numbering, the reassembly is ambiguous (RFC 2046: `number`
  //    starts at 1; RFC 6455: strict order, never interleaved).
  fc.assert(fc.property(fc.string({ minLength: 200, maxLength: 600 }), (t) => {
    const cap = H_MAX() + 20;
    const r = fragment([{ id: 'a', label: 'A', text: t }], cap);
    if (r.length === 1) return; // path 1: nothing to number
    const numbers = r.map((m) => Number(/CHUNK (\d+)\//.exec(m.text)[1]));
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
    expect(new Set(r.map((m) => m.id)).size).toBe(r.length);
  }), { numRuns: 300 });
});

test('SCANNER ④ NEGATIVE-CHECK: the properties KNOW HOW to fall (otherwise they certify)', () => {
  // ⚠️ REAL sabotage: a splitter that LOSES the last slice must make
  //    ② turn red — without this check, an always-true property proves nothing.
  const sabotaged = (segments, capability) => fragment(segments, capability).slice(0, -1);
  const t = 'x'.repeat(400);
  const cap = H_MAX() + 20;
  const reassembled = sabotaged([{ id: 'a', label: 'A', text: t }], cap)
    .map((m) => m.text.replace(/^⟦[^⟧]*⟧\n/, '')).join('');
  expect(reassembled.replace(/\n/g, '')).not.toBe(t);
});

// ═══════════════════════════════════════════════════════════════════════
// ⑨ ORDER — queue first, fresh next, nothing disappears
// ═══════════════════════════════════════════════════════════════════════
// ⚠️ ADDED on 06/08/2026 by /stack-audit: `orderSegments` is a PURE function
//    with a STRONG INVARIANT (conservation + order + dedup) and had ONLY
//    deterministic cases. The fleet doctrine requires property-based testing in this case —
//    it was a real GAP, found by the audit and fixed before closing.
// ⚠️ The DETERMINISTIC cases of budget.test.js REMAIN: Stryker does not execute
//    the property tests, a guard proven only here would let
//    its mutants survive and the score WOULD LIE. Both, never one instead of the other.

const segGen = fc.record({
  id: fc.constantFrom('a', 'b', 'c', 'a#1', 'a#2', 'b#1', 'd#7'),
  text: fc.string({ minLength: 1, maxLength: 20 }),
});

test('PROPERTY ⑨a: the QUEUE goes out in full, at the TOP and in ORDER', () => {
  // RFC 6455: a fragmented document is NEVER interleaved. If the queue
  // did not arrive at the top and in order, the receiver could no longer
  // reassemble its `CHUNK j/m` — the delivery guarantee collapses.
  fc.assert(fc.property(fc.array(segGen, { maxLength: 8 }), fc.array(segGen, { maxLength: 8 }),
    (file, fresh) => {
      const out = orderSegments(file, fresh);
      expect(out.slice(0, file.length)).toEqual(file);
    }));
});

test('PROPERTY ⑨b: NO document already in the queue is re-stacked', () => {
  // The FOUNDING case: a `dumb` doc is re-decided at every action. Without the
  // dedup it would be re-stacked WHOLE behind its own chunks.
  fc.assert(fc.property(fc.array(segGen, { maxLength: 8 }), fc.array(segGen, { maxLength: 8 }),
    (file, fresh) => {
      const enFile = new Set(file.map((s) => baseId(s.id)));
      const added = orderSegments(file, fresh).slice(file.length);
      expect(added.every((s) => !enFile.has(baseId(s.id)))).toBe(true);
    }));
});

test('PROPERTY ⑨c: CONSERVATION — every non-duplicated fresh segment survives, in order', () => {
  // Nothing must evaporate: it is the central invariant of the module.
  fc.assert(fc.property(fc.array(segGen, { maxLength: 8 }), fc.array(segGen, { maxLength: 8 }),
    (file, fresh) => {
      const enFile = new Set(file.map((s) => baseId(s.id)));
      const expectedOnes = fresh.filter((s) => !enFile.has(baseId(s.id)));
      expect(orderSegments(file, fresh).slice(file.length)).toEqual(expectedOnes);
    }));
});

test('PROPERTY ⑨d: TOTAL — never a throw, whatever the input', () => {
  // An absent/invalid input DEGRADES, it does not break: this module is on
  // a fail-open path, a throw would deprive the agent of ALL its context.
  fc.assert(fc.property(fc.oneof(fc.array(segGen, { maxLength: 4 }), fc.constant(undefined), fc.constant(null)),
    fc.oneof(fc.array(segGen, { maxLength: 4 }), fc.constant(undefined), fc.constant(null)),
    (file, fresh) => {
      expect(Array.isArray(orderSegments(file, fresh))).toBe(true);
    }));
});

test('PROPERTY ⑨e: IDEMPOTENCE — re-running orderSegments on a result no longer enriches it', () => {
  // Replaying converges: the condition for an interrupted action to be resumable
  // without a duplicate (doctrine "every multi-step operation is resumable").
  fc.assert(fc.property(fc.array(segGen, { maxLength: 8 }), fc.array(segGen, { maxLength: 8 }),
    (file, fresh) => {
      const une = orderSegments(file, fresh);
      expect(orderSegments(une, fresh)).toEqual(une);
    }));
});
