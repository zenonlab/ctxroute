---
rules: [{"pattern":"session-inject.js","scope":["ctxroute"]},{"pattern":"session-inject.test.js","scope":["ctxroute"]},{"pattern":"sources-session.test.js","scope":["ctxroute"]}]
mode: smart
threshold: 30
---
# session-inject.js / sources/session.js — SESSION gate (LIVE 2026-07-17, sub-agents 2026-10-07)

⚠️ `session-inject.js` = SISTER gate of doc-inject.js: injects docs/session/*.md into EVERY context that STARTS — the main session (SessionStart: startup/resume/clear/compact) AND every sub-agent (SubagentStart, 2026-10-07) — the "CLAUDE.md managed by the framework". NEVER merge it with doc-inject.js (different events/contracts).
🔑 **WHO receives a doc is its `category`** (identity only: `role:main`, `role:subagent`, `type:<x>`), resolved by gate.js through the SAME cascade as every corpus, with its own `defaults.session` stage. The source only POSES each declaration (`admits`); the shell derives the identity from the payload through the profile its wiring names. 🛑 IF you wire this shell on a harness, you MUST pass `--harness <id>` (a key of `harness-profile.IDENTITY`): without it no identity is known and every identity-restricted session doc reaches NOBODY (fail-closed, silent on purpose — never a leak).
🛑 **IT ANSWERS UNDER THE EVENT IT RECEIVED** (`hook_event_name`, echoed; absent ⇒ `SessionStart`): a harness ignores context filed under another event's name.
⚠️ A sub-agent's queue is its OWN (`scopeId(session_id, agent_id)`), so a deferred chunk reaches THAT sub-agent at its next tool call, never the main agent.
⚠️ The header comment once called a filter here "a speculative feature": that comment WAS the defect (`category` shipped to 4 corpora on 22/09 and skipped this one). A word of the language missing from one corpus is a hole, not YAGNI — the symmetry gate now covers this corpus (part ①bis).
⚠️ NO CADENCE, NO dedup: reinjection after compaction is the POINT. Do not "optimize" by adding a once/smart here.
⚠️ **TRANSPORT ADDED on 2026-08-05 (⑯/⑮) — it had NONE**: it emitted a single block, without seal or chunking, and that only "worked" because `docs/session/` weighed ~1.2 KB (static sizing). It now goes through `emission-core.js`. The only state it touches is the QUEUE (transport, not cadence) ⇒ **lock MANDATORY** around it; lock unavailable = degradation to fresh content only, never a silence.
⚠️ **A SINGLE FRAME here (`nbFrames: 1`), deliberately**: whether a SessionStart hook declared N times is spawned N times is NOT measured (dedup by command+args is proven only on PreToolUse). We do not reverse-engineer — at one frame, chunking still delivers EVERYTHING, just more slowly. Going to N = a setting AFTER measurement.
⚠️ `sources/session.js` = PURE (Stryker-mutated), ALPHA order by id via localeCompare (a `<` ternary = guaranteed equivalent mutant, removed by construction). Frontmatter parsed via frontmatter.parse (single source), its declaration handed to `admits`, then stripped. One loop, no nested traversal (complexity budget: 0). Its corpus name `SOURCE_ID` is owned here and read by the cascade and the config gate.
⚠️ Full FAIL-OPEN (missing folder included); liveness covered by the doctor (probe 3 + session-inject wiring check) — do not remove those checks.
⚠️ `enabled: false` in ctxroute-config.json ALSO cuts this gate (single global switch).
