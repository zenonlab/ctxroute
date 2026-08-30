#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// PURE DECISION logic — zero I/O (no fs/process/network).
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ NEVER import `fs`/`path`/`process.env` here. This module exists to
// isolate the decision from the residual I/O (doctrine: "pure function → testable
// /mutable; residual I/O = integration/contract"). That is what allows
// Stryker to mutate this logic without noise (a file mixed with fs/stdin
// produces undetectable equivalent mutants — a false signal).
//
// Consumed by the WHOLE stack — 13 modules on 09/08/2026: the shared cores
// (porte-core, gate, source-adapters, sources/mcp, sources/skill, session-store),
// the shells (doc-inject, codex-doc-inject, session-inject, turn-count,
// ctxroute-reset, canari-check) and the relic `legacy-mcp-inject`. NO
// function here must have an observable side effect — same inputs ⇒ same
// outputs, always.
// 🛑 THIS LINE ONLY NAMED `legacy-mcp-inject.js`, "the only I/O point"
//    (fixed on 09/08/2026): that was true at the very beginning, and FALSE since
//    the single gate of 17/07 — legacy is UNWIRED, kept as a differential
//    oracle. A reader who came to port the framework therefore saw a single
//    caller there, dead, instead of the 12 live ones. **The blast radius of a change here
//    is the ENTIRE stack, not one file.**
// ═══════════════════════════════════════════════════════════════════════

'use strict';

// Sanitises a session_id into a cross-OS safe file name. 'unknown' if empty.
// ⚠️ A SINGLE fallback ('unknown' on the output) — no redundant double-default
// (a `|| 'unknown'` on the input AND the output produces an undetectable
// equivalent mutant: both paths converge silently).
// ⚠️ TOTALITY: the typeof guard is MANDATORY — `String(x)` THROWS on an object whose
// `toString` is not a function (e.g. {"toString":0}, perfectly valid JSON
// hence reachable from a hook payload). This is NOT a redundant
// guard: found by property-based testing on 15/07/2026, against a comment
// that asserted precisely that "JS coercion is enough". It is not.
function sanitizeSessionId(sessionId) {
  if (typeof sessionId !== 'string' && typeof sessionId !== 'number') return 'unknown';
  const safe = String(sessionId).replace(/[^a-zA-Z0-9_-]/g, '');
  return safe || 'unknown';
}

// PER-AGENT STATE SCOPE (19/07/2026) — SINGLE SOURCE of the store key format.
// Doctrine: the master agent and EACH sub-agent = DISTINCT contexts → a
// DISTINCT injection state (once/smart) per agent. The harness provides
// `agent_id` ONLY in hooks fired INSIDE a sub-agent (official doc
// hooks.md, verified 19/07/2026 + measured on a real payload); `session_id` and
// `transcript_path` are SHARED with the master — NEVER use them to
// distinguish agents.
// ⚠️ Without agent_id ⇒ a key strictly IDENTICAL to the historical one (backwards
// compatibility, differential parity intact). Separator `--agent-`: the alphabet of
// sanitizeSessionId ⇒ no collision possible with a session_id.
// ⚠️ Compose the key ONLY HERE — copying it into a gate is the classic
// silent drift (the founding bug of the sub-agents hole).
function scopeId(sessionId, agentId) {
  const base = sanitizeSessionId(sessionId);
  if (agentId === undefined || agentId === null || agentId === '') return base;
  return base + '--agent-' + sanitizeSessionId(agentId);
}

// Extracts the server name from "mcp__{server}__{tool}". null if not an MCP tool.
// ⚠️ CORRECTION 15/07/2026 — this comment previously asserted that "exec() already
// coerces any non-string argument, so a guard would be an equivalent mutant".
// THAT IS FALSE, and property-based testing proved it: `{"toString": 0}` (valid JSON,
// hence reachable from a hook payload) makes the coercion THROW
// ("Cannot convert object to primitive value"). The typeof guard below
// is NOT redundant — it is the condition of TOTALITY of the function.
// Lesson: "JS coercion takes care of it" is a hypothesis to VERIFY, not to
// comment. A throw here would bubble up to the hook → fail-open → total silence.
// ⚠️ SECURITY — the character class is DELIBERATELY RESTRICTIVE
// ([a-zA-Z0-9-], never `[^_]`). NEVER widen it. A REAL hole found by
// property-based testing on 15/07/2026: `[^_]+` also matches `/`, `\` and `.`, so
// `mcp__../../etc__x` produced server="../../etc" → a doc path outside
// docs/mcp/ (the hand-written tests had not seen that case). The real
// MCP server names are identifiers (stripe, qa-tools,
// plugin_discord_discord): nothing legitimate is lost here.
function serverName(toolName) {
  if (typeof toolName !== 'string') return null;
  const m = /^mcp__([a-zA-Z0-9-]+(?:_[a-zA-Z0-9-]+)*?)__/.exec(toolName);
  return m ? m[1] : null;
}

