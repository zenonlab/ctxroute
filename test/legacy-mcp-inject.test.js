// ═══════════════════════════════════════════════════════════════════════
// Tests for legacy-mcp-inject.js + ctxroute-reset.js — vitest suite (zero deps beyond the runner).
//
// Spawns the hooks as child processes, feeds JSON stdin (Claude Code hooks format
// verified against the official doc: session_id, tool_name, tool_input,
// hook_event_name), parses the JSON stdout, asserts. Each case = a DISPOSABLE
// isolated session_id → state/ctxroute-seen-<id>.json cleaned up at the end of the run.
//
// Covers: serverName extraction, once/smart/dumb mode, default and per-server
// threshold, PreCompact reset, absent doc = silence, non-MCP tool
// ignored, isolation per session.
//
// Run: `npx vitest run legacy-mcp-inject.test.js` from the repo.
// ═══════════════════════════════════════════════════════════════════════

import { test, afterAll } from 'vitest';
import assert from 'node:assert';
import { spawnSync, spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const HOOK = path.join(import.meta.dirname, '..', 'src', 'hooks', 'legacy-mcp-inject.js');
const RESET_HOOK = path.join(import.meta.dirname, '..', 'src', 'hooks', 'ctxroute-reset.js');
// ⚠️ ㉙ (07/08/2026) — DISPOSABLE TMPDIR, NEVER the repo's `state/`. This suite
//    pointed at `<repo>/state`, i.e. the LIVE directory where the hooks in
//    production write permanently (12 processes per tool call, all
//    the agents of the machine). Its PURGE tests list that directory and
//    count what is left: while another agent writes into it, the count
//    changes under the test's feet ⇒ 3 RANDOM reds on 07/08/2026, green
//    in two consecutive isolated runs.
// 🛑 A suite that turns red at random is a suite one stops reading — and the
//    day it is right, nobody believes it. Same reason as the tmpdir of
//    `CONFIG_PATH` just below: a test NEVER writes nor reads the real
//    state of the framework.
// ⚠️ `CTXROUTE_STATE_DIR` is read by `paths.stateDir()` — passed on EVERY spawn
//    (cf `run()`), otherwise the hooks would still write into the repo and the test
//    would read an empty directory.
const STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-state-'));
// ⚠️ NEVER point CONFIG_PATH back at the repo's ctxroute-config.json.
// The tests wrote their fixtures into the REAL file then restored
// "the original" — which was already a committed test config: the framework
// stayed disabled in prod (whitelist testserver999) since the 1st commit,
// silently. Test config = a DISPOSABLE file in a tmpdir, passed to the hook via
// CTXROUTE_CONFIG_PATH. Zero write into the repo, nothing to restore, a Ctrl-C
// mid-run can no longer break anything.
const CONFIG_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-test-')),
  'ctxroute-config.json'
);
const DOCS_DIR = path.join(import.meta.dirname, '..', 'docs', 'mcp');

function run(hook, payload, env = {}) {
  const r = spawnSync('node', [hook], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    // ⚠️ CTXROUTE_CONFIG_PATH on EVERY spawn: without it the hook would re-read the
    // repo's real config and the tests would depend on the local environment.
    // ⚠️ CTXROUTE_STATE_DIR on EVERY spawn (㉙): without it the hook would write
    // into the repo's LIVE `state/` and the test would read an empty tmpdir.
    env: { ...process.env, CTXROUTE_CONFIG_PATH: CONFIG_PATH, CTXROUTE_STATE_DIR: STATE_DIR, ...env },
  });
  return { stdout: (r.stdout || '').trim(), status: r.status };
}

// Each ok(name, cond) = EXACTLY ONE vitest test (same name, same cond).
// The state (sequential spawns of the hooks) is built at module level —
// the original execution order of the harness is preserved.
function ok(name, cond) {
  test(name, () => { assert.ok(cond, name); });
}

function callMcp(sessionId, server, tool = 'do_thing', toolInput = {}, env = {}) {
  return run(HOOK, {
    hook_event_name: 'PreToolUse',
    tool_name: `mcp__${server}__${tool}`,
    session_id: sessionId,
    tool_input: toolInput,
  }, env);
}

