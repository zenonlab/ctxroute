---
rules: [{"pattern":"lib-pure.property.test.js","scope":["ctxroute"],"rank":358},{"pattern":"lib-pure.js","scope":["ctxroute"],"rank":363},{"pattern":"lib-pure.test.js","scope":["ctxroute"],"rank":364}]
mode: dumb
rank: 358
---
# lib-pure.js — invariants

⚠️ NEVER import fs/path/child_process/process.env here — that is the WHOLE point of the file (Stryker-mutable without I/O noise). A broken import like that must be blocked in CI by `.dependency-cruiser.json` (rule `lib-pure-must-stay-pure`).
Any function added here MUST be pure (same inputs ⇒ same outputs, zero side effects) and tested directly in `lib-pure.test.js` (not via spawn).
Before "protecting" a case with an `if` guard, check it is not already covered by native JS coercion (regex `.exec()` already coerces falsy values) — a redundant guard = an equivalent Stryker mutant, to be avoided by construction rather than accepted. Write the TESTABLE form: `Math.max(1, v)` and not `v >= 1 ? v : 1` (at v = 1 the branches coincide ⇒ unkillable comparator) — cf. `parsePaquetArgs`.
`docCandidatePaths()` returns CANDIDATES (computed paths), never a disk read — the I/O shell filters those that really exist. ⚠️ This line cited `legacy-mcp-inject.js` as "the caller" (fixed 2026-08-09): it has been UNWIRED since 07-17. **13 modules consume lib-pure** — the blast radius of a change here is the WHOLE stack, not one file.
⚠️ Stryker runs ONLY the DETERMINISTIC suites (`lib-pure.test.js`, `sources-file.test.js`, `frontmatter.test.js`) — NEVER the property tests: an invariant covered ONLY by `lib-pure.property.test.js` lets its mutants survive. Any guard added here → a deterministic case in `lib-pure.test.js` TOO (the property test hunts the unknown, the case locks the known). New pure module ⇒ add it to `mutate` AND to the `include` of `vitest.stryker.config.mjs` (cf. `quality-configs.md`).
⚠️ `scopeId(sessionId, agentId)` = SINGLE SOURCE of the per-agent state key (agent=context doctrine) — NEVER compose `session_id + agent_id` elsewhere; without agentId the key MUST stay byte-identical to sanitizeSessionId (backward compat/Codex, sealed in lib-pure.test).
⚠️ `serverName()`: RESTRICTIVE character class ([a-zA-Z0-9-]) — NEVER go back to `[^_]` (it matches `/` and `.` → `mcp__../../etc__x` escaped docs/mcp/; hole found by property-based testing, invisible on re-reading).
⚠️ SECURITY: every segment coming from `tool_input` (`subTool`) or from `tool_name` (`suffix`) MUST pass `isSafePathSegment()` BEFORE composing a path — otherwise `../../..` escapes `docs/mcp/` and injects an arbitrary `.md` into the agent's context as an authoritative instruction (prompt injection, not a mere read). Filter INSIDE lib-pure (at the source), never on the I/O side.
