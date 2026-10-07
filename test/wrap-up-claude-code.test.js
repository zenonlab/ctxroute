// The `wrapUp` chain on the REAL harness: a real Claude Code process, its real
// hook payloads, its real Stop handling and its real mod event — against a FAKE
// Anthropic API (`fixtures/fake-anthropic-api.js`), so zero model, zero token,
// the same run every time. Everything lives in a throwaway directory: own
// config, own state, own settings (`--setting-sources project` keeps the
// operator's settings OUT), no MCP server.
// ⚠️ SKIPPED, VISIBLY, where no Claude Code CLI (≥ 2.1.287, mods) is installed.
import { test, expect } from 'vitest';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FAKE_API = path.join(ROOT, 'test', 'fixtures', 'fake-anthropic-api.js');
const posix = (p) => p.split(path.sep).join('/');

function claudeVersion() {
  const r = spawnSync('claude', ['--version'], { encoding: 'utf8' });
  if (r.error || r.status !== 0) return null;
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(r.stdout);
  return m ? m.slice(1).map(Number) : null;
}
const version = claudeVersion();
const hasMods = version !== null && (version[0] > 2 || (version[0] === 2 && (version[1] > 1 || (version[1] === 1 && version[2] >= 287))));
if (!hasMods) process.stderr.write(`wrap-up-claude-code: SKIPPED — no Claude Code CLI >= 2.1.287 on this machine (found ${version ? version.join('.') : 'none'})\n`);

// A git child inherits GIT_DIR & co. when the suite runs inside a git hook, and they
// beat `cwd`: every child of this file starts from an env without them.
const ENV_WITHOUT_GIT = { ...process.env };
for (const k of Object.keys(ENV_WITHOUT_GIT)) if (k.startsWith('GIT_')) delete ENV_WITHOUT_GIT[k];

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wrap-up-cc-'));
  for (const d of ['state', 'docs', 'mcp', 'session', 'skills', 'proj-x']) fs.mkdirSync(path.join(dir, d));
  const work = path.join(dir, 'proj-x');
  execFileSync('git', ['init', '-q'], { cwd: work, env: ENV_WITHOUT_GIT });
  // Another agent's uncommitted work in the SAME repository: never this session's.
  fs.writeFileSync(path.join(work, 'theirs.js'), 'x\n');
  const spyOut = path.join(dir, 'spy-input.json');
  fs.writeFileSync(path.join(dir, 'spy.js'), `let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{require('fs').writeFileSync(${JSON.stringify(spyOut)}, s);process.exit(0)})`);
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({
    enabled: true,
    showNotification: true,
    wrapUp: {
      enabled: true,
      atPercent: 1,
      maxNudges: 1,
      judgeTimeoutSeconds: 60,
      judges: {
        docs: { command: [process.execPath, path.join(ROOT, 'examples', 'judges', 'undocumented-changes.js')], match: ['proj-x'] },
        spy: { command: [process.execPath, path.join(dir, 'spy.js')], match: ['proj-x'] },
      },
    },
  }));
  // The two consumers the generated wiring declares for this option, same commands.
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({
    hooks: {
      PostToolUse: [{ matcher: 'Write|Edit|NotebookEdit', hooks: [{ type: 'command', command: `node ${posix(path.join(ROOT, 'src', 'hooks', 'wrap-up-touch.js'))}`, timeout: 5 }] }],
      Stop: [{ hooks: [{ type: 'command', command: `node ${posix(path.join(ROOT, 'src', 'hooks', 'wrap-up-stop.js'))}`, timeout: 600 }] }],
    },
  }));
  return { dir, work, spyOut };
}

