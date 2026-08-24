---
inject: never
---
# Should the daemon be a Windows SERVICE instead of a scheduled task? — MEASURED ANSWER: NO (2026-08-22)

ON-DEMAND research record. It exists so this question is never re-opened from intuition. The short
invariants live in `service-units.md` and `http-lane.md`; here is the full measurement.
**Every path below is written with `<user>` on purpose: this repository is PUBLIC.**

## THE QUESTION

On Windows the daemon (`src/hooks/http-server.js`) is supervised by a scheduled task
(`LogonType: Interactive`, `RunLevel: Limited`, LogonTrigger + EventTrigger restarting it on a
non-zero result). It exits often BY DESIGN — `watchOwnCode` makes it leave the moment the repo's
code changes, so it can never serve stale logic. On Linux systemd socket activation makes that free
and invisible; **Windows has no equivalent** (`service-units.md`, enumerated 2026-08-20, do not
re-research). The console-window flash was fixed on 2026-08-21 by a `wscript.exe` + hidden VBS
launcher that WAITS and PROPAGATES the exit code. That works, and it is a patch, not a model.

So: **should the daemon become a real Windows SERVICE, and is that even viable here?**

## VERDICT

🛑 **NO. A service is NOT viable, and the scheduled task + hidden launcher IS the right model on
Windows.** Three independent facts close it, and any ONE of them is sufficient. This is a measured
negative: it is meant to stop the question coming back.

## FACT ① — `node.exe` CANNOT BE A SERVICE AT ALL. The premise fails before the trade-offs.

A service process must connect to the SCM almost immediately or the SCM kills it.
**Source: `StartServiceCtrlDispatcherA` (winsvc.h), learn.microsoft.com, `ms.date` 2018-12-05,
page updated 2025-07-01** — <https://learn.microsoft.com/en-us/windows/win32/api/winsvc/nf-winsvc-startservicectrldispatchera>:

> "When the service control manager starts a service process, it waits for the process to call the
> **StartServiceCtrlDispatcher** function. The main thread of a service process should make this
> call as soon as possible after it starts up (within 30 seconds)."

and, on the return value:

> "**ERROR_FAILED_SERVICE_CONTROLLER_CONNECT** — This error is returned if the program is being run
> as a console application rather than as a service."

`node.exe` never calls it. ⇒ "make it a service" is never one command; it is **always** a
third-party wrapper (NSSM, WinSW, node-windows, pm2). `service-units.md` already refuses all of them
BEFORE the capability question, and the reason survives re-examination: **each one inserts its own
supervisor — watching, restarting, a PID file — which is the exact layer this architecture deletes.**
The doctrine argument that motivated the service ("do not reimplement what the OS already does")
therefore **argues against it**: on Windows a service is not the OS doing the work, it is a
third-party daemon-babysitter doing it, with the SCM behind it.

## FACT ② — SESSION 0 DESTROYS THE CORPUS. This is the decisive one, and its failure mode is SILENT.

The daemon resolves everything through `src/paths.js`, which anchors three harness roots at
`os.homedir()`: `fleetHooksDir()` (⇒ `fileDocsDir()`), `transcriptsDir()`, `skillsDir()`.

**Node, `os.homedir()`, official docs for the INSTALLED version (v22.x; measured runtime
`v22.15.1`)** — <https://nodejs.org/docs/latest-v22.x/api/os.html>:

> "On Windows, it uses the `USERPROFILE` environment variable if defined. Otherwise it uses the path
> to the profile directory of the current user."

**LocalSystem is not associated with a user.** Source: `LocalSystem Account`, learn.microsoft.com,
`ms.date` 2018-05-31, updated 2025-04-15 —
<https://learn.microsoft.com/en-us/windows/win32/services/localsystem-account>:

> "The account is not associated with any logged-on user account. This has several implications:
> The registry key **HKEY_CURRENT_USER** is associated with the default user, not the current user."

📐 **MEASURED ON THIS MACHINE, 2026-08-22, read-only registry:**
`HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\S-1-5-18` →
`ProfileImagePath = C:\WINDOWS\system32\config\systemprofile`
(and `S-1-5-19` / LocalService → `C:\WINDOWS\ServiceProfiles\LocalService`).

