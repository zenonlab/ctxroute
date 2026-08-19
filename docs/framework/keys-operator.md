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
