// lifecycle-pure — WHEN THE DAEMON RUNS, AND WHO STARTS IT.
//
// 🛑 WHAT MUST BE PROVEN HERE is the fail-safe direction of every branch: a
//    mode resolved wrongly either keeps a daemon alive on a consumer machine
//    for nothing, or lets one leave where nothing will ever start it again —
//    the second is an outage with no error anywhere. The refusals, the `auto`
//    resolution and the supervisor verdict carry most of the cells.
// ⚠️ DIRECT, STATIC import of the mutated module — never `createRequire`: the
//    perTest coverage mapping misses tests reached that way.
// ⚠️ Contract values are written HARDCODED: deriving them from the module
//    would prove `x === x` and hide every mutant.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as lifecycle from '../src/lifecycle-pure.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DESKTOP = { platform: 'win32', osVersion: 'Windows 11 Home' };

test('① the vocabulary and the defaults are the published contract', () => {
  assert.deepEqual([...lifecycle.MODES], ['auto', 'on-demand', 'login']);
  assert.ok(Object.isFrozen(lifecycle.MODES), 'a mutable vocabulary moves for every caller at runtime');
  assert.equal(lifecycle.DEFAULT_MODE, 'auto');
  assert.equal(lifecycle.DEFAULT_IDLE_SECONDS, 1800);
  assert.equal(lifecycle.MAX_IDLE_SECONDS, 86400);
  assert.equal(lifecycle.WINDOWS_TASK_NAME, 'ctxroute-http');
});

test('② nothing declared resolves `auto`, never a refusal', () => {
  for (const nothing of [undefined, null]) {
    const out = lifecycle.resolveMode(nothing, DESKTOP);
    assert.equal(out.refusal, null);
    assert.equal(out.mode, 'login');
    assert.match(out.reason, /^auto: on Windows \(Windows 11 Home\)/);
  }
});

test('③ an explicit mode wins over every fact, and says it was declared', () => {
  // ⚠️ ONE flat list of cases, never a loop inside a loop (`quadratic-gate`):
  //    each mode is paired with the machine whose `auto` would pick the OTHER one.
  const SERVER = { platform: 'win32', osVersion: 'Windows Server 2022 Datacenter' };
  const LINUX = { platform: 'linux', osVersion: '#1 SMP' };
  for (const [mode, facts] of [['on-demand', SERVER], ['login', DESKTOP], ['login', LINUX], ['on-demand', DESKTOP]]) {
    const out = lifecycle.resolveMode(mode, facts);
    assert.deepEqual(out, { mode, reason: 'declared in the configuration', refusal: null });
  }
});

test('④ `auto` on EVERY Windows edition stays up from login — third parties can pause Task Scheduler', () => {
  // 🔴 MEASURED 2026-09-30: with desktops on `on-demand`, a daemon that left on
  //    idle could not come back while a security suite had the task disabled.
  //    This cell is what keeps a future "consumers deserve on-demand" edit red.
  for (const osVersion of ['Windows 11 Home', 'Windows Server 2022 Datacenter', 'Windows 10 Pro']) {
    assert.deepEqual(lifecycle.resolveMode('auto', { platform: 'win32', osVersion }), {
      mode: 'login',
      reason: `auto: on Windows (${osVersion}) nothing holds the socket and third parties can pause `
        + 'Task Scheduler, so the daemon stays up from login',
      refusal: null,
    });
  }
});

test('⑤ `on-demand` stays AVAILABLE on Windows, as an explicit choice', () => {
  assert.deepEqual(lifecycle.resolveMode('on-demand', DESKTOP),
    { mode: 'on-demand', reason: 'declared in the configuration', refusal: null });
});

test('⑥ `auto` on a socket-activated OS is on-demand, WHATEVER the edition string says', () => {
  for (const platform of ['linux', 'darwin']) {
    const out = lifecycle.resolveMode('auto', { platform, osVersion: 'Some Server Build' });
    assert.deepEqual(out, {
      mode: 'on-demand',
      reason: `auto: on ${platform} the supervisor holds the socket, so an idle exit costs nothing`,
      refusal: null,
    });
  }
});

test('⑦ an unknown mode is a NAMED refusal, never a quiet `auto`', () => {
  for (const bad of ['ondemand', 'LOGIN', '', 42, true, [], {}]) {
    const out = lifecycle.resolveMode(bad, DESKTOP);
    assert.equal(out.mode, '', `${JSON.stringify(bad)} must resolve NO mode`);
    assert.equal(out.reason, '');
    assert.equal(out.refusal,
      `\`http.lifecycle\` = ${JSON.stringify(bad)} is refused. It must be one of auto, on-demand, login.`);
  }
});