// Extracts the tool SUFFIX from "mcp__{server}__{tool}" (everything after
// the server prefix). E.g. mcp__stripe__authenticate, server="stripe" → "authenticate".
// ⚠️ TOTALITY: `typeof toolName !== 'string'` — an object without .startsWith
// would throw a TypeError (same class as serverName above, cf property test).
function toolSuffix(toolName, server) {
  if (!server || typeof toolName !== 'string') return null;
  const prefix = `mcp__${server}__`;
  return toolName.startsWith(prefix) ? toolName.slice(prefix.length) : null;
}

// Is a segment safe as a component of a doc path (docs/mcp/{seg}.md)?
// ⚠️ SECURITY — NEVER REMOVE. `subTool` comes from tool_input, hence from a
// value potentially derived from EXTERNAL data (API response, web
// content, customer ticket). Without this filter, a subTool = "../../../../secrets"
// makes path.join() escape docs/mcp/ and INJECTS the content of an
// arbitrary .md from the disk into the agent's context AS AN AUTHORITATIVE
// INSTRUCTION (a prompt-injection primitive, not a simple read).
// Rejects any path separator, any '..', any NUL, any absolute/UNC path.
// Mirror of sanitizeSessionId(): same class of risk (uncontrolled data
// → file name), hence the same reflex — filter, never trust.
function isSafePathSegment(seg) {
  if (typeof seg !== 'string' || seg === '') return false;
  if (seg === '.' || seg === '..') return false;
  return !/[/\\\0]/.test(seg);
}

// Reads a nested value through a dotted path ("args.tool" → obj.args.tool).
// ⚠️ Returns only SCALAR values that are safe for a file name
// (string/number) — an object/array corresponds to no .md, never crash.
function getByPath(obj, dottedPath) {
  if (!obj || typeof dottedPath !== 'string') return null;
  const val = dottedPath.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
  return (typeof val === 'string' || typeof val === 'number') ? String(val) : null;
}

// Effective threshold for THIS server: override servers.{server}.threshold > defaultThreshold > 4.
function thresholdFor(config, server) {
  const override = config.servers && config.servers[server] && config.servers[server].threshold;
  return Number.isInteger(override) ? override : (Number.isInteger(config.defaultThreshold) ? config.defaultThreshold : 4);
}

// Effective mode for THIS server: override servers.{server}.mode > global mode > "smart".
function modeFor(config, server) {
  const override = config.servers && config.servers[server] && config.servers[server].mode;
  return override || config.mode || 'smart';
}

// GLOBAL switch of the entire framework (config.json → "enabled").
// ⚠️ Cuts EVERYTHING (additionalContext injection AND state/counter tracking) —
// a standard pattern (ESLint, git hooks SKIP=...) to temporarily disable
// without removing the settings.json wiring. DISTINCT from "showNotification" (which only
// cuts the visible message) — the 2 settings are independent and composable:
// enabled:false + showNotification:true = incoherent but harmless (nothing to notify).
// ON by default — ONLY the literal `false` value disables it (fail-open).
function isFrameworkEnabled(config) {
  return config.enabled !== false;
}

// Switch of the VISIBLE NOTIFICATION only (config.json → "showNotification").
// ⚠️ NEVER cuts the injection itself (additionalContext) — only the
// user-only systemMessage that goes with it. Cutting the whole injection would make
// no sense (it is the framework's sole reason to exist); this setting serves
// only the user who prefers NOT to see the "📄 [ctxroute]" badge
// on every injection while keeping the real benefit (context delivered to the agent).
// ON by default — ONLY the literal `false` value disables the notification
// (fail-open: a broken config must never silently disable
// transparency towards the user).
function shouldShowNotification(config) {
  return config.showNotification !== false;
}

