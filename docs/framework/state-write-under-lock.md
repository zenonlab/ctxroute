---
match: state-write-under-lock-gate.test.js
mode: dumb
---

# state-write-under-lock-gate — the queue invariant is no longer carried by prose

- 🔑 **WORK ITEM 58 IS ANSWERED: the cross-process lock MUST exist.** The critical section is a **leader election + memoized plan** across N parallel frame processes (one decides and writes, the others read the plan back), never a per-doc counter — so decomposing state per doc would NOT remove it. It already uses the OS primitive (atomic `mkdir`): nothing is reimplemented.
- 🛑 **SCOPE = WRITES ONLY.** Reading never needed the lock, and putting `{}` back on the lockless path was a real production bug (orphan chunk). Do not widen this gate to reads.
- ⚠️ **DERIVED from the SHAPE of a write** (`ast-grep`, never regex), so a writer added tomorrow is covered the day it is written. The rule ALSO matches `.emit(` — that half is what makes the `emission-core.js` exemption TRUE rather than trusted.
- ⚠️ **An ALIAS that hides a write is FLAGGED, and that is intended** (it bit on `legacy-mcp-inject.js`): once a write sits behind an indirection, its safety can no longer be read at the call site. Justify it or unwrap it.
- 🛑 **EXEMPTION = the caller holds the lock, or a RELIC — with the reason.** The INVERSE part turns red as soon as an exemption stops being needed. Never list a LIVE unlocked writer.
- ⚠️ `ast-grep scan` **exits non-zero on any match**: that is a FINDING, not a tool failure — read stdout, never let it throw, or every defect would be reported as "tool broken".
