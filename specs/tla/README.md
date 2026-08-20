# `specs/tla` — TLA+ spec of the TRANSPORT FRONTIERS

Doctrine: *"non-serialized concurrency on shared mutable state ⇒ TLA+ + trace validation +
negative-check"*. Here the **decision core is deterministic**, hence race-free by construction and
deliberately **out of scope**. What is specified is the **frontiers around it**.

Run it: `npm run spec:tlc` (Java ≥ 8; `tla2tools.jar` v1.7.4 is downloaded on demand, SHA-256
pinned, never committed).

## What is modelled

| Spec (action)                       | Code                                                                    |
|-------------------------------------|-------------------------------------------------------------------------|
| `Acquire` / `Timeout` / `ForceStale`| `src/lock.js` — atomic `mkdir`, 2 s fail-open timeout, `STALE_MS` forcing |
| `Lead` (write 1)                    | `pretool-core.js` → `emission.emit` → `persistQueue` (`remainder-`)       |
| `Commit` (write 2)                  | `session-store.saveState(STORE_PREFIX, …)` — tmp + `rename`              |
| `Publish` (write 3, LAST)           | `session-store.saveState(PLAN_PREFIX, …)` — the memoized plan            |
| `Replay`                            | `pretool-core.js` — frames 2..N re-read `cache.segments`                 |
| `Fallback`                          | `pretool-core.js` — the `if (!res)` branch: reads the state, writes nothing |
| `Emit`                              | the frame text handed to the shell's `emit`                              |
| `CrashInCrit` / `CrashAtCommit` / `CrashAtPublish` | a frame process dying (OOM, kill, `deadline.js`)      |

**The order of the three writes carries the proof.** Publishing the plan LAST is what makes a dead
leader harmless to the other processes: an unpublished plan makes every survivor recompute the SAME
split by pure determinism, instead of half of them replaying a plan whose author never finished.
That order is sealed, on the code side, by the drift shield in `test/transport-spec-gate.test.js`.

## What is NOT modelled, and why it is written here

A process crashing **strictly after** its writes and **before** its text reaches the harness is
accounted in `lostToCrash` and excused by invariant (1). **No harness acknowledges an injection**,
so no ordering of our writes can recover a frame whose carrier process no longer exists. The
framework answers that hazard elsewhere: the seal announces `k/N` (a missing number tells the agent
it was truncated) and the canary watches the channel from outside. Modelling it as a violation would
make every configuration red for something the code cannot answer — and a spec that is red on the
unfixable stops being read. **`lostToCrash` may only ever grow on a crash action.**

## The properties

1. `NeverConsumedWithoutDelivery` — a `once` document is never consumed without being delivered
   (delivered, or in flight: in the queue or in the plan). A remainder is a **delay**, never a loss.
2. `NoWriteWithoutLock` — the lock serializes the **writes**; the **read** never needed it.
3. `AtMostOnceDelivery` — a `once` document reaches the context at most once. **Currently a
   declared debt, see below.**
4. `OneSplitPerAction` — every process of one invocation uses the same segment sequence, otherwise
   the frames do not reassemble.
5. `OnceProgress` (liveness) — a consumed `once` document always ends up delivered.
6. `QueueEventuallyEmpty` — **deliberately FALSE** for a `dumb` corpus above capacity, see below.

## The run matrix — `runs.json` is the single source

`run-tlc.mjs` **generates** every `.cfg` from `runs.json` and demands the exact verdict declared
there. The gate is **two-way**: a run expected RED that turns green fails just as loudly as a green
that turns red — either the spec stopped biting (a hollow spec: the worst failure mode, a green that
sees nothing) or the engine was fixed and the check must move into the baseline. Both need a human
decision. **Never edit `expect` to silence a run.**

| Run | Verdict required | What it proves |
|---|---|---|
| `Transport` | GREEN | the design as shipped, safety + liveness |
| `TransportKnownDefect` | RED `AtMostOnceDelivery` | **the defect found on 2026-08-20** (below) |
| `TransportCandidateFix` | GREEN | a sufficient exit from that defect exists |
| `TransportLocklessEmpty` | RED `NeverRedeliverConsumed` | sabotage 1 — the 2026-08-07 production bug |
| `TransportNoAtomic` | RED `AtMostOnceDelivery` | sabotage 2 — a truncating (non-atomic) write |
| `TransportFallbackWrites` | RED `NoWriteWithoutLock` | sabotage 3 — the lock-less path writing |
| `TransportSlowLeader` | RED `OneSplitPerAction` | sabotage 4 — a leader outliving the timeout |
| `TransportVacuityDeliver` | RED `NeverDelivers` | anti-vacuity: the model really delivers |
| `TransportVacuityFallback` | RED `NeverFallback` | anti-vacuity: the lock-less path is reachable |
| `TransportVacuityQueue` | RED `NeverQueued` | anti-vacuity: the queue really carries something |
| `TransportRotation` | RED `QueueEventuallyEmpty` | rotation is a real behaviour, and it is correct |

**Never delete the sabotage, anti-vacuity or rotation runs.** A gate never seen refusing is a gate
*assumed* to work.

## Rotation is not starvation

A `dumb` corpus durably above capacity delivers **in rotation, indefinitely**: the queue never stays
empty. That is **correct** (`dumb` = re-inject at every action), nothing is lost, and it must not be
"fixed". `TransportRotation` requires `QueueEventuallyEmpty` to be **violated** — that red is the
proof the behaviour is real — while `OnceProgress` stays GREEN in `Transport.cfg`. Rotation is
permitted; starvation is not. The same distinction is observed on the real engine by
`test/transport-conformance.test.js`.

## 🔴 What the spec FOUND — a duplicate window in the design as shipped (2026-08-20)

TLC counter-example, replayed on the real engine and reproduced in
`test/transport-conformance.test.js`:

1. a frame process holds the lock and dies inside the critical section (nothing written);
2. another process times out (2 s) and takes the **lock-less fallback**. It reads the state —
   correctly empty — and **delivers** a fresh `once` document. It writes nothing, as invariant (2)
   requires;
3. at the next action the leader reads the state, still empty, decides the same `once` document is
   fresh, and **delivers it a second time**.

The 2026-08-07 fix closed *"already delivered → re-emitted"*; this is the same duplicate reached by
the opposite door: **the lock-less path delivers without recording**. Bounded to one extra delivery
(the leader does record it). `TransportCandidateFix` shows that restricting the lock-less path to
what needs no bookkeeping restores `AtMostOnceDelivery` without costing `NoWriteWithoutLock` or
liveness — but **the decision belongs to the maintainer**: this is a spec, not an engine change.

## Anchoring to the code (what replaces a state-by-state replay)

The fleet's dispatcher writes every micro-step to disk, so its states are observable and TLC can
re-check a recorded trace. **Here they are not**: the frame processes are short-lived and only the
three store writes survive them. Fabricating the missing states in order to "replay" them would be
checking the spec against a transcript we wrote ourselves — proving `x === x`. So the anchor is
made of two mechanical pieces, both in `test/`:

* the **drift shield** on the write order and on the lock-less branch (`transport-spec-gate.test.js`,
  with an in-memory negative-check);
* the **behavioural replay** of the model's predictions on the real engine
  (`transport-conformance.test.js`): the control, `NoWriteWithoutLock`, the found defect, and
  rotation-without-starvation.

Said plainly rather than dressed up as something stronger.