// Formats the USER-ONLY systemMessage displayed when an injection occurs.
// ⚠️ EXPLICIT "[ctxroute]" prefix so that the user distinguishes
// this source from the other injectable-doc systems (e.g. protect-files.js
// displays just "📄 doc: xxx" without stating its origin — ambiguous if the
// two systems run in the same session, cf the 15/07/2026 incident where
// the maintainer confused the two sources).
// `levels` = array of the level labels injected this time (e.g. ["server"],
// ["server","tool"], ["server","tool","subTool"]) — makes the real granularity
// visible, not just "something was injected for this server".
function formatSystemMessage(server, levels) {
  const suffix = Array.isArray(levels) && levels.length > 1 ? ` (${levels.slice(1).join('+')})` : '';
  return `📄 [ctxroute] ${server}${suffix}`;
}

// ⚠️ THE ONE PLACE THAT KNOWS HOW TWO `systemMessage` FRAGMENTS BECOME ONE
//    (2026-08-30). `pretool-core.js` already had this exact decision inline
//    (`suffix === '' ? avis : suffix + (avis ? ' · ' + avis : '')`) to append its
//    withholding notice after the source badges; the http shell had grown a
//    SECOND, slightly different copy to append the delivery notice
//    (`existing ? existing + ' · ' + noticeText : noticeText`). Two copies of one
//    join is exactly the twin-that-drifts class this repo exists to fight —
//    composing a dialect field is a DECISION, so it lives here, PURE, and both
//    callers reuse it instead of inventing their own ternary.
// 🛑 `base` FIRST, `addition` LAST — every existing badge in this fleet is
//    built by appending, never prepending (source badges, capacity alarm,
//    withholding notice, filter count): a later caller expects to find its own
//    text at the front, unchanged, with the addition trailing behind ' · '.
/**
 * @param {string|undefined|null} base the message so far (possibly empty)
 * @param {string|undefined|null} addition the fragment to append (possibly empty)
 * @returns {string} `base` alone, `addition` alone, or both joined by ' · '
 */
function joinSystemMessage(base, addition) {
  const b = typeof base === 'string' ? base : '';
  const a = typeof addition === 'string' ? addition : '';
  if (a === '') return b;
  if (b === '') return a;
  return b + ' · ' + a;
}

// Is the server covered by the framework according to filterMode/filterList?
// ⚠️ "whitelist" and "blacklist" are symmetrical: whitelist = the list of the ONLY
// allowed ones, blacklist = the list of the ONLY excluded ones. "none"/unknown value = everything covered
// (fail-open: a broken config must never silently disable everything).
// ═══ GLOBAL FILTER BY TARGET (52, 15/08/2026) ═══════════════════════════
// The TARGET of a gesture = its tool name, and by extension the MCP SERVER
// deduced from it. An entry of `filterList` therefore targets: an EXACT tool
// name (`Bash`, `mcp__stripe__pay`) · a SERVER name (`stripe` — historical
// semantics, UNTOUCHED) · the wildcard `*`.
// ⚠️ Generalises the old "MCP servers only" filter: that was class
//    ㊴ (a dimension deprived of what its sibling had) — an adopter could
//    not say "NEVER inject on our production tools".
// ⚠️ The CASCADE (defaults.{source} > global) lives in gate.js, NEVER here:
//    this function receives the ALREADY resolved pair. A resolution here = the
//    double cascade paid for twice (㊱, ㊳).
function resolvedTarget(filterList, toolName) {
  const list = Array.isArray(filterList) ? filterList : [];
  if (list.includes('*')) return true;
  if (typeof toolName === 'string' && toolName !== '' && list.includes(toolName)) return true;
  const server = serverName(toolName);
  return server != null && list.includes(server);
}

// Must the gesture be DISCARDED by this filter? (whitelist = discarded if NOT targeted ·
// blacklist = discarded if targeted · everything else = never discarded, fail-open).
function targetExcluded(filterMode, filterList, toolName) {
  if (filterMode === 'whitelist') return !resolvedTarget(filterList, toolName);
  if (filterMode === 'blacklist') return resolvedTarget(filterList, toolName);
  return false;
}

