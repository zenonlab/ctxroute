---
match: mutation-plancher-gate
mode: dumb
---

# mutation-plancher-gate — Stryker's GLOBAL threshold is blind to one file collapsing

⚠️ **`thresholds.break` is an AVERAGE.** `canary.js` held **89.23 % with 7 survivors** while the global read 99.64 %: CI green, collapse invisible. This gate adds a **PER-FILE** floor — it does not replace `break`, it completes it (one protects the average, the other each module).
🛑 **FLOOR = 100, RATCHET NEVER LOWERED.** Measured reachable by the **16** mutated modules. A survivor is **KILLED** (targeted test) or **ELIMINATED** (dead code removed — that is what fixed `canary.js`: `occurrences()` had no caller). It is NEVER tolerated by lowering the number.
⚠️ **`Timeout` counts as KILLED** (Stryker contract) and **`Ignored` leaves the denominator** (deliberate `// Stryker disable`): without those two rules, the gate would go red on healthy code.
⚠️ **SILENT if `reports/mutation.json` is missing** — INTENDED: `npm test` does not run Stryker. Requiring it would make any suite red without a prior mutation run, hence a gate one stops reading. It bites in the mutation CI and after `npm run test:mutation`.
🛑 **Backlog lead ㉞ was WRONG**: "periodic full pass" — it already exists (`mutation.yml` restores no incremental cache, so it mutates EVERYTHING). The false green was LOCAL; the CI hole was the GRANULARITY of the verdict, not its frequency.
