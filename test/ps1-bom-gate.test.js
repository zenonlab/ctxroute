// ═══════════════════════════════════════════════════════════════════════
// GATE — A `.ps1` CARRYING NON-ASCII BYTES MUST START WITH THE UTF-8 BOM
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 MEASURED ON A REAL CI RUN (2026-08-21): `service/install-windows.ps1`
//    carried 2,045 non-ASCII bytes and no BOM. **PowerShell 5.1 reads a `.ps1`
//    as ANSI unless the file starts with a UTF-8 BOM (EF BB BF)** — the whole
//    script died with a PARSER ERROR, before executing a single line. Same
//    class as the XML prolog `Register-ScheduledTask` refuses: an ENCODING
//    fact of a third-party tool, invisible to every test that reads the file
//    as text.
//
// ⚠️ WE READ BYTES, NEVER A DECODED STRING. Node turns a leading BOM into the
//    invisible `U+FEFF`, so a gate written on `readFileSync(p, 'utf8')` would
//    be testing its own decoder and would stay green on the exact file that
//    killed the CI run. The last cell below proves that with real files.
//
// ⚠️ A PURE-ASCII `.ps1` IS EXEMPT, AND THAT EXEMPTION IS STATED IN THE
//    FAILURE MESSAGE ON PURPOSE: below 0x80 ANSI and UTF-8 agree byte for
//    byte, so such a file cannot be misread — requiring a BOM there would be
//    a rule nobody can justify, and an unjustifiable rule gets widened or
//    unplugged. Do NOT turn this into "every .ps1 needs a BOM".
//
// ⚠️ PERIMETER DERIVED FROM `git ls-files`, never a walk of the disk: the
//    hundreds of `.ps1` shipped inside `node_modules/.bin/` belong to other
//    projects and would drown the verdict.
//
// 🛑 SABOTAGE IN MEMORY OR IN THE OS TMPDIR ONLY, never on a real file: a
//    first version of a similar gate in this repo edited a real source and
//    brought down 38 tests of suites running IN PARALLEL.
//
// ⚠️ ONE TRAVERSAL PER STATEMENT, never nested — the quadratic rule of this
//    repository reads the SHAPE, and a judge is not exempt from it.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// 🛑 SCRUB THE WHOLE `GIT_*` FAMILY BEFORE SPAWNING `git`: those variables are
//    EXPORTED by git to every hook it runs, INHERITED by any child, and they
//    BEAT `cwd` (measured 2026-08-21 — a sandbox write landing in the REAL
//    index). Sealed repo-wide by `git-env-door-gate.test.js`.
const ENV_WITHOUT_GIT = (() => {
  const e = { ...process.env };
  for (const k of Object.keys(e)) if (k.startsWith('GIT_')) delete e[k];
  return e;
})();

