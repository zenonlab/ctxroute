// ═══════════════════════════════════════════════════════════════════════
// Integration of the TURN gateway (turn-count.js, UserPromptSubmit) — real spawn.
// ⚠️ MUTE BY CONTRACT: on UserPromptSubmit, any stdout becomes CONTEXT
//    injected next to the prompt — each test checks stdout is EMPTY, always.
// ═══════════════════════════════════════════════════════════════════════

import { test, expect } from 'vitest';
import { spawnSync, fork } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { endpoint } = require('../src/kernel-endpoint.js');

const HOOK = path.join(__dirname, '..', 'src', 'hooks', 'turn-count.js');
const RACINE = path.join(__dirname, '..');

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

function run(env, payload, args = []) {
  return spawnSync(process.execPath, [HOOK, ...args], {
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

// ═══════════════════════════════════════════════════════════════════════
// A REFUSED CONNECTION IS SAID OUT LOUD — with its CONTROL (2026-08-22)
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 THE SILENCE THIS CELL EXISTS FOR. A declaration wired on the `http`
//    transport runs NOTHING when the authority cannot be reached: the harness
//    takes the refusal and moves on, so no code of ours is alive to complain and
//    the agent acts without the knowledge it was owed — no error, no badge,
//    nothing red. The canary cannot see it either: with nothing emitted there is
//    no denominator, hence `undecidable`, hence silence.
// 🛑 THE CONTROL IS NOT OPTIONAL, IT IS WHAT MAKES THE CELL MEAN ANYTHING. A
//    witness stuck on "I always shout" would pass the red half and be worse than
//    no witness at all. So: nobody at the address ⇒ it SPEAKS · a REAL daemon at
//    the SAME address ⇒ TOTAL silence, and the turn really recorded.
// ⚠️ NO TIMER ANYWHERE. An address nobody owns answers `ECONNREFUSED`/`ENOENT`
//    from the kernel, immediately; the daemon announces itself over IPC. If this
//    cell ever needs a delay to pass, something started guessing.
// ⚠️ THE SENTENCE IS WRITTEN OUT IN FULL, copied from the source — reading it
//    back from the module under test would prove `x === x`.
const REFUSAL = '⚠️ ctxroute: the kernel REFUSED the connection to this '
  + 'framework\'s state address. That is all this hook observed — no cause is claimed. '
  + 'Said once per session.';

/**
 * THE REAL PRODUCTION DAEMON SHAPE: a write-through cache over the disk store,
 * so what it records is OBSERVABLE — which is what stops the control cell from
 * passing on a daemon that holds nothing.
 * 🛑 A DAEMON THAT FAILS TO BIND MUST SAY SO, NOT TIME OUT: an unobservable
 *    failure costs one round trip per hypothesis.
 */
function startDaemon(tmp, address, env) {
  const file = path.join(tmp, 'daemon.cjs');
  const abs = (...p) => JSON.stringify(path.join(RACINE, ...p).replace(/\\/g, '/'));
  fs.writeFileSync(file, `
'use strict';
const { createServer } = require(${abs('src', 'hooks', 'http-server.js')});
const { createMemoryStore } = require(${abs('src', 'memory-store.js')});
const disque = require(${abs('src', 'session-store.js')});
const { bind } = require(${abs('src', 'kernel-bind.js')});
const store = createMemoryStore({ snapshotPath: null, durableStore: disque });
const srv = createServer({ store });
bind(srv, process.argv[2], () => process.send('pret'), (e) => process.send('erreur:' + e.code));
process.on('message', (m) => { if (m === 'stop') { srv.close(); process.exit(0); } });
`);
  return new Promise((pret, failure) => {
    const d = fork(file, [address], { env, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    let complaint = '';
    if (d.stderr) d.stderr.on('data', (b) => { complaint += b; });
    d.on('message', (m) => {
      if (m === 'pret') { pret(d); return; }
      failure(new Error(`the daemon could not take ${JSON.stringify(address)}: ${m}`));
    });
    d.on('exit', (code) => failure(new Error(
      `the daemon exited (code ${code}) without ever listening.\n--- stderr ---\n${complaint.trim() || '(nothing)'}`)));
  });
}

test('CLIENT LANE: a REFUSED connection is SAID once per session — and TOTAL silence when the authority answers',
  { timeout: 30000 }, async () => {
    const { env, tmp, stateDir } = makeEnv();
    const address = endpoint({ stateDir: tmp });
    try {
      // ── ① NOBODY OWNS THE ADDRESS: the kernel refuses, the hook says so. ──
      const r1 = run(env, { hook_event_name: 'UserPromptSubmit', session_id: 'sess-refus', prompt: 'x' },
        ['--client', address]);
      expect(r1.status).toBe(0); // fail-open: a witness NEVER costs a turn
      // ⚠️ NAMED FIRST, PARSED SECOND: a bare `JSON.parse('')` reds with
      //    "Unexpected end of JSON input", which says nothing about the defect.
      //    The defect is SILENCE, and the red must say so.
      expect((r1.stdout || '').trim(),
        'THE SILENCE IS BACK: the kernel refused the connection and this hook said NOTHING. '
        + 'On the http transport no code of ours runs at all when the authority is unreachable, '
        + 'so this spawned client is the only witness left — mute, the agent acts without the '
        + 'knowledge it was owed, with no error, no badge and nothing red.').not.toBe('');
      const outputOf = JSON.parse(r1.stdout);
      expect(outputOf.systemMessage).toBe(REFUSAL);
      // 🛑 IT SPEAKS WITHOUT DECIDING: `systemMessage` ALONE — no
      //    `hookSpecificOutput`, no `decision`, no `permissionDecision`. A notice
      //    that carried a decision would authorise (or block) the user's prompt
      //    as a SIDE EFFECT of a warning.
      expect(Object.keys(outputOf)).toEqual(['systemMessage']);

      // ── ② ONCE PER SESSION: still refused, and now silent. ──
      const r2 = run(env, { hook_event_name: 'UserPromptSubmit', session_id: 'sess-refus', prompt: 'x' },
        ['--client', address]);
      expect(r2.status).toBe(0);
      expect((r2.stdout || '').trim()).toBe(''); // a permanent alarm becomes wallpaper

      // ── ③ CONTROL — THE CELL PROVES NOTHING WITHOUT THIS HALF. ──
      // A REAL daemon at the SAME address, a FRESH scope (an already-flagged
      // scope would be silent for the WRONG reason, i.e. vacuously).
      const daemon = await startDaemon(tmp, address, env);
      try {
        const r3 = run(env, { hook_event_name: 'UserPromptSubmit', session_id: 'sess-vivant', prompt: 'x' },
          ['--client', address]);
        expect(r3.status).toBe(0);
        expect((r3.stdout || '').trim(),
          'THE WITNESS CRIES ON A HEALTHY SYSTEM: a daemon is listening at this very address and '
          + 'answered, yet the hook still announced a refusal. A witness stuck on "I always shout" '
          + 'passes the red half above while proving nothing — and an alarm that is always on gets '
          + 'unplugged, which costs the real one too.').toBe('');
        // ANTI-VACUITY: silence must mean "the authority answered", never "the
        // hook did nothing at all" — the authority really counted the turn.
        expect(readTurns(stateDir, 'sess-vivant')).toBe(1);
      } finally {
        daemon.send('stop');
      }
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
