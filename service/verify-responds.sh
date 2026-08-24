#!/bin/sh
# ═══════════════════════════════════════════════════════════════════════
# "DOES THE DAEMON ANSWER?" — the ONE proof, shared by the three OSes.
# Usage: sh service/verify-responds.sh <port>
# ═══════════════════════════════════════════════════════════════════════
#
# 🛑 A REAL REQUEST, NEVER "the process exists". A node process whose socket is
#    not bound, a supervisor that started the wrong file, a daemon that died
#    right after starting — all three look perfect in a process listing. The
#    only decidable question is whether an HTTP POST on the hook lane comes
#    back with parseable JSON, so that is the only question asked here.
#
# ⚠️ THE PORT IS RECEIVED, NEVER RE-TYPED. Each OS installer derives it from the
#    unit it just installed (Linux: `ListenStream=` in the socket unit · macOS:
#    `Sockets`/`Listeners`/`SockServiceName` in the plist — in both cases the one
#    place the address lives, because in both cases the SUPERVISOR is what binds
#    it) or, on Windows where the Task Scheduler schema has NO element for it,
#    from the module's own `DEFAULT_PORT`. A number written again in this file
#    would be a second truth, and the day the unit moved its port this proof
#    would quietly test nothing.
#
# ⚠️ THE LOOP IS A BOUND, NOT A VERDICT — and the motive is DECLARED. The
#    supervisor starts the process on its own schedule and NO operating system
#    event says "the port is now bound": distinguishing "still starting" from
#    "never will" is the undecidable case, and a bound is the only honest
#    answer. Exhaustion FAILS LOUDLY and names what it could not reach; it is
#    NEVER read as a health verdict about a live process.
# 📐 On Linux nothing is actually waited for: systemd owns the listening socket
#    from `enable --now`, so the very first connection queues in the kernel
#    backlog and IS what starts the instance. The bound only pays on the two
#    eager OSes.
#
# 🛑 THIS FILE IS ALSO WHAT THE OPERATOR RUNS AFTER A MANUAL INSTALL. Keep it
#    free of any CI assumption: no runner variable, no GitHub syntax.
# ═══════════════════════════════════════════════════════════════════════
set -eu

PORT="${1:?usage: verify-responds.sh <port>}"
ATTEMPTS="${CTXROUTE_VERIFY_ATTEMPTS:-30}"

# ⚠️ A PER-ATTEMPT CEILING, AND IT IS NOT DECORATION. Under socket activation the
#    SUPERVISOR owns the listening socket, so a connection is ACCEPTED even when
#    the instance behind it never answers — a daemon that started and bound the
#    wrong address leaves this request hanging for ever instead of failing. With
#    no ceiling the whole loop would block on its first attempt and the bound
#    below would never apply. Exhaustion is reported by curl as exit 28, which
#    reads differently from a refusal (exit 7) on purpose: accepted-and-mute is
#    not the same defect as nothing-is-there.
ATTEMPT_TIMEOUT="${CTXROUTE_VERIFY_TIMEOUT:-20}"
URL="http://127.0.0.1:$PORT/?frame=1&frames=1"
OUT="ctxroute-verify-response.json"

# ⚠️ A payload of the shape the harness really posts (official hook contract):
#    the daemon answers `{}` when it has nothing to say, which is a SUCCESS —
#    we prove the LANE, never the content of an injection (that is what
#    `http-lane-differential.test.js` proves, byte for byte).
BODY='{"hook_event_name":"PreToolUse","tool_name":"Read","tool_input":{"file_path":"service/README.md"},"session_id":"ctxroute-service-units-proof","transcript_path":"","cwd":"."}'

i=0
while [ "$i" -lt "$ATTEMPTS" ]; do
  code=$(curl -sS -o "$OUT" -w '%{http_code}' --max-time "$ATTEMPT_TIMEOUT" -X POST "$URL" \
    -H 'content-type: application/json' -d "$BODY" 2>/dev/null || echo 000)
  if [ "$code" = "200" ]; then
    # ⚠️ 200 alone is not the proof: a supervisor-managed reverse proxy or a
    #    stray server could answer anything. The body must PARSE as JSON, the
    #    documented output format of a hook.
    node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' "$OUT"
    echo "OK — the daemon answered 200 with parseable JSON on 127.0.0.1:$PORT"
    rm -f "$OUT"
    exit 0
  fi
  i=$((i + 1))
  sleep 1
done

rm -f "$OUT"
echo "THE DAEMON NEVER ANSWERED on 127.0.0.1:$PORT after $ATTEMPTS attempts." >&2
echo "The unit was accepted by the supervisor and nothing served the lane —" >&2
echo "that is a DEFECT of the unit or of the wiring, not a missing measurement." >&2
exit 1
