// ═══════════════════════════════════════════════════════════════════════
// "file" SOURCE — PURE. payload -> which docs, in which order?
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ ZERO I/O. No fs, no path, no process. Just like lib-pure.js:
//    this purity is NOT a testing convenience, it is the CONDITION for
//    Stryker to mutate without producing equivalent mutants (false coverage signal).
//    Sealed by .dependency-cruiser.json.
//
// ⚠️ THIS MODULE KNOWS NO HARNESS. It knows nothing about Claude Code, about
//    `permissionDecision` nor `hookSpecificOutput`. It answers a question,
//    it decides NOTHING. Translating into a harness dialect = the GATEWAY's role.
//    ⚠️ THIS LIST OF GATEWAYS WAS STALE (fixed on 09/08/2026): it
//    cited "legacy-mcp-inject.js, protect-files.js, future Codex port",
//    i.e. two UNWIRED RELICS and a port DONE since 19/07. The
//    real gateways: `pretool-core.js` (shared body) + its shells
//    `doc-inject.js` (Claude) and `codex-doc-inject.js` (Codex).
//    Introducing an output format here = breaking the multi-harness port.
//
// ⚠️ FROZEN SEMANTICS — EXACT replica of protect-files.js.
//    Sealed by the differential test (file-differential.test.js) which replays
//    the old and the new engine and demands IDENTICAL AND ORDERED docs.
//    Any "improvement" here without updating the differential = silent
//    regression on rules that NOBODY reviews by hand.
//    ⚠️ THE ORACLE IS A SNAPSHOT, AND THAT IS INTENTIONAL: it replays the rules of
//    `protected-paths.json` (648 as of 03/08/2026), not the current corpus (783 on
//    09/08). It proves that this engine matches like the OLD one — never that
//    today's corpus is covered. Do not "refresh" this JSON to broaden
//    the proof: it has been INERT since 27/07 and rewriting into it would resurrect the
//    double source of rules. ⚠️ File absent ⇒ the suite SKIPS (never
//    red): on a fresh clone, this safety net protects nothing.
// ═══════════════════════════════════════════════════════════════════════

// ⚠️ THE ONLY DEPENDENCY OF THIS MODULE, and it is DATA (㊽, 14/08/2026): the
//    harness dialect (path key names, patch tools) lives in
//    `harness-profile.js`. No harness literal must COME BACK here — a
//    gate derived from the profile refuses it. Porting = editing the profile, never this file.
const { DEFAULT_PROFILE } = require('../harness-profile.js');
// ⚠️ THE DERIVED FACTS AND THEIR DERIVATIONS LIVE IN ONE REGISTRY (2026-08-20). This file
//    consumes it and never enumerates it: an engine that names its observables one by one
//    has to be reopened for each new one, and that is a tool, not a language.
const { DERIVED_OBSERVABLES, derivedCandidates } = require('../derived-observables.js');
// ⚠️ SINGLE SOURCE of the `keys` syntax: the validator REFUSES what this engine cannot
//    read. Redefining the marker here would be a second truth, and the copy would drift the
//    day the syntax moves — exactly the class this repo keeps closing.
const { KEY_REMOVE } = require('../frontmatter.js');

// ⚠️ norm() = normalization for a robust cross-platform `.includes()`.
//   - Windows backslash → POSIX slash (otherwise scope "api-site/src" misses on "C:\api-site\src")
//   - Lowercase (otherwise scope "api-site" misses on "API-SITE")
// Applied uniformly on pattern, scope, exclude, paths, commands.
// ⚠️ NEVER normalize the CONTENT of a doc — only the comparison is.
function norm(s) {
  return (s == null ? '' : String(s)).replace(/\\/g, '/').toLowerCase();
}

// ⚠️ Path extraction — exact replica of protect-files.js.
//   file_path (Read/Edit/Write/SSH) · remotePath (upload/download) · path (native Grep + SSH grep)
//   apply_patch (Codex): the paths live INSIDE the patch text, never in a param.
//   Claude never sends apply_patch — this block is dead on the Claude side, ALIVE on the Codex side.
//   ⚠️ DO NOT remove it believing it is dead code: it is half of the port.
function extractFilePaths(toolName, toolInput, profil) {
  // ⚠️ ㊽ (14/08/2026) — THE DIALECT COMES FROM THE PROFILE, NO LONGER FROM THE CODE. The
  //    key and tool names were WRITTEN HERE: porting the framework therefore required
  //    editing this PURE module, which the porting contract declares untouchable.
  //    The profile is a DEFAULT, never a disk read: this module stays pure.
  const p = profil || DEFAULT_PROFILE;
  // ⚠️ 51 (15/08/2026) — RECURSIVE, ARRAYS INCLUDED. The trigger only read
  //    the FIRST level: a path inside `{args:{…}}` or inside `files:["/a","/b"]`
  //    was INVISIBLE **even if its key was declared**. This is ㊵ never applied
  //    to the trigger — the filters, for their part, already went down since 12/08.
  const filePaths = keyValues(toolInput, p.pathKeys, MAX_DEPTH);
  // 🔴 THE `cwd` SPECIAL CASE WAS REMOVED ON 19/08/2026 — it is a DECLARED path key of the
  //    profile now. Pushed here, it lived OUTSIDE every key universe, so `keys` could not
  //    reach it in either form: the operator that decides "which parameter keys are
  //    visible" was blind to the single parameter that says "I am WORKING here" rather
  //    than "I am QUOTING this". Behaviour unchanged by default (it was already a
  //    candidate, and still is) — it became NARROWABLE, which is what it always claimed.
  // ⚠️ Supplied ONLY by sources/skill.js (18/07/2026): a MEASURED signal, common to the
  //    hook contracts of Claude Code AND Codex. File docs never receive it in practice —
  //    protect-files parity holds by absence of the field, no longer by a hard-coded branch.

  if (p.patchTools.includes(toolName)) {
    // Stryker disable next-line StringLiteral: EQUIVALENT mutant proven (16/07/2026) — the fallback
    // only traverses the `*** ... File:` regex, which never finds a marker in the literal
    // of the mutant. Restructuring to avoid it by construction = forbidden without replaying the differential.
    // ⚠️ `command` = REAL shape Codex CLI ≥ 0.144 (official doc re-read on
    //    19/07/2026: "Bash and apply_patch use tool_input.command");
    //    input/patch = historical shapes kept (backward compat, zero cost).
    const patch = toolInput.input || toolInput.patch || toolInput.command || '';
    const re = /\*\*\* (?:Update|Add|Delete) File:\s*(.+)/g;
    let m;
    while ((m = re.exec(String(patch))) !== null) filePaths.push(m[1].trim());
  }
  return filePaths;
}

