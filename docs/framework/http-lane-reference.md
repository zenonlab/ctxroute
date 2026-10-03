---
inject: never
---
# http lane — THE INVESTIGATION, KEPT WHOLE. Not injected, never lost.

🛑 **WHY THIS FILE EXISTS, AND WHAT IT IS NOT.** `http-lane.md` had grown to 64,929 c —
nine frames of an agent's budget, re-injected on five different files. The doctrine's own
line settles what to do with that: *"Récit/exemples → `*-reference.md`/backlog/memory ;
jamais un invariant."* So the NARRATIVE lives here, `inject: never`, and every PRESCRIPTION
went to the doc of the file it actually governs.
🛑 **NOTHING WAS REMOVED.** This is not "splitting a doc to make it fit" — that is forbidden
and it is not what happened. Every measurement, every retracted conclusion, every eliminated
hypothesis below is here verbatim, with its date and its figure. What changed is that an
agent editing one file no longer receives four other files' history.
⚠️ **READ THIS BEFORE RE-OPENING ANYTHING about connection loss on the `http` lane.** Its
value is exactly the hypotheses it KILLS: each one cost a night.

---

## 2026-09-18 — the falsifier fired, and the daemon is implicated

The 2026-09-17 conclusion (*"the stall lives in the CLIENT, not the daemon"*) named its own
condition of death: *"re-open ①②③ instantly if a future incident's OWN daemon log shows the
daemon itself busy/blocked at the moment of refusal."* It did.

Refusal bursts from the harness's own `~/.claude/debug/hooks-*.log`, correlated against the
first daemon record carrying a loop reading after each burst, over the 32 minutes since
`loop-block` went live: **5 bursts, 5 beside a loop PEAK of 122-261 ms, ZERO beside an idle
loop.** The exonerating bucket is EMPTY.

```
11:50:10  12 refusals -> +10 s  loop-block  peak 261 ms
12:02:03   6 refusals -> +41 s  loop-block  peak 122 ms
12:06:41   5 refusals -> +44 s  loop-block  peak 214 ms
12:21:06  10 refusals -> +31 s  loop-block  peak 180 ms
12:21:30   7 refusals ->  +8 s  loop-block  peak 180 ms
```

`serve-stall` could never have seen it: its threshold is 1 s, and a 260 ms block is a tenth
of that. The whole class lived BELOW the only instrument that was watching.

🛑 **WHAT BLOCKS IS ONLY PARTLY NAMED.** `daemon-state.json` weighs 6.79 MB and is rewritten
WHOLE and SYNCHRONOUSLY every 64 mutations on that thread: 36 ms median (`JSON.stringify`
25 ms + write 10 ms, five runs, 34-40 ms). A third of the smallest peak. **The remaining
70-220 ms are UNMEASURED** — do not write a chain that reaches them.
⚠️ The design hole behind the 36 ms: that store's ceiling bounds the NUMBER OF KEYS (4096 +
2048), never the BYTES, and the snapshot is rewritten in full. 1,862 entries = 6.79 MB.

