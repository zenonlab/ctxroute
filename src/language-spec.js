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

const norm = (v) => String(v == null ? '' : v).toLowerCase().replace(/\\/g, '/');
const contient = (u, motif) => norm(u).includes(norm(motif));

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
function params(toolInput, profondeurMax) {
  const out = [];
  const visiter = (v, key, d) => {
    if (typeof v === 'string') {
      if (!DEFAULT_PROFILE.contentKeys.includes(key)) out.push(v);
    } else if (v && typeof v === 'object' && d < profondeurMax) {
      for (const [k, x] of Object.entries(v)) visiter(x, Array.isArray(v) ? key : k, d + 1);
    }
  };
  visiter(toolInput, null, 0);
  return out;
}

/**
 * The values of a SET OF KEYS, at any depth, arrays included.
 * 🛑 The trigger only read the FIRST level: a path in `{args:{…}}`
 *    or in `files:["/a","/b"]` was INVISIBLE **even if its key was declared**
 *    (51). That is ㊵ uncorrected on the trigger side — the filters, for their part, already
 *    descended. An array element INHERITS the name of its parent key.
 */
function keyValues(value, keys, profondeurMax, key, out) {
  const acc = out || [];
  if (typeof value === 'string') { if (keys.includes(key)) acc.push(value); }
  else if (value && typeof value === 'object' && (profondeurMax > 0)) {
    for (const [k, v] of Object.entries(value)) {
      keyValues(v, keys, profondeurMax - 1, Array.isArray(value) ? key : k, acc);
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
function candidates(toolName, toolInput) {
  const out = [];
  // ⚠️ The dialect comes from the PROFILE — the spec describes the SEMANTICS (∃/∀), not
  //    the harness's names. Both consume the same DECLARED DATA: without that,
  //    the differential would prove a divergence of LIST, not of meaning.
  out.push(...keyValues(toolInput, DEFAULT_PROFILE.pathKeys, 20));
  if (typeof toolInput.cwd === 'string') out.push(toolInput.cwd);
  if (DEFAULT_PROFILE.patchTools.includes(toolName)) {
    const patch = toolInput.input || toolInput.patch || toolInput.command || '';
    const re = /\*\*\* (?:Update|Add|Delete) File:\s*(.+)/g;
    let m;
    while ((m = re.exec(String(patch))) !== null) out.push(m[1].trim());
  }
  // ⚠️ ㊽: a shell gesture is recognised by its SHAPE (presence of a `command`), never
  //    by the tool's NAME — otherwise PowerShell and SSH stay invisible (18 % measured).
  if (typeof toolInput.command === 'string') {
    out.push(toolInput.command);
    const cd = toolInput.command.match(/\bcd\s+["']?([^\s"'&;]+)["']?\s*(?:&&|;)/);
    if (cd) {
      const after = toolInput.command.split(/&&|;/).slice(1).join(' ');
      for (const word of after.trim().split(/\s+/)) out.push(cd[1] + '/' + word);
    }
  }
  return out;
}

// ── THE OPERATORS ───────────────────────────────────────────────────────

/** ① TRIGGER = ∃. A single candidate is enough. */
const declenche = (motif, cands) => cands.some((c) => contient(c, motif));

/**
 * ② SCOPE = ∃, with AND between GROUPS (㊺①).
 * `["a","b"]` = ONE group = a OR b (historical form).
 * `[["a","b"],["c"]]` = (a OR b) AND c.
 * ⚠️ A list without any group is ONE group — mapping it element by element
 *    would turn it into an AND and would flip the meaning of all the existing rules.
 */
function scopeSatisfied(scope, vals) {
  if (!Array.isArray(scope) || scope.length === 0) return true; // no filter
  const groupes = scope.some((g) => Array.isArray(g)) ? scope.map((g) => (Array.isArray(g) ? g : [g])) : [scope];
  return groupes.every((g) => g.some((s) => vals.some((v) => contient(v, s))));
}

/**
 * ③ EXCLUDE = ∀¬ (㊼). The pattern must appear NOWHERE in the gesture.
 * 🛑 UNIVERSE = the params ∪ the triggering context. The context is REQUIRED:
 *    on the `tool` axis it is the TOOL NAME, which lives in no parameter.
 * 🛑 NEVER "∃ on the current candidate": the negation would become dependent
 *    on the way a gesture is written, hence bypassable. That was ㊼.
 */
const excludedNow = (exclude, univers) =>
  Array.isArray(exclude) && exclude.some((x) => univers.some((u) => contient(u, x)));

/**
 * THE DECISION — does a rule inject on this gesture?
 * @param {{pattern:string, scope?:Array, exclude?:Array}} rule
 * @param {{toolName:string, toolInput:object}} geste
 * @param {{profondeurMax:number}} bornes — the admitted flattening depth.
 *   ⚠️ AN ACCEPTED BOUND, not a shameful limit: the MCP spec allows
 *   arbitrary nesting and itself recommends bounding it. An overflow
 *   must be SAID, never silent.
 */
function injects(rule, geste, bornes) {
  const toolInput = geste.toolInput || {};
  const cands = candidates(geste.toolName || '', toolInput);
  const vals = params(toolInput, (bornes && bornes.profondeurMax) || 20);
  if (!declenche(rule.pattern, cands)) return false;
  // The CONTEXT = the candidate(s) through which the rule bit, plus the
  // tool name on the `tool` axis. Union with the params: that is the universe of the ∀¬.
  const univers = vals.concat(cands.filter((c) => contient(c, rule.pattern)));
  if (excludedNow(rule.exclude, univers)) return false;
  return scopeSatisfied(rule.scope, vals);
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
const listeOutils = (decl) => {
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
function toolInjects(rule, geste, bornes) {
  const toolName = geste.toolName;
  if (!targetsTool(listeOutils(rule), toolName)) return false;
  const vals = params(geste.toolInput || {}, (bornes && bornes.profondeurMax) || 20);
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
  const suffixe = geste.toolName.slice(('mcp__' + srv + '__').length);
  if (segmentAt(suffixe)) out.push('mcp/' + srv + '/' + suffixe + '.md');
  const param = cfg.servers && cfg.servers[srv] && cfg.servers[srv].subToolParam;
  const sous = pointedValue(geste.toolInput || {}, param);
  if (segmentAt(sous) && sous !== suffixe) out.push('mcp/' + srv + '/' + sous + '.md');
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
function skillInjects(entry, geste, config, bornes) {
  const e = entry || {};
  const toolInput = geste.toolInput || {};
  const depth = (bornes && bornes.profondeurMax) || 20;

  // ── FILE dimension: the payload's cwd joins the gesture's params.
  const fileAction = { toolName: geste.toolName, toolInput: { ...toolInput, cwd: geste.cwd } };
  const fileRules = Array.isArray(e.rules)
    ? e.rules.filter((r) => r && typeof r.pattern === 'string')
    : (Array.isArray(e.match) ? e.match : [])
        .filter((p) => typeof p === 'string')
        .map((p) => ({ pattern: p, scope: e.scope, exclude: e.exclude }));
  if (fileRules.some((r) => injects(r, fileAction, bornes))) return true;

  // ── SERVERS and TOOL dimensions: context = the tool name, params WITHOUT cwd.
  const vals = params(toolInput, depth);
  const passeFiltres = filters(e, vals, [geste.toolName]);

  if (Array.isArray(e.servers) && passeFiltres) {
    const srv = serverLabel(geste.toolName);
    if (srv != null) {
      const suffixe = geste.toolName.slice(('mcp__' + srv + '__').length);
      const param = config && config.servers && config.servers[srv] && config.servers[srv].subToolParam;
      const sous = pointedValue(toolInput, param);
      if (
        e.servers.includes(srv) ||
        e.servers.includes(srv + '/' + suffixe) ||
        (sous != null && e.servers.includes(srv + '/' + sous))
      ) return true;
    }
  }

  return targetsTool(listeOutils(e), geste.toolName) && passeFiltres;
}

module.exports = {
  norm, contient, params, candidates, declenche, scopeSatisfied, excludedNow, injects,
  targetsTool, listeOutils, filters, toolInjects,
  serverLabel, segmentAt, pointedValue, mcpCandidates,
  skillInjects,
};