/**
 * The values of the DECLARED KEYS, at any depth, arrays included. PURE.
 * ⚠️ An ARRAY element inherits the name of its PARENT key (`files: ["/a"]` ⇒ the
 *    string `/a` is seen as a `files`). Without this, `0`/`1`/`2` would be key
 *    names and nothing would match — 56 real paths went through there (measured).
 * 🛑 SAME depth BOUND as the filters: two different bounds for the
 *    same payload means one operator sees further than another for no reason.
 */
function keyValues(value, keys, depth, key, out) {
  const acc = out || [];
  if (typeof value === 'string') {
    if (keys.includes(key)) acc.push(value);
    // ⚠️ `Object(x) === x` = "it is an object", in ONE expression. The form
    //    `x !== null && typeof x === 'object'` has TWO conjunctions, one of which is
    //    EQUIVALENT in practice (mutating the `typeof` into `true` changes nothing: a
    //    number yields `Object.entries(42) === []`). An equivalent mutant is avoided by
    //    CONSTRUCTION, it is not tested — measured on 15/08/2026.
  } else if (Object(value) === value && depth > 0) {
    for (const [k, v] of Object.entries(value)) {
      keyValues(v, keys, depth - 1, Array.isArray(value) ? key : k, acc);
    }
  }
  return acc;
}

// ⚠️ TWO BOUNDS, TWO DISTINCT REASONS — NEVER merge nor remove them.
//    This module is on the HOT path of EVERY tool call of every agent: it must
//    never become the point of failure. The MCP spec (2025-11-25 + SEP-2106) allows
//    ARBITRARY nesting and itself RECOMMENDS to "bound schema depth and
//    validation time" ⇒ bounding is COMPLIANT with the standard, not a deviation.
// ⚠️ THE NUMBERS ARE MEASURED, NOT INVENTED (12/08/2026, 25,898 real tool calls
//    collected over 329 transcripts): REAL max depth = 11 (gworkspace), max
//    concatenated text = 12,060 chars (a Write). The bounds are taken WELL above.
// 🛑 DO NOT lower them "to optimize": the cost of the hook is node startup
//    (~330 ms), not this traversal. Lowering them would gain nothing and would render a
//    `scope` mute on a legitimate payload.
const MAX_DEPTH = 20;
const MAX_SIZE = 262144;

/**
 * All the TEXT values of a payload, at ANY depth. PURE.
 *
 * ⚠️ REASON FOR EXISTING (㊵, REAL defect of 11/08/2026): this only read the FIRST
 *    level (`Object.values(toolInput).filter(v => typeof v === 'string')`). Yet EVERY
 *    MCP server puts its arguments in a nested object (`args`) ⇒ `scope` was
 *    BLIND to the 16 MCP servers of the corpus, while the framework doc promised
 *    everywhere "scope sees ALL the params". The meaning of an operator must NEVER
 *    depend on the SHAPE of a tool's payload.
 * ⚠️ NON-text values remain ignored (a `42` does not satisfy a scope "42"):
 *    that is the original semantics, only the depth has changed.
 * 🛑 NO cycle detection: a payload comes from `JSON.parse` (network/stdin), which
 *    NEVER produces one. Adding one would be DEAD CODE. The depth bound suffices.
 * @returns {{ chunks: string[], keys: (string|undefined)[], truncated: null|'depth'|'size' }} —
 *   `keys[i]` is the parameter key that carried `chunks[i]` (`undefined` at the root: a
 *   value reached without passing through a named key belongs to no key). That parallel
 *   array is what lets the `keys` operator narrow the universe WITHOUT a second traversal.
 *   `truncated` is
 *   USED by explain.js: a MUTE bound would recreate the defect we fix here
 *   (a scope that fails without a visible reason is indistinguishable from an absent scope).
 */

