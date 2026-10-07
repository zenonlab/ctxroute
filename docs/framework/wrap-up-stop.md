---
match: wrap-up-stop.js
mode: smart
threshold: 30
---
# wrap-up-stop.js — END OF TURN: refuses to stop until the judges pass (option `wrapUp`)

🔑 **The chain**: read the scope's `wrap-up-` record (no lock for the READ) → `isDue`? → read the SESSION's `touched-` record (`wrap-up-touch.js`; absent = nothing written yet, an empty complete list) → `judgesFor` with the first `WRAP_UP.claudeCode.touch.pathParams` → run the covering judges in PARALLEL, ONE input per judge carrying the files of ITS perimeter (`judge-runner.runJudge`) → RE-READ under the turn lock (a compaction may have purged the record meanwhile) → `decide` → write → speak the Claude Code dialect from `harness-profile.WRAP_UP.claudeCode.forcing` (top-level `decision: "block"` + `reason`; human notices in `systemMessage`).
🛑 **WIRED ONLY WHEN `wrapUp.enabled` IS TRUE** (`optIn: "wrapUp"` in `wiring.json`): off ⇒ the generated wiring is byte-identical. IF you wire it unconditionally, every agent pays a process spawn at every end of turn for an option it never asked for.
⚠️ **NOT DUE IS NOT ALWAYS SILENT**: when no observation ever arrived, `saySilentSensor` reads the turn counter from the EXISTING `turn-count-` record (`.turns`, the field `pretool-core` reads) and, if `sensorSilent` holds, writes `sensorSilenceSaid` under the lock and emits a NOTICE alone (`systemMessage`, no `decision`). IF you rename that counter field, you MUST change both readers together.
🛑 **FAIL-OPEN, ALWAYS**: any failure ⇒ exit 0, silence, the turn ends. A guardrail that can trap a session is worse than none.
⚠️ **THE DEADLINE IS LONG ON PURPOSE** (`DEADLINE_MS` = 540 + 30 s): judges may legitimately run long. Order of the three bounds, confronted by cells: judge ceiling 540 s < shell deadline 570 s < hook bound 600 s.
⚠️ **A REASON THAT OVERFLOWS IS NEVER CUT SILENTLY**: the head goes in `reason` with the path of the full report (`state/wrap-up-reports/<scope>.md`, one per scope, at most `MAX_REPORTS` = 64 kept, coldest evicted in the same gesture — declared in `disk-writers.json`).
⚠️ `showNotification: false` silences the human notices, NEVER the refusal itself. `messageFile` resolves next to the CONFIG file; unreadable ⇒ default message + the human is told.
⚠️ Codex has no shell here: its hooks carry no context fill, so there is nothing to judge on (`doctor --harness` says so). A Codex port would reuse this file's core calls with its own dialect, never an `if` here.
⚠️ **A FAILURE IS JOURNALLED AND STAYS FAIL-OPEN** (2026-10-04, K): the shell's `catch` and the stdin `onError` call `log.hookError('wrap-up-stop', err)` ⇒ one `hook-error` line in `state/ctxroute-hooks.log`, nothing to the agent, exit 0; `logging.level: "debug"` adds a `hook-trace` line of what it decided. 🛑 IF you add a `catch` here, it MUST call `log.hookError` — a silent `catch` is exactly the defect K closed.
