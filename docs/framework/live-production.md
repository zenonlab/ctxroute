---
tool: ["Write", "Edit", "NotebookEdit", "apply_patch"]
scope: [["ctxroute"], ["gate.js", "pretool-core.js", "emission-core.js", "collect-core.js", "guard-core.js", "doc-inject.js", "codex-doc-inject.js", "doc-write-guard.js", "codex-doc-write-guard.js", "session-inject.js", "sources/", "source-adapters.js", "frontmatter.js", "loader.js", "corpus.js", "lib-pure.js", "budget.js", "lock.js", "deadline.js", "paths.js", "stdin-json.js", "harness-profile.js", "canary.js", "canary-check.js", "turn-count.js", "ctxroute-reset.js", "collisions.js"]]
enforce: true
mode: once
rank: 1
note: |
  Guard against modifying the engine IN PROD (maintainer decision 2026-08-15).
  Grouped scope = (ctxroute) AND (a live core file). tool = WRITE actions
  only (never Read/Bash: refusing a read would be noise).
  once = ONE refusal per session/agent; alternation guarantees the retried action passes.
---
# 🛑 STOP — you are modifying the ctxroute ENGINE IN LIVE PRODUCTION

This file is executed by ALL agents (Claude Code + Codex) at EVERY tool call — your edit is LIVE on the next action, without review.
FORBIDDEN without an explicit GO from the maintainer: unplugging the injection, changing an output format, touching a file wired in settings.json.
If you have the GO (ctxroute maintenance session): redo your action as is — it will pass (alternation). MANDATORY proofs before leaving it in place: `npm test` + 100 % mutation + `node doctor.js` green, differentials intact.
If you do NOT have the GO: your need is solved in DATA (a `.md` doc, a config entry), never by editing the engine.
