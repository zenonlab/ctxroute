---
match: http-server.js
scope: ["listen", "backlog", "ECONNREFUSED", "8787"]
mode: smart
threshold: 111
---
# The Windows accept-queue ceiling — MEASURED 2026-09-17, do NOT re-derive any of this

🛑 **EVERY NUMBER BELOW IS A MEASUREMENT ON THIS FLEET'S OWN MACHINE, never a blog post and never a
reasoning.** The method is the only door Microsoft leaves open: *"There is no standard provision to
obtain the actual backlog value"* (`winsock2/listen`, page revised 2024-02-22) — so the depth is
measured by BEHAVIOUR: a server that listens and then BLOCKS its loop, hammered with a burst, and
the count that gets queued before the first refusal IS the depth.

## The ceiling is 232 on this machine, and NOTHING moves it

| declared | measured depth |
|---|---|
| `511` (Node default) | **232** |
| `65535` (what `LISTEN_BACKLOG` declares) | **232** |
| `-65535` = `SOMAXCONN_HINT(65535)` | **232** |
| `setSimultaneousAccepts(true/false)` | **232** |

Stable across 12+ runs. 🔴 **`SOMAXCONN_HINT` IS THE DOCUMENTED ESCAPE HATCH AND IT DOES NOT REACH
THE KERNEL FROM NODE.** Microsoft: *"If set to SOMAXCONN_HINT(N) … the backlog value will be N,
adjusted to be within the range (200, 65535)"*. Node ACCEPTS the negative without throwing (measured
on v22.15.1 win32: `listen()` returns normally for `-65535`, `-511`, `0`, `2147483647`) and the depth
does not move.
🛑 **THIS IS NOT A CONTRADICTION OF THE MICROSOFT PAGE, AND MUST NEVER BE WRITTEN AS ONE.** That page
documents the Winsock C function `listen()`. What is measured here is the whole route
**JS → Node → libuv → `listen()`**, and the middle layer has NOT been inspected. Three candidates,
all still open: ① Node's JS layer normalises the value ② libuv's `uv_tcp_listen` clamps or replaces
it ③ the burst method measures something other than the backlog. ⚠️ **`http-lane.md` states "libuv
passes the RAW integer to `listen()`, verified at source" — that claim was INHERITED, not re-checked
here.** If it is wrong, the vendor doc is simply correct and our route is the defect. **Accusing a
third party's official documentation requires opening the layer in between; that has not been done.**
⇒ the honest status is: **the hatch does not work from Node on this machine. WHERE it dies is
UNKNOWN.**
## 🔑 THE MECHANISM, PROVEN BY TWO INDEPENDENT RUNTIMES — `depth = min(backlog, 200) + 32`

Low values separate "the ceiling is capped" from "the argument is inert", and the argument WORKS:

| declared | Node depth | .NET depth |
|---|---|---|
| 1 | 33 | — |
| 64 | 96 | **64** |
| 200 | 232 | **200** |
| 511 | 232 | **200** |
| 65535 | 232 | **200** |

⇒ **Windows caps the backlog at exactly 200** (the floor of its own documented `(200, 65535)` range)
and **libuv adds 32 on top** — its pre-posted `AcceptEx` requests, `uv_simultaneous_server_accepts`,
default 32, verified in `src/win/tcp.c`. .NET has no libuv, so it shows the raw value with no `+32`.
🔴 **THIS DECOMPOSITION WAS PROPOSED, THEN WRONGLY RETRACTED, THEN PROVEN — and the retraction is the
lesson.** It was thrown out because toggling `setSimultaneousAccepts` moved nothing; that test was
INVALID — libuv posts the accept requests AT `listen()` time and the toggle was applied AFTER. **A
true hypothesis was killed with a broken instrument**, which is worse than not testing it: it removed
correct knowledge and looked rigorous doing so. 🛑 Before retracting anything here, prove the
INSTRUMENT first.

## 🔴 AND THE HINT WORKS — OUTSIDE NODE. THE WALL IS OUR RUNTIME, NOT WINDOWS.

Same machine, same method, same second, `.NET` `Socket.Listen(int)` straight to Winsock:

| declared | .NET, long window | control |
|---|---|---|
| `65535` | 200 queued, **500 refused** | 200 queued, **1300 refused** (1,500 attempts) |
| `-65535` = `SOMAXCONN_HINT(65535)` | **700 queued, 0 refused** | **1500 queued, 0 refused** |

