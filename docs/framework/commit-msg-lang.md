---
match: [commit-msg]
scope: ["ctxroute"]
mode: dumb
---

# commit-msg-lang.js / commit-msg-check.js / .githooks/commit-msg — the published HISTORY stays English

🔴 **REASON FOR EXISTING**: decision ㉒ ("the WHOLE project is in English") was sealed for `docs/framework/` by `english-only-gate.test.js` and by NOTHING for the commit messages, which were all French while the repository was preparing to go public. `git log` is one of the first surfaces a fork reads, and history cannot be rewritten after publication.
🛑 **THE DECISION LIVES IN `src/commit-msg-lang.js`, NEVER IN THE SUITE.** Stryker does not mutate test code: a rule written inside a test file is verified by nothing. The hook and `test/commit-msg-lang.test.js` consume the SAME pure module — the detector is INJECTED, so the shell owns the I/O and the module stays mutable.
⚠️ **SAME DETECTOR AND SAME MEASURED FLOOR AS THE DOC GATE, ON PURPOSE**: `eld` (chosen by measurement against `franc`, which gave 97 false positives on this corpus) and `MIN_CHARS = 90`. `isReliable()` is load-bearing — the detector says ITSELF when a sample is too short. 🛑 Never swap the detector on reputation; replay the measurement.
⚠️ **IT IS A NOT-ENGLISH DETECTOR, NEVER A FRENCH ONE**: contributors are international, the next slip may be German or Japanese.
⚠️ **THE WHOLE MESSAGE IS JUDGED, NOT ONLY EACH LINE.** Real subjects in this history run ~80 characters, i.e. UNDER the floor: a per-line-only gate would have accepted every French commit ever written here. Lines are judged too, but only so the refusal can NAME the offending line — a refusal one cannot act on is a refusal one bypasses.
⚠️ **WHAT IS DELIBERATELY LET THROUGH, and each exclusion protects a real gesture**: a message too short to decide (indecidable, never guessed) · the subjects git writes itself (`Merge …`, `Revert "…"`, `fixup!`) · the trailer block, recognised as the LAST paragraph only — shape alone would swallow a conventional-commit subject (`fix: …`) and the gate would judge almost nothing · git's own comments (they are LOCALISED) · the `git commit -v` diff, cut at the scissors line.
⚠️ **FAIL-CLOSED AND LOUD in `tools/commit-msg-check.js`** (an unexpected error refuses and prints the cause), but **FAIL-OPEN without `node_modules`** in the hook: breaking the first commit of whoever clones the repo is how a hook gets uninstalled. Bypass = `git commit --no-verify`, legitimate and CONSCIOUS, never automated.
⚠️ **NEVER PIPE the checker inside the hook** (`| tail`, `| grep`): in sh the exit code is the LAST link's, so a refusal would read as success — same trap as `.githooks/pre-commit`. 🛑 Never add a test suite to it either: measured ~1.7 s, and the day it costs 10 s it gets uninstalled.
⚠️ **`eld` IS ESM-ONLY** (its package exports only an `import` condition) hence the dynamic `import()` in the shell — a `require` throws `ERR_REQUIRE_ESM`, i.e. a gate that always crashes.