// One conversation of TWO human turns, the second sent once the first ENDED:
// the sensor reports after a whole turn, so the second end of turn is the first
// one that can be judged (the documented one-turn lag).
function converse(sb) {
  return new Promise((resolve, reject) => {
    const api = spawn(process.execPath, [FAKE_API, '0', path.join(sb.work, 'mine.js')], { stdio: ['ignore', 'pipe', 'ignore'] });
    api.on('error', reject);
    api.stdout.once('data', (d) => {
      const env = {
        ...ENV_WITHOUT_GIT,
        ANTHROPIC_BASE_URL: `http://127.0.0.1:${String(d).trim()}`,
        ANTHROPIC_API_KEY: 'sk-ant-fake-key-for-tests',
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
        CTXROUTE_CONFIG_PATH: path.join(sb.dir, 'config.json'),
        CTXROUTE_STATE_DIR: path.join(sb.dir, 'state'),
        CTXROUTE_FILEDOCS_DIR: path.join(sb.dir, 'docs'),
        CTXROUTE_DOCS_DIR: path.join(sb.dir, 'mcp'),
        CTXROUTE_SESSIONDOCS_DIR: path.join(sb.dir, 'session'),
        CTXROUTE_SKILLS_DIR: path.join(sb.dir, 'skills'),
      };
      const user = (content) => `${JSON.stringify({ type: 'user', message: { role: 'user', content } })}\n`;
      const claude = spawn('claude', [
        '-p', '--input-format', 'stream-json',
        '--model', 'claude-haiku-4-5-20251001',
        '--setting-sources', 'project',
        '--settings', path.join(sb.dir, 'settings.json'),
        '--plugin-dir', path.join(ROOT, 'mods', 'wrap-up-sensor'),
        '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
        '--permission-mode', 'acceptEdits',
        '--max-turns', '6',
        '--output-format', 'stream-json', '--verbose', '--include-hook-events',
      ], { cwd: sb.work, env, stdio: ['pipe', 'pipe', 'ignore'] });
      const events = [];
      let buf = '';
      let results = 0;
      claude.on('error', reject);
      claude.stdout.on('data', (chunk) => {
        buf += chunk;
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i);
          buf = buf.slice(i + 1);
          let m;
          try { m = JSON.parse(line); } catch { continue; }
          events.push(m);
          if (m.type !== 'result') continue;
          results += 1;
          if (results === 1) claude.stdin.write(user('Anything else? Say DONE.'));
          else claude.stdin.end();
        }
      });
      claude.on('close', (code) => {
        api.kill();
        resolve({ code, events });
      });
      claude.stdin.write(user('Please create the file mine.js.'));
    });
  });
}

// One traversal per statement (quadratic gate): a chained filter().map() reads as a nesting.
function stopOutputs(events) {
  const stops = events.filter((m) => m.subtype === 'hook_response' && m.hook_event === 'Stop');
  return stops.map((m) => ({ exit: m.exit_code, out: m.stdout ? JSON.parse(m.stdout) : null }));
}

test.skipIf(!hasMods)('on real Claude Code: the session’s files are recorded, judged on the turn after the measure, refused, then released', { timeout: 180000 }, async () => {
  const sb = sandbox();
  const { code, events } = await converse(sb);
  expect(code).toBe(0);

  // ① The write recorder saw THIS session's write, and only it.
  const touched = fs.readdirSync(path.join(sb.dir, 'state')).filter((n) => n.startsWith('touched-'));
  expect(touched).toHaveLength(1);
  expect(JSON.parse(fs.readFileSync(path.join(sb.dir, 'state', touched[0]), 'utf8'))).toEqual({ files: [path.join(sb.work, 'mine.js')], complete: true });

  // ② Three ends of turn, every hook answering cleanly: the first before any
  //    measure (silent), the second refused, the third released.
  const stops = stopOutputs(events);
  expect(stops.map((s) => s.exit)).toEqual([0, 0, 0]);
  expect(stops[0].out).toBe(null);
  expect(stops[1].out.decision).toBe('block');
  expect(stops[1].out.reason).toContain('21% full');
  expect(stops[1].out.reason).toContain('- [error] mine.js: changed in this session');
  expect(stops[1].out.reason).not.toContain('theirs.js');
  expect(stops[2].out).toEqual({ systemMessage: 'ctxroute wrapUp: released after 1 nudge(s) without a passing verdict (still failing: docs).' });

  // ③ The sensor mod's figure reached the door, and the judges got contract v2.
  const record = fs.readdirSync(path.join(sb.dir, 'state')).find((n) => n.startsWith('wrap-up-'));
  expect(JSON.parse(fs.readFileSync(path.join(sb.dir, 'state', record), 'utf8')).observation).toEqual({ tokens: 42000, window: 200000, percent: 21 });
  const input = JSON.parse(fs.readFileSync(sb.spyOut, 'utf8'));
  expect(input.version).toBe(2);
  expect(input.touched).toEqual({ files: [path.join(sb.work, 'mine.js')], complete: true });
});
