// ═══════════════════════════════════════════════════════════════════════
// docfacts.test.js — CONTRACT of the core, on SYNTHETIC data
// ═══════════════════════════════════════════════════════════════════════
// ⚠️ DISTINCT from `language-doc-gate.test.js`, which applies the same core to
//    the REAL code. Mixing the two would make the proof of the REASONING depend
//    on the state of the repo on the day: the contract would go red at every
//    added keyword.
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { OPENER, CLOSER, extract, rewrite, verify, regenerate, wordList } from '../src/docfacts.js';

const doc = (body) => `# Title\n\nprose\n\n${OPENER('x')}\n${body}\n${CLOSER}\n\nend\n`;

describe('extract', () => {
  it('returns the TRIMMED content of the block', () => {
    expect(extract(doc('  value  '), 'x')).toEqual({ found: true, content: 'value' });
  });

  it('block missing = found:false (never a silent empty string)', () => {
    // ⚠️ The distinction matters: "empty block" is a LEGITIMATE state (a fact
    //    with nothing to say), "missing block" is an AUTHOR FAULT. Conflating
    //    them would make the oversight indistinguishable from the normal case.
    expect(extract(doc('v'), 'other').found).toBe(false);
  });

  it('OPENING marker without a CLOSING one = missing, never "up to the end"', () => {
    // Without this guard, a forgotten `<!-- /AUTO -->` would swallow the whole
    // rest of the doc into the block — and the comparison would redden for an
    // unreadable reason.
    expect(extract(`${OPENER('x')}\nv\n`, 'x').found).toBe(false);
  });

  it('a HOMONYMOUS block further down does not disturb: we bound to the FIRST pair', () => {
    const t = `${OPENER('x')}\nun\n${CLOSER}\n${OPENER('x')}\ndeux\n${CLOSER}`;
    expect(extract(t, 'x').content).toBe('un');
  });

  it('absurd inputs are total (null/undefined/number) — the core NEVER throws', () => {
    // A throw here would bubble up into a fail-open hook and kill the injection.
    expect(extract(null, 'x').found).toBe(false);
    expect(extract(undefined, 'x').found).toBe(false);
    expect(extract(42, 'x').found).toBe(false);
  });

  it('a NAME with a broken `toString` does not make the core throw', () => {
    // 🔴 FOUND BY PROPERTY-BASED TESTING, never by hand: `${name}` calls
    //    `toString()`, and `{ toString: false }` has none ⇒ TypeError INSIDE the
    //    core ⇒ dead injection gate. A deterministic case is MANDATORY here: the
    //    property tests are excluded from the Stryker runner, so without it the
    //    mutant would survive and the score would lie.
    const brokenOne = { toString: false };
    expect(() => extract('text', brokenOne)).not.toThrow();
    expect(() => rewrite('text', brokenOne, 'v')).not.toThrow();
    expect(() => verify('text', [{ name: brokenOne, content: 'v' }])).not.toThrow();
  });
});

describe('normalisation (txt/asListe) — seen through the public API', () => {
  // ⚠️ These cases KILL mutants that SURVIVED the 1st CI run (81.19 %). They are
  //    not decorative: without them, `docfacts.js` can be broken in silence.
  it('block not found ⇒ content === \'\' (BOTH branches, not just `found`)', () => {
    expect(extract(doc('v'), 'absent').content).toBe('');          // no OPENER
    expect(extract(`${OPENER('x')}\nv\n`, 'x').content).toBe('');   // no CLOSER
  });

  it('non-textual text ⇒ treated as EMPTY, never stringified into "null"', () => {
    // `String(null)` would return the string 'null': a document whose content is
    // the word "null". The intent must be explicit, hence observable.
    expect(rewrite(null, 'x', 'v')).toBe('');
    expect(rewrite(42, 'x', 'v')).toBe('');
  });

  it('SYMMETRY verify ⟷ rewrite on non-textual content', () => {
    // Real trap: `rewrite` used `String()` and `verify` used `txt()` ⇒ --write
    // wrote "42" while the check expected '' — an UNSATISFIABLE gate.
    const f = [{ name: 'x', content: 42 }];
    expect(verify(regenerate(doc('old'), f), f).ok).toBe(true);
  });

  it('non-array facts ⇒ EMPTY list everywhere (regenerate invents no fact)', () => {
    const t = doc('v');
    expect(regenerate(t, 'not an array')).toBe(t);
    expect(regenerate(t, 42)).toBe(t);
  });
});

