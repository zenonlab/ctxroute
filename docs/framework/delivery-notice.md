---
rules: [{"pattern":"delivery-notice-pure","scope":["ctxroute"]},{"pattern":"http-lane-differential.test.js","scope":["ctxroute"]},{"pattern":"delivery-notice-integration.test.js","scope":["ctxroute"]}]
mode: smart
threshold: 25
---
# delivery-notice-pure.js — telling the human whether an invocation finished

🛑 **A CORRECT BUT UNREADABLE TRANSPORT GETS MISTAKEN FOR AN OUTAGE** (skill §MULTI-FRAME TRANSPORT). `frame-sequencer-pure.js` (2026-08-28) closed the silent chunk LOSS on Windows loopback; nothing told the human whether an invocation actually completed. This module decides that verdict from the SAME facts: the request receiving the LAST declared piece (`index === nbFrames`) fires COMPLETE; an invocation evicted from this module's own tracking table before completion fires DEFERRED (on whatever later invocation's observation causes the eviction).
⚠️ **A SEPARATE TABLE FROM `frame-sequencer-pure.js`, ON PURPOSE** — that module deletes its own record the instant an invocation completes, so by the time anything could inspect "how many pieces did an abandoned invocation still owe", the fact would already be gone. This module keeps its own minimal `{nbFrames, served}` record, refreshed on the SAME calls with the SAME LRU discipline, so the two tables evict in lockstep without ever reading each other's state.
🛑 **DAEMON-ONLY, AND THAT IS A DECLARED, PERMANENT DIVERGENCE FROM THE SPAWN LANE** — only the HTTP daemon sees every connecting request of one invocation; the `command` lane's N processes are independent and none can ever observe "all of us arrived". `differential-normalize.withoutDeliveryNotice` strips this ONE exact suffix (anchored, with its `·` separator) before any HTTP↔spawn comparison — never a blind erasure of `systemMessage`, which stays byte-strict for every OTHER badge.
⚠️ The two wordings are FROZEN, asserted verbatim by the test suites: `ctxroute: all N chunk(s) delivered — M of K declared frames reached the daemon` and `ctxroute: N chunk(s) deferred to the next action`. Names a COUNT, never a CAUSE — same law as the withholding notice.
🔴 **THE "INCOMPLETE" TRIGGER SHIPPED AND WAS REVERTED THE SAME HOUR — 31 FALSE ALARMS OUT OF 32,
MEASURED ON THE REAL DAEMON.** It rested on *"a NEW invocation of the same agent PROVES the prior one
is closed — an agent never runs two tool calls at once"*. **That premise is FALSE**: Claude Code issues
tool calls IN PARALLEL (its own documentation, and the harness reminds every agent of it each turn), so
two live invocations of one agent interleave and every frame of B declares A closed while A is still in
flight. Two interleaved 32-frame calls produced the whole ladder of alarms while EVERY frame had arrived.
🛑 **AN ALARM THAT CRIES ON HEALTHY TRAFFIC IS WORSE THAN NO ALARM** — it becomes wallpaper, and the day
it is right nobody reads it. Reverted WHOLE rather than patched: tracking N in-flight invocations per
scope would STILL need to know when one ENDS, and **the harness never says a tool call is over**. Same
hole, more code.
⚠️ **WHAT WOULD BE NEEDED, and it does not exist today**: a fact that CLOSES an invocation. Until one is
found, an incomplete delivery is reported only at LRU eviction — in practice never. 🛑 **Do NOT rebuild
this trigger on a new premise about agent behaviour**: MEASURE the premise first, with two interleaved
calls, which is exactly what nobody did.
⚠️ **WHAT DOES HOLD UNDER PARALLELISM, verified the same hour**: `frame-sequencer-pure` keys its table by
`tool_use_id`, so interleaved invocations never share a counter — two parallel 32-frame calls each got
their full delivery and the completion notice fired once per call, correctly.
🛑 A notice never decides: `http-server.js` only appends `messageFor()`'s text to `answer.systemMessage`, joined with ' · ', and never touches `permissionDecision`.
