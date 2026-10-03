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

The engine is platform-agnostic by construction — a CI gate forbids any source from knowing a harness or an OS dialect. What differs is the **plumbing** around it, and only a run on the real machine proves that. This table is what a real supervisor said on a real runner, and nothing else.

| Platform | Service units | What that means |
|---|---|---|
| **Linux** | **green** | installed, loaded by systemd, and it ANSWERS a real request |
| **macOS**, eager mode | **green** | same, via the direct-bind plist |
| **macOS**, socket activation | **fails** | the daemon installs and answers, but the cell proving the OUTAGE WINDOW IS CLOSED does not pass |
| **Windows** | **fails on CI** | the installer cannot register the scheduled task on a GitHub runner; it works on the maintainer's machine daily |

⚠️ **The macOS failure, stated plainly — its CAUSE is NOT established.** Socket activation exists so that a request arriving while no daemon runs is QUEUED by the kernel and served by the next instance; that is the whole point, and the cell that proves it does not pass. **A cause read off a machine that does not reproduce it would be a guess, and this project does not ship those.** What is known: the same platform in **eager mode is green**, so macOS is usable today — it simply keeps the small outage window socket activation was meant to remove.

⚠️ **The Windows failure is about the CI ENVIRONMENT, and that is a claim, not a proof.** A GitHub runner has no interactive logon session, which is what the task's trigger needs; the same installer runs daily on the maintainer's machine. Until someone separates "the runner cannot host this" from "the installer is wrong", **it is written here as unresolved** rather than explained away.

🛑 **So this repository does not claim macOS or Windows are proven.** Linux is. A framework whose entire purpose is to refuse silent defects cannot begin by hiding one of its own.

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

