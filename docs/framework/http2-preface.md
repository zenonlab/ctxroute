---
match: http2-preface-pure.js
mode: smart
threshold: 30
---
# 🔗 IF YOU TOUCH THIS FILE, YOU MUST ALSO TOUCH
`src/hooks/http-server.js` (the `clientError` handler is its ONLY caller — a pure decision nobody calls is inert) · this doc's mirror `~/.claude/hooks/docs/ctxroute/http2-preface.md`, byte-identical.
**Judges to re-run:** `npm run t -- test/http2-preface-gate.test.js` · `npm run test:ci-gate` (the mutation wiring) · `npm run check:types`.

# http2-preface-pure.js — it DIAGNOSES, it never switches

- 🛑 **IT NEVER SERVES HTTP/2.** Reading the preface and quietly answering in HTTP/2 would make the served protocol depend on who knocked first — two clients, two answers, from one declaration. The declaration stays the authority; this only explains why it is wrong.
- 📐 **THE AUTHORITY IS RFC 9113 §3.4, never a runtime error name.** Match the 24 octets. Node also exposes `HPE_PAUSED_H2_UPGRADE`, which is a THIRD PARTY'S INTERNAL: it can be renamed in any release with nothing going red here. The code is a corroboration, never the test.
- ⚠️ **A SHORT READ IS A YES.** TCP may hand over fewer than 24 octets first, so a PREFIX of the preface is still an HTTP/2 client — answering no would make the diagnosis depend on packet boundaries, i.e. on luck. An EMPTY buffer is a NO: a diagnosis drawn from nothing is vacuity.
- 🔴 **IF YOU CHANGE THE NOTICE, YOU MUST NAME A REMEDY THAT EXISTS.** Its first version told the operator to set `http.protocol` — a key that does not exist and that the CLOSED config vocabulary would have REFUSED. A notice naming an unreachable fix is worse than a cryptic error: it sends someone to edit a file that will reject them. Cell ④ forbids its return.
- 🛑 **IF YOU ADD A CELL, YOU MUST IMPORT THIS MODULE WITH A STATIC ESM IMPORT** (`import preface from '../src/http2-preface-pure.js'`), never `createRequire`: Stryker's module graph cannot see a dynamic require, so the module would be MUTATED while NO suite covers it — its mutants measured by nothing. `mutation-workflow-gate` reddens on exactly that.
- ⚠️ **THE WIRING IS WHAT BREAKS, so it has its own cell.** Cell ⑤ drives the REAL server with a REAL `http2.connect` client and asks the server when it has seen the bad opening (`clientError`) — ZERO temporal calls, because the authority KNOWS. Never replace that with a delay.
- ⚠️ **ONE SENTENCE PER PROCESS LIFE.** A misdeclared protocol fails on EVERY connection; a line per failure is the traffic-proportional writer `lifecycle-log-pure` exists to forbid.
