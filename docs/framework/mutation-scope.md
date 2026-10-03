---
match: [mutation-scope-pure.js, mutation-scope.js, mutation-scope-gate.test.js]
mode: smart
threshold: 30
---
# mutation-scope — two lists are decided, the rest is GENERATED (23/09/2026)

🔑 **A human decides TWO lists**: `stryker.conf.json` `mutate` (which modules are measured) and `vitest.stryker.config.mjs` `include` (which suites measure them). **Everything that only repeats them is generated**: the `paths:` block of `.github/workflows/mutation.yml` (between the `AUTO:mutation-scope` markers) and the `mutated-modules-must-stay-pure` rule of `.dependency-cruiser.json`.
🛑 **IF YOU ADD A MUTATED MODULE, YOU MUST**: add it to `mutate`, add its suite to `include`, add it to `includeOnly` (every `.js`, mutated or not), then run `node tools/mutation-scope.js --write`. `test/mutation-scope-gate.test.js` reddens if the last step is forgotten or a generated block is hand-edited.
🔴 **WHY**: it used to be FIVE hand edits, and the purity one had quietly stopped being written — MEASURED 23/09/2026, **25 of 55 mutated modules had no purity rule at all**. The generated rule now covers every mutated module; the deps-purity gate proves it can go red.
🛑 **A PURITY EXEMPTION IS WRITTEN WITH ITS REASON** in `purityExemptions()` (today: `src/kernel-endpoint.js`, it computes OS paths by design). An exemption for a module no longer mutated is REFUSED (dormant permit).
⚠️ **The independent models** (`language-spec.js`, `cadence-spec.js`) are in the workflow paths through `modelFiles()`: not mutated, yet they move the score of what is. A new model goes THERE, never into `mutate`.
⚠️ The workflow block is replaced ONLY between its markers; markers missing ⇒ NAMED REFUSAL, never a guess.
