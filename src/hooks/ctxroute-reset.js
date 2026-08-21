#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// PreCompact hook — reset of the "seen" store of legacy-mcp-inject.js
// ═══════════════════════════════════════════════════════════════════════
//
// PROBLEM SOLVED: legacy-mcp-inject.js only injects ONCE per MCP server
// per session (state/ctxroute-seen-<session_id>.json). But a COMPACTION
// empties the model's context WITHOUT changing session_id → without this reset, the
// doc injected before compaction disappears from the context but the store still
// says "already seen" → never re-injected again even though the agent has forgotten it.
//
// FIX: PreCompact deletes the session store → the next MCP call,
// after compaction, re-injects the doc as if it were a new context.
// That is the EXACT SIGNAL (not an arbitrary call counter): "once
// per context" = once per session, reset on the event that actually
// empties the context.
//
// ⚠️ FAIL-OPEN: a deletion error = not serious (worst case = no
// re-injection after compaction, never a block). Never deny/ask here.
// ⚠️ sanitizeSessionId comes from lib-pure.js — SINGLE SOURCE shared with
// legacy-mcp-inject.js (a file name format duplicated in 2 places
// diverges silently if one of the two changes without the other).
// ⚠️ stdin reading factored out into stdin-json.js (detected as duplicated by
// jscpd with legacy-mcp-inject.js before extraction).
// ═══════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const lib = require('../lib-pure');
const { readStdinJson } = require('../stdin-json');
// ⚠️ THE CLIENT LANE (2026-08-21) — and this shell is the one whose absence was
//    MEASURED. The gate had been wired to the daemon while this hook still only
//    deleted FILES: after a real compaction the daemon kept its memory intact,
//    so skills and `once` documents never came back. No error, no badge, no red.
//    **A shared state is migrated for ALL its consumers or for none.**
const client = require('../client-core');
const { request } = require('./state-client');

// ⚠️ stateDir comes from paths.js — SINGLE SOURCE shared with legacy-mcp-inject.js.
// It was hardcoded here AND over there: two copies of one and the same truth, which diverge
// silently as soon as one moves (the 2 hooks would then target different
// directories — the reset would no longer reset anything, without any visible error).
const paths = require('../paths');
const deadline = require('../deadline');

// ⚠️ DEADLINE ARMED BEFORE ANY I/O — NEVER move it lower down nor remove it.
//    Cf `deadline.js`: Claude Code (Windows) does not always close the stdin of the
//    spawned hook (Anthropic bug #68626) → without this, the process lives FOREVER.
//    Gate: `deadline-gate.test.js`. Proof by real spawn: `deadline.test.js`.
deadline.arm();

readStdinJson(
  (data) => {
    // ⚠️ THE KEYS THE AUTHORITY WILL BE ASKED TO FORGET — built INSIDE the loop
    //    below, from the SAME literal list, so there is exactly ONE place where
    //    the five stores are named. `store-purge-gate` reads that loop to prove
    //    no store escapes a compaction; a second list would be invisible to it,
    //    which is how a store ends up surviving a compaction with nothing to say.
    const cles = [];
    try {
      // ⚠️ FOUR stores to empty: 'doc-seen-' (unified gateway, dedup by DOC)
      //    + 'ctxroute-seen-' (legacy legacy-mcp-inject.js, kept for the duration of the
      //    rollback) + 'turn-count-' (turn counter, driftUnit 18/07/2026 —
      //    compaction opens a new context: the turns restart from 0
      //    like the tool counters) + 'plan-' (plan memoized per invocation
      //    of the multi-frame transport, 03/08/2026 — key PREFIXED by the session
      //    precisely so that it is swept here). Forgetting one = docs never
      //    re-injected after compaction, silently.
      // ⚠️ SCOPE PER AGENT (19/07/2026): the stores are keyed by
      //    lib.scopeId(session_id, agent_id) — `<session>` (master) and
      //    `<session>--agent-<id>` (sub-agents). Compaction INSIDE a sub-agent
      //    (agent_id present) = targeted purge of ITS scope. Master compaction =
      //    purge by session PREFIX: the master AND all its sub-agents
      //    (worst-case fail-open = one re-injection, never a frozen state).
      const scoped = lib.scopeId(data.session_id, data.agent_id);
      // ⚠️ FIFTH STORE (05/08/2026): 'remainder-' = the EMISSION QUEUE
      //    (`pretool-core.js`). Compaction EMPTIES the real context: what
      //    was waiting to reach it no longer has a destination, and the docs will
      //    in any case be decided afresh by the cadence. Keeping the queue
      //    would deliver, after compaction, the end of a document whose beginning has
      //    disappeared — an orphan, unreadable fragment. Purging it is therefore the
      //    CORRECT behavior, not a loss.
      for (const prefix of ['doc-seen-', 'ctxroute-seen-', 'turn-count-', 'plan-', 'remainder-']) {
        // ⚠️ ONE KEY PREFIX PER STORE, AND IT REPRODUCES THE DISK SEMANTICS
        //    EXACTLY. In memory a purge is `startsWith`: with an `agent_id` the
        //    scope is `<session>--agent-<id>`, so it matches that one agent and
        //    nothing else; without one it is `<session>`, which also matches
        //    `<session>--agent-…` — i.e. the master purge sweeping its
        //    sub-agents, which is precisely the rule below.
        cles.push(`${prefix}${scoped}`);
        // ⚠️ 'plan-' is ALWAYS swept by prefix: its key carries an
        //    invocation suffix (`--inv-…`), so the targeted deletion of an
        //    exact path would never find it.
        if (data.agent_id && prefix !== 'plan-') {
          fs.rmSync(path.join(paths.stateDir(), `${prefix}${scoped}.json`), { force: true });
        } else {
          for (const f of fs.readdirSync(paths.stateDir())) {
            if (f.startsWith(`${prefix}${scoped}`) && f.endsWith('.json')) {
              fs.rmSync(path.join(paths.stateDir(), f), { force: true });
            }
          }
        }
      }
    } catch {
      /* fail-open */
    }

    // ── THE AUTHORITY IS TOLD, TOO ──────────────────────────────────────────
    // 🔴 THIS IS THE DEFECT THAT WAS MEASURED AND ROLLED BACK. The gate was
    //    wired to the daemon, which owns its state IN MEMORY; deleting files
    //    forgot NOTHING there, so after a compaction the daemon still answered
    //    "already seen" — 2 bytes — and skills and `once` documents never came
    //    back. No error, no badge, no red. **All the consumers, or none.**
    // 🛑 THE DISK PURGE STAYS ON BOTH LANES, AND IT IS THE ONE OPERATION WHERE
    //    THAT IS SAFE. A purge only ever DESTROYS and is idempotent: it can
    //    never record a delivery, so it cannot make two memories the way a
    //    write would. On the client lane nothing writes those files any more, so
    //    it is a no-op; with no daemon it IS the whole reset, unchanged.
    // ⚠️ NO DAEMON ⇒ the kernel says so at once (`ENOENT`/`ECONNREFUSED`) and we
    //    exit; there is no probe, no retry and no delay used as a verdict.
    let voie = null;
    try { voie = client.clientLane(process.argv); } catch { /* fail-open */ }
    if (voie && cles.length > 0) {
      request('/purge', { keys: cles }, { socketPath: voie.socketPath }, () => process.exit(0));
      return;
    }
    process.exit(0);
  },
  () => process.exit(0) // invalid JSON → fail-open, no reset, never a block
);
