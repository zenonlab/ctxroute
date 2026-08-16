// ═══════════════════════════════════════════════════════════════════════
// DETERMINISTIC tests of gate.js (Stryker target — cf vitest.stryker.config.mjs).
// ⚠️ CONTRACT values written HARD-CODED (never derived from the code under test).
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import { decide, docLabel, modeForDoc, thresholdForDoc, driftUnitForDoc } from '../src/gate.js';

const DUMB = { mode: 'dumb' };

// ⚠️ `WRITE_TOOLS` was REMOVED along with `confirm`/`ask` on 05/08/2026: its only
//    reason to exist was to know on which tools to ask for confirmation.
//    No decision of the gate depends on the tool NAME any more — do not
//    reintroduce it "just in case": it would be a list to maintain for nothing.

// ── modeForDoc: precedence frontmatter > global config > smart ──
test('modeForDoc: decl.mode wins over config.mode', () => {
  assert.strictEqual(modeForDoc({ mode: 'smart' }, { mode: 'dumb' }), 'dumb');
});
test('modeForDoc: config.mode if decl is mute, smart by default', () => {
  assert.strictEqual(modeForDoc({ mode: 'once' }, {}), 'once');
  assert.strictEqual(modeForDoc({}, undefined), 'smart');
});

// ── dumb: always injects, NEVER writes state ──
test('dumb: injects on every call, state intact, changed=false', () => {
  const decls = { 'docs/a.md': DUMB };
  const r1 = decide({}, decls, ['docs/a.md'], {});
  assert.deepStrictEqual(r1.inject, ['docs/a.md']);
  assert.strictEqual(r1.decision, 'allow');
  assert.strictEqual(r1.changed, false);
  assert.deepStrictEqual(r1.state, {});
  const r2 = decide({}, decls, ['docs/a.md'], r1.state);
  assert.deepStrictEqual(r2.inject, ['docs/a.md']); // always, not "once"
});

// ── injection order = matched order ──
test('inject preserves the order of matched (parent→child)', () => {
  const decls = { 'docs/p.md': DUMB, 'docs/e.md': DUMB };
  const r = decide({}, decls, ['docs/p.md', 'docs/e.md'], {});
  assert.deepStrictEqual(r.inject, ['docs/p.md', 'docs/e.md']);
});

// ═══════════════════════════════════════════════════════════════════════
// ANTI-RETURN GATE: `ask` NO LONGER EXISTS (removed on 05/08/2026)
// ═══════════════════════════════════════════════════════════════════════
// ⚠️ Replaces the 5 `confirm` tests. NEVER delete it "because it
//    tests nothing": that is precisely its role — to prove an ABSENCE.
//    `ask` escalated to the human (anti 0-human), did not exist on Codex,
//    and `enforce` already covers "stop a gesture" automatically. The day
//    someone reintroduces it by reflex, this test falls BEFORE production.
test('ANTI-RETURN: no input can produce `ask`, whatever the tool', () => {
  const cas = [
    [{}, { 'docs/a.md': DUMB }, ['docs/a.md']],
    [{ confirm: true }, { 'docs/a.md': { mode: 'dumb', confirm: true } }, ['docs/a.md']],
    [{}, { 'docs/a.md': { mode: 'dumb' }, 'docs/b.md': DUMB }, ['docs/a.md', 'docs/b.md']],
  ];
  for (const [config, decls, matched] of cas) {
    // `confirm` no longer being vocabulary, it is nothing but inert data.
    assert.notStrictEqual(decide(config, decls, matched, {}).decision, 'ask');
  }
});

test('the possible decisions are EXACTLY none | allow | deny', () => {
  const seen = new Set([
    decide({}, {}, [], {}).decision,
    decide({}, { 'd/x': { mode: 'dumb' } }, ['d/x'], {}).decision,
    decide({}, { 'd/x': { mode: 'once', enforce: true } }, ['d/x'], {}, 0, { 'd/x': 'file' }).decision,
  ]);
  assert.deepStrictEqual([...seen].sort(), ['allow', 'deny', 'none']);
});

// ── decl missing for a matched doc: never a throw, never an invented ask ──
test('matched doc without a decl: global mode applied, no throw, no ask', () => {
  const r = decide({ mode: 'dumb' }, {}, ['docs/x.md'], {});
  assert.deepStrictEqual(r.inject, ['docs/x.md']);
  assert.strictEqual(r.decision, 'allow');
});

// ── none: nothing injected ──
test('none when matched is empty', () => {
  const r = decide({}, {}, [], {});
  assert.strictEqual(r.decision, 'none');
  assert.deepStrictEqual(r.inject, []);
});

