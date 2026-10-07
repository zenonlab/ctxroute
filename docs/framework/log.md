---
rules: [{"pattern":"/log.js","scope":["ctxroute"]},{"pattern":"/log.test.js","scope":["ctxroute"]}]
mode: smart
threshold: 40
---
# log.js — THE ONLY DOOR TO A JOURNAL ON DISK (2026-10-04, work item K)

🔑 **ONE WRITER FOR EVERY JOURNAL.** Which journal and event exist = `log-journals-pure.js`; setting, level, format, rotation plan = `log-pure.js` (both pure, mutated 100 %). This file only reads the config, stats, renames, removes and appends. 🛑 **IF you need a new journal or event, you MUST add it to `log-journals-pure.journals()` and call `log.write(journal, event, fields)`** — an append anywhere else is RED (`journal-writer-gate.test.js`, AST, one append allowed, here).
🛑 **FAIL-OPEN, NEVER A THROW**: `write` returns a boolean. A full disk, a read-only dir, a locked file, an unreadable config = no line (or a line on the defaults), the caller carries on.
🛑 **ERRORS ARE WRITTEN AT EVERY LEVEL; `debug` ONLY ADDS THE TRACE** (operator decision 2026-10-04). Never put an error behind `debug`: a failure at night with debug off must leave its line.
⚠️ **THE SETTING IS RE-READ WHEN THE CONFIG CHANGES** (cache keyed by path + size + mtime): debug on/off takes effect at the next record, daemon included, no restart. 📐 Cost measured 2026-10-04: **49 µs per `enabled()` call with debug off** (one `stat`, ~0.5 % of a 9.3 ms daemon request); debug on, isolated daemon, 1,500 requests × 3 rounds: median **9.33 → 9.44 ms** (+0.1 ms, inside the 8.8-9.7 ms round-to-round noise).
⚠️ **A REFUSED SETTING IS SAID ONCE PER PROCESS AND REASON** (`logging-refused`, in the journal itself), and the journal runs on the defaults — never on a guess.
⚠️ **THE ROTATION TAKES A LOCK (`.lock-log-<file>` via `lock.js`), THE APPEND DOES NOT.** Several hook processes share `ctxroute-hooks.log`; two unlocked rotations would shift twice and lose a generation. Size asked AGAIN under the lock. Lock unavailable ⇒ no rotation this time, the line is still written.
⚠️ **`hookError(hook, err)` IS THE ONE WAY A HOOK RECORDS A FAILURE**: message, `code`, FIRST stack frame only (a full stack carries the home path once per frame), pid. It never changes what the hook outputs or its exit code.
⚠️ `opts.settings` / `opts.file` / `opts.now` are TEST injection points (unbounded on purpose: a rotation test needs a 40-byte ceiling). 🛑 Never promote them to configuration.
✅ Proven by `log.test.js`: refusals, level read from a real config and toggled live, refusal journalled once, rotation by overflow at 4/3/1 files, a LOWERED `keptFiles` deleting its stranded generations (bytes freed measured), 4 processes rotating one journal (bounded, every line whole, no lock left).
⚠️ **`daemonError(site, err)` IS THE DAEMON'S TWIN** (`ctxroute-daemon.log`, event `daemon-error`, field `site`). 🛑 **BOTH ARE ONE LINE PER DISTINCT FAILURE AND PROCESS** (`reportOnce`, key = journal + event + hook/site + message + code, at most 256 keys then lines resume): a failure repeating on every daemon request would otherwise rotate every OTHER error out. A spawned hook is one process per event, so it always writes. Who calls them is held by `silent-catch-gate`.