function textValues(value, depth, etat, key, decision) {
  const acc = etat || { chunks: [], keys: [], size: 0, truncated: null };
  // ⚠️ `contenusAdmis` = the payload keys an EXPLICIT whitelist re-opens for ONE rule.
  //    ㊿ is the DEFAULT universe of the filters, never a floor: `keys` exists so an
  //    entry can overrule a global default FOR ITSELF, in writing. Empty by default,
  //    so the shared traversal stays exactly what it was — and stays CHEAP.
  // ⚠️ `decision` = the axis DECISION of the rule being evaluated, or nothing for the
  //    shared traversal. 🛑 NEITHER a list NOR a default predicate: an empty list and a
  //    `() => false` are both EQUIVALENT MUTANTS (Stryker fills the list with a name no
  //    key bears; it turns the `false` into `undefined` — same falsy value). Optional
  //    chaining carries the whole thing with no constant to mutate: remove the `?.` and
  //    the shared traversal throws, so the mutant dies instead of surviving.
  // 🛑 ㊿ (15/08/2026) — THE PAYLOAD CONTENT IS OUT OF THE FILTERS' UNIVERSE. A param that
  //    CARRIES content (`old_string`, `content`…) DESIGNATES nothing: reading it
  //    made `scope`/`exclude` decide on the text one TYPES. **Measured: 55
  //    exclusions decided solely by content** — one writes a test file
  //    whose text mentions `node_modules` and the test-conventions doc
  //    DISAPPEARS, silently, exactly when it is useful.
  // ⚠️ Removed from BOTH filters, never from just one: their duality is theorem ㊼.
  // ⚠️ Assumed and measured price: 13 docs whose `scope` was satisfied only by the
  //    written text — that is SEMANTICALLY correct, a filter qualifies the GESTURE.
  // ⚠️ NO `key !== undefined` guard: at the root `key` is `undefined`, and
  //    `includes(undefined)` already yields `false`. Adding it would be a
  //    REDUNDANT guard, hence an EQUIVALENT mutant — we avoid it by CONSTRUCTION.
  if (typeof value === 'string') {
    if (acc.size + value.length > MAX_SIZE) acc.truncated = acc.truncated || 'size';
    else {
      acc.chunks.push(value);
      // ⚠️ `keys` STAYS PARALLEL to `chunks` — same index, same value. It is what lets an
      //    ENTRY narrow the universe by key (`keys:` operator) without traversing twice:
      //    two traversals = two truths that diverge at the first change of bounds.
      // ⚠️ At the root the key is `undefined` (a payload IS an object): a value reached
      //    without ever passing through a named key belongs to no key, hence is kept by a
      //    blacklist and dropped by a whitelist — which is exactly the meaning of both.
      acc.keys.push(key);
      acc.size += value.length;
    }
  } else if (value !== null && typeof value === 'object') {
    if ((depth || 0) >= MAX_DEPTH) acc.truncated = acc.truncated || 'depth';
    else for (const [k, v] of Object.entries(value)) {
      const sousCle = Array.isArray(value) ? key : k;
      // 🛑 THE PAYLOAD CONTENT IS DISCARDED **HERE**, on the way down — never by an early
      //    return at the head of the function: the return value of a RECURSIVE call
      //    is read by nobody, so that guard would be an EQUIVALENT mutant
      //    (measured on 15/08/2026: 2 survivors). We avoid it by CONSTRUCTION.
      if (!DEFAULT_PROFILE.contentKeys.includes(sousCle) || decision?.garde(sousCle)) {
        textValues(v, (depth || 0) + 1, acc, sousCle, decision);
      }
    }
  }
  // ⚠️ `chunks` = THE form consumed by the filters (per-value, 53bis).
  //    🛑 There is NO LONGER a concatenated `text` field: a pattern with a space
  //    matched there straddling two values — a text that exists in no
  //    param. The field was DELETED (not kept "for diagnostics"):
  //    a dead field always ends up finding a reader.
  // ⚠️ `keys` travels WITH `chunks`, same index, same value — that is what lets the `keys`
  //    operator narrow the universe without a SECOND traversal (two traversals = two truths
  //    that diverge at the first change of bounds, the class this file keeps closing).
  //    🛑 Never rebuild it on the caller's side from the payload: it would be that second
  //    traversal, and it would silently disagree the day `contentKeys` moves.
  return { chunks: acc.chunks, keys: acc.keys, truncated: acc.truncated };
}

// ⚠️⚠️ THE TWO OPERATORS ARE DUAL — SAME UNIVERSE, COMPLEMENTARY QUANTIFIERS.
//    SCOPE   = ∃ : at least one value of the gesture contains a pattern  → otherwise we skip.
//    EXCLUDE = ∀¬ : NO value of the gesture contains a pattern           → otherwise we skip.
// 🛑 NEVER re-evaluate `exclude` "candidate by candidate" (bug ㊼, fixed on
//    14/08/2026, and the previous comment declared it "INTENTIONAL asymmetry",
//    which extinguished the question for weeks). MATHEMATICAL reason, not
//    a taste: the negation of a "there exists" is a "for all"
//        match(m)   = ∃c : m ⊑ c        ¬match(m) = ∀c : m ⋢ c
//    Evaluated existentially, `exclude` was only HALF negative, hence
//    CIRCUMVENTABLE by the way a gesture is written: `bashCandidates` fabricates a
//    pseudo-path PER WORD (`.../node`, `.../--doc`) and it was enough for ONE of these
//    invented fragments to escape the pattern to AUTHORIZE everything — measured: the single
//    word `node` in `cd ~/Desktop/ctxroute && node explain.js` let
//    53 KB of skill through despite `exclude: ["explain.js"]`.
// ⚠️ UNIVERSE = all the text values of the payload (at any depth, same
//    bounds as `scope`) UNION the triggering context. The context is REQUIRED:
//    on the `tool` axis it is the TOOL NAME, which lives in NO parameter —
//    removing it would kill `tool: ["*"] + exclude` ("all EXCEPT X").
// ⚠️ TWO LAWS that this code MUST respect (sealed in property-based tests):
//    ① MONOTONICITY — adding a pattern to `exclude` can only REDUCE what is injected;
//    ② INDEPENDENCE FROM WRITING — two gestures with the same textual content decide
//      the same. Both were VIOLATED before this fix.
// ⚠️ `scope` absent OR empty array = "no filter". Without the length check,
// Array.isArray=true + .some on [] = false → SILENT skip of the rule.
/**
 * `scope` → LIST OF GROUPS. **AND between the groups, OR within a group.** PURE.
 *
 * ⚠️ ㊺① (14/08/2026) — REASON FOR EXISTING: `scope: ["a","b"]` is an **OR**, and an
 *    author writes it thinking "AND" ⇒ they get a rule BROADER than intended,
 *    **without any message**. The danger was never the limit, it is the AMBIGUITY.
 *    `scope: [["a"],["b"]]` says "a AND b", and makes POSITIVE completeness real
 *    ("this file AND this project AND this flag" was INEXPRESSIBLE: 120/256).
 * 🛑 **ZERO VOCABULARY WORD CREATED** — it is a FORM of the same key, not one more
 *    operator. The boolean base stays CLOSED (anti-synonym law §8).
 * ⚠️ **THE FLAT FORM IS UNTOUCHED**: a list of strings remains ONE group, hence
 *    exactly the old OR. That is the parity condition — the 852 rules of the corpus
 *    do not budge an inch (differential: 0 change measured).
 * 🛑 **MIXED FORM = REFUSED by the validators** (frontmatter + config schema).
 *    If it nonetheless reaches the engine (unvalidated config), we read the most
 *    RESTRICTIVE version (string = single-element group), NEVER the broadest:
 *    an engine that guesses must always guess in the direction that does not inject.
 * @returns {null|Array<Array<string>>} null = "no filter".
 */
