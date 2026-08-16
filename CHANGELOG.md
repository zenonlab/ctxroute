# Changelog

## 2.0.0 — first public release (2026-08-16)

Full overhaul for open source publication. **Breaking** for pre-2.0 wirings:

- **Repository restructured**: engine in `src/` (+ `src/sources/`, `src/hooks/`), CLI tools in `tools/`, tests in `test/`. Hook wiring paths change accordingly (`src/hooks/doc-inject.js`, …).
- **Whole project in English** — file names, identifiers, engine messages, docs. Notable renames: `porte-core.js`→`src/pretool-core.js`, `canari*`→`canary*`, `fuite-*`→`leak-*`, `langage-*`→`language-*`.
- **Public API renamed**: config key `paquets`→`frames`; CLI flags `--paquet/--paquets`→`--frame/--frames` (`doctor --harnais` still accepted, `--harness` preferred); emission-queue store `reliquat-`→`remainder-`; canary verdicts `vivant/mort/indecidable`→`alive/dead/undecidable`; lint finding codes translated (`regle-fantome`→`ghost-rule`, …).
- Language docs unified: one derivation feeds both `LANGUAGE.md` and `docs/session/language.md`.
- Proofs at release: full test suite green, 100.00% mutation score with a per-file floor, 0 type errors, 0 coupling violations, doctor green.

## 1.4.0

**Worst bug of the project, fixed**: `ctxroute-config.json` was committed with leftover test FIXTURES (`filterMode: "whitelist"`, `filterList: ["testserver999"]`) — since the very first commit. The framework ran, returned `exit(0)` on every MCP call and injected NOTHING for stripe/odoo. The Stripe incident that motivated this whole repo was therefore NOT covered, for days, **silently, with 100% of tests green**.

- **Root cause removed**: the integration tests wrote into the REAL config file and "restored the original" — which was already polluted (circular loop). Fixtures now live in a throwaway tmpdir (`CTXROUTE_CONFIG_PATH`). A test NEVER writes into a shipped file.
- **`config-gate.test.js`** (new): every server that has a doc MUST be covered by the shipped config. No fixture residue can reach the repo anymore.
- **`doctor.js`** (new, dead-man switch): spawns the real hook in isolation and checks that it REALLY injects, + checks the `settings.json` wiring (which lives outside the repo, hence invisible to any test). Wired on SessionStart `--quiet`: silent when alive, screams when dead. `doctor.test.js` sabotages it (on a tmpdir copy) to prove it fires — a never-tested dead-man switch is false confidence.
- **SECURITY — path traversal closed**: `subTool` (coming from `tool_input`, hence potentially external data) composed a path without filtering → `../../..` escaped `docs/mcp/` and injected an arbitrary `.md` from the disk into the agent's context **as an authoritative instruction** (prompt injection). New `isSafePathSegment()`, applied to ALL segments.
- **SECURITY — hole found by property-based testing**: `serverName()` used `[^_]+`, which matches `/` and `.` → `mcp__../../etc__x` yielded `server="../../etc"`. Invisible to review AND to hand-written tests. Character class now restrictive.
- **TOTALITY — false assumption corrected**: a comment claimed "JS coercion is enough, a guard would be an equivalent mutant". False: `{"toString": 0}` (valid JSON, hence reachable) makes `String()`/`exec()` THROW. `typeof` guards added.
- **`lib-pure.property.test.js`** (new, fast-check): security/totality invariants on generated inputs. ⚠️ Not run by Stryker (unit only) → every guard ALSO has its deterministic case.
- **`paths.js`** (new): SINGLE SOURCE of the config/docs/state paths — `stateDir` was duplicated identically in both hooks.
- **CI**: `npm ci` added to the `test` job (the suite now depends on fast-check; forgetting it = red CI on 3 OSes, invisible locally).
- 206 tests (117 unit + 13 property + 9 lock + 7 config-gate + 46 integration + 14 doctor). Mutation 99.44% (ratchet raised from 99.39).

