---
match: [paths.js, fleet-hooks-path.test.js, source-adapters.js]
scope: [ctxroute]
exclude: [protected-paths.json]
mode: dumb
rank: 355
---
# paths.js — single source of paths

⚠️ EVERY runtime path (config/docs/state) is declared HERE, once. NEVER redo an ad-hoc `path.join(__dirname,'state')` in a hook: `stateDir` was duplicated identically in inject.js AND reset.js — two copies of one truth that diverge silently (the reset would target another folder, with no visible error).
LAZY resolution mandatory (`paths.stateDir()` at call time, never frozen in a const at load) — otherwise the env vars set by the parent at spawn are ignored.
Every env var here (`CTXROUTE_CONFIG_PATH`/`DOCS_DIR`/`STATE_DIR`/`FILEDOCS_DIR`/`SESSIONDOCS_DIR`/`SKILLS_DIR`/`FLEET_HOOKS_DIR`) is RESERVED for tests and doctor.js — never a user setting (that is `ctxroute-config.json`).
⚠️ THE FLEET ROOT = `FLEET_SEGMENTS` (2026-08-21), ONE definition with TWO projections that must NEVER be collapsed: `fleetHooksDir()` = ABSOLUTE, anchored at the home, overridable — the address a PROCESS uses to REACH the disk (`fileDocsDir()` hangs beneath it, `skillsDir()` beside it); `fleetHooksLabel()` = RELATIVE, POSIX, home-free, NOT overridable — the address PUBLISHED to a reader in the `[source: …]` tag.
🛑 NEVER emit `fleetHooksDir()` into a tag, a message or a doc: it returns the maintainer's real home (a tmpdir under the test override), and this repository is PUBLIC and treats itself as already public — that is a LEAK, and a test override would rewrite a published contract. The tag is a CONTRACT (an agent reads that exact path to go UPDATE the doc), so a stale prefix breaks the self-repairing loop with nothing going red. Two projections of one truth is the fix; one function is a leak.
🛑 NEVER re-assemble that root anywhere else — the CLASS is sealed, not the case. It existed in FIVE places: three scripts rebuilding `~/.claude/hooks` under three env-var names (`VENDOR_TARGET_DIR`, `CTXROUTE_HOOKS_DIR`, none) and two hardcoded label prefixes in `source-adapters.js` that nothing read through, which is exactly why they survived. `fleet-hooks-path.test.js` = 10 cells: equality · real-spawn consumption · an AST scan of `src/` + `tools/` (perimeter from `git ls-files`, segments from `fleetHooksSegments()`, a fabricated offender riding INSIDE the judging scan because `ast-grep` answers `[]` with exit 0 on an unresolved path) · a witness per atom · MENTION-vs-CODE · the label contract asserted LITERALLY · no-leak · the two projections tied together.
⚠️ A target that does not exist is a NAMED REFUSAL (`vendor-deadline.js` exits 1 saying which address it resolved and from where), NEVER a silent fallback to a plausible path — serving the wrong root is the failure this closes.
⚠️ `config-gate.test.js` does NOT go through this module (hardcoded paths intended): it validates the SHIPPED file, so it must stay blind to env overrides.
NEVER import paths.js from lib-pure.js (it reads process.env → would break purity; `.dependency-cruiser.json` blocks it).
