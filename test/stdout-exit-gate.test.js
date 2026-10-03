// ═══════════════════════════════════════════════════════════════════════
// STATIC GATE — no entry point loses what it wrote to a stream when it exits
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 THE CLASS (measured 2026-10-01, Linux): `process.exit` after a write cuts
//    stdout AND stderr at one pipe buffer (64 KB) — a hook's JSON arrives half
//    written and the harness drops the injection, a CLI's report or refusal
//    arrives half read. Windows delivers everything, so the maintainer's machine
//    can NEVER catch it by use. Only this gate and `stdout-flush.test.js` on a
//    POSIX runner can. Doc (nodejs/node v22.x doc/api/process.md, read verbatim):
//    "Pipes (and sockets): synchronous on Windows, asynchronous on POSIX".
//
// TWO RULES, one per shape of the defect:
//  ① a HOOK SHELL (`src/hooks/`) prints only through `printThenExit` — its stdout
//    IS the harness contract, so even a print with no exit in sight is refused.
//  ② ANY entry point (`src/`, `tools/`, `service/`) that writes a stream never
//    calls `process.exit` — it leaves through `exitAfterFlush` or sets
//    `process.exitCode` and returns.
// ⚠️ Both perimeters are DERIVED (`git ls-files`), never a list: the next file
//    added is judged without anyone remembering to enrol it.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOOK_PRINT = path.join(ROOT, 'rules', 'hook-print-through-stdout-exit.yml');
const STREAM_WRITE = path.join(ROOT, 'rules', 'stream-write.yml');
const PROCESS_EXIT = path.join(ROOT, 'rules', 'process-exit.yml');

// 🛑 DECLARED EXEMPTIONS, WITH THEIR REASON — each one is CHECKED to be still
//    needed below (a stale exemption hides the next real one).
const HOOK_PRINT_EXEMPT = {
  // NOT wired (the doctor requires its absence) and FROZEN as the oracle of
  // `mcp-differential.test.js`: its own doc forbids it any evolution, and its
  // answers in that suite stay far below one pipe buffer.
  'src/hooks/legacy-mcp-inject.js': 'frozen differential oracle, never wired',
};
const EXIT_EXEMPT = {
  'src/hooks/legacy-mcp-inject.js': 'frozen differential oracle, never wired',
  // The cure itself: its `process.exit` IS the exit after the flush.
  'src/stdout-exit.js': 'the cure — exits from the write callback',
  // THE DAEMON. Its exits ARE its lifecycle contract (exit 90 = stale code, the
  // supervisor restarts it; proven by `stale-code`/`daemon-*` suites), and they
  // must be IMMEDIATE: waiting on stderr would let a daemon running STALE CODE
  // keep serving for as long as a journal reader stalls. Its stderr lines are
  // single short lines, handed to the kernel in one write, never a report.
  'src/hooks/http-server.js': 'daemon lifecycle exits must be immediate; one-line stderr notices',
};

function astGrepBinary() {
  const name = process.platform === 'win32' ? 'ast-grep.exe' : 'ast-grep';
  const bin = path.join(ROOT, 'node_modules', '@ast-grep', 'cli', name);
  if (!fs.existsSync(bin)) {
    throw new Error('ast-grep NOT FOUND (' + bin + ') — this gate cannot judge. Run `npm ci`.');
  }
  return bin;
}

