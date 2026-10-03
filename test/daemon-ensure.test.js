// daemon-ensure — a session asks the OS supervisor to have the daemon up, and
// tells the USER, live, when the daemon is really down and cannot be started.
//
// 🛑 WHAT MUST BE PROVEN: ① a healthy prompt costs ONE request and prints
//    nothing · ② nothing is asked on socket-activated OSes · ③ a failed request,
//    a DISABLED task and a daemon the kernel REFUSES produce the exact notice ·
//    ④ a disabled task under a daemon that still ANSWERS stays silent (measured
//    2026-09-30: a security suite does that at every screenshot) · ⑤ every other
//    failure stays silent · ⑥ the kernel probe answers true/false on a real
//    refused/accepted connection · ⑦ as a REAL process it never prints plain
//    text and exits 0.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import net from 'node:net';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as hook from '../src/hooks/daemon-ensure.js';
import { freePort } from './support/free-port.js';

const HOOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'hooks', 'daemon-ensure.js');
const RUN = { file: 'schtasks', args: ['/run', '/tn', 'ctxroute-http'] };
const QUERY = ['/query', '/tn', 'ctxroute-http', '/xml'];
// The measured XML shape of a task disabled by a third party (2026-09-29).
const DISABLED_XML = '<Task><Triggers><LogonTrigger><Enabled>true</Enabled></LogonTrigger></Triggers>'
  + '<Settings><Enabled>false</Enabled></Settings></Task>';
const ENABLED_XML = '<Task><Settings><Enabled>true</Enabled></Settings></Task>';

/** A scripted scheduler: the run answers `runStatus`, the query answers `query`. */
const scheduler = (runStatus, query) => {
  const calls = [];
  const run = (file, args, options) => {
    calls.push({ file, args, options });
    if (args[0] === '/run') {
      if (runStatus === 'throw') throw new Error('ENOENT schtasks');
      return { status: runStatus };
    }
    if (query === 'throw') throw new Error('ENOENT schtasks');
    return query;
  };
  return { run, calls };
};
const kernel = (answer) => {
  let asked = 0;
  return { refused: async () => { asked += 1; if (answer === 'throw') throw new Error('x'); return answer; }, asked: () => asked };
};

test('① healthy Windows prompt: ONE request, bounded, windowless, and no notice', async () => {
  const s = scheduler(0, null);
  const k = kernel(true);
  assert.deepEqual(await hook.ensure('win32', s.run, k.refused), { asked: RUN, notice: null });
  assert.deepEqual(s.calls, [{
    file: 'schtasks', args: RUN.args, options: { stdio: 'ignore', windowsHide: true, timeout: 5000 },
  }], 'a healthy prompt must never pay the diagnostic query too');
  assert.equal(k.asked(), 0, 'nor the kernel probe');
});

test('② Linux and macOS: the unit holds the socket, so NOTHING is asked', async () => {
  for (const platform of ['linux', 'darwin']) {
    const s = scheduler(0, null);
    assert.deepEqual(await hook.ensure(platform, s.run, kernel(true).refused), { asked: null, notice: null });
    assert.equal(s.calls.length, 0, `${platform}: a second start mechanism beside socket activation is refused`);
  }
});

test('③ failed request + DISABLED task + daemon REFUSED: the user is told', async () => {
  for (const runStatus of [1, 'throw']) {
    const s = scheduler(runStatus, { status: 0, stdout: DISABLED_XML });
    const out = await hook.ensure('win32', s.run, kernel(true).refused);
    assert.deepEqual(out.asked, RUN);
    assert.match(out.notice, /^ctxroute: the daemon could not be started — the scheduled task "ctxroute-http" is DISABLED/);
    assert.match(out.notice, /Until then, agents act WITHOUT the knowledge ctxroute delivers\.$/);
    assert.deepEqual(s.calls[1].args, QUERY);
    assert.deepEqual(s.calls[1].options, { encoding: 'utf8', windowsHide: true, timeout: 5000 });
  }
});

test('④ a DISABLED task under a daemon that still ANSWERS stays silent', async () => {
  for (const answer of [false, null, 'throw']) {
    const s = scheduler(1, { status: 0, stdout: DISABLED_XML });
    assert.equal((await hook.ensure('win32', s.run, kernel(answer).refused)).notice, null,
      `kernel answer ${answer}: a notice claiming agents work blind would be a lie`);
  }
});

test('⑤ every other failure stays SILENT, and the kernel is not even asked', async () => {
  const silent = [
    ['enabled task (the start failed for another reason)', { status: 0, stdout: ENABLED_XML }],
    ['no such task (supervised another way)', { status: 1, stdout: '' }],
    ['query refused with no text', { status: 0 }],
    ['query that throws', 'throw'],
  ];
  for (const [label, query] of silent) {
    const k = kernel(true);
    assert.equal((await hook.ensure('win32', scheduler(1, query).run, k.refused)).notice, null, label);
    assert.equal(k.asked(), 0, `${label}: the probe only runs once the task is known DISABLED`);
  }
});

test('⑥ the kernel probe: a refused connection is true, an accepted one false', async () => {
  const closedPort = await freePort();
  assert.equal(await hook.kernelRefuses({ host: '127.0.0.1', port: closedPort }), true);
  const server = net.createServer((s) => s.destroy());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
    assert.equal(await hook.kernelRefuses({ host: '127.0.0.1', port }), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('⑥bis the probe bound stays ABOVE the measured refusal time of the Windows adapter', () => {
  // 📐 MEASURED 2026-09-30: a refused connect on the dedicated adapter address
  //    took 2,042 ms (the kernel retransmits the SYN before refusing). A 2,000 ms
  //    bound turned every real outage into silence. Twice that is the floor.
  assert.ok(hook.PROBE_BOUND_MS >= 2 * 2042,
    `bound ${hook.PROBE_BOUND_MS} ms is under twice the measured refusal time — a real outage would read as silence`);
});

test('⑦ as a real process it never prints plain text, and exits 0', () => {
  const run = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: 'ensure-cell', prompt: 'x' }),
    encoding: 'utf8',
    timeout: 20000,
  });
  assert.equal(run.status, 0, `the hook must never fail a prompt (stderr: ${run.stderr})`);
  if (run.stdout !== '') {
    // Only possible while the real task is disabled AND the daemon is down: then
    // the ONE admissible output is a `{systemMessage}` JSON line and nothing else.
    const parsed = JSON.parse(run.stdout);
    assert.deepEqual(Object.keys(parsed), ['systemMessage'], 'plain stdout on this event becomes context');
  }
});
