'use strict';
// ═══════════════════════════════════════════════════════════════════════
// cadence-spec.js — THE SEMANTICS OF THE CADENCE, WRITTEN FROM THE INTENTION
// ═══════════════════════════════════════════════════════════════════════
//
// 🛑 THIS FILE IS NOT THE ENGINE AND MUST NEVER BECOME IT. It is the twin of
//    `language-spec.js`, for the OTHER HALF of the language: `language-spec`
//    says WHICH docs a gesture selects, this one says WHETHER a selected doc
//    is DELIVERED, and whether the gesture is REFUSED.
//    `cadence-differential.test.js` confronts this model EXHAUSTIVELY with
//    `gate.js`: any divergence is a bug — in one or in the other, and you must
//    say WHICH.
//
// 🔴 WHY IT EXISTS (19/08/2026). Until today HALF the language had a machine
//    judge and half did not. The matching half has an independent model, an
//    exhaustive differential, an atoms table and a characterised completeness
//    measurement. The cadence half had only tests that CALL the engine — so
//    they proved what it DOES, never what it SHOULD DO. That is precisely the
//    situation that produced ㊵/㊴/㊼ on the matching side, each found by a
//    HUMAN who insisted, each costing a session.
//    ⚠️ AND THE CADENCE AXIS HAD ALREADY PAID IT TWICE:
//      · `enforce` was not transported by `sources/mcp.js` ⇒ the word that
//        REFUSES an action was INERT on the MCP channel — exactly where the
//        founding incident lives (the accidental Stripe payment click). Found
//        24 h later by ARMING it for real, not by a test.
//      · `sources/mcp.js` FILLED the decl with a default ⇒ the cascade stopped
//        at stage ① and `defaults.mcp` was INERT while `defaults.skill` worked.
//    Two "accepted and inert" defects, on the axis with no model. Same shape as
//    everything closed on 19/08. This file is what makes the shape visible.
//
// ⚠️ WRITING RULE, non-negotiable: **written by reading the INTENTION, never the
//    implementation.** Copying `gate.js` would fabricate a twin, and a twin only
//    proves that a copy agrees with itself (paid on 31/07/2026: 3 home-made
//    probes, 3 false verdicts, one session lost).
// ⚠️ PURE: zero I/O, zero dependency, zero harness dialect. Publishable as is.
//
// ───────────────────────────────────────────────────────────────────────
// THE SEMANTICS, IN FIVE RULES
// ───────────────────────────────────────────────────────────────────────
//   ① CASCADE — a setting takes the value of the FIRST authority that declares
//      a VALID one: entry > defaults.{source} > global > framework default.
//      An invalid value is not an error: it IGNORES ITSELF and we go down.
//      That total fallback is what makes a config impossible to break.
//   ② DELIVERY — `dumb`: always · never seen: always (a first time is a first
//      time, whatever the mode) · `smart`: when the DRIFT reaches the threshold ·
//      `once` already seen: never.
//   ③ DRIFT — measured in the doc's OWN unit: `tool` counts the gestures that
//      ignored it, `turn` counts the conversation turns since its last delivery.
//   ④ MEMORY — a delivered-or-recalled doc forgets its drift (reset). A doc that
//      the gesture ignored accumulates it, but ONLY if it could ever spend it.
//   ⑤ REFUSAL — a refusal is NEVER followed by a refusal. That single rule, and
//      nothing else, makes an infinite loop impossible; it is why no mode has to
//      be forbidden.
// ═══════════════════════════════════════════════════════════════════════

const MODES = ['dumb', 'once', 'smart'];
const DRIFT_UNITS = ['tool', 'turn'];
const FILTER_MODES = ['none', 'whitelist', 'blacklist'];

// ── ① THE CASCADE ───────────────────────────────────────────────────────
//
// ⚠️ THE FOUR ASYMMETRIES ARE INTENTIONAL, AND EACH HAS ITS REASON. They are
//    written HERE, as data, because an asymmetry that lives only in a `if`
//    somewhere is an asymmetry nobody can audit:
//      · `mode`'s framework default depends on the SOURCE — a skill is project
//        knowledge (`once`), a doc is a guardrail that must come back (`smart`).
//      · a skill SKIPS the global stage: unifying would flip EVERY skill the
//        first time someone sets a global mode.
//      · `enforce` has NO global stage: a global refusal would reject the first
//        action of every session, and a system people endure gets unplugged.
//      · `threshold`/`driftUnit` have no source-dependent default: they qualify
//        the `smart` drift, which means the same thing everywhere.
const FRAMEWORK = {
  mode: (source) => (source === 'skill' ? 'once' : 'smart'),
  threshold: () => 4,
  driftUnit: () => 'tool',
  enforce: () => false,
};
/** Which settings read the GLOBAL stage, and under which config key. */
const GLOBAL_KEY = { mode: 'mode', threshold: 'defaultThreshold', driftUnit: 'defaultDriftUnit' };

