---
rules: [{"pattern":"matcher-suite-check.js","scope":["ctxroute"]},{"pattern":"matcher-suite-check.test.js","scope":["ctxroute"]}]
mode: smart
threshold: 20
---
# matcher-suite-check.js — the linked package's suite runs, or nothing guards the matcher

🔴 **WHY IT EXISTS**: the anti-leak matcher left this repo for `@zenon-lab/personal-data-guard`,
linked with `file:` — hence **editable locally**. Its 28 tests ran in NO entry point of ctxroute, so
the matcher could be broken with nothing going red on the consumer side. Wired as `pretest`, so it
fires before `npm test` without anyone remembering to call it.
⚠️ **ABSENT SIBLING ⇒ NAMED MESSAGE, exit 0** — a clean clone and CI legitimately lack the folder,
and a hook that breaks the first command of whoever clones the repo gets uninstalled. 🛑 But never a
SILENT skip: "I could not measure" must never read as "it is healthy".
⚠️ **~1.6 s measured.** This repo uninstalls what is slow. Do NOT add other suites here.
⚠️ The package is resolved through its declared `exports`, then walked up to its `package.json` — a
plain `/package.json` subpath is BLOCKED by that package's own exports map. Do not "simplify" it
back to a path join: the sibling is a real dependency, addressed as one.
