// ═══════════════════════════════════════════════════════════════════════
// GATE — EVERY DECLARED STORE IS KNOWN TO THE RESET (coupling by STORAGE)
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ WHY THIS GATE EXISTS (07/08/2026, REFACTOR-PLAN ㉕). `reset.md` has carried
//    for weeks the instruction "Every new store MUST be added here
//    in the SAME gesture" — **in PROSE**. Yet the repo's doctrine is explicit:
//    an invariant that depends on vigilance ends up being violated, and this one
//    fails SILENTLY ("forgetting one breaks nothing visible: it produces
//    docs never re-injected after compaction, discovered sessions
//    later"). An instruction that no machine checks is a wish.
//
// ⚠️ THE CLASS IT ADDRESSES: coupling by STORAGE — two files
//    that agree on a prefix literal without any code link
//    connecting them. `dependency-cruiser` sees the IMPORTS, `couches-gate` sees the
//    GLOBALS: neither can see that a module writes into a store
//    that nobody purges.
//
// 🛑 WHAT IT DOES **NOT** DO, AND ONE MUST KNOW IT SO AS NOT TO RELY ON IT.
//    It proves that a store is KNOWN to the reset. It does NOT prove that a reader
//    TOLERATES the purge — that is to say exactly the regression of 07/08/2026
//    (`canari-check` started depending on a counter purged in PreCompact,
//    hence a blindness window after each compaction). That part is
//    SEMANTIC, hence undecidable: "does this component need continuity?"
//    cannot be read in the code. It stays covered by a CASE TEST
//    ("AFTER COMPACTION" in `canary-check.test.js`), not by a gate.
//    ⇒ NEVER present this file as closing the whole class. A gate
//    sold beyond what it proves is worse than an absent gate: one stops
//    looking.
//
// ⚠️ DERIVED FROM BOTH SIDES, never a copied list: the purged prefixes
//    are read IN `ctxroute-reset.js`, the used prefixes IN the sources.
//    A hardcoded list here would have the very defect we fix.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const RESET = 'src/hooks/ctxroute-reset.js';

function sourceFiles() {
  const out = [];
  for (const d of ['src', 'src/sources', 'src/hooks', 'tools']) {
    const abs = path.join(repo, d);
    if (!fs.existsSync(abs)) continue;
    for (const f of fs.readdirSync(abs)) {
      if (!f.endsWith('.js') || f.includes('.test.')) continue;
      out.push(path.join(d === '.' ? '' : d, f).replace(/\\/g, '/'));
    }
  }
  return out;
}

/**
 * Prefixes that the reset SWEEPS, read from its purge loop.
 * ⚠️ We read the LOOP (`for (const prefix of [...])`), not the whole file:
 *    its comments cite the prefixes too, and counting them would make the
 *    gate GREEN even if the real loop forgot one — a gate that
 *    settles for a mention is a gate that certifies prose.
 */
