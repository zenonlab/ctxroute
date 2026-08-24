'use strict';
// ═══════════════════════════════════════════════════════════════════════
// language-spec.js — THE SEMANTICS OF THE LANGUAGE, WRITTEN FROM THE INTENTION
// ═══════════════════════════════════════════════════════════════════════
//
// 🛑 THIS FILE IS NOT THE ENGINE AND MUST NEVER BECOME IT.
//    It is an **independent executable model**: the definition of what the
//    language MUST do, written in quantifiers, readable in 5 minutes.
//    `spec-differential.test.js` confronts this model EXHAUSTIVELY with the real
//    engine: any divergence is a bug — in one or in the other, and you must
//    say which.
//
// 🔴 WHY IT EXISTS (14/08/2026, after three defects of the same family).
//    Until now, ALL the repo's tests called the engine. They therefore proved
//    what the engine **DOES**, never what it **SHOULD DO**. When the
//    semantics itself was wrong, it was wrong on both sides and everything
//    stayed green:
//      ㊵ `scope` only read the 1st level of the params ⇒ blind to 16 MCP servers;
//      ㊴ `scope`/`exclude` ignored on a whole dimension of the skills;
//      ㊼ `exclude` evaluated EXISTENTIALLY — a negation built like an
//         affirmation, hence bypassable by writing one's command differently.
//    Each cost a session, and each was found by a HUMAN who
//    insisted. That is what we replace here with a machine.
//
// 📐 METHOD: "verification-guided development" (AWS Cedar) brought down to our
//    scale. On their side the domain is infinite ⇒ a model in Lean + random sampling.
//    Here the domain is FINITE and small ⇒ **exhaustive enumeration**, that is to say
//    a proof, not a sample. Zero dependency: the `for` loop is
//    strictly stronger than a solver on a domain one can exhaust.
//
// ⚠️ WRITING RULE, non-negotiable: **this file is written by reading the
//    INTENTION, never the implementation.** Copying it from `sources/file.js`
//    would fabricate a twin, and a twin only proves that a copy agrees
//    with itself (precedent paid on 31/07/2026: 3 home-made probes, 3 false
//    verdicts, one session lost).
// ⚠️ PURE: zero I/O, zero dependency, zero harness dialect. Publishable as is.
//
// ───────────────────────────────────────────────────────────────────────
// THE SEMANTICS, IN THREE LINES
// ───────────────────────────────────────────────────────────────────────
//   A rule INJECTS on a gesture ⟺
//     ① TRIGGER : ∃ c ∈ Candidates : pattern ⊑ c
//     ② SCOPE   : ∀ group, ∃ s ∈ group, ∃ v ∈ Params : s ⊑ v
//     ③ EXCLUDE : ∀ x ∈ exclude, ∀ u ∈ Universe : x ⋢ u
//
//   ⊑ = "is a substring of", after normalisation (lowercase, `\` → `/`).
//
//   🛑 ② AND ③ ARE DUAL, NOT SYMMETRICAL. That is the lesson of ㊼: the negation
//      of a "there exists" is a "for all" (De Morgan: ¬∃x P ≡ ∀x ¬P).
//      Giving `exclude` the FORM of `scope` (a `.some()`) was a category
//      error — a half negative is bypassable by construction.
// ═══════════════════════════════════════════════════════════════════════

// Normalisation — one same text must compare the same way on every OS.
const { DEFAULT_PROFILE } = require('./harness-profile.js');
// ⚠️ The DERIVED half of the universe — declaration shared, algebra not (see below).
const { DERIVED_OBSERVABLES } = require('./derived-observables.js');

const norm = (v) => String(v == null ? '' : v).toLowerCase().replace(/\\/g, '/');
const contains = (u, motif) => norm(u).includes(norm(motif));

// ── THE PROJECTIONS OF A GESTURE ────────────────────────────────────────
// A "gesture" is a tool call. The language NEVER sees its intention,
// only these projections — that is the load-bearing wall: we only inject on
// FACTS (§3bis of the mental model), never on a guess.

