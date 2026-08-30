// ═══════════════════════════════════════════════════════════════════════
// THE DIAGNOSTIC MUST SIMULATE *AND SHOW* EVERY FIELD PRODUCTION DECIDES ON.
// 🛑 Born 2026-08-27: `cwd` was built by both, DISPLAYED by neither. The tool returned a true
//    verdict about ANOTHER gesture and nothing said so — a session lost, a false cause written
//    into the backlog. A field production judges but the diagnostic hides IS that defect, again.
// ⚠️ DERIVED from both sources, never a copied list: a 4th payload field added to `pretool-core`
//    turns this RED until `explain.js` builds it AND prints it.
// ═══════════════════════════════════════════════════════════════════════
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(HERE, '..', p), 'utf8');

// The payload literal, read where each side builds it.
function payloadFields(src) {
  const m = src.match(/const payload = \{([^}]*)\}/);
  assert.ok(m, 'no `const payload = { … }` found — this judge cannot see what it judges');
  const fields = m[1].split(',').map((s) => s.split(':')[0].trim()).filter(Boolean);
  assert.ok(fields.length >= 3, 'anti-vacuity: fewer than 3 fields parsed');
  return fields.sort();
}

test('PARITY: diagnostic and production build the SAME payload fields', () => {
  const prod = payloadFields(read('src/pretool-core.js'));
  const diag = payloadFields(read('tools/explain.js'));
  assert.deepEqual(diag, prod, 'explain.js must build every field pretool-core decides on');
});

test('VISIBILITY: every payload field is PRINTED by the diagnostic', () => {
  const src = read('tools/explain.js');
  // The WHOLE render function. No clever slicing: a judge that narrows its own window can miss
  // the very thing it exists to catch.
  const start = src.indexOf('function render(');
  assert.ok(start > 0, 'anti-vacuity: render() not found');
  const shown = src.slice(start, src.indexOf('\nfunction ', start + 1));
  assert.ok(shown.includes('PAYLOAD'), 'anti-vacuity: the PAYLOAD block is not in the window');
  for (const f of payloadFields(src)) {
    assert.ok(shown.includes('a.' + f),
      'payload field `' + f + '` is decided on but NEVER displayed — the 2026-08-27 defect');
  }
});
