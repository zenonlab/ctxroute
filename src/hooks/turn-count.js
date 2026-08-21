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
// 🛑 `store` AND `withLock` COME FROM ONE RESOLVER, AND THEY TRAVEL TOGETHER.
//    Memory + a file lock is a lock protecting nothing; disk + an empty lock is
//    the 2026-08-07 production bug, deliberately reintroduced. Resolving them in
//    one place is what makes "one without the other" unwritable here.
const { resolveStore } = require('../store-resolve');
// ⚠️ The increment rule is SHARED with the daemon (`turn-core.js`): a rule about
//    the shape of a store, read in two places, diverges — paid twice (㊱, ㊳).
const turnCore = require('../turn-core');
const client = require('../client-core');
const { request } = require('./state-client');
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

      // 🛑 THE DISK EVICTION IS TRIGGERED HERE, AND THE PLACE IS THE DECISION.
      //    `state/` writes one JSON file per scope and had NO eviction at all
      //    (615 files / 5.1 MB measured on the live install, 88 % of them
      //    ephemeral `plan-` keys). What was needed is a caller that CANNOT
      //    forget and is NOT a timer:
      //      · UserPromptSubmit fires exactly ONCE per turn, and a tool call is
      //        always the consequence of a prompt ⇒ no session can produce state
      //        files without this hook having run first;
      //      · it is ONE process, not the 16 frames of a tool call, so the
      //        readdir is paid once per human turn instead of once per action;
      //      · it is already wired on BOTH harnesses and already fail-open.
      //    🛑 NEVER move this into a state WRITE (`session-store.saveState`): the
      //    16 frames of every action would each walk the directory — the
      //    "and at 10,000?" defect, paid on every gesture.
      //    ⚠️ HONEST LIMIT: a harness that does not wire UserPromptSubmit gets
      //    NO eviction. That is a wiring fact the doctor must assert, not
      //    something this file can guarantee.
      // ⚠️ Fail-open twice over (the module swallows its own errors, and this
      //    catch is the second wall): disk housekeeping never costs a turn.
      try { require('../state-eviction').sweep(); } catch { /* fail-open */ }

      // ⚠️ SCOPE PER AGENT — same composite key as the gateway (lib.scopeId,
      // SINGLE SOURCE): a turn counter shared between master and sub-agents
      // would distort the 'turn' driftUnit of the sub-agents. Without agent_id = the
      // historical key, unchanged.
      const sessionId = lib.scopeId(data.session_id, data.agent_id);

      // 🛑 ONE AUTHORITY, OR NONE. On the client lane the daemon owns the
      //    counter: incrementing it HERE as well would make TWO memories, and
      //    the `turn` drift would then read whichever of the two the gate
      //    happens to be given — silently, and differently per action.
      // ⚠️ The read-modify-write crosses the socket as ONE request: the kernel
      //    delivers one connection at a time onto a single-threaded loop, so it
      //    cannot be crossed. Splitting it into a read and a write would rebuild,
      //    over a socket, the conversation between peers this lane removes.
      // ⚠️ NO DAEMON ⇒ nothing is recorded, exactly like every other client on
      //    this lane. The cost is one uncounted turn, i.e. a re-injection
      //    arriving one turn late — never a broken prompt.
      const voie = client.clientLane(process.argv);
      if (voie) {
        request(
          '/turn',
          { prefix: STORE_PREFIX, scope: sessionId },
          { socketPath: voie.socketPath },
          () => process.exit(0),
        );
        return;
      }

      const { store, withLock } = resolveStore();
      const lockDir = path.join(paths.stateDir(), `.lock-turn-${lib.sanitizeSessionId(sessionId)}`);
      withLock(lockDir, () => {
        turnCore.bump(store, STORE_PREFIX, sessionId);
      }, { fallback: null }); // lock unavailable = turn not counted (fail-open)
    } catch {
      /* fail-open */
    }
    process.exit(0);
  },
  () => process.exit(0)
);
