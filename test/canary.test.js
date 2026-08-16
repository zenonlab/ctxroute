// ⚠️ WHAT THIS SUITE PROTECTS: the ONLY witness that looks at the other end of
//    the pipe. If it is wrong, we believe we are being watched when we are
//    not — a false confidence is worth less than no witness at all.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  verdict, sourceTag, countInjections, EMISSIONS_THRESHOLD, BYTE_WINDOW, INJECTION_MARK,
} from '../src/canary.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ⚠️ NO HARNESS DIALECT LEFT HERE (07/08/2026). This suite used to declare
//    `MARQUE_APPEL = '"type":"tool_use"'` to simulate counting calls in the
//    transcript. That counting was REMOVED: the official Codex doc says
//    "the transcript format isn't a stable interface for hooks and may change
//    over time". The denominator now comes from our own emissions counter
//    (`emission-core`), and the noise line below only serves to prove that we
//    do NOT count just anything.
const bruitHarnais = () => '{"type":"tool_use","name":"Read"}\n';
const injection = () => 'my doc\n[source: .claude/hooks/docs/x.md]\n';

// ── THE VERDICT ─────────────────────────────────────────────────────────
test('ALIVE: ONE SINGLE observed injection is enough — we never count an expected number', () => {
  // ⚠️ Design invariant: the canary does NOT compare "received" to "hoped for"
  //    (that would be estimation). One trace = the channel carries. Full stop.
  assert.equal(verdict(1000, 1), 'alive');
  assert.equal(verdict(0, 1), 'alive');
});

test('DEAD: calls happened, ZERO injections, beyond the threshold', () => {
  assert.equal(verdict(EMISSIONS_THRESHOLD, 0), 'dead');
  assert.equal(verdict(EMISSIONS_THRESHOLD + 500, 0), 'dead');
});

test('THRESHOLD BOUNDARY: at THRESHOLD-1 we KEEP QUIET, at exactly THRESHOLD we accuse', () => {
  // ⚠️ Silence below the threshold is a CHOICE: accusing too early would
  //    manufacture false alerts, and a gate that screams on healthy state stops
  //    being read.
  assert.equal(verdict(EMISSIONS_THRESHOLD - 1, 0), 'undecidable');
  assert.equal(verdict(EMISSIONS_THRESHOLD, 0), 'dead');
});

test('UNDECIDABLE: session starting up (nothing observed) ⇒ no accusation', () => {
  assert.equal(verdict(0, 0), 'undecidable');
});

test('TOTAL: absurd inputs ⇒ never a throw, never an accusation', () => {
  // ⚠️ A canary that crashes is a MUTE canary — worse than absent, since we
  //    would believe we are being watched. It must absorb any input.
  for (const mauvais of [undefined, null, NaN, -3, 1.5, '30', {}, []]) {
    assert.equal(verdict(mauvais, 0), 'undecidable', 'emissions=' + String(mauvais));
    assert.equal(verdict(EMISSIONS_THRESHOLD, mauvais), 'dead', 'injections=' + String(mauvais));
  }
});

test("THRESHOLD: CONTRACT value hard-coded (never derived from the code under test)", () => {
  // ⚠️ Deriving the expectation from the constant would make it mutate WITH the
  //    code: the mutant would become invisible. A real precedent in this fleet,
  //    see quality-configs.
  assert.equal(EMISSIONS_THRESHOLD, 25);
  assert.equal(BYTE_WINDOW, 2097152);
});

// ── THE LABEL ───────────────────────────────────────────────────────────
test("LABEL: MUTE when all is well, explicit when it is dead", () => {
  // ⚠️ Silence on healthy state IS the feature: a permanent alarm becomes
  //    scenery. Never put a "✅ ok" in it.
  assert.equal(sourceTag('alive'), '');
  assert.equal(sourceTag('undecidable'), '');
  assert.equal(sourceTag('dead'), '💉⚠️ INJECTION DEAD');
  assert.equal(sourceTag('anything at all'), '');
});

