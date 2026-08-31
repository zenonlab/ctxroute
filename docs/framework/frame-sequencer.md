---
rules: [{"pattern":"frame-sequencer-pure","scope":["ctxroute"]},{"pattern":"http-frame-resequencing.test.js","scope":["ctxroute"]}]
mode: smart
threshold: 25
---
# frame-sequencer-pure.js — arrival order, not URL number, decides the content

🛑 **THE HTTP DAEMON SERVES THE NEXT UNDELIVERED CONTENT INDEX, NEVER THE `?frame=` NUMBER OF THE CONNECTING URL.** Reason measured 2026-08-28: Windows disables TCP retransmission on loopback, so ~6% of the connections a declared frame opens against the daemon are lost in silence (ETIMEDOUT). Attributing chunk k to frame k meant a lost connection dropped chunk k NOWHERE while the document was still counted delivered — a silent bug.
⚠️ The daemon is a SINGLE PROCESS that sees every connecting request of one invocation (`tool_use_id`) — as long as at least as many frames connect as there are real chunks, every chunk reaches SOMEONE.
✅ **AND THE CAVEAT IN THAT SENTENCE IS CLOSED SINCE 2026-08-31 — do not read it as a standing limit.** When FEWER frames connect than there are chunks, the leftovers used to be dropped (the plan's queue persists only what overflows the LAST frame). `carryover-pure.js` now hands them to the next invocation, which HARVESTS them; the harvested invocation then serves nothing more, so nothing is delivered twice. This module still owns the PRESENT action; that one owns what crosses into the next.
🛑 **THE `command` (spawn) LANE KEEPS THE OLD INDEX-BY-URL SPLIT, OBLIGATORILY** — its N processes are independent OS processes with no shared memory and cannot coordinate "who already got what"; only a single long-lived process (the daemon) can track arrival.
⚠️ The tracking table (`createState()`) is a `Map`, BOUNDED FOR LIFE at `MAX_INVOCATIONS` (4096) and evicted LEAST-RECENTLY-TOUCHED — a daemon runs for weeks, an invocation must never grow the table forever.
🛑 Fails open to the URL's own frame number whenever tracking cannot apply (no map, no `tool_use_id`, or fewer than 2 declared frames) — that is what keeps every caller not supplying tracking byte-identical to the previous design.
