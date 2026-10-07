---
rules: [{"pattern":"error-journal.test.js","scope":["ctxroute"]}]
mode: smart
threshold: 40
---
# error-journal.test.js — a failure the runtime survives leaves its line (2026-10-04)

🔑 **Real processes and real modules, never a fabricated caller**: the spawned hooks (`ctxroute-reset`, `turn-count`, `canary-check`, `session-inject`) on an unreadable payload ⇒ exit 0, EMPTY stdout, ONE `hook-error` line · `session-store` a write that can never land (target is a directory) ⇒ `state write lost` line, no `.tmp` left · `memory-store` a CORRUPT snapshot ⇒ `daemon-error site=memory-snapshot-load`, an ABSENT one ⇒ silence (the normal first start) · the daemon's REAL `handle` on an unparseable payload ⇒ still `NO_OUTPUT`, plus `daemon-error site=payload` · one failure repeated ⇒ ONE line per process.
🛑 **IF you add a journalled site that an input can reach, add its cell HERE** — the static gate only proves the call EXISTS; this suite proves it WRITES and stays fail-open.
⚠️ **Declared scope**: the outer `catch` of `pretool-core`, `guard-core` and the three source adapters is reached by no input today (each layer under them is fail-open on its own) — held by `silent-catch-gate`, and `log.hookError` itself is proven here.
⚠️ Every path is a tmpdir through the test-reserved `CTXROUTE_CONFIG_PATH` / `CTXROUTE_STATE_DIR`; the env is restored after each cell.