// ── THE COUNTING ────────────────────────────────────────────────────────
test('COUNTING: only OUR marks count — harness noise is ignored', () => {
  // ⚠️ THIS TEST IS THE HEART OF THE 07/08/2026 CHANGE. The transcript contains
  //    plenty of harness-specific structures; none of them must weigh on the
  //    verdict, because their format is guaranteed by nobody. Only `[source:` —
  //    which WE write — is counted.
  const s = bruitHarnais() + injection() + bruitHarnais() + bruitHarnais();
  assert.equal(countInjections(s), 1);
  assert.equal(countInjections(bruitHarnais().repeat(50)), 0);
});

test('COUNTING: ADJACENT occurrences all seen (no missed overlap)', () => {
  // ⚠️ CONTRACT CHANGED on 07/08/2026 (defect ㉘) — the INTENT of the test is
  //    intact (the scan must not miss two glued occurrences), only the fixture
  //    changes: a BARE mark, with no label, no longer proves anything.
  //    Do NOT go back to bare marks "because it was simpler": those are what
  //    made the canary green on text that TALKS about it.
  const m = INJECTION_MARK + ' docs/session/a.md]';
  assert.equal(countInjections(m + m), 2);
  assert.equal(countInjections(m.repeat(7)), 7);
  // The BARE mark repeated proves NO injection.
  assert.equal(countInjections(INJECTION_MARK.repeat(7)), 0);
});

test('COUNTING: TRUNCATED leading line ⇒ robust (the window cuts mid-line)', () => {
  // ⚠️ The bounded read necessarily CUTS a line. Counting substrings (and not
  //    parsed JSON) is what makes that harmless — do not "improve" it by
  //    parsing, the canary would become fragile to the cut AND dependent on a
  //    format the Codex doc declares unstable, for zero gain.
  const truncated = 'e":"tool_use","name":"Bash"}\n' + bruitHarnais() + injection();
  assert.equal(countInjections(truncated), 1);
});

test('COUNTING: non-string input ⇒ zero, never a throw', () => {
  for (const mauvais of [undefined, null, 42, {}, []]) {
    assert.equal(countInjections(mauvais), 0);
  }
});

// ⚠️ TEST DELETED, AND IT IS A GAIN — "call mark ABSENT or EMPTY ⇒ zero".
//    It protected against a real trap: a shell forgetting to supply its dialect
//    mark would have counted an occurrence at EVERY position, fabricating a
//    "mort" verdict out of thin air. That parameter no longer exists: the
//    failure mode is ELIMINATED BY CONSTRUCTION, not disabled. Repo doctrine —
//    we remove the cause, we do not keep a test that freezes useless code.

// ── NEGATIVE-CHECK ──────────────────────────────────────────────────────
test('NEGATIVE-CHECK: the canary KNOWS how to accuse (otherwise it certifies instead of protecting)', () => {
  // ⚠️ A dead-man switch that never fires is false confidence. Here we check
  //    that there really is an input producing the alert — and one that does
  //    NOT produce it, without which "mort" would be a constant.
  assert.equal(verdict(EMISSIONS_THRESHOLD, 0), 'dead', 'it knows how to accuse');
  assert.notEqual(verdict(EMISSIONS_THRESHOLD, 1), 'dead', "…and it knows how to abstain");
  assert.notEqual(verdict(EMISSIONS_THRESHOLD - 1, 0), 'dead', "…and it knows how to wait until it knows enough");
});

