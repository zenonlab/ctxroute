// ═══════════════════════════════════════════════════════════════════════
// GATE (unified gate) — PURE. What should be done with this tool call?
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ ZERO I/O (gate `gate-must-stay-pure`). The caller (doc-inject.js) reads
//    corpus/config/state and applies the decision; this module only DECIDES.
//    Mutated by Stryker (mutate + include Stryker, cf quality-configs.md).
//
// ⚠️ THIS IS THE PIECE THAT REPLACES the injection of protect-files.js AT THE SWITCHOVER.
//    Behavioural parity REQUIRED on the migrated corpus (everything in dumb mode):
//    same docs, same instants.
//    Sealed by pretool-differential.test.js (spawn old vs new engine).
//
// ⚠️ The per-DOC dedup (smart/once modes, "foreign tools" counters) is
//    the whole reason for the merge — but it only ACTIVATES when a doc moves
//    out of `dumb`, a human job after the switchover (decision 8 of the plan).
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const { shouldInjectFor, targetExcluded } = require('./lib-pure');
const { DRIFT_UNITS, MODES } = require('./frontmatter');

// ⚠️ `confirm`/`ask` REMOVED on 05/08/2026 (together with `WRITE_TOOLS`, which only
//    existed for it). NEVER reintroduce it: ① `ask` escalates to the HUMAN, the
//    exact opposite of the 0-human that founds this framework; ② Codex does not
//    support it (silent degradation ⇒ one same word, two meanings depending on the harness);
//    ③ `enforce` already covers "stop a gesture", automatically and
//    identically on both harnesses — two words for one need = anti-synonym law.
//    It had been at `false` in the config since the switchover: dead, and nobody saw it.

// ═══════════════════════════════════════════════════════════════════════
// CASCADE OF AUTHORITIES — 4 LEVELS, A SINGLE POINT (here). 04/08/2026.
// ═══════════════════════════════════════════════════════════════════════
//   ① entry (frontmatter of the doc / entry of the skill registry) = last word
//   ② defaults.{source}  (JSON) — "every doc of THIS category"
//   ③ global mode/defaultThreshold/defaultDriftUnit (JSON) — the whole corpus
//   ④ FRAMEWORK default, hard-coded (exists even without any JSON)
//
// ⚠️ Level ② generalises the old `skillDefaults`, which only opened that level
//    to skills. Two words for one same level = anti-synonym law violated:
//    `skillDefaults` is DELETED, never kept as an alias (two truths drift).
//
// ⚠️ NEVER copy this cascade elsewhere (neither into a source, nor into a
//    shell): a source POSES the entry, it resolves NOTHING. It is the rule
//    that already existed for driftUnit — extended to mode and threshold.
//
// ⚠️ DELIBERATE ASYMMETRY, measured, NOT to be "fixed": the `skill` source
//    SKIPS level ③ and its framework default is `once` (the docs: `smart`).
//    A skill is project knowledge — loading it once is enough; a doc is
//    a reminder of a gesture. Uniformising them would flip ALL the skills at
//    the first global config posted = silent regression (contract §6).
const DEFAUTS_FRAMEWORK = { skill: { mode: 'once', global: false }, '': { mode: 'smart', global: true } };
function rulesOf(source) {
  return DEFAUTS_FRAMEWORK[source] || DEFAUTS_FRAMEWORK[''];
}

// Level ②: the defaults declared for THIS source. Absent = empty object (total
// fallback — an undeclared category behaves exactly as before).
function defaultsOf(config, source) {
  const d = config && config.defaults;
  const v = d && source ? d[source] : null;
  return v || {};
}

// Effective mode for ONE doc — full cascade above.
function modeForDoc(config, decl, source) {
  const rules = rulesOf(source);
  const cat = defaultsOf(config, source);
  if (decl && MODES.includes(decl.mode)) return decl.mode;
  if (MODES.includes(cat.mode)) return cat.mode;
  if (rules.global && config && MODES.includes(config.mode)) return config.mode;
  return rules.mode;
}

