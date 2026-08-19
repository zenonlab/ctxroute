# The ctxroute language — derived from the CODE

🛑 **Authority = `src/sources/file.js` · `src/gate.js` · `src/frontmatter.js`. A doc that contradicts them is wrong** (2 false statements were born that way). Settle any doubt with `node tools/explain.js --doc <name> --tool X --input '{...}'` — never by re-reading prose, never by re-implementing the engine.

⚠️ **The `AUTO` blocks below are GENERATED from the code** (`node tools/language-doc.js --write`) and a gate fails if they drift. NEVER edit them by hand. The rest is prose: judgement, not facts — hence unverifiable by a machine, hence it must state NEITHER a value NOR a behavior.

## Vocabulary (CLOSED)
<!-- AUTO:vocabulary -->
File doc keys: `match` · `mcp` · `rules` · `tool` · `inject` · `scope` · `exclude` · `keys` · `mode` · `rank` · `threshold` · `driftUnit` · `note` · `enforce`
`rules` entry keys: `pattern` · `scope` · `exclude` · `keys` · `rank`
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

## Choosing the operator (judgement — the facts are above and in `explain.js`)

**`keys` says WHERE the others look.** Every other operator asks WHAT to look for; this one
chooses which parameter keys of the gesture are even visible. Until 2026-08-19 that universe was
a single global constant, identical for the whole fleet — an entry could not say "for me, ignore
this parameter", and naming a project inside a shell command injected its skill exactly like
working in it. Flat list = the same universe for the three axes; object = one per axis. A name
prefixed with `-` REMOVES a key; without the prefix the list REPLACES the universe, so an entry
may also read a key the profile never declared.

⚠️ It NARROWS, it never triggers: declared alone it is refused, like `scope`. And what the
validator refuses is the AMBIGUOUS (a list half whitelist, half blacklist), never the unusual —
giving `scope` and `exclude` different universes is allowed, visible in the entry, and yours to
own.

Reach for a **PLACE** (`match`) only when the knowledge belongs to a file. For an **ACTION**, `match`
is the wrong door: it never sees what an MCP tool or a non-POSIX shell does. The operator that sees
every parameter is `scope`, and it never fires alone — so pair it with a trigger that depends on no
path. Enumerating tools stays possible but goes silent the day a shell or an MCP is added.

⚠️ **A skill is filtered by the SAME words as a doc** — `scope`/`exclude` apply to it too, on its
file dimension AND its `servers` one. The line above lists what TRIGGERS a skill; it does not list
what NARROWS it. Not knowing this makes a perimeter look unfixable when it is merely unwritten.

⚠️ **There is also a global, per-TARGET filter** (`filterMode`/`filterList` in the config, with a
`defaults.{source}` stage) — "never inject on these tools/servers" is a config question, not a
frontmatter one. Look there before concluding that a perimeter cannot be narrowed.

🛑 **A CITATION IS AN ACTION.** Naming a project inside a shell command — a commit message, a
heredoc, a path passed to a script — triggers its skill exactly like working in it: `match` reads
the command's TEXT, not the intent. Measured again on 2026-08-19: writing the name into a memory
file injected nothing, while the shell command that wrote it injected the whole skill.
⇒ Before blaming the engine, run `explain.js` on the REAL payload: the trigger is often not the
action you suspect, and an exclusion aimed at the wrong one changes nothing.
⚠️ And an exclusion that separates an INTENT (a verb, a way of phrasing a command) rather than a
PLACE has already been measured harmful here: it silenced agents genuinely working in the repo.
Prefer what a path can decide; measure any exclusion on REAL actions before keeping it.

## Cadence
<!-- AUTO:cadence -->
`mode`: `dumb` · `once` · `smart` · `driftUnit`: `tool` · `turn`
Cascade: entry > `defaults.{source}` > global > framework default.
<!-- /AUTO -->
`dumb` = every action · `once` = once, reset at compaction · `smart` = plus re-injection after `threshold`. ⚠️ `threshold` is DEAD outside `smart`, and no gate says so. `enforce: true` ⇒ `deny`; a block is never followed by a block.

⚠️ **The injection lands AFTER the action** it targets (it protects the next one); only `enforce` stops one. Fail-open gate = a guardrail, never a security boundary.

⚠️ **A perimeter is proven by a REAL SPAWN**: 1 positive case + 1 negative one (a homonym from another project → silence). Never on trust.
