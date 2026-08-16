---
inject: never
---
# Multi-frame transport — the protocol, its sources, its measurements

ON-DEMAND page (never re-injected). The short invariants live in `budget.md`; here is the full WHY, for whoever maintains or ports the mechanism. **Goal: zero ambiguity for the agent who comes next.**

## The problem, in one sentence

Every harness bounds the size of an injection. Beyond it, it stores the content in a file and shows only a preview — **without warning the producer**. The agent receives an intro believing it holds the contract.

## The rule, in two lines (there is no third case)

1. **It fits** → emit as-is. No envelope, no loop, no overhead.
2. **It does not fit** → split into chunks spread over N frames.

Everything else in the module is just the honest implementation of those two lines.

## The protocol: we invented nothing

Two standards solve exactly this problem — a message too big for its channel — and **mandate the same three pieces of information**.

| Receiver's need | RFC 2046 (`message/partial`) | RFC 6455 (WebSocket) | Here |
|---|---|---|---|
| What it belongs to | `id` (near world-unique) | the connection | shared marker `###END:xxxx###` |
| Where it goes | `number`, **starts at 1** | continuation frames | `CHUNK j/m` |
| When it is complete | `total` (mandatory on the last) | **FIN bit** | the `m` of `j/m` |
| Order | strict | strict, **never interleaved** | strict, never interleaved |
| Where to cut | **line boundaries** | — | line boundaries |

⚠️ **These three fields are a minimum, not a comfort.** Removing one makes reassembly ambiguous: without `id` you don't know what goes together, without `number` you don't know the order, without `total` you don't know whether it is finished.

## Why this is TCP/MSS segmentation and NOT IP fragmentation

[RFC 8900] says "SHOULD NOT develop new protocols that rely on IP fragmentation". Its 9 causes of fragility are **all intermediate equipment** (NAT, stateless firewalls, ECMP, reassembly-ID collisions) — there is **none** here: hook → harness → context. And its underlying recommendation, *"push fragmentation responsibilities upward to layers that understand application semantics"*, describes exactly what we do: we split knowing the content, on boundaries that carry meaning.

## Why NO automatic ceiling discovery (do not re-propose it)

[RFC 8899 / PLPMTUD] exists because classic PMTUD depends on a **return signal** (ICMP) that is often filtered ⇒ **silent black hole**. The harness spill file would be our ICMP, but worse: **there is no return channel at all**, the only receiver is the agent. The RFCs' answer is therefore:

- **conservative floor** (`BASE_PLPMTU` → our `DEFAUT_BUDGET` = 8,000, below the 10,000 measured);
- **negotiation where an authority exists** (the equivalent of TCP's MSS);
- **never blind probing**.

## The harness table (official docs, survey of 2026-08-03)

| Harness | Ceiling | Adjustable? | Our posture |
|---|---|---|---|
| Claude Code | 10,000 characters per string | ❌ "no setting to configure or disable", + REMOTE feature gate | **floor** 8,000 (margin), we read nothing |
| Codex | ~2,500 **tokens** (default) | ✅ `additionalContextLimit` (`0` = unlimited) | **we DECLARE it as `0` in OUR wiring** ⇒ zero fragmentation needed |
| Gemini CLI | undocumented | — | `PreToolUse` **has no channel** — a capacity problem, not a size one |

⚠️ **Codex is not an exception, it is the same principle**: when the product exposes a declared authority, we consult it instead of guessing. When it exposes none (Claude Code), we take a margin. Guessing an undocumented internal is building on sand — it can change without an update.

⚠️ **CORRECTION OF 2026-08-04 — "we READ the setting" was FALSE, and the word mattered.**
Official doc (`learn.chatgpt.com/docs/hooks`, read that day): `additionalContextLimit` is declared
**PER HANDLER**, next to `command`/`timeout`, in the hooks file — so **in OUR own
wiring**. There is no upstream config to read: we **WRITE** it. Values: *"Omit
additionalContextLimit to use the default 2500-token threshold"* · *"or 0 to pass the handler's
complete additional context directly to the model"*.
🛑 **So it was not "a doc that lies" but a SILENT PRODUCTION OUTAGE**: the setting was
absent from the wiring ⇒ default 2500 tokens ⇒ any slightly large skill (the `ctxroute` skill is 39 KB,
~10,000 tokens) was written to disk and replaced by a PREVIEW, with the hook knowing nothing.
Exactly the defect that motivated frames on the Claude Code side, left open on the Codex side.
⚠️ Set 2026-08-04 on **both emitters** (`codex-doc-inject` PreToolUse, `session-inject`
SessionStart) and **sealed by `doctor.js --codex-hooks`** (check PER BLOCK: the setting on a single
emitter would leave the other mute, and a global match would miss it).

## If a harness LOWERS its limit tomorrow

1. **It does not break silently** — the seal announces the end marker up front; if it is missing on read, the agent knows it was truncated and will go read the files. The mechanism assumes no value.
2. **The fix is ONE number**: `budgetInjection` in the config (or the harness setting). Everything re-splits automatically into smaller chunks.
3. **Possibly** raise `--frames N` if more frames are needed.

No code to change. That is what update resistance means.

## The concurrency trap (NEVER reintroduce it)

The N processes are **parallel** and each calls `gate.decide`, which **writes state**. The first would consume the `once` docs ⇒ the following ones would have nothing left to inject ⇒ empty frames. Hence the **per-invocation memoized plan** under the existing lock: one decides, all recompute the same split **by pure determinism**. Determinism replaces all coordination — any source of non-determinism in `planFrames` (clock, randomness, state read) would break the mechanism.

⚠️ [RFC 8899] requires robustness to **reordering**. Observed in production from the switchover on: frame 3 arrived **before** frame 1. That is precisely why every frame is self-describing.

## REAL bugs found during construction (2026-08-03)

- **Evaporated content**: frame too small for a chunk header ⇒ no chunk produced ⇒ doc neither delivered nor signalled. Found by MEASUREMENT, sealed by property-based + negative-check via sabotage (remove the guard ⇒ the property goes red).
- **Fragmentation without memoization**: the gate split even without an invocation id ⇒ `once` docs consumed by the first frame.
- **`argv[i+1]` with i = −1**: a bare number in the command line was taken for a frames declaration. Found by mutation.

## Sizing N

375 injectable docs · median 1,548 characters · usable capacity ≈ 7,660 per frame.
Largest content in the fleet: skill `agent-social` **79,516 characters → 11 frames**. **N = 12 declared** in `settings.json`.
⚠️ A declared but useless frame costs a process. Do not inflate N without measurement — but do not trim it either: running short means not delivering.