📐 **MEASURED, same day, what is at stake:** under the real interactive home,
`<home>\.claude\hooks\docs` holds **512 `.md` files** and `<home>\.claude\commands` holds
**45 skills**. Under `C:\WINDOWS\system32\config\systemprofile` there is **no `.claude` directory at
all** (`Test-Path` → `False`).

🛑 **CONSEQUENCE: a LocalSystem service would resolve the file-doc corpus and the skill store to
empty directories, and the engine is FAIL-OPEN.** No error, no red gate, no badge — the daemon
answers every frame with nothing, forever, looking perfectly healthy. That is precisely the failure
class this project refuses outright ("the goal is not zero bugs, it is zero SILENT bugs"), and it is
worse than the current model, which at least restarts loudly.

⚠️ **THE NAMED-USER VARIANT DOES NOT RESCUE IT, AND ITS KEY FACT IS UNMEASURED — SAID PLAINLY.**
Running the service as `<user>` would in principle give the right `USERPROFILE`, but **what the SCM
puts in a service's environment block is exactly what I could not measure without creating a
service, which is a production change this investigation was forbidden to make.** What the
documentation does say is that profile loading is not automatic outside an interactive logon —
`LoadUserProfileA`, learn.microsoft.com, `ms.date` 2018-12-05, updated 2024-11-20,
<https://learn.microsoft.com/en-us/windows/win32/api/userenv/nf-userenv-loaduserprofilea>:

> "When a user logs on interactively, the system automatically loads the user's profile. If a service
> or an application impersonates a user, the system does not load the user's profile. Therefore, the
> service or application should load the user's profile with **LoadUserProfile**."

🛑 That sentence is about IMPERSONATION, not about a service configured with a named account — **do
not stretch it into a proof it does not carry.** The honest status is: *the named-user service is
UNPROVEN on the one property the whole daemon depends on.* And that is enough to refuse it, because
a wrong answer here is invisible: it would not crash, it would inject nothing. It also requires
storing an account password in the SCM, which the current model needs nowhere.

## FACT ③ — "NATIVE RESTART POLICY" IS NOT THE UPGRADE IT LOOKS LIKE

`sc failure` recovery is **not** "restart when the process exits non-zero" by default.
**Source: `SERVICE_FAILURE_ACTIONS_FLAG` (winsvc.h), learn.microsoft.com** —
<https://learn.microsoft.com/en-us/windows/win32/api/winsvc/ns-winsvc-service_failure_actions_flag>:
with the flag FALSE, "the failure actions are queued only if the service terminates without
reporting a status of SERVICE_STOPPED"; with it TRUE they are also queued if the service reaches
SERVICE_STOPPED with a `dwWin32ExitCode` other than `ERROR_SUCCESS`.

⇒ under a wrapper, the restart depends on **whether the wrapper reports a clean stop when node exits
90** — a third party's choice, in a code path no session here can see red. That is a NEW silent-no-restart
surface, traded for one we have already proven working:

📐 **MEASURED IN PRODUCTION, 2026-08-22, `Microsoft-Windows-TaskScheduler/Operational`, window
2026-08-21 21:42:57 → 2026-08-22 10:38:41 (12 h 56):** **38 × event 200 (action started)** and
**38 × event 201 (action completed)**, every 201 carrying `ResultCode = 2147942490`.
`2147942490 = 0x8007005A = HRESULT_FROM_WIN32(90)` — arithmetic re-checkable:
`2147942490 − 0x80070000 (2147942400) = 90`. The EventTrigger's XPath filters
`Data[@Name='ResultCode'] != '0'`; 38 starts matching 38 completions means **the loop closed 38
times with no gap**. ~3 restarts/hour at rest, consistent with the 9-in-one-hour burst measured
while the repo was being edited.

🔴 **THIS UPGRADES A DOC STATUS AND `service-units.md` SHOULD BE CORRECTED BY WHOEVER OWNS IT.**
That file still says the event-201 XPath "is UNVERIFIED without installing" (written 2026-08-20).
It is installed and it is now VERIFIED by the 38 pairs above. This page does not edit it — other
agents hold that file — but the line is stale as of 2026-08-22.

⚠️ **AND ONE PART OF THE CURRENT TASK IS DEAD WEIGHT, MEASURED:** the task carries
`RestartCount: 3` / `RestartInterval: PT1M`. Per [MS-TSCH] (2024-04-23, cited in `service-units.md`)
that setting fires only when a task FAILS TO START — a task that ran and exited has COMPLETED. It is
not what brings the daemon back; the EventTrigger is. Harmless, but do not read it as the mechanism.

