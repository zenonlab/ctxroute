---
match: state-client.js
mode: dumb
---
# state-client.js — the client side of the state authority

🛑 **`request`'s callback receives the KERNEL ERROR as its 2nd argument, and that argument is load-bearing.** Without it "nobody is listening" (`ECONNREFUSED`) and "something answered nonsense" both arrived as `null`, so any shell wanting to REPORT a refusal had to GUESS which — and a guess about a dead authority is exactly the inference this project forbids. Every pre-existing caller ignores the 2nd argument ⇒ behaviour byte-identical.
⚠️ **A refused connection is a FACT, not a liveness probe.** `ECONNREFUSED` comes back from the kernel INSTANTLY, with no timer and no polling: never add a delay to "confirm" it — that would turn an observation into a bet.
⚠️ **Fail-open, always**: unreachable authority ⇒ the caller decides WITHOUT state, never blocks and never throws at the harness.
⚠️ The daemon is ONE authority reached by N spawned clients; the kernel serialises its callers. Do NOT add a cross-process lock on this side — see `store-ownership.md`.
