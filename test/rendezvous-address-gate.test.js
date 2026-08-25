// ═══════════════════════════════════════════════════════════════════════
// GATE — AN ADDRESS DECLARES ITSELF (2026-08-25)
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ THE CLASS THIS FILE MECHANISES, AND IT WAS PAID THREE TIMES IN ONE DAY.
//    Every literal by which one component REACHES another — a host, a port, a
//    URL, a pipe or socket name, a route of our own protocol — is a truth that
//    two processes must spell IDENTICALLY. When they do not, NOTHING SAYS SO:
//    no exception, no log, no badge. The daemon listens here, the client knocks
//    there, and the injection simply stops.
//      · the rendezvous address was hashed from the CODE folder, so a frozen
//        daemon and its working-tree clients computed different pipe names —
//        silent for about twelve hours;
//      · the PORT lived as a constant in the daemon AND as `transport.port` in
//        the manifest, agreeing by luck;
//      · the HOST was the same defect one field over.
//    Each was found by a human pulling on a thread. The tests written that day
//    are INSTANCE judges: they cover those three addresses and stay green when
//    a FOURTH is written the same way. That is the hole this closes.
//
// 🛑 WHAT MAKES THIS A GATE AND NOT A LIST — the four conditions this
//    repository demands of a closed class:
//      ① DERIVED. The atoms live in `rendezvous-budget.json` and are RENDERED
//        into an ast-grep rule at gate time (the shape `disk-writers.json`
//        already uses for its method-anchored family). The perimeters come from
//        `git ls-files`. An address written tomorrow, in a file that does not
//        exist yet, is found without anyone editing this file.
//      ② FAIL-CLOSED. An occurrence that is not declared is RED. Never "green
//        unless someone remembers to add it".
//      ③ ANTI-VACUOUS. Floors on both perimeters, floors on both occurrence
//        counts, and a WITNESS per atom whose detection is REQUIRED. This repo
//        has been bitten three times by a gate green because it analysed zero
//        files, and its worst defect has never been a red gate — it is a GREEN
//        gate that sees nothing.
//      ④ SEEN RED. Sabotages below fabricate a FOURTH address, and a DIVERGENT
//        one, IN MEMORY.
//
// 🔑 THE CHECK AN INSTANCE JUDGE CANNOT DO — AGREEMENT. Two sites may hold one
//    address (the OS supervisor insists on holding its own copy: systemd binds
//    `ListenStream=`, launchd binds `SockServiceName`). What is forbidden is
//    holding two DIFFERENT ones. Every site declares the `rendezvous` it names
//    and the `value` it writes; all sites of one rendezvous must agree, with
//    the rendezvous itself. `daemon-http-port` has FOUR sites and until this
//    file existed nothing compared them.
//
// ⚠️ AST ON THE JAVASCRIPT SIDE, NEVER REGEX, and it is load-bearing here: this
//    repository EXPLAINS its own former port constant in prose, so a grep would
//    accuse a comment. The `regex:` of an atom applies to the TEXT OF A NODE
//    the parser already identified — the opposite of grepping a file. Proven by
//    a MENTION cell below.
//
// ⚠️ THE DATA SIDE HAS NO PARSER, so it is narrowed instead of loosened:
//    comments are stripped per format, and the perimeter holds only the
//    DECLARATIVE OS units. MEASURED 2026-08-25: the wide form found 21 lines of
//    which 8 named no address (a DOCTYPE URL, an XML namespace, installer
//    scripts PARSING the unit); the narrow form finds 6 with 0 false. A gate
//    that reddens on noise gets disarmed by the first annoyed agent.
//
// ⚠️ IN-MEMORY SABOTAGE ONLY. The verdict is a PURE function of (occurrences,
//    declarations), so every negative-check runs on fabricated data. A first
//    version of another gate here sabotaged a REAL file and brought down 38
//    tests of other suites running in parallel. Never write into the tree.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
// ⚠️ THE VERDICT LIVES IN A PURE MODULE, and that is not tidiness: Stryker does
//    NOT mutate test code, so the rule written HERE was UNVERIFIABLE — an
//    inverted comparison would have stayed green for ever. Its own author wrote
//    that weakness down in `rendezvous-budget.json`. Same reasoning, same remedy
//    as `quadratic-budget-pure.js` and `doctor-wiring-pure.js`. Its exhaustive
//    cases (both sides of every bound, adversarial keys, sorting, the agreement
//    check) live in `rendezvous-budget-pure.test.js`, which IS mutated.
// 🛑 STATIC import, never `createRequire` and never a re-export: that is the only
//    edge vitest's related-graph and Stryker's perTest mapping both see
//    (`mutation-workflow-gate`, measured 2026-08-25).
import { verdict } from '../src/rendezvous-budget-pure.js';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEP = String.fromCharCode(92);
const manifest = JSON.parse(fs.readFileSync(path.join(repo, 'rendezvous-budget.json'), 'utf8'));
// ⚠️ DERIVED from the manifest and PASSED IN, never re-listed in the pure module:
//    the closed list of origins lives beside the sentence that justifies each of
//    them, and a second copy would be the very class this gate refuses.
const ORIGINS = Object.keys(manifest.origins);