## THE ARGUMENT THAT IS TRUE, AND WHY IT STILL LOSES

✅ **"A service has no console by construction" is CORRECT.** `Interactive Services`,
learn.microsoft.com, `ms.date` 2018-05-31, updated 2025-04-15 —
<https://learn.microsoft.com/en-us/windows/win32/services/interactive-services>:

> "Services cannot directly interact with a user as of Windows Vista."
> "By default, services use a noninteractive window station and cannot interact with the user."
> "All services run in Terminal Services session 0."

It is true and it is worth **one 12-line VBS file** that already exists and already works. Paying
Fact ① + Fact ② to delete one small file is not a trade, it is a regression.

🛑 **NEVER PASS `False` AS THE THIRD ARGUMENT OF `WshShell.Run`.** The launcher must WAIT and
propagate (`Run(cmd, 0, True)` then `WScript.Quit code`). A non-waiting launcher returns 0
immediately, the task completes with ResultCode 0, the `!= '0'` XPath never matches, **and the
restart-on-90 chain dies in total silence** — the daemon would stop coming back and nothing would
say so. This is the single most dangerous line in the whole Windows lane.

## THE SESSION-ISOLATION QUESTION, ANSWERED — IT IS NOT THE BLOCKER PEOPLE ASSUME

The intuition is that a session-0 daemon could not be reached from the user's session. **The
documentation says the opposite for both transports**, so the refusal above rests on the ENVIRONMENT,
not on the transport. Recording it here so nobody re-litigates it as a capability question.

**`Kernel object namespaces`, learn.microsoft.com, `ms.date` 2018-05-31, updated 2025-04-15** —
<https://learn.microsoft.com/en-us/windows/win32/termserv/kernel-object-namespaces>:

> "Windows has multiple namespaces for the following named kernel objects: events, semaphores,
> mutexes, waitable timers, file-mapping objects, job objects, and symbolic link objects. There is a
> global namespace used primarily by services in client/server applications. In addition, each
> session has a separate namespace for these objects."

🔑 **NAMED PIPES ARE NOT IN THAT LIST.** The per-session namespace covers seven object types and
pipes are none of them. Confirmed by the name format itself — **`Pipe Names`, learn.microsoft.com,
`ms.date` 2018-05-31, updated 2025-04-15** —
<https://learn.microsoft.com/en-us/windows/win32/ipc/pipe-names>:

> "Each named pipe has a unique name that distinguishes it from other named pipes in the system's
> list of named objects."
> "\\\\*ServerName*\pipe\\*PipeName* — where *ServerName* is either the name of a remote computer or a
> period, to specify the local computer."

One system-wide list, and no session component anywhere in the name. **`Named Pipe Security and
Access Rights`, learn.microsoft.com, `ms.date` 2018-05-31, updated 2025-04-15** —
<https://learn.microsoft.com/en-us/windows/win32/ipc/named-pipe-security-and-access-rights> — settles
it by stating the OPPOSITE default explicitly:

> "To prevent remote users or users on a different terminal services session from accessing a named
> pipe, use the logon SID on the DACL for the pipe. The logon SID is used in run-as logons as well;
> it is the SID used to protect the per-session object namespace."

⇒ **cross-session reachability is the DEFAULT; blocking it takes deliberate work.**

⚠️ **BUT THE DEFAULT DESCRIPTOR IS NOT GENEROUS ENOUGH FOR A DUPLEX PIPE, AND THIS IS A REAL CAVEAT.**
Same page:

> "If you specify **NULL**, the named pipe gets a default security descriptor. The ACLs in the
> default security descriptor for a named pipe grant full control to the LocalSystem account,
> administrators, and the creator owner. They also grant read access to members of the Everyone
> group and the anonymous account."

A conversation needs write, and a non-elevated interactive user is not "administrators" nor the
creator owner of a pipe made by LocalSystem. 🛑 **What security descriptor libuv passes when Node
does `server.listen('\\\\.\\pipe\\…')` is NOT documented by Node** — so a session-0 pipe reachable
by the user's agents is an UNPROVEN premise too. Do not assert it either way without measuring.

📐 **THE TCP LANE HAS NO SESSION CONCEPT AT ALL, and that is the lane the harness uses**: Claude
Code's `type:"http"` handler takes a `url`, and a pipe is not an `http://` URL (`service-units.md`,
2026-08-20). Loopback TCP is machine-global; a session-0 service would be reachable on it.

