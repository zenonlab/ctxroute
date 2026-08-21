---
match: [vendor-deadline.js, vendor-deadline.test.js, deadline-vendor.test.js, hooks-fleet-gate.test.js]
scope: [ctxroute]
mode: dumb
rank: 541
---
# vendor-deadline.js + fleet gates — vendoring the deadline

⚠️ COPY, NEVER a `require()` towards this repo: the hooks in `~/.claude/hooks/` MUST NOT depend on an absolute path to a PUBLIC repo (it moves → they die). `deadline.js` is standalone ON PURPOSE so it can be copied. The personal environment is never hostage to the framework.
⚠️ The copy is acceptable ONLY thanks to the drift test (`deadline-vendor.test.js`): without it, fixing the original would no longer fix the 7 hooks and NOTHING would say so. Never delete it "because it gets in the way".
⚠️ DRY-RUN by default, `--write` to apply. These files are IN PROD: other agents execute them at every tool call. Idempotent: replaying never doubles an `arm()`.
⚠️ INSERTION *BEFORE* the 1st executable line, NEVER after (`idx+1`): a statement can span several lines (`const LOCK_RE = new RegExp(`) → inserting after its 1st line cuts it in two. Experienced 2026-07-15.
⚠️ "The process dies" DOES NOT PROVE "it works" — a process that CRASHES dies too. The death test was GREEN on a broken `browser-recover.js`. KEEP all 3: `node --check` (syntax) + the fleet's 9 suites before/after (regression) + the spawn (death). Never one without the others.
⚠️ NEVER a guessed patch: no safe insertion point ⇒ the script REPORTS it (`MANUELS`), a human decides. The gate requires `MANUELS: 0` — a fleet covered at 86% leaves a zombie possible.
⚠️ Fleet gates SKIPPED on a fresh clone (public repo: it must never require `~/.claude/hooks/`). Skipping is NOT failing — they scream at the maintainer's, where the fleet exists.
⚠️ The TARGET directory comes from `paths.fleetHooksDir()`, resolved LAZILY inside `main()` — never a local `os.homedir()` and never a module-level const. This script WRITES there: a second definition of that path would arm the wrong fleet in silence. Override = `CTXROUTE_FLEET_HOOKS_DIR` (tests/doctor only; `VENDOR_TARGET_DIR` retired 2026-08-21).
`npm run test:fleet` = fleet gate + drift + proof on a copy. Outside `npm test` (slow spawns).
