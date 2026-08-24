// ═══════════════════════════════════════════════════════════════════════
// GATE — THE IDENTIFIERS OF THE CODE ARE ENGLISH, AND ENGLISH IS THE ONLY REFERENCE
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 WHY THIS FILE EXISTS (2026-08-24). This repository is PUBLIC and its
//    language decision says the WHOLE project is English. The PROSE half had a
//    machine since 2026-08-20 (`english-only-gate.test.js`, scope
//    `docs/framework/` only). The IDENTIFIERS of the code were guarded by
//    NOTHING, and French ones SHIPPED in the published repository: `verrou`,
//    `chemin`, `voiePrete`, `docsFantomes`, `morceau`, `parcAvec`… MEASURED
//    before this gate existed: **888 foreign occurrences over 508 distinct
//    identifiers in 138 files**, out of 17,610 declared identifiers over 217
//    tracked JavaScript files. A reader who cannot read the identifiers cannot
//    read the code, and no contributor can extend a vocabulary they do not
//    understand.
//
// 🛑 THERE IS NO LIST OF FORBIDDEN WORDS HERE, AND THAT IS THE DESIGN. A list
//    of FORBIDDEN things is stale the day it is written: it catches only what
//    somebody thought to put in it, and the next word walks through in
//    silence — a defect class this repository has already paid for. `cspell`
//    INVERTS THE BURDEN OF PROOF: nothing is forbidden, what is KNOWN is
//    declared (ordinary English plus the house terms of `cspell.json`), so
//    every other word is RED. A German `dateipfad`, a Portuguese `caminho` and
//    a French `verrou` are refused for the SAME reason — they are not English.
//    That covers the languages nobody anticipated. Fail-closed, never
//    fail-open.
//
// 🛑 AND THE WHOLE GUARANTEE RESTS ON ONE FACT: ENGLISH IS THE ONLY
//    NATURAL-LANGUAGE REFERENCE. Enabling ONE additional natural-language
//    dictionary opens that entire language in silence and the gate stops
//    protecting while every count keeps passing — a green that lies, this
//    repository's worst defect class. The `ENGLISH IS THE ONLY REFERENCE` cell
//    below makes the configuration SPEAK (`cspell dictionaries`) and confronts
//    what it says with what the manifest declares. A configuration nobody made
//    speak is not a verified configuration.
//
// 🛑 STRICT SEPARATION OF POWERS, DO NOT BLUR IT:
//      · `rules/declared-identifier.yml` = WHERE the names are, NO exemption.
//      · `cspell.json`                   = WHICH words are English.
//      · this file + `src/foreign-identifier-pure.js` +
//        `foreign-identifier-budget.json` = POLICY (admissible classes) and
//        RATCHET (how many, where, why).
//    A `files:`/`ignores:` added to the rule would hide identifiers from the
//    budget in silence — an exemption nobody would ever read again.
//
// ⚠️ AST, NEVER REGEX, and here it is the entire viability of the gate. A
//    French word inside a COMMENT or a STRING is a FALSE POSITIVE by
//    construction: this repository's comments quote defects verbatim, and
//    `english-only-gate.test.js` carries French SENTENCES as detector
//    fixtures. MEASURED: over the whole TEXT of the tracked files cspell
//    rejects 935 distinct words in 4,690 places — unusable. Restricted to
//    DECLARED IDENTIFIERS by the AST it rejects 508 in 888 places, nearly all
//    of them genuinely foreign. The perimeter is what turns an unusable
//    measurement into an actionable one.
//
// ⚠️ THE PERIMETER IS DERIVED FROM `git ls-files`, NEVER hand-written, and the
//    files are handed to `ast-grep` EXPLICITLY rather than letting it walk the
//    tree: `ast-grep` HONOURS `.gitignore`, so a directory gitignored tomorrow
//    would make a tree walk go blind WITHOUT SAYING A WORD.
//
// ⚠️ ANTI-VACUITY (4 layers, none replaces another): a floor on the perimeter,
//    a floor on the number of identifiers actually parsed, a CONTROL file
//    smuggled into a real perimeter scan, and a WITNESS per rule atom whose
//    detection is REQUIRED. 🔴 The mute scan is not theoretical: `ast-grep`
//    returns an EMPTY JSON with EXIT CODE 0 when handed a path it cannot
//    resolve, so a misresolved perimeter is INDISTINGUISHABLE from a perfectly
//    clean repository.
//
// ⚠️ WITNESSES AND DECOYS LIVE IN THE OS TMPDIR, outside every production
//    perimeter. Writing a decoy into `src/` or `test/` would make the
//    file-map, doc-coverage and english-only gates go red AT RANDOM (vitest
//    runs suites in parallel). A gate must never make another gate flaky.
//
// ⚠️ IN-MEMORY SABOTAGE ONLY for the verdict. A first version of a
//    neighbouring gate sabotaged a REAL file and brought down 38 tests of
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
import { verdict, dictionaryFaults, CLASSES } from '../src/foreign-identifier-pure.js';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEP = String.fromCharCode(92);
const RULE = path.join(repo, 'rules', 'declared-identifier.yml');
const CSPELL = path.join(repo, 'cspell.json');
const manifest = JSON.parse(fs.readFileSync(path.join(repo, 'foreign-identifier-budget.json'), 'utf8'));