function callNonMcp(sessionId, toolName = 'Read') {
  return run(HOOK, {
    hook_event_name: 'PreToolUse',
    tool_name: toolName,
    session_id: sessionId,
    tool_input: { file_path: '/tmp/x' },
  });
}

function preCompact(sessionId) {
  return run(RESET_HOOK, { hook_event_name: 'PreCompact', session_id: sessionId, trigger: 'auto' });
}

const isAllow = (res) => res.stdout.includes('"permissionDecision":"allow"') || res.stdout.includes('"permissionDecision": "allow"');
const wasInjected = (res) => isAllow(res) && res.stdout.includes('additionalContext');
const hasNotification = (res) => res.stdout.includes('systemMessage');

// ── Fixture: temporary test doc for a dummy server ──
// ⚠️ The name MUST NOT start/end with "_": serverName() requires a
// first non-underscore character (same constraint as the real names
// mcp__stripe__..., mcp__plugin_discord_discord__...). A name like
// "__test__" breaks the regex — it is a FIXTURE trap, not a hook bug.
const TEST_SERVER = 'testserver999';
const TEST_DOC_PATH = path.join(DOCS_DIR, `${TEST_SERVER}.md`);
const CROSS_A_PATH = path.join(DOCS_DIR, 'servera.md');
const CROSS_B_PATH = path.join(DOCS_DIR, 'serverb.md');
fs.mkdirSync(DOCS_DIR, { recursive: true });
fs.writeFileSync(TEST_DOC_PATH, '# Test doc\nDummy invariant for the tests.\n');
fs.writeFileSync(CROSS_A_PATH, '# serverA doc\nDummy invariant A.\n');
fs.writeFileSync(CROSS_B_PATH, '# serverB doc\nDummy invariant B.\n');

// ── Fixture: DISPOSABLE test config (tmpdir) — nothing to back up/restore ──
function setConfig(obj) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(obj));
}

// ── Test 1 — 1st MCP call → injects (all modes) ──
{
  setConfig({ mode: 'smart', defaultThreshold: 4, servers: {} });
  const s = 'test-first-1';
  ok('1st mcp__server__tool call → injected', wasInjected(callMcp(s, TEST_SERVER)));
}

// ── Test 2 — "once" mode: immediate 2nd call → NOT re-injected ──
{
  setConfig({ mode: 'once', defaultThreshold: 4, servers: {} });
  const s = 'test-once-2';
  callMcp(s, TEST_SERVER);
  const second = callMcp(s, TEST_SERVER);
  ok('once mode: immediate 2nd call → not re-injected', !wasInjected(second));
}

// ── Test 3 — "dumb" mode: EVERY call re-injects ──
{
  setConfig({ mode: 'dumb', defaultThreshold: 4, servers: {} });
  const s = 'test-dumb-3';
  callMcp(s, TEST_SERVER);
  const second = callMcp(s, TEST_SERVER);
  const third = callMcp(s, TEST_SERVER);
  ok('dumb mode: 2nd call re-injects', wasInjected(second));
  ok('dumb mode: 3rd call re-injects too', wasInjected(third));
}

// ── Test 4 — "smart" mode: below the threshold → not re-injected ──
{
  setConfig({ mode: 'smart', defaultThreshold: 4, servers: {} });
  const s = 'test-smart-under-4';
  callMcp(s, TEST_SERVER); // injects, sinceLastCall=0
  callNonMcp(s); callNonMcp(s); // 2 non-MCP calls (< threshold 4)
  const again = callMcp(s, TEST_SERVER);
  ok('smart mode: 2 non-MCP calls < threshold 4 → not re-injected', !wasInjected(again));
}

// ── Test 5 — "smart" mode: above the threshold → re-injected ──
{
  setConfig({ mode: 'smart', defaultThreshold: 3, servers: {} });
  const s = 'test-smart-over-5';
  callMcp(s, TEST_SERVER); // injects, sinceLastCall=0
  callNonMcp(s); callNonMcp(s); callNonMcp(s); // 3 non-MCP calls ≥ threshold 3
  const again = callMcp(s, TEST_SERVER);
  ok('smart mode: 3 non-MCP calls ≥ threshold 3 → re-injected', wasInjected(again));
}

