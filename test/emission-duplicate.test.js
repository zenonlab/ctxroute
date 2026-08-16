// ═══════════════════════════════════════════════════════════════════════
// ZERO DUPLICATE — an EMITTED segment must NEVER stay in the queue (06/08/2026)
// ═══════════════════════════════════════════════════════════════════════
//
// 🛑 WARNING — THE FOUNDING DEFECT OF THIS FILE NEVER EXISTED.
//    REFUTED BY MEASUREMENT ON 07/08/2026, and it is written here so that nobody
//    starts again from the false lead.
//
//    This file was born from an observation of 06/08: chunk 7/8 of the skill seen
//    TWICE in the transcript (seals `2bc5f3df` then `03d7e9f2`), hence
//    the hypothesis of a race between the N processes over the queue. **FALSE.** The
//    transcript shows a **`PreCompact` hook between the two** (06:24:24): the
//    compaction PURGES the states, so a `once` doc becomes deliverable again and
//    re-injects itself WHOLE. That is the DESIGNED behaviour — without it, the agent
//    would start again without its skill after every compaction. A 3rd delivery at
//    16:39:57 follows the same pattern: one more context, not a duplicate.
//    Dedicated reproduction (12 REALLY parallel processes, 2 actions, 105
//    then 92 segments in the queue): **0 duplicates**, clean draining `#12/23` →
//    `#13/23`. There was nothing to reproduce.
//
// ⚠️ WHY THIS FILE STAYS NONETHELESS. The invariant it states is SOUND
//    and was covered by nothing: `budget.property` proves CONSERVATION and
//    is structurally blind to duplication. A correct test, born from a
//    false cause, remains a correct test — we correct its NARRATIVE, we do not throw away
//    its guarantee. 🛑 But NEVER cite it as the proof of a past bug.
//
// ⚠️ METHOD LESSON, the real legacy of the episode: two occurrences of the same
//    identifier ARE NOT a duplicate as long as we have not looked at WHAT IS
//    BETWEEN THE TWO. The decisive fact was three lines away in the transcript.
//    The observation, inherited from a session SUMMARY and never re-verified,
//    hardened into a certainty by dint of being copied — into the code, four docs and
//    the backlog — and served as the main argument for removing a capability
//    that worked. **A defect is REPRODUCED before being engraved.**
//
// ⚠️ THE INVARIANT, STATED EXACTLY: at the end of an action, the set of
//    EMITTED segments and the set of segments PERSISTED IN THE QUEUE must be
//    DISJOINT. A segment belongs to one or the other, never to both.
//    Otherwise it is delivered now AND re-delivered at the next action: context
//    paid for twice, and an agent that reads the same thing twice without knowing
//    which one is authoritative.
//
// 🛑 THIS IS NOT A LOSS TEST, IT IS ITS MIRROR. `budget.property.test.js`
//    proves CONSERVATION ("nothing evaporates") and it is BLIND to the
//    opposite case: a segment delivered twice is, from the point of view of
//    conservation, perfectly conserved. Conservation AND uniqueness — both,
//    never one for the other.
//
// 🛑 WHAT FOLLOWED HERE DESCRIBED A "RACE BETWEEN PROCESSES" AS THE MEASURED
//    ROOT CAUSE. IT WAS A HYPOTHESIS, NEVER A MEASUREMENT — and it is
//    REFUTED (cf header: the compaction explains everything, and 12 processes
//    really in parallel over 2 actions produce NO duplicate).
//    The text said: "the memoized plan is written AFTER the call, so there is
//    a window in which two processes miss it". That window has never been
//    observed; the call and the writing of the plan are in the SAME
//    critical section of the lock.
// ⚠️ IT IS KEPT IN THIS FORM, STRUCK THROUGH AND DATED, rather than deleted:
//    an erased hypothesis comes back, a hypothesis REFUTED IN WRITING does not come
//    back. It is the same rule as for the backlog — an overturned judgement is
//    rewritten, it is neither stacked up nor erased.

import { test } from 'vitest';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import emission from '../src/emission-core.js';

// ⚠️ Fixtures as THUNKS, never module-level consts: Stryker `perTest`
//    turns a shared fixture into a STATIC mutant, hence a false
//    survivor (42 measured on 16/07/2026).
const grosDoc = () => [{
  id: 'doc/big',
  label: 'big.md',
  text: Array.from({ length: 400 }, (_, i) => `line ${i} ` + 'x'.repeat(70)).join('\n'),
}];

