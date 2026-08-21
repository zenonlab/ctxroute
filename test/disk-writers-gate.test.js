// ═══════════════════════════════════════════════════════════════════════
// GATE — SPACE DECLARES ITSELF (2026-08-21)
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ THE RULE THIS FILE MECHANISES. Disk and RAM are FINITE and this machine
//    runs 24/7 for YEARS with no operator. So anything that WRITES declares
//    its CEILING and its EVICTION POLICY in the SAME GESTURE as its creation.
//    Without a ceiling the component DOES NOT EXIST — that is an ARCHITECTURE
//    bug, never an operations one. The question is never "is it big?" but
//    "at 10 years, how much is this worth?": monotonic growth is a DATED
//    outage, and "we will purge later" puts a human back inside the loop this
//    project exists to remove.
//
// ⚠️ WHY A MACHINE AND NOT A LINE OF PROSE. The doctrine has said this for
//    weeks and this repository had NO gate for it, while `state/` held 615
//    files for 5.1 MB — 544 of them (88 %) ephemeral per-invocation plans,
//    with no ceiling, no eviction, and nothing that would notice a NEW
//    undeclared writer appearing.
//
// 🔴 THE FIRST VERSION OF THIS GATE WAS KEYED ON THE RECEIVER NAME, AND THAT
//    WAS MEASURED FAIL-OPEN ON 2026-08-21. Appended to a real source file and
//    restored afterwards:
//      · `fs.writeFileSync("x","y")`                         → RED, correct.
//      · `require("fs").writeFileSync("/tmp/x","y")`         → **GREEN**.
//      · `const fsSab = require("fs"); fsSab.writeFileSync()` → **GREEN**.
//    An unmatched form is not "an undeclared writer": it is a writer NOBODY
//    SEES. The gate goes SILENT, which is fail-OPEN, and the manifest then
//    described that hole as if it went red — a blind cell written in the wrong
//    direction is worse than an undocumented one, because it tells the next
//    reader the case is handled.
//
// 🛑 THE REMEDY IS TO KEY ON THE METHOD, NEVER ON THE RECEIVER. A name like
//    `writeFileSync` is distinctive on its own, so the receiver does not need
//    to be named — and dropping the receiver kills the alias class, the
//    double-quote class and the destructured-import class in ONE move. This
//    house forbids name heuristics in a detector precisely because they go
//    blind in silence.
//
// ⚠️ TWO COMPLEMENTARY FAMILIES, AND NEITHER REPLACES THE OTHER:
//      ① RECEIVER-anchored, `rules/fs-call.yml` (`fs.$M`, `require('fs').$M`,
//         the promise API, its usual alias). It matches EVERY method name,
//         known or not, which is what forces each one to be CLASSIFIED in the
//         manifest — the ratchet that keeps the write set DERIVED.
//      ② METHOD-anchored, GENERATED HERE from the manifest's `write` entries
//         (`M($$$)` for a destructured import, `$X.M($$$)` for any receiver
//         whatsoever). Generated, so the rule CANNOT drift from the manifest:
//         two hand-written lists for one truth is a bill this repo has already
//         paid several times. Same shape as `test/git-env-door-gate.test.js`.
//
// 🛑 STRICT SEPARATION OF POWERS, DO NOT BLUR IT: the rules DETECT with no
//    exemption; `disk-writers.json` + this file carry the POLICY and the
//    RATCHET, in BOTH directions.
//
// ⚠️ AST, NEVER REGEX, and it is load-bearing here more than anywhere: the
//    scanned files are full of comments that name write primitives on purpose
//    ("NEVER a direct `writeFileSync`"). A regex would accuse the very
//    documentation that protects the invariant.
//
// ⚠️ ANTI-VACUITY (4 floors + a witness per atom AND per derived write
//    primitive, none replaces another). The worst defect of this repository
//    has never been a red gate: it is a GREEN gate that sees nothing.
//
// ⚠️ SABOTAGE IN MEMORY OR IN THE OS TMPDIR ONLY. A first version of another
//    gate here sabotaged a REAL file and brought down 38 tests of other suites
//    running in parallel. Never write into the working tree.
// ═══════════════════════════════════════════════════════════════════════