function git(args, cwd) {
  return execFileSync('git', args, { cwd, env: ENV_WITHOUT_GIT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
// The root is MEASURED by the authority that knows it, never counted in `..`.
const REPO = git(['rev-parse', '--show-toplevel'], HERE).trim();

const BOM = [0xef, 0xbb, 0xbf];
// ⚠️ The DECODED form of those three bytes (`U+FEFF`), built BY CODE POINT and
//    never typed as the character itself: an invisible byte inside a source
//    file is unreviewable, and this repository is public.
const stripDecodedBom = (s) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

/** How many bytes PowerShell 5.1 would decode through the ANSI codepage. */
function countNonAscii(bytes) {
  let n = 0;
  for (let i = 0; i < bytes.length; i += 1) if (bytes[i] >= 0x80) n += 1;
  return n;
}

function startsWithBom(b) {
  return b[0] === BOM[0] && b[1] === BOM[1] && b[2] === BOM[2];
}

/** `null` when the file is safe, else the message naming it. */
function faultFor(f) {
  const nonAscii = countNonAscii(f.bytes);
  if (nonAscii === 0) return null; // pure ASCII: ANSI and UTF-8 agree, exempt
  if (startsWithBom(f.bytes)) return null;
  return f.rel + ' — ' + nonAscii + ' non-ASCII byte(s) and NO UTF-8 BOM: PowerShell 5.1 '
    + 'reads it as ANSI ⇒ PARSER ERROR, the whole script dies before its first line.';
}

/**
 * THE VERDICT — pure, so every sabotage runs on fabricated buffers.
 * @param {{rel: string, bytes: Buffer|number[]}[]} files
 * @returns {string[]} one message per file PowerShell 5.1 would misread.
 */
function bomFaults(files) {
  const judged = files.map(faultFor);
  const faults = judged.filter((f) => f !== null);
  return faults.sort();
}

const readAsBytes = (rel) => ({ rel, bytes: fs.readFileSync(path.join(REPO, rel)) });

/** The tracked `.ps1` files, read as BYTES. */
function trackedPs1() {
  const lines = git(['ls-files'], REPO).split('\n');
  const trimmed = lines.map((s) => s.trim());
  const scripts = trimmed.filter((f) => /[.]ps1$/i.test(f));
  const present = scripts.filter((f) => fs.existsSync(path.join(REPO, f)));
  return present.map(readAsBytes);
}

const PS1 = trackedPs1();

test('GATE: every tracked `.ps1` with non-ASCII bytes starts with the UTF-8 BOM', () => {
  const faults = bomFaults(PS1);
  assert.deepStrictEqual(faults, [],
    'POWERSHELL ENCODING VIOLATION(S) — measured on a real CI run (2026-08-21):\n  ' + faults.join('\n  ')
    + '\n\n🛑 Prepend the three bytes EF BB BF to the file (save it as "UTF-8 with BOM").'
    + '\n⚠️ A PURE-ASCII `.ps1` is DELIBERATELY EXEMPT (below 0x80, ANSI and UTF-8 agree byte for byte):'
    + '\n   do not widen this rule to "every .ps1 needs a BOM" — that rule protects nothing and gets unplugged.');
});

test('ANTI-VACUITY: at least one `.ps1` was really examined, and really read', () => {
  // ⚠️ A gate that scanned ZERO files goes green, and that is this
  //    repository's worst defect class — never a red gate. 📐 Measured
  //    2026-08-21: exactly 1 tracked `.ps1` (`service/install-windows.ps1`);
  //    the hundreds under `node_modules/.bin/` are untracked, hence out.
  assert.ok(PS1.length >= 1,
    'NO tracked `.ps1` examined (' + PS1.length + ') — the perimeter is blind: git? the extension filter? '
    + 'If the last PowerShell script really left the repository, DELETE this gate rather than leave it certifying nothing.');
  const empty = PS1.filter((f) => f.bytes.length === 0);
  assert.deepStrictEqual(empty.map((f) => f.rel), [],
    'a tracked `.ps1` read as ZERO bytes — the reading is broken, so the verdict is vacuous');
});

test('NEGATIVE: the verdict reddens on the MEASURED defect and stays silent elsewhere', () => {
  // ⚠️ IN MEMORY, on fabricated buffers: never a real file.
  const accented = Buffer.from('# ⚠️ ceiling\nWrite-Host "ok"\n', 'utf8');
  const faults = bomFaults([{ rel: 'service/fake.ps1', bytes: accented }]);
  assert.strictEqual(faults.length, 1, 'the exact 2026-08-21 defect (non-ASCII, no BOM) MUST be refused');
  assert.match(faults[0], /^service\/fake\.ps1 — \d+ non-ASCII byte\(s\) and NO UTF-8 BOM/,
    'the message must NAME the file and COUNT what makes it fatal');

  // The same content WITH the BOM is compliant…
  const fixed = bomFaults([{ rel: 'service/fake.ps1', bytes: Buffer.concat([Buffer.from(BOM), accented]) }]);
  assert.deepStrictEqual(fixed, []);
  // …and a pure-ASCII script stays exempt (a STATED exemption, not an oversight).
  const ascii = bomFaults([{ rel: 'service/ascii.ps1', bytes: Buffer.from('Write-Host "ok"\n', 'ascii') }]);
  assert.deepStrictEqual(ascii, []);
  // A BOM-LOOKING prefix that is not the UTF-8 BOM must not pass for one.
  const utf16 = bomFaults([{ rel: 'service/fake.ps1', bytes: Buffer.concat([Buffer.from([0xff, 0xfe]), accented]) }]);
  assert.strictEqual(utf16.length, 1,
    'UTF-16 byte-order marks are NOT the UTF-8 BOM: PowerShell 5.1 would still misread the file');
});

test('NEGATIVE: the gate reads BYTES — a decoded string cannot tell the two apart', () => {
  // 🔴 THE TRAP THIS CELL NAILS DOWN: the decoder ERASES the difference, so a
  //    gate written on text would be green on the file that killed the CI run.
  //    Proven on REAL files, written to the OS tmpdir — never into the repo.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-ps1-bom-'));
  try {
    const withBom = path.join(dir, 'with-bom.ps1');
    const withoutBom = path.join(dir, 'without-bom.ps1');
    const body = '# ⚠️ accent\nWrite-Host "ok"\n';
    fs.writeFileSync(withBom, Buffer.concat([Buffer.from(BOM), Buffer.from(body, 'utf8')]));
    fs.writeFileSync(withoutBom, Buffer.from(body, 'utf8'));

    assert.deepStrictEqual(bomFaults([{ rel: 'with-bom.ps1', bytes: fs.readFileSync(withBom) }]), [],
      'a real BOM-prefixed file must pass');
    assert.strictEqual(bomFaults([{ rel: 'without-bom.ps1', bytes: fs.readFileSync(withoutBom) }]).length, 1,
      'a real file without the BOM must be refused');
    assert.strictEqual(
      stripDecodedBom(fs.readFileSync(withBom, 'utf8')),
      fs.readFileSync(withoutBom, 'utf8'),
      'if these two TEXTS ever differ, re-read this cell before ever trusting a decoded comparison');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