// ── ㉘ SELF-REFERENCE: the QUOTED marker is not the DELIVERED marker ─────
// ⚠️ REAL defect found on 07/08/2026 while closing ② bis (real Codex run).
//    `countInjections` counted EVERY occurrence of `[source:`. But that literal
//    appears in TEXT THAT TALKS ABOUT IT: the comments of `canary.js` itself,
//    and 64 fleet docs out of 386 (MEASURED that day) which quote a source file
//    in that form.
// 🛑 CONSEQUENCE, and this is what makes it serious: an agent READING one of
//    those docs — that is, exactly the gesture of someone INVESTIGATING a dead
//    injection — turned the canary GREEN. The dead-man switch disarmed itself
//    at the precise moment it was needed.
// ✅ FILTER: only a label of EMITTED shape counts (`.md` suffix, or `skill/`
//    prefix). Fleet measurement: among the HARD-CODED markers, 23 quote a
//    `.js`, 18 a `.ts`, 7 a `.tsx`, 4 a `.sh`, 3 a `.py` — only 4 a `.md`. The
//    filter therefore removes the overwhelming majority.
// ⚠️ THIS IS NOT THE COMPLETE FIX, and never present it as such: 4 fleet docs
//    quoting a `.md` remain. The TOTAL fix (accepting only labels ACTUALLY
//    emitted, read from the store) requires touching `emission-core.js`,
//    through which all the context of all the agents passes.
test('㉘ a label QUOTING a source file proves NO injection', () => {
  // ⚠️ GENERIC paths: public repo, never a real project/client name (gate
  //    `fuite-perso-gate` — it went red on the first version of this test).
  assert.equal(countInjections('see [source: src/handlers/lifecycle.js]'), 0);
  assert.equal(countInjections('cf [source: packages/seo/src/rss.ts]'), 0);
  assert.equal(countInjections('cf [source: deploy.sh] and [source: a.py]'), 0);
});

test('㉘ the canary.js comment about its OWN mark does not count', () => {
  // ⚠️ The ironic case: the investigating agent reads `canary.js`, one comment
  //    of which contains `[source: …]`. Before the fix, that was enough to
  //    declare the channel alive.
  assert.equal(countInjections('(`[source: …]`, placed by the gate)'), 0);
  assert.equal(countInjections('[source: ]'), 0);
});

test('㉘ a REAL emitted label always counts — no false negative', () => {
  assert.equal(countInjections(injection()), 1);
  assert.equal(countInjections('[source: docs/session/outils.md]'), 1);
  assert.equal(countInjections('[source: docs/mcp/stripe.md]'), 1);
  assert.equal(countInjections('[source: skill/ctxroute]'), 1);
  assert.equal(countInjections(injection() + injection()), 2);
});

test('㉘ label TRUNCATED by the window: never counted, never an error', () => {
  // ⚠️ The 2 MB window cuts mid-line BY CONSTRUCTION. A mark without a `]` is
  //    undecidable: we do not count, we do not throw.
  assert.equal(countInjections('bla [source: .claude/hooks/docs/x.m'), 0);
  assert.equal(countInjections('[source:'), 0);
});

test('㉘ BOUND: a very distant `]` does not fabricate a label', () => {
  // ⚠️ Without a bound, any prose containing `[source:` and then, 3 000
  //    characters later, a `]` ending in ".md" would validate.
  const loin = '[source: ' + 'x'.repeat(300) + '.md]';
  assert.equal(countInjections(loin), 0);
  // Just under the bound: counted (proof that the bound really is the limit).
  const court = '[source: ' + 'x'.repeat(150) + '.md]';
  assert.equal(countInjections(court), 1);
});

test('㉘ TRUNCATION: without the `fin !== -1` guard, a cut FABRICATES a label', () => {
  // ⚠️ DISCRIMINATING FIXTURE (surviving mutant of 07/08/2026). The window cuts
  //    just AFTER a `.md` but BEFORE the `]`. Without the guard,
  //    `slice(start, -1)` shaves the last character and yields "docs/a.md" — a
  //    PERFECT label fabricated by the cut itself. The 1st fixture ("…/x.m")
  //    discriminated nothing: it already failed on the shape.
  assert.equal(countInjections('[source: docs/a.mdZ'), 0);
});

test('㉘ EXACT BOUND: 200 characters pass, 201 do not', () => {
  const etiquette200 = 'x'.repeat(197) + '.md';
  const etiquette201 = 'x'.repeat(198) + '.md';
  assert.equal(etiquette200.length, 200);
  assert.equal(countInjections('[source: ' + etiquette200 + ']'), 1);
  assert.equal(countInjections('[source: ' + etiquette201 + ']'), 0);
});
