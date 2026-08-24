// Integration of the SESSION GATE (real spawn, disposable tmpdir corpus/config —
// NEVER the shipped files, cf paths.js). SessionStart contract of Claude Code.
import { test, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOK = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'src', 'hooks', 'session-inject.js');

function run({ docs = null, config = null, stdin } = {}) {
  const base = mkdtempSync(join(tmpdir(), 'session-inject-'));
  const docsDir = join(base, 'session');
  if (docs) {
    mkdirSync(docsDir, { recursive: true });
    for (const [name, text] of Object.entries(docs)) writeFileSync(join(docsDir, name), text);
  }
  const configPath = join(base, 'config.json');
  if (config) writeFileSync(configPath, JSON.stringify(config));
  return spawnSync(process.execPath, [HOOK], {
    input: stdin !== undefined ? stdin : JSON.stringify({ hook_event_name: 'SessionStart', source: 'compact' }),
    encoding: 'utf8',
    env: {
      ...process.env,
      CTXROUTE_SESSIONDOCS_DIR: docsDir,
      CTXROUTE_CONFIG_PATH: configPath,
      CTXROUTE_STATE_DIR: join(base, 'state'),
    },
  });
}

test('injects all the session docs, alphabetical order, SessionStart contract', () => {
  const r = run({ docs: { 'b.md': 'DOC-B', 'a.md': '---\nrank: 1\n---\nDOC-A' } });
  expect(r.status).toBe(0);
  const out = JSON.parse(r.stdout);
  expect(out.hookSpecificOutput.hookEventName).toBe('SessionStart');
  const ctx = out.hookSpecificOutput.additionalContext;
  // Alphabetical order + frontmatter removed + [source:] label per doc.
  expect(ctx).toBe(
    'DOC-A\n[source: docs/session/a.md]\n\n---\n\nDOC-B\n[source: docs/session/b.md]'
  );
});

test('empty folder = total silence (exit 0, no stdout)', () => {
  const r = run({ docs: {} });
  expect(r.status).toBe(0);
  expect(r.stdout).toBe('');
});

test('docs/session folder ABSENT = silent fail-open', () => {
  const r = run({});
  expect(r.status).toBe(0);
  expect(r.stdout).toBe('');
});

test('malformed stdin = silent fail-open', () => {
  const r = run({ docs: { 'a.md': 'A' }, stdin: 'pas du json{{' });
  expect(r.status).toBe(0);
  expect(r.stdout).toBe('');
});

test('enabled: false cuts the session gate like the rest of the framework', () => {
  const r = run({ docs: { 'a.md': 'A' }, config: { enabled: false } });
  expect(r.status).toBe(0);
  expect(r.stdout).toBe('');
});

test('config absent = fail-open defaults: the framework INJECTS', () => {
  const r = run({ docs: { 'a.md': 'A' } });
  expect(r.status).toBe(0);
  expect(JSON.parse(r.stdout).hookSpecificOutput.additionalContext).toContain('A');
});