// ⚠️ HISTORICAL SEMANTICS (server only, NO wildcard, NO tool name) —
//    kept for the FROZEN oracle `legacy-mcp-inject.js` and the check of
//    config-gate. The LIVE path goes through `targetExcluded` (resolved by gate.js).
//    This is NOT a duplicate to merge: the oracle is forbidden to evolve.
function isServerActive(config, server) {
  const filterMode = config.filterMode; // ⚠️ no 'none' default: any value ≠ whitelist/blacklist already falls to `return true` below — an explicit default would be an equivalent mutant (never compared to 'none' itself).
  const list = Array.isArray(config.filterList) ? config.filterList : [];
  if (filterMode === 'whitelist') return list.includes(server);
  if (filterMode === 'blacklist') return !list.includes(server);
  return true;
}

// Decides whether to (re)inject for THIS server, from its state BEFORE
// this call (entrySeen/sinceLastCall unaffected by the current call).
// Pure: reads/writes no state, it merely decides.
function shouldInjectFor(mode, entrySeen, sinceLastCall, threshold) {
  if (mode === 'dumb') return true;
  if (!entrySeen) return true; // 1st call of the server, all modes
  if (mode === 'smart') return sinceLastCall >= threshold;
  return false; // "once" already seen = never
}

// Computes the RELATIVE paths (under docs/mcp/) of the candidate docs for this
// precise call, from the most GLOBAL to the most SPECIFIC — NO disk reading here,
// just the path computation. The caller (I/O) filters those that really exist.
//   1. {server}.md
//   2. {server}/{tool}.md       (tool suffix, if present)
//   3. {server}/{subTool}.md    (sub-tool parameter, if configured AND present)
// ⚠️ De-duplicates level 3 if subTool === suffix (otherwise the same file is read twice).
// ⚠️ Each candidate carries a `level` ("server"/"tool"/"subTool") — it lets
// the caller (I/O) compose a systemMessage that shows the granularity
// ACTUALLY injected (not just "something was injected"), cf formatSystemMessage().
function docCandidatePaths(config, server, toolName, toolInput) {
  // ⚠️ DEFENSE-IN-DEPTH: `server` normally comes from serverName() (already
  // restrictive), but this function is public — a future caller could
  // pass it an unvalidated name. Zero candidates rather than a path outside
  // docs/mcp/. NEVER remove it telling yourself "the caller already validated":
  // that is exactly the hypothesis that created the hole found on 15/07/2026.
  if (!isSafePathSegment(server)) return [];

  const candidates = [{ relPath: `${server}.md`, sourceLabel: `docs/mcp/${server}.md`, level: 'server' }];

  // ⚠️ isSafePathSegment MANDATORY on suffix AND subTool: both
  // end up as a path component read from disk then injected into the
  // agent's context. Cf isSafePathSegment() for the class of risk.
  const rawSuffix = toolSuffix(toolName, server);
  const suffix = isSafePathSegment(rawSuffix) ? rawSuffix : null;
  if (suffix) {
    candidates.push({
      relPath: `${server}/${suffix}.md`,
      sourceLabel: `docs/mcp/${server}/${suffix}.md`,
      level: 'tool',
    });
  }

  // ⚠️ No `if (subToolParam)` guard before the call: getByPath() is already
  // safe on a falsy input (typeof dottedPath !== 'string' → immediate null).
  // A redundant guard here would be an equivalent mutant (same result with/without).
  const subToolParam = config.servers && config.servers[server] && config.servers[server].subToolParam;
  const subTool = getByPath(toolInput, subToolParam);
  if (isSafePathSegment(subTool) && subTool !== suffix) {
    candidates.push({
      relPath: `${server}/${subTool}.md`,
      sourceLabel: `docs/mcp/${server}/${subTool}.md`,
      level: 'subTool',
    });
  }

  return candidates;
}

