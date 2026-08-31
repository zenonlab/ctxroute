// ═══════════════════════════════════════════════════════════════════════
// http-carryover.test.js — DOES CONTENT SURVIVE TO THE NEXT ACTION?
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 THE DEFECT, PROVEN 2026-08-30 AND STILL OPEN WHEN THIS FILE WAS
//    WRITTEN. `frame-sequencer-pure.js` (2026-08-28) made the frames that
//    ARRIVE carry the next undelivered chunk — so nothing is stranded on a
//    frame that never shows up, AS LONG AS enough frames connect. When
//    FEWER frames connect than the plan has chunks, the leftover chunks are
//    neither delivered nor queued: `emission-core.emit` persists only what
//    overflows the LAST frame of the plan, never what was promised to a
//    frame that stayed silent. The document is nonetheless recorded
//    delivered (`doc-seen-`), so no later action re-decides it. The content
//    is LOST, in silence, for ever.
//
// 🎯 THE TARGET, one binary line: content that never went out on action N
//    MUST come back on a later action. Not "is not counted lost" — comes
//    back.
//
// ⚠️ THE CORPUS IS `mode: once` ON PURPOSE. With `dumb` the next action
//    re-decides the document from scratch and the content reappears for a
//    reason that has NOTHING to do with the transport — a green that proves
//    nothing. `once` removes that road: only the queue can bring it back.
//
// 🛑 THE VERDICT IS ON THE CONTENT, NEVER ON CHUNK NUMBERS. What survives an
//    action is re-split together with the rest of the queue, so `CHUNK j/m`
//    is renumbered BY CONSTRUCTION — an oracle comparing indices across
//    actions measures the numbering, not the delivery. Written after making
//    exactly that mistake here: the first version of this cell was red for a
//    reason that had nothing to do with the defect.
//
// ⚠️ DRIVES `handle()` DIRECTLY, like `http-frame-resequencing.test.js`: the
//    socket itself is proven by `http-lane-differential.test.js`. What is
//    proven here is the SURVIVAL of content ACROSS actions, the one question
//    no existing suite asked (`frame-sequencer` proves the present action,
//    the differentials compare complete outputs, `scale-bench` measures
//    connections and time).
// ═══════════════════════════════════════════════════════════════════════

