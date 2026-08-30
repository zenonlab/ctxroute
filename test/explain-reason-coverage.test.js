// ═══════════════════════════════════════════════════════════════════════
// EVERY OPERATOR THAT CAN SILENCE A DOC MUST HAVE ITS OWN REASON IN THE DIAGNOSTIC.
// 🛑 Without a dedicated reason, a silence caused by operator X surfaces attributed to whichever
//    one happened to fail next: an answer TRUE and MISLEADING, sending the author to fix an
//    operator doing its job. Paid on `keys` (19/08/2026), and again on 27/08 one level up.
// ⚠️ `explain.md` already says "Missing reason ⇒ add a probe". That is PROSE, and prose guarded
//    nothing: `keys` shipped outside the judges anyway. This is the judge.
// ⚠️ DERIVED from `RULE_KEYS` — a 5th operator lands in the table BY ITSELF and stays RED.
// ═══════════════════════════════════════════════════════════════════════
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULE_KEYS } from '../src/frontmatter.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(HERE, '..', 'tools', 'explain.js'), 'utf8');

// ── ⓪ CLASSIFICATION: every per-rule key is SILENCING (needs a reason) or excluded WITH a written
//    reason. Adding a key without deciding is impossible.
const SILENCING = ['pattern', 'scope', 'exclude', 'keys'];
const NOT_SILENCING = {
  rank: 'ordering only — it changes WHICH doc comes first, never WHETHER one injects',
};

// ⚠️ THE WINDOW IS THE `motif:` STRINGS THEMSELVES, never the whole file. A first version searched
//    the entire source and stayed GREEN when a reason was deleted: the operator name still lived in
//    a COMMENT. A judge satisfied by prose IS the defect it exists to close.
// ⚠️ Backticks are ESCAPED inside those template literals; stripping backslashes is what makes this
//    read the TEXT a human sees rather than its source encoding.
function reasonTexts(src) {
  const found = src.match(/motif: [^\n]*/g) || [];
  assert.ok(found.length >= 5, 'anti-vacuity: fewer than 5 reasons found — this judge sees nothing');
  return found.join(String.fromCharCode(10)).split(String.fromCharCode(92)).join('');
}

test('CLASSIFICATION: every per-rule operator is classified, none forgotten', () => {
  const classified = [...SILENCING, ...Object.keys(NOT_SILENCING)].sort();
  assert.deepEqual(classified, [...RULE_KEYS].sort(),
    'a per-rule key is neither declared silencing nor excluded with a reason — decide, do not skip');
});

test('ANTI-VACUITY: the classification is not empty and every exclusion carries its reason', () => {
  assert.ok(SILENCING.length >= 4, 'anti-vacuity: fewer than 4 silencing operators');
  for (const [k, why] of Object.entries(NOT_SILENCING)) {
    assert.ok(why.length > 20, 'operator `' + k + '` is excluded without a real reason');
  }
});

test('COVERAGE: every silencing operator has its OWN reason in the diagnostic', () => {
  const reasons = reasonTexts(SRC);
  for (const op of SILENCING) {
    // `pattern` is reported under the operator that carries it in a doc: `match`.
    const word = op === 'pattern' ? 'NO PATTERN' : '`' + op + '`';
    assert.ok(reasons.includes(word),
      'operator `' + op + '` can silence a doc but NO reason names it — '
      + 'its silence will be blamed on another operator');
  }
});
