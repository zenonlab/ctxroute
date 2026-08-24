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
import { OPENER, CLOSER, extract, rewrite, verify, regenerate } from '../src/docfacts.js';

// A plausible block name: no `-->`, which would close the HTML comment.
const arbitraryName = fc.stringMatching(/^[A-Za-z][A-Za-z0-9_-]{0,20}$/);
// ANY content, including empty, multiline, with markers inside.
const arbitraryContent = fc.string({ maxLength: 200 });
const proseArb = fc.string({ maxLength: 100 });

const docWithBlock = (before, name, inside, after) =>
  `${before}\n${OPENER(name)}\n${inside}\n${CLOSER}\n${after}`;

test('ROUND-TRIP: what is WRITTEN is what is READ BACK (up to trimming)', () => {
  fc.assert(fc.property(proseArb, arbitraryName, arbitraryContent, proseArb, (av, name, c, ap) => {
    // ⚠️ Content carrying the END marker: unrepresentable by construction (the
    //    reader stops at the first `-->`). We exclude it HERE and we REPORT it
    //    as a known limit — never by letting it silently produce a false
    //    round-trip.
    fc.pre(!c.includes(CLOSER) && !c.includes('<!-- AUTO:'));
    const t = docWithBlock(av, name, 'former', ap);
    assert.strictEqual(extract(rewrite(t, name, c), name).content, c.trim());
  }), { numRuns: 400 });
});

test('IDEMPOTENCE: regenerating twice changes nothing more', () => {
  fc.assert(fc.property(proseArb, arbitraryName, arbitraryContent, (av, name, c) => {
    fc.pre(!c.includes(CLOSER) && !c.includes('<!-- AUTO:'));
    const t = docWithBlock(av, name, 'x', '');
    const un = rewrite(t, name, c);
    assert.strictEqual(rewrite(un, name, c), un);
  }), { numRuns: 400 });
});

test('REPAIR: after `regenerate`, `verify` is ALWAYS green', () => {
  // The property that makes the gate satisfiable: --write repairs what the check
  // refuses. Without it, we could ship a gate impossible to satisfy.
  fc.assert(fc.property(arbitraryName, arbitraryContent, proseArb, (name, c, ap) => {
    fc.pre(!c.includes(CLOSER) && !c.includes('<!-- AUTO:'));
    const facts = [{ name, content: c }];
    const t = docWithBlock('', name, 'perime', ap);
    assert.strictEqual(verify(regenerate(t, facts), facts).ok, true);
  }), { numRuns: 400 });
});

test('TOTALITY: no input EVER throws (a core that crashes kills the gate)', () => {
  const arbitrary = fc.anything();
  fc.assert(fc.property(arbitrary, arbitrary, arbitrary, (a, b, c) => {
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
  const t = `${OPENER('x')}\nformer\n${CLOSER}`;
  const written = rewrite(t, 'x', `avant ${CLOSER} after`);
  assert.strictEqual(extract(written, 'x').content, 'avant');
});