// ⚠️ LOUD FAILURE, never an empty scan: a gate finding nothing because its TOOL
//    is missing would go green while blind — the worst of both worlds. A fresh
//    worktree has no `node_modules`; it must say so, not shrug.
function astGrepBinary() {
  const name = process.platform === 'win32' ? 'ast-grep.exe' : 'ast-grep';
  const bin = path.join(repo, 'node_modules', '@ast-grep', 'cli', name);
  if (!fs.existsSync(bin)) {
    throw new Error('ast-grep NOT FOUND (' + bin + ') — the rendezvous gate cannot judge. `npm ci`.');
  }
  return bin;
}

// 🛑 SCRUB THE WHOLE `GIT_*` FAMILY BEFORE SPAWNING `git`. Those variables are
//    exported by git to every hook it runs, inherited by any child, and they
//    BEAT `cwd`. Sealed repo-wide by `git-env-door-gate.test.js`.
const ENV_WITHOUT_GIT = (() => {
  const e = { ...process.env };
  for (const k of Object.keys(e)) if (k.startsWith('GIT_')) delete e[k];
  return e;
})();

/** Everything git tracks. DERIVED, never listed. */
function tracked() {
  const out = execFileSync('git', ['ls-files'], {
    cwd: repo, env: ENV_WITHOUT_GIT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  return out.split('\n').map((s) => s.trim()).filter(Boolean)
    .filter((f) => fs.existsSync(path.join(repo, f)));
}

/**
 * PERIMETER ① — the JavaScript that REACHES.
 * ⚠️ `test/` is out, MEASURED and not felt: a suite binds port 0 and connects
 *    to whatever the kernel handed back, so its literals name no rendezvous
 *    between components. Enrolling them would add ~40 declarations protecting
 *    nothing.
 */
function jsPerimeter() {
  return tracked().filter((f) => /^(src|tools)\//.test(f) && /[.](js|mjs|cjs)$/.test(f));
}

/** PERIMETER ② — the DECLARATIVE units, where an address is written as data. */
function dataPerimeter() {
  return tracked().filter((f) => /^service\/.*[.](service|socket|plist|xml)$/.test(f));
}

// ═══════════════════════════════════════════════════════════════════════
// DETECTION ① — the JavaScript atoms, RENDERED from the manifest
// ═══════════════════════════════════════════════════════════════════════
// 🛑 The rule is GENERATED so the detector and the policy are ONE truth and
//    cannot drift apart. What stops that from becoming an escape hatch is the
//    WITNESS table: an atom that detects nothing is RED, so a silently removed
//    or weakened atom is caught by the very mechanism that renders it.
// ⚠️ JSON is valid YAML 1.2, so the rule is emitted as JSON — a regex holding
//    quotes and backslashes then needs no hand-rolled escaping, which is
//    exactly the kind of detail that makes a rule silently match nothing.
function writeRule(dir, atoms) {
  const file = path.join(dir, 'rendezvous-literal.json');
  fs.writeFileSync(file, JSON.stringify({
    id: 'rendezvous-literal',
    language: 'JavaScript',
    severity: 'error',
    message: 'RENDEZVOUS LITERAL — declare it in `rendezvous-budget.json`.',
    rule: { any: atoms },
  }, null, 2));
  return file;
}

/**
 * @param {string[]} files
 * @param {object[]} [atoms]
 * @returns {{file: string, text: string}[]}
 */
function scanJs(files, atoms) {
  if (files.length === 0) return [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-rv-rule-'));
  let out = '';
  try {
    const rule = writeRule(dir, atoms || manifest.atoms.js);
    try {
      out = execFileSync(astGrepBinary(), ['scan', '-r', rule, '--json=compact'].concat(files), {
        cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
        // ⚠️ stderr CAPTURED: `ast-grep` writes "N error(s) found" on every scan,
        //    which would pour a fake ERROR into a GREEN run's output.
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e) {
      // `ast-grep scan` exits non-zero as soon as it finds an `error` match —
      // the NORMAL case here; the findings are on stdout.
      out = (e && e.stdout) || '';
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  let raw = [];
  try { raw = JSON.parse(out || '[]'); } catch { raw = []; }
  const all = raw.map((m) => ({
    file: String(m.file).split(SEP).join('/'),
    line: m.range.start.line,
    start: m.range.byteOffset.start,
    end: m.range.byteOffset.end,
    text: String(m.text).replace(/\s+/g, ' '),
  }));
  // ⚠️ CONTAINMENT DEDUP — an inner node inside an already-matched outer node is
  //    the SAME site seen by two atoms (`DEFAULT_HTTP_HOST = '127.0.0.1'` and
  //    `'127.0.0.1'`). Both are kept: losing an atom must stay visible, and a
  //    declaration per atom is what proves each one still bites. What is
  //    dropped is nothing — this function is the place a future dedup would go,
  //    and its absence is deliberate, stated here rather than discovered.
  return all.map((m) => ({ file: m.file, text: m.text }));
}

// ═══════════════════════════════════════════════════════════════════════
// DETECTION ② — the declarative units, comments STRIPPED per format
// ═══════════════════════════════════════════════════════════════════════
// ⚠️ Stripping is what replaces the parser we do not have. An XML comment holds
//    `127.0.0.1` in three of these files (they explain the very address they
//    declare) and an ini comment does the same — without this, the gate would
//    accuse prose, i.e. become noise, i.e. get disarmed.
/** @param {string} file @param {string} src @returns {string[]} */
function stripComments(file, src) {
  let s = src;
  if (/[.](xml|plist)$/.test(file)) {
    // Blank the comment BODY while preserving line count, so a reported line
    // number still points where a reader would look.
    s = s.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
  }
  return s.split('\n').map((l) => {
    if (/[.](service|socket)$/.test(file)) return l.replace(/^\s*[#;].*/, '');
    return l;
  });
}

/** @param {string[]} files @param {string[]} [patterns] @returns {{file: string, text: string}[]} */
function scanData(files, patterns) {
  const pats = (patterns || manifest.atoms.data).map((p) => new RegExp(p));
  const found = [];
  for (const f of files) {
    const lines = stripComments(f, fs.readFileSync(path.join(repo, f), 'utf8'));
    for (const line of lines) {
      // ⚠️ MATCHED ON THE TRIMMED LINE, which is also what is reported and what
      //    the declaration carries: indentation is not part of an address, and
      //    an atom anchored with `^` would otherwise silently match nothing in
      //    an indented XML document — a green seeing zero.
      const text = line.trim();
      if (pats.some((re) => re.test(text))) found.push({ file: f, text });
    }
  }
  return found;
}

// ═══════════════════════════════════════════════════════════════════════
// DETECTION ③ — the wiring manifest, walked STRUCTURALLY
// ═══════════════════════════════════════════════════════════════════════
// 🛑 STRUCTURAL AND NOT TEXTUAL, because this file is 90 % prose: its `_why_*`
//    keys hold paragraphs that quote `transport.port`, `127.0.0.1` and the word
//    host dozens of times. A regex here would be pure noise. Walking the tree
//    and skipping `_`/`$` keys reads the DECLARATION and nothing else — which is
//    what makes re-adding `transport.port` RED tomorrow.
/** @param {object} node @param {string} prefix @param {string[]} keys @param {{file: string, text: string}[]} out */
function walkManifest(node, prefix, keys, out) {
  if (!node || typeof node !== 'object') return;
  for (const [k, v] of Object.entries(node)) {
    if (k.startsWith('_') || k.startsWith('$')) continue;
    const at = prefix ? prefix + '.' + k : k;
    if (keys.includes(k)) out.push({ file: 'wiring.json', text: at });
    if (v && typeof v === 'object') walkManifest(v, at, keys, out);
  }
}

/** @param {object} [document] @returns {{file: string, text: string}[]} */
function scanManifest(document) {
  const doc = document || JSON.parse(fs.readFileSync(path.join(repo, 'wiring.json'), 'utf8'));
  const out = [];
  walkManifest(doc, '', manifest.atoms.manifestKeys, out);
  return out;
}

/** Everything this gate sees, in one list. */
function allOccurrences() {
  return scanJs(jsPerimeter()).concat(scanData(dataPerimeter())).concat(scanManifest());
}

// ═══════════════════════════════════════════════════════════════════════

test('GATE: every rendezvous literal is DECLARED, and every rendezvous agrees with itself', () => {
  const faults = verdict(allOccurrences(), manifest.sites, manifest.rendezvous, ORIGINS);
  assert.deepStrictEqual(faults, [],
    'RENDEZVOUS VIOLATION(S):\n  ' + faults.join('\n  ')
    + '\n\n🛑 An address is the one value whose divergence says NOTHING: the daemon'
    + '\n   listens here, the client knocks there, no error, no log, no badge.'
    + '\n   Declare it in `rendezvous-budget.json`, or resolve it from the single'
    + '\n   point every consumer already reads.');
});

test('ANTI-VACUITY: both perimeters and both families really see the repository', () => {
  // ⚠️ FOUR INDEPENDENT FLOORS. A gate analysing nothing goes green — paid three
  //    times here. Two perimeters can be emptied by two different accidents (a
  //    broken `git ls-files`, a path filter that stops matching), and a
  //    detection can break while both perimeters stay full.
  const js = jsPerimeter();
  const data = dataPerimeter();
  assert.ok(js.length >= manifest.floors.jsPerimeterFiles,
    'suspicious JS perimeter: ' + js.length + ' files, floor ' + manifest.floors.jsPerimeterFiles);
  assert.ok(data.length >= manifest.floors.dataPerimeterFiles,
    'suspicious data perimeter: ' + data.length + ' files, floor ' + manifest.floors.dataPerimeterFiles);

  const jsOcc = scanJs(js);
  const dataOcc = scanData(data);
  assert.ok(jsOcc.length >= manifest.floors.jsOccurrences,
    'suspicious JS scan: ' + jsOcc.length + ' literal(s), floor ' + manifest.floors.jsOccurrences
    + ' — the ATOMS are broken, not the repository');
  assert.ok(dataOcc.length >= manifest.floors.dataOccurrences,
    'suspicious data scan: ' + dataOcc.length + ' line(s), floor ' + manifest.floors.dataOccurrences
    + ' — the comment stripping or the atoms are broken, not the units');
  assert.ok(scanManifest().length >= 1,
    'the wiring manifest walk found NO address field at all — `transport.path` alone should answer');
});

test('ANTI-INERT: every atom of both families really DETECTS its witness', () => {
  // ⚠️ DERIVED FROM THE MANIFEST, never a list copied here: an atom added
  //    tomorrow enters this table by itself and stays RED until someone pairs it
  //    with a real line of code. That is the only form that holds in a
  //    repository written by agents and reviewed by nobody.
  const jsAtoms = manifest.atoms.js;
  const dataAtoms = manifest.atoms.data;
  assert.ok(jsAtoms.length >= 4 && dataAtoms.length >= 1,
    'no atom extracted from the manifest — this whole test would be vacuous');

  // ⚠️ THE OS TMPDIR, NOT a folder of the repo: `ast-grep` HONOURS `.gitignore`,
  //    and a witness written into an ignored folder is INVISIBLE (measured
  //    2026-08-06 here — the anti-inert test then wrongly accused every rule).
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-rv-witness-'));
  const blind = [];
  try {
    jsAtoms.forEach((atom, i) => {
      const witness = manifest.witnesses.js[i];
      if (typeof witness !== 'string' || witness === '') {
        blind.push('js atom #' + i + ' has NO witness: ' + JSON.stringify(atom));
        return;
      }
      const tmp = path.join(dir, 'w' + i + '.js');
      fs.writeFileSync(tmp, witness + '\n');
      if (scanJs([tmp], [atom]).length === 0) {
        blind.push('js atom #' + i + ' is INERT — witness NOT detected: ' + witness);
      }
    });
    dataAtoms.forEach((atom, i) => {
      const witness = manifest.witnesses.data[i];
      if (typeof witness !== 'string' || witness === '') {
        blind.push('data atom #' + i + ' has NO witness');
        return;
      }
      const tmp = path.join(dir, 'w' + i + '.socket');
      fs.writeFileSync(tmp, witness + '\n');
      // ⚠️ The path handed to `scanData` is repo-relative everywhere else; here
      //    the witness lives in the tmpdir, so it is read directly.
      const lines = stripComments(tmp, fs.readFileSync(tmp, 'utf8'));
      if (!lines.some((l) => new RegExp(atom).test(l))) {
        blind.push('data atom #' + i + ' is INERT — witness NOT detected: ' + witness);
      }
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  assert.deepStrictEqual(blind, [], 'INERT ATOM(S) — green while seeing NOTHING:\n  ' + blind.join('\n  '));
});

test('NEGATIVE: a FOURTH address written by hand turns this gate RED', () => {
  // ⚠️ IN MEMORY, on a fabricated occurrence — never on a real file: a sabotage
  //    on disk has already brought down 38 tests of other suites here.
  // 🔑 THIS IS THE WHOLE POINT OF THE GATE: the three defects of 2026-08-25 were
  //    each found by a human. A fourth, written in a file nobody thought of,
  //    must be caught by a machine.
  const real = allOccurrences();
  const sabotaged = verdict(
    real.concat([{ file: 'src/hooks/new-shell.js', text: "const METRICS_HOST = '127.0.0.1'" }]),
    manifest.sites, manifest.rendezvous, ORIGINS,
  );
  assert.ok(sabotaged.some((f) => f.startsWith('src/hooks/new-shell.js: UNDECLARED')),
    'SABOTAGE NOT DETECTED: a brand-new address would pass this gate.');
});

test('NEGATIVE: two sites of one rendezvous holding DIFFERENT values turn this gate RED', () => {
  // 🔑 The 2026-08-25 port defect, verbatim: one truth, two places, agreeing by
  //    luck. Here the two disagree, and nothing at runtime would have said so.
  const sites = {
    'src/declared-paths-pure.js': {
      'DEFAULT_HTTP_PORT = 8787': {
        count: 1, rendezvous: 'daemon-http-port', value: '8787', origin: 'resolved',
        why: 'the single resolution point the daemon and the generator both read',
      },
    },
    'service/ctxroute-http.socket': {
      'ListenStream=127.0.0.1:9001': {
        count: 1, rendezvous: 'daemon-http-port', value: '9001', origin: 'supervisor',
        why: 'the socket unit systemd binds under socket activation on Linux',
      },
    },
  };
  const occurrences = [
    { file: 'src/declared-paths-pure.js', text: 'DEFAULT_HTTP_PORT = 8787' },
    { file: 'service/ctxroute-http.socket', text: 'ListenStream=127.0.0.1:9001' },
  ];
  const faults = verdict(occurrences, sites, manifest.rendezvous, ORIGINS);
  assert.ok(faults.some((f) => f.startsWith('SPLIT ADDRESS on `daemon-http-port`')),
    'SPLIT NOT DETECTED: two spellings of one address would pass this gate.\n' + faults.join('\n'));

  // ⚠️ CONTROL — without the divergence the same shape is GREEN, or the cell
  //    above would be proving that everything is red rather than that this is.
  sites['service/ctxroute-http.socket'] = {
    'ListenStream=127.0.0.1:8787': {
      count: 1, rendezvous: 'daemon-http-port', value: '8787', origin: 'supervisor',
      why: 'the socket unit systemd binds under socket activation on Linux',
    },
  };
  const green = verdict(
    [occurrences[0], { file: 'service/ctxroute-http.socket', text: 'ListenStream=127.0.0.1:8787' }],
    sites, manifest.rendezvous, ORIGINS,
  );
  assert.deepStrictEqual(green, [], 'the CONTROL is red — this cell proves nothing:\n' + green.join('\n'));
});

test('NEGATIVE: an address MOVED leaves a dormant declaration, and that is RED', () => {
  // A permit whose literal has gone is a permit the next line of that shape
  // inherits for free, reason included — the shape every stale exemption takes.
  const faults = verdict([], manifest.sites, manifest.rendezvous, ORIGINS);
  assert.ok(faults.some((f) => f.includes('DORMANT DECLARATION')),
    'a declaration matching nothing at all would pass this gate.');
});

test('NEGATIVE: ast-grep ignores an address MENTIONED in a comment or a string', () => {
  // ⚠️ THIS is why AST and not regex, and it is not theoretical: `http-server.js`
  //    explains its own former port constant in prose, and three `service/` files
  //    describe the address they declare. A grep accuses every one of them.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-rv-mention-'));
  try {
    const tmp = path.join(dir, 'mention.js');
    fs.writeFileSync(tmp,
      '// the daemon used to hold 127.0.0.1 and a DEFAULT_PORT of its own\n'
      + '/* HOST = \'127.0.0.1\' lived right here until 2026-08-25 */\n'
      + 'module.exports = { note: 1 };\n');
    assert.deepStrictEqual(scanJs([tmp]), [],
      'ast-grep counted a MENTION as an address — the gate would be noise, and a noisy gate gets disarmed.');

    // ⚠️ ANTI-VACUITY OF THIS VERY CELL: the same scan must still SEE a real
    //    address in the same folder, or "found nothing" proves only that the
    //    scan is broken.
    const control = path.join(dir, 'control.js');
    fs.writeFileSync(control, "const HOST = '127.0.0.1';\nmodule.exports = { HOST };\n");
    assert.ok(scanJs([control]).length > 0, 'the control found nothing — the mention cell is vacuous');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('GATE: the manifest walk reads DECLARATIONS, never the prose around them', () => {
  // 🛑 `wiring.json` is mostly `_why_*` paragraphs that QUOTE `transport.port`,
  //    `127.0.0.1` and the word host many times over. Walking the tree and
  //    skipping `_`/`$` keys is what keeps this family at zero noise — and what
  //    makes a re-added `transport.port` red tomorrow.
  const withProse = scanManifest({
    _why_transport: 'it was transport.port and transport.host, on 127.0.0.1, until 2026-08-25',
    $schema: 'host port url',
    transport: { kind: 'http', path: '/pretool' },
  });
  assert.deepStrictEqual(withProse.map((o) => o.text), ['transport.path'],
    'the manifest walk read prose, or missed a declaration: ' + JSON.stringify(withProse));

  const reAdded = scanManifest({ transport: { kind: 'http', path: '/pretool', port: 8787 } });
  assert.ok(reAdded.some((o) => o.text === 'transport.port'),
    'a re-added `transport.port` is INVISIBLE — the 2026-08-25 defect could come straight back.');
});
