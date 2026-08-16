#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// PreToolUse hook — Injectable doc per MCP SERVER (generic framework)
// ═══════════════════════════════════════════════════════════════════════
//
// PROBLEM SOLVED: the protect-files.js system injects doc by file PATH,
// but an MCP (Stripe, Odoo, SSH...) does not always have an associated
// "file" — it is a TOOL BOUNDARY, not a file boundary. Without this,
// an agent can click a real "Pay now" button on a client
// portal without knowing the action is irreversible (incident 15/07/2026,
// cf. project_mcp_hook_docs_standard in memory).
//
// ⚠️ THIS FILE = THE ONLY I/O POINT (stdin/fs/stdout). All the pure
// DECISION logic lives in lib-pure.js (zero fs, testable/mutable without
// noise). The cross-process serialization lives in lock.js. This file only
// does: read stdin, call lib-pure, read/write fs under a lock, write stdout.
//
// 3 MODES (config.json → "mode"):
//   - "dumb"  : re-injects on EVERY call of the server. Noisy, never the default.
//   - "once"  : injects on the 1st call of the server, never again (until the
//               PreCompact reset). Zero noise, but can stay "silent" for a very
//               long time if the context drifts without compacting.
//   - "smart" (default): like "once", BUT also re-injects if ≥ N calls
//               of OTHER tools (non-MCP-same-server) have elapsed
//               since the last call to THIS server. The counter of a
//               server resets to 0 EVERY TIME it is called again (injected
//               or not) — so an agent that stays in the same MCP continuously
//               never re-injects; an agent that moves away from it for a long time (the
//               context has had time to "drift") gets the invariant recalled.
//   Threshold adjustable per server (config.json → "servers.{server}.threshold"),
//   otherwise "defaultThreshold". PreCompact remains the ABSOLUTE reset (all modes):
//   cf ctxroute-reset.js — compaction empties the context, nothing to do with the counter.
//
// ⚠️ INDEPENDENT COUNTERS PER SERVER — "other tool" = ANY tool that
//   IS NOT this precise server, including ANOTHER MCP server. E.g.: Stripe
//   → Odoo → Stripe advances the Stripe counter during the Odoo call
//   (Odoo is "foreign" to Stripe), and reciprocally the Odoo counter
//   advances during the Stripe call. Each server counts STRICTLY the
//   number of foreign tools since ITS OWN last call — never a
//   global counter shared between servers (otherwise Stripe and Odoo would
//   step on each other: calling one would suggest a "drift" of
//   the other while no tool truly foreign to THAT OTHER one occurred).
//
// FILTERING (config.json → "filterMode"): controls WHICH servers are
//   covered by the framework, independently of whether a doc.md exists:
//   - "none" (default): all the servers are covered.
//   - "whitelist": ONLY the servers listed in "filterList" are covered.
//   - "blacklist": ALL the servers EXCEPT those listed in "filterList".
//   A server EXCLUDED by the filter has NEITHER injection NOR state ("seen"/counter)
//   — but its calls ALWAYS count as "foreign" for the OTHER
//   active servers (cf the incrementation loop, which does not know the filter).
//
// PER-SERVER MODE (config.json → "servers.{server}.mode"): overrides the global
//   mode for THIS server only (e.g. Stripe in "dumb" — always
//   redisplay the payment warning — while the rest stays "smart").
//
// 3-LEVEL GRANULARITY (all the matching docs are CONCATENATED, order
//   global → tool → sub-tool, same parent/child logic as protect-files.js):
//   1. `docs/mcp/{server}.md`              — invariants of the whole server.
//   2. `docs/mcp/{server}/{tool}.md`       — {tool} = what follows "mcp__{server}__"
//      in tool_name (e.g. mcp__stripe__authenticate → tool="authenticate").
//   3. `docs/mcp/{server}/{subTool}.md`    — for "proxy" MCPs with a SINGLE tool
//      where the real operation is a PARAMETER (e.g. Odoo: tool_name="odoo_call"
//      ALWAYS, the real operation lives in tool_input.args.tool="update_record").
//      Enabled via `servers.{server}.subToolParam` = dotted path of the parameter
//      to read in tool_input (e.g. "args.tool"). Without this setting, level 3 is inactive.
//      ⚠️ WITHOUT this level, a proxy server is a total blind spot: the framework
//      cannot distinguish "Odoo read" from "Odoo delete_record" — both have
//      the same tool_name="mcp__odoo__odoo_call".
//
// ⚠️ ONLY 1 CODE FILE for ALL present/future MCPs. Adding an MCP
//   to the standard = dropping in `docs/mcp/{server}.md` (and optionally .md files
//   per tool/sub-tool). No per-server code.
//
// STORE = state/ctxroute-seen-<session_id>.json:
//   { "<server>": { "seen": true, "sinceLastCall": <int> } }
//   ⚠️ KEY = session_id, the same intended isolation as odoo-provenance.js.
// ⚠️ CRITICAL SECTION (load→modify→save of THIS file) protected by an
//   inter-process lock (lock.js) — Claude Code can launch independent tool
//   calls IN PARALLEL; without a lock, two concurrent invocations of this
//   hook for the SAME session_id can silently lose a write
//   (classic read-modify-write race). cf lock.js for the details of the mechanism.
//
// ⚠️ NEVER block (deny/ask) — this hook is PURELY informative.
// ⚠️ FAIL-OPEN MANDATORY: any error/failed parse → exit(0).
// ⚠️ PreToolUse output format IMPOSED by Claude Code:
//   stdout JSON hookSpecificOutput.permissionDecision + exit(0). Never stderr.
// ═══════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const lib = require('../lib-pure');
const { withLock } = require('../lock');
const { readStdinJson } = require('../stdin-json');
const deadline = require('../deadline');

