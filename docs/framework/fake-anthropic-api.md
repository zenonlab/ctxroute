---
match: ["fake-anthropic-api.js", "wrap-up-claude-code.test.js"]
mode: smart
threshold: 30
---
# fake-anthropic-api.js + wrap-up-claude-code.test.js — the REAL harness, a FAKE model

🔑 **Why**: what must be proven on Claude Code is the harness's side (hook payloads, Stop handling, the mod event) and ours, never a model's answer. A real model makes that proof cost tokens and vary between runs; `ANTHROPIC_BASE_URL` + a dummy `ANTHROPIC_API_KEY` send the CLI to this scripted server instead. The "cost" Claude Code prints is computed locally from the fake usage: no request leaves the machine (`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`).
🛑 **ISOLATION IS THE CONTRACT**: `--setting-sources project` keeps the operator's settings (and every production hook) OUT, `--settings` loads only the consumers under test, `--strict-mcp-config` with an empty map starts no MCP server, `CTXROUTE_*` env points at a throwaway directory. IF you drop one of these, the test runs inside the operator's live configuration.
⚠️ **THE SENSOR REPORTS AFTER A WHOLE TURN, measured with a spy mod (2026-10-04)**: one `session.measure` per turn, AFTER its Stop. So the conversation has TWO human turns, the second written only once the first `result` arrived — sent together, the CLI folds the second into the first turn. And a one-shot `-p` exits right after the last measure, killing the mod's unawaited spawn: the LAST turn's figure never lands, by design of the harness, not a defect of ours.
⚠️ **THE USAGE CARRIES THE CACHE FIELDS AT 0** and the window comes from the model id: Claude Code derives the fill (`42000 / 200000` ⇒ 21 %) from them. IF you change `INPUT_TOKENS`, the asserted percentage moves with it.
⚠️ **THE SCRIPT READS ONLY THE LAST USER MESSAGE**: tool result ⇒ `DONE` · "create the file" ⇒ a `Write` on `argv[3]` · anything else ⇒ `OK`. IF you add a scenario, add a branch keyed on a fact of the request, never on a call count (Claude Code may add side requests).
⚠️ Skipped VISIBLY (stderr) without a Claude Code CLI >= 2.1.287 on PATH, so CI without the CLI stays green for a stated reason. Seen RED: with the write recorder sabotaged, the recorded-files cell fails.
