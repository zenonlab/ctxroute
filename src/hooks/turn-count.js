#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// "TURN" GATEWAY — UserPromptSubmit hook: increments the TURN counter.
// ═══════════════════════════════════════════════════════════════════════
//
// REASON FOR EXISTING (driftUnit, 18/07/2026): the historical `smart` counter counts
// TOOL calls (PreToolUse). A doc/skill with `driftUnit: turn` measures its
// elapsing in conversation TURNS — yet PreToolUse does not see turns.
// This gateway is THE missing sensor: UserPromptSubmit fires ONCE
// per turn (Claude Code contract verified in the official doc on 18/07/2026), it
// increments a per-session counter that gate.decide compares (turnCount -
// entry.turn >= threshold).
//
// ⚠️ MUTE BY CONTRACT: on UserPromptSubmit, any stdout becomes CONTEXT
//    injected next to the prompt. This gateway NEVER emits anything — a console.log
//    here would pollute every turn of every agent. Count, keep quiet, exit.
// ⚠️ SAME store mechanism as the gateway (session-store.js, DISTINCT prefix
//    'turn-count-') — never a 2nd state system. Reset by ctxroute-reset.js
//    (PreCompact) like the other two stores.
// ⚠️ Full FAIL-OPEN: unreadable state = start from 0, unwritable = too
//    bad for this turn (worst case = a delayed re-injection, never a block).
// ═══════════════════════════════════════════════════════════════════════

'use strict';

// ⚠️ Deadline BEFORE any I/O (bug #68626: 875 zombies on 15/07/2026).
require('../deadline').arm();

const path = require('path');
const fs = require('fs');
const lib = require('../lib-pure');
const store = require('../session-store');
const { withLock } = require('../lock');
const { readStdinJson } = require('../stdin-json');
const paths = require('../paths');

const STORE_PREFIX = 'turn-count-';

readStdinJson(
  (data) => {
    try {
      let config = {};
      try {
        config = JSON.parse(fs.readFileSync(paths.configPath(), 'utf8'));
      } catch { /* config absent = defaults (framework active) */ }
      // enabled:false switches off the WHOLE framework, turn counter included.
      if (!lib.isFrameworkEnabled(config)) process.exit(0);

      // ⚠️ SCOPE PER AGENT — same composite key as the gateway (lib.scopeId,
      // SINGLE SOURCE): a turn counter shared between master and sub-agents
      // would distort the 'turn' driftUnit of the sub-agents. Without agent_id = the
      // historical key, unchanged.
      const sessionId = lib.scopeId(data.session_id, data.agent_id);
      const lockDir = path.join(paths.stateDir(), `.lock-turn-${lib.sanitizeSessionId(sessionId)}`);
      withLock(lockDir, () => {
        const s = store.loadState(STORE_PREFIX, sessionId);
        const turns = Number.isInteger(s.turns) ? s.turns : 0;
        store.saveState(STORE_PREFIX, sessionId, { turns: turns + 1 });
      }, { fallback: null }); // lock unavailable = turn not counted (fail-open)
    } catch {
      /* fail-open */
    }
    process.exit(0);
  },
  () => process.exit(0)
);