/** A value is ACCEPTED at a stage only if it is valid FOR THAT SETTING. */
const VALIDE = {
  mode: (v) => MODES.includes(v),
  // 🛑 A threshold is a COUNT of ticks: an integer ≥ 1. `0` would mean
  //    "re-inject immediately", which is what `dumb` already says — and a second
  //    way to say one thing is a second truth. Stated at EVERY stage: a
  //    validator upstream is not a reason for the engine to trust its input
  //    (defense in depth — the engine is also reachable from a hand-edited config).
  threshold: (v) => Number.isInteger(v) && v >= 1,
  driftUnit: (v) => DRIFT_UNITS.includes(v),
  // An EXPLICIT `false` is a VALUE, never an absence: it is the only way to
  // opt out of a `defaults.{source}.enforce: true`. Filtering it as "empty"
  // would make a category impossible to leave — the dead end of any cascade.
  enforce: (v) => typeof v === 'boolean',
};

/**
 * The effective value of ONE setting for ONE doc.
 * @param {string} reglage - 'mode' | 'threshold' | 'driftUnit' | 'enforce'
 * @param {Object<string,any>} config - the global config
 * @param {object} decl - what the ENTRY declared (frontmatter / registry entry)
 * @param {string} source - the doc's owner source ('file'|'mcp'|'skill'|'tool')
 */
function resolve(reglage, config, decl, source) {
  const valide = VALIDE[reglage];
  const cfg = config || {};
  // ① the entry has the last word.
  if (decl && valide(decl[reglage])) return decl[reglage];
  // ② all the docs of THIS category.
  const cat = (cfg.defaults && source && cfg.defaults[source]) || {};
  if (valide(cat[reglage])) return cat[reglage];
  // ③ the global stage — which does not exist for every setting, nor for every source.
  const cle = GLOBAL_KEY[reglage];
  const globalOuvert = cle !== undefined && !(reglage === 'mode' && source === 'skill');
  if (globalOuvert && valide(cfg[cle])) return cfg[cle];
  // ④ the framework, which exists even with no config at all.
  return FRAMEWORK[reglage](source);
}

// ── THE GLOBAL FILTER BY TARGET ─────────────────────────────────────────
//
// ⚠️ THE PAIR CASCADES TOGETHER: the stage that supplies the MODE supplies its
//    LIST. Mixing one stage's list with another's mode would express a rule no
//    author ever wrote — and ambiguity, not the limit, is what these extensions
//    have to fear.
// ⚠️ `"none"` declared at the category stage OPTS THAT CATEGORY OUT of a global
//    filter — the mirror of the explicit `enforce: false`.
function filterOf(config, source) {
  const cfg = config || {};
  const cat = (cfg.defaults && source && cfg.defaults[source]) || {};
  if (FILTER_MODES.includes(cat.filterMode)) {
    return { mode: cat.filterMode, list: Array.isArray(cat.filterList) ? cat.filterList : [] };
  }
  if (FILTER_MODES.includes(cfg.filterMode)) {
    return { mode: cfg.filterMode, list: Array.isArray(cfg.filterList) ? cfg.filterList : [] };
  }
  return { mode: 'none', list: [] };
}

/**
 * Is this doc's TARGET excluded? The target is the tool that is acting: an MCP
 * server name, an exact tool name, or the wildcard.
 * ⚠️ FAIL-OPEN: an unknown mode filters nothing. We never guess a block.
 */
function cible(toolName) {
  const nom = typeof toolName === 'string' ? toolName : '';
  const mcp = /^mcp__([^_]+(?:_[^_]+)*?)__/.exec(nom);
  return { nom, serveur: mcp ? mcp[1] : null };
}
function targetExclu(config, source, toolName) {
  const f = filterOf(config, source);
  if (f.mode === 'none') return false;
  const c = cible(toolName);
  const liste = f.list.map(String);
  const dedans = liste.includes('*') || liste.includes(c.nom) || (c.serveur !== null && liste.includes(c.serveur));
  return f.mode === 'whitelist' ? !dedans : dedans;
}

// ── ②③ DELIVERY AND DRIFT ───────────────────────────────────────────────

/**
 * The DRIFT of a doc, in its own unit.
 * ⚠️ Never seen ⇒ zero drift: there is nothing to drift from. It costs nothing
 *    to state, and it is what makes the first delivery independent of the unit.
 */
function derive(unite, entry, turnCount) {
  if (!entry) return 0;
  return unite === 'turn' ? turnCount - entry.turn : entry.sinceLastCall;
}

/**
 * ② Is this doc DELIVERED on this gesture?
 * 🛑 The order of the three clauses IS the semantics: `dumb` never consults
 *    memory, and a first time is a first time in every mode. Only then does the
 *    mode decide — which is why `once` is expressible without a single counter.
 */