/**
 * Reads `--frame k` / `--frames N` in a command line.
 *
 * ⚠️ PURE and SHARED by the shells: the multi-frame mechanism is DECLARED in
 *    configuration (the same script declared N times with a different index),
 *    never in code. Every harness knows how to do that — that is what keeps the
 *    mechanism portable. Duplicating this parsing in every shell would reopen
 *    the drift the repo fights (and jscpd would say so).
 * ⚠️ Absent/absurd value ⇒ `{ frame: 1, nbFrames: 1 }` = a single frame =
 *    today's behaviour. A badly written declaration DEGRADES, it never
 *    breaks the injection.
 */
function parseFrameArgs(argv) {
  // ⚠️ IMMEDIATE fallback on a non-array input (and not a backup `: []`):
  //    a backup array only serves `indexOf`, which would return -1 anyway
  //    ⇒ the branch would be INDISTINGUISHABLE, hence an equivalent mutant.
  if (!Array.isArray(argv)) return { frame: 1, nbFrames: 1 };
  const count = (name) => {
    const i = argv.indexOf(name);
    // ⚠️ Flag ABSENT ⇒ 1. Without this output, `argv[i + 1]` would read `argv[0]`
    //    (i = -1): a command line containing a bare number would be taken
    //    for a packet declaration. A real bug, found by mutation.
    if (i < 0) return 1;
    const v = Number(argv[i + 1]);
    // ⚠️ `Math.max` and NOT `v >= 1 ? v : 1`: at v = 1 both branches of the
    //    ternary return the same thing, which makes the comparator UNKILLABLE
    //    (equivalent mutant). The clamp expresses the same rule, testably.
    return Number.isInteger(v) ? Math.max(1, v) : 1;
  };
  const nbFrames = count('--frames');
  const frame = count('--frame');
  // ⚠️ An out-of-bounds index must NEVER emit somebody else's packet:
  //    we fall back to the single frame, never to false content.
  if (frame > nbFrames) return { frame: 1, nbFrames: 1 };
  return { frame, nbFrames };
}

/**
 * BUDGET DECLARED BY THE WIRING — `--budget N`, next to the `additionalContextLimit`
 * of the SAME block of `requirements.toml`. Sealed by `budget-declare-gate.test.js`,
 * which requires the two numbers to be EQUAL.
 *
 * ⚠️ SEMANTICS TAKEN WORD FOR WORD FROM CODEX — measured in the 0.146.0 binary:
 *    *"Configured `additionalContext` spill threshold. `null` uses 2,500 tokens;
 *    `0` disables spilling."* So **`0` = NO limit**, and that is what our
 *    wiring declares. Taking THEIR convention rather than inventing one:
 *    two conventions for one same number is guaranteed divergence.
 *
 * ⚠️ WHY AS AN ARGUMENT AND NOT HARD-CODED NOR READ AT RUNTIME. Hard-coded = a 2nd source
 *    of truth that drifts as soon as the wiring changes (the EXACT defect we
 *    fix: the limit had been 0 since 04/08 and the engine assumed 8,000,
 *    so a skill went out in 7 pieces for nothing, silently, all green). Read at
 *    runtime = one more I/O on EVERY tool call, on a fail-open path.
 *    The argument makes the number travel WITH the declaration — the same pattern as
 *    `--frame k --frames N` on the Claude Code side, nothing new.
 *
 * ⚠️ ABSENT = behaviour as BEFORE, byte for byte (framework floor). An old
 *    wiring is never broken by this evolution.
 * ⚠️ NEVER write a hard-coded harness value here: it is the wiring that
 *    speaks, this file merely relays it.
 */
function declaredBudget(argv) {
  const i = argv.indexOf('--budget');
  // ⚠️ `i === -1` IS NECESSARY and is NOT a convenience guard: without it,
  //    `argv[i + 1]` would be `argv[0]` — so a NUMERIC first argument
  //    would be read as a budget although no `--budget` was declared.
  //    It does not show with a real argv (argv[0] = node's path), hence a
  //    dedicated test that makes the case OBSERVABLE: without it, 7 mutants survived
  //    here, and the guard proved nothing.
  // ⚠️ The bound `i + 1 >= argv.length` was REMOVED (05/08/2026): it was
  //    REDUNDANT — `argv[i + 1]` is then `undefined`, `Number(undefined)`
  //    is `NaN`, and `Number.isInteger` already rejects it. We ELIMINATE an
  //    equivalence by construction, we NEVER disable it with a
  //    Stryker comment.
  if (i === -1) return undefined;
  const n = Number(argv[i + 1]);
  if (!Number.isInteger(n) || n < 0) return undefined; // unreadable value = floor
  return n === 0 ? Infinity : n;
}

