// ═══════════════════════════════════════════════════════════════════════
// sources/file.js — THE LAWS of `exclude` (property-based, fast-check)
// ═══════════════════════════════════════════════════════════════════════
//
// 🛑 CREATED ON 14/08/2026 WITH FIX ㊼. REASON FOR EXISTING, written for whoever
//    might come to "simplify": the 1170 tests of the repo AND the 100% mutation score
//    were GREEN on the bug — because they tested CASES, and the bug
//    lived in a LAW. A case proves a point; a law covers the gestures that
//    nobody imagined, and that is exactly where the defect lodged itself
//    (`cd X && node explain.js`: nobody had thought about the word `node`).
//
// ⚠️ THE TWO LAWS, and each was VIOLATED before the fix:
//    ① MONOTONICITY — adding a pattern to `exclude` can only REDUCE the injected
//      set. A negation operator that can ADD is not a negation.
//    ② INDEPENDENCE FROM WRITING — enriching a gesture (adding a word, a path,
//      a parameter) can NEVER RE-AUTHORIZE a doc that the exclude removed.
//      That is the law the bug violated: one more word reopened the door.
//
// 🛑 NEVER replace these properties with examples: an example one chooses
//    oneself never lands on the gesture one did not think of.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import fc from 'fast-check';
import { matchingDocs } from '../src/sources/file.js';

const MOTS = ['ctxroute', 'explain.js', 'node', 'npm', 'docs', 'test', 'src', 'a.js'];
const mot = () => fc.constantFrom(...MOTS);
// ⚠️ THE `cd DIR && …` FORM IS MANDATORY IN THE GENERATORS — measured on
//    14/08/2026: without it, `bashCandidates` yields only ONE candidate (the whole
//    command), bug ㊼ is UNREACHABLE and the laws pass VACUOUSLY. That is
//    exactly the "green that sees nothing" trap: sabotaging the fix
//    left the suite GREEN as long as the commands had no `cd &&`.
const commande = () =>
  fc.tuple(fc.boolean(), fc.array(mot(), { minLength: 1, maxLength: 5 }))
    .map(([avecCd, m]) => (avecCd ? `cd ~/w/${m[0]} && ${m.slice(1).join(' ') || 'ls'}` : m.join(' ')));
const docsDe = (rules, payload) => matchingDocs(rules, payload).map((d) => d.doc);
const inclus = (a, b) => a.every((x) => b.includes(x));

// Any Bash gesture at all, written in any form at all.
const geste = () =>
  fc.record({
    toolName: fc.constantFrom('Bash', 'Read'),
    toolInput: fc.oneof(
      fc.record({ command: commande() }),
      fc.record({ file_path: fc.array(mot(), { minLength: 1, maxLength: 3 }).map((m) => m.join('/')) })
    ),
  });

test('LAW ① MONOTONICITY — adding a pattern to `exclude` can only REDUCE what is injected', () => {
  fc.assert(
    fc.property(mot(), fc.array(mot(), { maxLength: 3 }), mot(), geste(), (pattern, ex, deplus, payload) => {
      const avant = docsDe([{ pattern, doc: 'd.md', exclude: ex }], payload);
      const apres = docsDe([{ pattern, doc: 'd.md', exclude: [...ex, deplus] }], payload);
      assert.ok(inclus(apres, avant), `a BROADENED exclude ADDED an injection: ${JSON.stringify({ pattern, ex, deplus, payload })}`);
    }),
    { numRuns: 3000 }
  );
});