// ── smart: 1st call injects, an immediate recall stays silent, the threshold re-injects ──
test('smart: injects on the 1st call, state written (changed=true)', () => {
  const decls = { 'docs/s.md': { mode: 'smart' } };
  // ⚠️ CONTRACT since driftUnit (18/07/2026): the caller ALWAYS passes an
  //    integer turnCount (0 if unknown) and the state carries the `turn` timestamp.
  const r = decide({}, decls, ['docs/s.md'], {}, 0);
  assert.deepStrictEqual(r.inject, ['docs/s.md']);
  assert.strictEqual(r.changed, true);
  assert.deepStrictEqual(r.state, { 'docs/s.md': { seen: true, sinceLastCall: 0, turn: 0 } });
});
test('smart: immediate recall = silent, changed=false (identical state)', () => {
  const decls = { 'docs/s.md': { mode: 'smart' } };
  const state = { 'docs/s.md': { seen: true, sinceLastCall: 0 } };
  const r = decide({}, decls, ['docs/s.md'], state);
  assert.deepStrictEqual(r.inject, []);
  assert.strictEqual(r.decision, 'none');
  assert.strictEqual(r.changed, false);
});
test('smart: a foreign call increments the counter (changed=true)', () => {
  const decls = { 'docs/s.md': { mode: 'smart' } };
  const state = { 'docs/s.md': { seen: true, sinceLastCall: 0 } };
  const r = decide({}, decls, [], state);
  assert.deepStrictEqual(r.state, { 'docs/s.md': { seen: true, sinceLastCall: 1 } });
  assert.strictEqual(r.changed, true);
});
test('smart: re-injects at the threshold (default 4), counter reset to 0', () => {
  const decls = { 'docs/s.md': { mode: 'smart' } };
  const state = { 'docs/s.md': { seen: true, sinceLastCall: 4, turn: 0 } };
  const r = decide({}, decls, ['docs/s.md'], state, 0);
  assert.deepStrictEqual(r.inject, ['docs/s.md']);
  assert.deepStrictEqual(r.state, { 'docs/s.md': { seen: true, sinceLastCall: 0, turn: 0 } });
  assert.strictEqual(r.changed, true); // sinceLastCall 4 → 0
});
test('smart: below the threshold = silent (3 < 4)', () => {
  const decls = { 'docs/s.md': { mode: 'smart' } };
  const r = decide({}, decls, ['docs/s.md'], { 'docs/s.md': { seen: true, sinceLastCall: 3 } });
  assert.deepStrictEqual(r.inject, []);
});
test('the config\'s defaultThreshold is honoured (2)', () => {
  const decls = { 'docs/s.md': { mode: 'smart' } };
  const r = decide({ defaultThreshold: 2 }, decls, ['docs/s.md'], { 'docs/s.md': { seen: true, sinceLastCall: 2 } });
  assert.deepStrictEqual(r.inject, ['docs/s.md']);
});
test('non-integer defaultThreshold → falls back to 4', () => {
  const decls = { 'docs/s.md': { mode: 'smart' } };
  const r = decide({ defaultThreshold: 'three' }, decls, ['docs/s.md'], { 'docs/s.md': { seen: true, sinceLastCall: 3 } });
  assert.deepStrictEqual(r.inject, []);
});

// ── once: 1st call only, never a foreign increment ──
test('once: injects on the 1st call then never again', () => {
  const decls = { 'docs/o.md': { mode: 'once' } };
  const r1 = decide({}, decls, ['docs/o.md'], {});
  assert.deepStrictEqual(r1.inject, ['docs/o.md']);
  const r2 = decide({}, decls, ['docs/o.md'], r1.state);
  assert.deepStrictEqual(r2.inject, []);
});
test('once: a foreign call touches NEITHER its counter NOR changed', () => {
  const decls = { 'docs/o.md': { mode: 'once' } };
  const state = { 'docs/o.md': { seen: true, sinceLastCall: 0 } };
  const r = decide({}, decls, [], state);
  assert.deepStrictEqual(r.state, state);
  assert.strictEqual(r.changed, false);
});

// ── corrupted state: a null entry NEVER throws (pure fail-open) ──
test('null state entry: passthrough without a throw, changed=false', () => {
  const decls = { 'docs/s.md': { mode: 'smart' } };
  const r = decide({}, decls, [], { 'docs/s.md': null });
  assert.deepStrictEqual(r.state, { 'docs/s.md': null });
  assert.strictEqual(r.changed, false);
});

// ── purity: the arguments are NEVER mutated ──
test('decide does not mutate the state passed as an argument', () => {
  const decls = { 'docs/s.md': { mode: 'smart' } };
  const state = { 'docs/s.md': { seen: true, sinceLastCall: 1 } };
  decide({}, decls, [], state);
  assert.deepStrictEqual(state, { 'docs/s.md': { seen: true, sinceLastCall: 1 } });
});

