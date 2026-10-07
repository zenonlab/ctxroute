---
match: wrap-up-sensor
mode: smart
threshold: 30
---
# mods/wrap-up-sensor — Claude Code's context sensor (option `wrapUp`)

🔑 **A Claude Code MOD** (plugin with `hooks/hooks.json` → `modules`), listening to `session.measure`: the engine pushes it after each main-thread turn with `context.percent` (types of Claude Code 2.1.289: "compare them with your own threshold here"). When the fill moved, it hands `{ session_id, cwd, context }` to `src/hooks/wrap-up-observe.js` through `$.process.run`, UNAWAITED.
🛑 **IT OBSERVES, IT NEVER DECIDES**: no threshold, no switch here — a threshold read in the mod is a second copy of a setting. It always returns `next(e)` unchanged.
🛑 **THE DOOR IS FOUND FROM THE PLUGIN'S OWN FOLDER** (`$.plugin.root` + `/../../src/hooks/wrap-up-observe.js`): IF you move the mod out of `<ctxroute>/mods/`, that path breaks — change both together.
⚠️ **Op hooks answer `{ value }`** in the test kit (`session.id`, `session.cwd`, `process.run`); `session.measure` needs a bottom answer `{ changed }`. Cells: `claude plugin test mods/wrap-up-sensor` (zero model, zero token) · `claude plugin validate mods/wrap-up-sensor`.
⚠️ **Installing it is a declared gesture**, never automatic: `claude --plugin-dir <ctxroute>/mods/wrap-up-sensor`, or `CLAUDE_CODE_PLUGIN_DIRS` in the `env` of `~/.claude/settings.json`, or a folder marketplace install. Mods need Claude Code ≥ 2.1.287.
📐 **STATUS OF THE INTERFACE, official docs read 2026-10-04** (`code.claude.com/docs/en/plugins/mods/overview.md` and `…/reference.md`, "as of v2.1.289"): mods are RELEASED — "require Claude Code v2.1.287 or later, and they're on by default", the early-access switch is ignored since that version — and `session.measure` ("After each turn") plus `$.session.usage().context` (`tokens`, `window`, `percent`) are in the published reference. 🛑 **No written compatibility promise was found**: the reference itself says the GitHub types "can be older than the Claude Code version you have installed". IF you upgrade Claude Code, rerun `test/wrap-up-claude-code.test.js` (real CLI, fake API, zero token): it is what says whether this sensor still reports, and `sensorSilent` tells the human if it stops in production.
⚠️ **One measure per turn, AFTER that turn's Stop** (measured with a spy mod): the refusal lands one turn after the crossing.
⚠️ The mod's hook budget is 10 s: that is why it never runs a judge — judges run in the classic `Stop` hook (`wrap-up-stop.js`).