function scopeGroups(scope) {
  if (!Array.isArray(scope) || scope.length === 0) return null;
  // 🛑 THE ORDER OF THESE TWO LINES IS PARITY ITSELF. A list WITHOUT any
  //    group is ONE group (the old OR); mapping it element by element would
  //    make it an AND and would flip the meaning of ALL the rules of the corpus — a mistake
  //    made and caught by `MUTANT L66` on 14/08/2026, in one minute.
  if (!scope.some((g) => Array.isArray(g))) return [scope];
  return scope.map((g) => (Array.isArray(g) ? g : [g]));
}

// ⚠️ `keys` — THE OPERATOR THAT SAYS **WHERE** TO LOOK (the others say WHAT to look for).
//    Two forms: a flat list = the same universe for the three axes · an object = ONE universe
//    PER AXIS (`match`/`scope`/`exclude`). An axis left out keeps the default universe:
//    omission is never a restriction, otherwise every existing rule would silently narrow.
// 🛑 RETURNS A PREDICATE, never a filtered list: the caller owns its own traversal, and a
//    second traversal here would be a second truth (the defect class this engine keeps
//    closing). A predicate composes with anything, a list must be rebuilt everywhere.
// ⚠️ UNDECLARED ⇒ `null` ⇒ the caller keeps its universe UNTOUCHED. Returning an
//    "always true" predicate instead would look identical and cost a traversal for nothing —
//    an equivalent mutant, avoided BY CONSTRUCTION (the doctrine of this file).
// ⚠️ `keys` — THE OPERATOR THAT SAYS **WHERE** TO LOOK (the others say WHAT to look for).
//    ONE decision, read two ways: the filters want a PREDICATE (they traverse values), the
//    trigger wants a LIST (it asks `keyValues` for declared keys). Deciding twice is what this
//    file spends its comments forbidding — the second copy drifts and nobody sees it.
//
// 🛑 A WHITELIST **REPLACES** the default universe, it does not intersect it: an entry may
//    therefore make `match` read a key the profile never declared. That is the "zero blocking"
//    rule — intersecting would let `keys` only ever SHRINK, and half the combinations would be
//    unreachable. A BLACKLIST, symmetrically, removes from the default.
// ⚠️ Undeclared ⇒ `null` ⇒ every caller keeps its universe UNTOUCHED. Returning a neutral
//    object instead would look identical and cost work for nothing — an equivalent mutant,
//    avoided BY CONSTRUCTION, which is the doctrine of this file.
// ⚠️ `String(k)` and not a `typeof` guard: it keeps TOTALITY on a hand-edited config (a
//    non-string never throws) in ONE expression, where a conjunction would leave a mutant
//    that no test can distinguish.
// ⚠️ `every` and NOT `some`: on a MIXED list — which `validate` refuses, but an unvalidated
//    config can carry — the reading must be the MOST RESTRICTIVE. An engine that guesses must
//    always guess in the direction that does NOT inject.
// 🛑 ONE RULE DECIDES THE FORM, AND IT IS DECIDABLE BY LOOKING (20/08/2026):
//    **at least one `-` ⇒ ADJUST the default universe · no `-` at all ⇒ REPLACE it.**
//    ⇒ `["-command", "content"]` = "everything except the command, PLUS the content".
// 🔴 THE MIXED FORM WAS REFUSED UNTIL TODAY, AND THE REFUSAL WAS THE HOLE. "Adjust the
//    default" was expressible only as a full re-enumeration of the universe by hand — an
//    ENUMERATION, hence born stale: the day the profile gains a key, every such entry
//    silently fails to follow it. That is class ㊽ (a list that only knows the past),
//    reintroduced by a validator that meant well. The old reason — "nobody can decide
//    whether the author meant only-minus or everything-plus" — stops holding the moment
//    the rule above is WRITTEN: a `-` is a verb, and a form with a verb adjusts.
// ⚠️ What stays refused is what names NOTHING (`-` alone, an empty list): a mute entry is
//    indistinguishable from a forgotten one.
function keyDecision(keysDecl, axis) {
  const decl = Object(keysDecl) === keysDecl && !Array.isArray(keysDecl) ? keysDecl[axis] : keysDecl;
  if (!Array.isArray(decl)) return null;
  // 🛑 AN EMPTY LIST IS INERT, NEVER A WHITELIST OF NOTHING (decision kept from 19/08).
  //     refuses it, but a hand-edited config is never validated — and a rule made
  //    MUTE by a malformed value is indistinguishable from a forgotten one, which is the
  //    defect this engine exists to kill. Before 20/08 this fell out of the arithmetic
  //    (0 removals === 0 entries ⇒ blacklist of nothing); the ADJUST/REPLACE rule makes the
  //    empty case a REPLACE, hence mute. It is now stated instead of being a side effect.
  if (decl.length === 0) return null;
  // Stryker disable next-line ArrayDeclaration: EQUIVALENT mutant, PROVEN not merely asserted.
  //   Seeding these accumulators with a junk key changes NO verdict: `garde` and `triggerKeys` only
  //   ever ASK whether a key name is present, and a name no payload can carry is asked about and
  //   never found. Writing a test for it would mean fabricating a payload whose key is Stryker's own
  //   literal — freezing a nonsense forever. We ELIMINATE by declaration, we never test dead ground.
  // Stryker disable ArrayDeclaration: EQUIVALENT mutant, PROVEN not merely asserted.
  //   Seeding these accumulators with a junk key changes NO verdict: `garde` and `triggerKeys` only
  //   ever ASK whether a key NAME is present, and a name no payload can carry is asked about and
  //   never found. A test for it would have to fabricate a payload keyed by Stryker's own literal —
  //   freezing a nonsense forever. We ELIMINATE by declaration; we never test dead ground.
  //   ⚠️ `disable` (not `disable next-line`): the pair spans TWO declarations, and a next-line
  //   directive silently protected only the first — measured, the second survived anyway.
  const bannies = [];
  const ajouts = [];
  // Stryker restore ArrayDeclaration
  for (const k of decl) {
    const s = String(k);
    if (s.startsWith(KEY_REMOVE)) bannies.push(s.slice(KEY_REMOVE.length));
    else ajouts.push(s);
  }
  const ajuste = bannies.length > 0;
  return {
    // ADJUST: the default universe, minus the removals, plus the additions — a value bound
    //   to no key survives it (it was never removed by name).
    // REPLACE: ONLY the keys named — a keyless value is therefore dropped, because
    //   "only file_path" cannot honestly keep a value that comes from nowhere.
    // ⚠️ `garde` IS THE **FILTERS'** PREDICATE (the trigger reads `bannies`/`ajouts` through
    //    `triggerKeys`), so its default is ㊿'s: every key EXCEPT the payload ones. Writing
    //    it as a bare `!bannies.includes(key)` only worked because the shared traversal had
    //    ALREADY dropped the payload keys — an invariant held by the CALLER, hence one that
    //    breaks the day a caller changes. A mixed form re-traverses, so it would have let a
    //    payload key back in WITHOUT anyone naming it: ㊿ silently undone by a form.
    garde: ajuste
      ? (key) => ajouts.includes(key) || (!bannies.includes(key) && !DEFAULT_PROFILE.contentKeys.includes(key))
      : (key) => ajouts.includes(key),
    ajuste,
    bannies,
    ajouts,
    decl,
  };
}

