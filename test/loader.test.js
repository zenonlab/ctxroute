// ═══════════════════════════════════════════════════════════════════════
// loader.js — DETERMINISTIC tests (Stryker target)
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import { rulesFromCorpus, rulesOfDecl } from '../src/loader.js';

const md = (fm, body = 'body') => `---\n${fm}\n---\n${body}`;

// ⚠️ EVERY rule carries `keys`, EVEN undefined — and the expectations say so out loud.
// 🛑 A `if (data.keys !== undefined)` guard here would DECIDE NOTHING (`keyDecision` is
//    total: absent, string or null all mean "no narrowing"), so Stryker's "always assign"
//    mutant would survive forever. We keep the field always present and pay for it in the
//    expectations — an equivalent mutant is eliminated by CONSTRUCTION, never tested.
// 🔴 And the field is here at all because it was MISSING until 19/08/2026: `rulesOfDecl` is
//    the only road from a written frontmatter to a decision, so `keys` was INERT in every
//    real doc of the corpus while green in every test built on literal rules.
// ── rulesOfDecl: the 2 declaration formats ──
test('rulesOfDecl: string match + doc-level scope/exclude', () => {
  assert.deepStrictEqual(rulesOfDecl({ match: 'a.js', scope: ['s'], exclude: ['e'] }, 'docs/x.md'), [
    { pattern: 'a.js', doc: 'docs/x.md', keys: undefined, scope: ['s'], exclude: ['e'] },
  ]);
});
test('rulesOfDecl: list match → one rule per pattern, SHARED scope', () => {
  const r = rulesOfDecl({ match: ['a.js', 'b.js'], scope: ['s'] }, 'd.md');
  assert.strictEqual(r.length, 2);
  assert.deepStrictEqual(r[1], { pattern: 'b.js', doc: 'd.md', keys: undefined, scope: ['s'] });
});
test('rulesOfDecl: per-entry rules → INDIVIDUAL scopes preserved', () => {
  const r = rulesOfDecl({ rules: [{ pattern: 'a.js', scope: ['s1'] }, { pattern: 'b.js' }] }, 'd.md');
  assert.deepStrictEqual(r, [
    { pattern: 'a.js', doc: 'd.md', keys: undefined, scope: ['s1'] },
    { pattern: 'b.js', doc: 'd.md', keys: undefined },
  ]);
});
test('rulesOfDecl: empty or non-list scope/exclude are NEVER posed', () => {
  assert.deepStrictEqual(rulesOfDecl({ match: 'a.js', scope: [], exclude: 'oops' }, 'd.md'), [
    { pattern: 'a.js', doc: 'd.md', keys: undefined },
  ]);
  assert.deepStrictEqual(rulesOfDecl({ rules: [{ pattern: 'a.js', scope: [], exclude: 'x' }] }, 'd.md'), [
    { pattern: 'a.js', doc: 'd.md', keys: undefined },
  ]);
});
test('rulesOfDecl: neither match nor rules → no rule (a `mcp:`-only doc)', () => {
  assert.deepStrictEqual(rulesOfDecl({ mcp: ['stripe'] }, 'd.md'), []);
});

