// Integration of the SESSION GATE (real spawn, disposable tmpdir corpus/config —
// NEVER the shipped files, cf paths.js). SessionStart contract of Claude Code.
import { test, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOK = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'src', 'hooks', 'session-inject.js');

function run({ docs = null, config = null, stdin, args = [] } = {}) {
  const base = mkdtempSync(join(tmpdir(), 'session-inject-'));
  const docsDir = join(base, 'session');
  if (docs) {
    mkdirSync(docsDir, { recursive: true });
    for (const [name, text] of Object.entries(docs)) writeFileSync(join(docsDir, name), text);
  }
  const configPath = join(base, 'config.json');
  if (config) writeFileSync(configPath, JSON.stringify(config));
  return spawnSync(process.execPath, [HOOK, ...args], {
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

// ═══ A SUB-AGENT IS A CONTEXT THAT STARTS TOO (2026-10-07) ═══════════════
// Payloads COPIED from a real Claude Code capture (`claude -p --settings` with a recording
// hook, 2026-10-07): SubagentStart carries `agent_id` + `agent_type`; SessionStart neither.
// The wiring passes `--harness claudeCode` (wiring.json), copied here as the real argv.
const HARNESS = ['--harness', 'claudeCode'];
const SUBAGENT = JSON.stringify({ session_id: 's', hook_event_name: 'SubagentStart', agent_id: 'ab83e346e0a931620', agent_type: 'general-purpose' });
const MAIN = JSON.stringify({ session_id: 's', hook_event_name: 'SessionStart', source: 'startup' });
const DOCS = {
  'all.md': 'FOR-EVERYONE',
  'main.md': '---\ncategory: role:main\n---\nMAIN-ONLY',
  'sub.md': '---\ncategory: role:subagent\n---\nSUB-ONLY',
  'gp.md': '---\ncategory: [["role:subagent"], ["-type:Explore"]]\n---\nSUB-NOT-EXPLORE',
};
const contextOf = (r) => JSON.parse(r.stdout).hookSpecificOutput;

test('SubagentStart: the answer is filed under the event RECEIVED, never SessionStart', () => {
  const out = contextOf(run({ docs: { 'a.md': 'A' }, stdin: SUBAGENT, args: HARNESS }));
  expect(out.hookEventName).toBe('SubagentStart');
});

test('the main agent gets its docs and never a sub-agent-only one', () => {
  const ctx = contextOf(run({ docs: DOCS, stdin: MAIN, args: HARNESS })).additionalContext;
  expect(ctx).toContain('FOR-EVERYONE');
  expect(ctx).toContain('MAIN-ONLY');
  expect(ctx).not.toContain('SUB-ONLY');
  expect(ctx).not.toContain('SUB-NOT-EXPLORE');
});

test('a sub-agent gets its docs and never a main-only one; a grouped negative excludes its type', () => {
  const ctx = contextOf(run({ docs: DOCS, stdin: SUBAGENT, args: HARNESS })).additionalContext;
  expect(ctx).toContain('FOR-EVERYONE');
  expect(ctx).toContain('SUB-ONLY');
  expect(ctx).toContain('SUB-NOT-EXPLORE');
  expect(ctx).not.toContain('MAIN-ONLY');
  const explore = JSON.stringify({ ...JSON.parse(SUBAGENT), agent_type: 'Explore' });
  expect(contextOf(run({ docs: DOCS, stdin: explore, args: HARNESS })).additionalContext).not.toContain('SUB-NOT-EXPLORE');
});

test('no --harness = no identity known: an identity-restricted doc reaches NOBODY (fail-closed), the rest still does', () => {
  const ctx = contextOf(run({ docs: DOCS, stdin: MAIN })).additionalContext;
  expect(ctx).toContain('FOR-EVERYONE');
  expect(ctx).not.toContain('MAIN-ONLY');
  expect(ctx).not.toContain('SUB-ONLY');
});

test('defaults.session.category restricts the whole folder; a doc of its own overrides it', () => {
  const config = { enabled: true, defaults: { session: { category: ['role:main'] } } };
  const ctx = contextOf(run({ docs: DOCS, stdin: SUBAGENT, args: HARNESS, config })).additionalContext;
  expect(ctx).not.toContain('FOR-EVERYONE');
  expect(ctx).toContain('SUB-ONLY');
});
