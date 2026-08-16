---
match: [docfacts.js, docfacts.test.js, docfacts.property.test.js, language-doc.js, language-doc-gate.test.js]
mode: smart
---

# docfacts — a doc can no longer ASSERT what the code contradicts (2026-08-14)

🔴 **FOUNDING DEFECT**: `CLAUDE.md` said "`exclude` = matched against the **PATH**"; the code says "the current context (path/**COMMAND**)". The word had vanished in the COPY. An agent recited the prose, asserted it **3 times** to the maintainer, and concluded that an EXISTING capability was impossible. ⚠️ A capability believed absent is as dead as an absent one — **and it makes no test go red**.
⚠️ **SCOPE = THE DECIDABLE ONLY**: an ENUMERABLE fact (keyword list, bound, threshold) copied then stale. It NEVER proves that a sentence is true — undecidable. ⇒ **Writing rule: every enumerable fact goes through an `AUTO` block, prose keeps only the JUDGMENT** ("the code is the authority") — never a value nor a behavior.
⚠️ **INDUSTRY PATTERN** (`go generate` + diff, terraform-docs, rustdoc): generate, then fail if the file moved. **ZERO DEPENDENCY, measured**: `embedme` (the only competitor with `--verify`) has been frozen since 2022-09-07 — "an unmaintained dependency is not granted the power to REFUSE", and a gate IS that power; it embeds VERBATIM anchored on line numbers, not DERIVED facts.
- **`docfacts.js` = GENERIC CORE, reusable as-is**: knows NEITHER ctxroute NOR any path. Takes text + facts, returns a verdict. Never kills the process, never writes the output (core layer).
- **`language-doc.js` = SPECIFIC SHELL**: the only one to know "which constant ↔ which block". ⚠️ **Constants are IMPORTED, NEVER copied** — copying them here would recreate the exact defect. CLI: `node language-doc.js` (verifies) · `--write` (regenerates).
- ⚠️ **NON-NEGOTIABLE ANTI-DORMANCY**: empty `faits` ⇒ FAILURE. A broken deriver would make the gate green by analyzing NOTHING (already paid 3× here: deps-purete, deadline-gate, couches-gate).
- ⚠️ **Part ③ of the gate = COMPLETENESS**: every word of the real vocabulary must be READABLE in the doc. Without it, a block EMPTY on both sides would be "conformant" — the amputation would pass again.
- ⚠️ **Part ⑥ = anti-copy**: a generated fact must NOT be restated in prose elsewhere, otherwise the copy re-drifts and nobody sees it.
- ⚠️ Negative-check **IN MEMORY**, never on the real file (a disk sabotage brought down 38 tests on 2026-08-03).
