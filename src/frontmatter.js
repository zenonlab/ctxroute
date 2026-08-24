// ═══════════════════════════════════════════════════════════════════════
// FRONTMATTER PARSER — PURE. The doc declares its own trigger.
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ ZERO I/O (like lib-pure.js / sources/file.js). The caller reads the file.
//
// WHY THIS FILE EXISTS: before it, a rule lived in protected-paths.json
// and its content in a .md — 2 things to keep in sync, hence 2 ways to drift
// SILENTLY: doc without a rule = never injected; rule without a doc = dead.
// With the frontmatter there are no longer two things. Those bugs no longer exist,
// they are not "caught".
//
// ⚠️ DELIBERATE SUBSET OF YAML — NOT a YAML parser, and it will NEVER become one.
//    Supported: `key: value`, `key: [a, b]`, `key: true|false|number`.
//    Full YAML = anchors, refs, implicit types, the `norway problem` (`no` → false),
//    an attack surface and an external dependency. We read 5 known fields, not a language.
//    Wanting to "just add multi-line" = the first step towards a YAML parser.
//
// ⚠️ TOTALITY MANDATORY: it must NEVER throw, whatever byte it receives.
//    A parser that throws on a malformed doc crashes the hook → NO doc
//    injected anywhere any more (one bad .md would break the whole system).
//    Fail-open: unreadable frontmatter = no declaration = inert doc, never a crash.
//    Sealed by property-based testing (frontmatter.property.test.js): totality on generated input.
// ═══════════════════════════════════════════════════════════════════════

// Delimiter: `---` alone on its line, at the VERY START of the file.
// ⚠️ Accepts the UTF-8 BOM and CRLF (Windows) — otherwise 100% of docs edited under
//    Windows would silently have no frontmatter. A real trap, not a theoretical one.
const FM_RE = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