Routing is deterministic on every harness. Transport is not, and the gap between
harnesses is **structural**, not a question of maturity. The conditions a harness
must satisfy to be deployed as a FLEET — and the verdict on each known harness —
are published in [`HARNESS-CONTRACT.md`](HARNESS-CONTRACT.md#industrial-deployment--not-the-same-question-as-compatibility).
In one line: **HTTP is the only industrial transport, and an HTTP handler is
necessary but not sufficient** — a harness that caps the size of a hook's output
forces the knowledge across N declarations, and fires them as N simultaneous
connections it owns.

**What is measured here, and the honest answer is that the CAUSE is still open:**

- **Rate, not red lines.** On the current deployment the loss sits between
  **0.5 % and 1.6 % of POSTs**, stationary over weeks and going back down on its
  own (20,896 POSTs over six live sessions on 2026-09-20: 1.13 %). An earlier, far
  worse regime — 16 % and never recovering — belonged to a **loopback address the
  project left on 2026-09-03**, and must not be read as this one.
- **Nothing on the server side explains it, and the accept queue does NOT settle
  it either way.** The daemon's connection high-water mark has read **32** against
  an accept queue measured at **232** on one calm minute, and **254 against that
  same 232** twelve seconds before a live burst. That counter increments on
  ACCEPT, so a queue that is full while the loop is starved accepts nothing and is
  counted as nothing: **a low reading is not evidence of a healthy queue.** A packet
  capture at the moment of a failure shows no connection attempt on the wire at all
  — no SYN leaves, no RST answers. Several plausible stories (queue overflow, a
  blocked event loop, a filtering driver) were each built and each refuted.
- **Three clients, one loses.** A Node client and a .NET client against the very
  same daemon, on the very same address, under the documented reproducer load
  (4,800 connections, six concurrent writers): **zero failures.** Only the harness's
  own client fails.
- **Upstream will not fix it**: [`anthropics/claude-code#29963`](https://github.com/anthropics/claude-code/issues/29963)
  describes a matching failure and is closed as *not planned* (re-verified
  2026-09-20). We are the server; no line of our code can retry a connection that
  was never attempted.
- **Nothing is lost silently**: content promised to a frame that never connects is
  harvested and carried by the next invocation (`src/carryover-pure.js`). A lost
  frame is still an occasion lost for *that* tool call — a consolation, never a
  repair.
- **And it has never been measured on anything but a developer workstation**, a
  machine also running browsers, other services and full test suites. Under a
  saturating local run the rate reaches ~2 %; at rest, the same session lost zero.

⇒ **Reliability here is a property of the DEPLOYMENT, not of the framework.** Where
an error is costly, pick the configuration with no burst; where speed matters more,
take the `http` lane and accept a bounded, measured, non-silent loss. **A client you
write yourself removes the class entirely**: HTTP/2 carries N frames as N streams
over ONE connection, so the accept queue is touched once and a refusal cannot occur.

Gemini CLI is not a candidate today: its `PreToolUse` does not expose the injection
channel at all — a capability hole, not a size one.

## Install (Claude Code)

1. Clone this folder anywhere.
2. Wire the hooks in `~/.claude/settings.json` (absolute paths). The gate is
   declared **N times** — that is the per-gesture BANDWIDTH, checked by
   `node tools/doctor.js --settings` against `frames` in the config.

   🛑 **N IS NOT A TUNING KNOB, IT IS THE CAPACITY OF ONE ACTION.** The harness
   caps each hook's OUTPUT, so one declaration carries roughly 7,700 characters.
   A 50,000-character skill declared at `frames: 2` therefore spreads over seven
   tool calls, and **the agent acts six times without knowledge it was owed** —
   which is the exact defect this project exists to remove. The example below is
   minimal on purpose; size `frames` against the LARGEST thing you will inject,
   never against a round number. The live deployment runs **32**.

   ⚠️ Claude Code also implements `type: "http"`, which replaces ~330 ms of node
   startup per declaration with one local POST to a resident daemon (measured
   5,300 ms → 182 ms per action). Read
   [`HARNESS-CONTRACT.md`](HARNESS-CONTRACT.md#industrial-deployment--not-the-same-question-as-compatibility)
   before choosing: it is faster, and it is the lane where the transport loss
   described above exists at all.

   ⏻ **The daemon runs only while a harness uses it, by default** —
   `http.lifecycle` in the config: `auto` (default) · `on-demand` · `login`.
   `on-demand` starts with the first session (Windows: the
   `src/hooks/daemon-ensure.js` hook asks Task Scheduler; Linux/macOS: the
   socket-activated unit starts it at the first connection) and leaves by itself
   after `http.idleSeconds` (default 1800) with no request. `login` keeps it up
   from login. `auto` picks `on-demand` on Linux and macOS (the OS holds the
   socket, so a restart is guaranteed) and `login` on Windows, where security
   suites' "do not disturb" modes can pause Task Scheduler and leave an idle-exited
   daemon unable to restart — Windows users opt into `on-demand` knowingly. An idle daemon costs no CPU; what
   `on-demand` gives back is its memory. Wire `daemon-ensure.js` on
   `SessionStart` and `UserPromptSubmit` (the generated wiring does).

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


## Known issues

### Windows: a security suite's "do not disturb" / game mode pauses the daemon's task

**Symptom.** At a prompt, Claude Code shows `ctxroute: the daemon could not be started — the
scheduled task "ctxroute-http" is DISABLED …`, or `node tools/doctor.js --settings …` reports
`the OS supervisor can start the daemon` as failed. Agents then act without the knowledge
ctxroute delivers, until the daemon is back.

**Cause, measured (2026-09-29).** Some security suites pause Windows scheduled tasks while an
application runs full screen — a browser in full screen, the screenshot tool, a game. On Avast
the rule is "Pause system background tasks" in Do Not Disturb Mode; its own log
(`C:\ProgramData\Avast Software\Avast\log\GamingMode.log`) shows the rule turning on and off at
the exact second Windows records the task as disabled then updated. A daemon that is already
running is NOT affected: a disabled task never stops its running instance. What is affected is a
START that falls inside a pause — typically the logon trigger, right after a reboot, while a
full-screen application restores itself.

**What ctxroute does on its own.**
- On Windows the daemon stays up from login (`http.lifecycle` resolves to `login`), so a pause
  mid-session costs nothing.
- Every harness session and every prompt asks Task Scheduler to start the daemon again
  (`src/hooks/daemon-ensure.js`), so a start that was paused succeeds at the next prompt once the
  pause ends.
- You are told, live, only when it matters: the notice above appears when the task is disabled
  AND the daemon does not answer. A disabled task under a daemon that still answers stays silent.

**What you can do.** In your security suite, exclude `ctxroute-http` from the full-screen /
game-mode rules, or turn off the option that pauses background or scheduled tasks. On Avast:
Performance → Do Not Disturb Mode → settings (gear icon) → untick
"Pause system background tasks" (path reported by Avast users, not by Avast's own documentation —
the wording may differ between versions). Nothing else needs changing, and you never need to disable
your antivirus.

**Linux and macOS** are not affected: the OS holds the listening socket and starts the daemon on
the first connection, whatever any other program does to scheduled jobs.
