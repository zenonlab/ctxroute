#!/bin/sh
# ═══════════════════════════════════════════════════════════════════════
# INSTALL / UNINSTALL the launchd USER AGENT of the ctxroute HTTP lane.
# Usage: sh service/install-macos.sh [install|uninstall]
# ═══════════════════════════════════════════════════════════════════════
#
# 🛑 THIS FILE IS THE ONE PLACE THE macOS PROCEDURE IS WRITTEN. `service/README.md`
#    points here and `.github/workflows/service-units.yml` CALLS it. A
#    `launchctl` line copied into either would be a second truth, and the copy
#    is always the one that rots.
#
# ⚠️ AGENT, NEVER A DAEMON, and never a system-wide install: the process reads
#    the USER's documents. It goes into `~/Library/LaunchAgents/`, which is what
#    makes login the trigger. Read the plist's own header before changing this.
#
# 🔴 THE AUTHORITY FOR EVERY KEY IS `man launchd.plist` ON THE TARGET MAC.
#    Apple's web copies are ARCHIVED (2016-09-13, TN2083 "no longer being
#    updated"). Nothing here restates a launchd default for that reason.
# ═══════════════════════════════════════════════════════════════════════
set -eu

ACTION="${1:-install}"
HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/.." && pwd)
LABEL="com.ctxroute.http"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

# ⚠️ THE DOMAIN IS A PARAMETER BECAUSE THE MACHINE DECIDES IT, NOT US. `gui/<uid>`
#    is the per-user GUI domain an agent belongs to; a host with no logged-in
#    graphical session (a build agent, a remote shell) may only expose
#    `user/<uid>`. We default to the documented one and let the environment name
#    another rather than guessing from what we can observe.
DOMAIN="${CTXROUTE_LAUNCHD_DOMAIN:-gui/$(id -u)}"

# ⚠️ TRI-STATE, AND THIS EXIT CODE IS THE THIRD STATE. 78 is sysexits' EX_CONFIG:
#    "THE MEASUREMENT WAS IMPOSSIBLE HERE", never "the unit is wrong". A caller
#    that reads it as success reports a green that measured nothing.
EX_PRECONDITION=78

if [ "$ACTION" = "uninstall" ]; then
  # ⚠️ `bootout` is the documented counterpart of `bootstrap`. Absent job =
  #    converge, do not fail: this script must be re-runnable.
  launchctl bootout "$DOMAIN/$LABEL" >/dev/null 2>&1 || true
  rm -f "$PLIST"
  echo "uninstalled: $LABEL"
  exit 0
fi

if [ "$ACTION" != "install" ]; then
  echo "unknown action \`$ACTION\` — expected \`install\` or \`uninstall\`" >&2
  exit 1
fi

NODE=$(command -v node) || {
  echo "node is not in PATH. ProgramArguments takes ABSOLUTE paths (launchd does" >&2
  echo "not search PATH and must never be wrapped in a shell), so there is" >&2
  echo "nothing to substitute if the binary cannot be located." >&2
  exit 1
}

mkdir -p "$HOME/Library/LaunchAgents"

# ⚠️ SUBSTITUTED BY SHAPE, NEVER BY THE PLACEHOLDER'S CURRENT TEXT: the two
#    ProgramArguments entries are recognised as "the one ending in node" and
#    "the one ending in http-server.js". Matching the literal that sits there
#    today would silently stop substituting the day the plist is edited — and a
#    plist that still points at `/Users/CHANGE_ME` fails in a way nobody reads.
# ⚠️ Nothing is written into the tracked file: this repository is PUBLIC and no
#    real user path may ever enter it.
sed -e "s|<string>[^<]*node</string>|<string>$NODE</string>|" \
    -e "s|<string>[^<]*http-server\.js</string>|<string>$REPO/src/hooks/http-server.js</string>|" \
    "$HERE/com.ctxroute.http.plist" > "$PLIST"

# ⚠️ Idempotence: bootstrapping an already-loaded label is an error, so the old
#    one goes first. This is not a "is it running?" probe — we are not asking a
#    question, we are stating the target state.
launchctl bootout "$DOMAIN/$LABEL" >/dev/null 2>&1 || true

if ! launchctl bootstrap "$DOMAIN" "$PLIST"; then
  # 🛑 TWO VERY DIFFERENT FAILURES, AND MERGING THEM IS THE DEFECT. If the DOMAIN
  #    itself cannot be reached, nothing about this plist has been judged; if the
  #    domain is fine, launchd REFUSED our job and that is a real defect.
  if ! launchctl print "$DOMAIN" >/dev/null 2>&1; then
    echo "PRECONDITION NOT MET: the launchd domain \`$DOMAIN\` is unreachable." >&2
    echo "  This host exposes no such per-user domain (no graphical session?)," >&2
    echo "  so the agent can be neither loaded nor judged here. This says" >&2
    echo "  NOTHING about the plist. Name another domain with" >&2
    echo "  CTXROUTE_LAUNCHD_DOMAIN=user/\$(id -u) and try again." >&2
    exit "$EX_PRECONDITION"
  fi
  echo "launchd REFUSED the agent in a reachable domain — this is a DEFECT of the" >&2
  echo "plist, not a missing measurement. Read the error above." >&2
  exit 1
fi

# ⚠️ THE PORT IS DERIVED FROM THE PLIST WE JUST INSTALLED — `EnvironmentVariables`
#    is where the address travels on macOS, so reading it back is reading the
#    authority. An empty read is a REFUSAL, never a default: verifying a guessed
#    port would prove something about a daemon nobody asked for.
PORT=$(awk '/CTXROUTE_HTTP_PORT/{getline; gsub(/.*<string>|<\/string>.*/, ""); print; exit}' "$PLIST")
[ -n "$PORT" ] || {
  echo "no CTXROUTE_HTTP_PORT value in the installed plist — the port moved out of" >&2
  echo "EnvironmentVariables. Refusing to guess." >&2
  exit 1
}

launchctl print "$DOMAIN/$LABEL" || true
echo "ctxroute-port=$PORT"
