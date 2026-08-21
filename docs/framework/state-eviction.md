---
rules: [{"pattern":"state-eviction-pure.js","scope":["ctxroute"]},{"pattern":"state-eviction.js","scope":["ctxroute"]},{"pattern":"state-eviction-pure.test.js","scope":["ctxroute"]},{"pattern":"state-eviction.test.js","scope":["ctxroute"]},{"pattern":"session-store.js","scope":["ctxroute"]},{"pattern":"ctxroute-reset.js","scope":["ctxroute"]}]
mode: dumb
---
# state-eviction — `state/` HAS A CEILING NOW (2026-08-21)

🛑 **ANYTHING THAT WRITES DECLARES ITS CEILING AND ITS EVICTION IN THE SAME GESTURE.** `state/` had NEITHER: **615 files / 5.1 MB measured on the live install, 544 of them (88 %) ephemeral `plan-` keys**. Monotonic growth is a DATED outage, never "a big number".
🔑 **THE ONLY DURATION IS DERIVED FROM `deadline.DEFAULT_MS` (× 10 = 5 min), and the fact that makes it safe is OURS**: every hook process arms `deadline.arm()`, so after one deadline every process that could still read a `plan-` file is dead — killed by our timer, never presumed dead. 🛑 NEVER age out a DURABLE key (`doc-seen-`/`ctxroute-seen-`/`turn-count-`/`remainder-`): an agent's death is not decidable from here, so that class has a COUNT ceiling only, coldest first.
🛑 **ONE CEILING PER CLASS** (4096 durable / 2048 ephemeral, imported from `memory-store-pure.js`): shared, the ephemeral flood evicts the durable and one busy agent erases the whole fleet's memory, silently, worse with scale.
⚠️ **FAIL-CLOSED ON DELETION**: a name matching no declared prefix is NEVER removed, only REPORTED (`unclassified`) — the only thing that sees an undeclared writer. A `.tmp` is swept by AGE ONLY: by count, a live writer's file would go and its rename would lose the write in silence. Directories (`.lock-*`) are skipped.
🛑 **A THRESHOLD PROBE IS NOT AN EVICTION** (it constates, too late) and **AN EVICTION IS PROVEN BY WHAT IT DELETES** — a cleaner matching nothing is indistinguishable from one that works (`*.tar.gz` vs `*.sql.gz`: 0 bytes since forever, disk 87 %). Hence: the decision returns NAMES, its cell asserts survivors AND removals, and a missing bound is a NAMED REFUSAL, never a silent no-op.
⚠️ **THE DECISION IS PURE AND MUTATED** (`state-eviction-pure.js`); the shell only lists and unlinks. Written next to the `unlink` it would be measured by nothing.
⚠️ **TRIGGERED FROM `turn-count.js`** (UserPromptSubmit): once per human turn, ONE process, already wired on both harnesses, fail-open. 🛑 Never from a state WRITE (16 frames × every action = the "and at 10,000?" defect), never a timer, never a new process. HONEST LIMIT: a harness without UserPromptSubmit gets no eviction.
⚠️ The class list is CONFRONTED with `ctxroute-reset.js`'s sweep by a cell — two hand-written enumerations of one truth diverge, and the sixth store would then grow for ever.
