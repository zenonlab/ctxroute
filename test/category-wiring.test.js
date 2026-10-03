// ═══════════════════════════════════════════════════════════════════════
// `category` — REAL WIRING, real spawn (not gate.decide() called directly).
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ WHY THIS FILE EXISTS SEPARATELY FROM doc-inject.test.js: it proves the
//    the ONE thing calling `gate.decide()` in a unit test cannot — that
//    `pretool-core.js` actually READS a session's category from the REAL
//    disk store (`session-store.js`, through the SAME `category-` prefix a
//    real Phase-2 writer would use) at decision time, on a REAL spawn of the
//    hook. The critical scenario (operator, 2026-09-22): a skill tagged with
//    its own project category, matching normally on a PATH, must still be
//    EXCLUDED from a session whose declared category does not recoup it.
// ═══════════════════════════════════════════════════════════════════════

import { test, beforeEach, afterAll } from 'vitest';
import assert from 'node:assert';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const HOOK = path.join(__dirname, '..', 'src', 'hooks', 'doc-inject.js');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'category-wiring-test-'));
const DOCS = path.join(TMP, 'docs');
const STATE = path.join(TMP, 'state');
const CONFIG = path.join(TMP, 'config.json');
const SKILLS = path.join(TMP, 'skills');

function runSpawn(payload, env) {
  return new Promise((resolve) => {
    const child = execFile(process.execPath, [HOOK], {
      encoding: 'utf8',
      env: {
        ...process.env,
        CTXROUTE_FILEDOCS_DIR: DOCS,
        CTXROUTE_STATE_DIR: STATE,
        CTXROUTE_CONFIG_PATH: CONFIG,
        CTXROUTE_SKILLS_DIR: SKILLS,
        ...env,
      },
    }, (err, stdout) => resolve({ code: err ? err.code : 0, stdout }));
    child.stdin.end(JSON.stringify(payload));
  });
}

function parseOut(stdout) {
  return stdout.trim() === '' ? null : JSON.parse(stdout);
}

// ⚠️ THE REAL WRITE PATH — the exact same functions a future `ctxroute-policies`
//    command would call: `session-store.saveState('category-', sessionId, …)`
//    shaped by `category-store-pure.withCategories`. `CTXROUTE_STATE_DIR` is
//    read LAZILY by `paths.js` (the condition that makes env-var isolation work
//    at all here), so setting it around this ONE call is enough — never a mock.
function declareSessionCategory(sessionId, categories) {
  const before = process.env.CTXROUTE_STATE_DIR;
  process.env.CTXROUTE_STATE_DIR = STATE;
  try {
    delete require.cache[require.resolve('../src/session-store.js')];
    const sessionStore = require('../src/session-store.js');
    const categoryStore = require('../src/category-store-pure.js');
    sessionStore.saveState('category-', sessionId, categoryStore.withCategories(categories));
  } finally {
    if (before === undefined) delete process.env.CTXROUTE_STATE_DIR; else process.env.CTXROUTE_STATE_DIR = before;
  }
}

beforeEach(() => {
  fs.rmSync(DOCS, { recursive: true, force: true });
  fs.rmSync(STATE, { recursive: true, force: true });
  fs.rmSync(SKILLS, { recursive: true, force: true });
  fs.rmSync(CONFIG, { force: true });
  fs.mkdirSync(DOCS, { recursive: true });
  fs.mkdirSync(SKILLS, { recursive: true });
});

afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

function writeSkillFixture() {
  fs.writeFileSync(path.join(SKILLS, 'projectA.md'),
    '---\ndescription: harness meta\n---\n# Skill projectA\nINVARIANT_PROJECT_A here.\n');
  fs.writeFileSync(CONFIG, JSON.stringify({
    skills: {
      projectA: { match: ['project-a-path'], mode: 'dumb', category: ['project-a'] },
    },
  }));
}

test('CATEGORY WIRING: a real spawn EXCLUDES a categorized skill for a session declared under a DIFFERENT category', async () => {
  writeSkillFixture();
  declareSessionCategory('wire-wrong', ['project-b']);
  const out = parseOut((await runSpawn(
    { tool_name: 'Read', tool_input: { file_path: 'C:/project-a-path/x.js' }, session_id: 'wire-wrong' },
  )).stdout);
  assert.strictEqual(out, null, 'wrong category: the real spawn must inject NOTHING, despite the path trigger firing');
});

test('CATEGORY WIRING: a real spawn INJECTS a categorized skill for a session declared under the MATCHING category', async () => {
  writeSkillFixture();
  declareSessionCategory('wire-right', ['project-a']);
  const out = parseOut((await runSpawn(
    { tool_name: 'Read', tool_input: { file_path: 'C:/project-a-path/x.js' }, session_id: 'wire-right' },
  )).stdout);
  assert.ok(out, 'matching category: the real spawn must inject something');
  assert.ok(out.hookSpecificOutput.additionalContext.includes('INVARIANT_PROJECT_A'));
});

