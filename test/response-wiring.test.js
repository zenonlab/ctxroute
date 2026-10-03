// ═══════════════════════════════════════════════════════════════════════
// `response` — REAL WIRING, real spawn of the real shells (not gate.decide() called directly).
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ WHAT ONLY A SPAWN PROVES: that the SHELL reads the moment from the harness's own words
//    (`hook_event_name`, `tool_response`), gives the moment after the answer its OWN invocation,
//    speaks the after-dialect (`PostToolUse`, no decision field) and that the CORE hands the
//    answer to the gate. Each is a place the unit cells cannot see.
// ⚠️ THE PAYLOADS ARE COPIED FROM A REAL HOOK INPUT, measured 2026-09-23 on Claude Code 2.1.280:
//    an MCP tool with structured content reaches PostToolUse with `tool_response` as the STRING
//    '{"state":"posted"}' and an extra `mcp_server` field; the PreToolUse payload of the same call
//    carries the same `tool_use_id`. Never a shape invented for the test.
// ═══════════════════════════════════════════════════════════════════════

import { test, beforeEach, afterAll } from 'vitest';
import assert from 'node:assert';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const HOOKS = path.join(__dirname, '..', 'src', 'hooks');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'response-wiring-test-'));
const FILEDOCS = path.join(TMP, 'docs');
const MCP_DOCS_DIR = path.join(TMP, 'mcp');
const STATE = path.join(TMP, 'state');
const CONFIG = path.join(TMP, 'config.json');
const SKILLS = path.join(TMP, 'skills');

function runSpawn(shell, payload, args) {
  return new Promise((resolve) => {
    const child = execFile(process.execPath, [path.join(HOOKS, shell)].concat(args || []), {
      encoding: 'utf8',
      env: {
        ...process.env,
        CTXROUTE_FILEDOCS_DIR: FILEDOCS,
        CTXROUTE_DOCS_DIR: MCP_DOCS_DIR,
        CTXROUTE_STATE_DIR: STATE,
        CTXROUTE_CONFIG_PATH: CONFIG,
        CTXROUTE_SKILLS_DIR: SKILLS,
      },
    }, (err, stdout) => resolve({ code: err ? err.code : 0, stdout }));
    child.stdin.end(JSON.stringify(payload));
  });
}
const parseOut = (stdout) => (stdout.trim() === '' ? null : JSON.parse(stdout));

// The two moments of ONE real call, in the harness's own shape.
const CALL = () => ({
  session_id: 'resp-wire',
  cwd: 'C:/work',
  tool_name: 'mcp__odoo__odoo_call',
  tool_input: { action: 'read', args: { model: 'account.move', id: 42 } },
  tool_use_id: 'toolu_resp_1',
});
const before = () => ({ ...CALL(), hook_event_name: 'PreToolUse' });
const afterWith = (response) => ({ ...CALL(), hook_event_name: 'PostToolUse', tool_response: response, mcp_server: 'odoo' });

