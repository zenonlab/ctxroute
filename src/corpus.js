// ═══════════════════════════════════════════════════════════════════════
// CORPUS — recursive reading of the file docs (.md). SHARED I/O.
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ SHARED by FIVE consumers: `source-adapters.js` (hence the GATE, the hot
//    path of every agent), `session-inject.js`, `lint-corpus.js`,
//    `explain.js`, `check-collisions.js`.
//    Extracted on 16/07/2026 so that only ONE reading of the corpus exists —
//    two copies of readCorpus would diverge silently (jscpd gate).
//    Any change here = re-prove through doc-inject.test.js AND lint-corpus.test.js.
// 🛑 THIS LIST HAS LIED TWICE, ALWAYS THE SAME WAY — it named a RELIC as the
//    production consumer. Until 09/08/2026 it said "wired in prod" of a hook
//    unwired since 17/07; until 21/08/2026 it still counted that hook as a
//    sixth consumer, months after the switch-over (removed with the relic).
//    A consumer list is maintained WITH the deletion, never after: it is what
//    tells the next agent the real blast radius — breaking this file breaks
//    injection for the WHOLE fleet.
//
// ⚠️ NO try/catch HERE: fail-open belongs to the CALLER (the gate swallows
//    everything) — swallowing it here would hide the error from the tests.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const fs = require('fs');
const path = require('path');
const { createCorpusCache } = require('./corpus-cache');

/**
 * Recursively reads every .md under `dir`.
 * @param {string} dir - root folder (e.g. paths.fileDocsDir())
 * @param {string} prefix - prefix of the doc ids (e.g. 'docs/' → ids 'docs/x.md',
 *   IDENTICAL to the `doc` fields of protected-paths.json — a condition of the
 *   oracle/reconcile).
 * @param {string[]} [dirsOut] - OPTIONAL collector: every directory this walk
 *   ENTERS is appended to it. It exists so the cache can watch exactly what was
 *   read — ⚠️ the set is DERIVED from the walk, never a hand-written list, for
 *   the same reason `watchOwnCode` derives its set from `require.cache`: a list
 *   rots, and a watcher that rots goes silently deaf.
 * @returns {Array<{doc: string, text: string}>}
 */
function walk(dir, prefix, dirsOut) {
  const out = [];
  if (dirsOut) dirsOut.push(dir);
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix + e.name;
    if (e.isDirectory()) out.push(...walk(path.join(dir, e.name), rel + '/', dirsOut));
    else if (e.name.endsWith('.md')) out.push({ doc: rel, text: fs.readFileSync(path.join(dir, e.name), 'utf8') });
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════
// THE RESIDENT SNAPSHOT — off unless a LONG-LIVED process asks for it.
// ═══════════════════════════════════════════════════════════════════════
// 📐 MEASURED 2026-08-20: a daemon round trip is 41.49 ms of which 0.17 ms is
//    TRANSPORT. The 41 ms are this very walk, repeated on every request. That is
//    where the remaining win of the http lane lives — see `corpus-cache.js`.
// 🛑 `null` BY DEFAULT, AND IT IS THE PARITY GUARANTEE, not a convenience. Every
//    spawned hook, every lint, every test and `explain.js` keep walking the disk
//    exactly as before, byte for byte, so `pretool-differential` and
//    `mcp-differential` see nothing change. **Only a process that can be TOLD a
//    file moved is allowed to hold a snapshot of it.**
// 🛑 AN ARGUMENT, NEVER AN ENVIRONMENT VARIABLE — the same rule as the state
//    backend, for the same measured reason: env vars are INHERITED, and one leak
//    would give a spawned hook a cache it can never invalidate.
/** @type {{read: Function, invalidateAll: Function, size: Function}|null} */
let cache = null;

/**
 * Turns the resident snapshot ON for THIS process.
 * @param {(dir: string, cb: () => void) => {close: () => void}} watch the kernel
 *   notification (the daemon passes `fs.watch`); injected so a test drives the
 *   invalidation deterministically instead of racing a real filesystem.
 * @param {number} [maxRoots] the ceiling, for a test that must reach it without
 *   inventing eight corpora.
 */
function enableCache(watch, maxRoots) {
  disableCache();
  cache = createCorpusCache({ read: walk, watch, maxRoots });
}

/** Turns it OFF and releases every watcher. Idempotent. */
function disableCache() {
  if (cache) cache.invalidateAll();
  cache = null;
}

/** @returns {number} resident roots — 0 when the cache is off. Observability, no probe. */
function cacheSize() {
  return cache ? cache.size() : 0;
}

/**
 * THE single reading of the corpus. Signature and result unchanged.
 * ⚠️ `dirsOut` present ⇒ the caller wants the WALK itself (that caller is the
 *    cache): serving it a snapshot would leave `dirsOut` empty and produce a
 *    cached root with NO watcher — a stale corpus served for ever, in silence.
 */
function readCorpus(dir, prefix, dirsOut) {
  if (cache && dirsOut === undefined) return cache.read(dir, prefix);
  return walk(dir, prefix, dirsOut);
}

module.exports = { readCorpus, enableCache, disableCache, cacheSize };
