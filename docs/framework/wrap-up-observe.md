---
match: wrap-up-observe.js
mode: smart
threshold: 30
---
# wrap-up-observe.js — the SENSOR's door (option `wrapUp`)

🔑 **ANY sensor, ONE door**: stdin `{ session_id, agent_id?, cwd?, context: { tokens?, window, percent? } }`, normalised by `wrap-up-pure.observationOf`, stored in the scope's `wrap-up-` record under the TURN lock (`lockDirForKey`). Claude Code's sensor is the mod `mods/wrap-up-sensor`; a new harness writes a new SENSOR, never a new door.
🛑 **THE STORE IS DECLARED ONCE** (`memory-store-pure.stateStores()`: `wrap-up-`, lock `turn`, durable): that one line gives it the PreCompact purge (a new context re-arms the option), the lock class and the eviction class. IF you add a field, PROPAGATE the record (`withObservation`), never rebuild it — the record also carries `nudges` and `settled`.
🛑 **NEVER import `session-store`**: a new writer goes through `store-resolve` (`only-store-resolve-opens-a-store`). `store-purge-gate` recognises both doors since 2026-10-04.
⚠️ MUTE BY CONTRACT, FAIL-OPEN: no stdout, exit 0. Option off ⇒ NOTHING written. A lost observation costs one turn of delay, never a broken turn.
⚠️ The sensor fires AFTER a turn and the Stop hook at the end of one, unordered: the judged fill may lag one turn. Accepted and stated — the threshold sits below the wall precisely to absorb it.
⚠️ **A FAILURE IS JOURNALLED AND STAYS FAIL-OPEN** (2026-10-04, K): the shell's `catch` and the stdin `onError` call `log.hookError('wrap-up-observe', err)` ⇒ one `hook-error` line in `state/ctxroute-hooks.log`, nothing to the agent, exit 0; `logging.level: "debug"` adds a `hook-trace` line of what it decided. 🛑 IF you add a `catch` here, it MUST call `log.hookError` — a silent `catch` is exactly the defect K closed.
