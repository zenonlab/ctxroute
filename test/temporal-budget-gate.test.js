// ═══════════════════════════════════════════════════════════════════════
// GATE — TIME DECLARES ITSELF (2026-08-20)
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ THE RULE THIS FILE MECHANISES. Before any delay: WHO KNOWS? LOCAL, the
//    kernel KNOWS — a process exit, a closed socket, an `EADDRINUSE` are FACTS
//    the OS delivers. Waiting a fixed number of milliseconds instead of asking
//    the authority that knows is not caution, it is a BUG that fires on a
//    loaded machine. Only two motives remain admissible: `distant` (no
//    authority is reachable at all) and `undecidable` (alive-versus-frozen,
//    i.e. the halting problem).
//
// ⚠️ WHY A MACHINE AND NOT A LINE OF PROSE. The doctrine has said this for
//    weeks and this repository had NO gate for it, while it does carry nine
//    temporal calls. "A rule that only prose guards is not a rule" — the
//    measured split of 2026-08-19: where a machine existed, compliance was
//    total; where only prose existed, it drifted every single time.
//
// 🛑 STRICT SEPARATION OF POWERS, DO NOT BLUR IT:
//      · `rules/temporal-call.yml`  = DETECTION, with NO exemption whatsoever.
//      · this file + `temporal-budget.json` = POLICY (admissible motives) and
//        RATCHET (how many, where, why).
//    A `files:`/`ignores:` added to the rule would hide occurrences from the
//    budget in silence — an exemption nobody would ever read again.
//
// ⚠️ AST, NEVER REGEX (fleet doctrine, and it is load-bearing here): a
//    `setTimeout` quoted in a comment or in a string is a FALSE POSITIVE.
//    Proven below by a negative-check on a real file.
//
// ⚠️ THE PERIMETER IS DERIVED FROM `git ls-files`, NEVER hand-written, and the
//    files are handed to `ast-grep` EXPLICITLY rather than letting it walk the
//    tree. That is not a detail: `ast-grep` HONOURS `.gitignore` (3rd
//    blindness measured on 2026-08-06 in this repo), so a directory gitignored
//    tomorrow would make a tree walk go blind WITHOUT SAYING A WORD. Naming
//    the tracked files removes that failure mode entirely — a tracked file is
//    scanned even if some ignore rule would have hidden it.
//
// ⚠️ ANTI-VACUITY (3 layers, none replaces another): a floor on the perimeter,
//    a floor on the number of detected calls, and a WITNESS per rule atom
//    whose detection is REQUIRED. The worst defect of this repository has
//    never been a red gate: it is a GREEN gate that sees nothing.
//
// ⚠️ IN-MEMORY SABOTAGE ONLY. The verdict is a PURE function of (occurrences,
//    budget), so every negative-check runs on fabricated data. A first version
//    of another gate here sabotaged a REAL file and brought down 38 tests of
//    other suites running in parallel. Never write into the working tree.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
// ⚠️ THE VERDICT LIVES IN A PURE MODULE, and that is not tidiness: Stryker does
//    NOT mutate test code, so a rule written here would be UNVERIFIABLE — an
//    inverted comparison would stay green for ever. Same reasoning, same remedy
//    as `deps-criticality-pure.js`. Its exhaustive cases (bounds, adversarial
//    inputs, sorting) live in `temporal-budget-pure.test.js`, which IS mutated.
import { verdict, ADMISSIBLE } from '../src/temporal-budget-pure.js';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEP = String.fromCharCode(92);
const RULE = path.join(repo, 'rules', 'temporal-call.yml');
const manifest = JSON.parse(fs.readFileSync(path.join(repo, 'temporal-budget.json'), 'utf8'));

// ⚠️ LOUD FAILURE, never an empty scan: a gate finding nothing because its
//    TOOL is missing would go green while blind — the worst of both worlds.
function astGrepBinary() {
  const name = process.platform === 'win32' ? 'ast-grep.exe' : 'ast-grep';
  const bin = path.join(repo, 'node_modules', '@ast-grep', 'cli', name);
  if (!fs.existsSync(bin)) {
    throw new Error('ast-grep NOT FOUND (' + bin + ') — the temporal gate cannot judge. `npm ci`.');
  }
  return bin;
}

