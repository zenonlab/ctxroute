# ═══════════════════════════════════════════════════════════════════════
# INSTALL / UNINSTALL the Windows scheduled task of the ctxroute HTTP lane.
# Usage: powershell -ExecutionPolicy Bypass -File service/install-windows.ps1 [-Action install|uninstall]
# ═══════════════════════════════════════════════════════════════════════
#
# 🛑 THIS FILE IS THE ONE PLACE THE WINDOWS PROCEDURE IS WRITTEN. `service/README.md`
#    points here and `.github/workflows/service-units.yml` CALLS it. A
#    registration line copied into either would be a second truth, and it is
#    always the copy that survives an edit nobody applied to it.
#
# ⚠️ TASK SCHEDULER, NOT A WINDOWS SERVICE — settled by the API contract and not
#    reopened: a bare node.exe never calls StartServiceCtrlDispatcher, and a
#    third-party service host (nssm, winsw) is refused because it inserts an
#    unversioned supervisor into a framework whose premise is that the OS
#    supervises. Read the header of `ctxroute-http.task.xml`.
#
# ⚠️ Nothing is written into a tracked file: this repository is PUBLIC, so the
#    account name and the clone path are substituted into an in-memory copy of
#    the XML and never on disk.
# ═══════════════════════════════════════════════════════════════════════
param(
  [ValidateSet('install', 'uninstall')]
  [string]$Action = 'install',

  # ⚠️ THE DEDICATED ADAPTER IS INSTALLED BY DEFAULT, AND THAT IS A DECISION.
  #    Without it this lane keeps the Windows loopback defect: libuv disables SYN
  #    retransmission on any address whose first byte is 127, so a client
  #    micro-stall loses every connection in flight at once. `-NoAdapter` opts
  #    out and the lane stays on 127.0.0.1 WITH the defect — the choice is
  #    offered, never silently made, and nothing is removed either way.
  [switch]$NoAdapter,

  # The address the Windows profile leaves the loopback for. It is DECLARED here
  # ONCE, into the configuration, and only when the configuration declares none:
  # an operator who already chose an address is never overruled. Everything
  # afterwards — the daemon's bind, the wiring URLs, the reconciler — reads it
  # back from that single place.
  # Private (RFC 1918) so it can never be routed from the internet, /32 so no
  # subnet route is published, on an adapter with no gateway.
  [string]$Address = '10.87.87.1'
)

$ErrorActionPreference = 'Stop'

$Here        = Split-Path -Parent $PSCommandPath
$Repo        = Split-Path -Parent $Here
$TaskName    = 'ctxroute-http'
$AdapterTask = 'ctxroute-adapter'
$Channel     = 'Microsoft-Windows-TaskScheduler/Operational'

# ⚠️ TRI-STATE, AND THIS EXIT CODE IS THE THIRD STATE. 78 is sysexits' EX_CONFIG:
#    "THE MEASUREMENT WAS IMPOSSIBLE HERE", never "the unit is wrong". A caller
#    that reads it as success reports a green that measured nothing.
$EX_PRECONDITION = 78

# ⚠️ Replaces the text of EVERY <Tag>…</Tag> by SHAPE, never by matching the
#    placeholder that happens to sit there today — a literal match would stop
#    substituting the day the XML is edited, and a task still pointing at
#    `CHANGE_ME` fails in a way nobody reads. Walked in REVERSE so each earlier
#    index stays valid.
function Set-XmlValues([string]$Xml, [string]$Tag, [string]$Value) {
  $matchesFound = @([regex]::Matches($Xml, "(?<=<$Tag>)[^<]*"))
  if ($matchesFound.Count -eq 0) {
    throw "<$Tag> is absent from the task XML — the schema changed and this installer is stale. Refusing to register a task it cannot describe."
  }
  for ($i = $matchesFound.Count - 1; $i -ge 0; $i--) {
    $m = $matchesFound[$i]
    $Xml = $Xml.Remove($m.Index, $m.Length).Insert($m.Index, $Value)
  }
  return $Xml
}

