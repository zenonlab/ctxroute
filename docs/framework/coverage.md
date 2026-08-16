---
rules: [{"pattern":"coverage-gate.test.js","scope":["ctxroute"]}]
mode: smart
---
# coverage-gate.test.js — the repo documents itself, or it goes red
⚠️ 5 DERIVED parts (never a copied list — that would be the same bug): ① every root/`sources/` `.js` gets an injectable doc (measured via the REAL source) · ② every TRACKED file is in the skill's file tree · ③ every module is in dependency-cruiser's `includeOnly` · ④ **REMOVED 2026-08-03** (doc LENGTH ceiling) — the framework DELIVERS, it NEVER judges size: an over-heavy doc is CHUNKED and delivered (undeliverability impossible UNDER the total capacity of the N frames; beyond = leftover, cf. budget.md). Do NOT reintroduce it, the reason is engraved in the file · ⑤ **ALSO REMOVED 2026-08-03** (SKILL WEIGHT ceiling). Parts ①→③ remain ACTIVE.
⚠️ Born of an audit that found 5 omissions, 3 of them PRE-EXISTING (bare suites, files outside the tree, 4 modules never analyzed by dependency-cruiser — a silent false negative since their creation).
⚠️ **Part ③ = the most treacherous**: a module outside `includeOnly` makes the coupling gate GREEN by analyzing NOTHING.
🛑 **PART ⑤ REMOVED (2026-08-03) — its reactivation condition is OBSOLETE, not met.** It capped skill weight; it had been suspended on 08-02 "until skill auto-injection is proven". ⚠️ It NOW is (doctor + a 28 KB skill delivered in NUMBERED chunks) — re-reading that condition as-is would RESURRECT a size ratchet. A heavy skill IS delivered: its weight is no longer a defect. 🛑 **DOCTRINE: a skill injects IN FULL or NOT AT ALL** — NEVER advise splitting it.
⚠️ Parts ①② depend on the fleet/skill ⇒ skipped on a clean clone; ③ holds everywhere.
⚠️ NEVER remove a negative-check: a gate that cannot go red CERTIFIES instead of protecting (already experienced with `deadline-gate`, green by analyzing no real hook). The 3 remaining parts each have theirs.
