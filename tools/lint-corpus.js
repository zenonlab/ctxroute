#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// I/O SHELL OF THE LINT — reads the disk, NORMALISES, delegates to lint.js
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ The ONLY I/O point of the fleet audit. `lint.js` (pure) DECIDES, this
//    file only feeds it a state. Same separation as
//    legacy-mcp-inject.js / lib-pure.js — this is the CONDITION for mutating
//    the decision without noise, not a comfort.
//
// ⚠️ THE CENTRAL MAINTAINABILITY POINT — NORMALISATION lives HERE: this file
//    translates a doc into ONE uniform `declaration`, and `lint.js` ignores
//    where it comes from. That is what allowed changing the source WITHOUT
//    touching the core.
//    ⚠️ NEVER lift the notion "targeted by a rule" up into lint.js.
// 🛑 THESE LINES USED TO SAY "a trigger comes TODAY from
//    protected-paths.json, TOMORROW from its frontmatter" — fixed on
//    09/08/2026: the migration has been DONE since 27/07/2026. The
//    frontmatter is the UNIQUE source, `protected-paths.json` is an INERT
//    artefact nothing reads any more (the body of `collectDocs()` says so in
//    black and white 100 lines below: "NEVER go back to it"). The header
//    therefore taught the exact opposite of the file it introduces, to
//    whoever comes to modify it.
//
// ⚠️ DIAGNOSTIC, NOT A HOOK: it SCREAMS (exit ≠ 0) on ERROR. NEVER make it
//    fail-open like the hooks — a hook must be silent and non-blocking, a
//    diagnostic must shout. Opposite roles (cf doctor.js).
//
// Usage:
//   node lint-corpus.js                → level from the config (default warn)
//   node lint-corpus.js --level error  → override
//   node lint-corpus.js --quiet        → mute if healthy, screams on ERROR
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const fs = require('fs');
const path = require('path');
const { analyze, applyFilter, shouldScream, DEFAULT_LEVEL } = require('../src/lint');
const frontmatter = require('../src/frontmatter');
const { readCorpus } = require('../src/corpus');
const { rulesFromCorpus } = require('../src/loader');

// ⚠️ The FILE doc fleet lives at the user's home (~/.claude/hooks/), NOT in
//    this repo: the framework is PUBLIC, it must depend on NOBODY's home
//    path. Hence the env var + the relative default.
//    ⚠️ NEVER hardcode a maintainer path here.
function hooksDir() {
  return process.env.CTXROUTE_HOOKS_DIR || path.join(require('os').homedir(), '.claude', 'hooks');
}

function readJSON(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null; // ⚠️ absent/unreadable file = empty state, never a crash.
  }
}

// 🛑 `extraireRegles()` WAS DELETED HERE on 09/08/2026 — MEASURED DEAD CODE.
//    It tolerated the 2 roots of `protected-paths.json` (array or
//    `{rules:[…]}`), the 15/07 trap. But that JSON stopped being a rule
//    source on 27/07/2026: `collectDocs()` reads
//    `rulesFromCorpus(readCorpus())`, and the function had NO caller left
//    (grep over the whole repo).
//    ⚠️ The liveness probe further down, however, remains INDISPENSABLE: it
//    is what prevents a hollow harness from announcing "0 problem".
function listMdFiles(racine) {
  const out = [];
  const marcher = (d) => {
    let entrees;
    try {
      entrees = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entrees) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) marcher(f);
      else if (e.name.endsWith('.md')) out.push(path.relative(racine, f).split(path.sep).join('/'));
    }
  };
  marcher(racine);
  return out;
}

/**
 * ⚠️ THE NORMALISATION. Returns a uniform `declaration`, whatever the source
 *    of the trigger.
 *  - frontmatter present  → it is AUTHORITATIVE (post-migration world);
 *  - otherwise            → we REBUILD it from protected-paths.json
 *                           (today's world).
 * ⚠️ The returned shape is EXACTLY the one `frontmatter.validate()` judges:
 *    a single authority on "is this declaration sound?".
 */
