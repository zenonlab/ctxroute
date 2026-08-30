// ═══════════════════════════════════════════════════════════════════════
// delivery-notice-integration.test.js — the completion/deferral notice,
// driven through the REAL `handle()` shell of `http-server.js`.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 WHAT THIS PROVES, that `delivery-notice-pure.test.js` cannot: the
//    module's own 100 %-mutated suite proves `observe()`/`messageFor()` are
//    individually correct in isolation. This file proves the SHELL wires
//    them correctly — `frame`/`nbFrames` reach `observe()` unmodified,
//    `messageFor()`'s text lands in `answer.systemMessage` joined with ' · ',
//    `showNotification` really gates it, and the notice fires ONCE per
//    action, never once per frame. Same convention as
//    `http-frame-resequencing.test.js`: `handle()` driven directly with the
//    REAL collaborators (`run`, `output`, `parseFrameArgs`) — the transport
//    itself is proven elsewhere (`http-lane-differential.test.js`).
//
// 🛑 EVERY SABOTAGE HERE IS IN-MEMORY, ON THE SHARED `require` CACHE —
//    NEVER a real file (house rule: a sabotage on disk brought down 38
//    parallel tests once). `http-server.js` calls `deliveryNotice.messageFor`
//    and `lib.shouldShowNotification` as PROPERTY ACCESSES at call time
//    (never destructured to a local const), so reassigning the property on
//    the SAME cached module object reaches the real shell. Every sabotage is
//    restored in a `finally`.
// ═══════════════════════════════════════════════════════════════════════

import { test, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-delivery-notice-'));
const DOCS = path.join(TMP, 'docs');
const CONFIG = path.join(TMP, 'config.json');
const STATE = path.join(TMP, 'state');

function writeDoc(rel, text) {
  const full = path.join(DOCS, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, text);
}

let previousEnv = {};
let seq = 0;

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
  writeDoc('trigger.md', '---\nmatch: server.js\nmode: dumb\n---\n# Trigger\nDO NOT touch this.\n');
  seq += 1;
});

afterEach(() => {
  process.env.CTXROUTE_FILEDOCS_DIR = previousEnv.docs;
  process.env.CTXROUTE_STATE_DIR = previousEnv.state;
  process.env.CTXROUTE_CONFIG_PATH = previousEnv.config;
});

function realDeps() {
  const { handle } = require_('../src/hooks/http-server.js');
  const frameSequencer = require_('../src/frame-sequencer-pure.js');
  const deliveryNotice = require_('../src/delivery-notice-pure.js');
  const { run } = require_('../src/pretool-core.js');
  const { output } = require_('../src/hooks/doc-inject.js');
  const parseFrames = require_('../src/lib-pure.js').parseFrameArgs;
  return {
    handle,
    deps: {
      runFn: run,
      outputFn: output,
      parseFrames,
      store: null,
      frameSequencerState: frameSequencer.createState(),
      deliveryNoticeState: deliveryNotice.createState(),
    },
  };
}

function payload() {
  seq += 1;
  return {
    tool_name: 'Bash',
    tool_input: { command: 'cat C:/proj/server.js' },
    session_id: 'delivery-notice-session-' + seq,
    tool_use_id: 'delivery-notice-inv-' + seq,
  };
}

function callFrame(handle, deps, pl, frame, nbFrames) {
  const url = '/pretool?frame=' + frame + '&frames=' + nbFrames;
  return handle(JSON.stringify(pl), url, deps);
}

function systemMessageOf(answer) {
  return answer && typeof answer.systemMessage === 'string' ? answer.systemMessage : '';
}

// ═══════════════════════════════════════════════════════════════════════
// VOLET (1) — COMPLETE: the request receiving the last declared piece
// carries the exact completion text, with the real numbers.
// ═══════════════════════════════════════════════════════════════════════

test('COMPLETE: the LAST of N declared frames carries the completion notice, with the real numbers', () => {
  const { handle, deps } = realDeps();
  const pl = payload();
  const a1 = callFrame(handle, deps, pl, 1, 3);
  const a2 = callFrame(handle, deps, pl, 2, 3);
  const a3 = callFrame(handle, deps, pl, 3, 3);
  assert.equal(systemMessageOf(a1).includes('ctxroute: all'), false, 'frame 1/3 must not announce completion yet');
  assert.equal(systemMessageOf(a2).includes('ctxroute: all'), false, 'frame 2/3 must not announce completion yet');
  assert.ok(
    systemMessageOf(a3).endsWith('ctxroute: all 3 chunk(s) delivered — 3 of 3 declared frames reached the daemon'),
    'frame 3/3 must carry the exact completion text: ' + JSON.stringify(systemMessageOf(a3)),
  );
});

