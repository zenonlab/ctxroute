#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// SHADOW — the new engine runs on REAL traffic, its answer is THROWN AWAY.
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ THIS HOOK NEVER INJECTS ANYTHING. No `hookSpecificOutput`, no stdout.
//    It computes "which docs the NEW engine would have injected" (loader +
//    sources/file) and WRITES it into a JSONL log. Full stop.
//    Only protect-files.js (the old engine) injects during the shadow.
//    ⚠️ NEVER make it emit hook JSON "to test": that would be
//    the switch-over, which requires an explicit GO from the maintainer (REFACTOR-PLAN, step 3).
//
// ⚠️ ZERO RISK BY CONSTRUCTION = FULL FAIL-OPEN: any error (unreadable
//    corpus, broken JSON, full disk) → silent exit 0. A shadow that
//    blocks a tool call would have a power it must not have.
//
// ⚠️ ANALYSIS: the log (state/shadow-YYYY-MM-DD.jsonl, gitignored) is
//    re-read by `shadow-reconcile.js`, which replays the ORACLE (the real protect-files) on
//    each unique payload and reports the divergences. The comparison is OFFLINE
//    — never in the hot path (one oracle spawn per call would double prod).
// ═══════════════════════════════════════════════════════════════════════

'use strict';

// ⚠️ Deadline BEFORE any I/O (bug #68626: 875 zombies on 15/07/2026).
require('../deadline').arm();

const fs = require('fs');
const path = require('path');
const { readStdinJson } = require('../stdin-json');
const paths = require('../paths');
const { readCorpus } = require('../corpus'); // shared with doc-inject.js (the gateway)
const { rulesFromCorpus } = require('../loader');
const { matchingDocs } = require('../sources/file');

readStdinJson(
  (data) => {
    try {
      const toolName = data.tool_name;
      const toolInput = data.tool_input || {};
      if (typeof toolName !== 'string') return process.exit(0);

      const corpus = readCorpus(paths.fileDocsDir(), 'docs/');
      const rules = rulesFromCorpus(corpus);
      const docs = matchingDocs(rules, { toolName, toolInput }).map((d) => d.doc);

      // Append-only log, one file per day (natural size bound).
      // ⚠️ We ALSO log the non-matches ([]): "the new one stays silent where
      //    the old one speaks" is EXACTLY the divergence we are looking for.
      const jour = new Date().toISOString().slice(0, 10);
      const stateDir = paths.stateDir();
      fs.mkdirSync(stateDir, { recursive: true });
      fs.appendFileSync(
        path.join(stateDir, `shadow-${jour}.jsonl`),
        JSON.stringify({ ts: Date.now(), toolName, toolInput, docs }) + '\n'
      );
    } catch (e) {
      /* fail-open: the shadow has NO right to hinder prod */
    }
    process.exit(0);
  },
  () => process.exit(0)
);