/**
 * ③ The text values of the gesture, at any depth — EXCEPT THE PAYLOAD.
 * 🛑 A PAYLOAD parameter (`old_string`, `content`…) TRANSPORTS content, it
 *    DESIGNATES nothing. Including it made the filters decide on the text one TYPES:
 *    measured, **55 exclusions** came from there — a doc that disappears silently
 *    because a word appears in a comment (㊿).
 * ⚠️ Removed from BOTH filters, never from just one: their duality is theorem ㊼.
 */
function params(toolInput, maxDepth, guard) {
  const passe = guard || filterDefault;
  const out = [];
  const visiter = (v, key, d) => {
    if (typeof v === 'string') {
      if (passe(key)) out.push(v);
    } else if (v && typeof v === 'object' && d < maxDepth) {
      for (const [k, x] of Object.entries(v)) visiter(x, Array.isArray(v) ? key : k, d + 1);
    }
  };
  visiter(toolInput, null, 0);
  return out;
}

// ═══════════════════════════════════════════════════════════════════════
// ④ `keys` — WHICH KEYS ARE VISIBLE (19/08/2026). The other operators say WHAT
//    to look for; this one says WHERE to look. It is ORTHOGONAL to OR/AND/NOT:
//    it adds no connective, it chooses the UNIVERSE the three others read.
//
// 🛑 THE RULE IS THE SAME ON EVERY AXIS, AND THAT UNIFORMITY *IS* THE SEMANTICS:
//      absent        ⇒ the default universe;
//      all `-name`   ⇒ the default universe MINUS those names (it REMOVES);
//      otherwise     ⇒ EXACTLY the names listed (it REPLACES — hence it may WIDEN).
//    Written this way, "REPLACES" is ABSOLUTE: a whitelist naming a payload key
//    reaches it, on the TRIGGER as on the FILTERS. Any axis where that stopped
//    being true would give one declaration two meanings depending on where it is
//    read — the silent ambiguity this language refuses everywhere else.
// ⚠️ ㊿ (payload keys excluded) is the DEFAULT universe of the filters, never a
//    floor: it was a global arbitration, and `keys` exists precisely so an entry
//    can overrule a global default FOR ITSELF, in writing, visibly.
// ═══════════════════════════════════════════════════════════════════════

const KEY_REMOVE = '-';
/** The filters' DEFAULT universe: every key except the payload ones (㊿). */
const filterDefault = (key) => !DEFAULT_PROFILE.contentKeys.includes(key);

/** The declaration for ONE axis: flat list = the three axes, object = one per axis. */
function declAxe(keysDecl, axis) {
  const d = Object(keysDecl) === keysDecl && !Array.isArray(keysDecl) ? keysDecl[axis] : keysDecl;
  // 🛑 An EMPTY list is INERT, never a whitelist of nothing — same decision as the engine.
  return Array.isArray(d) && d.length > 0 ? d : null;
}

// 🛑 ONE RULE, DECIDABLE BY LOOKING (20/08/2026): at least one `-` ⇒ ADJUST the default
//    universe (minus the removals, plus the bare names) · no `-` at all ⇒ REPLACE it.
//    The mixed form used to be REFUSED, which made "the default, plus this one key"
//    expressible only as a hand-written enumeration of the whole universe — an enumeration
//    born stale, i.e. class ㊽ reintroduced by a validator.
// ⚠️ WRITTEN AS A PARTITION, NOT AS THE ENGINE'S LOOP — and that is not a style choice.
//    `jscpd` caught the first version as a CLONE of `sources/file.js`: the model had started to
//    READ LIKE the engine, and a twin only proves that a copy agrees with itself. The whole
//    value of this file is that it is derived from the INTENTION: "a declaration names keys to
//    REMOVE and keys to ADD; naming at least one removal means you are adjusting the default."
const isRemoval = (k) => String(k).startsWith(KEY_REMOVE);
const parts = (decl) => ({
  banned: decl.filter(isRemoval).map((k) => String(k).slice(KEY_REMOVE.length)),
  additions: decl.filter((k) => !isRemoval(k)).map(String),
  adjusted: decl.some(isRemoval),
});

/** A predicate over the keys, for a FILTER axis (`scope`, `exclude`). */
function guard(keysDecl, axis) {
  const decl = declAxe(keysDecl, axis);
  if (!decl) return filterDefault;
  const { banned, additions, adjusted } = parts(decl);
  if (!adjusted) return (key) => additions.includes(key);
  return (key) => additions.includes(key) || (filterDefault(key) && !banned.includes(key));
}

