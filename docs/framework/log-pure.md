---
rules: [{"pattern":"/log-pure.js","scope":["ctxroute"]},{"pattern":"/log-pure.test.js","scope":["ctxroute"]}]
mode: smart
threshold: 40
---
# log-pure.js — how every journal behaves: setting, level, format, rotation (2026-10-04)

🔑 **PURE, ZERO I/O, MUTATED 100 %.** `log.js` asks the disk; every decision lives here, so Stryker measures it. 🛑 Never move a rule next to the `appendFileSync`.
🛑 **`resolveLogging(config)`: ABSENT = DEFAULTS, PRESENT AND WRONG = NAMED REFUSAL.** Defaults = the old daemon journal to the byte (`error`, 262144 bytes, 2 files). Unknown key, unknown level, out of bounds, non-integer ⇒ `{ ok: false, refusal }` + the DEFAULTS for the whole setting (never half of what was written). `note` is the only extra key.
🛑 **THE BOUNDS ARE ONE FACT IN TWO PLACES**: `BOUNDS` here and `logging` in `ctxroute-config.schema.json` (16384-8388608 bytes, 1-10 files), tied by `journal-boundary-gate.test.js` ②. IF you move a bound, you MUST move the schema, `disk-writers.json` (worst case) and the README in the same commit.
🛑 **`admits(level, severity)`: `event` and `error` at EVERY level (unknown level included), `debug` ONLY at exactly `debug`.** Fail towards writing for failures, towards silence for the trace.
⚠️ **`formatRecord`**: `<at> event=<name> k=v…`, one line (CR/LF collapsed in values AND the instant — a newline would forge an entry), `null`/`undefined` fields omitted, an event outside the vocabulary ⇒ `null`. `lifecycle-log-pure.formatEvent` delegates here: ONE format for every journal.
⚠️ **`shouldRotate` is FAIL-OPEN** (unreadable size or ceiling ⇒ do not rotate, still write) and `>=` (a limit REACHED). Moved here unchanged from `lifecycle-log-pure` on 2026-10-04, with its cells.
🔑 **`rotationPlan(keptFiles)`: remove `.k`…`.9` (stranded by a LOWERED setting), shift oldest first, then current → `.1`; k = 1 removes the current file.** A rename OVERWRITES its target: that is the eviction. An unusable count falls back to the DEFAULT (2), never to "keep everything" — no plan ever touches a suffix past `.9`.
⚠️ **No `typeof` guard in `resolveLogging`, deliberately**: a primitive has no `logging` property, so a guard there was an EQUIVALENT mutant (measured) — removed at source, never frozen by a test.
