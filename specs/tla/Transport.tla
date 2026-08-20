------------------------------ MODULE Transport ------------------------------
(***************************************************************************)
(* TRANSPORT FRONTIERS of the injection engine — TLA+ model.               *)
(*                                                                         *)
(* SCOPE, and it is a DECISION, not an omission: this models the FRONTIERS *)
(* only — leader election among N PARALLEL frame processes                 *)
(* (`src/pretool-core.js`), the emission queue producer/consumer across    *)
(* actions (`src/emission-core.js`), the cross-process lock (`src/lock.js`)*)
(* and the atomic state write (`src/session-store.js`).                    *)
(* The DECISION CORE (`gate.js`, `src/sources/*`) is DETERMINISTIC, hence  *)
(* race-free by construction — it is NOT specified here, and specifying it *)
(* would only model a pure function.                                       *)
(*                                                                         *)
(* THE ORDER OF THE THREE WRITES IS LOAD-BEARING, and it is the order of   *)
(* the shipped code (`pretool-core.js`, critical section):                 *)
(*     1. queue     (`emission.emit` -> persistQueue, `remainder-`)        *)
(*     2. state     (`store.saveState(STORE_PREFIX, ...)`, `doc-seen-`)    *)
(*     3. plan      (`store.saveState(PLAN_PREFIX, ...)`, `plan-`)         *)
(* PUBLISHING THE PLAN LAST is what makes a dead leader harmless for the   *)
(* OTHER processes: an unpublished plan makes every survivor recompute the *)
(* SAME thing by pure determinism, instead of half of them replaying a     *)
(* plan whose author never finished. NEVER reorder these three writes      *)
(* without re-running `npm run spec:tlc`.                                  *)
(*                                                                         *)
(* ABSTRACTION THAT CARRIES THE PROOF — NEVER WEAKEN IT SILENTLY:          *)
(* the chunk of a process that DIES is accounted in `lostToCrash` and      *)
(* excused by invariant (1). Reason, written not hidden: no harness        *)
(* acknowledges an injection, so no ordering of OUR writes can recover a   *)
(* frame whose carrier process no longer exists. What the framework does   *)
(* instead is make it VISIBLE (the seal announces `k/N`: a missing number  *)
(* tells the agent it was truncated) and the CANARY watches the channel    *)
(* from outside. Modelling it as a violation would make every config red   *)
(* for a hazard the code cannot answer, and a spec red on the unfixable    *)
(* stops being read. `lostToCrash` may ONLY ever grow on a crash action.   *)
(***************************************************************************)
EXTENDS Naturals, Sequences, FiniteSets

CONSTANTS
    OnceDocs,             \* cadence `once` — consumed, never re-decided
    DumbDocs,             \* cadence `dumb` — re-decided at EVERY action
    Frames,               \* PARALLEL frame processes per action (settings.json)
    MaxCrashes,           \* bound on modelled process deaths (keeps the model finite)
    MaxDelivered,         \* saturating delivery counter (keeps the model finite)
    LOCKLESS_EMPTY_STATE, \* SABOTAGE 1: the lock-less fallback decides with an EMPTY state
    ATOMIC_WRITE,         \* FALSE = SABOTAGE 2: the writer truncates the destination
    FALLBACK_WRITES,      \* TRUE  = SABOTAGE 3: the lock-less fallback WRITES
    SLOW_LEADER,          \* TRUE  = SABOTAGE 4: a leader outlives the lock timeout
    FALLBACK_DELIVERS_ONCE \* TRUE = SHIPPED. FALSE = the CANDIDATE FIX of the
                           \* duplicate window this spec found (see README).

Docs    == OnceDocs \cup DumbDocs
NoPlan  == << >>
NoOwner == 0
Procs   == 1..Frames

VARIABLES
    seen,           \* PERSISTED state (`doc-seen-`): docs recorded as decided
    pending,        \* value staged in the `.tmp` file, rename not done yet
    storeBusy,      \* TRUE between the tmp write and the rename
    queue,          \* the emission queue (`remainder-`), FIFO
    plan,           \* the split computed by the leader of the current invocation
    published,      \* TRUE once that plan reached the `plan-` store (3rd write)
    leadDone,       \* TRUE once a leader advanced the queue for this invocation
    lock,           \* NoOwner, or the index of the frame process holding it
    pcs,            \* per frame process: where it is in its life
    delivered,      \* how many times each doc actually reached the agent context
    crashes,
    lostToCrash,    \* DECLARED abstraction boundary (see header) — crash only
    outOfLockWrite, \* TRUE as soon as a state write happened WITHOUT the lock
    dualSplit,      \* TRUE if two DIFFERENT splits coexist for ONE invocation
    reDeliveredSeen,\* TRUE if the lock-less path re-delivered an ALREADY consumed doc
    everFallback,   \* anti-vacuity witness: the lock-less path was really taken
    everQueued      \* anti-vacuity witness: the queue really carried something

