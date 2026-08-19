---
match: observable-reach-gate.test.js
mode: dumb
---

# observable-reach-gate.test.js — CAN THE LANGUAGE SEE EVERY FACT THE HARNESS HANDS IT?

🔴 **EVERY DEFECT THIS PROJECT HAS EVER HAD IS THE SAME DEFECT**: ㊵ · 51 · ㊴ · ㊽ · ㊿ · 53bis · `keys` · `cwd` · `commandCwd` — **ALL of them are holes in WHAT THE LANGUAGE CAN SEE**, not one is a hole in how it COMBINES what it sees. This file measures that axis; nothing did before.
🛑 **COMPLETENESS WAS MEASURED ON THE WRONG AXIS.** `language-completeness` proves that over a FIXED universe every boolean function is expressible — the axis that has NEVER bitten. **Expressiveness = combinators × observables**: we proved one factor and concluded on the product. A true theorem, quoted without its hypothesis.
📐 **A UNIVERSE IS COMPLETE** when the language can DISCRIMINATE on every fact the harness delivers, **POSITIVELY and NEGATIVELY**, or when the cell is blind WITH ITS REASON. Mechanical test: ∃ a declaration D with `decide(D, gesture WITH o) ≠ decide(D, gesture WITHOUT o)`.
⚠️ **THE OBSERVABLE LIST IS DERIVED FROM THE CONTRACT** — `conformance({})` returns it as data (required + optional). A capability added there tomorrow lands in the table BY ITSELF and stays RED. 🛑 That derivation is the whole point: `language-atoms.test.js` guards the same class with a HAND-WRITTEN list — the "never a copied list" anti-pattern this repo forbids everywhere else.
✅ **IT PAID BEFORE THE NEED**: it found that the tool NAME is reachable NEGATIVELY (`exclude` sees it) but NOT POSITIVELY by substring ⇒ "every tool containing `delete`" can only be enumerated, and an enumeration is born stale (㊽). Blind cell DECLARED, decision open in REFACTOR-PLAN 59.
⚠️ **THE KEY FAMILIES ARE DERIVED TOO** (`harness-profile.js`): path keys, command keys, and the payload keys as a PAIR — blind by default (㊿), reachable the moment an entry names them (`keys`). 🔴 They were HAND-WRITTEN in this file's first version, the same day, by the same agent: the exact fault this file reproaches `language-atoms` with. Deriving both halves of the payload pair is what proves the default universe is **not a floor**.
⚠️ **HONEST SCOPE**: reach is measured RELATIVE TO THE DECLARED CONTRACT. A harness's universe is an EMPIRICAL fact about a third party — never derived. Drift between contract and reality is a SEPARATE, continuous measurement (`doctor --harness` on a real payload).
🛑 A blind cell with no written reason is a NAMED hole. "The engine does not do it" is not a reason — say why it MUST NOT.
✅ **THE 9th DEFECT OF THE FAMILY, FOUND AND CLOSED BY THIS TABLE (2026-08-20)**: a shell command carried TWO facts under ONE key — what it SAYS and where it WORKS. The combinators were complete and the distinction was still inexpressible, which is this file’s thesis stated once more. Three cells now hold it: each half reachable ALONE, plus a third proving the split is not one-way (without it, an engine ignoring `-commandCwd` would satisfy the other two).
⚠️ **A `sans` CASE IS BUILT WITH CARE, and the first attempt was WRONG**: every word after a `cd` becomes a pseudo-path, so putting the atom after the `cd` makes it reachable through the DESIGNATED half and the cell measures nothing. The atom must sit in a segment the reconstruction never reaches.
🛑 **THE UNIVERSE IS NOT THE HARNESS — correction written 2026-08-20, and it is LOAD-BEARING.**
Saying "the universe is the harness" makes the fix of 20/08 UNTHINKABLE: one would conclude "the
harness does not deliver that fact, therefore it is unreachable, period". Yet **`commandCwd` is
delivered by NO harness** — none sends that parameter; we DERIVE it from a value it does send
(`command`).
⇒ The universe = **the harness's facts ∪ everything we DERIVE from them WITHOUT GUESSING**, and it
is WE who DECLARE it (`harness-profile.js` + `HARNESS-CONTRACT.md`). The harness is an EMPIRICAL fact
about a third party; the universe is our declaration about it, hence strictly larger than what it hands.
⚠️ "WITHOUT GUESSING" is the bound, and it is not cosmetic: a HEURISTIC derivation in the trigger
(guessing that a key named `path` designates a path) has been ruled out since ㊽ — it would be
silently blind to a server exposing `dateipfad`. A MECHANICAL derivation (the `cd` of a command)
is legitimate: it assumes nothing, it reads.
⇒ When a fact looks unreachable, the question is NOT "does the harness send it?" but
**"can I DERIVE it mechanically from what it sends, and have I DECLARED it?"**