// ═══════════════════════════════════════════════════════════════════════
// A REFUSED CONNECTION IS SAID OUT LOUD — ONCE PER SESSION (2026-08-22)
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 THE SILENCE THIS CLOSES. Whoever cannot reach the state authority still
//    acts: the harness gets its refusal, drops the declaration, and NOTHING of
//    ours runs — no error, no badge, nothing red. The agent then works without
//    the knowledge it was owed and cannot know it. This repository's doctrine is
//    not "zero bugs", it is **zero SILENT bugs**.
// 🛑 IT REPORTS AN OBSERVATION, NEVER A CAUSE. "The daemon is down", "the http
//    lane is dead" are guesses about WHY, made by a layer that only sees WHAT —
//    and a layer that observes a refusal has no authority over another
//    component's state. Same discipline as the `N doc(s) WITHHELD` count of
//    `pretool-core.js`: what we say is what happened TO US.
// 🛑 THE FACT IS THE KERNEL'S, NOT A PROBE'S. `ECONNREFUSED` (a socket or port
//    nobody owns) and `ENOENT` (a named pipe that does not exist) come back
//    IMMEDIATELY, from the OS. **No timer, no heartbeat, no delay used as a
//    verdict** — a liveness probe here would be the very inference this whole
//    lane exists to remove.
// ⚠️ ONCE PER SESSION. A permanent alarm becomes wallpaper — the lesson the
//    capacity alarm and the withholding notice were both taught. "Once" is
//    anchored in the scope's own record, so it survives between processes and is
//    cleared by a compaction like every other `once` in the framework.

// 🛑 A CLOSED LIST, AND ITS TWO ENTRIES ARE THE KERNEL'S TWO WAYS OF SAYING
//    "nobody is listening at this address": `ECONNREFUSED` on a socket or a
//    port, `ENOENT` on a Windows named pipe that does not exist. Anything else
//    (a truncated response, an unreadable body, a permission error) is NOT a
//    refusal and must stay SILENT: accusing on `EACCES` would report a refusal
//    that never happened, and a witness that cries wrong gets unplugged.
const REFUSAL_CODES = ['ECONNREFUSED', 'ENOENT'];

// ⚠️ THE SENTENCE IS PART OF THE CONTRACT, hence written here and asserted
//    literally by the cells — its SECOND half exists to stop a reader inferring
//    a cause from a fact.
const REFUSAL_NOTICE = '⚠️ ctxroute: the kernel REFUSED the connection to this '
  + 'framework\'s state address. That is all this hook observed — no cause is claimed. '
  + 'Said once per session.';

/**
 * SHOULD THIS PROCESS SAY IT WAS REFUSED?
 *
 * ⚠️ PURE ON PURPOSE (doctrine: isolate the decision before mutating). Written
 *    next to the `console.log` it would ship measured by nothing — Stryker never
 *    mutates an I/O shell.
 *
 * @param {string|undefined|null} code  the kernel's error code, verbatim
 * @param {{refused?: boolean}|null|undefined} state  the scope's record as READ
 *   (never guessed: an empty literal here would assert "never said before" and
 *   would make the notice repeat on every turn)
 * @returns {{say: boolean, message: string}} `say:false` ⇒ total silence
 */
function refusalNotice(code, state) {
  if (!REFUSAL_CODES.includes(code)) return { say: false, message: '' };
  if (state && state.refused === true) return { say: false, message: '' };
  return { say: true, message: REFUSAL_NOTICE };
}

module.exports = {
  REFUSAL_CODES,
  REFUSAL_NOTICE,
  refusalNotice,
  declaredBudget,
  parseFrameArgs,
  sanitizeSessionId,
  scopeId,
  serverName,
  toolSuffix,
  isSafePathSegment,
  getByPath,
  thresholdFor,
  modeFor,
  isServerActive,
  resolvedTarget,
  targetExcluded,
  isFrameworkEnabled,
  shouldShowNotification,
  formatSystemMessage,
  joinSystemMessage,
  shouldInjectFor,
  docCandidatePaths,
};
