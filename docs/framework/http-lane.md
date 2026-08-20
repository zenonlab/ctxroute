---
rules: [{"pattern":"http-server.js","scope":["ctxroute"]},{"pattern":"http-lane-differential.test.js","scope":["ctxroute"]}]
mode: smart
---
# http-server.js — the SAME gate, served over a socket. NOT WIRED (2026-08-20).
🛑 **INERT ON PURPOSE.** No `settings.json` entry points here; nothing spawns it. Switching over is the maintainer's explicit decision, taken when no agent is running. Until then its only job is to be PROVEN identical to the spawn lane.
📐 **MEASURED FACTS, 2026-08-20 — do NOT re-research this.** Claude Code **2.1.237**: `type:"http"` is real, verified IN the installed binary (literals `"HTTP hook type"`, `url` = *"URL to POST the hook input JSON to"*, plus `if`/`timeout`/`headers`); five handler types exist (`command`·`http`·`mcp_tool`·`prompt`·`agent`); *"All matching hooks run in parallel"*; output cap **10,000 c per OUTPUT**. Codex **0.146.0**: *"Only `type:"command"` handlers run today"* — `prompt`/`agent` parsed and skipped, **no http**. Sources: `code.claude.com/docs/en/hooks`, `learn.chatgpt.com/docs/hooks`.
🛑 **THE CAP IS PER OUTPUT, NOT PER PROCESS ⇒ N DECLARATIONS ARE STILL REQUIRED.** HTTP changes their PRICE (~330 ms of node startup each → one local POST), never their NUMBER. Collapsing to one declaration would drop an action's capacity to a single frame and make the agent act on partial knowledge.
🛑 **KEEP `lock.js`.** "One daemon, therefore no lock" is the trap: Codex keeps spawning real processes against the same state files, and other sessions exist.
🛑 **THIS PATH MUST STAY SYNCHRONOUS.** `lock.js` busy-waits and assumed every caller was a short-lived process. Here N frames land in ONE process: an async core would let request A hold the lock while B spins on it for the full timeout — a self-deadlock that looks like a slow daemon, not a bug.
🛑 **NO `deadline.arm()` here** — deliberate inversion of the rule every other shell follows. The deadline kills zombie hook PROCESSES; a daemon is supposed to outlive its request. The bound belongs to the harness `timeout`.
⚠️ **Loopback only, and the dialect is NOT reimplemented**: the response JSON comes from `doc-inject.output()`, the very function the spawn lane uses — a second copy would be a twin that drifts.
⚠️ **ONE GUESS REMAINS, DECLARED**: what an EMPTY answer means over HTTP. We send `{}`; the doc says the endpoint answers in the command-hook JSON format but never defines silence. The equivalence lives in ONE place (`normalize()` in the differential) — measure it on a throwaway wiring before switching over, then correct that single line.
