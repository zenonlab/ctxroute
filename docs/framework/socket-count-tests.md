---
rules: [{"pattern":"serve-stall-concurrency.test.js","scope":["ctxroute"]},{"pattern":"http-listeners.test.js","scope":["ctxroute"]},{"pattern":"thread-pool-differential.test.js","scope":["ctxroute"]},{"pattern":"scale-bench.test.js","scope":["ctxroute"]},{"pattern":"socket-cut.test.js","scope":["ctxroute"]}]
mode: smart
threshold: 30
---
# Tests that count connections — a CLIENT `connect` is not a SERVER `connection`

🛑 **If your test opens sockets and then asserts what the SERVER counted, you MUST wait for the server's own `connection` events, never for the client's `connect`.** The kernel completes the handshake from its backlog, so the client's `connect` fires BEFORE the server accepts. Close the burst right after and Linux hands the server already-dead sockets ONE AT A TIME.
🔴 **Paid 2026-09-23**: `serve-stall-concurrency` ① read `peakConn = 2` for a burst of 12, red 5/5 on Linux (WSL and the GitHub runner), green on Windows by luck — Windows happened to accept first. The production counter was right; the cell measured the client. Fixed by `openHeld()` in that suite.
⚠️ **Arm the `connection` listener BEFORE the sockets open**: armed after, an early accept is missed and the wait never resolves.
⚠️ **No timer to "let the server catch up"**: the server's event is the authority on "held", and a delay is a guess that fails on the next slower machine.
⚠️ A cell green on ONE kernel proves nothing portable about accept timing: this class is invisible on Windows. Read the three-OS verdict before calling it fixed.