function parseScalar(raw) {
  const v = raw.trim();
  if (v === 'true') return true;
  if (v === 'false') return false;
  // ⚠️ A number ONLY if the entire string is a number — otherwise "12-factor"
  //    would become 12. Number() alone accepts too much (spaces, '', hex).
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  // Optional quotes, removed if they wrap the whole value.
  const m = /^(['"])([\s\S]*)\1$/.exec(v);
  return m ? m[2] : v;
}

/**
 * Does a line belong to the body of a YAML block?
 * ⚠️ TOTAL: `undefined` (end of frontmatter) yields `false` — without this guard,
 *    a block on the LAST line would crash the parser, and therefore ALL the
 *    injection of the fleet (`parse` must NEVER throw, cf the module header).
 */
function isIndented(line) {
  // ⚠️ NO `typeof === 'string'` guard: `RegExp.test` COERCES its argument
  //    (`test(undefined)` reads "undefined", does not throw) and "undefined" does
  //    not start with any whitespace ⇒ `false`, the desired result. The guard would
  //    therefore be UNOBSERVABLE = an EQUIVALENT mutant, an eternal survivor. Doctrine of
  //    the fleet: we ELIMINATE equivalence by construction, we do not test it.
  return /^[ \t]+\S/.test(line);
}

/**
 * EMPTY line in the YAML sense (nothing, or only blanks).
 * ⚠️ Same deliberate coercion as `isIndented`: `undefined` gives "undefined",
 *    which does not match `^[ \t]*$` ⇒ `false`. End of frontmatter handled without a guard.
 */
function isEmpty(line) {
  return /^[ \t]*$/.test(line);
}

/**
 * Body of a YAML block → value.
 * ⚠️ DE-INDENTATION ON THE SMALLEST NON-EMPTY INDENTATION, never a hard-coded
 *    number of spaces: the author indents as they wish, and a fixed `slice(2)`
 *    would eat the first character of a block indented by 1.
 * ⚠️ `|` = LITERAL (line breaks kept) · `>` = FOLDED (lines joined
 *    by a space) — standard YAML semantics, not a home-made invention.
 * ⚠️ We `trimEnd()` the result (YAML "clip" chomping): without it, the empty
 *    line preceding the closing `---` would enter the value.
 */
function assembleBlock(body, marker) {
  // ⚠️ `trim() !== ''` and not `l !== ''`: a line of SPACES ONLY is empty in the
  //    YAML sense. Counting it would give a spurious indentation that would crush
  //    the real minimum and leave the whole block indented.
  const indents = body.filter((l) => l.trim() !== '').map((l) => /^[ \t]*/.exec(l)[0].length);
  // ⚠️ NO `indents.length === 0` guard: we only enter a block IF the
  //    following line is indented AND non-empty (`isIndented`), so `indents`
  //    ALWAYS carries at least one element. The guard would be unreachable = one more
  //    EQUIVALENT mutant. The invariant is guaranteed by the CALLER.
  const base = Math.min(...indents);
  const bare = body.map((l) => l.slice(base));
  return (marker === '>' ? bare.map((l) => l.trim()).join(' ') : bare.join('\n')).trimEnd();
}

function parseList(inner) {
  // `[a, b]` — inline list only (the format of the existing scope/exclude).
  return inner
    .split(',')
    .map((s) => parseScalar(s))
    .filter((s) => s !== '');
}

/**
 * @param {string} text - raw content of a .md
 * @returns {{ data: Object<string,any>, body: string, hasFrontmatter: boolean }}
 *
 * ⚠️ `body` = the .md WITHOUT the frontmatter: that is what goes into the agent's
 *    context. Injecting the frontmatter would be noise re-injected on every
 *    access (exactly what the Documentation rule forbids).
 */
function parse(text) {
  if (typeof text !== 'string') return { data: {}, body: '', hasFrontmatter: false };

  const m = FM_RE.exec(text);
  if (!m) return { data: {}, body: text, hasFrontmatter: false };

  const data = {};
  // ⚠️ QUEUE CONSUMED (`shift`) and not an index: the YAML BLOCK (`key: |`) must
  //    SWALLOW the following lines — it is the ONLY layer that still sees them.
  //    The original `for (let i…; i < n; i++)` left the mutant
  //    `i <= n` alive: the extra iteration reads `undefined`, which matches no
  //    key, hence UNOBSERVABLE = an eternal survivor. Consuming removes the
  //    index comparison and the `lines[i+1]`/`[i+2]` accesses in a single move.
  const remainingOnes = m[1].split(/\r?\n/);
  while (remainingOnes.length > 0) {
    const line = remainingOnes.shift();
    // ⚠️ NO "ignore comments/empty lines" guard: it would be REDUNDANT.
    //    The regex below requires `[A-Za-z0-9_-]+` at the head — a `#` or an empty line
    //    NEVER match, so they are already ignored. Adding the guard = 3 EQUIVALENT
    //    mutants, undetectable (doctrine: avoid by construction, do not test).
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*([\s\S]*)$/.exec(line);
    if (!kv) continue; // ⚠️ non-conforming line = IGNORED, never a throw (totality).
    const key = kv[1];
    // ⚠️ NO .trim() here: `parseScalar` already trims → redundant = equivalent mutant.
    const raw = kv[2];
    // ⚠️ `rules` = inline JSON, BEFORE the list path: parseList would cut the JSON
    //    on its internal commas. JSON.parse is TOTAL here (try/catch) — a broken
    //    JSON leaves the RAW value (string) → `validate` turns it RED, never a throw.
    //    JSON ≠ a home-made mini-language: it is the ORIGINAL format of the migrated rules.
    // ── YAML BLOCK (`key: |` / `key: >`) — FIXES A SILENT LOSS ─────────────────
    // 🔴 REAL DEFECT (found by adversarial simulation, fixed on 06/08/2026):
    //    `note: |` returned the value `"|"` and the following indented lines
    //    were SWALLOWED — the key regex rejects them (they do not start
    //    with an identifier), hence `continue`. And since the whole frontmatter is
    //    removed from the body, they ALSO disappeared from the injected doc:
    //    lost on BOTH sides, `validate` GREEN. `note` is precisely the field
    //    that invites writing at length — the trap was armed for its first use.
    // 🛑 THE GUARD BELONGS TO THIS LAYER, AND NOWHERE ELSE. A version
    //    placed in `validate()` (05/08/2026) was removed the same day: it
    //    rejected any value `|`, yet `match: "|"` is a LEGITIMATE pattern, and
    //    the CI turned it red within minutes (round-trip property of the migrator).
    //    Here we have the CONTEXT that lifts the ambiguity: a block is a `|`
    //    FOLLOWED by an INDENTED line. Without an indented line, `|` stays the string.
    // ⚠️ WE SUPPORT instead of REJECTING: this is standard YAML, and the author who
    //    writes it is right. Rejecting would leave the need (writing at length) with no way out.
    const block = /^([|>])[-+]?$/.exec(raw.trim());
    if (block && isIndented(remainingOnes[0])) {
      const body = [];
      // ⚠️ An EMPTY line belongs to the block — otherwise a paragraph separated by a
      //    blank would be truncated at its half (silent loss, again).
      // ⚠️ NO "… AND an indented line follows": that guard existed, and
      //    it was UNOBSERVABLE — the FINAL empty lines thus absorbed
      //    are removed anyway by the `trimEnd()` of `assembleBlock`.
      //    It therefore only produced one more equivalent mutant. The useful
      //    rule is simpler: indented or empty ⇒ in the block.
      // ⚠️ NO length guard: `isIndented`/`isEmpty` coerce, so
      //    `restantes[0] === undefined` yields `false` without throwing. A guard
      //    `restantes.length > 0` would be UNOBSERVABLE here = equivalent mutant.
      while (isIndented(remainingOnes[0]) || isEmpty(remainingOnes[0])) {
        body.push(remainingOnes.shift());
      }
      data[key] = assembleBlock(body, block[1]);
      continue;
    }
    if (key === 'rules') {
      try {
        data[key] = JSON.parse(raw);
      } catch (e) {
        data[key] = parseScalar(raw);
      }
      continue;
    }
    // ⚠️ GROUPED `scope` (㊺①, parse fixed on 15/08/2026 — job 55): the
    //    form `[["a"],["b"]]` is JSON, and parseList cut it on its INTERNAL
    //    commas ⇒ FLAT literals (`'["a"]'`), VALID to the validator ⇒
    //    a rule born DEAD in silence (real defect: the first doc of the fleet to write it
    //    was born dead). Detection = the value STARTS with `[[` — NEVER
    //    JSON-first on every list: a FLAT list one of whose elements is valid
    //    JSON (`[{}]`, `[null]`) would change reading; the round-trip property
    //    proved it on `[{}]` that same day.
    // ⚠️ Unreadable JSON on this form ⇒ RAW value (string) ⇒ `validate`
    //    RED — never the list path, which would return silent flat garbage.
    // ⚠️ `exclude` TOO, for the OPPOSITE reason: it has NO grouped form
    //    (∀¬ over a single universe) and `validate` must SEE `[["a"]]` to
    //    REFUSE it loudly — as a flat string, the refusal was impossible.
    //    The OTHER keys NEVER go through JSON (note = the author's text).
    if ((key === 'scope' || key === 'exclude') && /^\[\s*\[/.test(raw)) {
      try {
        data[key] = JSON.parse(raw);
      } catch (e) {
        data[key] = raw;
      }
      continue;
    }
    const list = /^\[([\s\S]*)\]$/.exec(raw);
    data[key] = list ? parseList(list[1]) : parseScalar(raw);
  }

  return { data, body: text.slice(m[0].length), hasFrontmatter: true };
}

/**
 * Validates a declaration. ⚠️ GATE: an invalid frontmatter MUST be RED.
 * Without that, a misspelt `match:` = a silent doc — today's bug,
 * just disguised in a new format. It is the whole point of the refactor.
 *
 * @returns {string[]} errors (empty = valid)
 */
const MODES = ['dumb', 'once', 'smart'];
// ⚠️ `driftUnit` (18/07/2026): the UNIT of the `smart` counter — `tool` (tool
//    calls, framework default) or `turn` (conversation turns, a counter
//    fed by the turn-count.js gate on UserPromptSubmit). SINGLE SOURCE
//    of the vocabulary (like MODES): gate.js, sources/mcp.js and sources/skill.js
//    import from HERE — never a 2nd list. Degenerate outside smart (dumb=0,
//    once=∞: the unit of a tick changes nothing there). Cascade of 4 LEVELS identical to
//    mode/threshold, resolved ONLY in gate.js: entry > `defaults.{source}`
//    > global (`defaultDriftUnit`) > framework default 'tool'.
// 🛑 THIS LINE ANNOUNCED "3 levels" AND cited `skillDefaults` (fixed on
//    09/08/2026): level ② was added on 04/08 and `skillDefaults` DELETED the
//    same day, generalised into `defaults.skill`. Describing the CURRENT behaviour
//    with a dead key is teaching the opposite of the code — and here it touched
//    precisely the cascade that a caller got wrong (cf `cascade-source-gate`).
const DRIFT_UNITS = ['tool', 'turn'];
// ⚠️ `threshold` (17/07/2026): the smart threshold PER DOC — the author proposes, the config
//    disposes (same philosophy as `mode`). Read by gate.thresholdForDoc (file)
//    and sources/mcp.declFor (MCP). Integer ≥ 1: a threshold of 0 = permanent
//    re-injection in disguise (that is the role of `mode: dumb`, not of a threshold).
// ⚠️ `note` (04/08/2026) — THE ONLY FIELD THE ENGINE NEVER READS.
//    Addressee = the agent (or the human) who comes to MODIFY this doc, not
//    the one who acts: "why this `mode`, why this `scope`, to be re-checked
//    after such-and-such version". It is invisible to the injection BY CONSTRUCTION —
//    the whole frontmatter is removed from the emitted body (sealed by a dedicated test,
//    never by goodwill alone).
//
// 🛑 A BOUNDARY, NEVER to be crossed: `note` carries ONLY meta about the SETTING.
//    NEVER the WHY OF AN INVARIANT — that one must stay in the body,
//    visible to the agent who acts: an invariant deprived of its reason DRIFTS (the
//    next person does not see what they are breaking and works around it). The risk is not
//    technical, it is GRAVITATIONAL: as soon as an invisible zone exists, the
//    "why" migrates there because it is long and "in the way". Maintainer
//    decision of 03/08/2026, kept as is.
//
// ⚠️ The engine must NEVER depend on it: no decision, no matching,
//    no sorting. The day a source read it, it would be a config field
//    disguised as a comment — hence a 2nd truth.
const KNOWN = ['match', 'mcp', 'rules', 'tool', 'inject', 'scope', 'exclude', 'keys', 'mode', 'rank', 'threshold', 'driftUnit', 'note', 'enforce'];

// ⚠️ `keys` — WHICH PARAMETER KEYS THIS ENTRY IS ALLOWED TO SEE.
//    The other operators say WHAT to look for; this one says WHERE to look. Until now that
//    universe was a GLOBAL constant (`harness-profile.js`: pathKeys/commandKeys/contentKeys),
//    hence identical for every doc of the fleet — an entry could not say "for me, ignore
//    this parameter". `contentKeys` proved the need at the global scale (55 exclusions were
//    decided by CONTENT alone); this is the same need, expressed per entry.
// 🛑 ONE WORD, TWO FORMS — never two words (anti-synonym law §8), exactly like `scope` (㊺①):
//    ["file_path"]  = WHITELIST — the universe is REDUCED to these keys
//    ["-command"]   = BLACKLIST — these keys are REMOVED from the universe
//    MIXED = REFUSED. The danger of this extension was never the limit, it is AMBIGUITY:
//    whoever writes ["file_path", "-command"] means something no reader can decide.
const KEY_REMOVE = '-';

// ⚠️ `inject: never` — SILENCE BECOMES A DECLARATION, never an oversight.
//    MEASURED on 15/07/2026: 14 docs out of 306 are targeted by NO rule.
//    MOST are deliberate (doctrine: `*-reference.md` on-demand,
//    a `route.ts` pattern too generic → no pattern). BUT a doc
//    deliberately mute and a doc whose pattern was FORGOTTEN are
//    STRICTLY indistinguishable: two silent files.
//    With this key, `never` = decided (green) and nothing = forgotten (RED).
//    ⚠️ ONLY admitted value: `never`. No `always`/`auto` — that would be a
//    2nd way of saying what `match:`/`mcp:` already say (two truths = drift).
const INJECT = ['never'];

// ⚠️ TRIGGERS OF THE FILE CORPUS — DISJOINT SEMANTICS, NEVER MERGE THEM.
//    `match:` → substring on the PATH (`path.includes(pattern)`).
//    `rules:` → same but PER ENTRY (divergent scopes).
//    `tool:`  → EXACT name of a native TOOL (===), never a substring.
//
//    ⚠️ The MCP channel HAS NO key here: an MCP doc is triggered by its
//    PATH (`docs/mcp/{server}.md`) and is validated by `validateMcp`. `mcp:` was
//    REMOVED from the triggers on 31/07/2026 (§A) — it was accepted and
//    inert, so it certified mute docs.
//    ⚠️ A SINGLE matching key would be AMBIGUOUS: `match: stripe` = the file
//    `stripe-config.js` OR the MCP server `stripe`? Both → the MCP doc
//    would go out while editing a file. Merging the ENGINES ≠ merging the
//    SEMANTICS. Each source reads ITS key. Cf REFACTOR-PLAN.md, decision 7.
// ⚠️ `rules:` = 3rd trigger, a FILE source like `match:`, but PER ENTRY:
//    inline JSON list of objects {pattern, scope?, exclude?}. It exists because it was
//    MEASURED (16/07/2026): 31 docs out of 103 multi-rule ones have DIVERGENT
//    scopes/excludes between their rules — unrepresentable with ONE scope per doc.
//    `rules` + (`match`/`scope`/`exclude`) = CONTRADICTION (two truths = drift).
// ⚠️ `tool:` = 4th trigger (19/07/2026): EXACT name of a NATIVE TOOL of the
//    harness (WebFetch, WebSearch…) — the measured blind spot of tools without
//    a path or an mcp__ prefix. DISJOINT semantics (=== on tool_name, never
//    a substring): cf sources/tool.js. String or list, same shape as `match`.
// ⚠️ `mcp` IS NOT A TRIGGER — removed on 31/07/2026 (REFACTOR-PLAN §A).
//    It was there by inheritance from a time when we imagined triggering the
//    MCP channel by frontmatter. That is NOT what was built: an MCP doc
//    is triggered by its PATH (`docs/mcp/{server}.md`) and is validated by
//    `validateMcp` (which only admits mode/threshold/driftUnit).
//    ⚠️ MEASURED CONSEQUENCE before the removal: `validate()` answered 0 ERROR on
//    a doc of the FILE corpus carrying `mcp:` — a KNOWN key, hence accepted, and
//    yet consumed by NO source ⇒ a MUTE doc, a happy validator.
//    That is WORSE than a typo (`mach:` = rejected): a validator that approves
//    dead code is not neutral, it actively points at the wrong cause (on
//    31/07 it made the ENGINE be accused of not reading the commands).
//    ⚠️ Verified before the removal: 0 doc of the fleet (344) carried `mcp:` — no
//    existing behaviour changed. Sealed by `triggers-gate.test.js`: every
//    trigger of this list MUST be proven consumed by a real source.
const TRIGGERS = ['match', 'rules', 'tool'];

// ⚠️ `*` = WILDCARD of the TOOL axis (31/07/2026, §B/§B0). A special VALUE, NOT an
//    operator: the boolean base stays CLOSED (no word added).
//    SINGLE SOURCE of the symbol (like MODES/DRIFT_UNITS) — `sources/tool.js`
//    imports it from HERE. Two '*' literals = two truths that diverge.
const WILDCARD = '*';

// ⚠️ READING of the `tool:` declaration (string OR list) — this is PARSING,
//    so its place is HERE, not in the source that matches. `sources/tool.js`
//    imports it: two readings of the same key would eventually diverge (one day
//    one would accept a case the other refuses, silently).
function toolList(data) {
  if (typeof data.tool === 'string') return [data.tool];
  return Array.isArray(data.tool) ? data.tool : [];
}

// ⚠️ `match` accepts a STRING **or** A LIST — not a whim of flexibility:
//    measured on 15/07/2026, 98 of the 288 real docs are targeted by SEVERAL patterns
//    (one same doc, several files). Accepting only a string would reject a
//    third of the fleet. Verified on the real rules, never assumed.
function isMatchDecl(v) {
  if (typeof v === 'string') return v.trim() !== '';
  return Array.isArray(v) && v.length > 0 && v.every((p) => typeof p === 'string' && p.trim() !== '');
}

// ⚠️ `Stryker disable StringLiteral` on the WHOLE body: the error labels are
//    COMMUNICATION, not behaviour — `validate` returns a non-empty list
//    whatever the text. Mutating them produces EQUIVALENT mutants that only a
//    test coupled to the exact label would kill (fragile: breaks at the slightest rewording).
//    ⚠️ NEVER extend this disable beyond the StringLiterals: the validation
//    LOGIC itself MUST stay mutated (it is the gate that decides whether a doc lives).
// Stryker disable StringLiteral
// ⚠️ A `rules` entry = {pattern, scope?, exclude?} and NOTHING else — an unknown key
//    in an entry = RED (a silent `patern:` = a dead rule, the bug we kill).
// ⚠️ `rank` PER ENTRY: needed for INTERLEAVED docs (measured 16/07/2026: 23 docs
//    whose rules are scattered through the JSON among those of OTHER docs — a group
//    rank would invert the evaluation order, 1 real divergence caught by the
//    loader differential). Each rule keeps its exact JSON index.
const RULE_KEYS = ['pattern', 'scope', 'exclude', 'keys', 'rank'];

// ⚠️ SHAPE OF `keys`, VALIDATED IN A SINGLE PLACE — consumed by the FLAT frontmatter AND by
//    the `rules` entries, exactly like `scopeFormError`. Two shape declarations diverge
//    silently (class ㊴: a gate probing a key's PRESENCE never sees its FORM).
// 🛑 MIXED REFUSED: `["file_path", "-command"]` is not "interpreted", it is REFUSED — nobody
//    can decide whether the author meant "only file_path, minus command" (contradictory) or
//    "everything except command, plus file_path" (redundant). An engine that guesses here
//    would guess in the direction that CHANGES what is injected, silently.
// ⚠️ An EMPTY list is refused too: a whitelist of nothing makes the entry mute FOREVER, and a
//    mute rule is indistinguishable from a forgotten one — the very defect this file kills.
const KEY_AXES = ['match', 'scope', 'exclude'];

function keysListError(v, where) {
  if (!Array.isArray(v) || v.length === 0) return `\`${where}\` must be a NON-EMPTY list of key names`;
  if (!v.every(usefulString)) return `\`${where}\`: every entry must be a non-empty string`;
  const removals = v.filter((k) => k.startsWith(KEY_REMOVE));
  // 🔴 THE MIXED FORM IS ADMITTED SINCE 20/08/2026, and the refusal was the real hole.
  //    Reading rule, decidable by looking: **a `-` present ⇒ you ADJUST the default universe
  //    (minus the removals, plus the bare names) · no `-` ⇒ you REPLACE it.** Before, "the
  //    default plus this one key" could only be written by re-enumerating the whole
  //    universe BY HAND — an enumeration, hence born stale: the day the profile gains a
  //    key, every such entry silently stops following it (class ㊽, reintroduced by a
  //    validator that meant well). The old argument ("nobody can decide what the author
  //    meant") only held while the rule was unwritten; it is written now, in one line.
  if (removals.some((k) => k.slice(KEY_REMOVE.length).trim() === '')) {
    return `\`${where}\`: \`${KEY_REMOVE}\` alone names no key`;
  }
  return null;
}

// ⚠️ TWO FORMS, and the second is what makes it MOLECULAR:
//    ["-command"]                     → the SHORTCUT: the same universe for all three axes
//    {match: [...], scope: [...]}     → PER AXIS: each operator gets its own universe
//    An axis left out keeps the profile's default universe — omission is never a restriction.
// 🛑 WHAT IS REFUSED IS THE AMBIGUOUS, NEVER THE UNUSUAL. A list that is half whitelist and
//    half blacklist expresses nothing a reader can decide; every other combination — however
//    exotic — is the author's to make. The language does not protect anyone from their intent.
// ⚠️ KNOWN CONSEQUENCE OF SPLITTING `scope` AND `exclude` (㊼): they are duals over ONE
//    universe (`¬(∃c : m ⊑ c) ≡ ∀c : m ⋢ c`). Give them DIFFERENT universes and `exclude`
//    stops being a true "for all" — it becomes bypassable by the way a command is written,
//    which is the 53 KB leak of 14/08/2026. Doing it deliberately is legitimate and VISIBLE
//    in the entry; doing it by accident is what the engine used to do, silently. That is the
//    whole difference, and it is why this is a WARNING in the code and not a refusal.
function keysFormError(v, where) {
  if (Array.isArray(v)) return keysListError(v, where);
  // ⚠️ `Object(v) !== v` = "it is NOT an object", in ONE expression — same form as the engine
  //    (`sources/file.js`), same reason: `!v || typeof v !== 'object'` carries a conjunction
  //    whose halves no test can separate once arrays are already out, hence eternal survivors.
  //    Equivalence is eliminated BY CONSTRUCTION here, never tested.
  if (Object(v) !== v) return `\`${where}\` must be a list [a, b] or an object {${KEY_AXES.join(', ')}}`;
  const axes = Object.keys(v);
  if (axes.length === 0) return `\`${where}\`: empty object — name at least one axis (${KEY_AXES.join(', ')})`;
  const unknown = axes.find((axis) => !KEY_AXES.includes(axis));
  if (unknown) return `\`${where}\`: unknown axis \`${unknown}\` (known: ${KEY_AXES.join(', ')})`;
  // ⚠️ `find(Boolean)` and not a loop with `if (e) return e`: the guard was an EQUIVALENT
  //    mutant (returning a null error changes nothing). The FIRST error is returned, so the
  //    author fixes one thing at a time instead of reading a wall.
  return axes.map((axis) => keysListError(v[axis], `${where}.${axis}`)).find(Boolean) || null;
}

// ⚠️ ㊺① — THE SHAPE OF `scope`, VALIDATED IN A SINGLE PLACE (here), consumed by the
//    FLAT frontmatter **and** by the `rules` entries. The JSON schema of the skills is
//    its MIRROR: two shape declarations that diverge = class ㊴, and
//    it goes UNNOTICED (a gate that probes the PRESENCE of a key does not see its
//    SHAPE). The symmetry gate ③ of frontmatter.test.js confronts the two.
// 🛑 **MIXED FORBIDDEN**: `["a", ["b"]]` is REFUSED, not "interpreted". The danger
//    of this extension is not the limit but the AMBIGUITY — accepting both
//    forms in one same list would make the author's intent undecidable.
const usefulString = (s) => typeof s === 'string' && s.trim() !== '';
function scopeFormError(v, ou) {
  if (!Array.isArray(v)) return `\`${ou}\` must be a list [a, b]`;
  if (v.every(usefulString)) return null; // FLAT FORM = a single group = OR (inherited, untouched)
  if (v.every((g) => Array.isArray(g))) {
    // GROUPED FORM = AND of ORs. An EMPTY group would be satisfied by nothing ⇒ the
    // rule would be mute FOREVER, silently: exactly what this validator kills.
    if (v.some((g) => g.length === 0 || !g.every(usefulString))) {
      return `\`${ou}\`: each group must be a NON-EMPTY list of non-empty strings`;
    }
    return null;
  }
  return `\`${ou}\`: MIXED forms. Choose — ["a","b"] = a OR b · [["a"],["b"]] = a AND b · [["a","b"],["c"]] = (a OR b) AND c`;
}
function isRulesDecl(rules) {
  const errs = [];
  if (!Array.isArray(rules) || rules.length === 0) {
    // ⚠️ SELF-REPAIRING message (paved-road): it gives the CANONICAL format ready to paste —
    //    trap #1 is writing `rules:` as a YAML block (`- pattern:`) instead of inline
    //    JSON. Descriptive is not enough: give the exact example to copy (lived 19/07).
    errs.push('`rules` must be a non-empty INLINE JSON list. Copy this format: rules: [{"pattern":"foo.js"},{"pattern":"bar.js","scope":["project"]}]  (NOT a YAML block `- pattern:`)');
    return errs;
  }
  rules.forEach((r, i) => {
    if (!r || typeof r !== 'object' || Array.isArray(r)) {
      errs.push(`\`rules[${i}]\` must be an object {pattern, scope?, exclude?}`);
      return;
    }
    if (typeof r.pattern !== 'string' || r.pattern.trim() === '') {
      errs.push(`\`rules[${i}].pattern\` missing or empty — the rule would NEVER match`);
    }
    // ⚠️ `scope` admits the GROUPED form (㊺①); `exclude` does NOT — it is ∀¬ over a
    //    SINGLE universe (㊼), an "AND of ORs" would make no sense to express there.
    if ('scope' in r) {
      const e = scopeFormError(r.scope, `rules[${i}].scope`);
      if (e) errs.push(e);
    }
    if ('exclude' in r && !(Array.isArray(r.exclude) && r.exclude.every(usefulString))) {
      errs.push(`\`rules[${i}].exclude\` must be a list of non-empty strings`);
    }
    // ⚠️ SAME shape as the flat form, SAME validator — a per-entry copy would drift (㊴).
    if ('keys' in r) {
      const e = keysFormError(r.keys, `rules[${i}].keys`);
      if (e) errs.push(e);
    }
    if ('rank' in r && typeof r.rank !== 'number') {
      errs.push(`\`rules[${i}].rank\` must be a number`);
    }
    for (const k of Object.keys(r)) {
      if (!RULE_KEYS.includes(k)) errs.push(`\`rules[${i}]\`: unknown key \`${k}\` (known: ${RULE_KEYS.join(', ')})`);
    }
  });
  return errs;
}

function validate(data) {
  const errs = [];

  // ⚠️ "AT LEAST ONE trigger", NEVER "`match` mandatory": an MCP doc
  //    (docs/mcp/stripe.md) has NO file to match — requiring `match` would
  //    reject it. Symmetrically a file doc has no `mcp`.
  //    ⚠️ BUT zero triggers MUST stay RED: it is THE whole point of the
  //    refactor (a doc without a trigger = a doc dead in silence, the bug we kill).
  const declares = TRIGGERS.filter((k) => k in data);
  const silenceDeclare = data.inject === 'never';
  // ⚠️ `mcp:` in a doc of the FILE corpus = an INERT TRIGGER (§A): a DEDICATED
  //    message that says WHERE the doc should have gone, never a dry "unknown key".
  //    A validator that refuses must make the author autonomous (paved road) —
  //    otherwise it moves the wasted time instead of removing it.
  const inertMcp = 'mcp' in data;
  if (inertMcp) {
    errs.push('`mcp:` triggers NOTHING here: an MCP doc is triggered by its PATH (`docs/mcp/{server}.md`), never by a frontmatter key. Move the file, and keep only mode/threshold/driftUnit inside it.');
  }
  // ⚠️ `!mcpInerte`: the dedicated message above is enough — stacking "no
  //    trigger" on top would drown the only useful line.
  if (declares.length === 0 && !silenceDeclare && !inertMcp) {
    // ⚠️ This message must NO LONGER advise `mcp` (fixed 31/07/2026): the key
    //    is now REJECTED (§A). Advising a forbidden key sends the author
    //    straight into the next wall — a validator must make you autonomous, otherwise it
    //    moves the wasted time instead of removing it. Sealed by a test.
    errs.push('no trigger: you need `match` (path), `rules` (per-entry paths) and/or `tool` (exact name of a tool) — without one the doc will NEVER be injected. An MCP doc, for its part, is triggered by its PATH (`docs/mcp/{server}.md`), not by a key. If the silence is INTENDED (reference doc), declare it: `inject: never`.');
  }
  for (const k of declares) {
    if (k === 'rules') continue; // validated by isRulesDecl below (per-entry structure)
    if (!isMatchDecl(data[k])) {
      errs.push(`\`${k}\` empty or badly typed (non-empty string or list) — without it the doc will NEVER be injected`);
    }
  }
  // ⚠️ BARE WILDCARD = REFUSED (31/07/2026, §B). `tool: ["*"]` WITHOUT `scope` or
  //    `exclude` would inject the doc on EVERY tool call of EVERY agent —
  //    permanent noise, and a system that injects wrongly ends up ignored.
  //    The wildcard exists to say "whatever the tool, WHEN this": the
  //    filter is not a comfort, it is half of the expression.
  //    ⚠️ A doc to be injected truly everywhere already has its channel: `docs/session/`.
  if ('tool' in data && toolList(data).includes(WILDCARD)) {
    const aScope = Array.isArray(data.scope) && data.scope.length > 0;
    const aExclude = Array.isArray(data.exclude) && data.exclude.length > 0;
    if (!aScope && !aExclude) {
      errs.push('`tool: ["*"]` without `scope` or `exclude`: the doc would be injected on EVERY tool call. Add `scope` (what the command does) or `exclude` (the tools to set aside). For a truly universal doc, use `docs/session/`.');
    }
  }
  // ⚠️ `rules`: STRUCTURAL per-entry validation. A shaky entry (missing pattern,
  //    unknown key, non-list scope) = a dead doc or a silent over-match —
  //    the same class of bug as `mach:`. RED, never tolerated.
  if ('rules' in data) {
    for (const e of isRulesDecl(data.rules)) errs.push(e);
    for (const k of ['match', 'scope', 'exclude']) {
      if (k in data) {
        errs.push(`\`rules\` contradicts \`${k}\` — the per-entry rules ALREADY carry pattern/scope/exclude, two truths = drift`);
      }
    }
  }
  // ⚠️ `inject: never` + a trigger = CONTRADICTION, not a precedence to
  //    invent. Guessing who wins would put back the implicit that this
  //    key exists to remove. The author decides, the machine refuses.
  if (silenceDeclare && declares.length > 0) {
    errs.push('`inject: never` contradicts `' + declares.join('`/`') + '` — a doc is triggered OR deliberately mute, never both');
  }
  if ('inject' in data && !INJECT.includes(data.inject)) {
    errs.push(`\`inject\` invalid: ${data.inject} (only admitted value: ${INJECT.join('|')})`);
  }
  if ('scope' in data) {
    const e = scopeFormError(data.scope, 'scope');
    if (e) errs.push(e);
  }
  // ⚠️ `exclude` = a list of STRINGS, strictly — NO grouped form (㊼: it is
  //    ∀¬ over a SINGLE universe, an "AND of ORs" would have no semantics there).
  // 🛑 The check was `Array.isArray` ALONE until 14/08/2026: `exclude: [["a"]]`
  //    got through and "worked" BY ACCIDENT (`norm(["a"])` returns `"a"`). A form that
  //    works by accident is a form we will one day find broken, with no test.
  if ('exclude' in data && !(Array.isArray(data.exclude) && data.exclude.every(usefulString))) {
    errs.push('`exclude` must be a list of non-empty strings [a, b]');
  }
  // ⚠️ `keys` restricts the UNIVERSE the operators read; it triggers nothing on its own.
  //    Declared ALONE it would be INERT — and an inert key is indistinguishable from a
  //    working one, which is the whole class of defects this validator exists to kill.
  if ('keys' in data) {
    const e = keysFormError(data.keys, 'keys');
    if (e) errs.push(e);
    else if (declares.length === 0 && !('scope' in data) && !('exclude' in data)) {
      errs.push('`keys` alone changes NOTHING: it narrows WHERE `match`/`scope`/`exclude` look. Add the operator it is meant to restrict.');
    }
  }
  for (const e of cadenceErrors(data)) errs.push(e);
  for (const e of noteErrors(data)) errs.push(e);
  if ('rank' in data && typeof data.rank !== 'number') errs.push('`rank` must be a number');
  // ⚠️ Unknown key = an ERROR, never silently ignored: `mach:` instead of `match:`
  //    would otherwise go unnoticed and the doc would be dead without anyone knowing.
  for (const k of Object.keys(data)) {
    if (!KNOWN.includes(k)) errs.push(`unknown key: \`${k}\` (known: ${KNOWN.join(', ')})`);
  }
  return errs;
}
// Stryker restore StringLiteral

// ⚠️ THE ONLY authority on "healthy MCP doc frontmatter?" (docs/mcp/*.md) —
//    shared by config-gate.test.js (repo gate) AND doc-write-guard.js
//    (real-time feedback). Two copies of this judgement = guaranteed divergence.
//    An MCP doc is triggered by its PATH: only mode/threshold make sense.
// Stryker disable StringLiteral: labels = communication (cf validate).
function validateMcp(data) {
  // ⚠️ LOCAL const (not module-level): an array at module level = a STATIC
  //    mutant outside the perTest mapping → a guaranteed survivor. Here, covered.
  const MCP_KEYS = ['mode', 'threshold', 'driftUnit', 'note', 'enforce'];
  const errs = [];
  for (const k of Object.keys(data)) {
    if (!MCP_KEYS.includes(k)) errs.push(`unknown key for an MCP doc: \`${k}\` (admitted: ${MCP_KEYS.join(', ')})`);
  }
  for (const e of cadenceErrors(data)) errs.push(e);
  for (const e of noteErrors(data)) errs.push(e);
  return errs;
}
// Stryker restore StringLiteral

// ⚠️ SINGLE SOURCE of the CADENCE judgement (mode/threshold/driftUnit) — shared
// by validate (file docs) AND validateMcp (MCP docs). Extracted on
// 18/07/2026 on a jscpd signal: two copies of this judgement = guaranteed
// divergence (the class of bug this repo kills).
// Stryker disable StringLiteral: labels = communication (cf validate).
// ⚠️ `note` = an AUTHOR's comment, never control. Validated on its FORM
// only (text, or a list of texts for several remarks): validating its
// CONTENT would amount to giving it a meaning, hence turning it into config.
// ✅ MULTI-LINE YAML BLOCKS (`|`, `>`) — TRAP CLOSED on 06/08/2026, in `parse()`.
//    It already was when this paragraph still announced "KNOWN TRAP, NOT
//    SEALED" and "as long as it is not done, the safe form remains the INLINE
//    LIST" (fixed on 09/08/2026). The defect: `note: |` followed by indented
//    lines returned `note === "|"` and LOST those lines silently.
// 🛑 A COMMENT DESCRIBING AN ALREADY-DONE JOB COSTS TWICE: it pushes you
//    to work around a trap that no longer exists (hence to write worse code), and it
//    sends you searching the REFACTOR-PLAN for a closed entry. The fix lived TWENTY
//    LINES above, in the same file.
//
// 🛑 A GUARD WAS ATTEMPTED HERE THEN REMOVED THE SAME DAY — do not do it
//    again as is. It rejected any value equal to `|`, and the CI (property-test
//    `migrate.property`, ROUND-TRIP) turned it RED within minutes:
//    `match: "|"` is a LEGITIMATE pattern. AT THIS LAYER, `key: |` (block) and
//    `key: "|"` (literal pipe) are STRICTLY indistinguishable — both
//    are worth the string `"|"`. A guard that cannot distinguish forbids the healthy.
//
// ✅ THE FIX LIVES IN `parse()`, the only place that sees the TEXT: a real block =
//    a `|`/`>` value AND a following indented line. `note: |` multi-line is therefore
//    SUPPORTED — the inline list is still possible, it is no longer a workaround.
// 🛑 THIS BOUNDARY, THOUGH, STILL HOLDS: the parser is a DELIBERATE SUBSET of YAML
//    (cf the header). `|`/`>` were added because they LOST data
//    silently, never out of a taste for covering the spec. Any other
//    extension (anchors, refs, YAML-block lists) stays FORBIDDEN.
function noteErrors(data) {
  if (!('note' in data)) return [];
  const v = data.note;
  if (typeof v === 'string') return [];
  if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return [];
  return ['`note` must be a text, or a list of texts'];
}

function cadenceErrors(data) {
  const errs = [];
  if ('mode' in data && !MODES.includes(data.mode)) {
    errs.push(`\`mode\` invalid: ${data.mode} (expected: ${MODES.join('|')})`);
  }
  if ('threshold' in data && !(Number.isInteger(data.threshold) && data.threshold >= 1)) {
    errs.push(`\`threshold\` must be an integer >= 1 (received: ${JSON.stringify(data.threshold)})`);
  }
  if ('driftUnit' in data && !DRIFT_UNITS.includes(data.driftUnit)) {
    errs.push(`\`driftUnit\` invalid: ${data.driftUnit} (expected: ${DRIFT_UNITS.join('|')})`);
  }
  // ── `enforce` (05/08/2026): the doc REFUSES the tool instead of informing it ──
  // ⚠️ A BOOLEAN with THREE effects, and `false` is NOT noise: absent = INHERITS
  //    from the level above (defaults.{source}), `false` = CANCELS that inheritance.
  //    Without an explicit value, a category moved to `enforce` would be
  //    UN-OPT-OUT-ABLE — the classic dead end of any cascading system.
  if ('enforce' in data && typeof data.enforce !== 'boolean') {
    errs.push('`enforce` must be true or false');
  }
  // ⚠️ `enforce` FOLLOWS THE CADENCE — it has NO rhythm of its own (maintainer
  //    decision 05/08/2026, and he was right against my first version).
  //    The block happens exactly WHEN the doc injects, because it is
  //    the same condition. And there is NO loop: injecting marks the doc as seen
  //    AND resets its counter to zero, so the call the agent redoes right after
  //    has nothing left to deliver and PASSES.
  //      `once`  → blocks once per session, then never again.
  //      `smart` → blocks, passes right away, then re-blocks once after N
  //                calls of other tools. Perfectly coherent, NOT a trap.
  //
  //      `dumb`  → block / pass / block / pass… alternating.
  // ⚠️ NO combination is forbidden, and that is NOT an oversight: the
  //    anti-loop guarantee lives in `gate.js` in the form of ALTERNATION (a
  //    block is never followed by a block), not in the form of a ban.
  //    A writing rule that rejected `dumb` would cripple the language without
  //    protecting anything more. Do NOT reintroduce one.
  return errs;
}
// Stryker restore StringLiteral

module.exports = { parse, validate, validateMcp, isMatchDecl, isRulesDecl, toolList, MODES, DRIFT_UNITS, KNOWN, TRIGGERS, INJECT, RULE_KEYS, WILDCARD, KEY_REMOVE, KEY_AXES };
