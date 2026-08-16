# The ctxroute language — derived from the CODE

🛑 **Authority = `src/sources/file.js` · `src/gate.js` · `src/frontmatter.js`. A doc that contradicts them is wrong** (2 false statements were born that way). Settle any doubt with `node tools/explain.js --doc <name> --tool X --input '{...}'` — never by re-reading prose, never by re-implementing the engine.

⚠️ **The `AUTO` blocks below are GENERATED from the code** (`node tools/language-doc.js --write`) and a gate fails if they drift. NEVER edit them by hand. The rest is prose: judgement, not facts — hence unverifiable by a machine, hence it must state NEITHER a value NOR a behavior.

## Vocabulary (CLOSED)
<!-- AUTO:vocabulary -->
File doc keys: `match` · `mcp` · `rules` · `tool` · `inject` · `scope` · `exclude` · `mode` · `rank` · `threshold` · `driftUnit` · `note` · `enforce`
`rules` entry keys: `pattern` · `scope` · `exclude` · `rank`
Triggers: `match` · `rules` · `tool` · tool wildcard `*` · `inject: never` disarms
Unknown key ⇒ doc REJECTED (never silently ignored).
<!-- /AUTO -->

## What each trigger SEES
`match` = substring over the PATHS + the POSIX shell command (`Bash`) + `apply_patch` — **never** all params · `rules` = same, per entry · `tool` = EXACT name (`===`); the wildcard is RED without `scope`/`exclude`. An MCP doc has no trigger: it starts from its PATH `docs/mcp/{srv}[/{tool}].md`. A skill starts from `config.skills` (`match`/`rules` + `servers` + `tool`). A `git ` command is ignored.

## Filters
`.includes()` after `norm()` (lowercase + backslashes→slashes).
- `scope`: union of **ALL** params at any depth. Never triggers on its own. **TWO FORMS (㊺①, 2026-08-14)**: `["a","b"]` = **a OR b** (historical form, unchanged) · `[["a","b"],["c"]]` = **(a OR b) AND c** — AND between GROUPS, OR inside. MIXED forms = **REFUSED** (the danger is not the limit, it is the ambiguity: whoever writes `["a","b"]` meaning "AND" gets a WIDER rule, silently).
- `exclude`: **∀¬ over ALL params ∪ the triggering context** (㊼, 2026-08-14) — EXACT dual of `scope`, same universe, complementary quantifier. A single pattern present ANYWHERE in the action ⇒ no injection. 🛑 It used to be evaluated **per candidate** (existential): a negation built like an assertion, **bypassable by how a command is written**.

<!-- AUTO:bounds -->
`scope` is BOUNDED: 20 nesting levels · 262144 characters.
Beyond that the value is truncated ⇒ `scope` goes mute — and `explain.js` says so.
<!-- /AUTO -->

✅ **EXPRESSIVENESS MEASURED, and above all CHARACTERIZED** (`language-completeness.test.js`, exhaustive enumeration on the real engine, 2026-08-14): the expressible set is **EXACTLY `{f | f(empty action) = false}`** — 0 missing, 0 extra. ⇒ **the language is COMPLETE**, up to a single STRUCTURAL constraint: *nothing injects on an action that contains nothing*, which is the project's load-bearing wall ("we only inject on FACTS"), not a hole. `A∧B∧C` ✅ (㊺①) · "not if ANOTHER param contains X" ✅ (㊼). 🛑 NEVER replace this line with a SENTENCE about expressiveness: a machine measures it, and it has already refuted a promise that lived for 3 weeks.

## Cadence
<!-- AUTO:cadence -->
`mode`: `dumb` · `once` · `smart` · `driftUnit`: `tool` · `turn`
Cascade: entry > `defaults.{source}` > global > framework default.
<!-- /AUTO -->
`dumb` = every action · `once` = once, reset at compaction · `smart` = plus re-injection after `threshold`. ⚠️ `threshold` is DEAD outside `smart`, and no gate says so. `enforce: true` ⇒ `deny`; a block is never followed by a block.

⚠️ **The injection lands AFTER the action** it targets (it protects the next one); only `enforce` stops one. Fail-open gate = a guardrail, never a security boundary.

⚠️ **A perimeter is proven by a REAL SPAWN**: 1 positive case + 1 negative one (a homonym from another project → silence). Never on trust.
