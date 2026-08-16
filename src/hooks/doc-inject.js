#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// UNIFIED GATE — SINGLE PreToolUse hook: FILE + MCP sources, dedup by DOC.
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ LIVE since 17/07/2026 (file switch then MCP merge on the same day).
//    Wired in settings.json; it is THIS that injects ALL the docs
//    (file via frontmatters, MCP via docs/mcp/) — protect-files.js only keeps
//    the security deny/ask, legacy-mcp-inject.js is REMOVED (cf REFACTOR-PLAN.md).
//
// ⚠️ EXTENSIBLE BY REGISTRY: the sources live in source-adapters.js
//    (adapter contract documented over there). Adding a source NEVER
//    EDITS this file — it iterates ADAPTERS, that is all.
//
// ⚠️ THE ONLY I/O POINT of the chain (with the adapters): corpus → match
//    (pure sources) → decision (gate.js) → stdout. All the logic is
//    PURE and mutated; this file only reads/locks/writes.
//
// ⚠️ protect-files PARITY REQUIRED on the migrated corpus (dumb):
//    same docs, same content (frontmatter removed via parse().body — single
//    source, never a copied regex), same output format, same label
//    [source: .claude/hooks/docs/…]. Sealed by pretool-differential.test.js.
//
// ⚠️ The gate NEVER reads .rush (sentinel file of protect-files.js).
//    Its replacement `confirm` was itself REMOVED on 05/08/2026: no
//    confirmation switch left, neither file nor config key.
//
// ⚠️ Full FAIL-OPEN (unreadable config/corpus/state → exit 0 without stdout),
//    EXCEPT the direction of the injection on a LOCK failure: we then decide
//    WITHOUT state (state = {}) rather than keeping silent — the old engine has
//    no state and always injects; keeping silent on contention = silent regression.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

// ⚠️ The deadline is armed in the `require.main` block at the bottom (54,
//    15/08/2026): in hook execution it stays armed BEFORE any I/O (the block is
//    the first I/O); a test `require` arms NOTHING — otherwise the fail-open
//    timer would kill the test runner in the middle of a long suite.

// ⚠️ Common body EXTRACTED into pretool-core.js (19/07/2026, Codex port):
//    this shell only keeps the Claude Code dialect — stdin + emit.
//    Any orchestration change is made IN pretool-core.js, never here.
const { run, denyOutput } = require('../pretool-core');
const { parseFrameArgs } = require('../lib-pure');
const { readStdinJson } = require('../stdin-json');

// Hook output — protect-files FORMAT IDENTICAL (switch parity).
// `systemMessage` is COMPUTED BY THE CALLER: file only = '📄 doc: …'
// (byte-identical to the old one), MCP = formatSystemMessage (badge
// '[ctxroute]', legacy-mcp-inject parity), mixed = both joined by ' · '
// (before the merge, TWO hooks emitted TWO messages — we keep them all).
// ⚠️ `output()` = THE DIALECT, PURE AND EXPORTED (54, 15/08/2026): it RETURNS
// the JSON, it writes nothing and kills nothing. Exported so that the
// in-process tests consume the REAL format instead of maintaining a twin of it
// (the class of bug this repo fights). The I/O (print + exit) stays in
// `emit`, the shell layer — never merged.
function output(decision, fullDoc, systemMessage) {
  // ⚠️ `deny` (05/08/2026) — the ONLY case where the gate stops the action.
  //    Official documentation: "blocks the tool call, and shows Claude the reason".
  //    The knowledge therefore goes out in `permissionDecisionReason`, NOT in
  //    `additionalContext`: the latter only arrives next to the RESULT, hence
  //    too late for the refused call. No user interaction.
  // ⚠️ The decision comes from gate.js and from IT ALONE (contract: a shell
  //    decides nothing, it translates). It is already guaranteed compatible with
  //    `once`, so the agent's 2nd call will pass — no loop.
  if (decision === 'deny') {
    // ⚠️ SHARED OUTPUT: the refusal JSON is identical on both harnesses.
    //    Duplicating it here would be a CLONE — jscpd saw it on 05/08/2026, and
    //    the porting contract forbids it. The DECISION, itself, comes from gate.js.
    return denyOutput(fullDoc);
  }
  // ⚠️ The `ask` branch was REMOVED on 05/08/2026 (with the `confirm` key).
  //    NEVER reintroduce it: `ask` asked a HUMAN for authorization,
  //    the opposite of 0-human, and did not exist on the Codex side. The only
  //    refusal of the framework is `deny` (above), automatic and identical everywhere.
  const out = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      additionalContext: fullDoc,
    },
  };
  if (systemMessage) out.systemMessage = systemMessage;
  return out;
}

function emit(decision, fullDoc, systemMessage) {
  console.log(JSON.stringify(output(decision, fullDoc, systemMessage)));
  process.exit(0);
}

module.exports = { output };

// ⚠️ CLAUDE CODE DIALECT — it is HERE, and NOWHERE else, that the core
//    learns that a multi-frame transport is possible (EXTENSION CONTRACT §7:
//    the engine NEVER reads a harness field).
//    · `tool_use_id` = invocation identifier, present on PreToolUse (official
//      documentation, verified on 03/08/2026). It allows the N PARALLEL processes
//      to share ONE decision: without it, each would consume the `once` docs
//      and frames 2..N would be empty.
//    · `--frame k --frames N` come from settings.json (the SAME script
//      declared N times — Claude Code deduplicates by command + args, so
//      different indices are NOT merged: official documentation 03/08/2026).
//    · Nothing declared ⇒ single frame ⇒ today's behaviour to the byte.
// ⚠️ `require.main` GUARD (54, 15/08/2026): the hook executes when NODE
//    launches it (settings.json wiring — behaviour UNCHANGED), but a `require`
//    from a test imports the dialect WITHOUT reading stdin or killing the runner.
if (require.main === module) {
  // ⚠️ Deadline BEFORE any I/O (bug #68626: 875 zombies on 15/07/2026).
  require('../deadline').arm();
  readStdinJson(
    (data) => {
      // ⚠️ THE OUTPUT BELONGS TO THE SHELL (06/08/2026). `run` RETURNS when
      //    there is nothing to emit — it no longer kills the process (layer leak,
      //    same family as ⑯: the life cycle is a shell decision).
      //    When it emits, `emit` terminates the process before this line.
      run(data, emit, {
        ...parseFrameArgs(process.argv),
        invocationId: typeof data.tool_use_id === 'string' ? data.tool_use_id : '',
      });
      process.exit(0);
    },
    () => process.exit(0)
  );
}