// ── docLabel: replica of protect-files (FIRST [source:], title as a fallback) ──
test('docLabel: first [source:] tag, basename without .md', () => {
  assert.strictEqual(docLabel('blabla\n[source: .claude/hooks/docs/foo.md]\n[source: .claude/hooks/docs/bar.md]'), 'foo');
});
test('docLabel: markdown title as a fallback, truncated at 40', () => {
  assert.strictEqual(docLabel('# A title'), 'A title');
  assert.strictEqual(docLabel('# ' + 'x'.repeat(60)), 'x'.repeat(40));
});
test('docLabel: nothing → empty string (no systemMessage)', () => {
  assert.strictEqual(docLabel('text without a marker or a title'), '');
  assert.strictEqual(docLabel(null), '');
});

// ── thresholdForDoc (MCP merge 17/07/2026) ──────────────────────────────
// decl.threshold (posed by a source, e.g. MCP) > defaultThreshold > 4.
// MANDATORY deterministic cases (Stryker never runs the property tests).

test('thresholdForDoc: integer decl.threshold > defaultThreshold > default 4', () => {
  assert.equal(thresholdForDoc({ defaultThreshold: 6 }, { threshold: 2 }), 2);
  assert.equal(thresholdForDoc({ defaultThreshold: 6 }, {}), 6);
  assert.equal(thresholdForDoc({}, {}), 4);
  assert.equal(thresholdForDoc({}, undefined), 4);
  // non-integer = ignored (never a silent NaN in the comparison)
  assert.equal(thresholdForDoc({ defaultThreshold: 6 }, { threshold: '2' }), 6);
  assert.equal(thresholdForDoc({ defaultThreshold: '6' }, {}), 4);
  // ⚠️ 0 is a LEGITIMATE integer (re-injection on every foreign tool) — a
  // `||` would swallow it: an anti-mutant AND anti-regression case.
  assert.equal(thresholdForDoc({ defaultThreshold: 6 }, { threshold: 0 }), 0);
});

test('decide: the PER-DOC threshold governs the smart re-injection (two docs, two thresholds)', () => {
  const config = { defaultThreshold: 4 };
  const decls = { 'mcp/a.md': { mode: 'smart', threshold: 1 }, 'mcp/b.md': { mode: 'smart', threshold: 3 } };
  // a and b seen, 1 foreign tool elapsed for each.
  const state = {
    'mcp/a.md': { seen: true, sinceLastCall: 1 },
    'mcp/b.md': { seen: true, sinceLastCall: 1 },
  };
  const r = decide(config, decls, ['mcp/a.md', 'mcp/b.md'], state);
  // a (threshold 1) re-injects, b (threshold 3) stays silent — the threshold is indeed PER doc.
  assert.deepEqual(r.inject, ['mcp/a.md']);
});

// ── driftUnit (18/07/2026): unit of the smart counter, cascade of 3 authorities ──

import { driftUnitForDoc } from '../src/gate.js';

test('driftUnitForDoc: decl > global defaultDriftUnit > framework default tool', () => {
  assert.equal(driftUnitForDoc({ defaultDriftUnit: 'turn' }, { driftUnit: 'tool' }), 'tool');
  assert.equal(driftUnitForDoc({ defaultDriftUnit: 'turn' }, {}), 'turn');
  assert.equal(driftUnitForDoc({}, {}), 'tool');
  assert.equal(driftUnitForDoc(undefined, undefined), 'tool');
  // invalid at one level = we GO DOWN (total fallback), never a NaN of unit
  assert.equal(driftUnitForDoc({ defaultDriftUnit: 'turn' }, { driftUnit: 'bogus' }), 'turn');
  assert.equal(driftUnitForDoc({ defaultDriftUnit: 'bogus' }, {}), 'tool');
});

test('decide/turn: smart driftUnit turn — re-injects when N TURNS have elapsed, not before', () => {
  const decls = { 'skill/a': { mode: 'smart', threshold: 2, driftUnit: 'turn' } };
  // seen at turn 3: at turn 4 (elapsed 1 < 2) silence, at turn 5 (elapsed 2 >= 2) re-injection.
  const state = { 'skill/a': { seen: true, sinceLastCall: 0, turn: 3 } };
  assert.deepEqual(decide({}, decls, ['skill/a'], state, 4).inject, []);
  assert.deepEqual(decide({}, decls, ['skill/a'], state, 5).inject, ['skill/a']);
});

test('decide/turn: foreign tool calls do NOT count for a turn doc', () => {
  const decls = { 'skill/a': { mode: 'smart', threshold: 1, driftUnit: 'turn' } };
  // 1st match at turn 2: injects + writes turn=2.
  const r1 = decide({}, decls, ['skill/a'], {}, 2);
  assert.deepEqual(r1.inject, ['skill/a']);
  assert.deepEqual(r1.state['skill/a'], { seen: true, sinceLastCall: 0, turn: 2 });
  // foreign call (doc not matched): the TOOL counter of the turn doc does NOT move
  // (and therefore NO state write — changed=false).
  const r2 = decide({}, decls, [], r1.state, 2);
  assert.deepEqual(r2.state['skill/a'], { seen: true, sinceLastCall: 0, turn: 2 });
  assert.equal(r2.changed, false);
  // re-match on the SAME turn: 0 turns elapsed → silence.
  assert.deepEqual(decide({}, decls, ['skill/a'], r2.state, 2).inject, []);
});

