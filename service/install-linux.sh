#!/bin/sh
# ═══════════════════════════════════════════════════════════════════════
# INSTALL / UNINSTALL the systemd USER units of the ctxroute HTTP lane.
# Usage: sh service/install-linux.sh [install|uninstall]
# ═══════════════════════════════════════════════════════════════════════
#
# 🛑 THIS FILE IS THE ONE PLACE THE LINUX PROCEDURE IS WRITTEN. `service/README.md`
#    points here and `.github/workflows/service-units.yml` CALLS it. Copying a
#    `systemctl` line into either of them would create a second truth that
#    diverges at the first edit — and the one that diverges is always the copy
#    nobody runs.
#
# ⚠️ NOTHING IS WRITTEN INTO A TRACKED FILE. This repository is PUBLIC: the user
#    name, the node path and the clone location are substituted ON THE FLY into
#    the copy that lands in `~/.config/systemd/user/`. The tracked unit keeps its
#    `%h/ctxroute` placeholder for ever.
#
# 🛑 THE SOCKET IS WHAT GETS ENABLED, NEVER THE SERVICE — read the header of
#    `ctxroute-http.socket`. Enabling the service would start the daemon eagerly
#    at login and give back the silent window the whole design removes.
# ═══════════════════════════════════════════════════════════════════════
set -eu

ACTION="${1:-install}"
HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/.." && pwd)
UNIT_DIR="$HOME/.config/systemd/user"

# ⚠️ TRI-STATE, AND THIS EXIT CODE IS THE THIRD STATE. 78 is sysexits' EX_CONFIG
#    and it means "THE MEASUREMENT WAS IMPOSSIBLE HERE", never "the unit is
#    wrong". A caller that collapses it into a plain failure re-creates the very
#    confusion this separation exists to remove; a caller that collapses it into
#    SUCCESS is worse — it reports a green that measured nothing.
EX_PRECONDITION=78

# ⚠️ `systemctl --user` needs a running per-user manager AND a session bus. A
#    container, a bare `ssh` login without lingering, or a CI runner may have
#    neither — and then nothing here can be judged. We ASK the tool instead of
#    inferring from the environment: `show-environment` fails exactly when the
#    manager is unreachable.
if ! systemctl --user show-environment >/dev/null 2>&1; then
  echo "PRECONDITION NOT MET: no systemd USER manager is reachable here." >&2
  echo "  \`systemctl --user\` cannot talk to a bus, so these units can be" >&2
  echo "  neither loaded nor judged on this machine. This says NOTHING about" >&2
  echo "  the units themselves. Fix by giving the account a user manager" >&2
  echo "  (\`loginctl enable-linger \$USER\` + XDG_RUNTIME_DIR), or run elsewhere." >&2
  exit "$EX_PRECONDITION"
fi

# 🔴 A `net.core.somaxconn` PRECONDITION STOOD HERE AND WAS REMOVED THE SAME DAY
#    IT SHIPPED (2026-09-17). It refused to install when the kernel ceiling sat
#    below 4096, on the theory that a small accept queue caused the
#    `ECONNREFUSED` burst this project had been chasing.
# 🛑 THAT THEORY IS DEAD, MEASURED AT THE SOURCE, and the check outlived it by
#    hours: the daemon's own high-water mark reads **32 simultaneous connections**
#    against a queue measured at **232** — never within a factor of seven of
#    overflowing — and a packet capture showed the refusals carry NO connection
#    attempt on the wire at all. Detail and figures: `accept-queue-ceiling.md`.
# 🔑 WHY ITS REMOVAL IS THE POINT, not a detail: it was a WALL IN AN INSTALLER.
#    Every other artefact of that theory is inert (a declared constant, a
#    `Backlog=` line) and costs a stranger nothing. This one REFUSED THE INSTALL
#    of an adopter whose kernel is perfectly fine, for a defect that does not
#    exist. **A guardrail with no measured disease is not neutral — it is a
#    denial of service aimed at your own users.**
# ⚠️ Nothing about the kernel cap is wrong: `listen(2)` really is capped by
#    `net.core.somaxconn`, and raising it really is the fix WHEN a queue actually
#    overflows. What was wrong is gating an installation on it. Re-add a check
#    here only when a MEASUREMENT on the target machine shows the queue filling.

