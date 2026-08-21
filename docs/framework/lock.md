---
rules: [{"pattern":"lock.js","scope":["ctxroute"],"exclude":["package-lock.json"]},{"pattern":"lock.test.js","scope":["ctxroute"]}]
mode: dumb
rank: 366
---
# lock.js — invariants

⚠️ REAL BUG ALREADY LIVED THROUGH (15/07/2026): `fs.mkdirSync(lockDir)` WITHOUT `{recursive:true}` on the PARENT folder fails with `ENOENT` (not `EEXIST`) on a fresh checkout where `state/` does not exist yet — invisible locally (folder already created by previous runs), broke in CI. The fix creates the parent chain upfront (`recursive:true`, idempotent, concurrency-safe) BEFORE the atomic acquisition attempt.
NEVER delete the `lock.test.js` "fresh checkout" test (folder `TMP_ROOT` never created before the test) — it is the only test that would have caught this bug.
`withLock` is FAIL-OPEN on timeout (`fallback`) — NEVER block the hook indefinitely over lock contention.
`CTXROUTE_LOCK_TIMEOUT_MS` = env RESERVED FOR TESTS (19/07/2026, paths.js doctrine): concurrency tests raise the timeout to prove ATOMICITY independently of load (2 s legitimately expiring under load = intended fail-open, not a bug). NEVER a user setting — prod = 2000 ms.
STALE_MS forces an abandoned lock (dead process) — without it a crash in a critical section would block that lock forever.
🔴 **AND `STALE_MS` IS AN INFERENCE ABOUT DEATH — NAMED AS SUCH ON 2026-08-21, NOT PATCHED.** "Older than 5 s ⇒ the holder is dead" is a guess, and forcing the lock on it lets a SECOND writer in while the first is merely descheduled: a lost update, silently, exactly when the machine is saturated — i.e. exactly when hundreds of agents run. 🛑 It is also **the only clock comparison used as a liveness verdict in all of `src/`, and the temporal budget cannot see it**: `rules/temporal-call.yml` detects CALLS (`setTimeout`, `Atomics.wait`), never an `if (Date.now() - x > y)`. ⚠️ Do NOT rustproof it here: under the state daemon **there is no lock at all** — the kernel serialises its callers, which is the whole point of `kernel-state.md`. Its address is the switch-over, not a probe.