// ── rulesFromCorpus: order + fail-open ──
test('ORDER — ascending rank, a whole doc BEFORE the next one (rule-major)', () => {
  const flat = rulesFromCorpus([
    { doc: 'b.md', text: md('match: [x, y]\nrank: 5') },
    { doc: 'a.md', text: md('match: z\nrank: 2') },
  ]);
  assert.deepStrictEqual(flat.map((r) => r.pattern), ['z', 'x', 'y']);
});
test('ORDER — docs WITHOUT a rank: AFTER the ranked ones, alphabetical (deterministic)', () => {
  const flat = rulesFromCorpus([
    { doc: 'zeta.md', text: md('match: n1') },
    { doc: 'alpha.md', text: md('match: n2') },
    { doc: 'ranked.md', text: md('match: r\nrank: 900') },
  ]);
  assert.deepStrictEqual(flat.map((r) => r.doc), ['ranked.md', 'alpha.md', 'zeta.md']);
});
test('ORDER — EQUAL rank: alphabetical (stable cross-filesystem)', () => {
  const flat = rulesFromCorpus([
    { doc: 'b.md', text: md('match: x\nrank: 1') },
    { doc: 'a.md', text: md('match: y\nrank: 1') },
  ]);
  assert.deepStrictEqual(flat.map((r) => r.doc), ['a.md', 'b.md']);
});
test('FAIL-OPEN — without frontmatter, invalid, inject:never, `mcp:`-only → ignored, the others live', () => {
  const flat = rulesFromCorpus([
    { doc: 'bare.md', text: '# no frontmatter' },
    { doc: 'invalid.md', text: md('mach: typo') },
    { doc: 'ref.md', text: md('inject: never') },
    { doc: 'mcp.md', text: md('mcp: [stripe]') },
    { doc: 'ok.md', text: md('match: a.js') },
  ]);
  assert.deepStrictEqual(flat, [{ pattern: 'a.js', doc: 'ok.md', keys: undefined }]);
});
test('TOTALITY — a non-list corpus or shaky entries → [], never a throw', () => {
  assert.deepStrictEqual(rulesFromCorpus(null), []);
  assert.deepStrictEqual(rulesFromCorpus([null, {}, { doc: 'x.md' }, { text: '---' }]), []);
});
test('INTERLEAVING — PER-ENTRY rank: the late rule is evaluated at ITS JSON index', () => {
  // ⚠️ The real web-realtime/web-front case (divergence caught on 16/07): docA has
  //    rules at indexes 0 and 10, docB at 5. A per-doc sort would give a1,a2,b — WRONG.
  const flat = rulesFromCorpus([
    { doc: 'a.md', text: md('rules: [{"pattern":"a1","rank":0},{"pattern":"a2","rank":10}]\nrank: 0') },
    { doc: 'b.md', text: md('match: b1\nrank: 5') },
  ]);
  assert.deepStrictEqual(flat, [
    { pattern: 'a1', doc: 'a.md', keys: undefined },
    { pattern: 'b1', doc: 'b.md', keys: undefined },
    { pattern: 'a2', doc: 'a.md', keys: undefined },
  ]);
});
test('INTERLEAVING — the entry rank serves the SORT then is STRIPPED from the flat rule', () => {
  const flat = rulesFromCorpus([{ doc: 'a.md', text: md('rules: [{"pattern":"p","rank":3}]\nrank: 3') }]);
  assert.deepStrictEqual(flat, [{ pattern: 'p', doc: 'a.md', keys: undefined }]);
});
test('rulesOfDecl — the entry rank is PRESERVED (rules), never invented (match)', () => {
  assert.deepStrictEqual(rulesOfDecl({ rules: [{ pattern: 'p', rank: 7 }] }, 'd.md'), [
    { pattern: 'p', doc: 'd.md', keys: undefined, rank: 7 },
  ]);
  assert.ok(!('rank' in rulesOfDecl({ match: 'p' }, 'd.md')[0]));
});
test('GUARD — a non-string doc or an absent text → the entry is ignored even with a valid frontmatter', () => {
  assert.deepStrictEqual(rulesFromCorpus([{ doc: 42, text: md('match: a.js') }]), []);
  assert.deepStrictEqual(rulesFromCorpus([{ doc: 'x.md' }]), []);
});
test('GUARD — an INVALID doc (unknown key) → ignored EVEN if its match is valid', () => {
  // ⚠️ Without this case, mutating the validate() guard let the docs with a typo live.
  assert.deepStrictEqual(rulesFromCorpus([{ doc: 'x.md', text: md('match: a.js\nmach: typo') }]), []);
});
test('LOCAL ORDER — two rules entries WITHOUT their own rank: declared order preserved', () => {
  const flat = rulesFromCorpus([
    { doc: 'a.md', text: md('rules: [{"pattern":"p1"},{"pattern":"p2"},{"pattern":"p3"}]\nrank: 1') },
  ]);
  assert.deepStrictEqual(flat.map((r) => r.pattern), ['p1', 'p2', 'p3']);
});

test('SORTING AT SCALE — 25 docs, equal rank, reverse order → strict alpha (real TimSort)', () => {
  // ⚠️ V8 uses insertion sort BELOW ~23 elements: the mutants of the tie-break
  //    (`a.doc > b.doc`, `? 1 : 0`) are INVISIBLE there (only `< 0` decides the placement).
  //    25 elements = a real TimSort merge → the full comparator becomes observable.
  const docs = [];
  for (let k = 24; k >= 0; k--) {
    const name = 'doc' + String(k).padStart(2, '0') + '.md';
    docs.push({ doc: name, text: md('match: p' + k + '\nrank: 1') });
  }
  const flat = rulesFromCorpus(docs);
  const expected = [...docs.map((d) => d.doc)].sort();
  assert.deepStrictEqual(flat.map((r) => r.doc), expected);
});
test('SORTING AT SCALE — 25 entries of the SAME doc: declared local order preserved', () => {
  const pats = Array.from({ length: 25 }, (_, k) => ({ pattern: 'p' + String(k).padStart(2, '0') }));
  const flat = rulesFromCorpus([{ doc: 'a.md', text: md('rules: ' + JSON.stringify(pats) + '\nrank: 1') }]);
  assert.deepStrictEqual(flat.map((r) => r.pattern), pats.map((p) => p.pattern));
});

test('RULES — a migrated `rules:` doc read back → rules identical to the declaration', () => {
  const flat = rulesFromCorpus([
    { doc: 'p.md', text: md('rules: [{"pattern":"lock.js","scope":["ctxroute"],"exclude":["package-lock.json"]},{"pattern":"stdin-json.js"}]\nmode: dumb\nrank: 350') },
  ]);
  assert.deepStrictEqual(flat, [
    { pattern: 'lock.js', doc: 'p.md', keys: undefined, scope: ['ctxroute'], exclude: ['package-lock.json'] },
    { pattern: 'stdin-json.js', doc: 'p.md', keys: undefined },
  ]);
});