test('SEEN RED (COMPLETE): sabotaging messageFor() to go silent on completion is CAUGHT', () => {
  const deliveryNotice = require_('../src/delivery-notice-pure.js');
  const original = deliveryNotice.messageFor;
  deliveryNotice.messageFor = () => '';
  try {
    const { handle, deps } = realDeps();
    const pl = payload();
    callFrame(handle, deps, pl, 1, 2);
    const last = callFrame(handle, deps, pl, 2, 2);
    assert.throws(
      () => assert.ok(systemMessageOf(last).includes('ctxroute: all'), 'expected the completion text to survive sabotage'),
      /expected the completion text to survive sabotage/,
    );
  } finally {
    deliveryNotice.messageFor = original;
  }
  // RESTORED: the same scenario is healthy again.
  const { handle, deps } = realDeps();
  const pl = payload();
  callFrame(handle, deps, pl, 1, 2);
  const last = callFrame(handle, deps, pl, 2, 2);
  assert.ok(systemMessageOf(last).includes('ctxroute: all'), 'restoration must bring the completion text back');
});

// ═══════════════════════════════════════════════════════════════════════
// VOLET (2) — DEFERRED: an invocation evicted from `delivery-notice-pure`'s
// OWN table before completion is announced with the exact remaining count,
// on whatever later invocation's observation causes the eviction.
// ═══════════════════════════════════════════════════════════════════════

test('DEFERRED: an invocation evicted before completion is announced with the correct remaining count', () => {
  const { handle, deps } = realDeps();
  const deliveryNotice = require_('../src/delivery-notice-pure.js');
  // The real ceiling is 4096 (MAX_INVOCATIONS) -- driving that many real HTTP
  // round trips is not a reasonable test. The table itself is a plain Map,
  // exposed as an injectable dependency exactly like `store` and
  // `frameSequencerState`: pre-seeding it with a synthetic INCOMPLETE record
  // (inserted FIRST, hence the coldest -- LRU discipline) so the very NEXT
  // observation, driven through a REAL request below, evicts it. Only HOW
  // the table reached the cap is synthetic; the eviction/announcement code
  // path itself is exercised end to end, exactly as production runs it.
  const victimId = 'victim-invocation';
  deliveryNotice.observe(deps.deliveryNoticeState, victimId, 1, 5); // declares 5, serves 1 -> owes 4
  for (let i = 0; i < deliveryNotice.MAX_INVOCATIONS - 1; i += 1) {
    deliveryNotice.observe(deps.deliveryNoticeState, 'filler-' + i, 1, 5);
  }
  assert.equal(deps.deliveryNoticeState.size, deliveryNotice.MAX_INVOCATIONS, 'table must sit exactly at the cap before the real request');

  const pl = payload(); // a DIFFERENT invocation, itself incomplete (frame 1 of 4)
  const answer = callFrame(handle, deps, pl, 1, 4);
  assert.ok(
    systemMessageOf(answer).endsWith('ctxroute: 4 chunk(s) deferred to the next action'),
    'the real request that overflows the table must carry the victims exact remaining count: ' + JSON.stringify(systemMessageOf(answer)),
  );
});

test('SEEN RED (DEFERRED): sabotaging messageFor() to go silent on deferral is CAUGHT', () => {
  const deliveryNotice = require_('../src/delivery-notice-pure.js');
  const original = deliveryNotice.messageFor;
  deliveryNotice.messageFor = (n) => (n && n.kind === 'complete' ? original(n) : '');
  try {
    const { handle, deps } = realDeps();
    const victimId = 'victim-invocation-2';
    deliveryNotice.observe(deps.deliveryNoticeState, victimId, 1, 5);
    for (let i = 0; i < deliveryNotice.MAX_INVOCATIONS - 1; i += 1) {
      deliveryNotice.observe(deps.deliveryNoticeState, 'filler2-' + i, 1, 5);
    }
    const pl = payload();
    const answer = callFrame(handle, deps, pl, 1, 4);
    assert.throws(
      () => assert.ok(systemMessageOf(answer).includes('ctxroute: 4 chunk(s) deferred'), 'expected the deferred text to survive sabotage'),
      /expected the deferred text to survive sabotage/,
    );
  } finally {
    deliveryNotice.messageFor = original;
  }
  // RESTORED.
  const { handle, deps } = realDeps();
  const victimId = 'victim-invocation-3';
  deliveryNotice.observe(deps.deliveryNoticeState, victimId, 1, 5);
  for (let i = 0; i < deliveryNotice.MAX_INVOCATIONS - 1; i += 1) {
    deliveryNotice.observe(deps.deliveryNoticeState, 'filler3-' + i, 1, 5);
  }
  const pl = payload();
  const answer = callFrame(handle, deps, pl, 1, 4);
  assert.ok(systemMessageOf(answer).includes('ctxroute: 4 chunk(s) deferred'), 'restoration must bring the deferred text back');
});

