---
match: turn-count.js
mode: dumb
---
# turn-count.js — the LAST witness of a dead authority

🛑 **ON THE `http` TRANSPORT THIS SHELL IS THE ONLY THING LEFT THAT CAN SPEAK.** The 32 gate declarations are POSTs: authority unreachable ⇒ the harness gets `ECONNREFUSED` and runs **no code of ours at all**, so nothing can report anything. This hook is SPAWNED at every human turn, on the client lane — hence it still runs, and hence the notice lives here and not in `session-inject` (SessionStart) or `ctxroute-reset` (PreCompact), which only fire at session boundaries, possibly hours later.
⚠️ **IT ANNOUNCES WHAT IT OBSERVED, NEVER A CAUSE.** "the kernel REFUSED the connection" — never "the daemon is dead", never a verdict on the gate or the transport. A layer that observes WHAT has no authority to say WHY; the `N doc(s) WITHHELD` count is the precedent.
⚠️ **A NOTICE NEVER CHANGES A DECISION**: emit `{systemMessage}` ALONE, no `permissionDecision`, no `decision` — same reason as `pretool-core.noticeOutput`. Authorising a tool call as a side effect of a warning is the bug that shape exists to prevent.
⚠️ **ONCE PER CONTEXT, and via the EXISTING `turn-count-` record** — no 6th store prefix for one boolean (a prefix owes a purge-loop entry and an eviction class). A permanent alarm becomes wallpaper: that is why `capacity-alarm` speaks on the final frame only.
⚠️ **The refusal codes are a CLOSED list** (`ECONNREFUSED`, `ENOENT`) in `lib-pure`: `EACCES` is deliberately NOT one — permission denied means someone IS there. Widening it silently turns a witness into a liar.
⚠️ **Shared byte-for-byte with Codex**, whose UserPromptSubmit output handling is UNMEASURED: worst case the JSON line lands as context — noise, never a break. Stated, not hidden.