// ── THE PER-SOURCE DEFAULT OF THE FILTERS, AND ITS COMPOSITION ─────────
// 🔴 WHY THIS TIER EXISTS. On 19/08 `keys` was denied a `defaults.{source}` tier with a written
//    reason — "the global key universe already exists, it is `harness-profile.js`" plus the KNOB
//    TEST verdict "the data ALREADY expresses the distinction". **Both were refuted the next day,
//    by measurement**: making every doc of a category stop reading ONE observable meant writing it
//    on 300+ entries, i.e. an ENUMERATION, born stale (class ㊽) — the very thing this repo forbids
//    everywhere else. And the profile is the wrong knob: GLOBAL to every source at once, it cannot
//    say "skills stop reading this, file docs keep it".
// 🛑 A FILTER IS AN OPERATOR LIKE ANY OTHER — it lives where its peers live, so the tier carries
//    `scope`, `exclude` AND `keys` TOGETHER. Treating `keys` as a special case IS what produced
//    the 19/08 exception. ⚠️ `match` is DELIBERATELY out, asymmetry DECLARED: it is the only
//    operator that CREATES an injection, so a category-wide default would fabricate rules for docs
//    that declare none. A filter can only narrow — worst case, silence.
// ⚠️ IT LIVES HERE AND NOT IN `lib-pure`, and that is not filing: the ADJUST/REPLACE decision is
//    `keyDecision`, right above. A cascade resolved away from its decision needs a SECOND reading
//    of the same rule, and two readings of one rule diverge — this project has paid that bill
//    twice already (㊱, ㊳).
// 🔴 THE COMPOSITION IS WHAT KEEPS THE TIER FROM RECREATING THE CLASS IT KILLS. Without it, an
//    entry wanting to ADJUST what its category decided would have to re-enumerate the whole
//    universe by hand — the same enumeration, one level up. Rule, decidable by LOOKING, and
//    IDENTICAL to the one governing `keys` against the profile (one rule, two levels, never two
//    dialects): the entry names at least one `-` ⇒ it ADJUSTS the universe its category
//    resolved · only bare names ⇒ it REPLACES it, category included.
// ⚠️ ORDERED: the CATEGORY applies first, the ENTRY on top — so an addition by the entry beats a
//    removal by the category (`ajouts` wins over `bannies` in `keyDecision`). That is the only
//    reading where the entry keeps the last word, the law every other setting here obeys.
// 🛑 A REPLACE default under an ADJUST entry CANNOT be expressed by concatenating the two lists:
//    the entry's `-` would then adjust the PROFILE instead of the category. We RESOLVE the
//    category's universe first and hand the result over. Concatenating "because it is shorter"
//    reintroduces a silent gap between what an author writes and what the engine reads.
// ⚠️ HONEST LIMIT, WRITTEN NOT HIDDEN: a PURE ADDITION ("the category's default plus this key,
//    nothing else changed") stays inexpressible — a form with no `-` reads as REPLACE, at BOTH
//    levels. Pre-existing property of the operator, uniform, NOT introduced here. Closing it
//    means a new form, hence a measurement first.
// ⚠️ A THUNK, never a module-level const: a literal evaluated at load time is a STATIC mutant
//    that no test can be attributed to, so it survives for ever and the score lies about it.
const AXES_KEYS = () => ['match', 'scope', 'exclude'];

// 🛑 ADJUST + ADJUST COMPOSE BY CONCATENATION, AND THAT IS NOT A SHORTCUT — IT IS THE ONLY
//    CORRECT FORM. Resolving the pair into a bare LIST looks tidier and is a TRAP: a resolved
//    list reads as REPLACE, and the universe of the FILTERS is not the declared keys, it is
//    EVERY parameter minus the payload ones (㊿). Resolving would therefore make `scope` and
//    `exclude` blind to every undeclared parameter — a remote MCP's `args.foo` — SILENTLY.
//    Concatenation keeps the form ADJUST, so each axis keeps adjusting ITS OWN universe.
//    (Written after making that exact mistake, one minute before shipping it.)
// ⚠️ ORDER IS LOAD-BEARING: category first, entry second. `keyDecision` lets `ajouts` win over
//    `bannies`, so an addition by the entry beats a removal by its category — the entry keeps
//    the last word, like every other setting of this engine.
// 🛑 ONLY the "REPLACE default under an ADJUST entry" case needs resolving, and there it is
//    EXACT: the category already replaced the universe with an explicit list, so the entry
//    adjusts THAT list. Concatenating there would let the entry's `-` adjust the PROFILE
//    instead of the category — a silent gap between what an author writes and what runs.
function composerKeys(entree, defaut) {
  // ⚠️ NO `=== undefined` GUARDS HERE, and that is deliberate: `keyDecision` is TOTAL, so an
  //    absent side already falls into the two `!d` branches below with the SAME result.
  //    Stryker proved it — both guards survived as EQUIVALENT mutants. We ELIMINATE dead ground,
  //    we never test it: a guard kept for comfort is a mutant nobody can ever kill.
  const dE = keyDecision(entree, null);
  if (!dE) return defaut;        // an entry naming nothing narrows nothing: the category stands.
  if (!dE.ajuste) return entree; // REPLACE: "only these", category included.
  const dD = keyDecision(defaut, null);
  if (!dD) return entree;
  if (dD.ajuste) return dD.decl.concat(dE.decl);
  return dD.ajouts.filter((k) => !dE.bannies.includes(k)).concat(dE.ajouts);
}