// ⚠️ Paths RESOLVED ON EVERY CALL via paths.js (SINGLE SOURCE) — never
// copied here. Lazy resolution MANDATORY: freezing these values in
// consts at module load would break the isolation of the tests/doctor
// (env vars set by the parent, read at spawn time).
const paths = require('../paths');

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(paths.configPath(), 'utf8'));
  } catch {
    return { mode: 'smart', defaultThreshold: 4, servers: {} }; // config absent = default behavior
  }
}

// Per-session state, prefix 'ctxroute-seen-' (dedup by SERVER) — I/O shared
// with doc-inject.js ('doc-seen-'): cf session-store.js (extracted 16/07, jscpd gate).
const store = require('../session-store');
const STORE_PREFIX = 'ctxroute-seen-';
const loadState = (sessionId) => store.loadState(STORE_PREFIX, sessionId);
const saveState = (sessionId, state) => store.saveState(STORE_PREFIX, sessionId, state);

function lockDirFor(sessionId) {
  return path.join(paths.stateDir(), `.lock-${lib.sanitizeSessionId(sessionId)}`);
}

// ── PURGE of STALE state files ──
// PROBLEM: 1 session = 1 file state/ctxroute-seen-<id>.json, never
// deleted automatically → unbounded growth over months of usage.
// FIX: PROBABILISTIC purge (not on EVERY call — avoiding a readdir+stat over
// the WHOLE directory at each invocation of the hook, costly and pointless) of the
// files whose mtime exceeds the TTL. ~1 invocation out of 50 is enough to
// bound the growth without perceptible overhead.
// ⚠️ Probability and TTL overridable by env var ONLY for the
// tests (determinism) — in prod, the default values always apply.
// ⚠️ Number.isFinite() and NOT `||`: `CTXROUTE_GC_PROBABILITY=0` is a
// LEGITIMATE value (disabling the purge in a test) that `||` would silently swallow by
// falling back to 0.02 — zero is falsy. Same trap for the TTL.
function envNum(name, fallback) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && process.env[name] !== '' && process.env[name] !== undefined ? v : fallback;
}
const GC_PROBABILITY = envNum('CTXROUTE_GC_PROBABILITY', 0.02);
const GC_TTL_MS = envNum('CTXROUTE_GC_TTL_MS', 30 * 24 * 60 * 60 * 1000); // 30 days

function pruneOldStateFiles() {
  if (Math.random() >= GC_PROBABILITY) return;
  try {
    const now = Date.now();
    for (const f of fs.readdirSync(paths.stateDir())) {
      if (!f.startsWith('ctxroute-seen-') || !f.endsWith('.json')) continue;
      const full = path.join(paths.stateDir(), f);
      const st = fs.statSync(full);
      if (now - st.mtimeMs > GC_TTL_MS) fs.rmSync(full, { force: true });
    }
  } catch {
    /* fail-open: the purge is a hygiene bonus, never a blocker */
  }
}

function readDocFile(relPath) {
  try {
    return fs.readFileSync(path.join(paths.docsDir(), relPath), 'utf8').trim();
  } catch {
    return null; // file absent = nothing to inject for this level
  }
}

