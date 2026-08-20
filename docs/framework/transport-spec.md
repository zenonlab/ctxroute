---
match: [Transport.tla, runs.json, run-tlc.mjs, transport-spec-gate.test.js, transport-conformance.test.js, transport-spec-tlc.test.js]
mode: dumb
---
# specs/tla/ — TLA+ spec of the TRANSPORT FRONTIERS (2026-08-20)

⚠️ **SCOPE IS A DECISION**: leader election among N parallel frame processes (`pretool-core.js`), the `remainder-` queue (`emission-core.js`), the lock (`lock.js`), the atomic write (`session-store.js`). The DECISION CORE (`gate.js`, `sources/*`) is DETERMINISTIC ⇒ never specified — it would model a pure function.
⚠️ **THE ORDER OF THE THREE WRITES CARRIES THE PROOF**: queue → state → plan. Publishing the plan LAST is what makes a dead leader harmless to the survivors (they recompute the same split by determinism instead of half-replaying an unfinished plan). Reordering ⇒ update `Transport.tla` AND re-run `npm run spec:tlc`. Sealed by the drift shield in `transport-spec-gate.test.js`.
🔴 **THE SPEC FOUND A REAL DEFECT — do NOT "fix" the test that witnesses it.** The lock-less fallback DELIVERS a fresh `once` document and RECORDS NOTHING (it must not write), so the next action's leader re-decides it as fresh and delivers it a SECOND time. Carried by `TransportKnownDefect.cfg` (required RED) + the witness cell of `transport-conformance.test.js`. `TransportCandidateFix.cfg` proves a sufficient exit exists. The day the engine changes, BOTH flip together and BOTH must be updated in the same move.
⚠️ **DECLARED ABSTRACTION BOUNDARY**: a process dying AFTER its writes and BEFORE its text reaches the harness is `lostToCrash` — no harness acknowledges an injection, so no ordering of our writes can recover it. Made visible by the seal (`k/N`) and watched by the CANARY. NEVER widen `lostToCrash` beyond crash actions.
⚠️ **NEVER remove the sabotage runs, the 3 anti-vacuity runs or the ROTATION run.** The rotation RED is what distinguishes a `dumb` corpus above capacity (rotates for ever, CORRECT) from starvation (forbidden). A gate never seen red is a gate ASSUMED to work.
⚠️ **`runs.json` = SINGLE SOURCE**: the `.cfg` files are GENERATED (gitignored). The gate is TWO-WAY — an expected RED that turns green fails just as loudly as a green that turns red. NEVER edit `expect` to silence a run.
⚠️ `tla2tools.jar` v1.7.4, SHA-256 pinned, downloaded on demand, NEVER committed. Java ≥ 8 (measured working on 1.8). Java absent ⇒ the TLC cell skips BY NAME; the artifact cell never skips.
