// ═══════════════════════════════════════════════════════════════════════
// PROPERTY-BASED (fast-check) — invariants of lib-pure.js on generated inputs
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ WHY IN ADDITION to the case-based tests (lib-pure.test.js): a case-based test
// only covers the inputs the author THOUGHT of. For a
// parser/sanitizer, that is precisely the blind spot — the attacker (or
// reality) supplies the input nobody thought of. Doctrine:
// "parser/serializer/scan → AUTOMATIC property-based testing".
//
// lib-pure.js IS a parser: serverName()/toolSuffix() split a format
// ("mcp__{server}__{tool}"), getByPath() interprets a dotted path,
// isSafePathSegment() is a sanitizer. All 4 are here.
//
// ⚠️ SECURITY INVARIANTS (property 1): NEVER weaken them. They
// say "NO input whatsoever makes a path escape from
// docs/mcp/" — a universal guarantee, not a list of known attacks.
//
// ⚠️ These properties are TOTAL: they also require "never throws".
// A throw in lib-pure would bubble up to the hook → fail-open → silence.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import fc from 'fast-check';
import lib from '../src/lib-pure.js';

// Each fast-check property = EXACTLY ONE vitest test (same name, same
// property, same numRuns) — fc.assert throws on a counter-example, vitest reports.
function prop(name, property) {
  test(name, () => {
    fc.assert(property, { numRuns: 1000 });
  });
}

// ── 1. SECURITY: no candidate can escape docs/mcp/ ──
// THE property test that matters: whatever the tool_name, the server name,
// the subToolParam and the tool_input (arbitrary, including hostile), NO
// produced relPath contains an upward folder separator or a NUL.
prop('SECURITY: no relPath contains ".." nor a NUL byte, whatever the input',
  fc.property(
    fc.string(), fc.string(), fc.string(), fc.anything(),
    (server, toolName, subToolParam, toolInput) => {
      const config = { servers: { [server]: { subToolParam } } };
      const candidates = lib.docCandidatePaths(config, server, toolName, toolInput);
      // ⚠️ ALL the segments are checked, including the SERVER name: that is
      // the one that carried the hole found on 15/07/2026 (serverName accepted `/`).
      return candidates.every((c) =>
        c.relPath.replace(/\.md$/, '').split('/').every(
          (s) => s !== '..' && s !== '.' && s !== '' && !s.includes('\0') && !s.includes('\\')
        ));
    }
  ));

prop('SECURITY: isSafePathSegment rejects ANY string containing a separator or a NUL',
  fc.property(fc.string(), (s) => {
    const dangerous = s.includes('/') || s.includes('\\') || s.includes('\0') || s === '' || s === '.' || s === '..';
    return dangerous ? lib.isSafePathSegment(s) === false : lib.isSafePathSegment(s) === true;
  }));

// ── 2. TOTALITY: lib-pure NEVER throws (a throw = fail-open = silence) ──
prop('TOTALITY: serverName never throws, whatever the input',
  fc.property(fc.anything(), (x) => { lib.serverName(x); return true; }));

prop('TOTALITY: getByPath never throws and only returns string|number|null',
  fc.property(fc.anything(), fc.anything(), (obj, p) => {
    const v = lib.getByPath(obj, p);
    return v === null || typeof v === 'string';
  }));

// ⚠️ Contract: a SAFE server → ≥1 candidate (server level); an UNSAFE server →
// ZERO candidate (never a path outside docs/mcp/). Both branches here.
prop('TOTALITY: docCandidatePaths never throws and honours the contract safe→≥1 / unsafe→0',
  fc.property(fc.anything(), fc.string(), fc.string(), fc.anything(), (config, server, toolName, toolInput) => {
    const c = lib.docCandidatePaths(config && typeof config === 'object' ? config : {}, server, toolName, toolInput);
    if (!Array.isArray(c)) return false;
    return lib.isSafePathSegment(server)
      ? c.length >= 1 && c[0].level === 'server'
      : c.length === 0;
  }));

