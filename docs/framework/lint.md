---
rules: [{"pattern":"lint-corpus","exclude":["node_modules"]},{"pattern":"lint.js","scope":["ctxroute"],"exclude":["node_modules"]},{"pattern":"lint.test.js","scope":["ctxroute"],"exclude":["node_modules"]}]
mode: dumb
rank: 556
---
# lint.js / lint-corpus.js — FLEET audit (the framework audits itself)

⚠️ `doctor.js` watches the ENGINE ("am I still injecting?"), this lint watches the FLEET (~400 docs, ~780 rules, 16 MCPs — order of magnitude, never an exact count: a carved number drifts). DISJOINT roles, never merged.
⚠️ `lint.js` = PURE (gate `lint-must-stay-pure`), `lint-corpus.js` = the ONLY I/O point. NORMALIZATION lives in the shell; the core ignores where a trigger comes from. NEVER lift the notion "targeted by a rule" into it.
⚠️ **RULE SOURCE = THE FRONTMATTERS, PERIOD (27/07/2026)**: `lint-corpus.js` reads `rulesFromCorpus(readCorpus(DOCS))`. It used to read `protected-paths.json` — leaving it would have RESURRECTED the double write sideways (the lint demanding a JSON entry for every new doc). **NEVER rewire an EXTERNAL rule source into it**: that reintroduces the "ghost rule" class (a rule targeting a deleted .md), today EXTINCT BY CONSTRUCTION — a trigger lives IN its doc. Sealed by `lint-corpus.test.js` case 5 (rule without doc = inexpressible) AND case 3 (doc without trigger = DEAD, even if targeted by the JSON) — both go red if an external source comes back. ⚠️ Case 3 was INERT until 09/08/2026: it asserted a rule count that the FRONTMATTER produced, so it stayed green even when deleting the targeted code.
⚠️ Unreadable fleet (missing folder) ⇒ empty corpus ⇒ the PROBE below decides (exit 2). NEVER a raw stack trace: a diagnostic screams cleanly.
⚠️ `validate()` (frontmatter.js) is the ONLY authority on "sane declaration?". The lint DELEGATES, NEVER re-judges: 2 codes for 1 judgment = guaranteed divergence.
⚠️ **LIVENESS PROBE, exit 2** if 0 rule loaded — "I could not measure" ≠ "it is healthy". A hollow harness triumphantly announces 0 problem (mistake made 2× on 15/07/2026). NEVER remove it nor bring it back to exit 0/1.
⚠️ DIAGNOSTIC, NOT A HOOK: it SCREAMS (exit≠0) on ERROR. Never fail-open like a hook (opposite roles, cf doctor.md). `--quiet` only reduces the success output.
⚠️ NEVER delete a case from `lint-corpus.test.js`: the sabotage (fake fleet in tmpdir via `CTXROUTE_HOOKS_DIR`/`CTXROUTE_HOME`) is the ONLY proof that the lint bites. Green on a healthy fleet proves NOTHING. Sabotage verified 15/07: 18/3/2 tests red.
⚠️ The test NEVER touches the real `~/.claude/hooks` (live fleet serving other agents) — disposable fake fleet MANDATORY.
⚠️ **`hardcoded-source-tag` = ERROR (㉘ bis, 08/08/2026)**: a doc must NEVER carry a `[source: …]` line — the engine adds it at emission, so it is a copy-paste that ① doubles the tag and ② turns the CANARY green (an agent READING the doc drops a valid label into the transcript). 🛑 **Pattern anchored on a WHOLE LINE, never widen it**: my 1st pattern searched everywhere and accused `canary.md`, which merely EXPLAINS the marker — a doc that TALKS about the mechanism does not carry it. Measured: 4 offenders out of 393, 0 exemption.
`mcp-without-doc` = WARN, never error (arbitrated: "not done yet" ≠ oversight). A permanently red lint is ignored, hence useless — the exact lesson of rush mode.
