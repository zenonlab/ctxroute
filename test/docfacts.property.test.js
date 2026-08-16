// ═══════════════════════════════════════════════════════════════════════
// docfacts — PROPERTIES (fast-check). encode↔decode pair = MANDATORY round-trip.
// ═══════════════════════════════════════════════════════════════════════
// ⚠️ Required by the fleet doctrine: "parser/serializer → property-based
//    AUTOMATICALLY" and "encode↔decode pair → round-trip property".
//    `rewrite` WRITES a block, `extract` READS it back: that is exactly the pair.
// ⚠️ Property tests are EXCLUDED from the Stryker runner (slow, non
//    deterministic) ⇒ every guard proven here ALSO has its deterministic case in
//    `docfacts.test.js`, otherwise its mutant would survive and the score would
//    lie.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import fc from 'fast-check';
import { OUVRE, FERME, extract, rewrite, verify, regenerate } from '../src/docfacts.js';

// A plausible block name: no `-->`, which would close the HTML comment.
const nomArb = fc.stringMatching(/^[A-Za-z][A-Za-z0-9_-]{0,20}$/);
// ANY content, including empty, multiline, with markers inside.
const contenuArb = fc.string({ maxLength: 200 });
const proseArb = fc.string({ maxLength: 100 });

const docAvecBloc = (avant, nom, dedans, apres) =>
  `${avant}\n${OUVRE(nom)}\n${dedans}\n${FERME}\n${apres}`;

test('ROUND-TRIP: what is WRITTEN is what is READ BACK (up to trimming)', () => {
  fc.assert(fc.property(proseArb, nomArb, contenuArb, proseArb, (av, nom, c, ap) => {
    // ⚠️ Content carrying the END marker: unrepresentable by construction (the
    //    reader stops at the first `-->`). We exclude it HERE and we REPORT it
    //    as a known limit — never by letting it silently produce a false
    //    round-trip.
    fc.pre(!c.includes(FERME) && !c.includes('<!-- AUTO:'));
    const t = docAvecBloc(av, nom, 'ancien', ap);
    assert.strictEqual(extract(rewrite(t, nom, c), nom).contenu, c.trim());
  }), { numRuns: 400 });
});

test('IDEMPOTENCE: regenerating twice changes nothing more', () => {
  fc.assert(fc.property(proseArb, nomArb, contenuArb, (av, nom, c) => {
    fc.pre(!c.includes(FERME) && !c.includes('<!-- AUTO:'));
    const t = docAvecBloc(av, nom, 'x', '');
    const un = rewrite(t, nom, c);
    assert.strictEqual(rewrite(un, nom, c), un);
  }), { numRuns: 400 });
});

test('REPAIR: after `regenerate`, `verify` is ALWAYS green', () => {
  // The property that makes the gate satisfiable: --write repairs what the check
  // refuses. Without it, we could ship a gate impossible to satisfy.
  fc.assert(fc.property(nomArb, contenuArb, proseArb, (nom, c, ap) => {
    fc.pre(!c.includes(FERME) && !c.includes('<!-- AUTO:'));
    const facts = [{ nom, contenu: c }];
    const t = docAvecBloc('', nom, 'perime', ap);
    assert.strictEqual(verify(regenerate(t, facts), facts).ok, true);
  }), { numRuns: 400 });
});

test('TOTALITY: no input EVER throws (a core that crashes kills the gate)', () => {
  const quelconque = fc.anything();
  fc.assert(fc.property(quelconque, quelconque, quelconque, (a, b, c) => {
    extract(a, b);
    rewrite(a, b, c);
    verify(a, b);
    regenerate(a, b);
  }), { numRuns: 300 });
});

test('KNOWN LIMIT, WRITTEN DOWN: content carrying the END marker is truncated on read-back', () => {
  // ⚠️ This is NOT a hidden bug: it is the limit of the format, and it is
  //    harmless here (the facts are DERIVED from code constants, never typed in
  //    by hand). We FREEZE it so it stops being a surprise — and if one day a
  //    fact must carry that text, this test will say exactly why.
  const t = `${OUVRE('x')}\nancien\n${FERME}`;
  const ecrit = rewrite(t, 'x', `avant ${FERME} apres`);
  assert.strictEqual(extract(ecrit, 'x').contenu, 'avant');
});