## 1.3.0

- **2 DISTINCT and composable switches**:
  - `enabled` (default `true`) — GLOBAL, cuts EVERYTHING (injection AND state tracking). Standard pattern (ESLint, git hooks `SKIP=...`).
  - `showNotification` (default `true`) — cuts ONLY the visible `📄 [ctxroute] ...` badge, the real injection always continues. Don't confuse the two (fixed after an in-session confusion).
- **Richer systemMessage**: explicit `[ctxroute]` prefix (distinguishes it from other injectable-doc sources) + the actually injected granularity made visible (e.g. `stripe (tool)`, `odoo (tool+subTool)`).
- **3-OS CI matrix**: macOS added (Linux + Windows + macOS), all green.
- **Injectable docs across the WHOLE repo**: 17 patterns, all scoped `["ctxroute"]` where the file name is generic (zero collision with other projects), grouped under `docs/ctxroute/` (not flat). Any future agent touching a repo file, even without session context, automatically receives the relevant invariant.
- **2nd skill created**: `ctxroute-architecture.md` (philosophy, mental model, full tree, invariants — no how-to), distinct from the usage skill `ctxroute.md`.
- 142 tests total (87 lib-pure unit + 9 lock + 46 integration).

## 1.2.1

- **Fix for a real bug found in CI** (invisible locally): `lock.js` assumed the parent folder of `state/` already existed. On a FRESH checkout, `fs.mkdirSync(lockDir)` failed with `ENOENT` (not `EEXIST`) → wrongly read as a fatal error → lock never acquired → all injections silently disabled (`fallback: {inject:false}`). Fix: create the parent folder chain (`recursive:true`, idempotent, concurrency-safe) before the atomic acquisition attempt.
- New `lock.test.js` (9 tests) reproducing EXACTLY that scenario (fresh checkout, no existing parent) — can no longer regress silently.
- 109 tests total (66 lib-pure unit + 9 lock + 34 integration).

## 1.2.0

- **Decision/I-O isolation**: decision logic extracted into `lib-pure.js` (zero fs/path/process, 66 pure unit tests) — `legacy-mcp-inject.js`/`ctxroute-reset.js` become pure I/O endpoints.
- **Stryker mutation testing** on `lib-pure.js`: 99.15% (117/118 mutants killed, 1 survivor documented as equivalent — a Stryker-internal string not observable in real usage). Break threshold 99, ratchet never lowered.
- **Cross-process lock** (`lock.js`, atomic `fs.mkdirSync`): fixes a real race condition on `state/*.json` under parallel MCP calls (Claude Code can launch independent tools in parallel). Proven by a load test (20 concurrent calls, no lost write).
- **Implicit coupling eliminated**: `stdin-json.js` extracted (duplication detected by `jscpd` between the 2 hooks); `sanitizeSessionId` centralized in `lib-pure.js` (was duplicated in `ctxroute-reset.js`). `dependency-cruiser` + `jscpd` gated in CI (0 violations, 0 clones).
- 100 tests total (66 unit + 34 integration, including 1 real concurrency test).

## 1.1.0

- 3-level granularity: `docs/mcp/{server}.md` (server) → `docs/mcp/{server}/{tool}.md` (specific tool) → `docs/mcp/{server}/{subTool}.md` (parameter, via `servers.{server}.subToolParam`, for single-tool proxy MCPs like Odoo).
- Probabilistic automatic purge of stale `state/*.json` files (30-day TTL by default) — bounds disk growth over long-term use.
- LICENSE (MIT), `.gitattributes`, GitHub Actions CI (ubuntu/windows matrix).
- 33 tests (broken config, empty doc, tool/sub-tool granularity, state purge).

## 1.0.0

- First release: per-MCP-server injection, 3 modes (`dumb`/`once`/`smart`), per-server thresholds and mode, whitelist/blacklist filtering, absolute reset at compaction (`PreCompact`), independent per-server counters.
- 24 tests.