if [ "$ACTION" = "uninstall" ]; then
  # ⚠️ Order matters: disabling the socket first stops new activations, then the
  #    running instance is stopped. `|| true` because uninstalling something
  #    already absent must converge, not fail — this script is re-runnable.
  systemctl --user disable --now ctxroute-http.socket >/dev/null 2>&1 || true
  systemctl --user stop ctxroute-http.service >/dev/null 2>&1 || true
  rm -f "$UNIT_DIR/ctxroute-http.socket" "$UNIT_DIR/ctxroute-http.service"
  systemctl --user daemon-reload
  # ⚠️ systemctl(1): a unit that hit its start limit "refuses to be started
  #    again" until its failed state is reset. Leaving that behind would make
  #    the NEXT install look broken for a reason belonging to this one.
  systemctl --user reset-failed ctxroute-http.socket ctxroute-http.service >/dev/null 2>&1 || true
  echo "uninstalled: ctxroute-http.socket + ctxroute-http.service"
  exit 0
fi

if [ "$ACTION" != "install" ]; then
  echo "unknown action \`$ACTION\` — expected \`install\` or \`uninstall\`" >&2
  exit 1
fi

NODE=$(command -v node) || {
  echo "node is not in PATH. systemd does not search PATH and does not expand a" >&2
  echo "shell, so ExecStart must carry an ABSOLUTE path — there is nothing to" >&2
  echo "substitute if the binary cannot be located." >&2
  exit 1
}

mkdir -p "$UNIT_DIR"

# ⚠️ THE SOCKET UNIT IS COPIED VERBATIM: it carries the ADDRESS and no
#    machine-dependent value. Rewriting anything in it would move the one place
#    the port is written on Linux.
cp "$HERE/ctxroute-http.socket" "$UNIT_DIR/ctxroute-http.socket"

# 🛑 THE SOCKET COUNT COMES FROM THE CONFIGURATION, NEVER FROM THIS FILE (2026-09-19).
#    Under socket activation systemd binds, so the number of sockets lived here AND
#    in `http.listeners` — and the daemon REFUSES TO START when the two disagree.
#    An adopter who raised the key and forgot the unit got a service that never came
#    up. So the installed unit is RENDERED from the configuration; the shipped one is
#    only its default output (proven byte-for-byte by `test/render-units-pure.test.js`).
# ⚠️ ON THE INSTALLED COPY, after the `cp` above and BEFORE `systemctl enable` below:
#    rendering the repository's own template would edit a tracked file on the
#    operator's machine.
node "$HERE/render-units.js" --socket "$UNIT_DIR/ctxroute-http.socket" || {
  echo "ctxroute: could not render the listening sockets into the installed unit." >&2
  echo "  The unit is installed but its socket count may disagree with \`http.listeners\`," >&2
  echo "  and the daemon refuses to start on that mismatch. Nothing was enabled." >&2
  exit 2
}

# ⚠️ ExecStart is the ONLY line that names this machine, so it is the only line
#    rewritten — by SHAPE (`^ExecStart=`), never by matching the placeholder's
#    current text, which would silently stop substituting the day the unit is
#    edited. ⚠️ A clone path containing spaces would produce an ExecStart systemd
#    splits on whitespace; that is a real limitation of the unit format, not of
#    this script.
sed "s|^ExecStart=.*|ExecStart=$NODE $REPO/src/hooks/http-daemon.js|" \
  "$HERE/ctxroute-http.service" > "$UNIT_DIR/ctxroute-http.service"

systemctl --user daemon-reload
# 🛑 THE SOCKET, NEVER THE SERVICE (see the header).
systemctl --user enable --now ctxroute-http.socket

# ⚠️ THE PORT IS DERIVED FROM THE UNIT WE JUST INSTALLED — on Linux the socket
#    unit IS where the address lives, so reading it back is reading the
#    authority. Re-typing the number here would be the drift the whole repo
#    refuses. An empty read is a REFUSAL, never a default: a caller handed a
#    guessed port would go on to "verify" a daemon nobody asked for.
PORT=$(sed -n 's/^ListenStream=127\.0\.0\.1://p' "$UNIT_DIR/ctxroute-http.socket" | head -n 1)
[ -n "$PORT" ] || {
  echo "no \`ListenStream=127.0.0.1:<port>\` in the installed socket unit — the" >&2
  echo "address moved, or the loopback binding was widened. Refusing to guess." >&2
  exit 1
}

systemctl --user status --no-pager ctxroute-http.socket || true
echo "ctxroute-port=$PORT"