`pending = 0` on every row. ⇒ **Windows HONOURS `SOMAXCONN_HINT`; the Microsoft page is exact end to
end.** The same call from Node yields 232. **The negative is lost between JavaScript and `listen()`,
and WHERE is still UNKNOWN** — libuv's `uv_tcp_listen` passes the raw integer (read at source), so
the loss is above it. 🛑 Do not write a cause for that until someone has opened the layer.
⚠️ **THE CONTROL IS WHAT MAKES THIS A PROOF.** A first run showed `queued=479 refused=0` with **221
attempts UNRESOLVED** in a 2.5 s window, and that is NOT evidence: a full queue that makes callers
WAIT produces the same shape. It was briefly written up as proof anyway — the pleasing reading,
chosen because it was pleasing. The long window plus a positive control that STILL refuses is what
separates them. **Never accept a row carrying unresolved attempts.**

## 🔑 THE CEILING IS PER SOCKET, AND THAT IS THE WAY OUT

| listening sockets in ONE process | depth per socket | total |
|---|---|---|
| 1 | 232 | **232** |
| 2 | 232, 232 | **464** |
| 4 | 232, 232, 232, 232 | **928** |

**Strictly linear.** Windows caps ONE counter; it does not cap how many counters a process owns.
⇒ **SI you need more queue than 232, you DO NOT tune the backlog — you bind more ports and spread
the frame declarations across them.** The daemon already listens on two transports, so multiple
listeners is a shape the architecture has, not a new capability. And the wiring is a GENERATED
artefact (`wiring.json` → `wiring-generate.js`), so the spread is a CONFIG value: never N
hand-edited declarations, which is the 19-copies defect the generator exists to remove.

## Why this matters here — the production numbers, with their status

📐 **MEASURED against the LIVE daemon 2026-09-17** (`Get-NetTCPConnection -RemotePort 8787
-State Established`, sampled 105 times over 25 s): **MAX 32 simultaneous connections for ONE
session**, distribution `0 × 95 · 18 × 1 · 32 × 9`.
🔴 **THIS REFUTES THE BENCH'S `maxSimultaneous = 1`** quoted in `http-lane.md`. That bench pointed a
real client at a STUB ON ANOTHER PORT — its own declared limit — so the figure never described the
production path. **A green on a twin is not a green on the thing**, again.
⚠️ **THE LINK TO THE REFUSALS IS THE LEADING EXPLANATION, NOT A PROVEN CAUSE — say it that way.**
32 per session × 7 parallel sessions = **224, against a ceiling of 232**: the operator works ON the
cliff edge, which fits every observation (worse under parallel load, clean in normal use, a LIVE
socket refusing, no irreversible state transition, Windows-only). 🛑 What would PROVE it is a
burst reproducing `ECONNREFUSED` at a measured concurrency against the real daemon. Until then this
is the best-supported theory and must not be written as a fact.

## 🔴 IT WAS REPRODUCED BY ACCIDENT, AND THE OPERATOR IS THE ONE WHO SAW IT (2026-09-17)

While the benches above were running, the production daemon on port 8787 started refusing — bursts
of **14, 18, 20, 22 and 24** losses, i.e. 32-frame actions losing two thirds of their frames. The
agent was about to report "the phenomenon reproduced itself, free of charge"; **the operator said
plainly that it happened DURING the runs.** That is the correct reading, and it inverts the value of
the observation.
🔑 **THE BENCHES NEVER TOUCHED PORT 8787** (ports 19000-26000, a throwaway server). What they DID do
is open thousands of connections and run processes that **deliberately blocked their event loop for
4 seconds at a time**. ⇒ the daemon accepted more slowly, its 232-deep queue backed up, and a
32-frame action arriving as one block overflowed it. **That is an accidental REPRODUCTION of the
production defect, and it is the measurement the file was still missing.**
⚠️ **ELIMINATED AT THE SAME MOMENT, measured right after burning ~10,000 connections**: ephemeral
port exhaustion — **125 in use of 64,511**, 32 in `TIME_WAIT`. Windows recycles them fine. The
obvious contamination vector is dead, which is what makes the reproduction credible rather than
merely coincident.
🛑 **AND IT REFUTES A LINE IN `http-lane.md`**: *"a 150 s sustained CPU load (86 % peak, 26,000 page
faults/s) produced 0 losses — machine load is NOT the trigger"*. That test drove raw CPU. What bites
is **CONNECTION CHURN plus blocked event loops**, which is a different load entirely. ⇒ the honest
statement is *CPU load alone is not the trigger*, never *machine load is not the trigger*.
🛑 **THE METHOD RULE STANDS AND WAS BROKEN HERE**: never share a window between observation and
intervention. The agent could not separate its own traffic from the fleet's, and only the operator's
direct testimony resolved it. A passive observer (samples the kernel table, opens nothing) is the
shape that answers this without contaminating it.

## 🔴🔴 THE HYPOTHESIS IS DEAD — MEASURED AT THE SOURCE THE DAY IT WAS BUILT (2026-09-17)

