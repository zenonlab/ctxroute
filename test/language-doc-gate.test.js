// ═══════════════════════════════════════════════════════════════════════
// language-doc-gate.test.js — THE GATE: the language doc ⟷ the REAL CODE
// ═══════════════════════════════════════════════════════════════════════
// ⚠️ Applies `docfacts` to the LIVE repository. The reasoning's contract lives
//    in `docfacts.test.js` on synthetic data — mixing them would make the
//    core's proof turn red on every keyword added to the engine.
// 🔴 Born from the 13-14/08/2026 defect: the maintainer's global instructions
//    said "`exclude` = the PATH", the code said "the current context
//    (path/COMMAND)". The missing word led an agent to conclude that an
//    existing capability was impossible.
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { verify, regenerate, extract } from '../src/docfacts.js';
import { facts, DOC } from '../tools/language-doc.js';
import { KNOWN, MODES, DRIFT_UNITS, RULE_KEYS, TRIGGERS } from '../src/frontmatter.js';

const read = () => readFileSync(DOC, 'utf8');

describe('gate: the language doc cannot contradict the code', () => {
  it('① the facts are DERIVED and non-empty (deriver anti-dormancy)', () => {
    // Without this check, a `facts()` returning [] would make check ② pass
    // green while analyzing NOTHING. So we require the deriver to SEE
    // something, and the engine constants themselves to be populated.
    const f = facts();
    expect(f.length, 'no derived fact').toBeGreaterThanOrEqual(3);
    expect(KNOWN.length, 'KNOWN empty: the engine or the import is broken').toBeGreaterThan(5);
    expect(MODES.length).toBeGreaterThan(1);
    for (const x of f) expect(x.content.trim().length, `fact "${x.name}" EMPTY`).toBeGreaterThan(0);
  });

  it('② no AUTO block of the doc is stale', () => {
    const { ok, discrepancies } = verify(read(), facts());
    expect(ok, `\n${discrepancies.join('\n')}\n\nFix with: node tools/language-doc.js --write`).toBe(true);
  });

  it('③ COMPLETENESS: every word of the REAL vocabulary is written in the doc', () => {
    // ⚠️ Check ② compares a block to itself: a block EMPTY on both sides would
    //    be "conformant". This one requires the vocabulary to be actually
    //    READABLE by the agent — that is what closes the AMPUTATION (the
    //    founding defect: a word lost in a copy, breaking nothing).
    const text = read();
    const missingOnes = [...KNOWN, ...RULE_KEYS, ...TRIGGERS, ...MODES, ...DRIFT_UNITS]
      .filter((word) => !text.includes(`\`${word}\``));
    expect(missingOnes, `engine words ABSENT from the doc: ${missingOnes.join(', ')}`).toEqual([]);
  });

  it('④ NEGATIVE-CHECK — the gate really bites (IN-MEMORY sabotage)', () => {
    // 🛑 NEVER on the real file: an on-disk sabotage brought down 38 tests of
    //    other suites on 03/08/2026. We sabotage the IN-MEMORY copy.
    const sabotaged = read().replace(String(MODES[0]), 'MODE_THAT_DOES_NOT_EXIST');
    expect(sabotaged, 'the sabotage changed nothing: this check would prove nothing').not.toBe(read());
    const { ok, discrepancies } = verify(sabotaged, facts());
    expect(ok).toBe(false);
    expect(discrepancies.join(' ')).toMatch(/STALE/);
  });

  it('⑤ --write REPAIRS what the check refuses (never an unsatisfiable gate)', () => {
    const brokenOne = read().replace(/<!-- AUTO:bounds -->[\s\S]*?<!-- \/AUTO -->/, '<!-- AUTO:bounds -->\nwrong\n<!-- /AUTO -->');
    expect(verify(brokenOne, facts()).ok).toBe(false);
    expect(verify(regenerate(brokenOne, facts()), facts()).ok).toBe(true);
  });

  it('⑥ the PROSE restates no generated fact (else the copy re-drifts)', () => {
    // The founding defect was born from a COPY. A fact written twice — once
    // generated, once by hand — recreates exactly the problem: the manual
    // copy drifts and nothing sees it. Here: the mode list must appear ONLY
    // inside its block.
    const text = read();
    const dansBloc = extract(text, 'cadence').content;
    const horsBloc = text.replace(dansBloc, '');
    const listeModes = MODES.map((m) => `\`${m}\``).join(' · ');
    expect(horsBloc.includes(listeModes), 'the mode list is COPIED outside the AUTO block').toBe(false);
  });
});