if ($Action -eq 'uninstall') {
  # ⚠️ Stop first: the task's AllowHardTerminate lets the Task Scheduler service
  #    terminate the process, which IS the clean stop here (nothing to flush).
  #    Absent task = converge, never fail — this script is re-runnable.
  try { Stop-ScheduledTask -TaskName $TaskName -ErrorAction Stop } catch {}
  try { Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop } catch {}
  # ⚠️ The boot task goes with it — leaving a privileged task behind that
  #    reconciles an adapter for a daemon nobody runs is the orphan class.
  try { Unregister-ScheduledTask -TaskName $AdapterTask -Confirm:$false -ErrorAction Stop } catch {}
  # 🛑 THE ADAPTER ITSELF IS *NOT* REMOVED HERE, and that is deliberate: an
  #    uninstall must not silently delete a network interface an operator may
  #    have pointed something else at. Removing it is an EXPLICIT gesture:
  #    service/reconcile-adapter-windows.ps1 -Action remove
  Write-Output "uninstalled: $TaskName, $AdapterTask (the adapter itself is left in place — remove it with reconcile-adapter-windows.ps1 -Action remove)"
  exit 0
}

# ═══════════════════════════════════════════════════════════════════════
# 🛑 STEP 1 — THE OPERATIONAL CHANNEL. A PREREQUISITE, NEVER AN OPTION.
# ═══════════════════════════════════════════════════════════════════════
# MEASURED 2026-08-21 on a stock Windows 11: the channel ships DISABLED. A
# disabled channel writes no event 201 at all, so the task's EventTrigger — the
# ONLY thing that brings the daemon back after a stale-code exit — is INERT, and
# inert in SILENCE: the daemon stands down, nothing restarts it, the task
# reports a normal completion, and the only symptom is agents quietly losing
# their injection. Enabling it is also where the log CEILING is declared: one
# gesture, and half of it is worthless.
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
         ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

# ⚠️ READ THE STATE THROUGH THE OBJECT MODEL, NOT THROUGH `wevtutil gl` TEXT.
#    `wevtutil` prints LOCALISED output (measured: French on the maintainer's
#    machine), so a check for "enabled: true" is a check that passes or fails by
#    system language. `IsEnabled` is a boolean and has no language.
$log = Get-WinEvent -ListLog $Channel -ErrorAction Stop
if (-not $log.IsEnabled) {
  if (-not $admin) {
    Write-Error @"
PRECONDITION NOT MET: the Task Scheduler Operational channel is DISABLED and this
  shell is not elevated, so it cannot be enabled here. Installing anyway would
  register a task whose restart trigger is INERT AND SILENT. This says NOTHING
  about the units. Re-run from an elevated shell, or enable it once with:
    wevtutil sl "$Channel" /e:true /rt:false /ms:10485760
"@ -ErrorAction Continue
    exit $EX_PRECONDITION
  }
  # ⚠️ `/e:true` enables · `/rt:false` overwrites the oldest events when full —
  #    that IS the rotation, and it belongs to the OS, never to a homemade
  #    cleaner · `/ms:` is the ceiling in bytes. Written with `wevtutil` because
  #    that is the documented tool for the three settings at once.
  & wevtutil sl $Channel /e:true /rt:false /ms:10485760
  if ($LASTEXITCODE -ne 0) { throw "wevtutil could not enable $Channel (exit $LASTEXITCODE)" }
  $log = Get-WinEvent -ListLog $Channel -ErrorAction Stop
  if (-not $log.IsEnabled) {
    throw "$Channel still reports IsEnabled=false after being enabled — the EventTrigger would be inert. Refusing to register."
  }
}

# ═══════════════════════════════════════════════════════════════════════
# STEP 2 — REGISTER THE TASK
# ═══════════════════════════════════════════════════════════════════════
$node = (Get-Command node -ErrorAction Stop).Source
$user = "$env:USERDOMAIN\$env:USERNAME"   # exactly what `whoami` prints

$xml = Get-Content -Raw (Join-Path $Here 'ctxroute-http.task.xml')

# 🔴 THE PROLOG MUST GO, AND IT IS A MEASUREMENT, NOT A PRECAUTION (2026-08-21).
#    `Register-ScheduledTask -Xml` receives a UTF-16 PowerShell STRING while the
#    file declares `encoding="UTF-8"`, and the API refuses the contradiction:
#    "impossible de changer d'encodage" / HRESULT 0x8004131a, pointing at column
#    40 of line 1 — this very declaration.
# 🛑 THE PROLOG STAYS IN THE FILE: `schtasks /Create /XML` needs it. Only this
#    path drops it, which is why the strip lives here and not in the XML.
$xml = $xml -replace '(?s)^\s*<\?xml.*?\?>\s*', ''