beforeEach(() => {
  for (const d of [FILEDOCS, MCP_DOCS_DIR, STATE, SKILLS]) fs.rmSync(d, { recursive: true, force: true });
  fs.rmSync(CONFIG, { force: true });
  for (const d of [FILEDOCS, MCP_DOCS_DIR, SKILLS]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(CONFIG, JSON.stringify({ mode: 'smart' }));
  // One doc that waits for the answer, one that never does — both on the same tool.
  fs.writeFileSync(path.join(FILEDOCS, 'odoo-posted.md'),
    '---\ntool: ["mcp__odoo__odoo_call"]\nresponse: {"scope": ["posted"]}\nmode: dumb\n---\nPOSTED_INVOICE_IS_FROZEN\n');
  fs.writeFileSync(path.join(FILEDOCS, 'odoo-always.md'),
    '---\ntool: ["mcp__odoo__odoo_call"]\nmode: dumb\n---\nODOO_ALWAYS_BEFORE\n');
});

afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

test('RESPONSE WIRING: BEFORE the action, the doc waiting for the answer stays silent and the other one arrives', async () => {
  const out = parseOut((await runSpawn('doc-inject.js', before())).stdout);
  assert.ok(out, 'the plain doc must be delivered before the action');
  const ctx = out.hookSpecificOutput.additionalContext;
  assert.ok(ctx.includes('ODOO_ALWAYS_BEFORE'));
  assert.ok(!ctx.includes('POSTED_INVOICE_IS_FROZEN'), 'a doc waiting for the answer can never be delivered before it exists');
  assert.strictEqual(out.hookSpecificOutput.hookEventName, 'PreToolUse');
});

test('RESPONSE WIRING: AFTER the answer, the doc whose filter the answer satisfies arrives — in the PostToolUse dialect, with no decision', async () => {
  const out = parseOut((await runSpawn('doc-inject.js', afterWith('{"state":"posted"}'))).stdout);
  assert.ok(out, 'the answer says posted: the doc must be delivered after it');
  assert.strictEqual(out.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.ok(!('permissionDecision' in out.hookSpecificOutput), 'no decision field after the action: it already ran');
  const ctx = out.hookSpecificOutput.additionalContext;
  assert.ok(ctx.includes('POSTED_INVOICE_IS_FROZEN'));
  assert.ok(!ctx.includes('ODOO_ALWAYS_BEFORE'), 'a doc decided before the action is never delivered a second time after it');
});

test('RESPONSE WIRING: AFTER an answer the filter refuses, nothing at all is said', async () => {
  const out = parseOut((await runSpawn('doc-inject.js', afterWith('{"state":"draft"}'))).stdout);
  assert.strictEqual(out, null);
});

test('RESPONSE WIRING: the key of a structured answer is never read as its text', async () => {
  // `posted` is a KEY here, never something the answer said.
  const out = parseOut((await runSpawn('doc-inject.js', afterWith('{"posted":false}'))).stdout);
  assert.strictEqual(out, null);
});

test('RESPONSE WIRING: MULTI-FRAME — the moment after the answer never replays the plan decided before the action', async () => {
  // Same `tool_use_id` on both moments, as the harness sends it. Before: a real memoised plan is
  // written for this invocation. After: if the moment reused that key it would replay the BEFORE
  // plan and deliver ODOO_ALWAYS_BEFORE again instead of the posted doc.
  const frame = ['--frame', '1', '--frames', '2'];
  const pre = parseOut((await runSpawn('doc-inject.js', before(), frame)).stdout);
  assert.ok(pre && pre.hookSpecificOutput.additionalContext.includes('ODOO_ALWAYS_BEFORE'));
  const post = parseOut((await runSpawn('doc-inject.js', afterWith('{"state":"posted"}'), frame)).stdout);
  assert.ok(post, 'the moment after the answer must deliver its own plan');
  assert.ok(post.hookSpecificOutput.additionalContext.includes('POSTED_INVOICE_IS_FROZEN'));
  assert.ok(!post.hookSpecificOutput.additionalContext.includes('ODOO_ALWAYS_BEFORE'));
});

test('RESPONSE WIRING: an MCP doc may wait for its server\'s answer', async () => {
  fs.rmSync(path.join(FILEDOCS, 'odoo-posted.md'));
  fs.rmSync(path.join(FILEDOCS, 'odoo-always.md'));
  fs.writeFileSync(path.join(MCP_DOCS_DIR, 'odoo.md'), '---\nresponse: {"scope": ["posted"]}\nmode: dumb\n---\nMCP_ODOO_POSTED\n');
  assert.strictEqual(parseOut((await runSpawn('doc-inject.js', before())).stdout), null, 'the MCP doc waits: silent before the action');
  const out = parseOut((await runSpawn('doc-inject.js', afterWith('{"state":"posted"}'))).stdout);
  assert.ok(out && out.hookSpecificOutput.additionalContext.includes('MCP_ODOO_POSTED'));
});

test('RESPONSE WIRING: CODEX — the same moment, the same after-dialect, through its own shell', async () => {
  const out = parseOut((await runSpawn('codex-doc-inject.js', afterWith('{"state":"posted"}'))).stdout);
  assert.ok(out);
  assert.strictEqual(out.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.ok(out.hookSpecificOutput.additionalContext.includes('POSTED_INVOICE_IS_FROZEN'));
  const pre = parseOut((await runSpawn('codex-doc-inject.js', before())).stdout);
  assert.ok(pre && !pre.hookSpecificOutput.additionalContext.includes('POSTED_INVOICE_IS_FROZEN'));
});