function declarationOf(cheminAbs, cheminRel, reglesParDoc) {
  let texte = '';
  try {
    texte = fs.readFileSync(cheminAbs, 'utf8');
  } catch {
    return {};
  }
  const fm = frontmatter.parse(texte);
  if (fm.hasFrontmatter) return fm.data;

  const regles = reglesParDoc.get(cheminRel);
  if (!regles || !regles.length) return {}; // no trigger → validate() will say so
  const patterns = regles.map((r) => r.pattern).filter((p) => typeof p === 'string');
  const decl = { match: patterns.length === 1 ? patterns[0] : patterns };
  const premiere = regles[0];
  if (Array.isArray(premiere.scope) && premiere.scope.length) decl.scope = premiere.scope;
  if (Array.isArray(premiere.exclude) && premiere.exclude.length) decl.exclude = premiere.exclude;
  return decl;
}

/**
 * Does a doc carry a `[source: …]` tag HARDCODED in its body?
 *
 * ⚠️ THE ENGINE ADDS THAT TAG ITSELF on emission (`pretool-core.js`). Finding
 *    one in the FILE means a copy-paste of an injection — and the damage is
 *    visible nowhere: ① the doc arrives with its tag DUPLICATED; ② an agent
 *    READING this file drops a validly shaped label into the transcript, so
 *    the CANARY counts it as an injection that LANDED and stays GREEN even
 *    if the channel is DEAD (= ㉘ bis, measured on 08/08/2026).
 * 🛑 THIS IS THE FIX IN DATA, NOT IN THE ENGINE. The backlog planned to
 *    accept only labels REALLY emitted, which required a new state write in
 *    `emission-core` — the HOT path crossed by 12 processes on EVERY tool
 *    call of EVERY agent. The framework's extension contract says it: "a hole
 *    is fixed first in DATA, the engine as a LAST resort". 4 offending docs,
 *    0 line of engine.
 * 🛑 ANCHORED ON A WHOLE LINE — and this is NOT a style detail.
 *    My first pattern looked for the tag ANYWHERE in the text: it accused
 *    `canary.md` ON THE FIRST RUN on the real fleet, although that doc only
 *    EXPLAINS the marker ("the numerator no longer counts a bare
 *    `[source:`… `.md` as suffix or `skill/` as prefix"). **A doc that TALKS
 *    about the mechanism does not carry one.** The engine, for its part,
 *    always emits the tag ALONE ON ITS LINE: that is the signature of a
 *    copy-paste.
 *    ⚠️ NEVER re-widen this pattern "to be safe" — it would condemn the
 *    framework's documentation by itself, and a gate that accuses healthy
 *    content is the shortest path to a gate that gets disarmed.
 * ⚠️ The path shape is the one the canary accepts (`.md` / `skill/`): outside
 *    those two shapes no false green is possible, hence no defect to report.
 */
function hasSourceTag(cheminAbs) {
  let texte = '';
  try {
    texte = fs.readFileSync(cheminAbs, 'utf8');
  } catch {
    return false; // unreadable: the rest of the lint will say so, not this check
  }
  return texte.split(/\r?\n/).some((l) => /^\[source:\s*[^\]]+(\.md|skill\/[^\]]*)\]$/.test(l.trim()));
}

// ⚠️ The wired MCP servers live in SEVERAL files (.claude.json AND .mcp.json
//    — 16 unique ones measured on 15/07, 8 + 14 with overlap). Reading only
//    one = under-counting in silence, hence missing servers without a doc.
function mcpServers(home) {
  const noms = new Set();
  for (const f of ['.claude.json', '.mcp.json', path.join('.claude', 'settings.json')]) {
    const j = readJSON(path.join(home, f));
    for (const n of Object.keys((j && j.mcpServers) || {})) noms.add(n);
  }
  return [...noms];
}

