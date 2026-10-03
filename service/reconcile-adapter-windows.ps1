# =====================================================================
# RECONCILE the dedicated loopback adapter of the ctxroute HTTP lane.
# Usage: powershell -ExecutionPolicy Bypass -File service/reconcile-adapter-windows.ps1
#        [-Action reconcile|remove] [-Repo <path>]
# =====================================================================
#
# WHY THIS EXISTS (Windows ONLY -- Linux and macOS have no such defect).
#   libuv calls WSAIoctl(SIO_TCP_INITIAL_RTO, MaxSynRetransmissions=0) whenever
#   the destination passes uv__is_loopback(), which is a LITERAL test on the
#   address bytes: first byte 127, or exactly ::1. On such an address Windows
#   therefore NEVER retransmits a lost SYN. That is a legitimate optimisation --
#   on true loopback a SYN cannot be lost in transit -- but a client micro-stall
#   turns an ordinary hiccup into a total loss of every connection in flight.
#   Binding OUTSIDE 127.0.0.0/8 does not defeat that test: it LEAVES the domain
#   where the test applies, and libuv answers correctly for the new address.
#   SIO_TCP_INITIAL_RTO is a Winsock ioctl and does not exist on Unix -- verified
#   in libuv's src/unix/tcp.c on 2026-09-02 -- so this file has no counterpart.
#
# WHY RECONCILIATION AND NOT AN INSTALL SCRIPT.
#   Declaring the desired state and converging towards it is what Kubernetes,
#   systemd and Ansible do; "detect and alert" would put a human back in the
#   loop, which is the one thing this framework exists to remove. Re-running
#   this file is therefore ALWAYS safe and always converges: it creates nothing
#   twice and it changes nothing that is already correct.
#
# WHAT IT OBSERVES, AND WHAT IT REFUSES TO INFER.
#   The question asked is exact -- "does this address exist on a local adapter"
#   -- never "has the adapter probably gone". No destructive action is ever
#   taken behind a guess.

param(
  [ValidateSet('reconcile', 'remove')]
  [string]$Action = 'reconcile',
  [string]$Repo = ''
)

$ErrorActionPreference = 'Stop'

$Here  = Split-Path -Parent $PSCommandPath
if (-not $Repo) { $Repo = Split-Path -Parent $Here }

$Alias  = 'ctxroute'
$Hwid   = '*MSLOOP'
$Prefix = 32

# TRI-STATE. 78 is sysexits' EX_CONFIG: "the change was impossible HERE", never
# "the state is wrong". A caller reading it as success reports a green that
# changed nothing.
$EX_PRECONDITION = 78

function Say($m) { Write-Output $m }

# ---------------------------------------------------------------------
# THE ADDRESS HAS ONE SOURCE, AND IT IS THE CONFIGURATION -- never a constant
# repeated here. paths.httpEndpoint() is the SAME resolution the daemon binds
# with and the wiring generator writes into its URLs; a second spelling here
# would be the split-brain class this repository removed in 2026-08-25.
# ---------------------------------------------------------------------
function Get-DeclaredHost {
  $entry = (($Repo -replace '\\', '/') + '/src/paths.js')
  $value = (& node -p "require('$entry').httpEndpoint().host")
  if ($LASTEXITCODE -ne 0) {
    throw "could not read the declared host from $entry -- refusing to guess an address"
  }
  return "$value".Trim()
}

function Test-IsLoopbackLiteral([string]$Address) {
  # The SAME literal test libuv performs. Written out rather than derived,
  # because it is THEIR rule and not ours: it must not follow our refactors.
  if ($Address -match '^127\.') { return $true }
  if ($Address -eq '::1') { return $true }
  return $false
}

function Get-Adapter {
  return Get-NetAdapter -IncludeHidden -ErrorAction SilentlyContinue |
         Where-Object { $_.InterfaceDescription -like '*KM-TEST*' } |
         Select-Object -First 1
}

