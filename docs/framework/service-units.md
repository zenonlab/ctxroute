---
rules: [{"pattern":"ctxroute-http.service","scope":["ctxroute"]},{"pattern":"com.ctxroute.http.plist","scope":["ctxroute"]},{"pattern":"ctxroute-http.task.xml","scope":["ctxroute"]},{"pattern":"service/","scope":["ctxroute"]},{"pattern":"service-units-gate.test.js","scope":["ctxroute"]}]
mode: dumb
---
# service/ — the 3 OS units of the HTTP lane. NOTHING IS INSTALLED (2026-08-20).
🛑 Never add a health check, heartbeat, PID file or "is it already running?" probe: the OS supervises, and the KERNEL refuses a duplicate with `EADDRINUSE`. The only admissible delay is the alive-but-wedged one, and it says so where it is written.
🔴 **THE EXIT CODE IS 90, AND 75 IS THE TRAP IT AVOIDS.** 75 is `EX_TEMPFAIL`, which systemd ALIASES and puts in its own manual as Example 1 — *"Exit status 75 (TEMPFAIL), 250 … are considered clean service terminations"* (systemd 261~rc1, page 2026-05-24). Copying a manual's example is the NORMAL gesture; with 75 it silently turned our restart into "job done". 90 is outside every alias and that example ⇒ impossible by construction, not discouraged.
🛑 Never re-type the number: `test/service-units-gate.test.js` DERIVES it from `EXIT_STALE_CODE` (`src/hooks/http-server.js`), forbids an active `SuccessExitStatus=` in the unit, and reddens on any stale literal here or in `service/`. A retired code stays writable ONLY in the manual's own wording (`Exit status N`) — asserting it of our daemon (`exits N`) is RED, the hole that let the first version certify a drift.
📐 Exit 90 restarts on Linux (`Restart=on-failure`, non-zero ⇒ restart) and macOS (`KeepAlive`/`SuccessfulExit=false`, TN2083 — ARCHIVED, 10.5-era).
🔴 On Windows it does NOT: [MS-TSCH] 2024-04-23 restarts only when a start condition fails or an action FAILS TO START — a task that ran and exited is a task that COMPLETED. The exit-code restart is the `EventTrigger` on Operational event 201, and that XPath is UNVERIFIED without installing.
🛑 Keep `ExecutionTimeLimit=PT0S` ("run indefinitely") and both battery flags `false` in the Windows task: the schema defaults (PT72H, batteries `true`) kill a long-lived daemon SILENTLY, three days after each boot or the moment the cable is pulled.
⚠️ Enabling the Operational channel is what ARMS that trigger — a disabled channel means no event, hence no restart, with nothing to see.
⚠️ Bound the log with the OS tool ONLY: journald (`SystemMaxUse`/`MaxFileSec`) · macOS unified log (leave `StandardOutPath` UNSET — a plist log file is never rotated) · `wevtutil sl … /e:true /rt:false /ms:`.
⚠️ A bare `node.exe` can NEVER be a Windows Service (`StartServiceCtrlDispatcher` within 30 s, else `ERROR_FAILED_SERVICE_CONTROLLER_CONNECT`): Task Scheduler is the native path and a third-party service wrapper is refused. Do not reopen.
⚠️ Read `service/README.md` before installing: it lists what was NOT verified without a machine — no unit was ever started, and no Mac was involved.
