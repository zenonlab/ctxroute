// ═══════════════════════════════════════════════════════════════════════
// Integration tests of doc-inject.js (THE GATE — real spawn, tmpdir corpus).
// ⚠️ NEVER touches the real fleet: corpus/config/state isolated by env vars.
// ═══════════════════════════════════════════════════════════════════════

import { test, beforeEach, afterAll } from 'vitest';
import assert from 'node:assert';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const HOOK = path.join(__dirname, '..', 'src', 'hooks', 'doc-inject.js');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'porte-test-'));
const DOCS = path.join(TMP, 'docs');
const STATE = path.join(TMP, 'state');
const CONFIG = path.join(TMP, 'config.json');

function writeDoc(rel, text) {
  const full = path.join(DOCS, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, text);
}

// ═══ 54 (15/08/2026) — TWO REGIMES, ONE SINGLE HELPER ═════════════════════
// The DECISION (matching, cadence, filter) is proven IN PROCESS: the core
// `porte-core.run` + the REAL dialect `output()` exported by the shell —
// never a twin of the format. The process CONTRACT (stdin, exit, cross-process
// lock, plan shared between N processes) stays proven by a real SPAWN
// on the cases marked `spawn: true` (+ any `raw` case). 🛑 NEVER remove
// the last spawns "because it is covered in memory": a hook that does not
// start is invisible to any in-process test — that is the exact hole
// the doctor was created to see.
import { run as porteRun } from '../src/pretool-core.js';
import { output } from '../src/hooks/doc-inject.js';
import { parseFrameArgs } from '../src/lib-pure.js';