The instrument was deployed and the daemon answered within the hour, during a live burst of
`ECONNREFUSED` on the operator's screen:

```
event=serve-stall elapsedMs=9365 bodyMs=9329 freshMs=0 handleMs=35 peakConn=32 openConn=7
```

**`peakConn = 32`.** That is the high-water mark over the whole life of the process, across a working
session with parallel tool calls. The accept queue measured above is **232**. ⇒ **the queue was never
within a factor of seven of overflowing, so it cannot be refusing anything.**

🔴🔴 **AND THAT BURIAL IS WITHDRAWN — MEASURED 2026-09-18, `peakConn = 254` AGAINST THE SAME 232.**
The daemon's own journal, twelve seconds before a live burst of three refusals:
`event=serve-stall elapsedMs=2140 bodyMs=2129 handleMs=10 peakConn=254 openConn=11`.
🛑 **THE IMPERATIVE THAT STOOD HERE — *"DO NOT REOPEN THE ACCEPT-QUEUE LEAD, not the backlog
constant, not `SOMAXCONN_HINT`, not N listening sockets"* — IS DELETED**, and it had to be: it was
an ORDER, injected at the gesture, resting on a premise this file itself now contradicts. It was
read out to the agent that was implementing the remedy, telling it to stop.
🔑 **THIS IS A WITHDRAWAL, NEVER A REVERSAL, and the distinction is the lesson**: `32` was REAL. It
simply measured a calm minute of one process. **A hypothesis buried on a single observation is
buried on nothing** — the identical mistake this very file records about "client age", made again,
in the file that records it.
✅ **WHAT THE 2026-09-18 NIGHT ADDS, and it is what makes the queue coherent again**: the refusal is
a CONNECT failure (`Microsoft-Windows-TCPIP` events `1046` then `1034`, 3 of 3, names resolved from
the provider manifest), the daemon was ALIVE throughout (same pid), and Microsoft documents the
signal exactly — *"If a connection request arrives and the queue is full, the client will receive an
error with an indication of WSAECONNREFUSED"*. ⚠️ **The queue being FULL at that instant was still
not OBSERVED** (no standard API exposes the depth): the chain is documented and coherent, and that
last link stays an inference, written as one.
⇒ **`http.listeners` is the remedy that follows**, per-socket capacity being the one measured lever
(232 · 464 · 928). 🛑 The backlog constant and `SOMAXCONN_HINT` stay DEAD from this runtime — that
half of the burial was measured and survives untouched.
🔑 **AND THE SAME LINE KILLS "32 × N parallel sessions" TOO**: this counter is the DAEMON's, so it
already counts every client process at once. Seven parallel sessions would read ~224 here. It reads
32.
✅ **WHAT THE MEASUREMENT COST, and it is the argument for building instruments instead of theories**:
one evening of benches produced a coherent, arithmetically exact, entirely WRONG story — ceiling 232,
7 sessions × 32 = 224, "the operator works on the cliff edge". One field at the source ended it in a
single line. **Three nights of reasoning, refuted by one number nobody had ever read.**
⚠️ **WHAT SURVIVES INTACT** is everything the benches measured about the PLATFORM — `min(backlog,200)
+ 32`, `SOMAXCONN_HINT` unreachable from Node, the per-socket linearity. Those are true facts about
Windows and they stay useful the day a real queue problem appears. They were simply never THIS
problem.
🔑 **AND THE REAL SHAPE IS UNCHANGED SINCE 2026-09-02**: the daemon is ALIVE, answers a probe with
`HTTP 200` at the same second, and spends 9.3 s waiting for a client body — while the harness's
connections are refused BEFORE reaching it. Cause still OPEN. Whoever picks this up: the instrument
is now in place, so start by reading `peakConn` rather than rebuilding a theory.

## What this does NOT license

🛑 **`LISTEN_BACKLOG = 65535` stays hygiene, NOT a remedy** — now measured, no longer argued: it
changes the depth by zero. Its retraction in `http-lane.md` was right about Windows; what that
retraction got wrong was reason ① (`maxSimultaneous = 1`), refuted above.
🛑 **Reducing the burst is still REFUSED** (fewer frames = a large skill no longer lands in one
gesture, which breaks the product's one promise).
✅ The two routes that remain, both ours, both config: **N listening ports** (measured above), or the
**`command` lane** (one process, no burst, the class absent by construction — how Codex runs).

## Sources
- [`listen` function (winsock2.h) — Microsoft Learn](https://learn.microsoft.com/en-us/windows/win32/api/winsock2/nf-winsock2-listen), page revised 2024-02-22 (read 2026-09-17)
