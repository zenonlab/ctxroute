// ═══════════════════════════════════════════════════════════════════════
// DETERMINISTIC tests of sources/mcp.js (Stryker target).
// ═══════════════════════════════════════════════════════════════════════
// ⚠️ Targets the module's OWN responsibilities: alignment of corpus ids
//    ('mcp/…'), global→specific order, server filter, resolved decl.
//    The fine-grained semantics (serverName, isSafePathSegment, thresholds) is already
//    sealed in lib-pure.test.js — do not re-test it here in duplicate.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

import { describe, it, test, expect } from 'vitest';
import { matchingDocs, declFor } from '../src/sources/mcp.js';

describe('sources/mcp — matchingDocs', () => {
  it('non-MCP tool → []', () => {
    expect(matchingDocs({}, { toolName: 'Read', toolInput: {} })).toEqual([]);
    expect(matchingDocs({}, { toolName: '', toolInput: {} })).toEqual([]);
  });

  it('simple server → server + tool level doc, corpus ids mcp/…, global→specific order', () => {
    const out = matchingDocs({}, { toolName: 'mcp__stripe__authenticate', toolInput: {} });
    expect(out).toEqual([
      { doc: 'mcp/stripe.md', sourceLabel: 'docs/mcp/stripe.md', level: 'server', server: 'stripe' },
      { doc: 'mcp/stripe/authenticate.md', sourceLabel: 'docs/mcp/stripe/authenticate.md', level: 'tool', server: 'stripe' },
    ]);
  });

  it('subToolParam configured → level 3 from tool_input', () => {
    const config = { servers: { odoo: { subToolParam: 'args.tool' } } };
    const out = matchingDocs(config, {
      toolName: 'mcp__odoo__odoo_call',
      toolInput: { args: { tool: 'delete_record' } },
    });
    expect(out.map((c) => c.doc)).toEqual([
      'mcp/odoo.md',
      'mcp/odoo/odoo_call.md',
      'mcp/odoo/delete_record.md',
    ]);
    expect(out[2]).toEqual({
      doc: 'mcp/odoo/delete_record.md',
      sourceLabel: 'docs/mcp/odoo/delete_record.md',
      level: 'subTool',
      server: 'odoo',
    });
  });

  it('toolInput absent → treated as {} (never a throw)', () => {
    const out = matchingDocs({}, { toolName: 'mcp__stripe__authenticate' });
    expect(out.map((c) => c.doc)).toEqual(['mcp/stripe.md', 'mcp/stripe/authenticate.md']);
  });

  // ⚠️ CASES INVERTED on 15/08/2026 (52) — never deleted: the SOURCE no longer
  //    filters (it SUPPLIES the candidates), the discarding lives in gate.js
  //    (`excludedTargetsFor`, cascade defaults.{source} > global, OBSERVABLE).
  //    The end-to-end behavior is UNCHANGED (mcp-differential proves it
  //    by spawn); if the source starts filtering again, it is class ㊱/㊳
  //    (a source that resolves) coming back — these cases would turn red.
  it('whitelist filter: the SOURCE still yields the candidates (discarding = gate.js, 52)', () => {
    const config = { filterMode: 'whitelist', filterList: ['odoo'] };
    expect(matchingDocs(config, { toolName: 'mcp__stripe__authenticate', toolInput: {} }).length).toBeGreaterThan(0);
    expect(matchingDocs(config, { toolName: 'mcp__odoo__odoo_call', toolInput: {} }).length).toBeGreaterThan(0);
  });

  it('blacklist filter: the SOURCE still yields the candidates (discarding = gate.js, 52)', () => {
    const config = { filterMode: 'blacklist', filterList: ['umami'] };
    expect(matchingDocs(config, { toolName: 'mcp__umami__umami_call', toolInput: {} }).length).toBeGreaterThan(0);
  });

  it('multi-underscore server (plugin_discord_discord) → correct corpus id', () => {
    const out = matchingDocs({}, { toolName: 'mcp__plugin_discord_discord__reply', toolInput: {} });
    expect(out[0].doc).toBe('mcp/plugin_discord_discord.md');
    expect(out[0].server).toBe('plugin_discord_discord');
  });
});

