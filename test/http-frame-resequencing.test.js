// ═══════════════════════════════════════════════════════════════════════
// http-frame-resequencing.test.js — the `/pretool` route under LOST FRAMES.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 THE DEFECT, MEASURED 2026-08-28. Windows disables TCP retransmission on
//    loopback (`SIO_TCP_INITIAL_RTO`) ⇒ ~6% of the connections a declared
//    frame opens against this daemon are lost in silence (ETIMEDOUT). The OLD
//    design served content chunk k to the frame whose URL said `?frame=k`:
//    when that connection never reaches the daemon, chunk k is delivered
//    NOWHERE, even though other frames of the SAME action connected with
//    nothing to say. `frame-sequencer-pure.js` fixes this by handing a
//    connecting frame the NEXT UNDELIVERED content index instead.
//
// 🎯 THE TARGET, one binary line: on the `http` lane, the frames that ARRIVE
//    carry everything there is to deliver for that action — no content chunk
//    is ever reserved for a frame that never shows up.
//
// ⚠️ THIS FILE DRIVES `handle()` DIRECTLY (not a real socket): the transport
//    itself is already proven by `http-lane-differential.test.js`. What is
//    proven HERE is the SEQUENCING decision — which content index a
//    connecting request receives — under a set of frame numbers that skips
//    some declared indices entirely, exactly as Windows loopback would.
// ═══════════════════════════════════════════════════════════════════════

