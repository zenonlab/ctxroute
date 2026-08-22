---
rules: [{"pattern":"legacy-mcp-inject.js","rank":350},{"pattern":"ctxroute-reset.js","rank":351},{"pattern":"ctxroute-config.json","rank":352},{"pattern":"legacy-mcp-inject.test.js","rank":353},{"pattern":"lib-pure.js","scope":["ctxroute"],"rank":362},{"pattern":"lock.js","scope":["ctxroute"],"exclude":["package-lock.json"],"rank":365},{"pattern":"stdin-json.js","rank":368}]
mode: dumb
rank: 350
---
# ctxroute — moved to a standalone folder (separate git repo)

The framework (code + tests) now lives in `~/Desktop/ctxroute/` (clean git repo, pushable to GitHub without mixing with the rest of the home directory).
`settings.json` wiring → absolute paths to that folder: `doc-inject.js` (the GATE — **16 declarations of type `http` since 2026-08-22**, pointing at the daemon on `127.0.0.1:8787/pretool?frame=k&frames=16`; setting `frames`. 🔴 **100 WAS TRIED THE SAME DAY AND ROLLED BACK IN MINUTES**: the transport made a frame nearly free (5 300 ms → 182 ms per action at 16, 1 040 ms at 100), but the CLI renders ONE hook entry PER DECLARATION per tool call, and 100 of them made the display unusable. **The win came from the TRANSPORT, never from the count** — raising `frames` buys capacity nobody needs, at a cost nothing measured), `ctxroute-reset.js`, `turn-count.js`, `session-inject.js`, `canary-check.js`. ⚠️ `legacy-mcp-inject.js` is NOT wired (relic = differential oracle).
Full internal doc: `Desktop/ctxroute/HOOK-INTERNALS.md`. Usage/config: `Desktop/ctxroute/README.md` (and skill `.claude/commands/ctxroute.md`).
⚠️ The maintainer's personalized MCP docs (`docs/mcp/stripe.md`, `odoo.md` — with real emails/clients) live in `Desktop/ctxroute/docs/mcp/*.md`, gitignored. Only the generic `.md.example` files are pushed to GitHub.
Framework change → edit in `Desktop/ctxroute/`, NOT here (this folder no longer contains the code).