test('decide/turn: the re-injection REARMS the turn timestamp (no burst re-injection)', () => {
  const decls = { 'skill/a': { mode: 'smart', threshold: 1, driftUnit: 'turn' } };
  const state = { 'skill/a': { seen: true, sinceLastCall: 0, turn: 1 } };
  const r = decide({}, decls, ['skill/a'], state, 3);
  assert.deepEqual(r.inject, ['skill/a']);
  // turn rewritten to 3 + changed=true (otherwise the state keeps turn=1 and the doc
  // would re-inject on EVERY following match — dumb in disguise).
  assert.deepEqual(r.state['skill/a'], { seen: true, sinceLastCall: 0, turn: 3 });
  assert.equal(r.changed, true);
});

test('decide/tool: a smart tool doc IGNORES turnCount (strict historical parity)', () => {
  const decls = { 'mcp/a.md': { mode: 'smart', threshold: 2 } };
  const state = { 'mcp/a.md': { seen: true, sinceLastCall: 1, turn: 0 } };
  // huge turnCount: no effect — only sinceLastCall counts for the tool unit.
  assert.deepEqual(decide({}, decls, ['mcp/a.md'], state, 999).inject, []);
});

test('decide: a GLOBAL defaultDriftUnit turn applies to docs without their own driftUnit', () => {
  const config = { defaultDriftUnit: 'turn' };
  const decls = { 'mcp/a.md': { mode: 'smart', threshold: 1 } };
  const state = { 'mcp/a.md': { seen: true, sinceLastCall: 0, turn: 1 } };
  assert.deepEqual(decide(config, decls, ['mcp/a.md'], state, 1).inject, []);
  assert.deepEqual(decide(config, decls, ['mcp/a.md'], state, 2).inject, ['mcp/a.md']);
});

// ═══════════════════════════════════════════════════════════════════════
// 4-LEVEL CASCADE — `defaults.{source}` (04/08/2026)
// ═══════════════════════════════════════════════════════════════════════
// ⚠️ SINGLE POINT of resolution. These cases are the CONTRACT: entry >
//    defaults.{source} > global > FRAMEWORK default, with a TOTAL fallback
//    (an invalid value at one level ⇒ we GO DOWN, never an error).
// ⚠️ Expected values written HARD-CODED, never derived from the code under test.
const eq = (a, b, m) => assert.strictEqual(a, b, m);

test('cascade: WITHOUT defaults, behaviour as BEFORE, identically (parity)', () => {
  eq(modeForDoc({}, {}, 'file'), 'smart');
  eq(modeForDoc({ mode: 'once' }, {}, 'file'), 'once');
  eq(modeForDoc({ mode: 'once' }, { mode: 'dumb' }, 'file'), 'dumb');
  eq(modeForDoc({}, {}, 'skill'), 'once');
});

test('cascade: defaults.{source} applies to ITS category and to it alone', () => {
  const c = { defaults: { mcp: { mode: 'dumb' }, skill: { mode: 'smart' } } };
  eq(modeForDoc(c, {}, 'mcp'), 'dumb');
  eq(modeForDoc(c, {}, 'skill'), 'smart');
  eq(modeForDoc(c, {}, 'file'), 'smart');
  eq(modeForDoc(c, {}, 'tool'), 'smart');
});

test('cascade: the ENTRY keeps the last word over defaults.{source}', () => {
  eq(modeForDoc({ defaults: { mcp: { mode: 'dumb' } } }, { mode: 'once' }, 'mcp'), 'once');
});

test('cascade: defaults.{source} overrides the GLOBAL (a more specific level)', () => {
  const c = { mode: 'once', defaults: { file: { mode: 'dumb' } } };
  eq(modeForDoc(c, {}, 'file'), 'dumb');
  eq(modeForDoc(c, {}, 'mcp'), 'once');
});

test('cascade: INVALID value at one level -> we GO DOWN (total fallback)', () => {
  eq(modeForDoc({ defaults: { file: { mode: 'bogus' } }, mode: 'once' }, {}, 'file'), 'once');
  eq(modeForDoc({ defaults: { file: { mode: 'bogus' } } }, {}, 'file'), 'smart');
  eq(modeForDoc({ defaults: { file: { mode: 'dumb' } } }, { mode: 'bogus' }, 'file'), 'dumb');
});

test('cascade: UNKNOWN/absent source -> generic rules (never a crash)', () => {
  const c = { defaults: { file: { mode: 'dumb' } } };
  eq(modeForDoc(c, {}, 'nonexistent'), 'smart');
  eq(modeForDoc(c, {}, undefined), 'smart');
  eq(modeForDoc(null, null, null), 'smart');
});

