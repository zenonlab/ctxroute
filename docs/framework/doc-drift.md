---
match: doc-drift-gate.test.js
mode: smart
threshold: 15
---
# doc-drift-gate.test.js — a doc that LIES is worse than no doc (2026-08-06)
⚠️ **BORN OF A LIVED DEFECT**: on 2026-08-03, THREE docs taught the OPPOSITE of the code, fixed only because an agent HAPPENED to pass over them. An injected doc carries the tone of a proven invariant — nobody questions it. Limit case reached the same day: the GATE **and** its DOC said the same FALSE thing (two ramparts agreeing with each other, both off target); it took a HUMAN audit, exactly what 0-human forbids.
🛑 **WHAT IT DOES NOT DO**: it NEVER proves a doc tells the truth (no test can). It closes the only DECIDABLE part — a doc citing a VANISHED file (rename/deletion), a class that arrives mechanically and that nobody sees, because renaming a file does not touch the docs that talk about it. Never advertise it as "the defense against docs that lie": that would be the false sense of security it fights.
⚠️ **THREE ROOTS** (repo · `sources/` · FLEET `~/.claude/hooks`): without the fleet root, 8 of the 64 cited files would be FALSE reds (`protect-files.js`, `statusline.js`… live at the maintainer's). Fleet absent (clean clone/CI) ⇒ those files are explicitly SKIPPED; the part stays active for the repo, so never blind.
⚠️ **MEASURE BEFORE WRITING** (mandatory for any gate): 32 docs, 936 literals, 64 `.js` files, **0 not found**. A criterion with false positives would have given a gate nobody reads, hence a DEAD gate. 🛑 Do NOT widen it to FUNCTION names without redoing this measurement: docs also cite functions from OTHER projects, the noise would kill the signal (part ③ is the anti-noise guardrail — do not remove it).
⚠️ **ANTI-DORMANCY**: floor "≥ 20 verified citations" — a broken regex would yield zero citations and the gate would be GREEN by analyzing NOTHING (a defect already paid 3 times: deps-purete, deadline-gate, couches-gate).
⚠️ Negative-check **IN MEMORY**, never on a real file (an on-disk sabotage brought down 38 tests from other suites on 08-03). The reddening of part ① was proven by temporary sabotage on 2026-08-06.
