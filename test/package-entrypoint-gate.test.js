// ═══════════════════════════════════════════════════════════════════════════
// PACKAGE ENTRY POINT — a published `main`/`exports` must not name a file
// that does not exist, nor the RELIC (DEFECT 1 CLOSED)
// ═══════════════════════════════════════════════════════════════════════════
//
// 🔴 THE MEASURED DEFECT: `package.json` declared `"main":
//    "legacy-mcp-inject.js"` — a path that does not even exist at the repo
//    root (the file lives at `src/hooks/legacy-mcp-inject.js`, and the skill
//    is explicit: that file is the UNWIRED relic, kept only as the MCP
//    differential's oracle + rollback). `require('ctxroute')` therefore
//    either crashed (MODULE_NOT_FOUND) or, had the path been "corrected" to
//    the real relic location, would have loaded dead code. Shipped in 1.1 on
//    the public registry.
//
// ✅ THE HONEST FIX: this package has NO library entry point. It ships hooks
//    and tools consumed by ABSOLUTE PATH from a harness's `settings.json`
//    (see the skill, "Location — standalone folder"), never via
//    `require('ctxroute')`. There is no `bin`, no `files`, no importable
//    surface — inventing a `main` that "works" would be as dishonest as the
//    dead one: a consumer would still be requiring a module this project
//    never designed to be required. `package.json` therefore declares
//    NEITHER `main` NOR `exports`.
//
// 🛑 THIS TEST DOES NOT ENCODE "must be undefined" as a permanent rule — it
//    encodes the ACTUAL invariant: if `main`/`exports` (or `bin`) is EVER
//    declared again, every file it names MUST exist and MUST NOT be a
//    RELIC. The relic set is DERIVED from `FILE-MAP.md` (never a hard-coded
//    filename), because that is the repo's own single source for "which
//    files are unwired relics" — a copied list would drift the day a second
//    relic is retired or a new one appears.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.join(__dirname, '..');

/**
 * DERIVES the set of relic files from FILE-MAP.md — the repo's own
 * exhaustiveness net, which marks a file "RELIC" in prose the moment it is
 * retired from the wiring. Never a hand-written filename list: a list only
 * knows the relics that exist TODAY.
 * @param {string} fileMapText
 * @returns {string[]} relic paths, relative to the repo root (POSIX)
 */
function relicPaths(fileMapText) {
  const out = [];
  for (const m of fileMapText.matchAll(/^- `([^`]+)` — RELIC/gm)) {
    out.push(m[1]);
  }
  return out;
}

/**
 * Decides whether one declared entry-point path is acceptable.
 * PURE (repo root + relic set + an existence probe are all explicit
 * arguments), so this is what the negative-check sabotages — never the real
 * `package.json`.
 * @param {string} declaredPath - as written in package.json (relative)
 * @param {string[]} relics - relative paths, POSIX, from `relicPaths()`
 * @param {(absPath: string) => boolean} exists
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
function checkEntry(declaredPath, relics, exists) {
  const normalized = declaredPath.replace(/^\.\//, '').replace(/\\/g, '/');
  if (relics.includes(normalized)) {
    return { ok: false, reason: `"${declaredPath}" names a RELIC (FILE-MAP.md marks it unwired) — a consumer would load dead code` };
  }
  const abs = path.join(REPO, declaredPath);
  if (!exists(abs)) {
    return { ok: false, reason: `"${declaredPath}" does not exist — require('ctxroute') would crash` };
  }
  return { ok: true };
}

/**
 * Collects every string leaf of package.json's `main`/`exports`/`bin`
 * fields — DERIVED from whatever shape those fields take (string, or the
 * nested conditional-exports object), never a single hard-coded key path.
 * @param {Record<string, unknown>} pkg
 * @returns {string[]}
 */
function declaredEntryPaths(pkg) {
  const out = [];
  const walk = (value) => {
    if (typeof value === 'string') out.push(value);
    else if (value && typeof value === 'object') for (const v of Object.values(value)) walk(v);
  };
  if (pkg.main) walk(pkg.main);
  if (pkg.exports) walk(pkg.exports);
  if (pkg.bin) walk(pkg.bin);
  return out;
}

function realRelicPaths() {
  return relicPaths(fs.readFileSync(path.join(REPO, 'FILE-MAP.md'), 'utf8'));
}

test('ANTI-VACUITY: FILE-MAP.md really derives at least one relic (the check is not blind by construction)', () => {
  const relics = realRelicPaths();
  assert.ok(relics.length >= 1, 'expected FILE-MAP.md to mark at least one RELIC file — the derivation itself may be broken');
  assert.ok(relics.includes('src/hooks/legacy-mcp-inject.js'), 'expected the known relic to be among the derived set');
});

test('①: the REAL package.json declares no main/exports/bin — this package has no library entry point, and says so honestly', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
  assert.equal(pkg.main, undefined, 'a "main" reappeared — it must be validated by ② below, not silently trusted');
  assert.equal(pkg.exports, undefined, 'an "exports" reappeared — it must be validated by ② below, not silently trusted');
});

test('②: whatever main/exports/bin DOES declare (today: nothing) is fully valid', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
  const relics = realRelicPaths();
  const declared = declaredEntryPaths(pkg);
  for (const p of declared) {
    const verdict = checkEntry(p, relics, fs.existsSync);
    assert.ok(verdict.ok, verdict.ok ? '' : verdict.reason);
  }
});

// ⚠️ NEGATIVE-CHECK, on FABRICATED inputs — sabotaging the real package.json
//    in memory during a test run brought down parallel suites elsewhere in
//    this repo before (doc-drift-gate's lesson): the pure function itself is
//    what gets sabotaged.
test('NEGATIVE-CHECK ①: a declared main naming the RELIC turns the verdict RED', () => {
  const verdict = checkEntry('src/hooks/legacy-mcp-inject.js', ['src/hooks/legacy-mcp-inject.js'], () => true);
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /RELIC/);
});

test('NEGATIVE-CHECK ②: a declared main naming a file that DOES NOT EXIST turns the verdict RED', () => {
  const verdict = checkEntry('legacy-mcp-inject.js', [], () => false);
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /does not exist/);
});

test('NEGATIVE-CHECK ③: a declared main naming a real, non-relic file stays GREEN', () => {
  const verdict = checkEntry('src/paths.js', ['src/hooks/legacy-mcp-inject.js'], () => true);
  assert.equal(verdict.ok, true);
});

// The historical defect, replayed exactly as it shipped in package.json
// 1.1: "main": "legacy-mcp-inject.js" at the REPO ROOT — which is doubly
// wrong (wrong path AND, had the path been fixed, a relic). Both reasons
// are independently sufficient; this proves the ROOT-relative form is
// caught (missing file), the dedicated tests above prove the relic form is
// caught too.
test('NEGATIVE-CHECK ④: replays the EXACT historical defect (root-relative dead path) — RED', () => {
  const verdict = checkEntry('legacy-mcp-inject.js', realRelicPaths(), fs.existsSync);
  assert.equal(verdict.ok, false);
});
