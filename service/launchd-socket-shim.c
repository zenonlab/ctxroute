/*
 * ═══════════════════════════════════════════════════════════════════════
 * launchd-socket-shim — hands launchd's listening socket to node, then
 * gets out of the way. macOS ONLY.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 🔑 WHY THIS FILE EXISTS, IN ONE SENTENCE. Linux closes the daemon's
 *    stale-code window because systemd owns the listening socket and hands it
 *    over through an ENVIRONMENT protocol any language can read. launchd has
 *    the same capability — the `Sockets` key — but its hand-over goes through
 *    `launch_activate_socket`, a C function. There is no environment protocol
 *    on this platform, so nothing a JavaScript process can read. This shim is
 *    the translation, and it is the ONLY reason it exists: it turns launchd's
 *    C hand-over into the environment protocol `http-server.js` ALREADY
 *    implements for systemd.
 *
 * 🛑 ZERO ENGINE LINES. `src/hooks/http-server.js` is not modified and must not
 *    be: `inheritedFd()` reads `LISTEN_FDS`/`LISTEN_PID` and takes descriptor 3
 *    exactly as sd_listen_fds(3) specifies. This file makes macOS look like the
 *    world that function already knows. If you ever find yourself adding a
 *    macOS branch to the daemon, you are in the wrong layer — the whole point
 *    is that the daemon never learns which supervisor started it.
 *
 * 🛑 NO DEPENDENCY, NO SIGNING, NO ADDON. `launch_activate_socket` lives in
 *    libSystem, which every Mac has; this compiles with the `cc` shipped by the
 *    Command Line Tools and links nothing. The one npm package that wraps this
 *    call is DEAD (last publish 2019-04-28, prebuilts stopping at Node 12 /
 *    x64, never an arm64 build) and a native node addon is refused outright:
 *    this framework must install from a plain clone. A ~40-line executable that
 *    `execv`s is not an addon — it never enters node's process at all, it
 *    BECOMES it.
 *
 * ⚠️ IT IS NOT A SUPERVISOR, AND MUST NEVER BECOME ONE. It does not fork, does
 *    not wait, does not restart, does not write a PID file and does not ask
 *    whether anything is already running. It `execv`s, so after that line THIS
 *    PROCESS IS NODE — same pid, same descriptors, one entry in launchd's
 *    bookkeeping. A shim that stayed alive would insert exactly the layer this
 *    architecture deletes.
 *
 * 📐 THE PROTOCOL IS READ, NEVER SNIFFED — sd_listen_fds(3), systemd 261~rc1,
 *    page 2026-05-24: "#define SD_LISTEN_FDS_START 3", descriptors are "3, 4,
 *    5, 6, ..., if any", and the implementation "checks whether the $LISTEN_PID
 *    environment variable equals the daemon PID. If not, it returns
 *    immediately".
 *
 * 🛑 THE PID WE PUBLISH IS OUR OWN, AND THAT IS THE LOAD-BEARING LINE OF THIS
 *    FILE — not a formality. `LISTEN_FDS`/`LISTEN_PID` are ORDINARY environment
 *    variables, so they are INHERITED by every descendant. Without the pid, a
 *    process whose PARENT was socket-activated would read "there is a socket on
 *    fd 3" and listen on a descriptor nobody ever gave it — answering, or
 *    failing to answer, on somebody else's socket, SILENTLY. That is the entire
 *    reason the protocol carries a pid at all, and it is why writing the pid
 *    here is a correctness requirement rather than a courtesy.
 * ✅ `execv` PRESERVES THE PID, which is what makes this legal: the process that
 *    calls `setenv` and the node process that later compares against `getpid()`
 *    are the SAME process, wearing a different program. Writing the pid AFTER
 *    the exec would be impossible; writing a different one would be the defect
 *    above, deliberately introduced.
 *
 * ⚠️ FAIL LOUDLY, NEVER FALL BACK. If launchd hands us no socket we exit
 *    non-zero and say so on stderr (launchd routes it to the unified log). We
 *    do NOT quietly `execv` node anyway: node would then bind the port itself,
 *    the plist's socket would sit unused, the window this file exists to close
 *    would be silently open, and every observable would look perfect. A loud
 *    failure is the only honest outcome here.
 *
 * ⚠️ `Listeners` IS A NAME, AND IT IS SHARED WITH THE PLIST. It is the key of
 *    the dictionary under `Sockets` in `com.ctxroute.http.plist`; changing one
 *    without the other yields "no such socket" at every activation. Apple
 *    documents the shape in "Creating Launch Daemons and Agents".
 *
 * 🔴 SOURCE STATUS, STATED AND NOT HIDDEN — the same caveat the plist carries.
 *    Apple's web copies of this material are ARCHIVED (that page last updated
 *    2016-09-13; TN2083 "no longer being updated"). The AUTHORITY for the
 *    installed system is `man launch_activate_socket` / `man launchd.plist` ON
 *    THE TARGET MAC. The one thing measured rather than read is the retrieval
 *    gap itself: on Node 22.15.1 the builtin modules expose NOTHING matching
 *    /launch|activate_socket|listen_fds/, which is why a C translation is the
 *    only road.
 *
 * ⚠️ NEGATIVE-CHECK: this file is sabotaged by COPY, never in place. The CI job
 *    rewrites `getpid` to `getppid` into a copy under the OS tmpdir and demands
 *    that the macOS job go RED — the pid comparison then fails inside node,
 *    node falls back to binding the port, launchd is already holding it, and
 *    the daemon dies on EADDRINUSE. Never add a sabotage switch to this source:
 *    a broken build must be impossible to ship, not merely discouraged.
 * ═══════════════════════════════════════════════════════════════════════
 */