import { test, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
// ⚠️ THE VERDICT LIVES IN A PURE MODULE, and that is not tidiness: Stryker does
//    NOT mutate test code, so a rule written here would be UNVERIFIABLE — an
//    inverted comparison would stay green for ever and a false gate REASSURES.
//    Its exhaustive cases live in `disk-writers-pure.test.js`, which IS mutated.
import { verdict } from '../src/disk-writers-pure.js';

// 🛑 ONE DOOR PER FILE, AND IT SCRUBS THE WHOLE `GIT_*` FAMILY. Git EXPORTS
//    `GIT_DIR`/`GIT_INDEX_FILE` to every hook it runs, a child INHERITS them
//    and they BEAT `cwd` — under a poisoned env the perimeter below would be
//    ANOTHER repository's, and a gate judging the wrong corpus is
//    indistinguishable from a clean one. Never "unset the right variable":
//    nobody can enumerate what a future git version exports. Sealed repo-wide
//    by `git-env-door-gate.test.js` (measured 2026-08-21).
const ENV_WITHOUT_GIT = (() => {
  const e = { ...process.env };
  for (const k of Object.keys(e)) if (k.startsWith('GIT_')) delete e[k];
  return e;
})();

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEP = String.fromCharCode(92);
const RECEIVER_RULE = path.join(repo, 'rules', 'fs-call.yml');
const manifest = JSON.parse(fs.readFileSync(path.join(repo, 'disk-writers.json'), 'utf8'));

// ⚠️ DERIVED FROM THE MANIFEST, never typed again here: this list IS the
//    manifest's `write` classification, so the generated rule cannot drift
//    from the policy it enforces. Classify a new method `write` tomorrow and
//    its two atoms appear the same second.
const WRITE_PRIMITIVES = Object.keys(manifest.primitives || {})
  .filter((m) => manifest.primitives[m] === 'write').sort();

// ⚠️ LOUD FAILURE, never an empty scan: a gate finding nothing because its
//    TOOL is missing would go green while blind — the worst of both worlds.
//    🛑 Never a silent fallback on `npx`: it fetches a stranger package from
//    the network (measured in this repo).
function astGrepBinary() {
  const name = process.platform === 'win32' ? 'ast-grep.exe' : 'ast-grep';
  const bin = path.join(repo, 'node_modules', '@ast-grep', 'cli', name);
  if (!fs.existsSync(bin)) {
    throw new Error('ast-grep NOT FOUND (' + bin + ') — the disk-writer gate cannot judge. `npm ci`.');
  }
  return bin;
}

/**
 * Perimeter = the RUNTIME JavaScript, i.e. `src/`, TRACKED BY GIT. Derived,
 * never listed.
 * ⚠️ THE FILES ARE NAMED TO `ast-grep` EXPLICITLY rather than letting it walk
 *    the tree: `ast-grep` HONOURS `.gitignore`, so a directory gitignored
 *    tomorrow would make a tree walk go blind WITHOUT SAYING A WORD.
 * ⚠️ An UNTRACKED file is invisible to `git ls-files`, hence to this scan.
 *    That is inherent and DECLARED in the manifest's blind cells with its true
 *    failure direction (the gate goes silent), never patched over.
 * ⚠️ The exclusion of `test/` and `tools/` is DECLARED in the manifest with
 *    its measurement, never left to the reader to guess.
 */
function perimeter() {
  const out = execFileSync('git', ['ls-files'], {
    cwd: repo, env: ENV_WITHOUT_GIT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  return out.split('\n').map((s) => s.trim())
    .filter((f) => f.startsWith('src/') && /[.](js|mjs|cjs)$/.test(f))
    .filter((f) => fs.existsSync(path.join(repo, f)));
}

// ⚠️ THE CALLEE IS READ FROM AN AST MATCH, never from raw source: by the time
//    these regexes run, the parser has already decided that the text IS a call.
// 🛑 EVERYTHING BEFORE THE FIRST `(`, then the segment after the last dot —
//    and NOT "the first `.name(`", which was the shape before the method-anchored
//    family existed. On a BARE call it would have read the wrong name entirely:
//    `writeFileSync(p, JSON.stringify(x))` would have yielded `stringify`, i.e.
//    an unclassified primitive fault pointing at the wrong thing.
const REQUIRE_HEAD = /^require\s*\(\s*(['"])[^'"]*\1\s*\)/;
const HEAD = /^([^(]*?)\s*\(/;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/**
 * The method really called, from an ast-grep match text.
 * @param {string} text whitespace-normalised match text
 * @returns {string} the method, or `''` when it cannot be read (which surfaces
 *   as an UNCLASSIFIED primitive rather than being silently dropped).
 */
function calleeMethod(text) {
  // A `require('fs')` receiver carries its own parenthesis: neutralise it first
  // or the head would stop at it and read `require` as the method.
  const head = HEAD.exec(text.replace(REQUIRE_HEAD, 'REQUIRED'));
  if (head === null) return '';
  const parts = head[1].split('.');
  const last = parts[parts.length - 1].trim();
  return IDENTIFIER.test(last) ? last : '';
}

/**
 * @param {string} ruleFile
 * @param {string[]} files
 * @param {string} cwd
 * @returns {{file: string, line: number, method: string, text: string}[]}
 */
function scanWith(ruleFile, files, cwd) {
  if (files.length === 0) return [];
  let out = '';
  try {
    out = execFileSync(astGrepBinary(), ['scan', '-r', ruleFile, '--json=compact'].concat(files), {
      cwd, encoding: 'utf8', env: ENV_WITHOUT_GIT, maxBuffer: 64 * 1024 * 1024,
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
  return r.map((m) => {
    const text = String(m.text).replace(/\s+/g, ' ');
    return {
      file: String(m.file).split(SEP).join('/'),
      line: m.range.start.line + 1,
      method: calleeMethod(text),
      text: text.slice(0, 100),
    };
  });
}

/**
 * Writes the METHOD-anchored rule for the manifest's write primitives.
 * ⚠️ TWO ATOMS PER METHOD, and both are needed: `M($$$)` catches a destructured
 *    import (`const { writeFileSync } = require('fs')`), `$X.M($$$)` catches
 *    ANY receiver — `fs`, `require("fs")` with either quote, or an alias bound
 *    anywhere. The three forms measured GREEN on 2026-08-21 all die here.
 * ⚠️ GENERATED, never a second hand-written list: the rule and the policy are
 *    one truth, and two files holding one truth diverge — always.
 */
function methodRuleFor(primitives, dir) {
  const atoms = primitives.map((m) => '    - pattern: ' + m + '($$$)\n    - pattern: $X.' + m + '($$$)');
  const head = ['id: fs-write-method', 'language: JavaScript', 'severity: error',
    'message: write primitive call site', 'rule:', '  any:'];
  const file = path.join(dir, 'fs-write-method.yml');
  fs.writeFileSync(file, head.join('\n') + '\n' + atoms.join('\n') + '\n');
  return file;
}

// ⚠️ ONE tmpdir for the whole suite: the generated rule is read by every cell.
//    The OS TMPDIR and never `state/` — `ast-grep` HONOURS `.gitignore`, so a
//    rule or a witness written into an ignored folder is INVISIBLE (measured
//    here on 2026-08-06, when the anti-inert test then accused every rule).
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-diskw-'));
const METHOD_RULE = methodRuleFor(WRITE_PRIMITIVES, WORK);
afterAll(() => { fs.rmSync(WORK, { recursive: true, force: true }); });

/**
 * BOTH FAMILIES, merged and de-duplicated. A call written `fs.writeFileSync`
 * matches both rules; counting it twice would inflate every floor.
 * @param {string[]} [targets] files to scan; absent ⇒ the whole perimeter.
 * @param {string} [cwd]
 */
function scan(targets, cwd) {
  const files = targets || perimeter();
  const root = cwd || repo;
  const found = scanWith(RECEIVER_RULE, files, root).concat(scanWith(METHOD_RULE, files, root));
  const seen = new Map();
  for (const o of found) seen.set(o.file + ':' + o.line + ':' + o.method, o);
  return [...seen.values()];
}

test('GATE: every disk writer is DECLARED, with a budget and an eviction policy', () => {
  const faults = verdict(scan(), manifest);
  assert.deepStrictEqual(faults, [],
    'DISK WRITER VIOLATION(S):\n  ' + faults.join('\n  ')
    + '\n\n🛑 Space declares itself: whatever WRITES declares its ceiling and its'
    + '\n   eviction IN THE SAME GESTURE as its creation. Without a ceiling the'
    + '\n   component does not exist — monotonic growth is a DATED outage.'
    + '\n   An honest gap is written down (`policy: "none"` + reason + workItem),'
    + '\n   never left absent.');
});

test('ANTI-VACUITY: the scan really sees the runtime, and really sees WRITERS', () => {
  // ⚠️ A gate analysing NOTHING goes green — paid three times in this repo
  //    (`deps-purity`, `deadline-gate`, `layers-gate`). Four independent
  //    floors: the perimeter, the derived write vocabulary, the `fs` calls
  //    found, and the writers those calls resolve to.
  // 🛑 A FLOOR MEASURES A QUANTITY, NEVER AN IDENTITY (paid 2026-08-20 on
  //    `coverage-gate`, whose floor was satisfied by the WRONG corpus). Hence
  //    the shape check below: the perimeter must really be `src/`.
  const files = perimeter();
  assert.ok(files.length >= manifest.floors.perimeterFiles,
    'suspicious perimeter: ' + files.length + ' runtime JavaScript files tracked by git, floor '
    + manifest.floors.perimeterFiles + ' — the gate is blind (git? the `src/` filter?)');
  assert.ok(files.every((f) => f.startsWith('src/')),
    'the perimeter left `src/` — it is aiming somewhere else, and a floor cannot see that');

  assert.ok(WRITE_PRIMITIVES.length >= manifest.floors.writePrimitives,
    'only ' + WRITE_PRIMITIVES.length + ' write primitive(s) derived from the manifest ('
    + WRITE_PRIMITIVES.join(', ') + '), floor ' + manifest.floors.writePrimitives
    + ' — the generated rule would then be nearly empty, and the alias class reopens');

  const occ = scan();
  const methods = new Set(occ.map((o) => o.method));
  assert.ok(methods.size >= manifest.floors.distinctMethods,
    'suspicious scan: ' + methods.size + ' distinct fs method(s) found, floor '
    + manifest.floors.distinctMethods + ' — the RULES are broken, not the repository');
  assert.ok(!methods.has(''),
    'at least one match could not be resolved to a method name — the extraction is broken.'
    + '\n   LIMITATION, stated rather than hidden: the callee is read as everything before the'
    + '\n   first `(`, then the segment after the last dot; a computed callee lands here.');

  const writers = new Set(occ.filter((o) => manifest.primitives[o.method] === 'write').map((o) => o.file));
  assert.ok(writers.size >= manifest.floors.writers,
    'suspicious scan: ' + writers.size + ' disk writer(s) found, floor ' + manifest.floors.writers
    + ' — the classification collapsed, so every writer would read as a reader');
});

test('ANTI-INERT: every atom of the RECEIVER-anchored rule detects its witness', () => {
  // ⚠️ DERIVED FROM THE RULE, never a list copied into the test: an atom added
  //    tomorrow enters this table by itself and stays RED until someone pairs
  //    it with a real line of code. That is the only form that holds in a
  //    repository written by agents and reviewed by nobody.
  const atoms = fs.readFileSync(RECEIVER_RULE, 'utf8').split('\n')
    .map((l) => /^\s*-\s*pattern:\s*(.+?)\s*$/.exec(l)).filter(Boolean).map((m) => m[1]);
  assert.ok(atoms.length >= 3,
    'no atom extracted from ' + RECEIVER_RULE + ' — the extraction is broken, hence this whole test is vacuous');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-fs-witness-'));
  const withoutWitness = [];
  const blind = [];
  try {
    for (const atom of atoms) {
      const witness = manifest.witnesses[atom];
      if (typeof witness !== 'string' || witness === '') { withoutWitness.push(atom); continue; }
      const tmp = path.join(dir, 'w' + atoms.indexOf(atom) + '.js');
      fs.writeFileSync(tmp, witness + '\n');
      if (scanWith(RECEIVER_RULE, [tmp], dir).length === 0) {
        blind.push(atom + ' — witness NOT detected: ' + witness);
      }
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  assert.deepStrictEqual(withoutWitness, [],
    'ATOM(S) WITHOUT A WITNESS — impossible to prove they see anything at all: ' + withoutWitness.join(', ')
    + '\n⇒ add the real line of code to `witnesses` in disk-writers.json.');
  assert.deepStrictEqual(blind, [],
    'INERT ATOM(S) — green while seeing NOTHING:\n  ' + blind.join('\n  '));
});

test('ANTI-INERT: every DERIVED write primitive bites, BARE and behind ANY receiver', () => {
  // ⚠️ THE WITNESS IS FABRICATED FROM THE PRIMITIVE ITSELF — no table to keep
  //    in step, so a method classified `write` tomorrow is proven the same
  //    second. Same shape as `git-env-door-gate.test.js`.
  // ⚠️ TWO FORMS, because they close two DIFFERENT measured holes: the bare
  //    call is the destructured import, the aliased receiver is the
  //    `const fsSab = require("fs")` that went GREEN on 2026-08-21.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-fs-write-witness-'));
  let missing = [];
  try {
    const bare = path.join(dir, 'bare.js');
    fs.writeFileSync(bare, WRITE_PRIMITIVES.map((p) => p + '(dest, payload);').join('\n') + '\n');
    const member = path.join(dir, 'member.js');
    fs.writeFileSync(member, WRITE_PRIMITIVES.map((p) => 'aliased.' + p + '(dest, payload);').join('\n') + '\n');

    const seenBare = new Set(scanWith(METHOD_RULE, [bare], dir).map((c) => c.method));
    const seenMember = new Set(scanWith(METHOD_RULE, [member], dir).map((c) => c.method));
    missing = WRITE_PRIMITIVES
      .map((p) => {
        if (!seenBare.has(p)) return p + ' — the BARE form (destructured import) is NOT detected';
        if (!seenMember.has(p)) return p + ' — the ALIASED-RECEIVER form is NOT detected';
        return null;
      })
      .filter((r) => r !== null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  assert.deepStrictEqual(missing, [],
    'INERT WRITE PRIMITIVE(S) — a write in that form would be invisible, and the gate SILENT:\n  '
    + missing.join('\n  '));
});

test('NEGATIVE: the three forms measured GREEN on 2026-08-21 are now DETECTED', () => {
  // 🔴 THIS IS THE REGRESSION TEST OF THE MEASURED FAIL-OPEN. Each of these was
  //    appended to a real source file that day and the gate said nothing.
  // ⚠️ In the OS TMPDIR, never in the working tree: a real-file sabotage here
  //    once brought down 38 tests of suites running in parallel.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-fs-reopen-'));
  try {
    const cases = [
      ['alias.js', "const fsSab = require('fs');\nfsSab.writeFileSync('x', 'y');\n", 'writeFileSync'],
      ['dquote.js', 'require("fs").writeFileSync("x", "y");\n', 'writeFileSync'],
      ['destructured.js', "const { appendFileSync } = require('fs');\nappendFileSync('x', 'y');\n", 'appendFileSync'],
      ['deep.js', "const io = { fs: require('fs') };\nio.fs.mkdirSync('d');\n", 'mkdirSync'],
    ];
    const blind = [];
    for (const [name, src, method] of cases) {
      const tmp = path.join(dir, name);
      fs.writeFileSync(tmp, src);
      const hit = scan([tmp], dir).some((c) => c.method === method);
      if (!hit) blind.push(name + ' — `' + method + '` NOT detected: the gate stays SILENT on this form');
    }
    assert.deepStrictEqual(blind, [],
      'FAIL-OPEN REOPENED — a writer in this form is not "undeclared", it is INVISIBLE:\n  '
      + blind.join('\n  '));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('GATE: the detection rule carries NO exemption', () => {
  // The rule DETECTS, the manifest EXEMPTS. An `ignores:`/`files:` in the rule
  // would remove call sites from the manifest's sight — an exemption that no
  // reviewer would ever meet, since the manifest is the only file people read.
  const src = fs.readFileSync(RECEIVER_RULE, 'utf8')
    .split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  for (const key of ['ignores:', 'files:']) {
    assert.ok(!src.includes(key),
      'rules/fs-call.yml carries `' + key + '`: detection must be TOTAL, exemptions belong to the manifest.');
  }
});

test('GATE: every declared GAP is reachable from the injectable doc', () => {
  // 🛑 AN HONEST GAP MUST BE LOUD. A `workItem` that lives only inside a JSON
  //    nobody opens is a gap that has been RECORDED, not one that has been
  //    MADE VISIBLE — and the doc is what an agent receives at the moment it
  //    touches these files. DERIVED from the manifest: a gap opened tomorrow
  //    stays RED until it is written down where people read.
  const doc = fs.readFileSync(path.join(repo, 'docs', 'framework', 'disk-writers.md'), 'utf8');
  const items = new Set();
  for (const d of Object.values(manifest.writers)) {
    if (d.workItem) items.add(d.workItem);
    if (d.pathSourceGap && d.pathSourceGap.workItem) items.add(d.pathSourceGap.workItem);
  }
  assert.ok(items.size > 0,
    'no gap declared at all — either the repository is perfect, or this check is measuring nothing');
  const absent = [...items].filter((w) => !doc.includes(w)).sort();
  assert.deepStrictEqual(absent, [],
    'GAP(S) DECLARED IN THE MANIFEST BUT ABSENT FROM `docs/framework/disk-writers.md`: '
    + absent.join(', ') + ' — a gap nobody meets is a gap nobody closes.');
});

test('NEGATIVE: the WIRING really reddens on an UNDECLARED writer', () => {
  // ⚠️ IN MEMORY. Never on a real file: a sabotage on disk has already brought
  //    down 38 tests of other suites running in parallel here.
  const real = scan();
  const sabotaged = verdict(
    real.concat([{ file: 'src/never-declared-xyz.js', method: 'writeFileSync', text: 'fs.writeFileSync(a, b)' }]),
    manifest);
  assert.ok(sabotaged.some((f) => f.startsWith('src/never-declared-xyz.js')),
    'SABOTAGE NOT DETECTED: a brand-new disk writer would pass this gate, ceiling-free and silent.');
});

test('NEGATIVE: the WIRING really reddens on a STALE declaration', () => {
  // ⚠️ A declaration that survives the disappearance of its writes is a
  //    DORMANT PERMIT: it widens the budget for free and gets re-inherited by
  //    the next file that takes that name. The ratchet runs BOTH ways.
  const copy = JSON.parse(JSON.stringify(manifest));
  copy.writers['src/vanished-writer-xyz.js'] = {
    path: 'paths.stateDir()', class: 'state', budget: { maxFiles: 1 }, policy: 'event',
    why: 'a declaration whose code no longer exists — the dormant permit this part exists to refuse',
  };
  const faults = verdict(scan(), copy);
  assert.ok(faults.some((f) => f.startsWith('src/vanished-writer-xyz.js') && f.includes('DECLARED but no write')),
    'SABOTAGE NOT DETECTED: a stale declaration would survive, budget included.');
});

test('NEGATIVE: the WIRING really reddens on a declaration MISSING ITS POLICY', () => {
  // ⚠️ THE COMMONEST FORM OF THE FAULT: a declaration written in a hurry
  //    carries a path and a budget and forgets the ONE field that says what
  //    happens at year ten.
  const copy = JSON.parse(JSON.stringify(manifest));
  const victim = Object.keys(copy.writers).sort()[0];
  assert.ok(victim, 'no declared writer at all — this negative-check would prove nothing');
  delete copy.writers[victim].policy;
  const faults = verdict(scan(), copy);
  assert.ok(faults.some((f) => f.startsWith(victim) && f.includes('policy')),
    'SABOTAGE NOT DETECTED: a writer could ship with no eviction policy at all.');
});

test('NEGATIVE: ast-grep ignores a MENTION in a comment or a string', () => {
  // ⚠️ THIS is the reason for AST over regex, and it is not theoretical here:
  //    `src/session-store.js` carries "NEVER a direct `writeFileSync`" in a
  //    comment and `src/memory-store.js` explains its own `tmp + rename`. A
  //    regex would accuse the documentation that protects the invariant.
  // ⚠️ Both families are exercised — the method-anchored one is the wider net,
  //    so it is the one that would turn a warning into an accusation.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-fs-mention-'));
  try {
    const tmp = path.join(dir, 'mention.js');
    fs.writeFileSync(tmp, '// NEVER a direct fs.writeFileSync(dest, data) on the destination\n'
      + "const s = 'fs.appendFileSync(log, line)';\n"
      + 'const t = `mkdirSync(dir)`;\n'
      + 'module.exports = { s, t };\n');
    assert.deepStrictEqual(scan([tmp], dir), [],
      'ast-grep counted a MENTION as a call — the gate would accuse its own documentation, and a noisy gate ends up unplugged.');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