function purgedPrefixes(source) {
  const block = /for\s*\(\s*const\s+prefix\s+of\s*\[([^\]]*)\]/.exec(source);
  if (!block) return null;                       // loop not found ⇒ broken gate
  return new Set([...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
}

/**
 * Prefixes DECLARED by a module as a store key.
 *
 * ⚠️ TWO CONDITIONS, AND THE SECOND WAS PAID FOR AT THE FIRST RUN: the file must
 *    declare a `…PREFIX = '…'` **AND** use `session-store`. Without the
 *    second, the gate accused `sources/skill.js`, which declares
 *    `PREFIX = 'skill/'` — a DOC IDENTIFIER prefix, not a store.
 *    That module is PURE: it touches no state, it has nothing to have purged.
 * 🛑 THE LESSON, MORE USEFUL THAN THE FIX: my comment claimed that the pattern
 *    targeted "the declaration of a store", whereas the code captured EVERY
 *    constant named PREFIX. A gate is judged on what it REALLY matches,
 *    never on what its comment claims. The false positive appeared at the
 *    first run because the gate was run on the real repo before being
 *    declared finished — that is the only way to see them.
 * ⚠️ Do NOT "fix" this by requiring the prefix to end with `-`: that would
 *    work by ACCIDENT (`skill/` does not end with `-`) and not by
 *    semantics. The day a real store were named `cache/`, the gate
 *    would go blind again without anyone knowing.
 */
function declaredPrefixes(source) {
  if (!/require\(\s*['"](?:\.\.?\/)+(?:src\/)?session-store['"]\s*\)/.test(source)) return [];
  return [...source.matchAll(/(?:STORE_)?PREFIX\s*=\s*'([^']+)'/g)].map((m) => m[1]);
}

const lireReel = (rel) => fs.readFileSync(path.join(repo, rel), 'utf8');

test('GATE: every store declared in the repo is PURGED by the reset', () => {
  const purges = purgedPrefixes(lireReel(RESET));
  assert.ok(purges, `the purge loop cannot be found in ${RESET}: it is the GATE that is broken, not the repo.`);

  // Existence net: a scan that finds nothing any more would be GREEN while
  // analyzing NOTHING — the most treacherous failure mode of a derived gate.
  assert.ok(purges.size >= 3, `only ${purges.size} purged prefix(es) found: broken reading pattern.`);

  const orphelins = [];
  for (const f of sourceFiles()) {
    for (const p of declaredPrefixes(lireReel(f))) {
      if (!purges.has(p)) orphelins.push(`${f} declares the store '${p}'`);
    }
  }
  assert.deepStrictEqual(
    orphelins, [],
    'STORE NOT PURGED — it would survive the compaction, and NOTHING would say so:\n  '
    + orphelins.join('\n  ')
    + `\n⇒ add the prefix to the loop of ${RESET}. A state that crosses a `
    + 'compaction makes docs be re-injected (or silenced) on the strength of a context that no longer exists.',
  );
});

test('GATE: no DEAD purge (a swept prefix that nobody writes any more)', () => {
  // ⚠️ INVERSE PART, same doctrine as the stale exemptions elsewhere: a
  //    purge whose store has disappeared is a vestige that makes one BELIEVE in
  //    coverage. It must be removed, or the store reintroduced.
  // ⚠️ ASSUMED TOLERANCE: `ctxroute-seen-` belongs to `legacy-mcp-inject.js`,
  //    a relic kept as the differential's oracle — it does declare its
  //    prefix, so it passes. If the relic disappeared one day, this part
  //    would turn red and would remind us to clean the loop: that is intentional.
  const purges = purgedPrefixes(lireReel(RESET));
  const declares = new Set(sourceFiles().flatMap((f) => declaredPrefixes(lireReel(f))));
  const morts = [...purges].filter((p) => !declares.has(p));
  assert.deepStrictEqual(
    morts, [],
    'DEAD PURGE — the loop sweeps a store that no module writes any more:\n  '
    + morts.join(', ')
    + '\n⇒ remove it from the loop, or explain in writing why it must survive.',
  );
});

test('NEGATIVE-CHECK: the gate TURNS RED on a non-purged store (IN-MEMORY sabotage)', () => {
  // ⚠️ IN-MEMORY SABOTAGE, NEVER ON A REAL FILE: the 1st version of a
  //    negative-check in this repo modified a file in place and brought down
  //    38 tests of other suites that were reading it IN PARALLEL.
  // ⚠️ WITHOUT THIS PART, the gate above is GREEN today (measured: 5 purged
  //    cover 6 usages) and nobody would ever know whether it CAN turn red. A
  //    gate never seen red is a gate one BELIEVES is in place.
  const purges = purgedPrefixes(lireReel(RESET));
  // ⚠️ The sabotage MUST include the `require('../src/session-store')`: it is the
  //    very condition of the pattern. Without it, this negative-check would pass for a
  //    bad reason (zero prefixes found) and would be INERT — the trap it
  //    exists to avoid.
  const sabotaged = "const store = require('../src/session-store');\nconst STORE_PREFIX = 'canari-brouillon-';";
  const orphelins = declaredPrefixes(sabotaged).filter((p) => !purges.has(p));
  assert.deepStrictEqual(
    orphelins, ['canari-brouillon-'],
    'the gate DOES NOT SEE a non-purged store: it certifies instead of protecting.',
  );

  // …and it does NOT scream on a legitimate store (otherwise it would be noisy, hence dead).
  assert.deepStrictEqual(
    declaredPrefixes("const store = require('../src/session-store');\nconst STORE_PREFIX = 'doc-seen-';")
      .filter((p) => !purges.has(p)),
    [],
    'the gate accuses a store that is nevertheless purged: false positive, it will end up unplugged.',
  );

  // …and it IGNORES a prefix that is NOT a store (the REAL false positive of the
  // first run: `sources/skill.js`, a PURE module, a doc identifier prefix).
  assert.deepStrictEqual(
    declaredPrefixes("const PREFIX = 'skill/';"), [],
    'the gate takes an IDENTIFIER prefix for a store: it would scream on pure code.',
  );
});