#include <launch.h>

#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

/*
 * ⚠️ sd_listen_fds(3), verbatim: "#define SD_LISTEN_FDS_START 3". Not a guess
 *    and not a coincidence — 0/1/2 are stdin/stdout/stderr, so the first passed
 *    descriptor is necessarily the fourth. The same constant is named
 *    `SD_LISTEN_FDS_START` in `http-server.js`; they are two ends of ONE
 *    protocol and must never drift apart.
 */
#define SD_LISTEN_FDS_START 3

/*
 * ⚠️ sysexits(3) values, used for what they mean and nothing else.
 *    EX_USAGE   — this program was called wrong (a broken plist, not a broken
 *                 machine).
 *    EX_CONFIG  — launchd gave us no socket: the `Sockets` key is missing,
 *                 misnamed, or this job was started outside launchd. It says
 *                 "the configuration cannot host this", never "node is broken".
 *    EX_OSERR   — the operating system refused a call that cannot legitimately
 *                 fail here (dup2, fcntl, setenv, execv).
 */
#define EX_USAGE  64
#define EX_OSERR  71
#define EX_CONFIG 78

int main(int argc, char *argv[]) {
    if (argc < 2) {
        fprintf(stderr,
                "launchd-socket-shim: usage: launchd-socket-shim <program> [args...]\n"
                "  It is meant to be the FIRST entry of ProgramArguments in\n"
                "  com.ctxroute.http.plist, followed by the node binary and the\n"
                "  daemon's entry point.\n");
        return EX_USAGE;
    }

    /*
     * ⚠️ THE ONE CALL THIS FILE EXISTS FOR. `launch_activate_socket` returns 0
     *    on success and an errno value otherwise — it does NOT set the global
     *    `errno`, so the message below reads the RETURN, never `errno`. Getting
     *    that backwards prints "Undefined error: 0" on the one failure anybody
     *    would ever need to read.
     */
    int *fds = NULL;
    size_t count = 0;
    int err = launch_activate_socket("Listeners", &fds, &count);
    if (err != 0) {
        fprintf(stderr,
                "launchd-socket-shim: launch_activate_socket(\"Listeners\") refused: %s\n"
                "  Either the plist declares no `Sockets`/`Listeners` dictionary, or this\n"
                "  program was started outside launchd. NOT falling back to letting node\n"
                "  bind the port: that would leave the stale-code window silently open\n"
                "  while every observable looked healthy.\n",
                strerror(err));
        return EX_CONFIG;
    }
    if (count < 1) {
        fprintf(stderr,
                "launchd-socket-shim: launchd accepted the request and handed over 0\n"
                "  descriptors. There is nothing to listen on; refusing to continue.\n");
        free(fds);
        return EX_CONFIG;
    }

    /*
     * ⚠️ ONLY THE FIRST DESCRIPTOR IS USED, and the plist declares exactly one
     *    listener. If a future plist declared several this would take the first
     *    and ignore the rest — STATED, not silently handled, exactly as
     *    `http-server.js` states it on the systemd side.
     */
    int given = fds[0];

    if (given != SD_LISTEN_FDS_START) {
        /*
         * ⚠️ `dup2` IS ALSO WHAT CLEARS FD_CLOEXEC, and that is not a side
         *    effect we tolerate — it is the mechanism. POSIX: the new
         *    descriptor does NOT inherit the close-on-exec flag. Since launchd
         *    hands its descriptors with FD_CLOEXEC set, a socket that was not
         *    duplicated would be CLOSED by the `execv` below and node would
         *    find nothing on fd 3.
         */
        if (dup2(given, SD_LISTEN_FDS_START) == -1) {
            fprintf(stderr, "launchd-socket-shim: dup2 onto descriptor %d failed: %s\n",
                    SD_LISTEN_FDS_START, strerror(errno));
            return EX_OSERR;
        }
        close(given);
    } else {
        /*
         * 🛑 THE EDGE CASE THAT WOULD OTHERWISE BE A SILENT DEAD SOCKET. When
         *    launchd already handed us descriptor 3, `dup2(3, 3)` is defined as
         *    a NO-OP — and a no-op does not clear FD_CLOEXEC. The descriptor
         *    would then be closed by `execv` and node would see nothing, on a
         *    machine where the numbering happened to line up. Clear the flag
         *    explicitly instead of relying on a duplication that will not
         *    happen.
         */
        int flags = fcntl(SD_LISTEN_FDS_START, F_GETFD);
        if (flags == -1
            || fcntl(SD_LISTEN_FDS_START, F_SETFD, flags & ~FD_CLOEXEC) == -1) {
            fprintf(stderr,
                    "launchd-socket-shim: could not clear FD_CLOEXEC on descriptor %d: %s\n",
                    SD_LISTEN_FDS_START, strerror(errno));
            return EX_OSERR;
        }
    }
    free(fds);

    /*
     * 🛑 OUR OWN PID — read the header. `execv` keeps it, so the node process
     *    that compares `LISTEN_PID` against `getpid()` is literally this
     *    process. Publishing anything else (a parent's pid, a constant) is the
     *    defect the protocol carries a pid to prevent, and it is what the CI
     *    negative-check introduces into a COPY of this file.
     */
    char own_pid[32];
    snprintf(own_pid, sizeof own_pid, "%ld", (long)getpid());

    /*
     * ⚠️ EXACTLY ONE DESCRIPTOR IS ANNOUNCED because exactly one was taken
     *    above. Announcing more than we placed would send node reading fd 4.
     */
    if (setenv("LISTEN_FDS", "1", 1) != 0 || setenv("LISTEN_PID", own_pid, 1) != 0) {
        fprintf(stderr, "launchd-socket-shim: setenv failed: %s\n", strerror(errno));
        return EX_OSERR;
    }

    /*
     * ⚠️ `execv`, NEVER `fork` + `exec`, NEVER a shell. A fork would make this a
     *    supervisor and give launchd the wrong process to watch; a shell would
     *    change the process launchd supervises and this repository forbids
     *    shell indirection on every layer. `argv[1]` is the program and
     *    `&argv[1]` its argument vector, so node receives argv[0] = its own
     *    path, argv[1] = the daemon's entry point.
     * ⚠️ We do NOT unset the two variables (sd_listen_fds' unset_environment
     *    flag exists so CHILDREN do not inherit them); this daemon spawns none,
     *    and `http-server.js` documents the same choice on the systemd side.
     */
    execv(argv[1], &argv[1]);

    fprintf(stderr, "launchd-socket-shim: execv(\"%s\") failed: %s\n",
            argv[1], strerror(errno));
    return EX_OSERR;
}
