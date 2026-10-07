// The `wrapUp` option in the WIRING, and the one promise it makes about
// compaction. Inputs copied from the real manifest (`wiring.json`).
import { test, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// 🛑 STATIC ESM IMPORT (Stryker resolves coverage through the ESM graph).
import { plan } from '../src/wiring-plan.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, 'wiring.json'), 'utf8'));
const WRAP_UP_STOP = MANIFEST.consumers.find((c) => c.module === 'src/hooks/wrap-up-stop.js');

const machine = (over = {}) => ({
  root: 'C:/fixture/ctxroute',
  frames: 2,
  host: '127.0.0.1',
  port: 8787,
  routePath: '/pretool',
  laneFlag: '--client',
  stateConsumers: ['ctxroute-reset.js'],
  settingsPath: 'C:/fixture/settings.json',
  ...over,
});
const manifest = (consumers) => ({
  stateLane: 'client',
  bounds: { gateHookTimeoutSeconds: 7 },
  consumers: [
    { module: 'src/hooks/ctxroute-reset.js', event: 'PreCompact', matcher: null, timeout: 5 },
    ...consumers,
  ],
});

test('the real manifest declares the end-of-turn shell as an opt-in, on Stop only', () => {
  expect(WRAP_UP_STOP).toBeDefined();
  expect(WRAP_UP_STOP.event).toBe('Stop');
  expect(WRAP_UP_STOP.optIn).toBe('wrapUp');
  expect(MANIFEST.consumers.filter((c) => c.optIn !== undefined && c.event === 'PreCompact')).toEqual([]);
});

test('option OFF ⇒ the opt-in consumer produces NO declaration, the rest is byte-identical', () => {
  const without = plan(manifest([]), machine({ optIns: { wrapUp: false } }));
  const withOff = plan(manifest([WRAP_UP_STOP]), machine({ optIns: { wrapUp: false } }));
  expect(JSON.stringify(withOff)).toBe(JSON.stringify(without));
});

test('option ON ⇒ exactly one Stop declaration, its own bound, no lane argument', () => {
  const out = plan(manifest([WRAP_UP_STOP]), machine({ optIns: { wrapUp: true } }));
  const stop = out.filter((d) => d.event === 'Stop');
  expect(stop).toEqual([{
    event: 'Stop', matcher: null, type: 'command',
    command: 'node C:/fixture/ctxroute/src/hooks/wrap-up-stop.js', timeout: 600,
  }]);
});

const WRAP_UP_TOUCH = MANIFEST.consumers.find((c) => c.module === 'src/hooks/wrap-up-touch.js');

test('the write recorder is an opt-in of the SAME option, on the file-writing tools only', () => {
  expect(WRAP_UP_TOUCH).toBeDefined();
  expect(WRAP_UP_TOUCH.event).toBe('PostToolUse');
  expect(WRAP_UP_TOUCH.optIn).toBe('wrapUp');
  // The tools whose path parameters `harness-profile.WRAP_UP.claudeCode.touch` names.
  expect(WRAP_UP_TOUCH.matcher).toBe('Write|Edit|NotebookEdit');
  const withOff = plan(manifest([WRAP_UP_TOUCH, WRAP_UP_STOP]), machine({ optIns: { wrapUp: false } }));
  expect(JSON.stringify(withOff)).toBe(JSON.stringify(plan(manifest([]), machine({ optIns: { wrapUp: false } }))));
  const on = plan(manifest([WRAP_UP_TOUCH, WRAP_UP_STOP]), machine({ optIns: { wrapUp: true } }));
  expect(on.filter((d) => d.event === 'PostToolUse')).toEqual([{
    event: 'PostToolUse', matcher: 'Write|Edit|NotebookEdit', type: 'command',
    command: 'node C:/fixture/ctxroute/src/hooks/wrap-up-touch.js', timeout: 5,
  }]);
});

test('an UNKNOWN option name is a NAMED refusal, never a silent "off"', () => {
  const typo = { ...WRAP_UP_STOP, optIn: 'wrap-up' };
  expect(() => plan(manifest([typo]), machine({ optIns: { wrapUp: true } })))
    .toThrow('`src/hooks/wrap-up-stop.js`: unknown `optIn` "wrap-up" — known options: wrapUp');
  expect(() => plan(manifest([WRAP_UP_STOP]), machine()))
    .toThrow('unknown `optIn` "wrapUp" — known options: (none)');
  expect(() => plan(manifest([{ ...WRAP_UP_STOP, optIn: 1 }]), machine({ optIns: { wrapUp: true } })))
    .toThrow('unknown `optIn` 1');
});

test('the generator, run for real, writes the same bytes whether the option is absent or off', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wrap-up-wiring-'));
  try {
    const gen = (wrapUp, name) => {
      const cfg = path.join(dir, `${name}.json`);
      fs.writeFileSync(cfg, JSON.stringify({ frames: 2, ...(wrapUp === undefined ? {} : { wrapUp }) }));
      const out = path.join(dir, `${name}-out.json`);
      const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'wiring-generate.js'),
        '--out', out, '--root', 'C:/fixture/ctxroute', '--settings', 'C:/fixture/settings.json', '--quiet'],
      { env: { ...process.env, CTXROUTE_CONFIG_PATH: cfg }, encoding: 'utf8' });
      expect(r.status, r.stderr).toBe(0);
      return fs.readFileSync(out, 'utf8');
    };
    const absent = gen(undefined, 'absent');
    expect(gen({ enabled: false }, 'off')).toBe(absent);
    const on = gen({ enabled: true }, 'on');
    expect(on).not.toBe(absent);
    expect(JSON.parse(on).declarations.filter((d) => d.event === 'Stop').length).toBe(1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('NO path of this repository blocks a compaction: every PreCompact consumer, run for real on an AUTO compaction', () => {
  // 🛑 Official Claude Code doc (read 2026-10-04): a blocked compaction "stops processing and
  //    asks you what to do" — a human in the loop. Derived from the manifest, so a consumer added
  //    tomorrow on PreCompact is judged by this cell the day it is declared.
  const consumers = MANIFEST.consumers.filter((c) => c.event === 'PreCompact');
  expect(consumers.length).toBeGreaterThan(0);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wrap-up-precompact-'));
  try {
    fs.mkdirSync(path.join(dir, 'state'));
    const cfg = path.join(dir, 'cfg.json');
    fs.writeFileSync(cfg, JSON.stringify({ frames: 1, stateDir: path.join(dir, 'state'), wrapUp: { enabled: true } }));
    for (const c of consumers) {
      const r = spawnSync(process.execPath, [path.join(ROOT, c.module)], {
        input: JSON.stringify({ session_id: 's', hook_event_name: 'PreCompact', trigger: 'auto', cwd: dir }),
        env: { ...process.env, CTXROUTE_CONFIG_PATH: cfg, CTXROUTE_STATE_DIR: path.join(dir, 'state') },
        encoding: 'utf8',
      });
      expect(r.status, c.module).not.toBe(2);
      const out = r.stdout.trim();
      if (out.startsWith('{')) {
        const json = JSON.parse(out);
        expect(json.decision, c.module).not.toBe('block');
        expect(json.continue, c.module).not.toBe(false);
      }
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the end-of-turn shell refuses NOTHING when handed a compaction', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wrap-up-precompact-'));
  try {
    fs.mkdirSync(path.join(dir, 'state'));
    const cfg = path.join(dir, 'cfg.json');
    fs.writeFileSync(cfg, JSON.stringify({ frames: 1, stateDir: path.join(dir, 'state'), wrapUp: { enabled: true } }));
    const r = spawnSync(process.execPath, [path.join(ROOT, 'src', 'hooks', 'wrap-up-stop.js')], {
      input: JSON.stringify({ session_id: 's', hook_event_name: 'PreCompact', trigger: 'auto', cwd: dir }),
      env: { ...process.env, CTXROUTE_CONFIG_PATH: cfg, CTXROUTE_STATE_DIR: path.join(dir, 'state') },
      encoding: 'utf8',
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