/** A LIST of keys, for the TRIGGER axis (its default universe IS a list). */
function universeTrigger(keysDecl, sourceDefaults) {
  const decl = declAxe(keysDecl, 'match');
  if (!decl) return sourceDefaults;
  const { banned, additions, adjusted } = parts(decl);
  if (!adjusted) return additions;
  // ⚠️ No de-duplication: the universe is only ever consulted by membership, so a name listed
  //    twice decides like a name listed once. The engine agrees, and Stryker is what proved the
  //    filter decided nothing.
  return sourceDefaults.filter((k) => !banned.includes(k)).concat(additions);
}

/**
 * The values of a SET OF KEYS, at any depth, arrays included.
 * 🛑 The trigger only read the FIRST level: a path in `{args:{…}}`
 *    or in `files:["/a","/b"]` was INVISIBLE **even if its key was declared**
 *    (51). That is ㊵ uncorrected on the trigger side — the filters, for their part, already
 *    descended. An array element INHERITS the name of its parent key.
 */
function keyValues(value, keys, maxDepth, key, out) {
  const acc = out || [];
  if (typeof value === 'string') { if (keys.includes(key)) acc.push(value); }
  else if (value && typeof value === 'object' && (maxDepth > 0)) {
    for (const [k, v] of Object.entries(value)) {
      keyValues(v, keys, maxDepth - 1, Array.isArray(value) ? key : k, acc);
    }
  }
  return acc;
}

/**
 * ① THE CANDIDATES — what a TRIGGER can bite on.
 * ⚠️ DELIBERATELY NARROWER THAN `params`: a trigger designates a PLACE
 *    (a file, a shell gesture), not any value whatsoever. Otherwise the word
 *    "test" in a message would bring in the tests doc.
 * ⚠️ The decomposition of a `cd X && cmd` is a DELIBERATE CAPABILITY (matching
 *    `project/server.js` without an absolute path), not an accident — but it
 *    fabricates fragments that exist nowhere (`project/node`). That is
 *    exactly where ㊼ had lodged itself: a negative evaluated fragment by fragment
 *    let things through via the invented fragment.
 */
function candidates(toolName, toolInput, keysDecl) {
  const pathKeyNames = universeTrigger(keysDecl, DEFAULT_PROFILE.pathKeys);
  const commandKeys = universeTrigger(keysDecl, DEFAULT_PROFILE.commandKeys);
  const out = [];
  // ⚠️ The dialect comes from the PROFILE — the spec describes the SEMANTICS (∃/∀), not
  //    the harness's names. Both consume the same DECLARED DATA: without that,
  //    the differential would prove a divergence of LIST, not of meaning.
  out.push(...keyValues(toolInput, pathKeyNames, 20));
  // ⚠️ NO `cwd` special case: it is a DECLARED path key of the profile (19/08/2026),
  //    hence read by `keyValues` above like any other — and therefore NARROWABLE by
  //    `keys`. A parameter the operator cannot address is a boundary nobody declared.
  if (DEFAULT_PROFILE.patchTools.includes(toolName)) {
    const patch = toolInput.input || toolInput.patch || toolInput.command || '';
    const re = /\*\*\* (?:Update|Add|Delete) File:\s*(.+)/g;
    let m;
    while ((m = re.exec(String(patch))) !== null) out.push(m[1].trim());
  }
  // ⚠️ ㊽: a shell gesture is recognised by its SHAPE (presence of a `command`), never
  //    by the tool's NAME — otherwise PowerShell and SSH stay invisible (18 % measured).
  // The commands come from the DECLARED KEYS, never from a hard-coded `command`:
  // that is what makes them narrowable by `keys` exactly like the paths.
  for (const command of keyValues(toolInput, commandKeys, 20)) out.push(command);
  // ⚠️ THE DERIVED FACTS ARE READ FROM THE REGISTRY, one loop, no name written here
  //    (2026-08-20). What a command SAYS (its raw text, above) and what it DESIGNATES or
  //    RECONSTRUCTS (below) are DISTINCT observables. While they shared one key, no
  //    combination of operators could tell "I quote this project" from "I work in it" — the
  //    defect was never in the combinators (∃/∀ were right) but in the UNIVERSE they range
  //    over. That is the whole thesis, and it has now cost ten defects.
  // 🛑 THE MODEL SHARES THE **DECLARATION** AND THE MECHANICAL EXTRACTION, NEVER THE ALGEBRA.
  //    Same rule as `keyValues` and the profile just above: if the model re-listed the facts
  //    by hand, the differential would prove a divergence of LIST instead of a divergence of
  //    MEANING — and a judge that argues about vocabulary stops judging semantics. What stays
  //    independent here, and is the only thing worth judging, is WHICH universe each operator
  //    ranges over and with which quantifier.
  // ⚠️ The input is the FULL command list, NOT `clesCommandes`: dropping the raw half must
  //    NOT drop where the gesture works, otherwise the operator loses 47.7 % of real work
  //    (measured on 28,703 actions) and becomes unusable — which is the whole point.
  for (const obs of DERIVED_OBSERVABLES) {
    if (!universeTrigger(keysDecl, [obs.name]).includes(obs.name)) continue;
    for (const command of keyValues(toolInput, DEFAULT_PROFILE[obs.from], 20)) {
      for (const candidate of obs.derive(command)) out.push(candidate);
    }
  }
  return out;
}