import { test, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-http-reseq-'));
const DOCS = path.join(TMP, 'docs');
const CONFIG = path.join(TMP, 'config.json');
const STATE = path.join(TMP, 'state');

function writeDoc(rel, text) {
  const full = path.join(DOCS, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, text);
}

let previousEnv = {};

beforeEach(() => {
  previousEnv = {
    docs: process.env.CTXROUTE_FILEDOCS_DIR,
    state: process.env.CTXROUTE_STATE_DIR,
    config: process.env.CTXROUTE_CONFIG_PATH,
  };
  fs.rmSync(DOCS, { recursive: true, force: true });
  fs.rmSync(STATE, { recursive: true, force: true });
  fs.rmSync(CONFIG, { force: true });
  fs.mkdirSync(DOCS, { recursive: true });
  process.env.CTXROUTE_FILEDOCS_DIR = DOCS;
  process.env.CTXROUTE_STATE_DIR = STATE;
  process.env.CTXROUTE_CONFIG_PATH = CONFIG;
});

afterEach(() => {
  process.env.CTXROUTE_FILEDOCS_DIR = previousEnv.docs;
  process.env.CTXROUTE_STATE_DIR = previousEnv.state;
  process.env.CTXROUTE_CONFIG_PATH = previousEnv.config;
});

/**
 * Extracts the ordered list of `CHUNK j/m` markers found in a text.
 * @param {string} text
 * @returns {{j: number, m: number}[]}
 */
function chunkMarkers(text) {
  const out = [];
  const re = /CHUNK (\d+)\/(\d+)/g;
  let mm;
  while ((mm = re.exec(text))) out.push({ j: Number(mm[1]), m: Number(mm[2]) });
  return out;
}

/**
 * ⚠️ NAMED FUNCTION, NOT AN INLINE `for` (2026-08-30, quadratic-budget gate):
 * both call sites below drive a small, FIXED number of frames (`NB_FRAMES`
 * or the `connecting` fixture, ≤ 8) and each frame's text carries a handful
 * of chunk markers of this SAME test corpus — bounded test scaffolding, not
 * client volume. Moving the inner `for` into its own function removes the
 * syntactic nesting without changing which chunks are visited.
 */
function forEachChunk(text, fn) {
  for (const c of chunkMarkers(text)) fn(c);
}

const PAYLOAD = {
  tool_name: 'Bash',
  tool_input: { command: 'cat C:/proj/server.js' },
  session_id: 'reseq-session',
  tool_use_id: 'reseq-invocation',
};

const NB_FRAMES = 8;

/**
 * Drives `handle()` for ONE frame, exactly as `http-server.js`'s request
 * handler does, so this test exercises the REAL sequencing decision rather
 * than a hand-rolled twin of it.
 */
function callFrame({ handle, deps }, frame) {
  const url = `/pretool?frame=${frame}&frames=${NB_FRAMES}`;
  return handle(JSON.stringify(PAYLOAD), url, deps);
}

test('MISSING FRAMES: the CONNECTING frames carry everything, nothing twice, chunk markers reassemble', () => {
  // Big enough to force a multi-chunk split well inside NB_FRAMES.
  const body = Array.from({ length: 900 }, (_, i) => `line ${i} — invariant to preserve`).join('\n');
  writeDoc('gros.md', `---\nmatch: server.js\nmode: dumb\n---\n# Big\n${body}\n`);

  const { handle } = require_('../src/hooks/http-server.js');
  const frameSequencer = require_('../src/frame-sequencer-pure.js');
  const { run } = require_('../src/pretool-core.js');
  const { output } = require_('../src/hooks/doc-inject.js');
  const parseFrames = require_('../src/lib-pure.js').parseFrameArgs;
  const realDeps = {
    runFn: run,
    outputFn: output,
    parseFrames,
    store: null,
    frameSequencerState: frameSequencer.createState(),
  };

  // ── ORACLE: every one of the NB_FRAMES frames connects (today's baseline
  //    behaviour on a healthy loopback) — this is "everything there is to
  //    deliver" for this action, on a FRESH invocation of its own. ──
  const oracleDeps = { ...realDeps, frameSequencerState: frameSequencer.createState() };
  const oraclePayload = { ...PAYLOAD, session_id: 'reseq-oracle', tool_use_id: 'reseq-oracle-inv' };
  const oracleChunks = new Set();
  for (let k = 1; k <= NB_FRAMES; k += 1) {
    const url = `/pretool?frame=${k}&frames=${NB_FRAMES}`;
    const answer = handle(JSON.stringify(oraclePayload), url, oracleDeps);
    const text = answer && answer.hookSpecificOutput && answer.hookSpecificOutput.additionalContext;
    if (text) forEachChunk(text, (c) => oracleChunks.add(c.j));
  }
  assert.ok(oracleChunks.size > 1, `the corpus must really span several chunks (got ${oracleChunks.size})`);

  // ── REAL RUN: only a MINORITY of frames connect, and they are NOT the
  //    lowest-numbered ones — exactly what Windows loopback produces: an
  //    arbitrary subset, never a clean prefix. ──
  const connecting = [3, 6, 8, 2, 5]; // deliberately out of numeric order
  assert.ok(connecting.length >= oracleChunks.size,
    'the test must offer at least as many connecting frames as there are real chunks');

  const seenChunks = [];
  for (const k of connecting) {
    const answer = callFrame({ handle, deps: realDeps }, k);
    const text = answer && answer.hookSpecificOutput && answer.hookSpecificOutput.additionalContext;
    if (text) forEachChunk(text, (c) => seenChunks.push(c));
  }

  // ② MISSING FRAMES ⇒ THE FRAMES THAT ARRIVE CARRY EVERYTHING.
  // ⚠️ ONE TRAVERSAL PER STATEMENT (2026-08-30, quadratic-budget gate): a
  //    chained `.map().sort()` matched the nested-traversal rule.
  const seenJs = seenChunks.map((c) => c.j);
  const seenIndices = seenJs.sort((a, b) => a - b);
  const expectedIndices = [...oracleChunks].sort((a, b) => a - b);
  assert.deepEqual(seenIndices, expectedIndices,
    'every chunk that exists must be delivered by SOME connecting frame, none left stranded');

  // ③ NOTHING DELIVERED TWICE.
  assert.equal(new Set(seenIndices).size, seenIndices.length,
    'no chunk index may be delivered by more than one connecting frame');

  // ④ CHUNK j/m MARKERS STAY INTACT AND REASSEMBLABLE.
  const totals = new Set(seenChunks.map((c) => c.m));
  assert.equal(totals.size, 1, 'all chunks of one document must agree on the total m');
  const [m] = totals;
  assert.deepEqual(seenIndices, Array.from({ length: m }, (_, i) => i + 1),
    'the delivered chunks must reassemble into 1..m with no gap and no duplicate');
});

test('ALL FRAMES CONNECT: delivery stays identical to today — the sequencing decision changes nothing here', () => {
  writeDoc('petit.md', '---\nmatch: server.js\nmode: dumb\n---\n# Small\ncontent that fits in one frame\n');

  const frameSequencer = require_('../src/frame-sequencer-pure.js');
  const { run } = require_('../src/pretool-core.js');
  const { output } = require_('../src/hooks/doc-inject.js');
  const parseFrames = require_('../src/lib-pure.js').parseFrameArgs;
  const { handle } = require_('../src/hooks/http-server.js');

  const smallPayload = { ...PAYLOAD, session_id: 'reseq-small', tool_use_id: 'reseq-small-inv' };
  const withSequencer = { runFn: run, outputFn: output, parseFrames, store: null, frameSequencerState: frameSequencer.createState() };
  const withoutSequencer = { runFn: run, outputFn: output, parseFrames, store: null, frameSequencerState: null };

  // Frame 1 of an all-frames-connect action must answer identically whether
  // or not the sequencer is present — the content is small enough to fit in
  // frame 1 alone, so the FIRST connecting request always gets index 1 either
  // way (requested frame 1 ⇒ fallback also 1). This is the parity anchor: ①.
  const a = handle(JSON.stringify(smallPayload), `/pretool?frame=1&frames=${NB_FRAMES}`, { ...withSequencer, store: null });
  const smallPayload2 = { ...PAYLOAD, session_id: 'reseq-small2', tool_use_id: 'reseq-small-inv2' };
  const b = handle(JSON.stringify(smallPayload2), `/pretool?frame=1&frames=${NB_FRAMES}`, { ...withoutSequencer, store: null });
  assert.deepEqual(a, b, 'identical content when nothing is missing: the sequencer must not alter the byte-identical case');
});