/** Isolates the store: never the real `state/`, it is shared with production. */
function isole(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-doublon-'));
  const avant = process.env.CTXROUTE_STATE_DIR;
  process.env.CTXROUTE_STATE_DIR = dir;
  try {
    return fn();
  } finally {
    if (avant === undefined) delete process.env.CTXROUTE_STATE_DIR;
    else process.env.CTXROUTE_STATE_DIR = avant;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** All the ids that really went out, across all frames. */
const idsEmis = (frames) => frames.flatMap((p) => p.emitted || []);

/** What is persisted for the next action = the deferrals of the LAST frame. */
const idsEnFile = (frames) => (frames[frames.length - 1].deferred || []).map((s) => s.id);

test('① an EMITTED segment never stays in the queue (the defect of 06/08/2026)', () => {
  isole(() => {
    const em = emission.emit({
      frais: grosDoc(), budgetMax: 8000, nbFrames: 12, indice: 1, scopeId: 'S',
    });
    const enFile = idsEnFile(em.frames);
    const doublons = idsEmis(em.frames).filter((id) => enFile.includes(id));
    assert.deepStrictEqual(doublons, [], 'emitted AND in the queue: ' + doublons.join(', '));
  });
});

test('② no segment is emitted twice within the same action', () => {
  isole(() => {
    const em = emission.emit({
      frais: grosDoc(), budgetMax: 8000, nbFrames: 12, indice: 1, scopeId: 'S',
    });
    const vus = new Set();
    const repetes = idsEmis(em.frames).filter((id) => (vus.has(id) ? true : (vus.add(id), false)));
    assert.deepStrictEqual(repetes, [], 'emitted several times: ' + repetes.join(', '));
  });
});

// 🛑 THIS BLOCK JUSTIFIED, FOR 24 H, THE REMOVAL OF A "RACE" PART FOR
//    REASONS THAT ARE TODAY OBSOLETE OR FALSE. Rewritten on 07/08/2026.
//
//    ① It claimed "the wiring has moved to a SINGLE declaration, hence no more
//       than one `emit` per action". **OBSOLETE**: the wiring went back to
//       **12 declarations** (bandwidth, cf `frame-unique.md`).
//    ② It claimed that the red part ③ "reproduced exactly the defect observed
//       in production". **FALSE**: that part called `emit` TWICE BY HAND,
//       which the real code never does — the memoized plan and the writing of
//       the queue are in the SAME critical section of the lock. It reproduced a
//       FABRICATED scenario, not the behaviour of the system. And the "defect
//       observed in production" did not exist either (cf header: compaction).
//    ③ It claimed that `doctor --settings` "requires ONE declaration and REFUSES
//       `--frames N>1`". **OBSOLETE**: these two checks were replaced by
//       CONSISTENCY checks (same N everywhere, as many declarations as
//       frames, indices 1..N with no gap nor duplicate, equality with the config).
//
// ⚠️ WHAT TO REMEMBER FROM IT — a test that proves a scenario the code cannot
//    produce proves NOTHING about the code. It reassures or it frightens,
//    at random. Before writing a "race" test, verify that the race
//    is REACHABLE: here, 12 really parallel processes over 2 actions
//    produced no duplicate (probe of 07/08).

test('③ several successive actions never re-emit a chunk that has already gone out', () => {
  isole(() => {
    const vusGlobal = new Set();
    const doublons = [];
    // A `once` is decided only once: the fresh content only arrives at the 1st action,
    // the following ones only DRAIN the queue. That is the real regime of a skill.
    for (let geste = 1; geste <= 6; geste++) {
      const em = emission.emit({
        frais: geste === 1 ? grosDoc() : [], budgetMax: 8000, nbFrames: 1, indice: 1, scopeId: 'S',
      });
      for (const id of idsEmis(em.frames)) {
        if (vusGlobal.has(id)) doublons.push(id);
        vusGlobal.add(id);
      }
    }
    assert.deepStrictEqual(doublons, [], 'delivered twice: ' + doublons.join(', '));
    assert.ok(vusGlobal.size > 1, 'the corpus must have been chunked, otherwise the test proves nothing');
  });
});
