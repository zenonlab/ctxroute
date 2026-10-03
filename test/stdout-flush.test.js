// ═══════════════════════════════════════════════════════════════════════
// A HOOK THAT SPEAKS MORE THAN A PIPE HOLDS IS STILL HEARD WHOLE (2026-10-01)
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 THE DEFECT, MEASURED ON LINUX (node 22.15.1): `console.log(500 KB);
//    process.exit(0)` piped into a reader delivered EXACTLY 65,536 bytes, three
//    runs out of three. The harness received half a JSON document, could not
//    parse it, and the injection vanished — exit 0, nothing red. Windows
//    delivered every byte (8 out of 8), which is why it went unseen here.
//    Cure and doc citation: `src/stdout-exit.js`.
//
// ⚠️ EVERY CELL IS A REAL SPAWN THROUGH A REAL PIPE — the defect lives between
//    the process and the kernel, so an in-memory call of the dialect proves
//    nothing about it. The payload is >64 KB on purpose: a pipe buffer is
//    64 KB on Linux, and anything below it fits whole without ever flushing.
// ⚠️ HONEST PLATFORM NOTE: on Windows these cells pass with or without the
//    cure (measured). They turn RED on Linux/macOS without it — the CI runners
//    of `test.yml` are where this suite earns its keep.
//
// 🔑 WHICH HOOK REALLY SPEAKS THAT MUCH, measured 2026-10-01:
//    · Codex PreToolUse (`codex-doc-inject.js --budget 0`) and SessionStart
//      (`session-inject.js --budget 0`): `0` = "this harness bounds nothing",
//      the real Codex wiring (`budget-declare-gate`). >64 KB is ROUTINE there.
//    · Claude Code PreToolUse (`doc-inject.js`): the shell caps each process at
//      `HOOK_OUTPUT_BUDGET.claudeCode` (8,000 c today, ~8.2 KB on the wire).
//      That figure is a THIRD PARTY's fact and already moved once (2026-08-31),
//      so the shell must not DEPEND on it: the cell drives its client lane, where
//      the shell prints whatever the authority hands it, verbatim. The answer is
//      shaped by the shell's OWN exported dialect — exactly what the daemon does.
// ═══════════════════════════════════════════════════════════════════════

import { test, expect, beforeEach, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { endpoint } = require('../src/kernel-endpoint.js');
const { bind } = require('../src/kernel-bind.js');
const claudeDialect = require('../src/hooks/doc-inject.js');

const HOOKS = path.join(__dirname, '..', 'src', 'hooks');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'stdout-flush-test-'));
const DOCS = path.join(TMP, 'docs');
const SESSION_DOCS = path.join(TMP, 'session');
const STATE = path.join(TMP, 'state');
const CONFIG = path.join(TMP, 'config.json');

// 4× a Linux pipe buffer: no chance of fitting by luck.
const PIPE_BUFFER = 64 * 1024;
const BODY = 'Z'.repeat(4 * PIPE_BUFFER);

function spawnHook(file, args, payload) {
  return new Promise((resolve) => {
    const child = execFile(process.execPath, [path.join(HOOKS, file), ...args], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      env: {
        ...process.env,
        CTXROUTE_FILEDOCS_DIR: DOCS,
        CTXROUTE_SESSIONDOCS_DIR: SESSION_DOCS,
        CTXROUTE_STATE_DIR: STATE,
        CTXROUTE_CONFIG_PATH: CONFIG,
      },
    }, (err, stdout) => resolve({ code: err ? err.code : 0, stdout }));
    child.stdin.end(JSON.stringify(payload));
  });
}

/**
 * The verdict, named BEFORE parsing: a bare `JSON.parse` on a cut document
 * reds with "Unterminated string", which says nothing about the defect.
 */
function parsedWhole(stdout) {
  expect(stdout.length, 'the hook printed less than one pipe buffer — the cell measures nothing')
    .toBeGreaterThan(PIPE_BUFFER);
  let out;
  try {
    out = JSON.parse(stdout);
  } catch (e) {
    throw new Error(`TRUNCATED OUTPUT: ${stdout.length} bytes reached the reader and they are not one `
      + `JSON document (${e.message}). The process exited before stdout drained — the harness `
      + 'drops the whole injection, in silence. Print through `src/stdout-exit.js`.');
  }
  return out;
}

beforeEach(() => {
  for (const d of [DOCS, SESSION_DOCS, STATE]) fs.rmSync(d, { recursive: true, force: true });
  fs.mkdirSync(DOCS, { recursive: true });
  fs.mkdirSync(SESSION_DOCS, { recursive: true });
});

afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

test('CODEX PreToolUse (`--budget 0`): a >64 KB injection reaches the reader WHOLE, exit 0', async () => {
  fs.writeFileSync(path.join(DOCS, 'big.md'), `---\nmatch: server.js\nmode: dumb\n---\n${BODY}\n`);
  const { code, stdout } = await spawnHook('codex-doc-inject.js', ['--budget', '0'],
    { tool_name: 'Bash', tool_input: { command: 'cat /proj/server.js' }, session_id: 'flush-codex', cwd: '/proj' });
  expect(code).toBe(0);
  const out = parsedWhole(stdout);
  expect(out.hookSpecificOutput.additionalContext).toContain(BODY);
});

test('SessionStart (`--budget 0`): a >64 KB session corpus reaches the reader WHOLE, exit 0', async () => {
  fs.writeFileSync(path.join(SESSION_DOCS, 'big.md'), `${BODY}\n`);
  const { code, stdout } = await spawnHook('session-inject.js', ['--budget', '0'],
    { hook_event_name: 'SessionStart', session_id: 'flush-session', source: 'startup' });
  expect(code).toBe(0);
  const out = parsedWhole(stdout);
  expect(out.hookSpecificOutput.hookEventName).toBe('SessionStart');
  expect(out.hookSpecificOutput.additionalContext).toContain(BODY);
});

test('CLAUDE CODE PreToolUse (client lane): a >64 KB answer of the authority is printed WHOLE, exit 0',
  { timeout: 30000 }, async () => {
    // The authority's answer, shaped by the shell's own exported dialect — the
    // daemon formats through this very function, never a twin of it.
    const answer = JSON.stringify(claudeDialect.output('allow', BODY, '📄 doc: big'));
    const server = http.createServer((req, res) => {
      req.resume();
      req.on('end', () => {
        res.setHeader('content-type', 'application/json');
        res.end(answer);
      });
    });
    const address = endpoint({ stateDir: TMP });
    // 🛑 A server that fails to bind must SAY so, never time out.
    await new Promise((ok, ko) => bind(server, address, ok, (e) => ko(new Error(`stub authority could not bind ${address}: ${e.code}`))));
    try {
      const { code, stdout } = await spawnHook('doc-inject.js', ['--client', address],
        { tool_name: 'Bash', tool_input: { command: 'cat /proj/server.js' }, session_id: 'flush-claude', tool_use_id: 'toolu_flush' });
      expect(code).toBe(0);
      const out = parsedWhole(stdout);
      expect(out.hookSpecificOutput.permissionDecision).toBe('allow');
      expect(out.hookSpecificOutput.additionalContext).toBe(BODY);
    } finally {
      await new Promise((done) => server.close(() => done()));
    }
  });

test('CLI EXIT (`exitAfterFlush`): >64 KB on stdout AND stderr both arrive whole, and a non-zero code survives', async () => {
  // ⚠️ The shape every `tools/`/`service/` entry point now has: write a report on
  //    both streams, then leave with a failure code. Driven through the REAL module
  //    in a REAL child, never a twin of it.
  const cure = JSON.stringify(path.join(__dirname, '..', 'src', 'stdout-exit.js'));
  const src = `const big = 'Z'.repeat(${4 * PIPE_BUFFER});`
    + 'console.log(big); console.error(big);'
    + `require(${cure}).exitAfterFlush(3);`;
  const { code, stdout, stderr } = await new Promise((resolve) => {
    execFile(process.execPath, ['-e', src], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
      (err, out, errOut) => resolve({ code: err ? err.code : 0, stdout: out, stderr: errOut }));
  });
  expect(code, 'the requested exit code must survive the flush').toBe(3);
  expect(stdout.length, 'stdout was cut before the exit').toBe(4 * PIPE_BUFFER + 1);
  expect(stderr.length, 'stderr was cut before the exit').toBe(4 * PIPE_BUFFER + 1);
});

test('CONTROL — the silent path still leaves at once: no match ⇒ empty stdout, exit 0', async () => {
  fs.writeFileSync(path.join(DOCS, 'big.md'), `---\nmatch: server.js\nmode: dumb\n---\n${BODY}\n`);
  for (const [file, args] of [['codex-doc-inject.js', ['--budget', '0']], ['doc-inject.js', []]]) {
    const { code, stdout } = await spawnHook(file, args,
      { tool_name: 'Bash', tool_input: { command: 'ls /elsewhere' }, session_id: 'flush-silent', tool_use_id: 'toolu_silent' });
    expect(code, file).toBe(0);
    expect(stdout.trim(), file).toBe('');
  }
});
