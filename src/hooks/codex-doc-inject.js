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

// ⚠️ Deadline BEFORE any I/O (bug #68626: 875 zombies on 15/07/2026 —
//    same class of risk on Codex: stdin never closed = eternal process).
require('../deadline').arm();

const { run, denyOutput, noticeOutput } = require('../pretool-core');
const { readStdinJson } = require('../stdin-json');
const lib = require('../lib-pure');

// ⚠️ `declaredBudget` lives in lib-pure.js (PURE, mutated 100 %) and not here: the
//    TWO Codex emitters need it, and a clone of an argument parser is
//    exactly what jscpd forbids. The shell only FORWARDS it.

function emit(decision, fullDoc, systemMessage) {
  // ⚠️ `deny` (05/08/2026) — DIALECT IDENTICAL to Claude Code, unlike
  //    `ask`. Official Codex documentation: same JSON shape, "fully automatic —
  //    without requiring approval prompts" (no user interaction).
  //    VERIFIED IN THE INSTALLED BINARY (0.144.6, 05/08/2026):
  //    `permissionDecision` 5 occurrences, `permissionDecisionReason` 4,
  //    `"deny"` 4 — unlike `additionalContextLimit` (0 occurrences).
  //    A documented key is not necessarily in the installed version: we
  //    measure, we do not assume.
  if (decision === 'deny') {
    // ⚠️ OUTPUT SHARED with Claude Code (porte-core.denyOutput): both
    //    harnesses speak the same dialect here down to the word. Since the removal
    //    of `ask` (05/08/2026), it is the ONLY possible behavioural difference —
    //    all the rest is a bare injection, identical on both sides.
    console.log(JSON.stringify(denyOutput(fullDoc)));
    process.exit(0);
  }
  // ⚠️ NOTHING FOR THE AGENT, SOMETHING FOR THE HUMAN — the withholding notice
  //    (2026-08-21), SHARED with Claude Code (`pretool-core.noticeOutput`) for
  //    the same reason as `denyOutput`: the JSON is identical, and two copies of
  //    one dialect diverge. Emitting the usual envelope here would carry an
  //    EMPTY `additionalContext` — an announcement that injects nothing while
  //    claiming to inject.
  if (!fullDoc) {
    console.log(JSON.stringify(noticeOutput(systemMessage)));
    process.exit(0);
  }
  const out = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: fullDoc,
    },
  };
  if (systemMessage) out.systemMessage = systemMessage;
  console.log(JSON.stringify(out));
  process.exit(0);
}

readStdinJson(
  (data) => {
  // ⚠️ THE OUTPUT BELONGS TO THE SHELL (06/08/2026). `run` RETURNS when there
  //    is nothing to emit — it no longer kills the process (layer leak, same
  //    family as ⑯). When it emits, `emit` exits before this line.
    run(data, emit, { budget: lib.declaredBudget(process.argv) });
    process.exit(0);
  },
  () => process.exit(0)
);
