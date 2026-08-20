# `service/` — the three OS units for the HTTP lane

**Nothing here is installed, wired, or running.** These are three files. `src/hooks/http-server.js`
is itself deliberately inert (no `settings.json` entry points at it), and putting it under a
supervisor is a separate, explicit decision of the maintainer, taken at a moment when no agent is
running. This directory only makes that decision *possible* without re-doing the research.

| OS | File | Install to |
|---|---|---|
| Linux | `ctxroute-http.socket` | `~/.config/systemd/user/ctxroute-http.socket` |
| Linux | `ctxroute-http.service` | `~/.config/systemd/user/ctxroute-http.service` |
| macOS | `com.ctxroute.http.plist` | `~/Library/LaunchAgents/com.ctxroute.http.plist` |
| Windows | `ctxroute-http.task.xml` | registered as a scheduled task named `ctxroute-http` |

Each file carries its own reasoning inline. This README holds only what is *common* to the three,
and the two things a file cannot state about itself: what was measured, and what was not.

---

## Socket activation — the one asymmetry that changes the shape of the units

**The problem it solves is ours, and it is daily.** The daemon exits `90` as soon as its own code
changes on disk, which is exactly what an agent working on this repository causes: a refactor is ten
edits in two minutes, hence ten exits. Under an eager supervisor each one opens a window with
*nothing listening*, and a hook that reaches nobody is lost **in silence** — the tool runs, no error
surfaces, the agent never learns it acted without its knowledge. Long enough, the burst hits the
start limit and the supervisor stops bringing the daemon back at all.

**When the OS owns the listening socket, that window cannot exist.** The socket is created by the
supervisor and outlives every death of the service; connections arriving while no instance runs queue
in the kernel backlog instead of being refused, and the arrival of one is what starts the next
instance. There is no restart loop left to rate-limit, and stale code becomes impossible by
construction — every instance is born after the change.

| OS | Mechanism | Available to us? | Source, read 2026-08-20 |
|---|---|---|---|
| Linux | `.socket` unit + `$LISTEN_FDS`/`$LISTEN_PID` | **Yes — shipped** | systemd.socket(5) and sd_listen_fds(3), systemd 261~rc1, pages dated 2026-05-24 |
| macOS | plist `Sockets` + `launch_activate_socket` | **No — C API only** | Apple, *Creating Launch Daemons and Agents* (**archived**, 2016-09-13) |
| Windows | none | **No** | Node net documentation (v22): *"Listening on a file descriptor is not supported on Windows."* |

**Linux — the contract, verbatim.** sd_listen_fds(3): `#define SD_LISTEN_FDS_START 3`, and the
function "checks whether the *$LISTEN_PID* environment variable equals the daemon PID. If not, it
returns immediately." That pid comparison is not a formality: the variables are **inherited**, so a
process whose parent was socket-activated sees them and would otherwise listen on a descriptor nobody
gave it. `http-server.js` reads the protocol and nothing else — no probe, no "does fd 3 look like a
socket".

**`Accept=no` is the setting the whole lane depends on.** systemd.socket(5): "If yes, a service
instance is spawned for each incoming connection […] If no, all listening sockets themselves are
passed to the started service unit, and only one service unit is spawned for all connections."
`Accept=yes` is the inetd model — one node startup per frame, i.e. the ~330 ms this lane exists to
delete, paid again with a supervisor on top.

**macOS — a capability we declare rather than simulate.** launchd has the same feature, but the
descriptors are retrieved through `launch_activate_socket`, a C function of the XPC framework; there
is no environment protocol to read. Measured 2026-08-20 on Node 22.15.1: scanning the 54 builtin
modules for any export matching `/launch|activate_socket|listen_fds/` returns **nothing**, and
"launchd" appears nowhere in the `net` documentation. A native addon would close the gap and is
refused — this framework installs from a plain clone. The plist therefore carries **no** `Sockets`
key: declaring one would make launchd hold a socket the daemon can never accept from, while the
process bound its own port and the file described something that was not happening.

**Windows — nothing, and the Node side settles it anyway.** Task Scheduler's action contract is a
command line; there is no element that creates or hands over a descriptor. WAS / net.tcp activation
exists but activates managed WCF applications hosted under IIS, never a bare `node.exe`. Both OSes
keep the eager model and keep the silent window with it; that is a stated gap, not a solved one.

## The five things every unit must declare, and why

1. **Start at the user's login — a user service, never a system one.** The daemon reads the user's
   documents and writes the user's state directory. A system-scope service runs outside that home
   and is wrong on every path it touches.
