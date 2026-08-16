// ═══════════════════════════════════════════════════════════════════════
// THE EMISSION COUNTER — the denominator of the canary.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 WHAT IT PROTECTS, AND WHY THAT IS WORTH A SUITE (07/08/2026).
//    The canary answers "we emitted N times, did it arrive?". Without a reliable
//    denominator, its two failure modes are SILENT and OPPOSITE:
//    ① counter too LOW (or never read)  ⇒ eternal `undecidable` verdict ⇒ a
//       silent and green dead-man switch, which manufactures confidence;
//    ② counter too HIGH (empty passes counted) ⇒ accusation of "INJECTION
//       DEAD" on a perfectly healthy system ⇒ an alarm people stop reading.
//    Neither of them breaks an existing test: hence this file.
//
// ⚠️ WHY THIS COUNTER EXISTS RATHER THAN A COUNT IN THE TRANSCRIPT:
//    official Codex hooks documentation — "the transcript format isn't a stable
//    interface for hooks and may change over time". You do not build a net
//    on a format that the vendor reserves the right to break.
//
// ⚠️ ISOLATION: `CTXROUTE_STATE_DIR` in a tmpdir. A test NEVER writes into the
//    shipped stores (REAL bug of 15/07/2026: a polluted fixture had made the
//    framework silent for days).
// ═══════════════════════════════════════════════════════════════════════

import { test, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const SID = 'emission-test';
let root;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-emission-'));
  process.env.CTXROUTE_STATE_DIR = root;
});

afterEach(() => {
  delete process.env.CTXROUTE_STATE_DIR;
  fs.rmSync(root, { recursive: true, force: true });
});

/** ⚠️ FRESH import on every test: `paths.js` may freeze the root at import time. */
function couche() {
  for (const k of Object.keys(require.cache)) {
    if (/emission-core|paths|session-store/.test(k)) delete require.cache[k];
  }
  return require('../src/emission-core.js');
}

const seg = (id) => ({ id, text: 'content of ' + id });
const emit = (em, frais) => em.emit({
  frais, budgetMax: 8000, nbFrames: 1, indice: 1, scopeId: SID,
});

test('COUNT: an emission carrying content increments by 1, and the count is CUMULATIVE', () => {
  const em = couche();
  assert.equal(em.emissionCount(SID), 0, 'starts at zero');
  emit(em, [seg('a')]);
  assert.equal(em.emissionCount(SID), 1);
  emit(em, [seg('b')]);
  emit(em, [seg('c')]);
  assert.equal(em.emissionCount(SID), 3);
});

test('DOES NOT COUNT: an EMPTY pass leaves the counter intact', () => {
  // ⚠️ THE MOST IMPORTANT INVARIANT OF THE FILE. `emit` is called at every
  //    action, including when nothing is decided and the queue is empty. Counting
  //    those passes would raise the denominator without any trace ever being
  //    expected on the other side ⇒ the canary would report a NON-EXISTENT breakdown.
  const em = couche();
  emit(em, [seg('a')]);
  for (let i = 0; i < 20; i++) emit(em, []);
  assert.equal(em.emissionCount(SID), 1, '20 actions without content have nothing to prove');
});

test('SCOPE: two agents count SEPARATELY (never a global counter)', () => {
  // ⚠️ Master and sub-agents are DISTINCT contexts: a shared counter
  //    would make one agent be blamed for another's emissions.
  const em = couche();
  emit(em, [seg('a')]);
  em.emit({ frais: [seg('b')], budgetMax: 8000, nbFrames: 1, indice: 1, scopeId: SID + '--agent-x' });
  assert.equal(em.emissionCount(SID), 1);
  assert.equal(em.emissionCount(SID + '--agent-x'), 1);
});

test('BACKWARD COMPAT: a store written BEFORE the `emissions` key is worth 0, never an error', () => {
  // ⚠️ Expand/contract: the key appeared on 07/08/2026 on stores that
  //    already existed. Raising an error here would kill the canary on all the
  //    sessions in progress — a net that breaks at deployment protects nobody.
  const em = couche();
  fs.writeFileSync(path.join(root, `remainder-${SID}.json`), JSON.stringify({ segments: [] }));
  assert.equal(em.emissionCount(SID), 0);
  emit(em, [seg('a')]);
  assert.equal(em.emissionCount(SID), 1, 'and it starts again normally');
});

test('TOTAL: store absent, unreadable or with an absurd value ⇒ 0, never a throw', () => {
  // ⚠️ A canary that crashes is a SILENT canary — worse than no canary, since we
  //    would believe we were being watched. Every input must be absorbed.
  const em = couche();
  assert.equal(em.emissionCount('never-seen'), 0);
  for (const absurde of [{ emissions: -5 }, { emissions: 1.5 }, { emissions: '30' }, { emissions: null }, {}]) {
    fs.writeFileSync(path.join(root, `remainder-${SID}.json`), JSON.stringify({ segments: [], ...absurde }));
    assert.equal(em.emissionCount(SID), 0, 'value=' + JSON.stringify(absurde));
  }
});

test('THE QUEUE SURVIVES THE COUNTER: both live in the SAME store without stepping on each other', () => {
  // ⚠️ The counter was lodged in the queue write so as to cost NO
  //    additional I/O. The price of that choice would be breaking the queue: this test
  //    is what makes that price nil.
  const em = couche();
  // ⚠️ MEASURED calibration, not guessed: with a single frame the chunking delivers
  //    EVERYTHING as long as the content fits in the budget (3 short segments / 60 chars
  //    came out whole — first version of this test falsely red, the mistake
  //    was in the test). We therefore need content clearly bigger than
  //    the capacity of the frame for a remainder to exist.
  const big = Array.from({ length: 40 }, (_, i) => ({ id: 'g' + i, text: 'x'.repeat(500) }));
  em.emit({ frais: big, budgetMax: 900, nbFrames: 1, indice: 1, scopeId: SID });
  assert.ok(em.loadQueue(SID).length > 0, 'premise: content remains in the queue');
  assert.equal(em.emissionCount(SID), 1, 'the counter did not overwrite the queue, nor the reverse');
});