function collectDocs() {
  const HOOKS = hooksDir();
  const DOCS = path.join(HOOKS, 'docs');
  const home = process.env.CTXROUTE_HOME || require('os').homedir();

  // ⚠️ UNIQUE SOURCE = THE FRONTMATTERS (27/07/2026). `protected-paths.json`
  //    was the truth of the OLD engine (`protect-files.js`), replaced by the
  //    single gate on 17/07 ⇒ the JSON is an INERT artefact. (NOTHING to do
  //    with Codex: its shells run on the NEW engine, hence on the
  //    frontmatters.) Reading it here would resurrect the double write
  //    sideways — the lint would demand a JSON entry for each doc, so the
  //    author would have to write twice again. NEVER go back to it: a doc
  //    declares its trigger in ITS frontmatter, in ONE single place.
  // ⚠️ Unreadable fleet (missing directory) = "I could not measure", NOT a
  //    stack trace: a diagnostic screams cleanly, the liveness probe below
  //    decides. A raw crash would be indistinguishable from a bug in the lint
  //    itself.
  let corpus = [];
  try {
    corpus = readCorpus(DOCS, 'docs/');
  } catch { /* left empty: the liveness probe takes care of it */ }
  const regles = rulesFromCorpus(corpus);

  // ⚠️ LIVENESS PROBE — a hollow harness triumphantly announces "0 problem".
  //    Mistake made twice on 15/07 (audit script filtering on `scope`, then
  //    `Array.isArray` on an object root). Without proof of having loaded
  //    something, a green result is worth NOTHING.
  if (!regles.length) {
    console.error(`🚨 lint-corpus: NO rule loaded from the frontmatters of ${DOCS}`);
    console.error('   The lint can prove NOTHING in this state (hollow harness). Check CTXROUTE_HOOKS_DIR.');
    process.exit(2);
  }

  const reglesParDoc = new Map();
  for (const r of regles) {
    if (!r || typeof r.doc !== 'string' || typeof r.pattern !== 'string') continue;
    if (!reglesParDoc.has(r.doc)) reglesParDoc.set(r.doc, []);
    reglesParDoc.get(r.doc).push(r);
  }

  const onDisk = listMdFiles(DOCS).map((rel) => `docs/${rel}`);
  const docs = onDisk.map((rel) => ({
    chemin: rel,
    declaration: declarationOf(path.join(HOOKS, rel), rel, reglesParDoc),
    tagSourceEnDur: hasSourceTag(path.join(HOOKS, rel)),
  }));

  // ⚠️ The mirror: a rule targeting a .md absent from the disk.
  const surDisqueSet = new Set(onDisk);
  const docsFantomes = [...reglesParDoc.keys()].filter((d) => !surDisqueSet.has(d));

  const config = readJSON(path.join(__dirname, '..', 'ctxroute-config.json')) || {};
  const docsMcpDir = path.join(__dirname, '..', 'docs', 'mcp');
  let serveursDocumentes = [];
  try {
    serveursDocumentes = fs
      .readdirSync(docsMcpDir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.replace(/\.md$/, ''));
  } catch {
    /* directory absent → no documented server, the lint will say so */
  }

  return {
    etat: {
      docs,
      docsFantomes,
      mcpServers: mcpServers(home),
      serveursDocumentes,
      // ⚠️ `filterList` IS the declaration "this server is deliberately
      //    without a doc" — we do not reinvent a 2nd field to say the same thing.
      serveursDeclares: Array.isArray(config.filterList) ? config.filterList : [],
    },
    niveau: (config.lint && config.lint.level) || DEFAULT_LEVEL,
    stats: { docs: docs.length, regles: regles.length },
  };
}

// ── Gate ─────────────────────────────────────────────────────────────
const QUIET = process.argv.includes('--quiet');
const iLevel = process.argv.indexOf('--level');
const { etat, niveau, stats } = collectDocs();
const findings = applyFilter(analyze(etat), iLevel !== -1 ? process.argv[iLevel + 1] : niveau);
const erreurs = findings.filter((c) => c.niveau === 'error').length;

if (!QUIET) {
  console.log(`fleet lint — ${stats.docs} docs, ${stats.regles} rules, ${etat.mcpServers.length} MCP servers\n`);
}
for (const c of findings) {
  const ligne = `  ${c.niveau === 'error' ? '✗' : '⚠'} [${c.code}] ${c.cible}\n      ${c.message}`;
  if (c.niveau === 'error') console.error(ligne);
  else if (!QUIET) console.log(ligne);
}

if (shouldScream(findings)) {
  // ⚠️ DELIBERATELY LOUD: the silence IS the bug we are hunting.
  console.error(`\n🚨 ${erreurs} DEAD doc(s) — they will NEVER be injected, and nobody would see it.`);
  process.exit(1);
}
if (!QUIET) console.log(findings.length ? `\n${findings.length} warning(s), 0 error` : '\n✅ healthy fleet');
