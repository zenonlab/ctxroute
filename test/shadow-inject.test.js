// ═══════════════════════════════════════════════════════════════════════
// shadow-inject.js — PROOFS by real spawn (fake tmpdir corpus, never the real fleet)
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ THE 2 INVARIANTS OF THE SHADOW, in this order of importance:
//    1. IT NEVER INJECTS (stdout EMPTY, always) — otherwise it is a disguised
//       switch-over, without a GO. It is the most important test of the file.
//    2. It LOGS faithfully (computed docs + non-matches) — otherwise the
//       reconcile analyzes emptiness and the switch-over verdict rests on nothing.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';

const HOOK = path.join(__dirname, '..', 'src', 'hooks', 'shadow-inject.js');

function faussesDocs() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-docs-'));
  fs.writeFileSync(path.join(dir, 'piege.md'), '---\nmatch: file-piege.js\nmode: dumb\nrank: 0\n---\n⚠️ invariant\n');
  return dir;
}

function spawnShadow(stdinText, env) {
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [HOOK],
      { encoding: 'utf8', env: { ...process.env, ...env } },
      (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr })
    );
    child.stdin.end(stdinText);
  });
}

test('THE SHADOW NEVER INJECTS — stdout EMPTY even on a full match', async () => {
  const docs = faussesDocs();
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-state-'));
  const r = await spawnShadow(
    JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: 'C:/x/file-piege.js' } }),
    { CTXROUTE_FILEDOCS_DIR: docs, CTXROUTE_STATE_DIR: state }
  );
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.stdout, '', 'the shadow EMITTED something = disguised switch-over without a GO');
});

test('THE SHADOW LOGS — computed docs written as JSONL, non-match logged too', async () => {
  const docs = faussesDocs();
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-state-'));
  const env = { CTXROUTE_FILEDOCS_DIR: docs, CTXROUTE_STATE_DIR: state };
  await spawnShadow(JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: 'C:/x/file-piege.js' } }), env);
  await spawnShadow(JSON.stringify({ tool_name: 'Read', tool_input: { file_path: 'C:/x/anodin.txt' } }), env);

  const files = fs.readdirSync(state).filter((f) => f.startsWith('shadow-'));
  assert.strictEqual(files.length, 1, 'one log per day');
  const lines = fs.readFileSync(path.join(state, files[0]), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.strictEqual(lines.length, 2, 'the NON-matches must be logged too (divergence "the new one is mute")');
  assert.deepStrictEqual(lines[0].docs, ['docs/piege.md']);
  assert.deepStrictEqual(lines[1].docs, []);
});

test('FAIL-OPEN — garbage stdin, nonexistent corpus: exit 0, empty stdout, zero throw', async () => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-state-'));
  for (const stdin of ['not json', '{}', JSON.stringify({ tool_name: 'Edit', tool_input: {} })]) {
    const r = await spawnShadow(stdin, { CTXROUTE_FILEDOCS_DIR: 'C:/nexiste/pas', CTXROUTE_STATE_DIR: state });
    assert.strictEqual(r.code, 0, `exit ≠ 0 on: ${stdin}`);
    assert.strictEqual(r.stdout, '');
  }
});
