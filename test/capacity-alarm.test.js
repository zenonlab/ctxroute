// ═══════════════════════════════════════════════════════════════════════
// THE CAPACITY ALARM MUST SCREAM — and keep silent when all is well.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 WHAT IT PROTECTS, AND WHY THAT IS WORTH A DEDICATED TEST (07/08/2026).
//    When the load of an action exceeds the capacity of the N frames, nothing is
//    LOST (the queue drains at the next action) — but the agent ACTS before having
//    received everything. It is the most dangerous degradation of the framework because
//    it is perfectly SILENT: no error, no red, no
//    test that falls. Exactly the "nothing measures the THROUGHPUT" hole of the backlog.
//    Precedent MEASURED on 05/08/2026: a skill delivered in 11 actions instead of 1,
//    with 995 tests green, mutation 100 %, doctor 27/27 and a living canary.
//
// ⚠️ REAL SPAWN MANDATORY, never an in-memory call: the alarm travels in
//    `systemMessage`, that is to say in the OUTPUT DIALECT of the shell.
//    An in-process test would validate the composition of the text without proving that it
//    reaches the output of the hook — the "green that lies" this repo hunts down.
//
// ⚠️ THE NEGATIVE CASE IS THE HALF THAT COUNTS: an alarm that ALWAYS screams
//    is an alarm people stop reading (lesson of rush mode). We therefore also
//    require SILENCE when the capacity is sufficient.
//
// ⚠️ TOTAL ISOLATION (`CTXROUTE_CONFIG_PATH` + `CTXROUTE_STATE_DIR` in a
//    tmpdir): NEVER let a test write into the shipped config or stores
//    — REAL bug of 15/07/2026, a polluted fixture had made the
//    framework silent for days.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORTE = path.join(HERE, '..', 'src', 'hooks', 'doc-inject.js');
// REAL file of the repo, chosen because it carries a bulky injectable doc.
const TARGET = path.join(HERE, '..', 'src', 'pretool-core.js');

// ⚠️ THIS SUITE DEPENDS ON THE LIVING FLEET — it SKIPS on a fresh clone.
//    🔴 PAID FOR IMMEDIATELY (07/08/2026): written without this guard, it made
//    the CI RED at the first push (3 failures on ubuntu-latest) while the
//    local was green. TWO reasons, both invisible here:
//    ① `ctxroute-config.json` is GITIGNORED (it carries the maintainer's project
//       names) — it therefore does NOT exist on a clone;
//    ② the doc corpus lives in `~/.claude/hooks/docs`, outside the repo.
//    That is the trap named in `rituel-stack-audit.md`: "the local reads the
//    REAL config of the machine, the CI a FRESH clone".
// 🛑 Do NOT "fix" it by fabricating a fake corpus: what we measure here
//    is the capacity overflow on REAL content. A fabricated corpus
//    would prove that the alarm knows how to display itself, not that it triggers when
//    it must. Better to SKIP frankly than to measure something else.
//    Same arbitration as parts ①② of `couverture-gate` and as
//    `pretool-differential`, which skip for the same reason.
const fleetPresent = fs.existsSync(path.join(HERE, '..', 'ctxroute-config.json'))
  && fs.existsSync(path.join(os.homedir(), '.claude', 'hooks', 'docs'));

/** Runs the gate with an imposed budget and returns its `systemMessage`. */
function badge({ budgetInjection, frame, frames, root }) {
  const cfg = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'ctxroute-config.json'), 'utf8'));
  cfg.budgetInjection = budgetInjection;
  const cfgPath = path.join(root, `cfg-${budgetInjection}.json`);
  fs.writeFileSync(cfgPath, JSON.stringify(cfg));

  const payload = JSON.stringify({
    session_id: 'alarme-' + budgetInjection,
    tool_name: 'Read',
    tool_input: { file_path: TARGET },
    // ⚠️ STABLE invocationId between the frames of the same case: without it, each
    //    process would re-decide and the plan would not be shared.
    tool_use_id: 'inv-' + budgetInjection,
  });

  const r = spawnSync(process.execPath, [PORTE, '--frame', String(frame), '--frames', String(frames)], {
    input: payload,
    encoding: 'utf8',
    env: { ...process.env, CTXROUTE_CONFIG_PATH: cfgPath, CTXROUTE_STATE_DIR: path.join(root, 'state') },
  });
  if (!r.stdout || r.stdout.trim() === '') return '';
  try { return JSON.parse(r.stdout).systemMessage || ''; } catch { return ''; }
}

function tmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-alarme-'));
  fs.mkdirSync(path.join(d, 'state'), { recursive: true });
  return d;
}

test.skipIf(!fleetPresent)('SCREAMS — capacity exceeded: the LAST frame carries the alarm, with the setting to change', () => {
  const root = tmp();
  try {
    // Tiny budget + 2 frames ⇒ GUARANTEED deferral, whatever the corpus.
    const msg = badge({ budgetInjection: 900, frame: 2, frames: 2, root });
    assert.ok(msg.includes('DEFERRED'), 'no alarm although the capacity is exceeded: ' + JSON.stringify(msg));
    // ⚠️ The message MUST carry the action: an alarm that does not say what to do
    //    sends the human off to read the code. Naming the EXACT key is the contract.
    assert.ok(msg.includes('frames'), 'the alarm does not name the setting to change: ' + msg);
    assert.ok(msg.includes('ctxroute-config.json'), 'the alarm does not say WHERE to set it: ' + msg);
    // The normal badge survives: the alarm is ADDED, it does not replace.
    assert.ok(msg.includes('📄'), 'the alarm overwrote the badge instead of being added to it: ' + msg);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test.skipIf(!fleetPresent)('KEEPS SILENT — a NON-final frame does not repeat the alarm (12 frames = 12 screams = unreadable alarm)', () => {
  const root = tmp();
  try {
    const msg = badge({ budgetInjection: 900, frame: 1, frames: 2, root });
    assert.ok(!msg.includes('DEFERRED'),
      'an intermediate frame screams too: with 12 declarations the alarm would appear 12 times — ' + msg);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test.skipIf(!fleetPresent)('NEGATIVE — SUFFICIENT capacity (REAL wiring): no frame screams', () => {
  // 🔴 THIS TEST HARDCODED `12` — RED on 12/08/2026 when the wiring moved
  //    to 16, while NOTHING was broken: the corpus had simply grown
  //    beyond 12 frames. **Two places for one number**, exactly the
  //    class that `doctor --settings` part ④ exists to kill — and the test that
  //    watches over it was committing it itself. The number of frames is NOW READ
  //    IN THE CONFIG, single source. ⚠️ NEVER re-fix it: a test calibrated on
  //    a frozen value turns red at every setting change and ends up disabled.
  // ⚠️ WE REPLAY ALL THE FRAMES, NOT A SINGLE ONE. The alarm only lives on the
  //    LAST CARRYING frame, and the last declared frames are often
  //    EMPTY (measured load 65 265 chars ⇒ ~9 frames out of 12). Probing an index
  //    chosen by hand would give a green that proves nothing: it is
  //    the invariant "NO frame screams" that must be verified.
  // ⚠️ DEFAULT BUDGET (8 000): `budgetInjection` can only REDUCE the
  //    budget (Math.min with the harness bound) — giving it 60 000 does NOT
  //    increase it. First version of this test falsely RED for that
  //    reason; the mistake was in the test, not in the code.
  const root = tmp();
  try {
    // SINGLE SOURCE of the number of frames: the shipped config (the one that
    // `doctor --settings` confronts with the wiring). Never a constant here.
    const N = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'ctxroute-config.json'), 'utf8')).frames;
    assert.ok(Number.isInteger(N) && N >= 1, '`frames` absent/invalid in the config — measurement impossible');
    const badges = [];
    for (let k = 1; k <= N; k++) badges.push(badge({ budgetInjection: 8000, frame: k, frames: N, root }));
    const shout = badges.filter((m) => m.includes('DEFERRED'));
    assert.deepStrictEqual(shout, [],
      'alarm emitted although the capacity is sufficient — a permanent alarm is an alarm people stop reading');
    // Counter-check: with no content emitted, the negative case would be empty hence worthless.
    assert.ok(badges.some((m) => m.includes('📄')),
      'no frame emitted anything: this negative case proves nothing — ' + JSON.stringify(badges));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
