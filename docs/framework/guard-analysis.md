---
rules: [{"pattern":"collisions.js","scope":["ctxroute"]},{"pattern":"collisions.test.js","scope":["ctxroute"]},{"pattern":"check-collisions.js","scope":["ctxroute"]},{"pattern":"doc-write-guard.js","scope":["ctxroute"]},{"pattern":"doc-write-guard.test.js","scope":["ctxroute"]},{"pattern":"guard-core.js","scope":["ctxroute"]},{"pattern":"codex-doc-write-guard.js","scope":["ctxroute"]},{"pattern":"codex-doc-write-guard.test.js","scope":["ctxroute"]}]
mode: smart
threshold: 30
---
# collisions.js / check-collisions.js / doc-write-guard.js — fleet analysis & guard (0-human)

⚠️ `doc-write-guard.js` = PostToolUse Write|Edit (WIRED): invalid fleet doc → `decision: block` + reason INSIDE the agent's turn (it fixes it itself); healthy doc → TOTAL SILENCE. Validation DELEGATED to frontmatter.js (validate/validateMcp) — NEVER re-judge here.
⚠️ `collisions.js` = PURE CORE (mutated): rule crossings, 3 SORTING levels. NEVER a gate (machine-undecidable) — the verdict belongs to an AGENT, never to a human.
⚠️ `check-collisions.js` = on-demand shell (`node check-collisions.js [--json]`), source = FRONTMATTERS via loader — never protected-paths.json again. Always exit 0.
⚠️ **PORTING (2026-07-19)**: shared body = `guard-core.js` (docKind + multi-file validation, run(filePaths)) — thin shells: Claude = file_path directly · Codex = `codex-doc-write-guard.js`, paths extracted from the apply_patch patch (tool_input.command) via sources/file.js#extractFilePaths (SAME parser as the entry match, never a 2nd one). `decision: block` = measured common dialect.
⚠️ Session docs: judged by `validateSession` since 2026-10-07 — `note` + the settings whose registry `atStart` is `true` (today `category`, identity words only); any other key BLOCKS with its written reason. "Never blocked, nothing to validate" held until `category` reached that corpus.
⚠️ Guard is fully fail-open; its liveness = doctor (probe 4 + wiring).