🔴 **AND THE SATURATION FIRST REPORTED THAT DAY WAS THE INSTRUMENT ITSELF — RETRACTED THE
SAME HOUR.** An `xperf` capture with `-stackwalk` on every file operation reported the
daemon's thread at 98-99 % of one core during the failure window. `ntkrnlmp.exe!
EtwpTraceStackWalk` was **85.28 %** of those samples: the stack-walker, not the daemon.
⚠️ **The failure rate was IDENTICAL with and without the trace** (2.24 % with no capture,
2.0 % with the most expensive one), so the observer does not CREATE the defect — it had only
polluted the CPU ATTRIBUTION. What survives untouched is the context-switch data, which costs
no stack walk: the thread was **neither preempted nor waiting**.

---

## 2026-09-17 — the three candidates, walked exhaustively

① **Client-side retry-with-backoff.** Inapplicable: the client on `http` declarations is
Claude Code's own binary, confirmed never to retry (`anthropics/claude-code` #29963, closed
NOT_PLANNED). We do not own that code.
② **Move to the `command` lane and write our own retrying client.** Real, and it closes the
gap FOR THAT LANE, but cannot rescue `http` traffic: a hook's transport is fixed at
declaration time, there is no runtime fallback from one hook type to another.
③ **Windows named pipe + `WaitNamedPipe`.** REJECTED, and worth remembering hardest: it is
NOT a different fix, it is the SAME fix (widen how long a caller waits) wearing another
transport. Also unusable for the native `http` hook type, which requires a URL.

🔴 **THE FOURTH CANDIDATE — THE ACCEPT QUEUE — was refuted, then the refutation was itself
withdrawn.** `LISTEN_BACKLOG = 65535` was shipped and self-corrected hours later on three
measurements: `maxSimultaneous = 1`, 650/650 timeouts never refusals, and "511 broke once,
600 passed" being a coincidence read as a law. Then `peakConn = 254` against a queue measured
at 232 withdrew the burial. **A hypothesis buried on a single observation is buried on
nothing** — the same lesson this investigation already recorded about "client age".

🛑 **ON WINDOWS THE BACKLOG IS INOPERANT BY CONSTRUCTION.** libuv passes the RAW integer to
`listen()`; the only way past Winsock's ~200 is `SOMAXCONN_HINT(b)` = `(-(b))`, a NEGATIVE
value. Measured from Node: 511, 65535 and -65535 all yield depth 232, stable over 12+ runs.
The same call from .NET yields 700-1500. **The negative is lost between JavaScript and
`listen()`, and WHERE is still unknown.** Detail: `accept-queue-ceiling.md`.

---

## 2026-09-18 — the failure is a full accept queue, documented

**3 refusals out of 3**, named by the provider's own manifest (`Microsoft-Windows-TCPIP`):
for client ports 29958 · 29970 · 29969, all toward 8787, **`1046` = "connection terminating:
RETRANSMISSION TIMEOUT EXPIRED"** then ~50 µs later **`1034` = "connect attempt FAILED"**.
Microsoft, `listen` (winsock2.h), read 2026-09-18: *"If a connection request arrives and the
queue is full, the client will receive an error with an indication of WSAECONNREFUSED."*

🛑 **`pktmon` CANNOT DIAGNOSE THIS AND LOOKS AUTHORITATIVE DOING SO**: it logs only what the
stack DISCARDS. A refusal is a SYN and an RST delivered successfully. PROVEN: a deliberate
connection left ZERO `Flags [S]` in a capture running `--capture --pkt-size 0`.
✅ **What replaces it**: the ETW provider at stack level, armed only AFTER catching a
MANUFACTURED refusal (connect to a closed port) — 24,561 TCP events, 1,794 naming the witness
port. **A trap is armed only after it catches a witness of the class it hunts.**

⚠️ **STILL UNPROVEN**: 301 packets toward the daemon advertising `win 0` — a saturated
receiver ordering the sender to stop. The 37,282 `duplicate segment` drops are ordinary TCP
keep-alive probes; the 1,391 `checksum is invalid` and the 232 `session state error` peak at
DIFFERENT minutes and explain nothing. Treat all three as BYSTANDERS.

---

## The rate is the observable, never the red line

📐 **2026-09-17, four live sessions on `10.87.87.1`**, `200`-responses against `HTTP hook
error` lines: `2026-09-16` 16h 544 POSTs 0.0 % · 17h 2,111 0.8 % · 18h 4,094 0.5 % · 19h
2,944 0.7 % · 20h 288 0.0 % · `2026-09-17` 03h 2,560 0.6 % · 14h 508 2.0 % · 15h 708 0.0 % ·
15h 3,539 0.3 % · 16h 1,696 0.5 % · 17h 544 0.6 %.

📐 **The LOOPBACK curve, for comparison**: 0.0 · 0.0 · 0.0 then **16.1 %**, and NEVER back
below 3.9 % (4.6, 6.1, 9.3, 24.7) — an irreversible transition, *"there is an AFTER"*.

🔴 **THIS IS WHY THE 2026-09-17 NIGHT WENT WRONG**: a 0.5 % background and a 16 % collapse
look IDENTICAL on screen — the same red lines, in bursts, while the operator works. An agent
reading the SCREEN hunted a defect that no longer existed.

⚠️ **CONSEQUENCE**: the test *"restart the daemon while fresh clients are losing"* has lost
its premise on this address — there is no losing STATE to sit in the middle of. It stays
valid ONLY if a future session measures a rate that CLIMBS and does not come back.

---

## 2026-09-03 — the loss class was left behind by changing address

Two sessions re-read the wiring mid-life and POSTed to BOTH addresses, same client, same
load, same machine: `127.0.0.1` **2,061 failures / 14,777**; dedicated adapter **128 /
15,712, ALL 128 inside the 24-second switch-over window, ZERO outside**. A later session:
**3 h 18, 8,015 POSTs, ZERO** — past the two-hour threshold under which the loss had never
appeared.

**Cause**: libuv calls `WSAIoctl(SIO_TCP_INITIAL_RTO, MaxSynRetransmissions=0)` whenever the
destination passes `uv__is_loopback()`, a LITERAL byte test, so Windows never retransmits a
lost SYN there. Leaving that range does not DEFEAT the test, it **leaves the domain where it
applies** — never call it a workaround. Windows only. Detail: `adapter-windows.md`.

⚠️ An earlier count of "24 `read ECONNRESET`" does NOT reproduce on that log. A failed
reproduction is not a refutation: the honest status is **not found**. ⚠️ And the
"observability hole" claimed beside it was FALSE, retracted the same day by LOOKING: the
lifecycle journal was alive all along at the declared `stateDir`. **An absence asserted is
not an absence measured** — that one shipped into a backlog as a priority.

---

## 2026-09-02 — the night the mechanism was captured

🔑 **16:19:06 UTC, four witnesses, one second**: 32 POSTs issued, **31 LOST (97 %)**. Machine
at that exact second: 3,006 MB free · CPU 30 % · disk queue 0 · disk latency 0 ms · page
faults 0 · pagefile motionless. The daemon received **NOTHING** — no `serve-stall`: it was
not slow, it was never reached. ⇒ CPU load, memory pressure, paging, disk and the daemon all
ELIMINATED at the same instant. A 150 s sustained CPU load (86 % peak) produced **0 losses**.

🔑 **What actually happens, and it needs no crash**: the kernel reports 650 of 650 *"connect
attempt timed out"*, never *"refused"*; local ports strictly consecutive (102 gaps of 1 out
of 112). The client only needs a micro-stall of a few hundred ms — ordinary, and normally
INVISIBLE because the kernel retransmits. `uv__is_loopback()` removed that net.

✅ **THE REPRODUCER, the single most useful outcome of that night**: six concurrent writers ×
25 back-to-back rounds × 32 connections = **4,800 connections in 3.5 s against the LIVE
daemon → 235 failures, 4.9 %**. A single 512-connection burst does NOT reproduce it, nor does
600; what does is **SUSTAINED OVERLAPPING bursts with no gap**. ⚠️ Re-measured 2026-09-18:
SEQUENTIAL bursts from one process produce **zero** — the overlap is the whole trigger.

✅ **THE ZERO-TOKEN CLIENT BENCH**: `ANTHROPIC_BASE_URL` points a REAL Claude Code client at a
local stub speaking the Messages SSE protocol; fabricated `tool_use` blocks drive REAL hooks,
subagents and MCP servers for no tokens. It established two facts no document had: *"HTTP
hooks are not supported for SessionStart"* (the client says so in `--debug hooks`), and
`maxSimultaneous = 1` across 32 frames, 6 parallel tool calls, 4 subagents, 21,500 requests.
🛑 **That second figure was later REFUTED for the production path**: it was measured against a
STUB ON ANOTHER PORT. `Get-NetTCPConnection` against the real daemon read **32 simultaneous**.
**A green on a twin is not a green on the thing.**

⚠️ **UPSTREAM #17711 matches the story but not the marker**: *"the CLI accumulates context and
enters a degraded state"*, with a comment measuring 110 % idle CPU. Here sessions aged 15-24 h
measured **0.3-3 %**. And the remedy failed: every CLI restarted at 15:20, and within the hour
those brand-new clients lost 31 of 992 (3.1 %) and 59 of 480 (12.3 %). ⇒ the state does NOT
live in the client process.

---

## 🔴 METHOD — paid four times in one night, read before writing another conclusion here

Four claims were engraved in this file and retracted within the hour: *"something
accumulates"* · *"recovery is spontaneous"* · *"closing Opera fixed it"* · *"the backlog
threshold is 511"*. Causes, each one reusable:

- counting **LOSSES** instead of **RATES**;
- reading a clean window **without its denominator** (every quiet gap held ZERO POSTs — an
  idle operator, not a recovery);
- reading **one coincidence as a law** (511 broke once, 600 then passed);
- **measuring while perturbing** — the agent's own 4,800-connection burst produced the losses
  it then attributed to the operator's browser.

⇒ **Aggregate first, engrave last. Never share a window between observation and intervention.
A symptom matching a story is not a measurement.**

⚠️ **Eliminated the same night, with figures**: ephemeral-port exhaustion (45 ports of
64,511) · the daemon as a resource hog (ONE process, 88 MB, against 67 MCP servers totalling
2.8 GB) · a fixed backlog threshold.

🛑 **NOT MEASURED, never quote it as a fix**: the IPv4-mapped form `::ffff:127.0.0.1` (its
`Word[5]` is `0xffff` so the loopback loop returns 0). Binding a ROUTABLE LAN address would
also skip the ioctl and is REFUSED as a default: it publishes `/emit`, `/purge` and `/turn`
to the whole network.

⚠️ **AND THE LOSS IS A WINDOWS BEHAVIOUR.** libuv's `src/unix/tcp.c` (675 lines) contains
NOTHING about retransmission, RTO or loopback, and `SIO_TCP_INITIAL_RTO` is a WINSOCK ioctl.
⇒ Linux and macOS retransmit normally. 🛑 That the lane is *in fact* reliable there is
DEDUCED from absent code, never from a burst run there — **the cheapest decisive measurement
still outstanding.**

---

## Parallelism is not the trigger — do not spend a session forcing it

Attempted ON DEMAND with the packet trap armed: 16 then 21 parallel tool calls in one
message, mixing shells, searches and lookups — roughly 672 hook connections. **ZERO
refusals.** ⚠️ That is NOT a refutation and must never be written as one: a defect is engraved
on REPRODUCTION, its absence never is. The honest status is **not reproduced on demand to
date**, and the standing correlation is TIME-IN-SESSION, never volume — sessions carrying
thousands of POSTs lost zero while a 448-POST session lost 9.
