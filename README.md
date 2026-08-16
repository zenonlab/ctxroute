# ctxroute

[![test](https://github.com/zenonlab/ctxroute/actions/workflows/test.yml/badge.svg)](https://github.com/zenonlab/ctxroute/actions/workflows/test.yml)

**Declarative context routing for coding agents.** ctxroute is a small,
deliberately non-Turing-complete language: you declare *when* a piece of
knowledge (an invariant, a pitfall, a project skill) must reach an agent, and
the engine injects it into the agent's context **at the exact gesture** — the
tool call — where it matters. Predictable, explainable, harness-agnostic.

- **Language reference:** [`LANGUAGE.md`](LANGUAGE.md) (derived from the
  engine's constants — a gate fails if it drifts).
- **Harness contract & conformity test:** [`HARNESS-CONTRACT.md`](HARNESS-CONTRACT.md).

## Why

Prose instructions ("remember to…") decay: they rely on the agent's vigilance.
ctxroute replaces them with a mechanical guarantee — knowledge is delivered
when a *decidable fact* occurs (a file touched, a shell command run, an MCP
tool called, a project perimeter entered), never by guessing intent.

## The four sources

| Source | Trigger | Example |
|---|---|---|
| **File docs** | frontmatter `match`/`rules` on paths & shell commands | `match: deploy.sh` |
| **MCP docs** | the doc's **path**: `docs/mcp/{server}[/{tool}].md` | `docs/mcp/stripe.md` |
| **Tool docs** | frontmatter `tool:` — exact tool name, `*` wildcard | `tool: [WebSearch]` |
| **Skills** | registry entry (`skills` in the config): files ∪ MCP servers ∪ tools | project knowledge, auto-loaded |

All sources share one closed boolean base — `match` (∃) · `scope` (∃, AND of
ORs) · `exclude` (∀¬) — plus a global `filterMode`/`filterList` target filter.
Details and proofs: `LANGUAGE.md`.

## Install (Claude Code)

1. Clone this folder anywhere.
2. Wire the hooks in `~/.claude/settings.json` (absolute paths). The gate is
   declared **N times** — that is the per-gesture bandwidth (frames), checked
   by `node tools/doctor.js --settings` against `frames` in the config:

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "*", "hooks": [
        { "type": "command", "command": "node /path/to/ctxroute/src/hooks/doc-inject.js --frame 1 --frames 2", "timeout": 10 },
        { "type": "command", "command": "node /path/to/ctxroute/src/hooks/doc-inject.js --frame 2 --frames 2", "timeout": 10 }
      ]}
    ],
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "node /path/to/ctxroute/src/hooks/session-inject.js", "timeout": 10 }] }
    ],
    "PostToolUse": [
      { "matcher": "Write|Edit", "hooks": [{ "type": "command", "command": "node /path/to/ctxroute/src/hooks/doc-write-guard.js", "timeout": 10 }] }
    ],
    "PreCompact": [
      { "hooks": [{ "type": "command", "command": "node /path/to/ctxroute/src/hooks/ctxroute-reset.js", "timeout": 5 }] }
    ],
    "UserPromptSubmit": [
      { "hooks": [
        { "type": "command", "command": "node /path/to/ctxroute/src/hooks/turn-count.js", "timeout": 5 },
        { "type": "command", "command": "node /path/to/ctxroute/src/hooks/canary-check.js", "timeout": 5 }
      ]}
    ]
  }
}
```

3. Drop docs: `docs/mcp/{server}.md` for MCP servers, or any `.md` with a
   `match:` frontmatter in your file-docs folder. That's all — no code.

4. Optional — tune `ctxroute-config.json` (everything has safe defaults):

```json
{
  "enabled": true,
  "showNotification": true,
  "mode": "smart",
  "defaultThreshold": 4,
  "frames": 2,
  "filterMode": "none",
  "filterList": [],
  "servers": { "odoo": { "subToolParam": "args.tool" } },
  "defaults": { "file": { "mode": "smart" } },
  "skills": { "myproject": { "match": ["myproject"], "mode": "once" } }
}
```

Codex CLI is supported with thin shells (`src/hooks/codex-doc-inject.js`,
`src/hooks/codex-doc-write-guard.js`) — declare `additionalContextLimit = 0` on the
emitters (checked by `doctor.js --codex-hooks`).

## Porting to another harness

The engine is portable **by construction** (CI gate: no source may know a
harness dialect; the dialect lives in `harness-profile.js`, as data).

1. Read `HARNESS-CONTRACT.md`.
2. Capture one real hook payload from your harness.
3. `node tools/doctor.js --harness payload.json` → `supported` / `degraded`
   (each point named with its consequence) / `incompatible`.

## Guarantees (how this is not on faith)

- **Independent executable spec** confronted to the engine exhaustively
  (~400k cases per `npm test`) — the judge that catches semantic bugs the
  engine's own tests cannot see.
- **Atoms table**: every source × projection × operator cell probed by
  behavior; blind cells carry a written justification or the build is red.
- **Mutation testing at 100 %** with a per-file floor; property-based laws;
  differential parity against the previous engine on real gestures.
- **Delivery of any size** (RFC 2046/6455-style framing + queue): a doc is
  never dropped for being large; truncation by a harness is loud (seal),
  never silent.
- **Dead-man switches**: `doctor.js` (engine + wiring) and a canary that
  watches the *other* end of the pipe (`state/canary.json`).

## Diagnostics

- `node tools/explain.js --doc <name> --tool X --input '{...}'` — why a doc did or
  did not inject (exact reason, from the real engine).
- `node tools/doctor.js [--settings …] [--codex-hooks …] [--harness …]` — is the
  wiring alive, does the harness conform.
- `node tools/lint-corpus.js` — audit of the whole doc corpus.