// ── Test 6 — "smart" mode: counter reset to 0 after re-injection ──
{
  setConfig({ mode: 'smart', defaultThreshold: 2, servers: {} });
  const s = 'test-smart-reset-6';
  callMcp(s, TEST_SERVER);
  callNonMcp(s); callNonMcp(s);
  const reInjected = callMcp(s, TEST_SERVER); // re-injects (2 ≥ threshold 2), counter restarts at 0
  callNonMcp(s); // only 1 non-MCP call (< threshold 2)
  const notYet = callMcp(s, TEST_SERVER);
  ok('smart: re-injection at the threshold OK', wasInjected(reInjected));
  ok('smart: counter restarts at 0 after re-injection → not re-injected on the next 1st call', !wasInjected(notYet));
}

// ── Test 7 — per-server threshold (override) takes precedence over defaultThreshold ──
{
  setConfig({ mode: 'smart', defaultThreshold: 10, servers: { [TEST_SERVER]: { threshold: 1 } } });
  const s = 'test-override-7';
  callMcp(s, TEST_SERVER);
  callNonMcp(s); // 1 non-MCP call ≥ server threshold (1), well below defaultThreshold (10)
  const again = callMcp(s, TEST_SERVER);
  ok('server threshold override=1 takes precedence over defaultThreshold=10 → re-injected', wasInjected(again));
}

// ── Test 7b — INDEPENDENT counters between servers: calling ANOTHER MCP
// advances the counter of the current server (not only the native tools).
{
  setConfig({ mode: 'smart', defaultThreshold: 2, servers: {} });
  const s = 'test-cross-mcp-7b';
  callMcp(s, 'servera'); // injects A, sinceLastCall(A)=0
  callMcp(s, 'serverb'); // B is "foreign" to A → sinceLastCall(A)=1; injects B (1st call), sinceLastCall(B)=0
  const stillUnder = callMcp(s, 'servera'); // sinceLastCall(A) was 1 < threshold 2 → not re-injected; reset to 0
  ok('a call to ANOTHER MCP advances the counter of the current server, but 1 < threshold 2 → not re-injected yet', !wasInjected(stillUnder));

  callMcp(s, 'serverb'); // B foreign to A → sinceLastCall(A)=1
  callMcp(s, 'serverb'); // calling B again (already seen): B foreign to A → sinceLastCall(A)=2 ≥ threshold 2
  const reInjectedAt = callMcp(s, 'servera');
  ok('2 calls to ANOTHER server (B) ≥ threshold 2 → A re-injected', wasInjected(reInjectedAt));
}

// ── Test 7c — calling a server does NOT advance its OWN counter ──
// (a call to Stripe must never count as "foreign to Stripe" itself).
{
  setConfig({ mode: 'smart', defaultThreshold: 2, servers: {} });
  const s = 'test-self-not-foreign-7c';
  callMcp(s, TEST_SERVER); // injects, sinceLastCall=0
  callMcp(s, TEST_SERVER); // calling ITSELF again: must not self-increment
  callMcp(s, TEST_SERVER); // idem
  const stillNotInjected = callMcp(s, TEST_SERVER);
  ok('a server called in a loop never self-increments → never re-injected (threshold not reached by itself)', !wasInjected(stillNotInjected));
}

// ── Test 7d — filterMode "whitelist": only a listed server is covered ──
{
  setConfig({ mode: 'dumb', defaultThreshold: 4, filterMode: 'whitelist', filterList: [TEST_SERVER], servers: {} });
  const s = 'test-whitelist-7d';
  const inList = callMcp(s, TEST_SERVER);
  const outOfList = callMcp(s, 'servera');
  ok('whitelist: listed server → injected', wasInjected(inList));
  ok('whitelist: NON-listed server → never injected (excluded)', !wasInjected(outOfList) && outOfList.status === 0);
}

// ── Test 7e — filterMode "blacklist": everything covered EXCEPT the listed servers ──
{
  setConfig({ mode: 'dumb', defaultThreshold: 4, filterMode: 'blacklist', filterList: [TEST_SERVER], servers: {} });
  const s = 'test-blacklist-7e';
  const blacklisted = callMcp(s, TEST_SERVER);
  const stillCovered = callMcp(s, 'servera');
  ok('blacklist: listed server → never injected (excluded)', !wasInjected(blacklisted) && blacklisted.status === 0);
  ok('blacklist: NON-listed server → still covered/injected', wasInjected(stillCovered));
}