2. **The daemon must come back after an exit code 90**, which is what it uses when it detects that
   its own code changed on disk. It refuses to exit `0` for that: a supervisor only restarts a
   **failure**, and `exit 0` reads as *"the job is done"*. ⚠️ **The mechanism is no longer the same
   on the three**: on Linux nothing restarts it at all — the next connection starts a fresh instance,
   because systemd holds the socket (see above). On macOS and Windows the supervisor restarts it
   eagerly. See the table below.
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
**kernel** with `EADDRINUSE` — which `http-server.js` deliberately lets kill the process. ⚠️ Under
socket activation that refusal simply *moves*: the daemon never binds, and systemd is the one
guaranteeing a single instance (`Accept=no` ⇒ *"only one service unit is spawned for all
connections"*). It is still the OS deciding, never us. A timeout
is admissible only for the **alive-but-wedged** case (the undecidable one) and must say so where it
is written; it is never a verdict about a healthy process.

---

## Does exit 90 actually trigger the restart? — measured, per OS

| OS | Mechanism | Does the daemon come back? | Source, read 2026-08-20 |
|---|---|---|---|
| Linux | socket activation (`Restart=no`) | **Yes — at the next connection** | systemd.service(5) + systemd.socket(5), systemd 261~rc1, pages dated 2026-05-24 |
| macOS | `KeepAlive` → `SuccessfulExit=false` | **Yes** | Apple TN2083 (**archived**, 10.5-era examples) |
| Windows | `RestartOnFailure` | **No** | [MS-TSCH] *RestartOnFailure*, page updated 2024-04-23 |
| Windows | `EventTrigger` on event `201` | **By design — not verified without installing** | Task Scheduler schema, *Subscription (eventTriggerType)* |

**Linux — the row that changed on 2026-08-20, and why.** It used to read `Restart=on-failure`, and
systemd.service(5) does say *"If set to on-failure, the service will be restarted when the process
exits with a non-zero exit code […]"* — so it worked. **It was also the burst**: an eager restart
puts a fresh instance back one second after each stale-code exit, straight into the `git pull` that
is still rewriting files. Under socket activation nothing restarts (`Restart=no`, the documented
default) because nothing needs to: systemd holds the socket and the next connection starts a fresh
instance, once, when there is actually work.

⚠️ **What can still refuse a start is the start LIMIT, not the `failed` state.** systemctl(1): a
failed unit's status is recorded *"until the service is stopped/re-started"*, while `reset-failed` is
needed *"if a unit's start limit […] is hit and the unit refuses to be started again"*. The unit's
`StartLimitBurst=` is sized in **actions** (16 frames = up to 16 activations for one action), and the
socket's `TriggerLimitBurst=` likewise — the stock 20 is reachable by an ordinary action, and
systemd.socket(5) is explicit about the cost: *"If the limit is hit, the socket unit is placed into a
failure mode, and will not be connectible anymore until restarted."*

### Why the exit code is 90 — the units are the reason

The first choice was `75` (`EX_TEMPFAIL`), and writing these files on 2026-08-20 is what exposed it
as a trap. systemd gives 75 a **named alias**, and systemd's own manual carries as **Example 1**:
*"Exit status 75 (TEMPFAIL), 250, and the termination signal SIGKILL are considered clean service
terminations."*

Copying a manual's example into your unit is not a mistake — it is the **normal way to read a
manual**. With 75, that ordinary gesture would have declared our restart signal a *clean*
termination: the supervisor reads "job done", the daemon stays down after every code change, and
`systemctl status` shows green while nobody is being served. ⚠️ That danger did **not** leave with
`Restart=on-failure`: the two other units still restart on a non-zero status, and on Linux the exit
status is what tells an operator reading `systemctl status` whether the daemon stood down or
succeeded.

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
# 🛑 THE SOCKET, NEVER THE SERVICE. Enabling the service would start the daemon
#    eagerly at login and give back the window this whole design removes.
systemctl --user enable --now ctxroute-http.socket
systemctl --user status ctxroute-http.socket ctxroute-http.service
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

**Changing the port.** Linux: `ListenStream=` in the **socket** unit — that is the address systemd
binds, and the `Environment=` line in the service only covers a daemon started without the socket
(keep the two equal, a disagreement is invisible). macOS: `EnvironmentVariables` in the plist.
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
- **Linux, socket activation end to end.** No systemd was involved: no socket unit was ever loaded,
  no service was ever activated by a connection. What *is* measured is the half that lives in our
  code — a real listening socket, really inherited on descriptor 3 by a real child process, with the
  two environment variables set exactly as the protocol prescribes
  (`test/http-socket-activation.test.js`, which also proves a foreign `LISTEN_PID` is refused). That
  suite cannot run on Windows (Node: *"Listening on a file descriptor is not supported on Windows"*),
  so on the maintainer's machine it is the CI matrix (ubuntu · macos) that executes it — **at the
  time of writing it had never run on a Linux kernel here**, because this machine has no Node inside
  its WSL image. Before switching over, run it on the target Linux box.
- **Linux, the three things only a real systemd can answer.** ① That a unit sitting in `failed` after
  an exit code 90 is really re-activated by the next connection — systemctl(1) says the failed state
  is recorded *"until the service is stopped/re-started"* and that only the start limit makes a unit
  *"refuse to be started again"*, which is why `Restart=no` was chosen, but it was not observed. If
  it turns out otherwise, the repair is one line (`Restart=on-failure`) and it restores exactly the
  previous behaviour. ② That connections really queue during the gap instead of being refused.
  ③ That the backlog survives long enough on that machine.
- **Linux, the two burst thresholds.** `StartLimitBurst=` on the service and `TriggerLimitBurst=` on
  the socket are reasoned from the declared frame count (16) and from how git rewrites files during a
  pull, not counted on a real pull. If the unit refuses to start, or the socket lands in failure mode
  after an ordinary update, those are the numbers to measure.
- **That the absence of the daemon is observable.** It is not, and that is measured, not assumed:
  with nothing listening the tool simply runs and the agent never learns it acted without its
  knowledge. A hook declaration is `command` **or** `http`, never both, so there is no fallback to
  the spawn lane. Installing these units does not change that — see `docs/framework/http-lane.md`.
