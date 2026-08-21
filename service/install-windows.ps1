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
  [string]$Action = 'install'
)

$ErrorActionPreference = 'Stop'

$Here     = Split-Path -Parent $PSCommandPath
$Repo     = Split-Path -Parent $Here
$TaskName = 'ctxroute-http'
$Channel  = 'Microsoft-Windows-TaskScheduler/Operational'

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
  Write-Output "uninstalled: $TaskName"
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
$xml = Set-XmlValues $xml 'Arguments' (Join-Path $Repo 'src\hooks\http-server.js')

# ⚠️ `-Force` so a re-run REPLACES the registration instead of failing: the
#    target state is declared, never negotiated with what is already there.
Register-ScheduledTask -TaskName $TaskName -Xml $xml -Force | Out-Null

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
$port = $env:CTXROUTE_HTTP_PORT
if (-not $port) {
  $entry = (($Repo -replace '\\', '/') + '/src/hooks/http-server.js')
  $port = (& node -p "require('$entry').DEFAULT_PORT")
  if ($LASTEXITCODE -ne 0) { throw "could not read DEFAULT_PORT from $entry — refusing to guess a port" }
}
$port = "$port".Trim()
if ($port -notmatch '^\d+$') { throw "the resolved port `"$port`" is not a number — refusing to guess" }

Get-ScheduledTask -TaskName $TaskName | Get-ScheduledTaskInfo | Out-String | Write-Output
Write-Output "ctxroute-port=$port"
