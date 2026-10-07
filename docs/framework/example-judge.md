---
match: undocumented-changes.js
mode: smart
threshold: 30
---

# examples/judges/undocumented-changes.js — the EXAMPLE judge of `wrapUp`

🔑 **An EXAMPLE an adopter copies, never a part of the engine**: nothing in `src/` may import it, and the option works with no judge at all. Wired from the config alone (`wrapUp.judges.<name>.command` = an argument vector + a perimeter).
🛑 **"COVERED" IS ASKED OF THE ENGINE, NEVER RE-IMPLEMENTED**: `collect-core.collectAll` on an `Edit` payload, docs owned by the `file` source only (a skill matching the cwd would make EVERY file look documented). IF you add a matching rule of your own here, the judge and the injection disagree in silence.
⚠️ **IT SPEAKS THE JUDGE CONTRACT, version 2**: stdin JSON, exit 0 = done, else structured `findings` on stdout. IF the contract changes (`JUDGE_CONTRACT_VERSION`), this example changes in the same gesture: it is what adopters copy.
🔑 **`touched` COMPLETE ⇒ EXACTLY THE FILES THIS SESSION WROTE** (no git at all): another agent in the same repository is never blamed, committed work is still judged, the session folder does not matter. Shown relative to the cwd with `/` when inside it, whole otherwise; a written-then-deleted file is skipped. 🛑 An INCOMPLETE or absent list is never trusted: it falls back to the git mode, the wider net.
⚠️ **Git mode: paths from porcelain v1 `-z`, relative to the repository ROOT** (never the cwd); a rename's old path is the NEXT entry and is skipped; deletions need no doc. Scope = uncommitted work; `--since <rev>` widens it. `--ignore` matches the SHOWN path in both modes.
🛑 **EVERY `git` CHILD GETS `ENV_WITHOUT_GIT`** (the `GIT_*` family dropped, the ceiling kept: it only stops the search): run from inside a git hook, an inherited `GIT_DIR` beats `cwd` and git reads ANOTHER repository. IF you add a git call, pass that env — `git-env-door-gate` reddens otherwise.
⚠️ A file written by a SHELL command is not in `touched` (the harness does not report it): say so to adopters, never guess it.
⚠️ Findings are bounded (`MAX_FINDINGS` 50) and the rest is COUNTED in one more finding, never dropped. Outside a git repository it passes with a stderr note: a judge the agent can never satisfy only burns the nudges.
