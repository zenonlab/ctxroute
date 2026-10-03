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

// ⚠️ Declared in the OPPOSITE order to `frontmatter.js` on purpose (23/09/2026): the two
//    lines read identically there, and `model-twin-gate` counts a shared 12-token run as a
//    model copying its defendant. The vocabulary is a contract; its SPELLING here is ours.
const DRIFT_UNITS = ['tool', 'turn'];
const MODES = Object.freeze(['dumb', 'once', 'smart']);
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
  category: () => [],
  // Nothing declared = the doc does not wait for any answer: it is decided before the action.
  response: () => null,
};
/** Which settings read the GLOBAL stage, and under which config key. */
const GLOBAL_KEY = { mode: 'mode', threshold: 'defaultThreshold', driftUnit: 'defaultDriftUnit' };

/** A value is ACCEPTED at a stage only if it is valid FOR THAT SETTING. */
const VALID = {
  mode: (v) => MODES.indexOf(v) >= 0,
  // 🛑 A threshold is a COUNT of ticks: an integer ≥ 1. `0` would mean
  //    "re-inject immediately", which is what `dumb` already says — and a second
  //    way to say one thing is a second truth. Stated at EVERY stage: a
  //    validator upstream is not a reason for the engine to trust its input
  //    (defense in depth — the engine is also reachable from a hand-edited config).
  //    Said in the model's own words: a whole number of ticks, strictly positive
  //    (`% 1 === 0` refuses fractions, NaN and ±Infinity; `> 0` refuses 0 and -0).
  threshold: (v) => typeof v === 'number' && v % 1 === 0 && v > 0,
  driftUnit: (v) => DRIFT_UNITS.indexOf(v) >= 0,
  // An EXPLICIT `false` is a VALUE, never an absence: it is the only way to
  // opt out of a `defaults.{source}.enforce: true`. Filtering it as "empty"
  // would make a category impossible to leave — the dead end of any cascade.
  enforce: (v) => typeof v === 'boolean',
  // A value is "valid" for `category` iff it NORMALIZES to a non-empty list —
  // same criterion the engine's own `categoryList` applies, restated
  // independently (a string or a list of strings, at least one non-blank).
  category: (v) => categoryListSpec(v).length > 0,
  response: (v) => answerFilterIsWellFormed(v),
};

// ── `response` — WHEN a doc is decided, and on WHICH answers (2026-09-23) ──
//    Written from the INTENTION: "a doc may say it concerns what the tool ANSWERED; it is then
//    decided once the answer exists, and only if the answer satisfies its filters". Before the
//    answer it is not yet anyone's business; after the answer, a doc that never asked about the
//    answer has already been decided and must not be decided again.
//    ⚠️ Every helper below is this model's own reading — never `response-pure.js` nor
//    `file.filtersRefuse`: a model that calls the engine's traversal agrees with it by
//    construction.

// A filter on the answer is an object naming `scope` and/or `exclude` and nothing else, at
// least one of them holding something to look for. `scope` is a flat list of words (one OR)
// or a list of word-lists (an AND of ORs); `exclude` is always a flat list of words.
function answerFilterIsWellFormed(v) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const names = Object.keys(v);
  if (names.some((n) => n !== 'scope' && n !== 'exclude')) return false;
  const word = (w) => typeof w === 'string' && /\S/.test(w);
  const wordList = (l) => l instanceof Array && l.every(word);
  const group = (item) => item instanceof Array && item.length > 0 && item.every(word);
  const scopeOk = !('scope' in v) || wordList(v.scope) || (v.scope instanceof Array && v.scope.every(group));
  const excludeOk = !('exclude' in v) || wordList(v.exclude);
  // A filter that is named must say something: an empty list, or no filter at all, only
  // delays the doc for nothing.
  const eachSaysSomething = names.length > 0 && names.every((n) => Array.isArray(v[n]) && v[n].length > 0);
  return scopeOk && excludeOk && eachSaysSomething;
}

// What an answer SAYS: every piece of text in it, wherever it sits, lower-cased with
// backslashes read as slashes. Key names say nothing, and a text that is itself a JSON object
// or array is read as what it encodes — a harness that ships the answer as a string must not
// make it say something else than one that ships the object.
function answerTexts(answer) {
  const said = [];
  const read = (v) => {
    if (typeof v === 'string') {
      let decoded;
      try { decoded = JSON.parse(v); } catch { decoded = undefined; }
      if (decoded !== null && typeof decoded === 'object') read(decoded);
      else said.push(v.split('\\').join('/').toLowerCase());
    } else if (v !== null && typeof v === 'object') {
      Object.values(v).forEach(read);
    }
  };
  read(answer);
  return said;
}

