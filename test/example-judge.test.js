// The example judge shipped in `examples/judges/`, driven as the `wrapUp` option
// drives it: a REAL process, the versioned contract on stdin, a REAL git
// repository, and file docs read by ctxroute's own engine from a throwaway corpus.
import { describe, test, expect, beforeEach } from 'vitest';
import { spawnSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JUDGE = path.join(ROOT, 'examples', 'judges', 'undocumented-changes.js');

let dir;
let repo;
let docs;

// A git child inherits GIT_DIR & co. when the suite runs inside a git hook: scrub them.
// A CONST binding, so `git-env-door-gate` can prove the door statically.
const ENV_WITHOUT_GIT = { ...process.env };
for (const k of Object.keys(ENV_WITHOUT_GIT)) if (k.startsWith('GIT_')) delete ENV_WITHOUT_GIT[k];
const gitEnv = () => ({ ...ENV_WITHOUT_GIT });
const git = (...args) => execFileSync('git', args, { cwd: repo, env: ENV_WITHOUT_GIT });

function write(rel, body = 'x\n') {
  const file = path.join(repo, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
}

function doc(name, match) {
  fs.writeFileSync(path.join(docs, `${name}.md`), `---\nmatch: ${match}\nmode: dumb\n---\n\n# ${name}\nAn invariant.\n`);
}

function runJudge(args = [], cwd = repo, touched = null) {
  const r = spawnSync(process.execPath, [JUDGE, ...args], {
    input: JSON.stringify({ version: 2, sessionId: 's', cwd, context: { tokens: 1, window: 2, percent: 50 }, atPercent: 70, nudges: 0, touched }),
    env: {
      ...gitEnv(),
      CTXROUTE_CONFIG_PATH: path.join(dir, 'ctxroute-config.json'),
      CTXROUTE_FILEDOCS_DIR: docs,
      CTXROUTE_DOCS_DIR: path.join(dir, 'mcp'),
      CTXROUTE_SESSIONDOCS_DIR: path.join(dir, 'session'),
      CTXROUTE_SKILLS_DIR: path.join(dir, 'skills'),
      CTXROUTE_STATE_DIR: path.join(dir, 'state'),
    },
    encoding: 'utf8',
  });
  return { code: r.status, out: r.stdout, err: r.stderr, json: r.stdout ? JSON.parse(r.stdout) : null };
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'example-judge-'));
  repo = path.join(dir, 'acme');
  docs = path.join(dir, 'docs');
  for (const d of [repo, docs, path.join(dir, 'mcp'), path.join(dir, 'session'), path.join(dir, 'skills'), path.join(dir, 'state')]) fs.mkdirSync(d);
  fs.writeFileSync(path.join(dir, 'ctxroute-config.json'), JSON.stringify({ enabled: true }));
  git('init', '-q');
  git('config', 'user.email', 'judge@example.com');
  git('config', 'user.name', 'judge');
  write('README.md');
  git('add', '.');
  git('commit', '-q', '-m', 'init');
});

