---
rules: [{"pattern":"deps-purity-gate.test.js","scope":["ctxroute"]},{"pattern":".dependency-cruiser.json","scope":["ctxroute"]}]
mode: smart
---
# deps-purete-gate — the gate that checks the gates CAN go red
⚠️ **REAL BUG 2026-08-03**: `lib-pure-must-stay-pure`, the repo's oldest architecture gate, was **INERT**. A `require('fs')` at the top of `lib-pure.js` passed GREEN. **ALL** the `*-must-stay-pure` rules were decorative.
⚠️ **CAUSE (OFFICIAL dependency-cruiser 18.1.0 doc)**: `includeOnly` **also filters dependencies** ("will discard all files not matching the pattern") ⇒ `fs`/`path`/`child_process` NEVER entered the graph, so no rule could see them. Measurement: **41 modules / 99 deps** before, **47 / 143** after.
⚠️ **A NEW PURITY RULE ⇒ its core module MUST be in `includeOnly`**, otherwise it is BORN inert. The gate's static part derives it FROM THE RULES themselves — never from a copied list.
⚠️ **A GATE THAT CANNOT FAIL CERTIFIES instead of protecting** — worse than no gate, we stop looking. NEVER delete nor loosen this file.
⚠️ **TEST SABOTAGE = ALWAYS ON A COPY, never a real file**: the 1st version modified `lib-pure.js` in place and brought down **38 tests** from other suites importing it IN PARALLEL. A test that breaks its neighbors is a test we disable.
⚠️ **NEVER `npx` from a temporary folder**: without the repo's `node_modules` it fetches the package OVER THE NETWORK — an anti-dependency-confusion placeholder was pulled in (measured). Point at the local binary `node_modules/dependency-cruiser/bin/dependency-cruise.mjs`.
⚠️ **DOC-FIRST**: these 3 traps cost round trips because I PROBED before READING. Third-party tool behavior ⇒ its official doc, for the INSTALLED version, first.
