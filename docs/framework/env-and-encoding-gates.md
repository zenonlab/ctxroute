---
rules: [{"pattern":"git-env-door-gate.test.js","scope":["ctxroute"]},{"pattern":"ps1-bom-gate.test.js","scope":["ctxroute"]}]
mode: dumb
---
# git-env-door-gate / ps1-bom-gate — INHERITED ENV and FILE ENCODING (2026-08-21)
🔴 **`GIT_*` IS EXPORTED BY GIT TO ITS HOOKS, INHERITED BY EVERY CHILD, AND IT BEATS `cwd`.** MEASURED: a `git add` aimed at a sandbox in the OS tmpdir staged its trap file into the REAL index, the file reached a commit, and three `--amend` in a row could not remove it — each commit re-ran the hook, which re-ran the test, which re-staged the file.
🛑 **ONE DOOR PER FILE, AND IT SCRUBS THE WHOLE FAMILY.** Scrubbing a single call site was measured INSUFFICIENT (two other cells of the same suite still failed under a poisoned env), and "unset the right variable" is unwritable: nobody can enumerate what a future git version exports.
⚠️ **DETECTION IS AST (`ast-grep`), NEVER REGEX** — a `git` spawn quoted in a comment or a string is a MENTION. The spawn PRIMITIVES are DERIVED from what the repo imports from `node:child_process`: a hand list is born stale, and that textual derivation is safe in one direction only — a name read from a comment ADDS a pattern matching nothing, it can never HIDE a call site.
⚠️ **FAIL-CLOSED ON THE PROOF**: an `env:` whose binding is not seen deleting `GIT_*` keys counts as UNSCRUBBED. Proving it harder would mean EXECUTING the file, and a static gate that runs the code it judges is no longer static.
🔴 **POWERSHELL 5.1 READS A `.ps1` AS ANSI UNLESS IT STARTS WITH THE UTF-8 BOM (`EF BB BF`)** — measured on a real CI run: 2,045 non-ASCII bytes, no BOM, PARSER ERROR before the first line. Same class as the XML prolog `Register-ScheduledTask` refuses.
⚠️ **READ `.ps1` AS BUFFERS, NEVER AS TEXT**: the decoder turns the BOM into `U+FEFF`, so a string comparison cannot tell the fatal file from the fixed one — the gate would be testing its own decoder.
⚠️ **A PURE-ASCII `.ps1` IS EXEMPT** (below `0x80`, ANSI and UTF-8 agree byte for byte) and the exemption is STATED in the failure message: never widen this to "every `.ps1` needs a BOM" — an unjustifiable rule gets widened or unplugged.
⚠️ **ANTI-VACUITY**: floors on the perimeter, on the spawn call sites examined and on the `git` ones, plus a WITNESS per derived primitive whose detection is REQUIRED. A `.ps1` perimeter that empties must DELETE the gate, never leave it certifying nothing.
🛑 **SABOTAGE IN MEMORY OR IN THE OS TMPDIR ONLY** — a real-file sabotage here once brought down 38 tests of suites running in parallel — and both gates spawn `git` THROUGH their own door: a judge exempt from its own rule is where the rule dies.
