#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// HTTP SHELL — the SAME PreToolUse gate, served over a local socket.
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ NOT WIRED. Written 2026-08-20, deliberately inert: no `settings.json`
//    entry points at it, nothing spawns it. The switch-over is an EXPLICIT
//    decision of the maintainer, at a moment when no agent is running.
//    Its only job today is to be PROVEN byte-identical to the spawn lane.
//
// WHY IT EXISTS — measured, not assumed. The `command` lane spawns one node
// per frame on EVERY tool call: ~330 ms each, of which 96 % is node's own
// startup. At 16 frames that is ~5.3 s of pure overhead per action. Claude
// Code documents a second handler type — verified IN the installed binary
// 2.1.237, literal `type:"http"` / `url` "URL to POST the hook input JSON to"
// — which POSTs to an ALREADY RUNNING service. The startup cost disappears.
// 🛑 The 10,000-character cap per hook output does NOT: it is per OUTPUT, not
//    per process. N declarations are therefore STILL required for bandwidth —
//    what changes is their price, not their number. Never "simplify" this to a
//    single declaration: an action's capacity would collapse to one frame and
//    the agent would act on partial knowledge (cf the skill, MULTI-FRAME).
//
// ⚠️ CODEX HAS NO SUCH HANDLER — official doc read 2026-08-20: *"Only
//    type: "command" handlers run today"*. It stays on the spawn lane, and that
//    asymmetry is the NORMAL case of this architecture (thin shell per harness,
//    frozen engine), never a degradation to fix.
//
// ⚠️ THIS FILE IS A SHELL AND NOTHING ELSE. It owns the TRANSPORT (a socket
//    instead of stdin/stdout) and nothing more. Every decision — which docs,
//    cadence, chunking, state — comes from `pretool-core`, unchanged and
//    unaware that any of this exists. If you find yourself deciding something
//    here, you are in the wrong layer: STOP.
//
// 🛑 THE DIALECT IS NOT REIMPLEMENTED HERE. The response JSON is produced by
//    `doc-inject.output()`, the very function the spawn lane uses. A second
//    copy of that shape would be a CLONE (jscpd sees it) and, worse, a TWIN
//    that drifts — the defect class this repository exists to fight. Requiring
//    that module is safe: its `require.main` guard means importing it reads no
//    stdin and kills nothing.
//
// 🛑 NO DEADLINE IS ARMED HERE, and that is a DELIBERATE INVERSION of the rule
//    every other shell follows. `deadline.arm()` exists to stop a hook PROCESS
//    from becoming a zombie (875 of them on 15/07/2026); a daemon is a process
//    that is SUPPOSED to outlive its request. Arming it would shoot the service
//    at the first timeout. The bound that matters here belongs to the harness
//    (`timeout` on the http handler), not to us.
//
// 🛑 LOOPBACK ONLY. Binding anywhere but 127.0.0.1 would expose an endpoint
//    that returns this fleet's private knowledge to the local network. There is
//    no authentication and there must never need to be one: the socket is the
//    boundary.
// ═══════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════
// STRUCTURAL AUDIT OF ACCUMULATION — done by READING, 2026-08-20.
// ═══════════════════════════════════════════════════════════════════════
// 🛑 A LEAK IS NOT PROVEN ABSENT BY A TEST. The suite exercises thousands of
//    requests in seconds and can only catch the coarse ones — the kind that
//    retain hundreds of bytes on the HAPPY path. The vicious ones retain a few
//    bytes on a RARE event (an abort, an error, a restart) and surface after
//    WEEKS of uptime, which no test run will ever reach. The only real
//    assurance is that the code cannot accumulate BY CONSTRUCTION. Hence this
//    list: the known classes, each checked against this file, so the next agent
//    inherits the audit instead of redoing it.
//    ① UNBOUNDED COLLECTION keyed by something that grows (session, request):
//       none here, and none in the engine either — zero module-level mutable
//       state across the 19 modules this process loads.
//    ② LISTENERS PILING UP ON A LONG-LIVED EMITTER: every `on()` below is bound
//       to a PER-REQUEST object that dies with the request. The two exceptions
//       are registered ONCE at startup (`server.on('error')`, the watchers).
//    ③ TIMERS NEVER CLEARED: none. `deadline.arm()` is deliberately not called.
//    ④ A PROMISE THAT MAY NEVER SETTLE and ⑤ AN UNHANDLED REJECTION KILLING THE
//       PROCESS: guarded in `readBody` and in the request handler.
//       🔴 **AND THE GUARDS ARE NOT THERE BECAUSE EITHER WAS OBSERVED — THE
//       MEASUREMENT REFUTED BOTH.** Reproduced on Node **22.15.1/Windows**
//       WITHOUT the guards: an aborted request still settles, writing to the
//       destroyed socket does NOT throw, and the server survives. Whoever reads
//       this must not repeat "an abort used to kill the daemon": it did not.
//       What the guards buy is INDEPENDENCE from that behavior, which is an
//       undocumented implementation detail of one runtime version, on a process
//       meant to run for months across upgrades. Settling on `close` (which
//       always fires, and fires last) makes "every request settles exactly
//       once" true BY CONSTRUCTION rather than by Node's current tolerance.
//       ⚠️ That is the honest reason, and it is the only one that may be cited.
//    ⑥ BUFFERS HELD PAST THEIR USE: released at settle time, not at `end`.
//    ⑦ SOCKETS HELD FOREVER: bounded by Node's own `keepAliveTimeout` (5 s),
//       `headersTimeout` and `requestTimeout`. We do NOT restate those numbers:
//       they are the runtime's, a second copy would be a second truth. They are
//       also the ONLY legitimate delays here — they bound "connected but
//       silent", which is the undecidable case, never a liveness verdict.
// ⚠️ WHAT THIS AUDIT DOES NOT CLOSE, stated rather than hidden: growth on DISK.
//    The state store gains a file per session scope and nothing evicts old ones.
//    That is an engine-wide question, not one the HTTP lane creates — the spawn
//    lane has it too — but a service running for months is what makes it VISIBLE.
//    Do not treat it as covered by anything in this file.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const http = require('http');
// The four route names of our own wire protocol, from their single owner.
const { routes: protocolRoutes } = require('../protocol-routes-pure');
const { run, afterOutput } = require('../pretool-core');
// ⚠️ WHICH CONTENT INDEX A CONNECTING FRAME RECEIVES (2026-08-29). The daemon is
//    the single process that sees every connecting request of ONE invocation —
//    see the block above `/pretool`'s handling, below, for the defect this
//    closes (Windows loopback ETIMEDOUT losing ~6% of frame connections).
const frameSequencer = require('../frame-sequencer-pure');
// 🔑 THE OTHER HALF OF THE SAME GUARANTEE (2026-08-31). The sequencer makes the
//    frames that DO connect carry the next undelivered chunk; `carryover-pure`
//    hands back the chunks that no connection ever came to fetch. Only this
//    daemon can tell the two apart — it alone sees every connecting request of
//    one invocation.
const carryover = require('../carryover-pure');
// ⚠️ THE ARRIVAL ORDER MUST SURVIVE THIS PROCESS'S DEATH — this daemon exits by
//    design at every code delivery, and until 2026-09-19 that reset the three
//    tables below, so the frames of an invocation in flight were counted as the
//    FIRST again and re-served chunk 1. The decision of what may be adopted is
//    PURE next door; this file only reads and writes the file.
const invocationSnapshot = require('../invocation-snapshot-pure');
// 🔑 ONE DIALECT FOR EVERY OPERATION ON A TABLE OR ON THE STORE (2026-09-20).
//    With no pool, `createOps` forwards straight to the three pure modules with
//    the three local maps — today's behaviour, one call deeper. With a pool, a
//    server thread holds a CLIENT of the owner thread exposing the SAME shape.
//    Two roads, one body: a second copy of "which argument, in which order"
//    would drift on the first change to either.
const ownerOps = require('../owner-ops');
// 🔑 HOW MANY THREADS, AND WHICH ONE HOLDS WHICH SOCKET — the PURE decision,
//    refusals included. The shell below only reports what it answers and starts
//    what it names. `workers: 0`, the default, means no thread at all and
//    today's path byte for byte.
const workerPool = require('../worker-pool-pure');
const threadChannel = require('../thread-channel-pure');
const { Worker } = require('node:worker_threads');
const { createClient } = require('./owner-client');
const os = require('node:os');
// -- THE HUMAN-FACING VERDICT DERIVED FROM THE SAME FACTS (2026-08-30): once
//    `frame-sequencer-pure` has decided WHICH content index a connecting
//    request receives, this PURE module decides whether that observation
//    means the invocation is now COMPLETE or, on a later unrelated
//    invocation's first observation, that an earlier one was DEFERRED
//    (evicted before it ever reached its last piece). See its header and
//    `delivery-notice.md` for the reasoning; this shell only calls it and
//    turns its verdict into a `systemMessage`, exactly like the withholding
//    notice and the capacity alarm already composed in `pretool-core.js`.
//    DECLARED, PERMANENT gap with the spawn lane: `differential-normalize.js`
//    strips this ONE known suffix before any HTTP <-> spawn comparison.
const deliveryNotice = require('../delivery-notice-pure');
const collectCore = require('../collect-core');
const lib = require('../lib-pure');
// ⚠️ THE OTHER THREE CONSUMERS OF THE ONE STATE (2026-08-21). The gate was wired
//    to the daemon and the three others were left on the disk — MEASURED: after a
//    real PreCompact the daemon still held its memory, so skills and `once`
//    documents never came back, with no error, no badge, no red. **A shared state
//    is migrated for ALL its consumers or for none.** These two modules are what
//    lets the SAME handler and the SAME store answer them.
const emission = require('../emission-core');
const turnCore = require('../turn-core');
const { output } = require('./doc-inject');
const path = require('path');
const paths = require('../paths');
// The REAL cross-process lock: since 2026-08-22 the daemon is no longer the only
// writer of the durable state — a client that cannot reach it writes the same
// files. Serialising against that client is the reason this is not a no-op.
const lockModule = require('../lock');
// ⚠️ THE LOCAL NAME `withLock` IS LOAD-BEARING, exactly as in `pretool-core`.
//    `state-write-under-lock-gate` proves no state write escapes the critical
//    section by matching the SHAPE of the call site: a write wrapped in
//    `lockModule.withLock(...)` is INVISIBLE to it, so the routes below would be
//    protected in fact and unprotected in the eyes of the only thing that checks.
//    Do not "tidy" this alias away.
const withLock = lockModule.withLock;

// ⚠️ THE OWNER OF THE LOCK ADDRESSES — the daemon writes the DURABLE class
//    through to the same files the spawned lane locks, so it must take the SAME
//    lock, by the SAME name. Composing it here would be a second spelling.
const storeResolve = require('../store-resolve');
// ⚠️ THE SECOND TRANSPORT (2026-08-21). `endpoint()` names the kernel rendezvous
//    per OS; `bind` takes it, clearing a DEAD macOS entry only after asking the
//    kernel who answers. Neither is reimplemented here — see the block in `main`.
const { endpoint } = require('../kernel-endpoint');
const { bind } = require('../kernel-bind');
// 🔴 THE JOURNAL OF THIS PROCESS'S OWN LIFE (2026-08-22). MEASURED that day:
//    NINE restarts in one hour, exit 90, and NOT ONE TRACE — no instant, no
//    reason, nothing to count. The deaths are correct (`watchOwnCode` refuses to
//    serve stale logic); the SILENCE was the defect, and an unobservable failure
//    costs one round trip PER HYPOTHESIS.
// 🛑 LIFECYCLE EVENTS ONLY — never a heartbeat, NEVER a line per request. One
//    agent action is 16 requests here: a per-request line would be a disk writer
//    growing with TRAFFIC, and SSD wear is a real constraint on this machine.
//    The vocabulary is a closed list in `lifecycle-log-pure.js`; an event
//    outside it writes nothing at all.
// ⚠️ Bounded for life by the `logging` setting (default 256 KB × 2 files), the
//    worst case declared in `disk-writers.json`, and FAIL-OPEN everywhere:
//    nothing below may cost this daemon its life.
const lifecycle = require('../lifecycle-log');
// ⚠️ THE ONE JOURNAL WRITER, for the per-request trace only (`debug` level,
//    off by default). Life events keep going through `lifecycle` above.
const log = require('../log');
// ⚠️ THE PURE SIDE IS REQUIRED SEPARATELY, ON PURPOSE. `lifecycle-log` exports
//    only the SHELL (`record`/`logPath`), because the shell is what touches the
//    disk; the DECISION of whether a duration is worth a line is pure, mutated,
//    and belongs to whoever asks the question — here, the request handler.
const lifecyclePure = require('../lifecycle-log-pure');
// ⚠️ NOT `lifecyclePure`: that name is the JOURNAL's pure half above. This one
//    decides when the daemon RUNS (`http.lifecycle`) — two modules, two words.
const daemonLifecycle = require('../lifecycle-pure');
// 🔑 THE EVENT LOOP'S DELAY, ARMED ONCE FOR THE PROCESS'S WHOLE LIFE
//    (2026-09-18). Node's own histogram (`perf_hooks.monitorEventLoopDelay`):
//    the runtime samples itself, so there is no timer of ours, nothing to
//    declare to `temporal-budget.json`, and the cost is a counter the runtime
//    already maintains. `unref()` so a metric can never be the reason a process
//    refuses to die — the same law the code and corpus watchers already obey.
// 🛑 FAIL-OPEN, LIKE EVERY OTHER READER HERE: if this runtime does not expose
//    it, `loopDelay` stays `null`, the fields go out as `null`, and NOTHING
//    else changes. A measurement that cannot be taken is `null`, never zero —
//    zero would read as "the loop was never blocked", which is the lying green
//    this repository refuses everywhere else.
const loopDelay = (() => {
  try {
    const h = require('node:perf_hooks').monitorEventLoopDelay({ resolution: 10 });
    h.enable();
    // ⚠️ PROBED, NEVER ASSUMED, AND THE PROBE IS NOT DECORATIVE: `unref` is absent
    //    from the histogram on Node 22.15.1 (measured — calling it threw), while
    //    the published type declares none at all. The guard is what keeps the
    //    daemon from dying on a runtime that does expose it differently; the cast
    //    only tells the checker we know we are reaching past its declaration.
    const maybeUnref = /** @type {{ unref?: () => void }} */ (h).unref;
    if (typeof maybeUnref === 'function') maybeUnref.call(h);
    return h;
  } catch {
    return null;
  }
})();
const backlogCeiling = require('../backlog-ceiling-pure');
const http2Preface = require('../http2-preface-pure');

/**
 * The kernel's own ceiling on any `listen` backlog, or `null` when unknowable.
 *
 * 🛑 I/O LIVES HERE, THE DECISION DOES NOT — `backlog-ceiling-pure` judges, this
 *    only reads. A verdict written next to a `readFileSync` is a verdict Stryker
 *    never mutates, which is this fleet's worst defect class.
 * ⚠️ ABSENCE IS THE NORMAL CASE, NOT AN ERROR: `/proc` does not exist on Windows
 *    or macOS. It returns `null`, and the journal renders that as unknown — never
 *    as a measured zero, which would accuse a kernel nobody asked.
 *
 * @returns {number|null}
 */
