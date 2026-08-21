#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// CODEX SHELL — PreToolUse: output dialect of Codex CLI (≥ 0.144).
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ ALL the body lives in pretool-core.js (single source, shared with
//    doc-inject.js/Claude Code). This file = ONLY the Codex dialect.
//    Adding a feature here = wrong layer — STOP (cf skill §Porting).
//
// ⚠️ CODEX DIALECT (official documentation re-read on 19/07/2026):
//    - stdin: session_id/cwd/tool_name/tool_input — IDENTICAL to Claude Code,
//      WITHOUT agent_id → lib.scopeId (in porte-core) returns the simple key:
//      state SHARED between master and sub-agents, absorbed by construction. The day
//      OpenAI exposes agent_id, NO code to change.
//    - stdout: hookSpecificOutput.additionalContext + systemMessage = OK.
//    - `permissionDecision: "ask"` = "parsed but not supported yet". There
//      is nothing left to degrade: `ask` was REMOVED from the framework on
//      05/08/2026 (human escalation = anti 0-human, and a different meaning
//      depending on the harness). Do NOT reintroduce it for Codex "when it
//      handles it": `enforce`/`deny` covers the need, identically on both harnesses.
//    - `permissionDecision: "allow"`: DELIBERATELY OMITTED — we never grant
//      a permission in place of the harness, we only inform.
//
// ⚠️ Full FAIL-OPEN (porte-core); deadline armed BEFORE any I/O.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const { run, denyOutput, noticeOutput } = require('../pretool-core');
const { readStdinJson } = require('../stdin-json');
const lib = require('../lib-pure');

// ⚠️ `declaredBudget` lives in lib-pure.js (PURE, mutated 100 %) and not here: the
//    TWO Codex emitters need it, and a clone of an argument parser is
//    exactly what jscpd forbids. The shell only FORWARDS it.

// ⚠️ `output()` = THE DIALECT, PURE AND EXPORTED — exact symmetry with
//    `doc-inject.js` (54, 15/08/2026). It RETURNS the JSON, writes nothing and
//    kills nothing; `emit` below does the I/O. Extracted on 21/08/2026 because
//    the CLIENT lane needs the dialect WITHOUT the process: `client-core.js`
//    formats a local decision through it when no daemon answers. A twin written
//    for that purpose would drift from this one at the first change.
function output(decision, fullDoc, systemMessage) {
  if (decision === 'deny') return denyOutput(fullDoc);
  // ⚠️ NOTHING FOR THE AGENT, SOMETHING FOR THE HUMAN — the withholding notice
  //    (21/08/2026), SHARED with Claude Code (`pretool-core.noticeOutput`) for
  //    the same reason as `denyOutput`: the JSON is identical, and two copies of
  //    one dialect diverge. The usual envelope would carry an EMPTY
  //    `additionalContext` — an announcement that injects nothing while claiming
  //    to inject.
  if (!fullDoc) return noticeOutput(systemMessage);
  const out = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: fullDoc,
    },
  };
  if (systemMessage) out.systemMessage = systemMessage;
  return out;
}

function emit(decision, fullDoc, systemMessage) {
  // ⚠️ THE I/O, AND NOTHING ELSE (layer rule): the shell prints and exits, the
  //    dialect above decides the SHAPE. Merging them again is what made the
  //    format untestable without spawning a process.
  console.log(JSON.stringify(output(decision, fullDoc, systemMessage)));
  process.exit(0);
}

module.exports = { output };

// ⚠️ `require.main` GUARD (54) — SYMMETRY WITH `doc-inject.js`, AND IT BECAME
//    MANDATORY ON 21/08/2026: `client-core.js` imports this dialect, and without
//    the guard that import would ARM THE DEADLINE and START READING STDIN inside
//    another process. The hook itself is unchanged: when node launches this file,
//    the block below is still the first I/O.
if (require.main === module) {
  // ⚠️ Deadline BEFORE any I/O (bug #68626: 875 zombies on 15/07/2026 —
  //    same class of risk on Codex: stdin never closed = eternal process).
  require('../deadline').arm();
  readStdinJson(
    (data) => {
      // ⚠️ THE OUTPUT BELONGS TO THE SHELL (06/08/2026). `run` RETURNS when
      //    there is nothing to emit — it no longer kills the process (layer leak,
      //    same family as ⑩). When it emits, `emit` exits before this line.
      run(data, emit, { budget: lib.declaredBudget(process.argv) });
      process.exit(0);
    },
    () => process.exit(0)
  );
}