// ⚠️ DELIBERATE ASYMMETRY — a skill does NOT consult the global mode. Without this case,
//    "uniformising the sources" would pass green and would flip ALL the skills
//    at the first global config posted (silent regression).
test('cascade: the GLOBAL NEVER touches the skills (asymmetry sealed)', () => {
  eq(modeForDoc({ mode: 'dumb' }, {}, 'skill'), 'once');
  eq(modeForDoc({ mode: 'smart' }, {}, 'skill'), 'once');
  eq(modeForDoc({ mode: 'dumb', defaults: { skill: { mode: 'smart' } } }, {}, 'skill'), 'smart');
});

test('cascade: threshold — entry > defaults.{source} > global > 4', () => {
  eq(thresholdForDoc({}, {}, 'file'), 4);
  eq(thresholdForDoc({ defaultThreshold: 7 }, {}, 'file'), 7);
  eq(thresholdForDoc({ defaultThreshold: 7, defaults: { file: { threshold: 2 } } }, {}, 'file'), 2);
  eq(thresholdForDoc({ defaults: { file: { threshold: 2 } } }, { threshold: 9 }, 'file'), 9);
  eq(thresholdForDoc({ defaults: { file: { threshold: 1 } } }, {}, 'file'), 1);
  eq(thresholdForDoc({ defaultThreshold: 7, defaults: { file: { threshold: 0 } } }, {}, 'file'), 7);
  eq(thresholdForDoc({ defaults: { mcp: { threshold: 2 } } }, {}, 'file'), 4);
});

test('cascade: driftUnit — entry > defaults.{source} > defaultDriftUnit > tool', () => {
  eq(driftUnitForDoc({}, {}, 'file'), 'tool');
  eq(driftUnitForDoc({ defaultDriftUnit: 'turn' }, {}, 'file'), 'turn');
  eq(driftUnitForDoc({ defaultDriftUnit: 'turn', defaults: { file: { driftUnit: 'tool' } } }, {}, 'file'), 'tool');
  eq(driftUnitForDoc({ defaults: { file: { driftUnit: 'turn' } } }, { driftUnit: 'tool' }, 'file'), 'tool');
  eq(driftUnitForDoc({ defaults: { file: { driftUnit: 'bogus' } }, defaultDriftUnit: 'turn' }, {}, 'file'), 'turn');
});

// ⚠️ decide() MUST pass the source to the cascade. Without this case, `defaults`
//    could be accepted by the schema and stay WITHOUT EFFECT — exactly the
//    false green this repo fights. We prove the EFFECT, not the presence of the param.
test('cascade: decide() consumes owners — defaults.{source} has a real EFFECT', () => {
  // `dumb` ALWAYS re-injects · `smart` (the previous default) stays silent as long as the
  // threshold is not reached. The two branches MUST therefore differ — otherwise the
  // case would be decorative (trap verified: with `once`, both stay silent).
  const config = { defaults: { mcp: { mode: 'dumb' } } };
  const decls = { 'mcp/x': {} };
  const etat = () => ({ 'mcp/x': { seen: true, sinceLastCall: 0 } });
  const avec = decide(config, decls, ['mcp/x'], etat(), 0, { 'mcp/x': 'mcp' });
  assert.deepStrictEqual(avec.inject, ['mcp/x'], 'defaults.mcp = dumb => re-injects');
  const sans = decide(config, decls, ['mcp/x'], etat(), 0, undefined);
  assert.deepStrictEqual(sans.inject, [], 'without owners => the cascade as before (smart, threshold not reached)');
});

// ═══════════════════════════════════════════════════════════════════════
// `enforce` (05/08/2026) — STOP the gesture, not merely inform it.
// ⚠️ Why this word exists: official Claude Code doc (re-read 05/08/2026),
//    the additionalContext of a PreToolUse arrives "next to the tool result".
//    An injection therefore CANNOT prevent the gesture it targets. Only a
//    refusal does — and it is autonomous (no user interaction).
// ═══════════════════════════════════════════════════════════════════════

const declEnf = (extra) => ({ 'd/x': Object.assign({ mode: 'once' }, extra) });

test('enforce ABSENT => behaviour as BEFORE, no deny (parity contract)', () => {
  const r = decide({}, declEnf({}), ['d/x'], {}, 0, { 'd/x': 'file' });
  assert.strictEqual(r.decision, 'allow');
});

test('enforce: true + once => deny on the 1st gesture', () => {
  const r = decide({}, declEnf({ enforce: true }), ['d/x'], {}, 0, { 'd/x': 'file' });
  assert.strictEqual(r.decision, 'deny');
  assert.deepStrictEqual(r.inject, ['d/x'], 'the knowledge is delivered WITH the refusal — never a mute wall');
});

