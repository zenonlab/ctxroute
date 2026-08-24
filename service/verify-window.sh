#!/bin/sh
# ═══════════════════════════════════════════════════════════════════════
# "IS THE WINDOW CLOSED?" — the proof that socket activation actually bought
# something. macOS / launchd.
# Usage: sh service/verify-window.sh <port> <launchd-target>
#        e.g. sh service/verify-window.sh 8787 gui/501/com.ctxroute.http
# ═══════════════════════════════════════════════════════════════════════
#
# 🛑 `verify-responds.sh` PROVES THE DAEMON STARTS. THIS PROVES THE ONLY THING
#    THAT MADE THE WORK WORTH DOING. Under the eager model the agent also
#    started, also answered, and also lost every injection that arrived in the
#    window between a stale-code exit and the respawn — silently, because a
#    refused connection surfaces no error to the agent that needed the
#    knowledge. "It launches" was never the question.
#
# 📐 WHAT IS ACTUALLY DECIDED HERE, and it is a single sentence: a request
#    issued while NO INSTANCE IS RUNNING must be SERVED — queued by the kernel
#    in the backlog of a socket launchd still owns, then answered by a FRESH
#    instance that the connection itself started. Refused, reset or hung are all
#    failures, and they are the behaviour of the eager model this replaced.
#
# 🛑 THE CONTROL CELL IS NOT OPTIONAL — WITHOUT IT THIS SCRIPT CANNOT FAIL
#    HONESTLY. If `curl` were somehow unable to report a refusal (a proxy
#    environment variable, a captive resolver, a wrapper), a refused connection
#    would look like a served one and this proof would certify the exact defect
#    it exists to catch. So we FIRST make it refuse, on a port nobody holds, and
#    require that refusal. A measurement whose instrument was never shown to
#    move is not a measurement.
#
# ⚠️ IT KILLS THE DAEMON ON PURPOSE, WITH `kill -9`. That is not brutality for
#    its own sake: the daemon is DESIGNED to die (exit 90 on any edit of its own
#    code, dozens of times a day while an agent works here), and a proof that
#    only exercised a polite shutdown would prove the polite case. `-9` is also
#    the one signal no handler can soften, so what is measured is the SOCKET's
#    behaviour and never the process's cooperation.
#
# 🛑 NO HEALTH PROBE, NO HEARTBEAT, NO PID FILE. The pid is ASKED OF launchd,
#    which is the authority that started the process; liveness is read with
#    `kill -0`, which is the kernel answering about a process it owns. Nothing
#    here infers anything from a timeout.
#
# 🛑 THIS FILE IS ALSO WHAT THE OPERATOR RUNS AFTER A MANUAL INSTALL. Keep it
#    free of any CI assumption: no runner variable, no GitHub syntax.
# ═══════════════════════════════════════════════════════════════════════
set -eu

PORT="${1:?usage: verify-window.sh <port> <launchd-target>}"
TARGET="${2:?usage: verify-window.sh <port> <launchd-target>}"

# ⚠️ A BOUND, NEVER A VERDICT. No operating system event says "the instance has
#    finished starting", so distinguishing "still starting" from "never will" is
#    the undecidable case and a bound is the only honest answer. It is generous
#    on purpose: launchd applies its own respawn throttle after an exit, and a
#    request that waits for it is a request that is SERVED — which is precisely
#    what is being proven. Exhaustion fails LOUDLY.
SERVE_TIMEOUT="${CTXROUTE_WINDOW_TIMEOUT:-90}"
DEATH_ATTEMPTS="${CTXROUTE_WINDOW_DEATH_ATTEMPTS:-30}"

BODY='{"hook_event_name":"PreToolUse","tool_name":"Read","tool_input":{"file_path":"service/README.md"},"session_id":"ctxroute-window-proof","transcript_path":"","cwd":"."}'
OUT="ctxroute-window-response.json"

# ⚠️ ASK launchd, THE AUTHORITY THAT STARTED THE PROCESS. An empty answer means
#    "no instance is running", which is a legitimate state under on-demand
#    activation — the callers below decide what an empty answer means for them.
job_pid() {
  launchctl print "$TARGET" 2>/dev/null \
    | sed -n 's/^[[:space:]]*pid = \([0-9][0-9]*\).*/\1/p' \
    | head -n 1
}

post() {
  curl -sS -o "$OUT" -w '%{http_code}' --max-time "$SERVE_TIMEOUT" \
    -X POST "http://127.0.0.1:$1/?frame=1&frames=1" \
    -H 'content-type: application/json' -d "$BODY"
}

# ═══════════════════════════════════════════════════════════════════════
# ① CONTROL — prove the instrument can report a refusal.
# ═══════════════════════════════════════════════════════════════════════
# ⚠️ The port is one the kernel just handed out and released, so nothing is
#    listening on it and nothing HOLDS it either — the exact opposite of our
#    socket. curl's documented exit code 7 is "failed to connect to host".
FREE_PORT=$(node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>console.log(p));});')
[ -n "$FREE_PORT" ] || { echo "could not obtain a free port for the control cell" >&2; exit 1; }