// ⚠️ PER AXIS, always: `keys` carries ONE universe (flat list) or ONE PER AXIS (object). Mixing
//    them would let a category default meant for `scope` leak into the TRIGGER — "one
//    declaration, two meanings", the defect measured at 780 divergences on 19/08.
function composerKeysParAxe(entree, defaut) {
  if (entree === undefined) return defaut;
  if (defaut === undefined) return entree;
  // ⚠️ `Array.isArray` DIRECTLY: the two guards above already excluded `undefined`, so an extra
  //    `v === undefined ||` was dead ground — Stryker proved it by surviving. We eliminate.
  const plat = Array.isArray;
  if (plat(entree) && plat(defaut)) return composerKeys(entree, defaut);
  const out = {};
  for (const axe of AXES_KEYS()) {
    const e = Array.isArray(entree) ? entree : (entree && entree[axe]);
    const d = Array.isArray(defaut) ? defaut : (defaut && defaut[axe]);
    const r = composerKeys(e, d);
    if (r !== undefined) out[axe] = r;
  }
  return Object.keys(out).length ? out : undefined;
}

// ⚠️ TOTAL: a malformed `defaults` block degrades to "no default", never throws. A config is
//    hand-editable and NOTHING validates it at runtime (`config-gate` is a TEST, not a runtime
//    guard) — the engine never trusts its input.
// ⚠️ `scope`/`exclude` do NOT compose: they are VALUES, not universes. The entry wins whole, or
//    inherits whole. An empty list is "not declared" on both sides — historical semantics of the
//    loader, kept to the byte, so a doc writing `scope: []` inherits its category's.
function heriterFiltres(entree, defauts) {
  const d = (defauts && !Array.isArray(defauts)) ? defauts : {};
  // 🔴 THE ARRAY GUARD IS ON BOTH SIDES, and its absence on the entry was a REAL asymmetry
  //    found by a shape case: an ARRAY exposes `keys`, so `e.keys` picked up
  //    `Array.prototype.keys` — a FUNCTION handed to the cascade as if it were a declaration.
  //    Harmless downstream (`keyDecision` refuses it) and dirty everywhere: a value that means
  //    nothing must never travel. Symmetry is the rule, an asymmetry is a declared exception.
  // 🛑 A `typeof … === 'object'` conjunct USED TO SIT HERE AND WAS REMOVED (2026-08-20) — it was
  //    the file's LAST TWO MUTATION SURVIVORS, and it was REDUNDANT, not untested. Proven before
  //    touching anything, on 27 shapes (primitives, functions, symbols, bigint, Date, RegExp,
  //    Map/Set/Promise, null-prototype): what the cascade reads downstream — `.keys`, `.scope`,
  //    `.exclude` — is IDENTICAL with and without it, because a primitive simply has none of them.
  //    ⇒ ELIMINATED BY CONSTRUCTION, never killed by a test. Writing a test for a guard that
  //    changes no outcome would freeze dead code for ever, which this repo forbids explicitly.
  //    ⚠️ The `!Array.isArray` half is NOT redundant and stays: an array really does expose `keys`.
  const e = (entree && !Array.isArray(entree)) ? entree : {};
  const choisir = (a, b) => ((Array.isArray(a) && a.length) ? a : ((Array.isArray(b) && b.length) ? b : undefined));
  const out = { keys: composerKeysParAxe(e.keys, d.keys) };
  const sc = choisir(e.scope, d.scope);
  const ex = choisir(e.exclude, d.exclude);
  if (sc) out.scope = sc;
  if (ex) out.exclude = ex;
  return out;
}


// The TRIGGER's shape: a list of key names, derived from the SAME decision.
function triggerKeys(keysDecl, defauts) {
  const d = keyDecision(keysDecl, 'match');
  if (!d) return defauts;
  // ⚠️ REPLACE = the list IS the universe. ADJUST = the default MINUS the removals, PLUS the
  //    additions.
  // 🛑 NO DE-DUPLICATION OF THE ADDITIONS, and that is DELIBERATE: this list is only ever
  //    consumed by `.includes()`, so a name present twice decides exactly like a name present
  //    once. The first version filtered them out — Stryker kept the removal ALIVE, which is the
  //    proof the filter decided nothing. Dead code that is TESTED becomes frozen forever, so we
  //    ELIMINATE instead. Re-adding it would be re-adding an equivalent mutant.
  if (!d.ajuste) return d.ajouts;
  return defauts.filter((k) => !d.bannies.includes(k)).concat(d.ajouts);
}