// ── THE OPERATORS ───────────────────────────────────────────────────────

/** ① TRIGGER = ∃. A single candidate is enough. */
const triggered = (motif, candidates) => candidates.some((c) => contains(c, motif));

/**
 * ② SCOPE = ∃, with AND between GROUPS (㊺①).
 * `["a","b"]` = ONE group = a OR b (historical form).
 * `[["a","b"],["c"]]` = (a OR b) AND c.
 * ⚠️ A list without any group is ONE group — mapping it element by element
 *    would turn it into an AND and would flip the meaning of all the existing rules.
 */
function scopeSatisfied(scope, vals) {
  if (!Array.isArray(scope) || scope.length === 0) return true; // no filter
  const groups = scope.some((g) => Array.isArray(g)) ? scope.map((g) => (Array.isArray(g) ? g : [g])) : [scope];
  return groups.every((g) => g.some((s) => vals.some((v) => contains(v, s))));
}

/**
 * ③ EXCLUDE = ∀¬ (㊼). The pattern must appear NOWHERE in the gesture.
 * 🛑 UNIVERSE = the params ∪ the triggering context. The context is REQUIRED:
 *    on the `tool` axis it is the TOOL NAME, which lives in no parameter.
 * 🛑 NEVER "∃ on the current candidate": the negation would become dependent
 *    on the way a gesture is written, hence bypassable. That was ㊼.
 */
const excludedNow = (exclude, universe) =>
  Array.isArray(exclude) && exclude.some((x) => universe.some((u) => contains(u, x)));

/**
 * THE DECISION — does a rule inject on this gesture?
 * @param {{pattern:string, scope?:Array, exclude?:Array, keys?:Array|Object}} rule
 *   ⚠️ `keys` = the axis WHERE to look (19/08/2026): a flat list applies to the three
 *   axes, an object `{match, scope, exclude}` gives each its own universe. A JSDoc that
 *   omits it is a LYING CONTRACT — `check:types` is what catches that, and it already
 *   caught it twice on this operator.
 * @param {{toolName:string, toolInput:object}} geste
 * @param {{maxDepth:number}} bounds — the admitted flattening depth.
 *   ⚠️ AN ACCEPTED BOUND, not a shameful limit: the MCP spec allows
 *   arbitrary nesting and itself recommends bounding it. An overflow
 *   must be SAID, never silent.
 */