set +e
post "$FREE_PORT" >/dev/null 2>&1
control=$?
set -e
if [ "$control" -ne 7 ]; then
  echo "CONTROL CELL FAILED: a POST to 127.0.0.1:$FREE_PORT, where NOTHING listens," >&2
  echo "  did not come back as \`connection refused\` (curl exit 7); it came back $control." >&2
  echo "  Until this instrument is shown to report a refusal, a refused connection" >&2
  echo "  and a served one are indistinguishable here, and the measurement below" >&2
  echo "  would certify whatever it found. This is a defect of the ENVIRONMENT," >&2
  echo "  not a verdict about the plist." >&2
  rm -f "$OUT"
  exit 1
fi
echo "control — nothing listening on 127.0.0.1:$FREE_PORT is reported as refused (curl exit 7)"

# ═══════════════════════════════════════════════════════════════════════
# ② THE INSTANCE THAT IS ABOUT TO DIE.
# ═══════════════════════════════════════════════════════════════════════
before=$(job_pid)
[ -n "$before" ] || {
  echo "launchd reports NO running instance of \`$TARGET\`, so there is nothing to kill" >&2
  echo "  and the window cannot be opened deliberately. Run verify-responds.sh first:" >&2
  echo "  under on-demand activation the FIRST REQUEST is what starts the daemon." >&2
  exit 1
}
echo "instance before the kill: pid $before"

# ═══════════════════════════════════════════════════════════════════════
# ③ OPEN THE WINDOW — and prove it is open before measuring through it.
# ═══════════════════════════════════════════════════════════════════════
kill -9 "$before"

i=0
while [ "$i" -lt "$DEATH_ATTEMPTS" ]; do
  # ⚠️ `kill -0` asks the KERNEL whether the process exists. Nothing is inferred
  #    from a delay, and nothing is read from a file.
  kill -0 "$before" 2>/dev/null || break
  i=$((i + 1))
  sleep 1
done
if kill -0 "$before" 2>/dev/null; then
  echo "pid $before is STILL ALIVE after $DEATH_ATTEMPTS attempts — the window was never" >&2
  echo "  opened, so nothing below would measure what this script exists to measure." >&2
  exit 1
fi
echo "window OPEN — pid $before is gone and no instance is running"

# ═══════════════════════════════════════════════════════════════════════
# ④ THE MEASUREMENT — a request sent INTO the window must be SERVED.
# ═══════════════════════════════════════════════════════════════════════
# 🔑 THIS IS THE WHOLE FILE. Under the eager model this request is REFUSED
#    (curl exit 7, exactly what the control cell just demonstrated) because
#    nothing holds the port between the death and the respawn. With launchd
#    owning the socket, it is queued in the kernel backlog and its ARRIVAL is
#    what starts the next instance.
set +e
code=$(post "$PORT")
served=$?
set -e

if [ "$served" -ne 0 ]; then
  echo "THE REQUEST SENT INTO THE WINDOW WAS NOT SERVED (curl exit $served)." >&2
  echo "  Exit 7 means REFUSED: launchd is not holding the listening socket, so the" >&2
  echo "  silent outage this work removed is back — check that the plist still" >&2
  echo "  carries its \`Sockets\`/\`Listeners\` dictionary and that the shim is the" >&2
  echo "  first ProgramArguments entry. Exit 28 means the bound of ${SERVE_TIMEOUT}s was" >&2
  echo "  exhausted: the connection was ACCEPTED and nothing ever answered it." >&2
  rm -f "$OUT"
  exit 1
fi
if [ "$code" != "200" ]; then
  echo "the request sent into the window came back HTTP $code, not 200." >&2
  rm -f "$OUT"
  exit 1
fi

# ⚠️ 200 ALONE IS NOT THE PROOF — the body must PARSE, the documented output
#    format of a hook. Same rule as verify-responds.sh, and for the same reason:
#    a stray server can answer anything.
node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' "$OUT"
rm -f "$OUT"

# ═══════════════════════════════════════════════════════════════════════
# ⑤ A FRESH INSTANCE ANSWERED — not a survivor.
# ═══════════════════════════════════════════════════════════════════════
# 🛑 WITHOUT THIS THE PROOF IS INCOMPLETE, and in the most flattering direction:
#    an instance that had somehow survived the kill would answer perfectly and
#    the script would report a closed window it never crossed. A DIFFERENT pid
#    is what says the connection started a NEW process, which is the mechanism.
after=$(job_pid)
[ -n "$after" ] || {
  echo "the request was served but launchd reports no running instance — the pid could" >&2
  echo "  not be read back, so \"a fresh instance answered\" is unproven." >&2
  exit 1
}
[ "$after" != "$before" ] || {
  echo "the same pid ($after) answered before and after the kill. The process this" >&2
  echo "  script killed is still serving, so the window was never crossed and nothing" >&2
  echo "  above measured socket activation." >&2
  exit 1
}

echo "OK — a request issued while NOTHING was running was SERVED on 127.0.0.1:$PORT"
echo "     killed pid $before, answered by a fresh pid $after started BY the connection"
echo "     the window socket activation exists to close is CLOSED on this machine"
