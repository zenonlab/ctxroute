// ═══════════════════════════════════════════════════════════════════════
// WI-VENDOR-PATH — the fleet root has ONE definition, and it is CONSUMED
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 THE DEFECT THIS CLOSES: `vendor-deadline.js` addressed `~/.claude/hooks`
//    by rebuilding it itself (`os.homedir()` + '.claude' + 'hooks'), under its
//    own env var, while `paths.js` already owned that directory
//    (`fileDocsDir()` hangs BENEATH it, `skillsDir()` BESIDE it). That is the
//    `stateDir` defect verbatim — two copies of one truth — one level up, and
//    on the ONE script that WRITES into that directory.
//
// ⚠️ TWO ASSERTIONS, AND NEITHER IS ENOUGH ALONE:
//    ① EQUALITY — the accessor still resolves where the hardcoded form did.
//       Without it, a "clean" refactor could silently move the target and
//       vendor `deadline.js` into a folder no harness reads.
//    ② CONSUMPTION, PROVEN BY BEHAVIOUR — we set the override and the SPAWNED
//       script must report THAT directory. A source grep would be satisfied by
//       a comment; a process cannot fake where it looked.
//    Sabotage that must turn it RED: put `path.join(os.homedir(),'.claude',
//    'hooks')` back into `vendor-deadline.js` ⇒ ② fails (it reports the real
//    fleet, not the tmpdir). Change the accessor's segments ⇒ ① fails.
//
// ⚠️ DRY-RUN ONLY (never `--write`): the real fleet is in production for other
//    agents. The tmpdir is empty, so the script has nothing to arm anyway.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fleetHooksDir, fleetHooksLabel, fleetHooksSegments, fileDocsDir, skillsDir } from '../src/paths.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(__dirname, '..');
const VENDOR = path.join(__dirname, '..', 'src', 'vendor-deadline.js');
const RULE = path.join(repo, 'rules', 'fleet-root.yml');

// ⚠️ THE MODULE THAT OWNS THE DEFINITION — an identity, not a list, and taken
//    from the module this suite already imports the accessors from, so it
//    cannot drift away from the thing it names. A hand-written list of "files
//    we tolerate" would only ever know the past, which is the defect class this
//    gate closes. 🛑 It is NOT an exemption: since the segments live in a frozen
//    const consumed by spread, even this file carries no literal construction
//    any more, and cell ③ would redden on it like on anyone else.
const OWNER = path.relative(repo, fileURLToPath(new URL('../src/paths.js', import.meta.url)))
  .split(path.sep).join('/');

// ⚠️ `git ls-files` inherits the ambient `GIT_*` of a hook or a rebase and would
//    then answer about ANOTHER repository. Scrubbed, never trusted.
const ENV_WITHOUT_GIT = (() => {
  const e = { ...process.env };
  for (const k of Object.keys(e)) if (k.startsWith('GIT_')) delete e[k];
  return e;
})();

/**
 * THE SEGMENTS OF THE FLEET ROOT, **TAKEN FROM THE SINGLE SOURCE ITSELF**.
 * 🛑 NEVER written down here. Writing `.claude` and `hooks` into this gate
 *    would create the very thing the work item removes: a second copy of one
 *    truth, this time inside its own judge. Move `FLEET_SEGMENTS` tomorrow and
 *    the detector follows without a line changed — while cell ⑧ holds the
 *    CONTRACT literally, so the move cannot happen unnoticed either.
 * ⚠️ Read from the SEGMENTS, never re-derived from `fleetHooksDir()` relative
 *    to the home: under the test override that accessor points at a tmpdir, and
 *    the relative form would collapse to `..` fragments that appear in half the
 *    requires of this repository — the filter would go from discriminating to
 *    universal, in silence.
 * @returns {string[]}
 */
function fleetSegments() {
  return fleetHooksSegments().slice();
}

