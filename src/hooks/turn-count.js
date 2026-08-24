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
// ⚠️ MUTE BY CONTRACT, AND THE CONTRACT IS ABOUT **PLAIN TEXT**: on
//    UserPromptSubmit, PLAIN-TEXT stdout becomes CONTEXT injected next to the
//    prompt — a bare `console.log` here would pollute every turn of every agent.
//    Official Claude Code doc, read 2026-08-22: stdout whose first non-blank
//    character is `{` is parsed as JSON instead, and `systemMessage` is a field
//    common to every event, shown to the user. ⇒ the ONE thing this gateway ever
//    prints is `{"systemMessage": …}`, and only when the kernel REFUSED the
//    connection to the state address (`direLeRefus`, once per session). In every
//    other case: count, keep quiet, exit.
// ⚠️ SAME store mechanism as the gateway (session-store.js, DISTINCT prefix
//    'turn-count-') — never a 2nd state system. Reset by ctxroute-reset.js
//    (PreCompact) like the other two stores.
// ⚠️ Full FAIL-OPEN: unreadable state = start from 0, unwritable = too
//    bad for this turn (worst case = a delayed re-injection, never a block).
// ═══════════════════════════════════════════════════════════════════════

'use strict';

// ⚠️ Deadline BEFORE any I/O (bug #68626: 875 zombies on 15/07/2026).
require('../deadline').arm();

// ⚠️ NO `path` HERE ANY MORE (2026-08-23): the lock's ADDRESS is composed by its
//    owner, `store-resolve.turnLockDir`. A lock only serialises writers that
//    take the SAME name, so a second spelling built here would be a second lock.
const fs = require('fs');
const lib = require('../lib-pure');
// 🛑 `store` AND `withLock` COME FROM ONE RESOLVER, AND THEY TRAVEL TOGETHER.
//    Memory + a file lock is a lock protecting nothing; disk + an empty lock is
//    the 2026-08-07 production bug, deliberately reintroduced. Resolving them in
//    one place is what makes "one without the other" unwritable here.
const { resolveStore, turnLockDir } = require('../store-resolve');
// ⚠️ The increment rule is SHARED with the daemon (`turn-core.js`): a rule about
//    the shape of a store, read in two places, diverges — paid twice (㊱, ㊳).
const turnCore = require('../turn-core');
const client = require('../client-core');
const { request } = require('./state-client');
const { readStdinJson } = require('../stdin-json');
const paths = require('../paths');

const STORE_PREFIX = 'turn-count-';

