---
rules: [{"pattern":"loader.js","scope":["ctxroute"]},{"pattern":"loader.test.js","scope":["ctxroute"]},{"pattern":"shadow-inject.js","scope":["ctxroute"]},{"pattern":"shadow-inject.test.js","scope":["ctxroute"]},{"pattern":"shadow-reconcile.js","scope":["ctxroute"]},{"pattern":"oracle.js","scope":["ctxroute"]}]
mode: dumb
---
# loader.js / shadow-*.js / oracle.js — shadow of the unified engine (RELIC — unwired 2026-07-17)

⚠️ `shadow-inject.js` = RELIC: unwired from settings.json on 2026-07-17 after the switchover (the doc-inject.js gate is LIVE). Do NOT rewire it — its role (rehearsal before switchover) is over. The code stays as a relic + its tests still run.
⚠️ If it ran: it NEVER INJECTS (empty stdout, full fail-open) — it only logs (`state/shadow-*.jsonl`). Making it emit hook JSON = injection in disguise.
⚠️ `loader.js` = PURE (frontmatter corpus → ordered rules): sort PER RULE (`rank` per entry for the 23 INTERLEAVED docs), docs without rank AFTER the ranked ones (alpha). Stryker-mutated 100%.
🔴 **`rulesOfDecl` IS THE ONLY ROAD FROM A WRITTEN FRONTMATTER TO A DECISION — AN OPERATOR MISSING THERE IS INERT IN THE WHOLE CORPUS.** Measured 19/08/2026: `keys` shipped with a schema, a validator, a dedicated suite, 959 green tests and 100 % mutation, and was DROPPED in BOTH branches (`match` and per-entry `rules`) ⇒ alive on every hand-built rule, i.e. in every test, and **dead in every real doc**. 🛑 **An operator proven on a literal rule object is not proven at all** — that is why `operator-consumption-gate.test.js` goes THROUGH this function (cells `corpus/frontmatter-*`), never through a rule written by hand.
⚠️ **`keys` is propagated WITHOUT a shape check**, unlike its neighbours: `keyDecision` is TOTAL (absent, string or null all mean "no narrowing"), so a guard would decide nothing and Stryker's "always assign" mutant would survive forever. The rule therefore ALWAYS carries the field, even `undefined` — and `loader.test.js` says so out loud in its expectations. Equivalent mutant eliminated by CONSTRUCTION, never tested.
⚠️ `oracle.js` = the ONLY reader of protect-files output (shared by differential + reconcile). Two parsers = two ways to lie (experienced 3× on 07-15).
⚠️ `shadow-reconcile.js` = switchover verdict (`node shadow-reconcile.js`): exit 1 at the 1st divergence, exit 2 if the log is EMPTY (dead shadow ≠ perfect shadow). OFFLINE only — never in the hot path.
Switchover DONE (2026-07-17) — history in REFACTOR-PLAN.md.