/** Perimeter = the JavaScript files TRACKED BY GIT. Derived, never listed. */
function perimeter() {
  const out = execFileSync('git', ['ls-files'], { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return out.split('\n').map((s) => s.trim())
    .filter((f) => /[.](js|mjs|cjs)$/.test(f))
    .filter((f) => fs.existsSync(path.join(repo, f)));
}

/**
 * @param {string[]} [targets] files to scan; absent ⇒ the whole perimeter.
 * @returns {{file: string, line: number, text: string}[]}
 */
function scan(targets) {
  const files = targets || perimeter();
  if (files.length === 0) return [];
  let out = '';
  try {
    out = execFileSync(astGrepBinary(), ['scan', '-r', RULE, '--json=compact'].concat(files), {
      cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
      // ⚠️ stderr CAPTURED, not inherited: `ast-grep` writes "N error(s) found"
      //    on stderr for every scan, which would pour a fake ERROR into the
      //    runner's output on a GREEN run — and a green that looks red is how
      //    people stop reading a suite.
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    // ⚠️ `ast-grep scan` exits ≠ 0 as soon as it finds an `error` severity
    //    match — that is the NORMAL case here, the findings are on stdout.
    out = (e && e.stdout) || '';
  }
  let r = [];
  try { r = JSON.parse(out || '[]'); } catch { r = []; }
  return r.map((m) => ({
    file: String(m.file).split(SEP).join('/'),
    line: m.range.start.line + 1,
    text: String(m.text).replace(/\s+/g, ' ').slice(0, 80),
  }));
}

test('GATE: every temporal call is DECLARED, with an admissible motive', () => {
  const faults = verdict(scan(), manifest.budget);
  assert.deepStrictEqual(faults, [],
    'TEMPORAL BUDGET VIOLATION(S):\n  ' + faults.join('\n  ')
    + '\n\n🛑 Before declaring a delay, ask WHO KNOWS. Locally the kernel knows'
    + '\n   (process exit, closed socket, EADDRINUSE) — then the delay is a BUG.'
    + '\n   Only `distant` and `undecidable` are admissible motives.');
});

test('GATE: the admissible motives are documented, and only those', () => {
  // The manifest DESCRIBES the motives for whoever reads it; the test DECIDES
  // them. Two places, so they must be proven equal — a description that drifts
  // from the decision is how a closed list quietly becomes an open one.
  assert.deepStrictEqual(Object.keys(manifest.motives).sort(), ADMISSIBLE.slice().sort(),
    'the manifest documents motives that the gate does not admit (or the reverse)');
});

test('ANTI-VACUITY: the scan really sees the repository', () => {
  // ⚠️ A gate analysing NOTHING goes green — paid three times in this repo
  //    (`deps-purity`, `deadline-gate`, `layers-gate`). Two independent floors:
  //    the perimeter must be populated AND the detection must still find
  //    something in it.
  const files = perimeter();
  assert.ok(files.length >= manifest.floors.perimeterFiles,
    'suspicious perimeter: ' + files.length + ' JavaScript files tracked by git, floor '
    + manifest.floors.perimeterFiles + ' — the gate is blind (git? the extension filter?)');
  const occ = scan();
  assert.ok(occ.length >= manifest.floors.temporalCalls,
    'suspicious scan: ' + occ.length + ' temporal call(s) found, floor ' + manifest.floors.temporalCalls
    + ' — the RULE is broken, not the repository');
});

test('ANTI-INERT: every atom of the rule really DETECTS its witness', () => {
  // ⚠️ DERIVED FROM THE RULE, never a list copied into the test: an atom added
  //    tomorrow enters this table by itself and stays RED until someone pairs
  //    it with a real line of code. That is the only form that holds in a
  //    repository written by agents and reviewed by nobody.
  const atoms = fs.readFileSync(RULE, 'utf8').split('\n')
    .map((l) => /^\s*-\s*pattern:\s*(.+?)\s*$/.exec(l)).filter(Boolean).map((m) => m[1]);
  assert.ok(atoms.length >= 3,
    'no atom extracted from ' + RULE + ' — the extraction is broken, hence this whole test is vacuous');

  // ⚠️ THE OS TMPDIR, NOT `state/`: `ast-grep` HONOURS `.gitignore`, and
  //    witnesses written into an ignored folder are INVISIBLE (measured
  //    2026-08-06 — the anti-inert test then wrongly accused every rule).
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-temporal-witness-'));
  const withoutWitness = [];
  const blind = [];
  try {
    for (const atom of atoms) {
      const witness = manifest.witnesses[atom];
      if (typeof witness !== 'string' || witness === '') { withoutWitness.push(atom); continue; }
      const tmp = path.join(dir, 'w' + atoms.indexOf(atom) + '.js');
      fs.writeFileSync(tmp, witness + '\n');
      if (scan([tmp]).length === 0) blind.push(atom + ' — witness NOT detected: ' + witness);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  assert.deepStrictEqual(withoutWitness, [],
    'ATOM(S) WITHOUT A WITNESS — impossible to prove they see anything at all: ' + withoutWitness.join(', ')
    + '\n⇒ add the real line of code to `witnesses` in temporal-budget.json.');
  assert.deepStrictEqual(blind, [],
    'INERT ATOM(S) — green while seeing NOTHING:\n  ' + blind.join('\n  '));
});

test('GATE: the detection rule carries NO exemption', () => {
  // The rule DETECTS, the budget EXEMPTS. An `ignores:`/`files:` in the rule
  // would remove occurrences from the budget's sight — an exemption that no
  // reviewer would ever meet, since the budget is the only file people read.
  const src = fs.readFileSync(RULE, 'utf8')
    .split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  for (const key of ['ignores:', 'files:']) {
    assert.ok(!src.includes(key),
      'rules/temporal-call.yml carries `' + key + '`: detection must be TOTAL, exemptions belong to the budget.');
  }
});

test('NEGATIVE: the WIRING really reddens on a fabricated occurrence', () => {
  // ⚠️ IN MEMORY. Never on a real file: a sabotage on disk has already brought
  //    down 38 tests of other suites running in parallel here.
  // ⚠️ SCOPE: this proves that THIS gate is plugged into the verdict and would
  //    scream — the exhaustive fault cases (bounds, adversarial inputs, sorting)
  //    belong to `temporal-budget-pure.test.js`, the suite Stryker mutates.
  //    Duplicating them here would create a second truth that drifts.
  const real = scan();
  const sabotaged = verdict(real.concat([{ file: 'src/never-declared-xyz.js', line: 1, text: 'setTimeout(f, 10)' }]),
    manifest.budget);
  assert.ok(sabotaged.some((f) => f.startsWith('src/never-declared-xyz.js')),
    'SABOTAGE NOT DETECTED: a temporal call in an undeclared file would pass this gate.');
});

test('NEGATIVE: ast-grep ignores a MENTION in a comment or a string', () => {
  // ⚠️ THIS is the reason for AST over regex, and it is not theoretical here:
  //    `test/session-store.test.js` carries an `Atomics.wait` inside a template
  //    literal (the source of a child script) — a regex counts it, the AST does
  //    not. That blind cell is DECLARED in the manifest, never hidden.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-temporal-mention-'));
  try {
    const tmp = path.join(dir, 'mention.js');
    fs.writeFileSync(tmp, '// setTimeout(f, 10) quoted in a comment\n'
      + "const s = 'setTimeout(f, 10)';\n"
      + 'const t = `setTimeout(f, 10)`;\n'
      + 'module.exports = { s, t };\n');
    assert.deepStrictEqual(scan([tmp]), [],
      'ast-grep counted a MENTION as a call — the gate would produce false positives, and a noisy gate ends up unplugged.');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
