---
match: [http-socket-activation.test.js]
mode: smart
threshold: 30
---
# http-socket-activation.test.js — the OS owns the socket, so a death costs nothing

✅ **WHY IT EXISTS.** `watchOwnCode` makes the daemon exit while an agent EDITS this repo, and each window silently cost every OTHER agent its injection; a long enough burst hit the start limit and killed the lane for the whole fleet. With socket activation the OS owns the listening socket: connections QUEUE in the kernel backlog while no instance runs, and the next one starts fresh. **No restart loop to rate-limit, stale code impossible by construction.**
🛑 **`Restart=on-failure` IS THEREFORE GONE FROM THE UNIT (`Restart=no`)** — re-adding it re-arms the burst this replaced.
📐 **THE PROTOCOL IS READ, NEVER SNIFFED** — sd_listen_fds(3), systemd 261~rc1, page 2026-05-24: `SD_LISTEN_FDS_START 3`, and it *"checks whether the $LISTEN_PID environment variable equals the daemon PID. If not, it returns immediately"*. 🛑 **That pid comparison is load-bearing**: these variables are INHERITED, so without it a daemon whose PARENT was activated would listen on a descriptor nobody gave it, silently. Nothing else is examined — no probe, no "does fd 3 look like a socket". Absent the variables the port path runs BYTE-IDENTICALLY to before.
🛑 **`Accept=no` OR THE LANE LOSES ITS REASON TO EXIST** — systemd.socket(5): `Accept=yes` spawns *"a service instance for each incoming connection"*, i.e. one node startup per frame, the ~330 ms this lane deletes, paid again with a supervisor on top. It is also what guarantees a single instance (*"only one service unit is spawned for all connections"*) where `EADDRINUSE` used to.
🔴 **LINUX ONLY, AND THE OTHER TWO ARE DECLARED, NEVER SIMULATED.** macOS HAS the capability (`Sockets` in the plist) but retrieval goes through `launch_activate_socket`, a C function of XPC — **MEASURED on Node 22.15.1: the 54 builtin modules expose NOTHING matching `/launch|activate_socket|listen_fds/`**, so it is unreachable in pure JS and a native addon is refused. Windows has no equivalent, and Node settles it anyway: *"Listening on a file descriptor is not supported on Windows"* (net, v22). **Both keep the eager restart AND the silent window** — say that, never imply parity.
📚 History and eliminated hypotheses: `http-lane-reference.md` (`inject: never`).