// ═══════════════════════════════════════════════════════════════════════
// VOLET (3) — showNotification: false => TOTAL SILENCE on the notice.
// ═══════════════════════════════════════════════════════════════════════

test('showNotification:false silences the completion notice entirely', () => {
  fs.writeFileSync(CONFIG, JSON.stringify({ showNotification: false }));
  const { handle, deps } = realDeps();
  const pl = payload();
  callFrame(handle, deps, pl, 1, 2);
  const last = callFrame(handle, deps, pl, 2, 2);
  assert.equal(systemMessageOf(last).includes('ctxroute:'), false,
    'showNotification:false must be TOTAL silence, badge included: ' + JSON.stringify(systemMessageOf(last)));
});

test('SEEN RED (showNotification): bypassing the gate is CAUGHT', () => {
  const lib = require_('../src/lib-pure.js');
  const original = lib.shouldShowNotification;
  lib.shouldShowNotification = () => true;
  try {
    fs.writeFileSync(CONFIG, JSON.stringify({ showNotification: false }));
    const { handle, deps } = realDeps();
    const pl = payload();
    callFrame(handle, deps, pl, 1, 2);
    const last = callFrame(handle, deps, pl, 2, 2);
    assert.throws(
      () => assert.equal(systemMessageOf(last).includes('ctxroute: all'), false, 'expected silence under showNotification:false'),
      /expected silence under showNotification:false/,
    );
  } finally {
    lib.shouldShowNotification = original;
  }
  // RESTORED.
  fs.writeFileSync(CONFIG, JSON.stringify({ showNotification: false }));
  const { handle, deps } = realDeps();
  const pl = payload();
  callFrame(handle, deps, pl, 1, 2);
  const last = callFrame(handle, deps, pl, 2, 2);
  assert.equal(systemMessageOf(last).includes('ctxroute:'), false, 'restoration must bring back TOTAL silence');
});

// ═══════════════════════════════════════════════════════════════════════
// VOLET (4) — ONCE PER ACTION, never once per frame.
// ═══════════════════════════════════════════════════════════════════════

test('the completion notice fires EXACTLY ONCE per action, never on every frame', () => {
  const { handle, deps } = realDeps();
  const pl = payload();
  const messages = [];
  for (let k = 1; k <= 5; k += 1) messages.push(systemMessageOf(callFrame(handle, deps, pl, k, 5)));
  const carrying = messages.filter((m) => m.includes('ctxroute: all'));
  assert.equal(carrying.length, 1, 'expected exactly ONE frame to carry the notice, got ' + carrying.length + ': ' + JSON.stringify(messages));
  assert.ok(messages[4].includes('ctxroute: all'), 'the ONE frame carrying it must be the LAST one');
});

test('SEEN RED (ONCE PER ACTION): sabotaging observe() to fire on every frame is CAUGHT', () => {
  const deliveryNotice = require_('../src/delivery-notice-pure.js');
  const original = deliveryNotice.observe;
  deliveryNotice.observe = () => ({ kind: 'complete', nbFrames: 5 });
  try {
    const { handle, deps } = realDeps();
    const pl = payload();
    const messages = [];
    for (let k = 1; k <= 5; k += 1) messages.push(systemMessageOf(callFrame(handle, deps, pl, k, 5)));
    const carrying = messages.filter((m) => m.includes('ctxroute: all'));
    assert.throws(
      () => assert.equal(carrying.length, 1, 'expected exactly one frame to carry the notice'),
      /expected exactly one frame to carry the notice/,
    );
  } finally {
    deliveryNotice.observe = original;
  }
  // RESTORED.
  const { handle, deps } = realDeps();
  const pl = payload();
  const messages = [];
  for (let k = 1; k <= 5; k += 1) messages.push(systemMessageOf(callFrame(handle, deps, pl, k, 5)));
  assert.equal(messages.filter((m) => m.includes('ctxroute: all')).length, 1, 'restoration must bring back exactly one notice');
});
