---
match: keys-operator.test.js
mode: dumb
---

# keys-operator.test.js — the CONTRACT of `keys` (the "WHERE to look" axis)

⚠️ **THE TWO HALVES ONLY MEAN SOMETHING TOGETHER**: citing a project in a command must STOP injecting it, AND working in it must STILL inject it. A suite proving only the first would certify a mute operator — that is how you ship an exclusion that silences the agents genuinely working in the repo (measured in July: 117 verdicts changed over 3,116 actions, ≥59 of them real work).
⚠️ Covers both forms (flat = the three axes · object = one universe per axis), the fact that a whitelist **WIDENS** (it REPLACES the universe, payload keys included), axis independence, and the anti-inertness cases.
⚠️ **RUNTIME ROBUSTNESS IS PART OF THE CONTRACT**, not a bonus: a hand-edited config is never validated, so a MIXED list must be read the MOST RESTRICTIVE way and a non-list `keys` must be INERT, never a throw. An engine that guesses must always guess in the direction that does NOT inject.
🛑 **THIS SUITE IS NOT THE JUDGE OF THE SEMANTICS.** It calls the engine, so it proves what the engine DOES. What it MUST do lives in `language-spec.js` + `spec-differential`, and in `language-atoms` / `operator-consumption-gate`. 🔴 On 19/08/2026 this suite was green, 100 % mutation was green, and the operator was still **inert on 8 fleet skill entries out of 8**, its whitelist half-blind and `cwd` unreachable. **Never take a green here for a proof that the operator acts.**
⚠️ Wired into `vitest.stryker.config.mjs` AND into `mutation.yml` `paths:` — a suite Stryker runs must trigger the workflow, otherwise the per-file floor is computed without it.
✅ **THE MIXED FORM IS ADMITTED SINCE 2026-08-20, AND THE REFUSAL WAS THE HOLE.** Reading rule, decidable by looking: **at least one `-` present ⇒ you ADJUST the default universe (minus the removals, plus the bare names) · no `-` at all ⇒ the list REPLACES the universe.** Before, "the default PLUS this key" was writable only by re-enumerating the whole universe by hand — an ENUMERATION, hence born stale: the day the profile gains a key, the entry stops following it IN SILENCE (class ㊽, reintroduced by a well-meaning validator). The old argument ("nobody can decide what the author meant") only held while the rule was UNWRITTEN.
⚠️ **What stays refused is what NAMES NOTHING**: a bare `-`, an empty list. A mute entry is indistinguishable from a forgotten one.
⚠️ **AN EMPTY LIST IS INERT, never a whitelist of nothing** — decision of 19/08 KEPT, but now STATED instead of falling out of the arithmetic (0 removals === 0 entries). `validate` refuses it, but a hand-edited config is never validated.
🔴 **`-command` NO LONGER MEANS "blind to the command" (2026-08-20)**: it drops the raw TEXT and KEEPS the directory designated by `cd X && …` (observable `commandCwd`). Measured: the previous reading destroyed 47.7 % of real work, the new one 5.5 %. A test in this suite asserted the OLD reading — that assertion WAS the defect, written down.
⚠️ **BOTH HALVES ARE PROVEN IN BOTH DIRECTIONS**: `-command` must let `cd project && ls` through, AND `-commandCwd` must cut a pattern that ONLY the reconstruction produces. Either cell alone would pass on an engine that ignores `-commandCwd` entirely — exactly the shape of the "accepted and inert" defect of 19/08.
