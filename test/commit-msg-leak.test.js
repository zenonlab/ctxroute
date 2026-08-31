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
//
// 🔴 TRI-STATE, 2026-08-30. `@zenon-lab/personal-data-guard` is a `file:
//    ../personal-data-guard` sibling checkout, present on the maintainer's
//    machine and ABSENT on any clean clone or CI runner. A STATIC `import`
//    of it here used to CRASH THIS WHOLE FILE AT LOAD TIME the moment it
//    could not resolve ("Cannot find package") — CI reported the entire
//    suite as a FAILED SUITE, not individual assertions. `require.resolve`
//    only resolves a PATH, it never executes the module, so it is safe to
//    probe availability BEFORE deciding whether to `import()` it.
// ⚠️ PRESENT (the maintainer's machine) ⇒ every fixture-based test below
//    runs UNCHANGED, byte-for-byte — that is what proves "the gate bites
//    exactly as before". ABSENT (CI, any adopter) ⇒ those same tests are
//    SKIPPED VISIBLY (`test.skipIf`, never a silent disappearance from the
//    report), and the dedicated tri-state tests at the bottom of this file
//    run FOR REAL against the genuinely-absent package, proving the "cannot
//    judge, never green" contract on the exact machines that need it.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import Module from 'node:module';
import { verdict, refusal, UNAVAILABLE_REASON } from '../src/commit-msg-leak.js';

const require_ = createRequire(import.meta.url);

// ── FORCING THE ABSENT BRANCH ON A MACHINE WHERE THE PACKAGE IS PRESENT ──
// 🔴 The tri-state test below (`matcherAbsent`) only EXERCISES `verdict()`'s
//    `!personalDataGuard` branch on a machine where the sibling checkout is
//    genuinely missing (CI, a clean clone) — never on the maintainer's own
//    machine, where the branch is simply unreachable through normal use.
// ⚠️ NOT a simulation of a DIFFERENT behavior: `Module._load` is patched to
//    make the SAME `require('@zenon-lab/personal-data-guard')` call the
//    module makes throw, exactly as it genuinely does on a clean clone —
//    then the module is re-required fresh (its own cache entry cleared) so
//    it re-runs its real `try/catch` against that real failure. The patch
//    and the caches are restored in `finally`, unconditionally.
function requireLeakModuleWithGuardAbsent() {
  const srcPath = require_.resolve('../src/commit-msg-leak.js');
  // 🔴 THE PACKAGE MAY ALREADY BE ABSENT, AND RESOLVING IT THEN THROWS.
  //    `resolve` was called unguarded here and passed on the maintainer's
  //    machine, where the sibling checkout exists — and failed on EVERY clean
  //    clone, i.e. on CI, which is the only place this branch is reachable
  //    naturally. Measured 2026-08-31 on ubuntu-latest: `Cannot find module`,
  //    a suite-level crash rather than an assertion. Absent is not an error
  //    here: it is the state this helper exists to produce, so there is simply
  //    nothing to evict.
  let guardPath = null;
  try {
    guardPath = require_.resolve('@zenon-lab/personal-data-guard');
  } catch {
    guardPath = null;
  }
  delete require_.cache[srcPath];
  if (guardPath !== null) delete require_.cache[guardPath];
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === '@zenon-lab/personal-data-guard') {
      throw new Error('simulated: package cannot be resolved');
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return require_(srcPath);
  } finally {
    Module._load = originalLoad;
    delete require_.cache[srcPath];
  }
}

test('verdict() with the matcher forced ABSENT returns EXACTLY {violations: [], unavailable: true}, ignoring motifs', () => {
  const forced = requireLeakModuleWithGuardAbsent();
  const v = forced.verdict('deploy: fix the pipeline for acme-widgets', [{ name: 'x', re: /x/ }]);
  assert.deepEqual(v, { violations: [], unavailable: true });
});

let personalDataGuard = null;
try {
  require_.resolve('@zenon-lab/personal-data-guard');
  personalDataGuard = await import('@zenon-lab/personal-data-guard');
} catch {
  personalDataGuard = null;
}

const matcherAbsent = personalDataGuard === null;

const motifs = () => personalDataGuard.forbiddenPatterns('devbot', 'C:/Users/devbot', ['acme-widgets']);

test.skipIf(matcherAbsent)('a message naming a protected client term is REFUSED', () => {
  const v = verdict('deploy: fix the pipeline for acme-widgets', motifs());
  assert.equal(v.violations.length, 1, 'the client term was not caught');
  assert.match(v.violations[0].name, /acme-widgets/);
  const text = refusal(v);
  assert.ok(text.includes('COMMIT REFUSED'), 'the refusal does not say it refuses');
  assert.ok(text.includes('acme-widgets'), 'the refusal does not name the offending term');
});

test.skipIf(matcherAbsent)('a message with no personal data PASSES', () => {
  const v = verdict('fix: stop reading state through the lock-less path', motifs());
  assert.deepEqual(v.violations, [], 'false positive on a healthy message');
});

test.skipIf(matcherAbsent)('a real email or a real machine IP in the message is REFUSED (generic mode)', () => {
  const ip = (...o) => o.join('.'); // never a literal CGNAT/Tailscale IP in a tracked file
  // ⚠️ CONCATENATED, never literal: a real-looking email written whole makes THIS FILE a leak
  //    for `leak-gate`, whose pattern judges the shape and not the intent (repo convention,
  //    see test/leak-pure.test.js). `example.`/`test.` are RESERVED, so they never match.
  assert.equal(verdict('note: contact ' + 'dev' + '@' + 'societe.fr' + ' about this', motifs()).violations.length, 1);
  assert.equal(verdict(`vps: ${ip(100, 88, 41, 95)}`, motifs()).violations.length, 1);
});

