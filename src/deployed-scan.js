// ═══════════════════════════════════════════════════════════════════════
// deployed-scan.js — THE I/O HALF of the deployed-drift comparison.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 WHY THIS EXISTS, SPLIT OUT 2026-09-03: `tools/doctor.js` and
//    `tools/deploy.js` both need the SAME reading — the `git ls-files src`
//    scope (THE AUTHORITY, never a hand-rolled glob), the line-ending
//    NORMALISATION before hashing, and the paired repo/deployed hash for
//    every tracked file. Two copies of that reading are two truths that
//    diverge; this module is the SINGLE source both callers consume.
// ⚠️ MEASURED FACT, NOT TO REDISCOVER: a real deployed copy and this repo
//    differ by LINE-ENDING STYLE on some files (repo `\r\n`, deployed `\n`)
//    while carrying identical CONTENT once `\r` is stripped. Hash the
//    NORMALISED text, never the raw bytes, or every comparison is red on
//    day one and gets ignored.
// ⚠️ THIS FILE DECIDES NOTHING: it RETURNS pre-hashed `{relPath, repoHash,
//    deployedHash}` entries (or a named failure to reach `git`). The
//    verdict on those entries is `deployedDriftVerdict` in
//    `src/doctor-wiring-pure.js` — a PURE module, mutated. Putting the
//    decision here would leave it outside Stryker's reach, exactly the
//    defect `doctor-wiring-pure.js`'s own header already explains.
// 🛑 I/O ONLY (fs, path, child_process) — never imported by a `*-pure.js`
//    module. Sealed by the same purity gates that already forbid the
//    reverse.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

/** @typedef {import('./doctor-wiring-pure').DriftEntry} DriftEntry */

function normalizeForHash(buf) {
  return buf.toString('utf8').replace(/\r\n/g, '\n');
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

/**
 * The `src/` scope, per `git ls-files` — THE AUTHORITY on what is tracked.
 * @param {string} repoDir
 * @returns {{ok: true, relPaths: string[]}|{ok: false, error: string}}
 */
function lsFilesSrc(repoDir) {
  // 🛑 SCRUB THE WHOLE `GIT_*` FAMILY: git EXPORTS `GIT_DIR`/`GIT_INDEX_FILE` to
  //    every hook it runs and a child INHERITS them — and those BEAT `cwd`. This
  //    scan decides what production is reconciled against, so an inherited pointer
  //    would have it list the files of WHOEVER invoked us and copy those instead.
  //    Nobody can enumerate what a future git version exports, hence the family.
  // ⚠️ WRITTEN `env: env`, NOT the `{ env }` shorthand: `git-env-door-gate` reads
  //    the EXPLICIT property and reports a shorthand as "no env: option".
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('GIT_')) delete env[k];
  const ls = spawnSync('git', ['ls-files', 'src'], { cwd: repoDir, env: env, encoding: 'utf8' });
  if (ls.status !== 0 || typeof ls.stdout !== 'string') {
    return {
      ok: false,
      error: (ls.stderr || '').trim() || (ls.error && ls.error.message) || 'unknown error',
    };
  }
  // ⚠️ Written as THREE separate statements, never chained: `.split().map().filter()` chains
  //    read as a NESTED traversal in the AST (`no-undeclared-quadratic`) even though the real
  //    cost is linear (each pass walks the SAME bounded list once).
  const rawLines = ls.stdout.split('\n');
  const trimmedLines = rawLines.map((s) => s.trim());
  const relPaths = trimmedLines.filter(Boolean);
  return { ok: true, relPaths };
}

/**
 * Pre-hashed entries for the drift verdict — one per tracked `relPath`, repo text read and
 * NORMALISED before hashing, deployed side hashed the same way or left `null` (absent).
 * A repo file the shell cannot re-read is a REPO problem, not a deployment one: it is left out
 * of the comparison entirely rather than accusing the deployed copy of it.
 * @param {string} repoDir
 * @param {string} deployedDir
 * @param {string[]} relPaths
 * @returns {DriftEntry[]}
 */
function buildEntries(repoDir, deployedDir, relPaths) {
  const entries = [];
  for (const relPath of relPaths) {
    let repoText = null;
    try { repoText = normalizeForHash(fs.readFileSync(path.join(repoDir, relPath))); } catch { /* stays null */ }
    if (repoText === null) continue;
    let deployedHash = null;
    try { deployedHash = sha256(normalizeForHash(fs.readFileSync(path.join(deployedDir, relPath)))); } catch { /* stays null: absent on the deployed side */ }
    entries.push({ relPath, repoHash: sha256(repoText), deployedHash });
  }
  return entries;
}

/**
 * The full scan: `git ls-files src` then the paired hashes. A single entry point for both
 * `tools/doctor.js` (read-only comparison) and `tools/deploy.js` (comparison feeding a copy
 * plan) — one caller, one reading.
 * @param {string} repoDir
 * @param {string} deployedDir
 * @returns {{ok: true, relPaths: string[], entries: DriftEntry[]}|{ok: false, error: string}}
 */
function scan(repoDir, deployedDir) {
  const ls = lsFilesSrc(repoDir);
  if (ls.ok === false) return { ok: false, error: ls.error };
  const entries = buildEntries(repoDir, deployedDir, ls.relPaths);
  return { ok: true, relPaths: ls.relPaths, entries };
}

module.exports = { normalizeForHash, sha256, lsFilesSrc, buildEntries, scan };
