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
🛑 A notice never decides: `http-server.js` only appends `messageFor()`'s text to `answer.systemMessage`, joined with ' · ', and never touches `permissionDecision`.