function shouldSkip(rule, context, toolInput) {
  // ⚠️ ONE SINGLE traversal of the payload for BOTH operators: two calls side
  //    by side = two truths that would diverge at the first change of bounds.
  // 🛑 NO lazy computation here ("only traverse if an operator consumes it"):
  //    it would produce an undetectable EQUIVALENT mutant (computing for nothing
  //    changes NO verdict) and would gain nothing — `shouldSkip` is only called
  //    on rules whose PATTERN HAS ALREADY BITTEN (cf matchingDocs), not on the
  //    852 rules of the corpus. Optimizing here would mean paying a mutation hole for
  //    zero gain.
  // 🛑 EVALUATION PER VALUE, NEVER ON A CONCATENATION (53bis, 15/08/2026).
  //    The universe was `chunks.join(' ')`: a pattern WITH A SPACE (`"node build"`)
  //    could match STRADDLING two adjacent parameters — a text that
  //    exists in NO param of the gesture. Reproduced on the real engine, in
  //    BOTH directions (phantom exclusion + scope satisfied by a phantom).
  //    A pattern is searched WITHIN a value — that is the semantics of the spec
  //    (`language-spec.js::params`, per-value since its birth), and the
  //    exhaustive differential now carries the boundary form: going back
  //    to a `join` makes it TURN RED.
  const brut = textValues(toolInput);
  // ⚠️ `keys` NARROWS the universe PER AXIS. Computed once per operator, on the SAME
  //    traversal — the parallel `keys[]` is what makes that possible without a 2nd pass.
  // ⚠️ The triggering CONTEXT carries no parameter key (it is a candidate path, not a
  //    param): it is therefore treated like any keyless value — kept by a blacklist,
  //    dropped by a whitelist. Exempting it would make `keys` lie by half.
  // ⚠️ A WHITELIST **REPLACES** the universe, and that is ABSOLUTE — on the filters as on
  //    the trigger. 🔴 It was NOT, until 19/08/2026: `keys: ["content"]` widened the
  //    TRIGGER and left `scope`/`exclude` blind, so ONE declaration had TWO meanings
  //    depending on the axis reading it, in silence. **780 divergences measured** by the
  //    exhaustive differential the day the model learned the operator. Worse: the open
  //    half was the DANGEROUS one (a trigger CREATES injections) and the closed half the
  //    SAFE one (a filter can never inject on its own).
  // ⚠️ Re-traversed ONLY for a rule that NAMES a payload key — the 852 rules of the fleet
  //    keep the shared traversal, so this costs them nothing. Same pattern as the trigger
  //    (`cheminsR`/`commandesR`), same reason: the general case must not pay for the rare one.
  const garde = (axis) => {
    const d = keyDecision(rule.keys, axis);
    if (!d) return brut.chunks.map(norm);
    // ⚠️ A WHITELIST re-traverses with its OWN predicate as the admission rule — the two
    //    are the SAME question ("which keys does this entry read?"), so asking it twice
    //    would be two truths that diverge. A BLACKLIST keeps the shared traversal: it only
    //    ever REMOVES from the default, so it can need nothing the default did not collect.
    // ⚠️ RE-TRAVERSED AS SOON AS THE ENTRY NAMES A BARE KEY — whitelist OR addition. A pure
    //    removal can only take away from what the shared traversal already collected, so it
    //    keeps it; naming a key may ask for one the default never collected (a payload key),
    //    and only a re-traversal can produce it. Testing `!ajuste` alone would silently
    //    ignore the ADDITIONS of a mixed form — the operator accepted and half inert, which
    //    is the exact defect of 19/08.
    const src = d.ajouts.length ? textValues(toolInput, 0, null, undefined, d) : brut;
    return src.chunks.filter((_, i) => d.garde(src.keys[i])).map(norm);
  };
  const valeurs = garde('scope');
  if (Array.isArray(rule.exclude)) {
    // ⚠️ The CONTEXT remains a SEPARATE value, never glued to the params: glued,
    //    the end of the params and the start of the context fabricated a pattern that
    //    exists nowhere (`…ex` + `plain.js` = "explain.js"). Same class
    //    as the concatenation above, fixed before it.
    // 🛑 `exclude` READS ITS OWN AXIS, never `scope`'s. Reusing the list computed above
    //    was a REAL bug caught by the test the same hour: the two axes are declared
    //    separately precisely so they can differ, and sharing one universe made the
    //    `exclude` axis silently inert — an operator that accepts a value and ignores it.
    // ⚠️ The context is a LIST since 19/08/2026 (every biting candidate), and stays
    //    ONE STRING on the `tool`/`servers` axes (the tool name). `concat` accepts both
    //    without a single conditional: an array is spread, a scalar is appended —
    //    totality by CONSTRUCTION, where a `Array.isArray` guard would be one more
    //    branch to keep alive for nothing.
    const univers = garde('exclude').concat(
      Array.isArray(context) ? context.map(norm) : norm(context),
    );
    if (rule.exclude.some((ex) => univers.some((u) => u.includes(norm(ex))))) return true;
  }
  // ⚠️ `scope` absent OR EMPTY array = "no filter": without the length
  //    check, `[].some()` = false → the rule would be SILENTLY SKIPPED.
  //    No symmetric check on `exclude` — a `[]` excludes nothing there (`.some`
  //    yields false), so the guard would be dead code, hence an equivalent mutant.
  const groupes = scopeGroups(rule.scope);
  // AND between the GROUPS, OR within a group. Flat form = ONE group = the old OR.
  if (groupes && !groupes.every((g) => g.some((s) => valeurs.some((v) => v.includes(norm(s)))))) return true;
  return false;
}

// ⚠️ THE DERIVED FACTS ARE A REGISTRY, NOT A LIST OF BRANCHES — `derived-observables.js`.
//    Read the WHY there. What matters HERE: this file no longer knows how many derived
//    observables exist, nor what they are called. It LOOPS. Adding one is one entry in the
//    registry and NOT ONE LINE of engine — which is the whole difference between a language
//    and a tool, and the reason this project exists.
// ⚠️ `bashCandidates` KEEPS returning the WHOLE universe (raw text first, then every derived
//    fact in registry order): it is the public probe consumed by `explain.js` and by the
//    property laws, and the ∀¬ of `exclude` must keep seeing every value. A filter that
//    stopped seeing one would be a negation weakened in SILENCE, which is ㊼ all over again.
//    Only the TRIGGER composes the facts per rule.
function bashCandidates(command) {
  return [command].concat(derivedCandidates(command));
}

/**
 * THE function of the file source. PURE.
 *
 * @param {Array} rules  - rules { pattern, doc, scope?, exclude? }, ORDER IS SIGNIFICANT.
 * @param {{ toolName?: string, toolInput?: object }} payload - neutral, no harness dialect.
 * @returns {Array} doc refs { doc }, in injection order, deduplicated.
 *
 * ⚠️ ORDER = rule-major (loop over rules → loop over paths), NEVER path-major.
 *    That is the parent→child order on which the "global doc → specific doc" concatenation depends.
 * ⚠️ DEDUP = the FIRST rule pointing at a .md wins. The following ones are ignored.
 *    Inverting it (last wins) would silently break the parent/child order.
 */