test('⑧ the idle window: absent means thirty minutes', () => {
  for (const nothing of [undefined, null]) {
    assert.deepEqual(lifecycle.idleWindow(nothing), { ms: 1800000, refusal: null });
  }
});

test('⑨ the idle window: both bounds are INCLUSIVE, one step beyond is refused', () => {
  assert.deepEqual(lifecycle.idleWindow(1), { ms: 1000, refusal: null });
  assert.deepEqual(lifecycle.idleWindow(86400), { ms: 86400000, refusal: null });
  assert.deepEqual(lifecycle.idleWindow(600), { ms: 600000, refusal: null });
  for (const out of [0, 86401, -5]) {
    assert.deepEqual(lifecycle.idleWindow(out), {
      ms: 0,
      refusal: `\`http.idleSeconds\` = ${out} is refused. It must lie between 1 and 86400.`,
    });
  }
});

test('⑩ the idle window: a non-integer is refused, never rounded', () => {
  for (const bad of [1.5, '600', NaN, Infinity, true]) {
    assert.deepEqual(lifecycle.idleWindow(bad), {
      ms: 0,
      refusal: `\`http.idleSeconds\` = ${JSON.stringify(bad)} is refused. It must be a whole number of seconds.`,
    });
  }
});

test('⑪ a window closes on EQUALITY of the activity counter, nothing else', () => {
  assert.equal(lifecycle.idleVerdict(7, 7), 'exit');
  assert.equal(lifecycle.idleVerdict(0, 0), 'exit');
  assert.equal(lifecycle.idleVerdict(7, 8), 'rearm');
  assert.equal(lifecycle.idleVerdict(8, 7), 'rearm', 'a counter that moved in ANY direction saw activity');
});

test('⑫ Windows asks Task Scheduler to RUN the task; socket-activated OSes ask nothing', () => {
  assert.deepEqual(lifecycle.ensureCommand('win32'), { file: 'schtasks', args: ['/run', '/tn', 'ctxroute-http'] });
  for (const platform of ['linux', 'darwin', 'freebsd']) {
    assert.equal(lifecycle.ensureCommand(platform), null);
  }
});

test('⑫bis the doctor probes Windows through the LANGUAGE-NEUTRAL XML; elsewhere there is no probe', () => {
  assert.deepEqual(lifecycle.supervisorQuery('win32'),
    { file: 'schtasks', args: ['/query', '/tn', 'ctxroute-http', '/xml'] });
  for (const platform of ['linux', 'darwin']) assert.equal(lifecycle.supervisorQuery(platform), null);
});

// The measured shape: `schtasks /query /tn <task> /xml` on a task disabled by
// `Disable-ScheduledTask` (Windows 11, 2026-09-29) — a TRIGGER-level
// `<Enabled>true</Enabled>` sits BEFORE the settings, which is exactly the
// element a careless reader would judge.
const TASK = (settingsBody) => '<?xml version="1.0" encoding="UTF-16"?>\r\n<Task>\r\n  <Triggers>\r\n'
  + '    <LogonTrigger>\r\n      <Enabled>true</Enabled>\r\n    </LogonTrigger>\r\n  </Triggers>\r\n'
  + `  <Settings>\r\n${settingsBody}  </Settings>\r\n</Task>\r\n`;

test('⑬ a DISABLED task is disarmed, and the reason names the cause and the remedy', () => {
  const xml = TASK('    <DisallowStartIfOnBatteries>true</DisallowStartIfOnBatteries>\r\n'
    + '    <Enabled>false</Enabled>\r\n    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>\r\n');
  const out = lifecycle.supervisorVerdict('win32', xml);
  assert.equal(out.verdict, 'disarmed');
  assert.match(out.reason, /^the scheduled task "ctxroute-http" is DISABLED — nothing can start the daemon\. /);
  assert.match(out.reason, /do not disturb/);
  assert.match(out.reason, /is a known cause \(README, "Known issues"\); re-enable the task and exempt it there\.$/);
});

