---
match: .gitignore
scope: [ctxroute]
mode: dumb
rank: 354
---
# .gitignore (ctxroute) — trap

⚠️ `docs/mcp/*.md` is GITIGNORED (personal docs: real emails/clients); only the `*.md.example` files are pushed. Consequence: a fresh checkout (CI, or anyone cloning) has NO docs at all.
⚠️ NEVER write a repo gate that REQUIRES the presence of a `docs/mcp/*.md` — green locally, RED on all 3 OSes in CI (mistake made 2026-07-15 by config-gate). "Having docs" is an INSTALLATION invariant (→ `doctor.js --settings`), never a repo one.
General rule: a repo gate must hold on a CLEAN clone, otherwise it is wrong for everyone but its author.
`state/` and `reports/` gitignored = runtime artifacts, never committed.
