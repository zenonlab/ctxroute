#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// SHADOW ANALYSIS — replays the ORACLE on the log, reports the divergences.
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ OFFLINE, on demand (`node shadow-reconcile.js`) — never in the hot
//    path. It is THIS that gives the switch-over verdict: "N days of real traffic,
//    zero divergence". Diagnostic → it SCREAMS (exit 1) at the first divergence,
//    exit 2 if the log is EMPTY ("could not measure" ≠ "nothing to report" —
//    a dead shadow that logs nothing would look like a perfect shadow).
//
// ⚠️ DEDUP by payload: the log contains every tool call; replaying
//    the oracle (one spawn ≈ 440 ms) on thousands of duplicates would be pointless.
//    ZERO silent cap: all the UNIQUE payloads are replayed, counted,
//    announced.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const paths = require('../paths');
const { legacyDocs } = require('../oracle');

const LEGACY = process.env.CTXROUTE_LEGACY_PATH || path.join(os.homedir(), '.claude', 'hooks', 'protect-files.js');

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

async function main() {
  const stateDir = paths.stateDir();
  const journaux = fs.existsSync(stateDir)
    ? fs.readdirSync(stateDir).filter((f) => /^shadow-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
    : [];

  const uniques = new Map(); // payload key -> { toolName, toolInput, docs }
  let lines = 0;
  for (const j of journaux) {
    for (const l of fs.readFileSync(path.join(stateDir, j), 'utf8').split('\n')) {
      if (!l.trim()) continue;
      lines++;
      let e;
      try { e = JSON.parse(l); } catch (err) { continue; } // corrupted line (crash mid-write): ignored, still counted
      uniques.set(JSON.stringify([e.toolName, e.toolInput]), e);
    }
  }

  console.log(`logs: ${journaux.length} · logged calls: ${lines} · unique payloads: ${uniques.size}`);
  if (uniques.size === 0) {
    console.error('⚠️ EMPTY LOG — the shadow measured nothing (dead hook? no traffic yet?). Nothing to conclude.');
    process.exit(2);
  }

  const entries = [...uniques.values()];
  const divergences = (
    await mapPool(entries, 12, async (e) => {
      const expected = await legacyDocs(LEGACY, { toolName: e.toolName, toolInput: e.toolInput });
      return expected.join('|') === (e.docs || []).join('|')
        ? null
        : { toolName: e.toolName, toolInput: e.toolInput, former: expected, nouveau: e.docs };
    })
  ).filter(Boolean);

  if (divergences.length) {
    console.error(`✖ ${divergences.length}/${entries.length} DIVERGENCES (first 5):`);
    for (const d of divergences.slice(0, 5)) console.error(JSON.stringify(d));
    process.exit(1);
  }
  console.log(`✔ 0 divergence over ${entries.length} unique payloads of REAL traffic.`);
}

main();
