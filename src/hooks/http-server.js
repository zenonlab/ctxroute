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
const { run } = require('../pretool-core');
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
const { createMemoryStore } = require('../memory-store');
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
// ⚠️ Bounded for life at 256 KB × 2 files, declared in `disk-writers.json`, and
//    FAIL-OPEN everywhere: nothing below may cost this daemon its life.
const lifecycle = require('../lifecycle-log');
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
 * @property {(() => {stale: boolean, checked: number, reasons: string[]})|null} freshness
 *   asked ONCE per request, before anything else. Absent ⇒ no verification at
 *   all, i.e. the behaviour that shipped before 2026-08-24, byte for byte.
 * @property {((freshness: {stale: boolean, checked: number, reasons: string[]}) => void)|null} onStaleCode
 *   what the SHELL does when the code on disk no longer matches. Absent ⇒
 *   NOTHING happens here beyond refusing to answer: a builder must not decide
 *   whether its caller lives.
 * @property {{loadState: Function, saveState: Function}|null} store the state
 *   backend. Absent/null ⇒ the historical disk store, byte-identical. A daemon
 *   passes its MEMORY store and, with it, an empty lock: the kernel already
 *   serialises its callers. The two always travel together.
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
  let data;
  try {
    data = JSON.parse(body);
  } catch {
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
    } catch {
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
    answer = outputFn(decision, fullDoc, combined);
  };
  const frames = frameFromUrl(url, parseFrames);
  const invocationId = typeof data.tool_use_id === 'string' ? data.tool_use_id : '';
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
  const frame = frameSequencer.nextIndex(frameSequencerState, invocationId, frames.frame, frames.nbFrames);
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
  if (carryover.isHarvested(carryoverState, invocationId)) return NO_OUTPUT;
  // 🛑 THE SCOPE IS COMPOSED BY ITS OWNER, `lib.scopeId` — never `session_id`
  //    alone: master and sub-agents share it, and two spellings of one scope
  //    would harvest across agents. Same single source the core uses.
  const scopeId = lib.scopeId(data.session_id, data.agent_id);
  carryover.observe(carryoverState, scopeId, invocationId, frame, frames.nbFrames);
  const notice = deliveryNotice.observe(deliveryNoticeState, invocationId, frame, frames.nbFrames);
  const noticeText = deliveryNotice.messageFor(notice);
  const showNotice = noticeText !== '' && lib.shouldShowNotification(collectCore.loadConfig());
  try {
    runFn(data, capture, {
      frame,
      nbFrames: frames.nbFrames,
      invocationId,
      // 🔑 FACTS IN, SEGMENTS OUT — the shell OBSERVES, the core READS the plan.
      //    This daemon knows which invocations of this scope still owe content
      //    and how many of their frames connected; it does NOT know what a plan
      //    contains, and it must not (the plan store and the splitting belong to
      //    the core). So it hands over the two numbers and nothing else.
      // ⚠️ `pending` IS CALLED ONLY ON THE DECIDING FRAME, inside the core's
      //    lock: frames 2..N return on the memoized plan before reaching it, so
      //    one invocation harvests exactly once.
      pending: () => carryover.pendingFor(carryoverState, scopeId, invocationId),
      onHarvested: (id) => carryover.markHarvested(carryoverState, id),
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
  } catch {
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
    answer = outputFn('none', '', noticeText);
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
    parseFrames: deps.parseFrames || require('../lib-pure').parseFrameArgs,
    // ⚠️ NO DEFAULT, EXACTLY LIKE `store`, AND FOR THE SAME REASON. Absent ⇒ the
    //    previous behaviour BYTE FOR BYTE, so every differential and every test
    //    driving `createServer` directly is untouched. Verifying its own
    //    freshness is a DECISION of whoever starts the daemon (`main` below),
    //    never a silent default a test inherits.
    freshness: deps.freshness || null,
    onStaleCode: deps.onStaleCode || null,
  };
  const server = http.createServer((req, res) => {
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
      if (wired.freshness && !freshnessScope.alreadyVerified(freshnessVerified, invocationId)) {
        const freshness = wired.freshness();
        if (freshness.stale) {
          if (typeof wired.onStaleCode === 'function') wired.onStaleCode(freshness);
          return;
        }
      }
      const answer = body === null ? NO_OUTPUT : handle(body, req.url, wired);
      const payload = JSON.stringify(answer);
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
    }).catch(() => {
      // ⚠️ THE FLOOR, and it must stay empty. Whatever went wrong on ONE
      //    request, the service keeps serving the others. A daemon that dies on
      //    an edge case is strictly worse than the spawn lane it replaces,
      //    where a crash cost exactly one short-lived process.
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
  server.on('error', (err) => {
    // ⚠️ `code` lives on `ErrnoException`, not on `Error` — `tsc` is right to
    //    ask, and a JSDoc that hid it would be a lying contract.
    const code = /** @type {NodeJS.ErrnoException} */ (err).code;
    if (code === 'EADDRINUSE' && typeof deps.onAddressInUse === 'function') deps.onAddressInUse(err);
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
    } catch { /* one blind directory, not a dead daemon */ }
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
    server.listen(port, host);
    return null;
  }
  // ⚠️ `server.listen(handle)` with an object carrying an `fd` member is the
  //    documented Node surface for an already-bound descriptor (net(1), v22).
  //    The host and port are NOT ours to choose here: the socket is already
  //    bound by the supervisor, and the unit is where its address is written.
  server.listen({ fd });
  return fd;
}

module.exports = {
  main,
  createServer, handle, frameFromUrl, watchOwnCode, watcherFactory, staleCodeFields, kernelFields,
  inheritedFd, listenOn,
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
  const state = createMemoryStore({
    snapshotPath: path.join(paths.stateDir(), 'daemon-state.json'),
    durableStore: require('../session-store'),
  });
  state.restore();

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
    process.exit(EXIT_STALE_CODE);
  };
  /** The request path's half: report, then die. */
  const onStaleCode = (verdict) => dieOnStaleCode(verdict);

  // 🛑 THE LIFECYCLE LIVES HERE, in the executable shell — not in the builder.
  //    A second instance must NOT start: the kernel already refused the address,
  //    and it is the authority on duplicates (never a PID file, never a probe).
  const laneFd = listenOn(createServer({
    store: state,
    freshness,
    onStaleCode,
    onAddressInUse: (err) => {
      // ⚠️ The kernel refused the address: a second instance. Say WHICH lane and
      //    WHY before dying, otherwise the supervisor's restart loop is the only
      //    symptom and it names nothing.
      lifecycle.record('bind-refused', { lane: 'port', host, port, pid: process.pid });
      throw err;
    },
  }), process.env, process.pid, port, host);
  // ⚠️ Recorded HERE, right after the listen call, and it says "we began serving"
  //    — not "the bind succeeded": `listen` reports its failure asynchronously,
  //    on the error path just above. Two records, two facts, never one guess.
  // 🛑 `uptimeMs` on every exit below is what makes the RATE readable without any
  //    counter to maintain: nine short lives in an hour ARE the nine lines, and a
  //    separate restart count would be a second truth that drifts from the file.
  lifecycle.record('start', {
    pid: process.pid,
    lane: laneFd === null ? 'port' : 'inherited-fd',
    port: laneFd === null ? port : null,
    fd: laneFd,
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
    createServer({ store: state, freshness, onStaleCode, onAddressInUse: (err) => { throw err; } }),
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
        lifecycle.record('bind-refused', { lane: 'rendezvous', code: e.code, pid: process.pid });
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
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => {
      // ⚠️ THE STATE FIRST, THE TRACE SECOND. Losing the snapshot costs
      //    re-deliveries; losing one journal line costs a diagnosis. Both are
      //    swallowed — housekeeping must never delay nor break a stop.
      try { state.flush(); } catch { /* housekeeping must never delay a stop */ }
      lifecycle.record('signal-exit', {
        pid: process.pid, signal, uptimeMs: Math.round(process.uptime() * 1000),
      });
      process.exit(0);
    });
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