// Effective threshold for ONE doc: decl.threshold (POSED by a source from the
// frontmatter, never resolved by it) > defaults.{source} > global
// defaultThreshold > 4.
// 🛑 THIS COMMENT LEGITIMISED A BUG FOR WEEKS (fixed 09/08/2026).
//    It said "posed by a SOURCE — e.g. MCP, resolved from
//    servers.{name}.threshold", describing a source that RESOLVES. That is
//    exactly what `sources/mcp.js` did: it ALWAYS posed a value,
//    so the cascade stopped at level ① and `defaults.mcp` was INERT.
//    A source POSES what the author declared; it NEVER has the right to
//    fill in a default — that is what lets the following levels exist.
// ⚠️ COMMENT FIXED ON 29/07/2026 — it asserted the OPPOSITE of reality and
//    cost a doubt in session ("will my doc be rejected?").
//    It said: "FILE docs have no threshold in their frontmatter
//    (unknown key = frontmatter rejected)". That was true BEFORE 17/07/2026;
//    since then, `threshold` is an ADMITTED key of the file frontmatter (validated by
//    frontmatter.js: integer ≥ 1) and therefore does reach here in `decl`.
//    VERIFIED live: `{mode:'smart', threshold:5}` → validate() = [] and
//    thresholdForDoc returns 5 (4 without the key).
//    ⚠️ `threshold` only has an effect IF `mode: smart` — in `dumb`/`once` the counter
//    is never consumed (cf below), so the threshold is DEAD IN SILENCE.
//    This inconsistency is not yet detected by ANY gate (tracked in EVAL-SESSIONS).
// ⚠️ 04/08/2026: level ② (defaults.{source}) inserted — SAME cascade as mode.
//    A threshold is valid at its level if it is an integer ≥ 1, otherwise we GO DOWN
//    (total fallback: an invalid value never crashes anything, it ignores itself).
// 🔴 THE VALIDITY RULE WAS DIFFERENT AT EACH STAGE — found 19/08/2026 by the cadence
//    differential, 43 divergence classes, all the same defect. Stage ② demanded `>= 1`;
//    stages ① and ③ accepted ANY integer, so `0` got through. And a `smart` doc with
//    threshold 0 evaluates `drift >= 0` ⇒ ALWAYS true ⇒ it becomes `dumb`: a SECOND WAY
//    to say what `dumb` already says, silently, for the whole fleet.
// ⚠️ THE UPSTREAM VALIDATORS ALL REFUSE 0 (frontmatter, skills schema, `defaultThreshold`
//    minimum:1) — AND THAT IS NOT A REASON. `config-gate` is a TEST, not a runtime guard:
//    nothing validates `ctxroute-config.json` when the hook reads it, so a hand-edited
//    `defaultThreshold: 0` reached here. Defense in depth: a threshold is a COUNT of
//    ticks, so it is an integer >= 1 at EVERY stage, and an invalid value IGNORES ITSELF
//    and lets the next stage exist (total fallback).
const seuilValide = (v) => Number.isInteger(v) && v >= 1;
function thresholdForDoc(config, decl, source) {
  const cat = defaultsOf(config, source);
  if (decl && seuilValide(decl.threshold)) return decl.threshold;
  if (seuilValide(cat.threshold)) return cat.threshold;
  return seuilValide(config && config.defaultThreshold) ? config.defaultThreshold : 4;
}

// Unit of the `smart` counter for ONE doc — CASCADE OF 3 AUTHORITIES (exact mirror of
// mode/threshold): decl (the entry: frontmatter/skill, posed by the source) >
// global `defaultDriftUnit` (JSON) > FRAMEWORK default 'tool' (exists even without
// any config). `tool` = historical behaviour IDENTICALLY (counter
// sinceLastCall) — the parity differentials see NOTHING change.
// `turn` = compares the session's turn counter (turn-count.js gate).
// ⚠️ Degenerate outside of smart: dumb/once never call this value.
function driftUnitForDoc(config, decl, source) {
  const cat = defaultsOf(config, source);
  if (decl && DRIFT_UNITS.includes(decl.driftUnit)) return decl.driftUnit;
  if (DRIFT_UNITS.includes(cat.driftUnit)) return cat.driftUnit;
  return DRIFT_UNITS.includes(config && config.defaultDriftUnit) ? config.defaultDriftUnit : 'tool';
}

// ═══════════════════════════════════════════════════════════════════════
// GLOBAL FILTER BY TARGET (52, 15/08/2026) — "NEVER inject on these tools"
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ GENERALISES `filterMode`/`filterList` from "MCP servers" to "TARGET"
//    (server OR exact tool name OR wildcard `*`) — SAME WORDS, zero vocabulary
//    created. The asymmetry was class ㊴: a global filter existed for the
//    servers and not for the tools, without justification.
// ⚠️ THE PAIR CASCADES TOGETHER: the level that provides `filterMode` ALSO provides
//    its list (list absent = empty). Mixing the list of one level with the mode
//    of another would be a rule no author ever wrote — ambiguity, the
//    real danger of these extensions (㊺①). `filterMode: "none"` DECLARED in
//    `defaults.{source}` OPTS the category OUT of a global filter (the mirror
//    of the explicit `enforce: false` — without it, the level would be un-opt-out-able).
// ⚠️ FAIL-OPEN: unknown value = no filter, never a guessed block.
// 🛑 A FILTER THAT CUTS IS A SILENCE: `decide` RETURNS the discarded docs
//    (`filteredOut`) so that the gate ANNOUNCES it and `explain.js` NAMES it —
//    without that we would ship a mute hole believing we shipped a setting.
const FILTER_MODES = ['none', 'whitelist', 'blacklist'];
function filterOf(config, source) {
  const cat = defaultsOf(config, source);
  if (FILTER_MODES.includes(cat.filterMode)) {
    return { mode: cat.filterMode, list: cat.filterList };
  }
  return { mode: config && config.filterMode, list: config && config.filterList };
}

