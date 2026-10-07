# Harness Contract — what ctxroute requires from your agent harness

ctxroute is harness-agnostic by construction: the engine never reads a harness
dialect (CI-gated). Porting = wiring thin shells + editing one data file
(`harness-profile.js`). This document is the **contract** your harness must
satisfy, and how to **prove** conformity on your machine instead of trusting us.

## Required capabilities (missing one = incompatible)

| Capability | What it is | Why it is required |
|---|---|---|
| Pre-tool event | A hook fired **before/around every tool call**, receiving JSON on stdin | The only decidable moment to route knowledge to a gesture |
| `tool_name` | Non-empty string naming the tool | The `tool` trigger and the context of `exclude` — without it no source can target a gesture |
| `tool_input` | The tool's parameters as a JSON object | The **entire matching universe** (`match`/`scope`/`exclude`) |
| Context channel | A documented way for hook output to reach the model's context (e.g. `additionalContext`) | Delivery itself — without it the framework computes verdicts nobody receives |

## Optional capabilities (each absence = a NAMED degradation, never a failure)

| Capability | Degradation when absent |
|---|---|
| `session_id` | once/smart cadence is per-process instead of per-session (more re-injections, never a loss) |
| `cwd` | skill perimeter "by current directory" is mute (`npm test` run inside a project won't trigger its skill) |
| `transcript_path` | the canary (dead-man switch) answers `indecidable` — the framework works, but its death would be silent |
| `agent_id` | sub-agents share the master's injection state (a `once` consumed by the master starves the sub-agent), and no `role:` category is derived — a doc restricted to the main agent or to sub-agents reaches nobody |
| `agent_type` | no `type:` category is derived for a sub-agent — a doc restricted to one agent type reaches nobody, a `-type:` exclusion excludes everyone (fail-closed, never a leak) |
| Sub-agent start event | sub-agents do not receive `docs/session/` (their per-gesture channels are unaffected) |
| Deny support (`permissionDecision`) | `enforce: true` degrades to inform-only — a guardrail, never a security boundary anyway |
| Session-start event | `docs/session/` knowledge is not delivered at session start (per-gesture channels unaffected) |
| Context sensor (how full the context window is, BEFORE the harness compacts it) | the experimental `wrapUp` option is ABSENT on that harness (everything else unaffected) |
| End-of-turn refusal (an event whose output can refuse to let the agent stop, with a reason the model reads) | the experimental `wrapUp` option is ABSENT on that harness |

### The `wrapUp` option needs BOTH of the last two

`wrapUp` (experimental) forces an agent to write its session knowledge — injectable docs, memory,
regression tests — before its context window is compacted, judged by the adopter's own judges. Its
core reads ONE normalised observation (`{ tokens, window, percent }`) and knows no harness: a
harness plugs a SENSOR that produces it and a FORCING dialect that speaks its end-of-turn output,
both declared as data in `harness-profile.js` (`WRAP_UP`).

| Harness | Sensor | End-of-turn refusal | `wrapUp` |
|---|---|---|---|
| Claude Code (≥ 2.1.287) | a mod on `session.measure` (`mods/wrap-up-sensor`) | `Stop` → `decision: "block"` + `reason` | supported |
| Codex | none: no hook input carries a token count (read 2026-10-04) | `Stop` → `decision: "block"` exists | not supported |

It never relies on blocking a compaction: on Claude Code a blocked compaction "stops processing and
asks you what to do" — a human in the loop. `node tools/doctor.js --harness <payload.json>` lists
the support per harness and NAMES any numeric field of a real payload that looks like a context
measurement: the day a harness starts sending one, that line shows it.

## Prove it on YOUR machine (never on our word)

1. Capture one **real** payload from your harness — wire a one-line hook that
   copies stdin to a file:
   ```js
   require('fs').writeFileSync('payload.json', require('fs').readFileSync(0));
   ```
2. Run the conformity check:
   ```
   node doctor.js --harness payload.json
   ```
3. Read the verdict: `SUPPORTE` / `DEGRADE` (each point named with its
   consequence) / `INCOMPATIBLE` — never a bare yes/no. The report also lists
   **path-shaped keys unknown to the profile**: candidates for `pathKeys` in
   `harness-profile.js`. You decide — the engine never guesses.

## Industrial deployment — NOT the same question as compatibility

A harness can satisfy every capability above and still be unfit for a fleet.
Compatibility asks *can this harness express the language*. This section asks
*can this deployment be operated at scale*. A harness is entitled to pass one
and fail the other, and most do.

**HTTP is the only industrial transport, and the reason is not the protocol.**
It is everything the protocol brings with it: addressing, load balancing, TLS
termination, authentication, tracing, autoscaling. Twenty years of operational
tooling. A `command` handler is not a slower protocol — it is **not a protocol
at all**. It is a local invocation convention with no network semantics: there
is nothing to put a load balancer in front of, no reach beyond the machine, and
one process spawned per declaration per action. It stays fully supported as the
**workstation** lane, and it is the only regime with zero connection loss by
construction. It is not a fleet answer and must never be offered as one.

**Two conditions. The second is the one that gets missed.**

1. **The harness exposes an HTTP handler.** Without it the daemon can only ever
   be a local sidecar, never a service.
2. **The harness does NOT cap the size of a hook's output.** A cap forces the
   knowledge to be split across N declarations; the harness then fires those N
   hooks in parallel, opening **N simultaneous connections per action**. The
   harness owns those sockets, so nothing on the server side can pool, reuse or
   retry them. A saturated accept queue answers `WSAECONNREFUSED` on Windows —
   Microsoft's own `listen` reference states it — so the refusal rate becomes a
   property of the harness, **out of reach of any implementation**.

**Known harnesses, as measured here:**

| harness | HTTP handler | output cap | industrial verdict |
|---|---|---|---|
| Claude Code | yes | **~10,000 c per output** | **workstation only** — the cap forces N parallel connections per action, and a failed one is never retried ([anthropics/claude-code#29963](https://github.com/anthropics/claude-code/issues/29963), closed `NOT_PLANNED`) |
| Codex | no — `command`, `mcp_tool` | none (`additionalContextLimit = 0`) | **workstation only** — one declaration, zero connections, zero loss by construction, no network reach |
| Gemini CLI | not on `PreToolUse` | — | incompatible on that event |

**None of this is a defect of ctxroute, and none of it is permanent.** A client
you write yourself establishes its connection **once** and multiplexes: HTTP/2
carries N frames as N streams over ONE connection, so the accept queue is
touched once and the class cannot occur. This daemon already recognises the
HTTP/2 preface and refuses it by name rather than guessing a protocol; opening
that lane is one factory call, the request handler being compatible already.

**State it plainly to an evaluator: the limit belongs to a harness that
truncates its hooks, never to the transport and never to this architecture.**

## Honest limits

- A payload proves the **presence** of contract fields. That injected context
  is actually **consumed by the model** is proven in real use by the canary
  (`state/canary.json`), not by this script.
- One payload proves one tool's shape. Capture a few (shell, file read, MCP
  call) for a representative verdict.