function scan(rule, targets) {
  let out = '';
  try {
    out = execFileSync(astGrepBinary(), ['scan', '--rule', rule, ...targets, '--json=compact'], {
      cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    // ⚠️ A match of `error` severity exits ≠ 0: a RESULT, its findings on stdout.
    out = (e && e.stdout) || '';
  }
  try { return JSON.parse(out || '[]'); } catch { return []; }
}

function tracked(...specs) {
  // 🛑 SCRUB `GIT_*`: inherited pointers beat `cwd` and would judge another tree.
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('GIT_')) delete env[k];
  return execFileSync('git', ['ls-files', ...specs], { cwd: ROOT, env: env, encoding: 'utf8' })
    .split(/\r?\n/).filter(Boolean);
}

const rel = (f) => path.relative(ROOT, path.resolve(ROOT, f)).split(path.sep).join('/');
const filesOf = (hits) => new Set(hits.map((h) => rel(h.file)));
const where = (hits) => hits.map((h) => `${rel(h.file)}:${h.range.start.line + 1}  ${h.lines.trim().slice(0, 90)}`);

// Entry points of ② = every tracked source that could run as a process.
// Untracked files (scratch, worktrees) are out on purpose: a fork receives what git tracks.
const entryPoints = () => tracked('src/*.js', 'src/**/*.js', 'tools/*.js', 'tools/*.mjs', 'service/*.js');

test('① GATE: no hook shell prints to stdout except through stdout-exit', () => {
  const shells = tracked('src/hooks/*.js');
  // ANTI-VACUITY: the perimeter is the real fleet of shells.
  assert.ok(shells.length >= 8, `perimeter too small (${shells.length} hook files): the scan measures nothing`);
  const hits = scan(HOOK_PRINT, shells).filter((h) => !HOOK_PRINT_EXEMPT[rel(h.file)]);
  assert.deepStrictEqual(where(hits), [],
    'A HOOK PRINTS BY HAND:\n  ' + where(hits).join('\n  ') +
    '\n\n🛑 a print followed by `process.exit` is cut at 64 KB on a POSIX pipe — the\n' +
    '   harness drops the whole injection, silently (measured 2026-10-01).\n' +
    '→ WAY OUT: `printThenExit(text)` from `src/stdout-exit.js`, and `exitUnlessPrinting()`\n' +
    '   on any path that may have printed.');
});

test('② GATE: no entry point both writes a stream and forces its exit', () => {
  const files = entryPoints();
  assert.ok(files.length >= 100, `perimeter too small (${files.length} files): the scan measures nothing`);
  const writers = filesOf(scan(STREAM_WRITE, files));
  const exits = scan(PROCESS_EXIT, files);
  // ANTI-VACUITY: both detectors must really see their shape in this perimeter.
  // Floors set BELOW what was measured on 2026-10-01 (17 writer files, 27 exits):
  // they detect a blind scanner, never police the count.
  assert.ok(writers.size >= 10, `the stream-write rule saw only ${writers.size} file(s): it is not reading the perimeter`);
  assert.ok(exits.length >= 10, `the process-exit rule saw only ${exits.length} call(s): it is not reading the perimeter`);
  const offenders = exits.filter((h) => writers.has(rel(h.file)) && !EXIT_EXEMPT[rel(h.file)]);
  assert.deepStrictEqual(where(offenders), [],
    'A FILE THAT WRITES A STREAM FORCES ITS EXIT:\n  ' + where(offenders).join('\n  ') +
    '\n\n🛑 `process.exit` does not wait for stdout/stderr on a POSIX pipe: the report,\n' +
    '   the refusal or the JSON is cut at 64 KB, with exit code intact (measured 2026-10-01).\n' +
    '→ WAY OUT: `return exitAfterFlush(code)` from `src/stdout-exit.js`, or\n' +
    '   `process.exitCode = code; return;` when the process holds no handle.');
});

test('EXEMPTIONS STILL NEEDED: every exempt file really carries the shape it is excused for', () => {
  for (const file of Object.keys(HOOK_PRINT_EXEMPT)) {
    assert.ok(scan(HOOK_PRINT, [file]).length > 0,
      `${file} no longer prints by hand — remove its exemption (a stale exemption hides the next one)`);
  }
  for (const file of Object.keys(EXIT_EXEMPT)) {
    assert.ok(scan(STREAM_WRITE, [file]).length > 0 && scan(PROCESS_EXIT, [file]).length > 0,
      `${file} no longer both writes and exits — remove its exemption (a stale exemption hides the next one)`);
  }
});

test('NEGATIVE: the defect shapes ARE detected, the cures and a quotation are NOT', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stdout-exit-gate-'));
  const hook = path.join(tmp, 'hook.js');
  const cli = path.join(tmp, 'cli.mjs');
  const cured = path.join(tmp, 'cured.js');
  fs.writeFileSync(hook, [
    'console.log(JSON.stringify(out)); process.exit(0);',       // 1 — the defect verbatim
    'process.stdout.write(text + "\\n");',                       // 2 — the raw stream
    'console.info(x);',                                          // 3 — an alias of log
    'printThenExit(JSON.stringify(out));',                       // cure — MUST pass
    '// console.log(x); process.exit(0)',                        // a COMMENT — MUST pass
    'const s = "console.log(x)";',                               // a STRING — MUST pass
    'console.error(x);',                                         // stderr — not rule ①'s business
  ].join('\n'), 'utf8');
  fs.writeFileSync(cli, 'process.stderr.write("refused\\n");\nprocess.exit(2);\n', 'utf8');
  fs.writeFileSync(cured, [
    'console.error("refused");',
    'process.exitCode = 2;',
    'exitAfterFlush(2);',
    '// process.exit(2) quoted in a comment',
  ].join('\n'), 'utf8');
  try {
    const hits = scan(HOOK_PRINT, [hook]);
    assert.strictEqual(hits.length, 3, 'rule ①: expected exactly the 3 defect shapes, got ' + hits.length +
      ': ' + hits.map((h) => h.text).join(' · '));
    // Rule ②: the .mjs CLI (an ESM file — the perimeter includes them) is caught,
    // the cured file is not, although it writes a stream too.
    assert.strictEqual(scan(STREAM_WRITE, [cli]).length, 1, 'rule ②: an .mjs stream write must be seen');
    assert.strictEqual(scan(PROCESS_EXIT, [cli]).length, 1, 'rule ②: an .mjs forced exit must be seen');
    assert.strictEqual(scan(STREAM_WRITE, [cured]).length, 1, 'rule ②: the cured file still writes a stream');
    assert.strictEqual(scan(PROCESS_EXIT, [cured]).length, 0, 'rule ②: a cure (or a quotation) is not an exit');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('stdout-exit.js: the exit waits on the WRITE CALLBACKS of BOTH streams', () => {
  // ⚠️ The module is the cure; a regression to `write(x); process.exit()` inside
  //    it would turn this whole gate into a certificate for the defect.
  const src = fs.readFileSync(path.join(ROOT, 'src', 'stdout-exit.js'), 'utf8');
  assert.match(src, /\[process\.stdout, process\.stderr\]/, 'both streams must be flushed');
  assert.match(src, /stream\.write\('', settle\)/, 'each flush must exit from the write callback');
  // ⚠️ "no timer" is NOT re-judged here by text (the header quotes `setTimeout`):
  //    `temporal-budget-gate` holds this file at ZERO temporal calls, by AST.
});
