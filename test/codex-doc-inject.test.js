// ═══════════════════════════════════════════════════════════════════════
// Integration tests of codex-doc-inject.js (Codex shell — real spawn).
// ⚠️ NEVER touches the real fleet: corpus/config/state isolated by env vars.
// ⚠️ Does NOT re-test the orchestration (covered by doc-inject.test.js via the
//    shared porte-core) — tests ONLY the Codex dialect: ask
//    degradation, absence of permissionDecision, payload without agent_id.
// ═══════════════════════════════════════════════════════════════════════

import { test, beforeEach, afterAll } from 'vitest';
import assert from 'node:assert';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const HOOK = path.join(__dirname, '..', 'src', 'hooks', 'codex-doc-inject.js');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-porte-test-'));
const DOCS = path.join(TMP, 'docs');
const STATE = path.join(TMP, 'state');
const CONFIG = path.join(TMP, 'config.json');

function writeDoc(rel, text) {
  const full = path.join(DOCS, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, text);
}

function run(payload, { raw, env } = {}) {
  return new Promise((resolve) => {
    const child = execFile(process.execPath, [HOOK], {
      encoding: 'utf8',
      env: {
        ...process.env,
        CTXROUTE_FILEDOCS_DIR: DOCS,
        CTXROUTE_STATE_DIR: STATE,
        CTXROUTE_CONFIG_PATH: CONFIG,
        ...env,
      },
    }, (err, stdout) => resolve({ code: err ? err.code : 0, stdout }));
    child.stdin.end(raw !== undefined ? raw : JSON.stringify(payload));
  });
}

function parseOut(stdout) {
  return stdout.trim() === '' ? null : JSON.parse(stdout);
}

beforeEach(() => {
  fs.rmSync(DOCS, { recursive: true, force: true });
  fs.rmSync(STATE, { recursive: true, force: true });
  fs.rmSync(CONFIG, { force: true });
  fs.mkdirSync(DOCS, { recursive: true });
});

afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

// Realistic Codex payload: native Codex tools (Bash/apply_patch), no agent_id.
test('DIALECT: match on a Codex Bash command → additionalContext WITHOUT permissionDecision', async () => {
  writeDoc('piege.md', '---\nmatch: server.js\nmode: dumb\n---\n# Server trap\nDO NOT touch X.\n');
  const { code, stdout } = await run({ tool_name: 'Bash', tool_input: { command: 'cat C:/proj/server.js' }, session_id: 'cx1', cwd: 'C:/proj' });
  assert.strictEqual(code, 0);
  const out = parseOut(stdout);
  assert.strictEqual(out.hookSpecificOutput.hookEventName, 'PreToolUse');
  // ⚠️ CONTRACT: never a permissionDecision on the Codex side (we inform, we do not decide).
  assert.strictEqual(out.hookSpecificOutput.permissionDecision, undefined);
  assert.strictEqual(out.hookSpecificOutput.additionalContext, '# Server trap\nDO NOT touch X.\n[source: .claude/hooks/docs/piege.md]');
  assert.strictEqual(out.systemMessage, '📄 doc: piege');
});

// ⚠️ ANTI-RETURN of `ask` on the Codex side (05/08/2026). Replaces "DEGRADED ASK": there
//    is nothing left to degrade, `ask` was removed from the framework. This test
//    forbids the Codex shell from reinventing an escalation — prefix included.
test('ANTI-RETURN: apply_patch on a documented doc → BARE context, without a confirmation prefix', async () => {
  writeDoc('piege.md', '---\nmatch: server.js\nmode: dumb\n---\ncontent\n');
  const { stdout } = await run({ tool_name: 'apply_patch', tool_input: { command: '*** Begin Patch\n*** Update File: C:/proj/server.js\n@@\n*** End Patch' }, session_id: 'cx1' });
  const out = parseOut(stdout);
  assert.strictEqual(out.hookSpecificOutput.permissionDecision, undefined);
  assert.ok(out.hookSpecificOutput.additionalContext.includes('content'));
  assert.ok(!/Confirm before/i.test(out.hookSpecificOutput.additionalContext),
    'no confirmation request must remain: 0-human is the load-bearing wall');
});