import { test, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-carryover-'));
const DOCS = path.join(TMP, 'docs');
const CONFIG = path.join(TMP, 'config.json');
const STATE = path.join(TMP, 'state');

// ⚠️ Built from a char code, never written as an escape: this file has
//    already been mangled once by a tool that ate its backslashes.
const NL = String.fromCharCode(10);

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

const NB_FRAMES = 8;
const SESSION = 'carryover-session';
const ALL_FRAMES = [1, 2, 3, 4, 5, 6, 7, 8];

/** One action: drives `connecting` frames of ONE invocation, returns their texts. */
function runAction(handle, deps, invocationId, connecting) {
  const payload = {
    tool_name: 'Bash',
    tool_input: { command: 'cat C:/proj/server.js' },
    session_id: SESSION,
    tool_use_id: invocationId,
  };
  const got = [];
  for (const k of connecting) {
    const answer = handle(JSON.stringify(payload), `/pretool?frame=${k}&frames=${NB_FRAMES}`, deps);
    const text = answer && answer.hookSpecificOutput && answer.hookSpecificOutput.additionalContext;
    if (text) got.push(text);
  }
  return got;
}

/** The engine and shells, wired exactly as the daemon wires them. */
function freshDeps() {
  const frameSequencer = require_('../src/frame-sequencer-pure.js');
  const carryover = require_('../src/carryover-pure.js');
  const { run } = require_('../src/pretool-core.js');
  const { output } = require_('../src/hooks/doc-inject.js');
  const parseFrames = require_('../src/lib-pure.js').parseFrameArgs;
  return {
    runFn: run,
    outputFn: output,
    parseFrames,
    store: null,
    frameSequencerState: frameSequencer.createState(),
    carryoverState: carryover.createState(),
  };
}

/** Writes a `once` document of `count` distinct, individually checkable lines. */
function writeBigDoc(count) {
  const lines = Array.from({ length: count }, (_, i) => `line ${i} — invariant to preserve`);
  const head = ['---', 'match: server.js', 'mode: once', '---', '# Big'];
  fs.writeFileSync(path.join(DOCS, 'gros.md'), head.concat(lines).join(NL) + NL);
  return lines;
}

test('CONTENT LEFT BEHIND BY A SILENT FRAME COMES BACK AT A LATER ACTION', () => {
  const lines = writeBigDoc(2400);
  const { handle } = require_('../src/hooks/http-server.js');
  const deps = freshDeps();

  const delivered = new Set();
  const absorb = (texts) => {
    for (const text of texts) for (const line of text.split(NL)) delivered.add(line.trim());
  };

  // ── ACTION 1: only THREE of the eight declared frames ever connect —
  //    an arbitrary subset, exactly what Windows loopback produces. ──
  absorb(runAction(handle, deps, 'inv-1', [1, 4, 7]));
  // ⚠️ ANTI-VACUITY, BOTH WAYS: action 1 must really deliver something AND
  //    really leave something behind, or this cell measures nothing at all.
  assert.ok(delivered.size > 1, 'action 1 must deliver something');
  const leftBehind = lines.filter((l) => !delivered.has(l)).length;
  assert.ok(leftBehind > 0, 'action 1 must leave content behind, otherwise there is no loss to repair');

  // ── ACTIONS 2..6: every frame connects. `mode: once` means the gate
  //    re-decides NOTHING — only the transport can bring the rest back. ──
  for (const inv of ['inv-2', 'inv-3', 'inv-4', 'inv-5', 'inv-6']) {
    absorb(runAction(handle, deps, inv, ALL_FRAMES));
  }

  const missing = lines.filter((l) => !delivered.has(l));
  assert.deepEqual(missing.slice(0, 5), [],
    `${missing.length} of ${lines.length} lines never delivered by ANY action — a silent, permanent loss`);
});

test('NOTHING IS DELIVERED TWICE: a harvested invocation stops serving', () => {
  // 🛑 THE OTHER HALF OF THE MECHANISM, and it is not optional. When a later
  //    invocation takes over the unserved chunks, a LATE frame of the
  //    harvested one must answer NOTHING — otherwise the same text goes out
  //    twice. Conservation AND uniqueness: this transport owes both, and it
  //    once shipped with only one (an orphan chunk in production).
  const lines = writeBigDoc(2400);
  const { handle } = require_('../src/hooks/http-server.js');
  const deps = freshDeps();

  const counts = new Map();
  const absorb = (texts) => {
    for (const text of texts) {
      for (const line of text.split(NL)) {
        const key = line.trim();
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
  };

  absorb(runAction(handle, deps, 'inv-1', [1, 4, 7]));
  // A NEW invocation decides its plan and harvests inv-1's leftovers…
  absorb(runAction(handle, deps, 'inv-2', ALL_FRAMES));
  // …and only THEN do inv-1's late frames arrive. They must say nothing.
  const late = runAction(handle, deps, 'inv-1', [2, 3, 5, 6, 8]);
  assert.deepEqual(late, [], 'a harvested invocation must serve nothing more');

  const twice = lines.filter((l) => (counts.get(l) || 0) > 1);
  assert.deepEqual(twice.slice(0, 5), [],
    `${twice.length} line(s) delivered more than once — ownership was shared instead of moved`);
});

test('ALL FRAMES CONNECT: the carryover changes nothing — parity anchor', () => {
  // ⚠️ THE CASE THAT MUST STAY BYTE-IDENTICAL. When every declared frame
  //    connects, nothing is ever owed, so `pendingFor` returns an empty list
  //    and `emission.emit` receives `carried: []` — literally the code path
  //    from before this change. A regression here would mean the carryover
  //    fires on the healthy case, i.e. re-delivers what already arrived.
  const head = ['---', 'match: server.js', 'mode: dumb', '---', '# Small', 'content that fits in one frame'];
  fs.writeFileSync(path.join(DOCS, 'petit.md'), head.join(NL) + NL);
  const { handle } = require_('../src/hooks/http-server.js');
  const carryover = require_('../src/carryover-pure.js');

  const withCarryover = freshDeps();
  const without = { ...freshDeps(), carryoverState: null };

  const a = runAction(handle, withCarryover, 'inv-a', ALL_FRAMES);
  const b = runAction(handle, without, 'inv-a', ALL_FRAMES);
  assert.ok(a.length > 0, 'the corpus must really be delivered, or this parity proves nothing');
  assert.deepEqual(a, b, 'with every frame connecting, the carryover must not alter a single byte');

  // ⚠️ ANTI-VACUITY: the table must really have tracked this action, or the
  //    equality above would hold for the trivial reason that nothing ran.
  assert.ok(withCarryover.carryoverState.size > 0, 'the daemon must have tracked this invocation');
  assert.deepEqual(
    carryover.pendingFor(withCarryover.carryoverState, SESSION, 'other'),
    [],
    'an invocation whose frames all connected owes nothing',
  );
});