/**
 * A FABRICATED OFFENDER, smuggled into the REAL scan that judges the repository.
 * 🛑 THE PROOF OF LIFE MUST TRAVEL WITH THE VERDICT, not next to it. The first
 *    version of this gate leaned on `src/paths.js` still containing a literal
 *    construction as its known positive — and the correct fix (segments in a
 *    frozen const, consumed by spread) REMOVED that occurrence. A floor that
 *    the good behaviour destroys is not a floor. `ast-grep` also answers `[]`
 *    with exit 0 on a path it cannot resolve, so an empty result is exactly
 *    what a broken scan and a clean repository BOTH look like.
 * @param {string} dir
 * @returns {string} the control file's absolute path
 */
function control(dir) {
  const file = path.join(dir, 'control-offender.js');
  fs.writeFileSync(file, "const root = require('path').join(home(), '.claude', 'hooks');\n"
    + 'module.exports = { root };\n');
  return file;
}

// ⚠️ LOUD FAILURE, never an empty scan: a gate blind because its TOOL is missing
//    would go green while seeing nothing — the worst of both worlds.
//    🛑 Never a silent fallback on `npx`: it fetches a stranger package off the
//    network (measured in this repository).
function astGrepBinary() {
  const name = process.platform === 'win32' ? 'ast-grep.exe' : 'ast-grep';
  const bin = path.join(repo, 'node_modules', '@ast-grep', 'cli', name);
  if (!fs.existsSync(bin)) {
    throw new Error('ast-grep NOT FOUND (' + bin + ') — the fleet-root gate cannot judge. `npm ci`.');
  }
  return bin;
}

/**
 * PERIMETER = the JavaScript that RUNS (`src/`) and the operator tools
 * (`tools/`), TRACKED BY GIT. DERIVED, never listed: a script written tomorrow
 * is judged the day it is committed. `tools/` is IN because two of the three
 * historical offenders lived there (`lint-corpus.js`, `scope-reach.js`).
 * ⚠️ THE FILES ARE NAMED TO `ast-grep` EXPLICITLY rather than letting it walk
 *    the tree: it HONOURS `.gitignore`, so a directory ignored tomorrow would
 *    make a tree walk go blind WITHOUT SAYING A WORD.
 * ⚠️ An UNTRACKED file is invisible to `git ls-files`, hence to this scan — the
 *    same declared, one-run-late property the other manifests carry.
 * @returns {string[]}
 */
