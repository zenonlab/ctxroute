// ═══════════════════════════════════════════════════════════════════════
// GATE — COMPLEXITY DECLARES ITSELF (third twin of TIME and SPACE)
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ THE RULE THIS FILE MECHANISES. The target is a fleet of HUNDREDS of sites
//    with THOUSANDS of pages. A scale defect does not "slow things down": it
//    CLOSES A CONTRACT, and its retrofit is prohibitive, so it belongs to the
//    SPEC and never to a later tuning pass. Before any loop or structure that
//    walks a collection: AND AT 10,000? — 5,000 elements compared pairwise is
//    12.5 million pairs.
//
// ⚠️ WHY A MACHINE AND NOT A LINE OF PROSE. The doctrine has carried this rule
//    for weeks and this repository had NO gate for it. A quadratic write path
//    was introduced into `src/memory-store-pure.js` and was caught BY LUCK —
//    two test cells timing out — not by any judge. "A rule that only prose
//    guards is not a rule": where a machine existed, compliance was total;
//    where only prose existed, it drifted every single time.
//
// 🛑 STRICT SEPARATION OF POWERS, DO NOT BLUR IT:
//      · `rules/no-undeclared-quadratic.yml` = DETECTION, with NO exemption.
//      · this file + `src/quadratic-budget-pure.js` + `quadratic-budget.json`
//        = POLICY (admissible classes) and RATCHET (how many, where, why).
//    A `files:`/`ignores:` added to the rule would hide occurrences from the
//    budget in silence — an exemption nobody would ever read again.
//
// ⚠️ IT DOES NOT REPLACE A BEHAVIOURAL SCALE TEST, AND VICE VERSA. A behaviour
//    judge only ever sees what someone thought of submitting to it; this one
//    DETECTS everywhere, including where nobody thought of writing a test. Both,
//    always.
//
// ⚠️ AST, NEVER REGEX (fleet doctrine, load-bearing here): a nested loop quoted
//    in a comment or in a string is a FALSE POSITIVE, and a noisy gate is a gate
//    people stop reading, then unplug. Proven below by a dedicated check.
//
// ⚠️ THE PERIMETER IS DERIVED FROM `git ls-files`, NEVER hand-written, and the
//    files are handed to `ast-grep` EXPLICITLY rather than letting it walk the
//    tree. That is not a detail: `ast-grep` HONOURS `.gitignore` (3rd blindness
//    measured on 2026-08-06 in this repo), so a directory gitignored tomorrow
//    would make a tree walk go blind WITHOUT SAYING A WORD. 🛑 And there is NO
//    glob exclusion (`!**/*.test.*`): that would be a permanent hole — files
//    outside the perimeter are outside it BY CONSTRUCTION, never by exception.
//
// ⚠️ ANTI-VACUITY (3 layers, none replaces another): a floor on the perimeter,
//    a CONTROL file smuggled into a real perimeter scan, and a WITNESS per rule
//    atom whose detection is REQUIRED. 🔴 The mute scan is not theoretical:
//    `ast-grep` returns an EMPTY JSON with EXIT CODE 0 when handed a path
//    outside the project, so a misresolved perimeter is INDISTINGUISHABLE from
//    a perfectly clean repository and the gate would be green FOR EVER.
//
// ⚠️ WITNESSES AND DECOYS LIVE IN THE OS TMPDIR, outside every production
//    perimeter. Writing a decoy into `src/` or `test/` would make the arbo,
//    doc-coverage and english-only gates go red AT RANDOM (vitest runs suites
//    in parallel). A gate must never make another gate flaky.
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
//    as `temporal-budget-pure.js`. Its exhaustive cases (bounds, adversarial
//    inputs, sorting) live in `quadratic-budget-pure.test.js`, which IS mutated.
import { verdict, CLASSES } from '../src/quadratic-budget-pure.js';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEP = String.fromCharCode(92);
const RULE = path.join(repo, 'rules', 'no-undeclared-quadratic.yml');
const manifest = JSON.parse(fs.readFileSync(path.join(repo, 'quadratic-budget.json'), 'utf8'));

const HELP =
  '\n→ WAY OUT: inverted index / Map / Set — prune what you PROVE out of range.'
  + '\n→ Genuinely bounded (a constant table, a fixed key set)? Declare the class O(N) + the WHY.'
  + '\n🛑 NEVER a probabilistic algorithm (LSH, sampling): here a false negative has a client cost.';

