// ═══════════════════════════════════════════════════════════════════════
// COLLECTION — SINGLE SOURCE of "which docs for this payload?"
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ EXTRACTED from pretool-core.js on 31/07/2026 for `explain.js`. EXACT REASON:
//    the introspection tool MUST question EXACTLY what the gate
//    executes. A 2nd implementation of the collection would diverge — and that is
//    PRECISELY the bug that `explain` exists to make impossible
//    (REFACTOR-PLAN §E: a whole session lost to reimplementing the
//    engine by hand, 3 false probes, a FALSE conclusion about the engine).
//    Two callers, one single piece of code: divergence no longer has anywhere to be born.
//
// ⚠️ ZERO DECISION HERE. The collection lays down the CANDIDATES; `gate.js`
//    decides (cadence, dedup, ask). NEVER add a "practical" filter here:
//    the gate and explain would see two realities, which is the only
//    failure this tool could not catch up with.
//
// ⚠️ The ORDER of the ADAPTERS registry is MEANINGFUL (concatenation order,
//    and file→tool dependency: toolAdapter reuses acc.decls/bodies laid down
//    by fileAdapter). Iterate ADAPTERS as is, never a sorted copy.
//
// ⚠️ I/O assumed (the adapters read the fleet): this module is therefore
//    NEVER mutated by Stryker and is imported by NO pure module.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const fs = require('fs');
const { ADAPTERS } = require('./source-adapters');
const paths = require('./paths');

// User config — fail-open: absent/unreadable = framework defaults
// (behaviour identical to the gate: the framework stays ACTIVE without a config).
function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(paths.configPath(), 'utf8'));
  } catch {
    return {};
  }
}

// Empty accumulator at the CONTRACT of the registry (cf source-adapters.js header).
function emptyAcc() {
  return { matched: [], decls: {}, bodies: {}, labels: {}, owner: {}, meta: {} };
}

/**
 * Collects ALL the sources for a given payload.
 * @param {any} config  - user config (loadConfig()).
 * @param {any} payload - { toolName, toolInput, cwd } — NEUTRAL shape,
 *                           never the raw payload of a harness (the sources
 *                           know no dialect, CI gate).
 * @returns {{ matched: string[], decls: Object<string,any>, bodies: Object<string,string>, labels: Object<string,string>, owner: Object<string,string>, meta: any }} acc
 */
function collectAll(config, payload) {
  const acc = emptyAcc();
  for (const a of ADAPTERS) a.collect(config, payload, acc);
  return acc;
}

module.exports = { collectAll, loadConfig, emptyAcc };