function readSomaxconn() {
  try {
    // ⚠️ REQUIRED HERE, not at module scope: this shell must stay loadable by the
//    spawned clients, and a top-level `fs` binding did NOT exist in this file --
//    the ReferenceError was swallowed by the catch below, so this measurement
//    silently returned `null` on EVERY kernel, Linux included.
  const raw = require('node:fs').readFileSync('/proc/sys/net/core/somaxconn', 'utf8').trim();
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}
// 🔴 FRESHNESS IS AN OBSERVATION SINCE 2026-08-24, IT WAS AN INFERENCE BEFORE.
//    The daemon exited on ANY kernel notification, concluding "my code changed".
//    MEASURED that day on the FROZEN copy: 258 deaths, and the event that killed
//    it carried an UNCHANGED `mtime`/`ctime` — only `atime` had moved. Reading a
//    file was enough. `stale-code.js` holds the bytes this process compiled;
//    `stale-code-pure.js` compares them. Never go back to trusting the event.
// ⚠️ THE NAMESPACE IS KEPT, NEVER DESTRUCTURED: `staleCode.check` must stay
//    replaceable in memory, because the SEEN RED of this guard is a driver that
//    sabotages the comparison so it always answers "identical".
// ⚠️ THE HARNESS'S OWN NUMBERS, READ AS DATA — never a literal in this shell.
const harnessProfile = require('../harness-profile');
const staleCode = require('../stale-code');
const staleCodePure = require('../stale-code-pure');

// 🔴 THE LISTENING ADDRESS IS NOT A CONSTANT OF THIS FILE ANY MORE (2026-08-25).
//    BOTH HALVES WERE — `HOST = '127.0.0.1'` and `DEFAULT_PORT = 8787`, right
//    here — while `wiring.json` declared `transport.host` and `transport.port`
//    on the other side: ONE truth, TWO places, twice over, agreeing by luck with
//    nothing comparing them. That is the class of the 2026-08-22 split brain,
//    and here the failure would be total and silent: the http lane has NO
//    fallback, so a wiring one number — or one name — away from this listener
//    loses EVERY frame of EVERY action, instantly, with no error and no badge.
// ⇒ It is now ONE declared key of `ctxroute-config.json` (`http: { host, port }`,
//    grouped because an address is ONE fact), resolved at the SINGLE point
//    `paths.httpEndpoint()` — the same one `tools/wiring-generate.js` reads to
//    write the URL the harness POSTs to. There is no second place to write.
//    `CTXROUTE_HTTP_PORT` still wins over the port, and an undeclared machine
//    still gets 127.0.0.1:8787, byte for byte.
// 🛑 THE LOOPBACK DOCTRINE DID NOT MOVE, it changed OWNER — read the header of
//    this file: there is no authentication and there must never need to be one,
//    the socket IS the boundary. What used to be impossible by construction is
//    now the DEFAULT plus the operator's written declaration, and the supervisors
//    that own the socket keep saying it themselves (`ListenStream=127.0.0.1:`,
//    `SockNodeName`). Do NOT re-introduce a constant here to “make sure”: a
//    second opinion about one address is exactly the defect above.

// ═══════════════════════════════════════════════════════════════════════
// SOCKET ACTIVATION — the OS owns the listening socket, we inherit it.
// ═══════════════════════════════════════════════════════════════════════
// 🔴 THE DEFECT IT REMOVES, and it is auto-inflicted. `watchOwnCode` makes this
//    process exit as soon as its own code changes — which is exactly what an
//    agent WORKING on this repository does, ten times in two minutes. While the
//    supervisor brings a fresh instance back, nothing is listening, so every
//    OTHER agent's injection is lost IN SILENCE (measured: with no daemon the
//    tool simply runs, no error surfaces, the agent never learns it acted
//    without its knowledge). Worse, a long enough burst hits systemd's
//    StartLimitBurst and the unit lands in `failed`, where systemd deliberately
//    stops restarting it: the whole fleet loses the lane, permanently.
// ✅ WHEN THE OS OWNS THE SOCKET, THAT WINDOW CANNOT EXIST. The listening socket
//    is created and held by the supervisor, never by us; while no instance is
//    running the connections QUEUE in the kernel's backlog instead of being
//    refused, and the arrival of one is what starts the next instance. There is
//    no restart loop left to rate-limit, and stale code becomes impossible by
//    construction: every instance is born after the change.
//
// 📐 THE CONTRACT, from sd_listen_fds(3), systemd 261~rc1, page 2026-05-24:
//    "#define SD_LISTEN_FDS_START 3" and the descriptors are "3, 4, 5, 6, ...,
//    if any"; internally sd_listen_fds() "checks whether the $LISTEN_PID
//    environment variable equals the daemon PID. If not, it returns
//    immediately". systemd.socket(5), same version and date, on Accept=: "If no,
//    all listening sockets themselves are passed to the started service unit,
//    and only one service unit is spawned for all connections."
// 🛑 `Accept=yes` IS THE ONE SETTING THAT WOULD UNDO THIS WHOLE FILE. It spawns
//    "a service instance for each incoming connection" — i.e. one node startup
//    per frame, the ~330 ms this lane exists to delete, paid again with a
//    supervisor on top. The unit says `Accept=no` in writing for that reason.
//
// ✅ ZERO INFERENCE, ZERO PROBE. We do not test whether fd 3 looks like a socket,
//    we do not sniff, we do not ask "am I under a supervisor?". The presence of
//    the two variables IS the OS telling us, in a documented protocol, that it
//    handed us a socket. Absent them, nothing changes: we bind the port exactly
//    as before.
// 🛑 `LISTEN_PID` MUST BE COMPARED TO OUR OWN PID, AND IT IS NOT A FORMALITY.
//    Environment variables are INHERITED: a process started by a socket-activated
//    parent sees that parent's LISTEN_FDS/LISTEN_PID. Listening on somebody
//    else's descriptor would be a silent, unreproducible bug — the daemon would
//    answer on a socket it was never given. That is precisely why the protocol
//    carries the pid at all.
//
// ⚠️ WE DO NOT UNSET THE VARIABLES, unlike sd_listen_fds(unset_environment=1).
//    That flag exists so CHILD processes do not inherit them; this daemon spawns
//    none. Mutating `process.env` from a required module would instead be an
//    invisible side effect on every test that imports this file.
// ⚠️ ONLY THE FIRST DESCRIPTOR IS USED, and the unit declares exactly one
//    `ListenStream=`. If a future unit ever declared several, this would take
//    the first and ignore the rest — stated, not silently handled.
//
// ⚠️ LINUX ONLY, AND THE OTHER TWO ARE DECLARED RATHER THAN SIMULATED.
//    • macOS: launchd has the same capability (`Sockets` in the plist) but the
//      descriptors are retrieved through `launch_activate_socket`, a C function
//      of the XPC framework — there is no environment protocol. MEASURED
//      2026-08-20 on Node 22.15.1: scanning the 54 builtin modules for any
//      export matching /launch|activate_socket|listen_fds/ returns NOTHING, and
//      "launchd" appears nowhere in the `net` documentation. ⇒ UNREACHABLE from
//      pure JS; a native addon is refused. The plist keeps the eager-restart
//      model and says so.
//    • Windows: there is no equivalent, and the Node side settles it anyway —
//      net(1), Node v22 doc: "Listening on a file descriptor is not supported on
//      Windows." (WAS/net.tcp activation exists but only hosts managed WCF
//      applications under IIS, never a bare node.exe.)
// ⇒ On both, `inheritedFd` returns null and the port path runs, unchanged.
// ═══════════════════════════════════════════════════════════════════════

// ⚠️ sd_listen_fds(3), verbatim: "#define SD_LISTEN_FDS_START 3". Not a guess and
//    not a coincidence — 0/1/2 are stdin/stdout/stderr, so the first passed
//    descriptor is necessarily the fourth.
const SD_LISTEN_FDS_START = 3;

// ⚠️ Refuse a body that could not possibly be a hook payload BEFORE buffering it
//    all. A daemon lives for months: an unbounded read is a memory leak waiting
//    for its trigger. The real payloads measured on this fleet stay far under
//    this — the bound is a wall, never a working limit.
const MAX_BODY_BYTES = 4 * 1024 * 1024;

// ⚠️ DECLARED, NEVER LEFT TO THE PLATFORM DEFAULT (2026-09-17) — a fixed-size
//    accept QUEUE is capacity like any other in this project (frames, disk
//    budgets) and was the one left undeclared. Node/libuv's own default is
//    511 (nodejs.org, net.html, v26.9.0) — a generic constant, never sized
//    against THIS fleet's real burst. Official Microsoft doc (winsock2
//    `listen()`): "If a connection request arrives and the queue is full,
//    the client will receive an error with an indication of WSAECONNREFUSED"
//    — the EXACT symptom measured in production (ctxroute-daemon burst,
//    2026-09-16/17).
// 🔴🔴 THIS CONSTANT IS HYGIENE, **NOT** A FIX FOR THE `ECONNREFUSED` CLASS —
//    SELF-CORRECTED 2026-09-17, HOURS AFTER SHIPPING IT. The session that
//    added it claimed it was "the only lever on our side of the boundary".
//    That claim CONTRADICTED three measurements already recorded in
//    `http-lane.md`, and the honest reading is the opposite:
//    ① the harness client opens **ONE** hook connection at a time
//       (`maxSimultaneous = 1` over 21,500 requests, 32 frames, 6 parallel
//       tool calls, 4 subagents) ⇒ there is NO simultaneous burst to absorb,
//       and a queue of ~200 cannot overflow from our own traffic;
//    ② the captured failures were **650/650 TIMEOUTS, never refusals** — a
//       queue size repairs neither;
//    ③ a fixed backlog threshold was ALREADY eliminated by name there
//       ("511 broke once, then 600 passed — a coincidence read as a law").
// 🛑 AND ON WINDOWS THE CEILING IS 200 — MEASURED, NOT "unmeasurable".
//    libuv passes the RAW integer to `listen()` (`src/win/tcp.c`, read at
//    source); Winsock then levels any POSITIVE backlog to 200, and libuv
//    adds its 32 pre-posted `AcceptEx` on top. The ONLY documented way past
//    it is `SOMAXCONN_HINT(b)`, defined as `(-(b))` — a NEGATIVE value.
// 📐 MEASURED ON THIS MACHINE 2026-09-18, BY BEHAVIOUR (listen, BLOCK the
//    loop so nothing is accepted, burst, count what the kernel queued before
//    the first refusal; zero unresolved attempts, which is what makes it a
//    proof rather than an artefact). 🔴 An earlier line here read Microsoft's
//    "no standard provision to find out the actual backlog value" as "the
//    change is not even measurable there" — that is FALSE: the sentence
//    bounds the API, never the measurement.
//      backlog     64  ->  depth    96   (the argument IS honoured below the cap)
//      backlog    200  ->  depth   232
//      backlog    300  ->  depth   232   (levelled to 200)
//      backlog   -300  ->  depth   232   (hint lost — 332 if it had applied)
//      backlog  -1000  ->  depth   232   (hint lost — 1032 if it had applied)
//    ⇒ a positive value BELOW the cap reaches the kernel exactly; everything
//    above it is levelled; and the negative hint does NOT take effect from
//    Node, while .NET reaches 700/1500 with that same hint on this machine
//    (`accept-queue-ceiling.md`). 🛑 WHERE it is lost is NOT established.
//    Microsoft's page notes the hint is "only supported by the Microsoft
//    TCP/IP service provider" — a sourced CANDIDATE, never a conclusion.
//    Do not write a cause for it without opening the layer in between.
// 🛑 Do NOT "fix" this by passing a negative number: it is a Windows-only
//    dialect, and Linux clamps a negative backlog to 0 — the same line would
//    give the fleet a queue of ZERO on the other platform.
// ✅ THE VALUE STAYS 65535, AND THAT WAS RE-EXAMINED ON 2026-09-18 RATHER
//    THAN INHERITED. Lowering it to nginx's 511 was proposed, written, and
//    REVERTED the same hour: on Windows both give 232 (everything is levelled
//    to 200 anyway), so the ONLY platform the figure changes is Linux — where
//    511 would grant 511 and 65535 grants `net.core.somaxconn` (4096 on 5.4+).
//    **The "cleaner" number was a capacity REGRESSION of 8x, bought for
//    appearances.** 🔑 Declaring above the kernel ceiling is a normal idiom
//    meaning "grant me your maximum", and the reference implementation says so:
//    systemd.socket(5) defaults `Backlog=` to **4294967295**.
// 🔴 WHAT WAS ACTUALLY WRONG HERE WAS NEVER THE FIGURE — IT WAS THE PROSE.
//    This block claimed the change was "not even measurable" on Windows and
//    that the class had "no known fix on our side". Both are measured false
//    above. The operator read `65535`, believed the queue was 65535, and
//    reasoned from it for weeks: **a declared value is only honest when the
//    value a caller actually GETS is written beside it.** That is now the
//    table above, and it is what must never be deleted.
// 🔑 CAPACITY DOES NOT COME FROM THIS NUMBER — IT COMES FROM THE NUMBER OF
//    SOCKETS, and that is MEASURED the same day, strictly linear inside ONE
//    process: 1 socket 232 · 2 sockets 464 · 4 sockets 928. Windows caps ONE
//    counter; it does not cap how many counters a process owns. That is what
//    `http.listeners` exists for. 🛑 Never cite THIS constant as the remedy
//    for a refused connection.
//
// 🔴 THE FULL SOLUTION SPACE WAS WALKED, OUT LOUD, ON 2026-09-17 — READ THIS
//    BEFORE PROPOSING ANY OF THESE AGAIN, THEY WERE ALL REJECTED WITH A REASON:
//    ① Client-side retry-with-backoff — the textbook answer for a transient
//       stall, and the one every reliable HTTP client uses. DOES NOT APPLY
//       HERE: the client on the http-type declarations is Claude Code's own
//       binary, which we do not own and which is CONFIRMED to never retry
//       (`anthropics/claude-code` #29963, closed NOT_PLANNED).
//    ② Move the affected content to the `command` lane and write OUR OWN
//       client with retry baked in — real, and it DOES close the gap for
//       that lane. But it cannot rescue THIS lane's traffic: a hook
//       declaration's type is fixed at config time, the harness fires
//       whatever is declared, and there is no runtime "http failed, spawn a
//       command hook instead" — that switch does not exist in the harness.
//    ③ Windows named pipe + `WaitNamedPipe` (the rendezvous lane already in
//       this codebase) instead of the TCP port — REJECTED, and this is the
//       one worth remembering: it is NOT a different fix, it is THIS SAME
//       fix (widen how long a caller waits before failing) wearing a
//       different transport. It buys nothing extra. It is also structurally
//       unavailable to Claude Code's native `http` hook type, which needs a
//       URL — a pipe path is not one (see the address split in `paths.js` /
//       `kernel-endpoint.js`).
//    🔑 WHY ①③② ALL COLLAPSE TO THE SAME ANSWER — this is the actual root
//       cause, measured and documented independently in `http-lane.md`: the
//       daemon answers in ~8 ms; the stall lives in the CLIENT PROCESS
//       (Claude Code / the harness) BEFORE it ever opens a connection to us.
//       Any fix that runs on OUR side of that connection — pipe, retry
//       script, bigger queue — starts AFTER the harness has already decided
//       to call us, so none of them can shorten or prevent an upstream
//       stall we have zero code and zero visibility inside of.
//    🔴 THE RETRACTION THAT USED TO END THIS LIST IS ITSELF WITHDRAWN
//       (2026-09-18). It read: "the fourth candidate is refuted: this class
//       has no known fix on our side". Both halves have since been measured
//       false, and each is a WITHDRAWAL rather than a reversal — the earlier
//       readings were real, they simply measured too little:
//       · `maxSimultaneous = 1` was taken against a STUB ON ANOTHER PORT,
//         never the production daemon; sampling the live one gives 32 for a
//         single session and `peakConn = 254` on the incident of 2026-09-18
//         (`accept-queue-ceiling.md`, which withdrew the burial by name).
//       · "no fix on our side" is refuted by a MEASUREMENT: the accept
//         ceiling is PER SOCKET and strictly linear — 232 · 464 · 928 for
//         1, 2 and 4 listening sockets in one process. That lever is ours,
//         it is a config key (`http.listeners`), and it needs nothing from
//         the client.
//       ⇒ ①②③ stay rejected FOR THE REASONS WRITTEN ABOVE — none of them
//       is about capacity. What is no longer true is that nothing on our
//       side can help. 🛑 The CAUSE of the client stall is still OPEN and
//       is not ours to close; say "OPEN", never "closed". And a plugin does
//       not debug its host: the answer to an uncontrollable client is a
//       side that cannot refuse, never an explanation of why it froze.
const LISTEN_BACKLOG = 65535;

// ⚠️ WHAT "NOTHING TO SAY" LOOKS LIKE OVER HTTP — and it is DECLARED UNMEASURED.
//    On the spawn lane, silence is an exit 0 with no stdout. The official doc
//    says the endpoint answers "using the same JSON output format as command
//    hooks" but does NOT say what an EMPTY body means. We send `{}` because it
//    is unambiguously valid JSON carrying no decision, where an empty body might
//    not parse at all. 🛑 This is the ONE guess in this file: it must be
//    CONFIRMED on a throwaway wiring before anything is switched over.
const NO_OUTPUT = {};

// ═══════════════════════════════════════════════════════════════════════
// WHICH INVOCATIONS HAVE ALREADY HAD THEIR CODE VERIFIED THIS ACTION
// ═══════════════════════════════════════════════════════════════════════
// 🔑 Read the full rationale at the call site (`freshnessDoneFor` below the
//    request body): profiled 2026-08-31, `readFileSync` was 30 % of the
//    daemon's real work because the 32 frames of ONE tool call each re-read
//    the same 36 modules.
// 🛑 A MAP, NEVER A PLAIN OBJECT — an invocation id is arbitrary harness text,
//    and `__proto__` on a plain object writes the prototype, not a key. Same
//    law as `frame-sequencer-pure.js`.
// 🛑 BOUNDED FOR LIFE: a daemon runs for weeks. Eviction is LRU by
//    re-insertion, and the ceiling mirrors the sequencer's for the same sizing
//    reason (one entry is a string key, nothing else).
// ⚠️ AN EVICTED ENTRY COSTS ONE EXTRA VERIFICATION, NEVER A WRONG ANSWER: the
//    forgotten invocation simply verifies again. Fail-SAFE by construction —
//    the failure mode of this table is doing MORE work, never serving stale
//    code, which is why no alarm is needed when it evicts.
// 🛑 THE DECISION LIVES IN A PURE MODULE, NEVER HERE — house law, and it was
//    briefly broken: this logic first shipped INSIDE this I/O shell, where
//    Stryker never looks, so an inverted condition would have passed green and
//    silently restored the per-frame verification this exists to remove.
//    `src/freshness-scope-pure.js` carries the rationale and the measurements.
const freshnessScope = require('../freshness-scope-pure');
const freshnessVerified = freshnessScope.createState();
// 🔑 THE SAME DEFECT ONE LAYER UP, CLOSED THE SAME WAY (2026-09-18). The code
//    was verified 32 times per action until 2026-08-31; the CORPUS was still
//    COLLECTED 32 times per action after it. MEASURED: `collectAll` = 6.36 ms,
//    an action = 282.92 ms of single-threaded CPU of which ~198 ms was that
//    recomputation; after this, 510.7 ms → 143 ms with a byte-identical output.
// 🛑 THE MEMOISATION IS THE DAEMON'S, NEVER THE CORE'S — only a long-lived
//    process can know that two requests belong to ONE action. `pretool-core`
//    takes a `collect` argument exactly as it takes `store` and `withLock`, and
//    absent it falls back to `collectAll`, i.e. the spawn lane byte for byte.
const collectScope = require('../collect-scope-pure');
const collectCache = collectScope.createState();
// 🔑 AND THE THIRD FLOOR OF THAT SAME STAIRCASE (2026-09-19). The code stopped
//    being verified per frame, then the corpus stopped being collected per
//    frame — and the SPLIT of that corpus was still recomputed by all 32.
//    MEASURED: `budget.planFrames` called 32 times for ONE action, `budget.js`
//    26.7 % of this daemon's CPU (its `fingerprint` alone 16.3 %); A/B on the
//    real server, twice each arm, **180/186 ms → 128/131 ms per action** with
//    every delivered body IDENTICAL (one SHA-1 over the sorted responses).
// 🛑 KEYED ON THE INPUTS, NEVER ON THE INVOCATION: `pretool-core` splits the
//    plan of ANOTHER invocation when it harvests a carryover, so an invocation
//    key would file one action's frames under another's name — silently, and
//    with wrong CONTENT. `src/split-scope-pure.js` carries the reasoning.
// 🛑 THE HASHER IS THE SHELL'S: the pure module may not import `node:crypto`,
//    and a hash is I/O-free but dependency-bearing, so it is INJECTED.
const splitScope = require('../split-scope-pure');
const splitCache = splitScope.createState();
const emissionCore = require('../emission-core');
const nodeCrypto = require('node:crypto');
// ⚠️ A FACTORY, NOT A DIGEST FUNCTION: the segments are hashed INCREMENTALLY, so
//    nothing ever concatenates the ~190 KB of an action into one more string.
const newActionHash = () => {
  const h = nodeCrypto.createHash('sha1');
  return { update: (s) => h.update(s), digest: () => h.digest('hex') };
};

/**
 * Reads the request body, bounded.
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<string|null>} the body, or null if it exceeded the bound
 */
function readBody(req) {
  return new Promise((resolve) => {
    let size = 0;
    let parts = [];
    let over = false;
    // 🛑 SETTLE EXACTLY ONCE, AND SETTLE ALWAYS — by construction, not by luck.
    //    A promise able to stay pending forever is the archetype of the leak no
    //    test finds: no test client aborts, each occurrence costs a few
    //    kilobytes, and it only shows after weeks of uptime.
    // 🔴 HONEST STATUS: on Node 22.15.1 an aborted request DOES settle without
    //    this — measured, the claim that it did not was wrong. `close` is here
    //    because it ALWAYS fires and fires LAST, which makes the invariant hold
    //    on any runtime and any version, instead of resting on behavior nobody
    //    documented. Do not describe it as a fix for an observed hang.
    const settle = (value) => {
      if (parts === null) return;   // already settled — later events are noise
      const body = value === undefined ? Buffer.concat(parts).toString('utf8') : value;
      parts = null;                 // drop the buffers BEFORE handing control back
      resolve(body);
    };
    req.on('data', (c) => {
      if (over || parts === null) return;
      size += c.length;
      // ⚠️ Past the bound we stop KEEPING, we do not stop listening: draining
      //    the stream is what lets the socket close normally. And the buffers
      //    already held are released at once, instead of waiting for `end`.
      if (size > MAX_BODY_BYTES) { over = true; parts = []; return; }
      parts.push(c);
    });
    req.on('end', () => settle(over ? null : undefined));
    // ⚠️ FAIL-OPEN like every path of this framework: a broken socket yields
    //    "no payload", never a thrown error that would take the daemon down.
    req.on('error', () => settle(null));
    // ⚠️ `close` ALWAYS fires, on every outcome, and it fires LAST. It is the
    //    guarantee that no request can leave a pending promise behind — the
    //    other two handlers are the normal paths, this one is the floor.
    req.on('close', () => settle(null));
  });
}

/**
 * The frame coordinates travel in the URL here, where the spawn lane reads
 * `--frame k --frames N` from argv. SAME two numbers, SAME meaning, and the
 * SAME pure parser decides — `parseFrameArgs` is fed a synthetic argv rather
 * than reimplemented, because its rules (absent flag ⇒ 1, out-of-bounds index
 * ⇒ single frame, non-integer ⇒ 1) were each written against a real bug found
 * by mutation. A second parser would have to rediscover all of them.
 * @param {string} url
 * @param {(argv: string[]) => {frame: number, nbFrames: number}} parse
 * @returns {{frame: number, nbFrames: number}}
 */
function frameFromUrl(url, parse) {
  const q = String(url || '').split('?')[1] || '';
  const params = new URLSearchParams(q);
  const argv = [];
  if (params.has('frame')) argv.push('--frame', String(params.get('frame')));
  if (params.has('frames')) argv.push('--frames', String(params.get('frames')));
  return parse(argv);
}

// ═══════════════════════════════════════════════════════════════════════
// THE FOUR CONSUMERS OF ONE STATE — four routes, ONE handler, ONE store.
// ═══════════════════════════════════════════════════════════════════════
// 🔴 THE DEFECT THESE CLOSE, MEASURED IN PRODUCTION 2026-08-21. The PreToolUse
//    gate was wired to the daemon and the three other consumers were left on the
//    disk. Sequence measured: inject → `once` consumed → run the REAL PreCompact
//    hook → ask again ⇒ the daemon answers **2 bytes**. After a compaction,
//    skills and `once` documents never come back — no error, no badge, no red.
// 🛑 THE LESSON, AND IT IS THE DOCTRINE OF THIS HOUSE: **a shared state is
//    migrated for ALL its consumers or for none** (expand/contract). A partial
//    migration is a SPLIT BRAIN, and it is silent.
// 🛑 ONE `store` FOR ALL FOUR, DELIBERATELY. Two stores would be the "two
//    memories" defect `client-core.js` exists to forbid, reintroduced from
//    inside the daemon itself. Same reason the two TRANSPORTS share one handler.
// ⚠️ EVERY ROUTE IS SYNCHRONOUS, like the gate's, and that is what makes each of
//    them ATOMIC: the kernel delivers one connection at a time onto a
//    single-threaded loop, so a read-modify-write inside ONE request cannot be
//    crossed. 🔴 NEVER split one into a `load` request and a `save` request:
//    that would be a file made to carry a conversation between peers, rebuilt
//    over a socket.
// ⚠️ AN UNSERVABLE ROUTE ANSWERS `NO_OUTPUT`, and the client then does exactly
//    what it does with no daemon at all — there is no third state to invent.
// ═══════════════════════════════════════════════════════════════════════

// 🛑 THE ROUTE NAMES ARE READ, NEVER DECIDED HERE (2026-08-25). They used to be
//    three literals in this file AND three hand-written strings in the client
//    shells — one truth, two places, three times over, and a misspelling on
//    either side does not 404: the dispatcher below serves the GATE route for
//    any path it does not recognise, so the purge would purge nothing, in
//    silence. The owner is a module that knows NOTHING (`protocol-routes-pure`),
//    precisely so a spawned client can read it WITHOUT importing this
//    long-lived server's module graph. NEVER write one of these strings again.
// 🛑 NO LOCAL ALIAS PER ROUTE, DELIBERATELY. `const ROUTE_PURGE = ROUTES.purge`
//    reads well and is exactly the shape `rendezvous-address-gate` hunts for: a
//    name that LOOKS like the owner of an address. The table is read where it is
//    used, so there is one name for one truth and nothing to keep in step.
const ROUTES = protocolRoutes();

/** The path, without the query string. Anything unknown is the GATE's route,
 *  which keeps every existing client byte-identical. */
function routeOf(url) {
  return String(url || '').split('?')[0];
}

/**
 * PURGE — what PreCompact MEANS: the real context was emptied, so the memory of
 * what was injected before it no longer describes anything.
 *
 * 🛑 IT IS AN ORDER RECEIVED, NEVER A DEDUCTION. Nothing here decides that a
 *    session is over — that is undecidable from inside, and guessing it is the
 *    inference this whole lane removes. The harness fired the event; the shell
 *    names the keys; we execute.
 * 🛑 THE KEYS COME FROM THE SHELL BECAUSE THE LIST HAS ONE OWNER. The five
 *    prefixes live in `ctxroute-reset.js`'s purge loop, and `store-purge-gate`
 *    reads THAT loop to prove no store escapes a compaction. A second list here
 *    would be a second truth, invisible to that gate — exactly how a store ends
 *    up surviving a compaction with nothing to say so.
 * 🔴 AN EMPTY KEY IS REFUSED, AND IT IS NOT A FORMALITY: every key starts with
 *    the empty string, so one malformed payload would erase the WHOLE fleet's
 *    memory in one call — every `once` of every agent re-delivered, silently.
 * ⚠️ `memory-store-pure.purge()` already clears BOTH key classes (durable and
 *    ephemeral). It is REUSED, never rewritten: forgetting one map is the silent
 *    half of a purge.
 */
function purgeRoute(data, store) {
  if (!store || typeof store.purge !== 'function') return NO_OUTPUT;
  const keys = Array.isArray(data.keys) ? data.keys : [];
  // 🔴 THE REAL LOCK, AND THIS ROUTE WAS THE LAST DURABLE WRITER WITHOUT ONE
  //    (2026-08-23). `/emit` and `/turn` were closed that morning; the purge was
  //    not, on EITHER lane. `store.purge` reaches `session-store.purgeByPrefix`
  //    through the write-through, i.e. the very files a spawned peer reads and
  //    rewrites under `docLockDir`/`turnLockDir`. TLC exhibits the consequence
  //    (`specs/tla/State.tla`, `StatePurgeWindow`): a writer whose snapshot
  //    PREDATES the purge republishes it, a `doc-seen-` record is RESURRECTED,
  //    and a document that was owed is WITHHELD for the rest of the session.
  // ⚠️ THE ADDRESS COMES FROM THE KEY, through the owner of the pair. The scope
  //    is DERIVED (a key is `<prefix><scope>`) rather than sent beside the keys:
  //    a scope passed alongside could disagree with them, and taking a lock that
  //    matches nothing is indistinguishable from taking none.
  // 🛑 GROUPED BY ADDRESS AND RUN ONE SECTION AFTER THE OTHER — never nested.
  //    `lock.js` is a blocking, non-reentrant lock, and every route here takes AT
  //    MOST ONE at a time; nesting would self-deadlock a single-threaded daemon
  //    and read as slowness, not as a bug.
  // ⚠️ AN UNDECLARED PREFIX THROWS, by design (`lockDirForKey`), and `handle`
  //    turns that into `NO_OUTPUT`: our own shells only ever send declared keys,
  //    and guessing an address would silently create a second lock.
  const byLock = new Map();
  for (const k of keys) {
    if (typeof k !== 'string' || k === '') continue;
    const lock = storeResolve.lockDirForKey(k);
    if (!byLock.has(lock)) byLock.set(lock, []);
    byLock.get(lock).push(k);
  }
  let purged = 0;
  for (const [lock, groupe] of byLock) {
    // ⚠️ LOCK UNAVAILABLE ⇒ THAT CLASS IS NOT PURGED and nothing is written —
    //    the same degradation as every other route here. One document not
    //    re-injected after the compaction, never a write without the lock.
    const n = withLock(lock, () => {
      let m = 0;
      for (const k of groupe) m += store.purge(k);
      return m;
    }, { fallback: null });
    if (n !== null) purged += n;
  }
  return { purged };
}

/**
 * TURN — the counter `driftUnit: "turn"` measures its elapsing with.
 * ⚠️ The increment rule lives in `turn-core.js`, shared with the spawned shell:
 *    a shape rule read in two places diverges (paid twice, ㊱ and ㊳).
 * ⚠️ The PREFIX travels in the payload — its owner is the shell that declares
 *    it, and `store-purge-gate` derives the purge list from those declarations.
 */
function turnRoute(data, store) {
  if (!store) return NO_OUTPUT;
  const prefix = typeof data.prefix === 'string' ? data.prefix : '';
  const scope = typeof data.scope === 'string' ? data.scope : '';
  if (prefix === '' || scope === '') return NO_OUTPUT;
  // 🔴 THE REAL LOCK, NOT THE KERNEL'S GOODWILL (2026-08-23). "One thread, one
  //    connection at a time" serialises the daemon's OWN callers and serialises
  //    NOTHING against a spawned peer — and since 2026-08-22 `turn-count-` is a
  //    write-through key, so `turn-count.js` on the client lane rewrites the very
  //    file this route touches, under `turnLockDir`. Two real processes crossing
  //    on one durable key lost 209 read-modify-writes out of 800 (control, both
  //    locked: 0-1 of 800). Nothing is ever corrupt — the write is tmp+rename —
  //    what disappears is a RECORDED fact, in silence.
  // ⚠️ SAME ADDRESS AS THE SPAWNED SHELL, taken from the owner of the pair: a
  //    lock composed here by hand would be a second name, hence no lock at all.
  // ⚠️ LOCK UNAVAILABLE ⇒ THE TURN IS NOT COUNTED, exactly the spawned shell's
  //    own fallback: one uncounted turn costs a re-injection arriving one turn
  //    late, and writing without the lock is what this route is being fixed for.
  // 🛑 NO NESTING, AND THAT IS WHAT KEEPS IT SAFE: every route is synchronous and
  //    takes AT MOST ONE lock, so `lock.js`'s "never nested" assumption holds
  //    even though N frames land in this single process.
  const n = withLock(
    storeResolve.turnLockDir(scope),
    () => turnCore.bump(store, prefix, scope),
    { fallback: null },
  );
  return n === null ? NO_OUTPUT : { turns: n };
}

/**
 * EMIT — the SESSION gate's half of the shared `remainder-` queue.
 *
 * 🛑 WHY THE SESSION GATE MUST BE HERE TOO. Its queue is not its own: what it
 *    cannot deliver at SessionStart is picked up by the PreToolUse gate at the
 *    very first tool call. If the gate's queue lived in the daemon's memory and
 *    the session gate's on the disk, the session remainder would NEVER be
 *    drained — a document delivered halfway and no error anywhere.
 * ⚠️ THE SHELL STILL READS ITS OWN CORPUS and composes its own segments: only
 *    the QUEUE needs the authority. What crosses the socket is therefore the
 *    emission request, not the corpus.
 * 🛑 `Infinity` CANNOT TRAVEL IN JSON — `JSON.stringify(Infinity)` is `null`. So
 *    the contract is explicit: a positive finite number is the budget, `null`
 *    (or anything else) MEANS `Infinity`, i.e. "this harness bounds nothing".
 *    The shell always sends one of the two, so nothing is ever guessed here.
 */
function emitRoute(data, store) {
  if (!store) return NO_OUTPUT;
  const fresh = Array.isArray(data.fresh) ? data.fresh : [];
  const budgetMax = Number.isFinite(data.budgetMax) && data.budgetMax > 0 ? data.budgetMax : Infinity;
  const nbFrames = Number.isInteger(data.nbFrames) && data.nbFrames >= 1 ? data.nbFrames : 1;
  const index = Number.isInteger(data.index) && data.index >= 1 ? data.index : 1;
  const scopeId = typeof data.scopeId === 'string' ? data.scopeId : '';
  if (scopeId === '') return NO_OUTPUT;
  // 🔴 THE REAL LOCK — AND THIS PARAGRAPH USED TO SAY THE OPPOSITE (2026-08-23).
  //    It read "NO `withLock` HERE, AND ITS ABSENCE IS THE POINT: the mutual
  //    exclusion already exists ABOVE us — one connection at a time, one
  //    thread". That was TRUE while the daemon OWNED its state in RAM. Since
  //    2026-08-22 `remainder-` is a WRITE-THROUGH key: this route reads and
  //    rewrites the very file `pretool-core` and `session-inject` read and
  //    rewrite on the disk lane, under `docLockDir`. The kernel serialises the
  //    daemon's OWN callers; it serialises NOTHING against a spawned peer.
  // 📐 MEASURED 2026-08-23, two real processes on one `remainder-` key:
  //    **209 lost read-modify-writes out of 800**; control with both writers
  //    locked, 0-1 of 800. The write is atomic (tmp + rename) so nothing is ever
  //    corrupt — what disappears is a RECORDED DELIVERY, i.e. a document
  //    delivered twice or a queue segment dropped, in total silence.
  // ⚠️ SAME ADDRESS AS THE SPAWNED PEERS, taken from the owner of the pair: a
  //    lock name composed here by hand would be a SECOND name, hence no lock.
  // ⚠️ LOCK UNAVAILABLE ⇒ `plan: null`, which is exactly the spawned shells'
  //    own degradation: the caller splits its FRESH content locally and the
  //    queue is left INTACT. Never silent, never a write without the lock.
  // 🛑 NO NESTING: every route is synchronous and takes AT MOST ONE lock, so
  //    `lock.js`'s "never nested" assumption survives N frames in one process.
  const r = withLock(
    storeResolve.docLockDir(scopeId),
    () => emission.emit({ fresh, budgetMax, nbFrames, index, scopeId, store }),
    { fallback: null },
  );
  return { plan: r ? r.plan || null : null };
}

/**
 * ⚠️ The injected collaborators, TYPED — not a loose bag. `tsc` refuses property
 *    access on a bare `object`, and it is right to: in this repo a JSDoc block is
 *    a VERIFIED CONTRACT, so an untyped seam is a seam nobody checks. Naming the
 *    three also states what this shell is allowed to reach for — the engine, the
 *    dialect, the frame parser, and nothing else.
 * @typedef {object} HttpDeps
 * @property {typeof run} runFn the shared orchestration core
 * @property {typeof output} outputFn the harness dialect, borrowed from the spawn lane
 * @property {(argv: string[]) => {frame: number, nbFrames: number}} parseFrames
 * @property {((err: Error) => void)|null} onAddressInUse what to do when the
 *   kernel refuses the address. Absent ⇒ NOTHING happens here: a builder must
 *   not decide whether its caller lives or dies. `main` throws; `kernel-bind`
 *   inspects a possibly dead entry instead.
 * @property {((err: Error) => void)|null} onLaneLost what to do for a socket
 *   error NO caller claimed by name — an absent address, a refused permission,
 *   an errno nobody has met yet. Absent ⇒ the error is RETHROWN, never
 *   swallowed. Same house rule as above: this reports, the shell decides.
 * @property {(() => {stale: boolean, checked: number, reasons: string[]})|null} freshness
 *   asked ONCE per request, before anything else. Absent ⇒ no verification at
 *   all, i.e. the behaviour that shipped before 2026-08-24, byte for byte.
 * @property {Int32Array|null} activity the process-wide activity counter
 *   (one `Int32Array` over a `SharedArrayBuffer`), bumped once per request so
 *   an on-demand daemon can tell a quiet window from a busy one. Absent ⇒
 *   nothing counted.
 * @property {((freshness: {stale: boolean, checked: number, reasons: string[]}) => void)|null} onStaleCode
 *   what the SHELL does when the code on disk no longer matches. Absent ⇒
 *   NOTHING happens here beyond refusing to answer: a builder must not decide
 *   whether its caller lives.
 * @property {{loadState: Function, saveState: Function}|null} store the state
 *   backend. Absent/null ⇒ the historical disk store, byte-identical. A daemon
 *   passes its MEMORY store and, with it, an empty lock: the kernel already
 *   serialises its callers. The two always travel together.
 * @property {Record<string, Function>|null} tables the six invocation-table
 *   operations, as `owner-ops.createOps().tables` exposes them. Absent ⇒ built
 *   here over the three maps below, which is today's behaviour byte for byte.
 *   A SERVER THREAD passes a client of the owner thread instead: same shape,
 *   same arguments, and the only place in this file that knows the difference.
 * @property {Map<string, number>|null} frameSequencerState which content
 *   index each connecting frame of an invocation has already received —
 *   `frame-sequencer-pure.js`'s bookkeeping, DEFAULT-CREATED (never `null`
 *   by default, unlike `store`): unlike the state backend, there is no
 *   "historical behaviour" to fall back to for a table that did not exist
 *   before this change, so every real daemon gets one. A test may still pass
 *   `null` or omit it — `nextIndex` fails open to the URL's own frame number.

 * @property {Map<string, {scopeId: string, served: number, nbFrames: number, harvested: boolean}>|null} carryoverState
 *   `carryover-pure.js`'s bookkeeping: which invocations of which scope still
 *   owe content, and which have been harvested. DEFAULT-CREATED like the two
 *   below and for the same reason — there is no historical behaviour to
 *   preserve for a table that did not exist. A test may pass `null` or omit
 *   it: every entry point then answers "nothing to carry", which IS the
 *   behaviour from before the carryover existed.
 * @property {Map<string, {nbFrames: number, served: number}>|null} deliveryNoticeState
 *   `delivery-notice-pure.js`'s own tracking table (completion/deferral),
 *   DEFAULT-CREATED like `frameSequencerState` and for the same reason: there
 *   is no historical behaviour to preserve for a notice that did not exist
 *   before this change. A test may pass `null` or omit it -- `observe` then
 *   returns no notice at all, never a fabricated one.
 */

/**
 * Handles ONE hook invocation. Everything after the body read is SYNCHRONOUS,
 * and that is load-bearing, not incidental.
 *
 * 🛑 WHY IT MUST STAY SYNCHRONOUS. `lock.js` is a BLOCKING cross-process lock
 *    (busy-wait on mkdirSync). Its own header states there is no deadlock
 *    "between DIFFERENT processes … never nested" — an assumption that held
 *    because every caller was a short-lived process. Here N frames land in ONE
 *    process: if the core ever became async, request A could hold the lock
 *    while the event loop hands control to request B, which would spin on that
 *    same lock for the full timeout WITHOUT ever letting A release it. That is
 *    a self-deadlock, and it would look like a slow daemon, not like a bug.
 *    ⇒ As long as the core is synchronous, requests are served strictly one at
 *    a time and the daemon IS the serialization point — which is exactly the
 *    single arbiter the architecture wants. NEVER make this path async.
 *
 * ⚠️ The cross-process lock STAYS REQUIRED even so: Codex keeps spawning real
 *    processes against the same state files. "One daemon, therefore no lock" is
 *    the trap here.
 *
 * @param {string} body raw request body
 * @param {string} url request URL, carrying the frame coordinates
 * @param {HttpDeps} deps injected for testing — the real ones are the defaults
 * @returns {object} the JSON to send back
 */
function handle(body, url, deps) {
  const { runFn, outputFn, parseFrames, store, frameSequencerState, deliveryNoticeState, carryoverState } = deps;
  // ═════════════════════════════════════════════════════════════════════
  // 🔑 ONE DIALECT FOR A TABLE OPERATION, TWO ROADS TO IT (2026-09-20).
  // ═════════════════════════════════════════════════════════════════════
  // With no pool this object forwards straight to the three pure modules with
  // the three local maps — today's behaviour, byte for byte, one function call
  // deeper. With a pool it is a CLIENT of the owner thread, and the calls below
  // are unchanged: a shell that could tell the difference would be a shell
  // holding a second copy of the rules, which is how the two roads drift.
  // 🛑 BUILT HERE AND NOT ONLY IN `createServer`: `handle` is exported and three
  //    suites drive it with a bare `deps`. Those callers must keep getting
  //    exactly what they got before — the pure modules over whatever states
  //    they passed, absent ones included (every entry point fails open on a
  //    missing map, which IS the historical behaviour).
  const tables = deps.tables || ownerOps.createOps({
    sequencer: frameSequencerState,
    notice: deliveryNoticeState,
    carryover: carryoverState,
    store: null,
  }).tables;
  let data;
  try {
    data = JSON.parse(body);
  } catch (err) {
    log.daemonError('payload', err);
    // ⚠️ Unparseable payload = the harness said something we do not understand.
    //    FAIL-OPEN: say nothing, never refuse the agent's action.
    return NO_OUTPUT;
  }
  if (!data || typeof data !== 'object') return NO_OUTPUT;

  // ⚠️ ROUTED, AND THE DEFAULT IS THE GATE. Any path that is not one of the
  //    three below runs the PreToolUse gate exactly as before — `/pretool`, and
  //    anything an older client might send. That is what keeps `http-lane-
  //    differential` and every existing cell green with no edit.
  // ⚠️ FAIL-OPEN LIKE EVERYTHING ELSE: a route that throws answers "nothing",
  //    never an error that would take the service down for every agent at once.
  const route = routeOf(url);
  if (route === ROUTES.purge || route === ROUTES.turn || route === ROUTES.emit) {
    try {
      if (route === ROUTES.purge) return purgeRoute(data, store);
      if (route === ROUTES.turn) return turnRoute(data, store);
      return emitRoute(data, store);
    } catch (err) {
      log.daemonError('route', err);
      return NO_OUTPUT;
    }
  }

  let answer = NO_OUTPUT;
  // ⚠️ CAPTURED, NEVER COMPOSED HERE (2026-08-30 fix). This shell used to build
  //    `{ ...answer, systemMessage: existing + ' · ' + noticeText }` by hand
  //    AFTER `outputFn` had already run — i.e. it learned the dialect's field
  //    NAME and its join rule, exactly the reimplementation the header of this
  //    file forbids ("the response JSON is produced by `doc-inject.output()`,
  //    a second copy would be a TWIN that drifts"). `outputFn` is now called
  //    EXACTLY ONCE, with the two fragments already combined by the SAME pure
  //    join `pretool-core.js` uses for its own withholding notice
  //    (`lib.joinSystemMessage`) — never a second ternary invented here.
  let captured = false;
  const capture = (decision, fullDoc, systemMessage) => {
    captured = true;
    const combined = showNotice ? lib.joinSystemMessage(systemMessage, noticeText) : systemMessage;
    answer = dialect(decision, fullDoc, combined);
  };
  const frames = frameFromUrl(url, parseFrames);
  // 🔑 BEFORE OR AFTER THE TOOL RAN (2026-09-23). The harness POSTs BOTH events to this route, and
  //    its own words say which — read through the profile, exactly like the spawn shell. After
  //    the answer the moment is a SECOND invocation (`lib.momentInvocation`): the frame sequencer,
  //    the harvest table and the collection memo below are all keyed by it, and sharing the
  //    BEFORE key would replay the plan decided before the action — nothing new, nothing red.
  // ⚠️ THE DIALECT FOLLOWS THE MOMENT, and `outputFn` stays the injected one BEFORE the answer so
  //    every existing cell drives this shell exactly as before.
  const after = lib.afterAnswer(data, harnessProfile.AFTER_ANSWER.claudeCode);
  const dialect = after ? afterOutput : outputFn;
  const invocationId = lib.momentInvocation(typeof data.tool_use_id === 'string' ? data.tool_use_id : '', after);
  // ═════════════════════════════════════════════════════════════════════
  // 🔴 THE DEFECT THIS REMAP CLOSES, MEASURED 2026-08-28. Windows disables TCP
  //    retransmission on loopback (`SIO_TCP_INITIAL_RTO`, libuv `src/win/tcp.c`)
  //    ⇒ ~6% of the connections a declared frame opens against this daemon are
  //    lost in silence (ETIMEDOUT — 1459 failures / 100% timeout / 0 refusal,
  //    measured by ETW kernel trace; a naked Node server loses as much, a .NET
  //    client on the SAME server loses 0%; neither our code nor Claude Code).
  //    The OLD design attributed content chunk k to the frame whose URL said
  //    `?frame=k`: when that connection never reaches us, chunk k is delivered
  //    NOWHERE — other frames of the SAME action connect empty-handed, and the
  //    document is still counted delivered. A silent bug on this house's own
  //    doctrine ("zero SILENT bugs").
  // ✅ THIS DAEMON IS A SINGLE PROCESS THAT SEES EVERY CONNECTING REQUEST OF ONE
  //    INVOCATION (`tool_use_id`) — it already knows what it has served. So a
  //    connecting frame receives the NEXT UNDELIVERED content index, never the
  //    index its own URL happened to carry. As long as at least as many frames
  //    CONNECT as there are real content chunks, every chunk reaches SOMEONE —
  //    which physical frame carried it stops mattering, exactly as `CHUNK j/m`
  //    already makes ONE document's reassembly independent of arrival order.
  // 🛑 THE DECISION LIVES IN `frame-sequencer-pure.js`, NOT HERE — this shell
  //    only owns the transport, never a decision (house rule, top of file).
  //    `requestedFrame` is passed as the FALLBACK, never as an instruction: it
  //    is what today's design would have served, returned verbatim whenever
  //    tracking cannot apply (no state map, single frame, empty invocation id)
  //    — that is what keeps every caller that supplies none of it (a test, a
  //    future client) byte-identical to before this change.
  const frame = tables.nextIndex(invocationId, frames.frame, frames.nbFrames);
  // ═════════════════════════════════════════════════════════════════════
  // THE DEFECT THIS CLOSES, MEASURED 2026-08-30. A transport that is
  // CORRECT but says NOTHING gets mistaken for a transport that is
  // BROKEN (skill section MULTI-FRAME TRANSPORT: "a correct but unreadable
  // transport gets mistaken for an outage"). `frame-sequencer-pure.js`
  // closed the silent LOSS; nothing yet told the human whether an
  // invocation actually finished.
  // ONLY THIS LANE CAN OBSERVE IT: only the daemon sees every connecting
  // request of one invocation, so only it can tell "every declared frame
  // reached me" from "some never did". `delivery-notice-pure.js` decides
  // WHAT to say, from the SAME `frame`/`nbFrames` facts just computed above
  // -- BOTH known BEFORE `runFn` runs, so this is computed HERE rather than
  // after the core has already produced its own `systemMessage`, which is
  // what used to force this shell to re-open and rewrite that field by hand.
  // A NOTICE MUST NEVER DECIDE. It travels into `capture` as an ordinary
  // PARAMETER, exactly the law `pretool-core.noticeOutput` already states:
  // a warning that changed `permissionDecision` as a side effect would be
  // a notice deciding.
  // IT ANNOUNCES A COUNT, NEVER A CAUSE -- same law as the withholding
  // notice: "N chunk(s) deferred", never "a connection was lost".
  // FOLLOWS `showNotification` LIKE EVERY OTHER BADGE: that setting is a
  // TOTAL silence by the maintainer's decision, never a partial one.
  // DECLARED, PERMANENT DIVERGENCE FROM THE SPAWN LANE: the spawn lane has
  // no equivalent observer and can never emit this text -- that gap is
  // filtered explicitly in `differential-normalize.withoutDeliveryNotice`,
  // never silently by loosening this shell's own behaviour.
  // ═════════════════════════════════════════════════════════════════════
  // ═════════════════════════════════════════════════════════════════════
  // 🔴 THE LAST SILENT LOSS, CLOSED 2026-08-31. `frame-sequencer-pure` made the
  //    frames that ARRIVE carry the next undelivered chunk — but when FEWER
  //    frames connect than the plan has chunks, the leftovers were neither
  //    delivered nor queued (`emission-core` persists only what overflows the
  //    LAST frame), while `doc-seen-` already recorded the document delivered.
  //    Chunks 11..19 of 19 measured lost in production, on every later action.
  // 🛑 A HARVESTED INVOCATION SERVES NOTHING MORE, AND THAT IS NOT OPTIONAL.
  //    Another invocation has taken ownership of its remaining chunks; a late
  //    frame answering here would deliver the same text twice. Ownership MOVES,
  //    it is never shared — and the transfer is atomic because this daemon is
  //    single-threaded, so it needs no lock, no timer and no liveness probe.
  // ⚠️ NOTHING HERE ASKS WHETHER AN INVOCATION IS "FINISHED": that is not an
  //    available fact (no harness emits a closing event, and one agent runs
  //    several tool calls at once — 31 false alarms out of 32 were paid for
  //    assuming otherwise on 2026-08-30). Only two FACTS are used: a frame
  //    arrived, and a new invocation is deciding its plan.
  if (tables.isHarvested(invocationId)) return NO_OUTPUT;
  // 🛑 THE SCOPE IS COMPOSED BY ITS OWNER, `lib.scopeId` — never `session_id`
  //    alone: master and sub-agents share it, and two spellings of one scope
  //    would harvest across agents. Same single source the core uses.
  const scopeId = lib.scopeId(data.session_id, data.agent_id);
  tables.observe(scopeId, invocationId, frame, frames.nbFrames);
  const notice = tables.notice(invocationId, frame, frames.nbFrames);
  const noticeText = deliveryNotice.messageFor(notice);
  const showNotice = noticeText !== '' && lib.shouldShowNotification(collectCore.loadConfig());
  try {
    runFn(data, capture, {
      frame,
      nbFrames: frames.nbFrames,
      invocationId,
      after,
      // WHO IS ACTING: this lane serves Claude Code, so its identity profile — same as the spawn shell.
      identity: harnessProfile.IDENTITY.claudeCode,
      // 🔑 ONE COLLECTION PER ACTION. The thunk is what the core calls INSTEAD
      //    of `collect-core.collectAll`; it answers from the table when this
      //    action already built its accumulator, and otherwise collects for
      //    real and remembers it. 🛑 The decision (hit, miss, eviction) lives in
      //    `collect-scope-pure.js` and is MUTATED there — an inverted condition
      //    here would serve one action's documents to another, silently, and
      //    Stryker never looks inside this shell.
      // ⚠️ FAILS TOWARDS MORE WORK: no invocation id ⇒ `lookup` answers null ⇒
      //    we collect, exactly as before.
      collect: (cfg, pl) => {
        const memo = collectScope.lookup(collectCache, invocationId);
        if (memo !== null) return memo;
        const fresh = collectCore.collectAll(cfg, pl);
        collectScope.remember(collectCache, invocationId, fresh);
        return fresh;
      },
      // 🔑 ONE SPLIT PER ACTION. The core calls this INSTEAD of
      //    `emission-core.split`; it answers from the table when this exact
      //    input has already been split, and otherwise splits for real and
      //    remembers it. 🛑 The decision (key, hit, eviction) lives in
      //    `split-scope-pure.js` and is MUTATED there — an inverted condition
      //    here would serve one action's FRAMES to another, silently, and
      //    Stryker never looks inside this shell.
      // ⚠️ FAILS TOWARDS MORE WORK: no usable key ⇒ `signature` answers `''` ⇒
      //    `lookup` answers null ⇒ we split, exactly as before.
      split: (segments, budgetMax, nbFrames) => {
        const key = splitScope.signature(segments, budgetMax, nbFrames, newActionHash);
        const memo = splitScope.lookup(splitCache, key);
        if (memo !== null) return memo;
        const fresh = emissionCore.split(segments, budgetMax, nbFrames);
        splitScope.remember(splitCache, key, fresh);
        return fresh;
      },
      // 🔑 FACTS IN, SEGMENTS OUT — the shell OBSERVES, the core READS the plan.
      //    This daemon knows which invocations of this scope still owe content
      //    and how many of their frames connected; it does NOT know what a plan
      //    contains, and it must not (the plan store and the splitting belong to
      //    the core). So it hands over the two numbers and nothing else.
      // ⚠️ `pending` IS CALLED ONLY ON THE DECIDING FRAME, inside the core's
      //    lock: frames 2..N return on the memoized plan before reaching it, so
      //    one invocation harvests exactly once.
      pending: () => tables.pendingFor(scopeId, invocationId),
      onHarvested: (id) => tables.markHarvested(id),
      // 🔑 THE STATE OF A LIVING DAEMON LIVES IN MEMORY, AND THE LOCK GOES WITH
      //    IT. Sixteen short-lived processes had no common ground but the disk,
      //    so a FILE was made to carry a conversation between them — a lock to
      //    take turns, an atomic publish, a lock-less fallback, bounded
      //    retries. All of it simulated, by hand, the one thing the kernel
      //    already does: SERIALISE. Here the kernel delivers one connection at
      //    a time onto a single-threaded loop, so the mutual exclusion exists
      //    ABOVE us, for free. `withLock` therefore just runs the section.
      // 🛑 THE TWO TRAVEL TOGETHER, NEVER ONE WITHOUT THE OTHER. A memory store
      //    with the file lock would take a cross-process lock protecting
      //    nothing (pure cost); the file store with an empty lock would be the
      //    2026-08-07 production bug, deliberately reintroduced.
      // ⚠️ Absent `store` ⇒ the historical modules, byte-identical: that is what
      //    keeps the spawn lane and every differential untouched.
      // 🔴 THE REAL LOCK, NOT A NO-OP (2026-08-22). The kernel serialises the
      //    daemon's OWN requests — that has not changed — but the daemon is no
      //    longer the only writer of the durable state: a client that cannot
      //    reach it writes the same files directly, and that client is on the
      //    disk lane with a real lock. A no-op here would leave the two writers
      //    unserialised against each other, and an interleaved read-modify-write
      //    loses a recorded delivery in silence.
      ...(store ? { store, withLock: lockModule.withLock } : {}),
      // 🛑 THE SAME HARNESS NUMBER AS THE SPAWN SHELL, READ FROM THE SAME KEY.
      //    `pretool-core.budgetFor` takes the limit from the SHELL and this
      //    daemon IS a shell — the one that actually serves production. Omitting
      //    it here while `doc-inject.js` declares it would put the two lanes on
      //    DIFFERENT capacities for one harness: the spawn lane whole, the http
      //    lane chopped at the 8,000 floor, and nothing comparing them. That is
      //    the "one truth, two places" class this repository keeps paying for.
      budget: harnessProfile.HOOK_OUTPUT_BUDGET.claudeCode,
    });
  } catch (err) {
    log.daemonError('handle', err);
    // ⚠️ FAIL-OPEN, and it matters MORE here than on the spawn lane: there, a
    //    crash killed one short-lived process and the next call started clean.
    //    Here it would take down the service for every agent at once.
    return NO_OUTPUT;
  }

  // ⚠️ `capture` MAY NEVER RUN. `pretool-core.run` returns SILENTLY (no call
  //    to its `emit` callback at all) when there is nothing to inject and no
  //    withholding notice of its own — see its `if (avis) emit(...); return;`
  //    guard. The delivery notice must still reach the human in that case,
  //    exactly as `pretool-core.noticeOutput` speaks WITHOUT a decision when
  //    everything else is silent: `outputFn('none', '', noticeText)` composes
  //    the SAME envelope shape through the SAME single dialect function —
  //    never a hand-built object bypassing it.
  if (!captured && showNotice) {
    answer = dialect('none', '', noticeText);
  }
  return answer;
}

/**
 * Builds the server WITHOUT listening — so a test can drive it on an ephemeral
 * port and the process lifecycle stays in `main`.
 * @param {Partial<HttpDeps>} [deps]
 * @returns {import('http').Server}
 */
function createServer(deps = {}) {
  const wired = {
    runFn: deps.runFn || run,
    outputFn: deps.outputFn || output,
    // ⚠️ NO DEFAULT ON PURPOSE: absent = the disk store, i.e. the exact previous
    //    behaviour. Owning the state is a DECISION taken by whoever starts the
    //    daemon, never a silent default inherited by a test or a shell.
    store: deps.store || null,
    // ⚠️ DEFAULT-CREATED, UNLIKE `store` ABOVE: there is no PREVIOUS behaviour
    //    to preserve for a table that did not exist before this daemon feature
    //    — a real `createServer()` call (production, `main` below) always gets
    //    a working sequencer. Only a test that hands `handle()` its own bare
    //    `deps` object (bypassing `createServer`) sees it absent, and
    //    `frame-sequencer-pure.nextIndex` fails open to the URL's own number
    //    in that case.
    frameSequencerState: deps.frameSequencerState || frameSequencer.createState(),
    // DEFAULT-CREATED, SAME REASON AS `frameSequencerState` ABOVE -- no
    // previous behaviour to preserve for a notice table that did not exist
    // before this change.
    deliveryNoticeState: deps.deliveryNoticeState || deliveryNotice.createState(),
    // ⚠️ DEFAULT-CREATED like the two tables above and for the same reason:
    //    there is no "historical behaviour" to preserve for bookkeeping that
    //    did not exist before. A test may pass `null` or omit it — every
    //    `carryover-pure` entry point then answers "nothing to carry", which
    //    IS the behaviour from before this change.
    carryoverState: deps.carryoverState || carryover.createState(),
    onAddressInUse: deps.onAddressInUse || null,
    // 🛑 PASSED THROUGH, NEVER BUILT HERE. `handle` builds the local facade
    //    itself when this is absent, so a caller that drives `handle` with a
    //    bare `deps` keeps exactly the behaviour it had. Building it in this
    //    place too would be the same decision taken twice.
    tables: deps.tables || null,
    // 🛑 NO DEFAULT, AND THE ABSENCE IS THE GUARANTEE. `null` here means "nobody
    //    claimed this error", and the handler then RETHROWS — the loud, natural
    //    course. A default that quietly absorbed it would recreate, one layer
    //    up, the exact swallowing this key exists to end.
    onLaneLost: deps.onLaneLost || null,
    parseFrames: deps.parseFrames || require('../lib-pure').parseFrameArgs,
    // ⚠️ NO DEFAULT, EXACTLY LIKE `store`, AND FOR THE SAME REASON. Absent ⇒ the
    //    previous behaviour BYTE FOR BYTE, so every differential and every test
    //    driving `createServer` directly is untouched. Verifying its own
    //    freshness is a DECISION of whoever starts the daemon (`main` below),
    //    never a silent default a test inherits.
    freshness: deps.freshness || null,
    onStaleCode: deps.onStaleCode || null,
    // 🔑 THE ACTIVITY COUNTER (2026-09-29) — one `Int32Array` over a
    //    `SharedArrayBuffer`, the SAME one in every thread, bumped by every
    //    request of every socket. An on-demand daemon leaves when a whole idle
    //    window passes without it moving (`lifecycle-pure.idleVerdict`).
    // 🛑 SHARED, NEVER PER SOCKET: a counter held by one server would let the
    //    main thread see a quiet socket and leave while another thread serves.
    // ⚠️ NO DEFAULT, like `freshness`: absent ⇒ nothing is counted, the
    //    previous behaviour byte for byte for every test driving this builder.
    activity: deps.activity || null,
  };
  // ⚠️ PER SERVER, NEVER MODULE-LEVEL. A module-level counter would be SHARED by
  //    the port lane and the rendezvous lane — two transports whose concurrency is
  //    a different fact — and by every server a test builds in the same process,
  //    so a suite would carry another suite's peak. See the `connection` handler
  //    below for what these two numbers are for.
  const concurrency = { open: 0, peak: 0 };
  // ⚠️ A WeakMap keyed by the socket: the entry dies with the connection, so nothing accumulates
  //    over a daemon's weeks of life (`http-daemon-lifecycle` counts handles and listeners exactly).
  /** @type {WeakMap<import('net').Socket, {requests: number, answered: number, bytesAtAnswer: number, errorCode: string|null, threw: string|null, route: string|null, lastRequestAt: number}>} */
  const socketStates = new WeakMap();
  const server = http.createServer((req, res) => {
    // ⚠️ THE ONLY WORK `serve-stall` COSTS ON A HEALTHY REQUEST: one clock read.
    //    Nothing is written, nothing is counted, nothing accumulates — the
    //    decision to spend a disk line is taken once, at the very end, by
    //    `lifecyclePure.isStall`. See the vocabulary entry for why the event
    //    exists and why it must never become a line per request.
    const startedAt = Date.now();
    // 🔑 ONE atomic add per request, no I/O: this is what tells an on-demand
    //    daemon it is still wanted. Every route counts — a turn counter or a
    //    reset from the client lane is a harness that is alive.
    if (wired.activity) Atomics.add(wired.activity, 0, 1);
    // ⚠️ `socket-cut` bookkeeping: two counters and a byte mark per connection, no I/O. The line
    //    is decided at close by `lifecyclePure.socketCut` — see the `connection` listener below.
    const cut = socketStates.get(req.socket);
    if (cut) {
      cut.requests += 1;
      cut.route = String(req.url || '').split('?')[0] || '<none>';
      cut.lastRequestAt = startedAt;
      res.once('finish', () => { cut.answered += 1; cut.bytesAtAnswer = req.socket.bytesRead; });
    }
    // ═══════════════════════════════════════════════════════════════════
    // 🛑 THE GUARANTEE, AND IT LIVES HERE — AT THE POINT OF USE (2026-08-24).
    // ═══════════════════════════════════════════════════════════════════
    // The daemon must NEVER serve code that differs from what is on disk. That
    // used to rest on a kernel NOTIFICATION arriving, which is two bets at once:
    // that an event we get means a change (FALSE — an access time is enough to
    // raise one) and that a change always raises an event (FALSE — every one of
    // the three kernels documents event LOSS and prescribes a rescan). Comparing
    // the recorded bytes against the disk right before answering removes both:
    // a spurious event can no longer kill us, and a lost one can no longer make
    // us lie.
    // ⚠️ BEFORE THE BODY IS EVEN READ: there is nothing to gain by parsing a
    //    request we have already decided not to answer.
    // 🛑 A BUILDER DOES NOT DECIDE WHETHER ITS CALLER LIVES — the house rule
    //    `createServer` broke once, in August, by throwing on `EADDRINUSE` and
    //    killing the process before `kernel-bind` could look. So this reports and
    //    RETURNS; the shell's `onStaleCode` is what exits. The request is never
    //    answered either way: a socket left unanswered is a loud, fast failure,
    //    and a wrong answer is a silent one.
    // ═════════════════════════════════════════════════════════════════════
    // ONE VERIFICATION PER ACTION, NOT PER FRAME — PROFILED 2026-08-31
    // ═════════════════════════════════════════════════════════════════════
    // 📐 THE MEASUREMENT THAT SETTLED IT, and it had been an open question since
    //    2026-08-24 for want of one. `node --cpu-prof` on this very daemon, driven
    //    by a REAL Claude Code burst: of 7.5 s of actual work, **2,232 ms (30 %)
    //    is `readFileSync`** — the single largest consumer, far ahead of parsing
    //    (14 %). `stale-code.md` already carried the arithmetic (36 modules,
    //    ~3.7 ms per verification, +34 % per request on a resident corpus) and
    //    named this exact fix as a CANDIDATE — *"verify once per ACTION rather
    //    than per frame, keyed by `tool_use_id`?"* — under the condition that
    //    whoever reopened it MEASURE FIRST. This is that measurement.
    // 🔑 WHY IT IS PURE WASTE: the 32 frames of one tool call ask the SAME
    //    question, milliseconds apart, and the answer cannot differ between them
    //    in any way that matters. 32 × 36 = **1,152 file reads to answer once**.
    // 🛑 THE GUARANTEE IS NOT WEAKENED WHERE IT COUNTS. The check exists because
    //    kernel notifications lie BOTH ways: spurious ones killed the daemon 258
    //    times a day (an `atime` is enough), and all three vendors document event
    //    LOSS, which is what would let stale code be served in SILENCE. Verifying
    //    once per ACTION still catches every change that happens BETWEEN actions
    //    — which is when code actually changes, since a delivery is a human
    //    gesture, not something that lands mid-tool-call.
    // ⚠️ THE RESIDUAL WINDOW, DECLARED RATHER THAN HIDDEN: a change landing
    //    between frame 1 and frame N of the SAME action is served by the
    //    remaining frames of that action. Bounded by one tool call, and the
    //    daemon exits on the very next one. That is the trade, in writing.
    // 🛑 IT IS NOT A CACHE OF THE DISK — the thing `stale-code.md` bans by name,
    //    because caching the disk side rebuilds the baseline-by-re-read defect.
    //    Nothing is remembered ABOUT THE FILES: we only remember that THIS
    //    invocation was already verified, and the memory dies with the entry.
    // 🛑 BOUNDED FOR LIFE, same reason and same shape as the frame sequencer's
    //    own table: a daemon runs for weeks, so an invocation whose frames never
    //    complete must never sit here for ever. LRU by re-insertion.
    // ⚠️ IT MOVED ONE STEP LATER, AND THE STEP IS THE WHOLE POINT (2026-08-31).
    //    It used to run BEFORE the body was read, justified by "nothing to gain
    //    by parsing a request we have already decided not to answer" — an
    //    OPTIMISATION argument, never a correctness one, and it cost one JSON
    //    parse exactly twice in a daemon's life (the two deliveries of a day).
    //    The action's identity lives IN that body, so asking "have I already
    //    verified for THIS action?" is impossible before reading it.
    // 🛑 IT STILL RUNS BEFORE ANY WORK: `handle` is what reads the corpus,
    //    takes the lock and writes state, and it is called on the next line.
    //    A stale daemon answers nothing, exactly as before.
    readBody(req).then((body) => {
      // ⚠️ `readBody` HANDS BACK A STRING, NEVER AN OBJECT — the payload is only
      //    parsed later, inside `handle`. A first version of this read
      //    `body.tool_use_id` straight off that string: `undefined` every time,
      //    so the guard below never fired and the verification still ran on
      //    every frame. **The profile is what caught it** — the fix measured
      //    ZERO gain, 2,342 ms of disk reads before and 2,454 ms after, and a
      //    fix that changes nothing looks exactly like a fix that works.
      // 🛑 PARSING TWICE IS THE CHEAP SIDE OF THIS TRADE, and it is deliberate:
      //    a JSON parse of this payload is microseconds, one verification is
      //    ~3.7 ms of `readFileSync`. Handing the parsed object down to `handle`
      //    would change a signature every suite drives, for a gain of nothing.
      // 🛑 AND THE CHECK STAYS HERE, BEFORE `handle`, so a stale daemon still
      //    answers NOTHING AT ALL: "a socket left unanswered is a loud, fast
      //    failure, and a wrong answer is a silent one". Moving it inside
      //    `handle` would turn that loud failure into a polite empty answer.
      let invocationId = '';
      try {
        const parsed = JSON.parse(body);
        if (parsed && typeof parsed.tool_use_id === 'string') invocationId = parsed.tool_use_id;
      } catch {
        // Unparseable ⇒ no identity ⇒ verify, exactly as before. `handle` is the
        // one that decides what an unreadable payload means.
      }
      // ⚠️ THREE CLOCK READS, AND THEY BUY THE DECOMPOSITION OF A STALL. A 9.4 s
      //    request was MEASURED on 2026-09-02 and the journal could only say
      //    "9.4 s" — which of the three phases ate it was still a guess, and a
      //    guess here costs a night. These marks are carried into the
      //    `serve-stall` record and are written NOWHERE otherwise.
      const bodyReadAt = Date.now();
      if (wired.freshness && !freshnessScope.alreadyVerified(freshnessVerified, invocationId)) {
        const freshness = wired.freshness();
        if (freshness.stale) {
          if (typeof wired.onStaleCode === 'function') wired.onStaleCode(freshness);
          return;
        }
      }
      const freshDoneAt = Date.now();
      const answer = body === null ? NO_OUTPUT : handle(body, req.url, wired);
      const handleDoneAt = Date.now();
      // 🔴 THE SERIALISATION IS WORK, AND IT SAT OUTSIDE EVERY MEASUREMENT UNTIL
      //    2026-09-19. `handleMs` stops at the line above, so the journal reported
      //    2 ms per frame while an end-to-end measurement against this very daemon
      //    read **15.78 ms** — sequential, one connection at a time, floor
      //    subtracted. The gap is HERE: turning the answer into ~8 KB of JSON, and
      //    writing it. **Two instruments disagreed and the honest reading was that
      //    the cheaper one measured less, not that the daemon was cheap.**
      // 🛑 IT DECIDES THE MULTI-CORE QUESTION, so it may not stay invisible: the
      //    DECISION (2 ms) is small, and whether a worker pool is worth its
      //    complexity depends entirely on how much of the rest is SERIALISATION
      //    (movable — a worker can return the bytes) versus the socket WRITE
      //    (not movable: this Node cannot hand a TCP handle to a thread, measured
      //    `Found invalid value in transferList` on 22.15.1).
      const payload = JSON.stringify(answer);
      const payloadDoneAt = Date.now();
      // ⚠️ Answering a socket the client already closed is pointless work, and
      //    on some runtimes an error. 🔴 MEASURED on Node 22.15.1: it does NOT
      //    throw there — the earlier claim that an abort could kill the daemon
      //    was a deduction, and the measurement refuted it. Kept because the
      //    cheap check makes the outcome the same on every version, never
      //    because a crash was observed.
      if (res.writableEnded || res.destroyed) return;
      res.writeHead(200, {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
      });
      res.end(payload);
      // ⚠️ AFTER `res.end`, NEVER BEFORE — housekeeping never delays the thing
      //    it observes. The client already has its answer when this runs.
      // 🛑 THE PREDICATE IS WHAT MAKES THIS LEGAL. A healthy request is ~11 ms,
      //    so `isStall` answers `false` and NOTHING is written: no line, no
      //    file, no SSD wear. Only a request that took >= 1 s — the shape that
      //    loses a whole 32-frame action — costs one line.
      // 🔴 WHAT IT IS FOR, so nobody deletes it as noise: production loses
      //    connections ALL-OR-NOTHING (a single action losing 30 of its 32
      //    frames while the busiest seconds of the same night lose none,
      //    MEASURED 2026-09-02). That shape means this single-threaded daemon
      //    was ENTIRELY unavailable for a moment, and nothing here could say so.
      //    This line is what turns that autopsy into an observation.
      // ⚠️ `route` is the URL PATH ONLY — the query carries frame coordinates
      //    that would make every line unique and the journal unreadable.
      const elapsedMs = Date.now() - startedAt;
      // 🔑 THE PER-REQUEST TRACE, `logging.level: "debug"` ONLY (2026-10-04, K).
      //    Level `error` (the default) answers `false` here and writes NOTHING,
      //    so the anti-SSD-wear contract above stays whole; an adopter switches
      //    it on in the config to diagnose, off when done, without a restart.
      //    🛑 It goes through `log.write('daemon', 'request')`, never through
      //    `lifecycle.record`: `request` is NOT a life event, and the always-on
      //    vocabulary must stay free of per-request names. Cost measured in
      //    `log.md` (one `stat` of the config per request).
      if (log.enabled('daemon', 'request')) {
        log.write('daemon', 'request', {
          route: String(req.url || '').split('?')[0] || '<none>',
          elapsedMs,
          handleMs: handleDoneAt - freshDoneAt,
          pid: process.pid,
        });
      }
      if (lifecyclePure.isStall({ elapsedMs })) {
        // ⚠️ THE THREE PHASES, so a stall NAMES ITS OWN CAUSE instead of posing a
        //    question. `bodyMs` = reading the request off the socket (a slow or
        //    stalled CLIENT lands here) · `freshMs` = the point-of-use code
        //    verification (~3.7 ms of disk when it runs, ONCE per action) ·
        //    `handleMs` = the engine, and that is where the cross-process LOCK
        //    lives — it BUSY-WAITS and fails open at 2,000 ms, so a `handleMs`
        //    near a multiple of 2,000 accuses the lock by arithmetic alone.
        // 🛑 They are DERIVED from marks already taken, never a second timing
        //    pass, and they are written ONLY inside this anomaly branch.
        // ⚠️ `peakConn` / `openConn` RIDE HERE AS FIELDS — never their own event,
        //    never their own frequency. See the `connection` handler: they are the
        //    only measurement of simultaneous connections taken AT THE SOURCE, and
        //    they are what decides whether the accept-queue hypothesis for
        //    `ECONNREFUSED` survives (`accept-queue-ceiling.md`). `peakConn` is
        //    CUMULATIVE over the process's life; `openConn` is this instant, so a
        //    burst that already ended is distinguishable from one still in flight.
        lifecycle.record('serve-stall', {
          elapsedMs,
          bodyMs: bodyReadAt - startedAt,
          freshMs: freshDoneAt - bodyReadAt,
          handleMs: handleDoneAt - freshDoneAt,
          payloadMs: payloadDoneAt - handleDoneAt,
          route: String(req.url || '').split('?')[0] || '<none>',
          pid: process.pid,
          peakConn: concurrency.peak,
          openConn: concurrency.open,
          // 🔑 THE EVENT LOOP'S OWN DELAY — the ONE measurement that can settle
          //    whether the refusals are OURS (2026-09-18). `http-lane.md`
          //    documents a chain it cannot close: the daemon falls behind in
          //    RECEIVING ⇒ connections pile up ⇒ the accept queue (232) is
          //    exceeded (`peakConn=254`) ⇒ Windows answers `WSAECONNREFUSED`.
          //    Its first domino — WHY the bytes are late — has never been named.
          //    A BLOCKED SINGLE THREAD stops draining its sockets, which IS the
          //    definition of the `win 0` seen toward this daemon; this records
          //    it, so the question stops being an argument.
          // 🔑 READING IS BINARY, no interpretation: a refusal landing beside a
          //    loop PEAK accuses us · a refusal landing while the loop is idle
          //    EXONERATES us, definitively, and the declared limit at the top of
          //    `http-lane.md` can then close for real.
          // ⚠️ IT RIDES `serve-stall` AND NOTHING ELSE — no timer, no threshold,
          //    no event of its own. That is a DECISION resting on this file's own
          //    measurement: refusal clusters FOLLOW `serve-stall` bursts by
          //    1-20 s, so this carrier lands where the comparison is needed.
          // 🛑 DECLARED BLIND SPOT, stated rather than hidden: a refusal with no
          //    stall anywhere near it leaves NO loop record — `http-lane.md`
          //    measured one such second where the daemon received NOTHING at all.
          //    This narrows the question; it does not close it alone.
          // ⚠️ `max`/`mean` are NANOSECONDS (Node doc) — the conversion AND the
          //    "is there anything to report at all" question both live in
          //    `loopFieldMs`, which is PURE and MUTATED. 🔴 Doing it here with a
          //    bare `Math.round` is what shipped `loopMaxMs=0 loopMeanMs=NaN` on
          //    this instrument's FIRST DAY: right after a reset the histogram has
          //    collected no sample, so `max` is 0 and `mean` is NaN, and a zero
          //    reads as "the loop was never blocked" — the lying green this
          //    module's own header forbids in those very words.
          //    Reset AFTER reading so the next stall reports ITS OWN window and
          //    never a peak inherited from an hour ago.
          loopMaxMs: loopDelay === null ? null
            : lifecyclePure.loopFieldMs(loopDelay.max, loopDelay.count),
          loopMeanMs: loopDelay === null ? null
            : lifecyclePure.loopFieldMs(loopDelay.mean, loopDelay.count),
        });
        // 🛑 AFTER the record, never before: resetting first would publish an
        //    empty window and the instrument would certify instead of measuring.
        if (loopDelay !== null) loopDelay.reset();
        return;
      }
      // 🔑 AND THE LOOP IS ASKED ON **EVERY** REQUEST, NOT ONLY ON STALLED ONES
      //    — that is what closes the hole the fields above could not
      //    (2026-09-18). A refused connection NEVER REACHES this process, so a
      //    burst refused whole produces no request and no stall; riding only on
      //    `serve-stall` left the decisive case unrecorded, and `http-lane.md`
      //    measured exactly it (32 POSTs issued, 31 lost, nothing received).
      // 🔑 NO TIMER IS NEEDED because the histogram samples CONTINUOUSLY and is
      //    reset only when we write: the block survives inside it across the
      //    refused burst, and recovery is instant, so the first request that
      //    gets through afterwards still carries the peak.
      // 🛑 STILL NOT A LINE PER REQUEST: `isLoopBlock` is FAIL-CLOSED and its
      //    threshold sits at ~6x a measured idle loop, so a healthy night writes
      //    ZERO. The decision is PURE and MUTATED — written here it would be
      //    measured by nothing, and a journal that grows with traffic is the one
      //    failure `lifecycle-log-pure.js` exists to forbid.
      const loopMaxMs = loopDelay === null ? null
        : lifecyclePure.loopFieldMs(loopDelay.max, loopDelay.count);
      if (lifecyclePure.isLoopBlock({ loopMaxMs })) {
        // 🔴 THE ATTRIBUTION RIDES WITH THE LAG, AND IT IS NOT DECORATION —
        //    ADDED 2026-09-19 BECAUSE THIS LINE WAS READ BACKWARDS.
        //    `loop-block` carried `elapsedMs` alone, which is body-read PLUS
        //    freshness PLUS work. An agent read `loopMaxMs=604 elapsedMs=21`,
        //    concluded "the handler is burning CPU", calibrated a bench at 17 ms
        //    per frame and designed a worker pool on it — while the repository's
        //    own measurement says the opposite: **on 200 consecutive stalls,
        //    100 % of the elapsed time is the daemon WAITING FOR THE CLIENT to
        //    finish sending its body, and 0 % is work.** `serve-stall` has
        //    carried that split since the day it was written; this event did
        //    not, so the two lines invited opposite conclusions about the same
        //    daemon. **A line that cannot say where its time went will be read
        //    as blaming whoever is nearest.**
        // 🛑 SO THE SPLIT IS NOT OPTIONAL HERE: whoever reads a loop lag must
        //    see, in the SAME line, that the work took 2 ms. The knowledge was
        //    written down in prose and it did not govern — the observation
        //    itself is the only place it cannot be missed.
        // ⚠️ DERIVED FROM MARKS ALREADY TAKEN, never a second timing pass — the
        //    same rule the neighbouring fields obey.
        lifecycle.record('loop-block', {
          loopMaxMs,
          loopMeanMs: lifecyclePure.loopFieldMs(loopDelay.mean, loopDelay.count),
          elapsedMs,
          bodyMs: bodyReadAt - startedAt,
          freshMs: freshDoneAt - bodyReadAt,
          handleMs: handleDoneAt - freshDoneAt,
          payloadMs: payloadDoneAt - handleDoneAt,
          route: String(req.url || '').split('?')[0] || '<none>',
          pid: process.pid,
          peakConn: concurrency.peak,
          openConn: concurrency.open,
        });
        loopDelay.reset();
      }
    }).catch((err) => {
      // ⚠️ THE FLOOR, and it must stay empty. Whatever went wrong on ONE
      //    request, the service keeps serving the others. A daemon that dies on
      //    an edge case is strictly worse than the spawn lane it replaces,
      //    where a crash cost exactly one short-lived process.
      // 🔴 AND IT USED TO BE SILENT (2026-09-24): the destroy below is a reset the harness reads as
      //    `read ECONNRESET`, and nothing said WHY. The reason now rides on the socket's `socket-cut`
      //    line. Behaviour unchanged: the request is still destroyed, the daemon still serves.
      if (cut) cut.threw = String((err && /** @type {Error} */ (err).message) || err).slice(0, 300);
      try { res.destroy(); } catch { /* already gone, which is the desired end state */ }
    });
  });
  // ⚠️ A `server` without an `error` listener turns EVERY socket-level error into
  //    an uncaught exception, so one must exist here: a request-level failure is
  //    survivable and must never take the service down.
  // 🔴 BUT IT NO LONGER DECIDES THE PROCESS'S FATE — FIXED 2026-08-20, FOUND ON
  //    macOS CI. This handler used to `throw` on EADDRINUSE, i.e. a CONSTRUCTOR
  //    imposed a lifecycle policy on every caller. It is the house rule, broken
  //    right here: **a core returns a verdict, the SHELL decides to die.** The
  //    cost was concrete — `kernel-bind` attaches its own handler to inspect a
  //    possibly DEAD socket file, and this one killed the process first. macOS
  //    is the only kernel that leaves such a file behind, so the conflict was
  //    invisible on Windows and on Linux.
  // 🛑 EADDRINUSE STAYS FATAL WHERE IT MUST BE — in `main`, below, which is the
  //    piece that owns the lifecycle. The guarantee is unchanged: a second
  //    instance is refused BY THE KERNEL, never by a PID file or a liveness
  //    probe. What changed is WHO acts on that refusal.
  // ⚠️ `listenerCount` is not consulted, deliberately: "does someone else handle
  //    this?" is a question about intent, and answering it by counting is how a
  //    guard becomes conditional on load order. The handler simply reports.
  // 🔴 AND EVERY OTHER ERROR WAS SWALLOWED HERE UNTIL 2026-09-03 — MEASURED, NOT
  //    REASONED. A registered `error` listener SUPPRESSES the throw, so any code
  //    but `EADDRINUSE` left the process ALIVE AND DEAF: `listening === false`,
  //    no exception, no log line, nothing. Probe on Node 22.15.1, binding an
  //    address held by no interface: `SWALLOWED: EADDRNOTAVAIL / process STILL
  //    ALIVE after bind failure; listening = false`.
  // 🔑 THE CLASS BECAME REACHABLE THE DAY WE LEFT `127.0.0.1` (2026-09-03). The
  //    loopback is present on every machine that boots, so a bind to it could
  //    only ever fail as a DUPLICATE. A declared address that lives on a real
  //    interface can be ABSENT — and then this handler was the only thing
  //    standing between the fleet and total silence. **We opened the door with
  //    the address fix; this is the lock.**
  // 🛑 FAIL-CLOSED, AND THE LIST IS THE *DELEGATED*, NEVER THE REFUSED. A code
  //    leaves this handler quietly only if a caller CLAIMED it by name. Anything
  //    unclaimed resumes its natural course — the uncaught exception it would
  //    have been had no listener existed. Enumerating what to DIE on is how a
  //    guard is born stale: the next errno nobody thought of would be swallowed
  //    exactly like `EADDRNOTAVAIL` was.
  // ⚠️ ZERO OS KNOWLEDGE, and that is deliberate: this reacts to what the kernel
  //    ALREADY said at bind time. `EADDRNOTAVAIL` is a POSIX errno Node
  //    normalises on all three platforms, so there is no branch here and none is
  //    ever needed — the OS-specific half of the address story lives in
  //    `service/`, one script per platform, and never in the engine.
  server.on('error', (err) => {
    // ⚠️ `code` lives on `ErrnoException`, not on `Error` — `tsc` is right to
    //    ask, and a JSDoc that hid it would be a lying contract.
    const code = /** @type {NodeJS.ErrnoException} */ (err).code;
    if (code === 'EADDRINUSE' && typeof deps.onAddressInUse === 'function') { deps.onAddressInUse(err); return; }
    if (typeof deps.onLaneLost === 'function') { deps.onLaneLost(err); return; }
    throw err;
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 🔴 THE ONE NUMBER THIS PROJECT HAS ARGUED ABOUT FOR THREE NIGHTS AND NEVER
  //    MEASURED AT THE SOURCE: how many connections are open AT ONCE (2026-09-17).
  // ═══════════════════════════════════════════════════════════════════════
  // The accept-queue hypothesis for `ECONNREFUSED` stands or falls on it, and every
  // attempt to answer it so far used an EXTERNAL sampler — `Get-NetTCPConnection`
  // takes tens of milliseconds while a frame connection lives ~11 ms, so the sampler
  // is SLOWER THAN WHAT IT OBSERVES and structurally misses the peaks. It read 32
  // and that number is worth nothing. **Only the server knows, exactly, for free.**
  // 🛑 IT IS A HIGH-WATER MARK, NEVER A GAUGE, AND THAT IS WHAT KEEPS IT LEGAL.
  //    `lifecycle-log` forbids a writer proportional to traffic; a cumulative peak
  //    needs no line of its own — it rides as FIELDS on `serve-stall`, an event that
  //    already exists and already fires only on an anomaly. Nothing is written here.
  // 🔑 AND A PEAK ANSWERS THE QUESTION EVEN IF IT IS REPORTED ONCE: it accumulates
  //    over the whole life of the process, so a single stall hours later still says
  //    whether concurrency ever approached the measured 232-deep accept queue.
  //    Never below ~200 over a busy night ⇒ the hypothesis is DEAD and must be
  //    written so. Reaching it ⇒ it is confirmed and the remedy is N listening
  //    sockets (`accept-queue-ceiling.md`).
  // ⚠️ TWO COUNTERS, NOT ONE: `open` is the instantaneous truth the peak is derived
  //    from, and it is reported too — a peak with no current value cannot tell a
  //    burst that ENDED from one still in flight at the moment of the stall.
  // ⚠️ `close` FIRES ON EVERY SOCKET, error or not (Node `net` doc), so the counter
  //    cannot drift upwards on a refused or reset connection. A counter that only
  //    ever grows would manufacture the very peak it exists to look for.
  server.on('connection', (socket) => {
    concurrency.open += 1;
    if (concurrency.open > concurrency.peak) concurrency.peak = concurrency.open;
    socket.once('close', () => { concurrency.open -= 1; });
    // ═══════════════════════════════════════════════════════════════════
    // 🔴 WHO HUNG UP? — `socket-cut` (2026-09-24)
    // ═══════════════════════════════════════════════════════════════════
    // From 2026-09-23 10:42Z the harness read `read ECONNRESET` on 1.44 % of its POSTs (≤ 0.07 %
    // every earlier day). A reset only says somebody slammed the connection. Every path by which
    // THIS process can do it now leaves a line: a request read and never answered, bytes received
    // and never parsed, a socket error, a handler that threw. Silence while resets continue means
    // the reset came from elsewhere — that is the other half of the answer, and why it is written.
    // 🛑 NOTHING HERE CHANGES WHAT THE SOCKET DOES: an `error` listener only OBSERVES (Node's http
    //    server keeps its own), and the decision is `lifecyclePure.socketCut`, fail-closed, so an
    //    ordinary close writes nothing.
    const state = { requests: 0, answered: 0, bytesAtAnswer: 0, errorCode: null, threw: null, route: null, lastRequestAt: 0 };
    socketStates.set(socket, state);
    // ⚠️ READ NOW, NEVER AT `close`: a destroyed socket answers `undefined` for both, which is how
    //    the first version of this line lost the very ports that tie it to the harness's reset.
    const localPort = socket.localPort;
    const remotePort = socket.remotePort;
    socket.on('error', (e) => { state.errorCode = /** @type {NodeJS.ErrnoException} */ (e).code || 'unknown'; });
    socket.once('close', () => {
      const fields = lifecyclePure.socketCut({
        requests: state.requests,
        answered: state.answered,
        unreadBytes: state.requests === state.answered ? socket.bytesRead - state.bytesAtAnswer : 0,
        errorCode: state.errorCode,
        threw: state.threw,
      });
      if (!fields) return;
      lifecycle.record('socket-cut', {
        ...fields,
        requests: state.requests,
        answered: state.answered,
        route: state.route,
        sinceRequestMs: state.lastRequestAt ? Date.now() - state.lastRequestAt : null,
        port: localPort,
        remotePort,
        pid: process.pid,
        openConn: concurrency.open,
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // A PROTOCOL MISMATCH NAMES ITSELF (2026-09-18)
  // ═══════════════════════════════════════════════════════════════════
  // 🔑 A cleartext port serves ONE protocol — no TLS means no ALPN means nothing
  //    is negotiated — so `http.protocol` is DECLARED, and a declaration can be
  //    wrong. It used to surface as `HPE_INVALID_CONSTANT`: a parser complaint
  //    that names no remedy, on a daemon refusing every request from one
  //    harness. An HTTP/2 client announces itself with 24 FIXED octets
  //    (RFC 9113 §3.4), so the daemon can say what to change instead.
  // 🛑 IT DIAGNOSES, IT NEVER SWITCHES PROTOCOL. Serving HTTP/2 because someone
  //    knocked in HTTP/2 would make the served protocol depend on who arrives
  //    first — one declaration, two answers. The decision is PURE and lives in
  //    `http2-preface-pure.js`; this shell only reads bytes and writes a line.
  // 🛑 NODE'S DEFAULT BEHAVIOUR IS REPRODUCED EXACTLY FOR EVERY OTHER ERROR.
  //    Attaching a `clientError` listener TAKES OVER from Node, so anything not
  //    reproduced here is silently lost: per its documentation the default
  //    closes with `400 Bad Request`, or `431` on `HPE_HEADER_OVERFLOW`, and
  //    destroys immediately when the socket is not writable. A diagnosis that
  //    changed how malformed requests are answered would be a regression bought
  //    with a log line.
  // ⚠️ THE JOURNAL IS THE CHANNEL, NOT THE RESPONSE. The client speaking HTTP/2
  //    cannot read an HTTP/1 error body — it is not listening for one. The
  //    operator reads `stderr` and the lifecycle record; the socket still gets
  //    the standard answer so nothing downstream changes.
  // ⚠️ ONCE PER PROCESS LIFE. A misdeclared protocol fails on EVERY connection,
  //    and a line per failure is the traffic-proportional writer
  //    `lifecycle-log-pure` exists to forbid. One sentence is one reading.
  let prefaceReported = false;
  server.on('clientError', (err, socket) => {
    const notice = http2Preface.mismatchNotice(
      err && /** @type {{ rawPacket?: Buffer }} */ (err).rawPacket,
      // 🛑 'http1' IS WRITTEN HERE, never read from the endpoint: `protocol` does
      //    NOT exist on `{ host, port }`, so reading it always yielded `undefined`
      //    and the `|| 'http1'` fallback HID that phantom access. This build serves
      //    HTTP/1 only; the day a protocol becomes declarable, it arrives as a real
      //    config key and the type checker will point at this line.
      'http1',
    );
    if (notice && !prefaceReported) {
      prefaceReported = true;
      lifecycle.record('lane-degraded', {
        lane: 'port', fatal: false, pid: process.pid, code: 'PROTOCOL_MISMATCH',
        message: 'client spoke HTTP/2 to an HTTP/1 listener',
      });
      process.stderr.write(`${notice}\n`);
    }
    // Node's documented default, reproduced rather than replaced.
    try {
      if (!socket.writable) { socket.destroy(); return; }
      const status = err && /** @type {{ code?: string }} */ (err).code === 'HPE_HEADER_OVERFLOW'
        ? '431 Request Header Fields Too Large'
        : '400 Bad Request';
      socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
    } catch {
      try { socket.destroy(); } catch { /* already gone, the desired end state */ }
    }
  });
  return server;
}

// ⚠️ EXIT CODE OF A STALE-CODE RESTART — non-zero ON PURPOSE, and the reason is
//    portability, not style. A supervisor only restarts on a FAILURE by default
//    (`Restart=on-failure`, launchd `KeepAlive`, Task Scheduler
//    `RestartOnFailure`); an exit 0 reads as "the job is done" and Windows would
//    simply never bring it back. Refusing to serve stale code IS an abnormal
//    termination, so we say so in the only vocabulary all three OSes share.
// 🔴 **90, AND NOT 75 — THE FIRST CHOICE WAS A TRAP, MEASURED 2026-08-20.**
//    75 is `EX_TEMPFAIL`, and systemd gives that number a NAMED ALIAS. Worse,
//    systemd's OWN manual carries, as Example 1: *"Exit status 75 (TEMPFAIL),
//    250, and the termination signal SIGKILL are considered clean service
//    terminations."* Anyone copying that example into the unit — which is
//    exactly what copying a manual's example means — would silently turn our
//    stale-code restart into "job done": daemon dead, unit GREEN.
// 🛑 The fix is NOT a warning telling people never to write `SuccessExitStatus`.
//    Prose is not a rule. 90 sits OUTSIDE every alias range systemd defines and
//    outside that example, so the copy-paste cannot reach it. The error is
//    impossible by construction instead of discouraged.
// ⚠️ Stay under 125: from there the shells assign their own meanings.
const EXIT_STALE_CODE = 90;

/**
 * 🛑 THE DEFECT A DAEMON HAS AND A SPAWNED HOOK CANNOT HAVE — read this before
 *    touching anything here. The `command` lane re-reads the code on EVERY call,
 *    so it is ALWAYS fresh. A long-lived process holds its modules in memory:
 *    after a `git pull`, an edited doc engine or a fixed gate keeps serving the
 *    OLD logic, while looking perfectly healthy. That is precisely the failure
 *    this project fears most — not a crash, a GREEN THAT LIES.
 *
 * 🔴 THE WATCH IS AN OPTIMISATION SINCE 2026-08-24, NOT THE GUARANTEE — and it
 *    used to be both, which is what broke. This function's callback exited the
 *    process on ANY notification, concluding "my code changed". That conclusion
 *    was an INFERENCE and it was FALSE: measured on the FROZEN copy, 258 deaths
 *    with `mtime` and `ctime` UNCHANGED and only `atime` moving — libuv
 *    subscribes ReadDirectoryChangesW to `FILE_NOTIFY_CHANGE_LAST_ACCESS` among
 *    others and delivers all of them as a bare `'change'`, and NTFS may defer
 *    that access-time write by up to an hour (`fsutil behavior`). Reading a file
 *    killed the service, an hour later, for ever.
 * ✅ WHAT THE CALLBACK MUST DO NOW: run the SAME comparison the request path
 *    runs, and exit only if the content really differs. A notification that
 *    changed nothing costs one journal line — the noise stays OBSERVABLE, never
 *    silent, because a guard nobody can see firing is a guard nobody can trust.
 * 🛑 AND THE WATCH IS NO LONGER LOAD-BEARING, WHICH IS THE POINT: the guarantee
 *    is the verification AT THE POINT OF USE, so a LOST event — which all three
 *    kernels document and all three answer with "rescan" — can no longer let
 *    stale code be served. The kernel's non-determinism stops mattering.
 *
 * ⚠️ THE WATCHED SET IS DERIVED, NEVER A LIST. `require.cache` holds exactly the
 *    modules this process actually loaded — a file added tomorrow is watched by
 *    itself, and a hand-written glob would rot. `node_modules` is excluded: a
 *    dependency cannot change without an install, which is a deliberate act that
 *    restarts the service anyway.
 *
 * ⚠️ WE WATCH DIRECTORIES, NOT FILES, AND THAT IS LOAD-BEARING. Git does not
 *    write files in place: it writes a temporary file and RENAMES it over the
 *    target. A watch on the file follows the old inode into the void and goes
 *    silently deaf — the worst possible outcome, since a deaf watcher is
 *    indistinguishable from a quiet one. A directory watch sees the rename.
 *
 * 🛑 THE KERNEL'S TWO ARGUMENTS ARE FORWARDED, NEVER DROPPED — and that is a
 *    DEFECT REPORT, not a nicety. Measured 2026-08-23: 169 exits in one day,
 *    median lifetime 224 s, and NOT ONE of them said which file or which kind of
 *    event caused it. `fs.watch` hands the callback `(eventType, filename)`; this
 *    function used to pass `onChange` straight in, so both were thrown away and
 *    every diagnosis became a guess. The WATCHED DIRECTORY is added here because
 *    the kernel does not supply it and only this loop knows it.
 * ⚠️ `filename` IS EXTERNAL DATA AND MAY BE `null` — Node documents exactly that
 *    ("not supported on every platform"). It is forwarded as received; deciding
 *    what an absent name means belongs to the caller, not to the forwarder.
 *
 * @param {(dir: string, cb: (eventType: string, filename: string|null) => void) => {close: () => void}} watch injected in tests
 * @param {Record<string, unknown>} cache module cache to derive the set from
 * @param {(change: {dir: string, eventType: string, filename: string|null}) => void} onChange
 *   what to do when the code moved — told WHERE, WHAT KIND, and WHICH FILE.
 * @returns {{close: () => void}[]} the live watchers
 */
function watchOwnCode(watch, cache, onChange) {
  // ⚠️ THE DERIVATION HAS ONE OWNER SINCE 2026-08-24 (`stale-code-pure`): the
  //    watcher and the verifier must agree on what "our code" is, and two
  //    spellings of one rule are two rules. Same scope, same directories-not-
  //    files answer — what changed is only that this file no longer holds a
  //    second copy of it.
  const dirs = staleCodePure.watchedDirs(Object.keys(cache));
  const watchers = [];
  for (const dir of dirs) {
    // ⚠️ FAIL-OPEN, per directory: a platform that refuses one watch must not
    //    cost us the others. Losing this guard degrades us to the stale-code
    //    risk — bad — but crashing the daemon would be worse.
    try {
      // ⚠️ THE CLOSURE CAPTURES `dir` AND THAT IS THE POINT: the kernel says
      //    WHAT happened and to WHICH name, never in which watched directory.
      //    Passing `onChange` bare — as this line did until 2026-08-23 — loses
      //    all three facts at once.
      watchers.push(watch(dir, (eventType, filename) => onChange({ dir, eventType, filename })));
    } catch (err) { log.daemonError('watch-arm', err); /* one blind directory, not a dead daemon */ }
  }
  return watchers;
}

/**
 * Arms ONE directory watch AND gives its `'error'` event a home.
 *
 * 🔴 UNTIL 2026-08-24 THAT EVENT HAD NO HANDLER AT ALL, and it is the one the
 *    kernels raise when they have LOST notifications: ReadDirectoryChangesW
 *    overflows its buffer and answers `ERROR_NOTIFY_ENUM_DIR` — *"you should
 *    compute the changes by enumerating"*; inotify raises `IN_Q_OVERFLOW` and
 *    the manual says to *"rebuild part or all of the application cache"*;
 *    FSEvents raises `MustScanSubDirs`/`KernelDropped`/`UserDropped`. Three
 *    vendors, one prescription: RESCAN. On top of that, an unhandled `'error'`
 *    on an `EventEmitter` is thrown, so the daemon could die of the very
 *    mechanism meant to protect it, with no journal line.
 * ✅ WHAT WE DO, in that order: VERIFY at once (the lost events may have hidden
 *    a real change), then RE-ARM. If re-arming fails we refuse to keep serving
 *    code we can no longer be told about — a degraded watch is acceptable, a
 *    SILENT one never was.
 * ⚠️ RECURSIVE BY DESIGN and bounded by the kernel, not by us: each re-arm
 *    installs the same handler, so a second loss is handled like the first. It
 *    is not a retry loop — nothing here waits, nothing counts attempts.
 *
 * @param {(dir: string, cb: (eventType: string, filename: string|null) => void) => {close: () => void, on?: Function}} watch
 * @param {() => void} verify run the real comparison, right now
 * @param {(dir: string, err: Error) => void} onCannotRearm the shell's decision
 * @returns {(dir: string, cb: (eventType: string, filename: string|null) => void) => {close: () => void, on?: Function}}
 */
function watcherFactory(watch, verify, onCannotRearm) {
  const arm = (dir, cb) => {
    const watcher = watch(dir, cb);
    // ⚠️ FAIL-OPEN on the wiring itself: a watcher object that does not emit
    //    (a stub, a future platform) must not cost the daemon its life.
    if (watcher && typeof watcher.on === 'function') {
      watcher.on('error', (err) => {
        verify();
        try { arm(dir, cb); } catch (again) { onCannotRearm(dir, /** @type {Error} */ (again || err)); }
      });
    }
    return watcher;
  };
  return arm;
}

// ⚠️ WHAT THE JOURNAL PRINTS WHEN THE KERNEL NAMED NOTHING. Node documents that
//    `filename` "may be null on some platforms", so the absence is a REAL,
//    EXPECTED case, not a bug — and it must READ as an answer. Omitting the
//    field instead would be indistinguishable from a build that never carried
//    it, i.e. exactly the silence this whole work item exists to remove.
const KERNEL_NAMED_NOTHING = '<unnamed>';

/**
 * Turns ONE kernel notification into the fields of the `stale-code-exit` record.
 * PURE — no I/O, no clock, no `process`: everything volatile is a parameter, so
 * the shell below stays a two-liner and this stays measurable.
 *
 * 🛑 IT ADDS FIELDS TO AN EXISTING EVENT, IT DOES NOT ADD AN EVENT. The journal
 *    vocabulary is a CLOSED LIST in `lifecycle-log-pure.js` and its ceiling
 *    (2 × 256 KB, for life) rests on nothing being written per request. A death
 *    that already cost a line now costs a slightly LONGER line — the frequency
 *    is untouched.
 * ⚠️ THE KEY IS `kernelEvent`, NEVER `event`: the renderer already prints
 *    `event=<name>`, so a field called `event` would emit the key TWICE on one
 *    line and every reader — human or `grep` — would take the second for the
 *    first.
 * ⚠️ EVERYTHING HERE COMES FROM OUTSIDE THIS PROCESS and is treated as such: a
 *    missing notification, a non-string type, an empty name all collapse to the
 *    sentinel rather than printing `undefined` or an empty value.
 *
 * @param {{dir?: unknown, eventType?: unknown, filename?: unknown}|undefined} change
 *   what the kernel said — `undefined` is a legitimate input, never a bug.
 * @param {number} pid this process
 * @param {number} uptimeMs how long it had been serving
 * @returns {Record<string, unknown>} fields for `lifecycle.record`
 */
function staleCodeFields(change, pid, uptimeMs) {
  return { pid, code: EXIT_STALE_CODE, uptimeMs, ...kernelFields(change) };
}

/**
 * WHAT THE KERNEL SAID, and nothing else — the three fields shared by the death
 * record and by the "nothing changed" record.
 *
 * 🛑 EXTRACTED SO THERE IS ONE SPELLING, not two. Since 2026-08-24 a
 *    notification can end in either outcome; writing the sentinel twice would be
 *    a twin that drifts, and the second copy is always the one that rots.
 * ⚠️ `staleCodeFields` may NOT be reused for the quiet outcome: it stamps
 *    `code: 90`, i.e. "we died", onto a line whose whole point is that we did not.
 *
 * @param {{dir?: unknown, eventType?: unknown, filename?: unknown}|undefined} change
 * @returns {{kernelEvent: string, file: string, dir: string}}
 */
function kernelFields(change) {
  const c = change || {};
  const text = (v) => (typeof v === 'string' && v.length > 0 ? v : KERNEL_NAMED_NOTHING);
  return { kernelEvent: text(c.eventType), file: text(c.filename), dir: text(c.dir) };
}

/**
 * The socket-activation protocol, read and NOTHING else — no I/O, no probe, no
 * inference. Read the block above `SD_LISTEN_FDS_START` before touching it.
 *
 * 🛑 THE PID COMPARISON IS THE WHOLE POINT OF THE PROTOCOL. These variables are
 *    INHERITED; without this check a process whose parent was socket-activated
 *    would listen on a descriptor nobody gave it.
 * ⚠️ Everything that is not exactly an integer is a NO, in both variables: a
 *    malformed environment means "I do not know what I was handed", and the only
 *    safe answer is to fall back to the port. `Number()` alone would accept
 *    "3.5", " 3 " and "0x3"; the pattern refuses them.
 *
 * @param {Record<string, string|undefined>} env the environment to read
 * @param {number} pid this process's own pid
 * @returns {number|null} the inherited listening descriptor, or null when the OS
 *   passed us nothing — which is the normal case on every unsupervised run.
 */
function inheritedFd(env, pid) {
  const whole = (v) => (/^\d+$/.test(String(v ?? '')) ? Number(v) : null);
  const owner = whole(env.LISTEN_PID);
  // ⚠️ Someone else's descriptor, or no protocol at all: identical answer.
  if (owner === null || owner !== pid) return null;
  const count = whole(env.LISTEN_FDS);
  if (count === null || count < 1) return null;
  return SD_LISTEN_FDS_START;
}

/**
 * HOW MANY descriptors the supervisor handed us — 0 when it handed us none.
 *
 * 🔴 WRITTEN 2026-09-18 BECAUSE `http.listeners` WAS SILENTLY BROKEN ON EVERY
 *    SOCKET-ACTIVATED OS. `inheritedFd` reads `LISTEN_FDS`, checks it is at
 *    least one, and then returns ONLY the first descriptor — the count was
 *    validated and thrown away. Meanwhile `tools/wiring-generate.js` spreads the
 *    frames over `paths.httpListenEndpoints()` with NO idea which platform will
 *    run them. ⇒ a Linux or macOS adopter declaring `listeners: 4` got a wiring
 *    POSTing to four ports and a daemon serving ONE: **24 frames of every 32
 *    landing on nothing, on every action, in silence**. Nobody had seen it
 *    because nobody had ever raised the key above 1.
 * 🛑 THE COUNT IS THE SUPERVISOR'S ANSWER, NEVER OUR REQUEST. sd_listen_fds(3)
 *    gives "3, 4, 5, ..., 3+LISTEN_FDS-1": what the unit declared is what we
 *    get, and a mismatch with our config is a REFUSAL, never a silent minimum.
 * ⚠️ Same parsing law as its sibling: anything that is not exactly an integer
 *    is a NO. A malformed environment means "I do not know what I was handed".
 *
 * @param {Record<string, string|undefined>} env the environment to read
 * @param {number} pid this process's own pid
 * @returns {number} how many descriptors were inherited; 0 when none were
 */
function inheritedFdCount(env, pid) {
  const whole = (v) => (/^\d+$/.test(String(v ?? '')) ? Number(v) : null);
  const owner = whole(env.LISTEN_PID);
  if (owner === null || owner !== pid) return 0;
  const count = whole(env.LISTEN_FDS);
  if (count === null || count < 1) return 0;
  return count;
}

/**
 * Puts the server to work — on the INHERITED descriptor when the OS passed one,
 * on the port otherwise.
 *
 * ⚠️ THE PORT CALL IS BYTE-FOR-BYTE THE ONE THAT WAS THERE BEFORE. When nothing
 *    is passed, this function is a no-op wrapper: an adopter running
 *    `node http-server.js` by hand sees exactly the previous behaviour.
 * 🛑 EADDRINUSE STILL KILLS US ON THE PORT PATH, and on the fd path it CANNOT
 *    happen — we never bind. Duplicate prevention does not disappear, it MOVES
 *    to the supervisor that owns the socket (`Accept=no` ⇒ "only one service
 *    unit is spawned for all connections"). It is still the OS, never a PID file
 *    and never an "is it already running?" test.
 *
 * @param {import('http').Server} server
 * @param {Record<string, string|undefined>} env
 * @param {number} pid
 * @param {number} port used ONLY when nothing was inherited
 * @returns {number|null} the descriptor listened on, or null when the port was
 */
function listenOn(server, env, pid, port, host) {
  const fd = inheritedFd(env, pid);
  if (fd === null) {
    // ⚠️ BOTH halves come from the CALLER, which read them from the single
    //    resolution point. This function chooses NEITHER: it decides only
    //    WHETHER we bind at all.
    server.listen(port, host, LISTEN_BACKLOG);
    return null;
  }
  // ⚠️ `server.listen(handle)` with an object carrying an `fd` member is the
  //    documented Node surface for an already-bound descriptor (net(1), v22).
  //    The host and port are NOT ours to choose here: the socket is already
  //    bound by the supervisor, and the unit is where its address is written.
  server.listen({ fd });
  return fd;
}

/**
 * The error hooks of the RENDEZVOUS lane's server: both are CLAIMS that do nothing.
 *
 * 🔴 `onAddressInUse` THREW HERE, AND ON macOS THE DAEMON NEVER CAME BACK — red 2/2 on the runner,
 *    cause read in the child's stderr (2026-09-23). macOS is the one kernel of the three that leaves
 *    a socket FILE behind a dead daemon, so the next start meets `EADDRINUSE` on EVERY restart —
 *    and the stale-code exit makes restarts the normal regime. The builder's `'error'` listener is
 *    registered FIRST, so a throw there killed the process before `kernel-bind` could ask the
 *    kernel whether the entry was dead. 🛑 `EADDRINUSE` on this lane BELONGS TO `kernel-bind`:
 *    living owner ⇒ its `onError` refuses the duplicate (and `main` dies there, the kernel being the
 *    authority), dead entry ⇒ unlink and bind. A claim here, never a policy.
 * ⚠️ A FUNCTION, exported, so the cell that guards this drives the REAL hooks `main` passes —
 *    never a hand-built copy of them.
 * @returns {{onAddressInUse: (err: Error) => void, onLaneLost: (err: Error) => void}}
 */
function rendezvousLaneHooks() {
  return { onAddressInUse: () => {}, onLaneLost: () => {} };
}

module.exports = {
  main,
  rendezvousLaneHooks,
  createServer, handle, frameFromUrl, watchOwnCode, watcherFactory, staleCodeFields, kernelFields,
  inheritedFd, inheritedFdCount, listenOn,
  routeOf, purgeRoute, turnRoute, emitRoute,
  NO_OUTPUT, MAX_BODY_BYTES, EXIT_STALE_CODE, SD_LISTEN_FDS_START,
  KERNEL_NAMED_NOTHING,
  ROUTES,
};

// ⚠️ The service's LIFECYCLE belongs to the OS — a systemd user unit, a Windows
//    Service, a launchd job. This block is the entry point those units call; it
//    is NOT a supervisor. It does not restart itself, it does not check whether
//    another instance is alive, it does not write a PID file. If the port is
//    taken, the kernel says so with EADDRINUSE, immediately and exactly — we
//    let that error surface and die, because a second instance would be the
//    real defect and the OS is the authority that prevents it.
//
// 🔴 IT IS A FUNCTION SINCE 2026-08-24, AND IT IS NOT CALLED FROM HERE. The
//    daemon is started by `http-daemon.js`, a bootstrap whose ONLY job is to arm
//    the module-source recorder BEFORE the first daemon module is compiled — the
//    baseline has to be the bytes Node actually compiled, never a re-read, or
//    the guard compares itself clean while running yesterday's logic. Read the
//    header of `stale-code.js` before moving this.
// 🛑 RUNNING THIS FILE DIRECTLY IS A NAMED REFUSAL, never a silent degradation:
//    with no recorder armed, `staleCode.check()` reports zero verified modules,
//    the fail-closed verdict says STALE, and the first request is refused rather
//    than answered by a daemon that cannot vouch for its own code.
function main() {
  const { host, port } = paths.httpEndpoint();
  // ⚠️ The address is read even when a descriptor is inherited, and it is then
  //    IGNORED — the supervisor's unit is the single place the address lives.
  //    Reading it unconditionally keeps this line free of any branch about which
  //    world we are in; `listenOn` is the one place that decides.
  // 🛑 ONE call for the WHOLE address: a host fetched apart from its port is
  //    two settings for one fact, and two settings drift.
  // 🔑 THE DAEMON OWNS ITS STATE, IN MEMORY — the kernel serialises its callers,
  //    so nothing needs a lock, a tmp+rename or a retry to take turns.
  // 🛑 RESTORE BEFORE LISTEN, AND THE ORDER IS THE WHOLE GUARANTEE. At this
  //    instant the daemon is the only thing that exists: the snapshot read has
  //    no concurrency to fear. Moving this line after `listenOn` would put back,
  //    by hand, the exact race this design removes — a client could be served
  //    from an empty memory while the file was still being read.
  // ⚠️ WITHOUT IT, EVERY RESTART RE-DELIVERS EVERY `once`. `watchOwnCode` exits
  //    on any edit of this repository, so a working session restarts the daemon
  //    repeatedly: a volatile state would reopen the duplicate delivery closed
  //    this morning, through a brand-new door.
  // 🔑 THE DAEMON IS A CACHE, NOT AN OWNER (2026-08-22). `durableStore` forwards
  //    every durable key (`doc-seen-`, `turn-count-`, `remainder-`) to the disk
  //    store, which is the truth again. What remains in RAM — and in the
  //    snapshot — is the EPHEMERAL class only: a `plan-` dies with its action,
  //    so losing it costs a recomputation, never a re-delivered document.
  // 🛑 `daemon-state.json` IS NO LONGER AN AUTHORITY. It kept the durable state
  //    across a restart, which made this process the single point of failure for
  //    the whole fleet: it exits BY DESIGN at every edit of this repository, and
  //    each exit withheld every `once` document until it came back (15 silent
  //    minutes measured that morning). Do not put durable keys back into it.
  // ═══════════════════════════════════════════════════════════════════════
  // 🧵 HOW MANY THREADS — DECIDED BEFORE ANYTHING IS OWNED (2026-09-20)
  // ═══════════════════════════════════════════════════════════════════════
  // 🛑 IT IS ANSWERED FIRST BECAUSE IT DECIDES WHO OWNS THE STATE. With no pool
  //    this process holds the store and the three tables, exactly as it always
  //    has. With a pool, an OWNER THREAD holds them and this thread becomes a
  //    client like every other participant — and building a local store first
  //    "just in case" would be the two-memories defect, created by the very
  //    code meant to remove it.
  // 🛑 A REFUSAL REACHES THE OPERATOR AND STOPS THE START. `poolSize` names what
  //    is wrong with a declaration; a daemon that started anyway would hand them
  //    a parallelism they believe in and do not have — the silent class.
  // ⚠️ `workers: 0` (the default, and an absent key) ⇒ `size === 0` ⇒ every
  //    branch below is the historical one, byte for byte. That is the acceptance
  //    criterion, not a preference.
  const declaredEndpoints = paths.httpListenEndpoints();
  const declaredWorkers = paths.httpWorkers();
  const pool = workerPool.poolSize(declaredWorkers, os.availableParallelism(), declaredEndpoints.length);
  if (pool.refusal) {
    lifecycle.record('lane-degraded', {
      lane: 'port', fatal: true, pid: process.pid, code: 'WORKERS_REFUSED', message: pool.refusal,
    });
    process.stderr.write(`ctxroute: ${pool.refusal}\n`);
    throw new Error(`ctxroute: workers refused (${pool.refusal})`);
  }
  // 🔴 SOCKET ACTIVATION AND A POOL IS A NAMED REFUSAL, AND IT IS DECLARED DEBT
  //    RATHER THAN AN UNMEASURED PATH. Whether a worker thread may `listen({fd})`
  //    on a descriptor the SUPERVISOR handed to the process has been measured on
  //    NO kernel here — and this repository does not ship a path whose only
  //    support is that it looks plausible. Exit condition, written so it can be
  //    closed rather than inherited: measure an inherited descriptor served from
  //    a worker on the three kernels (the shape `test/thread-listener.test.js`
  //    already has for a bound port), then delete this refusal in that gesture.
  const activated = inheritedFd(process.env, process.pid) !== null;
  if (pool.size > 0 && activated) {
    process.stderr.write('ctxroute: `http.workers` is declared and this process was handed its '
      + 'listening sockets by the supervisor. Serving an inherited descriptor from a worker thread '
      + 'is UNMEASURED on every kernel here, and an unmeasured transport is not something this '
      + 'daemon starts. Either set `http.workers` to 0, or stop using socket activation for it.\n');
    throw new Error('ctxroute: `http.workers` with socket activation is unmeasured and refused');
  }
  // ═══════════════════════════════════════════════════════════════════════
  // ⏻ WHEN THIS DAEMON RUNS — DECIDED BEFORE ANYTHING IS BOUND (2026-09-29)
  // ═══════════════════════════════════════════════════════════════════════
  // 🛑 RESOLVED HERE, BEFORE THE FIRST SOCKET, like the pool: a refused
  //    declaration must stop the start, never surface after the daemon has
  //    begun serving under a mode nobody declared.
  // ⚠️ `os.version()` is the edition string ("Windows 11 Home", "Windows Server
  //    2022 Datacenter") — the one fact `auto` needs on Windows. Read here, the
  //    shell's job; judged in `lifecycle-pure.js`.
  const declaredLifecycle = paths.httpLifecycle();
  const lifecyclePlan = daemonLifecycle.resolveMode(declaredLifecycle.lifecycle,
    { platform: process.platform, osVersion: os.version() });
  const idleWindow = daemonLifecycle.idleWindow(declaredLifecycle.idleSeconds);
  const lifecycleRefusal = lifecyclePlan.refusal || idleWindow.refusal;
  if (lifecycleRefusal) {
    lifecycle.record('lane-degraded', {
      lane: 'port', fatal: true, pid: process.pid, code: 'LIFECYCLE_REFUSED', message: lifecycleRefusal,
    });
    process.stderr.write(`ctxroute: ${lifecycleRefusal}\n`);
    throw new Error(`ctxroute: lifecycle refused (${lifecycleRefusal})`);
  }
  // 🔑 ONE counter for the whole process, handed to every server of every lane
  //    and every thread (see `activity` in `createServer`).
  const activity = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
  const multi = pool.size > 0;
  // 🔑 THE CHANNEL HOLDS ONE SLOT PER PARTICIPANT, AND THIS THREAD IS SLOT 0 —
  //    it keeps the rendezvous lane, so it asks like everybody else. One
  //    authority, no exception: the day one participant answered locally there
  //    would be two memories again.
  const channelWiring = multi ? (() => {
    const clients = pool.size + 1;
    const control = new Int32Array(new SharedArrayBuffer(threadChannel.controlLength(clients) * 4));
    const payload = new Uint8Array(new SharedArrayBuffer(threadChannel.payloadLength(clients)));
    return { clients, control, payload };
  })() : null;
  const ownerThread = channelWiring ? new Worker(path.join(__dirname, 'thread-boot.js'), {
    workerData: {
      role: 'owner',
      control: channelWiring.control.buffer,
      payload: channelWiring.payload.buffer,
      clients: channelWiring.clients,
    },
  }) : null;
  // 🔑 THE DAEMON OWNS ITS STATE, IN MEMORY — the kernel serialises its callers,
  //    so nothing needs a lock, a tmp+rename or a retry to take turns.
  // 🛑 RESTORE BEFORE LISTEN, AND THE ORDER IS THE WHOLE GUARANTEE (or, with a
  //    pool, the OWNER restores before any server thread exists — same law, one
  //    thread further away).
  // ⚠️ TWO NAMES FOR ONE ROLE, AND THE SECOND IS NOT REDUNDANT: `memory` is the
  //    store THIS PROCESS owns, and it exists only without a pool. Everything
  //    that belongs to an OWNER — restoring the snapshot, flushing it on the way
  //    out — is written against `memory`, so with a pool those gestures cannot
  //    even be spelled here. `state` is what is HANDED to a server: local store
  //    or a client of the owner, and nothing downstream can tell which.
  // 🛑 ASKED, NEVER OPENED — CHANGED 2026-09-20, AND IT SHRINKS THE DEBT. This
  //    shell used to build the daemon's pair itself, one of the five INHERITED
  //    importers `only-store-resolve-opens-a-store` lists as debt rather than as
  //    permission. The owner thread needed the same pair, and a sixth importer
  //    is precisely what that rule exists to redden — so the construction moved
  //    to its owner and BOTH sides ask. The list loses an entry instead of
  //    gaining one, which is the direction a ratchet is allowed to move.
  const memory = channelWiring ? null : /** @type {{restore: Function, flush: Function, loadState: Function, saveState: Function, purge: Function}} */ (
    storeResolve.resolveStore({ backend: 'daemon' }).store
  );
  if (memory) memory.restore();
  const state = channelWiring
    ? createClient({
      control: channelWiring.control,
      payload: channelWiring.payload,
      clients: channelWiring.clients,
      index: 0,
    }).store
    : /** @type {{loadState: Function, saveState: Function, purge: Function}} */ (memory);

  // ═══════════════════════════════════════════════════════════════════════
  // 🔑 FRESHNESS — ONE pair, shared by BOTH transports and by the watchers.
  // ═══════════════════════════════════════════════════════════════════════
  // 🛑 ONE `freshness`, ONE `dieOnStaleCode`, exactly as there is ONE `store`:
  //    two verifiers would be two answers to one question, and the day they
  //    disagreed the daemon would serve on one transport what it refused on the
  //    other. Same reason two stores are forbidden here.
  // ⚠️ `staleCode.check` is reached THROUGH the namespace, deliberately: the
  //    SEEN RED of this guard is a driver that replaces the comparison in memory
  //    with one that always answers "identical", and a destructured binding
  //    would make that sabotage impossible — hence the guard unprovable.
  /**
   * ASK THE OWNER TO SAVE, AND WAIT FOR IT TO SAY IT HAS.
   *
   * 🔴 IT IS CALLED ON EVERY PATH THAT LEAVES, AND THE STALE-CODE EXIT IS THE
   *    FREQUENT ONE — dozens of times a day, by design. `process.exit` kills a
   *    worker outright (no event, no `finally`), so without this the owner dies
   *    mid-save and the arrival order of every invocation in flight is lost,
   *    while the death looks exactly as clean as it always did. That is the
   *    2026-09-19 defect, put back by the exit path instead of the start one.
   * 🛑 BOUNDED AND RE-CHECKING like every wait here, and its exhaustion costs
   *    exactly what the old behaviour cost: nothing is retried, nothing is
   *    guessed, the process simply leaves.
   * ⚠️ NO POOL ⇒ NOTHING TO DRAIN: this thread owns the store and writes its own
   *    snapshot, exactly as before.
   * @returns {void}
   */
  const drainOwner = () => {
    if (!channelWiring) return;
    Atomics.store(channelWiring.control, threadChannel.SHUTDOWN, 1);
    Atomics.notify(channelWiring.control, threadChannel.DOORBELL);
    const askedAt = Date.now();
    while (Atomics.load(channelWiring.control, threadChannel.DRAINED) === 0
      && threadChannel.keepWaiting(Date.now() - askedAt, threadChannel.WAIT_CEILING_MS)) {
      Atomics.wait(channelWiring.control, threadChannel.DRAINED, 0, threadChannel.WAIT_SLICE_MS);
    }
  };
  const freshness = () => staleCode.check();
  /**
   * @param {{stale: boolean, checked: number, reasons: string[]}} verdict
   * @param {{dir?: unknown, eventType?: unknown, filename?: unknown}} [change]
   */
  const dieOnStaleCode = (verdict, change) => {
    // 🛑 THE RECORD COMES FIRST, AND IT IS FAIL-OPEN. This is the daemon's most
    //    frequent death; refusing to die because the journal threw would mean
    //    serving stale logic, the green that lies. `process.exit` sits OUTSIDE
    //    the `try`, where nothing can reach it.
    try {
      lifecycle.record('stale-code-exit', {
        ...staleCodeFields(change, process.pid, Math.round(process.uptime() * 1000)),
        // ⚠️ THE CAUSE, NAMED. 169 exits in one day said WHICH file only after
        //    somebody went looking. The count is the ANTI-VACUITY witness: a
        //    death reporting `checked=0` is a daemon that verified nothing, and
        //    that must read differently from one that verified everything.
        checked: verdict.checked,
        reason: verdict.reasons[0] || 'unknown',
        more: verdict.reasons.length > 1 ? verdict.reasons.length - 1 : null,
      });
    } catch { /* a lost line costs a diagnosis; a survived exit costs stale logic */ }
    // 🛑 THE STATE BEFORE THE EXIT — this is the daemon's most frequent death,
    //    so it is the one where losing the arrival order would be routine.
    try { drainOwner(); } catch (err) { log.daemonError('drain-owner', err); /* a stop must never be blocked by its own housekeeping */ }
    process.exit(EXIT_STALE_CODE);
  };
  /** The request path's half: report, then die. */
  const onStaleCode = (verdict) => dieOnStaleCode(verdict);

  // 🛑 THE LIFECYCLE LIVES HERE, in the executable shell — not in the builder.
  //    A second instance must NOT start: the kernel already refused the address,
  //    and it is the authority on duplicates (never a PID file, never a probe).
  // ═══════════════════════════════════════════════════════════════════
  // THE PER-INVOCATION TABLES BELONG TO THE DAEMON, NEVER TO A SOCKET
  // ═══════════════════════════════════════════════════════════════════
  // 🔴 CREATED HERE, ONCE, BECAUSE NOT DOING SO SHIPPED A SILENT DATA LOSS
  //    (measured 2026-09-18, the day `http.listeners` was first raised above 1).
  //    `createServer` DEFAULT-CREATES these three tables when a caller omits
  //    them — correct for the single socket that existed before, and a trap the
  //    moment a second one is opened: each socket then counted arrivals in ITS
  //    OWN map. MEASURED on a bench, one document of 17 chunks over 32 frames:
  //    at 4 sockets, chunks 1..8 were delivered FOUR TIMES EACH and chunks
  //    9..17 — more than half the document — were delivered NEVER. The visible
  //    half was the duplication; the half nobody could see was the loss.
  // 🛑 SO THEY ARE PASSED TO EVERY `createServer` BELOW, WITHOUT EXCEPTION.
  //    `frame-sequencer-pure` decides WHICH content index a connecting frame
  //    serves by counting arrivals for one `tool_use_id`, and its whole premise
  //    — written in its own doc — is "the daemon is a SINGLE PROCESS that sees
  //    every connecting request of one invocation". One process with N tables
  //    breaks that premise while looking exactly like one that honours it.
  // 🛑 IF YOU OPEN ANOTHER SOCKET ANYWHERE IN THIS FILE, YOU MUST HAND IT THESE
  //    THREE. The default-creation stays for tests that drive `handle()` with a
  //    bare `deps`; it must never again be what a real socket receives.
  const frameSequencerState = frameSequencer.createState();
  const deliveryNoticeState = deliveryNotice.createState();
  const carryoverState = carryover.createState();

  // ═══════════════════════════════════════════════════════════════════════
  // 🔴 THE ARRIVAL ORDER SURVIVES THE DEATH — MEASURED DEFECT, 2026-09-19
  // ═══════════════════════════════════════════════════════════════════════
  // This daemon exits BY DESIGN at every delivery of new code, and the accepted
  // criterion is that a restart is invisible to the agent. It was NOT, for an
  // invocation IN FLIGHT: `doc-seen-` survives (disk, write-through) so the
  // documents stayed marked delivered, while these three tables died with the
  // process — so the frames landing after the restart were counted as the FIRST
  // and re-served chunk 1. **The document is not re-decided; the CHUNK is
  // re-served**, and the agent sees its skill arrive a second time mid-session.
  // It happened today, in production, on the operator's other conversations.
  // 🛑 RESTORED BEFORE ANY SOCKET IS TAKEN — the order is the guarantee, exactly
  //    as it is for the durable store above: once a client can connect, a table
  //    filled from a file would be racing a table being written by a request.
  // 🛑 AND SAVED AT DEATH, NEVER PER FRAME. Writing these on every frame would be
  //    32 disk writes per action on a machine whose SSD wear is a declared
  //    budget — refused for that reason. One write while the process is exiting
  //    costs a SERVING daemon exactly nothing, which is also why this is not a
  //    development-mode feature: it guards a production defect and costs
  //    production zero.
  // ⚠️ COVERS `process.exit(90)`, WHICH IS THE FREQUENT DEATH (Node fires
  //    `'exit'` on an explicit exit). `SIGKILL` and a power loss are NOT covered
  //    and the residual is BOUNDED: it degrades to exactly today's behaviour, on
  //    a death that is rare instead of routine.
  // ⚠️ NO tmp+rename here, DELIBERATELY: a truncated file fails `JSON.parse`, the
  //    decode is fail-open to empty, and the next clean exit rewrites it whole.
  //    The atomicity that protects the durable store protects a TRUTH; this is a
  //    cache of arrival counters whose worst loss is what we already accept.
  const fsNode = require('node:fs');
  const invocationsPath = path.join(paths.stateDir(), 'daemon-invocations.json');
  const liveTables = {
    sequencer: frameSequencerState,
    notice: deliveryNoticeState,
    carryover: carryoverState,
  };
  // 🛑 THE COUNT RIDES ON `start`, IT IS NOT AN EVENT OF ITS OWN — and the first
  //    version of this block DID make it one, which broke the daemon outright:
  //    the journal's vocabulary is a CLOSED, fail-closed list, so an undeclared
  //    name takes `main()` down and every suite that drives a real daemon went
  //    red at once. The rule was already written — *fields on an EXISTING event,
  //    never a new event and never a new frequency* — because the journal's
  //    512 KB ceiling is STRUCTURAL, not a number somebody maintains.
  // ⚠️ AND `start` IS THE RIGHT CARRIER: it fires exactly once per process life,
  //    which is exactly how often this restoration happens.
  // 🔴 WITH A POOL, NEITHER HALF HAPPENS HERE — AND FORGETTING THAT WOULD LOSE
  //    THE ARRIVAL ORDER WHILE LOOKING LIKE IT SAVED IT. The owner thread holds
  //    the live tables; the three maps above would be EMPTY, so this exit writer
  //    would overwrite the owner's file with nothing, on every death, and the
  //    invocations in flight would have their opening chunks re-served exactly
  //    as they were before the snapshot existed. The owner restores and saves
  //    them (`state-owner-entry.js`), which is the same law one thread further
  //    away: one owner, one file.
  let invocationsRestored = 0;
  if (!multi) {
    try {
      invocationsRestored = invocationSnapshot.adopt(
        liveTables,
        invocationSnapshot.decode(JSON.parse(fsNode.readFileSync(invocationsPath, 'utf8'))),
      );
    } catch (err) {
      // fail-open: no file, unreadable, or malformed — which is today's behaviour.
      // An ABSENT file is the normal first start; anything else is said.
      if (!err || /** @type {any} */ (err).code !== 'ENOENT') log.daemonError('snapshot-load', err);
    }
    process.on('exit', () => {
      try {
        fsNode.writeFileSync(invocationsPath, JSON.stringify(invocationSnapshot.encode(liveTables)));
      } catch (err) {
        // fail-open: a process already dying must never throw on its way out.
        log.daemonError('snapshot-save', err);
      }
    });
  }

  // 🛑 WITH A POOL THIS THREAD BINDS NO PORT. Every declared socket belongs to a
  //    server thread (`assignSockets`), and a socket held by TWO acceptors is two
  //    accept loops on one handle — the shape the kernel already refuses between
  //    threads (`EADDRINUSE`, measured) and that nothing would refuse here.
  const laneFd = multi ? null : listenOn(createServer({
    store: state,
    freshness,
    onStaleCode,
    frameSequencerState,
    deliveryNoticeState,
    carryoverState,
    activity,
    onAddressInUse: (err) => {
      // ⚠️ The kernel refused the address: a second instance. Say WHICH lane and
      //    WHY before dying, otherwise the supervisor's restart loop is the only
      //    symptom and it names nothing.
      lifecycle.record('bind-refused', { lane: 'port', host, port, pid: process.pid });
      throw err;
    },
    // 🛑 THE PORT LANE DIES ON A LOST ADDRESS, AND THE ASYMMETRY WITH THE
    //    RENDEZVOUS BELOW IS DELIBERATE — read this before "harmonising" them.
    //    The rendezvous degrades ONE lane and keeps serving, correctly: the port
    //    is still there for everyone. The reverse is NOT symmetric, because a
    //    port-less daemon GOES ON TO TAKE THE RENDEZVOUS — so it squats the very
    //    address its replacement needs, and every restart the supervisor
    //    attempts dies on `EADDRINUSE`. **A deaf daemon that stays alive blocks
    //    its own relief, for ever.** Dying hands recovery back to the pieces that
    //    own it: the supervisor restarts, and the boot task puts the address
    //    back. Neither is this process's job.
    // 🛑 AND IT DOES NOT RETRY, ON PURPOSE. Waiting for an address to reappear
    //    would be this daemon doing the reconciler's work, from the one place
    //    that cannot see whether the address is coming back.
    // 🛑 `lane-degraded`, NOT A NEW EVENT — the vocabulary is a CLOSED LIST and
    //    the journal's own header says it: FIELDS on an existing event, never a
    //    new one, so the 512 KB ceiling stays a consequence of the mechanism and
    //    never a number anyone maintains. The FACT is identical to the
    //    rendezvous lane's — *a transport could not take its address* — and only
    //    the shell's POLICY differs. `fatal` is what says which.
    onLaneLost: (err) => {
      lifecycle.record('lane-degraded', {
        lane: 'port', fatal: true, host, port, pid: process.pid,
        code: /** @type {NodeJS.ErrnoException} */ (err).code,
        message: err && err.message,
      });
      process.stderr.write(`ctxroute: the port lane could not take ${host}:${port} `
        + `(${/** @type {NodeJS.ErrnoException} */ (err).code}). Dying rather than staying alive and deaf: `
        + 'this process would still hold the rendezvous, so every restart would be refused as a duplicate.\n');
      throw err;
    },
  }), process.env, process.pid, port, host);

  // ═══════════════════════════════════════════════════════════════════
  // THE EXTRA LISTENING SOCKETS — capacity, never speed (2026-09-18)
  // ═══════════════════════════════════════════════════════════════════
  // 🔑 WHY MORE THAN ONE SOCKET AT ALL: the accept queue is capped PER SOCKET,
  //    and that cap is the one lever measured to work. On Windows the depth is
  //    `min(backlog, 200) + 32` = 232 whatever we declare — the backlog argument
  //    and `SOMAXCONN_HINT` are both measured INERT from this runtime — while N
  //    sockets give N × 232, strictly linear at 1/2/4. On 2026-09-18 the daemon's
  //    own journal read `peakConn = 254` against that 232, twelve seconds before
  //    a burst of refusals, and Microsoft documents the signal exactly: a full
  //    queue answers `WSAECONNREFUSED`.
  // 🛑 IT BUYS A WAITING ROOM, NEVER SERVICE SPEED. This process stays
  //    single-threaded: N sockets let more callers WAIT, they do not make it
  //    answer faster. The other wall is a different lever entirely (worker
  //    threads) and must never be confused with this one.
  // 🛑 ZERO DEFAULT CHANGE, AND THAT IS THE ACCEPTANCE CRITERION: with nothing
  //    declared this list holds exactly ONE endpoint — the one already bound
  //    above — so the loop body never runs and the daemon is byte-identical to
  //    what it was.
  // ⚠️ SKIPPED ENTIRELY UNDER SOCKET ACTIVATION (`laneFd !== null`): the OS owns
  //    the listening sockets there, their count is the unit's business
  //    (`ListenStream=`), and binding our own beside them would serve an address
  //    no supervisor knows about.
  // ⚠️ AND IT DOES NOT GO THROUGH `listenOn`, deliberately: that function answers
  //    "an inherited descriptor, or a port?" — a question already settled here,
  //    since these exist only when nothing was inherited. Handing it a fabricated
  //    environment to re-ask a question we have answered is how a caller starts
  //    lying to its own helper.
  // ⚠️ READ ONCE, AT THE TOP OF `main` — the pool decision needs the same list,
  //    and two calls would be two readings of one fact.
  const extraEndpoints = laneFd === null ? declaredEndpoints.slice(1) : [];

  // ═══════════════════════════════════════════════════════════════════
  // UNDER SOCKET ACTIVATION THE SUPERVISOR'S COUNT IS THE AUTHORITY
  // ═══════════════════════════════════════════════════════════════════
  // 🔴 THIS BLOCK EXISTS BECAUSE `http.listeners` WAS BROKEN IN SILENCE ON EVERY
  //    ACTIVATED OS (found 2026-09-18, the day the key was first raised above 1).
  //    The wiring generator spreads the frames over EVERY declared endpoint and
  //    has no idea which platform runs them; the daemon served only descriptor 3.
  //    ⇒ `listeners: 4` on Linux or macOS = 24 frames of every 32 POSTing to a
  //    port nobody holds, on every action, with nothing going red.
  // 🛑 WE DO NOT BIND HERE, EVER — the OS owns these sockets. What we can do is
  //    USE all of them, and REFUSE when their number is not the number the
  //    operator declared. Binding our own beside them would serve an address no
  //    supervisor knows about; serving fewer than declared is the silent hole.
  // 🔑 THE REFUSAL IS THE POINT, NOT THE COUNTING. A mismatch means the unit and
  //    the config disagree — one truth in two files, which is the class this
  //    repository removes everywhere else. Dying hands the problem to the
  //    installer that owns BOTH files; starting anyway hands the operator a
  //    capacity they believe in and do not have.
  // ⚠️ Windows never reaches this branch (no socket activation there, measured
  //    and enumerated in `service-units.md`), so its behaviour is untouched.
  const extraFds = [];
  if (laneFd !== null) {
    const handed = inheritedFdCount(process.env, process.pid);
    if (handed !== declaredEndpoints.length) {
      lifecycle.record('lane-degraded', {
        lane: 'port',
        fatal: true,
        pid: process.pid,
        code: 'LISTENERS_MISMATCH',
        message: `declared ${declaredEndpoints.length}, supervisor handed ${handed}`,
      });
      process.stderr.write('ctxroute: the configuration declares '
        + `${declaredEndpoints.length} listening socket(s) and the supervisor handed ${handed}. `
        + 'Refusing to start: the wiring POSTs to every declared address, so serving fewer '
        + 'would drop that share of EVERY action in silence. Make the socket unit declare as '
        + 'many sockets as `http.listeners`, or lower the key — the two are ONE number.\n');
      throw new Error(`ctxroute: listeners mismatch (declared ${declaredEndpoints.length}, `
        + `inherited ${handed})`);
    }
    for (let i = 1; i < handed; i += 1) extraFds.push(SD_LISTEN_FDS_START + i);
  }
  for (const fd of extraFds) {
    createServer({
      store: state,
      freshness,
      onStaleCode,
      // 🛑 THE THREE TABLES ARE SHARED, NEVER DEFAULT-CREATED PER SOCKET — see
      //    the block that builds them: omitting them here delivered half a
      //    document four times and the other half not at all.
      frameSequencerState,
      deliveryNoticeState,
      carryoverState,
      activity,
      // ⚠️ NEITHER HOOK CAN FIRE ON AN INHERITED DESCRIPTOR — we never bind, so
      //    there is no address to find taken and none to find missing. They are
      //    declared anyway because `createServer` treats an UNCLAIMED code as a
      //    rethrow, and a builder that decides its caller's fate is the defect
      //    `kernel-bind` paid three CI round trips for.
      onAddressInUse: (err) => { throw err; },
      onLaneLost: (err) => { throw err; },
    }).listen({ fd });
  }

  for (const extra of multi ? [] : extraEndpoints) {
    createServer({
      store: state,
      freshness,
      onStaleCode,
      // 🛑 SAME THREE TABLES AS THE FIRST SOCKET — the sequencer's premise is
      //    that ONE authority sees every frame of an invocation. N maps in one
      //    process look identical and are not.
      frameSequencerState,
      deliveryNoticeState,
      carryoverState,
      activity,
      onAddressInUse: (err) => {
        lifecycle.record('bind-refused', {
          lane: 'port', host: extra.host, port: extra.port, pid: process.pid,
        });
        throw err;
      },
      // 🛑 SAME POLICY AS THE FIRST SOCKET, and for the same reason: a daemon
      //    that stayed alive having lost one of its declared addresses would
      //    serve a capacity nobody can see is missing — the silent degradation
      //    this repository refuses. It dies; the supervisor restarts it.
      onLaneLost: (err) => {
        lifecycle.record('lane-degraded', {
          lane: 'port',
          fatal: true,
          host: extra.host,
          port: extra.port,
          pid: process.pid,
          code: /** @type {NodeJS.ErrnoException} */ (err).code,
          message: err && err.message,
        });
        process.stderr.write(`ctxroute: the port lane could not take ${extra.host}:${extra.port} `
          + `(${/** @type {NodeJS.ErrnoException} */ (err).code}). A declared listening socket that `
          + 'cannot bind is capacity the operator believes they have.\n');
        throw err;
      },
    }).listen(extra.port, extra.host, LISTEN_BACKLOG);
  }
  // ⚠️ Recorded HERE, right after the listen call, and it says "we began serving"
  //    — not "the bind succeeded": `listen` reports its failure asynchronously,
  //    on the error path just above. Two records, two facts, never one guess.
  // 🛑 `uptimeMs` on every exit below is what makes the RATE readable without any
  //    counter to maintain: nine short lives in an hour ARE the nine lines, and a
  //    separate restart count would be a second truth that drifts from the file.
  // ═══════════════════════════════════════════════════════════════════
  // 🧵 THE POOL — N THREADS, EACH HOLDING ITS OWN LISTENING SOCKETS
  // ═══════════════════════════════════════════════════════════════════
  // 🔑 THIS IS WHAT MAKES IT A NETWORK DAEMON RATHER THAN A COMPUTE POOL, and
  //    the operator is who drew that line: a pool that only BUILDS answers
  //    leaves accept, parsing and the response on one thread, so that thread is
  //    still the whole daemon. Here thread `t` owns sockets `assignSockets`
  //    gives it and does ALL the expensive work of their requests.
  // 🛑 THE DISTRIBUTION IS THE PURE MODULE'S, REFUSALS INCLUDED. A socket held
  //    by two threads is two accept loops on one handle; a socket held by none
  //    is an address the wiring POSTs to and nobody answers. Both are silent,
  //    which is why neither is ever clamped into existence here.
  const serverThreads = [];
  if (channelWiring && ownerThread) {
    const wire = channelWiring;
    const spread = workerPool.assignSockets(declaredEndpoints.length, pool.size);
    if (spread.refusal) {
      lifecycle.record('lane-degraded', {
        lane: 'port', fatal: true, pid: process.pid, code: 'WORKERS_REFUSED', message: spread.refusal,
      });
      process.stderr.write(`ctxroute: ${spread.refusal}\n`);
      throw new Error(`ctxroute: socket assignment refused (${spread.refusal})`);
    }
    /** @type {number[][]} */ (spread.assignment).forEach((sockets, t) => {
      const worker = new Worker(path.join(__dirname, 'thread-boot.js'), {
        workerData: {
          role: 'server',
          control: wire.control.buffer,
          payload: wire.payload.buffer,
          clients: wire.clients,
          // ⚠️ SLOT 0 IS THIS THREAD'S — the rendezvous lane asks like everyone
          //    else, so the pool starts at one.
          index: t + 1,
          endpoints: sockets.map((i) => declaredEndpoints[i]),
          fds: [],
          backlog: LISTEN_BACKLOG,
          // 🛑 THE BUFFER, NEVER THE VIEW: only a `SharedArrayBuffer` crosses
          //    into a worker; a typed array would arrive as a COPY, and the
          //    main thread would watch a counter no request ever touches.
          activity: activity.buffer,
        },
      });
      // 🛑 A THREAD CANNOT KILL THE PROCESS, SO IT REPORTS AND THIS DOES.
      //    `process.exit()` inside a worker ends the WORKER: a stale-code verdict
      //    handled there would leave the daemon alive, serving from its other
      //    threads, with one socket dead and nothing said.
      worker.on('message', (/** @type {{kind?: string, verdict?: any, code?: string, message?: string}} */ note) => {
        if (!note || typeof note !== 'object') return;
        if (note.kind === 'stale-code') { dieOnStaleCode(note.verdict); return; }
        if (note.kind === 'lane-lost') {
          lifecycle.record('lane-degraded', {
            lane: 'port', fatal: true, pid: process.pid, code: note.code, message: note.message,
          });
        }
      });
      // 🛑 A DEAD SERVER THREAD IS A DEAD DAEMON, LOUDLY. Its sockets are gone
      //    and nothing else will ever bind them: a process that stayed up would
      //    serve a share of every action into silence, which is exactly the hole
      //    `http.listeners` shipped with on every activated OS.
      worker.on('error', (/** @type {Error} */ err) => {
        lifecycle.record('lane-degraded', {
          lane: 'port', fatal: true, pid: process.pid, code: 'WORKER_ERROR', message: err && err.message,
        });
        process.stderr.write(`ctxroute: server thread ${t} died — ${err && err.message}\n`);
        process.exit(EXIT_STALE_CODE);
      });
      serverThreads.push(worker);
    });
    // 🛑 THE OWNER IS NOT OPTIONAL: without it every thread blocks on a wait
    //    nobody answers, and the whole daemon stops at the ceiling. Its death is
    //    the process's death, handed to the supervisor.
    ownerThread.on('error', (/** @type {Error} */ err) => {
      lifecycle.record('lane-degraded', {
        lane: 'port', fatal: true, pid: process.pid, code: 'OWNER_ERROR', message: err && err.message,
      });
      process.stderr.write(`ctxroute: the state owner thread died — ${err && err.message}\n`);
      process.exit(EXIT_STALE_CODE);
    });
  }

  lifecycle.record('start', {
    pid: process.pid,
    lane: laneFd === null ? 'port' : 'inherited-fd',
    port: laneFd === null ? port : null,
    fd: laneFd,
    // ⚠️ HOW MANY ARRIVAL COUNTERS CROSSED THE DEATH — a FIELD, for the same
    //    reason as `listeners` below. Zero is the ordinary case (a first start,
    //    or an unreadable snapshot, both fail-open); a non-zero number is what
    //    tells an operator that the invocations in flight during the last
    //    restart did NOT have their opening chunks re-served at them.
    invocationsRestored,
    // ⚠️ HOW MANY THREADS ACTUALLY STARTED — a FIELD on an event that already
    //    fires once per process life, never a new event (the journal's
    //    vocabulary is a closed list and its 512 KB ceiling is structural).
    //    Zero is the ordinary case and it means today's daemon, byte for byte.
    // ⚠️ WRITTEN AFTER `invocationsRestored` ON PURPOSE: a judge reads the
    //    first 900 characters of this record to prove the restoration is
    //    announced, and pushing that field out of its window would redden a
    //    guard that is perfectly right.
    workers: serverThreads.length,
    // ⚠️ HOW MANY SOCKETS WE ACTUALLY OPENED — a FIELD on an event that already
    //    fires once per process life, never a new event (the vocabulary is a
    //    closed list). Without it the capacity is invisible: an operator who
    //    raised `http.listeners` and mistyped the key would read a healthy start
    //    line and believe in a margin they never got.
    // 🔴 IT WAS `null` UNDER SOCKET ACTIVATION UNTIL 2026-09-18, on the reasoning
    //    that "the count is the unit's and not ours to claim". That reasoning is
    //    what let the silent hole above live: the ONE number that would have
    //    shown a Linux adopter they were serving 1 socket while their wiring
    //    aimed at 4 was deliberately withheld. We SERVE these descriptors, so we
    //    say how many — whose they are is a different question from how many
    //    are working.
    // ⚠️ WITH A POOL THIS PROCESS BOUND NONE OF THEM — the THREADS did, one
    //    socket each per `assignSockets`. The number is still the number of
    //    listening sockets the daemon serves, which is the question an operator
    //    reading this line is asking; WHICH thread holds each is the `workers`
    //    field's business, and confusing the two is how a capacity goes unseen.
    listeners: multi ? declaredEndpoints.length
      : (laneFd === null ? 1 + extraEndpoints.length : 1 + extraFds.length),
    // ⚠️ WHEN THIS DAEMON RUNS, AND WHY (2026-09-29) — FIELDS, never a new event.
    //    `auto` resolves on the environment, and a default nobody can see
    //    deciding is an outage nobody can explain. `idleSeconds` is null when
    //    no idle window is armed (`login`).
    lifecycle: lifecyclePlan.mode,
    lifecycleReason: lifecyclePlan.reason,
    idleSeconds: lifecyclePlan.mode === 'on-demand' ? idleWindow.ms / 1000 : null,
    // ⚠️ WHAT WE ASKED THE KERNEL FOR, AND WHAT IT WILL ACTUALLY ALLOW — the Redis
    //    pattern: SAY IT, never refuse to start over it. `listen(2)` is silently
    //    capped by `net.core.somaxconn`, so a declared 65535 can quietly become
    //    128 and nothing anywhere would show it. An installer WALL over this was
    //    removed the same day it shipped (`install-linux.sh` says why); this is
    //    what replaces it — an observation, on an event that already fires once
    //    per process life, so the journal's ceiling is untouched.
    // 🛑 The read is the SHELL's job and its failure is a `null`, never a zero:
    //    off Linux the file does not exist, and "I could not measure" must never
    //    render as a measured zero.
    ...backlogCeiling.backlogFields(LISTEN_BACKLOG, readSomaxconn()),
    // ⚠️ ANTI-VACUITY, IN THE JOURNAL AND NOT ONLY IN A TEST. A guard that
    //    verifies ZERO modules is indistinguishable from one that verifies them
    //    all and finds them clean — this repository's worst defect, printed here
    //    once per process life so it costs nothing and hides nowhere.
    verifiedModules: staleCode.count(),
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 🔴 THE SECOND LISTENER — WITHOUT IT THE KERNEL LANE HAS NO OTHER END.
  // ═══════════════════════════════════════════════════════════════════════
  // MEASURED 2026-08-21, and it invalidated a switch-over plan already written:
  // this daemon listened ONLY on a TCP port, while `state-client.js` connects on
  // `kernel-endpoint.endpoint()` — a named pipe on Windows, an abstract socket on
  // Linux, a socket file on macOS. **Nobody was listening where the client
  // knocks.** Switching the shells over would have sent every frame to `ENOENT`,
  // hence to the local state-less path, hence `once` withheld on EVERY action.
  // 🛑 AND THE THREE-OS PROOF DID NOT COVER IT: `state-daemon.test.js` forks its
  //    OWN test daemon (address in `argv[2]`), never this file. It proves the
  //    MECHANISM; it never proved that the PRODUCTION daemon listens at the
  //    rendezvous. **A green on a twin is not a green on the thing.**
  //
  // ⚠️ BOTH ADDRESSES ARE LEGITIMATE — this is not one of them being a mistake:
  //    · the PORT serves Claude Code's native `type:"http"` handler, which takes
  //      a URL to POST to, and a pipe is not a URL;
  //    · the RENDEZVOUS serves the client lane — spawned hooks, and Codex, which
  //      has no `http` handler at all.
  //    One handler, two transports. A second protocol would drift from the first.
  // ⚠️ SAME `store`, DELIBERATELY: one daemon, one memory. Two stores would be
  //    the "two memories" defect `client-core.js` exists to forbid, reintroduced
  //    from inside the daemon itself.
  // 🛑 `kernel-bind` TAKES THE ADDRESS, never a bare `listen`: on macOS a killed
  //    daemon leaves its socket FILE behind, and the entry is cleared only after
  //    ASKING THE KERNEL who answers — never on "the file exists, so it is
  //    probably stale", which would delete a LIVING daemon's socket and leave
  //    every client knocking on an address nobody owns.
  // 🛑 THE SHELL DECIDES TO DIE, not the builder: an address already taken means
  //    a second instance, and the kernel is the authority that refuses it.
  // ⚠️ THE DIRECTORY MUST EXIST BEFORE THE BIND, and the error that proves it
  //    is NOT the same on every kernel: macOS answers `EACCES` where Linux
  //    answers `ENOENT` for a socket whose parent directory is missing.
  //    MEASURED in CI on 2026-08-21, on a fresh clone where `state/` did not
  //    exist yet — and the misleading `EACCES` sent the first reading towards a
  //    permissions problem that did not exist.
  try { require('fs').mkdirSync(paths.stateDir(), { recursive: true }); } catch { /* the bind below will say it */ }

  bind(
    // 🛑 `onLaneLost` IS CLAIMED HERE AND DOES NOTHING — a CLAIM, never a
    //    swallow, and removing it re-creates a defect that already cost three CI
    //    round trips (2026-08-20, macOS). This lane's errors belong to
    //    `kernel-bind`, which attaches its own `once('error')` to inspect a
    //    possibly DEAD socket file — macOS is the only kernel of the three that
    //    leaves one behind. Ours is registered FIRST, so the rethrow the builder
    //    now performs by default would kill the process before that inspection
    //    ever ran, exactly as the old throwing builder did.
    // ⚠️ AND THE CALLBACK BELOW IS WHERE THIS LANE'S POLICY LIVES: anything but
    //    `EADDRINUSE` degrades ONE lane loudly and leaves the port serving. The
    //    port lane above decides the OPPOSITE, and its reason is written there.
    createServer({
      store: state, freshness, onStaleCode, activity,
      ...rendezvousLaneHooks(),
    }),
    endpoint(),
    () => {},
    (err) => {
      // 🛑 ONLY A DUPLICATE JUSTIFIES DYING, AND THIS COST A CI ROUND TRIP.
      //    The first version rethrew EVERY error, so a rendezvous that could not
      //    be taken KILLED THE WHOLE DAEMON — including the PORT lane, which was
      //    listening and perfectly healthy. Claude Code's `http` handler would
      //    have lost its service because the CLIENT lane's address was
      //    unavailable: two transports, one shared fate, for no reason.
      // ✅ `EADDRINUSE` means the kernel refused a SECOND instance: that one is a
      //    real reason to die, and the kernel is the authority on it.
      //    Anything else degrades ONE lane: we say it LOUDLY on stderr (the
      //    supervisor captures it) and keep serving the other. A degradation
      //    that is announced is acceptable; a silent one is what this whole
      //    project exists to remove.
      // ⚠️ The cast is the repo's usual form: `Error` has no `code` for the type
      //    checker, and a lying JSDoc is what `check:types` exists to refuse.
      const e = /** @type {NodeJS.ErrnoException} */ (err);
      if (e && e.code === 'EADDRINUSE') {
        // ⚠️ `rendezvous`/`unlinkCode` come from `kernel-bind`: WHICH branch refused (a living
        //    owner, or a re-bind that failed after the cleanup) — the fact that tells a correct
        //    refusal from a defect, and that the bare `EADDRINUSE` never carried.
        lifecycle.record('bind-refused', lifecyclePure.rendezvousRefusal(
          /** @type {{code?: string, rendezvous?: string, unlinkCode?: string|null}} */ (/** @type {unknown} */ (e)), process.pid));
        throw err;
      }
      // ⚠️ ONE lane lost, the other still serving. The stderr line reaches a
      //    supervisor that may or may not keep it; the journal is what is still
      //    there tomorrow, and a degradation that leaves no trace is
      //    indistinguishable from a healthy daemon.
      lifecycle.record('lane-degraded', {
        lane: 'rendezvous', code: e && e.code, message: e && e.message, pid: process.pid,
      });
      process.stderr.write(`ctxroute: the client lane is UNAVAILABLE (${e && e.code}: ${e && e.message}). `
        + 'The port lane keeps serving; a spawned hook asking on the rendezvous will decide locally and record nothing.\n');
    },
  );
  // ⚠️ Armed AFTER `listen`, so the watched set covers everything the server
  //    itself pulled in. Watching before would miss the modules loaded lazily
  //    on the first require — the exact half most likely to be edited.
  const fs = require('fs');
  // 🔴 THE WATCH IS AN OPTIMISATION SINCE 2026-08-24 — READ THIS BEFORE EDITING.
  //    It used to be the guarantee, and it exited on ANY notification. MEASURED
  //    the same day on the FROZEN copy: 258 deaths, `mtime` and `ctime` both
  //    UNCHANGED, only `atime` moving — libuv subscribes ReadDirectoryChangesW
  //    to `FILE_NOTIFY_CHANGE_LAST_ACCESS` and delivers it as a plain `'change'`,
  //    and NTFS may defer that write by up to an hour. **Reading a file killed
  //    the service.** Now a notification runs the SAME comparison the request
  //    path runs and exits only if the content really differs.
  // 🛑 NO TIMER, NO DEBOUNCE, NO POLLING — and there is no admissible motive for
  //    one here: the comparison is synchronous and local, so the kernel and the
  //    disk already KNOW. `temporal-budget.json` would refuse a delay anyway.
  const verifyNow = (change) => {
    const verdict = freshness();
    if (verdict.stale) dieOnStaleCode(verdict, change);
    // ⚠️ THE NOISE STAYS OBSERVABLE. A notification that changed nothing is the
    //    NORMAL case now — it was 258 deaths a day before — and a guard nobody
    //    can see deciding is a guard nobody can trust. One line, fail-open, and
    //    the journal's ceiling (2 × 256 KB, for life) is unaffected: this fires
    //    on kernel events, never on requests.
    // ⚠️ ITS OWN FIELDS, NEVER `staleCodeFields`: that helper stamps
    //    `code: 90`, i.e. "we died", onto a line whose whole meaning is that we
    //    did NOT. `checked` is the anti-vacuity witness — a notification ignored
    //    after verifying ZERO modules is a different fact from one ignored after
    //    verifying all of them, and the journal must be able to tell them apart.
    else lifecycle.record('code-unchanged', { pid: process.pid, ...kernelFields(change), checked: verdict.checked });
  };
  watchOwnCode(
    watcherFactory(
      (dir, cb) => fs.watch(dir, { persistent: false }, cb),
      // ⚠️ A LOST-EVENTS ERROR VERIFIES IMMEDIATELY — the loss may have hidden a
      //    real change, and all three kernels prescribe exactly that rescan.
      () => verifyNow({ eventType: 'watch-error', filename: null, dir: null }),
      (dir, err) => {
        // 🛑 RE-ARMING FAILED ⇒ WE STOP SERVING. A directory we can no longer be
        //    told about is a directory whose changes we would learn only at the
        //    next request; the point-of-use check would still catch them, but a
        //    watcher that cannot be rebuilt is a symptom nobody should sleep on,
        //    and dying costs one restart on a lane the OS brings back.
        try {
          lifecycle.record('watch-lost', {
            pid: process.pid, dir, code: /** @type {NodeJS.ErrnoException} */ (err).code,
            message: err && err.message,
          });
        } catch { /* a lost line costs a diagnosis, never the decision */ }
        process.exit(EXIT_STALE_CODE);
      },
    ),
    require.cache,
    verifyNow,
  );

  // ── A SUPERVISOR'S STOP IS A CLEAN DEATH, AND IT MUST BE TREATED AS ONE ──
  // 🛑 THE SNAPSHOT IS WRITTEN EVERY N MUTATIONS **AND** ON `process.on('exit')`.
  //    That covers a normal end, an explicit `process.exit(n)` — including the
  //    stale-code exit above, this daemon's most frequent death — and an uncaught
  //    exception. It does NOT cover `SIGTERM`/`SIGINT`: with no listener, Node
  //    takes the DEFAULT action and `'exit'` never fires, so `systemctl stop` and
  //    every supervisor stop degraded to the bounded `kill -9` case, losing up to
  //    N mutations for nothing. Each loss costs a re-delivery, so it was never
  //    dangerous — only wasteful, and silent.
  // 🛑 THE HANDLER LIVES HERE, IN THE EXECUTABLE SHELL, NEVER IN THE STORE.
  //    Installing a signal listener SUPPRESSES Node's default termination, i.e.
  //    it decides whether the process lives — and a builder that decides its
  //    caller's lifetime is exactly the defect `createServer` shipped in August
  //    (an `EADDRINUSE` throw that killed the daemon before `kernel-bind` could
  //    look). A store returns a verdict; the shell decides to die.
  // ⚠️ `SIGKILL` stays uncoverable BY DESIGN — it cannot be caught, which is why
  //    the COUNT exists. Two authorities, and neither pretends to be the other.
  /**
   * LEAVE CLEANLY — the ONE exit shared by a supervisor's stop and an idle end.
   *
   * 🛑 EXIT 0, AND THAT IS WHAT MAKES AN IDLE END SAFE ON EVERY SUPERVISOR: a
   *    supervisor restarts on FAILURE only, so 0 reads as "job done" — the
   *    Windows task's event trigger fires on a non-zero result, systemd has
   *    `Restart=no`, launchd has no `KeepAlive`. The next start is asked by a
   *    harness session (Windows) or by the next connection (socket activation).
   * @param {() => void} recordExit writes the exit's journal line. ⚠️ A THUNK
   *   carrying the event name LITERALLY, never a name passed as a string:
   *   `lifecycle-log.test.js` proves every declared event is emitted by reading
   *   `lifecycle.record('<name>'` in this file, and a variable would blind it.
   * @returns {never}
   */
  const leaveCleanly = (recordExit) => {
    // ⚠️ THE STATE FIRST, THE TRACE SECOND. Losing the snapshot costs
    //    re-deliveries; losing one journal line costs a diagnosis. Both are
    //    swallowed — housekeeping must never delay nor break a stop.
    // 🛑 ONLY WHAT THIS PROCESS OWNS. With a pool the store belongs to the
    //    owner thread, which flushes it itself as it returns
    //    (`state-owner-entry.persist`); flushing a CLIENT here would mean a
    //    blocking round trip from inside a signal handler, and the owner is
    //    being asked to stop at the same instant.
    try { if (memory) memory.flush(); } catch (err) { log.daemonError('memory-flush', err); /* housekeeping must never delay a stop */ }
    // ⚠️ ASK, THEN WAIT FOR THE ANSWER — never kill. The flag is what lets the
    //    owner write its snapshot, and `process.exit` below would kill it
    //    mid-save: the arrival order of every invocation in flight would be
    //    lost while the shutdown looked perfectly clean (the defect of
    //    2026-09-19, restored by the shutdown path).
    // 🛑 THE WAIT IS BOUNDED AND RE-CHECKS, like every other wait here, and
    //    its exhaustion costs exactly what the old behaviour cost: nothing is
    //    retried, nothing is guessed, the process simply leaves.
    try { drainOwner(); } catch (err) { log.daemonError('drain-owner', err); /* a stop must never be blocked by its own housekeeping */ }
    try { recordExit(); } catch { /* a lost line costs a diagnosis, never the stop */ }
    process.exit(0);
  };
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => leaveCleanly(() => lifecycle.record('signal-exit', {
      pid: process.pid, signal, uptimeMs: Math.round(process.uptime() * 1000),
    })));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ⏻ ON DEMAND: LEAVE WHEN A WHOLE WINDOW PASSES WITH NOBODY ASKING
  // ═══════════════════════════════════════════════════════════════════════
  // 🔑 WHICH MODE RUNS AND WHY rides the `start` line (fields `lifecycle`,
  //    `lifecycleReason`, `idleSeconds`): a default resolved from the
  //    environment that nobody can see is an outage nobody can explain.
  // 🛑 THE STOP IS BY INACTIVITY, NEVER BY COUNTING SESSIONS (`lifecycle-pure`
  //    says why). A window closes on EQUALITY of the shared counter: any request
  //    in between re-arms it, so the daemon leaves between ONE and TWO windows
  //    after its last request — never while a request of any thread is recent.
  // ⚠️ ONE timer call site, re-armed from itself; declared `undecidable` in
  //    `temporal-budget.json`: whether another harness will ever ask is the
  //    future of a human, and no local authority can answer it.
  if (lifecyclePlan.mode === 'on-demand') {
    let seenAtArm = Atomics.load(activity, 0);
    const arm = () => setTimeout(() => {
      const seenNow = Atomics.load(activity, 0);
      if (daemonLifecycle.idleVerdict(seenAtArm, seenNow) === 'exit') {
        leaveCleanly(() => lifecycle.record('idle-exit', {
          pid: process.pid, idleSeconds: idleWindow.ms / 1000, uptimeMs: Math.round(process.uptime() * 1000),
        }));
      }
      seenAtArm = seenNow;
      arm();
    }, idleWindow.ms);
    arm();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 🔑 THE CORPUS STAYS IN MEMORY — where the remaining win actually is.
  // ═══════════════════════════════════════════════════════════════════════
  // 📐 MEASURED 2026-08-20 on the real corpus: a round trip is **41.49 ms**, of
  //    which the **transport is 0.17 ms**. The other 41 ms are the CORPUS RE-READ,
  //    the same cost the spawn lane pays hidden inside node's startup. The daemon
  //    alone takes an action from ~5.3 s to ~660 ms; this line is the rest.
  //    🛑 So do NOT go optimising the pipe: it has been measured at 0.4 %.
  // 🛑 TWO WATCHES, TWO OPPOSITE ANSWERS, AND THAT IS THE WHOLE DESIGN. Above,
  //    `watchOwnCode` EXITS when the CODE moves — serving stale logic is the green
  //    that lies. Here, a DOC moving is the fleet's normal working day, so the
  //    snapshot is DROPPED and rebuilt on the next request. Never make either one
  //    behave like the other.
  // 🛑 IT IS ENABLED HERE AND NOWHERE ELSE — an ARGUMENT of the executable shell,
  //    never an environment variable and never a module default. A spawned hook
  //    that inherited a cache could never be told to drop it: it would serve
  //    yesterday's knowledge, in silence, which is the one failure this project
  //    refuses outright. `require('../corpus')` is a no-op for everyone else.
  // ⚠️ ARMED AFTER `listen`, deliberately: the first request pays one walk and
  //    every later one is served from memory. Warming it here would only move that
  //    walk earlier while adding a startup path nothing exercises.
  // ⚠️ `persistent: false`, like the code watch: a watcher must never be the reason
  //    a process refuses to die.
  // ⚠️ ONE CALL COVERS BOTH KINDS since 2026-08-21: the corpus ROOTS and the SKILL
  //    BODIES (90–120 KB each, ~45 of them on this fleet) go through the same
  //    residency, the same kernel invalidation and the same ceilings. There is
  //    nothing else to enable, and there must never be a second switch.
  require('../corpus').enableCache((dir, cb) => fs.watch(dir, { persistent: false }, cb));
}

// ⚠️ EXIT CODE OF A WRONG ENTRY POINT — `EX_CONFIG` (sysexits), and DELIBERATELY
//    NOT 90: ninety means "my code moved, restart me", which a supervisor obeys
//    for ever. This one means "you started the wrong file", and no amount of
//    restarting will fix that.
const EXIT_WRONG_ENTRY = 78;

// 🛑 A NAMED REFUSAL, NEVER A SILENT NO-OP. Since 2026-08-24 the daemon is
//    started by `http-daemon.js`, which arms the freshness recorder BEFORE any
//    module of this file is compiled. Run directly, nothing would be recorded,
//    the fail-closed verdict would answer STALE and every request would be
//    refused — a service that looks up and answers nothing. Saying so out loud
//    costs one line; discovering it costs a fleet-wide outage.
if (require.main === module) {
  process.stderr.write('ctxroute: http-server.js is NOT the entry point. Start src/hooks/http-daemon.js — '
    + 'it records the exact bytes Node compiles before this file is loaded, which is what makes the '
    + 'freshness check an observation instead of an inference (see docs stale-code.md).\n');
  process.exit(EXIT_WRONG_ENTRY);
}