function injects(rule, geste, bounds) {
  const toolInput = geste.toolInput || {};
  const depth = (bounds && bounds.maxDepth) || 20;
  const candidateValues = candidates(geste.toolName || '', toolInput, rule.keys);
  if (!triggered(rule.pattern, candidateValues)) return false;
  // ⚠️ ONE UNIVERSE PER AXIS: `scope` and `exclude` no longer necessarily read the same
  //    values. That WEAKENS the duality of ㊼ (they stop being exact duals over a SINGLE
  //    universe) — an ASSUMED consequence of `keys`, and it is the AUTHOR who assumes it,
  //    visibly, in their entry. What the engine used to do in silence was the defect.
  const vals = params(toolInput, depth, guard(rule.keys, 'exclude'));
  // The CONTEXT = the candidate(s) through which the rule bit, plus the
  // tool name on the `tool` axis. Union with the params: that is the universe of the ∀¬.
  const universe = vals.concat(candidateValues.filter((c) => contains(c, rule.pattern)));
  if (excludedNow(rule.exclude, universe)) return false;
  return scopeSatisfied(rule.scope, params(toolInput, depth, guard(rule.keys, 'scope')));
}

// ═══════════════════════════════════════════════════════════════════════
// THE 3 OTHER SOURCES (㊻③, 15/08/2026) — the judge covered 1 source out of 4.
// ㊴ lived exactly in an uncovered source (skill/servers): each
// source has ITS triggering semantics, but ALL share the same
// filters ② and ③ — it is that invariance we carve here.
// ═══════════════════════════════════════════════════════════════════════

/**
 * SOURCE `tool` — TRIGGER = the EXACT name of a tool (never a substring: a
 * substring would match `WebFetch` inside a file path).
 * The wildcard `*` = "any tool whatsoever", PROVIDED there is a tool:
 * an empty/absent name NEVER matches, wildcard included (otherwise a degraded payload
 * would trigger every wildcard doc of the fleet).
 */
function targetsTool(names, toolName) {
  if (!Array.isArray(names)) return false;
  if (names.includes(toolName)) return true;
  return names.includes('*') && typeof toolName === 'string' && toolName !== '';
}

/** Reading of the `tool:` declaration — one name OR a list of names. */
const toolList = (decl) => {
  const t = decl && decl.tool;
  if (typeof t === 'string') return [t];
  return Array.isArray(t) ? t.filter((x) => typeof x === 'string') : [];
};

/**
 * The filters ②+③, COMMON to every source: scope on the params,
 * exclude as ∀¬ on params ∪ context. The CONTEXT depends on the axis (candidates
 * bitten for `match`, tool name for `tool`/`servers`) — the quantifiers,
 * however, NEVER change from one source to another. That was the lesson of ㊴:
 * a dimension that "forgets" the filters is a hole in the language, not a choice.
 */
function filters(rule, vals, context) {
  if (excludedNow(rule.exclude, vals.concat(context))) return false;
  return scopeSatisfied(rule.scope, vals);
}

/** SOURCE `tool`, complete decision: ∃ exact name, then filters (context = the name). */
function toolInjects(rule, geste, bounds) {
  const toolName = geste.toolName;
  if (!targetsTool(toolList(rule), toolName)) return false;
  const vals = params(geste.toolInput || {}, (bounds && bounds.maxDepth) || 20);
  return filters(rule, vals, [toolName]);
}

/**
 * SOURCE `mcp` — the PATH is the trigger: no operator, the doc
 * `docs/mcp/{srv}.md` targets the server, `{srv}/{x}.md` the tool or the sub-tool.
 * ⚠️ The naming convention IS the intention: an MCP tool is called
 *    `mcp__{server}__{tool}`, where the server is an identifier (letters,
 *    digits, dashes, SINGLE underscores — never `__`, which is the separator).
 */
function serverLabel(toolName) {
  if (typeof toolName !== 'string' || !toolName.startsWith('mcp__')) return null;
  const rest = toolName.slice('mcp__'.length);
  const cut = rest.indexOf('__');
  if (cut <= 0) return null;
  const srv = rest.slice(0, cut);
  return /^[A-Za-z0-9-]+(?:_[A-Za-z0-9-]+)*$/.test(srv) ? srv : null;
}

/**
 * Is a segment admissible as a doc FILE NAME?
 * 🛑 SECURITY, not pedantry: `subTool` comes from tool_input, hence from
 *    potentially external data — a `../../secrets` would compose a path OUTSIDE
 *    docs/mcp/ and would inject an arbitrary .md as an authoritative instruction.
 */
function segmentAt(seg) {
  return typeof seg === 'string' && seg !== '' && seg !== '.' && seg !== '..' && !/[/\\\0]/.test(seg);
}

