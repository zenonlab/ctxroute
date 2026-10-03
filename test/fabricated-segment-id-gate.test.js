// ═══════════════════════════════════════════════════════════════════════
// A CELL MAY NOT HAND A SEGMENT ID WHERE THE CALLER HANDS A BASE.
// POLICY + RATCHET. The DETECTION lives in `rules/no-fabricated-segment-id.yml`.
//
// 🔴 WHY THIS GATE EXISTS, and it is the only reason that counts: on
//    2026-09-13 a fix shipped DEAD with a green suite, and the OPERATOR found
//    it by reading a badge on screen. `pretool-core` maps `baseId` over
//    `plan.emitted` BEFORE calling an adapter, so the first argument of
//    `badgeLabel`/`message` carries BASES. A correction asked
//    `chunkPart(injected[0])` and was never entered once in production, while
//    six cells passed — because THEY handed ids carrying `#`.
//
// 🛑 THE RULE THAT WOULD HAVE STOPPED IT WAS ALREADY LOADED AND WAS QUOTED IN
//    THE SKILL. It did not govern. That is the whole argument for a machine:
//    prose describing this exact defect was in context and the defect shipped
//    anyway. A rule only prose guards is not a rule.
//
// 🛑 ZERO TOLERANCE, NO BUDGET FILE, AND THAT IS DELIBERATE. The twins
//    (quadratic, temporal, state-entry) carry a budget because their class is
//    QUANTITATIVE — some occurrences are legitimate debt. This one is not:
//    handing a segment where the contract says base is never right, it is
//    always a cell describing a caller that does not exist. A budget here
//    would be a permit to keep proving nothing.
// ⚠️ The one occurrence this rule found on its first run WAS a real defect —
//    a dedup cell passing `['a.md#1/2', 'a.md#2/2', 'b.md']`. It was rewritten
//    with duplicated BASES, which exercises the same defensive `Set` with an
//    input the caller could at worst produce. **The cure was never an
//    exemption**, and that is why none exists here.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RULE = path.join(ROOT, 'rules', 'no-fabricated-segment-id.yml');

// 🛑 THE NATIVE BINARY, NEVER THE `.bin` SHIM — same convention as
//    `foreign-identifier-gate`, and it is not a preference: on Windows the shim
//    is a `.cmd`, `execFileSync` answers `EINVAL` on it, and the only way to
//    run it would be `shell: true`, which `layers.json` FORBIDS for every layer
//    (`cmd` and `/bin/sh` behave differently per machine).
// 🛑 A MISSING BINARY IS A NAMED REFUSAL, never a skip: `ast-grep` returns
//    EMPTY JSON with EXIT 0 on a path it cannot resolve, so a gate that shrugged
//    here would be GREEN while judging nothing.
function astGrepBinary() {
  const name = process.platform === 'win32' ? 'ast-grep.exe' : 'ast-grep';
  const bin = path.join(ROOT, 'node_modules', '@ast-grep', 'cli', name);
  if (!fs.existsSync(bin)) {
    throw new Error('ast-grep NOT FOUND (' + bin + ') — this gate cannot judge. Run `npm ci`.');
  }
  return bin;
}

