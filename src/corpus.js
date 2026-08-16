// ═══════════════════════════════════════════════════════════════════════
// CORPUS — recursive reading of the file docs (.md). SHARED I/O.
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ SHARED by SIX consumers: `source-adapters.js` (hence the GATE, the hot
//    path of every agent), `session-inject.js`, `lint-corpus.js`,
//    `explain.js`, `check-collisions.js` — and the relic `shadow-inject.js`.
//    Extracted on 16/07/2026 so that only ONE reading of the corpus exists —
//    two copies of readCorpus would diverge silently (jscpd gate).
//    Any change here = re-prove through doc-inject.test.js AND lint-corpus.test.js.
// 🛑 THIS LINE USED TO SAY « shadow-inject.js (WIRED IN PROD) » (fixed on
//    09/08/2026): shadow-inject has been UNWIRED since 17/07/2026, its role of
//    rehearsal before the switchover being over. The comment therefore named a
//    relic as the production consumer, and SAID NOTHING about the gate — that is
//    the exact opposite of the real blast radius: breaking this file breaks
//    injection for the WHOLE fleet, not a shadow that no longer runs.
//
// ⚠️ NO try/catch HERE: fail-open belongs to the CALLER (the shadow swallows
//    everything, so does the gate) — swallowing it here would hide the error
//    from the tests.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Recursively reads every .md under `dir`.
 * @param {string} dir - root folder (e.g. paths.fileDocsDir())
 * @param {string} prefix - prefix of the doc ids (e.g. 'docs/' → ids 'docs/x.md',
 *   IDENTICAL to the `doc` fields of protected-paths.json — a condition of the
 *   oracle/reconcile).
 * @returns {Array<{doc: string, text: string}>}
 */
function readCorpus(dir, prefix) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix + e.name;
    if (e.isDirectory()) out.push(...readCorpus(path.join(dir, e.name), rel + '/'));
    else if (e.name.endsWith('.md')) out.push({ doc: rel, text: fs.readFileSync(path.join(dir, e.name), 'utf8') });
  }
  return out;
}

module.exports = { readCorpus };
