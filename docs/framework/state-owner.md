---
match: [thread-channel-pure.js, owner-ops.js, owner-client.js, state-owner-thread.js, state-owner-entry.js, thread-boot.js, state-owner-thread.test.js]
mode: smart
threshold: 30
---
# state-owner — ONE memory, asked from another thread, synchronously

🔴 **WHY IT EXISTS, MEASURED 2026-09-19: a `Map` handed to a worker is COPIED, NEVER SHARED.** Each
thread is its own V8 isolate; only a `SharedArrayBuffer` crosses. The frame sequencer's whole
premise — in its own header — is *"the daemon is a SINGLE PROCESS that sees every connecting request
of one invocation"*, and N threads each holding their own tables make that premise FALSE while
looking exactly as if it held. The cost was measured the day before on the socket side: one document
of 17 chunks over 32 frames, at 4 sockets, had chunks 1..8 delivered FOUR TIMES and chunks 9..17
delivered NEVER. **The duplication was visible; the loss was not.**

🛑 **THE ASKING IS SYNCHRONOUS AND THAT IS A REQUIREMENT, not a style.** `pretool-core` calls
`carryover.pendingFor` INSIDE `withLock`, and `lock.js` BUSY-WAITS: an asynchronous round trip there
lets one thread hold the lock while another spins for the whole deadline — a self-deadlock that
reads as a slow daemon. 📐 Measured: one blocking round trip costs **1.48-1.65 µs** against
**~1,300 µs** for ONE acquisition of the cross-process lock this daemon already pays, so routing a
whole action (32 frames × 3 operations) costs **0.15 ms against ~133 — 0.11 %**.

🔴 **A BARE `Atomics.wait` BLOCKS FOR EVER ON ONE MISSED WAKE-UP** — it hung a probe for ten minutes
on 0.4 s of CPU. ⇒ **SI you write any wait here, it must be BOUNDED *and* RE-CHECK in a loop**: the
bound turns *"I was not woken"* into *"look again"*, it buys no speed, and its exhaustion is a NAMED
refusal (`undecidable`, `temporal-budget.json`). 🛑 The owner reads the DOORBELL **before** scanning:
reading it after is the classic lost wake-up.

🛑 **THE OWNER IS NEVER THE MAIN THREAD**, and the main thread is a CLIENT like every other
participant (slot 0, for the rendezvous lane). An owner on the main thread would make a blocked
server thread wait for a whole turn of the event loop instead of a futex wake — and getting work off
that loop is the entire purpose. One authority, no exception: the day one participant answers
locally, there are two memories again.

🔑 **ONE BODY, TWO CALLERS — that is what `owner-ops.js` is for.** With no pool the main thread CALLS
those functions; with a pool the owner APPLIES the very same ones. ⇒ **SI you add a table or store
operation, you MUST add it to `OP_NAMES`** (closed vocabulary, fail-closed dispatch) **and say
whether it INVALIDATES** — the client's read memo is dropped whenever the shared generation moves,
which is what makes a memo fail towards a round trip instead of towards a second memory.

🛑 **A PAYLOAD ABOVE THE SLOT IS A NAMED REFUSAL, NEVER A TRUNCATION** (4 MB against a measured
313 KB plan). Half a plan reads exactly like a whole one. The only clamped thing is a REFUSAL
MESSAGE, because a slot too small to carry a plan can be too small to carry the sentence about it.

⚠️ **A THREAD CANNOT KILL THE PROCESS**: `process.exit()` in a worker ends the WORKER. A stale-code
verdict is POSTED to the main thread, which exits 90 as it always has — and every exit path first
asks the owner to SAVE and waits for its `DRAINED` flag, or the most frequent death of this daemon
would lose the arrival order of every invocation in flight while looking perfectly clean.
