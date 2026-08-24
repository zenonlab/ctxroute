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
#    ties it to a per-user launchd. Read the plist's own header before changing
#    this.
#
# 🔑 SOCKET-ACTIVATED SINCE 2026-08-23, WHICH IS WHY THIS SCRIPT COMPILES.
#    launchd holds the listening socket and hands it over through
#    `launch_activate_socket`, a C function — unreachable from JavaScript. A
#    ~40-line shim translates that hand-over into the LISTEN_FDS/LISTEN_PID
#    protocol `http-server.js` already implements for systemd, then `execv`s
#    node. Compiling it here (rather than committing a binary) keeps the repo
#    free of an artifact nobody can review and free of any signing question.
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

# ⚠️ THE COMPILED SHIM LIVES OUTSIDE THE CLONE, ON PURPOSE. A build artifact in
#    the work tree is one `git add -A` away from the history, and this repository
#    is PUBLIC. It is a SINGLE file, overwritten at every install: a bounded
#    writer, never a growing one.
SHIM_DIR="$HOME/Library/Application Support/ctxroute"
SHIM_BIN="$SHIM_DIR/launchd-socket-shim"

# ⚠️ THE SOURCE IS A PARAMETER FOR EXACTLY ONE REASON: the CI negative-check
#    compiles a SABOTAGED COPY from the OS tmpdir and demands that this whole job
#    go RED. 🛑 It is NOT an extension point — never point it at a fork of the
#    shim to "customise" anything. The tracked source is the only one that ships,
#    and a broken build must be impossible to ship rather than merely discouraged.
SHIM_SRC="${CTXROUTE_SHIM_SOURCE:-$HERE/launchd-socket-shim.c}"

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
  # ⚠️ The compiled shim goes with the agent that used it. Leaving it behind
  #    would let a LATER install run yesterday's binary if the compile step ever
  #    failed silently — the stale-code class, one layer down.
  rm -f "$SHIM_BIN"
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

# ⚠️ NO COMPILER = THIS MACHINE CANNOT HOST THE MEASUREMENT, which is a
#    PRECONDITION and not a verdict about the plist. `cc` ships with the Xcode
#    Command Line Tools (`xcode-select --install`); the shim links nothing but
#    libSystem, so nothing else is needed.
command -v cc >/dev/null 2>&1 || {
  echo "PRECONDITION NOT MET: no \`cc\` on this Mac." >&2
  echo "  The launchd socket hand-over goes through \`launch_activate_socket\`, a C" >&2
  echo "  function, so a small shim must be compiled. Install the Command Line" >&2
  echo "  Tools (\`xcode-select --install\`) and run this again. This says NOTHING" >&2
  echo "  about the plist — nothing has been judged." >&2
  exit "$EX_PRECONDITION"
}

[ -f "$SHIM_SRC" ] || {
  echo "the shim source \`$SHIM_SRC\` does not exist. Refusing to install an agent" >&2
  echo "whose first ProgramArguments entry would point at nothing." >&2
  exit 1
}

mkdir -p "$SHIM_DIR" "$HOME/Library/LaunchAgents"

# ⚠️ A COMPILE FAILURE IS A DEFECT, NOT A MISSING PRECONDITION: the compiler is
#    present (checked above) and refused OUR code. `set -e` makes it fatal, and
#    the compiler's own diagnostics are the message — never swallow them.
cc -Wall -Wextra -O2 -o "$SHIM_BIN" "$SHIM_SRC"

# ⚠️ SUBSTITUTED BY SHAPE, NEVER BY THE PLACEHOLDER'S CURRENT TEXT: the three
#    ProgramArguments entries are recognised as "the one ending in
#    launchd-socket-shim", "the one ending in node" and "the one ending in
#    http-server.js". Matching the literal that sits there today would silently
#    stop substituting the day the plist is edited — and a plist that still
#    points at `/CHANGE_ME` fails in a way nobody reads.
# ⚠️ Nothing is written into the tracked file: this repository is PUBLIC and no
#    real user path may ever enter it.
# ⚠️ `|` is the delimiter because every substitution carries a filesystem path.
#    A clone path containing a literal `|` or `&` would still break this — a real
#    limitation of `sed`, stated rather than pretended away.
sed -e "s|<string>[^<]*launchd-socket-shim</string>|<string>$SHIM_BIN</string>|" \
    -e "s|<string>[^<]*node</string>|<string>$NODE</string>|" \
    -e "s|<string>[^<]*http-server\.js</string>|<string>$REPO/src/hooks/http-server.js</string>|" \
    "$HERE/com.ctxroute.http.plist" > "$PLIST"

# ⚠️ ANTI-VACUITY ON THE SUBSTITUTION ITSELF. A `sed` that matched nothing exits
#    0 and leaves the placeholders in place — an install that looks perfect and
#    boots a job pointing at `/CHANGE_ME`. Ask the FILE, not the script's memory.
if grep -q 'CHANGE_ME' "$PLIST"; then
  echo "a ProgramArguments placeholder survived substitution in \`$PLIST\`." >&2
  echo "The plist's shape changed and this script no longer recognises it." >&2
  echo "Refusing to load an agent that points at a path which does not exist." >&2
  exit 1
fi

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

# ⚠️ THE PORT IS DERIVED FROM THE PLIST WE JUST INSTALLED — since socket
#    activation, `Sockets`/`Listeners`/`SockServiceName` is where the address
#    lives on macOS, exactly as `ListenStream=` is on Linux, so reading it back
#    is reading the authority. 🛑 It was `EnvironmentVariables`/`CTXROUTE_HTTP_PORT`
#    until the socket moved in, and that key was REMOVED rather than left as a
#    second copy: two places for one number diverge in silence.
#    An empty read is a REFUSAL, never a default: verifying a guessed port would
#    prove something about a daemon nobody asked for.
# 🔴 MATCH THE KEY TAG, NEVER THE BARE WORD — AND NEVER ASSUME THE NEXT LINE.
#    The previous form searched for `SockServiceName` anywhere and took the line
#    RIGHT AFTER it. The word also appears in this plist's own COMMENT, ~13 lines
#    earlier, so awk matched a MENTION and printed a sentence of prose as the port:
#    the URL became malformed, nothing ever reached the socket, launchd never
#    activated the job, and the CI read it as "the daemon never answered".
#    MEASURED on the macOS runner 2026-08-23 — the shim was never at fault.
# ⚠️ A parser that matches a MENTION is the class this repository refuses
#    everywhere else (that is why its gates use AST and not regex). Here: anchor on
#    the real `<key>` element, then scan FORWARD to the first `<string>` — blank
#    lines, comments and reformatting cannot move the answer any more.
PORT=$(awk '/<key>SockServiceName<\/key>/{f=1; next} f && /<string>/{gsub(/.*<string>|<\/string>.*/, ""); print; exit}' "$PLIST")
[ -n "$PORT" ] || {
  echo "no SockServiceName value in the installed plist — the port moved out of" >&2
  echo "the Sockets/Listeners dictionary. Refusing to guess." >&2
  exit 1
}

# ⚠️ NOTHING IS RUNNING AT THIS POINT, AND THAT IS THE DESIGN, not a failure to
#    report. The job is on demand: launchd holds the socket and the FIRST
#    CONNECTION starts the instance. `verify-responds.sh` is that first
#    connection.
launchctl print "$DOMAIN/$LABEL" || true
echo "ctxroute-port=$PORT"
echo "ctxroute-launchd-target=$DOMAIN/$LABEL"
