// ═══════════════════════════════════════════════════════════════════════
// GATE — THE CAPABILITIES × LAYERS TABLE (06/08/2026)
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ WHY THIS FILE EXISTS. Three architecture defects in three days —
//    transport orchestrated inside a single emitter, `process.exit` in two
//    shared cores, `console.log` in guard-core. Two were found by a human
//    review, that is to say by CHANCE. Now this repository is written by
//    agents and reviewed by nobody: a guardrail depending on someone's eyes
//    does not exist.
//
// ⚠️ THE REVERSAL. We no longer write a gate PER DISCOVERED FAULT (reactive,
//    hence endless): we declare what each layer has the RIGHT to do. The
//    three defects above are three CELLS of this table — they would not have
//    been "caught", they would have been IMPOSSIBLE. And what a program can
//    do is a FINITE list (kill the process, write the output, read the
//    environment, read the arguments…): the table is filled once, it is not
//    discovered bug by bug. Same reasoning as the OR/AND/NOT boolean base of
//    matching: a closed base, not an open list.
//
// ⚠️ AST, NEVER REGEX — a fleet rule, and it is justified here: a
//    `process.exit` CITED in a comment or a string is a false positive.
//    The parsing comes from `ast-grep` (`files`/`ignores`/`severity`
//    confirmed against the official doc on 06/08/2026 — ⚠️
//    `ast-grep.github.io` REDIRECTS with a 301 to `astgrep.com`, the old URL
//    lingers in every tutorial).
//    The first draft of this gate was regex-based with homemade
//    comment-stripping: exactly what the doctrine forbids.
//
// ⚠️ THE IMPORTS ARE NOT HERE. `fs`, `path`, `child_process`, the harness
//    modules = dependency graph = `dependency-cruiser`, ALREADY in place.
//    Duplicating them here would make two tools for one invariant, hence a
//    guaranteed divergence. This gate covers ONLY what a graph cannot see.
//    (Checked on 06/08/2026: eslint-plugin-boundaries and Sheriff also do
//    MODULE boundaries — so nothing more than dependency-cruiser here, at the
//    price of a new dependency. Discarded.)
//
// ⚠️ WHAT THIS GATE DOES NOT CLAIM TO DO: find a logic bug, a false invariant
//    or a bad product choice. That is the job of the tests and of mutation.
//    It closes ONE class — the one that escapes everything else.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEP = String.fromCharCode(92);
const manifest = JSON.parse(fs.readFileSync(path.join(repo, 'layers.json'), 'utf8'));

// ⚠️ THE PURE CORE IS DERIVED FROM `stryker.conf.json`, NOT COPIED. That file
//    already declares "ALL the PURE modules" and it is the authority: a 2nd
//    list would diverge, and that is precisely the implicit coupling this
//    whole repository fights. Adding a pure module to Stryker protects it
//    here automatically — no gesture to forget.
function pureCore() {
  const conf = JSON.parse(fs.readFileSync(path.join(repo, 'stryker.conf.json'), 'utf8'));
  return new Set(conf.mutate);
}

// A file's layer. ⚠️ MEANINGFUL ORDER: from the most constrained to the most
// permitted. A file never belongs to two layers — the first match wins.
function layerOf(rel, pure) {
  if (pure.has(rel)) return 'pure-core';
  if (/-core\.js$/.test(rel)) return 'shared-core';
  return 'shell';
}

function allowedFor(layer) {
  const c = manifest.layers.find((x) => x.name === layer);
  return new Set(c ? c.allowed : []);
}

// Scanned files: repository sources only. The TESTS are outside the table
// (they orchestrate spawns, write, exit — that is their job).
function relevant(rel) {
  return rel.endsWith('.js')
    && !rel.includes('node_modules')
    && !rel.includes('.test.')
    && !rel.startsWith('reports/')
    && !rel.startsWith('coverage/');
}

// ⚠️ THE BINARY DIRECTLY, NEVER `npx` NOR A SHELL (fixed on 06/08/2026, CI RED
//    on the first push). With `shell: true`, the command is handed to the
//    system interpreter: under `cmd` (Windows) it works, under `/bin/sh`
//    (Linux, hence the CI) the PARENTHESES of `process.exit($$$)` are a syntax
//    error — `/bin/sh: Syntax error: "(" unexpected`. The scan therefore
//    returned ZERO results and the gate would have gone GREEN WHILE BLIND.
// ⚠️ IT IS THE "EXISTENCE" PART THAT CAUGHT THIS, not a human: it refused to
//    be green with an empty scan. NEVER remove it as a duplicate.
// ⚠️ WIDER LESSON: a measurement made on ONE machine proves nothing. The
//    local run reads the real config of the workstation, the CI a fresh clone
//    on another OS.
function astGrepBinary() {
  const name = process.platform === 'win32' ? 'ast-grep.exe' : 'ast-grep';
  const bin = path.join(repo, 'node_modules', '@ast-grep', 'cli', name);
  // ⚠️ LOUD FAILURE, never an empty scan: a gate that finds nothing because
  //    its TOOL is missing would go green while blind. Same class as the
  //    inert `*-must-stay-pure` rules — the worst of both worlds.
  if (!fs.existsSync(bin)) {
    throw new Error('ast-grep NOT FOUND (' + bin + ') — the layers gate cannot judge. `npm ci`.');
  }
  return bin;
}

