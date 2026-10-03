---
match: [split-scope-pure.js, split-scope.test.js]
mode: smart
threshold: 30
---
# split-scope-pure.js — an action is SPLIT once, never once per frame

🔴 **MEASURED 2026-09-19, AND IT IS THE THIRD FLOOR OF THE SAME STAIRCASE.** `freshness-scope-pure`
stopped the daemon re-verifying its own code per frame; `collect-scope-pure` stopped it
re-collecting the corpus per frame. The SPLIT of that corpus was still recomputed by every one of
the 32 frames: **`budget.planFrames` called 32 times for ONE action**, `budget.js` accounting for
**26.7 % of the daemon's CPU** and its `fingerprint` alone for **16.3 %** (V8 CPU profile, real
corpus, 193,495 characters delivered per action).
✅ **MEASURED AFTER, A/B on the real server, twice each arm**: **180/186 ms → 128/131 ms per
action**, 32 real splits → **2**, and every delivered body IDENTICAL — one SHA-1 over the sorted
responses of every action, the same digest in all four runs.

🔑 **WHY THE RECOMPUTATION EXISTS, and it must NOT be "fixed" on the other lane.** The split is
deterministic BY DESIGN so that N separate PROCESSES agree on it without coordinating: on the spawn
lane the frames really are N processes with no shared memory, and determinism is what replaces an
authority there. The daemon is ONE process with ONE memory, so every recomputation past the first is
inherited waste — and only a LONG-LIVED process can know that two requests belong to one action.
🔑 **WHY IT IS NOT A LATENCY QUESTION**: the daemon is SINGLE-THREADED, so every millisecond here is
a millisecond it accepts nobody and does not drain its sockets — and Windows then refuses
connections on a server that is perfectly alive (`http-lane.md`). Same reasoning, same measured
effect, as the two floors below.

🛑 **SI you add a caller of `split`, you MUST key it on the INPUTS and never on the invocation.**
`pretool-core` has THREE: the deciding frame, the replay of frames 2..N, and the CARRYOVER — which
splits the plan of a **DIFFERENT** invocation. An invocation key would file one action's frames under
another's name, and the failure is silent and wrong CONTENT. Keyed on what the function is a
function of, a wrong guess can only ever MISS, i.e. recompute, i.e. yesterday's behaviour.
🛑 **SI you touch `signature`, everything the split depends on MUST still reach the hasher** — the
frame count, the budget, the segment count, then each id and each text. Anything left out is a fact
two different emissions may disagree on while sharing an answer, i.e. one action served the other
one's frames. The encoding is **LENGTH-PREFIXED**, so it is self-delimiting: concatenating id and
text makes `{a, bc}` and `{ab, c}` hash alike, and a separator CHARACTER would only be as safe as
the assumption that no document contains it. A count cannot be forged.
🛑 **AND THE FUNCTION IS MADE TOTAL BY ONE MECHANISM, NEVER TWO.** The first version guarded the
hasher's shape AND wrapped it in a catch that answered the same: **17 mutants survived, every one
equivalent by construction**. A test written for an absorbed guard freezes dead code for ever — the
remedy is to delete the guard. What is left is observable, one case each, and a `Set` of valid
segments is the case that earns the array check its place.
🛑 **THE HASHER IS INJECTED, NEVER IMPORTED.** This module stays pure and dependency-free — the
purity rule forbids it `node:crypto` too — and the shell that owns I/O is the one allowed to own a
hash. That is also what lets every branch be driven deterministically in a test.

🛑 **FAILS TOWARDS MORE WORK, NEVER TOWARDS WRONG FRAMES**: no table, no usable hasher, a malformed
segment, or an eviction ⇒ an empty signature, which matches nothing ⇒ SPLIT. A caller unable to
produce a key keeps the historical behaviour BYTE FOR BYTE, which is what leaves the spawn lane and
every differential untouched (extension contract §6).
⚠️ **CEILING 16, LOWER THAN `collect-scope`'s 64 ON PURPOSE**: an entry holds the COMPOSED FRAMES of
an action — 193,495 characters measured — where a collection entry holds the bodies once. The live
set is a handful: the client opens at most one connection at a time.
⚠️ **TWO REAL SPLITS PER ACTION REMAIN, DECLARED**: `emission-core.emit` calls its own local
splitter on the deciding frame, so only the 31 REPLAYS go through the memo. Closing that last one
means routing `emit` through the injected split as well — measured at ~3 % of the gain, not taken.