# ---------------------------------------------------------------------
if ($Action -eq 'remove') {
  $carte = Get-Adapter
  if (-not $carte) { Say 'nothing to remove: no KM-TEST adapter present'; exit 0 }
  $dev = Get-PnpDevice -Class Net -ErrorAction SilentlyContinue |
         Where-Object { $_.FriendlyName -like '*KM-TEST*' } | Select-Object -First 1
  if ($dev) { & pnputil /remove-device $dev.InstanceId | Out-Null }
  Say "removed: $($carte.Name)"
  exit 0
}

# ---------------------------------------------------------------------
# STEP 1 -- WHAT STATE IS DECLARED?
# ---------------------------------------------------------------------
$declared = Get-DeclaredHost
if (Test-IsLoopbackLiteral $declared) {
  # NOT an error: an installation that never asked to leave the loopback has
  # nothing to reconcile, and saying so is how a no-op stays legible.
  Say "declared host is $declared (loopback): no dedicated adapter is needed, nothing to do"
  exit 0
}
Say "declared host: $declared"

# ---------------------------------------------------------------------
# STEP 2 -- IS IT ALREADY THERE? (idempotence: converge, never duplicate)
# ---------------------------------------------------------------------
$existing = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            Where-Object { $_.IPAddress -eq $declared }
if ($existing) {
  $onOurs = $existing | Where-Object { $_.InterfaceAlias -eq $Alias }
  if (-not $onOurs) {
    # FAIL-CLOSED: the address exists but belongs to something else. Taking it
    # over could break whatever holds it, and this file never acts on a guess.
    Write-Error @"
CONFLICT: $declared already exists on interface '$($existing[0].InterfaceAlias)', which is NOT the
  ctxroute adapter. Refusing to touch an address this framework does not own.
  Declare another address in the `http` key of ctxroute-config.json, or free this one.
"@ -ErrorAction Continue
    exit 1
  }
  Say "already reconciled: $declared/$($onOurs[0].PrefixLength) on '$Alias' (origin $($onOurs[0].PrefixOrigin)/$($onOurs[0].SuffixOrigin))"
  exit 0
}

# ---------------------------------------------------------------------
# STEP 3 -- ELEVATION IS A PRECONDITION, NEVER A FAILURE OF THE STATE
# ---------------------------------------------------------------------
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
         ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
  Write-Error @"
PRECONDITION NOT MET: $declared is not on this machine and creating a network adapter requires
  elevation, which this shell does not have. This says NOTHING about whether the state is right.
  Re-run from an elevated shell, or let the boot task do it.
"@ -ErrorAction Continue
  exit $EX_PRECONDITION
}