// Is the gesture discarded for THE DOCS OF THIS SOURCE? (pure predicate shared
// with yesterday's MCP source — lib-pure.targetExcluded, single source of the matching).
function excludedTargetsFor(config, source, toolName) {
  const f = filterOf(config, source);
  return targetExcluded(f.mode, f.list, toolName);
}

// ═══════════════════════════════════════════════════════════════════════
// `enforce` (05/08/2026) — STOP the gesture, instead of merely informing it.
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ WHY THIS WORD EXISTS — a fact from the official doc, measured on 04/08/2026:
//    the `additionalContext` of a PreToolUse arrives "next to the tool result",
//    therefore AFTER the execution. An injection CANNOT prevent the gesture
//    it targets, it protects the next one. The founding incident of the framework
//    (a real payment click) would NOT have been avoided by an injected doc.
//    Only a refusal does that. It is the only hole the cadence did not plug.
//
// ⚠️ IT REMAINS THE EXCEPTION, NEVER THE RULE: "the injection informs, never
//    blocks" remains the DEFAULT (absent ⇒ behaviour as before, byte for byte).
//    A convenience reminder that blocks makes the system unbearable, and a
//    system one endures ends up unplugged — we would lose ALL the rules.
//
// ⚠️ THIS IS NOT A SECURITY MEASURE, it is a GUARDRAIL. The gate is fail-open by
//    contract: hook dead ⇒ the tool passes. It protects against a distracted agent,
//    never against an adversary. Never present it otherwise.
//
// Cascade IDENTICAL to the other settings (entry > defaults.{source} > framework
// default `false`). ⚠️ NO GLOBAL level: a global `enforce` would block the
// first gesture of every session on every doc — the system one unplugs.
// An explicit `false` CANCELS the inheritance: without it, a category moved to
// enforce would be UN-OPT-OUT-ABLE (the classic dead end of cascades).
function enforceForDoc(config, decl, source) {
  const cat = defaultsOf(config, source);
  if (decl && typeof decl.enforce === 'boolean') return decl.enforce;
  if (typeof cat.enforce === 'boolean') return cat.enforce;
  return false;
}

// `enforce` FOLLOWS THE CADENCE — it has NO rhythm of its own (05/08/2026).
// The block happens when the doc injects: same condition, a single axis.
// That is what keeps the word tiny, and ALL the modes usable:
//   `once`  → one block, then nothing more for the session.
//   `smart` → one block, pass, then a new block after N calls.
//   `dumb`  → block / pass / block / pass… alternating.
//
// ⚠️ NO mode is forbidden, and that is NOT an oversight: the anti-loop
//    guarantee does not come from a filter on the mode but from the ALTERNATION
//    (`denied` flag, cf `decide`). A block is never followed by a
//    block — so the agent can ALWAYS redo its gesture on the next attempt.
//    Filtering `dumb` here would be redundant AND would cripple the language.
//
// 🛑 THERE IS ONLY ONE NAME FOR THIS PREDICATE — `enforceForDoc` (10/08/2026).
//    An alias `bloqueForDoc` existed here, `return enforceForDoc(...)`
//    identically: TWO exported names for ONE code path, that is to say the
//    anti-synonym law violated in the very file that embodies the language. No
//    mutant could catch it (a pass-through has nothing to mutate). NEVER
//    reintroduce it: "to block" is not one more semantics than
//    "enforce", it is the same fact said twice.