test('⑬bis the LIVE notice needs THREE facts: a failed request, a DISABLED task, a daemon the kernel REFUSES', () => {
  const disarmed = { verdict: 'disarmed', reason: 'the scheduled task "ctxroute-http" is DISABLED — x.' };
  const expected = 'ctxroute: the daemon could not be started — the scheduled task "ctxroute-http" is DISABLED — x. '
    + 'Until then, agents act WITHOUT the knowledge ctxroute delivers.';
  assert.equal(lifecycle.ensureNotice(1, disarmed, true), expected);
  assert.equal(lifecycle.ensureNotice(null, disarmed, true), expected,
    'a request that could not even report a status is still a failed request');
  assert.equal(lifecycle.ensureNotice(0, disarmed, true), null, 'a request that succeeded never nags');
  // 🔴 THE LIE THIS CLOSES (measured 2026-09-30): a task disabled under a daemon
  //    that still ANSWERS is not an outage — a security suite does it at every
  //    screenshot. Only the kernel's refusal may speak.
  for (const answer of [false, null]) {
    assert.equal(lifecycle.ensureNotice(1, disarmed, answer), null,
      `daemonRefused=${answer}: never claim agents work blind while the daemon may answer`);
  }
  for (const verdict of ['armed', 'unmeasured']) {
    assert.equal(lifecycle.ensureNotice(1, { verdict, reason: 'r' }, true), null,
      `${verdict}: an adopter supervising another way must never be told a guess`);
  }
});

test('⑭ an enabled task is armed — absent `<Enabled>` in settings means enabled', () => {
  const explicit = TASK('    <Enabled>true</Enabled>\r\n');
  const implicit = TASK('    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>\r\n');
  for (const xml of [explicit, implicit]) {
    assert.deepEqual(lifecycle.supervisorVerdict('win32', xml),
      { verdict: 'armed', reason: 'the scheduled task "ctxroute-http" is enabled' });
  }
});

test('⑭bis a settings block at the VERY START of the text is still read', () => {
  assert.equal(lifecycle.supervisorVerdict('win32', '<Settings><Enabled>false</Enabled></Settings>').verdict,
    'disarmed', 'index 0 is a found tag, not a missing one');
  assert.equal(lifecycle.supervisorVerdict('win32', '<Settings></Settings>').verdict, 'armed');
});

test('⑮ only `<Settings>` decides: a disabled TRIGGER does not disarm the task', () => {
  const xml = '<Task><Triggers><LogonTrigger><Enabled>false</Enabled></LogonTrigger></Triggers>'
    + '<Settings><Enabled>true</Enabled></Settings>'
    + '<Actions><Exec><Enabled>false</Enabled></Exec></Actions></Task>';
  assert.equal(lifecycle.supervisorVerdict('win32', xml).verdict, 'armed');
});

test('⑯ no task, or a definition without settings, is UNMEASURED — never armed, never a false alarm', () => {
  assert.deepEqual(lifecycle.supervisorVerdict('win32', null), {
    verdict: 'unmeasured',
    reason: 'the scheduler returned no task "ctxroute-http" — if the daemon is supervised another way, '
      + 'nothing here can judge it (service/install-windows.ps1 registers it)',
  });
  for (const xml of ['<Task></Task>', '', '<Task></Settings><Settings></Task>', '<Task><Settings>',
    '<Task></Settings></Task>']) {
    assert.deepEqual(lifecycle.supervisorVerdict('win32', xml),
      { verdict: 'unmeasured', reason: 'the task definition carries no <Settings> block' },
      `${JSON.stringify(xml)} must never read as armed`);
  }
});

test('⑰ Linux and macOS are UNMEASURED, said out loud — never armed by default', () => {
  for (const platform of ['linux', 'darwin']) {
    assert.deepEqual(lifecycle.supervisorVerdict(platform, TASK('    <Enabled>true</Enabled>\r\n')),
      { verdict: 'unmeasured', reason: `no supervisor probe exists for ${platform} yet` });
  }
});

test('⑱ DRIFT: the Windows installer registers the task under the SAME name', () => {
  const installer = fs.readFileSync(path.join(REPO, 'service', 'install-windows.ps1'), 'utf8');
  const declared = installer.match(/^\$TaskName\s*=\s*'([^']+)'/m);
  assert.ok(declared, 'install-windows.ps1 must still declare `$TaskName` — the anchor of this drift test');
  assert.equal(declared[1], lifecycle.WINDOWS_TASK_NAME,
    'two spellings of one task name: the hook would ask the scheduler to run a task nobody registered');
});