test('CATEGORY WIRING: a real spawn with NO session category declared EXCLUDES a categorized skill', async () => {
  writeSkillFixture();
  // No `declareSessionCategory` call at all — the state file for this scope
  // never existed, exactly a brand-new session.
  const out = parseOut((await runSpawn(
    { tool_name: 'Read', tool_input: { file_path: 'C:/project-a-path/x.js' }, session_id: 'wire-none' },
  )).stdout);
  assert.strictEqual(out, null, 'no session category at all: a categorized doc stays hidden by default');
});

test('CATEGORY WIRING: PARITY — a real spawn on an UNCATEGORIZED skill injects regardless of the session category', async () => {
  fs.writeFileSync(path.join(SKILLS, 'generalist.md'),
    '---\ndescription: harness meta\n---\n# Skill generalist\nINVARIANT_GENERALIST here.\n');
  fs.writeFileSync(CONFIG, JSON.stringify({
    skills: { generalist: { match: ['generalist-path'], mode: 'dumb' } },
  }));
  declareSessionCategory('wire-parity', ['project-b']);
  const out = parseOut((await runSpawn(
    { tool_name: 'Read', tool_input: { file_path: 'C:/generalist-path/x.js' }, session_id: 'wire-parity' },
  )).stdout);
  assert.ok(out, 'PARITY: an uncategorized skill must still inject, whatever the session declared');
  assert.ok(out.hookSpecificOutput.additionalContext.includes('INVARIANT_GENERALIST'));
});

// ── PARENT → SUB-AGENT INHERITANCE (measured, one level — cf pretool-core.js) ──
test('CATEGORY INHERITANCE: a sub-agent with NO category of its own inherits the MASTER\'s (real spawn)', async () => {
  writeSkillFixture();
  // The MASTER declares its category under the BARE session scope (no agent_id).
  declareSessionCategory('inherit-master', ['project-a']);
  // The SUB-AGENT never declared anything of its own — same session_id, a
  // real agent_id, exactly the shape both measured harness contracts send.
  const out = parseOut((await runSpawn(
    { tool_name: 'Read', tool_input: { file_path: 'C:/project-a-path/x.js' }, session_id: 'inherit-master', agent_id: 'sub-1' },
  )).stdout);
  assert.ok(out, 'a sub-agent must inherit its master\'s declared category');
  assert.ok(out.hookSpecificOutput.additionalContext.includes('INVARIANT_PROJECT_A'));
});

test('CATEGORY INHERITANCE: a sub-agent\'s OWN category WINS over the master\'s (never merged, never overridden silently)', async () => {
  writeSkillFixture();
  declareSessionCategory('inherit-own', ['project-b']); // master: wrong category
  declareSessionCategory('inherit-own--agent-sub-2', ['project-a']); // sub-agent's OWN, matching
  const out = parseOut((await runSpawn(
    { tool_name: 'Read', tool_input: { file_path: 'C:/project-a-path/x.js' }, session_id: 'inherit-own', agent_id: 'sub-2' },
  )).stdout);
  assert.ok(out, 'the sub-agent\'s OWN category must be used, not the master\'s mismatching one');
  assert.ok(out.hookSpecificOutput.additionalContext.includes('INVARIANT_PROJECT_A'));
});

test('CATEGORY INHERITANCE: with NEITHER the master NOR the sub-agent declaring a category, the doc stays excluded', async () => {
  writeSkillFixture();
  // Nothing declared anywhere for this session.
  const out = parseOut((await runSpawn(
    { tool_name: 'Read', tool_input: { file_path: 'C:/project-a-path/x.js' }, session_id: 'inherit-none', agent_id: 'sub-3' },
  )).stdout);
  assert.strictEqual(out, null);
});

test('CATEGORY WIRING: the badge announces a category exclusion, distinctly from filterMode (real spawn)', async () => {
  // Two docs matching the SAME gesture: one categorized (excluded), one plain
  // (still injects) — the badge can only be observed on an action that
  // delivers SOMETHING, same shape as the pre-existing `filteredOut` badge.
  fs.writeFileSync(path.join(DOCS, 'plain.md'), '---\nmatch: shared-path\nmode: dumb\n---\n# Plain\nALWAYS_HERE.\n');
  fs.writeFileSync(path.join(SKILLS, 'projectA.md'),
    '---\ndescription: harness meta\n---\n# Skill projectA\nINVARIANT_PROJECT_A here.\n');
  fs.writeFileSync(CONFIG, JSON.stringify({
    skills: { projectA: { match: ['shared-path'], mode: 'dumb', category: ['project-a'] } },
  }));
  declareSessionCategory('wire-badge', ['project-b']);
  const out = parseOut((await runSpawn(
    { tool_name: 'Read', tool_input: { file_path: 'C:/shared-path/x.js' }, session_id: 'wire-badge' },
  )).stdout);
  assert.ok(out, 'the plain doc must still inject');
  assert.ok(out.hookSpecificOutput.additionalContext.includes('ALWAYS_HERE'));
  assert.ok(!out.hookSpecificOutput.additionalContext.includes('INVARIANT_PROJECT_A'), 'the categorized skill must be excluded');
  assert.ok(out.systemMessage.includes('excluded by category'), `badge missing category exclusion: ${out.systemMessage}`);
});
