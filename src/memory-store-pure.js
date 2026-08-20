// ═══════════════════════════════════════════════════════════════════════
// MEMORY-STORE-PURE — the DECISIONS of a daemon's state. Zero I/O.
// ═══════════════════════════════════════════════════════════════════════
//
// 🛑 EXTRACTED FROM `memory-store.js` ON PURPOSE (2026-08-20), and the reason is
//    the house rule that has already bitten here: a decision buried inside an
//    I/O shell is a decision NOBODY MUTATES — Stryker never touches an I/O file
//    (equivalent mutants guaranteed), so the LRU, the ceiling and the shape
//    validation would have shipped measured by nothing. `scope-reach-pure.js`
//    was born the same way, and it was `/stack-audit` that found it.
// ⚠️ WHAT LIVES HERE: everything that DECIDES — which key wins, which scope is
//    evicted, what a snapshot is allowed to contain. What lives next door:
//    reading and writing the file, and nothing else.
// ⚠️ A `Map`, never a plain object: insertion order is part of the contract (it
//    IS the LRU, with no second structure), and a session id is arbitrary text
//    from a harness — on an object, `__proto__` is not a key but an assignment
//    to the prototype.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

// 🛑 A CEILING IN THE SAME GESTURE AS THE WRITER — the space doctrine, applied
//    to RAM. A daemon runs for weeks and no payload ever says "this session is
//    over". Unbounded growth is not "a big number", it is a DATED outage.
// ⚠️ THE BOUND IS A COUNT, NEVER AN INFERENCE ABOUT DEATH. We do not guess that
//    a session ended — that is undecidable from here, and guessing it is what
//    this whole refactor removes. We keep the N most recently used and drop the
//    coldest: no clock, no liveness probe, nothing to tune.
// ⚠️ 512: far above any real fleet use (one scope per session, plus one per
//    sub-agent), and eviction hits the LEAST RECENTLY USED — by construction the
//    scope nobody has touched. Losing it costs at most one extra delivery.
const MAX_SCOPES = 512;

/** @param {string} prefix @param {string} sessionId */
function key(prefix, sessionId) {
  return `${prefix}${sessionId}`;
}

/**
 * @param {Map<string, object>} etat
 * @param {number} max
 */
function evict(etat, max) {
  // `Map.keys()` yields in insertion order, so the first key IS the coldest.
  let retires = 0;
  while (etat.size > max) { etat.delete(etat.keys().next().value); retires += 1; }
  return retires;
}

/**
 * READ = A USE. Re-inserting moves the entry to the young end.
 * ⚠️ Without this, the BUSIEST session is the one evicted: it is read at every
 *    action but rewritten only when something changes, so a pure write-order
 *    LRU would rank it as cold. Measured intent, not a refinement.
 */
function touch(etat, k) {
  const v = etat.get(k);
  if (v === undefined) return undefined;
  etat.delete(k);
  etat.set(k, v);
  return v;
}

/**
 * WHAT A SNAPSHOT IS ALLOWED TO CONTAIN.
 * 🛑 `JSON.parse` succeeding is NOT the guardrail — a perfectly valid JSON can
 *    carry an object where an array is expected, or a pair that is not a pair.
 *    The SHAPE check is the guardrail, and it is fail-open: what does not
 *    conform is DROPPED, never thrown. A corrupt save costs one extra
 *    delivery; a daemon refusing to start would cost the fleet its injection.
 * @param {unknown} brut
 * @param {Map<string, object>} etat
 * @param {number} max
 */
function adopt(brut, etat, max) {
  if (!Array.isArray(brut)) return 0;
  for (const paire of brut) {
    if (!Array.isArray(paire) || paire.length !== 2) continue;
    const [k, v] = paire;
    if (typeof k !== 'string' || !v || typeof v !== 'object' || Array.isArray(v)) continue;
    etat.set(k, v);
  }
  evict(etat, max);
  return etat.size;
}

/**
 * PURGE BY PREFIX — what a compaction means: the real context was emptied, so
 * the memory of what was injected before no longer describes anything.
 * ⚠️ It is an ORDER received from the harness (an EVENT), never a deduction
 *    made here about a session being over.
 */
function purge(etat, prefixeCle) {
  let n = 0;
  for (const k of [...etat.keys()]) if (k.startsWith(prefixeCle)) { etat.delete(k); n += 1; }
  return n;
}

module.exports = { key, evict, touch, adopt, purge, MAX_SCOPES };