vars == << seen, pending, storeBusy, queue, plan, published, leadDone, lock,
           pcs, delivered, crashes, lostToCrash, outOfLockWrite, dualSplit,
           reDeliveredSeen, everFallback, everQueued >>

Min2(a, b) == IF a < b THEN a ELSE b
MinOf(S)   == CHOOSE x \in S : \A y \in S : x =< y

RECURSIVE SortSeq(_)
SortSeq(S) == IF S = {} THEN << >> ELSE LET m == MinOf(S) IN << m >> \o SortSeq(S \ {m})

ToSet(s)      == { s[i] : i \in 1..Len(s) }
Drop(s, n)    == IF Len(s) =< n THEN << >> ELSE SubSeq(s, n + 1, Len(s))
SliceOf(s, i) == IF Len(s) >= i THEN { s[i] } ELSE {}

(* Reading the store. A NON-atomic writer TRUNCATES the destination before   *)
(* filling it, so a concurrent reader gets an EMPTY object — and empty       *)
(* ASSERTS "nothing was ever injected". That is the measured hollow read.    *)
ReadSeen == IF storeBusy /\ ~ATOMIC_WRITE THEN {} ELSE seen

(* The pure gate: `dumb` docs are always fresh, `once` docs only while unseen.*)
(* Dedup against the queue mirrors `budget.orderSegments`.                    *)
FreshFrom(st)    == (DumbDocs \cup (OnceDocs \ st)) \ ToSet(queue)
SegmentsFrom(st) == queue \o SortSeq(FreshFrom(st))
FreshOnly(st)    == SortSeq(DumbDocs \cup (OnceDocs \ st))

DeliverSet(S) == [ d \in Docs |->
                    IF d \in S THEN Min2(delivered[d] + 1, MaxDelivered) ELSE delivered[d] ]

Init ==
    /\ seen = {}
    /\ pending = {}
    /\ storeBusy = FALSE
    /\ queue = << >>
    /\ plan = NoPlan
    /\ published = FALSE
    /\ leadDone = FALSE
    /\ lock = NoOwner
    /\ pcs = [ i \in Procs |-> "start" ]
    /\ delivered = [ d \in Docs |-> 0 ]
    /\ crashes = 0
    /\ lostToCrash = {}
    /\ outOfLockWrite = FALSE
    /\ dualSplit = FALSE
    /\ reDeliveredSeen = FALSE
    /\ everFallback = FALSE
    /\ everQueued = FALSE

(* ── lock.js: fs.mkdirSync is atomic — exactly one process wins ────────── *)
Acquire(i) ==
    /\ pcs[i] = "start"
    /\ lock = NoOwner
    /\ lock' = i
    /\ pcs' = [ pcs EXCEPT ![i] = "crit" ]
    /\ UNCHANGED << seen, pending, storeBusy, queue, plan, published, leadDone,
                    delivered, crashes, lostToCrash, outOfLockWrite, dualSplit,
                    reDeliveredSeen, everFallback, everQueued >>

(* ── lock.js: FAIL-OPEN timeout (2 s) → the lock-less fallback ──────────── *)
(* REACHABLE in the shipped design ONLY behind a DEAD holder: the critical   *)
(* section is microseconds long, the timeout is 2 s and the stale forcing    *)
(* 5 s, so the realistic contention is "the holder died". SLOW_LEADER = TRUE *)
(* drops that hypothesis and is a SABOTAGE config, never the default.        *)
Timeout(i) ==
    /\ pcs[i] = "start"
    /\ lock # NoOwner
    /\ (SLOW_LEADER \/ pcs[lock] = "dead")
    /\ pcs' = [ pcs EXCEPT ![i] = "fallback" ]
    /\ UNCHANGED << seen, pending, storeBusy, queue, plan, published, leadDone,
                    lock, delivered, crashes, lostToCrash, outOfLockWrite,
                    dualSplit, reDeliveredSeen, everFallback, everQueued >>

