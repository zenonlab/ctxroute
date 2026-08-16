---
match: stdin-json.js
mode: dumb
rank: 369
---
# stdin-json.js — invariants

Generic I/O utility — MUST depend on NOTHING else in the repo (rule `stdin-json-stays-standalone` in `.dependency-cruiser.json`), so it stays copyable as is into another project.
Extracted after `jscpd` detected real DUPLICATION (the same stdin boilerplate was copied into `legacy-mcp-inject.js` AND `ctxroute-reset.js`) — if you duplicate this pattern elsewhere in the repo, jscpd will detect it in CI (`check:coupling`).
`onError` is called on invalid JSON — each calling hook decides its own fallback behavior (typically `process.exit(0)`, never an uncaught throw).