// ⚠️ TWO FORMS, AND THE CHOICE IS NOT COSMETIC (measured on 06/08/2026):
//    · `pattern` — enough for an expression (`process.exit($$$)`).
//    · `rule` — MANDATORY as soon as an object PROPERTY is targeted. The
//      pattern `{ shell: true }` only finds the object with a single
//      property: the real case `{ encoding: 'utf8', shell: true, maxBuffer: N }`
//      escapes it, and `$$$` does not catch it either. A `kind: pair` rule
//      catches all 3 forms.
//    🛑 A pattern where a rule is needed = an INERT rule, green while blind.
//       That is precisely what this gate exists to make impossible — hence
//       the sabotage VERIFICATION further down, on each capability.
function scanArgs(def, target) {
  const base = def.pattern
    ? ['run', '--pattern', def.pattern, '--lang', 'js', '--json=compact']
    : ['scan', '--inline-rules',
        ['id: layer-capability', 'language: JavaScript', 'severity: error', 'rule:']
          .concat(def.rule.map((l) => '  ' + l)).join('\n'),
        '--json=compact'];
  return target ? base.concat([target]) : base;
}

/**
 * @param {object} def  capability (pattern OR rule)
 * @param {string} [target]  ABSOLUTE path to scan; absent ⇒ the whole repository.
 *
 * ⚠️ `ast-grep` HONOURS `.gitignore` (measured on 06/08/2026, 3rd blindness of
 *    the day). The witnesses written into `state/` — ignored — were therefore
 *    INVISIBLE, and the anti-inert test wrongly accused all 5 capabilities.
 *    They now live in the OS tmpdir, out of reach of any `.gitignore`.
 *    🛑 Consequence to remember: if someone one day gitignores a SOURCE
 *    folder, this gate would go blind on it WITHOUT SAYING A WORD. It is the
 *    "existence" part that would catch it — never remove it.
 */