// ── Test 7f — a server excluded by the filter still counts as "foreign" for the others ──
{
  setConfig({ mode: 'smart', defaultThreshold: 1, filterMode: 'blacklist', filterList: ['serverb'], servers: {} });
  const s = 'test-filtered-foreign-7f';
  callMcp(s, 'servera'); // injects A, sinceLastCall(A)=0
  callMcp(s, 'serverb'); // B excluded by the blacklist: no injection/state for B, BUT counts as foreign for A
  const reInjected = callMcp(s, 'servera'); // sinceLastCall(A) must be 1 ≥ threshold 1
  ok('a call to a server EXCLUDED by the filter still advances the counter of the active servers', wasInjected(reInjected));
}

// ── Test 7g — PER-SERVER mode overrides the global mode ──
{
  setConfig({ mode: 'once', defaultThreshold: 4, servers: { [TEST_SERVER]: { mode: 'dumb' } } });
  const s = 'test-permode-7g';
  callMcp(s, TEST_SERVER); // 1st call
  const second = callMcp(s, TEST_SERVER); // global mode = once (would not have re-injected), but server override = dumb
  const otherServerSecond = (() => { // ANOTHER server, without an override, must respect the global "once" mode
    callMcp(s, 'servera');
    return callMcp(s, 'servera');
  })();
  ok('per-server "dumb" mode overrides the global "once" mode for THIS server', wasInjected(second));
  ok('a server without an override stays on the global "once" mode → not re-injected', !wasInjected(otherServerSecond));
}

// ── Test 7h — "showNotification" switch: controls ONLY the visible message,
// NEVER cuts off the injection itself (additionalContext) ──
{
  const s = 'test-notif-toggle-7h';
  setConfig({ mode: 'dumb', defaultThreshold: 4, servers: {} }); // no field → ON by default
  const withNotification = callMcp(s, TEST_SERVER);
  ok('without a "showNotification" field → notification ON by default', hasNotification(withNotification));
  ok('without a "showNotification" field → injection present (normal behavior)', wasInjected(withNotification));

  setConfig({ showNotification: false, mode: 'dumb', defaultThreshold: 4, servers: {} });
  const s2 = 'test-notif-toggle-off-7h';
  const noNotification = callMcp(s2, TEST_SERVER);
  ok('showNotification:false → NO systemMessage', !hasNotification(noNotification));
  ok('showNotification:false → injection STILL present (the toggle only cuts off the message)', wasInjected(noNotification));

  setConfig({ showNotification: true, mode: 'dumb', defaultThreshold: 4, servers: {} });
  const reenabled = callMcp(s2, TEST_SERVER);
  ok('explicit showNotification:true → notification re-enabled', hasNotification(reenabled));
}

// ── Test 7h-bis — GLOBAL "enabled" switch: cuts off EVERYTHING (injection AND
// notification), distinct from "showNotification" which only cuts off the message ──
{
  const s = 'test-enabled-toggle-7hbis';
  setConfig({ mode: 'dumb', defaultThreshold: 4, servers: {} }); // no field → ON by default
  ok('without an "enabled" field → framework ON by default', wasInjected(callMcp(s, TEST_SERVER)));

  setConfig({ enabled: false, mode: 'dumb', defaultThreshold: 4, servers: {} });
  const s2 = 'test-enabled-toggle-off-7hbis';
  const res = callMcp(s2, TEST_SERVER);
  ok('enabled:false → NO injection, even in dumb mode (1st call)', !wasInjected(res) && res.status === 0);
  ok('enabled:false → NO notification either (everything is cut off)', !hasNotification(res));

  setConfig({ enabled: true, mode: 'dumb', defaultThreshold: 4, servers: {} });
  ok('explicit enabled:true → re-enables normally', wasInjected(callMcp(s2, TEST_SERVER)));
}

