#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// SESSION GATE — SessionStart hook: injects docs/session/*.md at EVERY
// session start (startup/resume/clear/compact), like CLAUDE.md.
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ SISTER GATE of doc-inject.js, NEVER merged with it: SessionStart
//    and PreToolUse are two events with different output contracts.
//    The ENGINE is shared (corpus.js + pure sources/session.js); only
//    this shell speaks the SessionStart dialect of Claude Code.
//
// ⚠️ THE ONLY I/O POINT of its chain: read corpus → pure decision
//    (sources/session.js) → stdout. ZERO logic here.
//
// ⚠️ Full FAIL-OPEN: folder absent, corpus unreadable, malformed stdin,
//    unreadable config → exit 0 without stdout. A hook that crashes blocks the
//    session startup — never acceptable. (Its liveness is covered
//    by doctor.js, dead-man pattern: fail-open here, screaming over there.)
//
// ⚠️ NO CADENCE STATE: unconditional injection at every SessionStart
//    — that is the "like CLAUDE.md" contract (no dedup, the compaction empties
//    the context so re-injection is the GOAL). The only state touched here is
//    the EMISSION QUEUE, which is not a cadence but transport.
//
// ⚠️ TRANSPORT (05/08/2026, REFACTOR-PLAN ⑯/⑮) — THIS HOOK HAD NONE.
//    It went out in one block: no seal, no chunking, no queue. It "worked"
//    ONLY because `docs/session/` weighed ~1.2 KB — static sizing,
//    exactly what the queue has eliminated everywhere else. The day
//    someone puts a real document there, it went into a spill file
//    SILENTLY, without a seal hence without any truncation detection.
//    It now goes through `emission-core.js` like every emitter.
//
// ⚠️ ONE SINGLE FRAME HERE, DELIBERATELY (`nbFrames: 1`). Multi-frame mode
//    requires knowing whether the harness really spawns N times a SessionStart hook
//    declared N times — that is NOT measured (dedup by command + args is
//    only proven on PreToolUse). We do not reverse-engineer: with one frame,
//    chunking still delivers EVERYTHING, simply more slowly. Going to N
//    is a setting, not a redesign — but it requires the measurement first.
//
// ⚠️ THE QUEUE IS SHARED WITH THE PreToolUse GATE, AND THAT IS THE KEY POINT:
//    at SessionStart there is no "next action" in which to drain a remainder.
//    The common store (same prefix, same agent scope) means that what this
//    gate could not deliver is picked up by the PreToolUse gate at the VERY
//    FIRST tool call. NEVER give it a private queue.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

// ⚠️ Deadline BEFORE any I/O (bug #68626: 875 zombies on 15/07/2026).
require('../deadline').arm();

const fs = require('fs');
const path = require('path');
const lib = require('../lib-pure');
const { readCorpus } = require('../corpus');
const { sessionDocs } = require('../sources/session');
const { readStdinJson } = require('../stdin-json');
const paths = require('../paths');
// ⚠️ EMISSION LAYER MANDATORY — no emitter composes its output
//    itself. Sealed by `emission-core-gate.test.js`: every file that
//    writes `additionalContext` MUST import this module.
const emission = require('../emission-core');
const { withLock } = require('../lock');

readStdinJson(
  (data) => {
    try {
      let config;
      try {
        config = JSON.parse(fs.readFileSync(paths.configPath(), 'utf8'));
      } catch {
        config = {}; // config absent = defaults (framework active)
      }
      // Same global switch as the PreToolUse gate (enabled: false cuts EVERYTHING).
      if (!lib.isFrameworkEnabled(config)) process.exit(0);

      const docs = sessionDocs(readCorpus(paths.sessionDocsDir(), 'session/'));
      if (docs.length === 0) process.exit(0);

      // [source: …] per doc — same vocabulary as the PreToolUse gate.
      // ⚠️ SEGMENTS, no longer a joined string: the emission layer reasons by
      //    DOCUMENT (that is what allows it to fragment, to deduplicate with the
      //    queue and to name what is deferred). The separator it applies
      //    is the SAME (`\n\n---\n\n`) ⇒ as long as the corpus fits in the frame,
      //    the output is identical TO THE BYTE to the one from before.
      const frais = docs.map((d) => ({
        id: 'session/' + d.doc,
        text: d.body + '\n[source: docs/' + d.doc + ']',
        label: 'docs/' + d.doc,
      }));

      // ⚠️ SCOPE PER AGENT, like the PreToolUse gate — that is what makes
      //    the two gates share THE SAME queue. A different key here
      //    would make the session remainder undrainable.
      const scopeId = lib.scopeId(data && data.session_id, data && data.agent_id);
      // ⚠️ BUDGET DECLARED BY THE WIRING (`--budget N`, cf lib.declaredBudget) —
      //    absent ⇒ framework floor, behaviour from before to the byte. This
      //    gate is an EMITTER: it MUST follow the limit declared to the
      //    harness like the PreToolUse gate, otherwise it chunks for nothing.
      const declare = lib.declaredBudget(process.argv);
      const budgetMax = declare === undefined ? require('../budget').DEFAULT_BUDGET : declare;

      // ⚠️ LOCK MANDATORY AROUND THE QUEUE (read then rewrite). Without
      //    mutual exclusion, two processes that cross lose part
      //    of it. Lock unavailable ⇒ we DEGRADE to fresh only (splitting without
      //    the queue, queue left intact) — never keep silent, never write without a
      //    lock. That is exactly the contract of pretool-core.js.
      const lockDir = path.join(paths.stateDir(), `.lock-doc-${lib.sanitizeSessionId(scopeId)}`);
      const res = withLock(
        lockDir,
        () => emission.emit({ frais, budgetMax, nbFrames: 1, indice: 1, scopeId }),
        { fallback: null }
      );
      const plan = res ? res.plan : emission.split(frais, budgetMax, 1)[0];

      // Empty frame (neither content nor announcement) ⇒ silence, like the PreToolUse gate.
      if (!plan || plan.texte === '') process.exit(0);
      const fullDoc = plan.texte;
      console.log(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: fullDoc,
        },
      }));
      process.exit(0);
    } catch {
      process.exit(0); // fail-open (missing docs/session folder included)
    }
  },
  () => process.exit(0)
);