/** SCALAR value at a dotted path (`args.tool`) — an object is not a file name. */
function pointedValue(obj, filePath) {
  if (!obj || typeof filePath !== 'string') return null;
  let v = obj;
  for (const key of filePath.split('.')) {
    if (v == null) return null;
    v = v[key];
  }
  return typeof v === 'string' || typeof v === 'number' ? String(v) : null;
}

/**
 * SOURCE `mcp`, complete decision: the ids of the candidate docs, from the GLOBAL to the
 * SPECIFIC (the order is the hierarchy — it lives in the path, not in a field).
 * ⚠️ NO filter here (52, 15/08/2026): the global filter by TARGET
 *    (`filterMode`/`filterList`) is a DECISION, it lives in gate.js —
 *    the source POSES the candidates, it discards nothing.
 */
function mcpCandidates(config, geste) {
  const cfg = config || {};
  const srv = serverLabel(geste.toolName);
  if (srv == null || !segmentAt(srv)) return [];
  const out = ['mcp/' + srv + '.md'];
  const suffix = geste.toolName.slice(('mcp__' + srv + '__').length);
  if (segmentAt(suffix)) out.push('mcp/' + srv + '/' + suffix + '.md');
  const param = cfg.servers && cfg.servers[srv] && cfg.servers[srv].subToolParam;
  const sous = pointedValue(geste.toolInput || {}, param);
  if (segmentAt(sous) && sous !== suffix) out.push('mcp/' + srv + '/' + sous + '.md');
  return out;
}

/**
 * SOURCE `skill` — UNION of 3 dimensions (file ∪ servers ∪ tool): a
 * skill enters through ANY of them, one is enough.
 * ⚠️ FILE dimension: SAME semantics as the docs (`injects`), with `cwd`
 *    added to the matchable params — specific to skills ("npm test launched INSIDE the
 *    project" carries no path). Per-entry `rules` has PRECEDENCE over
 *    match/scope/exclude (never both).
 * ⚠️ SERVERS and TOOL dimensions: the filters apply THERE TOO (㊴ — the
 *    all-or-nothing was the bug), context = the tool name.
 * ⚠️ `servers` at 3 granularities: `srv` · `srv/tool` · `srv/sub-tool` (via
 *    subToolParam). The global whitelist/blacklist filter does NOT play here:
 *    it governs the corpus of MCP docs, not the perimeter of a skill.
 */
function skillInjects(entry, geste, config, bounds) {
  const e = entry || {};
  const toolInput = geste.toolInput || {};
  const depth = (bounds && bounds.maxDepth) || 20;

  // ── FILE dimension: the payload's cwd joins the gesture's params.
  const fileAction = { toolName: geste.toolName, toolInput: { ...toolInput, cwd: geste.cwd } };
  const fileRules = Array.isArray(e.rules)
    ? e.rules.filter((r) => r && typeof r.pattern === 'string')
    : (Array.isArray(e.match) ? e.match : [])
        .filter((p) => typeof p === 'string')
        .map((p) => ({ pattern: p, scope: e.scope, exclude: e.exclude }));
  if (fileRules.some((r) => injects(r, fileAction, bounds))) return true;

  // ── SERVERS and TOOL dimensions: context = the tool name, params WITHOUT cwd.
  const vals = params(toolInput, depth);
  const passesFilters = filters(e, vals, [geste.toolName]);

  if (Array.isArray(e.servers) && passesFilters) {
    const srv = serverLabel(geste.toolName);
    if (srv != null) {
      const suffix = geste.toolName.slice(('mcp__' + srv + '__').length);
      const param = config && config.servers && config.servers[srv] && config.servers[srv].subToolParam;
      const sous = pointedValue(toolInput, param);
      if (
        e.servers.includes(srv) ||
        e.servers.includes(srv + '/' + suffix) ||
        (sous != null && e.servers.includes(srv + '/' + sous))
      ) return true;
    }
  }

  return targetsTool(toolList(e), geste.toolName) && passesFilters;
}

module.exports = {
  norm, contains, params, candidates, triggered, scopeSatisfied, excludedNow, injects,
  targetsTool, toolList, filters, toolInjects,
  serverLabel, segmentAt, pointedValue, mcpCandidates,
  skillInjects,
};