// ⚠️ LOUD FAILURE, never an empty scan: a gate finding nothing because its TOOL
//    is missing would go green while blind — the worst of both worlds.
// 🛑 NO SILENT FALLBACK ON `npx`. A neighbouring gate in this fleet did exactly
//    that and said nothing about it: `npx` fetches a STRANGER package from the
//    network when it cannot resolve locally, and a report produced by the wrong
//    binary is indistinguishable from a real one. A gate that finds its tool
//    "some other way" can also fail to find it at all, and stay quiet.
function astGrepBinary() {
  const name = process.platform === 'win32' ? 'ast-grep.exe' : 'ast-grep';
  const bin = path.join(repo, 'node_modules', '@ast-grep', 'cli', name);
  if (!fs.existsSync(bin)) {
    throw new Error('ast-grep NOT FOUND (' + bin + ') — the quadratic gate cannot judge. `npm ci`.');
  }
  return bin;
}

/** Perimeter = the JavaScript files TRACKED BY GIT. Derived, never listed. */
function perimeter() {
  // 🛑 SCRUB THE WHOLE `GIT_*` FAMILY: git EXPORTS `GIT_DIR`/`GIT_INDEX_FILE`
  //    to every hook it runs, a child INHERITS them and they BEAT `cwd` —
  //    under a poisoned env this perimeter would be ANOTHER repository's, the
  //    mute-scan failure this file already fears, by a different door.
  //    Sealed repo-wide by `git-env-door-gate.test.js` (measured 2026-08-21).
  const envWithoutGit = { ...process.env };
  for (const k of Object.keys(envWithoutGit)) if (k.startsWith('GIT_')) delete envWithoutGit[k];
  const out = execFileSync('git', ['ls-files'], { cwd: repo, env: envWithoutGit, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  // ⚠️ ONE TRAVERSAL PER STATEMENT, never a chain. `a.map(f).filter(g)` is, to
  //    the rule, a traversal nested in a traversal (the receiver of `.filter` is
  //    the `.map` node): the judge would be its own first defendant.
  const lines = out.split('\n');
  const trimmed = lines.map((s) => s.trim());
  const js = trimmed.filter((f) => /[.](js|mjs|cjs)$/.test(f));
  return js.filter((f) => fs.existsSync(path.join(repo, f)));
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

/**
 * The rule's ATOMS, DERIVED from the `.yml` — never a list copied into the test.
 * An atom added tomorrow enters the witness table by itself and stays RED until
 * someone pairs it with a real line of code. That is the only form that holds in
 * a repository written by agents and reviewed by nobody.
 * ⚠️ Both `kind:` (the 4 loop nodes) AND `pattern:` (the array methods) count as
 *    atoms: a traversal is NOT only a `for` loop, and the only O(N²) ever
 *    measured on this doctrine was a `.find()` inside a loop.
 * ⚠️ The trailing inline comment is stripped (`- kind: for_statement  # for..`),
 *    otherwise the atom would carry the comment and no witness could ever match.
 */
function atomsOfRule() {
  const src = fs.readFileSync(RULE, 'utf8');
  const lines = src.split('\n');
  const hits = lines.map((l) => /^\s*-\s*(?:kind|pattern):\s*(.+?)\s*$/.exec(l));
  const found = hits.filter(Boolean);
  return found.map((m) => m[1].replace(/\s+#.*$/, ''));
}

function writeTmp(prefix, basename, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const file = path.join(dir, basename);
  fs.writeFileSync(file, content);
  return { dir, file };
}

test('GATE: every nested traversal is DECLARED, with an admissible class', () => {
  const faults = verdict(scan(), manifest.files);
  assert.deepStrictEqual(faults, [],
    'QUADRATIC BUDGET VIOLATION(S):\n  ' + faults.join('\n  ')
    + '\n\n🛑 A traversal inside a traversal is O(N²) until something proves otherwise.'
    + '\n🛑 NEVER raise a `max` to make a push go through: that declares the code'
    + '\n   has the right to get worse. The ratchet only ever goes DOWN.'
    + HELP);
});

test('GATE: the admissible classes are documented, and only those', () => {
  // The manifest DESCRIBES the classes for whoever reads it; the pure module
  // DECIDES them. Two places, so they must be proven equal — a description that
  // drifts from the decision is how a closed list quietly becomes an open one.
  assert.deepStrictEqual(manifest.classes.slice().sort(), CLASSES.slice().sort(),
    'the manifest documents classes that the gate does not admit (or the reverse)');
});

test('ANTI-VACUITY: the perimeter is populated AND the scanner really reads it', () => {
  // ⚠️ TWO INDEPENDENT LAYERS, because they fail differently.
  //    ① A FLOOR on the perimeter catches a `git ls-files` that came back empty
  //       or was run from the wrong directory (measured in this repo: a gate
  //       judging 94 test files and ZERO module, floor perfectly satisfied).
  //    ② A CONTROL smuggled into a REAL perimeter scan catches the failure the
  //       floor cannot see: `ast-grep` answers `[]` with exit code 0 on a path
  //       it cannot resolve, so a misresolved perimeter is indistinguishable
  //       from a clean repository. 🛑 A floor measures a QUANTITY, never an
  //       IDENTITY — never conclude a gate is alive because its floor passes.
  const files = perimeter();
  assert.ok(files.length >= manifest.floors.perimeterFiles,
    'suspicious perimeter: ' + files.length + ' JavaScript files tracked by git, floor '
    + manifest.floors.perimeterFiles + ' — the gate is blind (git? the extension filter?)');

  const control = writeTmp('ctxroute-quadratic-control-', 'control.js',
    'export const f = (xs, ys) => { for (const x of xs) { for (const y of ys) { use(x, y); } } };\n');
  try {
    const seen = scan(files.concat([control.file]));
    assert.ok(seen.some((m) => m.file.endsWith('control.js')),
      'the CONTROL was not found in a full perimeter scan — the invocation is mute: '
      + 'an empty result would then be indistinguishable from a clean repository, for ever.');
  } finally {
    fs.rmSync(control.dir, { recursive: true, force: true });
  }
});

test('ANTI-INERT: every atom of the rule really DETECTS its witness', () => {
  const atoms = atomsOfRule();
  assert.ok(atoms.length >= 10,
    'only ' + atoms.length + ' atom(s) extracted from ' + RULE
    + ' — the extraction is broken, hence this whole test is vacuous');

  // ⚠️ THE OS TMPDIR, NOT a folder of the repo: `ast-grep` HONOURS `.gitignore`,
  //    and witnesses written into an ignored folder are INVISIBLE (measured
  //    2026-08-06 — the anti-inert test then wrongly accused every rule); while
  //    a decoy written into `src/` or `test/` would make PARALLEL gates go red
  //    at random.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-quadratic-witness-'));
  const withoutWitness = [];
  const blind = [];
  let n = 0;
  try {
    for (const atom of atoms) {
      const witness = manifest.witnesses[atom];
      n += 1;
      if (typeof witness !== 'string' || witness === '') { withoutWitness.push(atom); continue; }
      const tmp = path.join(dir, 'w' + n + '.js');
      fs.writeFileSync(tmp, witness + '\n');
      if (scan([tmp]).length === 0) blind.push(atom + ' — witness NOT detected: ' + witness);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  assert.deepStrictEqual(withoutWitness, [],
    'ATOM(S) WITHOUT A WITNESS — impossible to prove they see anything at all: ' + withoutWitness.join(', ')
    + '\n⇒ add the real line of code to `witnesses` in quadratic-budget.json.');
  assert.deepStrictEqual(blind, [],
    'INERT ATOM(S) — green while seeing NOTHING:\n  ' + blind.join('\n  '));
});

test('ANTI-INERT: a FUNCTIONAL traversal over ANOTHER array is detected (the metavariable trap)', () => {
  // 🔴 THIS CELL EXISTS BECAUSE THE FIRST VERSION OF THIS RULE MISSED IT, in the
  //    repository it was born in. CAPTURING metavariables UNIFY across the two
  //    levels: the one bound to the OUTER array then REQUIRED the same array on
  //    the inner level, so `xs.map(x => ys.find(...))` — the most common shape of
  //    the modern O(N²) — went GREEN. The rule saw 4 shapes out of 5 and looked
  //    perfectly correct. It was caught by a WITNESS, never by reading.
  // 🛑 NEVER remove this cell, and NEVER remove the `_` of `$_IT`/`$$$_A`.
  const w = writeTmp('ctxroute-quadratic-functional-', 'functional.js',
    'export const f = (xs, ys) => xs.map((x) => ys.find((y) => y.id === x.id));\n');
  try {
    assert.ok(scan([w.file]).length > 0,
      'a functional traversal nested over a DIFFERENT array went undetected — '
      + 'the metavariables have become capturing, and 4 shapes out of 5 now look correct.');
  } finally {
    fs.rmSync(w.dir, { recursive: true, force: true });
  }
});

test('ANTI-INERT: a LINEAR SEARCH inside a loop is detected (not syntactically a nested loop)', () => {
  // ⚠️ The only O(N²) ever MEASURED on this doctrine was a `.find()` inside a
  //    loop — syntactically NOT a nested loop. A rule seeing only `for`-in-`for`
  //    would be HOLLOW on the very shape that bites, and bypassable by rewriting
  //    it as `.map()`.
  const w = writeTmp('ctxroute-quadratic-search-', 'search.js',
    'export const f = (xs, ys) => { for (const x of xs) { if (ys.includes(x)) return x; } return null; };\n');
  try {
    assert.ok(scan([w.file]).length > 0,
      'a linear search inside a loop went undetected — the array methods have left the rule.');
  } finally {
    fs.rmSync(w.dir, { recursive: true, force: true });
  }
});

test('GATE: the detection rule carries NO exemption', () => {
  // The rule DETECTS, the budget EXEMPTS. An `ignores:`/`files:` in the rule
  // would remove occurrences from the budget's sight — an exemption that no
  // reviewer would ever meet, since the budget is the only file people read.
  const src = fs.readFileSync(RULE, 'utf8');
  const lines = src.split('\n');
  const code = lines.filter((l) => !/^\s*#/.test(l));
  const body = code.join('\n');
  for (const key of ['ignores:', 'files:']) {
    assert.ok(!body.includes(key),
      'rules/no-undeclared-quadratic.yml carries `' + key + '`: detection must be TOTAL, '
      + 'exemptions belong to the budget. A glob exclusion is a PERMANENT hole.');
  }
});

test('NEGATIVE: the WIRING really reddens on a fabricated occurrence', () => {
  // ⚠️ IN MEMORY. Never on a real file: a sabotage on disk has already brought
  //    down 38 tests of other suites running in parallel here.
  // ⚠️ SCOPE: this proves that THIS gate is plugged into the verdict and would
  //    scream — the exhaustive fault cases (bounds, adversarial inputs, sorting)
  //    belong to `quadratic-budget-pure.test.js`, the suite Stryker mutates.
  //    Duplicating them here would create a second truth that drifts.
  const real = scan();
  const sabotaged = verdict(
    real.concat([{ file: 'src/never-declared-xyz.js', line: 1, text: 'for (a) { for (b) {} }' }]),
    manifest.files);
  assert.ok(sabotaged.some((f) => f.startsWith('src/never-declared-xyz.js')),
    'SABOTAGE NOT DETECTED: a nested traversal in an undeclared file would pass this gate.');
});

test('NEGATIVE: a SIMPLE loop is not counted (zero false positive)', () => {
  const w = writeTmp('ctxroute-quadratic-simple-', 'simple.js',
    'export const f = (xs) => { for (const x of xs) { use(x); } };\n');
  try {
    assert.deepStrictEqual(scan([w.file]), [],
      'a LINEAR traversal was counted — the gate would produce false positives, '
      + 'and a noisy gate ends up unplugged.');
  } finally {
    fs.rmSync(w.dir, { recursive: true, force: true });
  }
});

test('NEGATIVE: ast-grep ignores a nesting written in a comment or a string', () => {
  // ⚠️ THIS is the reason for AST over regex, and it is not theoretical: a grep
  //    laid on this doctrine returned 88 candidates, almost all false (loops over
  //    FIXED lists) — noise that would have got the whole gate abandoned.
  const w = writeTmp('ctxroute-quadratic-mention-', 'mention.js',
    '// for (const a of b) { for (const c of d) { use(a, c); } }\n'
    + "export const s = 'for (const x of y) { z.find(w) }';\n"
    + 'export const t = `for (const x of y) { z.find(w) }`;\n');
  try {
    assert.deepStrictEqual(scan([w.file]), [],
      'ast-grep counted a MENTION as code — the gate would produce false positives.');
  } finally {
    fs.rmSync(w.dir, { recursive: true, force: true });
  }
});