function perimeter() {
  const out = execFileSync('git', ['ls-files'], {
    cwd: repo, env: ENV_WITHOUT_GIT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  return out.split('\n').map((s) => s.trim())
    .filter((f) => (f.startsWith('src/') || f.startsWith('tools/')) && f.endsWith('.js'));
}

/**
 * @param {string[]} files
 * @param {string} cwd
 * @returns {{file: string, line: number, text: string}[]}
 */
function scan(files, cwd) {
  if (files.length === 0) return [];
  let out = '';
  try {
    out = execFileSync(astGrepBinary(), ['scan', '-r', RULE, '--json=compact'].concat(files), {
      cwd, encoding: 'utf8', env: ENV_WITHOUT_GIT, maxBuffer: 64 * 1024 * 1024,
      // ⚠️ stderr CAPTURED, never inherited: `ast-grep` prints "N error(s) found"
      //    on every scan, which would pour a fake ERROR into a GREEN run — and a
      //    green that looks red is how people stop reading a suite.
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    // ⚠️ `scan` exits ≠ 0 as soon as it meets an `error` severity match — the
    //    NORMAL case here. The findings are on stdout.
    out = (e && e.stdout) || '';
  }
  let r = [];
  try { r = JSON.parse(out || '[]'); } catch { r = []; }
  return r.map((m) => ({
    file: String(m.file).split(path.sep).join('/'),
    line: m.range.start.line + 1,
    text: String(m.text).replace(/\s+/g, ' '),
  }));
}

/**
 * The matches that REBUILD the fleet root: every derived segment present in one
 * and the same path construction.
 * ⚠️ `every`, not `some`: `skillsDir()` and `leak-list.js` legitimately assemble
 *    `.claude/…` for OTHER directories, and a gate red on the truth gets
 *    disarmed within the day.
 * @param {{file: string, line: number, text: string}[]} matches
 * @param {string[]} segments
 */
function rebuilds(matches, segments) {
  return matches.filter((m) => segments.every((s) => m.text.includes(s)));
}

// ⚠️ ONE WITNESS PER ATOM OF THE RULE, and the table is CONFRONTED with the
//    `.yml` below: an atom added tomorrow stays RED until a real line of code
//    proves it sees anything at all. Each witness is written so it must be
//    reported as an OFFENDER, which proves the atom AND the segment decision in
//    one shot — an atom that merely "matches something" proves nothing.
const WITNESSES = {
  'join($$$)': "const a = join(home(), '.claude', 'hooks');",
  '$X.join($$$)': "const b = path.join(home(), '.claude', 'hooks');",
  'resolve($$$)': "const c = resolve(home(), '.claude', 'hooks');",
  '$X.resolve($$$)': "const d = path.resolve(home(), '.claude', 'hooks');",
  '$A + $B': "const e = home() + '/.claude' + '/hooks';",
};

test('① THE TARGET HAS NOT MOVED — fleetHooksDir() = the historical hardcoded form', () => {
  const sauve = process.env.CTXROUTE_FLEET_HOOKS_DIR;
  delete process.env.CTXROUTE_FLEET_HOOKS_DIR;
  try {
    assert.strictEqual(
      fleetHooksDir(),
      path.join(os.homedir(), '.claude', 'hooks'),
      'the accessor no longer resolves where vendor-deadline.js used to write'
    );
    // The two siblings prove the SHAPE of the tree, which is what makes this
    // the right root and not an arbitrary one.
    assert.strictEqual(fileDocsDir(), path.join(fleetHooksDir(), 'docs'), 'fileDocsDir must hang BENEATH the fleet root');
    assert.strictEqual(skillsDir(), path.join(os.homedir(), '.claude', 'commands'), 'skillsDir must stay BESIDE it');
  } finally {
    if (sauve === undefined) delete process.env.CTXROUTE_FLEET_HOOKS_DIR;
    else process.env.CTXROUTE_FLEET_HOOKS_DIR = sauve;
  }
});

test('② THE ACCESSOR IS REALLY CONSUMED — vendor-deadline.js targets what paths.js says', () => {
  const faux = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-root-'));
  const r = spawnSync(process.execPath, [VENDOR], {
    env: { ...process.env, CTXROUTE_FLEET_HOOKS_DIR: faux },
    encoding: 'utf8',
  });
  assert.strictEqual(r.status, 0, `dry-run must succeed on an existing folder — stderr: ${r.stderr}`);
  // ⚠️ We assert on the ANNOUNCED target, i.e. the directory the script really
  //    resolved — never on the presence of a `require('./paths')` in its source.
  assert.ok(
    r.stdout.includes(`target         : ${faux}`),
    `vendor-deadline.js ignored the paths.js override (still rebuilding the root itself?) — stdout: ${r.stdout}`
  );
});

// ═══════════════════════════════════════════════════════════════════════
// ③-⑦ — THE CLASS, NOT THE CASE
// ═══════════════════════════════════════════════════════════════════════
//
// 🛑 CELLS ① AND ② PROVE ONE SCRIPT. They would stay green while a FOURTH file
//    rebuilt the root tomorrow — and that is exactly how this defect arrived:
//    THREE scripts had each grown their own copy, under three different env-var
//    names, and nobody noticed because each one, alone, looked reasonable.
//    A gate that names its defendants only knows the past.
// ⇒ The perimeter below is DERIVED (`git ls-files`), the forbidden SEGMENTS are
//    DERIVED (from the accessor's own return value) and the single allowed file
//    is an IDENTITY (the module that exports the accessor), never a list.
//
// 🛑 NO PURE MODULE FOR THIS ONE, AND THE REASON IS WRITTEN RATHER THAN LEFT TO
//    LOOK LIKE AN OVERSIGHT. The house rule is that a VERDICT lives in a pure,
//    Stryker-mutated module because a rule written in a suite is unverifiable
//    (`disk-writers-pure.js`, `temporal-budget-pure.js`). Those carry a POLICY —
//    closed lists, budgets, minimum justification lengths. Here there is no
//    policy to mutate: the whole judgement is "every derived segment present,
//    outside the owner", one `every` and one `!==`. What actually holds this
//    gate up is the RULE, the DERIVATIONS and the floors below, and those are
//    proven by ⑤ and ⑥, not by mutation. Do not extract a module to satisfy the
//    letter of a rule whose reason does not apply.

test('③ NO SECOND DEFINITION — nobody but the single source carries the fleet root', () => {
  // ⚠️ THE CONTROL IS SCANNED IN THE SAME INVOCATION AS THE VERDICT. Judging the
  //    repository and proving the detector alive in two separate runs would let
  //    a blind run certify a clean repository — the one failure mode this whole
  //    gate exists to make impossible.
  const segments = fleetSegments();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-fleetroot-c-'));
  try {
    const ctrl = control(dir);
    const found = rebuilds(scan(perimeter().concat([ctrl]), repo), segments);

    assert.ok(found.some((m) => m.file.endsWith('control-offender.js')),
      'THE DETECTOR WAS BLIND ON THIS VERY SCAN: the fabricated offender was not'
      + ' reported, so the empty verdict below proves NOTHING. `ast-grep` answers'
      + ' [] with exit 0 on a path it cannot resolve — a broken scan and a clean'
      + ' repository look identical. Fix the rule or the invocation, never the floor.');

    const offenders = found.filter((m) => !m.file.endsWith('control-offender.js'));
    assert.deepStrictEqual(offenders, [],
      'A SECOND DEFINITION OF THE FLEET ROOT:\n  '
      + offenders.map((m) => m.file + ':' + m.line + '  ' + m.text).join('\n  ')
      + '\n\n🛑 A component is NEVER designated by a guessed address, and this one is'
      + '\n   published AND written into. Two copies of it diverge in silence.'
      + '\n   To REACH the disk: `paths.fleetHooksDir()` (absolute, overridable).'
      + '\n   To SHOW an address to a reader: `paths.fleetHooksLabel()` (relative,'
      + '\n   home-free — the accessor there would leak a real user path into every'
      + '\n   injected document, and this repository is public).');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('④ ANTI-VACUITY — the scan really looks at the runtime, and at the RIGHT corpus', () => {
  // 🛑 A GATE THAT ANALYSES NOTHING GOES GREEN, and that is this repository's
  //    worst defect class (paid three times: deps-purity, deadline-gate,
  //    layers-gate). Three independent floors, plus an IDENTITY check — a floor
  //    measures a QUANTITY, and a scan aimed at the wrong corpus satisfies every
  //    quantity it passes.
  const segments = fleetSegments();
  assert.ok(segments.length >= 2,
    'the fleet root resolves to fewer than two segments below the home directory —'
    + ' the "every segment present" test would then accuse almost any path join');
  // ⚠️ EVERY segment must be non-empty, or `String.includes('')` is true for any
  //    text on earth and the filter accuses the whole repository at once — or,
  //    depending on which side you read it from, nothing at all.
  assert.deepStrictEqual(segments.filter((s) => !s || !s.trim()), [],
    `the fleet root carries an empty segment (${JSON.stringify(segments)}) —`
    + ' the filter would stop discriminating anything');

  // 🛑 A FLOOR MEASURES A QUANTITY, NEVER AN IDENTITY (paid on `coverage-gate`,
  //    whose floor was satisfied by the WRONG corpus). Hence the identity check
  //    beside the count.
  const files = perimeter();
  assert.ok(files.length >= 20, `perimeter collapsed to ${files.length} files — the scan is aimed at nothing`);
  assert.ok(files.includes(OWNER),
    `the perimeter does not even contain ${OWNER} — it is aimed at the wrong corpus`);
  assert.ok(files.some((f) => f.startsWith('tools/')),
    'the perimeter no longer reaches `tools/`, where two of the three historical'
    + ' offenders lived — a narrowed perimeter is a silent exemption');
  // 🛑 The PROOF OF LIFE is deliberately NOT here: it rides inside cell ③, in
  //    the same `ast-grep` invocation that delivers the verdict. Proving the
  //    detector alive in a *different* run would still let the judging run be
  //    blind. Do not move it back here.
});

test('⑤ ANTI-INERT — every atom of the rule is proven by a witness it must accuse', () => {
  // ⚠️ WITNESS TABLE DERIVED FROM THE `.yml`, never the other way round: an atom
  //    added tomorrow lands here by itself and stays RED until someone proves,
  //    with a real line of code, that it detects anything.
  const atoms = fs.readFileSync(RULE, 'utf8').split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .map((l) => /^\s*-\s*pattern:\s*(.+?)\s*$/.exec(l))
    .filter(Boolean).map((m) => m[1]);
  assert.ok(atoms.length > 0, 'no atom read from rules/fleet-root.yml — this cell is measuring nothing');

  const missing = atoms.filter((a) => !WITNESSES[a]).sort();
  assert.deepStrictEqual(missing, [],
    'ATOM(S) WITHOUT A WITNESS: ' + missing.join(' | ')
    + ' — an atom nobody proved is an atom that may match nothing, i.e. a SILENT hole.');

  const segments = fleetSegments();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-fleetroot-w-'));
  try {
    for (const atom of atoms) {
      const file = path.join(dir, 'w.js');
      fs.writeFileSync(file, WITNESSES[atom] + '\nmodule.exports = {};\n');
      assert.ok(rebuilds(scan([file], dir), segments).length >= 1,
        `ATOM \`${atom}\` DETECTED NOTHING on its own witness — it is decorative.`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('⑥ MENTION vs CODE — a comment or a string that names the forbidden form is NOT accused', () => {
  // ⚠️ THIS is why the detector is an AST and not a regex, and it is not
  //    theoretical: `src/paths.js` carries "NEVER rebuild it with
  //    path.join(os.homedir(), '.claude', 'hooks')" in a comment, and two more
  //    files explain the defect they were cured of. A regex would accuse the
  //    documentation that protects the invariant — and a gate that accuses its
  //    own docs is disarmed the same day.
  const segments = fleetSegments();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-fleetroot-m-'));
  try {
    const file = path.join(dir, 'mention.js');
    fs.writeFileSync(file,
      "// NEVER rebuild it with path.join(os.homedir(), '.claude', 'hooks') in a script\n"
      + "const s = \"path.join(home, '.claude', 'hooks')\";\n"
      + 'module.exports = { s };\n');
    assert.deepStrictEqual(rebuilds(scan([file], dir), segments), [],
      'a MENTION was counted as a construction — the gate now accuses the very'
      + ' comments that carry the invariant, and a noisy gate ends up unplugged.');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('⑦ THE RULE CARRIES NO EXEMPTION — detection is total, policy lives here', () => {
  // 🛑 A `files:`/`ignores:` inside the `.yml` would remove call sites from this
  //    gate's SIGHT, and nobody reads a rule file. The only place an allowance
  //    may be written is next to the reason for it — here, and derived.
  const src = fs.readFileSync(RULE, 'utf8').split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  for (const key of ['ignores:', 'files:']) {
    assert.ok(!src.includes(key),
      'rules/fleet-root.yml carries `' + key + '`: detection must be TOTAL, the allowance belongs to the gate.');
  }
});

// ═══════════════════════════════════════════════════════════════════════
// ⑧-⑩ — THE PUBLISHED PROJECTION
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 `.claude/hooks/` used to be hardcoded TWICE in `src/source-adapters.js`,
//    composing the `[source: …]` tag of every injected document. Nothing read
//    or wrote through it, and that is exactly why it survived: it is not an
//    address used to REACH the disk, it is an address SHOWN TO A READER. The
//    skill is explicit that the tag is a CONTRACT — an agent reads that exact
//    path to go and UPDATE the doc when it finds it wrong, which is the loop
//    that makes the corpus self-repairing. Move the fleet and the tag sends
//    every reader to a directory that no longer holds the file, silently.
// 🛑 AND THE OBVIOUS FIX IS A LEAK. `fleetHooksDir()` is ABSOLUTE: emitting it
//    would put the maintainer's home directory into the context of every agent,
//    and this repository is PUBLIC and treats itself as already public. Under
//    the test override it is worse still — a tmpdir would rewrite a published
//    contract. Hence ONE definition (`FLEET_SEGMENTS`) and TWO projections.
//    These three cells are what stops anyone "fixing" it back into a leak.

test('⑧ THE PUBLISHED CONTRACT — the tag prefix is exactly what agents are told to read', () => {
  // ⚠️ HARDCODED, and it must stay hardcoded: this is the ONE place the contract
  //    is written as a literal. Deriving it from the module would mutate WITH
  //    the code and prove nothing — a test must never take its expectation from
  //    the value it checks. Everything else in this suite derives; this asserts.
  assert.strictEqual(fleetHooksLabel(), '.claude/hooks',
    'the published `[source: …]` prefix changed — every agent that was told to go'
    + ' and update a doc at the old address now walks to a directory that does not'
    + ' hold it. Changing this is changing a contract, not a constant.');
  assert.deepStrictEqual(fleetHooksSegments().slice(), ['.claude', 'hooks'],
    'the canonical segments of the fleet root changed');
  // ⚠️ POSIX separator ALWAYS, including on Windows: the tag is a published
  //    address, not a filesystem path, and `pretool-differential` compares it
  //    byte for byte against the legacy hook's output.
  assert.ok(!fleetHooksLabel().includes('\\'),
    'the label carries a backslash — it was built with `path.join` instead of'
    + " `.join('/')`, so the tag now reads differently on Windows and on Linux");
});

test('⑨ NO LEAK — the published label is home-free, relative, and override-proof', () => {
  // 🛑 THE FAILURE THIS FORBIDS IS NOT A CRASH, IT IS A DISCLOSURE, and it would
  //    ship inside every injected document without anything looking wrong.
  const label = fleetHooksLabel();
  assert.ok(!path.isAbsolute(label),
    `the published label is an ABSOLUTE path (${label}) — it now leaks a real user`
    + ' directory into the context of every agent. Use fleetHooksLabel(), never fleetHooksDir().');
  assert.ok(!label.includes(os.homedir()),
    'the published label contains the home directory — a real user path is being'
    + ' emitted into every injected document of a PUBLIC repository');

  // ⚠️ THE OVERRIDE MUST NOT REACH THE CONTRACT. A test pointing the engine at a
  //    tmpdir is changing where this PROCESS reads, never what a reader on a
  //    normal machine is told. If this ever couples, a suite run would publish
  //    `/tmp/…` into documents.
  const saved = process.env.CTXROUTE_FLEET_HOOKS_DIR;
  const faux = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-label-'));
  try {
    process.env.CTXROUTE_FLEET_HOOKS_DIR = faux;
    assert.strictEqual(fleetHooksLabel(), label,
      'the test override rewrote the PUBLISHED contract — the label must be a'
      + ' projection of the canonical segments, never of the runtime accessor');
  } finally {
    if (saved === undefined) delete process.env.CTXROUTE_FLEET_HOOKS_DIR;
    else process.env.CTXROUTE_FLEET_HOOKS_DIR = saved;
    fs.rmSync(faux, { recursive: true, force: true });
  }
});

test('⑩ THE TWO PROJECTIONS AGREE — separate is not the same as unrelated', () => {
  // 🛑 SPLITTING ONE TRUTH INTO TWO FUNCTIONS IS ONLY SAFE IF SOMETHING TIES
  //    THEM. Without this cell, ⑧ and ① could both stay green while the label
  //    and the accessor described two different directories — which is the
  //    original defect wearing a better hat.
  const saved = process.env.CTXROUTE_FLEET_HOOKS_DIR;
  delete process.env.CTXROUTE_FLEET_HOOKS_DIR;
  try {
    assert.strictEqual(
      fleetHooksDir(),
      path.join(os.homedir(), ...fleetHooksLabel().split('/')),
      'the address the engine REACHES and the address it PUBLISHES have drifted:'
      + ' agents are being sent to update documents somewhere the engine never reads'
    );
  } finally {
    if (saved === undefined) delete process.env.CTXROUTE_FLEET_HOOKS_DIR;
    else process.env.CTXROUTE_FLEET_HOOKS_DIR = saved;
  }
});
