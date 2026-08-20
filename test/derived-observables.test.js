// ═══════════════════════════════════════════════════════════════════════
// derived-observables.test.js — the CONTRACT of the facts we DERIVE
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 WHAT THIS FILE JUDGES, AND WHAT IT DOES NOT. It judges the REGISTRY as data
//    (every entry usable by the engine AND by the judges) and the two derivations as
//    functions. It does NOT judge whether the engine consumes them — that is
//    `keys-operator.test.js` (behaviour) and `observable-reach-gate.test.js` (reach),
//    and the separation matters: an operator PROVEN on a literal object is not proven
//    at all, which is exactly how `keys` shipped inert on 8 skills out of 8.
//
// 🛑 THE REGISTRY EXISTS BECAUSE ONE FIELD PER FACT IS A TOOL, NOT A LANGUAGE. Two
//    hard-coded fields produced two near-identical engine branches in a single evening;
//    the third fact would have made it a pattern. Every check below is therefore written
//    against the LIST, never against the two names we happen to have today — a test that
//    names them would go stale the day a third arrives, which is the class (㊽) this repo
//    keeps paying for.
//
// ⚠️ A DERIVATION IS A PARSER: it interprets a format nobody owns (a shell command), so
//    the doctrine makes property-based laws MANDATORY, not optional. Totality is the one
//    that matters most — this code runs inside a hook on every single tool call, and a
//    throw there is not an exception, it is the whole fleet losing its docs.
// ⚠️ THE LAWS ALSO HAVE DETERMINISTIC CASES: fast-check is excluded from the Stryker
//    runner, so a law without its case leaves its mutant alive and the score lies.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {
  DERIVED_OBSERVABLES,
  DERIVED_NAMES,
  derivedCandidates,
  commandCwdCandidates,
  commandPathCandidates,
} from '../src/derived-observables.js';
import { DEFAULT_PROFILE } from '../src/harness-profile.js';

// ── THE REGISTRY AS DATA ────────────────────────────────────────────────

test('every entry is COMPLETE — a half-declared fact is a fact nobody can judge', () => {
  assert.ok(DERIVED_OBSERVABLES.length > 0, 'an empty registry would make every derived cell vacuously green');
  for (const obs of DERIVED_OBSERVABLES) {
    assert.strictEqual(typeof obs.name, 'string', 'a fact without a name cannot be addressed by `keys`');
    assert.ok(obs.name.length > 0, 'an empty name is addressable by nothing and refusable by nothing');
    assert.strictEqual(typeof obs.derive, 'function', `${obs.name}: declared but not derivable = accepted and inert`);
    // 🛑 `from` MUST NAME A REAL KEY FAMILY OF THE PROFILE. A typo here does not throw: the
    //    derivation would simply receive nothing, for ever, in silence — the exact shape of
    //    "accepted and inert" this repo has paid for three times.
    assert.ok(Array.isArray(DEFAULT_PROFILE[obs.from]),
      `${obs.name}: \`from\` names no key family of the profile — the derivation would read nothing, silently`);
  }
});

test('every entry carries a WITNESS, and the witness really witnesses', () => {
  // 🛑 ANTI-INERTNESS. The reach table BUILDS its cells from these two strings. A witness
  //    that produced nothing would make its cells green while measuring nothing — the worst
  //    defect this repo knows, and the reason `layers.json` refuses a capability without one.
  for (const obs of DERIVED_OBSERVABLES) {
    assert.ok(typeof obs.temoin === 'function' && typeof obs.temoin().command === 'string' && typeof obs.temoin().pattern === 'string',
      `${obs.name}: no witness — the reach table would build a cell that measures nothing`);
    const cmd = obs.temoin().command.split('@@').join('atome');
    const motif = obs.temoin().pattern.split('@@').join('atome');
    // 🛑 A NON-EMPTY PATTERN IS THE LOAD-BEARING PART: `includes('')` is always true, so an
    //    empty witness pattern would make EVERY reach cell pass while measuring nothing —
    //    the green-that-sees-nothing this repo calls its worst defect. Same for the gesture:
    //    a witness deriving no candidate proves the cell is vacuous, not that the fact works.
    assert.ok(motif.length > 0, `${obs.name}: empty witness pattern — every cell would pass on nothing`);
    assert.ok(obs.derive(cmd).length > 0, `${obs.name}: its witness gesture derives NOTHING — the cell is vacuous`);
    assert.ok(obs.derive(cmd).some((c) => c.includes(motif)),
      `${obs.name}: its own witness produces no candidate carrying the pattern — the cell would be vacuous`);
  }
});

test('the names are UNIQUE and DERIVED — two facts under one name is the defect itself', () => {
  assert.deepStrictEqual(DERIVED_NAMES, DERIVED_OBSERVABLES.map((o) => o.name),
    'the name list is a COPY instead of a derivation — a copy drifts, and this one is read by every judge');
  assert.strictEqual(new Set(DERIVED_NAMES).size, DERIVED_NAMES.length,
    'two entries share a name: `keys` could no longer separate them, which is defect 9 and 10 all over again');
  // ⚠️ A derived name must not collide with a harness key either: `keys` addresses BOTH in
  //    one namespace, so a collision would make one of them unaddressable, silently.
  const clesHarnais = [...DEFAULT_PROFILE.pathKeys, ...DEFAULT_PROFILE.commandKeys, ...DEFAULT_PROFILE.contentKeys];
  for (const n of DERIVED_NAMES) {
    assert.ok(!clesHarnais.includes(n), `${n} collides with a harness key — one of the two becomes unaddressable`);
  }
});

// ── THE DERIVATIONS ─────────────────────────────────────────────────────

