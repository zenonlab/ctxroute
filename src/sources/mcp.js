// ═══════════════════════════════════════════════════════════════════════
// "MCP" SOURCE — PURE. payload → which MCP docs (corpus ids 'mcp/…').
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ ZERO I/O (same rule as sources/file.js — dependency-cruiser gate).
//    Selection: serverName → docCandidatePaths (3 levels, subToolParam,
//    isSafePathSegment). ⚠️ The filterMode/filterList filter MIGRATED to
//    gate.js (52, 15/08/2026) — see the comment in matchingDocs.
//    All the path semantics live in lib-pure;
//    this module merely ALIGNS the candidates on the gateway's vocabulary
//    (ids 'mcp/{…}.md' = ids of the corpus read by readCorpus(paths.docsDir(), 'mcp/')).
//
// 🔴 THIS BLOCK DESCRIBED A DEAD CASCADE, AND IT KILLED A LIVE ONE
//    (fixed on 09/08/2026). It announced the "config servers.{name}" stage
//    whereas the body of this very file says, 50 lines below, that
//    `servers` carries NO cadence — and the schema PROVES it
//    (`servers.{name}` only allows `subToolParam`, additionalProperties:false).
// ⚠️ REAL EFFECT, measured: `declFor` resolved anyway via `lib.modeFor` /
//    `lib.thresholdFor`, so it ALWAYS supplied a value. Since the cascade of
//    `gate.js` stops at the first value found, stage ②
//    (`defaults.mcp`) was SHORT-CIRCUITED — hence INERT, silently.
//    SAME CLASS as ㊱, on a 3rd channel: `skill.js` had been fixed on
//    04/08, the MCP channel was forgotten.
// ✅ REAL PRECEDENCE, SINGLE POINT = `gate.js`:
//      frontmatter of THE doc  >  defaults.mcp  >  global config  >  framework.
//    This source SUPPLIES what the author declared, and NOTHING else: a key
//    that is absent or invalid is OMITTED, so that the next stage can speak.
// 🛑 `declFor` no longer takes either `config` or `server` — like `skill.js`. Giving
//    them back to it would resurrect the double resolution: it is the SIGNATURE that
//    makes going back impossible, not a comment.
//    Each doc keeps ITS counter (dedup by DOC, cf REFACTOR-PLAN).
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const lib = require('../lib-pure');
const { MODES, DRIFT_UNITS } = require('../frontmatter');

/**
 * Candidate MCP docs for this call. [] if non-MCP tool or filtered server.
 * @param {object} config - ctxroute-config.json
 * @param {{toolName: string, toolInput: object}} payload
 * @returns {Array<{doc: string, sourceLabel: string, level: string, server: string|null}>}
 *   ORDER = global → specific (server, tool, subTool) — same order as
 *   docCandidatePaths, hence as the old engine. `doc` = corpus id ('mcp/x.md').
 */
function matchingDocs(config, { toolName, toolInput }) {
  const server = lib.serverName(toolName);
  // ⚠️ NO `if (!server)` guard here: docCandidatePaths already rejects any
  //    null/unsafe server (isSafePathSegment, defense-in-depth) — a redundant
  //    guard = equivalent Stryker mutant (avoid by construction).
  // ⚠️ THE GLOBAL FILTER HAS LEFT THIS FILE (52, 15/08/2026). `isServerActive`
  //    was resolved HERE from the config — a SOURCE that resolves, class ㊱/㊳
  //    with a 4th face. The filter by TARGET (server OR tool, cascade
  //    defaults.{source} > global) lives in `gate.js::excludedTargetsFor`, a
  //    SINGLE point, and its discarding is OBSERVABLE (`filteredOut`). This source SUPPLIES
  //    the candidates, it no longer discards anything — the end-to-end behavior
  //    is UNCHANGED (the gate discards what the collection used to discard).
  return lib.docCandidatePaths(config, server, toolName, toolInput || {}).map((c) => ({
    doc: 'mcp/' + c.relPath,
    sourceLabel: c.sourceLabel,
    level: c.level,
    server,
  }));
}

// Decl (gate.js vocabulary) of an MCP doc. `fm` = parsed frontmatter of THE doc
// (the author proposes); value absent OR invalid → fallback to the server config
// (the user/global disposes, cf lib-pure). TOTAL: never throws.
// 🛑 THIS COMMENT CAUSED A BUG — FIXED ON 06/08/2026. It said "a decl
//    carries ONLY cadence", and that sentence, CORRECT in substance (a source
//    arbitrates nothing, `gate.js` decides), was read as "so do not copy
//    `enforce`". Result: `enforce` accepted by `validateMcp`, documented
//    everywhere, and INERT on the MCP channel — right where the FOUNDING incident of the
//    framework lives (the Stripe payment click). Discovered while arming it for real.
// ⚠️ THE EXACT DISTINCTION, no longer to be confused: a decl CARRIES what
//    the author declared (mode, threshold, driftUnit, enforce); it RESOLVES
//    no cascade and takes no decision. Carrying ≠ deciding.
// 🛑 EVERY decision key MUST be copied here — `declfor-gate.test.js` derives it
//    from `gate.js` and turns red if a single one is missing. Do not rely on
//    memory: review let `enforce` slip through for 24 h.
function declFor(fm) {
  const data = fm || {};
  const decl = {};
  if (MODES.includes(data.mode)) decl.mode = data.mode;
  if (Number.isInteger(data.threshold) && data.threshold >= 1) decl.threshold = data.threshold;
  // ⚠️ `driftUnit`: the author proposes (frontmatter), otherwise ABSENT — the global
  //    fallback (`defaultDriftUnit`) then framework ('tool') lives in gate.js
  //    (driftUnitForDoc), the UNIQUE cascade point. No per-server: `servers`
  //    carries NO cadence (sealed by config-gate, decision of 17/07/2026).
  if (DRIFT_UNITS.includes(data.driftUnit)) decl.driftUnit = data.driftUnit;
  // ⚠️ `enforce` — WAS MISSING HERE for 24 h (05→06/08/2026). This `declFor`
  //    COPIES key by key: anything not named is lost SILENTLY.
  // ⚠️ Taken AS IS, `false` INCLUDED: it is what allows a doc to
  //    OPT OUT of a `defaults.mcp.enforce`. Filtering it as an "empty"
  //    value would make opting out impossible (same reason as skill.js).
  if (typeof data.enforce === 'boolean') decl.enforce = data.enforce;
  return decl;
}

module.exports = { matchingDocs, declFor };
