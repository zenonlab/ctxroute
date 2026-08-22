---
match: pretool-decision-vocabulary
mode: dumb
---

# pretool-decision-vocabulary.test.js — the PreToolUse decision set is CLOSED

🔴 **MEASURED 2026-08-22, REPRODUCED THREE TIMES**: a PreToolUse hook answering `permissionDecision: "defer"` on its PASSING path **KILLS the calling subagent**. The harness accepts the word, so nothing says anything at all — the SILENT failure this repository refuses outright.
🛑 **THREE DECISIONS, NEVER FOUR**: `none` (the field ABSENT — the normal permission flow is left untouched, which is what a notice must do) · `allow` · `deny`. A fourth word is not a feature with a bug, it is a fourth decision. `ask`/`confirm` were REMOVED on 2026-08-05 and never come back.
⚠️ **TWO NETS, NEITHER SUFFICIENT ALONE.** ① BEHAVIOUR: each LIVE dialect's own `output()` is CALLED on every path and the JSON it RETURNS is read — a grep is satisfied by a comment, a returned object cannot lie. It covers the HTTP lane for free (`http-server.js` answers with `doc-inject.output()`). ② STATIC: no file of `src/` may ASSIGN a decision outside the set, so a fourth word one line away in a future shell is red the day it is written.
⚠️ **THE WITHHOLDING NOTICE SPEAKS WITHOUT DECIDING** — `{systemMessage}` alone, no envelope. Emitting the usual envelope would carry `allow` with an EMPTY context: a notice that AUTHORISES a tool call as a side effect.
⚠️ **ANTI-INERT IS THE CELL THAT HOLDS THE REST**: the scan must really accuse `defer` and really IGNORE a mention in a comment. Without it the static net can pass while reading nothing — this repo's worst defect is a green gate that sees nothing.
🛑 **A PORT IS EXACTLY THE GESTURE THAT ADDS A WORD.** The rule already existed in prose in the skill and did not stop it: a rule only prose guards is not a rule.