// ── Test 7i — the systemMessage carries the [ctxroute] prefix + the real granularity ──
{
  setConfig({ mode: 'dumb', defaultThreshold: 4, servers: {} });
  const s = 'test-systemmessage-7i';
  const toolDir = path.join(DOCS_DIR, TEST_SERVER);
  fs.mkdirSync(toolDir, { recursive: true });
  fs.writeFileSync(path.join(toolDir, 'act.md'), '# tool doc\n');
  const serverOnly = callMcp(s, TEST_SERVER, 'other_tool_no_doc');
  const withTool = callMcp(s, TEST_SERVER, 'act');
  ok('the systemMessage carries the "[ctxroute]" prefix (distinguishes it from the other injectable doc sources)', serverOnly.stdout.includes('[ctxroute]'));
  ok('systemMessage at server level only → no granularity suffix', serverOnly.stdout.includes(`[ctxroute] ${TEST_SERVER}"`) || serverOnly.stdout.includes(`[ctxroute] ${TEST_SERVER}\\"`));
  ok('systemMessage at server+tool level → "(tool)" suffix visible', withTool.stdout.includes(`[ctxroute] ${TEST_SERVER} (tool)`));
  fs.rmSync(toolDir, { recursive: true, force: true });
}

// ── Test 8 — PreCompact reset: after the reset, re-injects like a 1st call ──
{
  setConfig({ mode: 'once', defaultThreshold: 4, servers: {} });
  const s = 'test-precompact-8';
  callMcp(s, TEST_SERVER);
  const beforeReset = callMcp(s, TEST_SERVER);
  preCompact(s);
  const afterReset = callMcp(s, TEST_SERVER);
  ok('once mode before compaction: not re-injected', !wasInjected(beforeReset));
  ok('after PreCompact: re-injected like a fresh context', wasInjected(afterReset));
}

// ── Test 9 — server without a doc.md → never any injection, never any error ──
{
  setConfig({ mode: 'dumb', defaultThreshold: 4, servers: {} });
  const s = 'test-nodoc-9';
  const res = callMcp(s, 'serversansdoc');
  ok('server without docs/mcp/*.md → no injection, clean exit', !wasInjected(res) && res.status === 0);
}

// ── Test 10 — non-MCP tool (no mcp__ prefix) → silently ignored ──
{
  const s = 'test-nonmcp-10';
  const res = callNonMcp(s, 'Bash');
  ok('non-MCP tool (Bash) → clean exit, no decision output', res.status === 0 && !res.stdout.includes('permissionDecision'));
}

// ── Test 11 — isolation per session: the counter/state of one session is invisible in another ──
{
  setConfig({ mode: 'once', defaultThreshold: 4, servers: {} });
  const a = 'test-iso-A-11', b = 'test-iso-B-11';
  callMcp(a, TEST_SERVER); // injected + marked seen in A
  const firstInB = callMcp(b, TEST_SERVER); // still a "1st call" in B
  ok('session B sees a 1st call independent of session A → injected', wasInjected(firstInB));
}

// ── Test 12 — TOOL granularity: docs/mcp/{server}/{tool}.md, IN ADDITION to the server ──
{
  setConfig({ mode: 'dumb', defaultThreshold: 4, servers: {} });
  const s = 'test-tool-granularity-12';
  const toolDir = path.join(DOCS_DIR, TEST_SERVER);
  fs.mkdirSync(toolDir, { recursive: true });
  fs.writeFileSync(path.join(toolDir, 'special_action.md'), '# Doc specific to special_action\n');
  const specific = callMcp(s, TEST_SERVER, 'special_action');
  const generic = callMcp(s, TEST_SERVER, 'other_action');
  ok('tool "special_action" → server doc AND tool doc concatenated', wasInjected(specific) && specific.stdout.includes('specific to special_action') && specific.stdout.includes('Test doc'));
  ok('tool "other_action" (no dedicated doc) → ONLY the server doc', wasInjected(generic) && !generic.stdout.includes('specific to special_action'));
  fs.rmSync(toolDir, { recursive: true, force: true });
}

