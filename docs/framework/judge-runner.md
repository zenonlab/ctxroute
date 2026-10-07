---
match: judge-runner.js
mode: smart
threshold: 30
---
# judge-runner.js — runs the adopter's judges (option `wrapUp`)

🔑 **A judge is ANY command** (script, suite, model call): ctxroute knows its contract (versioned JSON on stdin, exit code, stdout) and nothing else. Given as an ARGUMENT VECTOR and started WITHOUT a shell (`layers.json` forbids `shell: true` for every layer: the system shell differs per OS), in the session `cwd`, all judges IN PARALLEL (the wait is the slowest, never the sum). IF you add a shell, the same judge behaves differently on the three OSes and `layers-gate` reddens.
🛑 **THE BOUND KILLS THE WHOLE TREE**: a judge may start processes of its own. POSIX: `detached` + `process.kill(-pid)` · Windows: `taskkill -pid <pid> -t -f` while the root lives (dash switches, measured 2026-10-04 — a `/x` literal reads as a route to `rendezvous-address-gate`). IF you replace this with `child.kill()`, `judge-runner.test.js` goes red (seen red 2026-10-04: the orphan held the pipes and the run never returned).
🛑 **THE BOUND ANSWERS AT ONCE, IT NEVER WAITS FOR `close`**: an orphan can keep the pipes open for ever. Kill, then give the verdict.
⚠️ **THE ONE TIMER IS DECLARED** (`temporal-budget.json`, `undecidable`: slow vs never-answering is the halting problem). IF you add another wait, declare it or the gate reddens.
⚠️ **OUTPUT CAPPED PER STREAM** (`MAX_STREAM_BYTES`, 1 MiB) and the cut is SAID (`[… N more bytes not kept]`): a cut that is not announced reads as a complete report.
⚠️ Never rejects: a spawn failure is a `spawnError`, read by `verdictOf` as `broken` — a judge that cannot answer has no authority to refuse.
