------------------------------- MODULE State -------------------------------
(***************************************************************************)
(* THE STATE PROTOCOL — DOES A RECORDED DELIVERY EVER GET LOST?            *)
(*                                                                         *)
(* SCOPE, AND IT IS A DECISION. `Transport.tla` specifies the DELIVERY     *)
(* frontier: leader election among frame processes, the `remainder-`       *)
(* queue, the split. This module specifies the DURABILITY frontier that    *)
(* sits under it: several processes performing a read-modify-write on the  *)
(* SAME durable key, and the question the operator asks of it —            *)
(*                                                                         *)
(*     once a delivery has been RECORDED, can that record disappear?       *)
(*                                                                         *)
(* WHAT IS MODELLED, MEASURED IN THE CODE ON 2026-08-23 AND NOT ASSUMED:   *)
(*                                                                         *)
(*  · `memory-store.js` forwards the DURABLE class (`doc-seen-`,           *)
(*    `turn-count-`, `remainder-`) to `session-store.js` — the write-      *)
(*    through of 2026-08-22. The daemon therefore writes THE SAME FILES    *)
(*    a spawned hook writes. Only `plan-` stays in RAM, and losing it      *)
(*    costs a recomputation, never a record: it is out of scope.           *)
(*  · `session-store.saveState` is tmp + `rename`. That is why a Commit    *)
(*    below is ONE step: no torn write exists, so nothing is ever corrupt. *)
(*    What can be lost is an UPDATE, never a byte.                         *)
(*  · `lock.js` is an atomic `mkdirSync` around the read-modify-write,     *)
(*    at the address `store-resolve.docLockDir` / `turnLockDir`.           *)
(*  · `lock.js` STALE_MS forces a lock it BELIEVES abandoned. That is an   *)
(*    INFERENCE about death, so it is modelled as pure nondeterminism —    *)
(*    a held lock may simply be taken. THERE IS NO CLOCK IN THIS MODULE,   *)
(*    and there must never be one: a delay is not part of this protocol.   *)
(*  · the daemon dies BY DESIGN at every edit of the repository            *)
(*    (`watchOwnCode`, exit 90) and is restarted by the OS.                *)
(*  · `ctxroute-reset.js` purges at PreCompact, and it takes NO LOCK       *)
(*    (measured: neither the shell nor `session-store.purgeByPrefix`       *)
(*    mentions `withLock`).                                                *)
(*                                                                         *)
(* WHAT IS DELIBERATELY NOT MODELLED, SAID HERE RATHER THAN DISCOVERED:    *)
(*                                                                         *)
(*  · WHICH record a writer decides to produce. `r \notin committed` in    *)
(*    `Enter` makes each record be produced ONCE, by one writer. This spec *)
(*    asks whether a produced record SURVIVES; whether the decision to     *)
(*    produce it is itself race-free is `Transport.tla`'s                  *)
(*    `AtMostOnceDelivery`, and duplicating it here would be a second      *)
(*    truth about one fact.                                                *)
(*  · the fail-open lock TIMEOUT. A writer that cannot take the lock       *)
(*    writes nothing and delivers only what needs no record                *)
(*    (`gate.injectLockless`) — it can therefore neither lose nor create a *)
(*    record. Its delivery semantics belong to `Transport.tla`.            *)
(*  · LIVENESS. `NeverStuckLock` exhibits the stuck state as a reachable   *)
(*    FACT instead; the fail-open timeout that resolves it in production   *)
(*    is one layer up.                                                     *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
    Writers,          \* the processes that record: the daemon and its spawned peers
    Records,          \* the deliveries to be recorded (doc-seen- / turn-count- / remainder- entries)
    USE_LOCK,         \* TRUE  = the read-modify-write runs under `store-resolve.docLockDir`
                      \* FALSE = the daemon routes of 2026-08-22, before the fix
    STALE_FORCING,    \* TRUE  = the PRE-2026-08-23 `lock.js`: a HELD lock may be forced on a
                      \*         CLOCK, i.e. on an INFERENCE about death. Still the shape of
                      \*         residual ②, where no holder pid was ever recorded.
    KERNEL_FORCING,   \* TRUE  = the design SHIPPED on 2026-08-23: a held lock is forced ONLY
                      \*         when its holder is PROVABLY dead. `lock.js` asks the kernel
                      \*         (`process.kill(pid, 0)` -> ESRCH); the model asks `alive`.
    SLOT_PER_WRITER,  \* TRUE  = each writer owns its own file, the readable state is the union
                      \*         (the commutative, lock-free design of tomorrow)
                      \* FALSE = one shared file, replaced whole (today, and every design where
                      \*         commuting OPERATIONS are persisted by replacing a shared VALUE)
    MaxPurges,        \* bound: compactions
    MaxDeaths         \* bound: daemon deaths

VARIABLES
    disk,             \* [Slots -> SUBSET Records] — what `state/` holds
    pc,               \* [Writers -> {"idle","crit"}]
    snap,             \* [Writers -> SUBSET Records] — what the writer READ
    rec,              \* [Writers -> Records \cup {NoRec}] — what it is about to record
    lockOwner,        \* Writers \cup {NoOwner} — the `.lock-doc-*` directory
    committed,        \* SUBSET Records — every record whose write COMPLETED, this epoch
    forced,           \* BOOLEAN — has anybody ever entered a lock that was HELD?
                      \*   ANTI-VACUITY ONLY. A run enabling a forcing rule that never FIRES
                      \*   would prove the design safe over executions that never exercise it.
                      \*   Saturating (a flag, never a counter) so it costs no state space.
    alive,            \* [Writers -> BOOLEAN]
    purges,
    deaths

vars == <<disk, pc, snap, rec, lockOwner, committed, forced, alive, purges, deaths>>

\* ⚠️ PLAIN STRINGS, NOT `CHOOSE x : x \notin S` — TLC refuses an UNBOUNDED
\*    `CHOOSE` and dies before generating a single state. `Writers` and `Records`
\*    are MODEL VALUES in every `.cfg`, and a model value never equals a string,
\*    so these two are distinct from every element by construction.
NoOwner == "no-owner"
NoRec   == "no-record"

\* ONE SHARED FILE, OR ONE FILE PER WRITER. This single boolean is the whole
\* difference between the two questions the operator asked, and nothing else in
\* the module branches on it.
Shared == "shared"
Slots     == IF SLOT_PER_WRITER THEN Writers ELSE {Shared}
SlotOf(w) == IF SLOT_PER_WRITER THEN w ELSE Shared

\* What a READER of the state sees. With one file it is that file; with one file
\* per writer it is their union — which is what makes the disjoint design a
\* join-semilattice, hence order-independent.
Readable == UNION { disk[s] : s \in Slots }

-----------------------------------------------------------------------------

Init ==
    /\ disk = [s \in Slots |-> {}]
    /\ pc = [w \in Writers |-> "idle"]
    /\ snap = [w \in Writers |-> {}]
    /\ rec = [w \in Writers |-> NoRec]
    /\ lockOwner = NoOwner
    /\ committed = {}
    /\ forced = FALSE
    /\ alive = [w \in Writers |-> TRUE]
    /\ purges = 0
    /\ deaths = 0

(***************************************************************************)
(* THE LOCK, AND THE ONE PLACE STALE_MS LIVES.                             *)
(* Without the lock, anybody enters. With the lock, only a free lock lets   *)
(* you in — UNLESS forcing is enabled, in which case a HELD lock is simply  *)
(* taken. That is `lock.js`'s STALE_MS with the clock removed: "older than  *)
(* 5 s therefore dead" is a GUESS, and the sound abstraction of a guess is  *)
(* nondeterminism, never a timer.                                          *)
(***************************************************************************)
CanEnter(w) ==
    \/ ~USE_LOCK
    \/ lockOwner = NoOwner
    \* THE INFERENCE (pre-2026-08-23): a held lock is taken whoever holds it.
    \/ STALE_FORCING
    \* THE KERNEL'S ANSWER (shipped 2026-08-23): a held lock is taken ONLY when
    \* its holder is PROVABLY dead. In the code that proof is `ESRCH`; here it
    \* is `~alive`. 🛑 `lockOwner # NoOwner` is NOT redundant with the disjunct
    \* above: `alive[NoOwner]` is undefined and TLC may evaluate any disjunct.
    \/ (KERNEL_FORCING /\ lockOwner # NoOwner /\ ~alive[lockOwner])

(***************************************************************************)
(* READ, then DECIDE, then leave the critical section open. The snapshot    *)
(* taken here is the one the write below is built from — the window.        *)
(***************************************************************************)
Enter(w, r) ==
    /\ alive[w]
    /\ pc[w] = "idle"
    /\ r \notin committed
    /\ CanEnter(w)
    /\ lockOwner' = IF USE_LOCK THEN w ELSE lockOwner
    /\ snap' = [snap EXCEPT ![w] = disk[SlotOf(w)]]
    /\ rec' = [rec EXCEPT ![w] = r]
    /\ pc' = [pc EXCEPT ![w] = "crit"]
    /\ forced' = IF USE_LOCK /\ lockOwner # NoOwner THEN TRUE ELSE forced
    /\ UNCHANGED <<disk, committed, alive, purges, deaths>>

(***************************************************************************)
(* THE WRITE IS ONE STEP BECAUSE tmp + rename MAKES IT ONE. A reader never  *)
(* sees a half file, so no state between "old value" and "new value" exists *)
(* to be modelled. The record counts as COMMITTED here — before this step a *)
(* crash loses nothing, because nothing was recorded.                       *)
(*                                                                          *)
(* 🛑 THE WHOLE VALUE IS REPLACED. That is what `saveState` does, and it is  *)
(*    why a commutative OPERATION does not save a shared FILE: the loss is  *)
(*    in the read-modify-write, not in the order of the operations.         *)
(***************************************************************************)
Commit(w) ==
    /\ alive[w]
    /\ pc[w] = "crit"
    /\ disk' = [disk EXCEPT ![SlotOf(w)] = snap[w] \cup {rec[w]}]
    /\ committed' = committed \cup {rec[w]}
    /\ pc' = [pc EXCEPT ![w] = "idle"]
    /\ rec' = [rec EXCEPT ![w] = NoRec]
    /\ lockOwner' = IF USE_LOCK /\ lockOwner = w THEN NoOwner ELSE lockOwner
    /\ UNCHANGED <<snap, forced, alive, purges, deaths>>

(***************************************************************************)
(* THE DAEMON DIES — the NORMAL regime, not an incident: every edit of this *)
(* repository makes it exit. Its in-flight critical section is abandoned.   *)
(* 🛑 `lockOwner` IS UNCHANGED ON PURPOSE: the `.lock-doc-*` DIRECTORY      *)
(*    SURVIVES THE PROCESS. That is the fact STALE_MS exists to answer, and *)
(*    `NeverStuckLock` is what exhibits it.                                 *)
(***************************************************************************)
Die(w) ==
    /\ alive[w]
    /\ deaths < MaxDeaths
    /\ alive' = [alive EXCEPT ![w] = FALSE]
    /\ deaths' = deaths + 1
    /\ pc' = [pc EXCEPT ![w] = "idle"]
    /\ rec' = [rec EXCEPT ![w] = NoRec]
    /\ UNCHANGED <<disk, snap, lockOwner, committed, forced, purges>>

(***************************************************************************)
(* AND IT COMES BACK WITH `disk` UNTOUCHED. That is the write-through of    *)
(* 2026-08-22 stated as a formula: the daemon owns nothing, so its death    *)
(* costs latency and never a memory. An OWNING daemon would clear the       *)
(* durable state here, and every run below would go red.                    *)
(***************************************************************************)
Revive(w) ==
    /\ ~alive[w]
    /\ alive' = [alive EXCEPT ![w] = TRUE]
    /\ UNCHANGED <<disk, pc, snap, rec, lockOwner, committed, forced, purges, deaths>>

(***************************************************************************)
(* COMPACTION. The real context is emptied, so the memory of what was       *)
(* injected into it no longer describes anything: `disk` and `committed`    *)
(* go together. 🛑 NO LOCK IS TAKEN, and that is MEASURED, not assumed —    *)
(* neither `ctxroute-reset.js` nor `session-store.purgeByPrefix` takes one. *)
(***************************************************************************)
Purge ==
    /\ purges < MaxPurges
    /\ purges' = purges + 1
    /\ disk' = [s \in Slots |-> {}]
    /\ committed' = {}
    /\ UNCHANGED <<pc, snap, rec, lockOwner, forced, alive, deaths>>

Next ==
    \/ \E w \in Writers : \E r \in Records : Enter(w, r)
    \/ \E w \in Writers : Commit(w)
    \/ \E w \in Writers : Die(w)
    \/ \E w \in Writers : Revive(w)
    \/ Purge

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
(***************************************************************************)
(* THE PROPERTIES                                                          *)
(***************************************************************************)

TypeOK ==
    /\ disk \in [Slots -> SUBSET Records]
    /\ pc \in [Writers -> {"idle", "crit"}]
    /\ snap \in [Writers -> SUBSET Records]
    /\ rec \in [Writers -> Records \cup {NoRec}]
    /\ lockOwner \in Writers \cup {NoOwner}
    /\ committed \subseteq Records
    /\ forced \in BOOLEAN
    /\ alive \in [Writers -> BOOLEAN]
    /\ purges \in 0..MaxPurges
    /\ deaths \in 0..MaxDeaths

(***************************************************************************)
(* ① THE OPERATOR'S QUESTION, VERBATIM: no RECORDED delivery is ever lost.  *)
(* A violation is a LOST UPDATE — the 209 out of 800 measured on 2026-08-23 *)
(* — and it is silent by construction: nothing is corrupt, a fact is simply *)
(* no longer there, so the document goes out a second time.                 *)
(***************************************************************************)
NoLostRecord == committed \subseteq Readable

(***************************************************************************)
(* ② THE OTHER DIRECTION: the disk holds nothing that was not committed in  *)
(* THIS epoch. It is violated by a write that crosses a PURGE — a writer    *)
(* whose snapshot predates the compaction republishes it. The consequence   *)
(* is the mirror image of ①: a `doc-seen-` record resurrected after a       *)
(* compaction WITHHOLDS a document that was owed.                           *)
(***************************************************************************)
NoResurrection == Readable \subseteq committed

(***************************************************************************)
(* ③ MUTUAL EXCLUSION. Green where the lock is taken and not forced; RED    *)
(* everywhere else — which is also this module's anti-vacuity floor: it is  *)
(* what proves two writers really do overlap in the runs that must survive  *)
(* the overlap.                                                             *)
(***************************************************************************)
AtMostOneInCrit == Cardinality({w \in Writers : pc[w] = "crit"}) <= 1

(***************************************************************************)
(* ANTI-VACUITY. Each of these MUST be violated in its declared run — a     *)
(* green that explored nothing is this repository's worst failure mode, and *)
(* a formal spec is the easiest place in the world to build one.            *)
(***************************************************************************)
NeverCommits == committed = {} /\ Readable = {}
NeverPurges  == purges = 0

(***************************************************************************)
(* ANTI-VACUITY OF THE FORCING RUNS, AND IT IS NOT OPTIONAL. StateKernel-   *)
(* Forcing claims that taking a lock whose holder is PROVABLY dead loses    *)
(* nothing. That green is worth NOTHING unless forcing actually FIRES in    *)
(* that configuration — otherwise the run would only be saying "we never    *)
(* forced anything", which is true of the design that deadlocks too.        *)
(***************************************************************************)
NeverForced == ~forced

(***************************************************************************)
(* THE DILEMMA STATED AS A REACHABLE FACT, not as prose: a lock DIRECTORY   *)
(* held by a process that no longer exists. Without STALE forcing this      *)
(* state is reachable and permanent (availability lost until the fail-open  *)
(* timeout upstairs); with it, `NoLostRecord` breaks (safety lost). The     *)
(* code has no third answer today, and neither does this spec.              *)
(***************************************************************************)
NeverStuckLock == ~(lockOwner # NoOwner /\ ~alive[lockOwner])

=============================================================================
