---
match: test.yml
scope: [ctxroute]
mode: dumb
rank: 373
---
# .github/workflows/test.yml — invariants

3 independent jobs: `test` (ubuntu/windows/macos matrix, `npm test`), `coupling` (`check:types` tsc + `dependency-cruiser`+`jscpd`), `mutation` (Stryker). All must stay green before any version tag.
⚠️ Node version MUST be ≥22 everywhere (dependency-cruiser requires it) — a mismatch between the dev machine (often newer) and a lower-pinned CI IS the most likely bug if `coupling`/`mutation` fail for no apparent reason in CI but pass locally (already experienced 2026-07-15).
macOS costs 10× the GitHub Actions minutes multiplier (vs 1× Linux, 2× Windows) — negligible here (job <1s) but to be recomputed if a job becomes heavy.
`concurrency: cancel-in-progress` — a push cancels the previous running run, normal, not a bug if you see a "cancelled" run.