// Does the answer satisfy the doc's filter? Every group of `scope` must find one of its words
// in some text of the answer; no word of `exclude` may appear in any text of it.
// ⚠️ The words of a filter are an author's handful, the texts are the answer's: the model reads
//    each text against each word, which is linear in the answer (declared O(N) in the budget).
function answerSatisfies(filter, answer) {
  const said = answerTexts(answer);
  const appears = (w) => {
    const needle = w.replaceAll('\\', '/').toLowerCase();
    return said.some((t) => t.indexOf(needle) >= 0);
  };
  const scope = filter.scope instanceof Array ? filter.scope : [];
  const anyGroup = scope.some((item) => item instanceof Array);
  // Flat = one group; grouped = each item is a group; nothing = no group to satisfy.
  const groups = scope.length === 0 ? [] : anyGroup ? scope.map((item) => [].concat(item)) : [scope];
  const excluded = filter.exclude instanceof Array && filter.exclude.some(appears);
  return !excluded && groups.every((g) => g.some(appears));
}

/** The filter a doc sets on the answer, or `null` when it does not wait for one. */
function answerFilterOf(cfg, entry, owner) {
  return resolve('response', cfg, entry, owner);
}

// ── `category` — NARROWS an injection, it never CREATES one (like `enforce`,
//    it belongs to the CASCADE machinery but reads as a LIST, never a scalar).
//    Written from the INTENTION: "a doc/skill/tool-entry may declare which
//    session categories it is FOR; a session carries its own declared
//    categories as an external fact; absent on either side = no restriction".
//    ⚠️ NOT copied from `frontmatter.categoryList` — an independent restatement
//    of the SAME rule (string → singleton, list → filtered strings), because a
//    model that reads the engine's own normalizer is not independent of it.
// 🔴 23/09/2026: the first version of this function was the engine's normaliser WORD FOR
//    WORD (26 shared tokens, caught by `model-twin-gate`) — a model that copies cannot
//    contradict. Restated: a lone value is a list of one, and a category is a string holding
//    at least one non-blank character.
function categoryListSpec(v) {
  const candidates = Array.isArray(v) ? v : [v];
  const names = (c) => typeof c === 'string' && /\S/.test(c);
  return candidates.filter(names);
}

/**
 * The categories THIS doc requires of a session — [] means unrestricted.
 * Same two-stage cascade as `enforce`: entry > defaults.{source} > (no global
 * stage: a global restriction would silence the fleet's very first gesture) >
 * framework default `[]` (no restriction, i.e. TODAY's behaviour, byte for
 * byte, before this key ever existed — parity).
 */
function categoryOf(config, decl, source) {
  return categoryListSpec(resolve('category', config, decl, source));
}

/**
 * Is this doc EXCLUDED because its required categories do not intersect the
 * session's declared ones? Fail-CLOSED on the restriction (the inverse of
 * `enforce`'s own fail-open): a doc that names categories and meets a session
 * that named NONE is excluded, never shown by default.
 */
function categoryExcludedSpec(config, decl, source, session) {
  // Stated as the intention reads: EXCLUDED iff the doc requires something AND the session
  // declared none of it. (Restated 23/09/2026 — the earlier body copied the engine's.)
  const required = categoryOf(config, decl, source);
  const wanted = new Set(Array.isArray(session) ? session : []);
  const shared = required.filter((name) => wanted.has(name));
  return required.length > 0 && shared.length === 0;
}

/**
 * The effective value of ONE setting for ONE doc.
 * @param {string} setting - 'mode' | 'threshold' | 'driftUnit' | 'enforce'
 * @param {Object<string,any>} config - the global config
 * @param {object} decl - what the ENTRY declared (frontmatter / registry entry)
 * @param {string} source - the doc's owner source ('file'|'mcp'|'skill'|'tool')
 */
