// `src/judge-runner.js` by REAL processes: a judge is started through the
// argument vector (no shell), fed its JSON, read, and — when it overruns —
// stopped WITH every process it started. The tree cell is the one that matters:
// killing the root alone leaves its children running after the hook has returned.
import { describe, test, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import runner from '../src/judge-runner.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'judge-runner-'));
const script = (dir, name, body) => {
  const file = path.join(dir, name);
  fs.writeFileSync(file, body);
  return [process.execPath, file];
};
// ⚠️ A KILLED PROCESS CAN STILL "EXIST" AS A ZOMBIE on Linux until it is reaped, and
//    `kill(pid, 0)` answers for a zombie (measured on the ubuntu CI runner 2026-10-04:
//    the tree WAS killed, the cell read it alive). Its state is a kernel fact, read in
//    `/proc/<pid>/stat` (3rd field `Z`); other systems have no `/proc`.
const alive = (pid) => {
  try { process.kill(pid, 0); } catch (e) { return e.code === 'EPERM'; }
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    return stat.slice(stat.lastIndexOf(')') + 2, stat.lastIndexOf(')') + 3) !== 'Z';
  } catch { return true; }
};

describe('judge-runner — start, feed, read, bound', () => {
  test('feeds the JSON on stdin and reads exit code and both streams', async () => {
    const dir = tmp();
    const command = script(dir, 'echo.js', "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{process.stdout.write(s);process.stderr.write('err');process.exit(3)})");
    const r = await runner.runJudge({ name: 'echo', command }, { version: 1, x: 'é' }, { cwd: dir, timeoutMs: 20000 });
    expect(r).toEqual({ name: 'echo', exitCode: 3, stdout: '{"version":1,"x":"é"}', stderr: 'err', timedOut: false, spawnError: null });
  });

  test('runs in the session cwd', async () => {
    const dir = tmp();
    const command = script(dir, 'cwd.js', 'process.stdout.write(process.cwd())');
    const r = await runner.runJudge({ name: 'cwd', command }, {}, { cwd: dir, timeoutMs: 20000 });
    expect(fs.realpathSync(r.stdout)).toBe(fs.realpathSync(dir));
  });

  test('a judge that ignores its stdin is not an error', async () => {
    const dir = tmp();
    const r = await runner.runJudge({ name: 'deaf', command: script(dir, 'deaf.js', 'process.exit(0)') }, { big: 'x'.repeat(200000) }, { cwd: dir, timeoutMs: 20000 });
    expect(r.exitCode).toBe(0);
    expect(r.spawnError).toBeNull();
  });

  test('a cwd that does not exist is a spawnError, never a throw', async () => {
    const r = await runner.runJudge({ name: 'nowhere', command: [process.execPath, '-e', '0'] }, {}, { cwd: path.join(tmp(), 'missing'), timeoutMs: 20000 });
    expect(r.exitCode).toBeNull();
    expect(typeof r.spawnError).toBe('string');
  });

  test('output above the ceiling is cut AND the cut is said', async () => {
    const dir = tmp();
    const n = runner.MAX_STREAM_BYTES + 5000;
    const command = script(dir, 'flood.js', `process.stdout.write('A'.repeat(${n}), () => process.exit(1))`);
    const r = await runner.runJudge({ name: 'flood', command }, {}, { cwd: dir, timeoutMs: 20000 });
    expect(r.stdout.startsWith('A'.repeat(1000))).toBe(true);
    expect(r.stdout.endsWith('[… 5000 more bytes not kept]')).toBe(true);
  });

  test('an overrunning judge is stopped WITH the processes it started', async () => {
    const dir = tmp();
    const pidFile = path.join(dir, 'grandchild.pid');
    const grandchild = script(dir, 'grandchild.js', `require('fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setInterval(() => {}, 1000)`);
    const command = script(dir, 'parent.js', `require('child_process').spawn(process.execPath, [${JSON.stringify(grandchild[1])}], { stdio: 'ignore' }); setInterval(() => {}, 1000)`);
    const r = await runner.runJudge({ name: 'tree', command }, {}, { cwd: dir, timeoutMs: 3000 });
    expect(r.timedOut).toBe(true);
    expect(r.exitCode).toBeNull();
    const pid = Number(fs.readFileSync(pidFile, 'utf8'));
    expect(pid).toBeGreaterThan(0);
    // The kill is asynchronous at the kernel: ask it again until it answers, at most
    // 100 times 50 ms (the one wait of this file, declared `undecidable` in
    // temporal-budget.json — whether another process is gone YET is not decidable
    // from here, and a few microseconds were measured too short on the Linux runner).
    let gone = false;
    for (let i = 0; i < 100 && !gone; i += 1) {
      gone = !alive(pid);
      if (!gone) await new Promise((res) => setTimeout(res, 50));
    }
    expect(gone).toBe(true);
  }, 30000);

  test('several judges run in PARALLEL: the slowest bounds the wait, never their sum', async () => {
    const dir = tmp();
    const slow = script(dir, 'slow.js', 'setTimeout(() => process.exit(0), 1500)');
    const t0 = Date.now();
    const runs = await runner.runJudges(
      [{ name: 'a', command: slow }, { name: 'b', command: slow }, { name: 'c', command: slow }],
      {}, { cwd: dir, timeoutMs: 20000 },
    );
    expect(runs.map((r) => [r.name, r.exitCode])).toEqual([['a', 0], ['b', 0], ['c', 0]]);
    expect(Date.now() - t0).toBeLessThan(4400);
  }, 30000);
});
