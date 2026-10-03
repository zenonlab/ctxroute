// ═══════════════════════════════════════════════════════════════════════
// http-response-moment.test.js — the DAEMON serves the moment AFTER the tool answered.
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ WHY APART FROM `response-wiring.test.js`: production does not spawn the gate, it POSTs to this
//    daemon, and the daemon keeps tables the spawn lane never has — the frame sequencer, the
//    harvest table, the collection memo — ALL keyed by invocation. The harness sends the SAME
//    `tool_use_id` before the action and after the answer; if this shell reused it, the moment
//    after the answer would be served from the BEFORE invocation's tables and memo.
// ⚠️ Drives the REAL `handle()` with the REAL core and dialect, exactly as the request handler does
//    (same shape as `http-frame-resequencing.test.js`), with real tables shared across calls.
// ═══════════════════════════════════════════════════════════════════════

import { test, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-http-moment-'));
const DOCS = path.join(TMP, 'docs');
const CONFIG = path.join(TMP, 'config.json');
const STATE = path.join(TMP, 'state');

let previousEnv = {};
beforeEach(() => {
  previousEnv = {
    docs: process.env.CTXROUTE_FILEDOCS_DIR,
    state: process.env.CTXROUTE_STATE_DIR,
    config: process.env.CTXROUTE_CONFIG_PATH,
  };
  for (const d of [DOCS, STATE]) fs.rmSync(d, { recursive: true, force: true });
  fs.rmSync(CONFIG, { force: true });
  fs.mkdirSync(DOCS, { recursive: true });
  fs.writeFileSync(CONFIG, JSON.stringify({ mode: 'smart' }));
  fs.writeFileSync(path.join(DOCS, 'odoo-posted.md'),
    '---\ntool: ["mcp__odoo__odoo_call"]\nresponse: {"scope": ["posted"]}\nmode: dumb\n---\nPOSTED_INVOICE_IS_FROZEN\n');
  fs.writeFileSync(path.join(DOCS, 'odoo-always.md'),
    '---\ntool: ["mcp__odoo__odoo_call"]\nmode: dumb\n---\nODOO_ALWAYS_BEFORE\n');
  process.env.CTXROUTE_FILEDOCS_DIR = DOCS;
  process.env.CTXROUTE_STATE_DIR = STATE;
  process.env.CTXROUTE_CONFIG_PATH = CONFIG;
});
afterEach(() => {
  process.env.CTXROUTE_FILEDOCS_DIR = previousEnv.docs;
  process.env.CTXROUTE_STATE_DIR = previousEnv.state;
  process.env.CTXROUTE_CONFIG_PATH = previousEnv.config;
});

// The two moments of ONE real call — the measured Claude Code shapes (2026-09-23).
const CALL = { session_id: 'http-moment', tool_name: 'mcp__odoo__odoo_call', tool_input: { action: 'read', args: { id: 42 } }, tool_use_id: 'toolu_http_1' };
const BEFORE = { ...CALL, hook_event_name: 'PreToolUse' };
const AFTER = { ...CALL, hook_event_name: 'PostToolUse', tool_response: '{"state":"posted"}', mcp_server: 'odoo' };

function realDeps() {
  const { run } = require_('../src/pretool-core.js');
  const { output } = require_('../src/hooks/doc-inject.js');
  return {
    runFn: run,
    outputFn: output,
    parseFrames: require_('../src/lib-pure.js').parseFrameArgs,
    store: null,
    frameSequencerState: require_('../src/frame-sequencer-pure.js').createState(),
    deliveryNoticeState: require_('../src/delivery-notice-pure.js').createState(),
    carryoverState: require_('../src/carryover-pure.js').createState(),
  };
}

test('DAEMON: both moments of one call, same tool_use_id, SHARED tables — each moment serves ITS docs in ITS dialect', () => {
  const { handle } = require_('../src/hooks/http-server.js');
  const deps = realDeps();
  const url = '/pretool?frame=1&frames=2';
  const before = handle(JSON.stringify(BEFORE), url, deps);
  assert.equal(before.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.ok(before.hookSpecificOutput.additionalContext.includes('ODOO_ALWAYS_BEFORE'));
  assert.ok(!before.hookSpecificOutput.additionalContext.includes('POSTED_INVOICE_IS_FROZEN'));

  const after = handle(JSON.stringify(AFTER), url, deps);
  assert.ok(after && after.hookSpecificOutput, 'the moment after the answer must be served, not swallowed as an already-served invocation');
  assert.equal(after.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.ok(!('permissionDecision' in after.hookSpecificOutput));
  assert.ok(after.hookSpecificOutput.additionalContext.includes('POSTED_INVOICE_IS_FROZEN'));
  assert.ok(!after.hookSpecificOutput.additionalContext.includes('ODOO_ALWAYS_BEFORE'), 'never the BEFORE plan replayed');
});

test('DAEMON: an answer the filter refuses is served as SILENCE, never as a PreToolUse envelope', () => {
  const { handle } = require_('../src/hooks/http-server.js');
  const answer = handle(JSON.stringify({ ...AFTER, tool_response: '{"state":"draft"}' }), '/pretool?frame=1&frames=1', realDeps());
  assert.ok(!answer || !answer.hookSpecificOutput, `nothing to deliver after a refused answer, got ${JSON.stringify(answer)}`);
});
