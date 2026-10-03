---
match: [http-lane-differential.test.js]
mode: smart
threshold: 30
---
# http-lane-differential.test.js — the two lanes answer the SAME bytes, or one of them is wrong

🛑 **THIS IS THE ONLY THING THAT MAKES THE `http` LANE SAFE TO WIRE.** The daemon is not a rewrite: it serves the SAME gate over a socket. The response JSON comes from `doc-inject.output()`, the very function the spawn lane uses — so the ONE question this suite exists to answer is *do both lanes emit the same bytes for the same payload?* 🛑 If you change an output format, this differential and `pretool-differential` both get re-run; green on one proves nothing about the other.
🛑 **THE COMPARISON IS BYTE-FOR-BYTE, AND THE ONE DECLARED EXCEPTION IS ANCHORED.** `differential-normalize.withoutDeliveryNotice` strips exactly ONE suffix, with its `·` separator, because the delivery notice is DAEMON-ONLY by construction: only the daemon sees every connecting request of one invocation, and the `command` lane's N processes are independent. Every OTHER badge stays byte-strict. ⚠️ A blind erasure of `systemMessage` would let a real regression through — that is why the strip is anchored and why it has its own negative-check.
⚠️ **SEEN RED ON A SHIFTED FRAME** — that is the proof it discriminates. A differential never seen failing is a differential ASSUMED to work, and this repository's worst defect has never been a red gate: it is a GREEN gate that sees nothing.
🛑 **KEEP THE SPAWN LANE AS THE ORACLE, NEVER THE OTHER WAY ROUND.** The spawn path is what production ran for months and what the frozen oracle describes; the daemon is the newcomer. When they disagree, the daemon is the suspect until measurement says otherwise.
⚠️ **ONE THING THIS SUITE CANNOT SEE, stated so nobody inherits a false closure**: it compares ANSWERS, so it is blind to a connection that never arrived. Delivery loss is a transport question and lives in `http-lane-reference.md`; a green here says the lane is CORRECT, never that it is COMPLETE.
📚 History and eliminated hypotheses: `http-lane-reference.md` (`inject: never`).
