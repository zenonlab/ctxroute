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
| `agent_id` | sub-agents share the master's injection state (a `once` consumed by the master starves the sub-agent) |
| Deny support (`permissionDecision`) | `enforce: true` degrades to inform-only — a guardrail, never a security boundary anyway |
| Session-start event | `docs/session/` knowledge is not delivered at session start (per-gesture channels unaffected) |

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

## Honest limits

- A payload proves the **presence** of contract fields. That injected context
  is actually **consumed by the model** is proven in real use by the canary
  (`state/canary.json`), not by this script.
- One payload proves one tool's shape. Capture a few (shell, file read, MCP
  call) for a representative verdict.
