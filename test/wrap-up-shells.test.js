// The `wrapUp` chain end to end, by REAL processes: the sensor door
// (`wrap-up-observe.js`) then the end-of-turn shell (`wrap-up-stop.js`), with
// judges that are real child programs. Zero model, zero token: the payloads are
// the documented shapes the harness sends (Claude Code Stop: session_id, cwd,
// hook_event_name, stop_hook_active — `code.claude.com/docs/en/hooks`, read
// 2026-10-04) and the shape the sensor mod hands over (its own cells pin it).
import { describe, test, expect, beforeEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OBSERVE = path.join(ROOT, 'src', 'hooks', 'wrap-up-observe.js');
const STOP = path.join(ROOT, 'src', 'hooks', 'wrap-up-stop.js');
const RESET = path.join(ROOT, 'src', 'hooks', 'ctxroute-reset.js');
const TOUCH = path.join(ROOT, 'src', 'hooks', 'wrap-up-touch.js');

let dir;
let stateDir;
let configPath;

function writeConfig(wrapUp, extra) {
  const cfg = { enabled: true, frames: 1, stateDir, docsDir: path.join(dir, 'docs'), sessionDocsDir: path.join(dir, 'session'), wrapUp, ...(extra || {}) };
  fs.writeFileSync(configPath, JSON.stringify(cfg));
}

function judge(name, body) {
  const file = path.join(dir, `${name}.js`);
  fs.writeFileSync(file, body);
  return [process.execPath, file];
}

function run(script, payload) {
  const r = spawnSync(process.execPath, [script], {
    input: JSON.stringify(payload),
    env: { ...process.env, CTXROUTE_CONFIG_PATH: configPath, CTXROUTE_STATE_DIR: stateDir },
    encoding: 'utf8',
  });
  return { code: r.status, out: r.stdout.trim(), err: r.stderr };
}

const observe = (percent, session = 'sess-1') => run(OBSERVE, {
  session_id: session, cwd: path.join(dir, 'acme-repo'),
  context: { tokens: percent * 2000, window: 200000, percent },
});
const stop = (session = 'sess-1', cwd = path.join(dir, 'acme-repo')) => {
  const r = run(STOP, { session_id: session, cwd, hook_event_name: 'Stop', stop_hook_active: false, transcript_path: '' });
  return { ...r, json: r.out ? JSON.parse(r.out) : null };
};
const record = (session = 'sess-1') => {
  const file = path.join(stateDir, `wrap-up-${session}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
};

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wrap-up-'));
  stateDir = path.join(dir, 'state');
  fs.mkdirSync(stateDir);
  fs.mkdirSync(path.join(dir, 'acme-repo'));
  configPath = path.join(dir, 'ctxroute-config.json');
});

describe('option OFF — nothing written, nothing said', () => {
  test('absent option: the sensor writes nothing and the end of turn is silent', () => {
    writeConfig(undefined);
    expect(observe(95).code).toBe(0);
    expect(fs.readdirSync(stateDir).filter((n) => n.startsWith('wrap-up-'))).toEqual([]);
    const s = stop();
    expect(s.code).toBe(0);
    expect(s.out).toBe('');
  });
  test('framework disabled wins over an enabled option', () => {
    writeConfig({ enabled: true }, { enabled: false });
    observe(95);
    expect(stop().out).toBe('');
  });
});

describe('option ON — the refusal, the release, the bound', () => {
  test('below the threshold: silent, no judge spawned', () => {
    const marker = path.join(dir, 'ran');
    writeConfig({ enabled: true, atPercent: 70, judges: { j: { command: judge('j', `require('fs').writeFileSync(${JSON.stringify(marker)}, '1')`), match: ['acme-repo'] } } });
    observe(69);
    expect(stop().out).toBe('');
    expect(fs.existsSync(marker)).toBe(false);
  });
  test('above the threshold and a red judge: the end of turn is REFUSED with the judge text', () => {
    writeConfig({ enabled: true, atPercent: 70, judges: { docs: { command: judge('docs', "process.stdout.write('src/a.js has no doc'); process.exit(1)"), match: ['acme-repo'] } } });
    observe(72);
    const s = stop();
    expect(s.json.decision).toBe('block');
    expect(s.json.reason).toContain('72% full');
    expect(s.json.reason).toContain('## Judge `docs` says the work is not done\nsrc/a.js has no doc');
    expect(s.json.systemMessage).toContain('nudge 1/3');
    expect(record().nudges).toBe(1);
  });
  test('the judge receives the versioned contract on stdin', () => {
    const seen = path.join(dir, 'seen.json');
    writeConfig({ enabled: true, judges: { spy: { command: judge('spy', `let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{require('fs').writeFileSync(${JSON.stringify(seen)}, s);process.exit(1)})`), match: ['acme-repo'] } } });
    observe(80);
    stop();
    const input = JSON.parse(fs.readFileSync(seen, 'utf8'));
    expect(input).toEqual({
      version: 2, sessionId: 'sess-1', cwd: path.join(dir, 'acme-repo'),
      context: { tokens: 160000, window: 200000, percent: 80 }, atPercent: 70, nudges: 0,
      touched: { files: [], complete: true },
    });
  });
  test('a green judge: the turn ends, the context is settled, nothing more is asked', () => {
    writeConfig({ enabled: true, judges: { ok: { command: judge('ok', 'process.exit(0)'), match: ['acme-repo'] } } });
    observe(90);
    expect(stop().out).toBe('');
    expect(record().settled).toBe(true);
    observe(95);
    expect(stop().out).toBe('');
  });
  test('the bound releases the session loudly', () => {
    writeConfig({ enabled: true, maxNudges: 2, judges: { red: { command: judge('red', 'process.exit(1)'), match: ['acme-repo'] } } });
    observe(90);
    expect(stop().json.decision).toBe('block');
    expect(stop().json.decision).toBe('block');
    const third = stop();
    expect(third.json.decision).toBeUndefined();
    expect(third.json.systemMessage).toContain('released after 2 nudge(s)');
    expect(stop().out).toBe('');
  });
  test('a judge that cannot start never holds the session, and is named', () => {
    writeConfig({ enabled: true, judges: { ghost: { command: ['definitely-not-a-command-ctxroute-wrap-up'], match: ['acme-repo'] } } });
    observe(90);
    const s = stop();
    // No shell: the program itself cannot start (ENOENT) ⇒ a BROKEN judge, named to
    // the human, and the session is never held.
    expect(s.code).toBe(0);
    expect(s.json.decision).toBeUndefined();
    expect(s.json.systemMessage).toContain('ghost (could not start:');
  });
  test('a judge that overruns is stopped and never holds the session', () => {
    writeConfig({ enabled: true, judgeTimeoutSeconds: 1, judges: { slow: { command: judge('slow', 'setInterval(()=>{}, 1000)'), match: ['acme-repo'] } } });
    observe(90);
    const s = stop();
    expect(s.json.decision).toBeUndefined();
    expect(s.json.systemMessage).toContain('slow (overran its time bound and was stopped)');
  });
  test('no judge for this project: exactly one nudge with the message, then settled', () => {
    writeConfig({ enabled: true, judges: { other: { command: judge('o', 'process.exit(1)'), match: ['other-repo'] } } });
    observe(90);
    const first = stop();
    expect(first.json.decision).toBe('block');
    expect(first.json.reason).toContain('injectable docs');
    expect(first.json.reason).not.toContain('## Judge');
    expect(stop().out).toBe('');
  });
  test('the adopter message replaces the default, in any language', () => {
    writeConfig({ enabled: true, message: 'Contexte à {percent} % : écris ta mémoire.' });
    observe(88);
    expect(stop().json.reason).toBe('Contexte à 88 % : écris ta mémoire.');
  });
  test('a message file next to the config; unreadable ⇒ default message, and the human is told', () => {
    fs.writeFileSync(path.join(dir, 'msg.md'), 'From a file at {percent}%');
    writeConfig({ enabled: true, messageFile: 'msg.md' });
    observe(75);
    expect(stop().json.reason).toBe('From a file at 75%');
    writeConfig({ enabled: true, messageFile: 'missing.md' });
    observe(75, 'sess-2');
    const s = stop('sess-2');
    expect(s.json.reason).toContain('injectable docs');
    expect(s.json.systemMessage).toContain('message file unreadable');
  });
  test('showNotification false silences the human notices, never the refusal itself', () => {
    writeConfig({ enabled: true }, { showNotification: false });
    observe(90);
    const s = stop();
    expect(s.json.decision).toBe('block');
    expect(s.json.systemMessage).toBeUndefined();
  });
  test('an overflowing report goes to a bounded file whose path is in the reason', () => {
    writeConfig({ enabled: true, judges: { big: { command: judge('big', "process.stdout.write('X'.repeat(20000)); process.exit(1)"), match: ['acme-repo'] } } });
    observe(90);
    const s = stop();
    expect(s.json.reason.length).toBeLessThanOrEqual(8000);
    const m = /is in (.+?) — read it/.exec(s.json.reason);
    expect(m).not.toBeNull();
    expect(fs.readFileSync(m[1], 'utf8')).toContain('X'.repeat(20000));
  });
  test('scopes are separate: another session is not judged on this one\'s fill', () => {
    writeConfig({ enabled: true });
    observe(90, 'sess-A');
    expect(stop('sess-B').out).toBe('');
    expect(stop('sess-A').json.decision).toBe('block');
  });
});

describe('compaction re-arms the option (the record is a declared store)', () => {
  test('PreCompact purges the wrapUp record on the files lane', () => {
    writeConfig({ enabled: true });
    observe(90);
    stop();
    expect(record()).not.toBeNull();
    const r = run(RESET, { session_id: 'sess-1', hook_event_name: 'PreCompact', trigger: 'auto' });
    expect(r.code).toBe(0);
    expect(record()).toBeNull();
  });
});

describe('a silent sensor is SAID, once per context, never a refusal', () => {
  // The counter `turn-count.js` keeps, in the shape `pretool-core` reads (`.turns`).
  const turns = (n, session = 'sess-1') => fs.writeFileSync(path.join(stateDir, `turn-count-${session}.json`), JSON.stringify({ turns: n }));
  test('option on, three turns, no measure ever: the human is told once, the turn is never refused', () => {
    writeConfig({ enabled: true });
    turns(3);
    const s = stop();
    expect(s.json.decision).toBeUndefined();
    expect(s.json.systemMessage).toContain('no context measure has arrived in 3 turns');
    expect(record().sensorSilenceSaid).toBe(true);
    expect(stop().out).toBe('');
  });
  test('two turns: not yet', () => {
    writeConfig({ enabled: true });
    turns(2);
    expect(stop().out).toBe('');
  });
  test('a living sensor below the threshold: silent', () => {
    writeConfig({ enabled: true, atPercent: 70 });
    turns(5);
    observe(20);
    expect(stop().out).toBe('');
  });
  test('showNotification false: nothing said, nothing recorded', () => {
    writeConfig({ enabled: true }, { showNotification: false });
    turns(5);
    expect(stop().out).toBe('');
    expect(record()).toBeNull();
  });
});

describe('each judge judges THIS session’s files, never the repository’s', () => {
  // The PostToolUse payload Claude Code sends after a write (`code.claude.com/docs/en/hooks`,
  // read 2026-10-04): session_id, cwd, tool_name, tool_input — plus agent_id inside a sub-agent.
  const touch = (file, extra = {}) => run(TOUCH, {
    session_id: 'sess-1', cwd: path.join(dir, 'acme-repo'), hook_event_name: 'PostToolUse',
    tool_name: 'Edit', tool_input: { file_path: file }, ...extra,
  });
  const touchedRecord = (session = 'sess-1') => {
    const file = path.join(stateDir, `touched-${session}.json`);
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  };
  const spy = (name, seen) => judge(name, `let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{require('fs').writeFileSync(${JSON.stringify(seen)}, s);process.exit(1)})`);

  test('the write hook records the session’s files, a relative path resolved against the cwd, each once', () => {
    writeConfig({ enabled: true });
    expect(touch(path.join(dir, 'acme-repo', 'a.js')).code).toBe(0);
    touch('b.js');
    touch(path.join(dir, 'acme-repo', 'a.js'));
    expect(touchedRecord()).toEqual({ files: [path.join(dir, 'acme-repo', 'a.js'), path.join(dir, 'acme-repo', 'b.js')], complete: true });
  });
  test('a SUB-AGENT’s writes are its session’s work', () => {
    writeConfig({ enabled: true });
    touch(path.join(dir, 'acme-repo', 'sub.js'), { agent_id: 'agent-7' });
    expect(touchedRecord().files).toEqual([path.join(dir, 'acme-repo', 'sub.js')]);
  });
  test('option off: nothing recorded', () => {
    writeConfig({ enabled: false });
    touch(path.join(dir, 'acme-repo', 'a.js'));
    expect(touchedRecord()).toBeNull();
  });
  test('another session’s files are NEVER handed to this session’s judge', () => {
    const seen = path.join(dir, 'seen.json');
    writeConfig({ enabled: true, judges: { docs: { command: spy('docs', seen), match: ['acme-repo'] } } });
    touch(path.join(dir, 'acme-repo', 'mine.js'));
    touch(path.join(dir, 'acme-repo', 'theirs.js'), { session_id: 'sess-2' });
    observe(80);
    stop();
    expect(JSON.parse(fs.readFileSync(seen, 'utf8')).touched).toEqual({ files: [path.join(dir, 'acme-repo', 'mine.js')], complete: true });
  });
  test('a session started in ANOTHER folder meets the judge of the project it wrote in', () => {
    const seen = path.join(dir, 'seen.json');
    fs.mkdirSync(path.join(dir, 'home'));
    writeConfig({ enabled: true, judges: { docs: { command: spy('docs', seen), match: ['acme-repo'] } } });
    touch(path.join(dir, 'acme-repo', 'far.js'), { cwd: path.join(dir, 'home') });
    observe(80);
    const s = stop('sess-1', path.join(dir, 'home'));
    expect(s.json.decision).toBe('block');
    expect(JSON.parse(fs.readFileSync(seen, 'utf8')).touched.files).toEqual([path.join(dir, 'acme-repo', 'far.js')]);
  });
  test('compaction forgets the written files with the rest of the context', () => {
    writeConfig({ enabled: true });
    touch(path.join(dir, 'acme-repo', 'a.js'));
    expect(touchedRecord()).not.toBeNull();
    run(RESET, { session_id: 'sess-1', hook_event_name: 'PreCompact', trigger: 'auto' });
    expect(touchedRecord()).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// THE JOURNAL — a failure stays fail-open AND leaves its line (K, 2026-10-04)
// ═══════════════════════════════════════════════════════════════════════
const hooksLog = () => {
  const file = path.join(stateDir, 'ctxroute-hooks.log');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
};
const runRaw = (script, raw) => {
  const r = spawnSync(process.execPath, [script], {
    input: raw,
    env: { ...process.env, CTXROUTE_CONFIG_PATH: configPath, CTXROUTE_STATE_DIR: stateDir },
    encoding: 'utf8',
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
};

describe('a hook that fails: exit 0, nothing to the agent, ONE line in state/ctxroute-hooks.log', () => {
  for (const [name, script] of [['wrap-up-observe', OBSERVE], ['wrap-up-stop', STOP], ['wrap-up-touch', TOUCH]]) {
    test(`${name}: an unreadable payload is journalled, at the default level`, () => {
      writeConfig({ enabled: true });
      const r = runRaw(script, '{"session_id":');
      expect(r.code).toBe(0);
      expect(r.out).toBe('');
      expect(r.err).toBe('');
      const lines = hooksLog().trimEnd().split('\n');
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatch(new RegExp(`^\\S+ event=hook-error hook=${name} error=.*JSON.* pid=\\d+$`));
    });
  }

  // ⚠️ HONEST SCOPE: the cells above drive the payload-error door of each hook by
  //    a real process. The handler's own `catch` calls the SAME `log.hookError`,
  //    and no payload reaches it today: every layer under it is fail-open on its
  //    own (a failed store write is swallowed inside `session-store`, measured
  //    2026-10-04) — that deeper silence is a backlog item, not this cell's.
  test('the journal line names where it threw, without the "at " prefix', () => {
    writeConfig({ enabled: true });
    runRaw(TOUCH, '{"session_id":');
    expect(hooksLog()).toMatch(/ at=JSON\.parse \(<anonymous>\) pid=\d+\n$/);
  });

  test('a healthy run writes NOTHING to the journal at the default level', () => {
    writeConfig({ enabled: true });
    observe(10);
    stop();
    run(TOUCH, { session_id: 'sess-1', cwd: dir, hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: path.join(dir, 'a.md') } });
    expect(hooksLog()).toBe('');
  });

  test('level debug: each hook says what it decided (hook-trace), and still says nothing to the agent', () => {
    writeConfig({ enabled: true }, { logging: { level: 'debug' } });
    expect(observe(10).out).toBe('');
    expect(stop().out).toBe('');
    run(TOUCH, { session_id: 'sess-1', cwd: dir, hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: path.join(dir, 'a.md') } });
    const lines = hooksLog().trimEnd().split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/ event=hook-trace hook=wrap-up-observe recorded=true pid=\d+$/);
    expect(lines[1]).toMatch(/ event=hook-trace hook=wrap-up-stop decision=silent pid=\d+$/);
    expect(lines[2]).toMatch(/ event=hook-trace hook=wrap-up-touch recorded=true pid=\d+$/);
  });
});
