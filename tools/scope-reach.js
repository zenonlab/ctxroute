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
const path = require('path');
const { readCorpus } = require('../src/corpus');
const { rulesFromCorpus } = require('../src/loader');
// 🛑 THE DECISION LIVES IN `src/scope-reach-pure.js` AND IS MUTATED. This file is a
//    SHELL: it walks the disk and prints. Bringing the logic back here would take it
//    out of mutation — the violation `/stack-audit` caught on 2026-08-20.
const pur = require('../src/scope-reach-pure');
// ⚠️ SINGLE SOURCE OF EVERY ROOT THIS TOOL WALKS — the doc corpus AND the
//    transcript corpus. Required ONCE: two inline requires of one module is how
//    a second resolution eventually grows beside the first.
const paths = require('../src/paths');


/**
 * The tool names the harness REALLY called, read from its transcripts.
 * ⚠️ Returns `null` when there is no corpus to read — NOT an empty set.
 */
function observedToolNames(root) {
  if (!fs.existsSync(root)) return null;
  const itemNames = new Set();
  let files = 0;
  let octets = 0;
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!e.name.endsWith('.jsonl')) continue;
      files++;
      const text = fs.readFileSync(p, 'utf8');
      octets += text.length;
      for (const n of pur.toolNamesFrom(text)) itemNames.add(n);
    }
  };
  walk(root);
  // ⚠️ TRI-STATE: files read but ZERO tool name extracted means the transcript
  //    SHAPE changed, not that the harness called nothing. Reporting 0 would
  //    read as "no collision anywhere" — the false good news this repo refuses.
  if (files === 0 || itemNames.size === 0) return null;
  return { itemNames, files, octets };
}

function main() {
  // ⚠️ THE FLEET CORPUS IS ADDRESSED BY `paths.js`, NEVER REBUILT HERE.
  //    A second definition of the same directory diverges in silence — and this
  //    tool's whole value is that its measurement can be REPLAYED: replayed
  //    against another folder than the engine reads, it answers about nothing.
  const docsDir = paths.fileDocsDir();
  if (!fs.existsSync(docsDir)) {
    console.log('NOT MEASURED — no fleet corpus at ' + docsDir);
    process.exit(2);
  }
  const rules = rulesFromCorpus(readCorpus(docsDir, ''));

  let config = { skills: {} };
  const cfgPath = process.env.CTXROUTE_CONFIG_PATH || path.join(__dirname, '..', 'ctxroute-config.json');
  try { config = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch { /* absent = no skills */ }

  // ⚠️ THE TRANSCRIPT ROOT IS ADDRESSED BY `paths.js`, NEVER REBUILT HERE.
  //    Until 21/08/2026 this line assembled `~/.claude/projects` from
  //    `os.homedir()` with no env var at all — the SAME defect as the three
  //    hooks-root copies WI-VENDOR-PATH removed, on a different second segment.
  //    A component is never designated by a GUESSED address: two copies of one
  //    root diverge in silence, and a measurement replayed against a folder the
  //    harness does not write answers about nothing.
  const transcripts = paths.transcriptsDir();
  // 🛑 NAMED REFUSAL, never a silent fallback to a plausible directory: an
  //    unreachable corpus must say WHICH address was resolved and FROM WHERE, so
  //    the reader can tell "the harness stores transcripts elsewhere" from "this
  //    machine has none". Serving the wrong root is the failure this closes, and
  //    a wrong root here answers `0 collisions` — the false good news the
  //    tri-state exists to forbid.
  // ⚠️ Printing the ABSOLUTE path is DELIBERATE and is NOT the leak the fleet
  //    root has: this is an operator's own terminal, not a tracked file, not a
  //    published document and not an injected context. Never write it into one.
  if (!fs.existsSync(transcripts)) {
    console.log('NOT MEASURED — no transcript corpus at ' + transcripts);
    console.log('  (resolved by paths.transcriptsDir(); override CTXROUTE_TRANSCRIPTS_DIR)');
    console.log('The tool names cannot be derived, and this tool NEVER falls back to a');
    console.log('hand-written list (that is defect 48).');
    process.exit(2);
  }
  const measurement = observedToolNames(transcripts);
  if (!measurement) {
    // ⚠️ DISTINCT REASON, deliberately not merged with the one above: the folder
    //    EXISTS and yielded no tool call ⇒ the transcript SHAPE changed. Reading
    //    "no corpus" there would send the reader hunting for a missing directory.
    console.log('NOT MEASURED — transcript corpus at ' + transcripts + ' yielded no tool call.');
    console.log('The `"type":"tool_use"` anchor no longer matches: the shape changed, the');
    console.log('harness did not stop calling tools. NEVER report 0 here.');
    process.exit(2);
  }
  const tools = [...measurement.itemNames];

  const entrees = [];
  for (const r of rules) entrees.push(['doc:' + r.doc, r.scope]);
  for (const [itemName, e] of Object.entries(config.skills || {})) {
    entrees.push(['skill:' + itemName, e.scope]);
    for (const sr of (e.rules || [])) entrees.push(['skill:' + itemName + '/rule', sr.scope]);
  }

  let withScope = 0;
  const collisions = [];
  for (const [src, scope] of entrees) {
    const pats = pur.patterns(scope);
    if (!pats.length) continue;
    withScope++;
    for (const m of pats) {
      const touches = tools.filter((t) => pur.collides(m, t));
      if (touches.length) collisions.push({ src, motif: m, tools: touches });
    }
  }

  console.log('MEASURED on ' + measurement.files + ' transcript(s), '
    + Math.round(measurement.octets / 1e6) + ' MB, ' + tools.length + ' distinct tool names.');
  console.log('rules in the real corpus : ' + entrees.length);
  console.log('carrying a `scope`       : ' + withScope);
  console.log('patterns living INSIDE a real tool name : ' + collisions.length);
  for (const c of collisions) {
    console.log('  ' + c.src + '  pattern "' + c.motif + '"  ->  ' + c.tools.slice(0, 6).join(', '));
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
