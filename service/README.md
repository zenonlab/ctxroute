# `service/` — the three OS units for the HTTP lane

**Nothing here is installed, wired, or running.** These are three files. `src/hooks/http-server.js`
is itself deliberately inert (no `settings.json` entry points at it), and putting it under a
supervisor is a separate, explicit decision of the maintainer, taken at a moment when no agent is
running. This directory only makes that decision *possible* without re-doing the research.

| OS | File | Install to |
|---|---|---|
| Linux | `ctxroute-http.service` | `~/.config/systemd/user/ctxroute-http.service` |
| macOS | `com.ctxroute.http.plist` | `~/Library/LaunchAgents/com.ctxroute.http.plist` |
| Windows | `ctxroute-http.task.xml` | registered as a scheduled task named `ctxroute-http` |

Each file carries its own reasoning inline. This README holds only what is *common* to the three,
and the two things a file cannot state about itself: what was measured, and what was not.

---

## The five things every unit must declare, and why

1. **Start at the user's login — a user service, never a system one.** The daemon reads the user's
   documents and writes the user's state directory. A system-scope service runs outside that home
   and is wrong on every path it touches.
2. **Restart on failure, exit code 90 included.** The daemon exits `90` when it detects that its own
   code changed on disk, and it refuses to exit `0` for that: a supervisor only restarts a
   **failure**, and `exit 0` reads as *"the job is done"*. See the table below — the answer is not
   the same on all three.
3. **A clean stop**, which on all three is: the supervisor signals, the process dies on the runtime's
   default handling. No handler is registered because there is nothing to flush.
4. **A log bounded by the OS's own tool**, declared in the same gesture as the service. A component
   that writes without a ceiling is an architecture bug, not an operations chore — and the ceiling is
   never a homemade cleaner.
5. **The port through the environment** (`CTXROUTE_HTTP_PORT`, default `8787`), because that is what
   a *wiring* can express: the harness hook URL on the other end carries the same number.

## What is forbidden in all three, and will stay forbidden

No health check. No heartbeat. No liveness probe. No PID file. No *"is it already running?"* test.
No `kill` on a process presumed dead. The OS supervises, and a duplicate instance is refused by the
**kernel** with `EADDRINUSE` — which `http-server.js` deliberately lets kill the process. A timeout
is admissible only for the **alive-but-wedged** case (the undecidable one) and must say so where it
is written; it is never a verdict about a healthy process.

---

## Does exit 90 actually trigger the restart? — measured, per OS

| OS | Mechanism | Does `90` restart? | Source, read 2026-08-20 |
|---|---|---|---|
| Linux | `Restart=on-failure` | **Yes** | systemd.service(5), systemd 261~rc1, page dated 2026-05-24 |
| macOS | `KeepAlive` → `SuccessfulExit=false` | **Yes** | Apple TN2083 (**archived**, 10.5-era examples) |
| Windows | `RestartOnFailure` | **No** | [MS-TSCH] *RestartOnFailure*, page updated 2024-04-23 |
| Windows | `EventTrigger` on event `201` | **By design — not verified without installing** | Task Scheduler schema, *Subscription (eventTriggerType)* |

**Linux — verbatim:** *"If set to on-failure, the service will be restarted when the process exits
with a non-zero exit code, is terminated by a signal […]"*. 90 is non-zero, so it restarts.

### Why the exit code is 90 — the units are the reason

The first choice was `75` (`EX_TEMPFAIL`), and writing these files on 2026-08-20 is what exposed it
as a trap. systemd gives 75 a **named alias**, and systemd's own manual carries as **Example 1**:
*"Exit status 75 (TEMPFAIL), 250, and the termination signal SIGKILL are considered clean service
terminations."*

Copying a manual's example into your unit is not a mistake — it is the **normal way to read a
manual**. With 75, that ordinary gesture would have declared our restart signal a *clean*
termination: `Restart=on-failure` reads "job done", the daemon stays down after every code change,
and `systemctl status` shows green while nobody is being served.

The answer was **not** to write *"never use `SuccessExitStatus=`"* here and hope. Prose is not a rule;
it drifts, and this repository has already paid for that. **90 sits outside every alias systemd
defines and outside that example, so the copy-paste can no longer reach us** — the error is
impossible by construction instead of discouraged. The quotation above stays because it is true and
dated: it is the *reason we avoid 75*, not a hazard aimed at our code.

`SuccessExitStatus=` is still absent from the unit, and that absence is now enforced by
`test/service-units-gate.test.js` rather than requested — same file that derives `90` from
`src/hooks/http-server.js` so this README cannot drift from it.

**macOS — the key is easy to read backwards.** `SuccessfulExit=true` means *restart after a
successful exit*; we need its mirror, `false`, so that only a non-zero exit brings the agent back.

**Windows — the documented answer is no, and it matters.** The Learn page for `RestartOnFailure`
says only *"if the task fails for any reason"*, which invites the assumption. The normative spec is
explicit: *"If the task fails to run because one of the start conditions is not met […] or because of
a failure to start an action, the operation is attempted again."* An action that started, ran and
exited 90 is a task that **completed**. `RestartOnFailure` is still declared in the task — it covers
the failure-to-*start* case, which is real — but the exit-code restart comes from a second trigger
subscribed to the Task Scheduler's own *action completed* event (`201`), which carries the
`ResultCode`. The OS still tells us; we never poll and never infer.

## Why Windows uses Task Scheduler and not a Windows Service

