#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// WRITE GUARD — PostToolUse hook (Write|Edit): REAL-TIME feedback
// to the agent that has just written a doc of the fleet.
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ CONTRACT (maintainer's decision 17/07/2026): HEALTHY doc = TOTAL SILENCE (zero
//    context pollution); BROKEN doc = `decision: "block"` + reason →
//    the agent is informed WITHIN ITS OWN TURN and fixes it immediately, instead of
//    learning about it at the next startup (lint) or at the push (gates). The three
//    nets coexist: real time (here) / session (lint) / push (CI).
//
// ⚠️ The VALIDATION is DELEGATED to frontmatter.js (validate / validateMcp) —
//    the only authority, never re-judged here (2 pieces of code for 1 judgement = drift).
//    Session docs: nothing to validate by construction (every .md is injected).
//
// ⚠️ Full FAIL-OPEN: file unreadable/deleted/outside the fleet → silent exit 0.
//    A hook NEVER blocks the work because of its own breakdown.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

require('../deadline').arm();

// ⚠️ Common body EXTRACTED into guard-core.js (19/07/2026, Codex port):
//    this shell only keeps the Claude Code extraction (file_path directly).
const { run } = require('../guard-core');
const { readStdinJson } = require('../stdin-json');

readStdinJson(
  (data) => {
    const filePath = (data.tool_input || {}).file_path;
    // ⚠️ THE OUTPUT BELONGS TO THE SHELL (06/08/2026, cf guard-core): the
    //    core RETURNS a verdict (`null` = nothing to report), it writes neither to
    //    stdout nor to the process. Layer leak closed — 3rd instance of
    //    the same family, found by the capability scan, not by eye.
    const verdict = run(typeof filePath === 'string' ? [filePath] : []);
    if (verdict) console.log(JSON.stringify(verdict));
    process.exit(0);
  },
  () => process.exit(0)
);