describe('example judge — undocumented changes', () => {
  test('a clean tree passes, silently', () => {
    const r = runJudge();
    expect(r.code).toBe(0);
    expect(r.out).toBe('');
  });

  test('a changed file with no doc FAILS, named in structured findings', () => {
    write('src/billing.js');
    const r = runJudge();
    expect(r.code).toBe(1);
    expect(r.json.ok).toBe(false);
    expect(r.json.findings).toEqual([{
      file: 'src/billing.js',
      message: 'changed in this session, and no injectable doc covers it: write what the next agent must know before touching it',
      severity: 'error',
    }]);
  });

  test('the same file covered by a doc passes: the engine decides, not the judge', () => {
    write('src/billing.js');
    doc('billing', 'billing.js');
    expect(runJudge().code).toBe(0);
  });

  test('only the undocumented one is named, in path order', () => {
    write('src/billing.js');
    write('src/b-ledger.js');
    write('src/a-export.js');
    doc('billing', 'billing.js');
    expect(runJudge().json.findings.map((f) => f.file)).toEqual(['src/a-export.js', 'src/b-ledger.js']);
  });

  test('a modified tracked file counts; a deleted one does not', () => {
    write('src/kept.js');
    write('src/gone.js');
    git('add', '.');
    git('commit', '-q', '-m', 'two');
    write('src/kept.js', 'changed\n');
    fs.rmSync(path.join(repo, 'src', 'gone.js'));
    expect(runJudge().json.findings.map((f) => f.file)).toEqual(['src/kept.js']);
  });

  test('a rename names the new path only', () => {
    write('src/old-name.js');
    git('add', '.');
    git('commit', '-q', '-m', 'old');
    git('mv', 'src/old-name.js', 'src/new-name.js');
    expect(runJudge().json.findings.map((f) => f.file)).toEqual(['src/new-name.js']);
  });

  test('--ignore skips matching paths, repeatable', () => {
    write('src/a.js');
    write('notes/todo.md');
    write('dist/out.js');
    expect(runJudge(['--ignore', '.md', '--ignore', 'dist/']).json.findings.map((f) => f.file)).toEqual(['src/a.js']);
  });

  test('committed work escapes by default, and --since brings it back', () => {
    write('src/committed.js');
    git('add', '.');
    git('commit', '-q', '-m', 'work');
    expect(runJudge().code).toBe(0);
    expect(runJudge(['--since', 'HEAD~1']).json.findings.map((f) => f.file)).toEqual(['src/committed.js']);
  });

  test('judged from a subdirectory, the whole repository counts, paths from its root', () => {
    write('src/deep/x.js');
    expect(runJudge([], path.join(repo, 'src')).json.findings.map((f) => f.file)).toEqual(['src/deep/x.js']);
  });

  test('outside a git repository: passes, and says why on stderr', () => {
    const outside = path.join(dir, 'not-a-repo');
    fs.mkdirSync(outside);
    const r = spawnSync(process.execPath, [JUDGE], {
      input: JSON.stringify({ version: 1, cwd: outside }),
      env: { ...gitEnv(), GIT_CEILING_DIRECTORIES: dir, CTXROUTE_CONFIG_PATH: path.join(dir, 'ctxroute-config.json'), CTXROUTE_FILEDOCS_DIR: docs },
      encoding: 'utf8',
    });
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('nothing to measure');
  });

  test('beyond the bound the findings are summarised, never cut silently', () => {
    for (let i = 0; i < 53; i += 1) write(`gen/f${String(i).padStart(2, '0')}.js`);
    const f = runJudge().json.findings;
    expect(f).toHaveLength(51);
    expect(f[50]).toEqual({ file: '', message: '3 more file(s) without a doc', severity: 'error' });
  });
});

describe('contract v2 — `touched` complete: exactly the files THIS session wrote', () => {
  const abs = (rel) => path.join(repo, rel);
  const mine = (...rels) => ({ files: rels.map(abs), complete: true });

  test('another agent’s uncommitted file in the same repository is NEVER reported', () => {
    write('src/mine.js');
    write('src/theirs.js');
    expect(runJudge([], repo, mine('src/mine.js')).json.findings.map((f) => f.file)).toEqual(['src/mine.js']);
  });

  test('a documented written file passes', () => {
    write('src/mine.js');
    write('src/theirs.js');
    doc('mine', 'mine.js');
    expect(runJudge([], repo, mine('src/mine.js')).code).toBe(0);
  });

  test('a file already COMMITTED is still judged: what counts is that this session wrote it', () => {
    write('src/done.js');
    git('add', '.');
    git('commit', '-qm', 'done');
    expect(runJudge([], repo, mine('src/done.js')).json.findings.map((f) => f.file)).toEqual(['src/done.js']);
  });

  test('a written file since deleted needs no doc', () => {
    expect(runJudge([], repo, mine('src/gone.js')).code).toBe(0);
  });

  test('outside the session folder the path is shown whole, inside it relative', () => {
    write('src/in.js');
    const far = path.join(dir, 'elsewhere', 'far.js');
    fs.mkdirSync(path.dirname(far));
    fs.writeFileSync(far, 'x\n');
    const r = runJudge([], repo, { files: [abs('src/in.js'), far], complete: true });
    expect(r.json.findings.map((f) => f.file)).toEqual(['src/in.js', far]);
  });

  test('no git repository is needed', () => {
    const outside = path.join(dir, 'plain');
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'p.js'), 'x\n');
    const r = runJudge([], outside, { files: [path.join(outside, 'p.js')], complete: true });
    expect(r.json.findings.map((f) => f.file)).toEqual(['p.js']);
  });

  test('`--ignore` applies to the shown path', () => {
    write('README.md');
    write('src/mine.js');
    expect(runJudge(['--ignore', '.md'], repo, mine('README.md', 'src/mine.js')).json.findings.map((f) => f.file)).toEqual(['src/mine.js']);
  });

  test('an INCOMPLETE list is never trusted: the git repository is judged instead', () => {
    write('src/mine.js');
    write('src/theirs.js');
    expect(runJudge([], repo, { files: [abs('src/mine.js')], complete: false }).json.findings.map((f) => f.file))
      .toEqual(['src/mine.js', 'src/theirs.js']);
  });
});
