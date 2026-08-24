// ═══════════════════════════════════════════════════════════════════════
// GATE — A STATE ENTRY IS PROPAGATED, NEVER REBUILT BY LITERAL
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ THE CLASS THIS FILE MECHANISES, and it is NOT "this field was forgotten":
//    **REBUILDING A RECORD FIELD BY FIELD SILENTLY DROPS EVERY FIELD ABSENT
//    FROM THE LIST.** The literal asserts "here is the whole entry now" — an
//    assertion about fields its author never considered — and nothing goes
//    red: the shape stays valid, the suite stays green, and whatever lived in
//    a dropped field is simply gone.
//
// 🔴 THIS REPOSITORY HAS PAID IT TWICE, both times under a complete green:
//      · `src/sources/skill.js` — `skillRules` rebuilt its rule field by
//        field, so the `keys` operator was born INERT on 8 fleet entries out
//        of 8, with its schema, its validator, 959 green tests and 100 %
//        mutation.
//      · `src/gate.js` — the foreign-action branch rebuilt a smart doc's entry
//        as `{ seen, sinceLastCall: n + 1 }` and dropped `denied`, the flag
//        that carries "a block is NEVER followed by a block". A refused
//        gesture was therefore refused a SECOND time. 28 of 1,024 decisions
//        diverged from the independent model, all in the same direction.
//    A third occurrence is a matter of when, not whether — hence a machine.
//
// 🛑 STRICT SEPARATION OF POWERS, DO NOT BLUR IT:
//      · `rules/no-rebuilt-state-entry.yml` = DETECTION, with NO exemption.
//      · this file + `src/state-entry-rebuild-pure.js` +
//        `state-entry-rebuild-budget.json` = POLICY (admissible classes) and
//        RATCHET (how many, where, why).
//    A `files:`/`ignores:` added to the rule would hide occurrences from the
//    budget in silence — an exemption nobody would ever read again.
//
// ⚠️ AST, NEVER REGEX. `store[k] = { a: b.c }` written inside a comment or a
//    string is a FALSE POSITIVE, and this gate's whole viability rests on its
//    zero-noise measurement. Proven below by a dedicated check.
//
// ⚠️ THE PERIMETER IS DERIVED FROM `git ls-files`, NEVER hand-written, and the
//    files are handed to `ast-grep` EXPLICITLY rather than letting it walk the
//    tree: `ast-grep` HONOURS `.gitignore`, so a directory gitignored tomorrow
//    would make a tree walk go blind WITHOUT SAYING A WORD.
//
// ⚠️ ANTI-VACUITY (3 layers, none replaces another): a floor on the perimeter,
//    a CONTROL file smuggled into a real perimeter scan, and a WITNESS per
//    rule atom whose detection is REQUIRED. 🔴 The mute scan is not
//    theoretical: `ast-grep` returns an EMPTY JSON with EXIT CODE 0 when
//    handed a path outside the project, so a misresolved perimeter is
//    INDISTINGUISHABLE from a perfectly clean repository — and this budget is
//    legitimately EMPTY today, so "found nothing" is exactly what a healthy
//    run looks like. Without these three layers the gate would be green FOR
//    EVER and nobody could tell.
//
// ⚠️ WITNESSES AND DECOYS LIVE IN THE OS TMPDIR, outside every production
//    perimeter. Writing a decoy into `src/` or `test/` would make the arbo,
//    doc-coverage and english-only gates go red AT RANDOM (vitest runs suites
//    in parallel). A gate must never make another gate flaky.
//
// ⚠️ IN-MEMORY SABOTAGE ONLY. The verdict is a PURE function of (occurrences,
//    budget), so every negative check runs on fabricated data. A first version
//    of a neighbouring gate sabotaged a REAL file and brought down 38 tests of
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
//    inverted comparison would stay green for ever.
import { verdict, CLASSES } from '../src/state-entry-rebuild-pure.js';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEP = String.fromCharCode(92);
const RULE = path.join(repo, 'rules', 'no-rebuilt-state-entry.yml');
const manifest = JSON.parse(fs.readFileSync(path.join(repo, 'state-entry-rebuild-budget.json'), 'utf8'));