describe('sources/mcp — declFor', () => {
  // 🛑 THREE CASES DELETED ON 09/08/2026 ("defaults: smart/4", "globals",
  //    "server override > global"): they FROZE the resolution that this
  //    source no longer has the right to do, and the 3rd sealed `servers.{name}.mode`
  //    — a key that the SCHEMA REJECTS (`additionalProperties: false`), hence
  //    unreachable by any valid config. They protected dead code, and
  //    that dead code was killing the `defaults.mcp` stage (cf ㊳ below).
  // ⚠️ The cascade is now tested where it LIVES — through `gate.js`,
  //    never on the raw value returned by the source.
  it('without frontmatter: EMPTY decl — it is the cascade that fills it', () => {
    expect(declFor({})).toEqual({});
    expect(declFor(undefined)).toEqual({});
  });

  it('valid frontmatter: SUPPLIED as is', () => {
    expect(declFor({ mode: 'dumb', threshold: 2 })).toEqual({ mode: 'dumb', threshold: 2 });
  });

  it('INVALID value = key OMITTED, never a guessed value', () => {
    // ⚠️ Omitting (and not "correcting") is what lets the next stage speak.
    expect(declFor({ mode: 'turbo', threshold: 0 })).toEqual({});
    expect(declFor({ threshold: 2.5 })).toEqual({});
  });

  it('a decl carries ONLY cadence — no DECISION key', () => {
    // ⚠️ It concerned `confirm` (removed on 05/08/2026). The invariant is
    //    broader and survives its removal: a source INFORMS, it decides nothing.
    const CADENCE = ['mode', 'threshold', 'driftUnit', 'note', 'enforce'];
    for (const k of Object.keys(declFor({ mode: 'dumb', threshold: 2, enforce: true }))) {
      expect(CADENCE).toContain(k);
    }
    expect('confirm' in declFor({})).toBe(false);
  });
});

// ── declFor: the doc's FRONTMATTER SUPPLIES, gate.js disposes ──
// ⚠️ REWRITTEN ON 09/08/2026. These cases expected a `threshold: 4` COMING FROM THE
//    SOURCE — that is to say the framework default resolved too early, the very cause
//    of the short-circuiting of `defaults.mcp` (cf ㊳). The INTENTION tested has not
//    changed ("the doc's author has the last word"); what changes is
//    the PLACE where the default is applied: gate.js, and it alone.
describe('sources/mcp — declFor, what the frontmatter SUPPLIES', () => {
  it('a valid fm.mode is supplied ALONE (the threshold is still to be decided higher up)', () => {
    expect(declFor({ mode: 'dumb' })).toEqual({ mode: 'dumb' });
  });

  it('an fm.threshold integer >= 1 is supplied, bound 1 INCLUDED', () => {
    expect(declFor({ threshold: 2 })).toEqual({ threshold: 2 });
    expect(declFor({ threshold: 1 })).toEqual({ threshold: 1 });
  });

  it('fm.mode AND fm.threshold together', () => {
    expect(declFor({ mode: 'once', threshold: 9 })).toEqual({ mode: 'once', threshold: 9 });
  });

  it('invalid fm = key OMITTED (never a throw): unknown mode, threshold 0/float/string', () => {
    expect(declFor({ mode: 'weekly' })).toEqual({});
    expect(declFor({ threshold: 0 })).toEqual({});
    expect(declFor({ threshold: 2.5 })).toEqual({});
    expect(declFor({ threshold: '3' })).toEqual({});
  });

  it('fm absent/undefined = empty decl, never a throw', () => {
    expect(declFor()).toEqual({});
    expect(declFor(undefined)).toEqual({});
  });
});

// ── driftUnit (18/07/2026): the author proposes, otherwise ABSENT (cascade in gate) ──
test('declFor: driftUnit from the frontmatter propagated if valid, ABSENT otherwise (fallback = gate)', () => {
  const config = {};
  expect(declFor({ driftUnit: 'turn' }).driftUnit).toBe('turn');
  expect(declFor({ driftUnit: 'tool' }).driftUnit).toBe('tool');
  expect('driftUnit' in declFor({ driftUnit: 'bogus' })).toBe(false);
  expect('driftUnit' in declFor({})).toBe(false);
  expect('driftUnit' in declFor(undefined)).toBe(false);
});

