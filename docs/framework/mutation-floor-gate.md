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
🔴 **LE CACHE INCRÉMENTAL MENT QUAND UNE *DÉPENDANCE* CHANGE — MESURÉ 19/08/2026, VAUT POUR TOUT LE PARC.** Local : `100.00 %, 0 survivant`. CI (clone vierge, donc sans cache) : `harness-conformance.js` à 99,25 %, **1 survivant**. Cause : ce fichier n'avait pas changé — seul `harness-profile.js` l'avait — et Stryker n'invalide pas les DÉPENDANTS d'un fichier modifié. Le survivant était un littéral `'cwd'` devenu redondant parce que le profil le déclare désormais : un mutant équivalent CRÉÉ par un changement d'un AUTRE fichier.
⚠️ ⇒ **Un vert local avec cache ne prouve rien dès qu'on touche une donnée partagée** (profil, constante, schéma). Le juge est un run sans cache (`rm reports/stryker-incremental.json`) OU la CI. 🛑 Ne PAS retirer `incremental: true` pour autant : il fait passer le run de ~1 h à ~1 min localement (mesuré ce jour : 2 360 mutants, estimation 1 h sans cache). On garde le cache POUR LA BOUCLE et on croit la CI POUR LE VERDICT — c'est exactement la division « détection async, pas prévention ».