// ── Test 13 — PARAMETER granularity (Odoo-style MCP proxy): subToolParam ──
{
  setConfig({ mode: 'dumb', defaultThreshold: 4, servers: { [TEST_SERVER]: { subToolParam: 'args.tool' } } });
  const s = 'test-subtool-13';
  const toolDir = path.join(DOCS_DIR, TEST_SERVER);
  fs.mkdirSync(toolDir, { recursive: true });
  fs.writeFileSync(path.join(toolDir, 'delete_record.md'), '# Doc specific to delete_record\nDANGER deletion.\n');
  const dangerous = callMcp(s, TEST_SERVER, 'odoo_call', { args: { tool: 'delete_record', model: 'res.partner' } });
  const safe = callMcp(s, TEST_SERVER, 'odoo_call', { args: { tool: 'search_records', model: 'res.partner' } });
  ok('sub-tool "delete_record" (parameter) → targeted doc injected', wasInjected(dangerous) && dangerous.stdout.includes('DANGER deletion'));
  ok('sub-tool "search_records" (no dedicated doc) → no DANGER doc', wasInjected(safe) && !safe.stdout.includes('DANGER deletion'));
  fs.rmSync(toolDir, { recursive: true, force: true });
}

// ── Test 14 — without subToolParam configured, the parameter is ignored (backward compat) ──
{
  setConfig({ mode: 'dumb', defaultThreshold: 4, servers: {} }); // no subToolParam
  const s = 'test-no-subtool-config-14';
  const toolDir = path.join(DOCS_DIR, TEST_SERVER);
  fs.mkdirSync(toolDir, { recursive: true });
  fs.writeFileSync(path.join(toolDir, 'delete_record.md'), '# Must never appear without config\n');
  const res = callMcp(s, TEST_SERVER, 'odoo_call', { args: { tool: 'delete_record' } });
  ok('without subToolParam configured → the args.tool parameter is ignored (no false positive)', wasInjected(res) && !res.stdout.includes('Must never appear'));
  fs.rmSync(toolDir, { recursive: true, force: true });
}

// ── Test 15 — BROKEN config.json (invalid JSON) → fail-open on the defaults, never a crash ──
{
  const s = 'test-broken-config-15';
  fs.writeFileSync(CONFIG_PATH, '{ this is not valid json !!!');
  const res = callMcp(s, TEST_SERVER);
  ok('invalid config.json → fail-open (defaults applied), no crash', res.status === 0 && wasInjected(res));
}

// ── Test 16 — existing but EMPTY doc.md (0 bytes after trim) → no injection for this level ──
{
  setConfig({ mode: 'dumb', defaultThreshold: 4, servers: {} });
  const s = 'test-empty-doc-16';
  const emptyServer = 'emptyserver1';
  const emptyPath = path.join(DOCS_DIR, `${emptyServer}.md`);
  fs.writeFileSync(emptyPath, '   \n\n  '); // whitespace only → trim() = ''
  const res = callMcp(s, emptyServer);
  ok('empty doc.md (whitespace only) → treated as absent, no injection, no crash', res.status === 0 && !wasInjected(res));
  fs.unlinkSync(emptyPath);
}

// ── Test 17 — purge of stale state/ files: old file (mtime > TTL) deleted, recent one kept ──
{
  const s = 'test-gc-old-17', keep = 'test-gc-keep-17';
  setConfig({ mode: 'once', defaultThreshold: 4, servers: {} });
  callMcp(s, TEST_SERVER);    // creates state/ctxroute-seen-test-gc-old-17.json
  callMcp(keep, TEST_SERVER); // creates state/ctxroute-seen-test-gc-keep-17.json (will stay recent)

  const oldFile = path.join(STATE_DIR, 'ctxroute-seen-test-gc-old-17.json');
  const oldMtime = (Date.now() - 60 * 24 * 60 * 60 * 1000) / 1000; // 60 days in the past
  fs.utimesSync(oldFile, oldMtime, oldMtime);

  // TTL forced to 30 days, probability forced to 1 (deterministic for the test) via env.
  callMcp('test-gc-trigger-17', TEST_SERVER, 'do_thing', {}, {
    CTXROUTE_GC_PROBABILITY: '1',
    CTXROUTE_GC_TTL_MS: String(30 * 24 * 60 * 60 * 1000),
  });

  ok('stale state file (60d > TTL 30d) → deleted by the purge', !fs.existsSync(oldFile));
  ok('recent state file → kept by the purge', fs.existsSync(path.join(STATE_DIR, `ctxroute-seen-${keep}.json`)));
}

