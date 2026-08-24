---
match: operator-consumption-gate.test.js
mode: dumb
---

# operator-consumption-gate.test.js — "declared" must mean "consumed", ON EVERY DIMENSION

🔴 **BORN OF THE SAME DEFECT SHIPPED TWICE**: ㊴ (12/08 — `scope`/`exclude` ignored on the skills' `servers` dimension) then `keys` (19/08 — **inert on 8 fleet skill entries out of 8**, on the `match` form, the only one anyone uses). Both times: validator green, schema green, 959 tests green, 100 % mutation green.
🛑 **THE CAUSE IS A MISSING JUDGE, NEVER A FORGOTTEN LINE.** `triggers-gate` proves a TRIGGER is consumed; NOTHING proved a NARROWING operator was — and above all nothing proved it **dimension by dimension**. An operator is declared ONCE and consumed in N places; only the places count.
⚠️ **THE OPERATOR LIST IS DERIVED FROM `RULE_KEYS`**, never copied: a future operator joins the table BY ITSELF and lands red until someone proves it is consumed. Check ⓪ forces every per-rule key to be classified (narrowing, or excluded WITH a reason) — adding a key without deciding is impossible.
🔴 **THE CELLS GO THROUGH THE REAL ROAD (frontmatter text → `loader` → rules → decision), NOT through literal rule objects** — and that distinction found the WORST hole of the 19/08 delivery: `loader.rulesOfDecl` dropped `keys` in BOTH branches, so the operator was alive in every test and **INERT in every real doc of the corpus**. A first version of this very gate missed it, because it built its rules by hand. **An operator proven on a literal rule is not proven at all.**
⚠️ **PROBED BY BEHAVIOUR**: a cell passes if adding the operator CHANGES the engine's decision. A gate reading `skillRules` would have been written from the same wrong list as the code.
⚠️ **ANTI-VACUITY IS THE LOAD-BEARING PART**: every base case must ACTUALLY inject. Without it a broken probe (wrong tool name, atom nowhere) turns the whole table green while proving nothing — the failure mode of every negative test.
⚠️ `keys` needs a filter to bite on (it narrows the UNIVERSE the others read, it is not a filter itself) ⇒ its base carries a `scope`. Giving it an empty base would pass forever.
⚠️ Part ② states the MCP corpus REFUSES every narrowing operator — the honest check is not "it ignores them" but "it says so, loudly": that is what makes "accepted and inert" impossible there by construction.
🛑 NEVER silence a red by widening the table: a red says a DIMENSION dropped an operator. Seen turning red on the real defect (sabotage of `skillRules`, cell `skill/match` named).