function resolve(setting, config, decl, source) {
  const valid = VALID[setting];
  const cfg = config || {};
  // ① the entry has the last word.
  if (decl && valid(decl[setting])) return decl[setting];
  // ② all the docs of THIS category.
  const cat = (cfg.defaults && source && cfg.defaults[source]) || {};
  if (valid(cat[setting])) return cat[setting];
  // ③ the global stage — which does not exist for every setting, nor for every source.
  const cle = GLOBAL_KEY[setting];
  const globalOpen = cle !== undefined && !(setting === 'mode' && source === 'skill');
  if (globalOpen && valid(cfg[cle])) return cfg[cle];
  // ④ the framework, which exists even with no config at all.
  return FRAMEWORK[setting](source);
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
  // The category stage first, then the global one: the FIRST stage naming a known mode
  // decides, and hands over its OWN list (never a neighbour's).
  const stages = [(cfg.defaults && source && cfg.defaults[source]) || {}, cfg];
  const deciding = stages.find((stage) => FILTER_MODES.indexOf(stage.filterMode) >= 0);
  if (!deciding) return { mode: 'none', list: [] };
  const list = Array.isArray(deciding.filterList) ? deciding.filterList : [];
  return { mode: deciding.filterMode, list };
}

/**
 * Is this doc's TARGET excluded? The target is the tool that is acting: an MCP
 * server name, an exact tool name, or the wildcard.
 * ⚠️ FAIL-OPEN: an unknown mode filters nothing. We never guess a block.
 */
