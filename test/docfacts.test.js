// ═══════════════════════════════════════════════════════════════════════
// docfacts.test.js — CONTRACT of the core, on SYNTHETIC data
// ═══════════════════════════════════════════════════════════════════════
// ⚠️ DISTINCT from `language-doc-gate.test.js`, which applies the same core to
//    the REAL code. Mixing the two would make the proof of the REASONING depend
//    on the state of the repo on the day: the contract would go red at every
//    added keyword.
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { OUVRE, FERME, extract, rewrite, verify, regenerate, wordList } from '../src/docfacts.js';

const doc = (corps) => `# Title\n\nprose\n\n${OUVRE('x')}\n${corps}\n${FERME}\n\nend\n`;

describe('extract', () => {
  it('returns the TRIMMED content of the block', () => {
    expect(extract(doc('  valeur  '), 'x')).toEqual({ trouve: true, contenu: 'valeur' });
  });

  it('block missing = trouve:false (never a silent empty string)', () => {
    // ⚠️ The distinction matters: "empty block" is a LEGITIMATE state (a fact
    //    with nothing to say), "missing block" is an AUTHOR FAULT. Conflating
    //    them would make the oversight indistinguishable from the normal case.
    expect(extract(doc('v'), 'autre').trouve).toBe(false);
  });

  it('OPENING marker without a CLOSING one = missing, never "up to the end"', () => {
    // Without this guard, a forgotten `<!-- /AUTO -->` would swallow the whole
    // rest of the doc into the block — and the comparison would redden for an
    // unreadable reason.
    expect(extract(`${OUVRE('x')}\nv\n`, 'x').trouve).toBe(false);
  });

  it('a HOMONYMOUS block further down does not disturb: we bound to the FIRST pair', () => {
    const t = `${OUVRE('x')}\nun\n${FERME}\n${OUVRE('x')}\ndeux\n${FERME}`;
    expect(extract(t, 'x').contenu).toBe('un');
  });

  it('absurd inputs are total (null/undefined/number) — the core NEVER throws', () => {
    // A throw here would bubble up into a fail-open hook and kill the injection.
    expect(extract(null, 'x').trouve).toBe(false);
    expect(extract(undefined, 'x').trouve).toBe(false);
    expect(extract(42, 'x').trouve).toBe(false);
  });

  it('a NAME with a broken `toString` does not make the core throw', () => {
    // 🔴 FOUND BY PROPERTY-BASED TESTING, never by hand: `${nom}` calls
    //    `toString()`, and `{ toString: false }` has none ⇒ TypeError INSIDE the
    //    core ⇒ dead injection gate. A deterministic case is MANDATORY here: the
    //    property tests are excluded from the Stryker runner, so without it the
    //    mutant would survive and the score would lie.
    const casse = { toString: false };
    expect(() => extract('texte', casse)).not.toThrow();
    expect(() => rewrite('texte', casse, 'v')).not.toThrow();
    expect(() => verify('texte', [{ nom: casse, contenu: 'v' }])).not.toThrow();
  });
});

describe('normalisation (txt/asListe) — seen through the public API', () => {
  // ⚠️ These cases KILL mutants that SURVIVED the 1st CI run (81.19 %). They are
  //    not decorative: without them, `docfacts.js` can be broken in silence.
  it('block not found ⇒ contenu === \'\' (BOTH branches, not just `trouve`)', () => {
    expect(extract(doc('v'), 'absent').contenu).toBe('');          // no OUVRE
    expect(extract(`${OUVRE('x')}\nv\n`, 'x').contenu).toBe('');   // no FERME
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
    const f = [{ nom: 'x', contenu: 42 }];
    expect(verify(regenerate(doc('vieux'), f), f).ok).toBe(true);
  });

  it('non-array facts ⇒ EMPTY list everywhere (regenerate invents no fact)', () => {
    const t = doc('v');
    expect(regenerate(t, 'not an array')).toBe(t);
    expect(regenerate(t, 42)).toBe(t);
  });
});