test('the DIRECTORY is what the gesture designates — nothing more', () => {
  assert.deepStrictEqual(commandCwdCandidates('cd /w/projet && node a.js'), ['/w/projet']);
  assert.deepStrictEqual(commandCwdCandidates("cd '/w/quote' && ls"), ['/w/quote'], 'a quoted path is unwrapped');
  // ⚠️ KNOWN LIMIT, MEASURED not assumed: a directory containing a SPACE derives NOTHING —
  //    the capture stops at the first blank, so the `&&` is never reached. Inherited from
  //    `protect-files`, kept deliberately: widening the capture would change the decision on
  //    every command of the fleet, and that is a differential question, not a fix. Written
  //    here so the next reader measures instead of "repairing" it by hand.
  assert.deepStrictEqual(commandCwdCandidates('cd "/w/avec espace" && ls'), []);
  assert.deepStrictEqual(commandCwdCandidates('cd /w/projet; ls'), ['/w/projet']);
  // ⚠️ NO `cd` ⇒ NOTHING. Never a fallback on the raw text: that fallback silently
  //    re-merges the two facts, which is precisely the defect this file exists to end.
  assert.deepStrictEqual(commandCwdCandidates('grep projet f.txt'), []);
  assert.deepStrictEqual(commandCwdCandidates('cd /w/projet'), [], 'a `cd` with no follow-up designates nothing yet');
});

test('the RECONSTRUCTED paths glue that directory to EVERY following word — that is the whole defect', () => {
  assert.deepStrictEqual(commandPathCandidates('cd /w/projet && node a.js'), ['/w/projet/node', '/w/projet/a.js']);
  // 🔴 THE MEASURED CASE, kept as a founding one: a project name merely QUOTED after a `cd`
  //    becomes a plausible path OF the directory. On 2026-08-20 one such command delivered a
  //    FOREIGN project's 90 KB skill into an unrelated session.
  assert.ok(commandPathCandidates('cd /w/ici && echo autre-projet').includes('/w/ici/autre-projet'),
    'the fabrication is the defect: a quoted word becomes a path of a directory it has nothing to do with');
  assert.deepStrictEqual(commandPathCandidates('ls -la'), []);
  // ⚠️ THE SEGMENTS ARE REJOINED WITH A SPACE, and the space is load-bearing: gluing them
  //    without one would weld the last word of a segment to the first of the next
  //    (`ls;pwd` → `lspwd`), fabricating a path that matches NOTHING while hiding the two
  //    that should have matched. A silent under-count, i.e. a doc that stops arriving.
  assert.deepStrictEqual(commandPathCandidates('cd /w/p && ls;pwd'), ['/w/p/ls', '/w/p/pwd']);
});

test('the DIRECTORY is a PREFIX of every reconstructed path — the containment that makes the split honest', () => {
  // 🛑 THIS IS WHY DECLARING THE DIRECTORY IS DECISION-NEUTRAL BY DEFAULT, and it is proven
  //    here rather than asserted in a comment: whatever a pattern matches on the bare
  //    directory, it also matches on `directory/…`. Consequence a reader MUST know: dropping
  //    ONLY `commandPaths` still lets the directory match, and dropping ONLY `commandCwd`
  //    changes nothing while the reconstruction is alive.
  const cmd = 'cd /w/projet && node a.js';
  for (const chemin of commandPathCandidates(cmd)) {
    assert.ok(chemin.startsWith(commandCwdCandidates(cmd)[0]), 'a reconstructed path no longer carries its directory');
  }
});

test('the aggregate is the registry, in order — the order fixes what `exclude` sees', () => {
  assert.deepStrictEqual(derivedCandidates('cd /w/p && ls'), ['/w/p', '/w/p/ls']);
  assert.deepStrictEqual(derivedCandidates('echo rien'), []);
});

// ── THE LAWS ────────────────────────────────────────────────────────────

const commande = () => fc.string({ maxLength: 120 });

test('LAW — TOTAL: no input makes a derivation throw (a throw here kills injection fleet-wide)', () => {
  fc.assert(fc.property(commande(), (c) => {
    for (const obs of DERIVED_OBSERVABLES) assert.ok(Array.isArray(obs.derive(c)));
    assert.ok(Array.isArray(derivedCandidates(c)));
  }), { numRuns: 400 });
});

test('LAW — every candidate is a NON-EMPTY string: an empty one would match EVERY pattern', () => {
  // 🛑 The stakes are not cosmetic: `includes('')` is always true, so a single empty
  //    candidate would make every rule in the fleet fire on every gesture.
  fc.assert(fc.property(commande(), (c) => {
    for (const cand of derivedCandidates(c)) {
      assert.strictEqual(typeof cand, 'string');
      assert.ok(cand.length > 0);
    }
  }), { numRuns: 400 });
});

test('CASE — the empty-candidate law, deterministic (properties are outside the Stryker runner)', () => {
  for (const cmd of ['cd /w/p && ', 'cd /w/p &&', 'cd /w/p ;  ; ']) {
    for (const cand of derivedCandidates(cmd)) assert.ok(cand.length > 0, `empty candidate on ${JSON.stringify(cmd)}`);
  }
});

test('LAW — a command with NO `cd` derives NOTHING: we never invent a fact out of thin air', () => {
  fc.assert(fc.property(fc.string({ maxLength: 80 }).filter((s) => !/\bcd\s/.test(s)), (c) => {
    assert.deepStrictEqual(derivedCandidates(c), []);
  }), { numRuns: 300 });
});

test('CASE — no `cd`, no fact (deterministic twin of the law above)', () => {
  assert.deepStrictEqual(derivedCandidates('npm test && npm run lint'), []);
  assert.deepStrictEqual(derivedCandidates('echo "cdrom" && ls'), [], 'the word must be `cd`, not a prefix of one');
});