(* ── WRITE 1: the leader decides and advances the QUEUE ─────────────────── *)
Lead(i) ==
    /\ pcs[i] = "crit"
    /\ ~published
    /\ LET st   == ReadSeen
           segs == SegmentsFrom(st)
       IN /\ plan' = segs
          /\ queue' = Drop(segs, Frames)
          /\ pending' = seen \cup (OnceDocs \cap ToSet(segs))
          /\ everQueued' = (everQueued \/ Len(Drop(segs, Frames)) > 0)
    /\ leadDone' = TRUE
    /\ storeBusy' = TRUE
    /\ pcs' = [ pcs EXCEPT ![i] = "commit" ]
    /\ UNCHANGED << seen, published, lock, delivered, crashes, lostToCrash,
                    outOfLockWrite, dualSplit, reDeliveredSeen, everFallback >>

(* ── WRITE 2: session-store.js — the `rename` lands ─────────────────────── *)
Commit(i) ==
    /\ pcs[i] = "commit"
    /\ seen' = pending
    /\ storeBusy' = FALSE
    /\ pcs' = [ pcs EXCEPT ![i] = "publish" ]
    /\ UNCHANGED << pending, queue, plan, published, leadDone, lock, delivered,
                    crashes, lostToCrash, outOfLockWrite, dualSplit,
                    reDeliveredSeen, everFallback, everQueued >>

(* ── WRITE 3 (LAST): the plan becomes readable by processes 2..N ────────── *)
(* Any process that can no longer replay it (dead, already done, gone to the *)
(* fallback) loses its slice — declared, and only ever on a crash path.      *)
NeverEmits(j)  == pcs[j] \in { "dead", "done", "fallback" }
LostAt(sq)     == UNION { SliceOf(sq, j) : j \in { k \in Procs : NeverEmits(k) } }

Publish(i) ==
    /\ pcs[i] = "publish"
    /\ published' = TRUE
    /\ lock' = NoOwner
    /\ lostToCrash' = lostToCrash \cup LostAt(plan)
    /\ pcs' = [ pcs EXCEPT ![i] = "emit" ]
    /\ UNCHANGED << seen, pending, storeBusy, queue, plan, leadDone, delivered,
                    crashes, outOfLockWrite, dualSplit, reDeliveredSeen, everFallback, everQueued >>