## LIVE MEASUREMENTS OF THE CURRENT MODEL (2026-08-22, read-only)

| What | Measured value |
|---|---|
| Task `ctxroute-http` | `State: Running`, `LogonType: Interactive`, `RunLevel: Limited`, `UserId: <user>` |
| Action | `wscript.exe "<path to your windowless launcher script>"` |
| Settings | `ExecutionTimeLimit PT0S` · `DisallowStartIfOnBatteries False` · `StopIfGoingOnBatteries False` · `MultipleInstances IgnoreNew` |
| Triggers | LogonTrigger + EventTrigger (Operational, `EventID=201` ∧ `TaskName='\ctxroute-http'` ∧ `ResultCode != '0'`) |
| `LastTaskResult` | `267009` = `0x00041301` = `SCHED_S_TASK_RUNNING` (the task is up, not a failure code) |
| Daemon process | one `node.exe` running `<repo>\src\hooks\http-server.js`, **SessionId 1** |
| Transports, both answering | `\\.\pipe\ctxroute-<12 hex>` → CONNECT OK · `127.0.0.1:8787` → LISTENING, CONNECT OK |
| Restart churn | 38 start/complete pairs in 12 h 56, every result `0x8007005A` = exit 90 |
| Node | `v22.15.1`; `os.homedir()` = the real interactive home, `USERPROFILE` identical |
| Comparable services on this box | **none** — zero services whose `PathName` matches node/nssm/winsw, zero services running under a named human account |

🔑 **AND THE CHURN COSTS NOTHING TODAY, WHICH IS EXACTLY WHY IT MUST BE SETTLED BEFORE IT DOES.**
📐 **MEASURED 2026-08-22, read-only:** the operator's `settings.json` contains **41 hook declarations
and all 41 are `type: "command"` — zero `type: "http"`.** So the daemon is supervised, listening on
both transports, restarting 38 times in 13 hours, and **nothing depends on it**: `http-lane.md`'s "NOT
WIRED" is still true for the hook lane. 🛑 **The day the declarations flip to `http`, every one of
those 38 windows becomes a period in which the whole fleet acts with NO injection and NO error** —
`http-lane.md`, "NO DAEMON = TOTAL SILENCE, MEASURED". A service would not shorten those windows by
one millisecond — Windows has no socket activation at all (`service-units.md`, enumerated
2026-08-20 from `SERVICE_TRIGGER`/winsvc.h), so a service queues nothing either. The restart-window
problem is therefore **not** an argument
for a service; it is an argument for the open item `http-lane.md` already names (backlog 60 ②):
making that absence OBSERVABLE. **Do not conflate the two.**

🔬 **ONE FALSE ALARM, KEPT AS A WARNING.** A first probe of the pipe answered `ENOENT` and looked
like a dead rendezvous. It was **my own backslash escaping** inside a `node -e "…"` string, not a
gap: re-probed from a script file with the address taken from `kernel-endpoint.endpoint()` itself,
it answers `CONNECT OK`. 🛑 **Never hand-write a `\\.\pipe\…` literal through a shell quote to probe
this** — ask the module for the address. A wrong address and a dead daemon are indistinguishable
from the outside, which is exactly the confusion this lane cannot afford.

## WHAT I COULD NOT MEASURE WITHOUT MAKING A CHANGE — STATED, NOT GUESSED

1. **What `os.homedir()` / `USERPROFILE` actually return inside a real session-0 service**, under
   LocalSystem or under a named account. Creating a service is a production change. The LocalSystem
   outcome is *derivable* (documented Node rule + measured `ProfileImagePath`) but was not executed;
   **the named-account outcome is neither measured nor documented and is the reason that variant is
   refused rather than recommended.**
2. **Whether a named pipe created in session 0 by Node is actually usable duplex from session 1.**
   The namespace is not the obstacle (documented above); the security descriptor might be, and
   Node/libuv does not document the one it uses.
3. **Whether any service wrapper reports SERVICE_STOPPED on a non-zero child exit** — i.e. whether
   `sc failure` would ever fire for exit 90. Untested, and it is the whole restart guarantee.
4. **A reboot, a wake from sleep, or a fast-user-switch** under the current task. The 38 pairs prove
   the exit-90 loop; they prove nothing about those three.

