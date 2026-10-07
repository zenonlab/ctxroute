---
rules: [{"pattern":"silent-catch-gate.test.js","scope":["ctxroute"]},{"pattern":"no-silent-catch.yml","scope":["ctxroute"]},{"pattern":"silent-catch-budget.json","scope":["ctxroute"]}]
mode: smart
threshold: 40
---
# silent-catch-gate — no `catch` of `src/` swallows an error without a written reason (2026-10-04)

🔑 **DETECTION = `rules/no-silent-catch.yml`** (ast-grep, no exemption): a `catch` whose body calls none of `log.hookError` · `log.daemonError` · `log.write` and does not `throw`. **POLICY = this suite + `silent-catch-budget.json`**: per file, the exact count of declared silences and WHY each is the right answer.
🛑 **IF you write a `catch` in `src/`, you MUST either report** (`log.hookError('<hook>', err)` in a spawned hook or a shared module, `log.daemonError('<site>', err)` in the daemon) **or declare it in the budget with its reason**. A file absent from the budget is held at ZERO.
🛑 **EQUALITY RATCHET, BOTH WAYS**: more catches than declared = a new silence nobody judged; fewer = a dormant permit — lower `max` in the same commit that removes a silence. Never raise `max` without writing the reason.
⚠️ **Legitimate silences, and only these**: the caught case IS the expected answer (absent config ⇒ defaults, a file already gone, a value that is not JSON stays text, a probe answering null) · reporting is impossible (`log.js` itself, `lifecycle-log.js`, `lock.js` which `log.js` depends on — a require cycle) · frozen oracles (`legacy-mcp-inject.js`, `oracle.js`).
⚠️ **The receiver `log.` is NAMED in the rule on purpose**: `process.stdout.write(err)` in a catch reports to nobody, and a method-only match would let it pass (NEGATIVE cell, line 3).
⚠️ **Perimeter = `src/`**, stated in the budget: `tools/` and `service/` are operator-launched, their failures land on the operator's terminal.
✅ Seen RED 2026-10-04 both ways: a silent `catch` in a new `src/` file (not declared), and the reporting `catch` of `canary-check.js` made silent (count above the declaration). 📐 Measured that day: 155 swallowing catches across `src/`, `tools/` and `service/`; after the work, 77 declared silences in `src/`; the one known loss left unreported is the fail-open of `lock.js` (a require cycle, declared in the budget).