function livre(mode, vu, drift, seuil) {
  if (mode === 'dumb') return true;
  if (!vu) return true;
  return mode === 'smart' && drift >= seuil;
}

// ── ④⑤ THE COMPLETE DECISION ────────────────────────────────────────────

/**
 * The model of `gate.decide`. Returns the same three observables: what is
 * delivered, what the memory becomes, and what the gesture is allowed to do.
 *
 * @param {Object<string,any>} config
 * @param {Object<string,object>} decls - what each doc's entry declared
 * @param {string[]} matched - the docs the matching half selected, in order
 * @param {object} state - the memory BEFORE this gesture
 * @param {number} turnCount - the session's turn counter
 * @param {Object<string,string>} owners - each doc's owner source
 * @param {string} toolName - the acting tool (the filter's target)
 */
function decide(config, decls, matched, state, turnCount, owners, toolName) {
  const prev = state || {};
  const src = (doc) => (owners ? owners[doc] : undefined);
  const reg = (r, doc) => resolve(r, config, (decls || {})[doc], src(doc));

  // 🛑 A FILTERED DOC LEAVES THE GESTURE ENTIRELY: it is neither delivered nor
  //    recalled, exactly as if the matching half had never selected it. Its
  //    drift therefore keeps accumulating — a filter suspends the injection,
  //    it does not rewrite the past. And it is RETURNED, because a filter that
  //    cuts in silence is a hole disguised as a setting.
  const filteredOut = matched.filter((doc) => targetExclu(config, src(doc), toolName));
  const retenus = matched.filter((doc) => !filteredOut.includes(doc));
  const vise = new Set(retenus);

  const next = {};

  // ④ THE DOCS THIS GESTURE IGNORED accumulate drift — but ONLY those that could ever
  //    SPEND it. A `dumb` or `once` doc never reads its counter, and a `turn` doc reads the
  //    clock instead: incrementing them would be a disk write that changes no decision.
  // ⚠️ WRITTEN AS AN EXPRESSION, NOT A MUTATION — and that is deliberate. `jscpd` caught an
  //    11-line clone between this loop and `gate.js`: at that point the model READ LIKE THE
  //    ENGINE, and a twin only proves a copy agrees with itself. When the only way you can
  //    state an intention is the engine's own way, the model has stopped being independent.
  for (const doc of Object.keys(prev)) {
    const entry = prev[doc];
    const peutDepenser = reg('mode', doc) === 'smart' && reg('driftUnit', doc) === 'tool';
    next[doc] = (entry && peutDepenser && !vise.has(doc))
      ? { seen: true, sinceLastCall: entry.sinceLastCall + 1 }
      : entry;
  }

  const inject = [];
  const blocked = [];
  for (const doc of retenus) {
    const entry = prev[doc];
    const mode = reg('mode', doc);
    const enforce = reg('enforce', doc);
    const delivre = livre(mode, entry ? entry.seen : false,
      derive(reg('driftUnit', doc), entry, turnCount), reg('threshold', doc));
    if (delivre) inject.push(doc);

    // ⑤ ALTERNATION — a refusal is never followed by a refusal. The gesture the
    //    agent redoes ALWAYS passes, then the cadence resumes. This is the whole
    //    anti-loop: no mode has to be forbidden, `dumb` included (block, pass,
    //    block, pass).
    if (delivre && enforce && !(entry && entry.denied === true)) blocked.push(doc);

    // ④ A recalled doc forgets its drift, delivered or not — being looked at is
    //    what resets it. We only WRITE that memory if the mode can ever read it;
    //    an `enforce` doc always writes, because its alternation flag lives there.
    if (mode !== 'dumb' || enforce) {
      next[doc] = { seen: true, sinceLastCall: 0, turn: turnCount };
      if (enforce) next[doc].denied = blocked.includes(doc);
    }
  }

  // 🛑 THREE decisions, never four. And nothing is refused when nothing is
  //    delivered: blocking without handing over the knowledge would be a mute
  //    wall — the worst of both worlds.
  // ⚠️ `changed` is DERIVED from the memory, never accumulated along the way: "did the
  //    memory move?" is a question about the RESULT, and answering it with a flag raised in
  //    three places is how a flag ends up disagreeing with the thing it describes.
  const bouge = (a, b) => JSON.stringify(a) !== JSON.stringify(b);
  const changed = Object.keys({ ...prev, ...next }).some((doc) => bouge(prev[doc], next[doc]));

  const decision = inject.length === 0 ? 'none' : (blocked.length > 0 ? 'deny' : 'allow');
  return { decision, inject, state: next, changed, filteredOut };
}

module.exports = {
  decide, resolve, livre, derive, targetExclu, filterOf,
  MODES, DRIFT_UNITS, FILTER_MODES, FRAMEWORK,
};