/**
 * THE gate's decision. PURE — mutates NO argument.
 *
 * @param {object} config  - ctxroute-config.json (mode, defaultThreshold, defaults…)
 * @param {object} decls   - { [doc]: frontmatter } of the WHOLE corpus (modes of the
 *                           "foreign" docs needed by the smart counters).
 * @param {string[]} matched - docs matched by the source, ORDER = injection order.
 * @param {object} state   - { [doc]: { seen, sinceLastCall, turn? } } BEFORE this call.
 * @param {number} [turnCount] - counter of the session's TURNS (turn-count.js
 *                           gate, UserPromptSubmit). CONTRACT: the caller
 *                           passes an integer (0 if unknown/unreadable) — never a
 *                           guard here (equivalent mutant). Consumed ONLY
 *                           by smart docs with driftUnit 'turn'.
 * @param {Object<string,string>} [owners] - OWNER source of each doc
 *                           (acc.owner, posed by the adapter) — the only entry of
 *                           level ② of the cascade (`defaults.{source}`).
 * @param {string} [toolName] - the TARGET of the gesture (global filter 52). ABSENT =
 *                           no filter by tool name can bite —
 *                           behaviour identical to BEFORE (parity).
 * @returns {{ decision: 'none'|'allow'|'deny', inject: string[], state: object, changed: boolean, filteredOut: string[] }}
 *
 * ⚠️ `changed` = the state REALLY moved — a 100% dumb corpus NEVER
 *    produces a write (perf parity with protect-files, which has no state).
 */
function decide(config, decls, matched, state, turnCount, owners, toolName) {
  const prev = state || {};
  // ⚠️ OWNER source of each doc (acc.owner, posed by the adapter) —
  //    the only entry of level ② of the cascade. ABSENT = cascade as BEFORE,
  //    identically (parity: the differentials see nothing change).
  const src = (doc) => (owners ? owners[doc] : undefined);
  // ── GLOBAL FILTER BY TARGET (52): the discarded docs LEAVE the gesture ──
  //    Neither injected nor "recalled" (their counter is not reset) —
  //    exactly as if they had not matched; the call therefore advances the
  //    foreign counters as before (historical contract of the server filter).
  //    RETURNED in `filteredOut`: a filter that cuts silently = a mute hole.
  const filteredOut = matched.filter((doc) => excludedTargetsFor(config, src(doc), toolName));
  const kept = matched.filter((doc) => !filteredOut.includes(doc));
  const matchedSet = new Set(kept);
  const next = {};
  let changed = false;

  // ⚠️ INDEPENDENT COUNTERS PER DOC (same doctrine as legacy-mcp-inject.js per
  //    server): this call is "foreign" to any doc already seen and NOT matched
  //    here — its counter only advances if ITS mode is smart.
  // ⚠️ NO `entry.sinceLastCall || 0` nor `entry.seen` guard here: the state
  //    entries are ALWAYS written by decide() as { seen: true, sinceLastCall: n }
  //    — a guard on a state we alone write = equivalent mutant.
  // ⚠️ The foreign-tool counter only advances for the 'tool' unit: a
  //    doc with driftUnit 'turn' measures its drift via turnCount (no state to
  //    increment here) — incrementing it anyway = dead disk writes.
  for (const doc of Object.keys(prev)) {
    const entry = prev[doc];
    if (!matchedSet.has(doc) && entry && modeForDoc(config, decls[doc], src(doc)) === 'smart'
      && driftUnitForDoc(config, decls[doc], src(doc)) === 'tool') {
      next[doc] = { seen: true, sinceLastCall: entry.sinceLastCall + 1 };
      changed = true;
    } else {
      next[doc] = entry;
    }
  }

  // Per-DOC decision on the state from BEFORE (unaffected by this call), then
  // reset of its counter — matched = "recalled", injected or not.
  const inject = [];
  // Docs that REFUSE the gesture on THIS call (alternation: cf below).
  const blocked = [];
  for (const doc of kept) {
    // ⚠️ No default object `|| { seen: false, … }`: equivalent ObjectLiteral
    //    mutant ({} gives the same falsy values). The ternaries on `entry` suffice.
    const entry = prev[doc];
    // ⚠️ A SINGLE smart decision point: the drift (`since`) is measured
    //    in the doc's UNIT — 'tool' = sinceLastCall counter (historical),
    //    'turn' = turns elapsed since the last delivery (turnCount - entry.turn).
    //    shouldInjectFor remains the ONLY judge (never a smart duplicated per unit).
    const since = driftUnitForDoc(config, decls[doc], src(doc)) === 'turn'
      ? (entry ? turnCount - entry.turn : 0)
      : (entry ? entry.sinceLastCall : 0);
    const injects = shouldInjectFor(modeForDoc(config, decls[doc], src(doc)), entry ? entry.seen : false, since, thresholdForDoc(config, decls[doc], src(doc)));
    if (injects) inject.push(doc);
    // ── ALTERNATION OF THE BLOCK (05/08/2026) ─────────────────────────
    // 🛑 UNIVERSAL RULE: **a block is NEVER followed by a block.**
    //    The gesture the agent redoes right after ALWAYS passes, whatever
    //    the mode; then the cadence resumes its normal course.
    //    That, and nothing else, is what makes an infinite loop impossible —
    //    so `dumb` becomes legitimate too (block, pass, block, pass).
    // ⚠️ Do not confuse it with "the doc is no longer injected": in `dumb` it
    //    is re-injected on every call, only the REFUSAL alternates.
    if (injects && enforceForDoc(config, decls[doc], src(doc)) && !(entry && entry.denied === true)) {
      blocked.push(doc);
    }
    // ⚠️ Write the state ONLY if the mode consumes it: a `dumb` doc always
    //    injects and never reads seen/sinceLastCall — tracking it would be a
    //    disk write per call for nothing (the migrated corpus is 100% dumb).
    // ⚠️ An `enforce` doc MUST write its state EVEN in `dumb`: it is the
    //    `denied` flag that guarantees the alternation. Without it, dumb would re-block
    //    endlessly. Docs without `enforce` keep the behaviour from BEFORE,
    //    byte for byte (no write in dumb) — parity intact, differentials green.
    const enf = enforceForDoc(config, decls[doc], src(doc));
    if (modeForDoc(config, decls[doc], src(doc)) !== 'dumb' || enf) {
      // `turn` memorised at EVERY recall = "last delivery" timestamp,
      // a SINGLE state shape (never 2 forms depending on the unit). In pure
      // 'tool' unit (turnCount=0 constant), `entry.turn !== turnCount` NEVER
      // triggers an extra write — perf parity intact.
      next[doc] = { seen: true, sinceLastCall: 0, turn: turnCount };
      // ⚠️ `denied` exists ONLY on enforce docs: the shape of the others does not
      //    move by a single byte (the parity differentials compare the state).
      if (enf) next[doc].denied = blocked.includes(doc);
      if (!entry || entry.sinceLastCall !== 0 || entry.turn !== turnCount
        || (enf && entry.denied !== next[doc].denied)) changed = true;
    }
  }

  // ⚠️ THREE decisions, never four again (05/08/2026): nothing to inject =
  //    `none` · an `enforce` doc has bitten = `deny` · otherwise `allow`. There is
  //    nothing to decide when nothing is injected: blocking without delivering the knowledge
  //    would be a mute wall — the worst of both worlds.
  const decision = inject.length === 0
    ? 'none'
    : blocked.length > 0
      ? 'deny'
      : 'allow';

  return { decision, inject, state: next, changed, filteredOut };
}