// ── 3. ROUND-TRIP: serverName ∘ "mcp__{s}__{t}" = identity ──
// An encode↔decode pair → a round-trip property (doctrine).
const serverArb = fc.stringMatching(/^[a-zA-Z0-9-]+(_[a-zA-Z0-9-]+)*$/).filter((s) => s.length > 0 && !s.includes('__'));
prop('ROUND-TRIP: serverName(`mcp__${s}__${t}`) === s for any valid server name',
  fc.property(serverArb, fc.stringMatching(/^[a-zA-Z0-9_]+$/), (s, t) => lib.serverName(`mcp__${s}__${t}`) === s));

prop('ROUND-TRIP: toolSuffix(`mcp__${s}__${t}`, s) === t',
  fc.property(serverArb, fc.stringMatching(/^[a-zA-Z0-9_]+$/), (s, t) =>
    t.length === 0 || lib.toolSuffix(`mcp__${s}__${t}`, s) === t));

// ── 4. SANITISATION: sanitizeSessionId always produces a safe file name ──
prop('sanitizeSessionId: the output is ALWAYS non-empty and [a-zA-Z0-9_-] only',
  fc.property(fc.anything(), (x) => {
    const out = lib.sanitizeSessionId(x);
    return typeof out === 'string' && out.length > 0 && /^[a-zA-Z0-9_-]+$/.test(out);
  }));

// ── 5. DECISION: shouldInjectFor is total and deterministic ──
prop('shouldInjectFor: "dumb" ALWAYS injects, whatever the state',
  fc.property(fc.boolean(), fc.integer(), fc.integer(), (seen, since, th) =>
    lib.shouldInjectFor('dumb', seen, since, th) === true));

prop('shouldInjectFor: never seen → ALWAYS injects, whatever the mode',
  fc.property(fc.string(), fc.integer(), fc.integer(), (mode, since, th) =>
    lib.shouldInjectFor(mode, false, since, th) === true));

prop('shouldInjectFor: "once" already seen → NEVER a re-injection',
  fc.property(fc.integer(), fc.integer(), (since, th) =>
    lib.shouldInjectFor('once', true, since, th) === false));

// ── 6. FAIL-OPEN: an absurd config never disables the framework ──
// Only a literal `enabled: false` cuts — everything else must stay ON.
prop('FAIL-OPEN: only the literal false value disables the framework',
  fc.property(fc.anything().filter((v) => v !== false), (v) =>
    lib.isFrameworkEnabled({ enabled: v }) === true));

prop('FAIL-OPEN: an unknown filterMode → the server is covered (never a silent deactivation)',
  fc.property(fc.string().filter((m) => m !== 'whitelist' && m !== 'blacklist'), fc.string(), (mode, server) =>
    lib.isServerActive({ filterMode: mode, filterList: [] }, server) === true));

// ── LAW 52: whitelist and blacklist are EXACTLY complementary ──────────────
// `targetExcluded` is a pure function with a strong invariant (signals ⇒
// stack doctrine): for ANY list and ANY target, discarded-by-whitelist ⟺
// kept-by-blacklist. A divergence = one of the two modes has its own logic,
// that is to say two truths for one same "targeted" — the class we forbid.
test('LAW 52: targetExcluded(whitelist) === !targetExcluded(blacklist), always', () => {
  fc.assert(fc.property(
    fc.array(fc.oneof(fc.constantFrom('*', 'Bash', 'stripe', ''), fc.string({ maxLength: 12 }))),
    fc.oneof(fc.constantFrom('Bash', 'mcp__stripe__pay', ''), fc.string({ maxLength: 20 })),
    (list, target) => {
      return lib.targetExcluded('whitelist', list, target) === !lib.targetExcluded('blacklist', list, target);
    }
  ));
});
