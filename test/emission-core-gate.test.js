// ═══════════════════════════════════════════════════════════════════════
// GATE — EVERY CONTEXT EMITTER GOES THROUGH THE EMISSION LAYER
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ WHY THIS GATE EXISTS (05/08/2026, REFACTOR-PLAN ⑯). The transport
//    (budget · chunking · seal · queue) lived IN `pretool-core.js`, hence in
//    the orchestration of ONE SINGLE emitter. `session-inject.js` did not go through it
//    and went out in one block — guaranteed silent spill as soon as its corpus
//    grew. It was not an oversight but a SKELETON DEFECT: the
//    transport was a CALLER'S CHOICE, hence opt-in by copy-paste, hence a
//    hole that would have happened again with the 3rd emitter (PostCompact Codex,
//    SubagentStart, Stop… — 5 events already listed).
//
// ⚠️ EXTRACTING THE LAYER IS NOT ENOUGH. In a web framework you CANNOT
//    bypass the pipeline: you do not own the transport. Here we own
//    everything ⇒ the layer would stay OPTIONAL and we would only have moved the
//    problem. Only a MACHINE can enforce it. That is this file.
//
// ⚠️ DERIVED FROM THE CODE, NEVER A WRITTEN LIST: the gate SCANS the files that
//    write the `additionalContext` key and requires them to reach
//    `emission-core`. A FUTURE emitter is therefore covered the day it is
//    written, without anyone thinking to register it somewhere. A hardcoded list
//    would have exactly the defect we are fixing: it depends on vigilance.
//
// ⚠️ TRANSITIVE TRAVERSAL, and that is DELIBERATE: the harness shells
//    (`doc-inject.js`, `codex-doc-inject.js`) know only their output
//    dialect and delegate to `pretool-core.js`. Requiring a DIRECT import would
//    force them to import a layer they do not use — that is
//    exactly the coupling that layered architecture forbids.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const COUCHE = 'src/emission-core.js';

/**
 * DECLARED EXEMPTIONS — same doctrine as `ASYMETRIES_JUSTIFIEES`
 * (frontmatter.test.js): a derogation exists, it carries its WHY in
 * writing, and the INVERSE part makes it lethal as soon as it becomes obsolete.
 *
 * ⚠️ DO NOT ADD A LIVING EMITTER TO IT. The only acceptable reason is a
 *    file that NO LONGER emits (relic kept as an oracle): it must remain
 *    frozen at its original behaviour, otherwise it stops being an oracle.
 */
const EXEMPTIONS = {
  'src/hooks/legacy-mcp-inject.js':
    'RELIC UNWIRED on 17/07/2026, kept as the ORACLE of the differential. '
    + 'It MUST stay frozen at the behaviour from before the unified gate: adding '
    + 'the transport to it would destroy the only reference against which we '
    + 'prove parity. The doctor moreover requires its ABSENCE from the wiring.',
};

// Source files of the repo (root + sources/), excluding tests and node_modules.
function sourceFiles() {
  const out = [];
  for (const d of ['src', 'src/sources', 'src/hooks', 'tools']) {
    const abs = path.join(repo, d);
    if (!fs.existsSync(abs)) continue;
    for (const f of fs.readdirSync(abs)) {
      if (!f.endsWith('.js') || f.includes('.test.')) continue;
      out.push(path.join(d === '.' ? '' : d, f).replace(/\\/g, '/'));
    }
  }
  return out;
}

// ⚠️ THE KEY, NOT THE MENTION. `additionalContext:` in property position =
//    an EMISSION. The repo comments write `additionalContext` between
//    backticks — counting them would make files that emit nothing turn red
//    (doctor.js, gate.js…), and a gate that screams about healthy things is a gate
//    people end up unplugging.
function emitters() {
  return sourceFiles().filter((f) =>
    /additionalContext\s*:/.test(fs.readFileSync(path.join(repo, f), 'utf8'))
  );
}

