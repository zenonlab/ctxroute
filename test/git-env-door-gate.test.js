// ═══════════════════════════════════════════════════════════════════════
// GATE — EVERY `git` SPAWN GOES THROUGH AN ENV THAT STRIPS `GIT_*` (2026-08-21)
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 THE MEASURED DEFECT THIS FILE SEALS. Git EXPORTS `GIT_DIR`,
//    `GIT_INDEX_FILE` and friends to every hook it runs, and
//    `.githooks/pre-commit` runs the anti-leak suite. Those variables are
//    INHERITED by any child and they WIN OVER `cwd` ⇒ a `git add` aimed at a
//    throwaway sandbox in the OS temp folder STAGED ITS TRAP FILE INTO THE
//    REAL REPOSITORY. The file reached a commit and three `--amend` in a row
//    could not remove it: each commit re-ran the hook, which re-ran the test,
//    which re-staged the file.
//
// 🛑 SCRUBBING ONE CALL SITE WAS MEASURED INSUFFICIENT — under a poisoned
//    environment two OTHER cells of the same suite still failed, because
//    `git ls-files` was inheriting it too. The remedy is a DOOR: every `git`
//    of a file goes through one env that removes the WHOLE `GIT_*` family.
//    Never "unset the right variable": nobody can enumerate what a future git
//    version will export.
//
// ⚠️ WHY A MACHINE AND NOT A COMMENT. The repaired suite carries the reason in
//    prose already; prose protects the file it lives in and nothing else. The
//    NEXT suite that spawns `git` would reintroduce the class in silence — and
//    silence is this repository's worst defect, never a red gate.
//
// ⚠️ AST, NEVER REGEX, for the DETECTION (fleet doctrine): a `git` spawn quoted
//    in a comment or in a string is a MENTION, not a call, and this very file
//    is full of such mentions. `ast-grep` is the authority on what is a call;
//    the regexes below only read INSIDE an already-matched call node.
//
// ⚠️ THE SPAWN PRIMITIVES ARE DERIVED FROM THE CODE, never typed from memory:
//    they are the names the repository actually imports from
//    `node:child_process`. A list would be born stale — the day a suite reaches
//    for `fork` or `execSync`, that name enters the scan by itself.
//    🛑 That derivation step is textual ON PURPOSE, and it is safe in ONE
//    direction only: a name read from a comment would ADD a pattern matching
//    nothing. It can never HIDE a call site, which is what would make the gate
//    lie.
//
// ⚠️ ANTI-VACUITY, three independent layers: a floor on the perimeter, a floor
//    on the spawn call sites really examined, and a WITNESS per derived
//    primitive whose detection is REQUIRED. A gate green because it scanned
//    zero files is the defect class this repo has already paid three times
//    (`deps-purity`, `deadline-gate`, `layers-gate`).
//
// 🛑 EVERY SABOTAGE HAPPENS IN MEMORY OR IN THE OS TMPDIR, NEVER ON A REAL
//    FILE: a first version of a similar gate here edited a real source and
//    brought down 38 tests of suites running IN PARALLEL.
//
// ⚠️ ONE TRAVERSAL PER STATEMENT, never a chain and never a nested one — the
//    quadratic rule of this repository reads the SHAPE, and a judge has no
//    right to be its own first defendant.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// ⚠️ THIS GATE IS ITSELF ONE OF THE CALL SITES IT JUDGES — deliberately.
//    A judge exempt from its own rule is the first place the rule dies.
// 🛑 SCRUB THE WHOLE `GIT_*` FAMILY, never "unset the right one".
const ENV_WITHOUT_GIT = (() => {
  const e = { ...process.env };
  for (const k of Object.keys(e)) if (k.startsWith('GIT_')) delete e[k];
  return e;
})();

