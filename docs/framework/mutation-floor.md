---
rules: [{"pattern":"mutation-floor-gate","scope":["ctxroute"]},{"pattern":"stryker.conf.json","scope":["ctxroute"]}]
mode: dumb
---
# mutation-floor-gate — a report that does not cover everything proves NOTHING

🔴 **THE HOLLOW GREEN, MEASURED 2026-08-30, AND IT HAD LASTED WEEKS.** The per-file floor judged
the files it FOUND in `reports/mutation.json`. Every local run is `--mutate <one file>`, so the
report only ever held what the incremental cache already knew: **28 files against the 42 that
`mutate` declares**. The 14 others were not green — they were ABSENT, and nothing said so. The
CI, which mutates everything, reported **177 survivors across five of them** on the same commit
where this gate was GREEN locally.
🛑 **㉞bis CLOSES IT AND IS DERIVED FROM THE CONFIG**: every entry of `stryker.conf.json`
`mutate` must appear in the report, or the cell is RED and NAMES the missing modules. A module
added tomorrow enters the check by itself. **Never narrow it to the files that happen to be
present** — that is the hollow green rebuilt.
🛑 **TRI-STATE, NEVER A QUIET GREEN — and the first version of this gate got it WRONG.** It
reddened on ANY partial report, so it would have been RED on EVERY local run (a targeted run is
the doctrine here) — and a cell that shouts always is a cell that gets disarmed. Now: complete ⇒
JUDGED · partial in CI ⇒ **RED**, the run did not finish or the config drifted · partial locally
⇒ a **NAMED SKIP** saying how many modules of how many were covered, the same idiom
`resolutionFloorHolds` uses. ⚠️ `process.env.CI` decides, and that is not a dialect leaking into
the engine: it is a TEST asking which authority it runs under, and only the CI can hold a
complete report.
⚠️ **A TARGETED RUN CANNOT VERDICT.** `--mutate <file>` answers about THAT file only; the
authority is a COMPLETE report (CI, or `--force` with no `--mutate`). A score read off a partial
report is a memory, not a measurement.
⚠️ **THE CACHE LIES IN BOTH DIRECTIONS, both measured the same day**: it hid 14 modules, and it
carried a `coveredBy: []` on a mutant that a manual sabotage proved perfectly killable. Trust the
CI over any local score, and read `Ran N tests per mutant` plus the `timed out` count BEFORE any
percentage.