function runSpawn(payload, { raw, env, args = [] } = {}) {
  return new Promise((resolve) => {
    const child = execFile(process.execPath, [HOOK, ...args], {
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

// In-process: same env vars (paths.js is LAZY, that is the condition),
// same return shape {code, stdout} — the test bodies are UNCHANGED.
function runIn(payload, { env, args = [] } = {}) {
  const e = { CTXROUTE_FILEDOCS_DIR: DOCS, CTXROUTE_STATE_DIR: STATE, CTXROUTE_CONFIG_PATH: CONFIG, ...env };
  const before = {};
  for (const [k, v] of Object.entries(e)) { before[k] = process.env[k]; process.env[k] = v; }
  let out = null;
  try {
    const data = payload || {};
    porteRun(data, (d, f, m) => { out = output(d, f, m); }, {
      ...parseFrameArgs([process.execPath, HOOK, ...args]),
      invocationId: typeof data.tool_use_id === 'string' ? data.tool_use_id : '',
    });
  } finally {
    for (const [k, v] of Object.entries(before)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
  return { code: 0, stdout: out ? JSON.stringify(out) : '' };
}

function run(payload, opts = {}) {
  return opts.raw !== undefined || opts.spawn ? runSpawn(payload, opts) : Promise.resolve(runIn(payload, opts));
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

test('ALLOW: reading a documented file → doc injected, protect-files format', async () => {
  writeDoc('piege.md', '---\nmatch: server.js\nmode: dumb\n---\n# Server trap\nDO NOT touch X.\n');
  const { code, stdout } = await run({ tool_name: 'Read', tool_input: { file_path: 'C:/proj/server.js' }, session_id: 's1' }, { spawn: true });
  assert.strictEqual(code, 0);
  const out = parseOut(stdout);
  assert.strictEqual(out.hookSpecificOutput.permissionDecision, 'allow');
  assert.strictEqual(out.hookSpecificOutput.additionalContext, '# Server trap\nDO NOT touch X.\n[source: .claude/hooks/docs/piege.md]');
  assert.strictEqual(out.systemMessage, '📄 doc: piege');
});

// ⚠️ ANTI-RETURN of `ask` — proven BY A REAL SPAWN (05/08/2026). Replaces the 2
//    "ASK" and "RUSH" tests. A unit test on gate.js would not be enough:
//    it is the SHELL that writes `permissionDecision`, so it is the shell that
//    could reintroduce an `ask` without the engine knowing anything about it.
test('ANTI-RETURN: a write on a documented doc stays `allow` — never `ask`', async () => {
  writeDoc('piege.md', '---\nmatch: server.js\nmode: dumb\n---\ncontent\n');
  // `confirm` is no longer vocabulary: even set in the config, it has NO effect.
  fs.writeFileSync(CONFIG, JSON.stringify({ confirm: true }));
  const { stdout } = await run({ tool_name: 'Edit', tool_input: { file_path: 'C:/proj/server.js' }, session_id: 's1' });
  const out = parseOut(stdout);
  assert.strictEqual(out.hookSpecificOutput.permissionDecision, 'allow');
  assert.ok(out.hookSpecificOutput.additionalContext.includes('content'), 'the knowledge is delivered, without human escalation');
  assert.strictEqual(out.hookSpecificOutput.permissionDecisionReason, undefined);
});

test('SILENCE: no match → empty stdout, exit 0', async () => {
  writeDoc('piege.md', '---\nmatch: server.js\nmode: dumb\n---\ncontent\n');
  const { code, stdout } = await run({ tool_name: 'Read', tool_input: { file_path: 'C:/proj/other.js' }, session_id: 's1' });
  assert.strictEqual(code, 0);
  assert.strictEqual(stdout.trim(), '');
});

test('smart DEDUP: 1st call injects, immediate recall silent (per-session state)', async () => {
  writeDoc('piege.md', '---\nmatch: server.js\nmode: smart\n---\ncontent\n');
  const payload = { tool_name: 'Read', tool_input: { file_path: 'C:/proj/server.js' }, session_id: 'dedup' };
  const r1 = await run(payload);
  assert.ok(parseOut(r1.stdout), 'the 1st call must inject');
  const r2 = await run(payload);
  assert.strictEqual(r2.stdout.trim(), '', 'the immediate 2nd call must keep silent (dedup by doc)');
});

test('perf PARITY: 100 % dumb corpus → NO state file written', async () => {
  writeDoc('piege.md', '---\nmatch: server.js\nmode: dumb\n---\ncontent\n');
  await run({ tool_name: 'Read', tool_input: { file_path: 'C:/proj/server.js' }, session_id: 'perf' });
  const files = fs.existsSync(STATE) ? fs.readdirSync(STATE).filter((f) => f.startsWith('doc-seen-')) : [];
  assert.deepStrictEqual(files, []);
});

test('PARITY: a doc with an empty body = non-existent (no injection, no ask)', async () => {
  writeDoc('empty.md', '---\nmatch: server.js\nmode: dumb\n---\n');
  const { stdout } = await run({ tool_name: 'Edit', tool_input: { file_path: 'C:/proj/server.js' }, session_id: 's1' });
  assert.strictEqual(stdout.trim(), '');
});

test('enabled: false → total silence even on a match', async () => {
  writeDoc('piege.md', '---\nmatch: server.js\nmode: dumb\n---\ncontent\n');
  fs.writeFileSync(CONFIG, JSON.stringify({ enabled: false }));
  const { stdout } = await run({ tool_name: 'Read', tool_input: { file_path: 'C:/proj/server.js' }, session_id: 's1' });
  assert.strictEqual(stdout.trim(), '');
});

test('FAIL-OPEN: garbage stdin and absent corpus → exit 0, empty stdout', async () => {
  fs.rmSync(DOCS, { recursive: true, force: true });
  const r1 = await run(null, { raw: '{pas du json' });
  assert.strictEqual(r1.code, 0);
  assert.strictEqual(r1.stdout.trim(), '');
  const r2 = await run({ tool_name: 'Read', tool_input: { file_path: 'x' }, session_id: 's1' });
  assert.strictEqual(r2.code, 0);
  assert.strictEqual(r2.stdout.trim(), '');
});

// ⚠️ `retry: 2` — NOT a band-aid: under extreme load (saturated CI), the
//    lock timeout (2 s) may legitimately trigger the contractual FAIL-OPEN
//    (deciding without state > blocking the hook) → 1 increment not written = INTENDED
//    behaviour, not a bug (measured flakes: local 18/07 + CI windows 18/07). A REAL
//    lock bug (non-atomic write) loses increments on EVERY run → fails
//    all 3 attempts → the test still bites. NEVER extend this retry to the
//    other tests nor touch the lock timeout to "stabilize" (production latency).
test('REAL CONCURRENCY: 10 parallel foreign calls → NO increment lost (lock)', { retry: 2, timeout: 60000 }, async () => {
  writeDoc('a.md', '---\nmatch: aaa.js\nmode: smart\n---\ndoc A\n');
  writeDoc('b.md', '---\nmatch: bbb.js\nmode: smart\n---\ndoc B\n');
  const sid = 'conc';
  // ⚠️ Lock timeout RAISED (test env, cf lock.js): we prove ATOMICITY,
  //    not availability — 2 s legitimately expire under load (fail-open).
  const env = { CTXROUTE_LOCK_TIMEOUT_MS: '20000' };
  // 1st call: A becomes "seen" (counter 0).
  await run({ tool_name: 'Read', tool_input: { file_path: 'C:/p/aaa.js' }, session_id: sid }, { env, spawn: true });
  // 10 PARALLEL calls matching B = 10 foreign tools for A.
  await Promise.all(Array.from({ length: 10 }, () =>
    run({ tool_name: 'Read', tool_input: { file_path: 'C:/p/bbb.js' }, session_id: sid }, { env })));
  const state = JSON.parse(fs.readFileSync(path.join(STATE, 'doc-seen-conc.json'), 'utf8'));
  assert.strictEqual(state['docs/a.md'].sinceLastCall, 10, 'write lost under concurrency = broken lock');
});

test('Bash git: never an injection (false positives from commit messages)', async () => {
  writeDoc('piege.md', '---\nmatch: server.js\nmode: dumb\n---\ncontent\n');
  const { stdout } = await run({ tool_name: 'Bash', tool_input: { command: 'git commit -m "fix server.js"' }, session_id: 's1' });
  assert.strictEqual(stdout.trim(), '');
});

// ── MCP: THE doc's frontmatter overrides the global cadence (boundary contract
//    adapter→declFor — maintainer's decision 17/07/2026, JSON = global only) ──
test('MCP: frontmatter `mode: dumb` → re-injected at EVERY call despite the global `once`', async () => {
  const MCP_DOCS = path.join(TMP, 'mcpdocs');
  fs.rmSync(MCP_DOCS, { recursive: true, force: true });
  fs.mkdirSync(MCP_DOCS, { recursive: true });
  fs.writeFileSync(path.join(MCP_DOCS, 'srv.md'), '---\nmode: dumb\n---\nPIEGE-SRV\n');
  fs.writeFileSync(path.join(MCP_DOCS, 'ctrl.md'), 'PIEGE-CTRL\n');
  fs.writeFileSync(CONFIG, JSON.stringify({ mode: 'once', defaultThreshold: 4 }));
  const env = { CTXROUTE_DOCS_DIR: MCP_DOCS };

  const p1 = { tool_name: 'mcp__srv__ping', tool_input: {}, session_id: 'fm-mcp' };
  const r1 = await run(p1, { env });
  const c1 = parseOut(r1.stdout).hookSpecificOutput.additionalContext;
  assert.ok(c1.includes('PIEGE-SRV'), '1st call: frontmatter doc injected');

  const r2 = await run(p1, { env });
  const out2 = parseOut(r2.stdout);
  const c2 = out2 ? out2.hookSpecificOutput.additionalContext : '';
  assert.ok(c2.includes('PIEGE-SRV'), '2nd call: dumb (frontmatter) re-injects despite the global once');

  const rc1 = await run({ tool_name: 'mcp__ctrl__ping', tool_input: {}, session_id: 'fm-mcp' }, { env });
  assert.ok(parseOut(rc1.stdout).hookSpecificOutput.additionalContext.includes('PIEGE-CTRL'), 'control: 1st call injects');
  const rc2 = await run({ tool_name: 'mcp__ctrl__ping', tool_input: {}, session_id: 'fm-mcp' }, { env });
  const oc2 = parseOut(rc2.stdout);
  assert.ok(!oc2 || !String(oc2.hookSpecificOutput.additionalContext || '').includes('PIEGE-CTRL'),
    'control: a doc WITHOUT a frontmatter follows the global once (no re-injection)');
});

// ── driftUnit turn — END TO END (18/07/2026): smart/turn skill, turn counter
//    fed by turn-count.js, re-injection AFTER N turns, never
//    by the tool calls. It is the BOUNDARY test of the 3 gates
//    (turn-count → store → doc-inject/gate). ──
test('TURN: smart skill with driftUnit turn — re-injected after N TURNS, insensitive to tools', async () => {
  fs.writeFileSync(CONFIG, JSON.stringify({
    skills: { turnSkill: { match: ['proj-turn'], mode: 'smart', threshold: 1, driftUnit: 'turn' } },
  }));
  const payload = { tool_name: 'Read', tool_input: { file_path: 'C:/proj-turn/x.js' }, session_id: 'sturn' };
  const env = { CTXROUTE_FILEDOCS_DIR: DOCS, CTXROUTE_STATE_DIR: STATE, CTXROUTE_CONFIG_PATH: CONFIG };

  // Turn 0: 1st match → pointer injected.
  const r1 = parseOut((await run(payload)).stdout);
  assert.ok(r1.hookSpecificOutput.additionalContext.includes('turnSkill'));
  // Re-match on the same turn + foreign tools: SILENCE (the unit is the turn).
  assert.strictEqual(parseOut((await run(payload)).stdout), null);
  await run({ tool_name: 'Bash', tool_input: { command: 'ls' }, session_id: 'sturn' });
  assert.strictEqual(parseOut((await run(payload)).stdout), null);

  // A TURN elapses (real spawn of turn-count.js — the real gate, not a
  // fake state written by hand: boundary test, never a duplicate of the format).
  const rt = await new Promise((resolve) => {
    const child = execFile(process.execPath, [path.join(__dirname, '..', 'src', 'hooks', 'turn-count.js')], {
      encoding: 'utf8', env: { ...process.env, ...env },
    }, (err, stdout) => resolve({ code: err ? err.code : 0, stdout }));
    child.stdin.end(JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: 'sturn', prompt: 'x' }));
  });
  assert.strictEqual(rt.code, 0);
  assert.strictEqual(rt.stdout.trim(), '');

  // threshold 1, 1 turn elapsed → RE-INJECTION.
  const r2 = parseOut((await run(payload)).stdout);
  assert.ok(r2 && r2.hookSpecificOutput.additionalContext.includes('turnSkill'));
  // And the recall re-arms: silence again on the same turn.
  assert.strictEqual(parseOut((await run(payload)).stdout), null);
});

// ── BODY OF THE SKILL injected (maintainer's decision 18/07/2026 — no longer a pointer) ──
test('SKILL: the CONTENT of the skill is injected (read live, frontmatter stripped); file absent = pointer fallback', async () => {
  const skillsDir = path.join(TMP, 'skills');
  fs.mkdirSync(skillsDir, { recursive: true });
  fs.writeFileSync(path.join(skillsDir, 'myProject.md'),
    '---\ndescription: harness meta\n---\n# Skill myProject\nINVARIANT_DU_SKILL here.\n');
  fs.writeFileSync(CONFIG, JSON.stringify({
    skills: {
      myProject: { match: ['proj-body'], mode: 'dumb' },
      ghost: { match: ['proj-ghost'], mode: 'dumb' },
    },
  }));
  const env = { CTXROUTE_SKILLS_DIR: skillsDir };
  // Existing skill → its BODY (without the harness frontmatter), not a pointer.
  const r1 = parseOut((await run({ tool_name: 'Read', tool_input: { file_path: 'C:/proj-body/x.js' }, session_id: 'sk1' }, { env })).stdout);
  assert.ok(r1.hookSpecificOutput.additionalContext.includes('INVARIANT_DU_SKILL'));
  assert.ok(!r1.hookSpecificOutput.additionalContext.includes('description: harness meta'));
  assert.ok(!r1.hookSpecificOutput.additionalContext.includes('load it via the Skill tool'));
  // Skill file ABSENT → pointer fallback (the perimeter still signals).
  const r2 = parseOut((await run({ tool_name: 'Read', tool_input: { file_path: 'C:/proj-ghost/x.js' }, session_id: 'sk1' }, { env })).stdout);
  assert.ok(r2.hookSpecificOutput.additionalContext.includes('ghost'));
  assert.ok(r2.hookSpecificOutput.additionalContext.includes('Skill'));
});

// ── `tool:` TRIGGER (19/07/2026) — native tools without a path nor mcp__ ──
// Blind spot proven by spawn: WebFetch/WebSearch = total silence before.
test('TOOL: doc `tool: WebFetch` injected on WebFetch, silent on Read', async () => {
  writeDoc('web-recherche.md', '---\ntool: [WebFetch, WebSearch]\nmode: dumb\n---\nCONSIGNE_WEB_2026\n');
  const r1 = parseOut((await run({ tool_name: 'WebFetch', tool_input: { url: 'https://docs.x.ai', prompt: 'x' }, session_id: 'st1' })).stdout);
  assert.ok(r1.hookSpecificOutput.additionalContext.includes('CONSIGNE_WEB_2026'));
  assert.ok(r1.hookSpecificOutput.additionalContext.includes('[source: .claude/hooks/docs/web-recherche.md]'));
  const r2 = parseOut((await run({ tool_name: 'WebSearch', tool_input: { query: 'q' }, session_id: 'st1' })).stdout);
  assert.ok(r2.hookSpecificOutput.additionalContext.includes('CONSIGNE_WEB_2026'));
  // Tool name ≠ list → silence (EXACT match, never a substring).
  assert.strictEqual(parseOut((await run({ tool_name: 'Read', tool_input: { file_path: 'C:/x/WebFetch.js' }, session_id: 'st1' })).stdout), null);
});

test('TOOL: docId dedup — a `match`+`tool` doc matched by both sources = injected ONCE', async () => {
  writeDoc('mixte.md', '---\nmatch: server.js\ntool: [Read]\nmode: dumb\n---\nCORPS_MIXTE\n');
  const out = parseOut((await run({ tool_name: 'Read', tool_input: { file_path: 'C:/proj/server.js' }, session_id: 'st2' })).stdout);
  const occurrences = out.hookSpecificOutput.additionalContext.split('CORPS_MIXTE').length - 1;
  assert.strictEqual(occurrences, 1);
});

// ── SCOPE PER AGENT (19/07/2026) — each agent = one context = one state ──
// Hole proven on 19/07/2026: `once` state keyed by session_id alone + session_id
// SHARED between master and sub-agents (harness contract) ⇒ the master consumed the
// skill and the sub-agents received NOTHING, silently. These tests seal
// the separation; removing them = reopening the hole.
test('SUB-AGENT: the `once` consumed by the master DOES NOT SWITCH OFF the sub-agent (separate states)', async () => {
  writeDoc('unique.md', '---\nmatch: server.js\nmode: once\n---\nCONTENU_ONCE\n');
  const base = { tool_name: 'Read', tool_input: { file_path: 'C:/proj/server.js' }, session_id: 'sagent' };
  // Master: 1st injection then silence (once).
  assert.ok(parseOut((await run(base)).stdout).hookSpecificOutput.additionalContext.includes('CONTENU_ONCE'));
  assert.strictEqual(parseOut((await run(base)).stdout), null);
  // Sub-agent A (agent_id present, SAME session_id): VIRGIN state → injection.
  const subA = { ...base, agent_id: 'aaa111', agent_type: 'Explore' };
  assert.ok(parseOut((await run(subA)).stdout).hookSpecificOutput.additionalContext.includes('CONTENU_ONCE'));
  assert.strictEqual(parseOut((await run(subA)).stdout), null); // once respected WITHIN agent A
  // Distinct sub-agent B: virgin state too.
  const subB = { ...base, agent_id: 'bbb222', agent_type: 'general-purpose' };
  assert.ok(parseOut((await run(subB)).stdout).hookSpecificOutput.additionalContext.includes('CONTENU_ONCE'));
  // And the master stays switched off (the sub-agent did not pollute its state).
  assert.strictEqual(parseOut((await run(base)).stdout), null);
});

test('SUB-AGENT: master PreCompact purges the master store AND those of the sub-agents; sub-agent PreCompact = targeted purge', async () => {
  writeDoc('unique.md', '---\nmatch: server.js\nmode: once\n---\nCONTENU_ONCE\n');
  const base = { tool_name: 'Read', tool_input: { file_path: 'C:/proj/server.js' }, session_id: 'sreset' };
  const sub = { ...base, agent_id: 'ccc333', agent_type: 'Explore' };
  await run(base); await run(sub); // both states consumed
  const reset = (payload) => new Promise((resolve) => {
    const child = execFile(process.execPath, [path.join(__dirname, '..', 'src', 'hooks', 'ctxroute-reset.js')], {
      encoding: 'utf8', env: { ...process.env, CTXROUTE_STATE_DIR: STATE, CTXROUTE_CONFIG_PATH: CONFIG },
    }, (err) => resolve(err ? err.code : 0));
    child.stdin.end(JSON.stringify(payload));
  });
  // Compaction WITHIN the sub-agent → ITS state alone is purged.
  assert.strictEqual(await reset({ hook_event_name: 'PreCompact', session_id: 'sreset', agent_id: 'ccc333' }), 0);
  assert.ok(parseOut((await run(sub)).stdout).hookSpecificOutput.additionalContext.includes('CONTENU_ONCE'));
  assert.strictEqual(parseOut((await run(base)).stdout), null); // master still switched off
  // MASTER compaction → purge by prefix: master AND sub-agents re-armed.
  assert.strictEqual(await reset({ hook_event_name: 'PreCompact', session_id: 'sreset' }), 0);
  assert.ok(parseOut((await run(base)).stdout).hookSpecificOutput.additionalContext.includes('CONTENU_ONCE'));
  assert.ok(parseOut((await run(sub)).stdout).hookSpecificOutput.additionalContext.includes('CONTENU_ONCE'));
});

// ═══════════════════════════════════════════════════════════════════════
// MULTI-FRAME TRANSPORT (frames) — REAL spawn, as in production.
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ These cases replay the production configuration: the SAME script declared N times
//    with `--frame k --frames N`. Claude Code deduplicates by command + args
//    (official documentation 03/08/2026) ⇒ different indices are NOT merged.

function troisDocs() {
  writeDoc('un.md', '---\nmatch: target.js\nmode: dumb\n---\n' + 'A'.repeat(400) + '\n');
  writeDoc('deux.md', '---\nmatch: target.js\nmode: dumb\n---\n' + 'B'.repeat(400) + '\n');
  writeDoc('trois.md', '---\nmatch: target.js\nmode: dumb\n---\n' + 'C'.repeat(400) + '\n');
  fs.writeFileSync(CONFIG, JSON.stringify({ budgetInjection: 1000 }));
}
const geste = (extra) => ({
  tool_name: 'Read',
  tool_input: { file_path: 'C:/proj/target.js' },
  session_id: 'sP',
  tool_use_id: 'toolu_01PAQUET',
  ...extra,
});

test('FRAMES: 3 docs too big for one frame → delivered in 3 frames, NOTHING evicted', async () => {
  troisDocs();
  const outputs = [];
  for (let k = 1; k <= 3; k++) {
    const { code, stdout } = await run(geste(), { args: ['--frame', String(k), '--frames', '3'] });
    assert.strictEqual(code, 0);
    outputs.push(parseOut(stdout).hookSpecificOutput.additionalContext);
  }
  // Each doc arrives once and only once — the conservation invariant, seen end to end.
  for (const [letter, name] of [['A', 'un'], ['B', 'deux'], ['C', 'trois']]) {
    const carrying = outputs.filter((s) => s.includes(letter.repeat(400)));
    assert.strictEqual(carrying.length, 1, 'doc ' + name + ' delivered exactly once');
  }
  // ⚠️ Zero eviction announcement: that is the WHOLE point of the work item.
  for (const s of outputs) assert.ok(!s.includes('DEFERRED'), 'no residual deferral');
  // Sequence numbers + COMMON marker (verifiable reassembly despite the parallelism).
  outputs.forEach((s, i) => assert.ok(s.includes('FRAME ' + (i + 1) + '/3'), 'frame ' + (i + 1) + ' numbered'));
  const markers = outputs.map((s) => /###END:([0-9a-f]{8})###/.exec(s)[1]);
  assert.strictEqual(new Set(markers).size, 1, 'one single marker for the whole emission');
});

test('FRAMES: a `once` doc IS NOT consumed by the first frame', async () => {
  // ⚠️ THE defect that per-invocation memoization exists to prevent: without
  //    it, frame 1 marks the doc "seen" and frames 2..N, deciding
  //    again, no longer find ANYTHING to inject — empty frames, doc lost.
  writeDoc('un.md', '---\nmatch: target.js\nmode: once\n---\n' + 'A'.repeat(400) + '\n');
  writeDoc('deux.md', '---\nmatch: target.js\nmode: once\n---\n' + 'B'.repeat(400) + '\n');
  fs.writeFileSync(CONFIG, JSON.stringify({ budgetInjection: 1000 }));
  const p1 = parseOut((await run(geste(), { args: ['--frame', '1', '--frames', '2'] })).stdout);
  const p2 = parseOut((await run(geste(), { args: ['--frame', '2', '--frames', '2'] })).stdout);
  assert.ok(p1 && p2, 'BOTH frames carry content');
  const tout = p1.hookSpecificOutput.additionalContext + p2.hookSpecificOutput.additionalContext;
  assert.ok(tout.includes('A'.repeat(400)) && tout.includes('B'.repeat(400)), 'both `once` docs are delivered');
});

test('FRAMES: without an invocation identifier → SINGLE frame (degradation, never breakage)', async () => {
  // A harness that does not expose an invocation identifier falls back on
  // today's behaviour: one frame, and the surplus is ANNOUNCED.
  // ⚠️ It is no longer LOST for all that (05/08/2026): the queue will emit it at the next
  //    action. The degradation therefore bears on the THROUGHPUT (one frame instead of N),
  //    never on the delivery. That is what makes Codex — which has no
  //    multi-frames — as complete as Claude Code, just slower.
  troisDocs();
  const { code, stdout } = await run(
    { tool_name: 'Read', tool_input: { file_path: 'C:/proj/target.js' }, session_id: 'sQ' },
    { args: ['--frame', '1', '--frames', '3'] }
  );
  assert.strictEqual(code, 0);
  const ctx = parseOut(stdout).hookSpecificOutput.additionalContext;
  assert.ok(!ctx.includes('FRAME '), 'no frame header');
  assert.ok(ctx.includes('DEFERRED'), 'the surplus is announced, never kept quiet');
});

test('FRAMES: a frame without content goes out SILENTLY (exit 0, empty stdout)', async () => {
  // A single small doc, 4 frames declared: the last 3 have nothing to say.
  writeDoc('un.md', '---\nmatch: target.js\nmode: dumb\n---\nsmallOne\n');
  const { code, stdout } = await run(geste(), { args: ['--frame', '4', '--frames', '4'] });
  assert.strictEqual(code, 0);
  assert.strictEqual(stdout.trim(), '', 'no empty envelope emitted');
});

// ═══════════════════════════════════════════════════════════════════════
// EMISSION QUEUE (05/08/2026) — THE end-to-end proof: "EVERYTHING ARRIVES".
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ WITHOUT THIS TEST, NOTHING PROVES THE WIRING. Property ⑧ proves the pure
//    ENGINE (`budget.js`); here we prove the PLUMBING: that `pretool-core.js`
//    really persists the remainder, reads it back at the next action, puts it at the TOP,
//    does not duplicate it, and eventually empties the queue. An engine that is correct but wired
//    the wrong way gives exactly the same green on the property side.
// ⚠️ The corpus DELIBERATELY exceeds the capacity of one call (2 narrow frames),
//    that is to say the regime which, before this work item, LOST content.
test('QUEUE: a corpus bigger than the capacity of ONE call arrives WHOLE over several actions', async () => {
  // ⚠️ `once` ON PURPOSE, and the distinction MATTERS (measured on 05/08/2026):
  //    a `dumb` corpus durably above the capacity NEVER empties its
  //    queue — that is CORRECT, not a bug: `dumb` means "re-inject at every
  //    action", so the queue delivers in ROTATION, indefinitely, without losing anything.
  //    TERMINATION is therefore only testable on a corpus that stops being
  //    re-decided (`once`/`smart`) — and that is precisely the real case that opened
  //    this work item: a `once` skill that did not arrive whole.
  for (let k = 0; k < 6; k++) {
    writeDoc('f' + k + '.md', '---\nmatch: target.js\nmode: once\n---\n' + String.fromCharCode(65 + k).repeat(700) + '\n');
  }
  fs.writeFileSync(CONFIG, JSON.stringify({ budgetInjection: 1200 }));

  // ⚠️ WE STOP AS SOON AS THE QUEUE IS EMPTY, we do not play a fixed number of
  //    actions "with some margin". Two reasons:
  //    ① it is a STRONGER assertion — the test proves TERMINATION, where
  //      a fixed counter only proves "it eventually arrives in 8 rounds";
  //    ② each action costs 2 `node` spawns (~1.5 s each under Windows) —
  //      a margin taken blindly is dev time burned on every run.
  //    The bound stays there as a loop DETECTOR, never as a tolerance.
  const vu = [];
  let gestes = 0;
  let fileVide = false;
  while (!fileVide) {
    assert.ok(gestes++ < 20, 'the queue MUST empty — beyond that, it is a loop');
    for (let k = 1; k <= 2; k++) {
      const { stdout } = await run(geste({ tool_use_id: 'toolu_geste' + gestes }), { args: ['--frame', String(k), '--frames', '2'] });
      const out = parseOut(stdout);
      if (out) vu.push(out.hookSpecificOutput.additionalContext);
    }
    const f = fs.readdirSync(STATE).filter((x) => x.startsWith('remainder-'));
    fileVide = f.length > 0 && JSON.parse(fs.readFileSync(path.join(STATE, f[0]), 'utf8')).segments.length === 0;
  }
  const tout = vu.join('\n');
  for (let k = 0; k < 6; k++) {
    const letter = String.fromCharCode(65 + k);
    assert.ok(tout.includes(letter.repeat(700)), 'doc f' + k + ' eventually arrives IN FULL');
  }
  // ⚠️ The queue must EMPTY: without termination, "everything arrives" would be true and
  //    the system unusable (it would never deliver anything new again).
  const rest = fs.readdirSync(STATE).filter((f) => f.startsWith('remainder-'));
  assert.strictEqual(rest.length, 1, 'one single queue file, keyed by session');
  const file = JSON.parse(fs.readFileSync(path.join(STATE, rest[0]), 'utf8'));
  assert.deepStrictEqual(file.segments, [], 'the queue is EMPTY once everything is delivered');
});

test('QUEUE: PreCompact purge — an orphan fragment NEVER survives a compaction', async () => {
  // ⚠️ Keeping the queue after a compaction would deliver the END of a document whose
  //    BEGINNING has disappeared from the context: unreadable, and worse than a re-injection.
  for (let k = 0; k < 4; k++) {
    writeDoc('p' + k + '.md', '---\nmatch: target.js\nmode: dumb\n---\n' + 'Z'.repeat(700) + k + '\n');
  }
  fs.writeFileSync(CONFIG, JSON.stringify({ budgetInjection: 1200 }));
  await run(geste({ session_id: 'sFile', tool_use_id: 'toolu_x' }), { args: ['--frame', '1', '--frames', '2'] });
  assert.ok(fs.readdirSync(STATE).some((f) => f.startsWith('remainder-')), 'the queue exists after an action that overflows');
  const reset = (payload) => new Promise((resolve) => {
    const child = execFile(process.execPath, [path.join(__dirname, '..', 'src', 'hooks', 'ctxroute-reset.js')], {
      encoding: 'utf8', env: { ...process.env, CTXROUTE_STATE_DIR: STATE, CTXROUTE_CONFIG_PATH: CONFIG },
    }, (err) => resolve(err ? err.code : 0));
    child.stdin.end(JSON.stringify(payload));
  });
  assert.strictEqual(await reset({ hook_event_name: 'PreCompact', session_id: 'sFile' }), 0);
  assert.ok(!fs.readdirSync(STATE).some((f) => f.startsWith('remainder-')), 'PreCompact PURGES it');
});

test('FRAMES: index out of bounds → single frame, NEVER the content of another frame', async () => {
  troisDocs();
  const { stdout } = await run(geste(), { args: ['--frame', '9', '--frames', '3'] });
  const ctx = parseOut(stdout).hookSpecificOutput.additionalContext;
  assert.ok(!ctx.includes('FRAME '), 'inconsistent declaration ⇒ safe fallback on the single frame');
});

// ── `enforce` (05/08/2026): STOPPING the action, proven by a REAL SPAWN ──
// ⚠️ Official Claude Code documentation: "permissionDecision: deny … blocks the tool
//    call, and shows Claude the reason". The knowledge therefore goes out in
//    permissionDecisionReason, NEVER in additionalContext (which only arrives
//    next to the RESULT — too late for the call we want to prevent).
test('DENY: enforce doc → the tool is REFUSED and the doc goes out in the REASON', async () => {
  writeDoc('paiement.md', '---\nmatch: server.js\nmode: once\nenforce: true\n---\nNEVER click a payment button.\n');
  const { code, stdout } = await run({ tool_name: 'Read', tool_input: { file_path: 'C:/proj/server.js' }, session_id: 'enf1' });
  assert.strictEqual(code, 0, 'exit 0: the refusal goes through the JSON, not through an error code');
  const out = parseOut(stdout);
  assert.strictEqual(out.hookSpecificOutput.permissionDecision, 'deny');
  assert.ok(out.hookSpecificOutput.permissionDecisionReason.includes('NEVER click'),
    'the knowledge MUST be delivered with the refusal — a silent wall teaches nothing');
  assert.strictEqual(out.hookSpecificOutput.additionalContext, undefined,
    'never additionalContext on a deny: it would arrive after the refused action');
});

test('DENY: the action REDONE right after PASSES (alternation, zero infinite loop)', async () => {
  writeDoc('paiement.md', '---\nmatch: server.js\nmode: once\nenforce: true\n---\ncontent\n');
  const payload = { tool_name: 'Read', tool_input: { file_path: 'C:/proj/server.js' }, session_id: 'enf2' };
  const r1 = await run(payload);
  assert.strictEqual(parseOut(r1.stdout).hookSpecificOutput.permissionDecision, 'deny');
  const r2 = await run(payload);
  assert.strictEqual(parseOut(r2.stdout), null, '2nd call: total silence, the tool executes');
});

test('NEGATIVE: a doc WITHOUT enforce NEVER blocks (parity contract)', async () => {
  writeDoc('normale.md', '---\nmatch: server.js\nmode: once\n---\ncontent\n');
  const { stdout } = await run({ tool_name: 'Read', tool_input: { file_path: 'C:/proj/server.js' }, session_id: 'enf3' });
  assert.strictEqual(parseOut(stdout).hookSpecificOutput.permissionDecision, 'allow');
});

// ═══════════════════════════════════════════════════════════════════════
// READABILITY OF THE TRANSPORT — the badge says "chunk j/m" (06/08/2026)
// ═══════════════════════════════════════════════════════════════════════
// 🛑 THIS TEST IS AN ANTI-INERT, NOT A DUPLICATE of budget.test.js. The
//    pure functions `chunkPart`/`chunkSuffix` can be perfect AND
//    NOT WIRED UP: only the SHELL writes `systemMessage`. Without a REAL
//    spawn, we would have a silent badge with 100 % mutation — the "green that
//    sees nothing", the worst defect of the repo. NEVER replace it with a unit
//    test on budget.js.
// ⚠️ ORIGIN: a skill delivered in 7 chunks displayed SEVEN identical badges.
//    Read as the framework running wild while the delivery was normal.

test('BADGE: a CHUNKED doc announces its position — never N identical badges', async () => {
  // Deliberately small budget to FORCE chunking on a single frame.
  // ⚠️ THE DOC MUST EXCEED THE FLOOR (8 000 chars) — the Claude Code shell does
  //    NOT read `--budget`: that flag only exists on the Codex and session side, whose
  //    harnesses DECLARE a limit. Here the budget comes from the conservative
  //    floor. My 1st version passed that non-existent flag: the test
  //    was GREEN on the wrong path, exactly the defect it hunts down.
  writeDoc('big.md', '---\nmatch: server.js\nmode: dumb\n---\n' + 'L\n'.repeat(6000));
  const { code, stdout } = await run(
    { tool_name: 'Read', tool_input: { file_path: 'C:/proj/server.js' }, session_id: 'badge1' },
  );
  assert.strictEqual(code, 0);
  const out = parseOut(stdout);
  // ⚠️ THE ANCHOR TOLERATES THE CAPACITY ALARM, AND NOTHING ELSE (07/08/2026). This
  //    case chunks with a narrow budget, so it DEFERS — and a deferral is
  //    now announced to the human. The optional group is NAMED on purpose:
  //    replacing the anchor with a plain `includes` would let through any
  //    future suffix, that is to say give up verifying the format of the badge.
  assert.match(out.systemMessage, /^📄 doc: big \(chunk 1\/\d+\)( · ⚠️ \d+ doc\(s\) DEFERRED.*)?$/, 'the badge carries the position of the chunk');
  assert.ok(out.hookSpecificOutput.additionalContext.includes('CHUNK 1/'), 'and the content really is a chunk');
});

test('BADGE: a doc that FITS has NO suffix (parity to the byte)', async () => {
  // ⚠️ THE NORMAL CASE. If this test turned red, all the parity differentials
  //    would fall with it: the badge of a whole delivery must gain
  //    NOTHING. It is the mandatory counterpart of the previous test.
  writeDoc('smallOne.md', '---\nmatch: server.js\nmode: dumb\n---\ncontent court\n');
  const { stdout } = await run({ tool_name: 'Read', tool_input: { file_path: 'C:/proj/server.js' }, session_id: 'badge2' });
  assert.strictEqual(parseOut(stdout).systemMessage, '📄 doc: smallOne');
});

test('BADGE: the FILE badge ignores showNotification — including when CHUNKED (parity)', async () => {
  // ⚠️ REAL, DELIBERATE ASYMMETRY, AND A SURPRISING ONE: the FILE badge does NOT
  //    read `showNotification` (protect-files parity, to the byte), whereas those
  //    of MCP and `tool` do respect it. I discovered it while writing this test:
  //    my 1st version required silence and turned red — I nearly
  //    "harmonized" the three, that is to say changed a path IN PRODUCTION
  //    to satisfy an expectation I had invented.
  // 🛑 This test therefore ANCHORS the asymmetry instead of correcting it. If one day it
  //    must fall, it will be an explicit decision, with the differentials
  //    re-run — never the side effect of a badly written test.
  // ⚠️ The invariant "never an orphan suffix" lives, for its part, in pretool-core.js
  //    (empty badge ⇒ suffix removed) and is proven on `chunkSuffix`.
  fs.writeFileSync(CONFIG, JSON.stringify({ showNotification: false, mode: 'dumb' }));
  writeDoc('big.md', '---\nmatch: server.js\nmode: dumb\n---\n' + 'L\n'.repeat(6000));
  const { stdout } = await run(
    { tool_name: 'Read', tool_input: { file_path: 'C:/proj/server.js' }, session_id: 'badge3' },
  );
  const out = parseOut(stdout);
  assert.ok(out.hookSpecificOutput.additionalContext.includes('CHUNK 1/'), 'the DELIVERY continues');
  // ⚠️ Same named tolerance as in the previous case: what is sealed here is
  //    that `showNotification: false` does NOT change the file badge (protect-files
  //    parity) — not the absence of the alarm, which has its own suite.
  assert.match(out.systemMessage, /^📄 doc: big \(chunk 1\/\d+\)( · ⚠️ \d+ doc\(s\) DEFERRED.*)?$/, 'file badge UNCHANGED by showNotification (parity)');
});

// ═══════════════════════════════════════════════════════════════════════
// 🔴 FALLBACK WITHOUT A LOCK — THE STATE IS READ, IT IS NOT GUESSED (07/08/2026)
// ═══════════════════════════════════════════════════════════════════════
// REAL bug, observed in production BEFORE being understood: an isolated skill chunk
// reappeared several minutes after a COMPLETE delivery, same
// marker, without a compaction, EMPTY queue. Signature noted in the transcript:
//   21:25  frames 1..9 → chunks 1/9 … 9/9   ###END:be66cd9b###
//   21:30  frame 2     → chunk  2/9 ALONE   ###END:be66cd9b###
//
// CAUSE: the "lock unavailable" fallback decided with an EMPTY state (`{}`).
// But the state carries the "already seen". A `once` already delivered was therefore judged
// NEVER delivered and re-emitted — and since this process does not read the memoized plan
// either, it alone recomputed the SAME split (deterministic ⇒ identical marker) and
// emitted only ITS frame. Hence the orphan chunk.
//
// 🛑 THE UNDERLYING MISTAKE IS AN INFERENCE: the process only knew
//    "I did not get the lock" and deduced "therefore nothing was injected".
//    The lock protects the WRITE; the READ never needed it.
//    The state is a file on disk: it was enough to read it. Question
//    what KNOWS, never a clue.
//
// 🛑 WHY 1096 TESTS DID NOT SEE IT: no suite made the
//    lock FAIL. The fallback branch was only exercised with an already empty state,
//    that is to say in the only case where the inference happens to be right. A degradation
//    path not tested WITH state is an untested path.
//
// ⚠️ The fallback stays FAIL-OPEN and still writes NOTHING (neither state, nor queue):
//    we read, we decide, we deliver. A slightly stale state makes at worst a
//    JUSTIFIED re-injection; an empty state manufactured a PHANTOM one, at every
//    contention. NEVER "simplify" this loadState into `{}`.
test('FALLBACK WITHOUT A LOCK: a `once` already delivered is NOT re-injected when the lock is taken', async () => {
  writeDoc('once.md', '---\nmatch: server.js\nmode: once\n---\n# Knowledge\nbody\n');
  const payload = { tool_name: 'Read', tool_input: { file_path: 'C:/proj/server.js' }, session_id: 'lockfb' };

  const first = parseOut((await run(payload)).stdout);
  assert.ok(first && first.hookSpecificOutput.additionalContext.includes('body'), '1st delivery expected');

  // The lock is TAKEN by "another process": mkdirSync will fail with EEXIST.
  // ⚠️ Fresh mtime mandatory — beyond STALE_MS (5 s) lock.js forces it and
  // the fallback would never be taken (the test would be lying to itself).
  const lockDir = path.join(STATE, '.lock-doc-lockfb');
  fs.mkdirSync(lockDir, { recursive: true });
  try {
    const { code, stdout } = await run(payload, { env: { CTXROUTE_LOCK_TIMEOUT_MS: '50' } });
    assert.strictEqual(code, 0, 'the fallback stays fail-open');
    assert.strictEqual(stdout.trim(), '', 'NO phantom re-injection: the `once` is already seen');
  } finally {
    fs.rmSync(lockDir, { recursive: true, force: true });
  }
});

// COUNTER-CHECK — without it, the test above would also pass if the fallback
// became SILENT by accident (e.g. a premature `return`), which would be a breakdown
// and not a fix. A doc NEVER seen must always be delivered without a lock.
// ⚠️ `dumb` SINCE 2026-08-20, AND IT IS A DECISION, NOT A CONVENIENCE. This cell
//    exists so that a fallback going SILENT by accident is caught. It used a
//    `once` document — which the fallback deliberately no longer delivers, because
//    it cannot RECORD it, and an unrecorded `once` is re-decided as fresh and
//    delivered a SECOND time (found by TLC, reproduced on the engine).
// 🛑 THE PRICE IS WRITTEN, NOT HIDDEN: for a `once`, contention now means "one
//    action later", where it used to mean "twice, at random". The trade was
//    FORCED — the fallback may not write, so there were only two branches, and a
//    delay is deterministic while a duplicate is not.
//    Nothing is lost: no record is written, so the leader delivers it next action.
// 🛑 Do NOT restore `once` here to "cover more" — that would re-assert the defect.
//    The `once` path has its own cell in `transport-conformance.test.js`.
test('FALLBACK WITHOUT A LOCK: a doc NEVER seen is still delivered (fail-open intact)', async () => {
  writeDoc('neuve.md', '---\nmatch: server.js\nmode: dumb\n---\n# New\ninedit\n');
  const lockDir = path.join(STATE, '.lock-doc-lockfb2');
  fs.mkdirSync(lockDir, { recursive: true });
  try {
    const { stdout } = await run(
      { tool_name: 'Read', tool_input: { file_path: 'C:/proj/server.js' }, session_id: 'lockfb2' },
      { env: { CTXROUTE_LOCK_TIMEOUT_MS: '50' } },
    );
    const out = parseOut(stdout);
    assert.ok(out && out.hookSpecificOutput.additionalContext.includes('inedit'), 'without a lock we still deliver');
  } finally {
    fs.rmSync(lockDir, { recursive: true, force: true });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// `[source: <path>]` CONTRACT — THE AGENT MUST BE ABLE TO GO AND FIX THE DOC
// ═══════════════════════════════════════════════════════════════════════
// 🛑 THIS IS NOT DISPLAY, IT IS THE SELF-REPAIR LOOP OF THE
//    CORPUS: an agent that receives a FALSE or INCOMPLETE doc must know
//    WHICH FILE to edit, without searching. The path must therefore stay
//    extractable AS IS — never mixed with anything else between the brackets.
// 🔴 BORN FROM A REAL DEFECT (08/08/2026): the ordinal `DOC i/T` had been slipped
//    INSIDE the tag, giving "<path> — DOC 2/5", hence an
//    INVALID path. **538 tests were GREEN** — none asserted the content of the
//    tag in multi-document mode. It is the maintainer who saw it, by eye.
//    This test exists so that the MACHINE sees it next time.
test('SOURCE CONTRACT: the path stays extractable AS IS, even with the ordinal', async () => {
  troisDocs();
  const vus = [];
  for (let k = 1; k <= 3; k++) {
    const r = await run(geste(), { args: ['--frame', String(k), '--frames', '3'] });
    for (const m of r.stdout.matchAll(/\[source:\s*([^\]]+)\]/g)) vus.push(m[1]);
  }
  // ⚠️ ANTI-SILENT-PROBE WITNESS: without a capture, "no invalid path"
  //    would be a false green. A trap that has cost 5 false probes on this repo.
  assert.ok(vus.length >= 3, 'silent probe: ' + vus.length + ' [source:] tag(s) captured');
  for (const filePath of vus) {
    assert.ok(filePath.endsWith('.md') && !filePath.includes('DOC '),
      'UNUSABLE path: ' + JSON.stringify(filePath)
      + ' — the agent could not go and fix this doc.');
  }
});

// The ordinal must indeed be THERE (otherwise the test above would pass by removing it).
test('DOCUMENT ORDER: the 3 documents announce their global position', async () => {
  troisDocs();
  let tout = '';
  for (let k = 1; k <= 3; k++) {
    tout += (await run(geste(), { args: ['--frame', String(k), '--frames', '3'] })).stdout;
  }
  for (const expected of ['[DOC 1/3]', '[DOC 2/3]', '[DOC 3/3]']) {
    assert.ok(tout.includes(expected),
      expected + ' missing — the order intended by rank becomes unobservable again');
  }
});

// ═══ GLOBAL FILTER BY TARGET (52, 15/08/2026) — real spawn, the 3 contracts ═══
test('FILTER 52: global blacklist on the tool → total SILENCE (no injection)', async () => {
  writeDoc('piege.md', '---\nmatch: server.js\nmode: dumb\n---\n# Trap\nX.\n');
  fs.writeFileSync(CONFIG, JSON.stringify({ filterMode: 'blacklist', filterList: ['Read'] }));
  const { code, stdout } = await run({ tool_name: 'Read', tool_input: { file_path: 'C:/proj/server.js' }, session_id: 's52a' });
  assert.strictEqual(code, 0);
  assert.strictEqual(parseOut(stdout), null, 'the target is blacklisted: nothing must go out');
});

test('FILTER 52: PARTIAL exclusion (defaults.file) → the other source injects AND the badge NAMES the exclusion', async () => {
  // ⚠️ This is the OBSERVABILITY contract of the backlog: "a filter that cuts is
  //    a silence" — when something still goes out, the badge must say what
  //    was removed and NAME the setting (filterMode/filterList).
  writeDoc('target-file.md', '---\nmatch: server.js\nmode: dumb\n---\n# File doc\nA.\n');
  writeDoc('target-outil.md', '---\ntool: [Read]\nscope: [server.js]\nmode: dumb\n---\n# Tool doc\nB.\n');
  fs.writeFileSync(CONFIG, JSON.stringify({ defaults: { file: { filterMode: 'blacklist', filterList: ['Read'] } } }));
  const { code, stdout } = await run({ tool_name: 'Read', tool_input: { file_path: 'C:/proj/server.js' }, session_id: 's52b' });
  assert.strictEqual(code, 0);
  const out = parseOut(stdout);
  assert.ok(out.hookSpecificOutput.additionalContext.includes('# Tool doc'), 'the tool source is not filtered');
  assert.ok(!out.hookSpecificOutput.additionalContext.includes('# File doc'), 'the file source is filtered by its category');
  assert.match(out.systemMessage, /🚫 1 doc\(s\) excluded by filterMode\/filterList/, 'the exclusion MUST be announced and name the setting');
});

test('FILTER 52: PARITY — filterMode "none" with a non-empty list changes NOTHING (spawn)', async () => {
  writeDoc('piege.md', '---\nmatch: server.js\nmode: dumb\n---\n# Trap\nX.\n');
  fs.writeFileSync(CONFIG, JSON.stringify({ filterMode: 'none', filterList: ['Read'] }));
  const { stdout } = await run({ tool_name: 'Read', tool_input: { file_path: 'C:/proj/server.js' }, session_id: 's52c' });
  assert.strictEqual(parseOut(stdout).hookSpecificOutput.permissionDecision, 'allow');
});