// ── Test 18 — REAL CONCURRENCY: N PARALLEL invocations of the hook on the
// SAME session_id must lose NO write (empirical proof of the cross-process lock
// of lock.js, not just a code read). ──
function callMcpAsync(sessionId, server, tool = 'do_thing') {
  return new Promise((resolve) => {
    const p = spawn('node', [HOOK], {
      env: { ...process.env, CTXROUTE_CONFIG_PATH: CONFIG_PATH, CTXROUTE_STATE_DIR: STATE_DIR },
    });
    let out = '';
    p.stdout.on('data', (c) => (out += c));
    p.stdin.write(JSON.stringify({
      hook_event_name: 'PreToolUse',
      tool_name: `mcp__${server}__${tool}`,
      session_id: sessionId,
      tool_input: {},
    }));
    p.stdin.end();
    p.on('close', () => resolve(out));
  });
}

// ── Synchronous cleanup (before the async part — same position as the original harness) ──
try { fs.unlinkSync(TEST_DOC_PATH); } catch {}
try { fs.unlinkSync(CROSS_A_PATH); } catch {}
try { fs.unlinkSync(CROSS_B_PATH); } catch {}

const N_SERVERS = 5, N_CALLS = 20;
// ⚠️ `retry: 2` — same contract as the concurrency test of doc-inject.test.js:
//    under extreme load, the lock timeout (2 s) triggers the INTENDED FAIL-OPEN
//    (1 skipped write = availability > state). A REAL lock bug fails all
//    3 attempts. Never broaden this retry nor touch the lock timeout.
// ⚠️ vitest signature: with an options object, the timeout MUST be INSIDE the
//    options — a timeout as the last argument is IGNORED (trap experienced: death at 5 s).
test(`concurrency: ${N_CALLS} parallel calls over ${N_SERVERS} servers → NO lost write (cross-process lock)`, { retry: 2, timeout: 60000 }, async () => {
  setConfig({ mode: 'dumb', defaultThreshold: 4, servers: {} });
  // ⚠️ Lock timeout RAISED (test env, cf lock.js): this test proves
  //    ATOMICITY, not availability — under load (parallel suites),
  //    2 s expire legitimately (intended fail-open) = a false red on atomicity.
  process.env.CTXROUTE_LOCK_TIMEOUT_MS = '20000';
  const s = 'test-concurrency-18';
  const dirs = [];
  for (let i = 0; i < N_SERVERS; i++) {
    const d = path.join(DOCS_DIR, `concserver${i}`);
    fs.mkdirSync(path.dirname(d), { recursive: true });
    fs.writeFileSync(`${d}.md`, `# doc concserver${i}\n`);
    dirs.push(`${d}.md`);
  }
  const calls = [];
  for (let i = 0; i < N_CALLS; i++) calls.push(callMcpAsync(s, `concserver${i % N_SERVERS}`));
  await Promise.all(calls);

  const stateFile = path.join(STATE_DIR, `ctxroute-seen-${s}.json`);
  let seenCount = 0;
  try {
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    seenCount = Object.keys(state).filter((k) => state[k] && state[k].seen).length;
  } catch { /* seenCount stays 0 → the test fails cleanly */ }

  for (const d of dirs) { try { fs.unlinkSync(d); } catch {} }

  delete process.env.CTXROUTE_LOCK_TIMEOUT_MS; // never leak onto the other tests
  assert.ok(seenCount === N_SERVERS,
    `concurrency: ${N_CALLS} parallel calls over ${N_SERVERS} servers → NO lost write (cross-process lock)`);
});

afterAll(() => {
  // Test config = disposable tmpdir: nothing to restore in the repo.
  try { fs.rmSync(path.dirname(CONFIG_PATH), { recursive: true, force: true }); } catch {}
  // ⚠️ ㉙ — the state now lives in a tmpdir OF OUR OWN: we throw away the
  //    WHOLE directory. The old version enumerated the sessions seen so as to delete ONLY
  //    its own files, precisely because it shared the production
  //    `state/` — an enumeration that misses a file left a leftover behind.
  try { fs.rmSync(STATE_DIR, { recursive: true, force: true }); } catch {}
});
