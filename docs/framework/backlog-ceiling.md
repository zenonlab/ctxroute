---
match: backlog-ceiling-pure.js
mode: smart
threshold: 30
---
# backlog-ceiling-pure — SAY what the kernel allows, never REFUSE to start

🔴 **IT REPLACES A WALL, AND THAT IS THE WHOLE POINT (2026-09-17).** An installer
precondition shipped that morning refusing to install when `net.core.somaxconn` sat
below 4096 — for a burst-refusal class measured ABSENT hours later (daemon peak
**32** against a queue measured at **232**, and no connection attempt on the wire at
all). **A guardrail with no measured disease, aimed at your own adopters, is a
denial of service.** The Redis pattern is the industry answer and it is the
opposite: observe, record, never block. PostgreSQL documents it; neither refuses to
start.

🛑 **SI you touch this module, you DO NOT read the filesystem here.** `listen(2)` is
capped by `net.core.somaxconn`, and reading `/proc` is the SHELL's job
(`http-server.js`). A verdict written next to a `readFileSync` is a verdict Stryker
never mutates — this fleet's worst defect class, a green gate that measures nothing.

🛑 **UNKNOWN IS A VERDICT, NEVER A ZERO.** Off Linux the file does not exist: the
ceiling is `null` and `backlogCapped` stays false. Rendering that as `0` would
assert a measured zero about a kernel nobody read. ⚠️ But a ceiling that really IS
`0` (some containers report it) must survive as `0` and produce a cap verdict —
the two cases look alike and are not.

⚠️ **FIELDS ON `start`, NEVER A NEW EVENT.** That event fires exactly once per
process life, so the journal's ceiling is untouched. Adding an event here means
editing the closed vocabulary in `lifecycle-log-pure.js` and facing its cell.

📐 Figures, method and the dead hypotheses: `accept-queue-ceiling.md`.