const HELP =
  '\n→ WAY OUT: RENAME the identifier in English. A clear English name, and the'
  + '\n   SAME English word everywhere for the same idea.'
  + '\n🛑 NEVER add a foreign identifier to `words` in cspell.json: that disarms'
  + '\n   the gate while looking like configuring it. `words` is for TECHNICAL'
  + '\n   terms of the domain (product, tool and API names), never for a word of'
  + '\n   a natural language.'
  + '\n🛑 NEVER raise a `max` to make a push go through.'
  + '\n⚠️ Before renaming, check whether a `rules/*.yml` or a test names that'
  + '\n   identifier: some gates match the SHAPE of a call (`withLock`). Rename'
  + '\n   BOTH sides in the same gesture, or declare the entry.';

// ⚠️ LOUD FAILURE, never an empty scan: a gate finding nothing because its TOOL
//    is missing would go green while blind.
// 🛑 NO SILENT FALLBACK ON `npx`: it fetches a STRANGER package from the
//    network when it cannot resolve locally, and a report produced by the wrong
//    binary is indistinguishable from a real one.
function astGrepBinary() {
  const name = process.platform === 'win32' ? 'ast-grep.exe' : 'ast-grep';
  const bin = path.join(repo, 'node_modules', '@ast-grep', 'cli', name);
  if (!fs.existsSync(bin)) {
    throw new Error('ast-grep NOT FOUND (' + bin + ') — the foreign-identifier gate cannot judge. `npm ci`.');
  }
  return bin;
}

function cspellBinary() {
  const bin = path.join(repo, 'node_modules', 'cspell', 'bin.mjs');
  if (!fs.existsSync(bin)) {
    throw new Error('cspell NOT FOUND (' + bin + ') — the foreign-identifier gate cannot judge. `npm ci`.');
  }
  return bin;
}