$xml = Set-XmlValues $xml 'UserId'    $user   # LogonTrigger AND Principal — both
$xml = Set-XmlValues $xml 'Command'   $node
$xml = Set-XmlValues $xml 'Arguments' (Join-Path $Repo 'src\hooks\http-daemon.js')

# ⏻ WHEN THE DAEMON RUNS (2026-09-29) — `http.lifecycle`, resolved by the SAME
#    code the daemon runs (`paths.httpLifecycle` + `lifecycle-pure.resolveMode`),
#    never re-decided here: two resolutions of one setting diverge in silence.
# 🔑 `on-demand` DROPS THE LOGON TRIGGER: nothing runs until a harness session
#    asks Task Scheduler for it (`src/hooks/daemon-ensure.js`, SessionStart and
#    every prompt), and the daemon leaves by itself once idle. `login` keeps the
#    trigger — the server shape. The exit-code EventTrigger stays in BOTH: a
#    stale-code exit (90) must come back at once whatever the mode.
# 🛑 A REFUSED DECLARATION STOPS THE INSTALL: registering a task under a mode
#    nobody declared is the silent default the daemon refuses too.
$src = ($Repo -replace '\\', '/') + '/src'
$mode = (& node -p "const r=require('$src/lifecycle-pure.js').resolveMode(require('$src/paths.js').httpLifecycle().lifecycle,{platform:process.platform,osVersion:require('os').version()});if(r.refusal)throw new Error(r.refusal);r.mode")
if ($LASTEXITCODE -ne 0 -or -not $mode) { throw "http.lifecycle could not be resolved (exit $LASTEXITCODE) — refusing to register a task under a mode nobody declared" }
if ($mode -eq 'on-demand') {
  $xml = $xml -replace '(?s)\s*<LogonTrigger>.*?</LogonTrigger>', ''
  if ($xml -match '<LogonTrigger>') { throw 'the logon trigger survived its removal — refusing to register an on-demand task that starts at logon' }
}
Write-Host "lifecycle: $mode"

# ⚠️ `-Force` so a re-run REPLACES the registration instead of failing: the
#    target state is declared, never negotiated with what is already there.
Register-ScheduledTask -TaskName $TaskName -Xml $xml -Force | Out-Null

# ═══════════════════════════════════════════════════════════════════════
# STEP 2bis — THE DEDICATED ADAPTER. WINDOWS ONLY, AND IT RUNS BEFORE THE DAEMON.
# ═══════════════════════════════════════════════════════════════════════
# 🔑 WHY: libuv calls WSAIoctl(SIO_TCP_INITIAL_RTO, MaxSynRetransmissions=0)
#    whenever the destination passes uv__is_loopback() — a LITERAL test on the
#    address bytes. On 127.x Windows therefore never retransmits a lost SYN, so
#    an ordinary client micro-stall loses every connection in flight at once.
#    Binding outside 127.0.0.0/8 does not defeat that test, it LEAVES the domain
#    where it applies. `SIO_TCP_INITIAL_RTO` is a Winsock ioctl and has no Unix
#    counterpart — Linux and macOS need none of this.
# 🛑 ORDER IS THE WHOLE POINT: the address must EXIST before the daemon is
#    started, or it binds nothing. Hence here, and not after.
if ($NoAdapter) {
  Write-Warning @"
-NoAdapter: the dedicated adapter is NOT installed, so this lane stays on the loopback WITH the
  Windows defect (libuv disables SYN retransmission on 127.x). Bursts of hook connections can be
  lost. Nothing is removed by this choice — re-run without the switch to close it.
"@
} else {
  # ① DECLARE the address — once, and never over an operator's own choice.
  & node (Join-Path $Here 'declare-http-address.js') $Address
  if ($LASTEXITCODE -ne 0) { throw "could not declare the listening address (exit $LASTEXITCODE) — refusing to install an adapter for an address nothing points at" }

  # ② REGISTER the boot task that reconciles the adapter, as SYSTEM. Elevation is
  #    paid HERE, once: the task then runs at every boot with no prompt, ever.
  $adapterXml = Get-Content -Raw (Join-Path $Here 'ctxroute-adapter.task.xml')
  $adapterXml = $adapterXml -replace '(?s)^\s*<\?xml.*?\?>\s*', ''
  $adapterXml = Set-XmlValues $adapterXml 'Command' 'powershell.exe'
  $adapterXml = Set-XmlValues $adapterXml 'Arguments' `
    ("-NoProfile -ExecutionPolicy Bypass -File `"" + (Join-Path $Here 'reconcile-adapter-windows.ps1') + "`" -Repo `"$Repo`"")
  Register-ScheduledTask -TaskName $AdapterTask -Xml $adapterXml -Force | Out-Null
  Write-Output "registered: $AdapterTask (boot, SYSTEM)"

  # ③ CONVERGE NOW — an install that only schedules the repair for the next boot
  #    would leave the machine wrong for the rest of the day.
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Here 'reconcile-adapter-windows.ps1') -Repo $Repo
  if ($LASTEXITCODE -ne 0) { throw "the adapter could not be reconciled (exit $LASTEXITCODE) — refusing to start a daemon that cannot bind its declared address" }
}

