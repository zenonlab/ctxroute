---
match: differential-normalize
mode: dumb
---

# differential-normalize.js — the filter that could make the differentials BLIND
⚠️ **SINGLE SOURCE of the 2 differentials** (`pretool-differential`, `mcp-differential`). Never a copy inside a suite: two normalizations diverge, and two nets that no longer filter the same thing no longer prove anything together.
🛑 **IT DELIBERATELY WEAKENS A GUARDRAIL** — it removes material BEFORE comparison. That is legitimate (the `protect-files.js` oracle has been FROZEN since July and ignores everything born after: seal, then ordinal), but it demands its negative-check. An UNTESTED comparison filter can swallow a REAL regression, and both nets would stay GREEN on it.
🛑 **ANCHORED ON THE SOURCE TAG, NEVER A BLIND ERASURE**: removing every `[DOC x/y]` wherever it appears would swallow a doc whose BODY contains that text — the differentials would go one-eyed exactly where we thought we were strengthening them. Part ③ of the negative-check.
⚠️ **NEVER widen a pattern to "make a red pass".** A differential tuned until green keeps nothing. Red ⇒ investigate on the evidence if the gap is ALREADY declared, otherwise it is a REAL parity breaking.
⚠️ TOTAL: a non-string input is returned as-is (the MCP context is `undefined` when nothing is injected) — a differential that crashes reads like an engine outage.