describe('rewrite', () => {
  it('replaces the content and NOTHING else', () => {
    const out = rewrite(doc('former'), 'x', 'fresh');
    expect(extract(out, 'x').content).toBe('fresh');
    expect(out).toContain('# Title');
    expect(out).toContain('end');
  });

  it('block missing ⇒ text UNCHANGED (we never invent where to insert a fact)', () => {
    const t = doc('v');
    expect(rewrite(t, 'unknownOne', 'fresh')).toBe(t);
  });

  it('marker OPENED but never CLOSED ⇒ text UNCHANGED', () => {
    // Without this case, removing the `fin === -1` guard let `slice` produce a
    // truncated document — silently, since nothing observed it.
    const t = `start\n${OPENER('x')}\nv\nend with no closing marker`;
    expect(rewrite(t, 'x', 'fresh')).toBe(t);
  });

  it('SURROUNDS the content with exactly ONE newline on each side', () => {
    // Both `'\\n'` of the concatenation used to survive: no test looked at the
    // SHAPE of the written file, yet that is what must stay readable by a
    // human — and stable, otherwise `--write` would produce a diff every run.
    expect(rewrite(`${OPENER('x')}${CLOSER}`, 'x', 'V')).toBe(`${OPENER('x')}\nV\n${CLOSER}`);
    // ⚠️ And the content is TRIMMED on write: a derived fact can arrive with
    //    edge whitespace (line concatenation), which would otherwise be written
    //    into the file. `verify` would not see it — it trims on READ — so
    //    nothing would catch the document's gradual degradation.
    expect(rewrite(`${OPENER('x')}${CLOSER}`, 'x', '\n  V  \n')).toBe(`${OPENER('x')}\nV\n${CLOSER}`);
  });

  it('IDEMPOTENT: regenerating twice gives the same bytes', () => {
    const un = rewrite(doc('a'), 'x', 'b');
    expect(rewrite(un, 'x', 'b')).toBe(un);
  });
});

describe('verify', () => {
  it('compliant ⇒ ok, zero discrepancy', () => {
    expect(verify(doc('v'), [{ name: 'x', content: 'v' }])).toEqual({ ok: true, discrepancies: [] });
  });

  it('stale ⇒ a discrepancy NAMING both values (doc AND code)', () => {
    const r = verify(doc('old'), [{ name: 'x', content: 'fresh' }]);
    expect(r.ok).toBe(false);
    expect(r.discrepancies[0]).toContain('old');
    expect(r.discrepancies[0]).toContain('fresh');
    // The message must say WHO is authoritative, otherwise we "fix" the code.
    expect(r.discrepancies[0]).toMatch(/CODE is authoritative/i);
  });

  it('block missing ⇒ an ACTIONABLE discrepancy giving the markers to paste', () => {
    const r = verify(doc('v'), [{ name: 'missingOne', content: 'v' }]);
    expect(r.ok).toBe(false);
    expect(r.discrepancies[0]).toContain(OPENER('missingOne'));
  });

  it('🛑 ANTI-DORMANCY: zero facts = FAILURE, never a green', () => {
    // Without this aspect, a broken deriver (or a list emptied by mistake) would
    // make the gate GREEN by analysing NOTHING — the most dangerous form of
    // false green, already paid for 3 times in this repo.
    for (const empty of [[], null, undefined]) {
      const r = verify(doc('v'), empty);
      expect(r.ok, `facts=${JSON.stringify(empty)} should FAIL`).toBe(false);
      expect(r.discrepancies[0]).toMatch(/ANTI-DORMANCY/);
    }
  });

  it('tolerates edge whitespace, NOT the content (a \\r\\n must not redden)', () => {
    expect(verify(doc('\n  v  \n'), [{ name: 'x', content: 'v\n' }]).ok).toBe(true);
  });

  it('reports ALL the discrepancies, not just the first', () => {
    const t = `${OPENER('a')}\n1\n${CLOSER}\n${OPENER('b')}\n2\n${CLOSER}`;
    const r = verify(t, [{ name: 'a', content: 'X' }, { name: 'b', content: 'Y' }]);
    expect(r.discrepancies).toHaveLength(2);
  });
});

describe('regenerate', () => {
  it('applies ALL the facts in one pass', () => {
    const t = `${OPENER('a')}\n1\n${CLOSER}\n${OPENER('b')}\n2\n${CLOSER}`;
    const out = regenerate(t, [{ name: 'a', content: 'X' }, { name: 'b', content: 'Y' }]);
    expect(extract(out, 'a').content).toBe('X');
    expect(extract(out, 'b').content).toBe('Y');
  });

  it('ROUND-TRIP: regenerating makes `verify` green (the two halves agree)', () => {
    // The property that matters: the --write mode really REPAIRS what the check
    // mode refuses. Without it, we could have a gate impossible to satisfy.
    const f = [{ name: 'x', content: 'expected' }];
    expect(verify(regenerate(doc('fakeOnes'), f), f).ok).toBe(true);
  });
});

describe('wordList', () => {
  it('formats with middots, ORDER PRESERVED (the code order is a fact)', () => {
    expect(wordList(['b', 'a'])).toBe('`b` · `a`');
  });
  it('non-array input = empty string, never a throw', () => {
    expect(wordList(null)).toBe('');
  });
});