test('2nd call: once has consumed the doc => nothing left to inject, hence NO deny (anti-loop)', () => {
  const decls = declEnf({ enforce: true });
  const un = decide({}, decls, ['d/x'], {}, 0, { 'd/x': 'file' });
  assert.strictEqual(un.decision, 'deny');
  const deux = decide({}, decls, ['d/x'], un.state, 0, { 'd/x': 'file' });
  assert.deepStrictEqual(deux.inject, [], 'nothing to deliver on the 2nd round');
  assert.strictEqual(deux.decision, 'none', 'the agent that redoes its call PASSES — otherwise an infinite loop');
});

test('🛑 ALTERNATION: a block is NEVER followed by a block — the 3 modes', () => {
  // This is THE anti-loop guarantee of the framework. It does not depend on the mode:
  // after a refusal, the gesture the agent redoes ALWAYS passes.
  for (const mode of ['dumb', 'once', 'smart']) {
    const decls = { 'd/x': { mode, enforce: true } };
    const own = { 'd/x': 'file' };
    const t1 = decide({}, decls, ['d/x'], {}, 0, own);
    assert.strictEqual(t1.decision, 'deny', `${mode}: 1st gesture blocked`);
    const t2 = decide({}, decls, ['d/x'], t1.state, 0, own);
    assert.notStrictEqual(t2.decision, 'deny', `${mode}: the REDONE gesture must pass`);
  }
});

test('enforce + dumb: block / pass / block… in REGULAR alternation', () => {
  // ⚠️ `dumb` remains usable (maintainer decision 05/08/2026): it re-injects
  //    on every call, but only the REFUSAL alternates. A first version
  //    forbade it — that was crippling the language without protecting anything.
  const decls = { 'd/x': { mode: 'dumb', enforce: true } };
  const own = { 'd/x': 'file' };
  let etat = {};
  const vus = [];
  for (let i = 0; i < 5; i++) {
    const r = decide({}, decls, ['d/x'], etat, 0, own);
    vus.push(r.decision === 'deny' ? 'X' : '.');
    assert.deepStrictEqual(r.inject, ['d/x'], 'dumb ALWAYS re-injects, even when it does not block');
    etat = r.state;
  }
  assert.deepStrictEqual(vus, ['X', '.', 'X', '.', 'X'], 'strict alternation');
});

test('enforce + smart: blocks → passes again → RE-BLOCKS after N (the cadence, nothing else)', () => {
  // ⚠️ This case proves that `smart` is LEGITIMATE (fixed on 05/08/2026: a
  //    first version wrongly forbade it, believing in a loop).
  const decls = { 'd/x': { mode: 'smart', threshold: 4, enforce: true } };
  const own = { 'd/x': 'file' };

  const t1 = decide({}, decls, ['d/x'], {}, 0, own);
  assert.strictEqual(t1.decision, 'deny', '1st gesture: blocked, knowledge delivered');

  // The agent REDOES its call immediately: the doc has just been delivered,
  // its counter is at 0 ⇒ nothing to inject ⇒ it PASSES. No loop.
  const t2 = decide({}, decls, ['d/x'], t1.state, 0, own);
  assert.deepStrictEqual(t2.inject, []);
  assert.strictEqual(t2.decision, 'none', 'the immediate retry ALWAYS passes');

  // 4 calls of OTHER tools: the doc's counter goes up.
  let etat = t2.state;
  for (let i = 0; i < 4; i++) etat = decide({}, decls, ['other'], etat, 0, { other: 'file' }).state;

  const t3 = decide({}, decls, ['d/x'], etat, 0, own);
  assert.strictEqual(t3.decision, 'deny', 'the doc comes back => it re-blocks, once');
});

test('enforce inherits from defaults.{source} — and `false` CANCELS that inheritance', () => {
  const config = { defaults: { mcp: { enforce: true, mode: 'once' } } };
  const herite = decide(config, { 'mcp/x': {} }, ['mcp/x'], {}, 0, { 'mcp/x': 'mcp' });
  assert.strictEqual(herite.decision, 'deny', 'the category imposes the block');
  const desinscrit = decide(config, { 'mcp/x': { enforce: false } }, ['mcp/x'], {}, 0, { 'mcp/x': 'mcp' });
  assert.strictEqual(desinscrit.decision, 'allow', 'without an explicit `false`, an entry would be UN-OPT-OUT-ABLE');
});

test('`deny` does NOT depend on the tool: it bites on a read as on a write', () => {
  // ⚠️ Former test "deny prevails over ask". Since the removal of `ask`, the invariant
  //    that matters is this one: a gesture to be stopped is stopped whatever the tool.
  const decls = { 'd/x': { mode: 'once', enforce: true } };
  assert.strictEqual(decide({}, decls, ['d/x'], {}, 0, { 'd/x': 'file' }).decision, 'deny');
});

test('NO global level for enforce: a root `enforce` blocks NOTHING', () => {
  // ⚠️ Deliberate: a global block would refuse the 1st gesture of every session
  //    on every doc — the system one ends up unplugging.
  const r = decide({ enforce: true, mode: 'once' }, { 'd/x': {} }, ['d/x'], {}, 0, { 'd/x': 'file' });
  assert.strictEqual(r.decision, 'allow');
});

