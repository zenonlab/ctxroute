// ⚠️ WHAT THIS SUITE PROTECTS: the ONLY witness that looks at the other end of
//    the pipe. If it is wrong, we believe we are being watched when we are
//    not — a false confidence is worth less than no witness at all.
//
// ⚠️ REWORK OF 07/08/2026 — READ BEFORE MODIFYING. The canary's denominator is
//    NO LONGER counted in the transcript. Official Codex hooks doc
//    (learn.chatgpt.com/docs/hooks): « the transcript format isn't a stable
//    interface for hooks and may change over time ». We build nothing on a
//    format the vendor reserves the right to break. The denominator therefore
//    comes from the EMISSIONS counter written by `emission-core` — our data.
//    Direct consequence: this suite SETS an emissions state instead of
//    fabricating tool-call lines.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  sourceTag, EMISSIONS_THRESHOLD, BYTE_WINDOW,
} from '../src/canary.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));

const SID = 'canari-test-session';
// Harness-specific noise: it must NEVER weigh on the verdict.
const bruitHarnais = () => '{"type":"tool_use","name":"Read"}\n';
const injection = () => 'my doc\n[source: .claude/hooks/docs/x.md]\n';

// ── END TO END, BY REAL SPAWN ───────────────────────────────────────────
function lancer(payload, stateDir) {
  execFileSync(process.execPath, [path.join(ICI, '..', 'src', 'hooks', 'canary-check.js')], {
    input: JSON.stringify(payload),
    // ⚠️ EXACT name of the framework env var (`CTXROUTE_STATE_DIR`): with a
    //    near-miss name, the test writes into the REAL state folder and
    //    believes it failed. Mistake made while writing this suite.
    env: { ...process.env, CTXROUTE_STATE_DIR: stateDir },
  });
}

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'canari-'));
}

/**
 * Sets the emissions counter as `emission-core` would after N gestures.
 * ⚠️ SAME prefix and SAME key as the emission layer: if either changed, the
 *    canary would read 0 and stay eternally "undecidable" — mute, green,
 *    useless. It is that coupling these tests seal.
 */
function poserEmissions(stateDir, n) {
  fs.writeFileSync(
    path.join(stateDir, `remainder-${SID}.json`),
    JSON.stringify({ segments: [], emissions: n }),
  );
}

test("REAL SPAWN: one LANDED injection ⇒ verdict « alive », whatever the volume emitted", () => {
  const d = tmp();
  const t = path.join(d, 'transcript.jsonl');
  fs.writeFileSync(t, bruitHarnais().repeat(40) + injection());
  poserEmissions(d, 40);
  lancer({ transcript_path: t, session_id: SID }, d);
  const sante = JSON.parse(fs.readFileSync(path.join(d, 'canary.json'), 'utf8'));
  assert.equal(sante.verdict, 'alive');
  assert.equal(sante.injections, 1);
});

test('REAL SPAWN — THE CASE THAT JUSTIFIES EVERYTHING: channel DEAD ⇒ verdict « dead »', () => {
  // ⚠️ THIS is the scenario nothing else can see: the framework emits, and no
  //    injection lands any more. Our hooks would be green, the doctor too. Only
  //    this file knows.
  const d = tmp();
  const t = path.join(d, 'transcript.jsonl');
  fs.writeFileSync(t, bruitHarnais().repeat(EMISSIONS_THRESHOLD));
  poserEmissions(d, EMISSIONS_THRESHOLD);
  lancer({ transcript_path: t, session_id: SID }, d);
  const sante = JSON.parse(fs.readFileSync(path.join(d, 'canary.json'), 'utf8'));
  assert.equal(sante.verdict, 'dead');
  assert.equal(sante.emissions, EMISSIONS_THRESHOLD);
  assert.equal(sourceTag(sante.verdict), '💉⚠️ INJECTION DEAD');
});

