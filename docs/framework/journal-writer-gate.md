---
rules: [{"pattern":"journal-writer-gate.test.js","scope":["ctxroute"]},{"pattern":"no-journal-writer.yml","scope":["ctxroute"]}]
mode: smart
threshold: 40
---
# journal-writer-gate — every journal goes through `src/log.js` (2026-10-04)

🔑 **DETECTION = `rules/no-journal-writer.yml` (ast-grep, no exemption); POLICY = this suite.** An append primitive in `src/`, `tools/` or `service/` outside `src/log.js` is RED, and `src/log.js` holds EXACTLY ONE (the ratchet doubles as anti-vacuity: zero hits means the perimeter did not resolve).
⚠️ **Keyed on the METHOD, never the receiver**: `appendFileSync` · `appendFile` (callback and `fs.promises`) · `createWriteStream` · `openSync` with an append flag (`a`, `a+`, `as`, `as+`, `ax`, `ax+`). Receiver names go blind on `require("fs").x` and aliases (measured 2026-08-21 in `disk-writers`).
⚠️ **AST, never regex**: comments and strings naming `appendFileSync` must not be accused — the NEGATIVE cell holds both, plus `writeFileSync` and `openSync(p, 'w')` (a truncating write is `disk-writers`' job, not this one's).
🛑 **NO BUDGET FILE AND NONE MAY BE ADDED**: an append elsewhere is never legitimate debt, it is a journal nobody registered (no level, no rotation, no ceiling). The cure is an entry in `log-journals-pure.journals()`.
⚠️ **A brand-new file is invisible until git tracks it** (`git add -N` while working) — same blind cell as `disk-writers`.
✅ Seen RED both ways on 2026-10-04: a second append inside `src/log.js`, and `require('fs').appendFileSync` in a fresh tracked file under `src/`.
