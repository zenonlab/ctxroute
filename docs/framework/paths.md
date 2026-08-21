---
match: [paths.js, fleet-hooks-path.test.js]
scope: [ctxroute]
exclude: [protected-paths.json]
mode: dumb
rank: 355
---
# paths.js — single source of paths

⚠️ EVERY runtime path (config/docs/state) is declared HERE, once. NEVER redo an ad-hoc `path.join(__dirname,'state')` in a hook: `stateDir` was duplicated identically in inject.js AND reset.js — two copies of one truth that diverge silently (the reset would target another folder, with no visible error).
LAZY resolution mandatory (`paths.stateDir()` at call time, never frozen in a const at load) — otherwise the env vars set by the parent at spawn are ignored.
Every env var here (`CTXROUTE_CONFIG_PATH`/`DOCS_DIR`/`STATE_DIR`/`FILEDOCS_DIR`/`SESSIONDOCS_DIR`/`SKILLS_DIR`/`FLEET_HOOKS_DIR`) is RESERVED for tests and doctor.js — never a user setting (that is `ctxroute-config.json`).
⚠️ `fleetHooksDir()` (2026-08-21) = ROOT of the harness hook fleet; `fileDocsDir()` is DERIVED from it, `skillsDir()` sits beside it. It exists because three scripts rebuilt `~/.claude/hooks` themselves under THREE env-var names (`VENDOR_TARGET_DIR`, `CTXROUTE_HOOKS_DIR`, none) — both retired. One directory, ONE definition; consumption proven by `fleet-hooks-path.test.js` (equality + real spawn).
⚠️ `config-gate.test.js` does NOT go through this module (hardcoded paths intended): it validates the SHIPPED file, so it must stay blind to env overrides.
NEVER import paths.js from lib-pure.js (it reads process.env → would break purity; `.dependency-cruiser.json` blocks it).
