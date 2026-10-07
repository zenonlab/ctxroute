---
match: wrap-up-touch.js
mode: smart
threshold: 30
---
# wrap-up-touch.js — which files the SESSION wrote (option `wrapUp`)

🔑 **Why**: a judge reading a whole repository blames every agent working in it for every other agent's files, and never meets an agent started from another folder. The harness REPORTS each write; this shell records it, and `wrap-up-stop.js` hands each judge the written files of ITS perimeter (contract v2, `touched`).
🛑 **KEYED BY THE SESSION** (`lib.scopeId(session_id)`, no agent id): a sub-agent's writes are the work of the session that delegated them, and the end-of-turn judgement belongs to that session. IF you key it per agent, sub-agents' files escape every judge.
🛑 **NO RECORD = NOTHING WRITTEN**, read so by `wrap-up-stop.js` (empty, complete list) because this consumer is wired whenever the option is on (`optIn: "wrapUp"`). IF the wiring loses it, every judge sees an empty list: `wiring-drift-gate` and `doctor --settings` are what catch that.
⚠️ **The paths come from `harness-profile.WRAP_UP.claudeCode.touch.pathParams`** (`file_path`, `notebook_path`); the tool NAMES live in the wiring matcher (`Write|Edit|NotebookEdit`). A relative path is resolved against the payload `cwd`. IF Claude Code adds a file-writing tool, both lists move together.
⚠️ **A file a SHELL command writes is NOT recorded**: what a command writes is not a fact the harness reports, and guessing it from the command text is the heuristic this project refuses. Stated to adopters in the example judge.
⚠️ **BOUNDED** (`wrap-up-pure.MAX_TOUCHED`, 1000): past it the list stops growing and says `complete: false`, so a judge widens instead of trusting a cut list. Unchanged record (a file written twice) ⇒ no disk write. The store is ONE line of `memory-store-pure.stateStores()` (`touched-`, turn lock): purged at compaction, evicted with the durable class.
⚠️ MUTE BY CONTRACT, FAIL-OPEN: no stdout, exit 0. A lost write costs a judge one file, never a broken action.
⚠️ **A FAILURE IS JOURNALLED AND STAYS FAIL-OPEN** (2026-10-04, K): the shell's `catch` and the stdin `onError` call `log.hookError('wrap-up-touch', err)` ⇒ one `hook-error` line in `state/ctxroute-hooks.log`, nothing to the agent, exit 0; `logging.level: "debug"` adds a `hook-trace` line of what it decided. 🛑 IF you add a `catch` here, it MUST call `log.hookError` — a silent `catch` is exactly the defect K closed.