function matchingDocs(rules, payload) {
  // Stryker disable next-line StringLiteral: EQUIVALENT mutant proven (16/07/2026) — toolName is
  // only compared to 'Bash'/'apply_patch' (never to empty): the mutant's literal fails the same.
  // Restructuring to avoid it by construction = forbidden without replaying the differential.
  const toolName = (payload && payload.toolName) || '';
  const toolInput = (payload && payload.toolInput) || {};

  // ⚠️ ㊽ (14/08/2026) — A SHELL GESTURE IS RECOGNIZED BY ITS **SHAPE**, NEVER BY ITS NAME.
  //    The engine tested `toolName === 'Bash'`: a harness dialect inside a PURE
  //    module, and above all a LIST that only knows the past. **MEASURED on 7,553 real
  //    calls**: 4 tools carry a `command` (`Bash`, `PowerShell`, `mcp__ssh__ssh_exec`,
  //    `mcp__infra__infra_call`) and all 4 are shell commands — zero exception.
  //    The test by name therefore made **809 commands out of 4,396 (18%) INVISIBLE** to
  //    the trigger: all PowerShell, all SSH. On a Windows machine, the main shell.
  // 🛑 NEVER go back to a list of tools: it would be born stale (a new shell,
  //    a new remote MCP) and its failure would be SILENT. The shape covers the future.
  // ⚠️ 51: the commands come from the DECLARED KEYS (`commandKeys`), at any
  //    depth — a remote MCP puts its own in `args{}` (measured on
  //    `infra_call`). Reading `toolInput.command` alone missed them.
  const commandes = keyValues(toolInput, DEFAULT_PROFILE.commandKeys, MAX_DEPTH);
  // ⚠️ git commands are IGNORED: a file name in a commit message
  //    triggers a false positive ("fix validation.ts" matches the pattern validation.ts).
  if (commandes.some((c) => /^\s*git\s+/.test(c))) return [];

  if (!Array.isArray(rules)) return [];

  const filePaths = extractFilePaths(toolName, toolInput);
  const matched = [];
  const seen = new Set();

  const add = (rule) => {
    if (typeof rule.doc !== 'string' || seen.has(rule.doc)) return;
    seen.add(rule.doc);
    matched.push({ doc: rule.doc });
  };

  for (const rule of rules) {
    if (!rule || typeof rule.pattern !== 'string') continue;
    const normPattern = norm(rule.pattern);

    // ⚠️ `keys.match` NARROWS (or WIDENS) what the trigger reads, FOR THIS RULE ONLY. The
    //    universes are recomputed ONLY when the rule declares `keys` — the 852 rules of the
    //    fleet keep the shared computation, so this operator costs them exactly nothing.
    // ⚠️ ONE axis, TWO sets: `match` reads paths AND commands. A whitelist naming only a path
    //    key therefore leaves NO command key — which is precisely how one writes "trigger on
    //    the file, never on the text of a command that merely mentions it".
    const cheminsR = rule.keys
      ? extractFilePaths(toolName, toolInput, { ...DEFAULT_PROFILE, pathKeys: triggerKeys(rule.keys, DEFAULT_PROFILE.pathKeys) })
      : filePaths;
    const commandesR = rule.keys
      ? keyValues(toolInput, triggerKeys(rule.keys, DEFAULT_PROFILE.commandKeys), MAX_DEPTH)
      : commandes;

    // 🛑 THE TRIGGERING CONTEXT IS **ALL** THE CANDIDATES THAT BIT, NEVER THE CURRENT ONE
    //    ALONE (19/08/2026). Evaluated candidate by candidate, `exclude` was existential
    //    again — ONE candidate free of the excluded pattern re-authorised everything, so
    //    the negation depended on HOW the gesture was written. That is ㊼ WORD FOR WORD,
    //    and it came back through the door `keys` opened: as long as the params carried
    //    the whole command, the complete universe hid the defect; `keys: {exclude:
    //    ["-command"]}` removes it and the hole reappears. **192 divergences measured**
    //    by the exhaustive differential. A "for all" cannot be bypassed BY CONSTRUCTION —
    //    that is the whole point, and it is why the decision is taken ONCE, not per candidate.
    // ⚠️ THE TWO HALVES OF A SHELL GESTURE ARE TWO UNIVERSES (20/08/2026). The RAW text
    //    follows the `command` key (hence `commandesR`); the DESIGNATED directory follows
    //    its own declared name, and is therefore derived from the FULL command list — a
    //    rule that drops `command` must keep seeing WHERE it works, which is the entire
    //    point. Reading it from `commandesR` would re-merge them and cost 47.7 % of real
    //    work, measured.
    // ⚠️ ONE GATE PER DERIVED FACT, DERIVED FROM THE REGISTRY — never a branch per name.
    //    A fact added to `derived-observables.js` tomorrow is addressable here the same day,
    //    without a line changing. Two hand-written branches was the first shape of this code
    //    and it was already a duplication: the third fact would have made it a pattern.

    const mordants = [];
    for (const fp of cheminsR) if (norm(fp).includes(normPattern)) mordants.push(fp);
    for (const commande of commandesR) {
      if (norm(commande).includes(normPattern)) mordants.push(commande);
    }
    for (const obs of DERIVED_OBSERVABLES) {
      // ⚠️ The gate reads the rule's universe for THIS name; `triggerKeys` is the single
      //    decision (REPLACE vs ADJUST), never re-implemented here.
      const clesObs = rule.keys ? triggerKeys(rule.keys, [obs.name]) : null;
      if (clesObs && !clesObs.includes(obs.name)) continue;
      // ⚠️ THE INPUT IS THE FULL COMMAND LIST, never `commandesR`: dropping the raw half must
      //    NOT drop where the gesture WORKS — measured, that reading costs 47.7 % of real work.
      for (const commande of commandes) {
        for (const cand of obs.derive(commande)) {
          if (norm(cand).includes(normPattern)) mordants.push(cand);
        }
      }
    }
    if (mordants.length && !shouldSkip(rule, mordants, toolInput)) add(rule);
  }

  return matched;
}

module.exports = {
  matchingDocs,
  heriterFiltres,
  composerKeys,
  composerKeysParAxe,
  keyDecision,
  norm,
  extractFilePaths,
  shouldSkip,
  scopeGroups,
  bashCandidates,
  textValues,
  MAX_DEPTH,
  MAX_SIZE,
};
