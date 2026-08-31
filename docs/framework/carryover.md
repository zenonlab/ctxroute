---
match: [carryover-pure.js, carryover-pure.test.js, http-carryover.test.js]
mode: dumb
---
# carryover-pure.js — a frame that never connects no longer COSTS the content

🔴 **THE LAST SILENT LOSS, PROVEN 2026-08-30 AND CLOSED 2026-08-31.** `emission-core.emit` persists
only what overflows the LAST frame of a plan, and it runs ONCE per invocation (frames 2..N replay the
memoized plan and write nothing). So when FEWER frames connect than the plan has chunks, the
leftovers were neither delivered nor queued — while `doc-seen-` already recorded the document
delivered, so no later action re-decided it. **MEASURED: 10 of 32 connections, chunks 11..19 of 19
never seen again, on any subsequent action.** Not a delay — a permanent, SILENT loss.
✅ **THE MECHANISM: when an invocation decides its plan it HARVESTS the unserved segments of the
other pending invocations of its scope and carries them itself.** Two causes, one remedy: "too much
content" and "a connection was lost" now end in the SAME place, the queue.
🛑 **A HARVESTED INVOCATION SERVES NOTHING MORE, AND THAT HALF IS NOT OPTIONAL** — without it a late
frame would deliver text the harvester has just taken over. Ownership MOVES, it is never shared, and
the transfer is atomic because the daemon is single-threaded: no lock, no timer, no liveness probe.
🛑 **NOTHING HERE ASKS WHETHER AN INVOCATION IS FINISHED — that is NOT an available fact** (no harness
emits a closing event; one agent runs several tool calls at once, 31 false alarms out of 32 paid for
assuming otherwise). Only two facts are used: a frame arrived, and a new invocation is deciding.
⚠️ **HARVESTING A STILL-LIVE INVOCATION IS HARMLESS BY DESIGN**: its content rides on the harvester's
frames instead of its own, worst case deferred by ONE action. A possible one-action delay traded
against a permanent loss — the "consolation, never a repair" the doctrine states. The target was
never *no frame is ever lost* (impossible: Two Generals, and we are the SERVER).
⚠️ **FAILS TOWARDS TODAY'S BEHAVIOUR, NEVER TOWARDS A GUESS**: no table, no plan, no id ⇒ empty
carryover. Carrying everything when unsure would re-deliver what already arrived and eat the budget
the real content needs, on the hot path. 🛑 The spawn lane supplies no observer and must stay
byte-identical: only a daemon can tell "this frame arrived" from "this frame never will".