test("REAL SPAWN — NEGATIVE: a NOISY transcript without emissions NEVER accuses", () => {
  // ⚠️ THIS CASE IS THE WHOLE REASON FOR THE NEW DENOMINATOR. Before
  //    07/08/2026, harness activity was ENOUGH to trigger the accusation: a
  //    user working on files not covered by any doc saw "INJECTION MORTE" while
  //    everything was fine. Now, without an emission of OUR own, there is
  //    nothing to expect at the other end — hence nothing to blame. An alarm
  //    that screams on healthy state stops being read.
  const d = tmp();
  const t = path.join(d, 'transcript.jsonl');
  fs.writeFileSync(t, bruitHarnais().repeat(EMISSIONS_THRESHOLD * 10));
  // No `poserEmissions`: the framework emitted nothing.
  lancer({ transcript_path: t, session_id: SID }, d);
  const sante = JSON.parse(fs.readFileSync(path.join(d, 'canary.json'), 'utf8'));
  assert.equal(sante.verdict, 'undecidable');
  assert.equal(sante.emissions, 0);
  assert.equal(sourceTag(sante.verdict), '', 'silence is mandatory as long as nothing proves the failure');
});

test('REAL SPAWN: MUTE by contract — EMPTY stdout and exit 0 (never blocks a prompt)', () => {
  const d = tmp();
  const t = path.join(d, 'transcript.jsonl');
  fs.writeFileSync(t, bruitHarnais().repeat(EMISSIONS_THRESHOLD));
  poserEmissions(d, EMISSIONS_THRESHOLD);
  const out = execFileSync(process.execPath, [path.join(ICI, '..', 'src', 'hooks', 'canary-check.js')], {
    input: JSON.stringify({ transcript_path: t, session_id: SID }),
    env: { ...process.env, CTXROUTE_STATE_DIR: d },
  });
  assert.equal(out.toString(), '', 'stdout MUST stay empty: it would be injected into the context');
});

test('REAL SPAWN: transcript MISSING or empty payload ⇒ silence, no file written', () => {
  const d = tmp();
  lancer({}, d);
  assert.equal(fs.existsSync(path.join(d, 'canary.json')), false, 'no verdict fabricated without evidence');
  // Path that does not exist: I/O error ⇒ fail-open, always exit 0.
  lancer({ transcript_path: path.join(d, 'nexiste-pas.jsonl') }, d);
  assert.equal(fs.existsSync(path.join(d, 'canary.json')), false);
});

test("REAL SPAWN: on error, the PREVIOUS verdict is PRESERVED (never repainted green)", () => {
  // ⚠️ Writing "alive" when we could not measure would be manufacturing green —
  //    the "green that lies" this whole framework fights.
  const d = tmp();
  const t = path.join(d, 'transcript.jsonl');
  fs.writeFileSync(t, bruitHarnais().repeat(EMISSIONS_THRESHOLD));
  poserEmissions(d, EMISSIONS_THRESHOLD);
  lancer({ transcript_path: t, session_id: SID }, d);
  assert.equal(JSON.parse(fs.readFileSync(path.join(d, 'canary.json'), 'utf8')).verdict, 'dead');
  lancer({ transcript_path: path.join(d, 'disparu.jsonl'), session_id: SID }, d);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(d, 'canary.json'), 'utf8')).verdict, 'dead',
    "the alert survives a failed measurement",
  );
});

test('REAL SPAWN: BOUNDED read — a big transcript does not cost its size', () => {
  // ⚠️ Measured 03/08/2026: a fleet transcript weighed 104 MB; reading it whole
  //    cost 524 ms ON EVERY TURN. This test seals the bound.
  const d = tmp();
  const t = path.join(d, 'gros.jsonl');
  // OLD injections, then enough noise to push them OUT of the window.
  // ⚠️ It is not enough for the file to be big: the padding must SEPARATE the
  //    old injections from the end (mistake made while writing this test — the
  //    window still caught them and the verdict stayed "alive").
  const bourrage = bruitHarnais().repeat(Math.ceil((BYTE_WINDOW * 1.5) / bruitHarnais().length));
  fs.writeFileSync(t, injection().repeat(1000) + bourrage);
  assert.ok(fs.statSync(t).size > BYTE_WINDOW, 'premise: the file exceeds the window');
  poserEmissions(d, EMISSIONS_THRESHOLD);
  lancer({ transcript_path: t, session_id: SID }, d);
  const sante = JSON.parse(fs.readFileSync(path.join(d, 'canary.json'), 'utf8'));
  assert.equal(sante.verdict, 'dead', 'old injections outside the window do not mask the ONGOING failure');
});