function git(args, cwd) {
  return execFileSync('git', args, { cwd, env: ENV_WITHOUT_GIT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
// 🛑 THE ROOT IS MEASURED BY THE AUTHORITY THAT KNOWS IT, never counted in
//    `..`: `git ls-files` run from a subdirectory lists THAT subdirectory, and
//    that mistake once made another gate of this repo judge 86 files out of 229.
const REPO = git(['rev-parse', '--show-toplevel'], HERE).trim();
const SEP = String.fromCharCode(92);

/** Perimeter = the JavaScript files TRACKED BY GIT. Derived, never listed. */
function perimeter() {
  const lines = git(['ls-files'], REPO).split('\n');
  const trimmed = lines.map((s) => s.trim());
  const scripts = trimmed.filter((f) => /[.](js|mjs|cjs)$/.test(f));
  return scripts.filter((f) => fs.existsSync(path.join(REPO, f)));
}

// ⚠️ LOUD FAILURE, never an empty scan: a gate finding nothing because its
//    TOOL is missing would go green while blind — the worst of both worlds.
//    🛑 Never a silent fallback on `npx`: it fetches a stranger package from
//    the network (measured in this repo).
function astGrepBinary() {
  const name = process.platform === 'win32' ? 'ast-grep.exe' : 'ast-grep';
  const bin = path.join(REPO, 'node_modules', '@ast-grep', 'cli', name);
  if (!fs.existsSync(bin)) {
    throw new Error('ast-grep NOT FOUND (' + bin + ') — the git-env gate cannot judge. `npm ci`.');
  }
  return bin;
}

const NAMED_IMPORT = /import\s*\{([^}]*)\}\s*from\s*['"](?:node:)?child_process['"]/g;
const NAMED_REQUIRE = /\{([^}]*)\}\s*=\s*require\(\s*['"](?:node:)?child_process['"]\s*\)/g;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/**
 * The spawn primitives THIS repository really uses, DERIVED from what it
 * imports from `node:child_process` — both the imported and the local name of
 * an `as` alias, since the call site uses the local one.
 * @param {string} corpus every tracked source, concatenated.
 * @returns {string[]} sorted, unique.
 */
function spawnPrimitives(corpus) {
  const fromImport = [...corpus.matchAll(NAMED_IMPORT)];
  const fromRequire = [...corpus.matchAll(NAMED_REQUIRE)];
  const groups = fromImport.concat(fromRequire);
  const lists = groups.map((m) => m[1]);
  const tokens = lists.join(',').split(/[\s,]+/);
  const identifiers = tokens.filter((t) => IDENTIFIER.test(t));
  const names = identifiers.filter((t) => t !== 'as'); // `execFile as run` keeps BOTH sides
  const unique = [...new Set(names)];
  return unique.sort();
}

/** Writes the ast-grep rule for those primitives (bare call AND member call). */
function ruleFor(primitives, dir) {
  const atoms = primitives.map((p) => '    - pattern: ' + p + '($$$)\n    - pattern: $T.' + p + '($$$)');
  const head = ['id: git-spawn-probe', 'language: JavaScript', 'severity: error', 'message: spawn call site', 'rule:', '  any:'];
  const file = path.join(dir, 'git-spawn.yml');
  fs.writeFileSync(file, head.join('\n') + '\n' + atoms.join('\n') + '\n');
  return file;
}

/** One ast-grep finding, normalised. */
function finding(m) {
  return {
    file: String(m.file).split(SEP).join('/'),
    line: m.range.start.line + 1,
    text: String(m.text).replace(/\s+/g, ' '),
  };
}

/**
 * @returns {{file: string, line: number, text: string}[]} every spawn CALL
 * (never a mention) the AST finds in the given files.
 */
function scanCalls(ruleFile, files, cwd) {
  if (files.length === 0) return [];
  let out = '';
  try {
    out = execFileSync(astGrepBinary(), ['scan', '-r', ruleFile, '--json=compact'].concat(files), {
      cwd, encoding: 'utf8', env: ENV_WITHOUT_GIT, maxBuffer: 64 * 1024 * 1024,
      // ⚠️ stderr CAPTURED, not inherited: `ast-grep` writes "N error(s) found"
      //    on stderr for every scan — a fake ERROR poured into a GREEN run is
      //    how people stop reading a suite.
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    // `ast-grep scan` exits ≠ 0 as soon as it finds an `error` severity match:
    // that is the NORMAL case here, and the findings are on stdout.
    out = (e && e.stdout) || '';
  }
  let r = [];
  try { r = JSON.parse(out || '[]'); } catch { r = []; }
  return r.map(finding);
}

// The first STRING argument of a call — the binary being spawned.
const FIRST_ARG = /\(\s*(['"`])([^'"`]*)\1/;
/**
 * `git`, `git.exe`, any path ending in the git binary — AND the command-string
 * form (`exec('git rev-parse …')`), which spawns git just as much and would
 * otherwise be a hole shaped exactly like the one this gate closes.
 */
function isGitBinary(text) {
  const m = FIRST_ARG.exec(text);
  if (m === null) return false;
  return /(^|[\\/])git(\.exe)?$/i.test(m[2]) || /^git\s/.test(m[2]);
}

const DECLARATION = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g;
/** A declaration proves a door only if its own body deletes `GIT_*` keys. */
function isScrubbingSlice(slice) {
  return /GIT_/.test(slice) && /\bdelete\b/.test(slice);
}

/**
 * The bindings of a file PROVEN to strip the `GIT_*` family.
 * ⚠️ FAIL-CLOSED: an env we cannot prove scrubbing counts as NOT scrubbing.
 *    Proving it any harder would mean EXECUTING the file, and a static gate
 *    that runs the code it judges is no longer static.
 * @returns {string[]} binding names.
 */
function scrubbingBindings(src) {
  const declarations = [...src.matchAll(DECLARATION)];
  const doors = declarations.filter((m) => isScrubbingSlice(src.slice(m.index, m.index + 600)));
  return doors.map((m) => m[1]);
}

const ENV_OPTION = /env\s*:\s*([^,}]+)/;

/** `null` when the call site is compliant, else the message naming it. */
function faultFor(site) {
  const proven = new Set(site.scrubbing);
  const env = ENV_OPTION.exec(site.text);
  if (env === null) {
    return site.file + ':' + site.line + ' — spawns `git` with NO `env:` option ⇒ it INHERITS '
      + 'GIT_DIR/GIT_INDEX_FILE from the hook that runs it, and those BEAT `cwd`: ' + site.text.slice(0, 120);
  }
  const identifiers = env[1].match(/[A-Za-z_$][\w$]*/g) || [];
  const doors = identifiers.filter((n) => proven.has(n));
  if (doors.length > 0) return null;
  return site.file + ':' + site.line + ' — `env: ' + env[1].trim() + '` is NOT proven to strip the `GIT_*` '
    + 'family (no binding of that file deletes keys prefixed GIT_): ' + site.text.slice(0, 120);
}

/**
 * THE VERDICT — pure, so every sabotage below runs on fabricated data.
 * @param {{file: string, line: number, text: string, scrubbing: string[]}[]} sites
 * @returns {string[]} one message per non-compliant `git` spawn; `[]` = clean.
 */
function violations(sites) {
  const judged = sites.map(faultFor);
  const faults = judged.filter((f) => f !== null);
  return faults.sort();
}

/** Everything the gate measures, in ONE pass (this suite spawns enough already). */
function measure() {
  const files = perimeter();
  const sources = new Map(files.map((f) => [f, fs.readFileSync(path.join(REPO, f), 'utf8')]));
  const corpus = [...sources.values()].join('\n');
  const primitives = spawnPrimitives(corpus);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-git-env-'));
  const withScrubbing = (c) => ({ ...c, scrubbing: scrubbingBindings(sources.get(c.file) || '') });
  try {
    const calls = scanCalls(ruleFor(primitives, dir), files, REPO);
    const gitOnly = calls.filter((c) => isGitBinary(c.text));
    const gitCalls = gitOnly.map(withScrubbing);
    return { files, primitives, calls, gitCalls };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const M = measure();

test('GATE: every `git` spawn goes through an env that strips the GIT_* family', () => {
  const faults = violations(M.gitCalls);
  assert.deepStrictEqual(faults, [],
    'GIT ENV DOOR VIOLATION(S) — an inherited `GIT_DIR`/`GIT_INDEX_FILE` BEATS `cwd`,\n'
    + 'so a `git` aimed at a sandbox writes into the REAL repository (measured 2026-08-21:\n'
    + 'a trap file staged into a commit, immune to three `--amend`):\n  ' + faults.join('\n  ')
    + '\n\n🛑 Route the call through a door: `const E = { ...process.env }; for (const k of Object.keys(E))'
    + ' if (k.startsWith("GIT_")) delete E[k];` then pass `env: E`.'
    + '\n   Scrub the WHOLE family — nobody can enumerate what a future git version exports.');
});

test('ANTI-VACUITY: the scan really sees the repository AND its spawn call sites', () => {
  // ⚠️ FOUR INDEPENDENT FLOORS, deliberately far below the measurement: they
  //    catch a BLIND scan, they are not a second ratchet. 📐 Measured
  //    2026-08-21: 150+ tracked JavaScript files, 4+ distinct spawn primitives
  //    derived, 10 `git` call sites.
  // 🛑 A FLOOR MEASURES A QUANTITY, NEVER AN IDENTITY: it catches a perimeter
  //    collapsed to nothing, never one aiming somewhere else. That is why the
  //    root above is measured by `git rev-parse`, not counted in `..`.
  assert.ok(M.files.length >= 100,
    'suspicious perimeter: ' + M.files.length + ' tracked JavaScript files, floor 100 — the gate is blind (git? the extension filter?)');
  assert.ok(M.primitives.length >= 4,
    'only ' + M.primitives.length + ' spawn primitive(s) derived from `node:child_process` imports ('
    + M.primitives.join(', ') + ') — the derivation is broken, so most call sites are invisible');
  assert.ok(M.calls.length >= 15,
    'suspicious scan: ' + M.calls.length + ' spawn call site(s) examined, floor 15 — the AST patterns see nothing');
  assert.ok(M.gitCalls.length >= 5,
    'suspicious scan: ' + M.gitCalls.length + ' `git` call site(s) found, floor 5 — this repository spawns git in '
    + 'several gates; finding almost none means the FIRST-ARGUMENT reading broke, not that the repo changed');
});

/** `null` when the primitive really bites, else why it is inert. */
function probePrimitive(p, rule, dir) {
  const witness = path.join(dir, 'w-' + p + '.js');
  fs.writeFileSync(witness, 'const out = ' + p + "('git', ['status'], { cwd: sandbox });\n");
  const scanned = scanCalls(rule, [witness], dir);
  const found = scanned.filter((c) => isGitBinary(c.text));
  if (found.length === 0) return p + ' — witness NOT detected';
  const notScrubbed = found.map((c) => ({ ...c, scrubbing: [] }));
  if (violations(notScrubbed).length === 0) return p + ' — detected but NOT judged: an unscrubbed spawn would pass';
  return null;
}

test('ANTI-INERT: every DERIVED primitive really detects a fabricated `git` spawn', () => {
  // ⚠️ A pattern that matches nothing is indistinguishable from a compliant
  //    repository. Each derived name is confronted with a REAL line of code —
  //    written to the OS TMPDIR and never inside the repo, because `ast-grep`
  //    HONOURS `.gitignore` (a witness in an ignored folder is invisible,
  //    measured here on 2026-08-06) and because a decoy dropped in `test/`
  //    would make PARALLEL gates go red at random.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-git-env-witness-'));
  let blind = [];
  try {
    const rule = ruleFor(M.primitives, dir);
    const probed = M.primitives.map((p) => probePrimitive(p, rule, dir));
    blind = probed.filter((r) => r !== null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  assert.deepStrictEqual(blind, [],
    'INERT PRIMITIVE(S) — green while seeing NOTHING:\n  ' + blind.join('\n  '));
});

test('NEGATIVE: the verdict names the exact file and line (IN-MEMORY sabotage)', () => {
  // ⚠️ IN MEMORY. Never on a real file: sabotaging one here has already brought
  //    down 38 tests of other suites running in parallel.
  const bare = violations([{ file: 'test/fake.test.js', line: 42, text: "execFileSync('git', ['add', '.'], { cwd: box })", scrubbing: ['E'] }]);
  assert.strictEqual(bare.length, 1, 'a `git` spawn with no env at all MUST be refused');
  assert.match(bare[0], /^test\/fake\.test\.js:42 — /, 'the message must NAME the file and the line');

  const raw = violations([{ file: 'test/fake.test.js', line: 7, text: "spawnSync('git', a, { env: process.env })", scrubbing: ['E'] }]);
  assert.strictEqual(raw.length, 1, 'an env that does NOT strip GIT_* is exactly the measured defect');
  assert.match(raw[0], /NOT proven to strip/);

  // …and the compliant forms stay silent (a noisy gate is a gate people unplug).
  const direct = violations([{ file: 'test/ok.test.js', line: 3, text: "execFileSync('git', a, { cwd, env: ENV_WITHOUT_GIT, encoding: 'utf8' })", scrubbing: ['ENV_WITHOUT_GIT'] }]);
  assert.deepStrictEqual(direct, []);
  const spread = violations([{ file: 'test/ok.test.js', line: 4, text: "execFile('git', a, { env: { ...ENV_WITHOUT_GIT } })", scrubbing: ['ENV_WITHOUT_GIT'] }]);
  assert.deepStrictEqual(spread, []);
});

test('NEGATIVE: a MENTION is not a call, and a non-git binary is not our business', () => {
  // ⚠️ THIS is why the detection is AST and not regex — and it is not
  //    theoretical: this very file quotes git spawns in strings and comments.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-git-env-mention-'));
  try {
    const rule = ruleFor(M.primitives, dir);
    const mention = path.join(dir, 'mention.js');
    fs.writeFileSync(mention, "// execFileSync('git', ['add'], { cwd });\n"
      + "const s = \"execFileSync('git', a, {})\";\n"
      + 'module.exports = { s };\n');
    assert.deepStrictEqual(scanCalls(rule, [mention], dir), [],
      'ast-grep counted a MENTION as a call — the gate would produce false positives, and a noisy gate ends up unplugged.');

    const other = path.join(dir, 'other.js');
    fs.writeFileSync(other, "const v = execFileSync('node', ['--version'], { cwd });\n");
    const calls = scanCalls(rule, [other], dir);
    assert.strictEqual(calls.length, 1, 'the scan must still SEE a non-git spawn (otherwise the filter proves nothing)');
    const gitOnes = calls.filter((c) => isGitBinary(c.text));
    assert.deepStrictEqual(gitOnes, [],
      'a `node` spawn was taken for a `git` spawn: the first-argument reading is wrong');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the SCRUB PROOF is read from the code, and a look-alike does not satisfy it', () => {
  // ⚠️ A binding is proven only when its own declaration removes `GIT_*` keys.
  //    The two sabotages are the "I passed an env, so I am safe" mistake.
  const door = "const E = { ...process.env };\nfor (const k of Object.keys(E)) if (k.startsWith('GIT_')) delete E[k];\n";
  assert.deepStrictEqual(scrubbingBindings(door), ['E']);
  assert.deepStrictEqual(scrubbingBindings('const E = { ...process.env, PATH: p };\n'), [],
    'an env that deletes nothing must NOT be accepted as a door');
  assert.deepStrictEqual(scrubbingBindings('const E = { ...process.env };\ndelete E.HOME;\n'), [],
    'deleting some OTHER variable is not stripping the GIT_* family');
});

test('the PRIMITIVES are derived from real import forms, alias included', () => {
  // ⚠️ Anti-vacuity of the DERIVATION itself: if this stopped reading the
  //    import forms the repository actually uses, the scan would go blind
  //    while every other floor still passed.
  const derived = spawnPrimitives("import { execFileSync } from 'node:child_process';\n"
    + "const { spawnSync, execFile } = require('child_process');\n"
    + "import { fork as forkChild } from 'node:child_process';\n");
  assert.deepStrictEqual(derived, ['execFile', 'execFileSync', 'fork', 'forkChild', 'spawnSync']);
  assert.deepStrictEqual(spawnPrimitives("import fs from 'node:fs';\n"), [],
    'a module that imports no spawn primitive must contribute none');
});
