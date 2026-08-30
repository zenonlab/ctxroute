// ═══════════════════════════════════════════════════════════════════════
// COMMIT-MSG-LEAK — the published HISTORY cannot carry personal data.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 WHY THIS SUITE EXISTS. `test/leak-gate.test.js` seals TRACKED FILES.
//    A commit MESSAGE never went through that scan, and it is just as
//    IRREVERSIBLE once pushed (`git log -p` keeps it for ever).
//
// 🛑 THE RULE IS NOT IN THIS FILE, ON PURPOSE (same reason as
//    `commit-msg-lang.test.js`): it lives in `src/commit-msg-leak.js`, which
//    the hook (`.githooks/commit-msg` → `tools/commit-msg-check.js`) runs too.
//
// ⚠️ NO SECOND LIST OF TERMS HERE. Fixtures build `motifs` with the SAME
//    builder the file gate and the shell use (`leak-pure.forbiddenPatterns`),
//    fed with INVENTED terms only — this repo is public, and a real client
//    name has no business living in a tracked fixture.
//
// ⚠️ Fixtures are THUNKS, never module-level constants (perTest mutation:
//    a constant evaluated at load time is a static mutant no test covers).
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { forbiddenPatterns } from '@zenon-lab/personal-data-guard';
import { verdict, refusal } from '../src/commit-msg-leak.js';

const motifs = () => forbiddenPatterns('devbot', 'C:/Users/devbot', ['acme-widgets']);

test('a message naming a protected client term is REFUSED', () => {
  const v = verdict('deploy: fix the pipeline for acme-widgets', motifs());
  assert.equal(v.violations.length, 1, 'the client term was not caught');
  assert.match(v.violations[0].name, /acme-widgets/);
  const text = refusal(v);
  assert.ok(text.includes('COMMIT REFUSED'), 'the refusal does not say it refuses');
  assert.ok(text.includes('acme-widgets'), 'the refusal does not name the offending term');
});

test('a message with no personal data PASSES', () => {
  const v = verdict('fix: stop reading state through the lock-less path', motifs());
  assert.deepEqual(v.violations, [], 'false positive on a healthy message');
});

test('a real email or a real machine IP in the message is REFUSED (generic mode)', () => {
  const ip = (...o) => o.join('.'); // never a literal CGNAT/Tailscale IP in a tracked file
  // ⚠️ CONCATENATED, never literal: a real-looking email written whole makes THIS FILE a leak
  //    for `leak-gate`, whose pattern judges the shape and not the intent (repo convention,
  //    see test/leak-pure.test.js). `example.`/`test.` are RESERVED, so they never match.
  assert.equal(verdict('note: contact ' + 'dev' + '@' + 'societe.fr' + ' about this', motifs()).violations.length, 1);
  assert.equal(verdict(`vps: ${ip(100, 88, 41, 95)}`, motifs()).violations.length, 1);
});

test('the DOCUMENTATION ranges stay allowed in a commit message', () => {
  assert.deepEqual(verdict('demo server: 203.0.113.7', motifs()).violations, []);
  assert.deepEqual(verdict('write to dev@example.com', motifs()).violations, []);
});

test('ANTI-VACUITY: an absent term list still catches email/IP (never a silent pass)', () => {
  const generic = forbiddenPatterns(undefined, undefined, undefined);
  const ip = (...o) => o.join('.');
  assert.ok(verdict(`vps: ${ip(100, 88, 41, 95)}`, generic).violations.length > 0,
    'generic mode caught nothing — the commit gate would be decorative on a fresh clone');
});

test('NEGATIVE-CHECK: verdict() actually SCANS — sabotaging the motifs list empties it', () => {
  const v = verdict('deploy: fix the pipeline for acme-widgets', []);
  assert.deepEqual(v.violations, [], 'an empty motif list found a violation — verdict() is not scanning motifs');
});

test('refusal: names EVERY violation, not just the first', () => {
  const twoMotifs = forbiddenPatterns('devbot', 'C:/Users/devbot', ['acme-widgets', 'contoso-corp']);
  const v = verdict('deploy: migrate acme-widgets and contoso-corp together', twoMotifs);
  assert.equal(v.violations.length, 2, 'fixture invalid: both terms must be caught');
  const text = refusal(v);
  assert.ok(text.includes('acme-widgets') && text.includes('contoso-corp'),
    'the refusal drops a violation — a refusal one cannot act on gets bypassed');
});

// ── THE TRAILER BLOCK IS EXCLUDED (2026-08-27) ──────────────────────────
// 🛑 FOUNDING CASE. `Co-Authored-By:` carries an email BY DEFINITION, so scanning the whole
//    message refuses the repository's most ordinary commit. Measured: this gate blocked its OWN
//    delivery commit on the day it shipped. NEVER delete — invert the expectation if the rule
//    changes, keep the case.
test('a trailer block carrying an email is NOT a leak (git writes it)', () => {
  const msg = 'fix: something real\n\nBody line.\n\nCo-Authored-By: Someone <bot' + '@' + 'vendor.com>';
  assert.deepEqual(verdict(msg, motifs()).violations, []);
});

test('a leak in the BODY is still caught even when a trailer block follows it', () => {
  // Without this control the exclusion could swallow the whole message and stay green.
  const msg = 'fix: x\n\ncontact ' + 'someone' + '@' + 'societe.fr' + '\n\nCo-Authored-By: A <b'
    + '@' + 'vendor.com>';
  assert.equal(verdict(msg, motifs()).violations.length, 1);
});