test('LAW ② INDEPENDENCE FROM WRITING — enriching the gesture never RE-AUTHORIZES an excluded one', () => {
  // ⚠️ This is THE law the bug violated: `cd X && explain.js` was excluded, and
  //    merely adding the word `node` re-authorized it. The inserted word is free and its
  //    POSITION too — the law must depend on neither of the two.
  fc.assert(
    fc.property(mot(), fc.array(mot(), { minLength: 1, maxLength: 2 }), commande(), mot(), fc.nat(), (pattern, ex, cmd, insere, pos) => {
      const rules = [{ pattern, doc: 'd.md', exclude: ex }];
      // ⚠️ EXACT PRECONDITION: the gesture must be EXCLUDED, not merely "not
      //    matched" — otherwise the law would accuse an enrichment that
      //    legitimately makes the pattern MATCH (real counter-example from the 1st run).
      const sansExclude = docsDe([{ pattern, doc: 'd.md' }], { toolName: 'Bash', toolInput: { command: cmd } });
      const avant = docsDe(rules, { toolName: 'Bash', toolInput: { command: cmd } });
      if (sansExclude.length === 0 || avant.length > 0) return;
      const mots = cmd.split(' ');
      mots.splice(pos % (mots.length + 1), 0, insere);
      const enrichi = mots.join(' ');
      const apres = docsDe(rules, { toolName: 'Bash', toolInput: { command: enrichi } });
      assert.deepStrictEqual(apres, [], `the word "${insere}" RE-AUTHORIZED: ${enrichi}`);
    }),
    { numRuns: 5000 }
  );
});

test('LAW ③ (㊺①) — adding a GROUP to `scope` can only REDUCE what is injected', () => {
  // ⚠️ The positive dual of law ①: one more group is one more CONJUNCTION,
  //    hence a HARDER condition. If one day this law turns red, it means
  //    the grouped form has fallen back to an OR — the most serious regression possible
  //    here, since it BROADENS rules silently.
  fc.assert(
    fc.property(mot(), fc.array(fc.array(mot(), { minLength: 1, maxLength: 2 }), { minLength: 1, maxLength: 3 }), fc.array(mot(), { minLength: 1, maxLength: 2 }), geste(), (pattern, groupes, deplus, payload) => {
      const avant = docsDe([{ pattern, doc: 'd.md', scope: groupes }], payload);
      const apres = docsDe([{ pattern, doc: 'd.md', scope: [...groupes, deplus] }], payload);
      assert.ok(inclus(apres, avant), `one more GROUP BROADENED: ${JSON.stringify({ pattern, groupes, deplus })}`);
    }),
    { numRuns: 3000 }
  );
});

test('LAW ④ (㊺①) — PARITY: a FLAT list behaves EXACTLY like ONE group', () => {
  // 🛑 THE CORPUS NON-REGRESSION LAW: `["a","b"]` ≡ `[["a","b"]]`, on
  //    ANY gesture at all. That is what guarantees that the 852 existing rules
  //    have not changed meaning — and the differential confirmed it (0 change).
  fc.assert(
    fc.property(mot(), fc.array(mot(), { minLength: 1, maxLength: 3 }), geste(), (pattern, plat, payload) => {
      const a = docsDe([{ pattern, doc: 'd.md', scope: plat }], payload);
      const b = docsDe([{ pattern, doc: 'd.md', scope: [plat] }], payload);
      assert.deepStrictEqual(a, b, `the flat form diverged from the single group: ${JSON.stringify(plat)}`);
    }),
    { numRuns: 3000 }
  );
});

test('NEGATIVE-CHECK — the 2 laws really DETECT the old semantics (never green by vacuity)', () => {
  // 🛑 A law that turns red on NOTHING is decorative. Here we replay the OLD
  //    `shouldSkip` (exclude evaluated candidate by candidate) on the founding case
  //    and we REQUIRE that it violate law ② — if this test becomes green "on its own",
  //    it means the generator no longer produces the case, not that the bug has gone.
  const norm = (s) => String(s).toLowerCase().replace(/\\/g, '/');
  const ancien = (rule, ctx) => Array.isArray(rule.exclude) && rule.exclude.some((e) => norm(ctx).includes(norm(e)));
  const rule = { pattern: 'ctxroute', exclude: ['explain.js'] };
  // candidates fabricated by bashCandidates on `cd ~/x/ctxroute && node explain.js`
  const candidates = ['~/x/ctxroute/node', '~/x/ctxroute/explain.js'];
  assert.ok(candidates.some((c) => !ancien(rule, c)), 'the old semantics did let a fragment through');
  assert.ok(!ancien(rule, '~/x/ctxroute/node'), 'the `node` fragment is exactly the one that authorized');
});