const HELP =
  '\n→ WAY OUT: propagate the existing record — `{ ...entry, field: newValue }`.'
  + '\n   The spread is what keeps the record SHAPE OPEN: a field added tomorrow'
  + '\n   survives by CONSTRUCTION instead of being born inert.'
  + '\n🛑 NEVER raise a `max` to make a push go through: that declares the code'
  + '\n   has the right to lose fields quietly.';

// ⚠️ LOUD FAILURE, never an empty scan: a gate finding nothing because its TOOL
//    is missing would go green while blind — and this budget is EMPTY, so a
//    blind run is indistinguishable from a healthy one on the numbers alone.
// 🛑 NO SILENT FALLBACK ON `npx`: it fetches a STRANGER package from the
//    network when it cannot resolve locally, and a report produced by the wrong
//    binary is indistinguishable from a real one.
function astGrepBinary() {
  const name = process.platform === 'win32' ? 'ast-grep.exe' : 'ast-grep';
  const bin = path.join(repo, 'node_modules', '@ast-grep', 'cli', name);
  if (!fs.existsSync(bin)) {
    throw new Error('ast-grep NOT FOUND (' + bin + ') — the state-entry-rebuild gate cannot judge. `npm ci`.');
  }
  return bin;
}

/** Perimeter = the JavaScript files TRACKED BY GIT. Derived, never listed. */
function perimeter() {
  // 🛑 SCRUB THE WHOLE `GIT_*` FAMILY: git EXPORTS `GIT_DIR`/`GIT_INDEX_FILE`
  //    to every hook it runs, a child INHERITS them and they BEAT `cwd` — under
  //    a poisoned env this perimeter would be ANOTHER repository's, which is
  //    the mute-scan failure this file already fears, by a different door.
  const envWithoutGit = { ...process.env };
  for (const k of Object.keys(envWithoutGit)) if (k.startsWith('GIT_')) delete envWithoutGit[k];
  const out = execFileSync('git', ['ls-files'], { cwd: repo, env: envWithoutGit, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  // ⚠️ ONE TRAVERSAL PER STATEMENT, never a chain: to the neighbouring
  //    quadratic rule, `a.map(f).filter(g)` is a traversal nested in a
  //    traversal — a judge must not be its own first defendant.
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
      //    runner's output on a GREEN run.
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    // ⚠️ `ast-grep scan` exits ≠ 0 as soon as it finds an `error` severity
    //    match — that is a RESULT, not a tool failure, and the findings are on
    //    stdout. Letting this throw would turn every real detection into a
    //    crash that says nothing about the code.
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
 * someone pairs it with a real line of code.
 * ⚠️ The trailing inline comment is stripped, otherwise the atom would carry it
 *    and no witness could ever match.
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

test('GATE: every record rebuilt by literal is DECLARED, with an admissible class', () => {
  const faults = verdict(scan(), manifest.files);
  assert.deepStrictEqual(faults, [],
    'STATE-ENTRY REBUILD VIOLATION(S):\n  ' + faults.join('\n  ')
    + '\n\n🛑 A literal that REPLACES a record while DERIVING from it drops every'
    + '\n   field absent from the list, silently — that is how `keys` was born inert'
    + '\n   on 8 skills out of 8, and how `denied` stopped guaranteeing the anti-loop.'
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
  // ⚠️ TWO INDEPENDENT LAYERS, because they fail differently, and BOTH matter
  //    more here than anywhere else in this repository: the budget is EMPTY, so
  //    "the scan found nothing" is precisely what a healthy run looks like. A
  //    mute scan and a clean repository produce the same green.
  //    ① A FLOOR on the perimeter catches a `git ls-files` that came back empty
  //       or ran from the wrong directory.
  //    ② A CONTROL smuggled into a REAL perimeter scan catches what the floor
  //       cannot see: `ast-grep` answers `[]` with exit code 0 on a path it
  //       cannot resolve. 🛑 A floor measures a QUANTITY, never an IDENTITY.
  const files = perimeter();
  assert.ok(files.length >= manifest.floors.perimeterFiles,
    'suspicious perimeter: ' + files.length + ' JavaScript files tracked by git, floor '
    + manifest.floors.perimeterFiles + ' — the gate is blind (git? the extension filter?)');

  const control = writeTmp('ctxroute-rebuild-control-', 'control.js',
    'export const f = (next, prev, doc) => { next[doc] = { seen: true, n: prev[doc].n + 1 }; };\n');
  try {
    const seen = scan(files.concat([control.file]));
    assert.ok(seen.some((m) => m.file.endsWith('control.js')),
      'the CONTROL was not found in a full perimeter scan — the invocation is mute: '
      + 'an empty result would then be indistinguishable from a clean repository, for ever.');
  } finally {
    fs.rmSync(control.dir, { recursive: true, force: true });
  }
});

test('ANTI-INERT: every atom of the rule really DETECTS its witness, and no witness is stale', () => {
  const atoms = atomsOfRule();
  assert.ok(atoms.length >= 2,
    'only ' + atoms.length + ' atom(s) extracted from ' + RULE
    + ' — the extraction is broken, hence this whole test is vacuous');

  // ⚠️ THE OS TMPDIR, NOT a folder of the repo: `ast-grep` HONOURS `.gitignore`,
  //    so witnesses written into an ignored folder are INVISIBLE and every atom
  //    would be wrongly accused; while a decoy written into `src/` or `test/`
  //    would make PARALLEL gates go red at random.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-rebuild-witness-'));
  const withoutWitness = [];
  const blind = [];
  let n = 0;
  try {
    for (const atom of atoms) {
      const witness = manifest.witnesses[atom];
      n += 1;
      if (typeof witness !== 'string' || witness === '') { withoutWitness.push(atom); continue; }
      const tmp = path.join(dir, 'w' + n + '.js');
      fs.writeFileSync(tmp, 'export const f = (next, prev, entry, doc) => { ' + witness + ' };\n');
      if (scan([tmp]).length === 0) blind.push(atom + ' — witness NOT detected: ' + witness);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  assert.deepStrictEqual(withoutWitness, [],
    'ATOM(S) WITHOUT A WITNESS — impossible to prove they see anything at all: ' + withoutWitness.join(', ')
    + '\n⇒ add the real line of code to `witnesses` in state-entry-rebuild-budget.json.');
  assert.deepStrictEqual(blind, [],
    'INERT ATOM(S) — green while seeing NOTHING:\n  ' + blind.join('\n  '));

  // ⚠️ THE OTHER DIRECTION, and it is the same law as the dormant permit: a
  //    witness for an atom that no longer exists is a stale declaration nobody
  //    re-reads, and it silently inflates the appearance of coverage.
  const known = new Set(atoms);
  const stale = Object.keys(manifest.witnesses).filter((k) => !known.has(k));
  assert.deepStrictEqual(stale, [],
    'STALE WITNESS(ES) — no atom of the rule carries that name any more: ' + stale.join(', '));
});

test('ANTI-INERT: the REAL defect of 2026-08-23 is detected, verbatim', () => {
  // 🔴 THE LINE THAT SHIPPED IN PRODUCTION, copied from `src/gate.js` before its
  //    repair — not a textbook case. It erased `denied`, so the anti-loop
  //    ("a block is NEVER followed by a block") stopped holding as soon as one
  //    tool call did not match the document. 🛑 NEVER simplify this witness: a
  //    gate proven only on an invented shape is a gate proven on nothing.
  const w = writeTmp('ctxroute-rebuild-realdefect-', 'defect.js',
    'export const f = (next, prev, doc) => {\n'
    + '  const entry = prev[doc];\n'
    + '  next[doc] = { seen: true, sinceLastCall: entry.sinceLastCall + 1 };\n'
    + '};\n');
  try {
    assert.ok(scan([w.file]).length > 0,
      'THE REAL DEFECT WENT UNDETECTED — the rule no longer sees the shape it was written for.');
  } finally {
    fs.rmSync(w.dir, { recursive: true, force: true });
  }
});

test('NEGATIVE: the CURE clears the occurrence (a propagation is not a rebuild)', () => {
  // ⚠️ The gate must be SATISFIABLE, and satisfiable by the RIGHT gesture. A
  //    rule that stays red after the correct fix teaches people to silence it.
  const w = writeTmp('ctxroute-rebuild-cure-', 'cure.js',
    'export const f = (next, prev, doc) => {\n'
    + '  const entry = prev[doc];\n'
    + '  next[doc] = { ...entry, sinceLastCall: entry.sinceLastCall + 1 };\n'
    + '};\n');
  try {
    assert.deepStrictEqual(scan([w.file]), [],
      'a PROPAGATION was counted as a rebuild — the cure no longer clears the gate, '
      + 'so the only way out would be an exemption.');
  } finally {
    fs.rmSync(w.dir, { recursive: true, force: true });
  }
});

test('NEGATIVE: a fresh write that DERIVES FROM NOTHING is not counted (zero false positive)', () => {
  // ⚠️ THE RULE TARGETS DERIVATION, NEVER CREATION. `next[doc] = { seen: true,
  //    sinceLastCall: 0, turn: turnCount }` is a deliberate reset from scratch:
  //    it reads no existing record, so nothing can be lost. Counting it would
  //    make the gate noisy on the most common correct shape in this repository,
  //    and a noisy gate ends up unplugged.
  const w = writeTmp('ctxroute-rebuild-fresh-', 'fresh.js',
    'export const f = (next, doc, turnCount) => { next[doc] = { seen: true, sinceLastCall: 0, turn: turnCount }; };\n');
  try {
    assert.deepStrictEqual(scan([w.file]), [],
      'a fresh write was counted — the gate would produce false positives on the '
      + 'most common correct shape here.');
  } finally {
    fs.rmSync(w.dir, { recursive: true, force: true });
  }
});

test('NEGATIVE: a plain export or projection is not counted (the 404-hit reading, refused)', () => {
  // 📐 MEASURED 2026-08-23 on 204 tracked files: the widest reading of this
  //    class (any spread-less literal reading a member) matched 404 times,
  //    almost all of them legitimate projections; restricted to the right-hand
  //    side of ANY assignment it still matched 3 times, all three false. Only
  //    the SLOT WRITE reading matched exactly the defect and nothing else.
  //    🛑 This cell is what stands between the gate and the bin: it pins the
  //    two refused readings so that widening the rule turns red instead of
  //    quietly flooding the output.
  const w = writeTmp('ctxroute-rebuild-projection-', 'projection.js',
    'const c = { label: 1, m: 2 };\n'
    + 'export const p = { label: c.label, m: c.m };\n'
    + 'module.exports = { p, size: c.m };\n');
  try {
    assert.deepStrictEqual(scan([w.file]), [],
      'a PROJECTION was counted — the rule has been widened past its measurement, '
      + 'and 404 legitimate literals are about to be reported.');
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
      'rules/no-rebuilt-state-entry.yml carries `' + key + '`: detection must be TOTAL, '
      + 'exemptions belong to the budget. A glob exclusion is a PERMANENT hole.');
  }
});

test('NEGATIVE: the WIRING really reddens on a fabricated occurrence', () => {
  // ⚠️ IN MEMORY. Never on a real file: a sabotage on disk has already brought
  //    down 38 tests of other suites running in parallel here.
  // ⚠️ SCOPE: this proves that THIS gate is plugged into the verdict and would
  //    scream — the exhaustive fault cases (bounds, adversarial inputs, sorting)
  //    belong to `state-entry-rebuild-pure.test.js`, the suite Stryker mutates.
  const real = scan();
  const sabotaged = verdict(
    real.concat([{ file: 'src/never-declared-xyz.js', line: 1, text: 'next[d] = { a: e.a + 1 }' }]),
    manifest.files);
  assert.ok(sabotaged.some((f) => f.startsWith('src/never-declared-xyz.js')),
    'SABOTAGE NOT DETECTED: a record rebuilt in an undeclared file would pass this gate.');
});

test('NEGATIVE: ast-grep ignores a rebuild written in a comment or a string', () => {
  // ⚠️ THIS is the reason for AST over regex, and it is not theoretical here:
  //    the defect's own line is quoted verbatim in `src/gate.js`'s comment, in
  //    this repository's docs and in this very suite. A regex gate would accuse
  //    all of them, on the day the code was finally repaired.
  const w = writeTmp('ctxroute-rebuild-mention-', 'mention.js',
    '// next[doc] = { seen: true, sinceLastCall: entry.sinceLastCall + 1 };\n'
    + "export const s = 'next[doc] = { seen: true, n: entry.n + 1 }';\n"
    + 'export const t = `next[doc] = { seen: true, n: entry.n + 1 }`;\n');
  try {
    assert.deepStrictEqual(scan([w.file]), [],
      'ast-grep counted a MENTION as code — the gate would accuse its own documentation.');
  } finally {
    fs.rmSync(w.dir, { recursive: true, force: true });
  }
});
