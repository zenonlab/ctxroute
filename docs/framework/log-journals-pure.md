---
rules: [{"pattern":"log-journals-pure.js","scope":["ctxroute"]},{"pattern":"log-journals-pure.test.js","scope":["ctxroute"]}]
mode: smart
threshold: 40
---
# log-journals-pure.js — the CLOSED registry of journals (2026-10-04)

🔑 **ONE ENTRY = ONE FILE + ITS CLOSED VOCABULARY, each event with its severity.** `daemon` → `ctxroute-daemon.log`: every `lifecycle-log-pure.EVENTS` (`event`), `request` (`debug`), `daemon-error` and `logging-refused` (`error`). `hooks` → `ctxroute-hooks.log`: `hook-error` (`error`), `hook-trace` (`debug`), `logging-refused` (`error`).
🛑 **IF you add a journal or an event, you add it HERE** — `log.js` refuses anything else, and `journal-writer-gate` refuses an append outside `log.js`. A new journal also moves `worstCase()`, hence `disk-writers.json` (tied by `journal-boundary-gate` ①).
🛑 **`request` STAYS OUT OF `lifecycle-log-pure.EVENTS`**: that list is the always-on vocabulary, and `lifecycle.record` filters on it FIRST, so the per-request trace is reachable ONLY through `log.write('daemon', 'request')`, at level `debug`.
⚠️ **The table is BUILT BY `journals()`, never at module load**: a value computed at import runs under no test, and mutation let a broken table survive that way (measured on this file). A dozen entries per call.
⚠️ **The `typeof` in `journalOf`/`severityOf` is a TYPE GUARD on a public contract**: `Object.hasOwn` coerces its key, so `['daemon']` would pass without it (cells hold it).
📐 `worstCase()` = journals × `BOUNDS.keptFiles.max` × `BOUNDS.maxBytes.max` = **20 files, 160 MB** — the figure no config can exceed.
