#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// scope-reach.js — "would widening `scope` onto the TOOL NAME touch the fleet?"
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 WHY THIS TOOL EXISTS (2026-08-20, born of work item 59). The decision "should
//    `scope` share `exclude`'s universe?" was settled by a measurement — and that
//    measurement lived in a throwaway script. The backlog then claimed it was
//    "reproducible in 3 minutes", which is a promise that rots. **A decision whose
//    evidence cannot be replayed is a decision nobody can revisit.**
//
// 🔴 AND THE PROTOCOL HAD NAMED THE WRONG INSTRUMENT: the file differential compares
//    the `file` source against the frozen oracle — precisely the source where the
//    delta of that widening is ZERO. It would have measured NOTHING and said "green".
//    This tool exists so the next agent reaches for the right one.
//
// 🛑 THE TOOL NAMES ARE MEASURED, NEVER LISTED. Writing them by hand would be the
//    enumeration-born-stale defect (㊽) committed inside the very tool meant to expose
//    it — the first version of this measurement did exactly that. They are DERIVED
//    from the real transcripts the harness writes.
// ⚠️ TRI-STATE: no transcript corpus (fresh clone, another machine) ⇒ NOT MEASURED,
//    never "0 tool names" — a zero would read as "nothing collides", the exact
//    false good news this repo refuses.
// ⚠️ READ-ONLY, zero state written, off the hot path. It INFORMS, it does not GATE:
//    whether a collision is parasitic is a JUDGEMENT, and a gate that judges intent
//    produces noise, then gets bypassed.
//
// USAGE: node tools/scope-reach.js
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { readCorpus } = require('../src/corpus');
const { rulesFromCorpus } = require('../src/loader');
// 🛑 THE DECISION LIVES IN `src/scope-reach-pure.js` AND IS MUTATED. This file is a
//    SHELL: it walks the disk and prints. Bringing the logic back here would take it
//    out of mutation — the violation `/stack-audit` caught on 2026-08-20.
const pur = require('../src/scope-reach-pure');


/**
 * The tool names the harness REALLY called, read from its transcripts.
 * ⚠️ Returns `null` when there is no corpus to read — NOT an empty set.
 */
function observedToolNames(root) {
  if (!fs.existsSync(root)) return null;
  const noms = new Set();
  let fichiers = 0;
  let octets = 0;
  const parcourir = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { parcourir(p); continue; }
      if (!e.name.endsWith('.jsonl')) continue;
      fichiers++;
      const texte = fs.readFileSync(p, 'utf8');
      octets += texte.length;
      for (const n of pur.toolNamesFrom(texte)) noms.add(n);
    }
  };
  parcourir(root);
  // ⚠️ TRI-STATE: files read but ZERO tool name extracted means the transcript
  //    SHAPE changed, not that the harness called nothing. Reporting 0 would
  //    read as "no collision anywhere" — the false good news this repo refuses.
  if (fichiers === 0 || noms.size === 0) return null;
  return { noms, fichiers, octets };
}

function main() {
  // ⚠️ THE FLEET CORPUS IS ADDRESSED BY `paths.js`, NEVER REBUILT HERE.
  //    A second definition of the same directory diverges in silence — and this
  //    tool's whole value is that its measurement can be REPLAYED: replayed
  //    against another folder than the engine reads, it answers about nothing.
  const docsDir = require('../src/paths').fileDocsDir();
  if (!fs.existsSync(docsDir)) {
    console.log('NOT MEASURED — no fleet corpus at ' + docsDir);
    process.exit(2);
  }
  const regles = rulesFromCorpus(readCorpus(docsDir, ''));

  let config = { skills: {} };
  const cfgPath = process.env.CTXROUTE_CONFIG_PATH || path.join(__dirname, '..', 'ctxroute-config.json');
  try { config = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch { /* absent = no skills */ }

  const mesure = observedToolNames(path.join(os.homedir(), '.claude', 'projects'));
  if (!mesure) {
    console.log('NOT MEASURED — no transcript corpus. The tool names cannot be derived,');
    console.log('and this tool NEVER falls back to a hand-written list (that is defect 48).');
    process.exit(2);
  }
  const outils = [...mesure.noms];

  const entrees = [];
  for (const r of regles) entrees.push(['doc:' + r.doc, r.scope]);
  for (const [nom, e] of Object.entries(config.skills || {})) {
    entrees.push(['skill:' + nom, e.scope]);
    for (const sr of (e.rules || [])) entrees.push(['skill:' + nom + '/rule', sr.scope]);
  }

  let avecScope = 0;
  const collisions = [];
  for (const [src, scope] of entrees) {
    const pats = pur.patterns(scope);
    if (!pats.length) continue;
    avecScope++;
    for (const m of pats) {
      const touches = outils.filter((t) => pur.collides(m, t));
      if (touches.length) collisions.push({ src, motif: m, outils: touches });
    }
  }

  console.log('MEASURED on ' + mesure.fichiers + ' transcript(s), '
    + Math.round(mesure.octets / 1e6) + ' MB, ' + outils.length + ' distinct tool names.');
  console.log('rules in the real corpus : ' + entrees.length);
  console.log('carrying a `scope`       : ' + avecScope);
  console.log('patterns living INSIDE a real tool name : ' + collisions.length);
  for (const c of collisions) {
    console.log('  ' + c.src + '  pattern "' + c.motif + '"  ->  ' + c.outils.slice(0, 6).join(', '));
  }
  if (collisions.length) {
    console.log('');
    console.log('=> Each line is a rule whose `scope` would START being satisfied by the mere NAME');
    console.log('   of a tool if `scope` were given the universe of `exclude`. Whether that is');
    console.log('   LEGITIMATE (the author meant the tool) or PARASITIC (they meant a path) is a');
    console.log('   JUDGEMENT — read the rule. On 2026-08-20 the single hit was parasitic and the');
    console.log('   widening was REFUSED (REFACTOR-PLAN 59).');
  }
}

if (require.main === module) main();
module.exports = { observedToolNames };