## IF SOMEONE STILL WANTS TO TRY IT — THE PRECONDITIONS

Do not start from a migration plan. **Prove these three FIRST, in a throwaway account or a VM, never
against the live task:**
① a wrapper under which `node --version`-equivalent startup reaches `StartServiceCtrlDispatcher`
inside 30 s and `sc failure` demonstrably fires on child exit 90 (seen red by sabotaging it);
② `os.homedir()` inside that service returning the interactive user's home, printed by the daemon
itself, not inferred;
③ the corpus counts (**512 file docs, 45 skills** today) resolving to the SAME numbers from inside
the service — a count, not "it seems to work".
🛑 **If any one of the three cannot be SEEN RED, the migration is refused**: all three failures are
silent, and a silent failure here means every agent on the machine acts without its knowledge while
everything looks green.

**Rollback, if it were ever attempted:** the current model is one scheduled task + one VBS file, both
outside this repo. Rolling back = re-registering the task (`service/install-windows.ps1`, never a
hand-typed `Register-ScheduledTask`) and deleting the service. Cheap — which is *not* a reason to
try, because the cost of the attempt is not the rollback, it is the window in which injection is
silently absent.

## CONDITION OF VALIDITY OF THIS VERDICT

This refusal rests on: (a) `node.exe` not being a service program — a property of Node, not of
Windows; (b) the daemon resolving its corpus through `os.homedir()`; (c) Windows having no socket
activation. **Re-open ONLY if one of those three changes**: Node shipping SCM support, `paths.js`
gaining an explicit non-home corpus root declared by the installer, or the `SERVICE_TRIGGER`
enumeration gaining a socket subtype (`service-units.md`, winsvc.h updated 2024-02-22). A new
opinion is not a fact new enough.

## S4U — MEASURED 2026-08-22, AND IT IS A NO (with the reason, so nobody re-runs this)

`TASK_LOGON_S4U` is the NATIVE windowless option, and the doc is unambiguous (ms.date 2018-12-05,
updated 2024-02-22): *"the task will run in a non-interactive desktop. When an S4U logon is used, no
password is stored by the system and there is no access to either the network or to encrypted files."*
The fleet reaper has run under it since 2026-07-29 precisely as the anti-window fix, so it works.

🔴 **IT STILL CANNOT SUPERVISE THIS DAEMON, AND THE REASON IS NOT THE ONE THE DOC MAKES YOU EXPECT.**
A throwaway S4U task was registered, run and unregistered on 2026-08-22 to settle it by measurement:

```
loopbackBind        : OK port 60366        <- the TCP lane is FINE
loopbackAllerRetour : OK status 200        <- and it serves
tubeNomme           : ECHEC EACCES         <- the NAMED PIPE is refused
```

🛑 **The named pipe is the KERNEL RENDEZVOUS — the address the client lane knocks on**, wired on all
16 declarations. Under S4U the daemon would start, bind its port and look perfectly healthy, while
every frame hit `ENOENT`, fell back to the local state-less path, and withheld the `once` documents on
EVERY action. That is the split-brain failure of 2026-08-21, re-created by a supervision change.
⚠️ **"Loopback is local, so `no access to the network` cannot concern us" is exactly the inference that
would have shipped it.** The clause reads as being about remote resources; the measurement says the
restriction also reaches a LOCAL kernel object. Read the doc, then measure anyway.

⚠️ **`TASK_LOGON_PASSWORD` is the remaining native candidate and it is UNTESTED**: it is a full logon
(so the pipe would plausibly be permitted) and it is windowless in the same way, but it requires the
account password to be STORED at registration. Not measured, therefore not recommended — recorded as
the only open door, never as a suggestion.

✅ **CONCLUSION: the `wscript` hidden launcher STAYS, and it is now justified by a measurement rather
than by default.** It waits (`Run(cmd, 0, True)`) and propagates the exit code (`WScript.Quit code`) —
a non-waiting launcher returns 0 and SILENTLY kills the restart-on-90 trigger.

🔑 **THE PORTABLE RULE, and it is the whole answer to "make it work on every OS": each OS's NATIVE
supervisor, and nothing else.** The window problem does not exist outside Windows — a systemd unit and
a launchd job have no desktop at all. So there is no cross-platform launcher to write, and writing one
would be inventing a shared problem where only one platform has it.
