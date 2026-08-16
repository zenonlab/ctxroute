// Integration of the WRITE GUARD (real spawn, disposable tmpdir fleet).
// Contract: healthy doc = SILENCE; broken doc = decision block + reason.
import { test, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOK = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'src', 'hooks', 'doc-write-guard.js');

function run(rel, content, { kind = 'file' } = {}) {
  const base = mkdtempSync(join(tmpdir(), 'doc-guard-'));
  const roots = { file: join(base, 'filedocs'), mcp: join(base, 'mcpdocs'), session: join(base, 'sessiondocs') };
  for (const d of Object.values(roots)) mkdirSync(d, { recursive: true });
  const filePath = join(roots[kind], rel);
  if (content !== null) writeFileSync(filePath, content);
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: filePath } }),
    encoding: 'utf8',
    env: {
      ...process.env,
      CTXROUTE_FILEDOCS_DIR: roots.file,
      CTXROUTE_DOCS_DIR: roots.mcp,
      CTXROUTE_SESSIONDOCS_DIR: roots.session,
    },
  });
  return r;
}

test('HEALTHY file doc = total silence (zero context pollution)', () => {
  const r = run('ok.md', '---\nmatch: server.js\nmode: dumb\n---\ncontenu\n');
  expect(r.status).toBe(0);
  expect(r.stdout).toBe('');
});

test('file doc with the typo `mach:` = immediate BLOCK, the reason names the key', () => {
  const r = run('typo.md', '---\nmach: server.js\n---\ncontenu\n');
  expect(r.status).toBe(0);
  const out = JSON.parse(r.stdout);
  expect(out.decision).toBe('block');
  expect(out.reason).toContain('mach');
});

test('file doc WITHOUT a trigger = BLOCK (otherwise a doc that is dead in silence)', () => {
  const r = run('morte.md', '---\nmode: dumb\n---\ncontenu\n');
  expect(JSON.parse(r.stdout).decision).toBe('block');
});

test('MCP doc: `mode: dumb` alone = silence; a key outside mode/threshold = BLOCK', () => {
  expect(run('stripe.md', '---\nmode: dumb\n---\ncontenu\n', { kind: 'mcp' }).stdout).toBe('');
  const r = run('stripe.md', '---\nmatch: x.js\n---\ncontenu\n', { kind: 'mcp' });
  expect(JSON.parse(r.stdout).decision).toBe('block');
  expect(JSON.parse(r.stdout).reason).toContain('match');
});

test('SESSION doc = never blocked (nothing to validate by construction)', () => {
  const r = run('note.md', '---\nnimporte: quoi\n---\ncontenu\n', { kind: 'session' });
  expect(r.status).toBe(0);
  expect(r.stdout).toBe('');
});

test('file outside the 3 fleets, missing file, broken stdin = silent fail-open', () => {
  const base = mkdtempSync(join(tmpdir(), 'doc-guard-out-'));
  writeFileSync(join(base, 'autre.md'), '---\nmach: x\n---\nx');
  const r1 = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_input: { file_path: join(base, 'autre.md') } }),
    encoding: 'utf8',
    env: process.env,
  });
  expect(r1.status).toBe(0);
  // really outside the fleet: the env vars do not point at `base` → silence expected
  const r2 = run('disparu.md', null);
  expect(r2.status).toBe(0);
  expect(r2.stdout).toBe('');
  const r3 = spawnSync(process.execPath, [HOOK], { input: '{pas du json', encoding: 'utf8', env: process.env });
  expect(r3.status).toBe(0);
  expect(r3.stdout).toBe('');
});
