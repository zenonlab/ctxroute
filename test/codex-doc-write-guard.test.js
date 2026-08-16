// ═══════════════════════════════════════════════════════════════════════
// Integration tests of codex-doc-write-guard.js (Codex shell — real spawn).
// ⚠️ Does NOT re-test the validation (covered by doc-write-guard.test.js via the
//    shared guard-core) — tests ONLY the Codex dialect: paths
//    extracted from the apply_patch patch (tool_input.command), multi-file.
// ═══════════════════════════════════════════════════════════════════════

import { test, beforeEach, afterAll } from 'vitest';
import assert from 'node:assert';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const HOOK = path.join(__dirname, '..', 'src', 'hooks', 'codex-doc-write-guard.js');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-guard-test-'));
const FILEDOCS = path.join(TMP, 'filedocs');

function run(payload) {
  return new Promise((resolve) => {
    const child = execFile(process.execPath, [HOOK], {
      encoding: 'utf8',
      env: { ...process.env, CTXROUTE_FILEDOCS_DIR: FILEDOCS },
    }, (err, stdout) => resolve({ code: err ? err.code : 0, stdout }));
    child.stdin.end(JSON.stringify(payload));
  });
}

const patchFor = (...files) => '*** Begin Patch\n' + files.map((f) => `*** Update File: ${f}`).join('\n') + '\n*** End Patch';

beforeEach(() => {
  fs.rmSync(FILEDOCS, { recursive: true, force: true });
  fs.mkdirSync(FILEDOCS, { recursive: true });
});

afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

test('BLOCK: apply_patch (command) on an INVALID doc of the fleet → decision block + reason', async () => {
  const doc = path.join(FILEDOCS, 'cassee.md');
  fs.writeFileSync(doc, '---\nmach: typo.js\n---\ncontenu\n'); // unknown key = invalid
  const { code, stdout } = await run({ tool_name: 'apply_patch', tool_input: { command: patchFor(doc) } });
  assert.strictEqual(code, 0);
  const out = JSON.parse(stdout);
  assert.strictEqual(out.decision, 'block');
  assert.ok(out.reason.includes('cassee.md'));
});

test('SILENCE: HEALTHY doc of the fleet → empty stdout', async () => {
  const doc = path.join(FILEDOCS, 'saine.md');
  fs.writeFileSync(doc, '---\nmatch: server.js\nmode: dumb\n---\ncontenu\n');
  const { code, stdout } = await run({ tool_name: 'apply_patch', tool_input: { command: patchFor(doc) } });
  assert.strictEqual(code, 0);
  assert.strictEqual(stdout.trim(), '');
});

test('MULTI-FILE: patch touching a healthy doc THEN a broken one → block on the broken one', async () => {
  const saine = path.join(FILEDOCS, 'saine.md');
  const cassee = path.join(FILEDOCS, 'cassee.md');
  fs.writeFileSync(saine, '---\nmatch: a.js\nmode: dumb\n---\nok\n');
  fs.writeFileSync(cassee, '---\nmach: typo.js\n---\nko\n');
  const { stdout } = await run({ tool_name: 'apply_patch', tool_input: { command: patchFor(saine, cassee) } });
  const out = JSON.parse(stdout);
  assert.strictEqual(out.decision, 'block');
  assert.ok(out.reason.includes('cassee.md'));
});

test('OUTSIDE THE FLEET: patch on any file → silence (fail-open)', async () => {
  const { code, stdout } = await run({ tool_name: 'apply_patch', tool_input: { command: patchFor('C:/proj/random.js') } });
  assert.strictEqual(code, 0);
  assert.strictEqual(stdout.trim(), '');
});

test('ANOTHER TOOL: Bash → no path extracted, silence', async () => {
  const doc = path.join(FILEDOCS, 'cassee.md');
  fs.writeFileSync(doc, '---\nmach: typo.js\n---\nko\n');
  const { stdout } = await run({ tool_name: 'Bash', tool_input: { command: 'echo ' + doc } });
  assert.strictEqual(stdout.trim(), '');
});
