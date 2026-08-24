---
match: pre-commit
scope: ["ctxroute"]
mode: dumb
rank: 567
---
# .githooks/pre-commit — one of the TWO BLOCKING gates in the repo
⚠️ **THE SECOND ONE IS `commit-msg` (24/08/2026)** — it refuses a commit message that is not in English. Same reason as this one: what a commit records is IRREVERSIBLE once pushed, and this history is read by every fork. 🛑 The rule *gates never block* still holds for everything else — these two derogate because they guard the only gestures this repository cannot take back. Keep both FAST (~0.9 s and ~1.7 s measured): the day a hook costs 10 s it gets uninstalled.

🔴 **REASON FOR EXISTING**: the anti-leak gate existed and was CORRECT — it had never RUN. Nothing triggered it between writing and pushing (`.git/hooks` empty, no husky) ⇒ a client's name + email slept ~12 h in a TRACKED file of a PUBLIC repo (2026-08-10).
🛑 **IT DEROGATES FROM "gate NEVER blocking", AND THAT IS ARGUED**: the rule targets COST (husky full-suite ≈ 40 s) — here ONE test file, **~0.9 s measured**. And the damage avoided is the only one in the repo that is IRREVERSIBLE: you cannot unpublish. Do NOT add other suites to it: the day it costs 10 s, it ends up uninstalled.
🛑 **IT IS THE ONLY POSSIBLE PLACE FOR THE "NAMES" HALF**: an email is caught by CI (generic pattern), but a client NAME cannot be — private terms never travel into a public repo, so CI necessarily runs in generic mode.
⚠️ **NEVER A PIPE** (`| tail`, `| grep`) around vitest: in sh the return code is that of the LAST link ⇒ a failure would pass for a success and the gate would become DECORATIVE. Capture into a file, THEN decide.
⚠️ **FAIL-OPEN without `node_modules`** (fresh clone): it lets things through WHILE SAYING SO. A hook that breaks the 1st commit of whoever clones the repo is a hook that gets uninstalled — and an uninstalled gate protects zero.
⚠️ **Installed by the `prepare` script** (`core.hooksPath .githooks`): an unversioned hook does not survive a clone. Mode **`100755` in the git INDEX** (Windows has no execute bit — check it with `git ls-files -s`, never on disk).
⚠️ `--no-verify` remains LEGITIMATE in an emergency, but must stay a CONSCIOUS action: never automate it (lesson ㉝ — a rule bypassed by default is worse than no rule).