// ═══════════════════════════════════════════════════════════════════════════
// `enforce` — PROPAGATED, not filtered (REAL defect fixed on 06/08/2026)
// ═══════════════════════════════════════════════════════════════════════════
// 🔴 `enforce` (the word that REFUSES a gesture) was NOT copied by declFor:
//    accepted by validateMcp, documented everywhere, INERT on the MCP channel —
//    hence right where the FOUNDING incident lives (the Stripe payment click).
//    `create_refund` returned `allow`. A safety catch that does not catch is
//    WORSE than nothing: one trusts it.
// ⚠️ THESE CASES LIVE HERE and not only in `declfor-gate.test.js`: Stryker
//    mutates ONLY the declared deterministic suites. The gate protects the FUTURE
//    (any future key), these cases protect the LINE — both, never one
//    instead of the other.

describe('sources/mcp — declFor propagates `enforce`', () => {
  it('`enforce: true` is CARRIED through to the decl', () => {
    expect(declFor({ enforce: true }).enforce).toBe(true);
  });

  it('an EXPLICIT `enforce: false` survives — otherwise opting out is impossible', () => {
    // Without it, a category switched to `defaults.mcp.enforce` would be
    // IMPOSSIBLE TO OPT OUT OF: the dead end of every cascade.
    expect(declFor({ enforce: false }).enforce).toBe(false);
  });

  it('NON-boolean value → ABSENT (never taken for a yes)', () => {
    // A typo must not become a blocking decision.
    expect(declFor({ enforce: 'oui' }).enforce).toBeUndefined();
    expect(declFor({ enforce: 1 }).enforce).toBeUndefined();
  });

  it('absent from the frontmatter → absent from the decl (the cascade will decide)', () => {
    expect('enforce' in declFor({})).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// ㊳ THE SOURCE SUPPLIES, IT DOES NOT RESOLVE — the `defaults.mcp` stage was DEAD
// ═══════════════════════════════════════════════════════════════════════
// 🔴 REAL BUG (09/08/2026, found by READING). `declFor` called
//    `lib.modeFor`/`lib.thresholdFor`, hence ALWAYS supplied a value in the
//    decl — even without a frontmatter. Yet the cascade of `gate.js` stops at the
//    FIRST value found: an always-full entry SHORT-CIRCUITS
//    stage ② (`defaults.mcp`), which was therefore INERT, silently.
// ⚠️ SAME CLASS as ㊱ (cascade resolved outside gate.js), on a 3rd channel:
//    `skill.js` had been fixed on 04/08, the MCP channel was FORGOTTEN.
// 🛑 WHAT MADE IT INVISIBLE: the resolution was LEGITIMATE originally
//    (it read `servers.{name}.mode`), but the schema has REJECTED that key
//    since — the resolution is dead, and its only remaining effect was to kill
//    the neighboring stage. A vestige that now only does harm.
// ⚠️ Mandatory PARITY part: without `defaults.mcp`, the result must be
//    IDENTICAL to before (this is the shipped config — a regression here would affect
//    all the MCP docs of all the agents).
describe('㊳ MCP cascade — the source SUPPLIES, gate.js RESOLVES', () => {
  const gate = require('../src/gate.js');

  it('defaults.mcp is RESPECTED for a doc without a frontmatter', () => {
    const config = { defaults: { mcp: { mode: 'dumb', threshold: 9 } } };
    const decl = declFor({});
    expect(gate.modeForDoc(config, decl, 'mcp')).toBe('dumb');
    expect(gate.thresholdForDoc(config, decl, 'mcp')).toBe(9);
  });

  it('the frontmatter keeps the LAST word over defaults.mcp', () => {
    const config = { defaults: { mcp: { mode: 'dumb', threshold: 9 } } };
    const decl = declFor({ mode: 'once', threshold: 3 });
    expect(gate.modeForDoc(config, decl, 'mcp')).toBe('once');
    expect(gate.thresholdForDoc(config, decl, 'mcp')).toBe(3);
  });

  it('PARITY — without defaults.mcp, the global then the framework default decide', () => {
    expect(gate.modeForDoc({ mode: 'once' }, declFor({}), 'mcp')).toBe('once');
    expect(gate.thresholdForDoc({ defaultThreshold: 7 }, declFor({}), 'mcp')).toBe(7);
    expect(gate.modeForDoc({}, declFor({}), 'mcp')).toBe('smart');
    expect(gate.thresholdForDoc({}, declFor({}), 'mcp')).toBe(4);
  });
});
