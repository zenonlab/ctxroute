---
match: [worker-pool-pure.js, worker-pool-pure.test.js, thread-listener.test.js, server-thread.js, thread-pool-differential.test.js]
mode: smart
threshold: 30
---
# multi-core — ONE THREAD, ITS OWN SOCKETS. And sockets are not threads.

🔴 **THE RECORDED ARCHITECTURE WAS NOT A MULTI-CORE DAEMON, AND THE OPERATOR IS WHO BROKE IT
(2026-09-19).** The plan said *"the main thread ACCEPTS, DECIDES and RESPONDS; a pool of workers
BUILDS"* — which keeps accept, parsing and the response on ONE thread. That is compute parallelism.
A real network daemon (nginx, HAProxy) has N workers that each **ACCEPT**. The question that
settled it was his: *"is it REAL multi-core, like a real HTTP daemon?"*

📐 **MEASURED, `test/thread-listener.test.js`, Windows, Node 22.15.1** — a worker thread **BINDS ITS
OWN listening socket and serves HTTP on it**; four threads take four ports, 4/4 answering; two
threads on the SAME port is **`EADDRINUSE`**. So `SO_REUSEPORT` (one port, N acceptors) is out here,
which was already measured as `ENOTSUP`, and **one socket per thread is the industry shape adapted
to the constraint** — exactly what nginx does where reuseport is unavailable.
⚠️ **SAME FORM ON THE THREE KERNELS, ZERO PLATFORM BRANCH**: `listen()` on different ports needs no
special API. On Linux/macOS `reusePort` would give ONE url instead of N — a **wiring convenience**,
never a parallelism gain. Do not present it as an obligation (that mistake was made and corrected
within the hour). Those two kernels are where this repository has measured NOTHING about threads,
which is why the cell above runs on the CI matrix instead of living in a scratch directory.

🔴 **SOCKETS AND THREADS ARE TWO NUMBERS — the operator's second correction, and today's production
is the proof**: four sockets, ONE thread (measured, a single `OwningProcess` on ports 8787-8790).
· a **SOCKET** buys ACCEPT QUEUE — 232 each on Windows, measured, strictly linear (1 → 232 ·
2 → 464 · 4 → 928), and it is the only lever that ever moved that ceiling.
· a **THREAD** buys PARALLELISM.
⇒ **SI you wire the pool, you MUST keep `http.listeners` and `workers` independent** and distribute
M sockets over N threads (`assignSockets`, socket `i` to thread `i % N`). Forcing them equal takes a
capacity away from both. The ONE constraint is `workers <= listeners`: a thread with no socket has
nothing to accept, and it is a NAMED REFUSAL, never a clamp — clamping starts a pool of a size
nobody declared.

🛑 **EXACTLY ONE PIECE OF WORK MAY LEAVE THE LOOP, AND THE REASON IS THE LOCK.** `pretool-core.run`
takes the cross-process lock and `lock.js` BUSY-WAITS, so an async critical section lets one request
hold the lock while another spins for the full deadline — a self-deadlock that reads as a slow
daemon. **The COLLECTION is outside that lock** (`pretool-core` calls `collect` before `withLock`)
and it is the expensive half. 🛑 SI you want to move anything else onto a thread, you MUST first
prove it is reached OUTSIDE `withLock`.
🔴 **HOW THE THREE INVOCATION TABLES ARE SHARED IS AN OPEN DESIGN FORK — NOT A WIRING DETAIL.**
The wiring sends frame `k` to port `k mod N`, so ONE action's 32 frames land on ALL the threads and
the tables MUST be reachable from all of them. 🔴 **MEASURED 2026-09-19, AND IT REFUTES WHAT THIS
DOC FIRST SAID**: a `Map` handed to a thread is **COPIED, never shared** — the worker writes an
entry and the main thread never sees it, each thread having its own V8 isolate. Only a
`SharedArrayBuffer` crosses (`Atomics.add` in the worker, the new value read from the main thread).
🛑 **SI you wire the tables, you MUST NOT simply pass them**, and the option you pick must keep the
handler SYNCHRONOUS: `carryover.pendingFor` is called INSIDE `withLock`, so an async round-trip
there is the self-deadlock forbidden above. The candidates and what separates them are in the
backlog under "MESURÉ LE 19/09" — none is chosen, and the one that looks most likely needs a
measurement first (what a synchronous thread round-trip really costs against the ~1.3 ms a
cross-process lock acquisition already costs).
⚠️ **AND IT DOES NOT REHABILITATE `cluster`, it buries it deeper**: N processes cannot even reach a
shared buffer. That is why it stays refused — N memories are N copies of the tables, i.e. the defect
measured the same morning (one table per socket ⇒ chunks 1-8 delivered FOUR times, chunks 9-17
never). The duplication was visible; the loss was not.