# ---------------------------------------------------------------------
# STEP 4 -- CREATE THE ADAPTER IF IT IS MISSING
# ---------------------------------------------------------------------
# WHY THE SetupAPI AND NOT A COMMAND-LINE TOOL -- READ AT MICROSOFT'S OWN
# DOCUMENTATION ON 2026-09-02, not merely probed on one machine. All three
# documented ways to create a root-enumerated device are closed to us:
#   * hdwwiz (the GUI "Add legacy hardware" wizard) is the path the support
#     article documents, and it needs a human. Nothing to automate.
#   * devcon: Windows Driver Kit only, not shipped, not redistributable.
#   * devgen: Windows Driver Kit only (WDK tools folder, Windows 11 22H2+), and
#     its own page carries the sentence that settles it -- "This tool is not
#     allowed to be redistributed and should not be used for production
#     scenarios." A framework that ships to adopters cannot depend on it.
# And the two tools Windows DOES ship cannot do it, measured here: netcfg knows
# only the classes p|s|c (protocol, service, client) and a network ADAPTER is
# none of them -- it prints its usage and does nothing; pnputil manages driver
# PACKAGES and has no verb that creates a device.
# => The SetupAPI, which all three tools merely wrap, is the ONLY path that is
#    first-party, redistributable and admissible in production. netloop.inf
#    ships with Windows, so no third-party driver is ever installed.
$carte = Get-Adapter
if (-not $carte) {
  Say "creating the root-enumerated device $Hwid via SetupAPI"
  $src = @'
using System;
using System.Runtime.InteropServices;

public class CtxrouteLoopAdapter {
  [StructLayout(LayoutKind.Sequential)]
  public struct SP_DEVINFO_DATA {
    public uint cbSize;
    public Guid ClassGuid;
    public uint DevInst;
    public IntPtr Reserved;
  }
  [DllImport("setupapi.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern IntPtr SetupDiCreateDeviceInfoList(ref Guid ClassGuid, IntPtr hwndParent);
  [DllImport("setupapi.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool SetupDiCreateDeviceInfoW(IntPtr DeviceInfoSet, string DeviceName,
    ref Guid ClassGuid, string DeviceDescription, IntPtr hwndParent, uint CreationFlags,
    ref SP_DEVINFO_DATA DeviceInfoData);
  [DllImport("setupapi.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool SetupDiSetDeviceRegistryPropertyW(IntPtr DeviceInfoSet,
    ref SP_DEVINFO_DATA DeviceInfoData, uint Property, byte[] PropertyBuffer, uint PropertyBufferSize);
  [DllImport("setupapi.dll", SetLastError = true)]
  public static extern bool SetupDiCallClassInstaller(uint InstallFunction, IntPtr DeviceInfoSet,
    ref SP_DEVINFO_DATA DeviceInfoData);
  [DllImport("setupapi.dll", SetLastError = true)]
  public static extern bool SetupDiDestroyDeviceInfoList(IntPtr DeviceInfoSet);
  [DllImport("newdev.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool UpdateDriverForPlugAndPlayDevicesW(IntPtr hwndParent, string HardwareId,
    string FullInfPath, uint InstallFlags, out bool bRebootRequired);

  static Guid NET = new Guid("4d36e972-e325-11ce-bfc1-08002be10318"); // GUID_DEVCLASS_NET
  const uint DICD_GENERATE_ID   = 0x00000001;
  const uint SPDRP_HARDWAREID   = 0x00000001;
  const uint DIF_REGISTERDEVICE = 0x00000019;
  const uint INSTALLFLAG_FORCE  = 0x00000001;

  public static string Create(string hwid, string inf) {
    IntPtr set = SetupDiCreateDeviceInfoList(ref NET, IntPtr.Zero);
    if (set == IntPtr.Zero || set.ToInt64() == -1)
      return "FAILED SetupDiCreateDeviceInfoList " + Marshal.GetLastWin32Error();
    try {
      SP_DEVINFO_DATA d = new SP_DEVINFO_DATA();
      d.cbSize = (uint)Marshal.SizeOf(typeof(SP_DEVINFO_DATA));
      if (!SetupDiCreateDeviceInfoW(set, "Net", ref NET, null, IntPtr.Zero, DICD_GENERATE_ID, ref d))
        return "FAILED SetupDiCreateDeviceInfoW " + Marshal.GetLastWin32Error();
      // MULTI_SZ: the string MUST be terminated by TWO null characters.
      byte[] buf = System.Text.Encoding.Unicode.GetBytes(hwid + "\0\0");
      if (!SetupDiSetDeviceRegistryPropertyW(set, ref d, SPDRP_HARDWAREID, buf, (uint)buf.Length))
        return "FAILED SetupDiSetDeviceRegistryPropertyW " + Marshal.GetLastWin32Error();
      if (!SetupDiCallClassInstaller(DIF_REGISTERDEVICE, set, ref d))
        return "FAILED DIF_REGISTERDEVICE " + Marshal.GetLastWin32Error();
      bool reboot;
      if (!UpdateDriverForPlugAndPlayDevicesW(IntPtr.Zero, hwid, inf, INSTALLFLAG_FORCE, out reboot))
        return "FAILED UpdateDriverForPlugAndPlayDevices " + Marshal.GetLastWin32Error();
      return "OK";
    } finally { SetupDiDestroyDeviceInfoList(set); }
  }
}
'@
  Add-Type -TypeDefinition $src -Language CSharp
  $inf = Join-Path $env:WINDIR 'INF\netloop.inf'
  if (-not (Test-Path $inf)) { throw "netloop.inf is absent from this Windows -- refusing to install a third-party driver" }
  $r = [CtxrouteLoopAdapter]::Create($Hwid, $inf)
  if ($r -ne 'OK') { throw "the adapter could not be created: $r" }
  Start-Sleep -Seconds 4
  $carte = Get-Adapter
  if (-not $carte) { throw 'no KM-TEST adapter after SetupAPI reported success -- refusing to continue' }
  Say "created: $($carte.Name)"
}

# ---------------------------------------------------------------------
# STEP 5 -- THE ADAPTER IS DESIGNATED BY ITS ROLE, NEVER BY A WINDOWS INDEX
# ---------------------------------------------------------------------
if ($carte.Name -ne $Alias) {
  Rename-NetAdapter -Name $carte.Name -NewName $Alias -ErrorAction Stop
  Say "renamed to '$Alias'"
}

# ---------------------------------------------------------------------
# STEP 6 -- THE STATIC ADDRESS. /32 publishes NO subnet route, so nothing on
# the LAN has a path to it; the daemon has no authentication and the address is
# the boundary.
# ---------------------------------------------------------------------
Get-NetIPAddress -InterfaceAlias $Alias -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.PrefixOrigin -eq 'WellKnown' } |
  ForEach-Object { Remove-NetIPAddress -IPAddress $_.IPAddress -InterfaceAlias $Alias -Confirm:$false -ErrorAction SilentlyContinue }

New-NetIPAddress -InterfaceAlias $Alias -IPAddress $declared -PrefixLength $Prefix -ErrorAction Stop | Out-Null
Say "address set: $declared/$Prefix"

try { Set-NetIPInterface -InterfaceAlias $Alias -Dhcp Disabled -ErrorAction Stop } catch {}
try { Set-DnsClient -InterfaceAlias $Alias -RegisterThisConnectionsAddress $false -ErrorAction Stop } catch {}

# ---------------------------------------------------------------------
# STEP 6bis -- THIS ADAPTER MUST NEVER OUTRANK A REAL NETWORK INTERFACE
# ---------------------------------------------------------------------
# MEASURED 2026-09-02: Windows gave this adapter an automatic metric of 25 while
# the machine's Wi-Fi carried 35. A LOWER metric is a HIGHER priority, so a
# virtual adapter that leads nowhere was ranked ABOVE the interface carrying all
# the traffic. It was harmless here -- a /32 covers exactly its own address, so
# there is nothing for it to win -- but it is EXACTLY the lever behind the two
# failures documented on Microsoft Q&A: a broken phone-hotspot route, and pings
# answering "General failure".
# It costs NOTHING to remove: binding a local address consults no metric at all.
# So the priority is pinned to the floor, and AutomaticMetric is turned off --
# otherwise Windows recomputes it and the class comes back at the next boot.
try {
  Set-NetIPInterface -InterfaceAlias $Alias -AddressFamily IPv4 -InterfaceMetric 9999 -ErrorAction Stop
  Say 'interface metric pinned to 9999 (last of all interfaces)'
} catch {
  Say "WARNING: the interface metric could not be pinned ($($_.Exception.Message)) -- this adapter may outrank a real one"
}

# ---------------------------------------------------------------------
# STEP 7 -- THE VERDICT IS MEASURED, never deduced from "no exception was thrown"
# ---------------------------------------------------------------------
$final = Get-NetIPAddress -InterfaceAlias $Alias -AddressFamily IPv4 -ErrorAction SilentlyContinue |
         Where-Object { $_.IPAddress -eq $declared }
if (-not $final) { throw "$declared is still absent after being set -- refusing to report success" }
if ($final[0].PrefixOrigin -ne 'Manual') {
  throw "$declared is present but its origin is $($final[0].PrefixOrigin), not Manual -- an auto-assigned address moves at the next boot"
}
Say "reconciled: $declared/$($final[0].PrefixLength) on '$Alias', origin $($final[0].PrefixOrigin)/$($final[0].SuffixOrigin)"
exit 0