// Short label of an injected doc (user-only systemMessage) — EXACT REPLICA of
// protect-files.js's docLabel (FIRST [source: …] tag otherwise markdown title,
// '' if nothing). ⚠️ Parity before correctness: even though the FIRST marker may come
// from the CONTENT of a doc (61 measured), we keep the old behaviour —
// "improving" the label = a behaviour change shipped on the sly (decision 8).
function docLabel(doc) {
  // ⚠️ No `|| ''` before String(): String(null) = 'null' matches neither tag nor
  // title → same output '' — the guard would be an equivalent mutant.
  const s = String(doc);
  const src = s.match(/\[source:\s*([^\]]+)\]/);
  if (src) return src[1].split(/[\\/]/).pop().replace(/\.md$/, '');
  // ⚠️ MANDATORY SPACE AFTER THE `#` — REAL BUG fixed on 06/08/2026.
  //    The old form `^#\s*(.+)$` accepted a `#` glued to the text, so it
  //    took the SEAL FOOTER `###FIN:7426e64b###` for a title: the badge
  //    of a split doc displayed "📄 doc: ##FIN:7426e64b###" instead of the
  //    document's name. The first piece does not carry the `[source:]` tag
  //    (it lives at the END of the document), so this fallback was genuinely
  //    reached — it was not a theoretical case.
  // ⚠️ COMPLIANT WITH COMMONMARK, this is not a home-made choice: "the opening
  //    sequence of # characters must be followed by spaces or tabs, or by the
  //    end of line". `###FIN:xxx###` is therefore NOT an ATX heading. NEVER
  //    loosen this regex to "catch more titles": it would once again
  //    catch our own transport markers.
  const title = s.match(/^#{1,6}[ \t]+(.+)$/m);
  return title ? title[1].slice(0, 40) : '';
}

module.exports = { decide, docLabel, modeForDoc, thresholdForDoc, driftUnitForDoc, enforceForDoc, excludedTargetsFor };