/** Perimeter = the JavaScript files TRACKED BY GIT. Derived, never listed. */
function perimeter() {
  // 🛑 SCRUB THE WHOLE `GIT_*` FAMILY: git EXPORTS `GIT_DIR`/`GIT_INDEX_FILE`
  //    to every hook it runs, a child INHERITS them and they BEAT `cwd` — under
  //    a poisoned env this perimeter would be ANOTHER repository's, which is
  //    the mute-scan failure this file already fears, by a different door.
  const withoutGit = { ...process.env };
  for (const k of Object.keys(withoutGit)) if (k.startsWith('GIT_')) delete withoutGit[k];
  const out = execFileSync('git', ['ls-files'], { cwd: repo, env: withoutGit, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  // ⚠️ ONE TRAVERSAL PER STATEMENT, never a chain: to the neighbouring
  //    quadratic rule, `a.map(f).filter(g)` is a traversal nested in a
  //    traversal — a judge must not be its own first defendant.
  const lines = out.split('\n');
  const trimmed = lines.map((s) => s.trim());
  const js = trimmed.filter((f) => /[.](js|mjs|cjs)$/.test(f));
  return js.filter((f) => fs.existsSync(path.join(repo, f)));
}

/**
 * Every DECLARED identifier of the given files, located by AST.
 * @param {string[]} targets absolute or repo-relative file paths
 * @returns {Map<string, {text: string, line: number}[]>} identifiers per file
 */
function declaredIdentifiers(targets) {
  if (targets.length === 0) return new Map();
  let out = '';
  try {
    out = execFileSync(astGrepBinary(), ['scan', '-r', RULE, '--json=compact'].concat(targets), {
      cwd: repo, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
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
  let matches = [];
  try { matches = JSON.parse(out || '[]'); } catch { matches = []; }
  const byFile = new Map();
  for (const m of matches) {
    const f = String(m.file).split(SEP).join('/');
    if (!byFile.has(f)) byFile.set(f, []);
    byFile.get(f).push({ text: String(m.text), line: m.range.start.line + 1 });
  }
  return byFile;
}

/**
 * THE FULL PIPELINE: locate the declared names by AST, then ask cspell — with
 * the repository's ENGLISH-ONLY configuration — which of them are not English.
 *
 * ⚠️ ONE TEMPORARY FILE PER SOURCE FILE, and the mapping back is what makes the
 *    red ACTIONABLE: a single merged file would say a foreign name exists
 *    without saying WHERE. cspell splits `camelCase`, `snake_case` and
 *    `PascalCase` itself — that is exactly why it is the right tool for
 *    identifiers, and why nothing here re-implements word splitting.
 *
 * @param {string[]} [targets] files to scan; absent ⇒ the whole perimeter
 * @returns {{occurrences: {file: string, line: number, identifier: string, word: string}[], identifierCount: number}}
 */
function scan(targets) {
  const files = targets || perimeter();
  const byFile = declaredIdentifiers(files);
  let identifierCount = 0;
  for (const ids of byFile.values()) identifierCount += ids.length;
  if (identifierCount === 0) return { occurrences: [], identifierCount: 0 };

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-foreign-ident-'));
  const back = new Map();
  let n = 0;
  try {
    for (const [f, ids] of byFile) {
      n += 1;
      const name = 'f' + n + '.txt';
      const texts = ids.map((x) => x.text);
      fs.writeFileSync(path.join(dir, name), texts.join('\n') + '\n');
      back.set(name, f);
    }
    let out = '';
    try {
      out = execFileSync(process.execPath,
        [cspellBinary(), 'lint', '--config', CSPELL, '--no-progress', '--no-summary', '--no-color', '**/*.txt'],
        { cwd: dir, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      // ⚠️ cspell exits 1 as soon as it finds an unknown word — a RESULT, not a
      //    failure. The findings are on stdout.
      out = (e && e.stdout) || '';
    }
    const occurrences = [];
    const seen = new Set();
    for (const raw of out.split('\n')) {
      const m = /^(.*?):(\d+):(\d+)\s+-\s+Unknown word \((.+?)\)/.exec(raw.trim());
      if (!m) continue;
      const src = back.get(path.basename(m[1]));
      if (!src) continue;
      const rec = byFile.get(src)[Number(m[2]) - 1];
      if (!rec) continue;
      // ⚠️ ONE OCCURRENCE PER IDENTIFIER, never one per unknown WORD: a name
      //    made of two foreign words is ONE bad name, and counting it twice
      //    would make the ratchet depend on how many words a name happens to
      //    hold.
      const key = src + ':' + rec.line + ':' + rec.text;
      if (seen.has(key)) continue;
      seen.add(key);
      occurrences.push({ file: src, line: rec.line, identifier: rec.text, word: m[4] });
    }
    return { occurrences, identifierCount };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * The rule's ATOMS — one DECLARATION SITE each — DERIVED from the `.yml`, never
 * a list copied into the test. An atom added tomorrow enters the witness table
 * by itself and stays RED until someone pairs it with a real line of code.
 */
function atomsOfRule() {
  const src = fs.readFileSync(RULE, 'utf8');
  const out = [];
  const re = /-\s*kind:\s*(\S+)\s*\n\s*inside:\s*\{\s*kind:\s*(\w+)/g;
  let m = re.exec(src);
  while (m) {
    out.push(m[1] + ' in ' + m[2]);
    m = re.exec(src);
  }
  return out;
}

/** What cspell says it ACTUALLY loaded — the configuration made to SPEAK. */
function activeDictionaries() {
  const out = execFileSync(process.execPath, [cspellBinary(), 'dictionaries', '--config', CSPELL], {
    cwd: repo, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const lines = out.split('\n');
  const starred = lines.filter((l) => /^\S+\*/.test(l.trim()));
  return starred.map((l) => l.trim().split(/\s+/)[0].replace(/\*$/, ''));
}

function writeTmp(prefix, basename, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const file = path.join(dir, basename);
  fs.writeFileSync(file, content);
  return { dir, file };
}

test('GATE: every foreign identifier is DECLARED, with an admissible class', () => {
  const faults = verdict(scan().occurrences, manifest.files);
  assert.deepStrictEqual(faults, [],
    'FOREIGN IDENTIFIER(S) IN A PUBLIC, ENGLISH-ONLY REPOSITORY:\n  ' + faults.join('\n  ')
    + '\n\n🛑 A reader who cannot read the identifiers cannot read the code, and no'
    + '\n   contributor can extend a vocabulary they do not understand.'
    + HELP);
});

test('GATE: the admissible classes are documented, and only those', () => {
  // The manifest DESCRIBES the classes for whoever reads it; the pure module
  // DECIDES them. Two places, so they must be proven equal — a description that
  // drifts from the decision is how a closed list quietly becomes an open one.
  assert.deepStrictEqual(manifest.classes.slice().sort(), CLASSES.slice().sort(),
    'the manifest documents classes that the gate does not admit (or the reverse)');
});

test('ENGLISH IS THE ONLY REFERENCE: no natural language but English is loaded', () => {
  // 🛑 THE LOAD-BEARING CELL. Everything else counts what cspell refused; what
  //    cspell refuses depends ENTIRELY on which dictionaries are loaded. One
  //    extra natural-language dictionary opens that whole language and every
  //    count keeps passing — the gate would certify instead of protect.
  // ⚠️ THE CONFIGURATION IS MADE TO SPEAK, never trusted: `cspell dictionaries`
  //    reports what it REALLY loaded, which is the only way to catch a
  //    dictionary pulled in by an inherited or machine-global configuration
  //    that nobody wrote in this repository.
  const cfg = JSON.parse(fs.readFileSync(CSPELL, 'utf8'));
  const active = activeDictionaries();
  assert.ok(active.length >= 5,
    'cspell reported only ' + active.length + ' active dictionaries — the probe is broken, '
    + 'so this cell measures nothing and the whole gate rests on nothing.');
  const faults = dictionaryFaults(active, manifest.dictionaries, cfg.language, cfg.dictionaries || []);
  assert.deepStrictEqual(faults, [],
    'THE LANGUAGE REFERENCE HAS MOVED:\n  ' + faults.join('\n  ')
    + '\n\n🛑 English must be the ONLY natural-language reference. That is what makes'
    + '\n   an unanticipated language (German, Portuguese, anything) red for the very'
    + '\n   same reason as French — and no list of forbidden words can do that.');
});

test('ANTI-VACUITY: the perimeter is populated, really parsed, and the scanner really reads it', () => {
  // ⚠️ THREE INDEPENDENT LAYERS, because they fail differently.
  //    ① A FLOOR on the perimeter catches a `git ls-files` that came back empty
  //       or ran from the wrong directory.
  //    ② A FLOOR on the IDENTIFIERS PARSED catches an ast-grep that resolved
  //       the files but understood nothing of them.
  //    ③ A CONTROL smuggled into a REAL perimeter scan catches what no floor
  //       can see: `ast-grep` answers `[]` with exit code 0 on a path it cannot
  //       resolve. 🛑 A floor measures a QUANTITY, never an IDENTITY.
  const files = perimeter();
  assert.ok(files.length >= manifest.floors.perimeterFiles,
    'suspicious perimeter: ' + files.length + ' JavaScript files tracked by git, floor '
    + manifest.floors.perimeterFiles + ' — the gate is blind (git? the extension filter?)');

  const control = writeTmp('ctxroute-foreign-control-', 'control.js',
    'export const verrouDeControle = 1;\n');
  try {
    const r = scan(files.concat([control.file]));
    assert.ok(r.identifierCount >= manifest.floors.declaredIdentifiers,
      'only ' + r.identifierCount + ' declared identifiers parsed, floor '
      + manifest.floors.declaredIdentifiers + ' — ast-grep read the files but understood nothing.');
    assert.ok(r.occurrences.some((o) => o.file.endsWith('control.js')),
      'the CONTROL was not found in a full perimeter scan — the pipeline is mute: '
      + 'an empty result would then be indistinguishable from a repository whose every '
      + 'identifier is English, for ever.');
  } finally {
    fs.rmSync(control.dir, { recursive: true, force: true });
  }
});

test('ANTI-INERT: every atom of the rule really DETECTS its witness, and no witness is stale', () => {
  const atoms = atomsOfRule();
  assert.ok(atoms.length >= 5,
    'only ' + atoms.length + ' atom(s) extracted from ' + RULE
    + ' — the extraction is broken, hence this whole test is vacuous');

  // ⚠️ THE OS TMPDIR, NOT a folder of the repo: `ast-grep` HONOURS `.gitignore`,
  //    so witnesses written into an ignored folder are INVISIBLE and every atom
  //    would be wrongly cleared; while a decoy written into `src/` or `test/`
  //    would make PARALLEL gates go red at random.
  // ⚠️ EACH WITNESS CARRIES A FOREIGN NAME ON PURPOSE: the assertion then proves
  //    BOTH halves at once — the AST locating a declaration site, and cspell
  //    refusing the word. An atom whose witness is English would prove only half.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-foreign-witness-'));
  const withoutWitness = [];
  const blind = [];
  let n = 0;
  try {
    for (const atom of atoms) {
      const witness = manifest.witnesses[atom];
      n += 1;
      if (typeof witness !== 'string' || witness === '') { withoutWitness.push(atom); continue; }
      const tmp = path.join(dir, 'w' + n + '.js');
      fs.writeFileSync(tmp, 'const source = {};\n' + witness + '\n');
      if (scan([tmp]).occurrences.length === 0) blind.push(atom + ' — witness NOT detected: ' + witness);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  assert.deepStrictEqual(withoutWitness, [],
    'ATOM(S) WITHOUT A WITNESS — impossible to prove they see anything at all: ' + withoutWitness.join(', ')
    + '\n⇒ add the real line of code to `witnesses` in foreign-identifier-budget.json.');
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

test('NEGATIVE: a foreign identifier IS detected, in every writing of a name', () => {
  // ⚠️ The REAL shapes that shipped in the published repository, copied rather
  //    than invented: a plain binding, a camelCase compound, an object key and
  //    a parameter. 🛑 Never simplify this cell to one line: a gate proven on a
  //    single shape is a gate proven on almost nothing.
  const w = writeTmp('ctxroute-foreign-detect-', 'defect.js',
    'const verrou = 1;\n'
    + 'const voiePrete = true;\n'
    + 'export const o = { docsFantomes: verrou, fichierEtat: voiePrete };\n'
    + 'export function parcAvec(adresseDuLecteur) { return adresseDuLecteur; }\n');
  try {
    const found = scan([w.file]).occurrences;
    const names = new Set(found.map((f) => f.identifier));
    for (const n of ['verrou', 'voiePrete', 'docsFantomes', 'fichierEtat', 'parcAvec', 'adresseDuLecteur']) {
      assert.ok(names.has(n), 'FOREIGN IDENTIFIER "' + n + '" WENT UNDETECTED — the gate no longer sees '
        + 'the very shapes it was written for.');
    }
  } finally {
    fs.rmSync(w.dir, { recursive: true, force: true });
  }
});

test('DECLARED BLIND SPOT: a French LOANWORD is invisible, and it is written down, not hidden', () => {
  // 📐 MEASURED 2026-08-24, and it must stay measured rather than believed: the
  //    English dictionary CONTAINS French loanwords, so a French identifier that
  //    is also an English word passes. Of 25 probed French words, NINE pass —
  //    `chemin`, `morceau`, `parc`, `nom`, `sortie`, `dedans`, `sain`, `garde`,
  //    `dossier`.
  // 🛑 THIS CELL EXISTS SO THE HOLE CANNOT BE FORGOTTEN, and so that nobody
  //    "discovers" it later and concludes the gate is broken. It is the PRICE of
  //    the inverted burden of proof, and the price is worth paying: a
  //    hand-written list of French words would catch these nine and MISS every
  //    language nobody anticipated — strictly worse. Such names were renamed BY
  //    HAND in the same gesture as this gate; the gate does not cover them.
  // ⚠️ IT ALSO GUARDS THE WITNESSES: two of this gate's own witnesses were first
  //    written with `chemin` and `morceau`, and the ANTI-INERT cell caught them.
  //    That is exactly what witnesses are for.
  const w = writeTmp('ctxroute-foreign-loanword-', 'loanword.js',
    'export const morceau = 1;\nexport const chemin = 2;\nexport const parc = 3;\n');
  try {
    assert.deepStrictEqual(scan([w.file]).occurrences, [],
      'THE BLIND SPOT HAS CLOSED — the dictionary no longer accepts those loanwords.\n'
      + 'That is GOOD NEWS, not a failure: re-measure the nine, update `_doc_blind_spot`\n'
      + 'in foreign-identifier-budget.json, and shrink or delete this cell. A blind spot\n'
      + 'that has stopped existing is a stale declaration, and stale declarations rot.');
  } finally {
    fs.rmSync(w.dir, { recursive: true, force: true });
  }
});

test('NEGATIVE: a foreign word in a COMMENT or a STRING is NOT counted', () => {
  // ⚠️ THIS is the reason for AST over regex, and it is not theoretical here:
  //    this repository's comments quote French defects verbatim, and
  //    `english-only-gate.test.js` holds French SENTENCES as detector fixtures.
  //    A regex gate would accuse all of them and be disarmed within a day.
  const w = writeTmp('ctxroute-foreign-mention-', 'mention.js',
    '// le verrou protege le chemin du parc\n'
    + "export const a = 'le verrou protege le chemin';\n"
    + 'export const b = `un morceau de la voie prete`;\n');
  try {
    assert.deepStrictEqual(scan([w.file]).occurrences, [],
      'a MENTION was counted as a name — the gate would accuse its own documentation '
      + 'and the fixtures of the prose gate.');
  } finally {
    fs.rmSync(w.dir, { recursive: true, force: true });
  }
});

test('NEGATIVE: ordinary English and declared house terms pass (zero false positive)', () => {
  // ⚠️ A gate must be SATISFIABLE, and satisfiable by the RIGHT gesture: the
  //    rename. A rule that stays red after the correct fix teaches people to
  //    silence it — and the way to silence THIS one (dropping the word into
  //    `words`) is exactly the misuse that would disarm it.
  const w = writeTmp('ctxroute-foreign-clean-', 'clean.js',
    'const lock = 1;\n'
    + 'const laneReady = true;\n'
    + 'export const o = { ghostDocs: lock, chunk: laneReady, frontmatter: 1, ctxroute: 2 };\n'
    + 'export function fleetWith(filePath) { return filePath; }\n');
  try {
    assert.deepStrictEqual(scan([w.file]).occurrences, [],
      'FALSE POSITIVE on plain English or on a declared house term — a noisy gate '
      + 'gets disarmed, then bypassed.');
  } finally {
    fs.rmSync(w.dir, { recursive: true, force: true });
  }
});

test('GATE: the detection rule carries NO exemption', () => {
  // The rule DETECTS, the budget EXEMPTS. An `ignores:`/`files:` in the rule
  // would remove identifiers from the budget's sight — an exemption that no
  // reviewer would ever meet, since the budget is the only file people read.
  const src = fs.readFileSync(RULE, 'utf8');
  const lines = src.split('\n');
  const code = lines.filter((l) => !/^\s*#/.test(l));
  const body = code.join('\n');
  for (const key of ['ignores:', 'files:']) {
    assert.ok(!body.includes(key),
      'rules/declared-identifier.yml carries `' + key + '`: detection must be TOTAL, '
      + 'exemptions belong to the budget. A glob exclusion is a PERMANENT hole.');
  }
});

test('NEGATIVE: the WIRING really reddens on a fabricated occurrence', () => {
  // ⚠️ IN MEMORY. Never on a real file: a sabotage on disk has already brought
  //    down 38 tests of other suites running in parallel here.
  // ⚠️ SCOPE: this proves that THIS gate is plugged into the verdict and would
  //    scream — the exhaustive fault cases (bounds, adversarial inputs, sorting)
  //    belong to `foreign-identifier-pure.test.js`, the suite Stryker mutates.
  const real = scan().occurrences;
  const sabotaged = verdict(
    real.concat([{ file: 'src/never-declared-xyz.js', line: 1, identifier: 'verrou', word: 'verrou' }]),
    manifest.files);
  assert.ok(sabotaged.some((f) => f.startsWith('src/never-declared-xyz.js')),
    'SABOTAGE NOT DETECTED: a foreign identifier in an undeclared file would pass this gate.');
});

test('NEGATIVE: enabling a foreign dictionary in a COPY of the config turns the seal RED', () => {
  // 🛑 THE PROOF THAT THE ENGLISH-ONLY RULE IS A MACHINE AND NOT PROSE. In this
  //    repository a rule that only prose guards is not a rule, and this one is
  //    the single edit that would disarm everything else while every count
  //    keeps passing.
  // ⚠️ ON A COPY IN THE TMPDIR, never on the real `cspell.json`: a sabotage on
  //    disk has already brought down 38 tests of parallel suites here.
  const cfg = JSON.parse(fs.readFileSync(CSPELL, 'utf8'));

  const withFrenchLocale = dictionaryFaults(
    manifest.dictionaries, manifest.dictionaries, 'en,fr', cfg.dictionaries || []);
  assert.ok(withFrenchLocale.length > 0,
    'a SECOND LOCALE went unnoticed — `language: "en,fr"` opens the whole French language '
    + 'and the gate would keep certifying.');

  const withFrenchDictionary = dictionaryFaults(
    manifest.dictionaries, manifest.dictionaries, cfg.language, (cfg.dictionaries || []).concat(['fr-fr']));
  assert.ok(withFrenchDictionary.length > 0,
    'a FOREIGN DICTIONARY declared in the config went unnoticed — the reference would no '
    + 'longer be English only.');

  const loadedBehindOurBack = dictionaryFaults(
    manifest.dictionaries.concat(['de-de']), manifest.dictionaries, cfg.language, cfg.dictionaries || []);
  assert.ok(loadedBehindOurBack.length > 0,
    'a foreign dictionary LOADED without being written here went unnoticed — an inherited or '
    + 'machine-global configuration would silently open a language.');

  // ⚠️ AND THE CONTROL, or the three assertions above prove nothing: the same
  //    function must stay SILENT on the real, English-only configuration.
  assert.deepStrictEqual(
    dictionaryFaults(manifest.dictionaries, manifest.dictionaries, cfg.language, cfg.dictionaries || []),
    [], 'the seal accuses the repository\'s own English-only configuration — it is noise, not a judge.');
});