(* ── pretool-core.js: processes 2..N RE-READ the leader's decision ──────── *)
Replay(i) ==
    /\ pcs[i] = "crit"
    /\ published
    /\ lock' = NoOwner
    /\ pcs' = [ pcs EXCEPT ![i] = "emit" ]
    /\ UNCHANGED << seen, pending, storeBusy, queue, plan, published, leadDone,
                    delivered, crashes, lostToCrash, outOfLockWrite, dualSplit,
                    reDeliveredSeen, everFallback, everQueued >>

(* ── crashes. `CrashInCrit` = before ANY write (nothing consumed, nothing  *)
(*    lost). `CrashAtCommit` = inside the tmp->rename window: with          *)
(*    ATOMIC_WRITE the destination is untouched, without it the truncated   *)
(*    destination SURVIVES empty. `CrashAtPublish` = state written, plan    *)
(*    never published. In both late cases the queue has ALREADY advanced    *)
(*    and no survivor will replay this plan, so the non-deferred segments   *)
(*    are lost with their carrier. The lock stays held — STALE_MS forces it.*)
LostPlanSegments == ToSet(plan) \ ToSet(queue)

CrashInCrit(i) ==
    /\ pcs[i] = "crit"
    /\ crashes < MaxCrashes
    /\ crashes' = crashes + 1
    \* If the plan is already PUBLISHED, this process was about to REPLAY it:
    \* its own slice dies with it. Otherwise it had written nothing at all.
    /\ lostToCrash' = lostToCrash \cup (IF published THEN SliceOf(plan, i) ELSE {})
    /\ pcs' = [ pcs EXCEPT ![i] = "dead" ]
    /\ UNCHANGED << seen, pending, storeBusy, queue, plan, published, leadDone,
                    lock, delivered, outOfLockWrite, dualSplit,
                    reDeliveredSeen, everFallback, everQueued >>

CrashAtCommit(i) ==
    /\ pcs[i] = "commit"
    /\ crashes < MaxCrashes
    /\ seen' = (IF ATOMIC_WRITE THEN seen ELSE {})
    /\ storeBusy' = FALSE
    /\ crashes' = crashes + 1
    /\ lostToCrash' = lostToCrash \cup LostPlanSegments
    /\ pcs' = [ pcs EXCEPT ![i] = "dead" ]
    /\ UNCHANGED << pending, queue, plan, published, leadDone, lock, delivered,
                    outOfLockWrite, dualSplit, reDeliveredSeen, everFallback, everQueued >>

CrashAtPublish(i) ==
    /\ pcs[i] = "publish"
    /\ crashes < MaxCrashes
    /\ crashes' = crashes + 1
    /\ lostToCrash' = lostToCrash \cup LostPlanSegments
    /\ pcs' = [ pcs EXCEPT ![i] = "dead" ]
    /\ UNCHANGED << seen, pending, storeBusy, queue, plan, published, leadDone,
                    lock, delivered, outOfLockWrite, dualSplit, reDeliveredSeen, everFallback,
                    everQueued >>

(* ── lock.js STALE_MS: a lock older than the staleness bound is forced ─── *)
ForceStale(i) ==
    /\ pcs[i] = "dead"
    /\ lock = i
    /\ lock' = NoOwner
    /\ pcs' = [ pcs EXCEPT ![i] = "done" ]
    /\ UNCHANGED << seen, pending, storeBusy, queue, plan, published, leadDone,
                    delivered, crashes, lostToCrash, outOfLockWrite, dualSplit,
                    reDeliveredSeen, everFallback, everQueued >>

Reap(i) ==
    /\ pcs[i] = "dead"
    /\ lock # i
    /\ pcs' = [ pcs EXCEPT ![i] = "done" ]
    /\ UNCHANGED << seen, pending, storeBusy, queue, plan, published, leadDone,
                    lock, delivered, crashes, lostToCrash, outOfLockWrite,
                    dualSplit, reDeliveredSeen, everFallback, everQueued >>

(* ── the frame reaches the agent's context ─────────────────────────────── *)
Emit(i) ==
    /\ pcs[i] = "emit"
    /\ delivered' = DeliverSet(SliceOf(plan, i))
    /\ pcs' = [ pcs EXCEPT ![i] = "done" ]
    /\ UNCHANGED << seen, pending, storeBusy, queue, plan, published, leadDone,
                    lock, crashes, lostToCrash, outOfLockWrite, dualSplit,
                    reDeliveredSeen, everFallback, everQueued >>

(* ── pretool-core.js: the LOCK-LESS fallback. It READS the state and       *)
(*    writes NOTHING; the queue is left INTACT (fresh only).                *)
(* ⚠️ `dualSplit` fires only when the holder is ALIVE: that is the only     *)
(*    case where two DIFFERENT splits of one invocation coexist while       *)
(*    nobody died. Behind a dead holder every survivor recomputes the SAME  *)
(*    fresh-only split by determinism — no reassembly hazard.               *)
(* ⚠️ `FALLBACK_DELIVERS_ONCE = TRUE` is the SHIPPED behaviour: the fallback *)
(*    delivers whatever the gate calls fresh, `once` documents included —    *)
(*    while recording NOTHING. That pair (deliver, do not record) is the     *)
(*    duplicate window this spec found; `TransportKnownDefect.cfg` holds its *)
(*    machine-checked counterexample. FALSE = candidate fix: the lock-less   *)
(*    path restricts itself to what needs no bookkeeping.                    *)
Fallback(i) ==
    /\ pcs[i] = "fallback"
    /\ LET st  == (IF LOCKLESS_EMPTY_STATE THEN {} ELSE ReadSeen)
           fsq == (IF FALLBACK_DELIVERS_ONCE
                   THEN FreshOnly(st)
                   ELSE SortSeq(DumbDocs))
           out == SliceOf(fsq, i)
       IN /\ delivered' = DeliverSet(out)
          \* Compared with the REAL state, never with the state it read: that
          \* is what makes SABOTAGE 1 (deciding on an empty state) visible.
          /\ reDeliveredSeen' = (reDeliveredSeen \/ (out \cap seen) # {})
          /\ IF FALLBACK_WRITES
             THEN /\ seen' = seen \cup (OnceDocs \cap ToSet(fsq))
                  /\ queue' = Drop(fsq, Frames)
                  /\ outOfLockWrite' = TRUE
             ELSE UNCHANGED << seen, queue, outOfLockWrite >>
    /\ dualSplit' = (dualSplit \/ (leadDone /\ lock # NoOwner /\ pcs[lock] # "dead"))
    /\ everFallback' = TRUE
    /\ pcs' = [ pcs EXCEPT ![i] = "done" ]
    /\ UNCHANGED << pending, storeBusy, plan, published, leadDone, lock,
                    crashes, lostToCrash, everQueued >>

(* ── next tool call: new invocation id ⇒ the memoized plan is gone ─────── *)
NextAction ==
    /\ \A i \in Procs : pcs[i] = "done"
    /\ lock = NoOwner
    /\ pcs' = [ i \in Procs |-> "start" ]
    /\ plan' = NoPlan
    /\ published' = FALSE
    /\ leadDone' = FALSE
    /\ UNCHANGED << seen, pending, storeBusy, queue, lock, delivered, crashes,
                    lostToCrash, outOfLockWrite, dualSplit, reDeliveredSeen, everFallback,
                    everQueued >>

Next ==
    \/ \E i \in Procs : \/ Acquire(i)      \/ Timeout(i)       \/ Lead(i)
                        \/ Commit(i)       \/ Publish(i)       \/ Replay(i)
                        \/ CrashInCrit(i)  \/ CrashAtCommit(i) \/ CrashAtPublish(i)
                        \/ ForceStale(i)   \/ Reap(i)          \/ Emit(i)
                        \/ Fallback(i)
    \/ NextAction

Spec == Init /\ [][Next]_vars /\ WF_vars(Next)

------------------------------------------------------------------------------
(*                              THE PROPERTIES                              *)
------------------------------------------------------------------------------

TypeOK ==
    /\ seen \subseteq OnceDocs
    /\ pending \subseteq OnceDocs
    /\ storeBusy \in BOOLEAN
    /\ lock \in ({NoOwner} \cup Procs)
    /\ delivered \in [ Docs -> 0..MaxDelivered ]
    /\ crashes \in 0..MaxCrashes

(* (1) A `once` document is NEVER consumed without being delivered.         *)
(*     "Delivered" includes IN FLIGHT: a deferred document sits in the      *)
(*     queue or in the plan of the running invocation — a DELAY, not a loss.*)
(*     `lostToCrash` is the DECLARED boundary of the header, and it can     *)
(*     only ever grow on a crash action.                                    *)
NeverConsumedWithoutDelivery ==
    \A d \in OnceDocs :
        d \in seen => \/ delivered[d] >= 1
                      \/ d \in ToSet(queue)
                      \/ d \in ToSet(plan)
                      \/ d \in lostToCrash

(* (2) The lock serializes the WRITES; the READ never needed it.            *)
NoWriteWithoutLock == outOfLockWrite = FALSE

(* (3) No duplicate: a `once` document reaches the context AT MOST once.    *)
(*     This is the invariant the 2026-08-07 orphan-chunk bug violated.      *)
AtMostOnceDelivery == \A d \in OnceDocs : delivered[d] =< 1

(* (3bis) The lock-less path NEVER re-delivers a document the state already *)
(*     records as consumed. THAT is the 2026-08-07 production bug, verbatim:*)
(*     the fallback decided with an EMPTY state, so an already delivered    *)
(*     `once` came back alone on its frame (orphan chunk). It is compared   *)
(*     against the REAL state, never against the state the fallback read.   *)
NeverRedeliverConsumed == reDeliveredSeen = FALSE

(* (4) ONE invocation, ONE split. Frames only reassemble if every process   *)
(*     of an invocation used the SAME segment sequence.                     *)
OneSplitPerAction == dualSplit = FALSE

(* (5) Anti-vacuity witnesses — each is NEGATED in a dedicated config,      *)
(*     the only way to prove the model exercises the path at all.           *)
NeverDelivers  == \A d \in Docs : delivered[d] = 0
NeverFallback  == everFallback = FALSE
NeverQueued    == everQueued = FALSE

(* (6) LIVENESS — a consumed `once` document ALWAYS ends up delivered.      *)
OnceProgress ==
    \A d \in OnceDocs : (d \in seen) ~> (delivered[d] >= 1 \/ d \in lostToCrash)

(* (7) ROTATION IS NOT STARVATION, and that distinction is the point.       *)
(*     A `dumb` corpus durably above capacity rotates FOREVER — correct by  *)
(*     definition (`dumb` = re-inject at EVERY action), nothing is lost.    *)
(*     `QueueEventuallyEmpty` is therefore FALSE for such a corpus, and the *)
(*     dedicated config REQUIRES it to be violated: that RED is the PROOF   *)
(*     that indefinite rotation is a real behaviour of the model. It        *)
(*     coexists with a GREEN `OnceProgress` — that is exactly the           *)
(*     difference between rotation (permitted) and starvation (forbidden).  *)
QueueEventuallyEmpty == <>[] (queue = << >>)
==============================================================================