✅ **IT IS WIRED SINCE 2026-09-20 — AND THE MEASURED GAIN IS ZERO. SAY IT THAT WAY.**
N server threads each bind their own sockets and do all the expensive work of their requests; ONE
owner thread holds the store and the three invocation tables and answers synchronously; the main
thread is a client like any other. Proven byte-identical by `test/thread-pool-differential.test.js`.
📐 **THE BENCH, on a QUIET machine, 4 sockets, 8 frames per action, resident corpus, 1 thread against
4**: 61 KB corpus → 0.50x / 0.94x / 1.08x at 1, 4 and 8 parallel actions · 365 KB → 0.57x / 0.81x /
0.96x · 1,464 KB → 0.87x / 0.95x / 0.85x. ⇒ **the pool COSTS between 0 and 45 %; it buys nothing
here.** 🛑 Do not sell a gain, and do not quote the 2.22x an earlier pass produced: that pass ran
WHILE the heavy lane was saturating the machine — observation sharing a window with intervention,
the method rule this repository already records, broken on the most flattering number of the day.
🔴 **AND THE FIRST EXPLANATION OF THAT ZERO WAS AN INFERENCE, NOW REFUTED BY MEASUREMENT (same
day).** It read *"the resident corpus cache already removed the expensive half a pool was meant to
parallelise"* — plausible, written as an inference, and FALSE. 📐 **CPU asked of the OS, three
passes**: under the same load the SINGLE-threaded daemon burns **1,688 / 1,766 / 1,906 ms of CPU for
~1,700 ms of wall time — 1.0 CORE, saturated**, with eleven cores idle beside it. The POOLED one
burns **3,453 / 3,250 / 2,625 ms — 1.5 to 1.85 CORES**. ⇒ **the parallelism is REAL and it is
happening.** There IS expensive work, and the threads DO share it.
🔑 **SO THE ZERO IS NOT AN ABSENCE OF GAIN — IT IS A TAX THAT EQUALS THE GAIN, AND THE TAX HAS A
NAME**: the memoised PLAN crosses the channel as JSON **once per THREAD per action** (~365 KB on
that corpus), so four threads pay four serialisations where one thread paid none — the store used to
hand the very same object back by reference. That is where the second core goes.
✅ **THE REMEDY IS IDENTIFIED AND IT IS A SEPARATE CHANTIER, sized before being promised**: stop
sending the PLAN and send the FRAME — the owner splits once and answers "frame k of this invocation"
(~7.7 KB instead of ~365 KB, about forty times less across the wire). 🛑 It moves the split INTO the
owner, i.e. back onto a serialisation point, so it must be MEASURED before it is believed: ~1.7 ms
of split once per action against ~45 ms of JSON saved, on this corpus. Neither number is a promise.
🔴 **AND THE TAX WAS NOT WHERE THIS FILE SAID IT WAS — MEASURED 2026-09-20, AND THE REMEDY IT NAMED WAS THE WRONG ONE.** The paragraph above prescribed sending the FRAME instead of the PLAN, on the premise that the plan crossed "once per THREAD per action". **That premise was the client memo's own comment, and it was false.** Driven through a REAL owner thread with the production interleaving — 32 frames, each READING the plan then WRITING its `doc-seen-` — the reading was **0 memo hits out of 32**: the plan crossed **32 times, 9.78 MB per action**. The memo is discarded WHOLE on every generation bump and every frame bumps it, so it never answered once. The 365 KB per thread was an under-estimate by a factor of eight, and the remedy aimed at the wrong half. ✅ **FIXED WITHOUT TOUCHING THE SPLIT OR THE BOUNDARY**: the owner now keeps a monotonic STAMP per key (`store.stampOf`), and a reader whose generation has moved asks for that stamp — a few bytes — instead of re-fetching. **MEASURED after: 28 hits of 32, 4 crossings, 1.22 MB, and the action's wall time 82.8 ms → 41.9 ms.** 🛑 **A FIRST ATTEMPT FROZE THE PLAN CLASS OUTRIGHT and the suite REFUSED it**, correctly: it rested on "a plan key is written at most once", which the owner script disproves in three lines, and cell ⑧ caught the routed path answering differently from the in-line one. **An invariant that is ASSUMED rather than sealed is the second memory this design exists to remove** — the stamp asks instead, so it cannot answer differently by construction. ⚠️ Sending the FRAME instead of the PLAN is therefore **no longer the next step**: re-measure before reopening it, because the baseline it was sized against has moved twice in one day (this, and the 35 MB snapshot that was blocking the loop 183 ms).
⚠️ **AND `http-lane.md`'S SENTENCE STAYS TRUE WHERE IT WAS WRITTEN**: *"more CORES change nothing —
waiting is not computing"* is about the `ECONNREFUSED` class, where 100 % of the elapsed time is the
CLIENT's body. It is NOT a verdict on a daemon that is CPU-saturated, which this one measurably is.
Two different questions; do not quote one for the other.
🛑 **SOCKET ACTIVATION + A POOL IS A NAMED REFUSAL TO START**: serving an INHERITED descriptor from a
worker thread is UNMEASURED on every kernel here. Exit condition, written so it can be closed: measure
`listen({fd})` from a worker on the three kernels, then delete the refusal in that same gesture.

⚠️ **DEFAULT `0` — NO POOL, i.e. today's behaviour BYTE FOR BYTE.** `auto` follows nginx's published
convention and resolves to HALF the cores, capped at 8: this daemon shares its machine with the
harness, sixteen MCP servers and the agents themselves, so taking every core starves the very
clients it serves.
🛑 **THE ACCEPTANCE CRITERION IS THE FACADE, NOT THE SPEED** (operator, binding): identical to the
BYTE for the agents, the inside free. And never sell threads as the cure for the `ECONNREFUSED` —
those come from a slow CLIENT, established on 200 stalls where 100 % of the time is the body wait.