test('an enforce doc that is NOT matched NEVER contaminates another call', () => {
  // ⚠️ The block is judged on the docs ACTUALLY injected, never on the
  //    corpus: otherwise a single `enforce` doc would freeze the whole session.
  const decls = declEnf({ enforce: true });
  const un = decide({}, decls, ['d/x'], {}, 0, { 'd/x': 'file' });
  assert.strictEqual(un.decision, 'deny');
  const deux = decide({}, decls, ['other'], un.state, 0, { other: 'file' });
  assert.deepStrictEqual(deux.inject, ['other'], 'the other doc is indeed delivered');
  assert.strictEqual(deux.decision, 'allow', 'and the gesture PASSES — no inherited deny');
});

test('INVALID defaults.{source}.enforce => we GO DOWN (total fallback, never a guessed block)', () => {
  // ⚠️ A non-boolean value must NEVER be taken for a "yes".
  //    Without this case, a truthy string would block the tool — a refusal born of a
  //    typo is the worst of false positives.
  const config = { defaults: { mcp: { enforce: 'yes', mode: 'once' } } };
  const r = decide(config, { 'mcp/x': {} }, ['mcp/x'], {}, 0, { 'mcp/x': 'mcp' });
  assert.strictEqual(r.decision, 'allow');
});

test('`changed` does not lie: it only goes back to true IF the state really moves', () => {
  // ⚠️ `changed` commands the DISK WRITE. Always true = one write per
  //    tool call for nothing; always false = the alternation does not survive the
  //    next process (hence serial blocks). Both are real bugs.
  const decls = { 'd/x': { mode: 'once', enforce: true } };
  const own = { 'd/x': 'file' };
  const t1 = decide({}, decls, ['d/x'], {}, 0, own);
  assert.strictEqual(t1.changed, true, 'the refusal must be MEMORISED');
  const t2 = decide({}, decls, ['d/x'], t1.state, 0, own);
  assert.strictEqual(t2.changed, true, 'the lifting of the refusal too (denied true -> false)');
  const t3 = decide({}, decls, ['d/x'], t2.state, 0, own);
  assert.strictEqual(t3.changed, false, 'nothing moves any more => NO write');
});

test('a doc WITHOUT enforce never writes `denied` (state shape unchanged, parity)', () => {
  const r = decide({}, { 'd/x': { mode: 'once' } }, ['d/x'], {}, 0, { 'd/x': 'file' });
  assert.strictEqual('denied' in r.state['d/x'], false);
});

// ⚠️ SYMMETRY OF THE SOURCES — a gate DERIVED from the registry, never a written list.
//    A future source will therefore be born WITH `enforce`, or this test will turn red. Without it,
//    the 5th source would be mute at blocking and nobody would see it: that is the
//    "inert declaration" class this repo has been killing since 31/07/2026.
test('enforce works on ALL the sources of the registry (derived from ADAPTERS)', async () => {
  const { ADAPTERS } = await import('../src/source-adapters.js');
  const ids = ADAPTERS.map((a) => a.id);
  assert.ok(ids.length >= 4, 'suspicious registry');
  for (const src of ids) {
    // ① declared on the ENTRY
    const parEntree = decide({}, { d: { mode: 'once', enforce: true } }, ['d'], {}, 0, { d: src });
    assert.strictEqual(parEntree.decision, 'deny', `source ${src}: entry enforce ignored`);
    // ② inherited from defaults.{source}
    const parDefaut = decide({ defaults: { [src]: { enforce: true, mode: 'once' } } },
      { d: {} }, ['d'], {}, 0, { d: src });
    assert.strictEqual(parDefaut.decision, 'deny', `source ${src}: defaults.${src}.enforce inert`);
    // ③ explicit opt-out
    const desinscrit = decide({ defaults: { [src]: { enforce: true, mode: 'once' } } },
      { d: { enforce: false } }, ['d'], {}, 0, { d: src });
    assert.strictEqual(desinscrit.decision, 'allow', `source ${src}: \`false\` does not opt out`);
  }
});

