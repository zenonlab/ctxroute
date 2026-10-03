---
rules: [{"pattern":"stdout-exit.js"},{"pattern":"doc-inject.js"},{"pattern":"session-inject.js"},{"pattern":"doc-write-guard.js"},{"pattern":"turn-count.js"},{"pattern":"daemon-ensure.js"},{"pattern":"process.exit(","keys":["file_path","path","command","content","new_string"],"scope":["ctxroute"]}]
mode: smart
threshold: 30
rank: 570
---
# stdout-exit.js — an entry point that wrote something leaves only once it has been read

🔴 **`process.exit` CUTS stdout AND stderr AT 64 KB ON A POSIX PIPE** — measured 2026-10-01 on Linux: 219-292 KB of 500 KB on each stream, 3 out of 3; Windows delivers everything (8 out of 8), so the maintainer's machine can NEVER catch it by use. Doc (nodejs/node v22.x `doc/api/process.md`, read verbatim): *"Pipes (and sockets): synchronous on Windows, asynchronous on POSIX"*.
🛑 **IF a hook shell prints, it MUST call `printThenExit(text)`** — never `console.log`/`process.stdout.write` (gate ①). A path that may have printed leaves with `exitUnlessPrinting()`; one that cannot have printed may keep `process.exit(0)`.
🛑 **IF a file of `src/`, `tools/` or `service/` writes a stream, it MUST NOT call `process.exit`** (gate ②): `return exitAfterFlush(code)`, or `process.exitCode = code; return;` when it holds no handle. 🔴 **`exitAfterFlush` RETURNS** — the code after it RUNS: end the path yourself, or the work the exit used to cut short goes on.
⚠️ A throw-style `refuse()` THROWS since 2026-10-01 (`wiring-generate`, `service/*`): ONE entry point prints and flushes. NEVER wrap a `refuse()` in a `try` whose `catch` swallows it.
⚠️ Declared exemptions, each proven still needed: the frozen `legacy-mcp-inject.js` oracle · the daemon `http-server.js` (exit 90 must be IMMEDIATE, never held by a stalled journal).
⚠️ The exit waits on the WRITE CALLBACKS (a zero-length write queued behind every earlier one), never on a timer. A hook stays bounded by `deadline.js`. Standalone module: depends on NOTHING.
✅ Behaviour proof: `stdout-flush.test.js` (real spawns >64 KB: Codex, SessionStart, Claude client lane, `exitAfterFlush(3)` on both streams) — green on Windows either way, red WITHOUT the cure on Linux/macOS only.