test('AFTER COMPACTION: the canary KEEPS QUIET, it NEVER accuses wrongly', () => {
  // 🔴 THIS TEST SEALS A REGRESSION I INTRODUCED ON 07/08/2026, and which NO
  //    test had seen: 1081 green, mutation 100 %, doctor 74 ok. It was found by
  //    answering the question "is this really solid?".
  //
  // WHAT CHANGED: the denominator came from the TRANSCRIPT, which SURVIVES
  // compaction — the canary was therefore operational immediately afterwards.
  // It now comes from the `remainder-` store, which `ctxroute-reset.js` PURGES on
  // PreCompact. ⇒ after every compaction the counter restarts from zero: the
  //    canary is BLIND until `EMISSIONS_THRESHOLD` is reached again.
  //
  // ⚠️ THE TRADE-OFF IS ASSUMED, AND MEASURED (07/08/2026, real 46 MB
  //    transcript, 13 compactions): between two compactions, **94 to 335
  //    injections** — the threshold is therefore crossed very early in each
  //    interval. In exchange, the canary no longer depends on ANY third-party
  //    format. What is true on this fleet is not true everywhere (small,
  //    heavily compacted sessions), hence this test.
  //
  // 🛑 THE INVARIANT THAT MATTERS IS NOT "it sees everything", it is **"it never
  //    lies"**: the post-compaction degradation must be SILENCE
  //    (`undecidable`), never an accusation. An alarm screaming after every
  //    compaction would be worse than no alarm — we would stop reading it.
  const d = tmp();
  const t = path.join(d, 'transcript.jsonl');
  // LOADED transcript (the past stays visible) but PURGED counter: that is
  // exactly the state of the day after a compaction.
  fs.writeFileSync(t, bruitHarnais().repeat(EMISSIONS_THRESHOLD * 10));
  poserEmissions(d, EMISSIONS_THRESHOLD);
  fs.rmSync(path.join(d, `remainder-${SID}.json`)); // ⇐ what the reset does

  lancer({ transcript_path: t, session_id: SID }, d);
  const apres = JSON.parse(fs.readFileSync(path.join(d, 'canary.json'), 'utf8'));
  assert.equal(apres.verdict, 'undecidable', 'the canary ACCUSES after a compaction: a false alarm guaranteed every cycle');
  assert.equal(sourceTag(apres.verdict), '', 'and it must stay MUTE, not merely cautious');

  // And it BECOMES decidable again as soon as emissions resume — without which
  // compaction would kill it for good instead of suspending it.
  poserEmissions(d, EMISSIONS_THRESHOLD);
  lancer({ transcript_path: t, session_id: SID }, d);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(d, 'canary.json'), 'utf8')).verdict, 'dead',
    'the canary does not re-arm after a compaction: it would be blind FOR THE REST of the session',
  );
});

