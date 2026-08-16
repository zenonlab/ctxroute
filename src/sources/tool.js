// ═══════════════════════════════════════════════════════════════════════
// "TOOL" SOURCE — trigger = EXACT NAME of a native tool of the harness.
// ═══════════════════════════════════════════════════════════════════════
//
// REASON FOR EXISTING (19/07/2026, measured): native tools WITHOUT a file
// path and WITHOUT an mcp__ prefix (WebFetch, WebSearch, …) were a total
// BLIND SPOT — no source could trigger on them (proven by spawn:
// silence on a WebFetch payload). Yet "the agent uses tool X" is a
// 100% DECIDABLE event — exactly the framework's primitive.
// Founding case: the instruction "web research = sources from TODAY, official
// doc first" never delivered to the (sub-)agents heading to the web.
//
// ⚠️ SEMANTICS DISJOINT from the other triggers — NEVER MERGE THEM:
//    `match:` = substring on a PATH · `mcp:` = exact name of a SERVER ·
//    `tool:` = EXACT name (===, case-sensitive) of a native TOOL.
//    A substring here would match `WebFetch` inside a file path — the
//    false positive that the disjunction of the keys eliminates by construction.
// ⚠️ PURE (gate sources-must-stay-pure): zero I/O, zero harness dialect.
//    `scope`/`exclude` = SAME semantics as the file source, via
//    file.shouldSkip (SINGLE SOURCE — never copy the logic; the
//    context of exclude = the tool name, the only "current path" that exists).
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const file = require('./file');

// ⚠️ `toolList` LIVES IN frontmatter.js (it is declaration READING,
//    not matching) and is only RE-EXPORTED here for the existing callers.
//    A COPY of it existed here until 31/07/2026: two readings of the
//    same key, hence two ways of diverging silently — precisely what this
//    repo fights. The copy was deleted, not "kept just in case".

// ⚠️ WILDCARD `*` (31/07/2026, REFACTOR-PLAN §B/§B0) — a special VALUE, NOT an
//    operator: the boolean base (match=OR, scope=AND, exclude=NOT) stays
//    CLOSED, no word is added to the vocabulary.
//    REASON: `scope` sees all the parameters but NEVER triggers on its own;
//    to react to a GESTURE one had to ENUMERATE the tools
//    (["Bash","PowerShell","mcp__ssh__ssh_exec"]) — hence coding a list where
//    the intent is "whatever the tool". The day a shell/MCP is
//    added, the rule becomes MUTE SILENTLY: exactly the defect that
//    this framework fights everywhere else.
//    ⚠️ AGGRAVATING FACTOR MEASURED BEFORE THE FIX: `tool: ["*"]` was ALREADY accepted by
//    validate() AND matched NOTHING. The syntax everyone tries
//    spontaneously was therefore silently dead AND certified valid — an
//    ACTIVE TRAP, not merely an absent feature.
//    ⚠️ §B0: this is also what makes NEGATION usable on the tool axis.
//    `exclude` was already matched against the TOOL NAME here (cf shouldSkip
//    below, whose "context" is toolName) but remained inert: one
//    excluded nothing from an enumeration one wrote oneself. `*` + exclude
//    = "all the tools EXCEPT X", which was INEXPRESSIBLE. Boolean
//    completeness, announced by the doctrine, becomes TRUE on the tool axis.
//    ⚠️ SINGLE SOURCE of the symbol: it is defined in `frontmatter.js` with the
//    rest of the language's VOCABULARY (MODES, DRIFT_UNITS, KNOWN…). Re-declaring it
//    here would make two truths — the kind that diverge silently.
const { WILDCARD, toolList } = require('../frontmatter');

// ⚠️ EMPTY/absent tool name ⇒ the wildcard does NOT match (negative case required):
//    "any tool" presupposes that there IS a tool. Without this guard,
//    a degraded payload would trigger all the wildcard docs of the corpus.
function targets(noms, toolName) {
  if (noms.includes(toolName)) return true;
  return noms.includes(WILDCARD) && typeof toolName === 'string' && toolName !== '';
}

/**
 * THE function of the tool source. PURE.
 * @param {Array} docs - [{ doc, fm }]: docs of the file corpus WITH validated frontmatter.
 * @param {{ toolName?: string, toolInput?: object }} payload - neutral, no harness dialect.
 * @returns {Array} refs { doc } in corpus order, dedup by the gateway (docId).
 */
function matchingDocs(docs, payload) {
  // ⚠️ No "empty toolName" guard: redundant by CONSTRUCTION (equivalent
  //    mutant otherwise) — a frontmatter `tool: ''` is REJECTED by validate
  //    (isMatchDecl requires non-empty), so includes(''/undefined) = false already.
  const toolName = payload && payload.toolName;
  const toolInput = (payload && payload.toolInput) || {};
  const out = [];
  for (const { doc, fm } of docs) {
    if (!fm || !targets(toolList(fm), toolName)) continue;
    // ⚠️ `shouldSkip` receives toolName as CONTEXT: on this axis, `exclude`
    //    therefore bears on the TOOL NAME (and not on a path). That is what
    //    makes "all EXCEPT X" expressible once the wildcard is in place (§B0).
    if (file.shouldSkip(fm, toolName, toolInput)) continue;
    out.push({ doc });
  }
  return out;
}

module.exports = { matchingDocs, toolList, targets, WILDCARD };
