// ═══════════════════════════════════════════════════════════════════════
// Integration of the TURN gateway (turn-count.js, UserPromptSubmit) — real spawn.
// ⚠️ MUTE BY CONTRACT: on UserPromptSubmit, any stdout becomes CONTEXT
//    injected next to the prompt — each test checks stdout is EMPTY, always.
// ═══════════════════════════════════════════════════════════════════════

import { test, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HOOK = path.join(__dirname, '..', 'src', 'hooks', 'turn-count.js');

function makeEnv(extra = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'turn-count-test-'));
  const stateDir = path.join(tmp, 'state');
  const configPath = path.join(tmp, 'config.json');
  return {
    tmp,
    stateDir,
    configPath,
    env: {
      ...process.env,
      CTXROUTE_CONFIG_PATH: configPath,
      CTXROUTE_STATE_DIR: stateDir,
      ...extra,
    },
  };
}

function run(env, payload) {
  return spawnSync(process.execPath, [HOOK], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8',
    env,
    timeout: 30000,
  });
}

function readTurns(stateDir, sessionId) {
  return JSON.parse(fs.readFileSync(path.join(stateDir, `turn-count-${sessionId}.json`), 'utf8')).turns;
}

test('each turn increments the counter by 1, stdout ALWAYS empty (UserPromptSubmit contract)', () => {
  const { stateDir, env, tmp } = makeEnv();
  try {
    for (let i = 1; i <= 3; i++) {
      const r = run(env, { hook_event_name: 'UserPromptSubmit', session_id: 'sess-a', prompt: 'x' });
      expect(r.status).toBe(0);
      expect((r.stdout || '').trim()).toBe(''); // any stdout here = pollution of EVERY turn
      expect(readTurns(stateDir, 'sess-a')).toBe(i);
    }
    // ISOLATED sessions: counting sess-b does not touch sess-a.
    run(env, { hook_event_name: 'UserPromptSubmit', session_id: 'sess-b', prompt: 'x' });
    expect(readTurns(stateDir, 'sess-a')).toBe(3);
    expect(readTurns(stateDir, 'sess-b')).toBe(1);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('enabled: false switches off the counter like the rest of the framework', () => {
  const { stateDir, configPath, env, tmp } = makeEnv();
  try {
    fs.writeFileSync(configPath, JSON.stringify({ enabled: false }));
    const r = run(env, { hook_event_name: 'UserPromptSubmit', session_id: 'sess-off', prompt: 'x' });
    expect(r.status).toBe(0);
    expect(fs.existsSync(path.join(stateDir, 'turn-count-sess-off.json'))).toBe(false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('FAIL-OPEN: garbage stdin and corrupted store → silent exit 0, counter restarts from 0', () => {
  const { stateDir, env, tmp } = makeEnv();
  try {
    // garbage stdin: exit 0, nothing written.
    const r1 = run(env, 'this is not JSON');
    expect(r1.status).toBe(0);
    expect((r1.stdout || '').trim()).toBe('');
    // corrupted store = start from 0 (never a crash): the next turn writes 1.
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(path.join(stateDir, 'turn-count-sess-c.json'), '{corrompu');
    const r2 = run(env, { hook_event_name: 'UserPromptSubmit', session_id: 'sess-c', prompt: 'x' });
    expect(r2.status).toBe(0);
    expect(readTurns(stateDir, 'sess-c')).toBe(1);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('ctxroute-reset.js (PreCompact) ALSO resets the turn counter to zero', () => {
  const { stateDir, env, tmp } = makeEnv();
  try {
    run(env, { hook_event_name: 'UserPromptSubmit', session_id: 'sess-r', prompt: 'x' });
    expect(readTurns(stateDir, 'sess-r')).toBe(1);
    const rr = spawnSync(process.execPath, [path.join(__dirname, '..', 'src', 'hooks', 'ctxroute-reset.js')], {
      input: JSON.stringify({ hook_event_name: 'PreCompact', session_id: 'sess-r', trigger: 'auto' }),
      encoding: 'utf8',
      env,
      timeout: 30000,
    });
    expect(rr.status).toBe(0);
    expect(fs.existsSync(path.join(stateDir, 'turn-count-sess-r.json'))).toBe(false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