test('SILENCE: no match → empty stdout, exit 0', async () => {
  writeDoc('piege.md', '---\nmatch: server.js\nmode: dumb\n---\ncontent\n');
  const { code, stdout } = await run({ tool_name: 'Bash', tool_input: { command: 'ls C:/proj/other' }, session_id: 'cx1' });
  assert.strictEqual(code, 0);
  assert.strictEqual(stdout.trim(), '');
});

test('SHARED STATE ASSUMED (no Codex agent_id): smart dedups on the simple session key', async () => {
  writeDoc('piege.md', '---\nmatch: server.js\nmode: smart\n---\ncontent\n');
  const payload = { tool_name: 'Bash', tool_input: { command: 'cat C:/proj/server.js' }, session_id: 'cx-dedup' };
  const r1 = await run(payload);
  assert.ok(parseOut(r1.stdout), 'the 1st call must inject');
  const r2 = await run(payload);
  assert.strictEqual(r2.stdout.trim(), '', 'the 2nd call must keep silent (historical key without an agent)');
  // The store key is the SIMPLE key (no --agent- suffix): scopeId contract without agent_id.
  const files = fs.readdirSync(STATE).filter((f) => f.startsWith('doc-seen-'));
  assert.deepStrictEqual(files, ['doc-seen-cx-dedup.json']);
});

test('FAIL-OPEN: garbage stdin → exit 0, empty stdout', async () => {
  const { code, stdout } = await run(null, { raw: '{pas du json' });
  assert.strictEqual(code, 0);
  assert.strictEqual(stdout.trim(), '');
});

test('enabled: false → total silence even on a match', async () => {
  writeDoc('piege.md', '---\nmatch: server.js\nmode: dumb\n---\ncontent\n');
  fs.writeFileSync(CONFIG, JSON.stringify({ enabled: false }));
  const { stdout } = await run({ tool_name: 'Bash', tool_input: { command: 'cat C:/proj/server.js' }, session_id: 'cx1' });
  assert.strictEqual(stdout.trim(), '');
});

// ── `enforce` (05/08/2026): dialect IDENTICAL to Claude Code ──
// ⚠️ Unlike `ask` (parsed but not supported by Codex, hence DEGRADED),
//    `deny` REALLY exists here: verified in the installed binary 0.144.6 —
//    permissionDecision ×5, permissionDecisionReason ×4, "deny" ×4.
//    That is what makes `enforce` a word of the LANGUAGE and not a Claude trick.
test('CODEX DENY: the tool is refused, the doc goes out in permissionDecisionReason', async () => {
  writeDoc('paiement.md', '---\nmatch: server.js\nmode: once\nenforce: true\n---\nNEVER click a payment button.\n');
  const { code, stdout } = await run({ tool_name: 'Read', tool_input: { file_path: 'C:/proj/server.js' }, session_id: 'cdx-enf1' });
  assert.strictEqual(code, 0);
  const out = JSON.parse(stdout);
  assert.strictEqual(out.hookSpecificOutput.permissionDecision, 'deny');
  assert.ok(out.hookSpecificOutput.permissionDecisionReason.includes('NEVER click'));
  assert.strictEqual(out.hookSpecificOutput.additionalContext, undefined);
});

test('CODEX DENY: the REDONE action passes (alternation identical on both harnesses)', async () => {
  writeDoc('paiement.md', '---\nmatch: server.js\nmode: once\nenforce: true\n---\ncontent\n');
  const payload = { tool_name: 'Read', tool_input: { file_path: 'C:/proj/server.js' }, session_id: 'cdx-enf2' };
  const r1 = await run(payload);
  assert.strictEqual(JSON.parse(r1.stdout).hookSpecificOutput.permissionDecision, 'deny');
  const r2 = await run(payload);
  assert.strictEqual(r2.stdout.trim(), '', '2nd call: silence, the tool executes');
});

test('CODEX NEGATIVE: without enforce, NEVER a permissionDecision (parity 19/07)', async () => {
  writeDoc('normale.md', '---\nmatch: server.js\nmode: once\n---\ncontent\n');
  const { stdout } = await run({ tool_name: 'Read', tool_input: { file_path: 'C:/proj/server.js' }, session_id: 'cdx-enf3' });
  const out = JSON.parse(stdout);
  assert.strictEqual(out.hookSpecificOutput.permissionDecision, undefined);
  assert.ok(out.hookSpecificOutput.additionalContext.includes('content'));
});