A bare `node.exe` **cannot** be a Windows Service. The SCM does not merely start a process, it waits
to be spoken to — `StartServiceCtrlDispatcher` (page updated 2025-07-01): *"When the service control
manager starts a service process, it waits for the process to call the StartServiceCtrlDispatcher
function. The main thread of a service process should make this call as soon as possible after it
starts up (within 30 seconds)."* A process that never calls it gets
`ERROR_FAILED_SERVICE_CONTROLLER_CONNECT` — *"returned if the program is being run as a console
application rather than as a service."* Third-party service wrappers (nssm, winsw) exist and are
**refused**: they insert an unversioned supervisor into a framework whose premise is that the OS
supervises. Task Scheduler is the native path.

---

## Bounding the log — the OS tool, never a homemade cleaner

The daemon prints nothing in normal operation, so these ceilings guard against a pathological loop,
not against daily traffic. They still get declared: *"we'll purge later"* means a human in the loop.

**Linux.** Output goes to the journal (systemd's default). The ceiling and the rotation already
exist and belong to journald — journald.conf(5), systemd 261~rc1, 2026-05-24: `SystemMaxUse=`
defaults to 10% of the filesystem capped at 4G, `SystemMaxFiles=` to 100, `MaxFileSec=` rotates after
one month. The unit adds only a **per-unit rate bound** (`LogRateLimitIntervalSec` /
`LogRateLimitBurst`), because a disk ceiling is a ceiling and never a slope: a crash loop can burn a
month of retention in an hour and evict everyone else's logs. To tighten the disk ceiling itself,
that is journald's file, not ours:

```ini
# /etc/systemd/journald.conf.d/ctxroute.conf   (system-wide, needs root)
[Journal]
SystemMaxUse=200M
MaxFileSec=1week
```

**macOS.** `StandardOutPath` / `StandardErrorPath` are deliberately **unset**. A plist log path is a
plain file that launchd never rotates and never caps — a monotonic writer on a machine that runs for
years. Left unset, output goes to the system log, which macOS caps and rolls over itself
(TN2083: *"launchd will capture any output to these streams and redirect it to ASL"*). Read it with
`log show --predicate 'process == "node"' --last 1h`.

**Windows.** Task Scheduler does not capture the action's stdout, so the process writes nothing to
disk. The bounded record is the Task Scheduler Operational channel — and enabling that channel is
*also* what arms the restart trigger, so the ceiling and the mechanism are declared in one gesture
(elevated shell, once):

```powershell
wevtutil sl "Microsoft-Windows-TaskScheduler/Operational" /e:true /rt:false /ms:8388608
```

`/e:true` enables the channel (**without it the `201` event never appears and the restart trigger is
inert, silently**), `/rt:false` overwrites the oldest events when full — that is the rotation —
and `/ms:` is the ceiling in bytes.

---

## Installing (for the day the switch-over is decided)

Edit the paths first — every file has `CHANGE_ME` markers or a distribution-dependent binary path.

**Linux**

```sh
systemctl --user daemon-reload
systemctl --user enable --now ctxroute-http
systemctl --user status ctxroute-http
```

**macOS**

```sh
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.ctxroute.http.plist
launchctl print gui/$(id -u)/com.ctxroute.http
# stop:
launchctl bootout gui/$(id -u)/com.ctxroute.http
```

**Windows** (no elevation needed to register a task for yourself)

```powershell
Register-ScheduledTask -TaskName 'ctxroute-http' -Xml (Get-Content -Raw .\ctxroute-http.task.xml)
Get-ScheduledTask -TaskName 'ctxroute-http' | Get-ScheduledTaskInfo
```

Use `Register-ScheduledTask`, not `schtasks /Create /XML`: this file is UTF-8 and says so, while
`schtasks` expects the UTF-16 that Task Scheduler exports.

**Changing the port.** Linux: `Environment=` in the unit. macOS: `EnvironmentVariables` in the plist.
Windows: the task XML has **no element for it** — Task Scheduler simply has no such key, so the
action inherits the user environment (`setx CTXROUTE_HTTP_PORT 9001`, then log out and back in).
That asymmetry is stated rather than simulated. Whichever OS: the harness's hook URL carries the same
number, and the two ends must agree.

---

## What could NOT be verified without installing

Stated so nobody inherits these as facts:

- **That any of the three units actually starts the daemon.** Nothing here was installed, registered
  or run. They are correct against the documentation, not against a machine.
- **Windows, the `201` XPath.** That the `EventData` filter on `ResultCode` and `TaskName` matches a
  real event was not measured. Check with `wevtutil qe "Microsoft-Windows-TaskScheduler/Operational"`
  against a genuine 201 event before relying on it.
- **Windows, the environment.** Whether a task started at logon picks up a `setx` performed in a
  previous session.
- **macOS, everything.** No Mac was involved. Worse, Apple's web copies are **archived**: *Creating
  Launch Daemons and Agents* last updated 2016-09-13, TN2083 marked *"no longer being updated"* with
  10.5-era examples, and `launchd.plist(5)` is not published at a current URL at all. The authority
  is `man launchd.plist` **on the target Mac**. That is why the plist restates none of launchd's
  default values (`ThrottleInterval`, `ExitTimeOut`) — an archived page is least trustworthy exactly
  there.
- **Linux, the burst threshold.** `StartLimitBurst=20` is reasoned from how git rewrites files during
  a pull, not counted on a real pull. If the unit ever lands in `failed` after an ordinary update,
  that number is the one to measure.
- **That the absence of the daemon is observable.** It is not, and that is measured, not assumed:
  with nothing listening the tool simply runs and the agent never learns it acted without its
  knowledge. A hook declaration is `command` **or** `http`, never both, so there is no fallback to
  the spawn lane. Installing these units does not change that — see `docs/framework/http-lane.md`.