/**
 * SAY, ONCE PER SESSION, THAT THE KERNEL REFUSED THE CONNECTION.
 *
 * 🔴 THE HOLE IT CLOSES, AND IT IS THE ONE FAILURE THIS PROJECT REFUSES. When
 *    the authority cannot be reached, a declaration wired on the `http`
 *    transport runs NOTHING AT ALL: the harness receives the refusal and moves
 *    on, so no code of ours exists to complain. The agent then acts without the
 *    knowledge it was owed — no error, no badge, nothing red. And the witness we
 *    already had cannot see it either: the canary decides on "we emitted N
 *    times, did it arrive?", and with nothing emitted there is no denominator,
 *    hence `undecidable`, hence silence.
 * 🔑 THIS SHELL IS THE ONE THAT CAN SEE IT, AND IT SEES IT FOR FREE. It is a
 *    REAL process the harness spawns, on the CLIENT lane, once per human turn —
 *    so a refusal that begins mid-session is observed at the very next prompt,
 *    BEFORE the tool calls of that turn. No probe was added and none may be: the
 *    refusal is an IMMEDIATE fact from the kernel (`ECONNREFUSED` on a socket,
 *    `ENOENT` on a missing pipe), never a timeout, never an inference about
 *    another component being alive.
 * 🛑 IT SAYS WHAT IT OBSERVED, NEVER WHY. The sentence lives in `lib-pure` and
 *    claims nothing about the daemon, the gate or the http lane — a layer that
 *    observes WHAT has no authority to pronounce on WHY (same discipline as the
 *    `N doc(s) WITHHELD` count).
 * 🛑 IT SPEAKS WITHOUT DECIDING. Official Claude Code doc, read 2026-08-22:
 *    stdout whose first non-blank character is `{` is parsed as JSON (it is
 *    therefore NOT added to the prompt as plain-text context), and
 *    `systemMessage` is a field common to every event, shown to the user. So we
 *    emit `{systemMessage}` ALONE — no `hookSpecificOutput`, no
 *    `permissionDecision`, no `decision` — exactly as `pretool-core.noticeOutput`
 *    does on PreToolUse. **A notice must never change a decision**, and here the
 *    decision at stake is the user's own prompt.
 * ⚠️ THE "MUTE BY CONTRACT" RULE AT THE TOP OF THIS FILE IS UNTOUCHED: it is
 *    about PLAIN-TEXT stdout, which does become context. Nothing but this
 *    branch ever prints, and only when the kernel really refused.
 * ⚠️ FOLLOWS `showNotification` like every other badge — that setting is a TOTAL
 *    silence by the maintainer's decision, never a partial one.
 * ⚠️ FAIL-OPEN TWICE OVER: the lock's own fallback plus this catch. If anything
 *    here fails we say nothing and exit 0 — a witness may never cost a turn.
 * ⚠️ NO NEW STORE: the flag lives in the scope's EXISTING `turn-count-` record,
 *    beside its counter. A sixth prefix would have to be added to the PreCompact
 *    purge loop AND to the eviction's durable classes for one boolean; here the
 *    record is already purged on compaction, so the notice comes back once per
 *    CONTEXT, which is what `once` means everywhere else in this framework.
 *    Precedent for a record carrying several facts of one scope: the gate's
 *    `denied` flag beside its seen entries.
 *
 * @param {NodeJS.ErrnoException|null} error  the kernel's verdict, verbatim
 * @param {string} sessionId  the per-agent scope (`lib.scopeId`)
 * @param {object} config
 */
function sayTheRefusal(error, sessionId, config) {
  let avis = '';
  try {
    if (!lib.shouldShowNotification(config)) return;
    const { store, withLock } = resolveStore();
    const lockDir = turnLockDir(sessionId);
    withLock(lockDir, () => {
      // 🛑 THE STATE IS READ, NEVER GUESSED. An empty literal here would assert
      //    "never said before" and turn a once-per-session notice into a shout
      //    on every single turn — the wallpaper an alarm must never become.
      const state = store.loadState(STORE_PREFIX, sessionId);
      const d = lib.refusalNotice(error && error.code, state);
      if (!d.say) return;
      avis = d.message;
      store.saveState(STORE_PREFIX, sessionId, { ...state, refused: true });
    }, { fallback: null }); // lock unavailable = nothing said this turn (fail-open)
  } catch {
    return; // fail-open: a witness never costs a turn
  }
  if (avis) console.log(JSON.stringify({ systemMessage: avis }));
}

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
      // ⚠️ NO DAEMON ⇒ the turn is not counted, exactly like every other client
      //    on this lane. The cost is one uncounted turn, i.e. a re-injection
      //    arriving one turn late — never a broken prompt.
      // 🔑 BUT THE REFUSAL ITSELF IS NO LONGER SILENT (2026-08-22) — see below.
      const lane = client.clientLane(process.argv);
      if (lane) {
        request(
          '/turn',
          { prefix: STORE_PREFIX, scope: sessionId },
          { socketPath: lane.socketPath },
          (response, error) => {
            if (response) process.exit(0);
            sayTheRefusal(error, sessionId, config);
            process.exit(0);
          },
        );
        return;
      }

      const { store, withLock } = resolveStore();
      const lockDir = turnLockDir(sessionId);
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
