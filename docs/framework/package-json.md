---
match: package.json
scope: [ctxroute]
mode: dumb
rank: 374
---
# package.json (ctxroute) — invariants

`engines.node >= 22` — a REAL constraint (dependency-cruiser requires it), not arbitrary. Never lower it without checking that every devDependency still supports it.
`npm run check:all` = the full suite (tests + types + coupling + mutation) — ALWAYS run it before a version tag, never just `npm test`.
New `.js` file in the repo → add it to the test scripts if it has its own suite (`test:xxx`), AND to `.dependency-cruiser.json` `includeOnly`, AND to `.gitignore`/`.jscpd.json` if relevant — 3 places to keep in sync, never a single one.`npm run check:types` = `tsc -p jsconfig.json` (㉑, 16/08/2026): JSDoc + checkJs, BINARY ratchet 0 error (level: no noImplicitAny/strictNullChecks — catches nonexistent property, LYING JSDoc, incompatible types). Run in CI (coupling job) and in check:all. ⚠️ JSDoc is CONTRACT here: a block separated from its function by comments is attributed to the WRONG function (8 false errors measured on budget.js); the word @returns in PROSE is parsed as a tag.

