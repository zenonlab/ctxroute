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

## Platform status — what is PROVEN, and what is not

🔴 **The badge above is red, and this section says exactly why rather than leaving you to guess.** The engine is platform-agnostic by construction — a CI gate forbids any source from knowing a harness or an OS dialect. What differs is the plumbing around it, and only a run on the real machine proves that.

| Platform | Suite | What that means |
|---|---|---|
| **Linux** | green | the full suite passes on a clean CI clone |
| **Windows** | green locally, verdict missing on CI | it is the maintainer machine, exercised daily; the CI job is cancelled the moment another OS fails, so its own run has not completed recently |
| **macOS** | **one test fails** | `dual-transport`, the cell asserting the daemon REFUSES a second instance |

⚠️ **The macOS failure, stated plainly — including the fact that its CAUSE is not established.** The cell forks a daemon against an address a live occupant already holds and requires it to die; on macOS it neither binds nor dies. Three explanations fit that silence equally well — a bind never attempted, an errno other than the fatal one sent down the degradation path, or a liveness probe that never settles — and reading the code from a machine that does not reproduce it cannot separate them. The cell now FAILS while quoting what the child wrote, so the next run says which one it is. **Naming a cause before that would be a guess, and this project does not ship those.**

⚠️ **Whether it affects a real installation is equally unknown**: it has never been reproduced outside CI, and the supervision unit shipped for macOS is socket-activated — there the OS itself owns the listening socket, so a duplicate cannot arise by this path at all.

🛑 **So this repository does not claim macOS is proven.** Running it there is reasonable and probably fine; being told it is verified would be false. A framework whose entire purpose is to refuse silent defects cannot begin by hiding one of its own.

---

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

## Choosing a harness

Routing is deterministic on every harness. Transport is not — and the gap between
harnesses is **structural**, not a question of maturity.

**The most reliable configuration that exists here is a PAIR**, and quoting half of
it will mislead whoever applies it: *one single `command` declaration* **and** *a
harness with no output cap*.

- **Codex CLI satisfies both.** `additionalContextLimit = 0` passes the handler's
  complete additional context to the model, so nothing needs fragmenting: one
  declaration, one process, zero simultaneous connections. The whole class of
  transport loss is **absent by construction**, not mitigated. Price: one process
  start per action (~330 ms measured).
- **Claude Code does not.** Its per-output cap is undocumented and real (the engine
  works to a conservative 8,000-character floor; beyond it the harness files the
  text away and hands the agent a short preview), so several hook declarations stay
  required, and the harness fires them in parallel. Under load — around 38
  simultaneous connections, produced by ~12 parallel tool calls or by spawning a
  subagent — connections are lost. Normal use (1 to 5 parallel calls) is clean.

**What is measured, and what is not:**

- The loss is a Node client behaviour **on Windows**: the kernel disables TCP
  retransmission on loopback, and a .NET client against the same server loses
  nothing. On Linux and macOS the client retransmits on its own, so this may well be
  clean there — **not measured**, and it is the cheapest decisive measurement left.
- Upstream will not fix it: `anthropics/claude-code#29963` describes this exact
  failure and is closed as *not planned*. We are the server; no line of our code can
  retry a connection that never arrived.
- **Nothing is lost silently**: content promised to a frame that never connects is
  harvested and carried by the next invocation (`src/carryover-pure.js`). A lost
  frame is still an occasion lost for *that* tool call — a consolation, never a
  repair.

⇒ **Where an error is costly, pick Codex** (or the `command` lane). Where speed
matters more, take Claude Code's `http` lane and accept a bounded, measured,
non-silent loss. Reliability here is a property of the **deployment**, not of the
framework.

Gemini CLI is not a candidate today: its `PreToolUse` does not expose the injection
channel at all — a capability hole, not a size one.

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

4. Optional — tune `ctxroute-config.json` (everything has safe defaults).

   **Put it outside the clone.** ctxroute looks for a per-user configuration at
   the location your operating system reserves for one, and uses it as soon as
   the file exists:

   | Platform | Location |
   |---|---|
   | Linux / BSD | `$XDG_CONFIG_HOME/ctxroute/ctxroute-config.json`, or `~/.config/ctxroute/ctxroute-config.json` when that variable is unset |
   | Windows | `%APPDATA%\ctxroute\ctxroute-config.json` (i.e. `%USERPROFILE%\AppData\Roaming\…`) |
   | macOS | `~/Library/Application Support/ctxroute/ctxroute-config.json` |

   That file survives a `git pull` and a re-clone; a config left inside the
   clone does not. Precedence, highest first: `CTXROUTE_CONFIG_PATH` (reserved
   for tests and `doctor.js`) → `--ctxroute-config <absolute path>` on the hook
   command line → the per-user file above → `ctxroute-config.json` next to the
   code. With no per-user file present, nothing changes.

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