test("BOUNDARY CONTRACT: the canary reads the key THAT the emission layer writes", () => {
  // ⚠️ THIS TEST EXISTS BECAUSE THE FAILURE WOULD BE INVISIBLE. `emission-core`
  //    writes `emissions` into the `remainder-` store, `canary-check` reads it
  //    back from there. If either changed key, prefix or scope, the canary would
  //    read 0 and stay "undecidable" FOREVER: mute, green, and unable to report
  //    the failure it exists to detect. No other test would see that — both
  //    files would pass their respective suites.
  const d = tmp();
  const t = path.join(d, 'transcript.jsonl');
  fs.writeFileSync(t, bruitHarnais());

  // We write through the REAL emission layer, never through an imitation.
  const ecrire = `
    process.env.CTXROUTE_STATE_DIR = ${JSON.stringify(d)};
    const em = require(${JSON.stringify(path.join(ICI, '..', 'src', 'emission-core.js'))});
    for (let i = 0; i < ${EMISSIONS_THRESHOLD}; i++) {
      em.emit({ frais: [{ id: 'd' + i, text: 'x' }], budgetMax: 8000, nbFrames: 1, indice: 1, scopeId: ${JSON.stringify(SID)} });
    }
  `;
  execFileSync(process.execPath, ['-e', ecrire], { env: { ...process.env, CTXROUTE_STATE_DIR: d } });

  lancer({ transcript_path: t, session_id: SID }, d);
  const sante = JSON.parse(fs.readFileSync(path.join(d, 'canary.json'), 'utf8'));
  assert.equal(
    sante.emissions, EMISSIONS_THRESHOLD,
    "the canary does not see the emissions ACTUALLY written by the layer: the boundary has diverged",
  );
  assert.equal(sante.verdict, 'dead');
});

// ═══════════════════════════════════════════════════════════════════════
// OBSERVATION LOG — born from an incident where the canary accused WRONGLY
// ═══════════════════════════════════════════════════════════════════════
// 🔴 09/08/2026: verdict "mort" (emissions 29, injections 0) while EVERYTHING
//    was injecting — 240 labels and 95 injection events in its own reading
//    window, and the other agents were receiving their docs. Replayed
//    afterwards read-only: "alive". NOT REPRODUCED, cause NOT ESTABLISHED.
// 🛑 WHAT MADE THE INVESTIGATION IMPOSSIBLE: the verdict said neither WHICH
//    file had been read, nor how much of it. Two hypotheses had to be measured
//    by hand, after the fact, on an already changed state.
// ⚠️ THIS TEST DOES NOT PROVE THE CANARY IS RIGHT — it guarantees we will be
//    able to KNOW next time. That is the difference between a witness we
//    believe and a witness we can question.
test("LOG: the verdict says WHICH transcript was read, and HOW MUCH", () => {
  const d = tmp();
  const t = path.join(d, 'transcript.jsonl');
  fs.writeFileSync(t, bruitHarnais().repeat(40) + injection());
  poserEmissions(d, 40);
  lancer({ transcript_path: t, session_id: SID }, d);
  const sante = JSON.parse(fs.readFileSync(path.join(d, 'canary.json'), 'utf8'));

  // the EXACT file on which the verdict was rendered
  assert.equal(sante.transcript, t);
  // its real size, and how much of it was actually read
  assert.equal(sante.tailleTranscript, fs.statSync(t).size);
  assert.equal(sante.octetsLus, Math.min(BYTE_WINDOW, fs.statSync(t).size));
  // the scope, on which the DENOMINATOR depends: a drifting key makes the
  // canary mute and green forever — the most dangerous failure mode.
  assert.equal(sante.scope, SID);
});

// ⚠️ ANTI-INERTNESS ASPECT: without this case, the fields could be hard-coded
//    (or copied from a previous run) and the test above would still pass. Here
//    we change file AND size: the log MUST follow.
test('LOG: it describes the CURRENT run, never a frozen value', () => {
  const d = tmp();
  const petit = path.join(d, 'petit.jsonl');
  const gros = path.join(d, 'gros.jsonl');
  fs.writeFileSync(petit, injection());
  fs.writeFileSync(gros, bruitHarnais().repeat(500) + injection());
  poserEmissions(d, EMISSIONS_THRESHOLD + 5);

  lancer({ transcript_path: petit, session_id: SID }, d);
  const a = JSON.parse(fs.readFileSync(path.join(d, 'canary.json'), 'utf8'));
  lancer({ transcript_path: gros, session_id: SID }, d);
  const b = JSON.parse(fs.readFileSync(path.join(d, 'canary.json'), 'utf8'));

  assert.equal(a.transcript, petit);
  assert.equal(b.transcript, gros);
  assert.ok(b.tailleTranscript > a.tailleTranscript,
    'the logged size must follow the file actually read');
});