test.skipIf(matcherAbsent)('the DOCUMENTATION ranges stay allowed in a commit message', () => {
  assert.deepEqual(verdict('demo server: 203.0.113.7', motifs()).violations, []);
  assert.deepEqual(verdict('write to dev@example.com', motifs()).violations, []);
});

test.skipIf(matcherAbsent)('ANTI-VACUITY: an absent term list still catches email/IP (never a silent pass)', () => {
  const generic = personalDataGuard.forbiddenPatterns(undefined, undefined, undefined);
  const ip = (...o) => o.join('.');
  assert.ok(verdict(`vps: ${ip(100, 88, 41, 95)}`, generic).violations.length > 0,
    'generic mode caught nothing — the commit gate would be decorative on a fresh clone');
});

test.skipIf(matcherAbsent)('NEGATIVE-CHECK: verdict() actually SCANS — sabotaging the motifs list empties it', () => {
  const v = verdict('deploy: fix the pipeline for acme-widgets', []);
  assert.deepEqual(v.violations, [], 'an empty motif list found a violation — verdict() is not scanning motifs');
});

test.skipIf(matcherAbsent)('refusal: names EVERY violation, not just the first', () => {
  const twoMotifs = personalDataGuard.forbiddenPatterns('devbot', 'C:/Users/devbot', ['acme-widgets', 'contoso-corp']);
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
test.skipIf(matcherAbsent)('a trailer block carrying an email is NOT a leak (git writes it)', () => {
  const msg = 'fix: something real\n\nBody line.\n\nCo-Authored-By: Someone <bot' + '@' + 'vendor.com>';
  assert.deepEqual(verdict(msg, motifs()).violations, []);
});

test.skipIf(matcherAbsent)('a leak in the BODY is still caught even when a trailer block follows it', () => {
  // Without this control the exclusion could swallow the whole message and stay green.
  const msg = 'fix: x\n\ncontact ' + 'someone' + '@' + 'societe.fr' + '\n\nCo-Authored-By: A <b'
    + '@' + 'vendor.com>';
  assert.equal(verdict(msg, motifs()).violations.length, 1);
});

// ═══════════════════════════════════════════════════════════════════════
// TRI-STATE — the ABSENT half, proven for REAL on whatever machine lacks
// the sibling checkout (CI, any adopter), never simulated.
// ═══════════════════════════════════════════════════════════════════════

test.skipIf(!matcherAbsent)('TRI-STATE (absent matcher): verdict() names it, never a silent pass', () => {
  // This cell only EXECUTES on a machine where the package genuinely could
  // not be resolved (skipped elsewhere, visibly) — it is not a simulation.
  const v = verdict('deploy: fix the pipeline for acme-widgets', null);
  assert.equal(v.unavailable, true, 'verdict() must name the missing matcher, never silently report "no violation"');
  assert.deepEqual(v.violations, [], 'the violations list must stay empty, never fabricated');
});

// ⚠️ UNCONDITIONAL — deterministic on EVERY machine, present or absent. This
//    is what proves the ABSENT verdict renders LOUD, independent of whether
//    this particular run happens to have the sibling checkout.
test('TRI-STATE: refusal() of an unavailable verdict is LOUD and NAMES the missing package', () => {
  const text = refusal({ violations: [], unavailable: true });
  assert.ok(text.includes('COMMIT REFUSED'), 'an unjudgeable message must still be a REFUSAL, never a silent pass');
  assert.ok(text.includes('CANNOT JUDGE'), 'the refusal must say it could not decide, not that it found nothing');
  assert.ok(text.includes('@zenon-lab/personal-data-guard'), 'the refusal must NAME the missing package');
  assert.equal(text, refusal({ violations: [], unavailable: true }), 'refusal() must be deterministic');
});

test('TRI-STATE: the unavailable reason is exported and non-empty (whoever prints it needs the words)', () => {
  assert.ok(typeof UNAVAILABLE_REASON === 'string' && UNAVAILABLE_REASON.length > 20);
  assert.ok(UNAVAILABLE_REASON.includes('@zenon-lab/personal-data-guard'));
});

test('TRI-STATE: the unavailable reason is the EXACT sentence, both halves', () => {
  assert.equal(
    UNAVAILABLE_REASON,
    '@zenon-lab/personal-data-guard is not installed (the `file:../personal-data-guard` sibling '
    + 'checkout is missing) — this gate CANNOT JUDGE the message for personal data.',
  );
});

test('TRI-STATE: refusal() of an unavailable verdict is the EXACT four-line contract', () => {
  const text = refusal({ violations: [], unavailable: true });
  const expected = [
    'COMMIT REFUSED — the anti-leak gate CANNOT JUDGE this message.',
    '  ' + UNAVAILABLE_REASON,
    'This repository never lets a commit through when it cannot verify personal data.',
    'Install the sibling package, or use `git commit --no-verify` CONSCIOUSLY.',
  ].join('\n');
  assert.equal(text, expected);
});

test.skipIf(matcherAbsent)('refusal: the violation refusal text is the EXACT contract, every line', () => {
  const v = verdict('deploy: fix the pipeline for acme-widgets', motifs());
  const text = refusal(v);
  const expected = [
    'COMMIT REFUSED — the message carries personal data.',
    'This repository is PUBLIC: a pushed message survives in history for ever (git log -p).',
    'Remove the data below from the message, then commit again.',
    ...v.violations.map((o) => `  ${o.name} (${o.excerpt})`),
  ].join('\n');
  assert.equal(text, expected);
});