# ⚠️ STARTED BY ITS SUPERVISOR, never by launching node ourselves — a hand-started
#    process would prove that node runs, which nobody doubted, and prove NOTHING
#    about the task. `AllowStartOnDemand` is true in the XML precisely so the
#    logon trigger does not have to be simulated.
Start-ScheduledTask -TaskName $TaskName

# ═══════════════════════════════════════════════════════════════════════
# THE PORT — THE ONE ASYMMETRY BETWEEN THE THREE OSES, DECLARED
# ═══════════════════════════════════════════════════════════════════════
# systemd has Environment=, launchd has EnvironmentVariables, and the Task
# Scheduler schema has NO element for it: the action INHERITS the user
# environment. So there is no unit to read the port back from here — the
# authority is the module's own default, and it is READ from it, never re-typed.
# 🔴 READ IT FROM THE RESOLUTION POINT, NEVER BY REQUIRING THE DAEMON SHELL.
#    MEASURED 2026-09-03, the first time this installer was ever exercised with a
#    daemon already running: it read the port with `require(http-daemon.js)`, and
#    that module STARTS A DAEMON when it is loaded. So the read tried to bind a
#    SECOND instance, failed with EADDRINUSE on the rendezvous pipe, and the
#    installer exited 1 — after having done all its real work. It worked on a
#    fresh machine and broke on every RE-install, which is the idempotent path
#    this whole file is built around.
# ⚠️ `paths.httpEndpoint()` is the SINGLE resolution point the daemon binds with
#    and the wiring generator writes into its URLs. Asking it costs nothing and
#    starts nothing.
$port = $env:CTXROUTE_HTTP_PORT
if (-not $port) {
  $entry = (($Repo -replace '\\', '/') + '/src/paths.js')
  $port = (& node -p "require('$entry').httpEndpoint().port")
  if ($LASTEXITCODE -ne 0) { throw "could not read the declared port from $entry — refusing to guess a port" }
}
$port = "$port".Trim()
if ($port -notmatch '^\d+$') { throw "the resolved port `"$port`" is not a number — refusing to guess" }

# 🔴 THE HOST IS PRINTED TOO, AND FROM THE SAME RESOLUTION POINT (2026-10-01).
#    Since the dedicated adapter became the default (2026-09-02) the daemon binds
#    the DECLARED address, not 127.0.0.1 — so a caller that probed the loopback
#    asked a socket nobody holds, and read "the daemon never answered". The
#    address is read back exactly like the port: never re-typed here.
$entry = (($Repo -replace '\\', '/') + '/src/paths.js')
$bindHost = "$(& node -p "require('$entry').httpEndpoint().host")".Trim()
if ($LASTEXITCODE -ne 0 -or -not $bindHost) { throw "could not read the declared host from $entry — refusing to guess an address" }

Get-ScheduledTask -TaskName $TaskName | Get-ScheduledTaskInfo | Out-String | Write-Output
Write-Output "ctxroute-host=$bindHost"
Write-Output "ctxroute-port=$port"