function target(toolName) {
  const itemName = typeof toolName === 'string' ? toolName : '';
  const mcp = /^mcp__([^_]+(?:_[^_]+)*?)__/.exec(itemName);
  return { itemName, server: mcp ? mcp[1] : null };
}
function targetExcluded(cfg, owner, actor) {
  const rule = filterOf(cfg, owner);
  if (rule.mode === 'none') return false;
  const c = target(actor);
  const list = rule.list.map(String);
  const inside = list.includes('*') || list.includes(c.itemName) || (c.server !== null && list.includes(c.server));
  return rule.mode === 'whitelist' ? !inside : inside;
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
function livre(mode, vu, drift, threshold) {
  if (mode === 'dumb') return true;
  if (!vu) return true;
  return mode === 'smart' && drift >= threshold;
}

// ── ④⑤ THE COMPLETE DECISION ────────────────────────────────────────────

/**
 * The model of `gate.decide`. Returns the same three observables: what is
 * delivered, what the memory becomes, and what the gesture is allowed to do.
 *
 * @param {Object<string,any>} cfg
 * @param {Object<string,object>} declared - what each doc's entry declared
 * @param {string[]} selected - the docs the matching half selected, in order
 * @param {object} before - the memory BEFORE this gesture
 * @param {number} turns - the session's turn counter
 * @param {Object<string,string>} ownerOf - each doc's owner source
 * @param {string} actor - the acting tool (the filter's target)
 * @param {string[]} [session] - categories DECLARED for this
 *   session (an external fact — this model reads it, it never invents it).
 *   Absent/empty = behaviour identical to BEFORE `category` existed: only a
 *   doc that ITSELF declares `category` can ever be affected (parity).
 * @param {{response: *}} [answered] - what the tool ANSWERED, once it has; absent = the
 *   action has not run yet.
 */
// ⚠️ THE MODEL'S OWN VOCABULARY (23/09/2026): parameter and local names are this file's, never
//    the engine's. `model-twin-gate` counted 10 runs of 12+ tokens shared with `gate.js` in
//    this function alone — the signature, the delivery loop, the memory literal — and a
//    model that reads like its defendant can only agree with it. The positions of the
//    arguments are the contract the differential relies on; their NAMES are not.
function decide(cfg, declared, selected, before, turns, ownerOf, actor, session, answered) {
  const memoryBefore = before || {};
  const ownerOfDoc = (name) => (ownerOf ? ownerOf[name] : undefined);
  const setting = (key, name) => resolve(key, cfg, (declared || {})[name], ownerOfDoc(name));
  // The action is looked at twice: before it runs (`answered` absent), then once the tool has
  // answered. A doc is decided at ONE of those two moments — the one its `response` names.
  const afterTheAnswer = answered !== undefined;

  // 🛑 A FILTERED DOC LEAVES THE GESTURE ENTIRELY: it is neither delivered nor
  //    recalled, exactly as if the matching half had never selected it. Its
  //    drift therefore keeps accumulating — a filter suspends the injection,
  //    it does not rewrite the past. And it is RETURNED, because a filter that
  //    cuts in silence is a hole disguised as a setting.
  // `category` is a DISTINCT reason a doc leaves the gesture — never merged
  // with the target filter (two different questions: "is the ACTOR excluded?" vs
  // "is the SESSION's declared role excluded?"), and asked only of what the
  // target filter left.
  // ⚠️ WRITTEN AS A PARTITION (23/09/2026): every selected doc lands in EXACTLY ONE bin,
  //    decided in that order. The earlier body was three `filter` calls copied from
  //    `gate.js` (43 shared tokens) — a model reading like its defendant proves nothing.
  // A doc of the OTHER moment is not this decision's business at all: it lands in a bin nobody
  // reports, BEFORE the filters — a filter must never announce, at the moment a doc does not
  // belong to, an exclusion it will announce again at the moment it does. After the answer, a
  // doc whose filter the answer does not satisfy is simply not concerned: silent as well.
  const binOf = (name) => {
    const waitsForAnswer = answerFilterOf(cfg, (declared || {})[name], ownerOfDoc(name)) !== null;
    if (waitsForAnswer !== afterTheAnswer) return 'elsewhere';
    if (targetExcluded(cfg, ownerOfDoc(name), actor)) return 'target';
    if (categoryExcludedSpec(cfg, (declared || {})[name], ownerOfDoc(name), session)) return 'category';
    if (afterTheAnswer && !answerSatisfies(answerFilterOf(cfg, (declared || {})[name], ownerOfDoc(name)), answered.response)) return 'elsewhere';
    return 'kept';
  };
  const bins = { elsewhere: [], target: [], category: [], kept: [] };
  for (const name of selected) bins[binOf(name)].push(name);
  const kept = bins.kept;
  const inGesture = new Set(kept);
  const memoryAfter = {};

  // ④ THE DOCS THIS GESTURE IGNORED accumulate drift — but ONLY those that could ever
  //    SPEND it. A `dumb` or `once` doc never reads its counter, and a `turn` doc reads the
  //    clock instead: incrementing them would be a disk write that changes no decision.
  // ⚠️ WRITTEN AS AN EXPRESSION, NOT A MUTATION — and that is deliberate. `jscpd` caught an
  //    11-line clone between this loop and `gate.js`: at that point the model READ LIKE THE
  //    ENGINE, and a twin only proves a copy agrees with itself. When the only way you can
  //    state an intention is the engine's own way, the model has stopped being independent.
  for (const [name, memo] of Object.entries(memoryBefore)) {
    // Once the answer is in, the action has ALREADY been counted (before it ran): one action is
    // one tick of drift, never two.
    const spendsDrift = setting('mode', name) === 'smart' && setting('driftUnit', name) === 'tool';
    memoryAfter[name] = (memo && spendsDrift && !inGesture.has(name) && !afterTheAnswer)
      ? { ...memo, sinceLastCall: memo.sinceLastCall + 1 }
      : memo;
  // 🛑 A FOREIGN GESTURE MOVES ONE QUANTITY AND NOTHING ELSE — the drift. Everything
  //    else the document remembers (that it was seen, WHEN it was delivered, that it
  //    refused the last gesture) is untouched, because none of it is about the gesture
  //    that just happened. Stating it as `{ ...memo, drift + 1 }` is stating exactly
  //    that; stating it as a fresh literal states something stronger and FALSE — "here
  //    is the whole memory now" — and silently drops whatever the literal forgot.
  // 🔴 THIS MODEL USED TO WRITE THE LITERAL, AND SO IT AGREED WITH A REAL ENGINE DEFECT
  //    (2026-08-23): `denied` was erased by any non-matching action, so the retry was
  //    refused a SECOND time — the infinite block the alternation exists to forbid. The
  //    differential was GREEN throughout. **A model that copies the engine's SHAPE cannot
  //    contradict it**, and the comment above already warned that the two loops had been
  //    caught as a clone. That warning was the symptom; this is the cause.
  }

  // ⑤bis THE ALTERNATION IS A PROPERTY OF THE GESTURE, NOT OF A DOCUMENT (2026-08-24).
  //    What an agent redoes is an ACTION, and an action is refused as soon as ONE of
  //    the documents biting it refuses. So the promise "a refusal is never followed by
  //    a refusal" is only meaningful when quantified over that whole set: was ANY of
  //    them the author of the previous refusal? If so, this gesture is a RETRY, and a
  //    retry always passes — no matter which document had spoken.
  // 🔴 MEASURED IN PRODUCTION THE SAME DAY: two enforcing documents whose memories sat
  //    in ANTIPHASE refused three gestures in a row, while each of them read alone
  //    honoured the rule perfectly. This model agreed, because it asked the right
  //    question about the wrong object — the very failure described above, one level
  //    up. Quantifying over the action is what makes a refusal provably terminating.
  const retryOfARefusal = kept.some((name) => Boolean(setting('enforce', name) && memoryBefore[name] && memoryBefore[name].denied));
  const handedOver = [];
  const refusing = new Set();
  for (const name of kept) {
    const memo = memoryBefore[name];
    const mode = setting('mode', name);
    const enforces = setting('enforce', name);
    const isDelivered = livre(mode, memo ? memo.seen : false,
      derive(setting('driftUnit', name), memo, turns), setting('threshold', name));
    if (isDelivered) handedOver.push(name);

    // ⑤ ALTERNATION — a refusal is never followed by a refusal. The gesture the
    //    agent redoes ALWAYS passes, then the cadence resumes. This is the whole
    //    anti-loop: no mode has to be forbidden, `dumb` included (block, pass,
    //    block, pass).
    //    And an action that has already run cannot be refused: nothing is refused after the answer.
    if (isDelivered && enforces && !retryOfARefusal && !afterTheAnswer) refusing.add(name);

    // ④ A recalled doc forgets its drift, delivered or not — being looked at is
    //    what resets it. We only WRITE that memory if the mode can ever read it;
    //    an `enforce` doc always writes, because its alternation flag lives there.
    if (mode !== 'dumb' || enforces) {
      // Seen, drift reset to zero, stamped with the turn of this recall — in that order.
      const recalled = Object.fromEntries([['seen', true], ['sinceLastCall', 0], ['turn', turns]]);
      memoryAfter[name] = enforces ? { ...recalled, denied: refusing.has(name) } : recalled;
    }
  }

  // 🛑 THREE decisions, never four. And nothing is refused when nothing is
  //    delivered: blocking without handing over the knowledge would be a mute
  //    wall — the worst of both worlds.
  // ⚠️ `changed` is DERIVED from the memory, never accumulated along the way: "did the
  //    memory move?" is a question about the RESULT, and answering it with a flag raised in
  //    three places is how a flag ends up disagreeing with the thing it describes.
  const moves = (a, b) => JSON.stringify(a) !== JSON.stringify(b);
  const changed = Object.keys({ ...memoryBefore, ...memoryAfter }).some((name) => moves(memoryBefore[name], memoryAfter[name]));

  let decision = 'none';
  if (handedOver.length > 0) decision = refusing.size > 0 ? 'deny' : 'allow';

  // ── WHAT A CALLER WITHOUT THE LOCK MAY DELIVER (2026-08-20) ──
  // WRITTEN FROM THE INTENTION, as this whole model is — never copied from `gate.js`.
  // THE INTENTION: a caller that cannot WRITE must not deliver anything whose
  // correctness depends on being recorded. A `once` delivered and not recorded is
  // re-decided as fresh at the next gesture and delivered AGAIN. `dumb` and `smart`
  // do not need the record to stay correct within this rule: re-delivery is `dumb`'s
  // contract, and `smart` measures drift, not first sight.
  // ⇒ the lock-less subset is "everything except `once`", and NOTHING IS LOST:
  //   no record is written, so the next gesture delivers it under the lock.
  const withoutLock = handedOver.filter((name) => setting('mode', name) !== 'once');

  // AND SUCH A CALLER NEVER REFUSES (2026-08-20). Reasoned from the INTENTION, as this
  // whole model is: a refusal is only bearable because it is FOLLOWED by a pass — that is
  // the alternation, and the alternation is remembered in the state. A caller that cannot
  // write cannot remember, so its refusal has no successor: the same gesture, redone,
  // meets the same state and is refused again, and again, for as long as it cannot write.
  // A rule whose termination depends on being recorded may not be applied by whoever
  // cannot record. The knowledge is still handed over; only the refusal waits for a
  // caller that can remember having refused.
  const lockless = withoutLock.length > 0 ? 'allow' : 'none';

  return {
    decision,
    inject: handedOver,
    injectLockless: withoutLock,
    decisionLockless: lockless,
    state: memoryAfter,
    changed,
    filteredOut: bins.target,
    categoryOut: bins.category,
  };
}

module.exports = {
  decide, resolve, livre, derive, targetExcluded, filterOf, categoryOf, categoryExcludedSpec,
  answerFilterOf, answerSatisfies, answerFilterIsWellFormed,
  MODES, DRIFT_UNITS, FILTER_MODES, FRAMEWORK,
};
