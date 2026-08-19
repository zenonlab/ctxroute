# The ctxroute language — public reference (derived, never hand-copied)

⚠️ The `AUTO` blocks below are **generated from the engine's constants**
(`node language-doc.js --write`) and a gate fails if they drift. Never edit
them by hand. Prose carries judgement only — never a value or a behavior
(a copied fact drifts; a derived one cannot).

## What this language is

A **declarative, deliberately non-Turing-complete DSL** for programming
traceable context-injection workflows: you DESCRIBE when a piece of knowledge
must reach an agent's gesture (a tool call), the machine delivers it —
predictable and explainable. The domain is finite, so its expressiveness is
**proven by exhaustive enumeration**, not hoped: the expressible set is exactly
`{f | f(empty gesture) = false}` — complete, up to the load-bearing constraint
that nothing injects on a gesture that contains nothing (knowledge rides on
FACTS, never on guessed intent).

## The closed boolean base — three operators, never a fourth

- **Trigger** (`match` / `rules` / `tool`, or the doc's PATH on the MCP
  channel): ∃ — at least one pattern present fires the rule.
- **`scope`**: ∃ filter over ALL parameter values, at any depth. Two forms:
  flat list = OR · grouped `[["a","b"],["c"]]` = AND of ORs. Mixed forms are
  refused (ambiguity, not capability, is the danger).
- **`exclude`**: ∀¬ over all values ∪ the triggering context — the exact dual
  of `scope`. One motif present anywhere in the gesture ⇒ no injection.
- **`keys`** (orthogonal — it adds no connective): chooses WHICH parameter
  keys the three operators above may read at all. Flat list = the same
  universe for the three axes · `{match, scope, exclude}` = one per axis.
  A `-name` REMOVES a key from the default universe; a bare name REPLACES
  that universe entirely, so an entry may also WIDEN — reading a key the
  profile does not declare, payload keys included. "Replaces" is absolute
  and identical on the three axes: one declaration, one meaning.
  It never triggers on its own, and declaring it alone is refused.
- A motif matches **inside a single value**, never across two adjacent ones.
- Global target filter: `filterMode`/`filterList` (whitelist/blacklist over
  tool names, MCP server names, or `*`), cascading `defaults.{source}` >
  global — and every exclusion it makes is observable, never silent.

## Vocabulary (CLOSED — one concept, one word, everywhere)
<!-- AUTO:vocabulary -->
File doc keys: `match` · `mcp` · `rules` · `tool` · `inject` · `scope` · `exclude` · `keys` · `mode` · `rank` · `threshold` · `driftUnit` · `note` · `enforce`
`rules` entry keys: `pattern` · `scope` · `exclude` · `keys` · `rank`
Triggers: `match` · `rules` · `tool` · tool wildcard `*` · `inject: never` disarms
Unknown key ⇒ doc REJECTED (never silently ignored).
<!-- /AUTO -->

## Cadence
<!-- AUTO:cadence -->
`mode`: `dumb` · `once` · `smart` · `driftUnit`: `tool` · `turn`
Cascade: entry > `defaults.{source}` > global > framework default.
<!-- /AUTO -->
`dumb` = every gesture · `once` = once per context (reset at compaction) ·
`smart` = once, then re-inject after `threshold` foreign ticks (`driftUnit`).
`enforce: true` refuses the gesture instead of informing (a guardrail — the
gate is fail-open by contract, never a security boundary).

## Bounds (measured, announced when crossed)
<!-- AUTO:bounds -->
`scope` is BOUNDED: 20 nesting levels · 262144 characters.
Beyond that the value is truncated ⇒ `scope` goes mute — and `explain.js` says so.
<!-- /AUTO -->

## How it is proven (what an auditor should check)

- **Independent executable model** (`language-spec.js`, written from intent) +
  **exhaustive differential** against the real engine — all four sources
  covered, hundreds of thousands of cases per run.
- **Atoms table** (`language-atoms.test.js`): every source × projection ×
  operator cell probed by behavior; a blind cell without a written,
  dated justification is red.
- **Property-based laws** (monotonicity of `exclude`, writing-independence,
  flat/grouped `scope` parity) + **mutation testing at 100 %** with a
  per-file floor.
- **Harness conformity**: see `HARNESS-CONTRACT.md` — prove the contract on
  YOUR harness with `node doctor.js --harness <payload.json>`.