// ═══ GLOBAL FILTER BY TARGET (52, 15/08/2026) — cascade + observability ═══
// ⚠️ The 7th position of decide() is the TARGET of the gesture. Absent = parity as BEFORE.
test('filter 52: a GLOBAL blacklist discards the doc on the targeted tool, and SAYS so (filteredOut)', () => {
  const r = decide({ filterMode: 'blacklist', filterList: ['Bash'] }, { d: DUMB }, ['d'], {}, 0, { d: 'file' }, 'Bash');
  assert.deepStrictEqual(r.inject, []);
  assert.deepStrictEqual(r.filteredOut, ['d']);
  assert.strictEqual(r.decision, 'none');
});
test('filter 52: a blacklist by SERVER name discards the MCP gestures of that server', () => {
  const r = decide({ filterMode: 'blacklist', filterList: ['stripe'] }, { d: DUMB }, ['d'], {}, 0, { d: 'mcp' }, 'mcp__stripe__pay');
  assert.deepStrictEqual(r.inject, []);
  assert.deepStrictEqual(r.filteredOut, ['d']);
});
test('filter 52: a GLOBAL whitelist — only the listed target receives injections', () => {
  const cfg = { filterMode: 'whitelist', filterList: ['Bash'] };
  assert.deepStrictEqual(decide(cfg, { d: DUMB }, ['d'], {}, 0, { d: 'file' }, 'Bash').inject, ['d']);
  assert.deepStrictEqual(decide(cfg, { d: DUMB }, ['d'], {}, 0, { d: 'file' }, 'Read').inject, []);
});
test('filter 52: `defaults.{source}.filterMode` PREVAILS over the global one (cascade), and its list comes WITH it', () => {
  // ⚠️ The pair cascades TOGETHER: the level that provides the mode provides its list.
  const cfg = { filterMode: 'blacklist', filterList: ['Bash'], defaults: { file: { filterMode: 'blacklist', filterList: ['Read'] } } };
  // file: the category level's list (Read) replaces the global one (Bash).
  assert.deepStrictEqual(decide(cfg, { d: DUMB }, ['d'], {}, 0, { d: 'file' }, 'Bash').inject, ['d']);
  assert.deepStrictEqual(decide(cfg, { d: DUMB }, ['d'], {}, 0, { d: 'file' }, 'Read').inject, []);
  // another source stays under the GLOBAL filter.
  assert.deepStrictEqual(decide(cfg, { d: DUMB }, ['d'], {}, 0, { d: 'tool' }, 'Bash').inject, []);
});
test('filter 52: `defaults.{source}.filterMode: "none"` OPTS the category OUT of a global filter', () => {
  const cfg = { filterMode: 'blacklist', filterList: ['Bash'], defaults: { skill: { filterMode: 'none' } } };
  assert.deepStrictEqual(decide(cfg, { d: DUMB }, ['d'], {}, 0, { d: 'skill' }, 'Bash').inject, ['d']);
  assert.deepStrictEqual(decide(cfg, { d: DUMB }, ['d'], {}, 0, { d: 'file' }, 'Bash').inject, []);
});
test('filter 52: PARITY — without filterMode, and without toolName, nothing changes (filteredOut empty)', () => {
  const sans = decide({}, { d: DUMB }, ['d'], {}, 0, { d: 'file' });
  assert.deepStrictEqual(sans.inject, ['d']);
  assert.deepStrictEqual(sans.filteredOut, []);
  const filtreSansCible = decide({ filterMode: 'blacklist', filterList: ['Bash'] }, { d: DUMB }, ['d'], {}, 0, { d: 'file' });
  assert.deepStrictEqual(filtreSansCible.inject, ['d'], 'toolName absent = no target, the filter cannot bite');
});
test('filter 52: a discarded doc is NOT "recalled" — its smart counter keeps advancing', () => {
  // ⚠️ Historical contract of the server filter: a discarded gesture counts as
  //    FOREIGN. If the discarded one were "recalled", its counter would restart at 0.
  const cfg = { filterMode: 'blacklist', filterList: ['Bash'] };
  const decls = { d: { mode: 'smart' } };
  const state = { d: { seen: true, sinceLastCall: 2 } };
  const r = decide(cfg, decls, ['d'], state, 0, { d: 'file' }, 'Bash');
  assert.strictEqual(r.state.d.sinceLastCall, 3, 'discarded = foreign: the counter advances');
});
test('filter 52: NEGATIVE-CHECK — the wildcard * in a blacklist cuts everything, and it is OBSERVABLE', () => {
  const r = decide({ filterMode: 'blacklist', filterList: ['*'] }, { a: DUMB, b: DUMB }, ['a', 'b'], {}, 0, { a: 'file', b: 'tool' }, 'Read');
  assert.deepStrictEqual(r.inject, []);
  assert.deepStrictEqual(r.filteredOut, ['a', 'b'], 'a filter that cuts MUST say so — a silence would be a mute hole');
});
test('filter 52: a `whitelist` declared in defaults.{source} is RECOGNISED at that level', () => {
  // ⚠️ Kills the StringLiteral mutant on FILTER_MODES: if 'whitelist' were no longer
  //    a mode recognised at the category level, the cascade would fall back to the global one.
  const cfg = { defaults: { file: { filterMode: 'whitelist', filterList: ['Bash'] } } };
  assert.deepStrictEqual(decide(cfg, { d: DUMB }, ['d'], {}, 0, { d: 'file' }, 'Read').inject, []);
  assert.deepStrictEqual(decide(cfg, { d: DUMB }, ['d'], {}, 0, { d: 'file' }, 'Bash').inject, ['d']);
});