// LOCAL requires of a file (`require('./x')`), resolved to a repo path.
function requiresLocaux(rel, source) {
  const dir = path.dirname(rel);
  const out = [];
  for (const m of source.matchAll(/require\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
    let target = path.posix.normalize(path.posix.join(dir === '.' ? '' : dir, m[1]));
    if (!target.endsWith('.js')) target += '.js';
    out.push(target);
  }
  return out;
}

// Does it reach the layer, directly or through its own requires?
function atteintLaCouche(rel, read) {
  const vus = new Set();
  const pile = [rel];
  while (pile.length > 0) {
    const cur = pile.pop();
    if (vus.has(cur)) continue;
    vus.add(cur);
    if (cur === COUCHE) return true;
    const src = read(cur);
    if (src === null) continue;
    for (const dep of requiresLocaux(cur, src)) pile.push(dep);
  }
  return false;
}

const lireReel = (rel) => {
  const abs = path.join(repo, rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
};

test('GATE: every file that writes `additionalContext` goes through emission-core', () => {
  const foundOnes = emitters();
  // Existence net: if the scan no longer finds anything, it is the GATE that is
  // broken (pattern changed, files moved), not the repo that has become pure.
  // A gate that turns green by looking at nothing is the worst of both worlds.
  assert.ok(foundOnes.length >= 3, `suspicious scan: ${foundOnes.length} emitter(s) found`);

  const fautifs = foundOnes.filter(
    (f) => !EXEMPTIONS[f] && !atteintLaCouche(f, lireReel)
  );
  assert.deepStrictEqual(
    fautifs,
    [],
    `These emitters compose their output WITHOUT going through ${COUCHE}:\n  `
      + fautifs.join('\n  ')
      + '\n⇒ their content goes into a silent spill as soon as it exceeds the frame.'
  );
});

test('GATE (inverse part): an obsolete exemption turns red', () => {
  const foundOnes = new Set(emitters());
  const staleOnes = Object.keys(EXEMPTIONS).filter((f) => !foundOnes.has(f));
  assert.deepStrictEqual(
    staleOnes,
    [],
    'Exemption(s) declared for a file that no longer emits: remove it.\n  '
      + staleOnes.join('\n  ')
  );
});

// ⚠️ NEGATIVE-CHECK MANDATORY — lesson of the `*-must-stay-pure` (03/08/2026),
//    which were documented everywhere as THE guarantee and could not
//    turn red. A gate that is not sabotaged is a gate presumed inert.
// ⚠️ THE SABOTAGE TOUCHES NO REAL FILE: we substitute the READER, in
//    memory. The 1st version of a negative-check in the repo wrote to disk and
//    made 38 tests of other suites fall which imported the file IN
//    PARALLEL.
test('NEGATIVE: an emitter deprived of the layer is DETECTED (gate not inert)', () => {
  const target = 'src/hooks/session-inject.js';
  assert.ok(emitters().includes(target), 'the target of the sabotage must be a real emitter');

  // In-memory copy, import of the layer REMOVED from the whole chain.
  const lireSabote = (rel) => {
    const src = lireReel(rel);
    if (src === null) return null;
    return src.replace(/require\(\s*['"](?:\.\.?\/)+emission-core['"]\s*\)/g, 'null');
  };

  assert.ok(atteintLaCouche(target, lireReel), 'witness: intact, the target reaches the layer');
  assert.strictEqual(
    atteintLaCouche(target, lireSabote),
    false,
    'SABOTAGE NOT DETECTED: the gate is INERT — it would turn green on an emitter without transport.'
  );
});

// ⚠️ THE PART "A CORE DOES NOT CALL process.exit" HAS MOVED (06/08/2026).
//    It lived here, written with a REGEX and a homemade de-commenting — which
//    the fleet doctrine explicitly forbids (AST, never regex: a
//    `process.exit` quoted in a comment is a false positive). It is
//    now A CELL of the capabilities × layers table: `layers-gate.test.js`
//    + `layers.json`, parsing by ast-grep. DO NOT reintroduce it here: two
//    tools for one same invariant diverge — that is the implicit coupling that
//    this whole repo fights.