describe('rewrite', () => {
  it('replaces the content and NOTHING else', () => {
    const out = rewrite(doc('ancien'), 'x', 'neuf');
    expect(extract(out, 'x').contenu).toBe('neuf');
    expect(out).toContain('# Title');
    expect(out).toContain('end');
  });

  it('block missing ⇒ text UNCHANGED (we never invent where to insert a fact)', () => {
    const t = doc('v');
    expect(rewrite(t, 'inconnu', 'neuf')).toBe(t);
  });

  it('marker OPENED but never CLOSED ⇒ text UNCHANGED', () => {
    // Without this case, removing the `fin === -1` guard let `slice` produce a
    // truncated document — silently, since nothing observed it.
    const t = `debut\n${OUVRE('x')}\nv\nend with no closing marker`;
    expect(rewrite(t, 'x', 'neuf')).toBe(t);
  });

  it('SURROUNDS the content with exactly ONE newline on each side', () => {
    // Both `'\\n'` of the concatenation used to survive: no test looked at the
    // SHAPE of the written file, yet that is what must stay readable by a
    // human — and stable, otherwise `--write` would produce a diff every run.
    expect(rewrite(`${OUVRE('x')}${FERME}`, 'x', 'V')).toBe(`${OUVRE('x')}\nV\n${FERME}`);
    // ⚠️ And the content is TRIMMED on write: a derived fact can arrive with
    //    edge whitespace (line concatenation), which would otherwise be written
    //    into the file. `verify` would not see it — it trims on READ — so
    //    nothing would catch the document's gradual degradation.
    expect(rewrite(`${OUVRE('x')}${FERME}`, 'x', '\n  V  \n')).toBe(`${OUVRE('x')}\nV\n${FERME}`);
  });

  it('IDEMPOTENT: regenerating twice gives the same bytes', () => {
    const un = rewrite(doc('a'), 'x', 'b');
    expect(rewrite(un, 'x', 'b')).toBe(un);
  });
});

describe('verify', () => {
  it('compliant ⇒ ok, zero discrepancy', () => {
    expect(verify(doc('v'), [{ nom: 'x', contenu: 'v' }])).toEqual({ ok: true, discrepancies: [] });
  });

  it('stale ⇒ a discrepancy NAMING both values (doc AND code)', () => {
    const r = verify(doc('vieux'), [{ nom: 'x', contenu: 'neuf' }]);
    expect(r.ok).toBe(false);
    expect(r.discrepancies[0]).toContain('vieux');
    expect(r.discrepancies[0]).toContain('neuf');
    // The message must say WHO is authoritative, otherwise we "fix" the code.
    expect(r.discrepancies[0]).toMatch(/CODE is authoritative/i);
  });

  it('block missing ⇒ an ACTIONABLE discrepancy giving the markers to paste', () => {
    const r = verify(doc('v'), [{ nom: 'manquant', contenu: 'v' }]);
    expect(r.ok).toBe(false);
    expect(r.discrepancies[0]).toContain(OUVRE('manquant'));
  });

  it('🛑 ANTI-DORMANCY: zero facts = FAILURE, never a green', () => {
    // Without this aspect, a broken deriver (or a list emptied by mistake) would
    // make the gate GREEN by analysing NOTHING — the most dangerous form of
    // false green, already paid for 3 times in this repo.
    for (const vide of [[], null, undefined]) {
      const r = verify(doc('v'), vide);
      expect(r.ok, `facts=${JSON.stringify(vide)} should FAIL`).toBe(false);
      expect(r.discrepancies[0]).toMatch(/ANTI-DORMANCY/);
    }
  });

  it('tolerates edge whitespace, NOT the content (a \\r\\n must not redden)', () => {
    expect(verify(doc('\n  v  \n'), [{ nom: 'x', contenu: 'v\n' }]).ok).toBe(true);
  });

  it('reports ALL the discrepancies, not just the first', () => {
    const t = `${OUVRE('a')}\n1\n${FERME}\n${OUVRE('b')}\n2\n${FERME}`;
    const r = verify(t, [{ nom: 'a', contenu: 'X' }, { nom: 'b', contenu: 'Y' }]);
    expect(r.discrepancies).toHaveLength(2);
  });
});

describe('regenerate', () => {
  it('applies ALL the facts in one pass', () => {
    const t = `${OUVRE('a')}\n1\n${FERME}\n${OUVRE('b')}\n2\n${FERME}`;
    const out = regenerate(t, [{ nom: 'a', contenu: 'X' }, { nom: 'b', contenu: 'Y' }]);
    expect(extract(out, 'a').contenu).toBe('X');
    expect(extract(out, 'b').contenu).toBe('Y');
  });

  it('ROUND-TRIP: regenerating makes `verify` green (the two halves agree)', () => {
    // The property that matters: the --write mode really REPAIRS what the check
    // mode refuses. Without it, we could have a gate impossible to satisfy.
    const f = [{ nom: 'x', contenu: 'attendu' }];
    expect(verify(regenerate(doc('faux'), f), f).ok).toBe(true);
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