function occurrences(def, target) {
  let out = '';
  try {
    out = execFileSync(astGrepBinary(), scanArgs(def, target), {
      cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    out = (e && e.stdout) || '';
  }
  let r = [];
  try { r = JSON.parse(out || '[]'); } catch { r = []; }
  const relatives = [];
  for (const m of r) {
    let rel = String(m.file).split(SEP).join('/');
    // Explicit target (witness outside the repository): return the path as-is.
    if (target) { relatives.push(rel); continue; }
    if (rel.startsWith(repo.split(SEP).join('/'))) rel = rel.slice(repo.length + 1);
    if (relevant(rel)) relatives.push(rel);
  }
  return [...new Set(relatives)];
}

test('GATE: no layer exercises a capability it does not have', () => {
  const pure = pureCore();
  const faults = [];
  for (const [cap, def] of Object.entries(manifest.capabilities)) {
    for (const rel of occurrences(def)) {
      const layer = layerOf(rel, pure);
      if (allowedFor(layer).has(cap)) continue;
      if (manifest.justifications[rel + '/' + cap]) continue;
      faults.push(`${rel} [${layer}] cannot "${def.label}" (${cap}) — ${def.why}`);
    }
  }
  assert.deepStrictEqual(
    faults.sort(), [],
    'LAYER TABLE VIOLATION(S):\n  ' + faults.sort().join('\n  ')
      + '\n\n🛑 Widening `layers.json` is ALMOST ALWAYS the wrong answer.'
      + '\n   The file is in the wrong layer, or it does work that does not'
      + '\n   belong to it. Fix the FILE, not the table.'
  );
});

// ═══════════════════════════════════════════════════════════════════════
// ⚠️ THE GUARANTEE THAT HOLDS EVERYTHING ELSE: NO RULE CAN BE INERT
// ═══════════════════════════════════════════════════════════════════════
// The most DANGEROUS defect of this repository is not a red gate, it is a
// gate that is GREEN WHILE SEEING NOTHING. It happened twice on 06/08/2026:
//   ① `shell: true` made the scan return EMPTY under `/bin/sh` (CI red);
//   ② the pattern `{ shell: true }` did NOT find `{ encoding, shell: true, … }`,
//      that is to say the EXACT form that had just caused ①.
// In both cases, the rule "existed" and protected NOTHING.
// ⇒ EACH capability carries a WITNESS: a real line of code it MUST detect.
//   We write it to disk, we scan, we require the detection.
// ⚠️ DERIVED from the manifest: a capability ADDED tomorrow is covered the day
//   it is written, without anyone having to think about it. That is the only
//   form that holds in a repository written by agents and reviewed by nobody.
// ⚠️ The witness MUST be the REAL form encountered, never a simplified
//   textbook case — otherwise it proves the detection of a case that does not
//   happen.
test('ANTI-INERT: each capability really DETECTS its witness', () => {
  // ⚠️ OUTSIDE THE REPOSITORY, and that is not a detail: `ast-grep` honours
  //    `.gitignore`. Written into `state/` (ignored), the witnesses were
  //    INVISIBLE and this test accused all 5 capabilities of being inert while
  //    they worked. The OS tmpdir escapes any ignore rule — and does not
  //    pollute the working tree.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-witnesses-'));
  const blind = [];
  const withoutWitness = [];
  try {
    for (const [cap, def] of Object.entries(manifest.capabilities)) {
      if (typeof def.witness !== 'string' || def.witness === '') { withoutWitness.push(cap); continue; }
      const tmp = path.join(dir, 'witness-' + cap + '.js');
      fs.writeFileSync(tmp, def.witness + '\n');
      const seen = occurrences(def, tmp).length > 0;
      if (!seen) blind.push(cap + ' — witness NOT detected: ' + def.witness);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  assert.deepStrictEqual(withoutWitness, [], 'Capability(ies) WITHOUT a witness — impossible to prove they see anything at all: ' + withoutWitness.join(', '));
  assert.deepStrictEqual(
    blind, [],
    'INERT RULE(S) — they go green while seeing NOTHING:\n  ' + blind.join('\n  ')
      + '\n⇒ a `pattern` is not enough for an object PROPERTY: switch to `rule` (kind: pair).'
  );
});

test('GATE (existence): the scan does see code', () => {
  // ⚠️ A gate that analyses NOTHING goes green: that is the worst of both
  //    worlds. Lived through with the `*-must-stay-pure` rules, inert for
  //    months. `process.exit` necessarily exists — every shell has one.
  assert.ok(occurrences({ pattern: 'process.exit($$$)' }).length >= 5,
    'suspicious scan: ast-grep finds almost nothing, the GATE is broken (not the repository)');
});

test('GATE (reverse part): a stale justification goes red', () => {
  // Same doctrine as `ASYMETRIES_JUSTIFIEES`: a waiver that is no longer used
  // must DIE, otherwise the table widens forever, in silence.
  const pure = pureCore();
  const stale = [];
  for (const key of Object.keys(manifest.justifications)) {
    const i = key.lastIndexOf('/');
    const rel = key.slice(0, i);
    const cap = key.slice(i + 1);
    const def = manifest.capabilities[cap];
    if (!def) { stale.push(key + ' (unknown capability)'); continue; }
    if (allowedFor(layerOf(rel, pure)).has(cap)) { stale.push(key + ' (already allowed by its layer)'); continue; }
    if (!occurrences(def).includes(rel)) stale.push(key + ' (the file no longer does that)');
  }
  assert.deepStrictEqual(stale, [], 'STALE justification(s), to be removed:\n  ' + stale.join('\n  '));
});

// ⚠️ MANDATORY NEGATIVE-CHECK — a gate that has not been sabotaged is a gate
//    presumed INERT (lesson of the `*-must-stay-pure`, 03/08/2026). IN-MEMORY
//    sabotage: we NEVER write into a real file, a 1st version did and 38 tests
//    of other suites fell.
test('NEGATIVE: a capability exercised without the right is DETECTED', () => {
  const pure = new Set(['src/gate.js']);
  assert.strictEqual(layerOf('src/gate.js', pure), 'pure-core');
  assert.strictEqual(allowedFor('pure-core').has('exit'), false,
    'SABOTAGE NOT DETECTED: the pure core would have the right to kill the process.');

  assert.strictEqual(layerOf('pretool-core.js', pure), 'shared-core');
  assert.strictEqual(allowedFor('shared-core').has('stdout'), false,
    'SABOTAGE NOT DETECTED: a shared core would have the right to write the output.');

  // The shell, however, MUST be able to: without that the gate would be red
  // everywhere and would end up unplugged — a gate that screams at healthy
  // code no longer protects anything.
  assert.strictEqual(layerOf('doc-inject.js', pure), 'shell');
  assert.strictEqual(allowedFor('shell').has('exit'), true);
});

test('NEGATIVE: ast-grep ignores a MENTION in a comment or a string', () => {
  // ⚠️ THIS is the reason for AST over regex. The 1st draft of this gate was
  //    regex-based with homemade comment-stripping — fragile and forbidden by
  //    the fleet rules.
  const tmp = path.join(repo, 'state', '.tmp-layers-negative.js');
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  fs.writeFileSync(tmp, "// process.exit(0) in a comment\nconst s = 'process.exit(0)';\nmodule.exports = s;\n");
  try {
    const found = occurrences({ pattern: 'process.exit($$$)' });
    assert.ok(!found.some((f) => f.endsWith('.tmp-layers-negative.js')),
      'ast-grep counted a MENTION as a call — the gate would produce false positives.');
  } finally {
    fs.unlinkSync(tmp);
  }
});
