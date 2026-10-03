'use strict';
// ═══════════════════════════════════════════════════════════════════════
// response-pure.js — WHAT A TOOL ANSWERED, as the `response` setting reads it
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 WHY (2026-09-23): until today every observable of the language was something the agent
//    SENT (a path, a command, a parameter). What the tool ANSWERED was never read — measured,
//    `src/` held zero reference to it — so the situations that are born in a RESPONSE (an
//    invoice already posted, a port already taken, a session expired) delivered nothing.
//    `response: {"scope": [...], "exclude": [...]}` narrows a doc to the moment AFTER the tool
//    answered, and to the answers that satisfy those filters.
// 🛑 THE SEMANTICS OF `scope`/`exclude` IS NOT WRITTEN HERE. It is `file.filtersRefuse`, the
//    one the gesture's parameters already go through: ∃ for `scope` (AND of OR groups), ∀¬ for
//    `exclude`. Only the UNIVERSE differs, and this module builds that universe and nothing else.
// ⚠️ THE UNIVERSE IS EVERY TEXT OF THE ANSWER, AT ANY DEPTH, KEYS NEVER INCLUDED:
//    · every key is traversed — the ㊿ exclusion of `content`-like keys protects the FILTERS
//      from the text an agent TYPES; in an answer the content IS the fact (a Read answers its
//      file under `content`), so dropping it would blind the setting to the answer itself.
//    · a string that parses as a JSON OBJECT or ARRAY is read as that structure. MEASURED
//      2026-09-23 on Claude Code 2.1.280: an MCP tool returning structured content reaches the
//      hook as the STRING `{"state":"posted"}`, while Gemini hands an object. Unfolding makes
//      the verdict independent of the harness's serialisation: a pattern naming a KEY never
//      matches, whichever form the answer travelled in (the ㊵ doctrine: the meaning of an
//      operator must never depend on the SHAPE of a payload).
// ⚠️ SAME BOUNDS as the parameters (`MAX_DEPTH`, `MAX_SIZE`): beyond them the answer is cut,
//    and `explain.js` says so (`truncated`). A mute bound would recreate the defect ㊵ fixed.
// ⚠️ PURE: zero I/O, zero harness dialect — the shell hands over the answer, untouched.
// ═══════════════════════════════════════════════════════════════════════

const { textValues, filtersRefuse, norm, MAX_DEPTH } = require('./sources/file.js');

// ⚠️ A THUNK, never a module-level literal: a load-time object is a STATIC mutant.
const EVERY_KEY = () => ({ guard: () => true });

// A JSON text that is an object or an array, or `undefined`.
// ⚠️ The PARSED value is kept only if it is a structure: `"42"` parses to a number and
//    `"\"a\""` to a string, and both would stop being TEXT — a scope `"42"` would then miss
//    an answer that literally says 42. Only an object or an array changes the reading.
// ⚠️ The `catch` is EMPTY and the function falls through to `undefined`: a `return undefined`
//    written there was an EQUIVALENT mutant (Stryker emptied it, nothing changed) — eliminated by
//    construction, never tested.
function structureOf(text) {
  try {
    const parsed = JSON.parse(text);
    return Object(parsed) === parsed ? parsed : undefined;
  } catch {
    // Not JSON: the text stays text.
  }
}

// Mark the bound as crossed and hand the value back AS IS — a text stays a text, never dropped.
function cutAt(value, seen) {
  seen.cut = true;
  return value;
}

// The answer with every JSON-encoded structure unfolded, bounded like every traversal here.
// ⚠️ DEPTH IS THE DEPTH OF THE UNFOLDED TREE — the one `textValues` walks. An unfolded structure
//    takes the SLOT of its text, so it adds NO level; counting one (as the first version did)
//    inflated the depth of every JSON-in-JSON answer and reported a cut where `textValues` would
//    read everything (two mutation survivors, 2026-09-23, both on that miscount).
// ⚠️ ONLY A TEXT THAT ENCODES A STRUCTURE IS BOUNDED HERE. Objects need no bound of ours: the
//    traversal that follows refuses to enter one past `MAX_DEPTH` and SAYS so — a second check
//    here was dead ground, an equivalent mutant. A JSON text AT the bound is kept RAW (never
//    dropped) and the cut is RECORDED: read raw, its key names become readable words, which is
//    exactly what a crossed bound must SAY (a bound crossed in silence is the ㊵ defect).
function unfold(value, depth, seen) {
  if (typeof value === 'string') {
    const structure = structureOf(value);
    if (structure === undefined) return value;
    return depth >= MAX_DEPTH ? cutAt(value, seen) : unfold(structure, depth, seen);
  }
  if (Object(value) !== value) return value;
  const out = Array.isArray(value) ? [] : {};
  for (const [k, v] of Object.entries(value)) out[k] = unfold(v, depth + 1, seen);
  return out;
}

/**
 * Every text of the answer, normalised exactly like the parameters (`norm`).
 * @returns {{ values: string[], truncated: null|'depth'|'size' }}
 */
function responseValues(response) {
  // ⚠️ `{}` and not `{ cut: false }`: an absent flag reads as false, so the initial `false` was an
  //    EQUIVALENT mutant — eliminated by construction.
  const seen = {};
  const t = textValues(unfold(response, 0, seen), 0, null, undefined, EVERY_KEY());
  return { values: t.chunks.map(norm), truncated: seen.cut ? 'depth' : t.truncated };
}

/**
 * Does this answer FAIL the doc's `response` filter? `true` ⇒ the doc is not delivered.
 * ⚠️ `exclude` sees the SAME values as `scope`: an answer has no triggering context.
 * @param {{scope?: Array, exclude?: string[]}} filter - the RESOLVED `response` setting
 * @param {*} response - the tool's answer, as the harness handed it over
 */
function responseRefuses(filter, response) {
  const { values } = responseValues(response);
  return filtersRefuse(filter, values, values);
}

module.exports = { responseValues, responseRefuses };