// Resolves the candidates computed by lib.docCandidatePaths() by actually
// reading the disk, keeping only those that exist. The only I/O point
// of the granularity chain — the path computation logic is pure.
// ⚠️ Also returns `levels` = the levels ACTUALLY injected (file found),
// NOT all the computed candidates — the systemMessage must reflect what was
// really read, not what could have been.
function loadDocParts(config, server, toolName, toolInput) {
  const parts = [];
  const levels = [];
  for (const { relPath, sourceLabel, level } of lib.docCandidatePaths(config, server, toolName, toolInput)) {
    const content = readDocFile(relPath);
    if (content) {
      parts.push(content + `\n[source: ${sourceLabel}]`);
      levels.push(level);
    }
  }
  return { parts, levels };
}

// ⚠️ `showNotification` NEVER cuts off the injection (additionalContext) —
// it controls ONLY the visible systemMessage. Cutting off the whole injection
// would make no sense (it is the hook's sole reason for existing).
function allow(doc, server, levels, config) {
  const out = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      additionalContext: doc,
    },
  };
  if (lib.shouldShowNotification(config)) out.systemMessage = lib.formatSystemMessage(server, levels);
  console.log(JSON.stringify(out));
  process.exit(0);
}

// ⚠️ DEADLINE ARMED BEFORE ANY I/O — NEVER move it lower down nor remove it.
//    Claude Code on Windows does not always close the stdin of the hook it spawns
//    (Anthropic bug #68626): without this, this process waits for an `end` that never
//    comes and lives FOREVER. Measured on 15/07/2026: 875 zombies, one of them 20 h old,
//    0.8 GB of RAM free out of 16. `.unref()` guarantees ZERO added latency when
//    everything is fine. Gate: `deadline-gate.test.js`. Proof: `deadline.test.js`.
deadline.arm();

readStdinJson((data) => {
  try {
    const toolName = data.tool_name || '';
    const toolInput = data.tool_input || {};
    const sessionId = data.session_id;
    const config = loadConfig();

    // ⚠️ GLOBAL SWITCH: config.json → "enabled". ON by default. Cuts off
    // EVERYTHING (injection AND state tracking) — checked FIRST, no side
    // effect even partial when disabled. DISTINCT from "showNotification"
    // (which cuts off ONLY the visible message, cf allow()) — 2 independent settings.
    if (!lib.isFrameworkEnabled(config)) process.exit(0);

    pruneOldStateFiles(); // hygiene: bounds the growth of state/, probabilistic, never blocking

    const server = lib.serverName(toolName);
    const active = server ? lib.isServerActive(config, server) : false;

    // ⚠️ CRITICAL SECTION under LOCK: load → decide → modify the counters of the
    // OTHER servers → save. Protects against two parallel invocations
    // of the hook for the SAME session_id that would overwrite each other without a lock.
    // Fail-open: if the lock cannot be acquired (contention/fs error),
    // fallback = no injection rather than crashing — cf lock.js.
    const result = withLock(lockDirFor(sessionId), () => {
      const state = loadState(sessionId);

      // Decision BEFORE any incrementation: reads the counter of the targeted server
      // as it was before this call (unaffected by this call itself).
      let shouldInject = false;
      if (server && active) {
        const serverMode = lib.modeFor(config, server);
        const entry = state[server] || { seen: false, sinceLastCall: 0 };
        const threshold = lib.thresholdFor(config, server);
        shouldInject = lib.shouldInjectFor(serverMode, entry.seen, entry.sinceLastCall, threshold);
      }

      // ⚠️ INDEPENDENT COUNTERS: THIS call (active/inactive MCP or native) is
      // "foreign" to ALL the OTHER already-seen servers EXCEPT `server` itself.
      // Each target server only advances if ITS OWN mode is "smart".
      let changed = false;
      for (const key of Object.keys(state)) {
        if (key === server) continue;
        if (state[key] && state[key].seen && lib.modeFor(config, key) === 'smart') {
          state[key].sinceLastCall = (state[key].sinceLastCall || 0) + 1;
          changed = true;
        }
      }

      if (!server || !active) {
        if (changed) saveState(sessionId, state);
        return { inject: false };
      }

      // Calling this server again ALWAYS resets its own counter to 0.
      state[server] = { seen: true, sinceLastCall: 0 };
      saveState(sessionId, state);

      return { inject: shouldInject };
    }, { fallback: { inject: false } });

    if (!result || !result.inject) process.exit(0);

    const { parts, levels } = loadDocParts(config, server, toolName, toolInput);
    if (parts.length === 0) process.exit(0); // no doc at any of the 3 levels

    allow(parts.join('\n\n---\n\n'), server, levels, config);
  } catch {
    process.exit(0); // fail-open
  }
}, () => process.exit(0)); // invalid JSON → fail-open