// 🛑 `ast-grep` answers EMPTY JSON with EXIT 0 on a path it cannot resolve, so
//    a misresolved perimeter is INDISTINGUISHABLE from a clean repository and
//    this gate would be green FOR EVER. Every floor below exists for that.
function scan(targets) {
  let out = '';
  try {
    out = execFileSync(astGrepBinary(), ['scan', '--rule', RULE, ...targets, '--json=compact'], {
      cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
      // ⚠️ stderr CAPTURED, never inherited: `ast-grep` writes "N error(s)
      //    found" there on every scan, which would pour a fake ERROR into the
      //    runner's output on a GREEN run.
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    // ⚠️ `ast-grep scan` exits ≠ 0 the moment it finds an `error` severity
    //    match — that is a RESULT, not a tool failure, and the findings are on
    //    stdout. Letting this throw would turn every real detection into a
    //    crash that says nothing about the code, and would make the NEGATIVE
    //    check impossible to write. Same handling as `foreign-identifier-gate`.
    out = (e && e.stdout) || '';
  }
  try { return JSON.parse(out || '[]'); } catch { return []; }
}

// The perimeter is DERIVED from git, never a hand-rolled glob: a list only
// knows the files that existed the day it was written.
function trackedJs() {
  // 🛑 SCRUB THE WHOLE `GIT_*` FAMILY — inherited, and they BEAT `cwd`: this gate's
  //    whole perimeter comes from this listing, so a foreign pointer would make it
  //    judge somebody else's files while looking perfectly green on ours.
  // ⚠️ `env: env`, never the `{ env }` shorthand: the judge reads the explicit property.
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('GIT_')) delete env[k];
  return execFileSync('git', ['ls-files', 'src/*.js', 'src/**/*.js', 'test/*.js', 'tools/*.js'], {
    cwd: ROOT, env: env, encoding: 'utf8',
  }).split(/\r?\n/).filter(Boolean);
}

test('GATE: no cell hands a SEGMENT id where the caller hands a BASE', () => {
  const hits = scan(['src', 'test', 'tools']);
  const where = hits.map((h) => `${h.file}:${h.range.start.line + 1}  ${h.lines.trim().slice(0, 90)}`);
  assert.deepStrictEqual(
    where,
    [],
    'A SEGMENT ID WHERE THE CONTRACT SAYS BASE:\n  ' + where.join('\n  ') +
    '\n\n🛑 `pretool-core` reduces ids with `baseId` BEFORE calling, so the first\n' +
    '   argument of `badgeLabel`/`message` never carries a `#j/m`. A cell shaped\n' +
    '   this way exercises a caller that does not exist: it stays GREEN while the\n' +
    '   code it guards is DEAD. That cost a whole session on 2026-09-13.\n' +
    '→ WAY OUT: hand the BASE here, and put the raw ids in `ctx.emitted`.\n' +
    '🛑 There is no budget file and none may be added: this class has no\n' +
    '   legitimate occurrence.',
  );
});

// ⚠️ ANTI-VACUITY ①: the perimeter must really be populated. A floor, never an
//    exact count — a ratchet on the file count would redden on any new file.
test('ANTI-VACUITY: the perimeter is populated and really parsed', () => {
  const files = trackedJs();
  assert.ok(files.length >= 100, `perimeter too small (${files.length} files): the scan is measuring nothing`);

  // ⚠️ ANTI-VACUITY ②: the scanner must really READ that perimeter. A rule
  //    matching a shape nobody writes is indistinguishable from a rule whose
  //    path never resolved — so we prove the binary parses these very files by
  //    asking it for a shape that certainly exists in them.
  const anyCall = execFileSync(astGrepBinary(), ['run', '--pattern', 'badgeLabel($$$)', 'src', 'test', '--json=compact'], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  });
  const calls = anyCall.trim() === '' ? [] : JSON.parse(anyCall);
  assert.ok(calls.length >= 5, `expected the scanner to SEE real badgeLabel calls, found ${calls.length}`);
});

// 🛑 NEGATIVE CHECK — a gate never seen red is a gate ASSUMED to work, and the
//    worst defect of this repository has never been a red gate: it is a GREEN
//    gate that sees nothing. The offender is written to a TMPDIR, never to a
//    real file (an on-disk sabotage brought down 38 tests of other suites on
//    2026-08-03).
test('NEGATIVE: the three fabricated shapes ARE detected, and the cure is NOT', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'seg-id-'));
  const file = path.join(tmp, 'offender.js');
  fs.writeFileSync(file, [
    "badgeLabel(['doc.md#1/2'], ctx);",                                   // 1 — the defect verbatim
    "fileAdapter.message(['doc.md#2/2'], { acc: { labels: {} } });",       // 2 — through an adapter
    "badgeLabel(['doc.md#1/2#2/4'], ctx);",                                // 3 — a re-chunked piece
    "badgeLabel(['doc.md'], { emitted: ['doc.md#1/2'] });",                // cure — MUST pass
    "fileAdapter.message(['doc.md'], { emitted: ['doc.md#2/2'] });",       // cure — MUST pass
    "const ids = ['doc.md#1/2'];",                                         // not a call — MUST pass
    "const prose = \"badgeLabel(['doc.md#1/2'], ctx)\";",                  // a STRING — MUST pass
  ].join('\n'), 'utf8');

  try {
    const hits = scan([file]);
    assert.strictEqual(hits.length, 3, 'expected exactly the 3 fabricated shapes, got ' + hits.length +
      ': ' + hits.map((h) => h.text).join(' · '));
    // ⚠️ The cure must be UNTOUCHED, or the gate would forbid the only way to
    //    exercise the chunk path — and a gate that blocks its own cure gets
    //    disarmed within the day.
    assert.ok(hits.every((h) => !h.lines.includes('emitted')), 'the gate must never accuse `ctx.emitted`');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
